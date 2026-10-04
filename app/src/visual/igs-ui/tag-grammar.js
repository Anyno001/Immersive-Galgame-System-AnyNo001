import { BGM_GRAMMAR_LINE, bgmMoodTagEnabled, fxGrammarLines, ITEM_FX_GRAMMAR_LINE, romanceGrammarLines, stageCastGrammarLines } from './fx-prompt.js';
import { dailyGrammarLines } from './fx-daily-prompt.js';
import { BATTLE_GRAMMAR_LINES } from './fx-battle-model.js';
import { textFxGrammarBlock } from './text-fx.js';
import { bilingualGrammarBlock, normalizeBilingualSettings } from './bilingual-text.js';
import { normalizeChatShowSettings, resolveChatShowGrammar } from './chat-show-runtime.js';
import { enabledFxTagKinds } from './fx-settings.js';
import { enabledDailyFxKinds } from './fx-daily-model.js';
import { danmakuGrammarBlocks } from './danmaku-prompt.js';

export const PROMPT_PLACEMENTS = Object.freeze(['system', 'depth0']);
export const DEPTH0_REMINDER = '本轮按系统说明中的igs标签语法输出标签。';

// 通用规则只写一次，各功能块只写类型行。
const GRAMMAR_HEADER = `[igs标签语法]
以下igs标签是附加在正文上的元数据，供前端渲染读取；正文的文风、叙事密度和段落节奏完全照其他指令，读者略去全部标签后，剩余正文仍是一篇完整的文章。
通用规则：每条标签独占一行、用方括号包裹，放在它作用的正文之前；参数用|分隔，字段内不换行、不含|或]；成对标签必须闭合；只用下面列出的类型，不发明新标签；瞬时标签（单条的演出、日常、物品、亲密标签）只在关键时刻用，每层合计不超过3个，不要每层都用。`;

