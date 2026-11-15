// M8 遭遇条目：成员表引用正式敌人条目，开战时由程序展开为同一遭遇分组的多个单位；AI 只给遭遇名，不决定组成。
// 只有原版即为多体同场的遭遇（如双爪、三体暗生）登记在此。开战名单里普通的同名多只不写分组，照旧逐只计击杀；
// 三体暗生这类同名多体由遭遇条目的成员数量表达。
import { COMBAT_RULES } from '../rules.js';
import { GARDENER_FORMATION } from '../encounter-formation.js';
import { freezeEnemyData } from './dsl.js';
import { ENEMIES } from './index.js';
import { materializeEnemy } from './materialize.js';

export const ENCOUNTER_ID_PATTERN = /^enc-[a-z0-9-]{1,40}$/;
// 一组成员合计不超过场上敌人总位置；超出普通敌人上限的部分由会话按后备队补位。
export const ENCOUNTER_MEMBER_MAX = COMBAT_RULES.maxEnemiesOnField;
const TIERS = Object.freeze(['normal', 'elite', 'boss']);
// 遭遇关系可先登记；成员均为 release 且未排除后才能物化，不以占位成员补足来源缺口。
// 成员条目带 encounterOnly 时只经此处同场展开，不进单体抽取池。
const ENCOUNTER_ENTRIES = Object.freeze([
    // S2 帝蟹：左爪碎爪 + 右爪火箭爪同场（118:14）。
    { id: 'enc-kaiser-crab', name: '帝蟹', tier: 'boss', members: [{ enemyId: 'en-sts2-boss-09', count: 1 }, { enemyId: 'en-sts2-boss-15', count: 1 }] },
    { id: 'enc-lost-forgotten', name: '迷失与遗忘', tier: 'normal', members: [{ enemyId: 'en-sts2-glory-15', count: 1 }, { enemyId: 'en-sts2-glory-16', count: 1 }] },
    { id: 'enc-turret-shield', name: '炮手与活体盾', tier: 'normal', members: [{ enemyId: 'en-sts2-glory-14', count: 1 }, { enemyId: 'en-sts2-glory-13', count: 1 }] },
    { id: 'enc-inklets', name: '墨滴灵', tier: 'normal', members: [{ enemyId: 'en-sts2-overgrowth-11', count: 3, openers: [null, 'whirl', null] }] },
    { id: 'enc-the-kin', name: '血亲', tier: 'boss', members: [{ enemyId: 'en-sts2-boss-02', count: 1,
        initialKin: [{ key: 'follower', count: 2, openers: ['slash', 'dance'] }] }] },
    { id: GARDENER_FORMATION.id, name: '幻影园丁', tier: 'elite', members: [
        { enemyId: GARDENER_FORMATION.enemyId, count: 4, openers: [...GARDENER_FORMATION.openers] }] },
]);

const fail = (id, reason) => { throw new Error(`enemy-encounter:${id}:${reason}`); };
const validOpeners = (openers, count, skills) => Array.isArray(openers) && openers.length === count
    && Array.from(openers).every((opener) => opener === null || (typeof opener === 'string' && skills.some((skill) => skill.id === opener)));

