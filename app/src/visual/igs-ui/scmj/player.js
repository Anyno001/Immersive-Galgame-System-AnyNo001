// 成都电脑座位：只读自己收到的幼麟消息（自己的手牌 + 全桌公开信息），决定交给 planner。
// 性格层沿用立直的打法参数：push 管防守权重，call 管碰杠，speed 管求快还是做大，skill 管失误，tilt 经情绪改 push。
import { calmMind, createMind, decisionKnobs, feelResult, normalizePersona } from '../wait-stage-mahjong-mind.js';
import { mulberry32 } from './host.js';
import { createPlanner, waitWeight } from './planner.js';
import { threatIndex } from './rules.js';
import threatJson from './threat-table.json' with { type: 'json' };
import readJson from './read-table.json' with { type: 'json' };
import { createReader } from './reading.js';
import { countsOf, fastXiangting } from './shanten.js';

const THREAT = Array.isArray(threatJson.p) && threatJson.p.length === 125 ? threatJson.p : null;
const READER = createReader(readJson);
const PLAIN = Object.freeze({ push: 0, call: 0.5, speed: 0, skill: 1 });
const SITUATION = Object.freeze({ push: 0, speed: 0, call: 0, dama: 0 });
const SUIT = (id) => Math.floor(id / 9);

function blankTable() {
    return {
        button: 0,
        ques: [-1, -1, -1, -1],
        hued: [false, false, false, false],
        discards: [[], [], [], []],
        melds: [[], [], [], []],
        fresh: [new Set(), new Set(), new Set(), new Set()],
        seen: new Array(27).fill(0),
        wall: 55,
        drew: false,
        turn: -1,
        discarder: -1,
    };
}

function ownMelds(view) {
    return [
        ...view.pengs.map((tile) => ({ kind: 'peng', tile })),
        ...view.angangs.map((tile) => ({ kind: 'angang', tile })),
        ...view.diangangs.map((tile) => ({ kind: 'diangang', tile })),
        ...view.wangangs.map((tile) => ({ kind: 'wangang', tile })),
    ];
}

