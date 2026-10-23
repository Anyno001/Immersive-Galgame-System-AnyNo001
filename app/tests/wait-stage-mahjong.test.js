import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl } from './helpers/fake-dom.js';
import Majiang from '@kobalab/majiang-core';
import { MAHJONG_STYLE, avatarCrop, collectCall, forgetMahjongTable, mahjongReactions, penaltyBrief, penaltyLosers, playMahjongSync, startMahjong } from '../src/visual/igs-ui/wait-stage-mahjong.js';
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

test('gate:wait-stage:mahjong-kan-on-a-discard-is-sent-as-a-call-the-engine-accepts', () => {
    const shoupai = Majiang.Shoupai.fromString('m555p123s456z1122');
    const player = {
        shoupai,
        _menfeng: 0,
        model: { lunban: 3 },
        allow_hule: () => false,
        get_gang_mianzi: (hand, tile) => hand.get_gang_mianzi(tile),
        get_peng_mianzi: (hand, tile) => hand.get_peng_mianzi(tile),
        get_chi_mianzi: (hand, tile) => hand.get_chi_mianzi(tile),
    };
    const offer = collectCall(player, { l: 3, p: 'm5' });
    const kan = offer.replies.find((item) => item.verb === '杠');
    const pon = offer.replies.find((item) => item.verb === '碰');
    assert.ok(kan && pon, '能碰也能杠时两个按钮都在');
    assert.equal(kan.reply.gang, undefined, '别家打的牌引擎不认 gang，发了就被当成跳过');
    assert.ok(Majiang.Game.get_gang_mianzi(Majiang.rule(), shoupai, 'm5-', 60, 0).includes(kan.reply.fulou));
});

