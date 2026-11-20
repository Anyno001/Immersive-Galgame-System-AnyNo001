import { listDlcFx, normalizeDlcFxSettings } from '../../scene/fx-registry.js';
import { esc } from './reader-value-utils.js';
import { checkbox, colorInput, rangeInput, field, segmentedInput, selectInput } from './settings-fields.js';
import { DIALOG_FONT_OPTIONS } from './reader-host-constants.js';
import { FX_TAG_KINDS } from '../../scene/fx-directives.js';
import { FX_PROMPT_KEYS, FX_TAG_LABELS, MANGA_SYMBOL_KINDS, MANGA_SYMBOL_LABELS, normalizeFxPromptsSettings, normalizeFxReaderSettings } from './fx-settings.js';
import { collectGrammarBlocks } from './tag-grammar.js';
import { COMIC_TONE_KINDS, COMIC_TONE_LABELS } from './comic-settings.js';
import { MANGA_BACK_ALL_KINDS, MANGA_BACK_LABELS } from './manga-back.js';
import { normalizeClashFxSettings } from '../../scene/clash-actions.js';
import { LOG_PERCENTS } from './log-reader-settings.js';
import { CHAT_READER_DIMS, CHAT_READER_RADII } from './chat-reader-settings.js';
import { FORUM_PER_POST_MAX, FORUM_PER_POST_MIN } from './forum-reader-settings.js';
import { renderForumRegistryFields } from './forum-reader-fields.js';

// 纵向阅读模式的头像样式：按钮图标画出底框外形；破框的头从底框里伸出来（底框淡色、头实色）。
const AVATAR_ICON = (plate) => `<svg viewBox="0 0 24 24" focusable="false">${plate}</svg>`;
const HEAD = '<circle cx="12" cy="8.5" r="4.2" fill="currentColor"/>';
const LOG_AVATAR_STYLE_ITEMS = [
    ['card', '圆角方', AVATAR_ICON('<rect x="4" y="4" width="16" height="16" rx="4.5" fill="currentColor"/>')],
    ['circle', '圆形', AVATAR_ICON('<circle cx="12" cy="12" r="8" fill="currentColor"/>')],
    ['break-square', '破框·方形', AVATAR_ICON(`<rect x="4" y="11" width="16" height="11" rx="2" fill="currentColor" opacity=".4"/>${HEAD}`)],
    ['break-circle', '破框·圆形', AVATAR_ICON(`<circle cx="12" cy="15" r="7.5" fill="currentColor" opacity=".4"/>${HEAD}`)],
    ['break-diamond', '破框·菱形', AVATAR_ICON(`<path d="M12 7 20 15 12 23 4 15Z" fill="currentColor" opacity=".4"/>${HEAD}`)],
];

const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

export function renderWordListField(path, label, words) {
    const list = Array.isArray(words) ? words : [];
    const tags = list.map((word) => `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="fx-word-remove:${encSeg(path)}:${encSeg(word)}" title="删除">×</button></span>`).join('');
    return `<div class="igs-settings-field"><span>${esc(label)}</span><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无触发情绪</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="fx-word-add:${encSeg(path)}" title="添加触发情绪">+</button></div></div>`;
}

// 「演出」页的折叠区：只用于很长的列表（默认曲目等），展开状态由 data-advanced 记住。
export function collapsible(key, label, body, open = false) {
    return `<details class="igs-settings-advanced igs-perf-more" data-advanced="perf-${esc(key)}"${open ? ' open' : ''}><summary>${esc(label)}</summary>${body}</details>`;
}

// 演出页统一的一行：[开关或字段] 短说明 …… [›]。开着且有细项时点 › 才展开，展开状态记在 advancedOpen['perf-<key>']；
// 细项里不再套折叠。more.isOpen 由演出页传入，单独调用（测试、旧调用方）时细项直接展开。
export function perfItem(more, key, headHtml, { on = true, hint = '', detail = '' } = {}) {
    const hasDetail = Boolean(on && detail);
    const open = hasDetail && (more && typeof more.isOpen === 'function' ? more.isOpen(key) : true);
    const hintHtml = hint ? `<small class="igs-perf-item-hint">${esc(hint)}</small>` : '';
    const button = hasDetail
        ? `<button type="button" class="igs-perf-item-more${open ? ' is-open' : ''}" data-action="ui-toggle-open:${encSeg(`perf-${key}`)}" aria-expanded="${open ? 'true' : 'false'}" title="${open ? '收起细项' : '展开细项'}" aria-label="${open ? '收起细项' : '展开细项'}"></button>`
        : '';
    return `<div class="igs-perf-item"><div class="igs-perf-item-head">${headHtml}${hintHtml}${button}</div>${open ? `<div class="igs-perf-item-body">${detail}</div>` : ''}</div>`;
}

