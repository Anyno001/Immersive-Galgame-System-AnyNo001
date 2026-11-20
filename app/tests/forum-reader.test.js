import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { logRowsOf } from '../src/visual/igs-ui/log-reader-model.js';
import {
    FORUM_USER_KEY, emptyForum, ensureAliases, forumClock, forumNo, forumPasserId, forumPlan, forumPoId, forumRowsOf, forumTagsOf, mergeForumTag,
    normalizeForum, parseForumTag, replaceNames, resolvePoster, sendClock,
} from '../src/visual/igs-ui/forum-reader-model.js';
import { normalizeForumReaderSettings } from '../src/visual/igs-ui/forum-reader-settings.js';
import { createForumRegistry } from '../src/visual/igs-ui/forum-reader-registry.js';
import { finishForumReveal, syncForumReader } from '../src/visual/igs-ui/forum-reader-layer.js';
import { FORUM_READER_STYLE_TEXT } from '../src/visual/igs-ui/forum-reader-style.js';
import { collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';

const page = (textType, segmentBody, extra = {}) => ({ textType, segmentBody, bubbleSpeaker: '', bubbleMood: '', sceneStateForBg: null, ...extra });

test('设置默认值、取值整理与三种阅读模式互斥所需的规范化', () => {
    const d = normalizeForumReaderSettings(undefined);
    assert.deepEqual([d.on, d.poster, d.othersThoughts, d.replies, d.perPost, d.prompt], [false, 'auto', 'hide', 'normal', 8, true]);
    const s = normalizeForumReaderSettings({ on: true, poster: 'x', othersThoughts: 'show', replies: 'few', perPost: 99, perTap: 9 });
    assert.deepEqual([s.on, s.poster, s.othersThoughts, s.replies, s.perPost, s.perTap], [true, 'auto', 'show', 'few', 16, 5]);
    assert.equal(normalizeFxReaderSettings({}).forumReader.on, false);
    assert.equal(normalizeSettingsValue('readerSettings.forumReader.on', 'true'), true);
});

test('楼号单调、重读不变，同一楼里点缀的号段不撞下一楼', () => {
    assert.equal(forumNo('chat-a', 3, 0), forumNo('chat-a', 3, 0));
    assert.ok(forumNo('chat-a', 3, 1) > forumNo('chat-a', 3, 0));
    assert.ok(forumNo('chat-a', 4, 0) > forumNo('chat-a', 3, 9));
    assert.match(forumPoId('chat-a'), /^[A-Z0-9][a-z0-9]{7}$/);
    assert.equal(forumPasserId('c', 1), forumPasserId('c', 7));
});

test('时间跟剧情走：有剧情时间用剧情时间，没有退发送时间，都没有不显示', () => {
    assert.equal(forumClock({ sceneTime: '傍晚 17:42', sendDate: '', seed: 's', k: 0 }), '17:42');
    const later = forumClock({ sceneTime: '17:42', seed: 's', k: 2 });
    assert.ok(later > '17:42' && later <= '18:00');
    assert.equal(forumClock({ sceneTime: '', sendDate: 'November 20, 2026 9:05pm', seed: 's' }), '21:05');
    assert.equal(forumClock({ sceneTime: '', sendDate: '', seed: 's' }), '');
    assert.equal(sendClock('2026-11-20@17h42m10s'), '17:42');
});

test('代号替换只换整词的已登记名，长名优先', () => {
    assert.equal(replaceNames('小雪儿看着小雪，小云不在。', [['小雪', 'A'], ['小雪儿', 'B']]), 'B看着A，小云不在。');
    assert.equal(replaceNames('没有名字', []), '没有名字');
});

test('标签解析：楼主三种写法与代号', () => {
    assert.deepEqual(parseForumTag('求助帖|楼主=阿吒|霜见=银发那个|{{user}}=转学生'), { title: '求助帖', po: { kind: 'char', name: '阿吒' }, alias: [['霜见', '银发那个'], ['{{user}}', '转学生']] });
    assert.deepEqual(parseForumTag('围观|楼主=路人:隔壁班同学').po, { kind: 'witness', note: '隔壁班同学' });
    assert.deepEqual(parseForumTag('x|楼主={{user}}').po, { kind: 'user' });
    assert.equal(forumTagsOf('正文\n[igs-forum:标题|楼主=A]\n').length, 1);
});

test('登记合并：未登记角色丢弃、manual 不被覆盖、poster 锁定忽略 AI 楼主', () => {
    const known = (n) => (['阿吒', '霜见'].includes(n) ? n : '');
    const tag = parseForumTag('新标题|楼主=霜见|阿吒=红衣服|路人甲=无关');
    let r = mergeForumTag(emptyForum(), tag, { known });
    assert.equal(r.data.title, '新标题');
    assert.deepEqual(r.data.po, { kind: 'char', key: '霜见' });
    assert.equal(r.data.alias['阿吒'], '红衣服');
    assert.deepEqual(r.dropped, ['路人甲']);
    const manual = normalizeForum({ title: '我写的', alias: { 阿吒: '手改' }, manual: { title: true, alias: { 阿吒: true } } });
    r = mergeForumTag(manual, tag, { known });
    assert.equal(r.data.title, '我写的');
    assert.equal(r.data.alias['阿吒'], '手改');
    r = mergeForumTag(emptyForum(), tag, { known, posterLock: 'witness' });
    assert.equal(r.data.po, null);
});

test('楼主兜底：锁定 > 登记 > 本卡主角 > 首个说话人，之后固定', () => {
    assert.deepEqual(resolvePoster({ data: emptyForum(), settings: {}, defaultChar: '阿吒', firstSpeaker: '霜见' }), { kind: 'char', key: '阿吒' });
    assert.deepEqual(resolvePoster({ data: emptyForum(), settings: {}, defaultChar: '', firstSpeaker: '霜见' }), { kind: 'char', key: '霜见' });
    assert.deepEqual(resolvePoster({ data: { po: { kind: 'char', key: '霜见' } }, settings: { poster: 'user' }, defaultChar: '阿吒' }), { kind: 'user' });
    assert.deepEqual(resolvePoster({ data: { po: { kind: 'char', key: '霜见' } }, settings: {}, defaultChar: '阿吒' }), { kind: 'char', key: '霜见' });
});

test('兜底代号 A/B/C 按出场顺序、固定不变，楼主本人不占代号', () => {
    let r = ensureAliases(emptyForum(), ['阿吒', '霜见', FORUM_USER_KEY], '阿吒');
    assert.deepEqual(r.data.alias, { 霜见: 'A', [FORUM_USER_KEY]: 'B' });
    r = ensureAliases(r.data, ['霜见', '小云'], '阿吒');
    assert.equal(r.data.alias['霜见'], 'A');
    assert.equal(r.data.alias['小云'], 'C');
});

const rowsOf = (pages) => logRowsOf(pages, { keyOf: (n) => n, userKey: '我' });
const demo = () => rowsOf([
    page('narration', '阿吒走在前面，霜见跟着我。', { sceneStateForBg: { scene: '坡道', time: '傍晚 17:42' } }),
    page('dialogue', '“你走得太慢了。”', { bubbleSpeaker: '阿吒' }),
    page('thought', '*[阿吒]：他怎么还不来*', { bubbleSpeaker: '阿吒' }),
    page('thought', '*[霜见]：吵死了*', { bubbleSpeaker: '霜见' }),
    page('dialogue', '“路过。”', { bubbleSpeaker: '我' }),
]);

test('楼主是角色本人：台词显示「我」、本人心里话成叙述、旁白里本名换「我」、他人心里话隐藏', () => {
    const rows = forumRowsOf(demo(), { poster: { kind: 'char', key: '阿吒' }, alias: { 霜见: 'B', [FORUM_USER_KEY]: '转学生' }, userKey: '我', userNames: ['我'], settings: {} });
    assert.equal(rows[0].text, '我走在前面，B跟着转学生。');
    assert.equal(rows[1].who, '我');
    assert.equal(rows[2].kind, 'narr');
    assert.equal(rows[2].text, '他怎么还不来');
    assert.equal(rows[3].hidden, true);
    assert.equal(rows[4].who, '转学生');
});

test('角色本人当楼主时，User 台词里的自称不被换成 User 的代号', () => {
    const rows = forumRowsOf(demo(), { poster: { kind: 'char', key: '阿吒' }, alias: { [FORUM_USER_KEY]: '转学生' }, userKey: '我', userNames: ['我'], settings: {} });
    assert.equal(rows[4].who, '转学生');
    assert.equal(rows[4].text, '路过。');
    const mine = forumRowsOf(rowsOf([page('dialogue', '“你叫阿吒？”', { bubbleSpeaker: '我' })]), { poster: { kind: 'char', key: '阿吒' }, alias: { [FORUM_USER_KEY]: '转学生' }, userKey: '我', userNames: ['我'], settings: {} });
    assert.equal(mine[0].text, '你叫我？');
});

test('他人心里话设为显示时保留；路人楼主没有「我」', () => {
    const shown = forumRowsOf(demo(), { poster: { kind: 'char', key: '阿吒' }, alias: { 霜见: 'B' }, userKey: '我', settings: { othersThoughts: 'show' } });
    assert.equal(shown[3].hidden, undefined);
    const witness = forumRowsOf(demo(), { poster: { kind: 'witness', note: '同学' }, alias: { 阿吒: 'A', 霜见: 'B', [FORUM_USER_KEY]: 'C' }, userKey: '我', userNames: ['我'], settings: {} });
    assert.equal(witness[1].who, 'A');
    assert.equal(witness[2].hidden, true);
    assert.equal(witness[4].who, 'C');
    assert.ok(!witness.some((r) => r.who === '我'));
});

test('楼主是 User：User 台词显示「我」，角色走代号', () => {
    const rows = forumRowsOf(demo(), { poster: { kind: 'user' }, alias: { 阿吒: 'A', 霜见: 'B' }, userKey: '我', userNames: ['我'], settings: {} });
    assert.equal(rows[4].who, '我');
    assert.equal(rows[1].who, 'A');
    assert.equal(rows[2].hidden, true);
});

test('楼层计划：超过行数或换场景拆楼；点缀同种子同内容、不重复、摘引取真实文字、号段对得上', () => {
    const many = rowsOf(Array.from({ length: 10 }, (_, i) => page('dialogue', `第${i}句。`, { bubbleSpeaker: '阿吒' })));
    const rows = forumRowsOf(many, { poster: { kind: 'witness' }, alias: { 阿吒: 'A' }, userKey: '我', settings: {} });
    const ctx = { chatId: 'c1', messageId: 6, settings: { perPost: 4, replies: 'normal' }, poId: 'Neko4Ka', sceneTime: '17:42' };
    const plan = forumPlan(rows, ctx);
    assert.deepEqual(plan.map((p) => [p.start, p.end]), [[0, 3], [4, 7], [8, 9]]);
    assert.deepEqual(forumPlan(rows, ctx), plan);
    const lines = plan.flatMap((p) => p.replies.map((r) => r.text));
    assert.equal(new Set(lines).size, lines.length);
    const nos = plan.flatMap((p) => [p.no, ...p.replies.map((r) => r.no)]);
    assert.deepEqual(nos, [...nos].sort((a, b) => a - b));
    const quotes = plan.flatMap((p) => p.replies).filter((r) => r.quote);
    for (const r of quotes) assert.ok(many.some((row) => row.text.includes(r.quote)), `摘引「${r.quote}」不是正文里的原句`);
    for (const r of plan.flatMap((p) => p.replies).filter((x) => x.ref)) assert.ok(plan.some((p) => p.no === r.ref), '>>No. 指向的楼号不存在');
    assert.equal(forumPlan(rows, { ...ctx, settings: { perPost: 4, replies: 'off' } }).every((p) => p.replies.length === 0), true);
    const noClock = forumPlan(rows, { ...ctx, sceneTime: '' });
    assert.equal(noClock[0].time, '');
});

test('登记读写：写之前核对聊天没换；读不到元数据时留在内存不报错', () => {
    const meta = {};
    let chat = 'a';
    const saved = [];
    const ctx = { chatMetadata: meta, saveMetadata: () => { saved.push(1); } };
    const reg = createForumRegistry({ getContext: () => ctx, getChatId: () => chat });
    assert.equal(reg.stage({ title: '标题', po: { kind: 'user' } }), true);
    assert.equal(reg.read().title, '标题');
    assert.equal(meta.igs_forum, undefined);
    chat = 'b';
    assert.equal(reg.read().title, '');
    chat = 'a';
    assert.equal(reg.flush(), true);
    assert.equal(meta.igs_forum.title, '标题');
    assert.equal(saved.length, 1);
    const bare = createForumRegistry({ getContext: () => null, getChatId: () => 'x' });
    assert.equal(bare.stage({ title: '仅内存' }), true);
    assert.equal(bare.read().title, '仅内存');
    assert.equal(bare.flush(), false);
});

test('[igs-forum] 标签从显示正文剥掉', () => {
    assert.equal(stripMarkerDirectives('他笑了。\n[igs-forum:标题|楼主=A]').trim(), '他笑了。');
    assert.equal(stripMarkerDirectives('尾巴[igs-forum:标题|楼主=').trim(), '尾巴');
});

test('提示词块：开着才出现，登记前给完整写法，登记后折成事实短句，锁定楼主时不列楼主格式', () => {
    assert.equal(collectGrammarBlocks({ forumReader: { on: false } }).some((b) => b.key === 'forum'), false);
    assert.equal(collectGrammarBlocks({ forumReader: { on: true, prompt: false } }).some((b) => b.key === 'forum'), false);
    const fresh = collectGrammarBlocks({ forumReader: { on: true } }).find((b) => b.key === 'forum');
    assert.ok(fresh.full.includes('[igs-forum:帖子标题|楼主='));
    const done = collectGrammarBlocks({ forumReader: { on: true }, _forum: normalizeForum({ title: '求助', po: { kind: 'char', key: '阿吒' }, alias: { 霜见: 'B' } }) }).find((b) => b.key === 'forum');
    assert.ok(done.full.includes('求助') && done.full.includes('霜见=B') && done.full.length < fresh.full.length + 40);
    const locked = collectGrammarBlocks({ forumReader: { on: true, poster: 'user' } }).find((b) => b.key === 'forum');
    assert.ok(!locked.full.includes('楼主='.concat('角色名')) && locked.full.includes('楼主是{{user}}'));
});

function mountOverlay() {
    const dom = new JSDOM('<div id="igs-overlay"><div id="igs-dialog-layer"><div id="igs-dialog"></div></div></div>', { pretendToBeVisual: true });
    return { dom, overlay: dom.window.document.getElementById('igs-overlay') };
}

test('论坛层：帖子头、楼拆分、点缀回帖与引用格式落到 DOM，切回关闭时摘掉开关属性', () => {
    const { overlay } = mountOverlay();
    const many = rowsOf(Array.from({ length: 6 }, (_, i) => page('dialogue', `第${i}句……`, { bubbleSpeaker: '阿吒' })));
    const rows = forumRowsOf(many, { poster: { kind: 'char', key: '阿吒' }, alias: {}, userKey: '我', settings: {} });
    const plan = forumPlan(rows, { chatId: 'c', messageId: 2, settings: { perPost: 3, replies: 'normal' }, poId: 'Neko4Ka', sceneTime: '17:42' });
    const view = { floorKey: 'k', rows, plan, board: '综合版1', head: { title: '【求助】在线等' }, upto: 5, live: -1, settings: normalizeForumReaderSettings({}), sig: 'x' };
    syncForumReader(overlay, view);
    assert.equal(overlay.getAttribute('data-igs-forum-reader'), 'on');
    assert.equal(overlay.getAttribute('data-igs-log-reader'), 'on');
    assert.equal(overlay.querySelector('.igs-fm-bar').textContent, '综合版1');
    assert.equal(overlay.querySelector('.igs-fm-thread h1').textContent, '【求助】在线等');
    assert.equal(overlay.querySelectorAll('.igs-fm-post').length, 2);
    assert.ok(overlay.querySelector('.igs-fm-po').textContent.includes('Neko4Ka'));
    assert.ok(overlay.querySelector('.igs-fm-line .igs-fm-who').textContent.includes('我'));
    assert.equal(overlay.querySelectorAll('.igs-fm-line').length, 6);
    syncForumReader(overlay, null);
    assert.equal(overlay.hasAttribute('data-igs-forum-reader'), false);
    assert.equal(overlay.hasAttribute('data-igs-log-reader'), false);
});

test('论坛层：live 行出现后可补完，不留悬挂', async () => {
    const { overlay } = mountOverlay();
    const rows = forumRowsOf(rowsOf([page('dialogue', '一句。', { bubbleSpeaker: '阿吒' })]), { poster: { kind: 'witness' }, alias: { 阿吒: 'A' }, userKey: '我', settings: {} });
    const plan = forumPlan(rows, { chatId: 'c', messageId: 0, settings: { replies: 'off' }, poId: 'p' });
    const out = syncForumReader(overlay, { floorKey: 'k', rows, plan, board: '版', head: null, upto: 0, live: 0, settings: normalizeForumReaderSettings({}) });
    assert.ok(out.revealing);
    finishForumReveal(overlay);
    await out.revealing;
    assert.ok(overlay.querySelector('.igs-fm-line').textContent.includes('A：一句。'));
});

test('样式只用实色并只在论坛开关属性下生效', () => {
    assert.ok(FORUM_READER_STYLE_TEXT.includes('#igs-overlay[data-igs-forum-reader="on"]'));
    assert.ok(!/rgba\(|linear-gradient|gradient\(/.test(FORUM_READER_STYLE_TEXT));
});
