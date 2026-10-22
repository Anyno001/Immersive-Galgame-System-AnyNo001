// 非人角色的 CG 辅助：无衣装的判定、占位符清理、战斗对手并入角色池。
// 纯函数；人类角色一律返回「不适用」，不改变人类 CG 的任何输入。
import { confirmedCreatureOf } from '../../scene/creature-profile.js';
import { creatureHintsOf } from '../../scene/creature-registry.js';

const blank = (value) => value === undefined || String(value).trim() === '';

// 写词行属于已登记的非人角色，且衣装三项都为空（或省略）。
export function isUnclothedCreature(context, row) {
    if (!row || row.meta_kind !== 'named' || !Array.isArray(context)) return false;
    const source = context.find((c) => c && c.characterKey === row.meta_key);
    return Boolean(source && confirmedCreatureOf(source.dna))
        && blank(row.meta_outfit_name) && blank(row.meta_outfit_description) && blank(row.meta_outfit_id);
}

// 无衣装角色不需要 <<outfit:token>> 占位；写词多写了就去掉，并收拢多余空白。
export function stripOutfitSlot(text, token) {
    return String(text || '').replace(`<<outfit:${token}>>`, '').replace(/[ \t]{2,}/g, ' ').replace(/^\s+/, '').replace(/,\s*,/g, ',').replace(/\s+,/g, ',');
}

// 战斗对手（与 creature 标注）里已登记非人档案、但没有说话标签的，并入本图可出镜的角色池。
// 池里没有新增时原样返回同一个数组，人类楼层不受影响。
export function withCreatureCast(characters, text, assets) {
    const dna = assets && assets.characterDna && typeof assets.characterDna === 'object' ? assets.characterDna : null;
    if (!dna || !Array.isArray(characters)) return characters;
    const extra = [];
    for (const hint of creatureHintsOf(text)) {
        if (characters.includes(hint.name) || extra.includes(hint.name)) continue;
        if (Object.hasOwn(dna, hint.name) && confirmedCreatureOf(dna[hint.name])) extra.push(hint.name);
    }
    return extra.length ? [...characters, ...extra] : characters;
}