export function createScmjPlayer(index, userId, internals, options = {}) {
    const userIds = options.userIds || [1001, 1002, 1003, 1004];
    const plain = options.plain !== false;
    const persona = normalizePersona(options.persona || { style: 'steady' }, options.persona && options.persona.name);
    const random = options.random || mulberry32((options.seed ?? index + 1) >>> 0);
    const planner = options.planner || createPlanner({ internals, options: options.plan });
    const threat = options.threat === null ? null : (options.threat || THREAT);
    const reader = options.reader || READER;
    const mind = createMind();
    let table = blankTable();
    let intent = '';

    const seatOf = (uid) => userIds.indexOf(uid);

    function knobs() {
        if (plain) return PLAIN;
        return decisionKnobs(persona.params, SITUATION, mind);
    }

    function feed(msg) {
        const data = msg.data;
        switch (msg.event) {
        case 'game_begin_push':
            table = blankTable();
            table.button = Number(data) || 0;
            calmMind(mind);
            break;
        case 'game_dingque_finish_push':
            if (Array.isArray(data)) table.ques = data.slice();
            break;
        case 'mj_count_push':
            table.wall = Number(data) || 0;
            table.drew = true;
            break;
        case 'game_chupai_push': {
            const who = seatOf(data);
            if (who >= 0 && table.drew) table.fresh[who] = new Set();
            table.drew = false;
            table.turn = who;
            break;
        }
        case 'game_chupai_notify_push': {
            const who = seatOf(data.userId);
            table.seen[data.pai] += 1;
            if (who >= 0) {
                table.discards[who].push(data.pai);
                table.fresh[who].add(data.pai);
            }
            table.discarder = who;
            break;
        }
        case 'peng_notify_push': {
            const who = seatOf(data.userid);
            table.seen[data.pai] += 2;
            if (who >= 0) table.melds[who].push({ kind: 'peng', tile: data.pai });
            break;
        }
        case 'gang_notify_push': {
            const who = seatOf(data.userid);
            const kind = data.gangtype;
            table.seen[data.pai] += kind === 'angang' ? 4 : kind === 'diangang' ? 3 : 1;
            if (who >= 0) {
                if (kind === 'wangang') {
                    const at = table.melds[who].findIndex((m) => m.kind === 'peng' && m.tile === data.pai);
                    if (at >= 0) table.melds[who].splice(at, 1);
                }
                table.melds[who].push({ kind, tile: data.pai });
            }
            break;
        }
        case 'hu_push': {
            const who = data.seatindex;
            if (who >= 0 && who < 4) table.hued[who] = true;
            if (data.iszimo && data.hupai >= 0) table.seen[data.hupai] += 1;
            if (!plain) {
                const kind = who === index ? 'win' : (!data.iszimo && table.discarder === index ? 'dealIn' : (data.iszimo && !table.hued[index] ? 'tsumoed' : 'other'));
                feelResult(mind, persona.params, { kind, points: 4000 });
            }
            break;
        }
        default:
            break;
        }
    }

    function threatOf(o) {
        if (!threat || table.hued[o] || o === index) return 0;
        const river = table.discards[o];
        const que = table.ques[o];
        let gap = null;
        if (que >= 0) {
            for (let i = river.length - 1; i >= 0; i -= 1) {
                if (SUIT(river[i]) === que) {
                    gap = river.length - 1 - i;
                    break;
                }
            }
        }
        return threat[threatIndex(river.length, table.melds[o].length, gap)] || 0;
    }

    function unseenOf(hand) {
        const unseen = new Array(27);
        for (let id = 0; id < 27; id += 1) unseen[id] = Math.max(0, 4 - table.seen[id] - hand[id]);
        return unseen;
    }

    // 每张牌的放炮期望损失（底分）。缺门那门、已胡的人、对手摸牌前刚打过的牌对该对手为 0。
    function riskTable(hand, unseen) {
        const risk = new Array(27).fill(0);
        if (options.defend === false) return risk;
        if (reader.ready) {
            for (let o = 0; o < 4; o += 1) {
                if (o === index || table.hued[o]) continue;
                const t = reader.tenpai(table, o);
                const loss = reader.loss(table, o);
                if (t <= 0 || loss <= 0) continue;
                for (let id = 0; id < 27; id += 1) {
                    risk[id] += t * reader.wait(table, o, id, unseen, hand[id]) * loss;
                }
            }
            return risk;
        }
        for (let o = 0; o < 4; o += 1) {
            if (o === index || table.hued[o]) continue;
            const t = threatOf(o);
            if (t <= 0) continue;
            const w = new Array(27).fill(0);
            let sum = 0;
            for (let id = 0; id < 27; id += 1) {
                if (SUIT(id) === table.ques[o] || table.fresh[o].has(id)) continue;
                w[id] = waitWeight(unseen, id, hand[id]);
                sum += w[id];
            }
            if (!sum) continue;
            const loss = planner.opt.dealInLoss * (oneSuitMelds(o) ? 3 : 1);
            for (let id = 0; id < 27; id += 1) risk[id] += t * Math.min(1, w[id] / sum * planner.opt.waitKinds) * loss;
        }
        return risk;
    }

    function oneSuitMelds(o) {
        const melds = table.melds[o];
        return melds.length >= 2 && new Set(melds.map((m) => SUIT(m.tile))).size === 1;
    }

    function alive() {
        let n = 0;
        for (let o = 0; o < 4; o += 1) if (o !== index && !table.hued[o]) n += 1;
        return n;
    }

    function baseCtx(view, hand, que = view.que) {
        const a = Math.max(1, alive());
        const k = knobs();
        const shrink = 1 - 0.5 * k.speed;
        const leaf = k.speed ? (v) => (v > 0 ? 3 * (v / 3) ** shrink : v) : null;
        return planner.makeCtx({
            que,
            unseen: unseenOf(hand),
            alive: a,
            turns: Math.floor(table.wall / (a + 1)),
            leaf,
        });
    }

    function pickBest(items, k) {
        items.sort(planner.compare);
        const best = items[0];
        const sloppy = 1 - k.skill;
        if (sloppy > 0.02 && best.ev != null && random() < sloppy * 0.8) {
            const span = Math.abs(best.score) * sloppy * 0.45 + 0.05;
            const near = items.filter((item) => item.ev != null && item.score >= best.score - span);
            return near[Math.floor(random() * near.length) % near.length];
        }
        return best;
    }

    function finish(items, k, risk) {
        const lambda = planner.opt.lambda * 2 ** (-k.push * 1.5);
        for (const item of items) {
            const r = item.d != null && risk ? risk[item.d] : 0;
            item.risk = r;
            item.score = item.ev != null ? item.ev + (item.bonus || 0) - lambda * r : null;
        }
        // 高向听时按进张排，再按危险度挑。
        for (const item of items) if (item.ev == null) item.useful -= lambda * item.risk * 4;
        return pickBest(items, k);
    }

    function decideDiscard(view) {
        const hand = countsOf(view.holds);
        const melds = ownMelds(view);
        const ctx = baseCtx(view, hand);
        const risk = riskTable(hand, ctx.unseen);
        const legal = [...new Set(view.legal || view.holds)].sort((a, b) => a - b);
        const items = legal.map((d) => {
            const next = hand.slice();
            next[d] -= 1;
            return { hand: next, melds, d, tie: d };
        });
        const gangs = selfGangs(view, hand, melds, ctx);
        const scored = planner.scoreHands(ctx, items.concat(gangs), ctx.turns + (gangs.length ? 1 : 0));
        const k = knobs();
        const best = finish(scored, k, risk);
        const top = scored.filter((item) => item.ev != null).sort((a, b) => b.ev - a.ev)[0];
        intent = '';
        if (top && best !== top && best.risk < top.risk && top.ev - best.ev > 0.3) intent = 'fold';
        else if (best.risk > 0.6) intent = 'push';
        if (best.gang != null) return { gang: true, pai: best.gang };
        return { dapai: best.d };
    }

    // 自己回合能杠的：暗杠、弯杠。杠后要先补一张，所以用多一巡的期望，再加杠钱。
    function selfGangs(view, hand, melds, ctx) {
        const list = [];
        if (!view.action || !view.action.gang) return list;
        const a = ctx.alive;
        for (const pai of view.action.gangpai || []) {
            const next = hand.slice();
            let kind;
            let after;
            if (next[pai] >= 4) {
                next[pai] -= 4;
                kind = 'angang';
                after = melds.concat({ kind, tile: pai });
            } else {
                next[pai] -= 1;
                kind = 'wangang';
                after = melds.filter((m) => !(m.kind === 'peng' && m.tile === pai)).concat({ kind, tile: pai });
            }
            list.push({ hand: next, melds: after, gang: pai, tie: 100 + pai, turnsFor: ctx.turns + 1, bonus: planner.gangMoney(kind, a) * planner.opt.voidRisk });
        }
        return list;
    }

    function decideClaim(view) {
        const action = view.action;
        const pai = action.pai;
        const hand = countsOf(view.holds);
        const melds = ownMelds(view);
        const ctx = baseCtx(view, hand);
        const risk = riskTable(hand, ctx.unseen);
        const k = knobs();
        const callBonus = (k.call - 0.5) * 0.6;
        const items = [{ hand: hand.slice(), melds, pass: true, tie: -1 }];
        if (action.peng && hand[pai] >= 2) {
            const after = hand.slice();
            after[pai] -= 2;
            const pengMelds = melds.concat({ kind: 'peng', tile: pai });
            const que = view.que;
            const junk = [];
            for (let id = 0; id < 27; id += 1) if (after[id] && SUIT(id) === que) junk.push(id);
            const pool = junk.length ? junk : [...new Set(countsListOf(after))];
            for (const d of pool) {
                const next = after.slice();
                next[d] -= 1;
                items.push({ hand: next, melds: pengMelds, d, peng: true, tie: d, bonus: callBonus });
            }
        }
        if (action.gang && hand[pai] >= 3) {
            const next = hand.slice();
            next[pai] -= 3;
            items.push({ hand: next, melds: melds.concat({ kind: 'diangang', tile: pai }), gang: pai, tie: 200, turnsFor: ctx.turns + 1, bonus: planner.gangMoney('diangang', ctx.alive) * planner.opt.voidRisk + callBonus });
        }
        if (items.length === 1) return { guo: true };
        const scored = planner.scoreHands(ctx, items, ctx.turns + (action.gang ? 1 : 0));
        if (scored.every((item) => item.ev == null)) {
            // 高向听：能让向听下降才碰，同引擎和贪心的做法。
            const passS = scored[0].s;
            const pengs = scored.filter((item) => item.peng && item.s < passS);
            intent = pengs.length ? 'call' : '';
            return pengs.length ? { peng: true } : { guo: true };
        }
        const best = finish(scored, k, risk);
        intent = best.pass ? '' : 'call';
        if (best.gang != null) return { gang: true, pai: best.gang };
        if (best.peng) return { peng: true };
        return { guo: true };
    }

    function countsListOf(hand) {
        const list = [];
        for (let id = 0; id < 27; id += 1) if (hand[id]) list.push(id);
        return list;
    }

    // 定缺：三门各当一次缺门，比向听、期望、进张。
    function rankQue(holds) {
        const hand = countsOf(holds);
        const ranked = [];
        for (let que = 0; que < 3; que += 1) {
            const ctx = planner.makeCtx({ que, unseen: unseenOf(hand), alive: 3, turns: 13 });
            const items = [];
            if (holds.length % 3 === 2) {
                const junk = countsListOf(hand).filter((id) => SUIT(id) === que);
                for (const d of junk.length ? junk : countsListOf(hand)) {
                    const next = hand.slice();
                    next[d] -= 1;
                    items.push({ hand: next, melds: [], tie: d });
                }
            } else {
                items.push({ hand: hand.slice(), melds: [], tie: 0 });
            }
            const scored = planner.scoreHands(ctx, items);
            for (const item of scored) item.score = item.ev;
            scored.sort(planner.compare);
            const count = holds.filter((id) => SUIT(id) === que).length;
            ranked.push({ que, s: scored[0].s, ev: scored[0].ev, useful: scored[0].useful, count });
        }
        ranked.sort((a, b) => a.s - b.s
            || (a.ev != null && b.ev != null ? b.ev - a.ev : 0)
            || b.useful - a.useful || a.count - b.count || a.que - b.que);
        return ranked;
    }

    // 换三张：每门挑最不影响牌形的三张交出去，再按交完后的定缺排序选门。
    function chooseHuan(holds) {
        const options = [];
        for (let suit = 0; suit < 3; suit += 1) {
            const ids = holds.filter((id) => SUIT(id) === suit).sort((a, b) => a - b);
            if (ids.length < 3) continue;
            let give = null;
            let keep = null;
            for (let i = 0; i < ids.length; i += 1) {
                for (let j = i + 1; j < ids.length; j += 1) {
                    for (let l = j + 1; l < ids.length; l += 1) {
                        const trio = [ids[i], ids[j], ids[l]];
                        const key = trio.join(',');
                        if (give && give.key === key) continue;
                        const rest = holds.slice();
                        for (const id of trio) rest.splice(rest.indexOf(id), 1);
                        const hand = countsOf(rest);
                        const s = fastXiangting(hand, -1, 0);
                        const score = -s * 100 + usefulCount(hand);
                        if (!give || score > keep) {
                            give = { key, trio };
                            keep = score;
                        }
                    }
                }
            }
            const rest = holds.slice();
            for (const id of give.trio) rest.splice(rest.indexOf(id), 1);
            const best = rankQue(rest)[0];
            options.push({ suit, give: give.trio, ...best });
        }
        options.sort((a, b) => a.s - b.s
            || (a.ev != null && b.ev != null ? b.ev - a.ev : 0)
            || b.useful - a.useful || a.suit - b.suit);
        return options[0].give;
    }

    function usefulCount(hand) {
        const s = fastXiangting(hand, -1, 0);
        let n = 0;
        for (let k = 0; k < 27; k += 1) {
            if (hand[k] >= 4) continue;
            hand[k] += 1;
            if (fastXiangting(hand, -1, 0) < s) n += 4 - hand[k] + 1;
            hand[k] -= 1;
        }
        return n;
    }

    function decide(view) {
        intent = '';
        if (view.pending === 'huan') return { huan: chooseHuan(view.holds) };
        if (view.pending === 'dingque') return { que: rankQue(view.holds)[0].que };
        if (view.action && view.action.hu) {
            intent = 'win';
            return { hu: true };
        }
        if (view.pending === 'action' && view.holds.length % 3 === 1) return decideClaim(view);
        if (view.pending === 'action') {
            const choice = decideDiscard({ ...view, legal: legalOf(view) });
            if (choice.gang) return choice;
            return { guo: true };
        }
        return decideDiscard(view);
    }

    function legalOf(view) {
        const junk = view.holds.filter((id) => SUIT(id) === view.que);
        return junk.length ? junk : view.holds.slice();
    }

    return {
        index,
        userId,
        persona,
        mind,
        feed,
        decide,
        takeIntent() { const out = intent; intent = ''; return out; },
        get table() { return table; },
    };
}
