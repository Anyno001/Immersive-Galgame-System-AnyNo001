import { normalizeFeedFxSettings } from './feed-settings.js';
import { normalizeMangaFxSettings } from './fx-settings.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';

// 手机社区的三项延伸（纯函数，不碰 DOM）：
// 1. 本页是否亮出社区手机（feedPageOf，danmaku-runtime 与漫符共用同一套判断）；
// 2. 帖子 / 评论里 @玩家 或写明「私信」的那一行，及点开后要显示的几句（feedDmThread）；
// 3. 在场角色看到本页新帖时头顶冒的漫符（planFeedMarks）。
// 所有文字都取自正文，不生成任何内容。
export const FEED_MARK_KIND = 'surprise';
export const FEED_MARK_MAX = 2;
export const FEED_DM_MAX = 6;
const DM_RE = /私信/;
const AT_RE = /@([^\s@:：,，]{1,16})/g;
const USER_MACRO = '{{user}}';

function text(value) {
    return String(value == null ? '' : value).trim();
}

// 玩家自己的称呼：角色名、「我」、没替换掉的 {{user}}。
function selfNames(userName) {
    const name = text(userName);
    return new Set([name, '我', USER_MACRO].filter(Boolean));
}

export function isSelfAuthor(author, userName) {
    return selfNames(userName).has(text(author));
}

// 文字里 @ 到玩家：「@我」或 @ 后紧跟玩家名（后面连着别的字也算）。
export function mentionsUser(value, userName) {
    const name = text(userName);
    for (const m of String(value == null ? '' : value).matchAll(AT_RE)) {
        const at = m[1];
        if (at === '我' || at === USER_MACRO) return true;
        if (name && at.startsWith(name)) return true;
    }
    return false;
}

// 私信行：@玩家或写明「私信」，且不是玩家自己写的。
export function isDmLine(line, userName) {
    const row = line || {};
    if (isSelfAuthor(row.author, userName)) return false;
    const body = text(row.text);
    return DM_RE.test(body) || mentionsUser(body, userName);
}

// 帖子加评论拍平成行：{ author, text, to }。
function linesOf(post) {
    const first = { author: text(post && post.author), text: text(post && post.text), to: '' };
    const replies = Array.isArray(post && post.replies) ? post.replies : [];
    return [first, ...replies.map((r) => ({ author: text(r && r.author), text: text(r && r.text), to: text(r && r.to) }))];
}

// 点开私信要显示的几句：整帖里的私信行，加上玩家自己在这帖下写的评论，按原顺序，各取正文原话。
// 没有私信行返回 null；peer 是第一个私信行的作者。
export function feedDmThread(post, userName) {
    const rows = linesOf(post);
    const dm = rows.find((row) => isDmLine(row, userName));
    if (!dm) return null;
    const items = rows
        .filter((row, index) => row.text && (isDmLine(row, userName) || (index > 0 && isSelfAuthor(row.author, userName))))
        .slice(0, FEED_DM_MAX)
        .map((row) => ({ side: isSelfAuthor(row.author, userName) ? 'self' : 'peer', text: row.text }));
    return { peer: dm.author, items };
}

// 本页社区手机的开关判断：开关开、NSFW 静音、聊天页 / 卡片页 / 回忆 / 梦境不亮；风暴期间社区让位（返回 feed 为 null）。
export function feedPageOf(content, feedFx) {
    const body = content || {};
    const fx = body.fx || {};
    const allowed = Boolean(feedFx && feedFx.enabled) && !(feedFx.muteOnNsfw && body.sceneNsfw === true)
        && body.chatPage !== true && body.htmlCardPage !== true && fx.flashback !== true && fx.dream !== true;
    const storm = allowed && feedFx.storm && feedFx.storm.enabled !== false && fx.storm ? fx.storm : null;
    const feed = allowed && !storm && fx.feed ? fx.feed : null;
    return { allowed, storm, feed };
}

// 知乎答主「名字，身份」只取名字。
function nameOnly(author) {
    return text(author).split(/[，,]/)[0].trim();
}

// 一条新帖牵涉到的人：作者、被回复的人（精确名字），正文与评论里 @ 到的人（@ 后可能连着别的字，按前缀认）。
function involvedNames(post) {
    const names = [{ name: nameOnly(post.author), at: false }];
    for (const m of text(post.text).matchAll(AT_RE)) names.push({ name: m[1], at: true });
    for (const reply of Array.isArray(post.replies) ? post.replies : []) {
        names.push({ name: text(reply && reply.to), at: false });
        for (const m of text(reply && reply.text).matchAll(AT_RE)) names.push({ name: m[1], at: true });
    }
    return names.filter((n) => n.name);
}

// 在场角色看到本页新帖：只看 fresh 帖子牵涉到的人，认得出的在场角色各冒一个漫符；
// speaker 为 true 的条目落在当前说话人的立绘上，其余是陪衬。最多 FEED_MARK_MAX 个，玩家自己不算。
export function planFeedMarks({ feed, userName, speakerKey = '', members = [], keyOf = (name) => name } = {}) {
    const posts = (feed && Array.isArray(feed.posts) ? feed.posts : []).filter((p) => p && p.fresh === true);
    if (!posts.length) return [];
    const speaker = speakerKey ? text(keyOf(speakerKey)) : '';
    const cast = [speaker, ...(Array.isArray(members) ? members : []).map((m) => text(m))].filter(Boolean);
    const marks = [];
    const seen = new Set();
    for (const post of posts) {
        for (const { name, at } of involvedNames(post)) {
            if (marks.length >= FEED_MARK_MAX) return marks;
            if (isSelfAuthor(name, userName)) continue;
            const key = text(keyOf(name)) || name;
            const hit = cast.find((c) => c === key || (at && name.startsWith(c)));
            if (!hit || seen.has(hit)) continue;
            seen.add(hit);
            marks.push(hit === speaker ? { character: hit, kind: FEED_MARK_KIND, speaker: true } : { character: hit, kind: FEED_MARK_KIND });
        }
    }
    return marks;
}

// 阅读器侧入口：按快照的设置判断本页要不要冒漫符。社区手机本页亮出、漫符开关开、非 NSFW 场景才算。
export function feedMarksForSnapshot(snapshot, { userName = '', speakerKey = '', members = [] } = {}) {
    const reader = (snapshot && snapshot.readerSettings) || {};
    const content = (snapshot && snapshot.content) || {};
    if (!normalizeMangaFxSettings(reader.mangaFx).enabled || content.sceneNsfw === true || content.cgNsfw === true) return [];
    const { feed } = feedPageOf(content, normalizeFeedFxSettings(reader.feedFx));
    if (!feed) return [];
    const assets = reader._sceneAssets && typeof reader._sceneAssets === 'object' ? reader._sceneAssets : {};
    const keyOf = (name) => {
        const raw = text(name);
        return raw ? resolveCharacterKey(assets.characters, assets.characterAliases, raw) || raw : '';
    };
    return planFeedMarks({ feed, userName, speakerKey, members, keyOf });
}
