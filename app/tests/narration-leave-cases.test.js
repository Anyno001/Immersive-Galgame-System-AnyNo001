import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { prepareReaderFloor } from '../src/visual/igs-ui/reader-floor-plan.js';
import { prepareReaderFloorAssets } from '../src/visual/igs-ui/reader-floor-assets.js';
import { narrationCastLeft, createCastLeftTracker, namesOf } from '../src/scene/narration-sprite.js';

const CHARS = ['白墨', '小雪', '小雨', '林雪', '阿宁', '苏晴'];
const DNA = { 白墨: { triggerWords: '1boy' }, 小雪: { triggerWords: '1girl' }, 小雨: { triggerWords: '1girl' }, 林雪: { triggerWords: '1girl' }, 阿宁: { triggerWords: '1girl' }, 苏晴: { triggerWords: '1girl' } };

// 一楼跑完整条页计划，返回每页「主立绘|同屏名单」（名单排序，临时座位带 *）。
function floorOf(lines, { user = '', dna = true, mode, chars = CHARS, aliases = {}, userName = '林远' } = {}) {
    const characters = {};
    for (const c of chars) characters[c] = { 平和: 'u' + c };
    const assets = { enabled: true, userCharacter: user, characters, characterAliases: aliases, sceneCarryMode: mode, ...(dna ? { characterDna: DNA } : {}) };
    const raw = [], segments = [];
    for (const line of lines) {
        if (line.startsWith('[igs-scene:')) { raw.push(line); continue; }
        const said = line.match(/^(.+?)\|(.*?)\|(.+)$/);
        if (said) { raw.push(`[igs-char:${said[1]}|${said[2]}|${said[3]}]`); segments.push(`[${said[1]}]：${said[3]}`); } else { raw.push(line); segments.push(line); }
    }
    const source = raw.join('\n');
    const readerSettings = { _sceneAssets: assets, stageCast: { enabled: true } };
    const floor = prepareReaderFloor({ text: segments.join('\n'), segments, extracted: { sceneDirectives: extractSceneDirectives(source).directives, markerLayoutSource: source },
        payload: { raw: source, recentCast: null }, scene: { speaker: '' }, readerSettings, userName });
    prepareReaderFloorAssets(floor, { payload: {}, readerSettings, assetMatchCtx: {}, tableData: { revision: 0, prepareCharacters() {}, outfitClues: null } });
    return floor.pages.map(p => `${p.spriteChar}|${(p.cast || []).map(m => m.character + (m.temp ? '*' : '')).sort().join(',')}`);
}

// want：每页 '主立绘' 或 '主立绘|名单'（名单逗号分隔，不写则不检查）。
function check(lines, want, options) {
    const got = floorOf(lines, options);
    assert.equal(got.length, want.length, `页数 ${got.join(' / ')}`);
    want.forEach((w, i) => {
        const [sprite, cast] = w.split('|');
        const [gotSprite, gotCast] = got[i].split('|');
        assert.equal(gotSprite, sprite, `第 ${i + 1} 页主立绘：${got.join(' / ')}`);
        if (cast !== undefined) assert.equal(gotCast, cast.split(',').filter(Boolean).sort().join(','), `第 ${i + 1} 页同屏：${got.join(' / ')}`);
    });
}

test('离场：转身走进浴室算离场，走了出来才回来', () => {
    check(['小雪|平和|晚安。', '小雪转身走进浴室，水声哗哗响起。', '你靠在沙发上。', '水声停了。', '她披着浴巾走了出来。'], ['小雪|小雪', '|', '|', '|', '小雪|小雪']);
});

test('离场：走进走廊 / 走下楼梯 / 出去了 / 跑出教室', () => {
    check(['小雪|平和|好。', '小雪走向门口。', '她推开门，走进了走廊。', '走廊里空无一人。', '你沉默着。'], ['小雪', '小雪', '', '', '']);
    check(['小雪|平和|我先走了。', '小雪拎起包，快步走下楼梯。', '楼梯间里回荡着脚步声。', '你望着空荡荡的座位。'], ['小雪', '', '', '']);
    check(['小雪|平和|拜拜。', '小雪出去了。', '小雪回到家，换了鞋。', '窗外夕阳西下。'], ['小雪', '', '', '']);
    check(['小雪|平和|我讨厌你！', '小雪哭着跑出了教室。', '教室里一片死寂。', '你呆呆站着。'], ['小雪', '', '', '']);
});

test('离场：走出阴影这类比喻不算，走出来算回来', () => {
    check(['小雪|平和|我没事。', '小雪走出了阴影，终于露出笑容。', '她擦了擦眼泪。', '夕阳很美。'], ['小雪', '小雪', '小雪', '小雪']);
    check(['小雪|平和|等我。', '小雪走进更衣室。', '过了一会儿，小雪走了出来，换上了新衣服。', '她转了个圈。'], ['小雪', '小雪', '小雪', '小雪']);
});

test('离场：小雪走进教室仍是入场，离场后再走进教室算回来', () => {
    check(['白墨|平和|嗯。', '小雪走进教室。', '她放下书包。', '白墨看了她一眼。'], ['白墨', '小雪', '小雪', '白墨']);
    check(['小雪|平和|再见。', '小雪离开了教室。', '过了一会儿，小雪走进教室。', '她坐了下来。'], ['小雪', '', '小雪', '小雪']);
});

// 别名：小雪配 雪儿，写法全用别名。
const XUE = { aliases: { 小雪: ['雪儿'] } };
