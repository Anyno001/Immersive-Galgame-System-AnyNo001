import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { logRowsOf } from '../src/visual/igs-ui/log-reader-model.js';
import {
    FORUM_USER_KEY, applyFloorTags, emptyForum, ensureAliases, forumWithTail, floorMarks, forumChainTail, forumAnkeLockKey, forumAnkeOf, forumClock, forumHash, forumFixedOf, forumMinutesAfter, forumNo, forumPairOf, forumPasserId, forumPlan, forumPoId, forumPrevRepliesOf, forumRepliesOf, forumRowsOf, forumTagsOf, forumTailCount, forumTailOf,
    normalizeForum, parseForumTag, replaceNames, resolvePoster, sendClock, threadAt, titleAt,
} from '../src/visual/igs-ui/forum-reader-model.js';
import { normalizeForumReaderSettings } from '../src/visual/igs-ui/forum-reader-settings.js';
import { FORUM_KAOMOJI, FORUM_LINES } from '../src/visual/igs-ui/forum-reader-lines.js';
import { ankeCheckPlay, ankeCocPlay, ankeOutcomeOf, ankeFillLine, ankeVisibleVotes, ankeVoteOf, ankeVotePlay } from '../src/visual/igs-ui/forum-anke-play.js';
import { ANKE_REACT_POOLS, ANKE_REACT_STICKERS, ankeReactions, ankeSituation } from '../src/visual/igs-ui/forum-anke-react.js';
import { ankeQuotedFloors, createAnkeStore } from '../src/visual/igs-ui/forum-anke-store.js';
import { stickerNames } from '../src/stickers/sticker-catalog.js';
import { appendInputDraft } from '../src/host/input-channel.js';
import { createForumRegistry } from '../src/visual/igs-ui/forum-reader-registry.js';
import { finishForumReveal, syncForumReader } from '../src/visual/igs-ui/forum-reader-layer.js';
import { FORUM_READER_STYLE_TEXT } from '../src/visual/igs-ui/forum-reader-style.js';
import { collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';
import { canonicalizeIgsDirectives, stripMarkerDirectives } from '../src/scene/directive-tags.js';

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
    const [back, again] = plan[0].replies.filter((r) => /^(你吃瓜|我又来)/.test(r.text));
    assert.equal(back.quote, '前排吃瓜，这瓜保熟吗我先尝一口再说，…');
    const first = forumPlan(rows, { chatId: 'c', messageId: 0, settings: { replies: 'normal' }, threadId: 't1', aiReplies: forumRepliesOf(chat[0].mes) });
    assert.equal(again.id, first[0].replies.find((r) => r.text === '真的假的').id);
    const block = collectGrammarBlocks({ forumReader: { on: true }, _forumPrev: prev }).find((b) => b.key === 'forum').full;
    assert.ok(block.includes('上一轮回帖：1.路人甲：真的假的') && block.includes('>上第几条'));
    assert.ok(!collectGrammarBlocks({ forumReader: { on: true, replies: 'off' }, _forumPrev: prev }).find((b) => b.key === 'forum').full.includes('上一轮回帖'));
});

test('正文分成很多段时 AI 写的回帖一条不丢，楼号不重复', () => {
    const rows = forumRowsOf(rowsOf(Array.from({ length: 24 }, (_, i) => page('narration', `第${i}句。`))), { poster: { kind: 'witness' }, alias: {}, userKey: '我', settings: {} });
    const mes = Array.from({ length: 6 }, (_, i) => `[igs-reply:路人${i}|第${i}条]`).join('');
    const plan = forumPlan(rows, { chatId: 'c', messageId: 5, settings: { perPost: 2, replies: 'normal' }, aiReplies: forumRepliesOf(mes) });
    assert.equal(plan.length, 8);
    const all = plan.flatMap((p) => p.replies);
    assert.deepEqual(all.filter((r) => /^第\d条$/.test(r.text)).map((r) => r.text), Array.from({ length: 6 }, (_, i) => `第${i}条`));
    assert.ok([1, 2].includes(all.length - 6));
    assert.equal(plan.at(-1).replies.at(-1).text, '第5条');
    const nos = plan.flatMap((p) => [p.no, ...p.replies.map((r) => r.no)]);
    assert.equal(new Set(nos).size, nos.length);
});