export function featureRow(more, key, path, on, label, hint = '', detail = '') {
    return perfItem(more, key, checkbox(path, on, label), { on, hint, detail });
}

// 细项里的分段小标题（代替原来的二级折叠）。
export const perfSubhead = (label) => `<div class="igs-perf-item-subhead">${esc(label)}</div>`;

// 演出写法的内置文本与标题（界面在「正文格式 › 写法规则」，见 prompt-entries-fields.js）：随已开启的功能与所选写法自动拼装，用户改过即覆盖，清空恢复内置。
export function fxBuiltinPromptTexts(reader) {
    const worldview = reader && reader.feedFx && reader.feedFx.worldview;
    const ancient = worldview === 'ancient';
    return Object.fromEntries(collectGrammarBlocks(reader, { ancient }).map((b) => [b.key, String(b.full || '')]));
}

export const FX_PROMPT_LABELS = Object.freeze({
    fx: '演出标签', daily: '日常演出标签', item: '物品标签', bgm: '配乐标签', romance: '亲密氛围标签', battle: '战斗标签',
    camera: '镜头标签', cast: '同屏角色标签', chat: '线上聊天标签', live: '直播间标签', audience: '观众弹幕标签',
    feed: '手机社区标签', text: '文字演出', bilingual: '双语台词', dlc: '扩展演出标签',
});

// 每框的实际文本：用户改过的用其覆盖，否则用内置写法。供渲染与「复制全部」共用，保证复制的即发给 AI 的那份。
export function fxPromptTexts(reader) {
    const src = reader && typeof reader === 'object' ? reader : {};
    const fp = normalizeFxPromptsSettings(src.fxPrompts);
    const builtin = fxBuiltinPromptTexts(src);
    return FX_PROMPT_KEYS.map((key) => fp[key] || builtin[key] || '').filter(Boolean);
}

// 「复制全部」：按当前详细/精简拼成一份发给 AI 的整文。
export function fxPromptsCopyText(reader) {
    return fxPromptTexts(reader).join('\n\n');
}

const grid = (body) => `<div class="igs-source-filter-grid">${body}</div>`;

