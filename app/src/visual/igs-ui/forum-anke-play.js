import { forumHash } from './forum-reader-model.js';

// 论坛安科的结算：暗骰、票数、判定、填入输入框的那一行。纯函数，随机数由调用方注入。
export const ANKE_USER_WEIGHT = 0.5;
export const ANKE_TOTAL_MIN = 18;
export const ANKE_TOTAL_SPAN = 17;

export function ankeUnit() {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
}

export function ankeRoll(n) {
    const buf = new Uint32Array(1);
    const cap = Math.floor(0x100000000 / n) * n;
    do { globalThis.crypto.getRandomValues(buf); } while (buf[0] >= cap);
    return (buf[0] % n) + 1;
}

// 回帖里的票：投N、N+1、N！（开头的数字）；返回 1 起的选项号，认不出为 0。
export function ankeVoteOf(text, count) {
    const flat = String(text || '');
    const hit = flat.match(/投\s*(\d{1,2})/) || flat.match(/(\d{1,2})\s*[+＋]\s*1/) || flat.match(/^\s*(\d{1,2})\s*(?:[!！]+|$)/);
    const n = hit ? Number(hit[1]) : 0;
    return n >= 1 && n <= count ? n : 0;
}

export function ankeVisibleVotes(count, texts) {
    const out = Array(count).fill(0);
    for (const text of texts) {
        const n = ankeVoteOf(text, count);
        if (n) out[n - 1] += 1;
    }
    return out;
}

// 暗骰：User 那项占 ANKE_USER_WEIGHT，其余按「1 + 可见票」分给各项；再按种子凑出总票数，胜者严格最多，各项不少于可见票（User 那项 +1）。
export function ankeVotePlay({ visible, pick, unit = ankeUnit, seed = '' }) {
    const n = visible.length;
    const base = visible.map((v) => 1 + v);
    const sum = base.reduce((a, b) => a + b, 0);
    const weights = base.map((v, i) => (i === pick ? ANKE_USER_WEIGHT : 0) + (1 - ANKE_USER_WEIGHT) * v / sum);
    let at = unit() * weights.reduce((a, b) => a + b, 0);
    let winner = n - 1;
    for (let i = 0; i < n; i++) { at -= weights[i]; if (at < 0) { winner = i; break; } }
    const votes = visible.map((v, i) => v + (i === pick ? 1 : 0));
    const others = Math.max(...votes.filter((_, i) => i !== winner));
    votes[winner] = Math.max(votes[winner], others + 1);
    let left = ANKE_TOTAL_MIN + (forumHash(`${seed}:total`) % ANKE_TOTAL_SPAN) - votes.reduce((a, b) => a + b, 0);
    for (let step = 0; left > 0; step++, left--) {
        const open = votes.map((v, i) => (i === winner || v + 1 < votes[winner] ? (i === winner ? 3 : 2) : 0));
        let r = forumHash(`${seed}:v${step}`) % open.reduce((a, b) => a + b, 0);
        let target = winner;
        for (let i = 0; i < n; i++) { if (r < open[i]) { target = i; break; } r -= open[i]; }
        votes[target] += 1;
    }
    return { winner, tally: votes, lead: votes[winner] - Math.max(...votes.filter((_, i) => i !== winner)) };
}

export const ANKE_CRIT_OK = 5;
export const ANKE_CRIT_FAIL = 96;

export function ankeCheckPlay({ die, bonus, line }) {
    const total = die + (bonus || 0);
    const tier = die <= ANKE_CRIT_OK ? '大成功' : die >= ANKE_CRIT_FAIL ? '大失败' : total >= line ? '成功' : '失败';
    return { die, total, tier, diff: total - line };
}

const signed = (n) => `${n >= 0 ? '+' : '-'}${Math.abs(n)}`;

// 填进输入框的一行。pick 是 0 起的选项 / 楼层序号，自由为 -1；roll 是 ROLL 的面数（没滚为 0），die 是点数。
export function ankeFillLine(anke, lock) {
    const { kind, options = [] } = anke;
    const free = lock.pick < 0;
    const dice = lock.roll > 0 && kind !== 'check' ? `（🎲1D${lock.roll}=${lock.die}）` : '';
    if (kind === 'pick') return free ? '【安价】' : `【安价】${lock.pick + 1}：${options[lock.pick]}${dice}`;
    if (kind === 'vote') return free ? '【多数决】' : `【多数决】投${lock.pick + 1}，${lock.roll + 1}号胜出：${options[lock.roll]}（${lock.tally.join('/')}票）`;
    if (kind === 'anchor') return free ? '【安价】' : `【安价】>>No.${anke.floors[lock.pick].no} ${options[lock.pick]}${dice}`;
    if (kind === 'collect') return free ? '【征集】' : `【征集】采用>>No.${anke.floors[lock.pick].no}：${options[lock.pick]}${dice}`;
    const bonus = anke.bonus;
    const calc = bonus ? `${signed(bonus)}=${lock.total}` : '';
    return `【判定】${anke.actorLabel || anke.actor}：1D100=${lock.die}${calc}，成功线${anke.line}，${lock.tier}`;
}

// 锁里的结果还原成对内置短楼要用的情境参数。
export function ankeOutcomeOf(anke, lock) {
    if (anke.kind === 'vote' && lock.pick >= 0) {
        const voters = (anke.voters || []).filter((v) => v.n - 1 !== lock.roll);
        const rest = lock.tally.filter((_, i) => i !== lock.roll);
        return { won: lock.pick === lock.roll, lead: lock.tally[lock.roll] - Math.max(...rest), voters };
    }
    if (anke.kind === 'check') return { tier: lock.tier, diff: lock.total - anke.line };
    const n = anke.options.length;
    const rolled = lock.roll > 0;
    return { mode: lock.pick < 0 ? 'free' : rolled && lock.pick === 0 ? 'first' : rolled && lock.pick === n - 1 ? 'last' : 'mid' };
}
