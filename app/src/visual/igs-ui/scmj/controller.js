// 成都牌局控制器。规则判定只保留幼麟客户端的两条：缺门没打完只能打缺门；换三张必须三张同花色。
// 出处：client/assets/scripts/components/MJGame.js 的 checkQueYiMen，
// client/assets/scripts/components/HuanSanZhang.js 的 onHuanSanZhang。
import { createXzdd } from './xzdd-factory.generated.js';
import { createScmjHost, mulberry32, SCMJ_CONF } from './host.js';
import { youlinSuit } from './profile.js';

const REJECTION = /not your turn|already hued|no need chupai|plz guo before|can't find mj|peng == false|gang == false|can't be ganged|invalid request|no need guo|it's your turn|lack of mj|can't recv huansanzhang|player has done this action|can't recv dingQue|can't find user game data|invalid pai count/;

function copyAction(data) {
    if (!data || !(data.hu || data.peng || data.gang)) return null;
    return { pai: data.pai, hu: Boolean(data.hu), peng: Boolean(data.peng), gang: Boolean(data.gang), gangpai: (data.gangpai || []).slice() };
}

function cloneData(data) {
    if (data === undefined) return { $: 'undefined' };
    return JSON.parse(JSON.stringify(data));
}

function takeClaimedDiscard(seats, turnUser, pai) {
    const who = seats.find((seat) => seat.userId === turnUser);
    if (!who) return;
    const index = who.rivers.lastIndexOf(pai);
    if (index >= 0) who.rivers.splice(index, 1);
}

