// 只读接口：IGS.api.feeds（正文里的社区帖子）与 IGS.api.live（正文里的直播段与弹幕）。
// 只放纯函数：不存状态、不发事件、不碰 DOM、存储和宿主；入参不合法返回空数组或空对象，不抛错；
// 返回值全部是新对象，调用方随便改也不会影响 IGS 内部。跨楼继承不在这里做，由调用方逐楼自己读。
// 接口只增不破：FEED_API_VERSION / LIVE_API_VERSION 往后只升不降，旧字段一直保留。
import { FEED_PLATFORMS, collectFeedPosts, resolveFeedPlatform } from '../scene/feed-platforms.js';
import { parseFeedExtra } from '../scene/feed-extra.js';
import { extractFxDirectives } from '../scene/fx-directives.js';
import { liveFallbackOf, withLiveFallback } from '../scene/live-context.js';

export const FEED_API_VERSION = 1;
export const LIVE_API_VERSION = 1;

const LIVE_KINDS = Object.freeze(['live', 'dm', 'danmaku']);

const textOf = (value) => (typeof value === 'string' ? value : '');

// 平台只给 { id, name, aliases, skin, extraLabel }：不带 prompt（用户可改的写法）和 accent。
function platformView(platform) {
    return { id: platform.id, name: platform.name, aliases: [...platform.aliases], skin: platform.skin, extraLabel: platform.extraLabel };
}

function postView(post) {
    return { ...post, replies: Array.isArray(post.replies) ? post.replies.map((reply) => ({ ...reply })) : [] };
}

export function createFeedsApi() {
    return {
        version: FEED_API_VERSION,
        platforms() { return FEED_PLATFORMS.map(platformView); },
        resolvePlatform(name) {
            const platform = typeof name === 'string' ? resolveFeedPlatform(name) : null;
            return platform ? platform.id : '';
        },
        // 与 collectFeedPosts 一致：[{ platform, owner, author, text, extra, replies, offset }]；
        // 舆论风暴的 mention 也在里面（kind:'storm'、tone、extra 为热搜词）。owner 为空是玩家自己的手机。
        collectPosts(text) { return collectFeedPosts(textOf(text)).map(postView); },
        // 附加栏拆分：review → { work, rating }；shop → { price, sales }；其余 → { text }。platform 可写 id、中文名或别名。
        parseExtra(platform, extra) {
            const resolved = typeof platform === 'string' ? resolveFeedPlatform(platform) : null;
            return parseFeedExtra(resolved ? resolved.id : '', extra);
        },
    };
}

function danmakuOf(d) {
    if (d.kind === 'dm') return [{ author: d.args[0] || '', content: d.args[1] || '', type: d.args[2] || 'text', extra: d.args[3] || '', offset: d.offset }];
    // 观众弹幕标签：甲/乙 按 '/' 拆成多条普通弹幕。
    return String(d.args[0] || '').split('/').filter(Boolean).map((line) => ({ author: '', content: line, type: 'text', extra: '', offset: d.offset }));
}

export function createLiveApi() {
    return {
        version: LIVE_API_VERSION,
        // 本楼的直播段：[{ host, title, view: 'host'|'watch', end, offset, danmaku: [{ author, content, type, extra, offset }] }]。
        // 写了 live 标签的按标签；没写的按正文里的开播 / 下播词兜底（主播是 userName，空则「主播」）。
        // 带平台的直播（暗网等）多一个 platform 字段，普通直播没有该字段。
        // host 为空串表示这一段承接上一楼的直播（本楼只有弹幕或只有 live-end）。
        // type 为 text / gift / sc / guard / enter，房管消息为 admin。
        collect(text, options) {
            const source = textOf(text);
            if (!source) return [];
            const userName = options && typeof options === 'object' ? options.userName : '';
            const parsed = extractFxDirectives(source).filter((d) => LIVE_KINDS.includes(d.kind));
            const merged = withLiveFallback(parsed, source, null, liveFallbackOf(userName)).filter((d) => LIVE_KINDS.includes(d.kind));
            const segments = [];
            let open = null;
            for (const d of merged) {
                if (d.kind === 'live') {
                    if (d.end) {
                        if (open) open.end = true;
                        // 只有显式 live-end 标签才为「承接上一楼」补一段；「收起手机」这类兜底词在没开着直播时不算。
                        else if (!d.cue) segments.push({ host: '', title: '', view: 'watch', end: true, offset: d.offset, danmaku: [] });
                        open = null;
                    } else if (!(d.cue && open)) {
                        open = { host: d.args[0] || '', title: d.args[1] || '', view: d.args[2] === 'host' ? 'host' : 'watch', end: false, offset: d.offset, danmaku: [] };
                        if (d.args[3]) open.platform = d.args[3];
                        segments.push(open);
                    }
                    continue;
                }
                if (!open) {
                    open = { host: '', title: '', view: 'watch', end: false, offset: d.offset, danmaku: [] };
                    segments.push(open);
                }
                open.danmaku.push(...danmakuOf(d));
            }
            return segments;
        },
    };
}
