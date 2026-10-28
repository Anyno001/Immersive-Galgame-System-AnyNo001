// 立直剖面是引擎原来的函数。成都剖面只换规则输入。
import Majiang from '@kobalab/majiang-core';
import SuanPai from '@kobalab/majiang-ai/lib/suanpai.js';
import { SCMJ_CONF } from './host.js';
import { chengduXiangtingShoupai, codeToYoulin, queToSuit, youlinSuit, youlinToCode } from './profile.js';
import threatJson from './threat-table.json' with { type: 'json' };

export const CHENGDU_K = 1000;

// 出牌数 5 档、副露 0–4、距上次打出缺门牌 0/1/2/≥3/从未。共 125 格。
export function threatIndex(discards, melds, gap) {
    const d = discards <= 3 ? 0 : discards <= 6 ? 1 : discards <= 9 ? 2 : discards <= 12 ? 3 : 4;
    const m = Math.max(0, Math.min(4, melds));
    const g = gap == null ? 4 : gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : 3;
    return d * 25 + m * 5 + g;
}

export function seatThreatIndex(player, l, state) {
    const river = player._model && player._model.he && player._model.he[l] && player._model.he[l]._pai || [];
    const hand = player._model && player._model.shoupai && player._model.shoupai[l];
    const openMelds = hand && hand._fulou ? hand._fulou.length : 0;
    const melds = openMelds + ((state.concealed && state.concealed[l]) || 0);
    const que = queToSuit(state.ques && state.ques[l]);
    let gap = null;
    if (que) {
        for (let i = river.length - 1; i >= 0; i -= 1) {
            if (String(river[i])[0] === que) {
                gap = river.length - 1 - i;
                break;
            }
        }
    }
    return threatIndex(river.length, melds, gap);
}

const DEFAULT_THREAT = Array.isArray(threatJson.p) && threatJson.p.length === 125 ? threatJson.p : null;

function expandHongpai(tingpai) {
    const pai = [];
    for (const p of tingpai || []) {
        if (p[0] !== 'z' && p[1] === '5') pai.push(p.replace(/5/, '0'));
        pai.push(p);
    }
    return pai;
}

export function riichiYakuXiangting(player, shoupai) {
    const base = (hand) => player.rules.xiangting(hand);
    function xiangtingMenqian(hand) {
        return hand.menqian ? base(hand) : Infinity;
    }
    function xiangtingFanpai(hand, zhuangfeng, menfeng, suanpai) {
        let nFanpai = 0;
        let back;
        for (const n of [zhuangfeng + 1, menfeng + 1, 5, 6, 7]) {
            if (hand._bingpai.z[n] >= 3) nFanpai += 1;
            else if (hand._bingpai.z[n] === 2 && suanpai._paishu.z[n]) back = `z${n}${n}${n}+`;
            for (const m of hand._fulou) {
                if (m[0] === 'z' && m[1] == n) nFanpai += 1;
            }
        }
        if (nFanpai) return base(hand);
        if (back) {
            const next = hand.clone();
            next.fulou(back, false);
            next._zimo = null;
            return base(next) + 1;
        }
        return Infinity;
    }
    function xiangtingDuanyao(hand, rule) {
        if (!rule['クイタンあり'] && !hand.menqian) return Infinity;
        if (hand._fulou.find((m) => m.match(/^z|[19]/))) return Infinity;
        const next = hand.clone();
        for (const s of ['m', 'p', 's']) {
            next._bingpai[s][1] = 0;
            next._bingpai[s][9] = 0;
        }
        next._bingpai.z = [0, 0, 0, 0, 0, 0, 0, 0];
        return base(next);
    }
    function xiangtingDuidui(hand) {
        if (hand._fulou.map((m) => m.replace(/0/, '5')).find((m) => !m.match(/^[mpsz](\d)\1\1/))) return Infinity;
        let nKezi = hand._fulou.length;
        let nDuizi = 0;
        for (const s of ['m', 'p', 's', 'z']) {
            const bingpai = hand._bingpai[s];
            for (let n = 1; n < bingpai.length; n += 1) {
                if (bingpai[n] >= 3) nKezi += 1;
                else if (bingpai[n] === 2) nDuizi += 1;
            }
        }
        if (nKezi + nDuizi > 5) nDuizi = 5 - nKezi;
        return 8 - nKezi * 2 - nDuizi;
    }
    function xiangtingYise(hand, suit) {
        const regexp = new RegExp(`^[z${suit}]`);
        if (hand._fulou.find((m) => !m.match(regexp))) return Infinity;
        const next = hand.clone();
        for (const s of ['m', 'p', 's']) {
            if (s !== suit) next._bingpai[s] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        }
        return base(next);
    }
    return Math.min(
        xiangtingMenqian(shoupai),
        xiangtingFanpai(shoupai, player._model.zhuangfeng, player._menfeng, player._suanpai),
        xiangtingDuanyao(shoupai, player._rule),
        xiangtingDuidui(shoupai),
        xiangtingYise(shoupai, 'm'),
        xiangtingYise(shoupai, 'p'),
        xiangtingYise(shoupai, 's'),
    );
}

