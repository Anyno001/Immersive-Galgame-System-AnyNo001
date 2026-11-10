import { mahjongAmount } from '../../../scene/points/points-policy.js';

const TYPES = new Set(['hu', 'zimo', 'ganghua', 'dianganghua', 'gangpaohu', 'qiangganghu', 'chadajiao', 'angang', 'wangang', 'diangang', 'maozhuanyu']);
const seat = n => Number.isInteger(n) && n >= 0 && n < 4;

export function scmjPointsHand(data, self = 0) {
    const raw = data?.points;
    const fail = () => ({ ok: false, reason: 'points-mahjong-evidence-invalid' });
    if (!seat(self) || raw?.version !== 1 || raw.rules !== 'chengdu'
        || !Number.isSafeInteger(raw.hand) || raw.hand < 0 || !Array.isArray(raw.transfers)
        || !Array.isArray(data.results) || data.results.length !== 4) return fail();
    const scores = [0, 0, 0, 0], fans = [0, 0, 0, 0];
    for (const transfer of raw.transfers) {
        const { from, to, type, fan, score } = transfer || {};
        if (!seat(from) || !seat(to) || from === to || !TYPES.has(type)
            || !Number.isSafeInteger(fan) || fan < 0 || !Number.isSafeInteger(score) || score < 0) return fail();
        scores[from] -= score; scores[to] += score;
        if (to === self) fans[from] += fan;
        if (from === self) fans[to] -= fan;
        if (![...scores, ...fans].every(Number.isSafeInteger)) return fail();
    }
    if (data.results.some((row, index) => !Number.isSafeInteger(row?.score) || row.score !== scores[index])) return fail();
    const legs = fans.filter((_, index) => index !== self);
    const deltas = legs.map(n => 10 * Math.max(-20, Math.min(20, n)));
    return { ok: true, hand: { handId: `chengdu:${raw.hand}`, rules: 'chengdu', legs,
        raw: JSON.parse(JSON.stringify({ ...raw, self, results: data.results, deltas, amount: mahjongAmount(legs) })) } };
}
