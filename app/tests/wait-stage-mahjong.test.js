import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl } from './helpers/fake-dom.js';
import { avatarCrop, forgetMahjongTable, mahjongReactions, penaltyBrief, penaltyLosers, playMahjongSync, startMahjong } from '../src/visual/igs-ui/wait-stage-mahjong.js';
import { MAHJONG_SOUNDS, createMahjongSound } from '../src/visual/igs-ui/wait-stage-mahjong-sound.js';

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
    };
}

function fakeDoc() {
    return { createElement(tag) {
        const node = new FakeEl(this, tag);
        node.classList = { add(value) { node.className += ` ${value}`; } };
        return node;
    } };
}

function handText(board) {
    return board.querySelectorAll('.is-self .igs-mj-pai').map((node) => node.textContent).join('');
}

test('gate:wait-stage:mahjong-plays-a-hand-on-the-dennou-engine', () => {
    const paipu = playMahjongSync({ rule: { '場数': 0 } });
    assert.ok(paipu.log.length >= 1);
    assert.equal(paipu.defen.length, 4);
    assert.equal(paipu.rank.length, 4);
    assert.equal(paipu.defen.reduce((sum, score) => sum + score, 0), 100000);
});

test('gate:wait-stage:mahjong-finishes-an-east-round-on-the-dennou-engine', () => {
    const paipu = playMahjongSync();
    assert.ok(paipu.log.length >= 4);
    assert.equal(paipu.defen.length, 4);
    assert.equal(paipu.player[0], '你');
    assert.equal(paipu.defen.reduce((sum, score) => sum + score, 0), 100000);
});

test('gate:wait-stage:mahjong-accepts-engine-calls-and-riichi', () => {
    const paipu = playMahjongSync({
        decide(_player, offer) {
            const call = (offer.replies || []).find((item) => item.reply.hule || item.reply.gang || item.reply.fulou);
            if (call) return call.reply;
            if (offer.lizhi && offer.lizhi.length) return { dapai: `${offer.lizhi[0]}*` };
            if (offer.dapai && offer.dapai.length) return { dapai: offer.dapai[offer.dapai.length - 1] };
            return {};
        },
    });
    assert.equal(paipu.defen.reduce((sum, score) => sum + score, 0), 100000);
});

test('gate:wait-stage:mahjong-table-offers-an-engine-discard', async () => {
    forgetMahjongTable();
    const doc = fakeDoc();
    const host = doc.createElement('div');
    const board = doc.createElement('div');
    host.appendChild(board);
    startMahjong({ doc, board, storage: memoryStorage(), setNote() {}, requestClose() {} });
    const seen = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('牌桌没有进入可操作的回合')), 8000);
        const watch = setInterval(() => {
            const hot = board.querySelector('.is-hot');
            if (!hot && !/自摸|荣和|吃|碰|杠|跳过|九种九牌/.test(board.textContent)) return;
            clearTimeout(timer);
            clearInterval(watch);
            resolve(board.textContent);
        }, 40);
    });
    assert.match(seen, /立直麻将/);
    board.querySelector('.igs-ws-close').fire('click');
    forgetMahjongTable();
    await new Promise((resolve) => { setTimeout(resolve, 400); });
});

test('gate:wait-stage:mahjong-picker-uses-card-characters', async () => {
    forgetMahjongTable();
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    const model = {
        names: ['绫', '凛', '咲'],
        art: { sprites: [
            { character: '绫', url: 'data:image/svg+xml,aya', mood: '笑' },
            { character: '凛', url: 'data:image/svg+xml,rin', mood: '静' },
            { character: '咲', url: 'data:image/svg+xml,saki', mood: '怒' },
        ], pictures: [] },
    };
    startMahjong({ doc, board, model, storage: memoryStorage(), setNote() {}, requestClose() {} });
    assert.match(board.textContent, /选择对手/);
    assert.match(board.textContent, /绫/);
    for (const button of board.querySelectorAll('.igs-mj-person')) button.fire('click');
    board.querySelectorAll('.igs-ws-chip').find((node) => node.textContent === '开始这局').fire('click');
    assert.match(board.textContent, /立直麻将/);
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    assert.match(board.textContent, /绫/);
    assert.match(board.textContent, /凛/);
    assert.match(board.textContent, /咲/);
    forgetMahjongTable();
});

