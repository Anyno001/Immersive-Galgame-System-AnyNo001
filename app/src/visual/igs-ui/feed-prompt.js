import { normalizeFeedFxSettings, activeFeedPlatforms, feedPlatformPrompt, stormPromptOf } from './feed-settings.js';

// 手机社区语法：帖子与评论全部由 AI 写，前端不补内容；平台行按当前世界观与开关生成。
const FEED_INTRO = '，帖子评论全由你写，贴合剧情与人物，前端不补内容';

function feedState(readerSettings) {
    const raw = readerSettings && readerSettings.feedFx;
    const s = normalizeFeedFxSettings(raw);
    const platforms = s.enabled ? activeFeedPlatforms(s) : [];
    // mentioned：bootstrap 按最近上下文写入的平台 id；undefined 表示不按需（旧路径），全部展开。
    const mentioned = raw && Array.isArray(raw.mentioned) ? raw.mentioned : null;
    return { s, platforms, mentioned };
}

function feedLines(s, platforms, mentioned = null) {
    const detailed = mentioned ? platforms.filter((p) => mentioned.includes(p.id)) : platforms;
    const rest = platforms.filter((p) => !detailed.includes(p));
    return [
        ...feedTagLines(),
        ...(s.storm.enabled ? stormLines(s) : []),
        ...detailed.map((p) => `${p.name}（附加写${p.extraLabel}）：${feedPlatformPrompt(s, p.id)}`),
        ...(rest.length ? [`其他可用平台：${rest.map((p) => p.name).join('、')}`] : []),
    ];
}

function feedTagLines() {
    return [
        'app|平台|主人 … app-end：看社交媒体、刷手机、告示等就主动包住；平台只写列出的名字，泛指时挑最贴的；主人省略即自己的，偷看角色的写其名',
        'post|作者|内容|附加：一条帖子，放在被看到的正文前；每次2~4条，内容≤80字，附加按平台写，可省',
        'reply|作者|内容：上一条帖子的评论，每帖0~3条',
    ];
}

// 舆论风暴：语法行固定，写法说明可改。
function stormLines(s) {
    return [
        'storm|平台|红或黑|热搜词 … storm-end',
        'mention|网友|内容：@{{user}}的评论',
        `舆论风暴：${stormPromptOf(s)}`,
    ];
}

export function feedGrammarBlocks(readerSettings, fxBlock) {
    const { s, platforms, mentioned } = feedState(readerSettings);
    if (!platforms.length) return [];
    return [{ key: 'feed', adaptive: true, full: fxBlock('手机社区', feedLines(s, platforms, mentioned || []), FEED_INTRO), index: '社区 igs-fx:app/app-end/post/reply/storm' }];
}

// 关闭按需注入时的旧行为：完整规则整段拼接。
export function resolveFeedPromptRule(readerSettings) {
    const { s, platforms } = feedState(readerSettings);
    if (!platforms.length) return '';
    const lines = feedLines(s, platforms);
    const tagCount = s.storm.enabled ? 5 : 3;
    const tags = lines.slice(0, tagCount).map((line, i) => `${i + 1}. [igs-fx:${line.replace(' … ', '] … [igs-fx:').replace(/：|$/, ']$&')}`);
    return `[igs手机社区标签]\n角色或{{user}}刷社区时使用以下标签（属于允许使用的igs标签，每条独立成行，字段不换行、不含 | 或 ]）${FEED_INTRO}：\n${tags.join('\n')}\n平台写法：\n${lines.slice(tagCount).map((l) => `- ${l}`).join('\n')}`;
}
