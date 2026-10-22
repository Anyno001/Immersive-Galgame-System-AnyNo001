import test from 'node:test';
import assert from 'node:assert/strict';
import { carriesAcrossScene, sceneCarryOf, narrationCastLeft } from '../src/scene/narration-sprite.js';
import { createNarrationNamer } from '../src/scene/narration-focus.js';
import { pickCastMembers } from '../src/scene/stage-cast.js';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { prepareReaderFloor } from '../src/visual/igs-ui/reader-floor-plan.js';
import { prepareReaderFloorAssets } from '../src/visual/igs-ui/reader-floor-assets.js';

const carry = (extra) => sceneCarryOf({ name: '小雪', others: ['白墨'], self: ['林远'], ...extra });

test('换场景：转场句里同行留下，独自 / 道别清掉', () => {
    assert.equal(carry({ before: '我和小雪一起走出了教室' }), 'company');
    assert.equal(carry({ before: '小雪牵着你的手走出校门' }), 'company');
    assert.equal(carry({ before: '你独自走出了教室' }), '');
    assert.equal(carry({ before: '你和小雪道别，走出了教室', ahead: [{ text: '小雪也在食堂。', by: '' }] }), '');
    // 别人独自离开不算这个人分开；否定的「不再一个人」不算分开。
    assert.equal(carry({ before: '白墨独自走了', ahead: [{ text: '小雪坐在长椅上。', by: '' }] }), 'ahead');
    assert.equal(carry({ before: '你不再一个人走出了教室，小雪跟在身边' }), 'company');
});

test('换场景：新场景开口或被写到留下，迟到入场与不在场的提法不留', () => {
    assert.equal(carry({ ahead: [{ text: '[小雪]：这里好安静。', by: 'own' }] }), 'ahead');
    assert.equal(carry({ ahead: [{ text: '图书馆里人不多。', by: '' }, { text: '小雪翻着一本书。', by: '' }] }), 'ahead');
    assert.equal(carry({ ahead: [{ text: '小雪推门进来，手里拿着伞。', by: '' }] }), '');
    assert.equal(carry({ ahead: [{ text: '小雪赶来时已经下雨了。', by: '' }] }), '');
    assert.equal(carry({ ahead: [{ text: '你想起小雪说过的话。', by: '' }] }), '');
    assert.equal(carry({ ahead: [{ text: '听说小雪也报了名。', by: '' }] }), '');
    assert.equal(carry({ ahead: [{ text: '手机上小雪的消息还没回。', by: '' }] }), '');
    // 别人先开口就不再往后看。
    assert.equal(carry({ ahead: [{ text: '[白墨]：来了？', by: 'other' }, { text: '小雪点头。', by: '' }] }), '');
});

test('换场景：没有任何证据时清掉', () => {
    assert.equal(carry({ before: '钟声响了', after: '图书馆里很安静', ahead: [{ text: '图书馆里很安静。', by: '' }] }), '');
    assert.equal(carriesAcrossScene({ name: '小雪', ahead: [] }), false);
});

const NAMER_CHARS = { 严尚义: { 平和: 'a' }, 白墨: { 平和: 'b' }, 小雪: { 平和: 'c' }, 林远: { 平和: 'd' } };
const namer = (extra = {}) => createNarrationNamer({ characters: NAMER_CHARS, aliases: { 严尚义: ['尚义嬷嬷'] }, userKey: '林远', ...extra });

const GENDER = { 严尚义: 'female', 白墨: 'male' };
const gendered = (map = GENDER) => namer({ genderOf: (key) => map[key] || '' });

const ASSETS = {
    enabled: true,
    characters: { 白墨: { 平和: 'u1', 愤怒: 'u2' }, 小雪: { 平和: 'u3' } },
    characterAliases: {},
    characterDna: { 白墨: { triggerWords: '1boy' } },
    generated: { characters: { 严尚义: { 平和: 'g1', 愤怒: 'g2' } }, characterAliases: { 严尚义: ['尚义嬷嬷'] } },
};

function floorOf(lines, { assets = ASSETS, userName = '林远', recentCast = null, stageCast } = {}) {
    const raw = [], segments = [];
    for (const line of lines) {
        if (line.startsWith('[igs-scene:')) { raw.push(line); continue; }
        const said = line.match(/^(.+?)\|(.*?)\|(.+)$/);
        if (said) { raw.push(`[igs-char:${said[1]}|${said[2]}|${said[3]}]`); segments.push(`[${said[1]}]：${said[3]}`); }
        else { raw.push(line); segments.push(line); }
    }
    const source = raw.join('\n');
    const extracted = { sceneDirectives: extractSceneDirectives(source).directives, markerLayoutSource: source };
    const readerSettings = { _sceneAssets: assets, stageCast: stageCast || { enabled: true } };
    return { floor: prepareReaderFloor({ text: segments.join('\n'), segments, extracted, payload: { raw: source, recentCast }, scene: { speaker: '' }, readerSettings, userName }), readerSettings };
}
const sprites = (floor) => floor.pages.map((p) => p.spriteChar || '-');

function staged(lines, opts) {
    const { floor, readerSettings } = floorOf(lines, opts);
    const tableData = { revision: 0, prepareCharacters() {}, outfitClues: null };
    prepareReaderFloorAssets(floor, { payload: {}, readerSettings, assetMatchCtx: {}, tableData });
    return floor;
}
const seats = (page) => page.cast.map((m) => `${m.character}${m.temp ? '*' : ''}@${m.order}`).sort();
