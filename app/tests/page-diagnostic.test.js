import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPageDiagnostic, summarizeFx, summarizeImageRef } from '../src/visual/igs-ui/page-diagnostic.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';

const snapshot = (content = {}) => ({
    messageId: 12,
    readerSettings: { dialogSkin: 'qinglv' },
    content: {
        speaker: '林小雨', statusEmotion: '害羞', textType: 'dialogue', currentIndex: 1, segments: ['a', 'b', 'c'],
        text: '这是一句私密台词', fullText: '整楼正文', displayText: '林小雨: 这是一句私密台词',
        sceneLocation: '教室', sceneTime: '傍晚', sceneWeather: '晴', sourceKind: 'raw-text',
        spriteMatch: { character: '林小雨', mood: '害羞', outfit: '校服', source: 'none', quality: 'none', slot: '' },
        spriteImage: null,
        backgroundMatch: { source: 'library', quality: 'exact' },
        backgroundImage: 'https://cdn.example.com/bg.png?token=secret',
        fx: { instants: [{ kind: 'letter', args: ['亲爱的小雨……'] }], flashback: true, dream: false, daily: [], call: null },
        warnings: [{ code: 'forced-fallback', message: 'x' }],
        ...content,
    },
});

test('gate:page-diagnostic:explains-sprite-miss-and-background-hit-without-dialogue-text', () => {
    const text = buildPageDiagnostic(snapshot(), { version: '0.34.43', worldview: 'modern' });
    assert.match(text, /楼层 12 · 第 2\/3 页/);
    assert.match(text, /立绘 角色「林小雨」表情「害羞」服装「校服」 → 未命中/);
    assert.match(text, /背景 地点「教室」 → 生成图库，匹配度 exact，外链 cdn\.example\.com/);
    assert.match(text, /演出 instants\(letter\)、flashback/);
    assert.match(text, /提示 forced-fallback/);
    assert.doesNotMatch(text, /私密台词|整楼正文|亲爱的小雨|token=secret/);
});

test('gate:page-diagnostic:reports-cg-and-chat-page-reasons', () => {
    assert.match(buildPageDiagnostic(snapshot({ cgActive: true, illustrationSlot: 0 })), /挂着 CG，立绘让位[\s\S]*CG 显示中（槽位 0）/);
    assert.match(buildPageDiagnostic(snapshot({ chatPage: true })), /聊天 \/ 卡片页，不显示立绘/);
    assert.match(buildPageDiagnostic(snapshot({ spriteMatch: null, speaker: '旁白' })), /未进入立绘匹配/);
    assert.equal(buildPageDiagnostic(null), '');
});

test('gate:page-diagnostic:image-refs-never-carry-image-bodies-or-query-strings', () => {
    assert.equal(summarizeImageRef('data:image/png;base64,' + 'A'.repeat(4096)), '内嵌图(3KB)');
    assert.equal(summarizeImageRef('/user/images/igs-cg/abc.png'), 'user/images/igs-cg/abc.png');
    assert.equal(summarizeImageRef({ url: 'https://x.org/a.png?k=1' }), '外链 x.org');
    assert.equal(summarizeImageRef(''), '无');
    assert.deepEqual(summarizeFx({ items: [{ name: '钥匙' }], sense: '', solo: { target: '甲' } }), ['items×1', 'solo']);
});

test('gate:page-diagnostic:settings-button-copies-active-reader-page', async () => {
    const shown = [];
    let clip = '';
    const ctx = (activeReader, clipboardOk = true) => ({
        state: { activeReader, activeSettings: { draft: { bridge: { sceneAssets: { enabled: true, worldview: 'magic' } }, readerSettings: {} }, asyncState: {} } },
        options: { version: '9.9.9', global: { navigator: { clipboard: { writeText: async (t) => { if (!clipboardOk) throw new Error('denied'); clip = t; } } } } },
        dialogs: { view: async (m) => shown.push(['view', m]), edit: async (m, v) => shown.push(['edit', m, v]), confirm: async () => true },
        closeSettings: () => ({ ok: true }), persistSettingsDraft: () => ({ ok: true }), rerenderSettings: () => ({ ok: true }), buildRegexPreview: () => '',
    });
    await handleSettingsAction('copy-page-diagnostic', ctx({ snapshot: snapshot() }));
    assert.match(clip, /^\[IGS 本页诊断\] v9\.9\.9[\s\S]*世界观 magic/);
    assert.deepEqual(shown.at(-1).slice(0, 2), ['edit', '已复制到剪贴板，不含台词正文。']);
    await handleSettingsAction('copy-page-diagnostic', ctx({ snapshot: snapshot() }, false));
    assert.match(shown.at(-1)[1], /复制失败/);
    assert.match(shown.at(-1)[2], /立绘 角色「林小雨」/);
    await handleSettingsAction('copy-page-diagnostic', ctx(null));
    assert.match(shown.at(-1)[1], /先打开阅读器/);
});
