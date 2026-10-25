// 验收用的参照电脑。不进对局界面。贪心基线自己出牌；原样搬过去的电脑只借座位适配器做合法化。
import SuanPai from '@kobalab/majiang-ai/lib/suanpai.js';
import { createScmjAi } from '../src/visual/igs-ui/scmj/ai-seat.js';
import { createScmjPlayer } from '../src/visual/igs-ui/scmj/player.js';
import { createReader } from '../src/visual/igs-ui/scmj/reading.js';
import readJson from '../src/visual/igs-ui/scmj/read-table.json' with { type: 'json' };
import { chengduXiangting, queToSuit, youlinSuit } from '../src/visual/igs-ui/scmj/profile.js';
import { chengduRules, chengduSettle, handSpec, riichiRules } from '../src/visual/igs-ui/scmj/rules.js';

function count(list, id) {
    let n = 0;
    for (const item of list) if (item === id) n += 1;
    return n;
}

function meldCount(view) {
    return view.pengs.length + view.angangs.length + view.diangangs.length + view.wangangs.length;
}

function visible(view, id) {
    let n = count(view.holds, id) + count(view.rivers, id);
    for (const pai of view.openPengs) if (pai === id) n += 3;
    for (const pai of view.openGangs) if (pai === id) n += 4;
    for (const pai of view.angangs) if (pai === id) n += 4;
    return n;
}

function removeN(holds, id, n) {
    const next = holds.slice();
    for (let i = 0; i < n; i += 1) next.splice(next.indexOf(id), 1);
    return next;
}

function legalPool(holds, que) {
    const suit = ['p', 's', 'm'][que];
    const limited = suit ? holds.filter((id) => youlinSuit(id) === suit) : [];
    return limited.length ? limited : holds;
}

function ukeire(holds, que, melds, seen) {
    const base = chengduXiangting(holds, que, melds);
    if (base < 0) return 0;
    let total = 0;
    for (let id = 0; id < 27; id += 1) {
        if (youlinSuit(id) === ['p', 's', 'm'][que]) continue;
        const next = holds.concat(id);
        if (chengduXiangting(next, que, melds) < base) total += Math.max(0, 4 - (seen(id) || 0));
    }
    return total;
}

export function greedyDecide(view) {
    if (view.pending === 'huan') {
        const groups = [[], [], []];
        for (const id of view.holds) groups[youlinSuit(id) === 'p' ? 0 : youlinSuit(id) === 's' ? 1 : 2].push(id);
        const options = groups.map((ids, que) => ({ que, ids: ids.slice().sort((a, b) => a - b), n: ids.length }))
            .filter((item) => item.n >= 3);
        options.sort((a, b) => a.n - b.n || a.que - b.que);
        return { huan: options[0].ids.slice(0, 3) };
    }
    if (view.pending === 'dingque') {
        const n = [0, 0, 0];
        for (const id of view.holds) n[youlinSuit(id) === 'p' ? 0 : youlinSuit(id) === 's' ? 1 : 2] += 1;
        let que = 0;
        for (let i = 1; i < 3; i += 1) if (n[i] < n[que]) que = i;
        return { que };
    }
    if (view.pending === 'action') {
        const action = view.action;
        if (action.hu) return { hu: true };
        if (action.gang) return { gang: true, pai: Math.min(...action.gangpai) };
        if (action.peng) {
            const after = removeN(view.holds, action.pai, 2);
            const melds = meldCount(view) + 1;
            let best = Infinity;
            for (const id of [...new Set(legalPool(after, view.que))]) {
                best = Math.min(best, chengduXiangting(removeN(after, id, 1), view.que, melds));
            }
            if (best < chengduXiangting(view.holds, view.que, meldCount(view))) return { peng: true };
        }
        return { guo: true };
    }
    const pool = legalPool(view.holds, view.que);
    if (pool !== view.holds && ['p', 's', 'm'][view.que]) {
        const queIds = view.holds.filter((id) => youlinSuit(id) === ['p', 's', 'm'][view.que]);
        if (queIds.length) return { dapai: Math.min(...queIds) };
    }
    const melds = meldCount(view);
    const seen = (id) => visible(view, id);
    let best = null;
    for (const id of [...new Set(pool)].sort((a, b) => a - b)) {
        const next = view.holds.slice();
        next.splice(next.indexOf(id), 1);
        const x = chengduXiangting(next, view.que, melds);
        const u = ukeire(next, view.que, melds, seen);
        const row = { id, x, u };
        if (!best || row.x < best.x || (row.x === best.x && (row.u > best.u || (row.u === best.u && row.id < best.id)))) best = row;
    }
    return { dapai: best.id };
}

// 立直剖面原样搬过来，只拦住成都里不合法的吃、立直和缺门出牌。完成手的价值固定。
export function naiveRules() {
    const state = {
        que: null,
        ques: [null, null, null, null],
        hued: [false, false, false, false],
        concealed: [0, 0, 0, 0],
        alive: 3,
    };
    const rules = riichiRules();
    rules.state = state;
    rules.allowChi = false;
    rules.allowLizhi = false;
    rules.allowPingju = false;
    rules.allowNoDaopai = false;
    rules.allowHule = false;
    rules.filterDapai = (_player, list) => {
        const suit = queToSuit(state.que);
        if (!suit || !list) return list || [];
        const limited = list.filter((tile) => tile[0] === suit);
        return limited.length ? limited : list;
    };
    rules.defen = () => 1000;
    rules.chooseQue = (_ai, holds) => fewestSuit(holds, 0);
    rules.chooseHuan = (_ai, holds) => {
        const suit = fewestSuit(holds, 3);
        return holds.filter((id) => Math.floor(id / 9) === suit).sort((a, b) => a - b).slice(0, 3);
    };
    return rules;
}

