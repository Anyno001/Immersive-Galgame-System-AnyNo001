// 成都血战的电脑决策：按剩余巡数逐巡算期望得分（自摸、点炮、碰都算进每巡的机会），
// 胡牌价值用幼麟自己的 checkCanTingPai + calculateResult，防守按放炮的期望损失扣分。所有决定都在同一把尺子（底分）上比。
import { SCMJ_CONF } from './host.js';
import { gangMoney, tenpaiValues } from './rules.js';
import { fastXiangting } from './shanten.js';

export const PLAN_DEFAULTS = Object.freeze({
    depth: 3,          // 向听不超过这么多才做逐巡展开，再高用进张数排序
    budget: 6000,      // 一次决定最多展开的局面数，超了就把展开深度降一档（按局面数，不按时间，结果才确定）
    rho: 0.6,          // 对手每打一张牌恰好是某种牌的概率 = 该牌未见张数 / 未见总数 × rho
    tenpaiEnd: 0.3,    // 荒牌时听牌：每个还在打的对手按这个概率没听，赔我最大番
    notenEnd: 1.2,     // 荒牌时没听：每个还在打的对手平均要我赔这么多
    waitKinds: 2.2,    // 对手听牌时平均听几种牌，把危险度权重换成"这张是他和的牌"的概率
    dealInLoss: 2.6,   // 放炮平均赔多少底分（按 E1 实测胡牌平均番数估）
    voidRisk: 0.85,    // 杠钱最终能拿到的比例（荒牌没听要退）
    lambda: 0.3,       // 防守权重
    gamma: 0.72,       // 每过一巡后面的胡牌还值多少：对手陆续胡走，付钱的人变少，三家都胡了这局就结束
});

const SUIT = (id) => Math.floor(id / 9);

function meldKey(melds) {
    return melds.map((m) => `${m.kind[0]}${m.tile}`).sort().join(',');
}

function meldSpec(melds) {
    const spec = { pengs: [], angangs: [], diangangs: [], wangangs: [] };
    for (const m of melds) spec[`${m.kind}s`].push(m.tile);
    return spec;
}

function holdsFrom(hand) {
    const holds = [];
    for (let id = 0; id < 27; id += 1) for (let i = 0; i < hand[id]; i += 1) holds.push(id);
    return holds;
}

// 对手的危险度权重：形状部分同 ChengduSuanPai.suan_weixian（未见张数越多、越能组成两面越危险）。
export function waitWeight(unseen, id, holdCount) {
    const base = SUIT(id) * 9;
    const n = id - base + 1;
    const at = (k) => (k >= 1 && k <= 9 ? unseen[base + k - 1] : 0);
    const left = unseen[id] - (holdCount ? 0 : 1);
    let r = left >= 3 ? 3 : left === 2 ? 3 : left === 1 ? 1 : 0;
    r += n - 2 < 1 ? 0 : Math.min(at(n - 2), at(n - 1)) === 0 ? 0 : n - 2 === 1 ? 3 : 10;
    r += n - 1 < 1 || n + 1 > 9 ? 0 : Math.min(at(n - 1), at(n + 1)) === 0 ? 0 : 3;
    r += n + 2 > 9 ? 0 : Math.min(at(n + 1), at(n + 2)) === 0 ? 0 : n + 2 === 9 ? 3 : 10;
    return r;
}

