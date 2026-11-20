import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { logRowsOf } from '../src/visual/igs-ui/log-reader-model.js';
import {
    FORUM_USER_KEY, applyFloorTags, emptyForum, ensureAliases, floorMarks, forumClock, forumNo, forumPairOf, forumPasserId, forumPlan, forumPoId, forumPrevRepliesOf, forumRepliesOf, forumRowsOf, forumTagsOf,
    normalizeForum, parseForumTag, replaceNames, resolvePoster, sendClock, threadAt, titleAt,
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

const known = (n) => (['阿吒', '霜见'].includes(n) ? n : '');
const tagsOf = (text) => forumTagsOf(text);
const A = { kind: 'char', key: '阿吒' };
const B = { kind: 'char', key: '霜见' };
const floor = (data, id, text, extra = {}) => applyFloorTags(data, id, tagsOf(text), { known, chatId: 'c', fallbackPo: A, firstFloor: 3, fallbackTitle: '【连载】兜底', ...extra }).data;
const woven = () => {
    let d = floor(emptyForum(), 3, '[igs-forum:【求助】在线等|楼主=阿吒|霜见=银发那个]');
    d = floor(d, 8, '[igs-forum:【吐槽】隔壁|楼主=霜见|阿吒=那个木头]');
    return floor(d, 10, '[igs-forum:【求助】在线等|楼主=阿吒]');
};

test('交错：换人新开帖、同人接着原帖写，代号与 PO 主 ID 沿用', () => {
    const d = woven();
    assert.equal(d.threads.length, 2);
    const at = (n) => threadAt(d, n).po.key;
    assert.deepEqual([3, 7, 8, 9, 10, 20].map(at), ['阿吒', '阿吒', '霜见', '霜见', '阿吒', '阿吒']);
    assert.equal(threadAt(d, 3).id, threadAt(d, 10).id);
    assert.notEqual(threadAt(d, 3).poId, threadAt(d, 8).poId);
    assert.equal(threadAt(d, 3).alias['霜见'], '银发那个');
    assert.equal(threadAt(d, 8).alias['阿吒'], '那个木头');
    assert.equal(floorMarks(d, 8).start && floorMarks(d, 10).start && floorMarks(d, 3).start, true);
    assert.equal(floorMarks(d, 5).start, false);
});

test('改标题：之后的楼用新标题，帖子第一条不算修改，同一楼换帖子头时不重复出小字', () => {
    let d = floor(emptyForum(), 3, '[igs-forum:旧标题|楼主=阿吒]');
    d = floor(d, 12, '[igs-forum:旧标题（已解决）]');
    const t = threadAt(d, 12);
    assert.equal(titleAt(t, 11), '旧标题');
    assert.equal(titleAt(t, 12), '旧标题（已解决）');
    assert.equal(floorMarks(d, 3).retitle, '');
    assert.equal(floorMarks(d, 12).retitle, '旧标题（已解决）');
    assert.equal(floorMarks(d, 13).retitle, '');
});

test('同一楼重新解析幂等：swipe 换标签或去掉标签，旧条目被替换；渲染顺序不影响', () => {
    let d = woven();
    const again = floor(d, 8, '[igs-forum:【吐槽】隔壁|楼主=霜见|阿吒=那个木头]');
    assert.deepEqual(again, d);
    d = floor(d, 8, '没有标签的正文');
    assert.equal(threadAt(d, 9).po.key, '阿吒');
    let swapped = floor(floor(emptyForum(), 8, '[igs-forum:B帖|楼主=霜见]'), 3, '[igs-forum:A帖|楼主=阿吒]');
    assert.equal(threadAt(swapped, 3).po.key, '阿吒');
    assert.equal(threadAt(swapped, 8).po.key, '霜见');
});

test('各帖代号只按本帖算，同一角色两帖代号不同；兜底代号按帖排序', () => {
    const d = woven();
    assert.notEqual(threadAt(d, 3).alias['霜见'], threadAt(d, 8).alias['阿吒']);
    const r = ensureAliases(threadAt(d, 3), ['阿吒', '小云', FORUM_USER_KEY], '阿吒');
    assert.deepEqual([r.thread.alias['小云'], r.thread.alias[FORUM_USER_KEY]], ['A', 'B']);
});

test('删楼后 from 超出聊天长度的条目不生效（查表只认当前楼号之前的条目）', () => {
    const d = woven();
    assert.equal(threadAt(d, 5).po.key, '阿吒');
    assert.equal(threadAt(normalizeForum({ ...d, timeline: d.timeline.filter((e) => e.from <= 5) }), 9).po.key, '阿吒');
});

test('锁定：双楼主丢弃第三人；单人锁定忽略楼主但标题仍生效；manual 标题不被覆盖', () => {
    const pair = forumPairOf({ poster: 'pair', posterPair: ['阿吒', '霜见'] });
    assert.deepEqual(pair, [A, B]);
    const d = applyFloorTags(emptyForum(), 3, tagsOf('[igs-forum:标题|楼主=路人:同学]'), { known, pair, fallbackPo: pair[0], firstFloor: 3, chatId: 'c' });
    assert.equal(threadAt(d.data, 3).po.key, '阿吒');
    assert.ok(d.dropped.includes('路人:同学'));
    const locked = applyFloorTags(emptyForum(), 3, tagsOf('[igs-forum:锁定也改标题|楼主=霜见]'), { known, posterLock: 'user', fallbackPo: { kind: 'user' }, firstFloor: 3, chatId: 'c' }).data;
    assert.equal(threadAt(locked, 3).po.kind, 'user');
    assert.equal(titleAt(threadAt(locked, 3), 3), '锁定也改标题');
    const hand = normalizeForum({ threads: [{ id: 't1', po: A, titles: [{ from: 3, title: '我写的' }], manual: { title: true } }], timeline: [{ from: 3, thread: 't1' }] });
    assert.equal(titleAt(threadAt(floor(hand, 5, '[igs-forum:AI想改]'), 5), 5), '我写的');
});

test('兜底：没有标签时建 t1 并记兜底标题，之后 AI 标题顶替兜底而不算「修改」', () => {
    let d = floor(emptyForum(), 3, '正文');
    assert.equal(threadAt(d, 3).titles[0].title, '【连载】兜底');
    d = floor(d, 4, '[igs-forum:真标题]');
    assert.deepEqual(threadAt(d, 4).titles.map((t) => t.title), ['真标题']);
    assert.equal(floorMarks(d, 4).retitle, '');
});

test('楼主兜底：锁定 > 本帖登记 > 双楼主第一位 > 本卡主角 > 首个说话人', () => {
    assert.deepEqual(resolvePoster({ thread: null, settings: {}, defaultChar: '阿吒', firstSpeaker: '霜见' }), A);
    assert.deepEqual(resolvePoster({ thread: null, settings: {}, defaultChar: '', firstSpeaker: '霜见' }), B);
    assert.deepEqual(resolvePoster({ thread: { po: B }, settings: { poster: 'user' }, defaultChar: '阿吒' }), { kind: 'user' });
    assert.deepEqual(resolvePoster({ thread: { po: B }, settings: {}, defaultChar: '阿吒' }), B);
    assert.deepEqual(resolvePoster({ thread: null, settings: {}, defaultChar: '路', pair: [B, A] }), B);
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

test('抢楼词只在帖子开头那一楼出现', () => {
    const rows = forumRowsOf(rowsOf(Array.from({ length: 4 }, (_, i) => page('narration', `第${i}句。`))), { poster: { kind: 'witness' }, alias: {}, userKey: '我', settings: {} });
    const grab = new Set(['前排', '沙发', '板凳已备好', '蹲', '新帖？先占个座']);
    for (let id = 0; id < 40; id++) {
        const later = forumPlan(rows, { chatId: 'c', messageId: id, settings: { perPost: 2, replies: 'normal' } });
        assert.ok(later.flatMap((p) => p.replies).every((r) => !grab.has(r.text)), `第 ${id} 楼不是帖子开头却出现了抢楼词`);
    }
});

test('AI 回帖跨轮接话：>上N 摘引上一轮那条，同名路人跨轮同一个 ID，提示词列出上一轮回帖', () => {
    assert.deepEqual(forumRepliesOf('[igs-reply:路人丙|>上2|别带节奏] [igs-reply:楼主|>1|好]').map((r) => [r.who, r.to, r.prev]), [['路人丙', 0, 2], ['楼主', 1, 0]]);
    const chat = [
        { is_user: false, mes: '正文[igs-reply:路人甲|真的假的][igs-reply:路人乙|前排吃瓜，这瓜保熟吗我先尝一口再说，不熟我可要退]' },
        { is_user: true, mes: '继续' },
        { is_user: false, mes: '正文[igs-reply:路人丙|>上2|你吃瓜就吃瓜别带节奏][igs-reply:路人甲|我又来了]' },
    ];
    const prev = forumPrevRepliesOf(chat, 2);
    assert.deepEqual(prev.map((r) => r.who), ['路人甲', '路人乙']);
    const rows = forumRowsOf(rowsOf([page('narration', '一句。')]), { poster: { kind: 'witness' }, alias: {}, userKey: '我', settings: {} });
    const plan = forumPlan(rows, { chatId: 'c', messageId: 2, settings: { replies: 'normal' }, threadId: 't1', aiReplies: forumRepliesOf(chat[2].mes), prevReplies: prev });
    const [back, again] = plan[0].replies;
    assert.equal(back.quote, '前排吃瓜，这瓜保熟吗我先尝一口再说，…');
    const first = forumPlan(rows, { chatId: 'c', messageId: 0, settings: { replies: 'normal' }, threadId: 't1', aiReplies: forumRepliesOf(chat[0].mes) });
    assert.equal(again.id, first[0].replies[0].id);
    const block = collectGrammarBlocks({ forumReader: { on: true }, _forumPrev: prev }).find((b) => b.key === 'forum').full;
    assert.ok(block.includes('上一轮回帖：1.路人甲：真的假的') && block.includes('>上第几条'));
    assert.ok(!collectGrammarBlocks({ forumReader: { on: true, replies: 'off' }, _forumPrev: prev }).find((b) => b.key === 'forum').full.includes('上一轮回帖'));
});

test('登记读写：写之前核对聊天没换；读不到元数据时留在内存不报错', () => {
    const meta = {};
    let chat = 'a';
    const saved = [];
    const ctx = { chatMetadata: meta, saveMetadata: () => { saved.push(1); } };
    const reg = createForumRegistry({ getContext: () => ctx, getChatId: () => chat });
    assert.equal(reg.stage({ board: '板块甲' }), true);
    assert.equal(reg.read().board, '板块甲');
    assert.equal(meta.igs_forum, undefined);
    chat = 'b';
    assert.equal(reg.read().board, '');
    chat = 'a';
    assert.equal(reg.flush(), true);
    assert.equal(meta.igs_forum.board, '板块甲');
    assert.equal(saved.length, 1);
    const bare = createForumRegistry({ getContext: () => null, getChatId: () => 'x' });
    assert.equal(bare.stage({ board: '仅内存' }), true);
    assert.equal(bare.read().board, '仅内存');
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
    const done = collectGrammarBlocks({ forumReader: { on: true }, _forum: floor(emptyForum(), 3, '[igs-forum:求助|楼主=阿吒|霜见=B]') }).find((b) => b.key === 'forum');
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

test('提示词：有两个帖子时事实句列出另一帖，一帖时不出现；双楼主与 auto 各补一句', () => {
    const two = collectGrammarBlocks({ forumReader: { on: true }, _forum: woven() }).find((b) => b.key === 'forum').full;
    assert.ok(two.includes('当前帖：楼主 阿吒') && two.includes('另有帖子：霜见《【吐槽】隔壁》') && two.includes('两人交替讲述'));
    const one = collectGrammarBlocks({ forumReader: { on: true }, _forum: floor(emptyForum(), 3, '[igs-forum:求助|楼主=阿吒]') }).find((b) => b.key === 'forum').full;
    assert.ok(!one.includes('另有帖子'));
    const pair = collectGrammarBlocks({ forumReader: { on: true, poster: 'pair', posterPair: ['阿吒', '霜见'] } }).find((b) => b.key === 'forum').full;
    assert.ok(pair.includes('只在 阿吒、霜见 之间交替'));
});

test('回帖：两个帖子的路人 ID 不同，楼主回帖用本帖 PO 主 ID', () => {
    assert.notEqual(forumPasserId('c', 1, 't1'), forumPasserId('c', 1, 't2'));
    assert.notEqual(forumPoId('c', 't1'), forumPoId('c', 't2'));
    const d = woven();
    assert.notEqual(threadAt(d, 3).poId, threadAt(d, 8).poId);
});

test('论坛层：改标题出系统小字，换帖子头时不出小字', () => {
    const { overlay } = mountOverlay();
    const rows = forumRowsOf(rowsOf([page('dialogue', '一句。', { bubbleSpeaker: '阿吒' })]), { poster: { kind: 'witness' }, alias: {}, userKey: '我', settings: {} });
    const plan = forumPlan(rows, { chatId: 'c', messageId: 0, settings: { replies: 'off' }, poId: 'p' });
    syncForumReader(overlay, { floorKey: 'k', rows, plan, board: 'b', head: null, retitle: '新标题', upto: 0, live: -1, settings: normalizeForumReaderSettings({}), sig: 'r' });
    assert.equal(overlay.querySelector('.igs-fm-retitle').textContent, 'PO主修改了标题：新标题');
});

test('附图：换场景附一次场景图，CG 首次出现那行附上且优先，NSFW 按设置折叠，有图时回帖换图片词并可指回该楼', async () => {
    const { forumImagesOf } = await import('../src/visual/igs-ui/forum-reader-model.js');
    const rows = [
        { index: 0, kind: 'narr', text: '一', scene: '' },
        { index: 1, kind: 'narr', text: '二', scene: '' },
        { index: 2, kind: 'narr', text: '三', scene: '晚上 · 坡道' },
        { index: 3, kind: 'narr', text: '四', scene: '' },
        { index: 4, kind: 'narr', text: '五', scene: '早上 · 教室' },
    ];
    const pick = (row) => ({
        scene: { key: row.index < 2 ? '教室' : row.index < 4 ? '坡道' : '教室', url: 'bg.png' },
        cg: row.index === 2 || row.index === 3 ? { key: 'slot:1', url: 'cg.png', nsfw: true } : null,
    });
    const images = forumImagesOf(rows, pick, 's');
    assert.deepEqual([...images.keys()], [0, 2]);
    assert.equal(images.get(0).kind, 'scene');
    assert.equal(images.get(2).kind, 'cg');
    assert.equal(images.get(2).nsfw, true);
    assert.equal(images.get(0).file, forumImagesOf(rows, pick, 's').get(0).file);
    assert.match(images.get(0).file, /^IMG_\d{4}\.jpg \(\d+KB\)$/);

    const plan = forumPlan(rows, { chatId: 'c', messageId: 3, settings: { perPost: 2, replies: 'normal' }, images, posterKind: 'witness' });
    const lines = ['有图有真相', '原图呢', 'PO主手别抖', '这角度……你在哪拍的', '偷拍的吧', 'PO主危'];
    for (const reply of plan[0].replies) {
        assert.ok(lines.includes(reply.text));
        if (reply.text === '原图呢') assert.equal(reply.ref, plan[0].no);
    }

    const dom = new JSDOM('<div id="igs-overlay"><div id="igs-dialog-layer"></div></div>');
    const overlay = dom.window.document.getElementById('igs-overlay');
    const view = (foldNsfw) => ({ floorKey: `k${foldNsfw}`, rows, plan, images, upto: 4, live: -1, settings: { ...normalizeForumReaderSettings({ foldNsfw }), reveal: 'off' }, head: null, board: '' });
    syncForumReader(overlay, view(true));
    const cg = overlay.querySelectorAll('.igs-fm-img')[1];
    assert.ok(cg.hasAttribute('data-folded'));
    cg.querySelector('.igs-fm-fold').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.ok(!cg.hasAttribute('data-folded'));
    cg.querySelector('.igs-fm-thumb').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.equal(overlay.querySelector('.igs-fm-viewer img').getAttribute('src'), 'cg.png');
    syncForumReader(overlay, view(false));
    assert.ok(!overlay.querySelectorAll('.igs-fm-img')[1].hasAttribute('data-folded'));
});
