import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { prepareReaderFloor } from '../src/visual/igs-ui/reader-floor-plan.js';
import { prepareReaderFloorAssets } from '../src/visual/igs-ui/reader-floor-assets.js';

// 心魔页的主立绘解析到本体，不去找「心魔」这个角色。每页返回 spriteChar|说话人|心情。
function floorOf(lines) {
    const characters = { 林小雨: { 平和: 'u1', 害羞: 'u2' }, 苏晴: { 平和: 'u3' } };
    const assets = { enabled: true, characters, characterAliases: {} };
    const raw = [];
    const segments = [];
    for (const line of lines) {
        const m = line.match(/^(.+?)\|(.*?)\|(.+)$/);
        if (m) { raw.push(`[igs-char:${m[1]}|${m[2]}|${m[3]}]`); segments.push(`[${m[1]}]：${m[3]}`); } else { raw.push(line); segments.push(line); }
    }
    const source = raw.join('\n');
    const readerSettings = { _sceneAssets: assets };
    const floor = prepareReaderFloor({ text: segments.join('\n'), segments, extracted: { sceneDirectives: extractSceneDirectives(source).directives, markerLayoutSource: source },
        payload: { raw: source, recentCast: null }, scene: { speaker: '' }, readerSettings, userName: '林远' });
    prepareReaderFloorAssets(floor, { payload: {}, readerSettings, assetMatchCtx: {}, tableData: { revision: 0, prepareCharacters() {}, outfitClues: null } });
    return floor.pages.map((p) => `${p.spriteChar}|${p.bubbleSpeaker}|${p.spriteMood}`);
}

test('心魔页保留本体立绘，旁白继续沿用本体', () => {
    const got = floorOf(['林小雨|害羞|我不想去。', '心魔||你明明想去。', '林小雨|平和|闭嘴。', '林小雨的心魔||呵。', '夜很静。']);
    assert.deepEqual(got.map((s) => s.split('|')[0]), ['林小雨', '林小雨', '林小雨', '林小雨', '林小雨']);
    assert.equal(got[1].split('|')[1], '心魔');
    assert.equal(got[1].split('|')[2], '害羞');
});

test('第三人说话的页不受影响', () => {
    const got = floorOf(['林小雨|平和|你好。', '苏晴|平和|早。']);
    assert.deepEqual(got.map((s) => s.split('|')[0]), ['林小雨', '苏晴']);
});
