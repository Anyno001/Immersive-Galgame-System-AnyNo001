import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
    LUDO_STYLE, applyMove, chooseAiMove, createLudoState, legalMoves, ludoAbs, ludoCandidates, ludoPoint, ludoSeatColors,
    ludoStart, normalizeLudoPicks, passTurn, ringCell, ringColor, settleProgress, stackOffsets, startLudo,
} from '../src/visual/igs-ui/wait-stage-ludo.js';

function stateWith(pieces, turn = 0) {
    const state = createLudoState([0, 1, 2, 3]);
    state.turn = turn;
    pieces.forEach((list, seat) => { state.pieces[seat] = list; });
    return state;
}
const H = -1;

test('外圈 52 格各不相同且都在棋盘周边', () => {
    const keys = new Set();
    for (let i = 0; i < 52; i += 1) {
        const { x, y } = ringCell(i);
        assert.ok(x === 0 || x === 13 || y === 0 || y === 13);
        keys.add(`${x},${y}`);
    }
    assert.equal(keys.size, 52);
});

test('起飞点是本色格，四色起飞点各隔 13 格', () => {
    for (let c = 0; c < 4; c += 1) {
        assert.equal(ringColor(ludoStart(c)), c);
        assert.equal(ludoAbs(c, 0), ludoStart(c) % 52);
    }
    assert.equal(ludoAbs(0, 50), 6, '最后一格外圈格是直道入口');
});

test('终点直道和终点四色互不重叠', () => {
    const seen = new Set();
    for (let c = 0; c < 4; c += 1) {
        for (let p = 51; p <= 56; p += 1) {
            const { x, y } = ludoPoint(c, p);
            const key = `${x},${y}`;
            assert.ok(!seen.has(key), key);
            seen.add(key);
        }
    }
    const goals = [0, 1, 2, 3].map((c) => ludoPoint(c, 56));
    assert.ok(goals.every((g) => g.x >= 6 && g.x <= 8 && g.y >= 6 && g.y <= 8));
});

