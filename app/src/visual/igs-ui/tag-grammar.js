import { BGM_GRAMMAR_LINE, bgmMoodTagEnabled, cameraGrammarLines, dlcFxGrammarLines, fxDetailedBlock, fxGrammarLines, ITEM_FX_GRAMMAR_LINE, resolveBgmPromptRule, resolveCameraPromptRule, resolveDlcFxPromptRule, resolveItemFxPromptRule, resolveRomanceFxPromptRule, resolveStageCastFxPromptRule, romanceGrammarLines, stageCastGrammarLines } from './fx-prompt.js';
import { campusDetailedBlock, campusGrammarLines, courtesyDetailedBlock, courtesyGrammarLines,dailyDetailedBlock, dailyGrammarLines, packDetailedBlock, packGrammarLines, playDetailedBlock, playGrammarLines, wardrobeDetailedBlock, wardrobeGrammarLines } from './fx-daily-prompt.js';
import { BATTLE_GRAMMAR_LINES, resolveBattleFxPromptRule } from './fx-battle-model.js';
import { CREATURE_GRAMMAR_LINES, resolveCreatureFxPromptRule } from './fx-creature-model.js';
import { resolveTextFxPromptRule, textFxGrammarBlock } from './text-fx.js';
import { bilingualGrammarBlock, normalizeBilingualSettings } from './bilingual-text.js';
import { normalizeChatShowSettings, resolveChatShowGrammar, resolveChatShowPromptRule } from './chat-show-runtime.js';
import { enabledFxTagKinds, FX_PROMPT_KEYS, normalizeFxPromptsSettings } from './fx-settings.js';
import { enabledDailyFxKinds } from './fx-daily-model.js';
import { danmakuGrammarBlocks, liveDetailedBlock, resolveDanmakuPromptRule } from './danmaku-prompt.js';
import { feedGrammarBlocks } from './feed-prompt.js';
import { isPromptEntryKey, normalizePromptEntries, resolveEntryPlacement } from '../../scene/prompt-entries.js';
import { CAMPUS_FX_KINDS, COURTESY_FX_KINDS, PLAY_FX_KINDS, WARDROBE_FX_KINDS } from '../../scene/daily-fx-directives.js';
import { FX_PACKS_ACTIVE, isPackKind, packBlockKey, packOfKind, packRequiresMet } from '../../scene/fx-packs.js';
import { INNER_DEMON_GRAMMAR_LINE, normalizeInnerDemonSettings } from '../../scene/inner-demon.js';

export const PROMPT_PLACEMENTS = Object.freeze(['system', 'depth0']);
export const SEGMENT_ID_PREFIX = 'igs-scene-assets-entry-';
export const DEPTH0_REMINDER = '本轮按系统说明中的igs标签语法输出标签。';

// 通用规则只写一次，各功能块只写类型行。
export const GRAMMAR_HEADER = `[igs标签语法]
以下igs标签是附加在正文上的元数据，供前端渲染读取；正文的文风、叙事密度和段落节奏完全照其他指令，读者略去全部标签后，剩余正文仍是一篇完整的文章。
通用规则：每条标签独占一行、用方括号包裹，放在它作用的正文之前；参数用|分隔，字段内不换行、不含|或]；成对标签必须闭合；只用下面列出的类型，不发明新标签；瞬时标签（单条的演出、日常、物品、亲密标签）只在关键时刻用，每层合计不超过3个，不要每层都用。`;

// 精简行把 igs-fx: 前缀（带横杠）写全：只在表头写一次时 AI 常漏成 igscall 之类，既不渲染也漏进正文。
// 按 … 与 ' / ' 切出各标签片段分别包方括号；说明（首个全角冒号及其后）原样保留。
function wrapFxLine(line) {
    const str = String(line || '');
    if (str.includes('[igs-fx:')) return str;
    const idx = str.indexOf('：');
    const syntax = idx < 0 ? str : str.slice(0, idx);
    const desc = idx < 0 ? '' : str.slice(idx);
    // 标签之间用 ' … '（成对）或 ' / '（并列）分隔；参数内的 '/'（如 弹幕1/弹幕2）不带空格，不动。
    const wrapped = syntax
        .split(/( … | \/ )/)
        .map((part) => (part === ' … ' || part === ' / ' ? part : (part.trim() ? `[igs-fx:${part.trim()}]` : part)))
        .join('');
    return wrapped + desc;
}

