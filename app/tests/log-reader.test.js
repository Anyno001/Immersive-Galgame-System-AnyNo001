import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DIALOG_SKIN_CHOICES } from '../src/visual/igs-ui/dialog-skin-catalog.js';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { LOG_AVATAR_BOX, batchStartsUpTo, isContinuation, isLogReaderActive, logAvatarCrop, logRowsOf, logTextOf, nextBatchEnd, normalizeLogReaderSettings, sceneLabelOf } from '../src/visual/igs-ui/log-reader-model.js';
import { LOG_READER_THEMES, logThemeStyleText, resolveLogSkin } from '../src/visual/igs-ui/log-reader-theme.js';
import { getLogFrameStyleText } from '../src/visual/igs-ui/dialog-theme-item-frames.js';
import { logPartsStyleText } from '../src/visual/igs-ui/log-reader-parts.js';
import { createLogHtml, logCardsOf, logRenderSnapshot, logSettingsOf, logSkinOf } from '../src/visual/igs-ui/log-reader-view.js';
import { LOG_READER_STYLE_TEXT } from '../src/visual/igs-ui/log-reader-style.js';
import { TEXT_FX_STYLE_TEXT } from '../src/visual/igs-ui/text-fx.js';
import { finishLogReveal, syncLogReader, toggleLogEdit } from '../src/visual/igs-ui/log-reader-layer.js';

const page = (textType, segmentBody, extra = {}) => ({ textType, segmentBody, bubbleSpeaker: '', bubbleMood: '', sceneStateForBg: null, ...extra });

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

