import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { prepareReaderFloor } from '../src/visual/igs-ui/reader-floor-plan.js';
import { effectiveSceneAssets } from '../src/scene/asset-scope.js';

function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function makeCtx({ userCharacter = '', rename = '' } = {}) {
    const sceneAssets = { enabled: true, userCharacter, characters: { 白墨: { 平和: 'a' }, 小雪: { 平和: 'b' } }, characterAliases: {} };
    const draft = { bridge: { sceneAssets }, readerSettings: {} };
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: { expandedSceneSlots: new Set() } } },
        options: { global: { localStorage: memoryStorage(), prompt: () => rename, confirm: () => true, alert() {} } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, sceneAssets };
}

test('USER 立绘：同卡只一个，设为他人即覆盖，再点同一人清空', async () => {
    const { ctx, sceneAssets } = makeCtx();
    await handleSettingsAction('scene-set-user-char:白墨', ctx);
    assert.equal(sceneAssets.userCharacter, '白墨');
    await handleSettingsAction('scene-set-user-char:' + encodeURIComponent('小雪'), ctx);
    assert.equal(sceneAssets.userCharacter, '小雪');
    await handleSettingsAction('scene-set-user-char:' + encodeURIComponent('小雪'), ctx);
    assert.equal(sceneAssets.userCharacter, '');
});

function floorOf(lines, { userCharacter, userName = '林远' } = {}) {
    const assets = { enabled: true, userCharacter, characters: { 白墨: { 平和: 'u1' }, 小雪: { 平和: 'u3' } }, characterAliases: { 小雪: ['雪儿'] } };
    const raw = [], segments = [];
    for (const line of lines) {
        const said = line.match(/^(.+?)\|(.*?)\|(.+)$/);
        if (said) { raw.push(`[igs-char:${said[1]}|${said[2]}|${said[3]}]`); segments.push(`[${said[1]}]：${said[3]}`); }
        else { raw.push(line); segments.push(line); }
    }
    const source = raw.join('\n');
    const extracted = { sceneDirectives: extractSceneDirectives(source).directives, markerLayoutSource: source };
    const readerSettings = { _sceneAssets: assets, stageCast: { enabled: true } };
    const floor = prepareReaderFloor({ text: segments.join('\n'), segments, extracted, payload: { raw: source, recentCast: null }, scene: { speaker: '' }, readerSettings, userName });
    return { floor, assets };
}