function fxBlock(title, lines, intro = '') {
    if (!lines.length) return '';
    return `【${title}】写作 [igs-fx:类型|参数]${intro}：\n${lines.map((line) => `- ${wrapFxLine(line)}`).join('\n')}`;
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// 每块给出完整写法与降级后的索引写法；块顺序即预算填充优先级。
export function collectGrammarBlocks(readerSettings, { ancient: era = false } = {}) {
    const rs = plain(readerSettings);
    const detailed = normalizeFxPromptsSettings(rs.fxPrompts).style === 'detailed';
    // 随身带着现代手机：聊天与来电等手机演出按现代写法，其余仍按古代。
    const ancient = era && !(rs.feedFx && rs.feedFx.carryPhone === true);
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
    const dlcLines = dlcFxGrammarLines(rs.dlcFx);
    if (dlcLines.length) {
        blocks.push({ key: 'dlc', full: fxBlock('扩展演出', dlcLines), index: `扩展演出 igs-fx:${dlcLines.map((line) => line.split(/[|\s（]/)[0]).join('/')}` });
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
    const dailyLines = dailyGrammarLines(rs.dailyFx);
    if (dailyLines.length) {
        blocks.push({ key: 'daily', adaptive: true, full: fxBlock('日常演出', dailyLines, '，只在剧情里确实发生对应事件时用'), index: `日常 igs-fx:${dailyKinds.filter((k) => !WARDROBE_FX_KINDS.includes(k) && !PLAY_FX_KINDS.includes(k) && !COURTESY_FX_KINDS.includes(k) && !CAMPUS_FX_KINDS.includes(k) && !isPackKind(k)).join('/')}` });
    }
    // 衣橱类（换装登场等）单独成块，只在提到换衣 / 披衣时才补完整写法，不占日常每轮预算。
    const wardrobeLines = wardrobeGrammarLines(rs.dailyFx);
    if (wardrobeLines.length) {
        blocks.push({ key: 'wardrobe', adaptive: true, full: fxBlock('换装登场', wardrobeLines, '，角色换装、变身登场时才用'), index: `换装 igs-fx:${dailyKinds.filter((k) => WARDROBE_FX_KINDS.includes(k)).join('/')}` });
    }
    // 玩乐类（唱歌、跳舞、游乐设施等）单独成块，只在提到对应活动时才补完整写法，不占日常每轮预算。
    const playLines = playGrammarLines(rs.dailyFx);
    if (playLines.length) {
        blocks.push({ key: 'play', adaptive: true, full: fxBlock('玩乐演出', playLines, '，一起玩乐、消遣时才用'), index: `玩乐 igs-fx:${dailyKinds.filter((k) => PLAY_FX_KINDS.includes(k)).join('/')}` });
    }
    // 体贴礼仪类（开门护身照料、点灯烛火、递接、站位身段）单独成块，只在提到对应动作时才补完整写法。
    const courtesyLines = courtesyGrammarLines(rs.dailyFx);
    if (courtesyLines.length) {
        blocks.push({ key: 'courtesy', adaptive: true, full: fxBlock('体贴礼仪', courtesyLines, '，约会体贴、宫廷礼仪的动作发生时才用'), index: `体贴礼仪 igs-fx:${dailyKinds.filter((k) => COURTESY_FX_KINDS.includes(k)).join('/')}` });
    }
    // 校园类（黑板、传纸条、抽屉、点名、考试、文化祭、毕业、纽扣）单独成块，只在提到校园场面时才补完整写法。
    const campusLines = campusGrammarLines(rs.dailyFx);
    if (campusLines.length) {
        blocks.push({ key: 'campus', adaptive: true, full: fxBlock('校园演出', campusLines, '，学校与校园生活里对应场面发生时才用'), index: `校园 igs-fx:${dailyKinds.filter((k) => CAMPUS_FX_KINDS.includes(k)).join('/')}` });
    }
    // 题材包：每包一块，只在提到该包场面时才补完整写法；前置开关（如亲密演出）没开的包整块不发。
    for (const pack of FX_PACKS_ACTIVE) {
        if (!packRequiresMet(pack, rs)) continue;
        const packLines = packGrammarLines(rs.dailyFx, pack.id);
        if (!packLines.length) continue;
        const own = dailyKinds.filter((k) => { const owner = packOfKind(k); return owner && owner.id === pack.id; });
        blocks.push({ key: packBlockKey(pack.id), adaptive: true, full: fxBlock(`${pack.label}演出`, packLines, `，${pack.when}`), index: `${pack.label} igs-fx:${own.join('/')}` });
    }
    if (plain(rs.battleFx).enabled === true) {
        blocks.push({ key: 'battle', adaptive: true, full: fxBlock('战斗', BATTLE_GRAMMAR_LINES, '，只有画面效果不显示数值，非战斗场景不用'), index: '战斗 igs-fx:battle/battle-end/hit' });
    }
    if (plain(rs.battleFx).enabled === true) {
        blocks.push({ key: 'creature', adaptive: true, full: fxBlock('非人角色', CREATURE_GRAMMAR_LINES, '，仅非人角色首次出场或体型变化时用'), index: '非人角色 igs-fx:creature' });
    }
    const romanceLines = romanceGrammarLines(rs.romanceFx);
    if (romanceLines.length) {
        const extra = ['romance', ...(plain(rs.romanceFx).confess === true ? ['confess'] : []), ...(plain(rs.romanceFx).memories === true ? ['memory'] : []), ...(plain(rs.romanceFx).senses !== false ? ['sense'] : []), ...(plain(rs.romanceFx).solo !== false ? ['solo', 'noise'] : [])];
        blocks.push({ key: 'romance', adaptive: true, full: fxBlock('亲密氛围', romanceLines, '，档位只写 暧昧 或 亲密'), index: `亲密 igs-fx:${extra.join('/')}` });
    }
    const castLines = stageCastGrammarLines(rs.stageCast);
    if (castLines.length) {
        blocks.push({ key: 'cast', full: fxBlock('同屏角色', castLines), index: `同屏 igs-fx:${castLines.map((line) => line.split('|')[0]).join('/')}` });
    }
    // 心魔 / 人格分裂：说话人名写法的一句说明，常驻；开关在演出设置「心魔黑影」。
    if (normalizeInnerDemonSettings(rs.innerDemon).enabled) {
        blocks.push({ key: 'demon', full: INNER_DEMON_GRAMMAR_LINE, index: '心魔对话 说话人写法' });
    }
    const cameraLines = cameraGrammarLines(rs.camera);
    if (cameraLines.length) {
        blocks.push({ key: 'camera', adaptive: true, full: fxBlock('镜头', cameraLines), index: '镜头 igs-fx:cam' });
    }
    blocks.push(...danmakuGrammarBlocks(rs, fxBlock));
    blocks.push(...feedGrammarBlocks(rs, { detailed }));
    return detailed ? blocks.map((block) => applyDetailedStyle(block, rs, ancient)) : blocks;
}

// 演出提示词选「详细」：每块的完整写法换成完整方括号写法+语法要求（多数复用关闭按需注入时的长版）。
// 只替换内容，不动 adaptive：按场合的块（日常、战斗、亲密、镜头、聊天、直播、社区）仍走索引→命中才展开，
// 展开时才是详细写法；常驻块照常每轮都发。双语本来就是完整写法。
const DETAILED_BUILDERS = Object.freeze({
    text: () => resolveTextFxPromptRule(true),
    fx: (rs, ancient) => fxDetailedBlock(rs.fxTags, { ancient }),
    dlc: (rs) => resolveDlcFxPromptRule(rs.dlcFx),
    item: () => resolveItemFxPromptRule(true),
    bgm: (rs) => resolveBgmPromptRule(rs.bgm),
    chat: (rs, ancient) => resolveChatShowPromptRule(rs.chatShow, { ancient }),
    daily: (rs) => dailyDetailedBlock(rs.dailyFx),
    wardrobe: (rs) => wardrobeDetailedBlock(rs.dailyFx),
    play: (rs) => playDetailedBlock(rs.dailyFx),
    courtesy: (rs) => courtesyDetailedBlock(rs.dailyFx),
    campus: (rs) => campusDetailedBlock(rs.dailyFx),
    ...Object.fromEntries(FX_PACKS_ACTIVE.map((pack) => [packBlockKey(pack.id), (rs) => packDetailedBlock(rs.dailyFx, pack.id)])),
    battle: () => resolveBattleFxPromptRule(true),
    creature: () => resolveCreatureFxPromptRule(true),
    romance: (rs) => resolveRomanceFxPromptRule(rs.romanceFx),
    cast: (rs) => resolveStageCastFxPromptRule(rs.stageCast),
    camera: (rs) => resolveCameraPromptRule(rs.camera),
    live: (rs) => liveDetailedBlock(rs),
    audience: (rs) => resolveDanmakuPromptRule(rs, { live: false }),
});

function applyDetailedStyle(block, rs, ancient) {
    const build = DETAILED_BUILDERS[block.key];
    return { ...block, full: (build && build(rs, ancient)) || block.full };
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

// 索引只留短名（索引写长了 AI 不看），完整写法靠触发时另附。
function indexLine(blocks) {
    if (!blocks.length) return '';
    return `【按需】以下演出的完整写法在剧情需要时另附：${blocks.map((b) => b.index.split(' ')[0]).join('、')}`;
}

// 按设置里的条目改写块：关闭的整块去掉（索引里也不列），常驻的当作固定块每轮都发，写了位置的带上自己的注入位置。
function applyPromptEntries(blocks, normalized) {
    if (!normalized) return blocks;
    return blocks.flatMap((block) => {
        if (!isPromptEntryKey(block.key)) return [block];
        const entry = normalized[block.key];
        if (entry.mode === 'off') return [];
        const placement = resolveEntryPlacement(entry);
        const next = entry.mode === 'always' ? { ...block, adaptive: false } : block;
        return [placement ? { ...next, placement } : next];
    });
}

// 演出提示词入口：inject 关掉就把「演出 / 日常演出 / 直播间 / 手机社区」整块拿掉（索引里也不列）；
// 覆盖文本非空时替换该块完整写法（用户自己写的每轮都发，不再折叠成索引）。物品 / 配乐 / 亲密各有自己的开关，不受此影响。
// resident（全量常驻）开启时，所有按场合块也每轮都发（不再折叠成索引），更费 token。
function applyFxPromptSettings(blocks, readerSettings, normalizedEntries = null) {
    const fp = normalizeFxPromptsSettings(plain(readerSettings).fxPrompts);
    return blocks.flatMap((block) => {
        // 没有 fxPrompts 对应项的块（换装、玩乐、校园、题材包）正文覆盖存在条目自己的 text 里。
        const own = !FX_PROMPT_KEYS.includes(block.key);
        if (own && !(normalizedEntries && isPromptEntryKey(block.key))) return fp.resident ? [{ ...block, adaptive: false }] : [block];
        if (!own && !fp.inject) return [];
        const custom = (own ? normalizedEntries[block.key].text : fp[block.key]).trim();
        // 写了正文只换内容；是否每轮都发由条目的「常驻」决定（固定块本来就常驻）。
        const next = custom ? { ...block, full: custom } : block;
        return fp.resident && block.adaptive ? [{ ...next, adaptive: false }] : [next];
    });
}

// 写了自己注入位置的块：位置与深度相同的并成一段，每段一个独立的 key（给注入器直接用）。
function addSegment(map, block) {
    const { position, depth } = block.placement;
    const atEnd = position === 'depth0' || (position === 'depth' && depth === 0);
    const kind = position === 'system' ? 'system' : atEnd ? 'depth0' : 'depth';
    const id = kind === 'depth' ? `${SEGMENT_ID_PREFIX}d${depth}` : `${SEGMENT_ID_PREFIX}${kind}`;
    const seg = map.get(id) || { id, position: kind === 'depth' ? 'depth' : kind, depth: kind === 'depth' ? depth : 0, content: '', keys: [] };
    seg.content = [seg.content, block.full].filter(Boolean).join('\n\n');
    seg.keys.push(block.key);
    map.set(id, seg);
}

// 返回 { system, depth0, segments }：system 放稳定部分（通用规则、场景、始终展开的块、按需索引），
// depth0 放本轮按需展开的块和逐轮变化的内容（交互摘要）。placement 为 depth0 时由调用方把两段合并注入。
export function buildTagGrammar({
    readerSettings,
    sceneRule = '',
    ancient = false,
    expand = new Set(),
    tailRules = [],
    dynamicRules = [],
    moodWord = '',
    entries = null,
} = {}) {
    const normalizedEntries = entries ? normalizePromptEntries(entries) : null;
    const blocks = applyFxPromptSettings(applyPromptEntries(collectGrammarBlocks(readerSettings, { ancient }), normalizedEntries), readerSettings, normalizedEntries);
    if (!sceneRule && !blocks.length) return { system: '', depth0: '', expanded: [], indexed: [], sizes: {}, segments: [], placements: {} };
    const rs = plain(readerSettings);
    const example = buildExample({ sceneRule, moodWord, fxKinds: enabledFxTagKinds(rs.fxTags), itemOn: plain(rs.itemFx).enabled === true });
    const staticParts = [];
    const dynamicParts = [];
    const indexed = [];
    const segmentMap = new Map();
    const adaptiveIndexed = [];
    for (const block of blocks) {
        const wanted = !block.adaptive || expand.has(block.key);
        if (wanted) {
            if (block.placement) addSegment(segmentMap, block);
            else (block.adaptive ? dynamicParts : staticParts).push(block.full);
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
    // 每块完整写法的字数，供诊断显示「花了多少字」。
    const sizes = Object.fromEntries(blocks.map((b) => [b.key, Array.from(String(b.full || '')).length]));
    return { system, depth0, segments: [...segmentMap.values()], placements: Object.fromEntries(blocks.filter((b) => b.placement).map((b) => [b.key, b.placement])), expanded: allAdaptive.filter((b) => !adaptiveIndexed.includes(b)).map((b) => b.key), indexed: [...indexed, ...adaptiveIndexed].map((b) => b.key), sizes };
}

export function normalizePromptPlacement(value) {
    return PROMPT_PLACEMENTS.includes(value) ? value : 'system';
}
