import { mahjongHandAmount } from '../../scene/points/points-policy.js';

const seat = n => Number.isInteger(n) && n >= 0 && n < 4;
const fail = () => ({ ok: false, reason: 'points-mahjong-evidence-invalid' });

export function riichiPointsEvidence(paipu, self = 0) {
    return (paipu?.log || []).flatMap((log, hand) => {
        if (!Array.isArray(log)) return [{ hand }];
        const results = log.filter(msg => msg?.hule || msg?.pingju);
        return results.length ? [{ version: 1, rules: 'riichi', hand, self, qijia: paipu.qijia,
            qipai: log[0]?.qipai, results }] : [];
    });
}

export function riichiPointsHand(data) {
    if (data?.version !== 1 || data.rules !== 'riichi' || !seat(data.self) || !seat(data.qijia)
        || !Number.isSafeInteger(data.hand) || data.hand < 0 || !seat(data.qipai?.jushu)
        || !Array.isArray(data.results) || data.results.length !== 1) return fail();
    const self = (data.self + 8 - data.qijia - data.qipai.jushu) % 4;
    const result = data.results[0];
    if (Boolean(result?.hule) === Boolean(result?.pingju)) return fail();
    let fan = 0;
    if (result.hule) {
        const win = result.hule;
        const count = win.damanguan === undefined ? win.fanshu
            : Number.isSafeInteger(win.damanguan) && win.damanguan > 0 ? 20 : NaN;
        if (!seat(win.l) || !(win.baojia === null || seat(win.baojia))
            || !Number.isSafeInteger(count) || count <= 0 || !Array.isArray(win.fenpei)
            || win.fenpei.length !== 4 || !win.fenpei.every(Number.isSafeInteger)
            || win.fenpei[win.l] <= 0 || win.fenpei.some((n, l) => l !== win.l && n > 0)) return fail();
        fan = win.l === self ? count : win.fenpei[self] < 0 ? -count : 0;
    } else if (typeof result.pingju?.name !== 'string' || !result.pingju.name) return fail();
    const raw = JSON.parse(JSON.stringify(data));
    return { ok: true, hand: { handId: `riichi:${data.hand}`, rules: 'riichi', fan,
        raw: { ...raw, amount: mahjongHandAmount({ rules: 'riichi', fan }) } } };
}
