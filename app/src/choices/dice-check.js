// 检定建议表的骰子命令判定：DSL 语法与结果格式对齐骰子系统（AcuDice）自身的检定建议按钮。
// 掷骰与属性查询交给 AcuDice 公开 API，使检定历史与统计面板保持一致；
// 公开 API 不支持奖惩骰，带奖惩时只向 AcuDice 取属性值、在本地掷骰。

export const DICE_RESULT_TAG = 'meta:检定结果';

const DIFFICULTY_LEVEL = Object.freeze({ 普通: 0, 困难: 1, 极难: 2 });
const DIFFICULTY_DIVISOR = Object.freeze({ 0: 1, 1: 2, 2: 5 });

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

export function parseDiceCommand(raw) {
    const text = normalizeCommandText(raw);
    if (!text) return { kind: 'invalid', reason: '骰子命令为空', raw };
    if (/^(必成|必定成功|自动成功)(?:\s|$)/.test(text)) return { kind: 'fixed', success: true };
    if (/^(必败|必定失败|自动失败)(?:\s|$)/.test(text)) return { kind: 'fixed', success: false };
    if (/^(无|无需检定|不检定|无检定)(?:\s|$)/.test(text)) return { kind: 'none' };
    if (text.startsWith('检定 ')) {
        const { rest, params } = extractParams(text.slice(3));
        const actor = splitActor(rest);
        if (!actor) return { kind: 'invalid', reason: '普通检定命令格式应为：检定 <角色> <属性>', raw };
        return { kind: 'check', name: actor.name, attribute: actor.attribute, ...parseModifiers(params) };
    }
    if (text.startsWith('对抗 ')) {
        const { rest, params } = extractParams(text.slice(3));
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

async function resolveNormalCheck(command, acuDice, context) {
    const target = readAttribute(acuDice, command.name, command.attribute);
    const who = displayName(command.name, context.userName);
    if (target === null) return { ok: false, reason: `未找到 ${who} 的属性「${command.attribute}」` };
    let roll;
    if (command.bonus || command.penalty) {
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

async function resolveContest(command, acuDice, context) {
    const leftName = displayName(command.left.name, context.userName);
    const rightName = displayName(command.right.name, context.userName);
    const leftTarget = readAttribute(acuDice, command.left.name, command.left.attribute);
    if (leftTarget === null) return { ok: false, reason: `未找到 ${leftName} 的属性「${command.left.attribute}」` };
    const rightTarget = readAttribute(acuDice, command.right.name, command.right.attribute);
    if (rightTarget === null) return { ok: false, reason: `未找到 ${rightName} 的属性「${command.right.attribute}」` };
    let leftRoll;
    let rightRoll;
    if (command.bonus || command.penalty) {
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

// 返回 { ok, line }：line 为空表示无需检定。ok=false 时 reason 说明原因，调用方按原命令降级。
export async function resolveDiceCommand(raw, acuDice, context = {}) {
    const command = parseDiceCommand(raw);
    const ctx = { random: context.random || Math.random, userName: context.userName || '' };
    if (command.kind === 'invalid') return { ok: false, reason: command.reason };
    if (command.kind === 'none') return { ok: true, line: '' };
    if (command.kind === 'fixed') return { ok: true, success: command.success, line: `元叙事：无需投骰，【${command.success ? '必定成功' : '必定失败'}】。` };
    if (!isAcuDice(acuDice)) return { ok: false, reason: '骰子系统未就绪' };
    try {
        return command.kind === 'check'
            ? await resolveNormalCheck(command, acuDice, ctx)
            : await resolveContest(command, acuDice, ctx);
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
