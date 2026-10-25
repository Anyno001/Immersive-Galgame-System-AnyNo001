// 把幼麟消息译成電脳麻将消息，决定仍由 MindfulAI 做。
import { MindfulAI } from '../wait-stage-mahjong-mind.js';
import { chengduRules } from './rules.js';
import { codeToYoulin, queToSuit, youlinToCode } from './profile.js';

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

function claimMark(caller, discarder) {
    const rel = (discarder - caller + 4) % 4;
    if (rel === 3) return '+';
    if (rel === 2) return '=';
    return '-';
}

function meldString(pai, kind, mark) {
    const code = youlinToCode(pai);
    const n = code.slice(1);
    if (kind === 'angang') return `${code[0]}${n}${n}${n}${n}`;
    if (kind === 'diangang') return `${code[0]}${n}${n}${n}${n}${mark}`;
    if (kind === 'wangang') return `${code[0]}${n}${n}${n}${mark}${n}`;
    return `${code[0]}${n}${n}${n}${mark}`;
}

export function createScmjAi(index, userId, internals, persona = { style: 'steady' }, userIds = [1001, 1002, 1003, 1004], rulesOverride = null) {
    const rules = rulesOverride || chengduRules({ internals, alive: 3 });
    const ai = new MindfulAI(persona, { plain: true, think: false, rules });
    const seat = {
        index,
        userId,
        ai,
        rules,
        opened: false,
        fed: [],
        button: 0,
        discarder: 0,
        holds: [],
        que: -1,
        ques: [-1, -1, -1, -1],
    };

    function menfeng(of = index) {
        return (of - seat.button + 4) % 4;
    }

    function ask(run) {
        let reply;
        ai._callback = (value) => { reply = value; };
        run();
        ai._callback = null;
        return reply;
    }

    function sync(run) {
        ai._callback = null;
        run();
    }

    function note(entry) {
        seat.fed.push(entry);
    }

    function whoOf(uid) {
        return userIds.indexOf(uid);
    }

    function open(holds) {
        const hands = ['', '', '', ''];
        hands[menfeng()] = holdsToString(holds);
        rules.state.que = seat.que;
        ask(() => ai.kaiju({
            id: index,
            qijia: seat.button,
            title: 'scmj',
            player: ['0', '1', '2', '3'],
            rule: { 赤牌: { m: 0, p: 0, s: 0, z: 0 } },
        }));
        ask(() => ai.qipai({
            zhuangfeng: 0,
            jushu: 0,
            changbang: 0,
            lizhibang: 0,
            defen: [0, 0, 0, 0],
            baopai: 'z1',
            shoupai: hands,
        }));
        seat.opened = true;
    }

    function tileOf(reply) {
        const text = reply && (reply.dapai || '');
        if (!text) return null;
        return codeToYoulin(text.replace('*', '').slice(0, 2));
    }

    seat.feed = (msg) => {
        if (msg.event === 'game_begin_push') {
            seat.button = msg.data;
            seat.opened = false;
            rules.state.hued = [false, false, false, false];
            rules.state.concealed = [0, 0, 0, 0];
            rules.state.alive = 3;
            rules.state.que = null;
        } else if (msg.event === 'game_holds_push') {
            seat.holds = msg.data.slice();
        } else if (msg.event === 'game_dingque_finish_push') {
            seat.ques = msg.data.slice();
            seat.que = msg.data[index];
            rules.state.que = seat.que;
            rules.state.ques = seat.ques.map((_, i) => seat.ques[i]);
            const byMenfeng = [null, null, null, null];
            seat.ques.forEach((que, i) => { byMenfeng[menfeng(i)] = que; });
            rules.state.ques = byMenfeng;
        } else if (msg.event === 'game_chupai_push' && seat.opened) {
            const who = whoOf(msg.data);
            if (who !== index) sync(() => ai.zimo({ l: menfeng(who), p: '' }));
        } else if (msg.event === 'game_chupai_notify_push') {
            const from = whoOf(msg.data.userId);
            seat.discarder = from;
            if (seat.opened) {
                sync(() => ai.dapai({ l: menfeng(from), p: youlinToCode(msg.data.pai) }));
                seat.appliedDiscard = `${from}:${msg.data.pai}`;
            }
        } else if (msg.event === 'game_mopai_push' && seat.opened) {
            sync(() => ai.zimo({ l: menfeng(), p: youlinToCode(msg.data) }));
        } else if (msg.event === 'peng_notify_push' && seat.opened) {
            const who = whoOf(msg.data.userid);
            const mark = claimMark(who, seat.discarder);
            sync(() => ai.fulou({ l: menfeng(who), m: meldString(msg.data.pai, 'peng', mark) }));
        } else if (msg.event === 'gang_notify_push' && seat.opened) {
            const who = whoOf(msg.data.userid);
            const kind = msg.data.gangtype;
            if (kind === 'angang' && who !== index) {
                rules.state.concealed[menfeng(who)] += 1;
                note({ name: 'gang', l: menfeng(who), concealed: true });
                return;
            }
            const mark = claimMark(who, seat.discarder);
            let text = meldString(msg.data.pai, kind, mark);
            if (kind === 'wangang') {
                const code = youlinToCode(msg.data.pai);
                const n = code.slice(1);
                const prefix = code[0] + n + n + n;
                const hand = ai.model && ai.model.shoupai[menfeng(who)];
                const found = hand && hand._fulou && hand._fulou.find((m) => m.slice(0, 5) === prefix && m.length === 5);
                if (!found) return;
                text = found + n;
            }
            note({ name: kind === 'diangang' ? 'fulou' : 'gang', l: menfeng(who), m: text });
            if (kind === 'diangang') sync(() => ai.fulou({ l: menfeng(who), m: text }));
            else sync(() => ai.gang({ l: menfeng(who), m: text }));
        } else if (msg.event === 'hu_push') {
            rules.state.hued[menfeng(msg.data.seatindex)] = true;
            rules.state.alive = [0, 1, 2, 3].filter((i) => i !== index && !rules.state.hued[menfeng(i)]).length || 1;
        } else if (msg.event === 'mj_count_push' && seat.opened && ai.model.shan) {
            ai.model.shan.paishu = msg.data;
        }
    };

    seat.decide = (view) => {
        if (view.pending === 'huan') return { huan: rules.chooseHuan(ai, view.holds) };
        if (view.pending === 'dingque') return { que: rules.chooseQue(ai, view.holds) };
        if (!seat.opened) open(view.holds);
        if (view.pending === 'action' && view.action && view.action.hu) return { hu: true };
        if (view.pending === 'action' && view.action && view.action.peng) {
            const key = `${seat.discarder}:${view.action.pai}`;
            if (seat.appliedDiscard !== key) {
                sync(() => ai.dapai({ l: menfeng(seat.discarder), p: youlinToCode(view.action.pai) }));
                seat.appliedDiscard = key;
            }
            if (ai.model) ai.model.lunban = menfeng(seat.discarder);
            const replyMeld = ai.select_fulou({ l: menfeng(seat.discarder), p: youlinToCode(view.action.pai) });
            if (view.action.gang && replyMeld && String(replyMeld).replace(/[^\d]/g, '').length >= 4) {
                return { gang: true, pai: Math.min(...view.action.gangpai) };
            }
            if (replyMeld) return { peng: true };
            return { guo: true };
        }
        if (view.action && view.action.hu) return { hu: true };
        const reply = ask(() => ai.action_zimo({ l: menfeng(), p: '_' }, false));
        if (view.action && view.action.gang && reply && reply.gang) {
            const id = codeToYoulin(reply.gang.replace(/0/g, '5').match(/[mpsz]\d/)[0]);
            if (view.action.gangpai.includes(id)) return { gang: true, pai: id };
        }
        const tile = tileOf(reply);
        const legal = new Set(view.legal || view.holds);
        if (legal.has(tile)) return { dapai: tile };
        const suit = queToSuit(view.que);
        const pool = suit ? view.holds.filter((id) => youlinToCode(id)[0] === suit) : [];
        const fallback = (pool.length ? pool : view.holds).slice().sort((a, b) => a - b)[0];
        return { dapai: fallback };
    };

    return seat;
}