test('AI 回帖排位：#片段 排在含该句的楼之后 1–2 楼并带引用，>N 跟在目标回帖之后，>上N 排在开头，其余在最后，不截断 60 字', () => {
    const rows = forumRowsOf(rowsOf(Array.from({ length: 24 }, (_, i) => page('narration', `第${i}句。`))), { poster: { kind: 'witness' }, alias: {}, userKey: '我', settings: {} });
    const long = '长'.repeat(80);
    assert.deepEqual(forumRepliesOf('[igs-reply:路人|>1|#第7句|内容][igs-reply:#第3 句|嗯]').map((r) => [r.who, r.to, r.cite, r.text]), [['路人', 1, '第7句', '内容'], ['#0', 0, '第3 句', '嗯']]);
    const mes = `[igs-reply:路人甲|#第7句|引用七句${long}][igs-reply:路人乙|>1|接甲][igs-reply:路人丙|>上1|旧话回应][igs-reply:路人丁|#不存在的话|收尾][igs-reply:路人戊|#第 3 句|宽松匹配]`;
    const plan = forumPlan(rows, { chatId: 'c', messageId: 5, settings: { perPost: 2, replies: 'normal' }, aiReplies: forumRepliesOf(mes), prevReplies: [{ who: '路人丙', text: '旧话' }] });
    const at = (prefix) => plan.findIndex((p) => p.replies.some((r) => r.text.startsWith(prefix)));
    const reply = (prefix) => plan.flatMap((p) => p.replies).find((r) => r.text.startsWith(prefix));
    const postOf = (text) => plan.findIndex((p) => rows.slice(p.start, p.end + 1).some((r) => r.text === text));
    assert.ok([postOf('第7句。') + 1, postOf('第7句。') + 2].includes(at('引用七句')));
    assert.equal(reply('引用七句').quote, '第7句');
    assert.ok([postOf('第3句。') + 1, postOf('第3句。') + 2].includes(at('宽松匹配')));
    assert.equal(at('接甲'), at('引用七句'));
    assert.ok(plan.flatMap((p) => p.replies).findIndex((r) => r.text.startsWith('接甲')) > plan.flatMap((p) => p.replies).findIndex((r) => r.text.startsWith('引用七句')));
    assert.equal(reply('接甲').ref, reply('引用七句').no);
    assert.ok([0, 1].includes(at('旧话回应')));
    assert.equal(at('收尾'), plan.length - 1);
    assert.equal(reply('收尾').quote, '');
    assert.ok(reply('引用七句').text.length > 80);
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
    assert.equal(overlay.querySelector('.igs-fm-bar-board').textContent, '综合版1');
    assert.equal(overlay.querySelector('.igs-fm-thread h1').textContent, '【求助】在线等');
    assert.equal(overlay.querySelectorAll('.igs-fm-post').length, 2);
    assert.ok(overlay.querySelector('.igs-fm-id').textContent.includes('Neko4Ka'));
    assert.equal(overlay.querySelector('.igs-fm-pobadge').textContent, 'Po');
    assert.equal(overlay.querySelectorAll('.igs-fm-boardtag').length, 0);
    assert.equal(overlay.querySelector('.igs-fm-meta .igs-fm-nm').textContent, '无名氏');
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
    const lines = [...FORUM_LINES.image, ...FORUM_LINES.imageWitness];
    for (const reply of plan[0].replies) {
        const face = FORUM_KAOMOJI.find((f) => reply.text.endsWith(f)) || '';
        const word = reply.text.slice(0, reply.text.length - face.length);
        assert.ok(word === '' ? Boolean(face) : lines.includes(word), reply.text);
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

test('情绪标签：关 / 全部 / 随机；同一人同一情绪连说只在第一句标，旧 showMood 迁移为全部', () => {
    const src = rowsOf([
        page('dialogue', '喂。', { bubbleSpeaker: '霜见', bubbleMood: '冷淡' }),
        page('dialogue', '走快点。', { bubbleSpeaker: '霜见' }),
        page('dialogue', '还有你。', { bubbleSpeaker: '霜见', bubbleMood: '生气' }),
    ]);
    const ctx = (mood) => ({ poster: { kind: 'witness' }, alias: { 霜见: 'B' }, userKey: '我', settings: { mood } });
    assert.deepEqual(forumRowsOf(src, ctx('off')).map((r) => r.moodTag), ['', '', '']);
    assert.deepEqual(forumRowsOf(src, ctx('all')).map((r) => r.moodTag), ['冷淡', '', '生气']);
    assert.deepEqual(forumRowsOf(src, ctx('all')).map((r) => r.cont), [false, true, false]);
    const random = forumRowsOf(src, ctx('random')).map((r) => r.moodTag);
    assert.equal(random[1], '');
    assert.deepEqual(forumRowsOf(src, ctx('random')).map((r) => r.moodTag), random);
    assert.equal(normalizeForumReaderSettings({ showMood: true }).mood, 'all');
    assert.equal(normalizeForumReaderSettings({}).mood, 'off');
});

test('台词引号：默认关，可选中文引号或直角引号，非法值回落关', () => {
    assert.equal(normalizeForumReaderSettings({}).quote, 'off');
    assert.equal(normalizeForumReaderSettings({ quote: 'cn' }).quote, 'cn');
    assert.equal(normalizeForumReaderSettings({ quote: 'jp' }).quote, 'jp');
    assert.equal(normalizeForumReaderSettings({ quote: 'x' }).quote, 'off');
    assert.ok(/is-say[^}]*border-left/.test(FORUM_READER_STYLE_TEXT));
});

test('新楼开头接上楼末尾回帖：取计划末尾 1~3 条、按楼定死、同帖才接', () => {
    const rows = ['甲', '乙', '丙'].map((text, i) => ({ kind: 'narr', text, index: i, hidden: false }));
    const plan = forumPlan(rows, { chatId: 'c', messageId: 4, settings: { perPost: 1 }, aiReplies: ['a', 'b', 'c', 'd'].map((t) => ({ who: '#1', to: 0, prev: 0, cite: '', text: t })), threadStart: false });
    const all = plan.flatMap((p) => p.replies);
    assert.ok(all.length >= 4);
    assert.deepEqual(forumTailOf(plan, 2), all.slice(-2));
    assert.deepEqual(forumTailOf(plan, 3).map((r) => r.no), all.slice(-3).map((r) => r.no));
    assert.deepEqual(forumTailOf([], 2), []);
    const counts = new Set();
    for (let id = 0; id < 40; id++) { const n = forumTailCount('c', id); counts.add(n); assert.equal(n, forumTailCount('c', id)); }
    assert.deepEqual([...counts].sort(), [1, 2, 3]);
    const chat = [{ mes: 'x' }, { is_user: true }, { mes: 'y' }, { is_system: true }, { is_user: true }, { mes: 'z' }];
    const tails = new Map([[2, all.slice(-3)]]);
    const base = { chat, messageId: 5, lookup: (id) => tails.get(id) || null, sameThread: () => true, count: 2 };
    assert.deepEqual(forumChainTail(base), all.slice(-2));
    assert.deepEqual(forumChainTail({ ...base, start: true }), []);
    assert.deepEqual(forumChainTail({ ...base, sameThread: () => false }), []);
    assert.deepEqual(forumChainTail({ ...base, messageId: 0 }), []);
    assert.deepEqual(forumChainTail({ ...base, messageId: 2 }), []);
    assert.deepEqual(forumChainTail({ ...base, lookup: () => null }), []);
});

test('末尾回帖落进登记：内存缓存空也能读出，只留最近 30 楼，坏形状丢掉', () => {
    const item = (n) => ({ k: n, no: `No.${n}`, id: 'abcd1234', po: false, time: '12:00', text: `回${n}`, quote: '', ref: 0 });
    let data = emptyForum();
    for (let id = 1; id <= 35; id++) data = forumWithTail(data, id, { sig: `s${id}`, items: [item(id)] });
    assert.deepEqual(Object.keys(data.tails).map(Number).sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i + 6));
    const back = normalizeForum(JSON.parse(JSON.stringify(data)));
    const lookup = (id) => (back.tails[id] || {}).items || null;
    const chat = Array.from({ length: 40 }, () => ({ mes: 'x' }));
    assert.deepEqual(forumChainTail({ chat, messageId: 36, count: 2, sameThread: () => true, lookup }), [item(35)]);
    assert.deepEqual(forumChainTail({ chat, messageId: 4, count: 2, sameThread: () => true, lookup }), []);
    assert.deepEqual(normalizeForum({ tails: { 3: { sig: 'x', items: [{ foo: 1 }] }, x: { sig: 'y', items: [item(1)] }, 4: 'z' } }).tails, {});
});

test('楼主文本框：留空自动、一人锁定、两人交替；旧按钮折算；锁定后换人从本楼起生效且短提示词写明楼主', () => {
    assert.equal(normalizeForumReaderSettings({ posterText: '' }).poster, 'auto');
    assert.deepEqual(forumPairOf({ posterText: '阿吒、霜见' }), [A, B]);
    assert.deepEqual(forumFixedOf({ posterText: 'User' }), { kind: 'user' });
    assert.equal(normalizeForumReaderSettings({ poster: 'user' }).posterText, '{{user}}');
    assert.equal(normalizeForumReaderSettings({ poster: 'char' }).poster, 'auto');
    const before = applyFloorTags(emptyForum(), 3, [], { known, fallbackPo: A, firstFloor: 3, chatId: 'c' }).data;
    const fixed = forumFixedOf({ posterText: '霜见' });
    const after = applyFloorTags(before, 5, tagsOf('[igs-forum:新帖|楼主=阿吒]'), { known, posterLock: 'fixed', fixed, firstFloor: 3, chatId: 'c' }).data;
    assert.equal(threadAt(after, 3).po.key, '阿吒');
    assert.equal(threadAt(after, 5).po.key, '霜见');
    const block = collectGrammarBlocks({ forumReader: { on: true, posterText: '霜见' }, _forum: after }).find((b) => b.key === 'forum');
    assert.match(block.full, /楼主是霜见，不要改/);
});

test('半角 [ 开头、「】」收口的台词不漏出 】，台词里成对的【门】不截断', () => {
    assert.equal(canonicalizeIgsDirectives('[igs-char:李哪吒|慌乱|白衬衫|……怎么里头这么怪……喂！】'), '[igs-char:李哪吒|慌乱|白衬衫|……怎么里头这么怪……喂！]');
    assert.equal(canonicalizeIgsDirectives('[igs-char:李哪吒|慌乱|白衬衫|……怎么【门】里头这么怪……喂！】'), '[igs-char:李哪吒|慌乱|白衬衫|……怎么【门】里头这么怪……喂！]');
    assert.equal(canonicalizeIgsDirectives('[igs-char:李哪吒|慌乱|白衬衫|……怎么【门】里头这么怪……喂！]'), '[igs-char:李哪吒|慌乱|白衬衫|……怎么【门】里头这么怪……喂！]');
});

test('安科标签：四种形式与旧格式、判定的成功线 / 对象 / 属性、选项数与别名', () => {
    assert.deepEqual(forumAnkeOf('[igs-anke:去哪|甲|乙|丙]'), { kind: 'pick', question: '去哪', options: ['甲', '乙', '丙'] });
    assert.equal(forumAnkeOf('[igs-anke:投票|去哪|甲|乙]').kind, 'vote');
    assert.equal(forumAnkeOf('[igs-anke:多数决|去哪|甲]'), null);
    assert.equal(forumAnkeOf('[igs-anke:安价|说什么|甲|乙|丙|丁|戊|己|庚|辛|壬|癸]').options.length, 8);
    assert.equal(forumAnkeOf('[igs-anke:征集|取名|甲|乙]').kind, 'collect');
    assert.deepEqual(forumAnkeOf('[igs-anke:判定|偷看|阿吒|敏捷|60]'), { kind: 'check', question: '偷看', options: [], actor: '阿吒', ability: 'dex', abilityText: '敏捷', line: 60 });
    const loose = forumAnkeOf('[igs-anke:判定|逃跑|楼主|乱写|0|120]');
    assert.deepEqual([loose.actor, loose.ability, loose.line], ['楼主', null, 50]);
    assert.notEqual(forumAnkeLockKey('c', 1, forumAnkeOf('[igs-anke:多数决|去哪|甲|乙]')), forumAnkeLockKey('c', 1, forumAnkeOf('[igs-anke:多数决|去哪|甲|丙]')));
});

test('CoC 检定安科：解析技能值 / 难度 / 编号，旧几种的锁键不受影响', () => {
    assert.deepEqual(forumAnkeOf('[igs-anke:检定|要不要拉开浴帘|{{user}}|侦查|60|困难|F_box]'), { kind: 'coc', question: '要不要拉开浴帘', options: [], actor: '{{user}}', skill: '侦查', value: 60, level: '困难', code: 'F_box' });
    const loose = forumAnkeOf('[igs-anke:检定|听|楼主|聆听|50|乱写]');
    assert.deepEqual([loose.level, loose.code], ['普通', '']);
    assert.equal(forumAnkeOf('[igs-anke:检定|听|楼主|聆听|没写]'), null);
    const pick = forumAnkeOf('[igs-anke:判定|偷看|阿吒|敏捷|60]');
    assert.equal(forumAnkeLockKey('c', 1, pick), `c:1:${forumHash(JSON.stringify([pick.kind, pick.question, pick.options, pick.actor, pick.ability, pick.line]))}`);
    assert.notEqual(forumAnkeLockKey('c', 1, forumAnkeOf('[igs-anke:检定|听|楼主|聆听|50|普通|F1]')), forumAnkeLockKey('c', 1, forumAnkeOf('[igs-anke:检定|听|楼主|聆听|50|普通|F2]')));
});

test('CoC 检定结算与填入行：难度线、大成功大失败、编号带回', () => {
    assert.deepEqual(ankeCocPlay({ die: 23, value: 60, level: '困难' }), { tier: '困难成功', ok: true, need: 30 });
    assert.deepEqual(ankeCocPlay({ die: 40, value: 60, level: '困难' }), { tier: '成功', ok: false, need: 30 });
    assert.equal(ankeCocPlay({ die: 97, value: 40 }).tier, '大失败');
    assert.equal(ankeCocPlay({ die: 97, value: 60 }).tier, '失败');
    assert.equal(ankeCocPlay({ die: 1, value: 5, level: '极难' }).ok, true);
    const coc = { kind: 'coc', actor: '{{user}}', actorLabel: '我', skill: '侦查', value: 60, level: '困难', code: 'F_box' };
    assert.equal(ankeFillLine(coc, { pick: -1, die: 23 }), '【检定】我 侦查：1D100=23，困难线30，困难成功 #F_box');
    assert.equal(ankeFillLine(coc, { pick: -1, die: 40 }), '【检定】我 侦查：1D100=40，困难线30，成功（没达到难度） #F_box');
    assert.equal(ankeFillLine({ ...coc, level: '普通', code: '' }, { pick: -1, die: 70 }), '【检定】我 侦查：1D100=70，技能60，失败');
    assert.deepEqual(ankeOutcomeOf(coc, { die: 40 }), { tier: '失败', diff: -10 });
});

test('楼层计划预留安科楼与候选楼：号码排在最后一个主楼之后、AI 回帖之前，时间每楼推后 1 分钟', () => {
    const rows = forumRowsOf(rowsOf([page('dialogue', '一句。', { bubbleSpeaker: '阿吒' }), page('dialogue', '二句。', { bubbleSpeaker: '阿吒' })]), { poster: { kind: 'witness' }, alias: {}, userKey: '我', settings: {} });
    const ai = forumRepliesOf('[igs-reply:路人甲|投2][igs-reply:路人乙|2+1]');
    const plan = forumPlan(rows, { chatId: 'c', messageId: 4, settings: { perPost: 1, replies: 'normal' }, poId: 'p', aiReplies: ai, sceneTime: '17:40', reserve: 4 });
    const last = plan[plan.length - 1];
    assert.equal(last.reserved.length, 4);
    assert.equal(last.reserved[0].id, 'p');
    assert.equal(last.reserved[1].time, forumMinutesAfter(last.time, 2));
    const nos = [...plan.flatMap((p) => [p.no, ...(p.reserved || []).map((r) => r.no), ...p.replies.map((r) => r.no)])];
    assert.deepEqual(nos, [...nos].sort((a, b) => a - b));
    assert.equal(new Set(nos).size, nos.length);
    assert.ok(forumNo('c', 4, last.nextK) > nos[nos.length - 1]);
});

test('多数决：认 投N / N+1 / N！的票，暗骰按权重、票数严格最多且不少于可见票', () => {
    assert.deepEqual(['投3', '2+1', '2！！！面馆', '随便聊聊'].map((t) => ankeVoteOf(t, 3)), [3, 2, 2, 0]);
    assert.equal(ankeVoteOf('投9', 3), 0);
    assert.deepEqual(ankeVisibleVotes(3, ['投2', '2+1', '3！', '哈哈']), [0, 2, 1]);
    for (let s = 0; s < 40; s++) {
        const play = ankeVotePlay({ visible: [1, 3, 0], pick: s % 3, unit: () => (s % 10) / 10, seed: `t${s}` });
        const mins = [1, 3, 0].map((v, i) => v + (i === s % 3 ? 1 : 0));
        assert.ok(play.tally.every((v, i) => v >= mins[i]));
        assert.ok(play.tally.every((v, i) => i === play.winner || v < play.tally[play.winner]));
        const total = play.tally.reduce((a, b) => a + b, 0);
        assert.ok(total >= 18 && total <= 34);
    }
    const low = ankeVotePlay({ visible: [0, 0, 0], pick: 1, unit: () => 0.1, seed: 'a' });
    assert.equal(low.winner, 0);
    assert.equal(ankeVotePlay({ visible: [0, 0, 0], pick: 1, unit: () => 0.1, seed: 'a' }).tally.join(), low.tally.join());
});

test('判定与填入行：按 CoC，大成功 / 大失败优先，其余 1D100 ≤ 成功线+加值；各形式的填入文字', () => {
    assert.equal(ankeCheckPlay({ die: 4, bonus: -5, line: 10 }).tier, '大成功');
    assert.equal(ankeCheckPlay({ die: 97, bonus: 50, line: 90 }).tier, '大失败');
    assert.equal(ankeCheckPlay({ die: 30, bonus: 0, line: 50 }).tier, '成功');
    assert.equal(ankeCheckPlay({ die: 65, bonus: 10, line: 60 }).tier, '成功');
    assert.equal(ankeCheckPlay({ die: 58, bonus: -5, line: 60 }).tier, '失败');
    assert.equal(ankeCheckPlay({ die: 58, bonus: -5, line: 60 }).diff, -3);
    const check = { kind: 'check', actor: '楼主', actorLabel: '阿吒', line: 60, bonus: 10 };
    assert.equal(ankeFillLine(check, { pick: -1, die: 51, total: 61, tier: '成功' }), '【判定】阿吒：1D100=51，成功线60+10=70，成功');
    assert.equal(ankeFillLine({ ...check, bonus: null }, { pick: -1, die: 3, total: 3, tier: '大成功' }), '【判定】阿吒：1D100=3，成功线60，大成功');
    const opts = ['甲', '乙', '丙'];
    assert.equal(ankeFillLine({ kind: 'vote', options: opts }, { pick: 1, roll: 2, tally: [4, 11, 13] }), '【多数决】投2，3号胜出：丙（4/11/13票）');
    const floors = [{ no: 5501 }, { no: 5502 }, { no: 5503 }];
    assert.equal(ankeFillLine({ kind: 'anchor', options: opts, floors }, { pick: 1, roll: 3, die: 2 }), '【安价】>>No.5502 乙（🎲1D3=2）');
    assert.equal(ankeFillLine({ kind: 'collect', options: opts, floors }, { pick: 2, roll: 0 }), '【征集】采用>>No.5503：丙');
    assert.equal(ankeFillLine({ kind: 'collect', options: opts, floors }, { pick: -1 }), '【征集】');
});

test('内置短楼：词池 15–80 条且表情包名在目录里，数量按情境，组内不重复、避开 AI 已有句子、同种子同结果', () => {
    const names = new Set(stickerNames());
    for (const [pool, list] of Object.entries(ANKE_REACT_POOLS)) {
        if (pool !== 'voter') assert.ok(list.length >= 15 && list.length <= 80, pool);
        assert.equal(new Set(list).size, list.length, pool);
    }
    for (const list of Object.values(ANKE_REACT_STICKERS)) assert.ok(list.every((n) => names.has(n)));
    const big = ankeReactions({ kind: 'check', outcome: { tier: '大成功', diff: 40 }, seed: 'x', ids: ['a1', 'b2', 'c3', 'd4'] });
    assert.ok(big.length >= 3 && big.length <= 4);
    assert.equal(new Set(big.map((r) => r.text)).size, big.length);
    assert.deepEqual(ankeReactions({ kind: 'check', outcome: { tier: '大成功', diff: 40 }, seed: 'x', ids: ['a1', 'b2', 'c3', 'd4'] }), big);
    const plain = ankeReactions({ kind: 'anchor', outcome: { mode: 'mid' }, seed: 'y', ids: ['a1'] });
    assert.ok(plain.length >= 1 && plain.length <= 2);
    const avoid = ANKE_REACT_POOLS.mid.slice(1);
    for (let s = 0; s < 30; s++) for (const r of ankeReactions({ kind: 'anchor', outcome: { mode: 'mid' }, seed: `z${s}`, ids: ['a1'], avoid })) assert.ok(!avoid.includes(r.text));
    assert.equal(ankeSituation('check', { tier: '失败', diff: -3 }), 'nearFail');
    assert.equal(ankeSituation('check', { tier: '成功', diff: 2 }), 'nearPass');
    assert.equal(ankeSituation('vote', { won: true, lead: 2 }), 'voteClose');
    assert.equal(ankeSituation('vote', { won: false, lead: 9 }), 'voteCrush');
    let voter = null;
    for (let s = 0; s < 40 && !voter; s++) voter = ankeReactions({ kind: 'vote', outcome: { won: true, lead: 4, voters: [{ id: 'zz', n: 1 }] }, seed: `v${s}`, ids: ['a1'] }).find((r) => r.id === 'zz');
    assert.ok(voter && voter.text.includes('1') && !voter.text.includes('{n}'));
});

test('安科锁：写读、只留最近 200 条、读不到元数据时留在内存；引用内置楼时查得到楼号', () => {
    const memory = createAnkeStore({ getContext: () => null, getChatId: () => 'c1' });
    memory.put('k', { kind: 'vote' });
    assert.equal(memory.get('k').kind, 'vote');
    const meta = {};
    let saved = 0;
    const store = createAnkeStore({ getContext: () => ({ chatMetadata: meta, saveMetadata: () => { saved += 1; } }), getChatId: () => 'c1' });
    for (let i = 0; i < 205; i++) store.put(`k${i}`, { kind: 'check', floors: [], react: [] });
    assert.equal(Object.keys(meta.igs_forum_anke).length, 200);
    assert.ok(!store.get('k4') && store.get('k5') && saved === 205);
    const locks = { a: { floors: [{ no: 5501, text: '候选甲' }], react: [{ no: 5502, text: '[igs-sticker:开心]' }, { no: 5503, text: '楼主快更[igs-sticker:期待]' }] } };
    assert.deepEqual(ankeQuotedFloors(locks, '>>No.5501 和 >>5502，还有 >>No.9'), [{ no: '5501', text: '候选甲' }, { no: '5502', text: '（表情包：开心）' }]);
    assert.deepEqual(ankeQuotedFloors(locks, '没有引用'), []);
    const block = collectGrammarBlocks({ forumReader: { on: true, anke: 'key' }, _forumQuoted: [{ no: '5503', text: '楼主快更' }] }).find((b) => b.key === 'forum').full;
    assert.ok(block.includes('{{user}} 引用的楼层：No.5503 路人说「楼主快更」') && block.includes('判定对象'));
    assert.ok(!collectGrammarBlocks({ forumReader: { on: true } }).find((b) => b.key === 'forum').full.includes('引用的楼层'));
});

function ankeView(overlay, kind, extra = {}) {
    overlay.ownerDocument.defaultView.matchMedia = () => ({ matches: true });
    const rows = forumRowsOf(rowsOf([page('dialogue', '一句。', { bubbleSpeaker: '阿吒' })]), { poster: { kind: 'witness' }, alias: {}, userKey: '我', settings: {} });
    const options = kind === 'check' ? [] : ['甲', '乙', '丙'];
    const plan = forumPlan(rows, { chatId: 'c', messageId: 1, settings: { replies: 'normal' }, poId: 'p', reserve: kind === 'anchor' || kind === 'collect' ? 4 : 1, sceneTime: '17:40' });
    const slots = plan[plan.length - 1].reserved;
    const anke = {
        kind, question: '怎么办', options, key: `c:1:${kind}`, id: 'p', no: slots[0].no, time: slots[0].time, lock: null, readonly: false, actor: '阿吒', ability: 'dex', line: 50,
        floors: slots.slice(1).map((r, i) => ({ no: r.no, id: r.id, time: r.time, text: options[i] })), visible: [0, 0, 0], voters: [], passers: ['a1', 'b2', 'c3'], aiTexts: [],
        reactSlots: Array.from({ length: 5 }, (_, j) => ({ no: 9000 + j, time: `18:0${j}` })),
        ...extra,
    };
    const fills = [];
    const locks = [];
    const view = { floorKey: 'k', rows, plan, board: '版', head: null, upto: 0, live: -1, settings: normalizeForumReaderSettings({}), sig: `s${kind}`, anke, ankeBonus: () => 10, onAnke: (text) => { fills.push(text); return { ok: true }; }, onAnkeLock: (key, value) => locks.push([key, value]) };
    return { view, fills, locks, anke };
}

test('安科楼：多数决点一次就锁，不能重投，重建后从锁恢复票数与勾，内置短楼带 is-builtin', () => {
    const { overlay } = mountOverlay();
    const { view, fills, locks } = ankeView(overlay, 'vote');
    syncForumReader(overlay, view);
    assert.equal(overlay.querySelectorAll('.igs-fm-anke-opt').length, 3);
    overlay.querySelector('.igs-fm-anke-opt[data-pick="1"]').click();
    assert.equal(locks.length, 1);
    const lock = locks[0][1];
    assert.equal(lock.pick, 1);
    assert.match(fills[0], /^【多数决】投2，\d号胜出：.（\d+\/\d+\/\d+票）$/);
    assert.equal(overlay.querySelectorAll('.igs-fm-anke-trow').length, 3);
    assert.equal(overlay.querySelectorAll('.igs-fm-anke-trow.is-win').length, 1);
    assert.equal(overlay.querySelector('.igs-fm-anke-you').textContent, '你投了这个');
    assert.ok(overlay.querySelectorAll('.is-builtin').length >= 1);
    overlay.querySelector('.igs-fm-anke-opt[data-pick="2"]').click();
    assert.equal(locks.length, 1);
    assert.ok(overlay.querySelector('.igs-fm-anke').classList.contains('is-locked'));
    const again = ankeView(overlay, 'vote', { lock });
    syncForumReader(overlay, { ...again.view, sig: 'rebuilt' });
    assert.equal(overlay.querySelectorAll('.igs-fm-anke-trow').length, 3);
    assert.equal(overlay.querySelectorAll('.is-builtin').length, lock.react.length);
    assert.equal(overlay.querySelector('.igs-fm-anke-opt.is-pick').dataset.pick, String(lock.roll));
    assert.equal(again.locks.length, 0);
});

test('安科楼：安价候选楼排在安科楼之后，点楼选中并填入楼号；征集自己写一楼；只读时没锁就禁用', () => {
    const { overlay } = mountOverlay();
    const { view, fills } = ankeView(overlay, 'anchor');
    syncForumReader(overlay, view);
    const order = [...overlay.querySelectorAll('.igs-fm-list > *')].map((n) => ['igs-fm-anke', 'igs-fm-anke-floor', 'igs-fm-reply'].find((c) => n.classList.contains(c))).filter(Boolean);
    assert.deepEqual(order.slice(0, 4), ['igs-fm-anke', 'igs-fm-anke-floor', 'igs-fm-anke-floor', 'igs-fm-anke-floor']);
    overlay.querySelector('.igs-fm-anke-floor[data-floor="2"]').click();
    assert.match(fills[0], /^【安价】>>No\.\d+ 丙$/);
    assert.ok(overlay.querySelector('.igs-fm-anke-floor.is-pick'));
    const free = ankeView(overlay, 'collect');
    syncForumReader(overlay, { ...free.view, sig: 'c' });
    overlay.querySelector('.is-free').click();
    assert.equal(free.fills[0], '【征集】');
    const ro = ankeView(overlay, 'anchor', { readonly: true });
    syncForumReader(overlay, { ...ro.view, sig: 'ro' });
    overlay.querySelector('.igs-fm-anke-floor').click();
    assert.equal(ro.fills.length, 0);
    assert.equal(ro.locks.length, 0);
    assert.equal(overlay.querySelectorAll('.is-builtin').length, 0);
});

test('安科楼：出结果后可重新发送结果（刷新后从锁算出同一行，发过下一层也能发）；直接选择可撤销后重选，掷过骰与只读不能撤销', () => {
    const { overlay } = mountOverlay();
    const { view, fills, locks } = ankeView(overlay, 'anchor');
    syncForumReader(overlay, view);
    assert.equal(overlay.querySelector('.is-resend'), null);
    overlay.querySelector('.igs-fm-anke-floor[data-floor="1"]').click();
    overlay.querySelector('.is-resend').click();
    assert.equal(fills[1], fills[0]);
    const lock = locks[0][1];
    const refreshed = mountOverlay().overlay;
    const again = ankeView(refreshed, 'anchor', { lock });
    syncForumReader(refreshed, again.view);
    refreshed.querySelector('.is-resend').click();
    assert.deepEqual(again.fills, [fills[0]]);
    overlay.querySelector('.is-undo').click();
    assert.equal(fills[fills.length - 1], '');
    assert.deepEqual(locks[locks.length - 1], [view.anke.key, null]);
    assert.equal(overlay.querySelector('.igs-fm-anke-floor.is-pick'), null);
    assert.equal(overlay.querySelectorAll('.is-builtin').length, 0);
    overlay.querySelector('.igs-fm-anke-floor[data-floor="0"]').click();
    assert.match(fills[fills.length - 1], /^【安价】>>No\.\d+ 甲$/);
    const rolled = ankeView(overlay, 'anchor', { key: 'c:1:rolled', lock: { ...lock, roll: 3, die: 2 } });
    syncForumReader(overlay, { ...rolled.view, sig: 'rolled' });
    assert.ok(overlay.querySelector('.is-resend') && !overlay.querySelector('.is-undo'));
    const ro = ankeView(overlay, 'anchor', { lock, readonly: true });
    syncForumReader(overlay, { ...ro.view, sig: 'ro' });
    assert.ok(!overlay.querySelector('.is-undo'));
    overlay.querySelector('.is-resend').click();
    assert.deepEqual(ro.fills, [fills[0]]);
    assert.equal(appendInputDraft('写点什么\n【安价】2：乙\n再写', '', '【安价】2：乙'), '写点什么\n再写');
    assert.equal(appendInputDraft('已经清空了', '', '【安价】2：乙'), '已经清空了');
});

test('安科楼：判定掷骰后算式、结果与填入行一致，落定后不能重骰', () => {
    const { overlay } = mountOverlay();
    const { view, fills, locks } = ankeView(overlay, 'check');
    syncForumReader(overlay, view);
    assert.ok(overlay.querySelector('.igs-fm-anke-mods').textContent.includes('敏捷 +10'));
    overlay.querySelector('.is-roll').click();
    const lock = locks[0][1];
    assert.equal(lock.total, lock.die + 10);
    assert.ok(fills[0].startsWith('【判定】阿吒：1D100=') && fills[0].endsWith(lock.tier));
    assert.equal(overlay.querySelector('.igs-fm-anke-res').textContent, lock.tier);
    const rolled = overlay.querySelector('.igs-fm-anke-dice').textContent;
    overlay.querySelector('.igs-fm-anke-res').click();
    assert.equal(locks.length, 1);
    assert.equal(overlay.querySelector('.igs-fm-anke-dice').textContent, rolled);
});