export function riichiTingpai(player, shoupai) {
    const nXiangting = player.xiangting(shoupai);
    const pai = [];
    for (const p of player.rules.tingpai(shoupai, (hand) => player.xiangting(hand))) {
        if (nXiangting > 0) {
            for (const m of player.get_peng_mianzi(shoupai, `${p}+`)) {
                const next = shoupai.clone().fulou(m);
                if (player.xiangting(next) < nXiangting) {
                    pai.push(`${p}+`);
                    break;
                }
            }
            if (pai[pai.length - 1] === `${p}+`) continue;
            for (const m of player.get_chi_mianzi(shoupai, `${p}-`)) {
                const next = shoupai.clone().fulou(m);
                if (player.xiangting(next) < nXiangting) {
                    pai.push(`${p}-`);
                    break;
                }
            }
            if (pai[pai.length - 1] === `${p}-`) continue;
        }
        pai.push(p);
    }
    return pai;
}

export function riichiRules() {
    return {
        yaku: true,
        allowChi: true,
        allowLizhi: true,
        allowPingju: true,
        allowNoDaopai: true,
        xiangting(shoupai) { return Majiang.Util.xiangting(shoupai); },
        tingpai(shoupai, fn) { return Majiang.Util.tingpai(shoupai, fn); },
        expand: expandHongpai,
        waitWeight(p) { return p[2] === '+' ? 4 : p[2] === '-' ? 2 : 1; },
        mixFulou(peng, chi) { return peng > chi ? peng * 3 : peng * 2 + chi; },
        defen(player, shoupai, rongpai) {
            const hule = Majiang.Util.hule(shoupai, rongpai, {
                rule: player._rule,
                zhuangfeng: player._model.zhuangfeng,
                menfeng: player._menfeng,
                hupai: { lizhi: shoupai.menqian },
                baopai: player.shan.baopai,
                jicun: { changbang: 0, lizhibang: 0 },
            });
            return hule.defen;
        },
    };
}

class ChengduPaishu {
    constructor(paishu, nZimo, step) {
        this._paishu = {};
        this._sum_paishu = 0;
        for (const s of ['m', 'p', 's', 'z']) {
            for (let n = 0; n < paishu[s].length; n += 1) {
                if (s === 'z' && n === 0) continue;
                this._paishu[s + n] = n === 5 ? paishu[s][n] - paishu[s][0] : paishu[s][n];
                this._sum_paishu += this._paishu[s + n];
            }
        }
        this._n_zimo = nZimo;
        this._step = step;
    }

    val(p, real) {
        return real ? this._paishu[p.slice(0, 2)]
            : this._n_zimo > 0 ? this._paishu[p.slice(0, 2)] * this._n_zimo / this._sum_paishu
                : 0;
    }

    pop(p) {
        this._paishu[p.slice(0, 2)] -= 1;
        this._sum_paishu -= 1;
        this._n_zimo -= this._step;
        return this;
    }

    push(p) {
        this._paishu[p.slice(0, 2)] += 1;
        this._sum_paishu += 1;
        this._n_zimo += this._step;
        return this;
    }
}

