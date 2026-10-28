import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Majiang from '@kobalab/majiang-core';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { chengduXiangting } from '../src/visual/igs-ui/scmj/profile.js';
import { chengduRules, chengduSettle } from '../src/visual/igs-ui/scmj/rules.js';
import { youlinSuit } from '../src/visual/igs-ui/scmj/profile.js';
import { MindfulAI } from '../src/visual/igs-ui/wait-stage-mahjong-mind.js';
import { greedyDecide } from '../scripts/scmj-players.mjs';

test('gate:scmj:xiangting-clears-the-missing-suit', () => {
    const withQue = [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 9];
    const without = [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 3];
    assert.equal(chengduXiangting(withQue, 1), 1);
    assert.equal(chengduXiangting(without, 1), 0);
    const riichi = new Majiang.Shoupai([]);
    for (const id of withQue) {
        const suit = id < 9 ? 'p' : id < 18 ? 's' : 'm';
        riichi._bingpai[suit][(id % 9) + 1] += 1;
    }
    assert.equal(Majiang.Util.xiangting(riichi), 0);
});

test('gate:scmj:greedy-plays-four-hands-and-scores-sum-to-zero', () => {
    const played = createScmjController({ seed: 1, strict: true }).play(greedyDecide);
    assert.ok(played.over.endinfo);
    const totals = played.over.results.map((row) => row.totalscore);
    assert.equal(totals.reduce((sum, score) => sum + score, 0), 0);
});

test('gate:scmj:settled-fan-matches-youlin', () => {
    const controller = createScmjController({ seed: 3 });
    const played = controller.play(greedyDecide);
    let que = [-1, -1, -1, -1];
    let checked = 0;
    for (const step of played.trace) {
        for (const msg of step.messages) {
            if (msg.event === 'game_dingque_finish_push') que = msg.data.slice();
            if (msg.event !== 'game_over_push' || msg.userId !== 1001) continue;
            msg.data.results.forEach((row, index) => {
                const types = (row.actions || []).map((action) => action.type);
                const won = types.some((type) => ['zimo', 'hu', 'ganghua', 'dianganghua', 'gangpaohu', 'qiangganghu'].includes(type));
                if (!won) return;
                const got = chengduSettle(controller.xzdd.__internals, {
                    holds: row.holds.slice(),
                    win: row.holds[row.holds.length - 1],
                    que: que[index],
                    pengs: row.pengs,
                    angangs: row.angangs,
                    diangangs: row.diangangs,
                    wangangs: row.wangangs,
                    zimo: types.includes('zimo') || types.includes('ganghua'),
                    payers: 1,
                    haidi: row.haidihu,
                    tianhu: row.tianhu,
                    dihu: row.dihu,
                    ganghu: row.isganghu,
                    qianggang: types.includes('qiangganghu'),
                });
                assert.equal(got.fan, row.fan);
                checked += 1;
            });
        }
    }
    assert.ok(checked > 0);
});

test('gate:scmj:wall-step-matches-players-still-in', () => {
    for (const [alive, step] of [[3, 4], [2, 3], [1, 2]]) {
        const rules = chengduRules({ alive });
        const player = { _id: 0, _model: { qijia: 0 } };
        rules.installSuanpai(player, { zhuangfeng: 0, jushu: 0, shoupai: ['m123', '', '', ''] });
        assert.equal(player._suanpai._n_zimo, 55);
        assert.deepEqual(player._suanpai._paishu.z, [0, 0, 0, 0, 0, 0, 0, 0]);
        assert.equal(player._suanpai._paishu.m[0], 0);
        assert.deepEqual(player._suanpai._baopai, []);
        const paishu = player._suanpai.get_paishu();
        const before = paishu._n_zimo;
        paishu.pop('m1');
        assert.equal(before - paishu._n_zimo, step);
        paishu.push('m1');
        assert.equal(paishu._n_zimo, before);
    }
    const rules = chengduRules({ alive: 3 });
    const player = { _id: 0, _model: { qijia: 0 } };
    rules.installSuanpai(player, { zhuangfeng: 0, jushu: 0, shoupai: ['', '', '', ''] });
    player._suanpai.zimo({ l: 1, p: '' });
    assert.equal(player._suanpai._n_zimo, 54);
    player._suanpai.zimo({ l: 0, p: 'm1' });
    assert.equal(player._suanpai._n_zimo, 53);
    assert.equal(player._suanpai._paishu.m[1], 3);
});