export function createNaiveAi(index, userId, internals, userIds = [1001, 1002, 1003, 1004]) {
    return createScmjAi(index, userId, internals, { style: 'steady' }, userIds, naiveRules());
}

function fewestSuit(holds, atLeast) {
    const n = [0, 0, 0];
    for (const id of holds) n[id < 9 ? 0 : id < 18 ? 1 : 2] += 1;
    let que = -1;
    for (let i = 0; i < 3; i += 1) if (n[i] >= atLeast && (que < 0 || n[i] < n[que])) que = i;
    return que;
}

function patchSuanpai(rules, patch) {
    const install = rules.installSuanpai;
    rules.installSuanpai = (player, qipai) => {
        install(player, qipai);
        patch(player._suanpai, rules.state);
    };
}

// E4 的消融：FULL 只关掉一项成都适配。
export const VARIANTS = {
    que(rules) {
        patchSuanpai(rules, (suan, state) => {
            const weigh = suan.suan_weixian.bind(suan);
            suan.suan_weixian = (p, l, c) => {
                const ques = state.ques;
                state.ques = [null, null, null, null];
                try { return weigh(p, l, c); } finally { state.ques = ques; }
            };
        });
    },
    genbutsu(rules) {
        patchSuanpai(rules, (suan, state) => {
            const record = suan.dapai.bind(suan);
            suan.dapai = (dapai) => {
                record(dapai);
                if (dapai.p && dapai.p !== '_') suan._dapai[dapai.l][dapai.p[0] + (+dapai.p[1] || 5)] = true;
            };
            suan.suan_weixian = (p, l, c = 1) => {
                if (state.hued && state.hued[l]) return 0;
                if (queToSuit(state.ques && state.ques[l]) === p[0]) return 0;
                return SuanPai.prototype.suan_weixian.call(suan, p, l, c);
            };
        });
    },
    threat(rules) {
        rules.state.threat = null;
    },
    active(rules) {
        patchSuanpai(rules, (suan) => {
            const count = suan.get_paishu.bind(suan);
            suan.get_paishu = () => {
                const paishu = count();
                paishu._step = 4;
                return paishu;
            };
        });
    },
    gangfee(rules) {
        rules.gangFee = null;
    },
    mix(rules) {
        const state = rules.state;
        rules.defen = (_player, shoupai, rongpai) => {
            const spec = handSpec(shoupai, rongpai, state.que);
            return chengduSettle(state.internals, { ...spec, zimo: true, payers: state.alive }).score * rules.K;
        };
    },
    dingque(rules) {
        rules.chooseQue = (_ai, holds) => fewestSuit(holds, 0);
    },
    hsz(rules) {
        rules.chooseHuan = (_ai, holds) => greedyDecide({ pending: 'huan', holds }).huan;
    },
};

export function createFullAi(index, userId, internals, userIds, options = {}) {
    const rules = chengduRules({ internals, alive: 3, ...(options.K ? { K: options.K } : {}) });
    if (options.variant) {
        if (!VARIANTS[options.variant]) throw new Error(`未知变体 ${options.variant}`);
        VARIANTS[options.variant](rules);
    }
    return createScmjAi(index, userId, internals, { style: options.persona || 'steady' }, userIds, rules);
}

// 成都电脑。options.plan 覆盖 planner 参数，options.persona 是打法 id（给了就不是 plain）。
// E4 的消融：成都电脑只关掉一项，其余照默认。
export const PLAN_VARIANTS = {
    defend: () => ({ plan: { lambda: 0 } }),
    reader: () => ({ reader: createReader(null) }),
    quesafe: () => {
        const base = createReader(readJson);
        return {
            reader: {
                ...base,
                wait(table, o, k, unseen, holdCount) {
                    const ques = table.ques;
                    table.ques = ques.map((q, i) => (i === o ? -1 : q));
                    try { return base.wait(table, o, k, unseen, holdCount); } finally { table.ques = ques; }
                },
            },
        };
    },
    gangfee: () => ({ plan: { voidRisk: 0 } }),
    gamma: () => ({ plan: { gamma: 1 } }),
    shallow: () => ({ plan: { depth: 1 } }),
    dingque: () => ({ wrap: (view) => (view.pending === 'dingque' ? { que: fewestSuit(view.holds, 0) } : null) }),
    hsz: () => ({ wrap: (view) => (view.pending === 'huan' ? greedyDecide({ pending: 'huan', holds: view.holds }) : null) }),
};

export function createPlanAi(index, userId, internals, userIds, options = {}) {
    if (options.variant && !PLAN_VARIANTS[options.variant]) throw new Error(`unknown plan variant ${options.variant}`);
    const ablate = options.variant ? PLAN_VARIANTS[options.variant]() : {};
    const player = createScmjPlayer(index, userId, internals, {
        userIds,
        seed: options.seed,
        plan: { ...(options.plan || {}), ...(ablate.plan || {}) },
        reader: ablate.reader,
        plain: !options.persona,
        persona: options.persona ? { style: options.persona } : undefined,
    });
    if (!ablate.wrap) return player;
    return { ...player, decide: (view) => ablate.wrap(view) || player.decide(view) };
}