test('gate:wait-stage:mahjong-avatar-takes-the-upper-body-or-the-calibrated-head', () => {
    assert.deepEqual(avatarCrop(712, 1024), { x: 100, y: 0, w: 512, h: 512 });
    const longer = avatarCrop(712, 1600);
    assert.ok(Math.abs(longer.w - 512) < 1 && longer.y === 0);
    const card = avatarCrop(712, 1024, null, 0.82, 0.62);
    assert.ok(Math.abs(card.w / card.h - 0.82) < 1e-6 && card.h > 512 && card.h <= 1024 * 0.62);
    const head = avatarCrop(1000, 2000, { x: 0.3, top: 0.4, w: 0.1, hh: 0.11 });
    assert.ok(head.w < 1000);
    assert.ok(head.x < 300 && head.x + head.w > 300);
    assert.ok(head.y < 800 && head.y + head.h > 800 + 110);
    const roomy = avatarCrop(1000, 2000, { x: 0.3, top: 0.4, w: 0.1, hh: 0.11 }, 0.79, 0.62, 0.9);
    assert.ok(roomy.y <= 800 - 110 * 0.9 + 1e-6, '头顶留够一个头高，发饰不被切');
    assert.ok(Math.abs(roomy.w / roomy.h - 0.79) < 1e-6 && roomy.h > head.h);
});

test('gate:wait-stage:mahjong-reactions-follow-the-table', () => {
    const board = { player_id: [0, 1, 2, 3], defen: [25000, 25000, 25000, 25000], lunban: 1 };
    const moods = (msg) => Object.fromEntries(mahjongReactions(msg, board, 0).map((item) => [item.seat, item.mood]));
    assert.deepEqual(moods({ fulou: { l: 2, m: 'p555-' } }), { 2: '喜悦', 1: '愤怒' });
    assert.deepEqual(moods({ dapai: { l: 3, p: 'z1*' } }), { 3: '喜悦' });
    assert.deepEqual(moods({ hule: { l: 1, baojia: 0, defen: 2000, fenpei: [-2000, 2000, 0, 0] } }), { 1: '害羞', 0: '悲伤' });
    assert.deepEqual(moods({ hule: { l: 0, baojia: 2, defen: 12000, fenpei: [12000, 0, -12000, 0] } }), { 0: '喜悦', 2: '悲伤', 1: '惊讶', 3: '惊讶' });
    assert.deepEqual(moods({ pingju: { name: '荒牌平局', shoupai: ['', 'm123', '', ''], fenpei: [-1000, 3000, -1000, -1000] } }), { 0: '悲伤', 1: '喜悦', 2: '悲伤', 3: '悲伤' });
});

test('gate:wait-stage:mahjong-heads-use-each-rivals-calm-face', async () => {
    forgetMahjongTable();
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    const face = (name) => ({ 平和: { url: `${name}-calm` }, 喜悦: { url: `${name}-joy` } });
    const model = { cast: [{ name: '绫', faces: face('aya') }, { name: '凛', faces: face('rin') }, { name: '咲', faces: face('saki') }] };
    startMahjong({ doc, board, model, storage: memoryStorage(), setNote() {}, requestClose() {} });
    for (const button of board.querySelectorAll('.igs-mj-person')) button.fire('click');
    board.querySelectorAll('.igs-ws-chip').find((node) => node.textContent === '开始这局').fire('click');
    const sources = board.querySelectorAll('.igs-mj-crowd .igs-mj-crop').map((node) => node.src);
    assert.deepEqual(sources.sort(), ['aya-calm', 'rin-calm', 'saki-calm']);
    forgetMahjongTable();
});

test('gate:wait-stage:mahjong-penalty-brief-centres-the-right-person', () => {
    const rival = penaltyBrief({ target: '凛', punisher: '绫', request: '罚她学猫叫', nsfw: true, stage: 'final' });
    assert.deepEqual(rival.characters, ['凛']);
    assert.deepEqual(rival.nude, ['凛']);
    assert.match(rival.description, /凛垫底/);
    assert.match(rival.description, /罚她学猫叫/);
    const self = penaltyBrief({ target: '你', punisher: '绫', request: '罚我请客', nsfw: true, stage: 'final' });
    assert.deepEqual(self.characters, ['绫']);
    assert.deepEqual(self.nude, []);
    assert.match(self.description, /第一名的绫来惩罚主角/);
    assert.match(self.description, /玩家补充：罚我请客/);
    const free = penaltyBrief({ target: '你', punisher: '绫', request: '  ' });
    assert.match(free.description, /怎么罚由绫按她的性格自己决定/);
    assert.doesNotMatch(free.description, /玩家补充|惩罚内容/);
    assert.match(free.caption, /由绫决定/);
    const hand = penaltyBrief({ target: '凛', punisher: '绫', request: '罚她唱歌' });
    assert.deepEqual(hand.nude, []);
    assert.match(hand.description, /全年龄/);
    assert.ok(hand.caption.length <= 60);
    const worn = { 凛: '礼服', 绫: '校服' };
    assert.deepEqual(penaltyBrief({ target: '凛', punisher: '绫', request: '罚她', outfits: worn }).outfits, { 凛: '礼服' });
    assert.deepEqual(penaltyBrief({ target: '你', punisher: '绫', request: '罚我', outfits: worn }).outfits, { 绫: '校服' });
});