test('gate:scmj:plain-threat-comes-from-the-table', () => {
    const table = JSON.parse(readFileSync(new URL('../src/visual/igs-ui/scmj/threat-table.json', import.meta.url), 'utf8'));
    assert.equal(table.samples, 20000);
    assert.equal(table.p.length, 125);
    assert.equal(table.diff.length, 0);
    const rules = chengduRules();
    assert.equal(rules.state.threat(0), table.p[0]);
    assert.equal(rules.state.threat(124), table.p[124]);
});

test('gate:scmj:danger-drops-que-fresh-tiles-and-keeps-suji', () => {
    const rules = chengduRules({
        alive: 3,
        ques: [null, 0, null, null],
        hued: [false, false, true, false],
    });
    const player = { _id: 0, _model: { qijia: 0 } };
    rules.installSuanpai(player, { zhuangfeng: 0, jushu: 0, shoupai: ['', '', '', ''] });
    const suan = player._suanpai;
    assert.equal(suan.suan_weixian('p5', 1), 0);
    assert.equal(rules.ignoreSeat(player, 2), true);
    assert.equal(rules.dealerWeight(), 1);
    const before = suan.suan_weixian('p2', 0);
    suan.dapai({ l: 0, p: 'p5' });
    assert.equal(suan.suan_weixian('p5', 0), 0);
    const twinRules = chengduRules({ alive: 3 });
    const twinPlayer = { _id: 0, _model: { qijia: 0 } };
    twinRules.installSuanpai(twinPlayer, { zhuangfeng: 0, jushu: 0, shoupai: ['', '', '', ''] });
    twinPlayer._suanpai._paishu = JSON.parse(JSON.stringify(suan._paishu));
    assert.equal(suan.suan_weixian('p2', 0), twinPlayer._suanpai.suan_weixian('p2', 0));
    assert.equal(suan.suan_weixian('p8', 0), twinPlayer._suanpai.suan_weixian('p8', 0));
    assert.notEqual(before, 0);
    suan.zimo({ l: 0, p: '' });
    assert.equal(suan.suan_weixian('p5', 0), twinPlayer._suanpai.suan_weixian('p5', 0));
    let sum = 0;
    const weights = [];
    for (const suit of ['m', 'p', 's']) {
        for (let n = 1; n <= 9; n += 1) {
            const weight = suan.suan_weixian(`${suit}${n}`, 0);
            weights.push(weight);
            sum += weight;
        }
    }
    const total = weights.reduce((acc, weight) => acc + (weight / sum) * 100 * rules.dealerWeight(), 0);
    assert.ok(Math.abs(total - 100) < 1e-9);
});

test('gate:scmj:dingque-and-huan-follow-expectation', () => {
    const internals = createScmjController({ seed: 1 }).xzdd.__internals;
    const isolated = [0, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const isolatedRules = chengduRules({ internals });
    const isolatedAi = new MindfulAI({ style: 'steady' }, { plain: true, think: false, rules: isolatedRules });
    assert.equal(isolatedRules.chooseQue(isolatedAi, isolated), 0);
    const holds = [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 0, 9, 13, 17];
    const rules = chengduRules({ internals });
    const ai = new MindfulAI({ style: 'steady' }, { plain: true, think: false, rules });
    assert.equal(rules.chooseQue(ai, holds), 1);
    const huan = rules.chooseHuan(ai, holds);
    assert.deepEqual(huan.slice().sort((a, b) => a - b), [9, 13, 17]);
    assert.equal(new Set(huan.map(youlinSuit)).size, 1);
    assert.deepEqual(rules.chooseHuan(ai, holds), huan);
});

test('gate:scmj:search-settles-without-situation-flags', () => {
    const internals = createScmjController({ seed: 1 }).xzdd.__internals;
    const rules = chengduRules({ internals, alive: 3, que: 1 });
    const seen = [];
    const original = internals.calculateResult;
    internals.calculateResult = (game, room) => {
        const seat = game.gameSeats[0];
        seen.push({
            haidi: Boolean(seat.isHaiDiHu),
            tian: Boolean(seat.isTianHu),
            di: Boolean(seat.isDiHu),
            gang: Boolean(seat.isGangHu),
            qiang: Boolean(seat.isQiangGangHu),
        });
        return original(game, room);
    };
    const shoupai = Majiang.Shoupai.fromString('m123456789p1234');
    shoupai.zimo('p4');
    rules.defen(null, shoupai, null);
    internals.calculateResult = original;
    assert.ok(seen.length >= 1);
    for (const row of seen) {
        assert.equal(row.haidi || row.tian || row.di || row.gang || row.qiang, false);
    }
});