function fxBlock(title, lines, intro = '') {
    if (!lines.length) return '';
    return `【${title}】写作 [igs-fx:类型|参数]${intro}：\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// 每块给出完整写法与降级后的索引写法；块顺序即预算填充优先级。
export function collectGrammarBlocks(readerSettings, { ancient = false } = {}) {
    const rs = plain(readerSettings);
    const blocks = [];
    if (normalizeBilingualSettings(rs.bilingual).enabled) {
        blocks.push({ key: 'bilingual', full: bilingualGrammarBlock(rs.bilingual), index: '双语台词 原文〖译文〗' });
    }
    if (plain(rs.textFx).enabled === true) {
        blocks.push({ key: 'text', full: textFxGrammarBlock(), index: '文字演出 {效果:文字}' });
    }
    const fxKinds = enabledFxTagKinds(rs.fxTags);
    if (fxKinds.length) {
        blocks.push({ key: 'fx', full: fxBlock('演出', fxGrammarLines(rs.fxTags, { ancient })), index: `演出 igs-fx:${fxKinds.join('/')}` });
    }
    if (plain(rs.itemFx).enabled === true) {
        blocks.push({ key: 'item', full: fxBlock('物品', [ITEM_FX_GRAMMAR_LINE]), index: '物品 igs-fx:item' });
    }
    if (bgmMoodTagEnabled(rs.bgm)) {
        blocks.push({ key: 'bgm', full: fxBlock('配乐', [BGM_GRAMMAR_LINE]), index: '配乐 igs-fx:bgm' });
    }
    const chatShow = normalizeChatShowSettings(rs.chatShow);
    if (chatShow.enabled) {
        // 用户自己写的聊天提示词每轮都发，不折叠成索引。
        blocks.push({ key: 'chat', adaptive: !chatShow.promptRule, full: resolveChatShowGrammar(rs.chatShow, { ancient }), index: `${ancient ? '书信往来' : '线上聊天'} igs-chat/igs-msg/igs-chat-end` });
    }
    const dailyKinds = enabledDailyFxKinds(rs.dailyFx);
    if (dailyKinds.length) {
        blocks.push({ key: 'daily', adaptive: true, full: fxBlock('日常演出', dailyGrammarLines(rs.dailyFx), '，只在剧情里确实发生对应事件时用'), index: `日常 igs-fx:${dailyKinds.join('/')}` });
    }
    if (plain(rs.battleFx).enabled === true) {
        blocks.push({ key: 'battle', adaptive: true, full: fxBlock('战斗', BATTLE_GRAMMAR_LINES, '，只有画面效果不显示数值，非战斗场景不用'), index: '战斗 igs-fx:battle/battle-end/hit' });
    }
    const romanceLines = romanceGrammarLines(rs.romanceFx);
    if (romanceLines.length) {
        const extra = ['romance', ...(plain(rs.romanceFx).confess === true ? ['confess'] : []), ...(plain(rs.romanceFx).memories === true ? ['memory'] : [])];
        blocks.push({ key: 'romance', adaptive: true, full: fxBlock('亲密氛围', romanceLines, '，档位只写 暧昧 或 亲密'), index: `亲密 igs-fx:${extra.join('/')}` });
    }
    const castLines = stageCastGrammarLines(rs.stageCast);
    if (castLines.length) {
        blocks.push({ key: 'cast', full: fxBlock('同屏角色', castLines), index: `同屏 igs-fx:${castLines.map((line) => line.split('|')[0]).join('/')}` });
    }
    blocks.push(...danmakuGrammarBlocks(rs, fxBlock));
    return blocks;
}

function buildExample({ sceneRule, moodWord, fxKinds, itemOn }) {
    const lines = [];
    if (sceneRule) {
        lines.push('[igs-scene:教室|傍晚|晴天]');
        lines.push(`[igs-char:林小雨|${moodWord || '害羞'}|校服|这个……给你。]`);
        lines.push('回到家换上睡衣：[igs-char:林小雨|平和|睡衣|我回来了。]');
        lines.push('去宴会，没有能对上的衣服，新起短名：[igs-char:林小雨|喜悦|晚礼服|到了。]');
    }
    if (fxKinds.includes('sfx')) lines.push('[igs-fx:sfx|砰]');
    else if (itemOn) lines.push('[igs-fx:item|获得|黄铜钥匙|刻着校徽的旧钥匙]');
    return lines.length >= 2 ? `示例：\n${lines.join('\n')}` : '';
}

function indexLine(blocks) {
    if (!blocks.length) return '';
    return `【按需】以下类型的完整写法只在需要时另附；未附时如剧情确实需要，也可按通用规则输出：${blocks.map((b) => b.index).join('；')}`;
}

// 返回 { system, depth0 }：system 放稳定部分（通用规则、场景、始终展开的块、按需索引），
// depth0 放本轮按需展开的块和逐轮变化的内容（交互摘要）。placement 为 depth0 时由调用方把两段合并注入。
export function buildTagGrammar({
    readerSettings,
    sceneRule = '',
    ancient = false,
    expand = new Set(),
    tailRules = [],
    dynamicRules = [],
    moodWord = '',
} = {}) {
    const blocks = collectGrammarBlocks(readerSettings, { ancient });
    if (!sceneRule && !blocks.length) return { system: '', depth0: '', expanded: [], indexed: [] };
    const rs = plain(readerSettings);
    const example = buildExample({ sceneRule, moodWord, fxKinds: enabledFxTagKinds(rs.fxTags), itemOn: plain(rs.itemFx).enabled === true });
    const staticParts = [];
    const dynamicParts = [];
    const indexed = [];
    const adaptiveIndexed = [];
    for (const block of blocks) {
        const wanted = !block.adaptive || expand.has(block.key);
        if (wanted) {
            (block.adaptive ? dynamicParts : staticParts).push(block.full);
        } else if (block.adaptive) {
            adaptiveIndexed.push(block);
        } else {
            indexed.push(block);
        }
    }
    // 按需块的索引行固定列出全部已开启类型，展开与否不改变 system 段，保住前缀缓存。
    const allAdaptive = blocks.filter((b) => b.adaptive);
    const system = [GRAMMAR_HEADER, sceneRule, ...staticParts, indexLine([...indexed, ...allAdaptive]), example, ...tailRules]
        .filter(Boolean).join('\n\n');
    const depth0 = [...dynamicParts, ...dynamicRules].filter(Boolean).join('\n\n');
    return { system, depth0, expanded: allAdaptive.filter((b) => !adaptiveIndexed.includes(b)).map((b) => b.key), indexed: [...indexed, ...adaptiveIndexed].map((b) => b.key) };
}

export function normalizePromptPlacement(value) {
    return PROMPT_PLACEMENTS.includes(value) ? value : 'system';
}
