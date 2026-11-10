// 检定建议表的骰子命令判定：DSL 语法与结果格式对齐骰子系统（AcuDice）自身的检定建议按钮。
// 掷骰与属性查询交给 AcuDice 公开 API，使检定历史与统计面板保持一致；
// 公开 API 不支持奖惩骰，带奖惩时只向 AcuDice 取属性值、在本地掷骰。

import { ABILITY_LABELS, abilityKeyOf, abilityMod } from '../combat/abilities.js';

export const DICE_RESULT_TAG = 'meta:检定结果';
// d20 检定的 DC 允许范围（含端点）。
export const D20_DC_RANGE = Object.freeze([5, 30]);

const DIFFICULTY_LEVEL = Object.freeze({ 普通: 0, 困难: 1, 极难: 2 });
const DIFFICULTY_DIVISOR = Object.freeze({ 0: 1, 1: 2, 2: 5 });

// d20 加值：属性修正，主擅长/次擅长的项再加熟练加值。abilities 形如 { scores:{str..}, prefs:{major,minor}, proficiency }；取不到分数返回 null。
export function d20Bonus(abilities, key) {
    // 没有属性表时返回 null（原写法 Number(null) 得 0，会误算出 -5）；属性表存在时与 v0.39 一致，单项按 Number 取值
    if (!abilities || !abilities.scores) return null;
    const score = Number(abilities.scores[key]);
    if (!Number.isFinite(score)) return null;
    const prefs = (abilities && abilities.prefs) || {};
    const proficient = key === prefs.major || key === prefs.minor;
    return abilityMod(score) + (proficient ? Number(abilities && abilities.proficiency) || 0 : 0);
}

// d20 结果：自然 20 必成、自然 1 必败，其余总值 ≥ DC 为成功。
export function d20Outcome(die, bonus, dc) {
    const total = die + bonus;
    if (die === 20) return { total, success: true, tier: '大成功' };
    if (die === 1) return { total, success: false, tier: '大失败' };
    const success = total >= dc;
    return { total, success, tier: success ? '成功' : '失败' };
}

const CHECK_PARAMS = Object.freeze(['难度', '奖惩']);
const CONTEST_PARAMS = Object.freeze(['难度', '奖惩', '平局']);
const TIE_VALUE = /^(发起方(?:成功|胜|失败|败|负)|平局)$/;

// 参数白名单与取值校验：写错的参数明确报错，不静默当作默认值。
function paramError(params, allowed) {
    for (const [key, value] of Object.entries(params)) {
        if (!allowed.includes(key)) return `无法识别的参数：${key}=${value}`;
        if (key === '难度' && !Object.hasOwn(DIFFICULTY_LEVEL, String(value).trim())) return `难度只写 普通/困难/极难：${value}`;
        if (key === '奖惩' && !/^(奖励|惩罚)[12]?$/.test(String(value).trim())) return `奖惩只写 奖励1/奖励2/惩罚1/惩罚2：${value}`;
        if (key === '平局' && !TIE_VALUE.test(String(value).trim())) return `平局只写 发起方成功/发起方失败/平局：${value}`;
    }
    return null;
}