export function createPlanner({ internals, conf = SCMJ_CONF, options = {} }) {
    const opt = { ...PLAN_DEFAULTS, ...options };
    const tenpaiCache = new Map();

    function tenpaiOf(hand, que, melds) {
        const key = `${hand.join('')}|${que}|${meldKey(melds)}`;
        let hit = tenpaiCache.get(key);
        if (!hit) {
            hit = tenpaiValues(internals, { conf, holds: holdsFrom(hand), que, ...meldSpec(melds) });
            if (tenpaiCache.size > 200000) tenpaiCache.clear();
            tenpaiCache.set(key, hit);
        }
        return hit;
    }

    // ctx：一次决定的牌面。unseen 是自己看不见的每种牌张数，alive 是还在打的对手数，turns 是自己还能摸几次。
    function makeCtx(base) {
        const unseen = base.unseen;
        let total = 0;
        for (let id = 0; id < 27; id += 1) total += unseen[id];
        const pDraw = new Array(27).fill(0);
        const pDiscard = new Array(27).fill(0);
        for (let id = 0; id < 27; id += 1) {
            if (!total) break;
            pDraw[id] = unseen[id] / total;
            pDiscard[id] = Math.min(0.9, base.alive * opt.rho * unseen[id] / total);
        }
        return {
            ...base,
            base: Math.max(0, base.turns),
            turns: Math.max(0, base.turns),
            pDraw,
            pDiscard,
            memo: new Map(),
            nodes: 0,
            depth: opt.depth,
            leaf: base.leaf || ((v) => v),
        };
    }

    function junkOf(hand, que) {
        if (que < 0) return -1;
        for (let id = que * 9; id < que * 9 + 9; id += 1) if (hand[id]) return id;
        return -1;
    }

    function tenpaiVector(ctx, hand, melds, waits) {
        const N = ctx.turns;
        const vec = new Float64Array(N + 1);
        let win = 0;
        let value = 0;
        let maxRon = 0;
        for (const w of waits) {
            const pz = ctx.pDraw[w.pai];
            const pr = ctx.pDiscard[w.pai];
            if (!pz && !pr) continue;
            win += pz + pr;
            value += pz * ctx.leaf(w.zimo * ctx.alive) + pr * ctx.leaf(w.ron);
            if (w.ron > maxRon) maxRon = w.ron;
        }
        if (win > 0.95) {
            value *= 0.95 / win;
            win = 0.95;
        }
        vec[0] = opt.tenpaiEnd * ctx.alive * maxRon;
        for (let t = 1; t <= N; t += 1) vec[t] = value + opt.gamma * (1 - win) * vec[t - 1];
        return vec;
    }

    // 13 张态（打完牌、等摸牌）的逐巡期望。返回长度 turns+1 的向量，下标是还剩几次摸牌。
    function evalNode(ctx, hand, melds, xt) {
        const key = `${hand.join('')}|${meldKey(melds)}`;
        const hit = ctx.memo.get(key);
        if (hit) return hit;
        ctx.nodes += 1;
        const que = ctx.que;
        const nF = melds.length;
        const s = xt ?? fastXiangting(hand, que, nF);
        const N = ctx.turns;
        let vec;
        if (s === 0) {
            const waits = junkOf(hand, que) >= 0 ? [] : tenpaiOf(hand, que, melds);
            vec = waits.length ? tenpaiVector(ctx, hand, melds, waits) : null;
        }
        if (!vec) {
            const draws = [];
            const pengs = [];
            if (s <= ctx.depth && ctx.nodes < opt.budget) {
                const junk = junkOf(hand, que);
                for (let k = 0; k < 27; k += 1) {
                    if (!ctx.pDraw[k] || SUIT(k) === que || hand[k] >= 4) continue;
                    hand[k] += 1;
                    const child = bestChild(ctx, hand, melds, s, junk);
                    hand[k] -= 1;
                    if (child) draws.push({ p: ctx.pDraw[k], vec: child });
                }
                for (let k = 0; k < 27; k += 1) {
                    if (hand[k] < 2 || !ctx.pDiscard[k] || SUIT(k) === que) continue;
                    hand[k] -= 2;
                    const next = melds.concat({ kind: 'peng', tile: k });
                    const child = bestChild(ctx, hand, next, s, junkOf(hand, que));
                    hand[k] += 2;
                    if (child) pengs.push({ g: ctx.pDiscard[k], vec: child });
                }
            }
            vec = new Float64Array(N + 1);
            vec[0] = -opt.notenEnd * ctx.alive;
            if (!draws.length && !pengs.length) {
                for (let t = 1; t <= N; t += 1) vec[t] = opt.gamma * vec[t - 1];
            } else {
                for (let t = 1; t <= N; t += 1) {
                    const stay = vec[t - 1];
                    let acc = 0;
                    let mass = 0;
                    for (const d of draws) {
                        acc += d.p * Math.max(d.vec[t - 1], stay);
                        mass += d.p;
                    }
                    acc += (1 - mass) * stay;
                    for (const g of pengs) acc += g.g * Math.max(0, g.vec[t - 1] - stay);
                    vec[t] = opt.gamma * acc;
                }
            }
        }
        ctx.memo.set(key, vec);
        return vec;
    }

    // 14 张态：缺门没打完只能打缺门；否则在不退向听的打法里逐巡取最大。向听没下降的摸牌当作摸切，不进这里。
    function bestChild(ctx, hand, melds, s, junk) {
        const que = ctx.que;
        const nF = melds.length;
        const x14 = fastXiangting(hand, que, nF);
        if (x14 >= s) return null;
        if (junk >= 0) {
            hand[junk] -= 1;
            const vec = evalNode(ctx, hand, melds, x14).slice();
            hand[junk] += 1;
            return vec;
        }
        let best = null;
        for (let d = 0; d < 27; d += 1) {
            if (!hand[d]) continue;
            hand[d] -= 1;
            const x = fastXiangting(hand, que, nF);
            if (x === x14) {
                const vec = evalNode(ctx, hand, melds, x);
                if (!best) best = vec.slice();
                else for (let t = 0; t < best.length; t += 1) if (vec[t] > best[t]) best[t] = vec[t];
            }
            hand[d] += 1;
        }
        return best;
    }

    // 高向听时的排序分：向听越低越好，同向听比有效牌张数（碰得到的对子多算一点）。单位不是底分，只在同一批候选里比。
    function roughScore(ctx, hand, melds) {
        const que = ctx.que;
        const s = fastXiangting(hand, que, melds.length);
        let useful = 0;
        for (let k = 0; k < 27; k += 1) {
            if (!ctx.unseen[k] || SUIT(k) === que || hand[k] >= 4) continue;
            hand[k] += 1;
            const x = fastXiangting(hand, que, melds.length);
            hand[k] -= 1;
            if (x < s) useful += ctx.unseen[k] * (hand[k] === 2 ? 1 + ctx.alive * opt.rho : 1);
        }
        return { s, useful };
    }

    // 对一批 13 张态打分。返回 [{ ev, s, useful }]，ev 只有在逐巡展开过时才有。
    // item.turnsFor 是这一项还能摸几次（杠后补牌多一次），horizon 取其中最大的。
    function scoreHands(ctx, list, horizon = ctx.base) {
        const scored = list.map((item) => ({ ...item, ...roughScore(ctx, item.hand, item.melds) }));
        const minS = Math.min(...scored.map((item) => item.s));
        let depth = opt.depth;
        while (depth >= 0) {
            ctx.memo = new Map();
            ctx.nodes = 0;
            ctx.depth = depth;
            ctx.turns = horizon;
            if (minS > depth) break;
            let over = false;
            for (const item of scored) {
                if (item.s > depth) { item.ev = null; continue; }
                item.ev = evalNode(ctx, item.hand.slice(), item.melds, item.s)[item.turnsFor ?? ctx.base];
                if (ctx.nodes >= opt.budget) { over = true; break; }
            }
            if (!over) return scored;
            depth -= 1;
        }
        for (const item of scored) item.ev = null;
        return scored;
    }

    function compare(a, b) {
        const ae = a.ev != null;
        const be = b.ev != null;
        if (ae && be) return b.score - a.score || a.tie - b.tie;
        if (ae !== be) return ae ? -1 : 1;
        return a.s - b.s || b.useful - a.useful || a.tie - b.tie;
    }

    return { opt, makeCtx, evalNode, scoreHands, compare, tenpaiOf, roughScore, gangMoney: (kind, alive) => gangMoney(kind, alive, conf.baseScore) };
}