export function createScmjController(options = {}) {
    const conf = options.conf || SCMJ_CONF;
    const seed = options.seed >>> 0;
    const host = options.host || createScmjHost({ conf, random: options.random || mulberry32(seed), userIds: options.userIds, roomId: options.roomId });
    const xzdd = options.xzdd || createXzdd(host);
    const strict = options.strict === true;
    const seats = host.userIds.map((userId, index) => ({
        userId,
        index,
        holds: [],
        que: -1,
        hued: false,
        pengs: [],
        angangs: [],
        diangangs: [],
        wangangs: [],
        rivers: [],
        pending: null,
        action: null,
    }));
    const byUser = new Map(seats.map((seat) => [seat.userId, seat]));
    const calls = [];
    const trace = [];
    let over = null;
    let turnUser = null;
    // 这一张出牌已经被胡走了（一炮多响只拿一次）；补杠被抢时胡的那张不在牌河里。
    let discardTaken = false;
    let robbing = false;
    let logs = [];

    function seatOf(userId) { return byUser.get(userId); }

    function apply(msg) {
        const seat = seatOf(msg.userId);
        if (msg.event === 'game_holds_push' && seat) seat.holds = msg.data;
        else if (msg.event === 'game_begin_push' && seat) {
            seat.que = -1;
            seat.hued = false;
            seat.pengs = [];
            seat.angangs = [];
            seat.diangangs = [];
            seat.wangangs = [];
            seat.rivers = [];
            seat.pending = null;
            seat.action = null;
        } else if (msg.event === 'game_huanpai_push' && seat) seat.pending = 'huan';
        else if (msg.event === 'huanpai_notify') {
            const who = seatOf(msg.data && msg.data.si);
            if (who) who.pending = null;
        } else if (msg.event === 'game_dingque_push' && seat) seat.pending = 'dingque';
        else if (msg.event === 'game_dingque_notify_push') {
            const who = seatOf(msg.data);
            if (who) who.pending = null;
        } else if (msg.event === 'game_dingque_finish_push' && Array.isArray(msg.data)) {
            msg.data.forEach((que, index) => { seats[index].que = que; seats[index].pending = null; });
        } else if (msg.event === 'game_chupai_push') {
            turnUser = msg.data;
            for (const item of seats) {
                if (item.pending === 'turn' || item.pending === 'action') item.pending = null;
                item.action = null;
            }
            const who = seatOf(msg.data);
            if (who && !who.hued) who.pending = 'turn';
        } else if (msg.event === 'game_action_push' && seat) {
            const action = copyAction(msg.data);
            seat.action = action;
            if (action) seat.pending = 'action';
            else if (seat.pending === 'action') seat.pending = seat.userId === turnUser ? 'turn' : null;
        } else if (msg.event === 'game_chupai_notify_push' && msg.data) {
            const who = seatOf(msg.data.userId);
            discardTaken = false;
            robbing = false;
            if (who) {
                who.rivers.push(msg.data.pai);
                who.pending = null;
                who.action = null;
            }
        } else if (msg.event === 'peng_notify_push' && msg.data) {
            const who = seatOf(msg.data.userid);
            if (who) who.pengs.push(msg.data.pai);
            takeClaimedDiscard(seats, turnUser, msg.data.pai);
        } else if (msg.event === 'gang_notify_push' && msg.data) {
            const who = seatOf(msg.data.userid);
            if (who) {
                if (msg.data.gangtype === 'angang') who.angangs.push(msg.data.pai);
                else if (msg.data.gangtype === 'diangang') {
                    who.diangangs.push(msg.data.pai);
                    takeClaimedDiscard(seats, turnUser, msg.data.pai);
                } else {
                    const index = who.pengs.lastIndexOf(msg.data.pai);
                    if (index >= 0) who.pengs.splice(index, 1);
                    who.wangangs.push(msg.data.pai);
                }
            }
        } else if (msg.event === 'hangang_notify_push') {
            robbing = true;
            const who = seats[msg.data];
            if (who) { who.pending = null; who.action = null; }
        } else if (msg.event === 'guo_result' && seat) {
            seat.action = null;
            seat.pending = seat.userId === turnUser && !seat.hued ? 'turn' : null;
        } else if (msg.event === 'hu_push' && msg.data) {
            const who = seats[msg.data.seatindex];
            if (who) { who.hued = true; who.pending = null; who.action = null; }
            if (!msg.data.iszimo && !robbing && !discardTaken) {
                discardTaken = true;
                const from = seatOf(turnUser);
                if (from && from.rivers[from.rivers.length - 1] === msg.data.hupai) from.rivers.pop();
            }
        } else if (msg.event === 'game_over_push') {
            over = { results: msg.data.results, endinfo: msg.data.endinfo };
            for (const item of seats) { item.pending = null; item.action = null; }
        }
    }

    function invoke(name, ...args) {
        calls.push({ name, args });
        xzdd[name](...args);
        host.flush();
        const batch = host.takeMessages();
        const fresh = host.takeLogs();
        logs = logs.concat(fresh);
        const rejected = fresh.find((line) => REJECTION.test(line));
        if (strict && rejected) throw new Error(`幼麟拒绝了这次调用：${rejected}`);
        trace.push({
            name,
            args: args.slice(),
            messages: batch.map((msg) => ({ event: msg.event, userId: msg.userId, data: cloneData(msg.data) })),
        });
        let prev = null;
        for (const msg of batch) {
            const same = prev && prev.event === msg.event && prev.data === msg.data;
            if (!same) apply(msg);
            prev = msg;
        }
        return batch;
    }

    function view(seat) {
        const rivers = seats.flatMap((item) => item.rivers);
        const openPengs = seats.flatMap((item) => item.pengs);
        const openGangs = seats.flatMap((item) => item.diangangs.concat(item.wangangs));
        const queIds = seat.holds.filter((id) => youlinSuit(id) === ['p', 's', 'm'][seat.que]);
        return {
            index: seat.index,
            userId: seat.userId,
            pending: seat.pending,
            holds: seat.holds.slice(),
            que: seat.que,
            hued: seat.hued,
            pengs: seat.pengs.slice(),
            angangs: seat.angangs.slice(),
            diangangs: seat.diangangs.slice(),
            wangangs: seat.wangangs.slice(),
            openPengs,
            openGangs,
            rivers,
            action: seat.action,
            legal: seat.pending === 'turn' ? (queIds.length ? queIds : seat.holds.slice()) : null,
        };
    }

    function sameSuit(ids) {
        return ids.length === 3 && new Set(ids.map(youlinSuit)).size === 1 && ids.every((id) => seatHoldsOk(id));
    }

    function seatHoldsOk(id) { return id >= 0 && id < 27; }

    function submit(seat, choice) {
        if (seat.pending === 'huan') {
            const tiles = choice.huan || [];
            if (!sameSuit(tiles) || tiles.some((id) => seat.holds.indexOf(id) < 0)) {
                throw new Error('换三张必须是手里三张同花色');
            }
            invoke('huanSanZhang', seat.userId, tiles[0], tiles[1], tiles[2]);
            return;
        }
        if (seat.pending === 'dingque') {
            invoke('dingQue', seat.userId, choice.que);
            return;
        }
        if (seat.pending === 'action') {
            if (choice.hu) invoke('hu', seat.userId);
            else if (choice.gang) invoke('gang', seat.userId, choice.pai);
            else if (choice.peng) invoke('peng', seat.userId);
            else invoke('guo', seat.userId);
            return;
        }
        if (seat.pending === 'turn') {
            const legal = new Set(view(seat).legal);
            if (!legal.has(choice.dapai)) throw new Error('这张牌现在不能打');
            if (seat.action) invoke('guo', seat.userId);
            if (seat.pending === 'turn') invoke('chuPai', seat.userId, choice.dapai);
        }
    }

    function pendingSeats() {
        return seats.filter((seat) => seat.pending && !seat.hued);
    }

    function step(decide) {
        const waiting = pendingSeats();
        if (!waiting.length) return false;
        const actions = waiting.filter((seat) => seat.pending === 'action');
        if (actions.length) {
            const discarder = Math.max(0, seats.findIndex((seat) => seat.userId === turnUser));
            const order = [1, 2, 3, 4].map((delta) => seats[(discarder + delta) % 4]).filter((seat) => seat.pending === 'action');
            const choices = order.map((seat) => ({ seat, choice: decide(view(seat), { seats, calls }) }));
            let huSubmitted = false;
            for (const item of choices.filter((entry) => entry.choice.hu)) {
                if (item.seat.pending === 'action') {
                    submit(item.seat, item.choice);
                    huSubmitted = true;
                }
            }
            // 有人胡之后幼麟会清掉碰杠，并可能已经给下家发牌。旧的碰、杠、过不能再提交。
            if (!huSubmitted) {
                for (const item of choices.filter((entry) => !entry.choice.hu)) {
                    if (item.seat.pending !== 'action') continue;
                    submit(item.seat, item.choice);
                }
            }
            return true;
        }
        submit(waiting[0], decide(view(waiting[0]), { seats, calls }));
        return true;
    }

    function start() {
        for (const seat of seats) invoke('setReady', seat.userId);
    }

    function play(decide, limit = 4000) {
        start();
        let guard = 0;
        while (!over?.endinfo) {
            if (over && !pendingSeats().length) {
                for (const seat of seats) invoke('setReady', seat.userId);
            }
            if (!step(decide)) break;
            guard += 1;
            if (guard > limit) throw new Error('牌局超过调用上限');
        }
        return { over, calls, logs, seats, trace };
    }

    return { host, xzdd, seats, invoke, view, play, start, step, get over() { return over; }, get logs() { return logs; }, calls, trace };
}
