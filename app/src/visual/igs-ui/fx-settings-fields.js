import { listDlcFx, normalizeDlcFxSettings } from '../../scene/fx-registry.js';
import { esc } from './reader-value-utils.js';
import { checkbox, colorInput, rangeInput, field, segmentedInput } from './settings-fields.js';
import { FX_TAG_KINDS } from '../../scene/fx-directives.js';
import { FX_TAG_LABELS, MANGA_SYMBOL_KINDS, MANGA_SYMBOL_LABELS, normalizeFxReaderSettings } from './fx-settings.js';
import { COMIC_TONE_KINDS, COMIC_TONE_LABELS } from './comic-settings.js';
import { MANGA_BACK_ALL_KINDS, MANGA_BACK_LABELS } from './manga-back.js';

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

const grid = (body) => `<div class="igs-source-filter-grid">${body}</div>`;

// 漫画演出各项的设置片段，由「演出」页按分类重新编排；持久化路径不变。
export function renderFxFeatureFields(reader, more = collapsible) {
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
    const battleFx = featureRow(more, 'battle-fx', `${p}.battleFx.enabled`, s.battleFx.enabled, '战斗演出', '', checkbox(`${p}.battleFx.letterbox`, s.battleFx.letterbox, '战斗时加电影黑边'));
    const resultFx = featureRow(more, 'result-fx', `${p}.resultFx.enabled`, s.resultFx.enabled, '选项检定掷骰');
    const tags = featureRow(more, 'fx-tags', `${p}.fxTags.enabled`, s.fxTags.enabled, '来电、通知、回忆等演出', '', grid(FX_TAG_KINDS.map((kind) => checkbox(`${p}.fxTags.${kind}`, s.fxTags[kind], FX_TAG_LABELS[kind])).join(''))
        + (s.fxTags.call ? field(`${p}.fxTags.callSprite`, '语音通话画面', segmentedInput(`${p}.fxTags.callSprite`, s.fxTags.callSprite, [['split', '分屏'], ['avatar', '头像小窗'], ['hide', '隐藏'], ['show', '照常显示']], '语音通话画面')) : ''));
    const toneWords = (kinds) => kinds.map((kind) => renderWordListField(`comicMode.tones.${kind}`, COMIC_TONE_LABELS[kind], s.comicMode.tones[kind])).join('');
    const comic = featureRow(more, 'comic-mode', `${p}.comicMode.enabled`, s.comicMode.enabled, '漫画演出模式', '台词变成竖排对话泡', field(`${p}.comicMode.palette`, '画面', segmentedInput(`${p}.comicMode.palette`, s.comicMode.palette, [['mono', '黑白漫画'], ['color', '彩色（跟随对话框皮肤）']], '画面'))
        + checkbox(`${p}.comicMode.frame`, s.comicMode.frame, '画格边框')
        + checkbox(`${p}.comicMode.keepPrev`, s.comicMode.keepPrev, '保留上一句（淡化）')
        + field(`${p}.comicMode.line`, '泡的线条', segmentedInput(`${p}.comicMode.line`, s.comicMode.line, [['thin', '细'], ['medium', '中'], ['bold', '粗']], '泡的线条'))
        + field(`${p}.comicMode.inkMode`, '描边颜色', segmentedInput(`${p}.comicMode.inkMode`, s.comicMode.inkMode, [['auto', '自动'], ['custom', '自选']], '描边颜色'))
        + (s.comicMode.inkMode === 'custom' ? field(`${p}.comicMode.inkColor`, '自选描边色', colorInput(`${p}.comicMode.inkColor`, s.comicMode.inkColor)) : '')
        + field(`${p}.comicMode.gap`, '离头部', segmentedInput(`${p}.comicMode.gap`, s.comicMode.gap, [['near', '近'], ['medium', '中'], ['far', '远']], '离头部'))
        + checkbox(`${p}.comicMode.tail`, s.comicMode.tail, '对话泡尾巴')
        + field(`${p}.comicMode.inputStyle`, '输入框', segmentedInput(`${p}.comicMode.inputStyle`, s.comicMode.inputStyle, [['comic', '漫画框'], ['plain', '对话框样式']], '输入框'))
        + perfSubhead('泡的外形 · 触发情绪')
        + toneWords(COMIC_TONE_KINDS));
    const mangaBack = featureRow(more, 'manga-back', `${p}.mangaBack.enabled`, s.mangaBack.enabled, '漫画背景与特效', '花背景、气场、石化', MANGA_BACK_ALL_KINDS.map((kind) => renderWordListField(`mangaBack.words.${kind}`, MANGA_BACK_LABELS[kind], s.mangaBack.words[kind])).join(''));
    const crowd = featureRow(more, 'crowd-fx', `${p}.crowdFx.enabled`, s.crowdFx.enabled, '人群剪影', '人多的地点', checkbox(`${p}.crowdFx.react`, s.crowdFx.react, '正文写到鼓掌、欢呼时整群反应'));
    const sound = featureRow(more, 'fx-sound', `${p}.fxSound.enabled`, s.fxSound.enabled, '演出音效', '', field(`${p}.fxSound.volume`, '音量', rangeInput(`${p}.fxSound.volume`, s.fxSound.volume, '音量')));
    // DLC 演出：每个已登记的一条开关，默认开；没装 DLC 时整行不出现。
    const dlcDefs = listDlcFx();
    const dlcOff = normalizeDlcFxSettings(reader && reader.dlcFx);
    const dlc = dlcDefs.length
        ? perfItem(more, 'dlc-fx', `<span>扩展演出（DLC）</span>`, { hint: `${dlcDefs.length} 个`, detail: grid(dlcDefs.map((def) => checkbox(`${p}.dlcFx.${def.kind}`, dlcOff[def.kind] !== false, def.label)).join('')) })
        : '';
    return { style, manga, heartbeat, flash, title, favor, itemFx, battleFx, resultFx, tags, dlc, sound, comic, mangaBack, crowd };
}
