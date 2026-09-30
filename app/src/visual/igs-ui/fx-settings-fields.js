import { esc } from './reader-value-utils.js';
import { checkbox, rangeInput, field, segmentedInput } from './settings-fields.js';
import { FX_TAG_KINDS } from '../../scene/fx-directives.js';
import { FX_TAG_LABELS, MANGA_SYMBOL_KINDS, MANGA_SYMBOL_LABELS, normalizeFxReaderSettings } from './fx-settings.js';

const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

export function renderWordListField(path, label, words) {
    const list = Array.isArray(words) ? words : [];
    const tags = list.map((word) => `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="fx-word-remove:${encSeg(path)}:${encSeg(word)}" title="删除">×</button></span>`).join('');
    return `<div class="igs-settings-field"><span>${esc(label)}</span><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无触发情绪</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="fx-word-add:${encSeg(path)}" title="添加触发情绪">+</button></div></div>`;
}

function sub(body) {
    return `<div class="igs-settings-sub">${body}</div>`;
}

// 「演出」页的折叠区：词表与少用的细项默认收起，展开状态由 data-advanced 记住。
export function collapsible(key, label, body, open = false) {
    return `<details class="igs-settings-advanced igs-perf-more" data-advanced="perf-${esc(key)}"${open ? ' open' : ''}><summary>${esc(label)}</summary>${body}</details>`;
}

// 漫画演出各项的设置片段，由「演出」页按分类重新编排；持久化路径不变。
export function renderFxFeatureFields(reader, more = collapsible) {
    const s = normalizeFxReaderSettings(reader);
    const p = 'readerSettings';
    const style = `<div class="igs-source-filter-grid">`
        + field(`${p}.fxStyle.motion`, '演出风格', segmentedInput(`${p}.fxStyle.motion`, s.fxStyle.motion, [['smooth', '渐变演出'], ['snappy', '灵动演出']], '演出风格'))
        + field(`${p}.fxStyle.hold`, '停留时间', segmentedInput(`${p}.fxStyle.hold`, s.fxStyle.hold, [['short', '短'], ['medium', '中'], ['long', '长']], '停留时间'))
        + `</div>`
        + checkbox(`${p}.fxStyle.replay`, s.fxStyle.replay, '翻回已看过的页时重播演出')
        + `<div class="igs-source-filter-note">渐变更柔和，灵动更有漫画分镜的顿挫感。</div>`;
    const manga = checkbox(`${p}.mangaFx.enabled`, s.mangaFx.enabled, '情绪符号与集中线')
        + (s.mangaFx.enabled ? sub(more('manga-words', '自定义触发情绪', MANGA_SYMBOL_KINDS.map((kind) => renderWordListField(`mangaFx.symbols.${kind}`, MANGA_SYMBOL_LABELS[kind], s.mangaFx.symbols[kind])).join('')
            + renderWordListField('mangaFx.speedLines', '集中线', s.mangaFx.speedLines))) : '');
    const heartbeat = checkbox(`${p}.heartbeatFx.enabled`, s.heartbeatFx.enabled, '心跳脉动')
        + (s.heartbeatFx.enabled ? sub(more('heartbeat-words', '自定义触发情绪', renderWordListField('heartbeatFx.love', '心动', s.heartbeatFx.love)
            + renderWordListField('heartbeatFx.tense', '紧张', s.heartbeatFx.tense))) : '');
    const flash = checkbox(`${p}.flashFx.enabled`, s.flashFx.enabled, '闪白与耳鸣')
        + (s.flashFx.enabled ? sub(more('flash-words', '自定义触发情绪', renderWordListField('flashFx.emotions', '触发情绪', s.flashFx.emotions))) : '');
    const title = checkbox(`${p}.titleCard.enabled`, s.titleCard.enabled, '地点/时间标题卡')
        + (s.titleCard.enabled ? sub(field(`${p}.titleCard.speed`, '报幕速度', segmentedInput(`${p}.titleCard.speed`, s.titleCard.speed, [['fast', '快'], ['medium', '中'], ['slow', '慢']], '报幕速度'))
            + more('title-card', '显示时机', checkbox(`${p}.titleCard.onLocation`, s.titleCard.onLocation, '切换地点时显示')
                + checkbox(`${p}.titleCard.onTime`, s.titleCard.onTime, '时间变化时显示'))) : '');
    const favor = checkbox(`${p}.favorToast.enabled`, s.favorToast.enabled, '数值变化提示');
    const itemFx = checkbox(`${p}.itemFx.enabled`, s.itemFx.enabled, '获得物品演出');
    const battleFx = checkbox(`${p}.battleFx.enabled`, s.battleFx.enabled, '战斗演出')
        + (s.battleFx.enabled ? sub(checkbox(`${p}.battleFx.letterbox`, s.battleFx.letterbox, '战斗时加电影黑边')) : '');
    const resultFx = checkbox(`${p}.resultFx.enabled`, s.resultFx.enabled, '选项检定掷骰');
    const tags = checkbox(`${p}.fxTags.enabled`, s.fxTags.enabled, '来电、通知、回忆等演出')
        + (s.fxTags.enabled ? sub(more('fx-tags', '选择标签类型', `<div class="igs-source-filter-grid">${FX_TAG_KINDS.map((kind) => checkbox(`${p}.fxTags.${kind}`, s.fxTags[kind], FX_TAG_LABELS[kind])).join('')}</div>`)
            + (s.fxTags.call ? more('fx-call', '通话设置', field(`${p}.fxTags.callSprite`, '语音通话时对方立绘', segmentedInput(`${p}.fxTags.callSprite`, s.fxTags.callSprite, [['avatar', '头像小窗'], ['hide', '隐藏'], ['show', '照常显示']], '语音通话时对方立绘'))
            ) : '')) : '');
    const sound = checkbox(`${p}.fxSound.enabled`, s.fxSound.enabled, '演出音效')
        + (s.fxSound.enabled ? sub(field(`${p}.fxSound.volume`, '音量', rangeInput(`${p}.fxSound.volume`, s.fxSound.volume, '音量'))) : '');
    return { style, manga, heartbeat, flash, title, favor, itemFx, battleFx, resultFx, tags, sound };
}