class ChengduSuanPai extends SuanPai {
    constructor(state) {
        super({ m: 0, p: 0, s: 0 });
        this._state = state;
        this._paishu.z = [0, 0, 0, 0, 0, 0, 0, 0];
        this._n_zimo = 55;
        this._baopai = [];
        this._fresh = [{}, {}, {}, {}];
    }

    qipai(qipai, menfeng) {
        this._zhuangfeng = qipai.zhuangfeng;
        this._menfeng = menfeng;
        this._baopai = [];
        this._n_zimo = 55;
        const paistr = qipai.shoupai[menfeng];
        for (const suitstr of paistr.match(/[mpsz]\d[\d+\-=]*/g) || []) {
            const s = suitstr[0];
            for (const n of suitstr.match(/\d/g)) this.decrease(`${s}${n}`);
        }
    }

    zimo(zimo) {
        if (zimo.l === this._menfeng && zimo.p && zimo.p !== '_') this.decrease(zimo.p);
        this._n_zimo -= 1;
        this._fresh[zimo.l] = {};
    }

    dapai(dapai) {
        if (dapai.l !== this._menfeng && dapai.p !== '_') this.decrease(dapai.p);
        if (dapai.p && dapai.p !== '_') {
            const p = dapai.p[0] + (+dapai.p[1] || 5);
            this._fresh[dapai.l][p] = true;
        }
    }

    get_paishu() {
        // alive 是对手里还在打的人数。自己也还在摸牌，步长是 4、3、2。
        return new ChengduPaishu(this._paishu, this._n_zimo, (this._state.alive ?? 3) + 1);
    }

    paijia(p) {
        if (p[0] === 'z') return 0;
        if (queToSuit(this._state.que) === p[0]) return 0;
        return super.paijia(p);
    }

    suan_weixian(p, l, c = 1) {
        const s = p[0];
        const n = +p[1] || 5;
        if (this._state.hued && this._state.hued[l]) return 0;
        if (queToSuit(this._state.ques && this._state.ques[l]) === s) return 0;
        if (this._fresh[l][s + n]) return 0;
        const paishu = this._paishu[s];
        let r = 0;
        const left = paishu[n] - (c ? 0 : 1);
        r += left === 3 ? (s === 'z' ? 8 : 3) : left === 2 ? 3 : left === 1 ? 1 : 0;
        if (s === 'z') return r;
        r += n - 2 < 1 ? 0 : Math.min(paishu[n - 2], paishu[n - 1]) === 0 ? 0 : n - 2 === 1 ? 3 : 10;
        r += n - 1 < 1 ? 0 : n + 1 > 9 ? 0 : Math.min(paishu[n - 1], paishu[n + 1]) === 0 ? 0 : 3;
        r += n + 2 > 9 ? 0 : Math.min(paishu[n + 1], paishu[n + 2]) === 0 ? 0 : n + 2 === 9 ? 3 : 10;
        return r;
    }
}

function blankSeat() {
    return {
        holds: [],
        countMap: {},
        pengs: [],
        angangs: [],
        diangangs: [],
        wangangs: [],
        que: 0,
        tingMap: {},
        hued: true,
        actions: [],
        score: 0,
        fan: 0,
        pattern: '',
        isHaiDiHu: false,
        isTianHu: false,
        isDiHu: false,
        isGangHu: false,
        isQiangGangHu: false,
    };
}

function tilesOf(shoupai) {
    const holds = [];
    for (const s of ['p', 's', 'm']) {
        for (let n = 1; n <= 9; n += 1) {
            const id = codeToYoulin(`${s}${n}`);
            for (let i = 0; i < shoupai._bingpai[s][n]; i += 1) holds.push(id);
        }
    }
    return holds;
}

function countMapOf(holds) {
    const countMap = {};
    for (const id of holds) countMap[id] = (countMap[id] || 0) + 1;
    return countMap;
}

function meldId(text) {
    const suit = text[0];
    const digit = text.replace(/[^\d]/g, '').replace(/0/g, '5')[0];
    return codeToYoulin(`${suit}${digit}`);
}

function placeMelds(seat, shoupai) {
    for (const m of shoupai._fulou) {
        const id = meldId(m);
        if (/^[mpsz]\d{4}$/.test(m)) seat.angangs.push(id);
        else if (/^[mpsz]\d{4}[+=-]$/.test(m)) seat.diangangs.push(id);
        else if (/[+=-]/.test(m) && m.replace(/[^\d]/g, '').length >= 4) seat.wangangs.push(id);
        else seat.pengs.push(id);
    }
}