// 校验遭遇条目：id 唯一且符合 enc- 前缀，成员引用存在且不重复，每项数量为正整数，合计 2 至 ENCOUNTER_MEMBER_MAX。
// 成员尚未收录（非 release 或已排除）时不抛错，记 unavailable，该遭遇不能物化。
export function prepareEncounters(encounters, entries = ENEMIES) {
    const byId = new Map(entries.map((item) => [item.id, item]));
    const seen = new Set();
    return freezeEnemyData(encounters.map((raw) => {
        const id = raw?.id;
        if (typeof id !== 'string' || !ENCOUNTER_ID_PATTERN.test(id) || seen.has(id)) fail(id, 'id');
        seen.add(id);
        if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.trim().length > 20) fail(id, 'name');
        if (!TIERS.includes(raw.tier)) fail(id, 'tier');
        if (!Array.isArray(raw.members) || !raw.members.length) fail(id, 'members');
        const ids = new Set();
        let total = 0;
        const members = raw.members.map((member) => {
            if (!byId.has(member?.enemyId) || ids.has(member.enemyId)) fail(id, 'member');
            if (!Number.isInteger(member.count) || member.count < 1) fail(id, 'count');
            if (member.openers !== undefined) {
                const skills = byId.get(member.enemyId).original?.skills || [];
                if (!validOpeners(member.openers, member.count, skills)) fail(id, 'openers');
            }
            let initialKin;
            if (member.initialKin !== undefined) {
                if (member.count !== 1 || !Array.isArray(member.initialKin) || !member.initialKin.length) fail(id, 'initial-kin');
                const keys = new Set();
                initialKin = member.initialKin.map((kin) => {
                    const def = byId.get(member.enemyId).original?.kin?.[kin?.key];
                    if (!kin || Object.keys(kin).some((key) => !['key', 'count', 'openers'].includes(key))
                        || !def || def.minion !== true || keys.has(kin.key)
                        || !Number.isInteger(kin.count) || kin.count < 1) fail(id, 'initial-kin');
                    if (kin.openers !== undefined && !validOpeners(kin.openers, kin.count, def.skills)) fail(id, 'openers');
                    keys.add(kin.key);
                    total += kin.count;
                    return { key: kin.key, count: kin.count, ...(kin.openers !== undefined ? { openers: [...kin.openers] } : {}) };
                });
            }
            ids.add(member.enemyId);
            total += member.count;
            return { enemyId: member.enemyId, count: member.count,
                ...(member.openers !== undefined ? { openers: [...member.openers] } : {}),
                ...(initialKin ? { initialKin } : {}) };
        });
        if (total < 2 || total > ENCOUNTER_MEMBER_MAX) fail(id, 'size');
        const unavailable = members.filter(({ enemyId }) => byId.get(enemyId).status !== 'release' || byId.get(enemyId).excluded).map(({ enemyId }) => enemyId);
        const copy = JSON.parse(JSON.stringify(raw));
        return { ...copy, id, name: raw.name.trim(), members, ...(unavailable.length ? { unavailable } : {}) };
    }));
}

export const ENEMY_ENCOUNTERS = prepareEncounters(ENCOUNTER_ENTRIES);

// 物化为会话可展开的遭遇：{ kind: 'encounter', id, name, tier, members: [{ profile, count }] }。
// 成员未收录或任一成员物化失败时返回 null，不回退成别的敌人。
export function materializeEncounter(encounter, entries = ENEMIES) {
    if (!encounter || encounter.unavailable) return null;
    const byId = new Map(entries.map((item) => [item.id, item]));
    const members = [];
    for (const { enemyId, count, openers, initialKin } of encounter.members || []) {
        const profile = materializeEnemy(byId.get(enemyId), 'original');
        if (!profile) return null;
        const extra = initialKin ? { initialKin: JSON.parse(JSON.stringify(initialKin)) } : {};
        if (openers === undefined) members.push({ profile, count, ...extra });
        else for (const opener of openers) {
            const copy = JSON.parse(JSON.stringify(profile));
            if (opener !== null) {
                const script = { ...copy.script, opener };
                delete script.openers;
                copy.script = script;
            }
            members.push({ profile: copy, count: 1, ...extra });
        }
    }
    return members.length ? { kind: 'encounter', id: encounter.id, name: encounter.name, tier: encounter.tier, members } : null;
}

// 登记查询不依赖成员就绪，供会话区分未登记名字与待证遭遇。
export function encounterEntryByName(name, list = ENEMY_ENCOUNTERS) {
    const key = typeof name === 'string' ? name.trim() : '';
    if (!key) return null;
    return list.find((encounter) => encounter.name === key) || null;
}

// 只物化完整就绪的遭遇；调用方先查登记，已登记但不能物化时不得回落为单体。
export function encounterByName(name, list = ENEMY_ENCOUNTERS, entries = ENEMIES) {
    const found = encounterEntryByName(name, list);
    return found ? materializeEncounter(found, entries) : null;
}
