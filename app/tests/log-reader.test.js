import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DIALOG_SKIN_CHOICES } from '../src/visual/igs-ui/dialog-skin-catalog.js';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { LOG_AVATAR_BOX, batchStartsUpTo, isContinuation, isLogReaderActive, logAvatarCrop, logRowsOf, logTextOf, nextBatchEnd, normalizeLogReaderSettings, sceneLabelOf } from '../src/visual/igs-ui/log-reader-model.js';
import { LOG_READER_THEMES, logThemeStyleText, resolveLogSkin } from '../src/visual/igs-ui/log-reader-theme.js';
import { getLogFrameStyleText } from '../src/visual/igs-ui/dialog-theme-item-frames.js';
import { logCardsOf, logRenderSnapshot, logSettingsOf, logSkinOf } from '../src/visual/igs-ui/log-reader-view.js';
import { LOG_READER_STYLE_TEXT } from '../src/visual/igs-ui/log-reader-style.js';
import { finishLogReveal, syncLogReader, toggleLogEdit } from '../src/visual/igs-ui/log-reader-layer.js';

const page = (textType, segmentBody, extra = {}) => ({ textType, segmentBody, bubbleSpeaker: '', bubbleMood: '', sceneStateForBg: null, ...extra });

test('设置默认值：默认关、圆角方、流水展开、每次 4 条、渐变 85%', () => {
    const s = normalizeLogReaderSettings(null);
    assert.equal(s.enabled, false);
    assert.equal(s.density, 100);
    assert.equal(s.moodSize, 'm');
    assert.equal(normalizeLogReaderSettings({ veil: 55, density: 50 }).veil, 55);
    assert.equal(normalizeLogReaderSettings({ enabled: true }).enabled, false, 'v0.37.61 默认开时存下的 enabled 不再生效');
    assert.equal(normalizeLogReaderSettings({ on: true }).enabled, true);
    assert.equal(normalizeLogReaderSettings({ density: 70 }).density, 70);
    assert.equal(s.avatarShape, 'card');
    assert.equal(s.reveal, 'flow');
    assert.equal(s.emotion, 'once');
    assert.equal(s.perTap, 4);
    assert.equal(s.veil, 85);
    assert.equal(s.userSide, 'same');
    assert.deepEqual(normalizeLogReaderSettings({ perTap: 9, veil: 50, avatarShape: 'x', adjust: { 阿吒: { x: 9, z: 0 } } }).adjust.阿吒, { x: 1.5, y: 0, z: 0.5 });
    assert.equal(normalizeLogReaderSettings({ perTap: 9 }).perTap, 5);
    assert.equal(normalizeLogReaderSettings({ perTap: 1 }).perTap, 1);
    assert.equal(normalizeFxReaderSettings({}).logReader.enabled, false);
    assert.equal(normalizeSettingsValue('readerSettings.logReader.perTap', '3'), 3);
    assert.equal(normalizeSettingsValue('readerSettings.logReader.chip', 'false'), false);
});

test('只在窄屏或内嵌长屏生效，漫画模式优先', () => {
    assert.equal(isLogReaderActive({ settings: { on: true }, width: 390, height: 844 }), true);
    assert.equal(isLogReaderActive({ settings: { on: true }, width: 1280, height: 800 }), false);
    assert.equal(isLogReaderActive({ settings: { on: true }, width: 1280, height: 800, phone: true }), true);
    assert.equal(isLogReaderActive({ settings: { on: true }, mode: 'embedded', embedded: true, width: 600, height: 900 }), true);
    assert.equal(isLogReaderActive({ settings: { on: true }, mode: 'embedded', embedded: true, width: 600, height: 400, phone: true }), false);
    assert.equal(isLogReaderActive({ settings: {}, width: 390, height: 844 }), false);
    assert.equal(isLogReaderActive({ settings: { on: true }, width: 390, height: 844, comic: true }), false);
});