export function chengduSettle(internals, spec) {
    const conf = spec.conf || SCMJ_CONF;
    const seats = [blankSeat(), blankSeat(), blankSeat(), blankSeat()];
    const seat = seats[0];
    const win = spec.win;
    const holds = spec.holds.slice();
    const index = holds.indexOf(win);
    if (index >= 0) holds.splice(index, 1);
    seat.holds = holds;
    seat.countMap = countMapOf(holds);
    seat.que = spec.que;
    seat.pengs = spec.pengs.slice();
    seat.angangs = spec.angangs.slice();
    seat.diangangs = spec.diangangs.slice();
    seat.wangangs = spec.wangangs.slice();
    seat.hued = true;
    const game = { conf, gameSeats: seats };
    internals.checkCanTingPai(game, seat);
    const found = seat.tingMap[win] || seat.tingMap[String(win)];
    if (!found) return { fan: 0, score: 0 };
    seat.fan = found.fan;
    seat.pattern = found.pattern;
    seat.holds.push(win);
    seat.countMap[win] = (seat.countMap[win] || 0) + 1;
    seat.isHaiDiHu = Boolean(spec.haidi);
    seat.isTianHu = Boolean(spec.tianhu);
    seat.isDiHu = Boolean(spec.dihu);
    seat.isGangHu = Boolean(spec.ganghu);
    seat.isQiangGangHu = Boolean(spec.qianggang);
    const payers = [];
    for (let i = 1; i <= spec.payers; i += 1) payers.push(i);
    seat.actions = [{ type: spec.zimo ? 'zimo' : 'hu', iszimo: Boolean(spec.zimo), targets: payers }];
    internals.calculateResult(game, { seats: seats.map(() => ({ score: 0 })) });
    return { fan: seat.fan, score: seat.score };
}

function winScore(internals, conf, seat, pai, entry, zimo) {
    const seats = [blankSeat(), blankSeat(), blankSeat(), blankSeat()];
    const won = { ...seat, holds: seat.holds.concat(pai), countMap: { ...seat.countMap }, tingMap: seat.tingMap };
    won.countMap[pai] = (won.countMap[pai] || 0) + 1;
    won.fan = entry.fan;
    won.pattern = entry.pattern;
    won.actions = [{ type: zimo ? 'zimo' : 'hu', iszimo: zimo, targets: [1] }];
    won.score = 0;
    seats[0] = won;
    internals.calculateResult({ conf, gameSeats: seats }, { seats: seats.map(() => ({ score: 0 })) });
    return won.score;
}

// 13 张（含副露后的张数）的听牌表：每张和牌的番数与每家付的分（自摸含自摸加底），口径就是幼麟 checkCanTingPai + calculateResult。
export function tenpaiValues(internals, spec) {
    const conf = spec.conf || SCMJ_CONF;
    const seat = blankSeat();
    seat.holds = spec.holds.slice();
    seat.countMap = countMapOf(seat.holds);
    seat.que = spec.que;
    seat.pengs = spec.pengs.slice();
    seat.angangs = spec.angangs.slice();
    seat.diangangs = spec.diangangs.slice();
    seat.wangangs = spec.wangangs.slice();
    internals.checkCanTingPai({ conf, gameSeats: [seat] }, seat);
    const out = [];
    for (const key of Object.keys(seat.tingMap)) {
        const pai = Number(key);
        const entry = seat.tingMap[key];
        out.push({ pai, zimo: winScore(internals, conf, seat, pai, entry, true), ron: winScore(internals, conf, seat, pai, entry, false) });
    }
    out.sort((a, b) => a.pai - b.pai);
    return out;
}

export function handSpec(shoupai, rongpai, que) {
    const hand = shoupai.clone();
    let win = rongpai;
    if (win) hand.zimo(win);
    else win = hand._zimo;
    const holds = tilesOf(hand);
    const seat = blankSeat();
    placeMelds(seat, hand);
    const winId = codeToYoulin(String(win).replace('0', '5').slice(0, 2));
    return { holds, win: winId, que, pengs: seat.pengs, angangs: seat.angangs, diangangs: seat.diangangs, wangangs: seat.wangangs };
}

