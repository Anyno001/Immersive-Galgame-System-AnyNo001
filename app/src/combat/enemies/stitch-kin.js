// 缝合取材的随从引用闭包：按来源隔离键，保留子体完整招式与死亡生成。
import { DEATH_SPAWN_LIMIT, KIN_LIMIT, renameKinEffects } from '../kin.js';

const copy = (value) => JSON.parse(JSON.stringify(value));

export function scriptBoundSkills(profile) {
    const ids = new Set();
    const picks = (list) => (list || []).forEach((item) => { if (item.when) ids.add(item.skill); });
    const visit = (script) => {
        picks(script?.openers);
        for (const row of Object.values(script?.next || {})) picks(row);
        for (const node of script?.cycle || []) {
            if (Array.isArray(node)) picks(node);
            else if (node && typeof node === 'object' && node.when) ids.add(node.skill);
        }
    };
    visit(profile.script);
    for (const phase of profile.phases || []) visit(phase.script);
    return ids;
}

export function stitchKits(picked, passives) {
    const kin = {};
    const maps = new Map();
    let invalid = false;
    const renameKit = (kit, rename) => {
        const next = copy(kit);
        const map = (items) => (items || []).map((item) => ({ ...item, effects: renameKinEffects(item.effects, rename) }));
        if (next.effects) next.effects = renameKinEffects(next.effects, rename);
        if (next.skills) next.skills = map(next.skills);
        if (next.passives) next.passives = map(next.passives);
        if (next.phases) next.phases = next.phases.map((phase) => ({ ...phase,
            ...(phase.addSkills ? { addSkills: map(phase.addSkills) } : {}),
            ...(phase.passives ? { passives: map(phase.passives) } : {}),
        }));
        if (next.deathSpawns) next.deathSpawns = next.deathSpawns.map(rename);
        return next;
    };
    const renameFor = (source) => {
        if (!maps.has(source.enemyId)) maps.set(source.enemyId, new Map());
        const names = maps.get(source.enemyId);
        const rename = (key) => {
            if (names.has(key)) return names.get(key);
            const def = source.profile.kin?.[key];
            if (!def || Object.keys(kin).length >= KIN_LIMIT) {
                invalid = true;
                return key;
            }
            const id = `k${Object.keys(kin).length + 1}`;
            names.set(key, id);
            kin[id] = null;
            kin[id] = { ...renameKit(def, rename),
                maxHp: Math.max(1, Math.min(9999, Math.round(def.maxHp * (source.profile.kinScale ?? 1)))),
            };
            return id;
        };
        return rename;
    };
    const skills = picked.map(({ source, skill }, i) => ({ ...renameKit(skill, renameFor(source)), id: `s${i + 1}` }));
    const traits = passives.map(({ source, passive }, i) => ({ ...renameKit(passive, renameFor(source)), id: `p${i + 1}` }));
    const sources = [...new Map(picked.map(({ source }) => [source.enemyId, source])).values()];
    const deathSpawns = sources.flatMap((source) => (source.profile.deathSpawns || []).map(renameFor(source)));
    if (invalid || deathSpawns.length > DEATH_SPAWN_LIMIT) return null;
    return { skills, passives: traits,
        ...(Object.keys(kin).length ? { kin } : {}),
        ...(deathSpawns.length ? { deathSpawns } : {}),
    };
}
