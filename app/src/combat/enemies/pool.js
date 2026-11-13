// 敌人特性池：本档位全部可抽原版条目 + 等量程序缝合项，合并后按种子打乱并编号（E01…）。
// 池构成、缝合内容与兜底都由程序按种子确定；战斗准备 AI 只依说明选编码。
import { hash32, nextRandom } from '../random.js';
import { normalizeProfile } from '../schema.js';
import { isEnemyArtKey } from '../enemy-art.js';
import { ENEMIES, materializeEnemy } from './index.js';
import { enemyCandidates } from './draw.js';
import { describeEnemy, effectsKnown } from './describe.js';
import { describeEnemySuitability } from './suitability.js';
import { stitchKits, scriptBoundSkills } from './stitch-kin.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const roll = (seed) => nextRandom(hash32(seed)).value;
// 自爆与纯待机脱离原脚本后语义改变；随从引用由 stitchKits 连带。
const STITCH_SKIP_OPS = new Set(['self-destruct', 'idle']);
// 缝合不取给自己挂撤离/自爆倒计时的效果：脱离原脚本后会让缝合敌人无端离场。
const STITCH_SKIP_STATUSES = new Set(['flee', 'fuse']);
const STITCH_PASSIVE_TRIGGERS = new Set(['battle-start', 'turn-start', 'turn-end']);
const opsOf = (effects) => (Array.isArray(effects) ? effects.flatMap((e) => [e?.op, ...opsOf(e?.then)]) : []);
const statusesOf = (effects) => (Array.isArray(effects) ? effects.flatMap((e) => [e?.op === 'apply-status' ? e.status : null, ...statusesOf(e?.then)]) : []);
const skipped = (effects) => opsOf(effects).some((op) => STITCH_SKIP_OPS.has(op)) || statusesOf(effects).some((key) => STITCH_SKIP_STATUSES.has(key));
const describable = (effects) => effectsKnown(effects);
const stitchableSkill = (skill) => describable(skill.effects) && !skipped(skill.effects);
const stitchablePassive = (p) => STITCH_PASSIVE_TRIGGERS.has(p.trigger) && describable(p.effects) && !skipped(p.effects);
const dealsDamage = (skill) => opsOf(skill.effects).some((op) => op === 'damage' || op === 'drain');

function rng(seed) {
    let state = hash32(seed);
    return () => {
        const next = nextRandom(state);
        state = next.state;
        return next.value;
    };
}
const pickIndex = (random, length) => Math.min(length - 1, Math.floor(random() * length));
function shuffle(list, random) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = pickIndex(random, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// 第 i 个缝合项：2–4 个技能尽量取自不同原版，保留换算后的数值与权重，不带脚本与阶段；至多 1 个被动；HP 取来源均值。
function stitchOne(originals, tier, seed, index) {
    const random = rng(`enemy-stitch|${seed}|${index}`);
    const eligible = new Map(originals.map((o) => [o.enemyId, o.profile.skills.filter((s) => stitchableSkill(s) && !scriptBoundSkills(o.profile).has(s.id))]));
    const skillsOf = (source) => eligible.get(source.enemyId);
    const sources = shuffle(originals.filter((o) => skillsOf(o).length), random);
    if (sources.length < 2) return null;
    const want = 2 + pickIndex(random, 3);
    const picked = [];
    const used = new Set();
    for (let round = 0; picked.length < want && round < want * 3; round += 1) {
        const source = sources[round % sources.length];
        const options = skillsOf(source).filter((s) => !used.has(`${source.enemyId}:${s.id}`));
        if (!options.length) continue;
        const skill = options[pickIndex(random, options.length)];
        used.add(`${source.enemyId}:${skill.id}`);
        picked.push({ source, skill });
    }
    if (!picked.some(({ skill }) => dealsDamage(skill))) {
        const attackers = sources.flatMap((source) => skillsOf(source).filter((s) => dealsDamage(s) && !used.has(`${source.enemyId}:${s.id}`)).map((skill) => ({ source, skill })));
        if (!attackers.length) return null;
        picked[picked.length - 1] = attackers[pickIndex(random, attackers.length)];
    }
    const chosen = [...new Map(picked.map(({ source }) => [source.enemyId, source])).values()];
    const passives = chosen.flatMap((source) => (source.profile.passives || []).filter(stitchablePassive).map((passive) => ({ source, passive })));
    const passive = passives.length && random() < 0.5 ? [passives[pickIndex(random, passives.length)]] : [];
    const kit = stitchKits(picked, passive);
    if (!kit) return null;
    const hp = Math.round(chosen.reduce((sum, source) => sum + source.profile.base.hp, 0) / chosen.length);
    const profile = {
        kind: 'enemy', id: `${chosen[0].enemyId}-x${index + 1}`, name: '缝合敌人', tier,
        base: { hp }, ...kit, phases: [],
        template: { enemyId: chosen[0].enemyId, model: 'stitched' }, generated: true,
    };
    const normalized = normalizeProfile(profile);
    // 不合 schema 的组合直接跳过，由下一个序号补足；补不足时整池退回空（调用方走自由生成）。
    if (!normalized.ok) return null;
    return { kind: 'stitched', enemyId: chosen[0].enemyId, sources: chosen.map((s) => s.enemyId), profile: normalized.value };
}

// 返回 [{ code, kind, enemyId, profile, text, fit }]；本档位没有可抽条目时返回空数组（调用方退回自由生成）。
export function enemyPool({ tier, seed = '' } = {}, entries = ENEMIES) {
    const originals = enemyCandidates({ tier }, entries)
        .map((item) => ({ kind: 'original', enemyId: item.id, profile: materializeEnemy(item, 'original') }))
        .filter((item) => item.profile);
    if (!originals.length) return [];
    const stitched = [];
    for (let i = 0; stitched.length < originals.length && i < originals.length * 4; i += 1) {
        const item = stitchOne(originals, tier, seed, i);
        if (item) stitched.push(item);
    }
    if (stitched.length < originals.length) return [];
    return shuffle([...originals, ...stitched], rng(`enemy-pool|${seed}`))
        .map((item, i) => ({ ...item, code: `E${String(i + 1).padStart(2, '0')}`,
            text: describeEnemy(item.profile), fit: describeEnemySuitability(item.profile) }));
}

// 按剧情名物化所选项：档案 ID 由调用方按敌人名与档位给定；外观格位非法时忽略。
export function materializeChoice(item, { id, name, art } = {}) {
    if (!item?.profile) return null;
    const profile = { ...copy(item.profile), id: id ?? item.profile.id, name: String(name || item.profile.name).trim().slice(0, 20) || item.profile.name };
    if (isEnemyArtKey(art)) profile.art = art;
    const normalized = normalizeProfile(profile);
    return normalized.ok ? normalized.value : null;
}

// 兜底：按 enemy-pick|seed 在池中等概率选一项。
export function fallbackChoice(pool, seed) {
    if (!Array.isArray(pool) || !pool.length) return null;
    return pool[pickIndex(() => roll(`enemy-pick|${seed ?? ''}`), pool.length)];
}