export function gangKind(m, zimo) {
    if (/^[mpsz]\d{4}$/.test(m)) return 'angang';
    if (/^[mpsz]\d{4}[+=-]$/.test(m)) return 'diangang';
    const tile = m[0] + String(m.match(/\d/g).pop()).replace('0', '5');
    const drawn = zimo ? zimo[0] + String(zimo[1] === '0' ? '5' : zimo[1]) : '';
    return drawn && tile === drawn ? 'wangang' : 'zhuanshougang';
}

// 倍数出自 gamemgr_xzdd.js doGang：暗杠 1772、点杠 1776、弯杠 1784，转手杠不计。
// 结算时这笔钱再乘一次底分。
export function gangMoney(kind, alive, baseScore = 1) {
    if (kind === 'angang') return 2 * baseScore * baseScore * alive;
    if (kind === 'diangang') return 2 * baseScore * baseScore;
    if (kind === 'wangang') return baseScore * baseScore * alive;
    return 0;
}

function holdsToString(holds) {
    const bins = { m: [], p: [], s: [] };
    for (const id of holds) {
        const code = youlinToCode(id);
        bins[code[0]].push(Number(code.slice(1)));
    }
    let text = '';
    for (const suit of ['m', 'p', 's']) {
        if (bins[suit].length) text += suit + bins[suit].sort((a, b) => a - b).join('');
    }
    return text;
}

function openingSuan(view, holds) {
    const suan = new ChengduSuanPai(view);
    const hands = ['', '', '', ''];
    hands[0] = holdsToString(holds);
    suan.qipai({ zhuangfeng: 0, shoupai: hands }, 0);
    return suan;
}

function clearEval(ai) {
    ai._eval_cache = {};
    ai._defen_cache = {};
}

function ensureTable(ai) {
    const saved = ai._callback;
    ai._callback = null;
    if (!ai._rule) {
        ai.kaiju({
            id: 0,
            qijia: 0,
            title: 'scmj',
            player: ['0', '1', '2', '3'],
            rule: { 赤牌: { m: 0, p: 0, s: 0, z: 0 }, 喰い替え許可レベル: 0 },
        });
    }
    if (!ai.shan) {
        ai.qipai({
            zhuangfeng: 0,
            jushu: 0,
            changbang: 0,
            lizhibang: 0,
            defen: [0, 0, 0, 0],
            baopai: 'z1',
            shoupai: ['_____________', '_____________', '_____________', '_____________'],
        });
    }
    if (ai.shan && ai.shan.paishu === 0) ai.shan.paishu = 55;
    ai._callback = saved;
}

function rankQue(ai, view, holds) {
    ensureTable(ai);
    const saved = view.que;
    const ranked = [];
    for (let que = 0; que < 3; que += 1) {
        view.que = que;
        clearEval(ai);
        const shoupai = Majiang.Shoupai.fromString(holdsToString(holds));
        const ev = ai.eval_shoupai(shoupai, openingSuan(view, holds).get_paishu());
        const count = holds.filter((id) => youlinSuit(id) === queToSuit(que)).length;
        ranked.push({ que, ev, xt: chengduXiangtingShoupai(shoupai, que), count });
    }
    view.que = saved;
    clearEval(ai);
    ranked.sort(byXiangtingThenEv);
    return ranked;
}

// 引擎出牌时只在向听不升的牌之间比期望值；三向听以上的期望值是进张数，缺门牌越多空位越多，不能跨向听比。
function byXiangtingThenEv(a, b) {
    return a.xt - b.xt || b.ev - a.ev || a.count - b.count || a.que - b.que;
}

function lowestPriced(ids, price) {
    return ids.slice().sort((a, b) => price(a) - price(b) || a - b).slice(0, 3);
}

