// 战斗上下文（纯函数）：跨楼层继承未结束的战斗、读取上一条用户消息里的骰子检定等级并套到主角的出招上。
// 宿主读取由 api/igs-compat.js 负责，这里只处理文本与指令。
import { extractFxDirectives } from './fx-directives.js';

// 战斗链：向前追溯时，带出招标签的楼层算「战斗仍在继续」，沿链一直找到开战标签，最多 12 个 AI 楼层；
// 连续 2 个 AI 楼层没有任何战斗标签即认为战斗已结束（也限制 AI 漏写 battle-end 时名牌多挂的层数）。
export const BATTLE_CHAIN_MAX_FLOORS = 12;
export const BATTLE_QUIET_MAX_FLOORS = 2;
export const PLAYER_NAMES = Object.freeze(['我', '你', '主角', '玩家', '{{user}}']);

const DICE_BLOCK_RE = /<meta:检定结果>([\s\S]*?)<\/meta:检定结果>/g;
// 对抗检定写作「（左 vs 右）」，发起方（主角）的等级在前，取「结果」之后第一个等级词即可。
const DICE_TIER_RE = /(大成功|大失败|极难成功|困难成功|普通成功|失败)/;
const DICE_TIER_EFFECT = Object.freeze({ 大成功: 'crit', 大失败: 'miss' });

// 返回 { battle } 表示该楼层结束时战斗仍在进行，{ battle: null } 表示已结束，{ active: true } 表示只有出招（战斗进行中但开战在更早的楼层），null 表示本楼没有战斗标签。
export function readBattleCarry(text) {
    const list = extractFxDirectives(text).filter((d) => d.kind === 'battle' || d.kind === 'hit');
    const last = [...list].reverse().find((d) => d.kind === 'battle');
    if (last) return { battle: last.end ? null : { foe: last.args[0], title: last.args[1] } };
    return list.length ? { active: true } : null;
}

export function readDiceEffect(text) {
    let effect = '';
    for (const m of String(text || '').matchAll(DICE_BLOCK_RE)) {
        const body = m[1];
        const after = body.slice(Math.max(0, body.lastIndexOf('结果')));
        const tier = (after.match(DICE_TIER_RE) || [])[1] || '';
        effect = DICE_TIER_EFFECT[tier] || '';
    }
    return effect;
}

// 逐条喂入本楼之前的消息（近的在前：{ isUser, text }），push 返回 true 表示已有结论、宿主可停止读取。
// 骰子只认紧挨在本楼之前的用户消息。
export function createBattleHistoryScanner() {
    let dice = '';
    let aiSeen = 0;
    let quiet = 0;
    let battle = null;
    let done = false;
    return {
        push(message) {
            if (done || !message) return done;
            if (message.isUser) {
                if (!aiSeen && !dice) dice = readDiceEffect(message.text);
                return done;
            }
            aiSeen += 1;
            const carry = readBattleCarry(message.text);
            if (carry && !carry.active) { battle = carry.battle; done = true; }
            else if (carry) quiet = 0;
            else quiet += 1;
            if (quiet >= BATTLE_QUIET_MAX_FLOORS || aiSeen >= BATTLE_CHAIN_MAX_FLOORS) done = true;
            return done;
        },
        result() { return { battle, dice }; },
    };
}

export function resolveBattleContextFromHistory(history) {
    const scanner = createBattleHistoryScanner();
    for (const message of Array.isArray(history) ? history : []) if (scanner.push(message)) break;
    return scanner.result();
}

export function isPlayerName(name, userName = '') {
    const target = String(name || '').trim();
    if (!target) return false;
    return PLAYER_NAMES.includes(target) || (Boolean(userName) && target === String(userName).trim());
}

// 只改本楼主角的第一招，且只在 AI 写的是普通命中时覆盖；返回新数组，不改原指令。
export function applyDiceToHits(directives, dice, userName = '') {
    if (!Array.isArray(directives) || (dice !== 'crit' && dice !== 'miss')) return directives;
    const index = directives.findIndex((d) => d.kind === 'hit' && isPlayerName(d.args[0], userName));
    if (index < 0 || directives[index].args[3] !== 'hit') return directives;
    const out = directives.slice();
    const args = directives[index].args.slice();
    args[3] = dice;
    out[index] = { ...directives[index], args, dice: true };
    return out;
}
