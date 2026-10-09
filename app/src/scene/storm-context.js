// 舆论风暴上下文（纯函数）：跨楼继承未平息的风暴。照搬 live-context 的思路，宿主读取由 api/igs-compat.js 负责。
import { extractFxDirectives } from './fx-directives.js';

// 向前最多看 20 条消息；连续 4 个 AI 楼层没有任何 storm / mention 标签视为已平息，限制漏写 storm-end 时多挂的层数。
export const STORM_CHAIN_MAX_MESSAGES = 20;
export const STORM_QUIET_MAX_FLOORS = 4;

// 返回 { storm } 表示该楼层结束时风暴仍在（storm 为 null 表示已平息）；{ active: true } 表示只有 mention、风暴仍在持续但细节在更早的楼层；null 表示本楼没有风暴信号。
export function readStormCarry(text) {
    let last = null;
    let mentioned = false;
    for (const d of extractFxDirectives(text)) {
        if (d.kind === 'storm') last = d;
        else if (d.kind === 'mention') mentioned = true;
    }
    if (last) return { storm: last.end ? null : { platform: last.args[0], tone: last.args[1], topic: last.args[2] } };
    return mentioned ? { active: true } : null;
}

// 逐条喂入本楼之前的消息（近的在前：{ isUser, text }），push 返回 true 表示已有结论、宿主可停止读取。
export function createStormHistoryScanner() {
    let seen = 0;
    let quiet = 0;
    let storm = null;
    let done = false;
    return {
        push(message) {
            if (done || !message) return done;
            seen += 1;
            const carry = readStormCarry(String(message.text || ''));
            if (carry && carry.active) quiet = 0;
            else if (carry) {
                storm = carry.storm;
                done = true;
            } else if (!message.isUser) {
                quiet += 1;
                if (quiet >= STORM_QUIET_MAX_FLOORS) done = true;
            }
            if (seen >= STORM_CHAIN_MAX_MESSAGES) done = true;
            return done;
        },
        result() { return storm; },
    };
}

export function resolveStormContextFromHistory(history) {
    const scanner = createStormHistoryScanner();
    for (const message of Array.isArray(history) ? history : []) if (scanner.push(message)) break;
    return scanner.result();
}

// 本楼指令补上继承的风暴：挂在楼首（offset 0），评论不重放，只留平台 / 红黑 / 热搜词。返回新数组，不改原指令。
export function withStormCarry(directives, carried) {
    const list = Array.isArray(directives) ? directives : [];
    if (!carried || typeof carried !== 'object') return list;
    const head = { kind: 'storm', end: false, args: [String(carried.platform || ''), carried.tone === 'black' ? 'black' : 'red', String(carried.topic || '')], offset: 0, carried: true };
    return [head, ...list].sort((a, b) => a.offset - b.offset);
}
