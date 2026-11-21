import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import fs from 'node:fs';
import { STICKER_CATALOG, STICKER_SETS, STICKER_DESC_MIN_SCORE, matchSticker, pickSticker, stickerLiveEmotions, stickerView } from '../src/stickers/sticker-catalog.js';
import { personaOfTraits } from '../src/stickers/sticker-persona.js';
import { replaceStickerTags, stickerHtml, stickerPlaceholderSvg, installStickerFallback } from '../src/stickers/sticker-render.js';
import { normalizeStickerSettings } from '../src/stickers/sticker-settings.js';
import { normalizeIgsDirectiveLayout, stickerTagsOf, stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { attachStickers } from '../src/visual/igs-ui/reader-floor-plan.js';
import { forumRepliesOf } from '../src/visual/igs-ui/forum-reader-model.js';
import { collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { logRowsOf } from '../src/visual/igs-ui/log-reader-model.js';
import { normalizeChatReaderSettings } from '../src/visual/igs-ui/chat-reader-settings.js';
import { syncChatReader } from '../src/visual/igs-ui/chat-reader-layer.js';
import { CHAT_READER_STYLE_TEXT } from '../src/visual/igs-ui/chat-reader-style.js';
import { addStickerEmotion, renderStickerBrowser, resetSticker, setStickerDesc, stickerGroups, toggleStickerEmotion, toggleStickerKey } from '../src/stickers/sticker-browser.js';
import { stickerPromptBlock } from '../src/stickers/sticker-prompt.js';
import { FORUM_PALETTES, forumPaletteColors } from '../src/visual/igs-ui/forum-reader-palettes.js';
import { syncForumReader } from '../src/visual/igs-ui/forum-reader-layer.js';
import { normalizeForumReaderSettings } from '../src/visual/igs-ui/forum-reader-settings.js';
import { SETTINGS_PAGES } from '../src/visual/igs-ui/settings-pages.js';
import { searchSettings } from '../src/visual/igs-ui/settings-search.js';
import { renderFxFeatureFields } from '../src/visual/igs-ui/fx-settings-fields.js';
import { FORUM_READER_STYLE_TEXT } from '../src/visual/igs-ui/forum-reader-style.js';

test('清单共 24 个情绪，大笑并入开心，新增五个', () => {
    assert.equal(STICKER_CATALOG.length, 24);
    assert.equal(new Set(STICKER_CATALOG.map((s) => s.id)).size, 24);
    assert.equal(matchSticker('大笑'), null);
    for (const id of ['cute', 'innocent', 'breakdown', 'scared', 'slack']) assert.ok(STICKER_CATALOG.some((s) => s.id === id), id);
    for (const alias of ['哈哈', '笑死', '爆笑']) assert.equal(matchSticker(alias).id, 'happy');
});

test('情绪匹配：情绪名、近义词、id，不中的名字返回 null', () => {
    assert.equal(matchSticker('开心').id, 'happy');
    assert.equal(matchSticker('星星眼').id, 'expect');
    assert.equal(matchSticker('……').id, 'speechless');
    assert.equal(matchSticker('ok').id, 'ok');
    assert.equal(matchSticker('OK').id, 'ok');
    assert.equal(matchSticker('cheer').id, 'cheer');
    assert.equal(matchSticker(' 情绪：撒娇 ').id, 'cute');
    assert.equal(matchSticker('不存在的情绪'), null);
    assert.equal(pickSticker('不存在的情绪'), null);
    assert.equal(pickSticker(''), null);
});

test('挑图：自带的 catalog 时优先 persona 相符，否则按 seed 稳定挑一张', () => {
    const catalog = [{ id: 'happy', name: '开心', aliases: [], images: [
        { file: 'happy-1.webp', desc: '', persona: ['软萌'] },
        { file: 'happy-2.webp', desc: '', persona: ['傲娇'] },
        { file: 'happy-3.webp', desc: '', persona: [] },
    ] }];
    assert.equal(pickSticker('开心', { persona: ['傲娇'], seed: 'x', catalog }).image.file, 'happy-2.webp');
    const a = pickSticker('开心', { persona: ['冷酷'], seed: '小雪#3', catalog });
    assert.equal(pickSticker('开心', { persona: ['冷酷'], seed: '小雪#3', catalog }).image.file, a.image.file);
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(pickSticker('开心', { seed: `n${i}`, catalog }).image.file);
    assert.ok(seen.size > 1);
});

test('设置默认值与规范化', () => {
    assert.deepEqual(normalizeStickerSettings(undefined), { on: true, freq: 'low', disabled: [], set: 'daimao', overrides: {} });
    assert.deepEqual(normalizeStickerSettings({ on: false, freq: 'high', set: 'nga' }), { on: false, freq: 'high', disabled: [], set: 'nga', overrides: {} });
    assert.equal(normalizeStickerSettings({ freq: 'x', set: 'zzz' }).freq, 'low');
    assert.equal(normalizeStickerSettings({ set: 'zzz' }).set, 'daimao');
    assert.deepEqual(normalizeFxReaderSettings({}).stickers, { on: true, freq: 'low', disabled: [], set: 'daimao', overrides: {} });
});

test('剥离：标签在所有默认出口都看不到，含全角写法与回帖内嵌', () => {
    assert.equal(stripMarkerDirectives('你好[igs-sticker:开心]呀'), '你好呀');
    assert.equal(stripMarkerDirectives('【igs-sticker：开心】'), '');
    assert.equal(stripMarkerDirectives('[igs-reply:路人|笑死 [igs-sticker:开心]]'), '');
    assert.equal(stripMarkerDirectives('[igs-reply:路人|a [igs-sticker:开心] b [igs-sticker:哭哭]]后'), '后');
});

test('台词里内嵌的标签挪到指令后面，不再提前收口', () => {
    const out = normalizeIgsDirectiveLayout('[igs-char:小雪|害羞|谢谢你 [igs-sticker:害羞]]');
    assert.equal(out, '[igs-char:小雪|害羞|谢谢你][igs-sticker:害羞]');
});

test('归属：台词后同行、单独成行算上一个说话人，心里话与开头无说话人丢弃，不认识的情绪静默丢弃', () => {
    const source = '[igs-sticker:开心]\n旁白。\n[igs-char:小雪|害羞|谢谢你。][igs-sticker:害羞]\n[igs-sticker:不存在]\n[igs-sticker:ok]\n[igs-thought:小雪|心想]\n[igs-sticker:哭哭]';
    const at = (needle) => source.indexOf(needle);
    const pages = [
        { textType: 'narration', bubbleSpeaker: '' },
        { textType: 'dialogue', bubbleSpeaker: '小雪' },
        { textType: 'thought', bubbleSpeaker: '小雪' },
    ];
    attachStickers(pages, [at('旁白'), at('谢谢你'), at('心想')], source);
    assert.equal(pages[0].stickers, undefined);
    // 不认识的情绪名也先记下（可能是画面描述），渲染时对不上图才静默丢弃。
    assert.deepEqual(pages[1].stickers.map((s) => s.id), ['shy', '', 'ok']);
    assert.equal(stickerHtml(pages[1].stickers[1].name), '');
    assert.equal(pages[2].stickers, undefined);
    assert.deepEqual(stickerTagsOf(source).map((t) => t.name), ['开心', '害羞', '不存在', 'ok', '哭哭']);
});

test('论坛回帖正则允许内嵌表情包：带 1 个、2 个、以及与 | 字段组合都不截断', () => {
    const one = forumRepliesOf('[igs-reply:路人|笑死 [igs-sticker:开心]]');
    assert.deepEqual(one.map((r) => r.text), ['笑死 [igs-sticker:开心]']);
    const two = forumRepliesOf('[igs-reply:路人|[igs-sticker:开心] 好耶 [igs-sticker:加油]]');
    assert.deepEqual(two.map((r) => r.text), ['[igs-sticker:开心] 好耶 [igs-sticker:加油]']);
    const full = forumRepliesOf('[igs-reply:路人乙|>2|#那句话|真的吗 [igs-sticker:疑问]] [igs-reply:楼主|>1|是的]');
    assert.deepEqual(full.map((r) => [r.who, r.to, r.cite, r.text]), [['路人乙', 2, '那句话', '真的吗 [igs-sticker:疑问]'], ['楼主', 1, '', '是的']]);
});

test('渲染 HTML：认识的出真实图片（加载失败才用占位 SVG），不认识的丢弃，文本里的标签被替换', () => {
    const html = stickerHtml('开心', { cls: 'x' });
    assert.ok(html.includes('class="igs-sticker x"') && html.includes('<img') && html.includes('/assets/stickers/daimao/dm-') && !html.includes('<svg'));
    assert.equal(stickerHtml('不存在'), '');
    assert.equal(replaceStickerTags('前[igs-sticker:不存在]后'), '前后');
    assert.ok(replaceStickerTags('前[igs-sticker:害羞]后').includes('data-sticker="shy"'));
    // 占位生成函数保留，颜色走变量；加载失败时换成占位卡
    assert.ok(stickerPlaceholderSvg('开心').includes('var(--igs-sticker-ph-bg'));
    const dom = new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`);
    const doc = dom.window.document;
    installStickerFallback(doc);
    installStickerFallback(doc);
    doc.querySelector('img').dispatchEvent(new dom.window.Event('error'));
    assert.ok(doc.querySelector('.igs-sticker svg.igs-sticker-ph') && !doc.querySelector('.igs-sticker img'));
});

test('提示词：只在线上聊天或论坛开着且开关开着时出现，两种都开时清单只写一次', () => {
    const find = (rs) => collectGrammarBlocks(rs).find((b) => b.key === 'sticker');
    assert.equal(find({}), undefined);
    assert.equal(find({ chatReader: { on: false }, forumReader: { on: false } }), undefined);
    assert.equal(find({ chatReader: { on: true }, stickers: { on: false } }), undefined);
    const chat = find({ chatReader: { on: true } }).full;
    assert.ok(chat.includes('线上聊天里') && chat.includes('开心、') && chat.includes('摆烂') && !chat.includes('大笑'));
    assert.ok(chat.includes('高冷、寡言或古代背景的人物少发或不发') && chat.includes('亲昵类表情（如喜欢、抱抱）只对亲近的人发') && chat.includes('视为上一位说话人所发') && chat.includes('跟在有文字的台词之后'));
    assert.ok(chat.includes('本轮最多一两个'));
    assert.ok(collectGrammarBlocks({ chatReader: { on: true } }, { ancient: true }).find((b) => b.key === 'sticker').full.includes('古代背景几乎不发'));
    assert.ok(!chat.includes('[igs-reply'));
    const forum = find({ forumReader: { on: true }, stickers: { on: true, freq: 'high' } }).full;
    assert.ok(forum.includes('[igs-reply:') && forum.includes('几乎每句都可以带，仍按人物性格取舍'));
    const both = find({ chatReader: { on: true }, forumReader: { on: true } }).full;
    assert.equal(both.split('可用情绪名').length - 1, 1);
    assert.ok(both.includes('线上聊天示例') && both.includes('论坛回帖'));
});

const page = (textType, segmentBody, extra = {}) => ({ textType, segmentBody, bubbleSpeaker: '', bubbleMood: '', sceneStateForBg: null, ...extra });

test('chatReader：文字气泡后同组连发无底色的图片气泡，头像只一个；样式用变量', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"><div id="igs-stage-motion"><div id="igs-dialog-layer"><div class="igs-dialog" id="igs-dialog"></div></div></div></div></body></html>');
    const overlay = dom.window.document.getElementById('igs-overlay');
    const rows = logRowsOf([
        page('dialogue', '谢谢你。', { bubbleSpeaker: '小雪', stickers: [{ id: 'shy', name: '害羞', at: 'end' }, { id: 'nope', name: '不存在', at: 'end' }] }),
    ], { keyOf: (n) => n });
    syncChatReader(overlay, {
        floorKey: 'm1:1', rows, upto: 0, batchStart: 0, live: -1,
        settings: { ...normalizeChatReaderSettings(), adjust: {} }, skin: 'default', tone: 'dark', fonts: {}, hidden: false,
        avatarOf: () => null, symbolOf: () => '', chipKindOf: () => '', htmlOf: (row) => row.text,
        canSpeak: () => false, cardsOf: () => [], onTap: () => {}, onPlay: () => {}, onSaveAdjust: () => {},
    });
    const group = overlay.querySelector('.igs-cr-group');
    assert.equal(group.querySelectorAll('.igs-cr-av').length, 1);
    const bubbles = group.querySelectorAll('.igs-cr-bubble');
    assert.equal(bubbles.length, 2);
    assert.ok(bubbles[1].classList.contains('is-sticker'));
    assert.ok(bubbles[1].querySelector('.igs-sticker[data-sticker="shy"] img'));
    assert.ok(CHAT_READER_STYLE_TEXT.includes('--igs-cr-sticker-size:112px') && CHAT_READER_STYLE_TEXT.includes('--igs-cr-sticker-size:96px'));
    assert.ok(FORUM_READER_STYLE_TEXT.includes('--igs-fm-sticker-size:88px') && FORUM_READER_STYLE_TEXT.includes('--igs-fm-sticker-po-size:120px'));
});

test('停用的图不会被挑中；某情绪的图全部停用时等同名字不中', () => {
    const catalog = [{ id: 'happy', name: '开心', aliases: [], images: [
        { file: 'happy-1.webp', desc: '', persona: [] },
        { file: 'happy-2.webp', desc: '', persona: [] },
        { file: 'happy-3.webp', desc: '', persona: [] },
    ] }];
    for (let i = 0; i < 40; i++) {
        const hit = pickSticker('开心', { seed: `s${i}`, catalog, disabled: ['happy-1.webp', 'happy-3'] });
        assert.equal(hit.image.file, 'happy-2.webp');
    }
    assert.equal(pickSticker('开心', { seed: 'a', catalog, disabled: ['happy-1.webp', 'happy-2', 'happy-3'] }), null);
    const real = stickerView('daimao').catalog.find((s) => s.id === 'happy').images.map((i) => i.file);
    assert.equal(pickSticker('开心', { seed: 'a', disabled: real }), null);
    assert.equal(stickerHtml('开心', { disabled: real }), '');
    assert.equal(replaceStickerTags('前[igs-sticker:开心]后', { disabled: real }), '前后');
    assert.deepEqual(normalizeStickerSettings({ disabled: ['a', 'a', '', 5, ' b '] }).disabled, ['a', 'b']);
});

test('表情包子页：按套组、情绪分组，未分类单列；停用与改过的图带标记，不写署名', () => {
    const daimao = stickerView('daimao');
    const target = daimao.pool.find((i) => i.emotions.includes('shy')).file;
    const html = renderStickerBrowser({ disabled: [target], overrides: { [target]: { desc: '改过' } } });
    assert.ok(html.includes('呆猫八条（449）') && html.includes('NGA AC娘（60）'));
    assert.equal((html.match(/data-action="sticker-edit:/g) || []).length, 449 + 60);
    assert.ok(html.includes('未分类（55）'));
    assert.equal((html.match(/igs-sticker-tile is-off/g) || []).length, 1);
    assert.equal((html.match(/igs-sticker-edit-mark/g) || []).length, 1);
    assert.ok(!html.includes('小红书') && !html.includes('NGA同款'));
    // 点开一张图：出现编辑菜单（24 个情绪按钮、新增情绪、描述、停用、恢复默认）
    const open = renderStickerBrowser({}, { editing: target });
    assert.equal((open.match(/data-action="sticker-emo:/g) || []).length, 24);
    for (const part of ['data-sticker-new', 'data-sticker-desc', 'sticker-edit-close', `sticker-toggle:${target}`, `sticker-reset:${target}`, `sticker-emo-add:${target}`, `sticker-desc-save:${target}`]) assert.ok(open.includes(part), part);
    assert.deepEqual(toggleStickerKey([], 'a-1'), ['a-1']);
    assert.deepEqual(toggleStickerKey(['a-1', 'b'], 'a-1'), ['b']);
    // 分组：一图归在第一个情绪下
    assert.equal(stickerGroups(daimao).reduce((n, g) => n + g.images.length, 0), 449);
});

test('表情包子页已登记为设置页，设置搜索搜得到，聊天与论坛设置里有进入按钮', () => {
    assert.ok(SETTINGS_PAGES.some((p) => p[0] === 'stickers' && p[2] === 'perf'));
    const hit = searchSettings('表情包');
    assert.ok(hit.some((r) => r.page === 'stickers' || (r.target && r.target.page === 'stickers')), JSON.stringify(hit).slice(0, 300));
    const fields = renderFxFeatureFields(normalizeFxReaderSettings({ chatReader: { on: true }, forumReader: { on: true } }));
    for (const part of [fields.chatReader, fields.forumReader]) {
        assert.ok(part.includes('data-page="stickers"') && part.includes('readerSettings.stickers.on') && part.includes('readerSettings.stickers.freq'));
    }
});

test('只有表情没有文字的台词：不出垃圾页，标签改写成带说话人，聊天里表情归该说话人', () => {
    const raw = '[igs-char:阿明|平和|[igs-sticker:好的]]';
    assert.equal(normalizeIgsDirectiveLayout(raw), '[igs-sticker:好的|阿明]');
    assert.equal(normalizeIgsDirectiveLayout('[igs-char:阿明|平和|[igs-sticker:好的][igs-sticker:开心]]'), '[igs-sticker:好的|阿明][igs-sticker:开心|阿明]');
    // 普通 VN：整段分页后没有任何页面，标签也被剥掉
    const payload = buildIgsTextPayload({ mes: `[igs-char:小雪|害羞|谢谢你。]
${raw}\n[igs-char:小雪|开心|嗯！]` }, {});
    assert.deepEqual(payload.textSegments, ['[小雪]：谢谢你。', '[小雪]：嗯！'].map((x) => payload.textSegments.find((y) => y.includes(x.slice(-3))) || x));
    assert.equal(payload.textSegments.length, 2);
    // 原文里的标签（未改写）也能认出说话人
    const source = '[igs-char:小雪|害羞|谢谢你。]\n[igs-char:阿明|平和|[igs-sticker:好的]]\n[igs-char:小雪|开心|嗯！]';
    assert.equal(stickerTagsOf(source)[0].speaker, '阿明');
    const pages = [{ textType: 'dialogue', bubbleSpeaker: '小雪' }, { textType: 'dialogue', bubbleSpeaker: '小雪' }];
    attachStickers(pages, [source.indexOf('谢谢你'), source.indexOf('嗯！')], source);
    assert.equal(pages[0].stickers[0].by, '阿明');
    assert.equal(pages[1].stickers, undefined);
    // 紧邻的说话页就是他本人时直接算他的
    const same = [{ textType: 'dialogue', bubbleSpeaker: '阿明' }];
    attachStickers(same, [0], '[igs-char:阿明|平和|好。]\n[igs-sticker:好的|阿明]');
    assert.equal(same[0].stickers[0].by, undefined);
    const rows = logRowsOf(pages.slice(0, 1).map((p) => ({ ...p, segmentBody: '谢谢你。', bubbleMood: '', sceneStateForBg: null })), { keyOf: (n) => n, userKey: '阿明' });
    assert.equal(rows[0].stickers.length, 0);
    assert.deepEqual([rows[0].stickerSays[0].speaker, rows[0].stickerSays[0].user], ['阿明', true]);
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"><div id="igs-stage-motion"><div id="igs-dialog-layer"><div class="igs-dialog" id="igs-dialog"></div></div></div></div></body></html>');
    const overlay = dom.window.document.getElementById('igs-overlay');
    syncChatReader(overlay, {
        floorKey: 'm1:2', rows, upto: 0, batchStart: 0, live: -1,
        settings: { ...normalizeChatReaderSettings(), adjust: {} }, skin: 'default', tone: 'dark', fonts: {}, hidden: false,
        avatarOf: () => null, symbolOf: () => '', chipKindOf: () => '', htmlOf: (row) => row.text,
        canSpeak: () => false, cardsOf: () => [], onTap: () => {}, onPlay: () => {}, onSaveAdjust: () => {},
    });
    const groups = overlay.querySelectorAll('.igs-cr-group');
    assert.equal(groups.length, 2);
    assert.ok(groups[1].classList.contains('is-right') && groups[1].querySelector('.igs-sticker[data-sticker="ok"]'));
    // 只有表情的组与普通说话页一样取头像并涂上
    const av2 = group2Avatar(rows);
    assert.ok(av2.querySelector('.igs-cr-av').dataset.url === 'av.png' && av2.querySelector('.igs-cr-av').style.backgroundImage.includes('av.png'));
});

test('聊天右侧（User 一侧）的表情包同样无底色无内边距无尾巴', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"><div id="igs-stage-motion"><div id="igs-dialog-layer"><div class="igs-dialog" id="igs-dialog"></div></div></div></div></body></html>');
    const overlay = dom.window.document.getElementById('igs-overlay');
    const rows = logRowsOf([page('dialogue', '好呀。', { bubbleSpeaker: '我', stickers: [{ id: 'ok', name: '好的', at: 'end' }] })], { keyOf: (n) => n, userKey: '我' });
    syncChatReader(overlay, {
        floorKey: 'm1:3', rows, upto: 0, batchStart: 0, live: -1,
        settings: { ...normalizeChatReaderSettings(), adjust: {} }, skin: 'default', tone: 'dark', fonts: {}, hidden: false,
        avatarOf: () => null, symbolOf: () => '', chipKindOf: () => '', htmlOf: (row) => row.text,
        canSpeak: () => false, cardsOf: () => [], onTap: () => {}, onPlay: () => {}, onSaveAdjust: () => {},
    });
    const group = overlay.querySelector('.igs-cr-group.is-right');
    assert.ok(group.querySelector('.igs-cr-bubble.is-sticker'));
    const rule = CHAT_READER_STYLE_TEXT.split('\n').find((l) => l.includes('.igs-cr-bubble.is-sticker{'));
    assert.ok(rule.includes(':is(.is-left,.is-right)') && /padding:0;background:none;box-shadow:none;border-radius:0/.test(rule));
    assert.ok(CHAT_READER_STYLE_TEXT.includes('.igs-cr-bubble.is-sticker::before'));
});

function group2Avatar(rows) {
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"><div id="igs-stage-motion"><div id="igs-dialog-layer"><div class="igs-dialog" id="igs-dialog"></div></div></div></div></body></html>');
    const overlay = dom.window.document.getElementById('igs-overlay');
    const saysRows = rows.map((r) => ({ ...r, stickerSays: r.stickerSays.map((x) => ({ ...x, user: false })) }));
    syncChatReader(overlay, {
        floorKey: 'm1:9', rows: saysRows, upto: 0, batchStart: 0, live: -1,
        settings: { ...normalizeChatReaderSettings(), adjust: {} }, skin: 'default', tone: 'dark', fonts: {}, hidden: false,
        avatarOf: (r) => ({ url: 'av.png', adjustKey: r.key }), symbolOf: () => '', chipKindOf: () => '', htmlOf: (row) => row.text,
        canSpeak: () => false, cardsOf: () => [], onTap: () => {}, onPlay: () => {}, onSaveAdjust: () => {},
    });
    return overlay.querySelector('.igs-cr-group[data-says]');
}

// ---- 正式素材（呆猫八条 / NGA AC娘）、描述匹配、套组、用户自定义含义 ----

const assetUrl = (dir, file) => new URL(`../assets/stickers/${dir}/${file}`, import.meta.url);
const loadedPage = (type, body, extra = {}) => ({ textType: type, segmentBody: body, bubbleSpeaker: '', bubbleMood: '', sceneStateForBg: null, ...extra });

test('正式素材：数据与图片文件一一对应，AC娘原样保留（PNG、原始宽高）', () => {
    const { daimao, nga } = STICKER_SETS;
    assert.equal(daimao.items.length, 449);
    assert.equal(nga.items.length, 60);
    for (const item of daimao.items) {
        assert.ok(fs.existsSync(assetUrl('daimao', item.file)), item.file);
        assert.ok(/^dm-[0-9a-f]+\.webp$/.test(item.file));
    }
    for (const item of nga.items) {
        const buf = fs.readFileSync(assetUrl('nga', item.file));
        assert.equal(buf.toString('latin1', 1, 4), 'PNG', item.file);
        assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [item.w, item.h], item.file);
        assert.ok(item.w >= 60 && item.w <= 80 && item.h <= 70);
    }
    assert.equal(fs.readdirSync(new URL('../assets/stickers/nga/', import.meta.url)).filter((f) => f.endsWith('.png')).length, 91);
    assert.ok(fs.existsSync(assetUrl('daimao', '来源.md')) && fs.existsSync(assetUrl('nga', '来源.md')));
});

test('未分类（没有情绪的图）：用情绪名、近义词、id 都挑不到', () => {
    const view = stickerView('daimao');
    const loose = view.pool.filter((i) => !i.emotions.length);
    assert.equal(loose.length, 55);
    const looseFiles = new Set(loose.map((i) => i.file));
    for (const s of STICKER_CATALOG) {
        // 呆猫八条目前没有「困」的图（清单与提示词里自然不列它）；其余 23 个情绪都有图。
        if (s.id === 'sleepy') { assert.equal(view.catalog.find((c) => c.id === s.id).images.length, 0); assert.equal(pickSticker(s.name, { seed: 'a' }), null); continue; }
        assert.ok(view.catalog.find((c) => c.id === s.id).images.length > 0, `${s.name} 没有图`);
        for (const key of [s.name, ...s.aliases, s.id]) {
            for (let i = 0; i < 25; i++) {
                const hit = pickSticker(key, { seed: `u${i}` });
                assert.ok(hit && !looseFiles.has(hit.image.file) && hit.image.emotions.includes(s.id), `${key}`);
            }
        }
    }
});

test('AC娘套组：21 个情绪有图，困、晚安、抱抱没有；没有图的情绪不显示，也不退回呆猫八条', () => {
    const view = stickerView('nga');
    assert.deepEqual(stickerLiveEmotions(view).map((s) => s.id).sort(), STICKER_CATALOG.map((s) => s.id).filter((id) => !['sleepy', 'night', 'hug'].includes(id)).sort());
    for (const name of ['困', '晚安', '抱抱', '打哈欠', '贴贴']) {
        assert.equal(pickSticker(name, { set: 'nga', seed: 'a' }), null, name);
        assert.equal(stickerHtml(name, { set: 'nga', seed: 'a' }), '', `${name} 不应出图`);
    }
    assert.ok(stickerHtml('晚安', { set: 'daimao', seed: 'a' }).includes('/daimao/'));
    const html = stickerHtml('开心', { set: 'nga', seed: 'a' });
    assert.ok(html.includes('igs-sticker is-inline') && html.includes('/assets/stickers/nga/') && /--sw:\d+;--sh:\d+/.test(html) && /width="\d+" height="\d+"/.test(html));
});

test('persona 优先：人物性格相符的图优先；性格未知或没有相符的图时按种子稳定挑', () => {
    const view = stickerView('daimao');
    const emotion = view.catalog.find((s) => s.images.some((i) => i.persona.includes('傲娇')) && s.images.some((i) => !i.persona.includes('傲娇')));
    assert.ok(emotion);
    for (let i = 0; i < 30; i++) {
        const hit = pickSticker(emotion.name, { persona: ['傲娇'], seed: `p${i}` });
        assert.ok(hit.image.persona.includes('傲娇'));
    }
    const mixed = new Set();
    for (let i = 0; i < 60; i++) mixed.add(pickSticker(emotion.name, { seed: `p${i}` }).image.persona.includes('傲娇'));
    assert.equal(mixed.size, 2);
    assert.equal(pickSticker('开心', { persona: ['不存在的性格'], seed: 'k' }).image.file, pickSticker('开心', { seed: 'k' }).image.file);
    assert.equal(pickSticker('开心', { persona: ['软萌'], seed: '小雪#3' }).image.file, pickSticker('开心', { persona: ['软萌'], seed: '小雪#3' }).image.file);
    assert.deepEqual(personaOfTraits(['傲娇', '毒舌', '黏人']), ['傲娇', '黏人']);
    assert.deepEqual(personaOfTraits(['不认识的特质']), []);
    assert.deepEqual(personaOfTraits(null), []);
});

test('描述匹配：标签内容可以是画面描述；低分静默丢弃；未分类的图可被描述命中；结果稳定', () => {
    assert.ok(STICKER_DESC_MIN_SCORE > 0.2 && STICKER_DESC_MIN_SCORE < 0.7);
    const wall = pickSticker('躲在墙后偷看', { seed: 'a' });
    assert.ok(wall && wall.image.desc.includes('墙后'));
    assert.equal(pickSticker('躲在墙后偷看', { seed: 'a' }).image.file, wall.image.file);
    assert.equal(pickSticker('灰猫哭得满脸泪', { seed: 'a' }).image.desc, '灰猫哭得满脸泪，旁边只剩一个背影小灰猫');
    assert.ok(pickSticker('我恨蚊子', { seed: 'a' }).image.desc.includes('蚊子'));
    for (const miss of ['今天天气不错', '火星登陆舱量子纠缠', '无聊', 'x']) assert.equal(pickSticker(miss, { seed: 'a' }), null, miss);
    assert.equal(stickerHtml('火星登陆舱量子纠缠'), '');
    // 描述写成画面时 tags 与情绪名也加分：「害羞地低着头」没有一字不差的描述，仍能靠情绪与 tags 命中
    // 未分类的图：情绪名挑不到，但用它的描述能命中
    const view = stickerView('daimao');
    const descCount = new Map();
    for (const i of view.pool) descCount.set(i.desc, (descCount.get(i.desc) || 0) + 1);
    const loose = view.pool.find((i) => !i.emotions.length && descCount.get(i.desc) === 1);
    assert.ok(loose);
    const hit = pickSticker(loose.desc, { seed: 'z' });
    assert.equal(hit.image.file, loose.file);
    assert.equal(hit.id, '');
    // 同一句描述、同一种子结果不变；换种子仍然合法
    for (let i = 0; i < 10; i++) assert.equal(pickSticker('开心地举起小爪子打招呼', { seed: 's' }).image.file, pickSticker('开心地举起小爪子打招呼', { seed: 's' }).image.file);
    // 停用的图不参与描述匹配
    assert.equal(pickSticker(loose.desc, { seed: 'z', disabled: [loose.file] })?.image.file === loose.file, false);
    // AC娘同样支持描述匹配
    const ac = pickSticker('闭着眼咧嘴大笑', { set: 'nga', seed: 'a' });
    assert.ok(ac && ac.image.desc.includes('咧嘴大笑'));
    assert.equal(pickSticker('灰猫哭得满脸泪', { set: 'nga', seed: 'a' }), null);
    // 渲染：标签里写描述能出图
    assert.ok(replaceStickerTags('前[igs-sticker:躲在墙后偷看]后', { seed: 'a' }).includes('<img'));
    assert.ok(attachStickersFromTag('[igs-char:小雪|害羞|你好。][igs-sticker:躲在墙后偷看]')[0].name === '躲在墙后偷看');
});

function attachStickersFromTag(source) {
    const pages = [{ textType: 'dialogue', bubbleSpeaker: '小雪' }];
    attachStickers(pages, [source.indexOf('你好')], source);
    return pages[0].stickers;
}

test('提示词：补一句画面描述写法；可用清单只列有图的情绪，AC娘不列没有图的', () => {
    const chat = stickerPromptBlock({ chatReader: { on: true } });
    assert.ok(chat.includes('也可以直接写想要的表情画面或动作') && chat.includes('[igs-sticker:躲在墙后偷看]') && chat.includes('对不上时不显示'));
    assert.ok(!chat.includes('灰猫哭得满脸泪') && chat.length < 900);
    const examples = [...chat.matchAll(/\[igs-sticker:([^\]]+)\]/g)].map((m) => m[1]).filter((x) => !['害羞', '开心', '情绪名'].includes(x));
    for (const q of examples) assert.ok(pickSticker(q, { seed: 'a' }), `提示词里的示例对不上图：${q}`);
    const forumNga = stickerPromptBlock({ forumReader: { on: true }, stickers: { set: 'nga' } });
    const listOf = (text) => text.split('\n').find((l) => l.startsWith('可用情绪名'));
    assert.ok(listOf(forumNga).includes('开心') && ['困、', '晚安', '抱抱'].every((x) => !listOf(forumNga).includes(x)));
    for (const q of [...forumNga.matchAll(/\[igs-sticker:([^\]]+)\]/g)].map((m) => m[1]).filter((x) => !['开心', '情绪名'].includes(x))) assert.ok(pickSticker(q, { set: 'nga', seed: 'a' }), `AC娘示例对不上图：${q}`);
    // 线上聊天固定呆猫八条：两个都开时按呆猫八条的清单
    assert.ok(listOf(stickerPromptBlock({ chatReader: { on: true }, forumReader: { on: true }, stickers: { set: 'nga' } })).includes('晚安'));
    assert.ok(listOf(stickerPromptBlock({ forumReader: { on: true }, stickers: { set: 'daimao' } })).includes('晚安'));
});

const noBubble = (overlay, set) => syncChatReader(overlay, {
    floorKey: 'm9:1', rows: logRowsOf([loadedPage('dialogue', '好呀。', { bubbleSpeaker: '小雪', stickers: [{ id: 'ok', name: '好的', at: 'end' }] })], { keyOf: (n) => n }), upto: 0, batchStart: 0, live: -1,
    settings: { ...normalizeChatReaderSettings(), adjust: {}, stickers: { ...normalizeStickerSettings({ set }), personaOf: () => ['软萌'] } }, skin: 'default', tone: 'dark', fonts: {}, hidden: false,
    avatarOf: () => null, symbolOf: () => '', chipKindOf: () => '', htmlOf: (row) => row.text,
    canSpeak: () => false, cardsOf: () => [], onTap: () => {}, onPlay: () => {}, onSaveAdjust: () => {},
});

test('线上聊天固定呆猫八条（即使设置里选了 AC娘），并按说话人 persona 挑图', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"><div id="igs-stage-motion"><div id="igs-dialog-layer"><div class="igs-dialog" id="igs-dialog"></div></div></div></div></body></html>');
    const overlay = dom.window.document.getElementById('igs-overlay');
    noBubble(overlay, 'nga');
    const img = overlay.querySelector('.igs-cr-bubble.is-sticker img');
    assert.ok(img && img.getAttribute('src').includes('/daimao/') && !img.closest('.igs-sticker').classList.contains('is-inline'));
    const file = img.getAttribute('src').split('/').pop();
    assert.ok(STICKER_SETS.daimao.items.find((i) => i.file === file).persona.includes('软萌') || !stickerView('daimao').catalog.find((s) => s.id === 'ok').images.some((i) => i.persona.includes('软萌')));
});

function forumView(settings, replyText, poStickers) {
    const dom = new JSDOM('<div id="igs-overlay"><div id="igs-dialog-layer"><div id="igs-dialog"></div></div></div>', { pretendToBeVisual: true });
    const overlay = dom.window.document.getElementById('igs-overlay');
    const rows = logRowsOf([loadedPage('dialogue', '大家好。', { bubbleSpeaker: '阿吒', stickers: poStickers || [] })], { keyOf: (n) => n, userKey: '我' })
        .map((r) => ({ ...r, who: r.speaker }));
    const plan = [{ start: 0, end: 0, no: 1, id: 'Neko4Ka', time: '17:42', po: true, replies: [{ id: 'ab12', no: 2, time: '17:50', po: false, text: replyText }] }];
    syncForumReader(overlay, { floorKey: 'f1', rows, plan, board: '版', head: { title: '标题' }, upto: 0, live: -1, settings: { ...normalizeForumReaderSettings({ mode: settings && settings.mode }), stickers: normalizeStickerSettings(settings) }, sig: JSON.stringify(settings) });
    return overlay;
}

test('论坛套组：默认呆猫八条另起一行；AC娘行内小图跟在文字里，缺情绪时不显示', () => {
    const text = '笑死 [igs-sticker:开心] 好耶 [igs-sticker:晚安]';
    const big = forumView({}, text);
    assert.equal(big.querySelectorAll('.igs-fm-stickers .igs-sticker').length, 2);
    assert.ok(big.querySelector('.igs-fm-stickers img').getAttribute('src').includes('/daimao/') && !big.querySelector('.is-inline'));
    const ac = forumView({ set: 'nga' }, text);
    assert.equal(ac.querySelectorAll('.igs-fm-stickers').length, 0);
    const inline = ac.querySelectorAll('.igs-fm-reply .igs-sticker.is-inline');
    assert.equal(inline.length, 1);
    assert.ok(inline[0].querySelector('img').getAttribute('src').includes('/nga/') && inline[0].querySelector('img').style.getPropertyValue('--sw'));
    const body = ac.querySelector('.igs-fm-reply .igs-fm-body > div');
    assert.equal(body.textContent.replace(/\s+/g, ' ').trim(), '笑死 好耶');
    assert.ok(body.firstChild.nodeType === 3 && body.querySelector('.igs-sticker').previousSibling.textContent === '笑死 ');
    // 只有缺图情绪：该条回帖不出图，楼号与时间照旧
    const none = forumView({ set: 'nga' }, '[igs-sticker:晚安]');
    assert.equal(none.querySelectorAll('.igs-fm-reply .igs-sticker').length, 0);
    assert.ok(none.querySelector('.igs-fm-reply .igs-fm-meta').textContent.includes('17:50'));
    // 楼主正文：AC娘跟在这句末尾，不另起一行
    const po = forumView({ set: 'nga' }, '路过', [{ id: 'shy', name: '害羞', at: 'end' }]);
    assert.ok(po.querySelector('.igs-fm-line .igs-sticker.is-inline') && !po.querySelector('.igs-fm-stickers'));
    const poBig = forumView({}, '路过', [{ id: 'shy', name: '害羞', at: 'end' }]);
    assert.ok(poBig.querySelector('.igs-fm-stickers .igs-sticker.is-po') && !poBig.querySelector('.igs-fm-line .igs-sticker'));
    // 描述也可行
    assert.equal(forumView({ set: 'nga' }, '[igs-sticker:闭着眼咧嘴大笑]').querySelectorAll('.igs-fm-reply .igs-sticker.is-inline').length, 1);
});

test('AC娘样式：浅色直接叠加，深色只垫一小块变量底色；没有卡片、阴影、边框；按原尺寸，放大倍数是变量', () => {
    const rules = FORUM_READER_STYLE_TEXT.split('\n').filter((l) => l.includes('.igs-fm-sticker.is-inline') && !l.includes('+.igs-fm'));
    assert.equal(rules.length, 2);
    for (const rule of rules) assert.ok(/background:(?:none|var\(--igs-fm-ac-bg\))/.test(rule) && /box-shadow:none/.test(rule) && /border:0/.test(rule), rule);
    assert.ok(rules.some((r) => r.includes('vertical-align:text-bottom') && r.includes('var(--sw') && r.includes('var(--igs-fm-ac-scale)')));
    assert.ok(FORUM_READER_STYLE_TEXT.includes('--igs-fm-ac-scale:1;'));
    // 底边对齐：外层 span 与 img 都 text-bottom，按原像素；深色用变量垫实色浅底，浅色为 none；并排紧凑
    assert.ok(rules.every((r) => r.includes('vertical-align:text-bottom')) && rules.some((r) => r.includes('background:var(--igs-fm-ac-bg)') && r.includes('padding:var(--igs-fm-ac-pad)') && r.includes('border-radius:var(--igs-fm-ac-radius)')) && FORUM_READER_STYLE_TEXT.includes('--igs-fm-ac-bg:none;') && FORUM_READER_STYLE_TEXT.includes('.igs-fm-sticker.is-inline+.igs-fm-sticker.is-inline{margin-left:0;}'));
    const bgOf = (settings) => forumView(settings, '[igs-sticker:开心]').querySelector('#igs-forum-reader').style.getPropertyValue('--igs-fm-ac-bg');
    assert.equal(bgOf({}), 'none');
    assert.equal(bgOf({ mode: 'dark' }), '#e8e4da');
    assert.ok(!rules.some((r) => /var\(--igs-fm-(?:card|pg|card2)/.test(r)));
});

test('用户自定义含义：改情绪、新情绪进提示词、改描述、恢复默认、失效键忽略', () => {
    const view0 = stickerView('daimao');
    const shyFile = view0.catalog.find((s) => s.id === 'shy').images[0].file;
    const onlyShy = view0.pool.find((i) => i.emotions.length === 1 && i.emotions[0] === 'shy');
    const target = (onlyShy || view0.pool.find((i) => i.emotions.includes('shy'))).file;
    // 改情绪：去掉害羞，加上无语；新增情绪「专属暗号」
    let ov = toggleStickerEmotion({}, target, 'shy');
    ov = toggleStickerEmotion(ov, target, 'speechless');
    ov = addStickerEmotion(ov, target, '专属暗号');
    ov = addStickerEmotion(ov, target, '专属暗号');
    const v1 = stickerView('daimao', ov);
    const img1 = v1.pool.find((i) => i.file === target);
    assert.ok(img1.edited && !img1.emotions.includes('shy') && img1.emotions.includes('speechless') && img1.emotions.includes('u:专属暗号'));
    assert.ok(!v1.catalog.find((s) => s.id === 'shy').images.some((i) => i.file === target));
    assert.ok(v1.catalog.find((s) => s.id === 'speechless').images.some((i) => i.file === target));
    assert.equal(v1.catalog.length, 25);
    assert.equal(v1.pool.filter((i) => i.edited).length, 1);
    // 新情绪名自动参与匹配：只会挑到这张图
    for (let i = 0; i < 10; i++) assert.equal(pickSticker('专属暗号', { overrides: ov, seed: `m${i}` }).image.file, target);
    assert.equal(pickSticker('专属暗号', { seed: 'm' }), null);
    // 新情绪进提示词可用清单；原来没有图的情绪不在清单里
    const settings = { chatReader: { on: true }, stickers: { overrides: ov } };
    const names = (text) => text.split('\n').find((l) => l.startsWith('可用情绪名')).replace('可用情绪名：', '').replace(/。$/, '').split('、');
    assert.ok(names(stickerPromptBlock(settings)).includes('专属暗号'));
    assert.ok(!names(stickerPromptBlock({ chatReader: { on: true } })).includes('专属暗号'));
    // 唯一一张图被停用 → 这个情绪不进提示词，也挑不到
    assert.ok(!names(stickerPromptBlock({ chatReader: { on: true }, stickers: { overrides: ov, disabled: [target] } })).includes('专属暗号'));
    assert.equal(pickSticker('专属暗号', { overrides: ov, disabled: [target], seed: 'm' }), null);
    // 改描述：挑图、描述匹配、alt 都以修改后的为准；留空或与内置一致等于恢复内置
    const base = view0.pool.find((i) => i.file === target).desc;
    ov = setStickerDesc(ov, target, '  乘着火星登陆舱\n降落  ');
    assert.equal(ov[target].desc, '乘着火星登陆舱 降落');
    assert.equal(pickSticker('火星登陆舱降落', { overrides: ov, seed: 'a' }).image.file, target);
    assert.equal(pickSticker('火星登陆舱降落', { seed: 'a' }), null);
    assert.ok(stickerHtml('专属暗号', { overrides: ov, seed: 'a' }).includes('alt="乘着火星登陆舱 降落"'));
    assert.equal(pickSticker(base, { overrides: ov, seed: 'a' })?.image.file === target, false);
    assert.equal(setStickerDesc(ov, target, base)[target].desc, undefined);
    // 恢复默认：整条修改与停用都去掉
    const reset = resetSticker(ov, [target, 'other.webp'], target);
    assert.deepEqual(reset, { overrides: {}, disabled: ['other.webp'] });
    assert.deepEqual(toggleStickerEmotion(toggleStickerEmotion({}, target, 'shy'), target, 'shy'), {});
    assert.equal(stickerView('daimao', reset.overrides).pool.filter((i) => i.edited).length, 0);
    // 失效键忽略：素材里没有的文件，修改不生效，也不会让浏览页或视图出错
    const stale = { 'gone.webp': { emotions: ['happy', '幽灵情绪'], desc: '幽灵' }, [shyFile]: { desc: '' } };
    const vs = stickerView('daimao', stale);
    assert.equal(vs.pool.length, 449);
    assert.equal(vs.catalog.length, 24);
    assert.equal(vs.pool.filter((i) => i.edited).length, 0);
    assert.equal(pickSticker('幽灵情绪', { overrides: stale, seed: 'a' }), null);
    assert.equal(setStickerDesc({}, 'gone.webp', '幽灵').gone, undefined);
    assert.equal(toggleStickerEmotion({}, 'gone.webp', 'happy') && Object.keys(toggleStickerEmotion({}, 'gone.webp', 'happy')).length, 0);
    assert.ok(renderStickerBrowser({ overrides: stale }).includes('呆猫八条'));
    // 两个套组都支持：AC娘的图也能改
    const acFile = stickerView('nga').pool[0].file;
    const acOv = addStickerEmotion({}, acFile, '晚安');
    assert.ok(pickSticker('晚安', { set: 'nga', overrides: acOv, seed: 'a' }).image.file === acFile);
    assert.equal(pickSticker('晚安', { set: 'nga', seed: 'a' }), null);
});

test('overrides 规范化：只存差异，去重去括号，丢掉空条目与危险键', () => {
    const n = normalizeStickerSettings({ overrides: {
        'a.webp': { emotions: ['happy', 'happy', ' [躲 猫猫] ', '', 5], desc: '  好  看 ' },
        'b.webp': { emotions: [] },
        'c.webp': { desc: '   ' },
        'd.webp': 'x',
        __proto__: { emotions: ['x'] },
    } });
    assert.deepEqual(n.overrides['a.webp'], { emotions: ['happy', '躲猫猫'], desc: '好 看' });
    assert.deepEqual(n.overrides['b.webp'], { emotions: [] });
    assert.deepEqual(Object.keys(n.overrides).sort(), ['a.webp', 'b.webp']);
    assert.deepEqual(normalizeStickerSettings({ overrides: [1, 2] }).overrides, {});
    assert.equal(normalizeFxReaderSettings({ stickers: { set: 'nga', overrides: { 'a.webp': { desc: 'x' } } } }).stickers.set, 'nga');
});

test('论坛配色：classic 改名杏仁奶茶（id 不变），新增麦芽信笺排在其后，规范化与设置列表都认', () => {
    assert.equal(FORUM_PALETTES[0].id, 'classic');
    assert.equal(FORUM_PALETTES[0].name, '杏仁奶茶');
    assert.deepEqual(FORUM_PALETTES.slice(0, 2).map((p) => p.id), ['classic', 'malt']);
    const malt = FORUM_PALETTES[1];
    assert.equal(malt.name, '麦芽信笺');
    assert.deepEqual(malt.l, { pg: '#fff0cd', card: '#fff9e3', card2: '#fef3d6', line: '#e0c19e', main: '#591804', title: '#10273f', nm: '#10273f', sub: '#8a7a63', body: '#2b2b2b', gt: '#6b8f2a', ref: '#a0522d' });
    assert.deepEqual(malt.d, { pg: '#121212', card: '#1c1c1c', card2: '#171717', line: '#2b2b2b', main: '#f2e6c8', title: '#8fb4e6', nm: '#8fb4e6', sub: '#8e8e8e', body: '#e0e0e0', gt: '#9ccc5a', ref: '#e0a070' });
    assert.equal(forumPaletteColors('malt', 'dark').pg, '#121212');
    assert.equal(forumPaletteColors('malt', 'light').pg, '#fff0cd');
    assert.equal(normalizeForumReaderSettings({ palette: 'malt' }).palette, 'malt');
    assert.equal(normalizeForumReaderSettings({ palette: 'classic' }).palette, 'classic');
    assert.ok(!FORUM_PALETTES.some((p) => /NGA/i.test(p.name)));
    const fields = renderFxFeatureFields(normalizeFxReaderSettings({ forumReader: { on: true, palette: 'malt' } })).forumReader;
    assert.ok(fields.includes('value="malt"') && fields.includes('麦芽信笺') && fields.includes('杏仁奶茶') && !fields.includes('匿名版米黄'));
    assert.ok(fields.includes('readerSettings.stickers.set') && fields.includes('NGA AC娘') && fields.includes('呆猫八条'));
    assert.ok(!renderFxFeatureFields(normalizeFxReaderSettings({ chatReader: { on: true } })).chatReader.includes('readerSettings.stickers.set'));
});

test('呆猫八条大图带圆角（变量），AC娘行内小图不加；都没有底色阴影边框', () => {
    assert.ok(CHAT_READER_STYLE_TEXT.includes('--igs-cr-sticker-radius:12px') && CHAT_READER_STYLE_TEXT.includes('--igs-cr-sticker-radius:10px'));
    assert.ok(CHAT_READER_STYLE_TEXT.includes('.igs-cr-sticker img{border-radius:var(--igs-cr-sticker-radius);}'));
    assert.ok(FORUM_READER_STYLE_TEXT.includes('.igs-fm-sticker:not(.is-inline) img{border-radius:var(--igs-fm-sticker-radius);}'));
    const ac = FORUM_READER_STYLE_TEXT.split('\n').filter((l) => l.includes('.igs-fm-sticker.is-inline') && !l.includes('+.igs-fm'));
    assert.ok(ac.every((l) => !l.includes('--igs-fm-sticker-radius')));
});