export function chengduRules(state = {}) {
    const view = {
        que: null,
        ques: [null, null, null, null],
        hued: [false, false, false, false],
        concealed: [0, 0, 0, 0],
        alive: 3,
        ...state,
    };
    if (view.threat === undefined && DEFAULT_THREAT) view.threat = (bin) => DEFAULT_THREAT[bin] || 0;
    const K = view.K || CHENGDU_K;
    return {
        yaku: false,
        allowHule: false,
        allowChi: false,
        allowLizhi: false,
        allowPingju: false,
        allowNoDaopai: false,
        state: view,
        K,
        xiangting(shoupai) { return chengduXiangtingShoupai(shoupai, view.que); },
        tingpai(shoupai) {
            const que = queToSuit(view.que);
            const list = Majiang.Util.tingpai(shoupai, (hand) => chengduXiangtingShoupai(hand, view.que)) || [];
            return list.filter((p) => p[0] !== 'z' && p[0] !== que && p[1] !== '0');
        },
        expand(list) { return list || []; },
        waitWeight(p) { return p[2] === '+' ? 1 + view.alive : 1; },
        mixFulou(peng) { return peng * view.alive; },
        cacheExtra() { return `:${view.alive}:${view.que}`; },
        chooseQue(ai, holds) { return rankQue(ai, view, holds)[0].que; },
        chooseHuan(ai, holds) {
            ensureTable(ai);
            const saved = view.que;
            const groups = [[], [], []];
            for (const id of holds) groups[id < 9 ? 0 : id < 18 ? 1 : 2].push(id);
            const ranked = [];
            for (let que = 0; que < 3; que += 1) {
                if (groups[que].length < 3) continue;
                view.que = null;
                const price = openingSuan(view, holds).make_paijia(Majiang.Shoupai.fromString(holdsToString(holds)));
                const give = lowestPriced(groups[que], (id) => price(youlinToCode(id)));
                const rest = holds.slice();
                for (const id of give) rest.splice(rest.indexOf(id), 1);
                view.que = que;
                clearEval(ai);
                const shoupai = Majiang.Shoupai.fromString(holdsToString(rest));
                const ev = ai.eval_shoupai(shoupai, openingSuan(view, rest).get_paishu());
                ranked.push({ que, give, ev, xt: chengduXiangtingShoupai(shoupai, que), count: groups[que].length });
            }
            view.que = saved;
            clearEval(ai);
            ranked.sort(byXiangtingThenEv);
            return ranked[0].give;
        },
        threatOf(player, l) {
            if (!player._model || l === player._menfeng || view.hued[l] || !view.threat) return 0;
            return view.threat(seatThreatIndex(player, l, view));
        },
        defen(_player, shoupai, rongpai) {
            if (!view.internals) return 0;
            const spec = handSpec(shoupai, rongpai, view.que);
            const tsumo = chengduSettle(view.internals, { ...spec, zimo: true, payers: view.alive }).score;
            const ron = chengduSettle(view.internals, { ...spec, zimo: false, payers: 1 }).score;
            return (tsumo + view.alive * ron) / (1 + view.alive) * K;
        },
        installSuanpai(player, qipai) {
            const suan = new ChengduSuanPai(view);
            const menfeng = (player._id + 4 - player._model.qijia + 4 - qipai.jushu) % 4;
            suan.qipai(qipai, menfeng);
            player._suanpai = suan;
        },
        filterDapai(player, list) {
            const suit = queToSuit(view.que);
            if (!suit) return list;
            const limited = list.filter((p) => p[0] === suit);
            return limited.length ? limited : list;
        },
        dealerWeight() { return 1; },
        ignoreSeat(_player, l) { return Boolean(view.hued[l]); },
        gangFee(player, m) {
            return gangMoney(gangKind(m, player.shoupai && player.shoupai._zimo), view.alive, SCMJ_CONF.baseScore) * K;
        },
        listWaits(player, shoupai) {
            const base = player.rules.xiangting(shoupai);
            const pai = [];
            for (const p of player.rules.tingpai(shoupai)) {
                if (base > 0) {
                    let called = false;
                    for (const m of player.get_peng_mianzi(shoupai, `${p}+`) || []) {
                        if (player.rules.xiangting(shoupai.clone().fulou(m)) < base) {
                            called = true;
                            break;
                        }
                    }
                    if (called) {
                        pai.push(`${p}+`);
                        continue;
                    }
                }
                pai.push(p);
            }
            return pai;
        },
    };
}
