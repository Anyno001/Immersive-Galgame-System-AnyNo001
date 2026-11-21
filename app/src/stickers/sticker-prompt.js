import { stickerLiveEmotions, stickerView } from './sticker-catalog.js';
import { normalizeStickerSettings } from './sticker-settings.js';

const FREQ_LINE = Object.freeze({
    low: '本轮最多一两个',
    mid: '每隔几句带一个',
    high: '几乎每句都可以带，仍按人物性格取舍',
});

// 画面描述的写法示例：按套组挑得上图的几句，不列出全部描述。
const DESC_EXAMPLES = Object.freeze({
    daimao: ['躲在墙后偷看', '开心地举起小爪子打招呼', '被粉色爱心包围'],
    nga: ['闭着眼咧嘴大笑', '双手捂着脸放声大哭', '半睁着眼一脸无语'],
});

// 表情包提示词块：只在打开方式为线上聊天或论坛、且 stickers.on 开着时给出（按设置判断，不按当前屏宽判断）；两种都开时清单只写一次。
// 可用情绪只列当前套组里有图（且没停用）的，用户新增的情绪也算；线上聊天固定呆猫八条，只开论坛时按论坛所选套组。
// 返回空串表示不注入。
export function stickerPromptBlock(readerSettings, { ancient = false } = {}) {
    const rs = readerSettings && typeof readerSettings === 'object' ? readerSettings : {};
    const st = normalizeStickerSettings(rs.stickers);
    const chat = Boolean(rs.chatReader && rs.chatReader.on === true);
    const forum = Boolean(rs.forumReader && rs.forumReader.on === true);
    if (!st.on || (!chat && !forum)) return '';
    const setId = chat ? 'daimao' : st.set;
    const names = stickerLiveEmotions(stickerView(setId, st.overrides), st.disabled).map((s) => s.name);
    if (!names.length) return '';
    const examples = DESC_EXAMPLES[setId] || DESC_EXAMPLES.daimao;
    const lines = [
        `【表情包】${chat && forum ? '线上聊天与论坛里' : chat ? '线上聊天里' : '论坛里'}，人物可以像真人一样发表情包：在台词所在的 [igs-char:…] 之后紧跟写 [igs-sticker:情绪名]（同一行），或单独成行（视为上一位说话人所发）；表情包要跟在有文字的台词之后；心里话里不写。`,
        `可用情绪名：${names.join('、')}。`,
        `也可以直接写想要的表情画面或动作，如 ${examples.map((x) => `[igs-sticker:${x}]`).join('、')}；描述越贴近画面越准，对不上时不显示。`,
        `按人物性格决定发不发、发哪种：${ancient ? '高冷、寡言的人物少发或不发，古代背景几乎不发' : '高冷、寡言或古代背景的人物少发或不发'}；亲昵类表情（如喜欢、抱抱）只对亲近的人发。${FREQ_LINE[st.freq]}。`,
    ];
    if (chat) lines.push('线上聊天示例：[igs-char:林小雨|害羞|谢谢你。][igs-sticker:害羞]');
    if (forum) lines.push('论坛回帖写在 [igs-reply:…|内容] 的内容里，如 [igs-reply:路人|笑死我了 [igs-sticker:开心]]；楼主正文的写法同上。');
    return lines.join('\n');
}