test('掷 6 才能起飞，起飞后再掷一次', () => {
    const state = stateWith([[H, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]);
    assert.deepEqual(legalMoves(state, 0, 3), []);
    assert.deepEqual(legalMoves(state, 0, 6), [0], '同在机场的棋子只列一枚');
    const out = applyMove(state, 0, 0, 6);
    assert.equal(out.state.pieces[0][0], 0);
    assert.ok(out.events.takeoff && out.events.extra);
    assert.equal(out.state.turn, 0);
    assert.equal(state.pieces[0][0], H, '入参不被改动');
    assert.equal(applyMove(state, 0, 0, 3), null);
});

test('落在本色格跳四格，不叠加其他结算', () => {
    const state = stateWith([[2, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]);
    const out = applyMove(state, 0, 0, 2);
    assert.equal(out.state.pieces[0][0], 8);
    assert.ok(out.events.jumped && !out.events.flew);
    assert.equal(out.state.turn, 1, '没掷 6 就换下一家');
    assert.deepEqual(settleProgress(5), { progress: 5, jumped: false, flew: false });
    assert.equal(settleProgress(48).progress, 48, '跳过终点线的不跳');
});

test('落在捷径起点直接飞到对面；跳格落在捷径起点也接着飞', () => {
    let out = applyMove(stateWith([[13, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]), 0, 0, 3);
    assert.equal(out.state.pieces[0][0], 28);
    assert.ok(out.events.flew && !out.events.jumped);
    out = applyMove(stateWith([[8, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]), 0, 0, 4);
    assert.equal(out.state.pieces[0][0], 28);
    assert.ok(out.events.flew && out.events.jumped);
});

test('落在别家单枚棋子的格子把它打回机场', () => {
    // 红 13 与黄 0 同在外圈绝对位置 21。
    assert.equal(ludoAbs(0, 13), ludoAbs(1, 0));
    const state = stateWith([[10, H, H, H], [0, H, H, H], [H, H, H, H], [H, H, H, H]]);
    const out = applyMove(state, 0, 0, 3);
    assert.equal(out.state.pieces[0][0], 13);
    assert.equal(out.state.pieces[1][0], H);
    assert.deepEqual(out.events.captured, [{ seat: 1, piece: 0 }]);
});

test('同格叠了两枚以上的不会被打', () => {
    const state = stateWith([[10, H, H, H], [0, 0, H, H], [H, H, H, H], [H, H, H, H]]);
    const out = applyMove(state, 0, 0, 3);
    assert.equal(out.state.pieces[1][0], 0);
    assert.equal(out.state.pieces[1][1], 0);
    assert.equal(out.events.captured.length, 0);
});

test('终点必须正好走到，多出的步数往回退', () => {
    const state = stateWith([[54, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]);
    const bounced = applyMove(state, 0, 0, 4);
    assert.equal(bounced.state.pieces[0][0], 54);
    assert.ok(bounced.events.bounced);
    const exact = applyMove(state, 0, 0, 2);
    assert.equal(exact.state.pieces[0][0], 56);
    assert.ok(exact.events.finished);
    assert.deepEqual(legalMoves(exact.state, 0, 3), [], '到了终点的棋子不再能动');
});

test('终点直道上的棋子不会被打', () => {
    const state = stateWith([[48, H, H, H], [53, H, H, H], [H, H, H, H], [H, H, H, H]]);
    const out = applyMove(state, 0, 0, 5);
    assert.equal(out.state.pieces[1][0], 53);
});

test('四枚全到终点即胜，胜后不再换人也不再给走', () => {
    const state = stateWith([[56, 56, 56, 54], [H, H, H, H], [H, H, H, H], [H, H, H, H]]);
    const out = applyMove(state, 0, 3, 2);
    assert.equal(out.state.winner, 0);
    assert.ok(out.events.win);
    assert.ok(!out.events.extra);
    assert.deepEqual(legalMoves(out.state, 0, 6), []);
    assert.equal(applyMove(out.state, 0, 0, 1), null);
});

test('无子可走时交给下一家，掷 6 之外的走子换人', () => {
    const state = stateWith([[H, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]], 3);
    assert.equal(passTurn(state).turn, 0);
    assert.equal(ludoSeatColors(2).join(), '0,2');
    assert.equal(ludoSeatColors(3).join(), '0,1,2');
    const two = createLudoState([0, 2]);
    two.pieces[1][0] = 5;
    two.turn = 1;
    assert.equal(applyMove(two, 1, 0, 1).state.turn, 0);
});

test('电脑：打人 > 起飞 > 进终点 > 走最前面的', () => {
    // 能打人也能起飞：选打人。
    let state = stateWith([[7, H, H, H], [0, H, H, H], [H, H, H, H], [H, H, H, H]]);
    assert.equal(chooseAiMove(state, 0, 6), 0);
    // 起飞优先于普通前进
    state = stateWith([[20, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]);
    assert.equal(chooseAiMove(state, 0, 6), 1);
    // 进终点优先于前进
    state = stateWith([[54, 30, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]);
    assert.equal(chooseAiMove(state, 0, 2), 0);
    // 都平凡时走最前面的
    state = stateWith([[5, 30, 12, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]);
    assert.equal(chooseAiMove(state, 0, 1), 1);
    assert.equal(chooseAiMove(stateWith([[H, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]]), 0, 2), -1);
});

test('同格叠放有错开量', () => {
    assert.deepEqual(stackOffsets(1), [{ x: 0, y: 0 }]);
    const two = stackOffsets(2);
    assert.notDeepEqual(two[0], two[1]);
    assert.equal(stackOffsets(4).length, 4);
});

test('候选形象：优先卡内角色，其次名字，最后红黄蓝绿补足', () => {
    const cast = ludoCandidates({ cast: [{ name: '甲', faces: {} }, { name: '乙' }], names: ['乙', '丙'] });
    assert.deepEqual(cast.map((item) => item.name), ['甲', '乙', '丙', '红']);
    assert.ok(cast[0].person);
    assert.deepEqual(ludoCandidates({}).map((item) => item.name), ['红', '黄', '蓝', '绿']);
    assert.deepEqual(ludoCandidates(null).map((item) => item.name), ['红', '黄', '蓝', '绿']);
});

test('选人校正：默认你 + 依次填入，不重复，非法的丢掉', () => {
    const list = ludoCandidates({ names: ['甲', '乙', '丙', '丁', '戊'] });
    assert.deepEqual(normalizeLudoPicks(list, null), ['', '甲', '乙', '丙']);
    assert.deepEqual(normalizeLudoPicks(list, ['乙', '乙', '不存在', '甲']), ['乙', '甲', '丙', '丁']);
    assert.deepEqual(normalizeLudoPicks(list, ['', '丁', '丁', '甲']), ['', '丁', '甲', '乙']);
});

test('样式：只用类和主题变量，四色只在变量里定义', () => {
    assert.ok(LUDO_STYLE.includes('--igs-bar-ink'));
    assert.ok(LUDO_STYLE.includes('prefers-reduced-motion'));
    const rest = LUDO_STYLE.replace(/--ld-[a-z0-9]+:#[0-9a-f]{6};/gi, '').replace(/var\([^)]*\)/g, '');
    assert.ok(!/#[0-9a-f]{6}\b/i.test(rest));
    const boardRules = LUDO_STYLE.split(String.fromCharCode(10)).filter((line) => /^\.igs-ld-(field|cell|hangar|slotmark|flightmark|piece|die)/.test(line)).join(" ");
    assert.ok(!/color-mix|opacity|rgba/.test(boardRules), '棋盘部分全用实色');
    assert.ok(!/box-shadow:[^;]*rgba|text-shadow|linear-gradient/.test(LUDO_STYLE));
});

test('startLudo 缺 ctx 时返回 null', () => {
    assert.equal(startLudo(null), null);
});

test('startLudo：选人后能开始，电脑轮次自动推进', () => {
    const dom = new JSDOM('<!doctype html><body><div id="b"></div></body>');
    const { document } = dom.window;
    const board = document.getElementById('b');
    const queue = [];
    const notes = [];
    let closed = 0;
    const model = { cast: [{ name: '甲', faces: {} }, { name: '乙' }, { name: '丙' }, { name: '丁' }] };
    // 固定掷出 6：玩家起飞后连掷，电脑也起飞。
    const game = startLudo({
        doc: document,
        board,
        model,
        random: () => 0.99,
        timers: { setTimeout: (fn) => { queue.push(fn); return queue.length; } },
        setNote: (text) => notes.push(text),
        markDone() {},
        requestClose() { closed += 1; },
    });
    assert.ok(game);
    assert.equal(board.querySelectorAll('.igs-ld-slot').length, 4);
    assert.match(board.querySelector('.igs-ld-slot-name').textContent, /你/);
    board.querySelector('.igs-ld-ctl .igs-ws-chip').click();
    assert.equal(board.querySelectorAll('.igs-ld-piece').length, 16);
    assert.equal(game.state.turn, 0);
    const die = board.querySelector('.igs-ld-die');
    assert.equal(die.disabled, false);
    die.click();
    for (let i = 0; i < 40 && queue.length; i += 1) queue.shift()();
    assert.ok(game.state.pieces[0].some((p) => p === 0 || p > 0), '玩家的棋子起飞了');
    assert.ok(!/style=/.test(board.innerHTML.replace(/style="[^"]*--[^"]*"/g, '')), '只用 CSS 变量，不写别的内联样式');
    board.querySelector('.igs-ws-close').click();
    assert.equal(closed, 1);
});