test('gate:wait-stage:mahjong-penalty-takes-everyone-tied-last-or-busted', () => {
    const row = (id, score) => ({ id, score });
    assert.deepEqual(penaltyLosers([row(1, 27000), row(0, 25000), row(2, 24000), row(3, 24000)]), [2, 3], '同分垫底一起罚');
    assert.deepEqual(penaltyLosers([row(0, 25000), row(1, 25000), row(2, 25000), row(3, 25000)]), [], '四家同分没人垫底');
    assert.deepEqual(penaltyLosers([row(1, 60000), row(0, 41000), row(2, -500), row(3, -1500)], { busted: true }), [2, 3], '终局一起被飞的都罚');
    assert.deepEqual(penaltyLosers([row(1, 60000), row(0, 41000), row(2, -500), row(3, -1500)]), [3], '不算被飞时只看末位');
    assert.deepEqual(penaltyLosers([row(3, 3600), row(1, 0), row(2, 0), row(0, -2600)], { losing: true }), [0], '每局罚放铳的人，不罚总分垫底的');
    assert.deepEqual(penaltyLosers([row(1, 4000), row(0, -1000), row(2, -1000), row(3, -2000)], { losing: true }), [3], '自摸时罚付得最多的');
    assert.deepEqual(penaltyLosers([row(1, 3000), row(0, -1000), row(2, -1000), row(3, -1000)], { losing: true }), [0, 2, 3], '付得一样多一起罚');
    assert.deepEqual(penaltyLosers([row(1, 0), row(0, 0), row(2, 0), row(3, 0)], { losing: true }), [], '没人丢分不罚');
    const hand = penaltyBrief({ target: '你', punisher: '沙绫', request: '', stage: 'hand' });
    assert.match(hand.description, /玩家（主角）这一局输得最多，由这一局赢分的沙绫来惩罚主角/);
    const pair = penaltyBrief({ targets: ['凛', '咲'], punisher: '绫', request: '一起罚站', nsfw: true, stage: 'final', outfits: { 凛: '礼服', 咲: '泳装', 绫: '校服' } });
    assert.deepEqual(pair.characters, ['凛', '咲']);
    assert.deepEqual(pair.nude, ['凛', '咲']);
    assert.deepEqual(pair.outfits, { 凛: '礼服', 咲: '泳装' });
    assert.match(pair.description, /凛、咲并列垫底/);
    assert.match(pair.description, /每个人都要入镜/);
    const withMe = penaltyBrief({ targets: ['你', '凛'], punisher: '绫', request: '', nsfw: true, stage: 'final' });
    assert.deepEqual(withMe.characters, ['绫', '凛']);
    assert.deepEqual(withMe.nude, ['凛'], '玩家不画，同罚的角色照罚');
    assert.match(withMe.description, /玩家（主角）和凛并列垫底，由第一名的绫来惩罚他们/);
    assert.match(withMe.caption, /绫罚你和凛/);
});

test('gate:wait-stage:mahjong-sound-uses-the-host-bus-and-remembers-mute', () => {
    const made = [];
    const node = () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
    const ctx = {
        state: 'running', currentTime: 0, sampleRate: 8000,
        createOscillator: () => { made.push('osc'); return { ...node(), type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, start() {}, stop() {} }; },
        createGain: node,
        createBuffer: (_c, frames) => ({ getChannelData: () => new Float32Array(frames) }),
        createBufferSource: () => { made.push('noise'); return { ...node(), start() {} }; },
        createBiquadFilter: () => ({ ...node(), type: '', frequency: { value: 0 }, Q: { value: 0 } }),
    };
    const sfx = node();
    const storage = memoryStorage();
    const sound = createMahjongSound({ audio: { context: () => ctx, input: () => sfx }, storage, global: {} });
    for (const name of MAHJONG_SOUNDS) assert.equal(sound.play(name), true, name);
    assert.ok(made.includes('osc') && made.includes('noise'));
    sound.setEnabled(false);
    assert.equal(sound.play('discard'), false);
    assert.equal(createMahjongSound({ storage, global: {} }).enabled, false, '关掉之后下次还是关');
    assert.equal(createMahjongSound({ global: {} }).play('discard'), false, '没有总线也没有 AudioContext 时静默');
});