// 漫画演出各项的设置片段，由「演出」页按分类重新编排；持久化路径不变。
export function renderFxFeatureFields(reader, more = collapsible, fontOptions = DIALOG_FONT_OPTIONS, forumRegistry = null) {
    const s = normalizeFxReaderSettings(reader);
    const p = 'readerSettings';
    const style = perfItem(more, 'fx-style', field(`${p}.fxStyle.motion`, '演出风格', segmentedInput(`${p}.fxStyle.motion`, s.fxStyle.motion, [['smooth', '渐变演出'], ['snappy', '灵动演出']], '演出风格')))
        + perfItem(more, 'fx-hold', field(`${p}.fxStyle.hold`, '停留时间', segmentedInput(`${p}.fxStyle.hold`, s.fxStyle.hold, [['short', '短'], ['medium', '中'], ['long', '长']], '停留时间')))
        + featureRow(more, 'fx-replay', `${p}.fxStyle.replay`, s.fxStyle.replay, '翻回旧页时重播演出');
    const manga = featureRow(more, 'manga-words', `${p}.mangaFx.enabled`, s.mangaFx.enabled, '情绪符号与集中线', '漫画式符号', (MANGA_SYMBOL_KINDS.map((kind) => renderWordListField(`mangaFx.symbols.${kind}`, MANGA_SYMBOL_LABELS[kind], s.mangaFx.symbols[kind])).join('')
        + renderWordListField('mangaFx.speedLines', '集中线', s.mangaFx.speedLines)));
    const heartbeat = featureRow(more, 'heartbeat-words', `${p}.heartbeatFx.enabled`, s.heartbeatFx.enabled, '心跳脉动', '心动、紧张时', renderWordListField('heartbeatFx.love', '心动', s.heartbeatFx.love)
        + renderWordListField('heartbeatFx.tense', '紧张', s.heartbeatFx.tense));
    const flash = featureRow(more, 'flash-words', `${p}.flashFx.enabled`, s.flashFx.enabled, '闪白与耳鸣', '震惊时', renderWordListField('flashFx.emotions', '触发情绪', s.flashFx.emotions));
    const title = featureRow(more, 'title-card', `${p}.titleCard.enabled`, s.titleCard.enabled, '地点/时间标题卡', '换场时报幕', field(`${p}.titleCard.speed`, '报幕速度', segmentedInput(`${p}.titleCard.speed`, s.titleCard.speed, [['fast', '快'], ['medium', '中'], ['slow', '慢']], '报幕速度'))
        + checkbox(`${p}.titleCard.onLocation`, s.titleCard.onLocation, '切换地点时显示')
        + checkbox(`${p}.titleCard.onTime`, s.titleCard.onTime, '时间变化时显示'));
    const favor = featureRow(more, 'favor', `${p}.favorToast.enabled`, s.favorToast.enabled, '数值变化提示', '好感等升降');
    const itemFx = featureRow(more, 'item-fx', `${p}.itemFx.enabled`, s.itemFx.enabled, '获得物品演出', '', checkbox(`${p}.itemFx.mention`, s.itemFx.mention, '正文里点亮已获得的物品名'));
    // 非人演出跟随战斗演出：总开关关闭时置灰，不另计入档位。
    const battleCreature = perfItem(more, 'battle-creature', checkbox(`${p}.battleFx.creature`, s.battleFx.creature, '非人演出', !s.battleFx.enabled), { hint: s.battleFx.enabled ? '' : '需在「战斗」页选择「剧情演出」' });
    const resultFx = featureRow(more, 'result-fx', `${p}.resultFx.enabled`, s.resultFx.enabled, '选项检定掷骰');
    const tags = featureRow(more, 'fx-tags', `${p}.fxTags.enabled`, s.fxTags.enabled, '来电、通知、回忆等演出', '', grid(FX_TAG_KINDS.filter((kind) => kind !== 'clash').map((kind) => checkbox(`${p}.fxTags.${kind}`, s.fxTags[kind], FX_TAG_LABELS[kind])).join('') + checkbox(`${p}.fxTags.emergency`, s.fxTags.emergency, '紧急求助') + checkbox(`${p}.fxTags.spam`, s.fxTags.spam, '垃圾短信样式'))
        + (s.fxTags.call ? field(`${p}.fxTags.callSprite`, '语音通话画面', segmentedInput(`${p}.fxTags.callSprite`, s.fxTags.callSprite, [['split', '分屏'], ['avatar', '头像小窗'], ['hide', '隐藏'], ['show', '照常显示']], '语音通话画面')) : ''));
    const clashFx = normalizeClashFxSettings(reader && reader.clashFx);
    const clashOn = s.fxTags.enabled && s.fxTags.clash;
    const clash = perfItem(more, 'clash-fx', checkbox(`${p}.fxTags.clash`, s.fxTags.clash, '立绘碰撞', !s.fxTags.enabled), {
        on: clashOn,
        hint: '打、推、扑抱时立绘接触',
        detail: checkbox(`${p}.clashFx.auto`, clashFx.auto, '根据正文自动识别') + checkbox(`${p}.clashFx.ghost`, clashFx.ghost, '缺席一方临时出现') + checkbox(`${p}.clashFx.shake`, clashFx.shake, '碰撞时震屏'),
    });
    const innerDemon = perfItem(more, 'inner-demon', checkbox(`${p}.innerDemon.enabled`, s.innerDemon.enabled, '心魔黑影'), { on: s.innerDemon.enabled, hint: '与另一个自己对话时出现' });
    const toneWords = (kinds) => kinds.map((kind) => renderWordListField(`comicMode.tones.${kind}`, COMIC_TONE_LABELS[kind], s.comicMode.tones[kind])).join('');
    const comic = featureRow(more, 'comic-mode', `${p}.comicMode.enabled`, s.comicMode.enabled, '漫画演出模式', '台词变成竖排对话泡', field(`${p}.comicMode.palette`, '画面', segmentedInput(`${p}.comicMode.palette`, s.comicMode.palette, [['mono', '黑白'], ['color', '彩色']], '画面'), s.comicMode.palette === 'color' ? '配色跟随对话框风格' : '')
        + checkbox(`${p}.comicMode.frame`, s.comicMode.frame, '画格边框')
        + checkbox(`${p}.comicMode.keepPrev`, s.comicMode.keepPrev, '保留上一句（淡化）')
        + field(`${p}.comicMode.font`, '泡内字体', selectInput(`${p}.comicMode.font`, s.comicMode.font || 'inherit', fontOptions.map(([value, label]) => (value === 'inherit' ? [value, '跟随风格'] : [value, label]))))
        + field(`${p}.comicMode.line`, '泡的线条', segmentedInput(`${p}.comicMode.line`, s.comicMode.line, [['thin', '细'], ['medium', '中'], ['bold', '粗']], '泡的线条'))
        + field(`${p}.comicMode.inkMode`, '描边颜色', segmentedInput(`${p}.comicMode.inkMode`, s.comicMode.inkMode, [['auto', '自动'], ['custom', '自选']], '描边颜色'))
        + (s.comicMode.inkMode === 'custom' ? field(`${p}.comicMode.inkColor`, '自选描边色', colorInput(`${p}.comicMode.inkColor`, s.comicMode.inkColor)) : '')
        + field(`${p}.comicMode.gap`, '离头部', segmentedInput(`${p}.comicMode.gap`, s.comicMode.gap, [['near', '近'], ['medium', '中'], ['far', '远']], '离头部'))
        + checkbox(`${p}.comicMode.tail`, s.comicMode.tail, '对话泡尾巴')
        + checkbox(`${p}.comicMode.scrubber`, s.comicMode.scrubber, '页码进度条')
        + field(`${p}.comicMode.inputStyle`, '输入框', segmentedInput(`${p}.comicMode.inputStyle`, s.comicMode.inputStyle, [['comic', '漫画框'], ['plain', '对话框']], '输入框'))
        + perfSubhead('泡的外形 · 触发情绪')
        + toneWords(COMIC_TONE_KINDS));
    const lr = s.logReader;
    const logReader = featureRow(more, 'log-reader', `${p}.logReader.on`, lr.on, '纵向阅读模式', '改为对话列表', field(`${p}.logReader.avatarStyle`, '头像样式', segmentedInput(`${p}.logReader.avatarStyle`, lr.avatarStyle, LOG_AVATAR_STYLE_ITEMS, '头像样式'))
        + field(`${p}.logReader.perTap`, '每次显示', segmentedInput(`${p}.logReader.perTap`, lr.perTap, [[1, '1条'], [2, '2条'], [3, '3条'], [4, '4条'], [5, '5条']], '每次显示'))
        + field(`${p}.logReader.reveal`, '文字出现', segmentedInput(`${p}.logReader.reveal`, lr.reveal, [['flow', '流水展开'], ['type', '打字机'], ['fade', '整句淡入'], ['off', '直接显示']], '文字出现'))
        + field(`${p}.logReader.speed`, '出字速度', segmentedInput(`${p}.logReader.speed`, lr.speed, [['slow', '慢'], ['normal', '标准'], ['fast', '快'], ['faster', '很快']], '出字速度'))
        + field(`${p}.logReader.emotion`, '情绪符号', segmentedInput(`${p}.logReader.emotion`, lr.emotion, [['once', '播一遍'], ['loop', '循环'], ['off', '关闭']], '情绪符号'))
        + field(`${p}.logReader.edge`, '离边距离', segmentedInput(`${p}.logReader.edge`, lr.edge, [['flush', '贴边'], ['normal', '标准'], ['wide', '宽松']], '离边距离'))
        + field(`${p}.logReader.moodSize`, '情绪大小', segmentedInput(`${p}.logReader.moodSize`, lr.moodSize, [['l', '大'], ['m', '中'], ['s', '小']], '情绪大小'))
        + field(`${p}.logReader.veil`, '渐变高度', selectInput(`${p}.logReader.veil`, lr.veil, LOG_PERCENTS.map((n) => [n, `${n}%`])))
        + field(`${p}.logReader.density`, '渐变浓度', selectInput(`${p}.logReader.density`, lr.density, LOG_PERCENTS.map((n) => [n, `${n}%`])))
        + field(`${p}.logReader.userSide`, 'User位置', segmentedInput(`${p}.logReader.userSide`, lr.userSide, [['same', '与角色同侧'], ['right', '靠右']], 'User位置'))
        + checkbox(`${p}.logReader.chain`, lr.chain, '连续播放')
        + checkbox(`${p}.logReader.scrubber`, lr.scrubber, '页码进度条')
        + checkbox(`${p}.logReader.chip`, lr.chip, '名字后显示情绪')
        + checkbox(`${p}.logReader.userAvatar`, lr.userAvatar, '显示User头像'));
    const cr = s.chatReader;
    const chatReader = featureRow(more, 'chat-reader', `${p}.chatReader.on`, cr.on, '线上聊天模式', '改为聊天气泡', field(`${p}.chatReader.perTap`, '每次显示', segmentedInput(`${p}.chatReader.perTap`, cr.perTap, [[1, '1条'], [2, '2条'], [3, '3条'], [4, '4条'], [5, '5条']], '每次显示'))
        + field(`${p}.chatReader.speed`, '出字节奏', segmentedInput(`${p}.chatReader.speed`, cr.speed, [['slow', '慢'], ['normal', '标准'], ['fast', '快'], ['faster', '很快']], '出字节奏'))
        + field(`${p}.chatReader.radius`, '气泡圆角', selectInput(`${p}.chatReader.radius`, cr.radius, CHAT_READER_RADII.map((n) => [n, `${n}px`])))
        + field(`${p}.chatReader.fontSize`, '气泡字号', selectInput(`${p}.chatReader.fontSize`, cr.fontSize, [13, 14, 15, 16, 17, 18, 19].map((n) => [n, `${n}px`])))
        + field(`${p}.chatReader.groupGap`, '换人间距', segmentedInput(`${p}.chatReader.groupGap`, cr.groupGap, [['compact', '紧凑'], ['normal', '标准'], ['wide', '宽松']], '换人间距'))
        + field(`${p}.chatReader.dim`, '背景压暗', selectInput(`${p}.chatReader.dim`, cr.dim, CHAT_READER_DIMS.map((n) => [n, n === 0 ? '不压暗' : `${Math.round(n * 100)}%`])))
        + checkbox(`${p}.chatReader.followTheme`, cr.followTheme, '气泡颜色与字体跟随对话框皮肤')
        + (cr.followTheme ? '' : field(`${p}.chatReader.leftColor`, '角色气泡色', colorInput(`${p}.chatReader.leftColor`, cr.leftColor)) + field(`${p}.chatReader.rightColor`, 'User气泡色', colorInput(`${p}.chatReader.rightColor`, cr.rightColor)))
        + field(`${p}.chatReader.narr`, '旁白样式', segmentedInput(`${p}.chatReader.narr`, cr.narr, [['bar', '深底条'], ['shadow', '投影字']], '旁白样式'))
        + field(`${p}.chatReader.avatar`, '头像形状', segmentedInput(`${p}.chatReader.avatar`, cr.avatar, [['card', '圆角方'], ['circle', '圆形']], '头像形状'))
        + field(`${p}.chatReader.emotion`, '情绪符号', segmentedInput(`${p}.chatReader.emotion`, cr.emotion, [['once', '播一遍'], ['loop', '循环'], ['off', '关闭']], '情绪符号'))
        + field(`${p}.chatReader.moodSize`, '情绪大小', segmentedInput(`${p}.chatReader.moodSize`, cr.moodSize, [['l', '大'], ['m', '中'], ['s', '小']], '情绪大小'))
        + checkbox(`${p}.chatReader.typing`, cr.typing, '角色发言前显示「正在输入」')
        + checkbox(`${p}.chatReader.thoughtClear`, cr.thoughtClear, '心里话气泡透明')
        + checkbox(`${p}.chatReader.chain`, cr.chain, '连续播放')
        + checkbox(`${p}.chatReader.scrubber`, cr.scrubber, '页码进度条')
        + checkbox(`${p}.chatReader.chip`, cr.chip, '名字后显示情绪')
        + checkbox(`${p}.chatReader.charAvatar`, cr.charAvatar, '显示对方头像')
        + checkbox(`${p}.chatReader.userAvatar`, cr.userAvatar, '显示User头像'));
    const fr = s.forumReader;
    const forumReader = featureRow(more, 'forum-reader', `${p}.forumReader.on`, fr.on, '论坛体模式', '改为匿名论坛帖', field(`${p}.forumReader.poster`, '楼主', segmentedInput(`${p}.forumReader.poster`, fr.poster, [['auto', '让 AI 挑'], ['char', '角色本人'], ['witness', '围观路人'], ['user', 'User']], '楼主'))
        + field(`${p}.forumReader.othersThoughts`, '其他人的心里话', segmentedInput(`${p}.forumReader.othersThoughts`, fr.othersThoughts, [['hide', '不显示'], ['show', '照常显示']], '其他人的心里话'))
        + field(`${p}.forumReader.replies`, '路人回帖', segmentedInput(`${p}.forumReader.replies`, fr.replies, [['off', '关'], ['few', '少'], ['normal', '标准']], '路人回帖'))
        + field(`${p}.forumReader.perPost`, '一楼最多行数', selectInput(`${p}.forumReader.perPost`, fr.perPost, Array.from({ length: FORUM_PER_POST_MAX - FORUM_PER_POST_MIN + 1 }, (_, i) => [FORUM_PER_POST_MIN + i, `${FORUM_PER_POST_MIN + i}行`])))
        + field(`${p}.forumReader.fontSize`, '正文字号', selectInput(`${p}.forumReader.fontSize`, fr.fontSize, [13, 14, 15, 16, 17, 18, 19].map((n) => [n, `${n}px`])))
        + field(`${p}.forumReader.perTap`, '每次显示', segmentedInput(`${p}.forumReader.perTap`, fr.perTap, [[1, '1条'], [2, '2条'], [3, '3条'], [4, '4条'], [5, '5条']], '每次显示'))
        + field(`${p}.forumReader.reveal`, '文字出现', segmentedInput(`${p}.forumReader.reveal`, fr.reveal, [['flow', '流水展开'], ['type', '打字机'], ['fade', '整句淡入'], ['off', '直接显示']], '文字出现'))
        + field(`${p}.forumReader.speed`, '出现节奏', segmentedInput(`${p}.forumReader.speed`, fr.speed, [['slow', '慢'], ['normal', '标准'], ['fast', '快'], ['faster', '很快']], '出现节奏'))
        + field(`${p}.forumReader.barColor`, '工具栏颜色', colorInput(`${p}.forumReader.barColor`, fr.barColor || '#a9a3b2'))
        + checkbox(`${p}.forumReader.showMood`, fr.showMood, '台词前显示情绪（如 B（开心）：）')
        + checkbox(`${p}.forumReader.prompt`, fr.prompt, '让 AI 登记标题与代号')
        + checkbox(`${p}.forumReader.chain`, fr.chain, '连续播放')
        + checkbox(`${p}.forumReader.scrubber`, fr.scrubber, '页码进度条')
        + renderForumRegistryFields(forumRegistry));
    const mangaBack = featureRow(more, 'manga-back', `${p}.mangaBack.enabled`, s.mangaBack.enabled, '漫画背景与特效', '花背景、气场、石化', MANGA_BACK_ALL_KINDS.map((kind) => renderWordListField(`mangaBack.words.${kind}`, MANGA_BACK_LABELS[kind], s.mangaBack.words[kind])).join(''));
    const crowd = featureRow(more, 'crowd-fx', `${p}.crowdFx.enabled`, s.crowdFx.enabled, '人群氛围', '人多的地点', checkbox(`${p}.crowdFx.react`, s.crowdFx.react, '正文写到鼓掌、欢呼时整群反应'));
    const notifyCenter = featureRow(more, 'notify-center', `${p}.notifyCenter.enabled`, s.notifyCenter.enabled, '通知中心', '攒下没点开的消息');
    const sound = featureRow(more, 'fx-sound', `${p}.fxSound.enabled`, s.fxSound.enabled, '演出音效', '', field(`${p}.fxSound.volume`, '音量', rangeInput(`${p}.fxSound.volume`, s.fxSound.volume, '音量')));
    // DLC 演出：每个已登记的一条开关，默认开；没装 DLC 时整行不出现。
    const dlcDefs = listDlcFx();
    const dlcOff = normalizeDlcFxSettings(reader && reader.dlcFx);
    const dlc = dlcDefs.length
        ? perfItem(more, 'dlc-fx', `<span>扩展演出（DLC）</span>`, { hint: `${dlcDefs.length}个`, detail: grid(dlcDefs.map((def) => checkbox(`${p}.dlcFx.${def.kind}`, dlcOff[def.kind] !== false, def.label)).join('')) })
        : '';
    return { style, manga, heartbeat, flash, title, favor, itemFx, battleCreature, resultFx, tags, clash, innerDemon, dlc, sound, comic, logReader, chatReader, forumReader, mangaBack, crowd, notifyCenter };
}