test('gate:wait-stage:mahjong-toolbar-carries-the-back-and-next-floor-buttons', async () => {
    forgetMahjongTable();
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    let state = { back: '返回阅读', next: false, nextBusy: false };
    const listeners = new Set();
    const calls = [];
    const host = {
        state: () => state,
        back: () => calls.push('back'),
        next: () => calls.push('next'),
        onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
    const push = (next) => { state = next; for (const listener of [...listeners]) listener(state); };
    const model = { names: ['绫'], art: { sprites: [{ character: '绫', url: 'data:image/svg+xml,aya', mood: '笑' }], pictures: [] } };
    startMahjong({ doc, board, model, host, storage: memoryStorage(), setNote() {}, requestClose() {} });
    const back = () => board.querySelector('[aria-label="返回阅读"]');
    assert.ok(back(), '选人界面的工具栏里就有返回');
    back().fire('click');
    assert.deepEqual(calls, ['back']);
    for (const button of board.querySelectorAll('.igs-mj-person')) button.fire('click');
    board.querySelectorAll('.igs-ws-chip').find((node) => node.textContent === '开始这局').fire('click');
    assert.equal(listeners.size, 1, '换成牌桌后只剩牌桌那一份订阅');
    const tools = board.querySelector('.igs-mj-tools');
    assert.equal(tools.querySelector('[aria-label="返回阅读"]').hidden, false);
    const next = tools.querySelector('.is-next');
    assert.equal(next.hidden, true);
    push({ back: '', next: true, nextBusy: false });
    assert.equal(next.hidden, false);
    assert.equal(tools.querySelector('[aria-label="返回阅读"]').hidden, true);
    next.fire('click');
    assert.deepEqual(calls, ['back', 'next']);
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    forgetMahjongTable();
});

test('gate:wait-stage:mahjong-table-fills-wide-screens-and-drops-the-footer', () => {
    const units = MAHJONG_STYLE.match(/[\d.]+cqi/g) || [];
    assert.deepEqual(units, ['1cqi', '1cqi'], '牌桌尺寸只经 --igs-mj-u 换算，基准只在定义处出现');
    assert.match(MAHJONG_STYLE, /\.igs-ws-actions\{display:none!important;\}/);
    assert.match(MAHJONG_STYLE, /\.igs-mj-table\{width:min\(100cqw,100cqh \* 2\.4\);height:min\(100cqh,100cqw \* 9 \/ 16\)/);
    assert.match(MAHJONG_STYLE, /\.igs-mj-felt\{position:absolute;inset:0;/, '牌区画布铺满牌桌，16:9 的牌区在画布里居中，宽屏时两侧留给头像');
});

test('gate:wait-stage:mahjong-felt-is-one-canvas-without-the-diagonals', async () => {
    forgetMahjongTable();
    const doc = fakeDoc();
    const board = doc.createElement('div');
    doc.createElement('div').appendChild(board);
    startMahjong({ doc, board, storage: memoryStorage(), setNote() {}, requestClose() {} });
    const felt = board.querySelector('.igs-mj-felt');
    assert.equal(felt.tagName, 'canvas', '桌垫、牌河、牌墙、计分板画在同一张画布上');
    assert.equal(felt.children.length, 0);
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    assert.match(felt.getAttribute('aria-label'), /^牌桌 (东1局|开局)/, '画布上的局数和点数给读屏留一份');
    assert.equal(board.querySelector('.igs-mj-pond'), null);
    assert.doesNotMatch(MAHJONG_STYLE, /igs-mj-mat|igs-mj-plaque|igs-mj-pond/, '旧的 DOM 牌区连同桌垫对角线一起去掉');
    board.querySelector('.igs-ws-close').fire('click');
    forgetMahjongTable();
});

test('gate:wait-stage:mahjong-table-has-nothing-that-shakes-on-phones', () => {
    assert.doesNotMatch(MAHJONG_STYLE, /perspective\(|rotateX|rotate3d/, '牌区不做 3D 倾斜：每手重绘都要重新透视采样，手机上牌和计分板会抖');
    const outside = MAHJONG_STYLE.replace(/@media \(hover:hover\)\{[^{}]*\{[^{}]*\}\}/g, '');
    assert.doesNotMatch(outside, /:hover[^{]*\{[^}]*transform/, '悬停上浮只给有鼠标的设备，触屏点完会粘在手指底下');
    for (const name of ['igs-mj-say', 'igs-mj-act']) {
        const rules = MAHJONG_STYLE.match(new RegExp(`\\.${name}(\\.is-on)?\\{[^}]*\\}`, 'g')) || [];
        assert.ok(rules.length, name);
        for (const rule of rules) assert.doesNotMatch(rule, /transform|opacity|animation|transition:opacity/, `${name} 盖在牌桌画布上，出现收起都硬切：带动画就会临时成合成层，安卓上整张桌面闪一帧`);
    }
});

test('gate:wait-stage:mahjong-felt-canvas-stays-out-of-the-gpu-layers', async () => {
    const { createMahjongFelt } = await import('../src/visual/igs-ui/wait-stage-mahjong-felt.js');
    const asked = [];
    const doc = { createElement(tag) {
        const node = new FakeEl(this, tag);
        node.getContext = (kind, options) => { asked.push([kind, options]); return null; };
        return node;
    } };
    const felt = createMahjongFelt(doc, { faceSvg: () => null });
    assert.deepEqual(asked, [['2d', { willReadFrequently: true }]], 'CPU 画布像图片一样画进牌桌的层，上面的气泡、按钮出没不会让它闪');
    felt.destroy();
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
    assert.deepEqual(rival.strip, ['凛'], '成人向记下被罚的人，下一局换裸体');
    assert.equal(rival.nude, undefined, '这张图不替她脱，按她这一场穿的衣装画');
    assert.match(rival.description, /凛垫底/);
    assert.match(rival.description, /罚她学猫叫/);
    const self = penaltyBrief({ target: '你', punisher: '绫', request: '罚我请客', nsfw: true, stage: 'final' });
    assert.deepEqual(self.characters, ['绫']);
    assert.deepEqual(self.strip, []);
    assert.match(self.description, /第一名的绫来惩罚主角/);
    assert.match(self.description, /玩家补充：罚我请客/);
    const free = penaltyBrief({ target: '你', punisher: '绫', request: '  ' });
    assert.match(free.description, /怎么罚由绫按她的性格自己决定/);
    assert.doesNotMatch(free.description, /玩家补充|惩罚内容/);
    assert.match(free.caption, /由绫决定/);
    const hand = penaltyBrief({ target: '凛', punisher: '绫', request: '罚她唱歌' });
    assert.deepEqual(hand.strip, []);
    assert.doesNotMatch(hand.description, /全年龄|成人/);
    assert.doesNotMatch(rival.description, /成人|全年龄/, '成人向只决定下一局换不换裸体立绘，不写进这张图的提示词');
    assert.equal('nsfw' in rival, false, '开关只管下一局换不换裸体立绘，出图请求里没有它');
    const plain = penaltyBrief({ target: '凛', punisher: '绫', request: '罚她学猫叫', stage: 'final' });
    assert.equal(rival.description, plain.description, '开关开不开，这张图的要求一字不差');
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
    assert.deepEqual(pair.strip, ['凛', '咲']);
    assert.deepEqual(pair.outfits, { 凛: '礼服', 咲: '泳装' });
    assert.match(pair.description, /凛、咲并列垫底/);
    assert.match(pair.description, /每个人都要入镜/);
    const withMe = penaltyBrief({ targets: ['你', '凛'], punisher: '绫', request: '', nsfw: true, stage: 'final' });
    assert.deepEqual(withMe.characters, ['绫', '凛']);
    assert.deepEqual(withMe.strip, ['凛'], '玩家不画，同罚的角色照罚');
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
