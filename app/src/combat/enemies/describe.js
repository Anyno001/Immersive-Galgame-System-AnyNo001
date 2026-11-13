// 敌人特性的单句概括：供战斗准备 AI 按剧情形象挑选最接近的特性项。纯函数，只读档案，不引用视觉层。
import { COMBAT_RULES, TOKEN_CARDS } from '../rules.js';
import { statusLabel } from '../mechanics/registry.js';

export const UNKNOWN_TEXT = '特殊效果';
export const DESCRIBE_TEXT_MAX = 40;
const DEBUFF_NAMES = Object.freeze({ vulnerable: '易伤', weak: '虚弱', frail: '脆弱', poison: '中毒', 'no-draw': '禁抽' });
const KNOWN_OPS = new Set(['damage', 'drain', 'block', 'heal', 'status', 'apply-status', 'create', 'shed', 'idle', 'self-destruct', 'seize-might', 'conditional', 'steal-gold', 'offer-curse', 'foe-surge', 'release', 'summon-kin', 'split-into', 'constrict']);
const GROWTH = new Set(['strength', 'ritual']);
const GUARD = new Set(['plated', 'plating', 'metallicize', 'barricade', 'artifact', 'dexterity']);

const flat = (effects) => (Array.isArray(effects) ? effects.flatMap((e) => [e, ...flat(e?.then)]) : []);
// 效果全部是说明能覆盖的算子（含条件分支）；空效果不算。
export const effectsKnown = (effects) => Array.isArray(effects) && effects.length > 0 && flat(effects).every((e) => KNOWN_OPS.has(e?.op));
const isStatus = (e) => e?.op === 'status' || e?.op === 'apply-status';
const onFoe = (e) => e.target !== undefined && e.target !== 'self';
const debuffName = (key) => DEBUFF_NAMES[key] || statusLabel(key) || null;
const skillDamage = (skill) => (skill.effects || []).filter((e) => e?.op === 'damage' || e?.op === 'drain').reduce((sum, e) => sum + Number(e.amount || 0) * Math.max(1, Number(e.hits) || 1), 0);

function patternOf(profile) {
    const script = profile?.script;
    if (Array.isArray(profile?.phases) && profile.phases.length) return '濒危变招';
    if (Array.isArray(script?.cycle) && script.cycle.length) return '出招固定循环';
    if (script?.next) return '按上一招接招';
    return '出招随机';
}

// 一句话概括：至多 4 个特征加出招规律，总长不超过 DESCRIBE_TEXT_MAX。
export function describeEnemy(profile) {
    const tier = COMBAT_RULES.tiers[profile?.tier] || COMBAT_RULES.tiers.normal;
    const skills = [...(profile?.skills || []), ...(profile?.phases || []).flatMap((p) => p.addSkills || [])];
    const passives = profile?.passives || [];
    const effects = [...skills, ...passives].flatMap((item) => flat(item.effects));
    const traits = [];
    const add = (text) => { if (text && !traits.includes(text)) traits.push(text); };
    const kinNames = (keys) => {
        const names = [...new Set(keys.map((key) => profile.kin?.[key]?.name || '随从'))];
        const text = names.join('/');
        return text.length <= 22 ? text : `${names[0]}等随从`;
    };
    const summoned = effects.filter((e) => e.op === 'summon-kin').flatMap((e) => e.kin || []);
    const split = effects.filter((e) => e.op === 'split-into').flatMap((e) => e.kin || []);
    if (summoned.length) add(`召唤${kinNames(summoned)}`);
    if (split.length) add(`分裂成${kinNames(split)}`);
    if (profile?.deathSpawns?.length) add(`倒下生成${kinNames(profile.deathSpawns)}`);
    if (![...skills, ...passives].every((item) => effectsKnown(item.effects))) add(UNKNOWN_TEXT);
    if (effects.some((e) => e?.op === 'drain')) add('吸血回复');
    const armorPause = effects.some((e) => e?.op === 'idle') && profile?.script?.interrupts?.some((rule) => rule.on === 'status-lost' && rule.status === 'plated');
    if (armorPause) add('破甲后停顿');
    const hp = Number(profile?.base?.hp) || 0;
    if (hp >= tier.hp * 1.25) add('皮糙肉厚');
    else if (hp && hp <= tier.hp * 0.75) add('体格单薄');
    const strikes = effects.filter((e) => e?.op === 'damage' || e?.op === 'drain');
    if (strikes.some((e) => e.target === 'all-enemies')) add('群体攻击');
    if (strikes.some((e) => Number(e.hits) >= 3)) add('多段连击');
    if (strikes.some((e) => e.target === 'random-enemy')) add('随机乱打');
    if (skills.some((s) => skillDamage(s) >= tier.damageCap * 0.75)) add('出手沉重');
    if (effects.some((e) => e?.op === 'self-destruct')) add('会自爆');
    if (effects.some((e) => e?.op === 'constrict')) add('缠绕至施加者倒下');
    if (effects.some((e) => e?.op === 'seize-might')) add('夺取力量');
    if (effects.some((e) => e?.op === 'steal-gold')) add('偷取金币');
    if (effects.some((e) => isStatus(e) && !onFoe(e) && e.status === 'flee')) add('得手即逃');
    if (effects.some((e) => e?.op === 'offer-curse')) add('逼人二选一诅咒');
    if (effects.some((e) => e?.op === 'foe-surge')) add('越打越狠');
    const cards = [...new Set(effects.filter((e) => e?.op === 'create').map((e) => TOKEN_CARDS[e.card]?.name).filter(Boolean))];
    if (cards.length) add(`往牌堆塞${cards.slice(0, 2).join('/')}`);
    const debuffs = [...new Set(effects.filter((e) => isStatus(e) && onFoe(e)).map((e) => debuffName(e.status)))];
    if (debuffs.length) add(debuffs.length <= 2 && debuffs.every(Boolean) ? `施加${debuffs.join('/')}` : '施加减益');
    if (effects.some((e) => isStatus(e) && !onFoe(e) && GROWTH.has(e.status))) add('逐步变强');
    if (effects.some((e) => e?.op === 'block' || (isStatus(e) && !onFoe(e) && GUARD.has(e.status)))) add('善于防守');
    if (effects.some((e) => isStatus(e) && !onFoe(e) && e.status === 'thorns')) add('带荆棘');
    if (effects.some((e) => e?.op === 'heal')) add('会回血');
    if (effects.some((e) => isStatus(e) && e.status === 'soar')) add('会腾空');
    if (!armorPause && effects.some((e) => e?.op === 'idle')) add('时而蓄势');
    if (!traits.length) add('攻守平平');
    const pattern = patternOf(profile);
    const kept = traits.slice(0, 4);
    let text = `${kept.join('、')}，${pattern}。`;
    while (text.length > DESCRIBE_TEXT_MAX && kept.length > 1) {
        kept.pop();
        text = `${kept.join('、')}，${pattern}。`;
    }
    return text;
}