test('分页计划转行：台词去引号、心里话去星号与名字、User 识别、换场景分隔线', () => {
    const pages = [
        page('narration', '雨还在下。', { sceneStateForBg: { scene: '教室', time: '傍晚' } }),
        page('dialogue', '“你来了。”', { bubbleSpeaker: '小雪', bubbleMood: '开心', sceneStateForBg: { scene: '教室', time: '傍晚' } }),
        page('thought', '*[小雪]：他会不会生气*', { bubbleSpeaker: '小雪', sceneStateForBg: { scene: '教室', time: '傍晚' } }),
        page('dialogue', '嗯。', { bubbleSpeaker: '我', sceneStateForBg: { scene: '街角奶茶店', time: '十分钟后' } }),
        page('system', '任务更新', { systemSpeaker: '系统', sceneStateForBg: { scene: '街角奶茶店', time: '十分钟后' } }),
    ];
    const rows = logRowsOf(pages, { keyOf: (n) => n, userKey: '我', showSystemName: true, solo: () => false });
    assert.deepEqual(rows.map((r) => r.kind), ['narr', 'dialogue', 'thought', 'dialogue', 'narr']);
    assert.equal(rows[1].text, '你来了。');
    assert.equal(rows[2].text, '他会不会生气');
    assert.equal(rows[3].user, true);
    assert.equal(rows[0].scene, '');
    assert.equal(rows[3].scene, '十分钟后 · 街角奶茶店');
    assert.equal(rows[4].label, '系统');
    assert.equal(isContinuation(rows, 2), true);
    assert.equal(isContinuation(rows, 3), false);
    assert.equal(logTextOf(page('dialogue', '「好」')), '好');
    assert.equal(sceneLabelOf({ scene: 'A', time: '夜' }, { scene: 'A', time: '夜' }), '');
});

test('一批最多 per 条，换场景与聊天页提前收批', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ index: i, scene: i === 6 ? '换场' : '', solo: i === 8 }));
    assert.equal(nextBatchEnd(rows, 0, 4), 4);
    assert.equal(nextBatchEnd(rows, 4, 4), 6);
    assert.equal(nextBatchEnd(rows, 6, 4), 8);
    assert.equal(nextBatchEnd(rows, 8, 4), 9);
    assert.deepEqual(batchStartsUpTo(rows, 7, 4), [0, 4, 6]);
    assert.deepEqual(batchStartsUpTo(rows, 0, 4), [0]);
});

test('头颈肩裁切：脸落在框中线和 faceY；偏移与缩放叠加', () => {
    const head = { x: 0.5, top: 0.1, w: 0.3 };
    const box = LOG_AVATAR_BOX.card;
    const base = logAvatarCrop(head, 2, box);
    const faceX = base.x + head.x * base.size;
    assert.ok(Math.abs(faceX - box.w / 2) < 0.2);
    const zoomed = logAvatarCrop(head, 2, box, { x: 0.5, y: 0, z: 2 });
    assert.ok(Math.abs(zoomed.size - base.size * 2) < 0.2);
    assert.ok(Math.abs((zoomed.x + head.x * zoomed.size) - (box.w / 2 + box.w * 0.5)) < 0.2);
});