test('gate:wait-stage:mahjong-picker-changes-outfits-and-keeps-them', () => {
    forgetMahjongTable();
    const storage = memoryStorage();
    storage.setItem('igs-wait-mahjong-v1', JSON.stringify({ version: 1, finished: true,
        rematch: { names: ['绫', '凛', '咲'], outfits: { 凛: '便服' }, nude: [] } }));
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    const face = (name) => ({ 平和: { url: `${name}-calm` } });
    const model = { cast: [
        { name: '绫', faces: face('aya') },
        { name: '凛', outfit: '礼服', faces: face('rin-dress'),
            wardrobe: [{ outfit: '礼服', faces: face('rin-dress') }, { outfit: '便服', faces: face('rin-casual') }] },
        { name: '咲', faces: face('saki') },
    ] };
    startMahjong({ doc, board, model, storage, setNote() {}, requestClose() {} });
    const label = () => board.querySelectorAll('.igs-mj-outfit-name').map((node) => node.textContent);
    assert.deepEqual(label(), ['默认衣装', '便服', '默认衣装'], '每格都有衣装行，三格对齐');
    const steps = () => board.querySelectorAll('.igs-mj-outfit-step');
    assert.deepEqual(steps().map((node) => Boolean(node.disabled)), [true, true, false, false, true, true], '只有一套的不给换');
    steps().filter((node) => !node.disabled).find((node) => node.textContent === '›').fire('click');
    assert.deepEqual(label(), ['默认衣装', '礼服', '默认衣装']);
    board.querySelectorAll('.igs-ws-chip').find((node) => node.textContent === '开始这局').fire('click');
    const sources = board.querySelectorAll('.igs-mj-crowd .igs-mj-crop').map((node) => node.src);
    assert.ok(sources.includes('rin-dress-calm'), sources.join(','));
    forgetMahjongTable();
});

test('gate:wait-stage:mahjong-rematch-strips-the-punished-rival', () => {
    forgetMahjongTable();
    const storage = memoryStorage();
    storage.setItem('igs-wait-mahjong-v1', JSON.stringify({ version: 1, finished: true, rematch: { names: ['绫', '凛', '咲'], nude: ['凛'] } }));
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    const face = (name) => ({ 平和: { url: `${name}-calm` } });
    const model = { cast: [
        { name: '绫', faces: face('aya') },
        { name: '凛', faces: face('rin'), nude: face('rin-nude') },
        { name: '咲', faces: face('saki') },
        { name: '雪', faces: face('yuki') },
    ] };
    startMahjong({ doc, board, model, storage, setNote() {}, requestClose() {} });
    assert.match(board.textContent, /上一场受罚：凛/);
    assert.match(board.textContent, /对家 · 裸体/);
    board.querySelectorAll('.igs-ws-chip').find((node) => node.textContent === '开始这局').fire('click');
    const sources = board.querySelectorAll('.igs-mj-crowd .igs-mj-crop').map((node) => node.src);
    assert.deepEqual(sources.sort(), ['aya-calm', 'rin-nude-calm', 'saki-calm']);
    forgetMahjongTable();
});

test('gate:wait-stage:mahjong-resume-keeps-the-same-hand', async () => {
    forgetMahjongTable();
    const storage = memoryStorage();
    const open = () => {
        const doc = fakeDoc();
        const board = doc.createElement('div');
        doc.createElement('div').appendChild(board);
        startMahjong({ doc, board, storage, setNote() {}, requestClose() {} });
        return board;
    };
    const first = open();
    const seen = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('没有进入出牌')), 8000);
        const watch = setInterval(() => {
            if (!handText(first)) return;
            if (!first.querySelector('.is-hot') && !/自摸|荣和|吃|碰|杠/.test(first.textContent)) return;
            clearTimeout(timer);
            clearInterval(watch);
            resolve(handText(first));
        }, 40);
    });
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    forgetMahjongTable();
    const second = open();
    assert.equal(handText(second), seen);
    forgetMahjongTable();
});