function normalizeCommandText(raw) {
    let text = String(raw ?? '')
        .replace(/^[\s"'`“”‘’「」『』]+|[\s"'`“”‘’「」『』]+$/g, '')
        .replace(/[[\]【】()（）]/g, ' ')
        .replace(/[，,；;]\s*/g, ' ')
        .replace(/[\s　]+/g, ' ')
        .trim();
    text = text
        .replace(/^对抗(?:检定)?\s*[:：]\s*/, '对抗 ')
        .replace(/^对抗检定\s+/, '对抗 ')
        .replace(/^普通检定\s*[:：]?\s*/, '检定 ')
        .replace(/^检定\s*[:：]\s*/, '检定 ');
    return text;
}

function extractParams(text) {
    const params = {};
    const rest = text.replace(/(\S+?)\s*[=＝]\s*(\S+)/g, (match, key, value) => {
        params[key] = value;
        return ' ';
    }).replace(/\s+/g, ' ').trim();
    return { rest, params };
}

function parseModifiers(params) {
    const difficultyText = String(params['难度'] || '').trim();
    const difficulty = DIFFICULTY_LEVEL[difficultyText] ?? 0;
    const bonusMatch = String(params['奖惩'] || '').trim().match(/^(奖励|惩罚)(\d)?$/);
    const count = bonusMatch ? Math.min(2, Math.max(1, Number(bonusMatch[2] || 1))) : 0;
    return {
        difficulty,
        bonus: bonusMatch && bonusMatch[1] === '奖励' ? count : 0,
        penalty: bonusMatch && bonusMatch[1] === '惩罚' ? count : 0,
    };
}

function splitActor(text) {
    const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        const joined = parts[0].match(/^([^=\s]+)[.。:：/·]([^=\s]+)$/);
        if (joined) return { name: joined[1], attribute: joined[2] };
    }
    if (parts.length < 2) return null;
    return { name: parts[0], attribute: parts.slice(1).join(' ') };
}

const POOL_SIDES = Object.freeze([4, 6, 8, 10, 12, 20, 100]);
const POOL_MAX_COUNT = 10;
const POOL_EXPR = /^(\d{0,2})[dD](\d{1,3})([+-]\d{1,3})?$/;

// 骰池：骰池 3d6+2 [目标=12 比较=小于 项目=攀爬]。面数限 d4 到 d20 与 d100，最多 10 颗；目标缺省时只展示点数。
function parsePoolCommand(body, raw) {
    const { rest, params } = extractParams(body);
    const tokens = rest.split(' ').filter(Boolean);
    const exprIndex = tokens.findIndex((token) => POOL_EXPR.test(token));
    if (exprIndex < 0) return { kind: 'invalid', reason: '骰池命令格式应为：骰池 <数量>d<面数>[+修正] [目标=数值]', raw };
    const match = tokens[exprIndex].match(POOL_EXPR);
    const count = match[1] === '' ? 1 : Number(match[1]);
    const sides = Number(match[2]);
    if (count < 1 || count > POOL_MAX_COUNT || !POOL_SIDES.includes(sides)) return { kind: 'invalid', reason: `骰池只支持 1 到 ${POOL_MAX_COUNT} 颗 d4、d6、d8、d10、d12、d20、d100`, raw };
    const target = Number(params['目标']);
    const label = String(params['项目'] || tokens.filter((_, index) => index !== exprIndex).join(' ')).trim();
    return {
        kind: 'pool',
        count,
        sides,
        modifier: match[3] ? Number(match[3]) : 0,
        target: params['目标'] !== undefined && Number.isFinite(target) ? target : null,
        under: /^(小于|低于|不超过|≤|<=?)$/.test(String(params['比较'] || '')),
        label,
    };
}

export function parseDiceCommand(raw) {
    const text = normalizeCommandText(raw);
    if (!text) return { kind: 'invalid', reason: '骰子命令为空', raw };
    if (/^(必成|必定成功|自动成功)(?:\s|$)/.test(text)) return { kind: 'fixed', success: true };
    if (/^(必败|必定失败|自动失败)(?:\s|$)/.test(text)) return { kind: 'fixed', success: false };
    if (/^(无|无需检定|不检定|无检定)(?:\s|$)/.test(text)) return { kind: 'none' };
    if (/^(骰池|掷骰|投骰)\s/.test(text)) return parsePoolCommand(text.replace(/^\S+\s+/, ''), raw);
    if (text.startsWith('检定 ')) {
        const { rest, params } = extractParams(text.slice(3));
        const actor = splitActor(rest);
        if (!actor) return { kind: 'invalid', reason: '普通检定命令格式应为：检定 <角色> <属性>', raw };
        // 带 DC 的是 d20 检定：属性读战斗六维，参数只接受 DC。
        const dcKey = Object.keys(params).find((key) => /^dc$/i.test(key));
        if (dcKey !== undefined) {
            const other = Object.keys(params).find((key) => key !== dcKey);
            if (other !== undefined) return { kind: 'invalid', reason: `DC 检定只接受 DC 参数，无法识别：${other}=${params[other]}`, raw };
            const dc = Number(params[dcKey]);
            const [min, max] = D20_DC_RANGE;
            if (!Number.isInteger(dc) || dc < min || dc > max) return { kind: 'invalid', reason: `DC 应为 ${min}–${max} 的整数：${params[dcKey]}`, raw };
            const ability = abilityKeyOf(actor.attribute);
            return ability
                ? { kind: 'd20', name: actor.name, attribute: ability, dc }
                : { kind: 'invalid', reason: `DC 检定的属性只写 力量/敏捷/体质/智力/感知/魅力：${actor.attribute}`, raw };
        }
        const bad = paramError(params, CHECK_PARAMS);
        if (bad) return { kind: 'invalid', reason: bad, raw };
        return { kind: 'check', name: actor.name, attribute: actor.attribute, ...parseModifiers(params) };
    }
    if (text.startsWith('对抗 ')) {
        const { rest, params } = extractParams(text.slice(3));
        const bad = paramError(params, CONTEST_PARAMS);
        if (bad) return { kind: 'invalid', reason: bad, raw };
        const sides = rest
            .replace(/\s*[VvＶｖ][SsＳｓ]\s*/g, ' vs ')
            .replace(/\s+(?:对|对抗)\s+/g, ' vs ')
            .split(/\s+vs\s+/i);
        const left = sides.length === 2 ? splitActor(sides[0]) : null;
        const right = sides.length === 2 ? splitActor(sides[1]) : null;
        if (!left || !right) return { kind: 'invalid', reason: '对抗检定命令格式应为：对抗 <角色> <属性> vs <角色> <属性>', raw };
        return {
            kind: 'contest',
            left,
            right,
            tieRule: /发起方(?:成功|胜)/.test(String(params['平局'] || '')) ? 'initiator_win' : (params['平局'] === '平局' ? 'tie' : 'initiator_lose'),
            ...parseModifiers(params),
        };
    }
    return { kind: 'invalid', reason: `无法识别的骰子命令：${text}`, raw };
}

// 与 AcuDice 的 d100 成功等级一致：≤5 大成功、≥96 大失败。
export function successLevel(roll, target) {
    if (roll <= 5) return { level: 3, name: '大成功' };
    if (roll >= 96) return { level: -1, name: '大失败' };
    if (roll <= Math.floor(target / 5)) return { level: 2, name: '极难成功' };
    if (roll <= Math.floor(target / 2)) return { level: 1, name: '困难成功' };
    if (roll <= target) return { level: 0, name: '普通成功' };
    return { level: -1, name: '失败' };
}

export function rollD100({ bonus = 0, penalty = 0 } = {}, random = Math.random) {
    const die = (sides) => Math.floor(random() * sides);
    const unit = die(10);
    const extra = Math.max(bonus, penalty);
    const tens = Array.from({ length: 1 + extra }, () => die(10));
    const totals = tens.map((ten) => (ten === 0 && unit === 0 ? 100 : ten * 10 + unit));
    const value = bonus > 0 ? Math.min(...totals) : penalty > 0 ? Math.max(...totals) : totals[0];
    return { value, totals };
}

function displayName(name, userName) {
    const text = String(name || '');
    if (!userName) return text;
    return text.replace(/<user>|\{\{user\}\}/gi, userName);
}

function bonusLabel(command) {
    if (command.bonus) return `奖励骰${command.bonus}`;
    if (command.penalty) return `惩罚骰${command.penalty}`;
    return '';
}

function readAttribute(acuDice, name, attribute) {
    let value = null;
    try {
        value = acuDice.getAttributeValue(name, attribute);
    } catch (error) {
        value = null;
    }
    const number = Number(value);
    return value === null || value === undefined || value === '' || !Number.isFinite(number) ? null : number;
}

// 骰子系统读不到属性时，退回才艺技能表（context.readSkillTable(角色名, 技能名)）；用表里的值时在本地掷骰。
function readTarget(acuDice, context, name, attribute) {
    const own = readAttribute(acuDice, name, attribute);
    if (own !== null || typeof context.readSkillTable !== 'function') return { value: own, local: false };
    let value = null;
    try { value = context.readSkillTable(name, attribute); } catch (error) { value = null; }
    const number = Number(value);
    return value === null || value === undefined || !Number.isFinite(number) ? { value: null, local: false } : { value: number, local: true };
}

async function resolveNormalCheck(command, acuDice, context) {
    const { value: target, local } = readTarget(acuDice, context, command.name, command.attribute);
    const who = displayName(command.name, context.userName);
    if (target === null) return { ok: false, reason: `未找到 ${who} 的属性「${command.attribute}」` };
    let roll;
    if (command.bonus || command.penalty || local) {
        roll = rollD100(command, context.random).value;
    } else {
        const result = await acuDice.checkByCharacter({ name: command.name, attribute: command.attribute, diceType: '1d100', successCriteria: 'lte' });
        roll = Number(result && result.roll);
        if (!Number.isFinite(roll)) return { ok: false, reason: '骰子系统未返回有效骰点' };
    }
    const tier = successLevel(roll, target);
    const threshold = Math.floor(target / DIFFICULTY_DIVISOR[command.difficulty]);
    const success = tier.level >= command.difficulty;
    const outcome = success ? tier.name : (tier.level >= 0 ? `失败（${tier.name}，未达${command.difficulty === 2 ? '极难' : '困难'}）` : tier.name);
    const extra = bonusLabel(command);
    const line = `元叙事：${who}发起了【${command.attribute}】检定，1d100${extra ? `(${extra})` : ''}=${roll}，需≤${threshold}，【${outcome}】。`;
    const detail = { kind: 'check', actor: who, attribute: command.attribute, roll, target, threshold, tier: tier.name, outcome, success };
    return { ok: true, success, roll, target, line, detail };
}

// d20 检定：六维读自 context.readAbilities（战斗底座），本地掷 d20。
async function resolveD20(command, context) {
    const who = displayName(command.name, context.userName);
    if (typeof context.readAbilities !== 'function') return { ok: false, reason: '六维属性不可用（需开启战斗扩展）' };
    let abilities = null;
    try {
        abilities = await context.readAbilities(command.name);
    } catch (error) {
        abilities = null;
    }
    const bonus = d20Bonus(abilities, command.attribute);
    if (bonus === null) return { ok: false, reason: `未找到 ${who} 的六维属性` };
    const die = 1 + Math.floor(context.random() * 20);
    const outcome = d20Outcome(die, bonus, command.dc);
    const label = ABILITY_LABELS[command.attribute];
    const sign = bonus >= 0 ? `+${bonus}` : `${bonus}`;
    const line = `元叙事：${who}发起了【${label}】检定，1d20${sign}=${die}${sign}=${outcome.total}，DC ${command.dc}，【${outcome.tier}】。`;
    const detail = { kind: 'd20', actor: who, attribute: label, ability: command.attribute, die, bonus, total: outcome.total, dc: command.dc, tier: outcome.tier, outcome: outcome.tier, success: outcome.success };
    return { ok: true, success: outcome.success, roll: die, line, detail };
}

async function resolveContest(command, acuDice, context) {
    const leftName = displayName(command.left.name, context.userName);
    const rightName = displayName(command.right.name, context.userName);
    const { value: leftTarget, local: leftLocal } = readTarget(acuDice, context, command.left.name, command.left.attribute);
    if (leftTarget === null) return { ok: false, reason: `未找到 ${leftName} 的属性「${command.left.attribute}」` };
    const { value: rightTarget, local: rightLocal } = readTarget(acuDice, context, command.right.name, command.right.attribute);
    if (rightTarget === null) return { ok: false, reason: `未找到 ${rightName} 的属性「${command.right.attribute}」` };
    let leftRoll;
    let rightRoll;
    if (command.bonus || command.penalty || leftLocal || rightLocal) {
        leftRoll = rollD100(command, context.random).value;
        rightRoll = rollD100({}, context.random).value;
    } else {
        const result = await acuDice.contest({
            left: { name: command.left.name, attribute: command.left.attribute },
            right: { name: command.right.name, attribute: command.right.attribute },
            diceType: '1d100',
            rule: command.tieRule,
        });
        leftRoll = Number(result && result.left && result.left.roll);
        rightRoll = Number(result && result.right && result.right.roll);
        if (!Number.isFinite(leftRoll) || !Number.isFinite(rightRoll)) return { ok: false, reason: '骰子系统未返回有效骰点' };
    }
    const leftTier = successLevel(leftRoll, leftTarget);
    const rightTier = successLevel(rightRoll, rightTarget);
    let winner;
    if (leftTier.level > rightTier.level) winner = 'left';
    else if (leftTier.level < rightTier.level) winner = 'right';
    else winner = command.tieRule === 'initiator_win' ? 'left' : command.tieRule === 'tie' ? 'tie' : 'right';
    const verdict = winner === 'left' ? `${leftName}胜出` : winner === 'right' ? `${rightName}胜出` : '双方平局';
    const extra = bonusLabel(command);
    const line = `元叙事：${leftName}以【${command.left.attribute}】对抗${rightName}的【${command.right.attribute}】，1d100${extra ? `(${extra})` : ''}=${leftRoll}/${rightRoll}，目标=${leftTarget}/${rightTarget}，结果：${verdict}（${leftTier.name} vs ${rightTier.name}）。`;
    const detail = {
        kind: 'contest',
        left: { name: leftName, attribute: command.left.attribute, roll: leftRoll, target: leftTarget, tier: leftTier.name },
        right: { name: rightName, attribute: command.right.attribute, roll: rightRoll, target: rightTarget, tier: rightTier.name },
        winner,
        verdict,
    };
    return { ok: true, success: winner === 'left', winner, line, detail };
}

function poolExpression(command) {
    const mod = command.modifier ? `${command.modifier > 0 ? '+' : ''}${command.modifier}` : '';
    return `${command.count}d${command.sides}${mod}`;
}

// 骰池在本地掷（AcuDice 公开 API 没有多面骰池）；单颗 d20 出 20 为大成功、出 1 为大失败，有目标时分别判成功与失败。
function resolvePool(command, context) {
    const dice = Array.from({ length: command.count }, () => 1 + Math.floor(context.random() * command.sides));
    const sum = dice.reduce((acc, value) => acc + value, 0);
    const total = sum + command.modifier;
    const single20 = command.count === 1 && command.sides === 20;
    const tier = single20 && dice[0] === 20 ? '大成功' : single20 && dice[0] === 1 ? '大失败' : '';
    const hasTarget = command.target !== null;
    let success;
    if (hasTarget) success = tier === '大成功' ? true : tier === '大失败' ? false : (command.under ? total <= command.target : total >= command.target);
    const outcome = tier || (hasTarget ? (success ? '成功' : '失败') : '');
    const expr = poolExpression(command);
    const who = displayName(command.label, context.userName);
    const mod = command.modifier ? `${command.modifier > 0 ? '+' : ''}${command.modifier}` : '';
    const body = `[${dice.join(',')}]${mod}=${total}`;
    const goal = hasTarget ? `，需${command.under ? '≤' : '≥'}${command.target}，【${outcome}】` : '';
    const line = `元叙事：${who ? `${who}：` : ''}骰池 ${expr}，${body}${goal}。`;
    const detail = {
        kind: 'pool', label: who, expr, sides: command.sides, dice, modifier: command.modifier, total,
        target: command.target, under: command.under, tier, outcome,
        ...(hasTarget ? { success } : {}),
    };
    return { ok: true, ...(hasTarget ? { success } : {}), total, line, detail };
}

// 返回 { ok, line }：line 为空表示无需检定。ok=false 时 reason 说明原因，调用方按原命令降级。
export async function resolveDiceCommand(raw, acuDice, context = {}) {
    const command = parseDiceCommand(raw);
    const ctx = { random: context.random || Math.random, userName: context.userName || '', readAbilities: context.readAbilities, readSkillTable: context.readSkillTable };
    if (command.kind === 'invalid') return { ok: false, reason: command.reason };
    if (command.kind === 'none') return { ok: true, line: '' };
    if (command.kind === 'fixed') return { ok: true, success: command.success, line: `元叙事：无需投骰，【${command.success ? '必定成功' : '必定失败'}】。` };
    if (command.kind === 'pool') return resolvePool(command, ctx);
    if (command.kind === 'd20') {
        try {
            return await resolveD20(command, ctx);
        } catch (error) {
            return { ok: false, reason: String(error && error.message || error || '检定执行失败') };
        }
    }
    // 骰子系统不可用但有才艺技能表可读时，用空壳顶上，取值与掷骰都在本地。
    const dice = isAcuDice(acuDice) ? acuDice : (typeof ctx.readSkillTable === 'function' ? { getAttributeValue: () => null } : null);
    if (!dice) return { ok: false, reason: '骰子系统未就绪' };
    try {
        return command.kind === 'check'
            ? await resolveNormalCheck(command, dice, ctx)
            : await resolveContest(command, dice, ctx);
    } catch (error) {
        return { ok: false, reason: String(error && error.message || error || '检定执行失败') };
    }
}

export function isAcuDice(value) {
    return Boolean(value)
        && typeof value.getAttributeValue === 'function'
        && typeof value.checkByCharacter === 'function'
        && typeof value.contest === 'function';
}

// 与骰子系统写入输入框的顺序一致：行动文本在前，结果块在后。
export function formatCheckMessage(display, line) {
    const action = String(display || '').trim();
    const sentence = action && !/[。！？!?…]$/.test(action) ? `${action}。` : action;
    if (!line) return sentence;
    const block = `<${DICE_RESULT_TAG}>\n${line}\n</${DICE_RESULT_TAG}>`;
    return sentence ? `${sentence} ${block}` : block;
}

export function findAcuDice(globalObject) {
    const candidates = [];
    const push = (read) => {
        try {
            const target = read();
            if (target && !candidates.includes(target)) candidates.push(target);
        } catch (error) { /* 跨域 frame */ }
    };
    push(() => globalObject);
    push(() => globalObject && globalObject.top);
    push(() => globalObject && globalObject.parent);
    for (const target of candidates) {
        let dice = null;
        try { dice = target.AcuDice; } catch (error) { dice = null; }
        if (isAcuDice(dice)) return dice;
    }
    return null;
}