test('配色表覆盖全部内置皮肤，全是实色，深色底不是棕色', () => {
    for (const [id] of DIALOG_SKIN_CHOICES) {
        const theme = LOG_READER_THEMES[id];
        assert.ok(theme, `缺少皮肤 ${id}`);
        for (const key of ['veil', 'ink', 'narr', 'thought', 'sub', 'line', 'plate']) assert.match(theme[key], /^#[0-9a-f]{6}$/i, `${id}.${key}`);
        assert.ok(['dark', 'light'].includes(theme.tone));
        if (theme.tone === 'dark') {
            const n = parseInt(theme.veil.slice(1), 16);
            const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            assert.ok(Math.max(r, g, b) <= 0x3a, `${id} 深色底太亮`);
            assert.ok(!(r > b + 8 && g > b + 4), `${id} 深色底偏棕`);
        }
        assert.equal(resolveLogSkin(id), id);
        assert.ok(logThemeStyleText().includes(`#igs-overlay[data-igs-log-skin="${id}"]`));
    }
    assert.equal(resolveLogSkin('没有这套'), 'default');
});

test('样式只作用在 log 模式下，不写死背景色到对话框之外', () => {
    assert.ok(LOG_READER_STYLE_TEXT.includes('#igs-overlay[data-igs-log-reader="on"] #igs-log{display:block'));
    assert.ok(LOG_READER_STYLE_TEXT.includes('igs-log-chip[data-kind="heart"]'));
    // 基础样式不描边；皮肤框（头像框、换场景卡、物品卡）借各皮肤自己的框线语言，另算。
    const base = LOG_READER_STYLE_TEXT.replace(getLogFrameStyleText(), '');
    assert.ok(!/border:1px solid/.test(base.replace(/border-top:1px (solid|dashed)/g, '')));
    assert.ok(getLogFrameStyleText().includes('[data-igs-dialog-skin="western-classic"] #igs-log .igs-log-card'));
    assert.ok(!getLogFrameStyleText().includes('igs-log-scene'), '换场景保持细线');
});

test('渲染副本：去立绘与同屏，关打字机、运镜、漫画泡、碰撞；通话照常只不放立绘；不改原快照', () => {
    const snapshot = { content: { spriteImage: 'a.png', castSprites: [{}] }, readerSettings: { typewriter: { enabled: true, speed: 3 }, fxTags: { enabled: true, call: true, clash: true }, stageCast: { enabled: true } } };
    const copy = logRenderSnapshot(snapshot);
    assert.equal(copy.content.spriteImage, null);
    assert.deepEqual(copy.content.castSprites, []);
    assert.equal(copy.readerSettings.typewriter.enabled, false);
    assert.equal(copy.readerSettings.titleCard.enabled, false, '不放地点标题卡');
    assert.equal(copy.readerSettings.typewriter.speed, 3);
    assert.equal(copy.readerSettings.fxTags.call, true, '通话不吞');
    assert.equal(copy.readerSettings.fxTags.callSprite, 'hide');
    assert.equal(copy.readerSettings.stageCast.enabled, false);
    assert.equal(snapshot.content.spriteImage, 'a.png');
    assert.equal(snapshot.readerSettings.typewriter.enabled, true);
});

test('物品与来电小卡片跟随原演出开关', () => {
    const p = { fx: { items: [{ action: 'gain', name: '钥匙' }], instants: [{ kind: 'call', name: '妈妈', dir: 'in', mode: 'voice' }] } };
    assert.deepEqual(logCardsOf(p, {}), []);
    const cards = logCardsOf(p, { itemFx: { enabled: true }, fxTags: { enabled: true } });
    assert.deepEqual(cards.map((c) => `${c.head}:${c.name}`), ['获得:钥匙', '来电:妈妈']);
});

function mountDom() {
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"><div id="igs-stage-motion"><div id="igs-dialog-layer"><div class="igs-dialog" id="igs-dialog"></div></div></div></div></body></html>', { pretendToBeVisual: true });
    return { dom, overlay: dom.window.document.getElementById('igs-overlay') };
}

function viewOf(rows, extra = {}) {
    return {
        floorKey: 'm1:1', rows, upto: rows.length - 1, batchStart: 0, live: -1, running: false, more: false,
        settings: normalizeLogReaderSettings(extra.settings), skin: 'gradient-veil', tone: 'dark', fonts: {}, hidden: false,
        avatarOf: () => null, symbolOf: (row) => (row.mood ? 'heart' : ''), chipKindOf: () => 'heart', htmlOf: (row) => row.text,
        canSpeak: extra.canSpeak || (() => false), cardsOf: () => [], onTap: extra.onTap || (() => {}), onPlay: extra.onPlay || (() => {}), onSaveAdjust: extra.onSaveAdjust || (() => {}),
        ...extra.view,
    };
}

test('DOM：同一人连续只显示一次头像，没开朗读不出 ▶，情绪胶囊只写字', () => {
    const { overlay } = mountDom();
    const rows = logRowsOf([
        page('dialogue', '一', { bubbleSpeaker: '小雪', bubbleMood: '心动' }),
        page('dialogue', '二', { bubbleSpeaker: '小雪' }),
        page('narration', '风吹过。'),
    ], { keyOf: (n) => n });
    syncLogReader(overlay, viewOf(rows));
    assert.equal(overlay.getAttribute('data-igs-log-reader'), 'on');
    const list = overlay.querySelectorAll('#igs-log .igs-log-row');
    assert.equal(list.length, 3);
    assert.ok(list[1].classList.contains('is-cont'));
    assert.ok(list[2].classList.contains('is-narr'));
    assert.equal(overlay.querySelectorAll('.igs-log-play').length, 0);
    assert.equal(overlay.querySelector('.igs-log-chip').textContent, '心动');
    assert.ok(overlay.querySelector('.igs-log-av .igs-fx-symbol[data-kind="heart"]'));
    syncLogReader(overlay, viewOf(rows, { canSpeak: (row) => row.kind !== 'narr' }));
    assert.equal(overlay.querySelectorAll('.igs-log-play').length, 0, '已渲染的行不重建');
});

test('换情绪另起一组出差分头像，同情绪续行不重复胶囊', () => {
    const { overlay } = mountDom();
    const rows = logRowsOf([
        page('dialogue', '一', { bubbleSpeaker: '小雪', bubbleMood: '喜悦' }),
        page('dialogue', '二', { bubbleSpeaker: '小雪', bubbleMood: '喜悦' }),
        page('dialogue', '三', { bubbleSpeaker: '小雪' }),
        page('dialogue', '四', { bubbleSpeaker: '小雪', bubbleMood: '得意' }),
    ], { keyOf: (n) => n });
    assert.deepEqual(rows.map((_, i) => isContinuation(rows, i)), [false, true, true, false]);
    syncLogReader(overlay, viewOf(rows, { view: { textEffect: { stroke: '1.6px rgba(0,0,0,0.2)', shadow: '' } } }));
    assert.deepEqual([...overlay.querySelectorAll('.igs-log-chip')].map((c) => c.textContent), ['喜悦', '得意']);
    assert.equal(overlay.querySelectorAll('.igs-log-row.is-cont .igs-log-name').length, 0);
    assert.ok(overlay.querySelectorAll('.igs-log-row')[3].classList.contains('is-same'), '同一人换情绪不画分割线');
    assert.equal(overlay.querySelector('#igs-log').getAttribute('data-mood-size'), 'm');
    assert.equal(overlay.querySelector('.igs-log-caret'), null, '窄屏不出批末符号');
    assert.equal(overlay.querySelector('#igs-log').style.getPropertyValue('--igs-log-stroke'), '1.6px rgba(0,0,0,0.2)');
    const plays = [];
    syncLogReader(overlay, viewOf(rows, { canSpeak: () => true, onPlay: (i) => plays.push(i), view: { floorKey: 'm1:2' } }));
    assert.equal(overlay.querySelectorAll('.igs-log-play').length, 2, '一组只有一个重播键');
    overlay.querySelector('.igs-log-play').dispatchEvent(new overlay.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(plays, [[0, 1, 2]], '连播整组');
});

test('DOM：有朗读时出 ▶ 并回调；点列表空白交给 host；退批删掉多出的行', () => {
    const { overlay, dom } = mountDom();
    const rows = logRowsOf([page('dialogue', '一', { bubbleSpeaker: 'A' }), page('dialogue', '二', { bubbleSpeaker: 'B' }), page('dialogue', '三', { bubbleSpeaker: 'C' })], { keyOf: (n) => n });
    const played = [];
    let taps = 0;
    syncLogReader(overlay, viewOf(rows, { canSpeak: () => true, onPlay: (i) => played.push(i), onTap: () => { taps += 1; } }));
    const play = overlay.querySelectorAll('.igs-log-play');
    assert.equal(play.length, 3);
    play[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(played, [[1]]);
    assert.equal(taps, 0);
    overlay.querySelector('.igs-log-text').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.equal(taps, 1);
    syncLogReader(overlay, viewOf(rows, { canSpeak: () => true, view: { upto: 0 } }));
    assert.equal(overlay.querySelectorAll('.igs-log-row').length, 1);
    syncLogReader(overlay, null);
    assert.equal(overlay.hasAttribute('data-igs-log-reader'), false);
});

test('DOM：出字可以被下一次点按补完；调整立绘保存才回调', async () => {
    const { overlay, dom } = mountDom();
    const rows = logRowsOf([page('dialogue', '很长的一句台词', { bubbleSpeaker: 'A' })], { keyOf: (n) => n });
    const saved = [];
    const result = syncLogReader(overlay, viewOf(rows, { onSaveAdjust: (a) => saved.push(a), view: { live: 0 } }));
    assert.ok(result.revealing);
    assert.ok(overlay.querySelectorAll('.igs-log-fl').length > 0);
    assert.equal(finishLogReveal(overlay), true);
    await result.revealing;
    assert.equal(overlay.querySelector('.igs-log-text').innerHTML, '很长的一句台词');
    assert.equal(toggleLogEdit(overlay), true);
    assert.ok(overlay.querySelector('#igs-log-edit-bar'));
    overlay.querySelector('[data-log-edit="save"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.equal(saved.length, 1);
    assert.equal(overlay.querySelector('#igs-log-edit-bar'), null);
});

test('魔法星夜：非魔法世界只有星银、墨夜两色，窄屏底色跟着配色走', async () => {
    const { magicHouseChoices, magicHouseFor } = await import('../src/visual/igs-ui/dialog-theme-css-skins.js');
    assert.deepEqual(magicHouseChoices('modern').map((h) => h.id), ['starlight', 'obsidian']);
    assert.equal(magicHouseChoices('magic').length > 2, true);
    assert.equal(magicHouseFor('scarlet', 'modern'), 'starlight');
    assert.equal(magicHouseFor('scarlet', 'magic'), 'scarlet');
    assert.equal(logSkinOf({ dialogSkin: 'magic-academy', magicHouse: 'obsidian' }).skin, 'magic-academy-obsidian');
    assert.equal(logSkinOf({ dialogSkin: 'magic-academy', magicHouse: 'scarlet', _worldview: 'magic' }).skin, 'magic-academy');
});

test('关了连续播放：点一下只出一条', () => {
    assert.equal(logSettingsOf({ logReader: { perTap: 4 } }).perTap, 4);
    assert.equal(logSettingsOf({ logReader: { perTap: 4, chain: false } }).perTap, 1);
});

test('往回翻：越过中线的场景报给 host，滑到底报最新一行', async () => {
    const { overlay, dom } = mountDom();
    const rows = logRowsOf([
        page('narration', 'A', { sceneStateForBg: { scene: '教室' } }),
        page('narration', 'B', { sceneStateForBg: { scene: '街角' } }),
    ], { keyOf: (n) => n, inherited: { scene: '走廊' } });
    const seen = [];
    syncLogReader(overlay, viewOf(rows, { view: { onSceneRow: (i) => seen.push(i) } }));
    const scroll = overlay.querySelector('.igs-log-scroll');
    scroll.dataset.autoUntil = '0';
    scroll.dispatchEvent(new dom.window.Event('scroll'));
    await new Promise((r) => setTimeout(r, 40));
    assert.deepEqual(seen, [1], 'jsdom 无布局，等同停在底部：报最新一行');
});

test('聊天页 / 卡片页：列表里是重播按钮，不漏占位符；没开聊天演出时转成文字', () => {
    const { overlay, dom } = mountDom();
    const pages = [page('narration', '[igs-chat#0]'), page('narration', '[igs-card#0]'), page('narration', '[igs-chat#1]')];
    const segs = ['[igs-chat#0]', '[igs-card#0]', '[igs-chat#1]'];
    const rows = logRowsOf(pages, { keyOf: (n) => n,
        solo: (i) => (i === 0 ? '重播聊天' : i === 1 ? '重看卡片' : ''),
        textOf: (i) => (i === 2 ? '小雪：在吗' : i === 0 ? '' : null) });
    assert.equal(rows[0].replay, '重播聊天');
    assert.equal(rows[2].text, '小雪：在吗');
    const jumped = [];
    syncLogReader(overlay, viewOf(rows, { view: { onReplay: (i) => jumped.push(i) } }));
    assert.equal(overlay.querySelectorAll('.igs-log-replay').length, 2);
    assert.ok(!overlay.querySelector('#igs-log').textContent.includes('[igs-'), '占位符不进列表');
    overlay.querySelector('.igs-log-replay').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(jumped, [0]);
    assert.equal(segs.length, 3);
});

test('离边距离：贴边 / 标准 / 宽松，默认标准', () => {
    assert.equal(normalizeLogReaderSettings({}).edge, 'normal');
    assert.equal(normalizeLogReaderSettings({ edge: 'flush' }).edge, 'flush');
    const { overlay } = mountDom();
    syncLogReader(overlay, viewOf(logRowsOf([page('narration', 'A')], {}), { settings: { edge: 'wide' } }));
    assert.equal(overlay.getAttribute('data-igs-log-edge'), 'wide');
});

test('调整立绘：编辑中再点一次工具栏按钮就保存', () => {
    const { overlay } = mountDom();
    const saved = [];
    syncLogReader(overlay, viewOf(logRowsOf([page('dialogue', '一', { bubbleSpeaker: 'A' })], { keyOf: (n) => n }), { onSaveAdjust: (a) => saved.push(a) }));
    assert.equal(toggleLogEdit(overlay), true);
    assert.equal(toggleLogEdit(overlay), true);
    assert.equal(saved.length, 1);
    assert.equal(overlay.querySelector('#igs-log-edit-bar'), null);
});

test('文字增强：描边画在字外（八向阴影），不用会吃进字形的 text-stroke', async () => {
    const { dialogTextEffectCss } = await import('../src/visual/igs-ui/dialog-text-effect.js');
    const fx = dialogTextEffectCss({ dialogTextEffect: 'outline', dialogTextEffectColor: '#000000', dialogTextEffectStrength: 20, dialogTextEffectSize: 0.8 });
    assert.equal(fx.stroke, '');
    assert.equal(fx.shadow.split('),').length, 8);
    assert.match(fx.shadow, /^0\.8px 0px 0 rgba\(0,0,0,0\.2\)/);
    assert.equal(dialogTextEffectCss({ dialogTextEffect: 'off' }).shadow, '');
});
