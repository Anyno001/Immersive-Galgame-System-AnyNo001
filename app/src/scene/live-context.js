// 直播上下文（纯函数）：AI 漏写 live 标签时按正文里的开播 / 下播词兜底，并跨楼层继承未下播的直播。
// 宿主读取由 api/igs-compat.js 负责，这里只处理文本与指令。
import { extractFxDirectives } from './fx-directives.js';

// 向前最多看 20 条消息（含用户楼层，玩家常在输入里写「开直播」）；上一个 AI 楼层不提直播即视为已下播，漏写 live-end 时手机不再多挂。
export const LIVE_CHAIN_MAX_MESSAGES = 20;
export const LIVE_QUIET_MAX_FLOORS = 1;

// 只认开播 / 下播这类动作词；「没开播」「不直播」之类的否定不算。
const LIVE_START_RE = /(?<![没未不别离])(?:开播|开(?:了|启|始)?直播|打开(?:了)?直播间?|直播开始了?|上播|(?:调用|触发|启动)直播(?:演出|间)?)/g;
const LIVE_END_RE = /(?<![没未不别])(?:下播|关播|断播|停播|关(?:了|掉|闭)?直播间?|结束(?:了)?直播|直播结束|切断(?:了)?直播|退出(?:了)?直播间?|离开(?:了)?直播间|(?:收起|放下|锁上|锁了|关掉|关上)(?:了)?手机|直播间?(?:关了|关闭了?|没了))/g;
const LIVE_MENTION_RE = /直播|弹幕|观众|礼物|打赏|主播|\[igs-fx:(?:live|dm)[|\]]/;

// 兜底开播的主播默认是玩家本人：主播后台视角，标题「X的直播间」。
export function liveFallbackOf(userName = '') {
    const name = String(userName || '').trim() || '主播';
    return { name, title: `${name}的直播间`, view: 'host' };
}

function liveArgs(live) {
    return [String(live.name || ''), String(live.title || ''), live.view === 'host' ? 'host' : 'watch'];
}

// 正文里的开播 / 下播词转成与 live 标签同形的指令（按出现位置排序）。
export function liveCueDirectives(source, fallback) {
    const text = String(source || '');
    const out = [];
    for (const m of text.matchAll(LIVE_START_RE)) out.push({ kind: 'live', end: false, args: liveArgs(fallback), offset: m.index, cue: true });
    for (const m of text.matchAll(LIVE_END_RE)) out.push({ kind: 'live', end: true, args: [], offset: m.index, cue: true });
    return out.sort((a, b) => a.offset - b.offset);
}

// 返回 { live } 表示该楼层结束时直播仍在进行，{ live: null } 表示已下播，null 表示本楼没有开播 / 下播信号。
export function readLiveCarry(text, fallback) {
    const tags = extractFxDirectives(text).filter((d) => d.kind === 'live');
    const list = tags.length ? tags : liveCueDirectives(text, fallback);
    const last = list[list.length - 1];
    if (!last) return null;
    return { live: last.end ? null : { name: last.args[0], title: last.args[1], view: last.args[2] } };
}

// 逐条喂入本楼之前的消息（近的在前：{ isUser, text }），push 返回 true 表示已有结论、宿主可停止读取。
export function createLiveHistoryScanner(fallback) {
    let seen = 0;
    let quiet = 0;
    let live = null;
    let done = false;
    return {
        push(message) {
            if (done || !message) return done;
            seen += 1;
            const text = String(message.text || '');
            const carry = readLiveCarry(text, fallback);
            if (carry) {
                live = carry.live;
                done = true;
            } else if (!message.isUser) {
                quiet = LIVE_MENTION_RE.test(text) ? 0 : quiet + 1;
                if (quiet >= LIVE_QUIET_MAX_FLOORS) done = true;
            }
            if (seen >= LIVE_CHAIN_MAX_MESSAGES) done = true;
            return done;
        },
        result() { return live; },
    };
}

export function resolveLiveContextFromHistory(history, fallback) {
    const scanner = createLiveHistoryScanner(fallback);
    for (const message of Array.isArray(history) ? history : []) if (scanner.push(message)) break;
    return scanner.result();
}

// 本楼指令补上直播兜底：继承的直播挂在楼首（本楼完全不提直播就不继承，免得手机多挂一楼）；本楼没写 live 标签时，再把开播 / 下播词转成指令。返回新数组，不改原指令。
export function withLiveFallback(directives, source, carried, fallback) {
    const list = Array.isArray(directives) ? directives : [];
    const extra = [];
    if (carried && carried.name && LIVE_MENTION_RE.test(String(source || ''))) extra.push({ kind: 'live', end: false, args: liveArgs(carried), offset: 0, cue: true });
    if (fallback && !list.some((d) => d.kind === 'live')) extra.push(...liveCueDirectives(source, fallback));
    if (!extra.length) return list;
    return [...extra, ...list].sort((a, b) => a.offset - b.offset);
}
