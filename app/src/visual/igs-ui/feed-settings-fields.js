import { FEED_SETTING_GROUPS, feedPlatformById } from '../../scene/feed-platforms.js';
import { esc } from './reader-value-utils.js';
import { checkbox, disabledAttr, textareaInput } from './settings-fields.js';
import { collapsible, featureRow, perfSubhead } from './fx-settings-fields.js';
import { feedPlatformPrompt, normalizeFeedFxSettings, stormPromptOf } from './feed-settings.js';

const P = 'readerSettings.feedFx';

// 一张平台卡：平台名（accent 圆点）+ 启用开关，下面是写法输入框与恢复默认。
function platformCard(settings, id) {
    const platform = feedPlatformById(id);
    const own = settings.platforms[id];
    const custom = Boolean(own.prompt);
    const dot = /^#[0-9a-fA-F]{3,8}$/.test(platform.accent) ? ` style="background:${platform.accent}"` : '';
    return `<div class="igs-feed-card">`
        + `<div class="igs-feed-card-head"><span class="igs-feed-name"><i class="igs-feed-dot"${dot}></i>${esc(platform.name)}</span>${checkbox(`${P}.platforms.${id}.enabled`, own.enabled, '启用')}</div>`
        + textareaInput(`${P}.platforms.${id}.prompt`, feedPlatformPrompt(settings, id), '留空恢复默认')
        + `<div class="igs-feed-card-foot"><button type="button" class="igs-settings-action" data-action="feed-prompt-reset:${esc(id)}"${disabledAttr(!custom)}>恢复默认</button></div>`
        + `</div>`;
}

// 舆论风暴卡片：样式同平台卡，标题 + 启用开关，下面是写法输入框与恢复默认。
function stormCard(settings) {
    return `<div class="igs-feed-card igs-feed-storm">`
        + `<div class="igs-feed-card-head"><span class="igs-feed-name">舆论风暴</span>${checkbox(`${P}.storm.enabled`, settings.storm.enabled, '启用')}</div>`
        + textareaInput(`${P}.storm.prompt`, stormPromptOf(settings), '留空恢复默认')
        + `<div class="igs-feed-card-foot"><button type="button" class="igs-settings-action" data-action="feed-storm-prompt-reset"${disabledAttr(!settings.storm.prompt)}>恢复默认</button></div>`
        + `</div>`;
}

// 手机社区的设置片段，由「演出」页编进「线上与直播」。现代组默认展开，其余世界观按分组折叠。
export function renderFeedFields(reader, more = collapsible) {
    const settings = normalizeFeedFxSettings(reader && reader.feedFx);
    const groups = FEED_SETTING_GROUPS.map(([title, ids], index) => {
        const body = `<div class="igs-feed-grid">${ids.map((id) => platformCard(settings, id)).join('')}</div>`;
        if (index === 0) return `<details class="igs-settings-advanced igs-perf-more" open><summary>${esc(title)}</summary>${body}</details>`;
        return more(`feed-${index}`, title, body);
    }).join('');
    return featureRow(more, 'feed-fx', `${P}.enabled`, settings.enabled, '手机社区', '刷微博、朋友圈',
        checkbox(`${P}.muteOnNsfw`, settings.muteOnNsfw, 'NSFW场景收起社区')
        + `<div class="igs-feed-grid">${stormCard(settings)}</div>`
        + perfSubhead('平台写法')
        + groups);
}
