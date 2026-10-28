// 非人角色登记：从正文指令取出需要建档的名字（AI 标注与战斗对手），按规则生成本卡 characterDna 的新表。
// 纯函数，不读写存储；存储接线在 core/character-dna-store.js。
import { extractFxDirectives } from './fx-directives.js';
import { normalizeCreatureProfile, ensureTempCreature, isGroupName, CREATURE_TEMP_LIMIT } from './creature-profile.js';
import { isCharacterDnaEmpty } from './character-dna.js';
import { splitFoeNames } from './creature-battle.js';

const NOT_FOE = new Set(['我', '玩家', '主角', '你', '{{user}}', 'user', 'User']);
// 最近出场时间的刷新间隔，避免同一场战斗反复写设置。
const SEEN_REFRESH_MS = 5 * 60 * 1000;
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// 正文里的建档线索：creature 标注优先于 battle 对手；同名合并，后写的非空字段覆盖前面的。
export function creatureHintsOf(text) {
    const byName = new Map();
    const add = (name, source, fields = {}) => {
        const key = String(name || '').trim();
        if (!key || NOT_FOE.has(key)) return;
        const prev = byName.get(key) || { name: key, source };
        const next = { ...prev, source: prev.source === 'creature' || source === 'creature' ? 'creature' : source };
        for (const [field, value] of Object.entries(fields)) if (value) next[field] = value;
        byName.set(key, next);
    };
    for (const d of extractFxDirectives(text)) {
        if (d.kind === 'creature' && !d.end) add(d.args[0], 'creature', { form: d.args[1], size: d.args[2], anchor: d.args[3] });
        else if (d.kind === 'battle' && !d.end) for (const foe of splitFoeNames(d.args[0])) add(foe, 'battle');
    }
    return [...byName.values()];
}

// 已登记的角色名（DNA、素材、衣柜、别名），用于判断战斗对手是否已有身份。
export function knownCharacterNames(assets = {}) {
    const names = new Set();
    for (const field of ['characterDna', 'characters', 'characterOutfits']) {
        for (const key of Object.keys(plain(assets[field]))) names.add(key);
    }
    for (const key of Object.keys(plain(plain(assets.generated).characters))) names.add(key);
    for (const [key, list] of Object.entries(plain(assets.characterAliases))) {
        names.add(key);
        for (const alias of Array.isArray(list) ? list : []) names.add(String(alias));
    }
    return names;
}

// effective：本卡与全局合并后的素材视图；cardDna：本卡自己保存的 characterDna。
// 返回新的本卡 characterDna 表与变更清单；没有变化时 changed 为 false，表原样返回。
export function planCreatureProfiles({ effective = {}, cardDna = {}, hints = [], now = Date.now(), limit = CREATURE_TEMP_LIMIT, resolve = (name) => name } = {}) {
    const known = knownCharacterNames(effective), dnaMap = plain(effective.characterDna);
    let map = plain(cardDna);
    const created = [], updated = [], evicted = [];
    for (const hint of hints) {
        const key = String(resolve(hint.name) || hint.name).trim();
        if (!key) continue;
        const existing = Object.hasOwn(dnaMap, key) ? plain(dnaMap[key]) : null;
        const creature = existing ? normalizeCreatureProfile(existing.creature) : null;
        // 判定为人类的临时档案：删除本卡里只有该档案的条目，之后按人类流程处理。
        if (hint.source === 'discard') {
            if (creature && creature.temp && Object.hasOwn(map, key) && Object.keys(plain(map[key])).every((field) => field === 'creature')) {
                const { [key]: removed, ...rest } = map;
                map = rest; evicted.push(key);
            }
            continue;
        }
        if (hint.source === 'battle') {
            // 群体称呼不自动建档。
            if (isGroupName(key)) continue;
            if (existing || known.has(key)) {
                // 已有的临时档案刷新最近出场；本卡之外的档案不改。
                if (creature && creature.temp && Object.hasOwn(map, key) && now - (creature.seenAt || 0) > SEEN_REFRESH_MS) {
                    map = ensureTempCreature(map, key, { now, limit }).map;
                    updated.push(key);
                }
                continue;
            }
            const planned = ensureTempCreature(map, key, { now, limit });
            map = planned.map; created.push(key); evicted.push(...planned.evicted);
            continue;
        }
        const fields = Object.fromEntries(['form', 'size', 'anchor'].filter((f) => hint[f]).map((f) => [f, hint[f]]));
        if (creature) {
            // 体型变化等字段更新只写本卡自己的档案。
            if (!Object.hasOwn(map, key)) continue;
            const next = normalizeCreatureProfile({ ...creature, ...fields });
            if (JSON.stringify(next) === JSON.stringify(creature)) continue;
            map = { ...map, [key]: { ...plain(map[key]), creature: next } };
            updated.push(key);
        } else if (!existing && !known.has(key)) {
            map = { ...map, [key]: { creature: normalizeCreatureProfile({ form: 'beast', size: 'medium', anchor: 'ground', ...fields, temp: false }) } };
            created.push(key);
        } else if (existing && isCharacterDnaEmpty(existing) && !Object.hasOwn(plain(effective.characters), key)
            && !Object.hasOwn(plain(effective.characterOutfits), key) && !Object.hasOwn(plain(plain(effective.generated).characters), key)) {
            // 只登记了名字、尚未出过图的空 DNA 条目：按标注转为非人角色。
            map = { ...map, [key]: { ...plain(map[key] || existing), creature: normalizeCreatureProfile({ form: 'beast', size: 'medium', anchor: 'ground', ...fields, temp: false }) } };
            updated.push(key);
        }
    }
    const changed = created.length > 0 || updated.length > 0 || evicted.length > 0;
    return { cardDna: changed ? map : cardDna, changed, created, updated, evicted };
}
