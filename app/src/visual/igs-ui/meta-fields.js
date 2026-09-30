import { esc } from './reader-value-utils.js';
import { checkbox, field, segmentedInput, textInput } from './settings-fields.js';
import { collapsible } from './fx-settings-fields.js';
import { META_COOLDOWNS, META_DEFAULT_LINES, META_GLOBAL_SCOPE, META_LINE_KINDS, META_LINE_LABELS, META_LINES_MAX, normalizeMetaFxSettings } from './meta-settings.js';
import { pendingMetaDigest } from './meta-digest.js';

const P = 'readerSettings.metaFx';
const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

function sub(body) {
    return `<div class="igs-settings-sub">${body}</div>`;
}

// 台词池：未自定义时显示内置台词（灰字），添加第一句后改为只用自定义台词。
function linePool(scope, kind, lines) {
    const own = (lines[scope] && lines[scope][kind]) || [];
    const tags = own.map((line, index) => `<span class="igs-mood-word-tag">${esc(line)}<button type="button" class="igs-mood-word-del" data-action="meta-line-remove:${encSeg(scope)}:${kind}:${index}" title="删除">×</button></span>`).join('');
    const fallback = scope === META_GLOBAL_SCOPE ? `内置：${META_DEFAULT_LINES[kind].join(' / ')}` : '未自定义，沿用通用台词';
    const add = own.length < META_LINES_MAX ? `<button type="button" class="igs-btn-mgr-icon" data-action="meta-line-add:${encSeg(scope)}:${kind}" title="添加台词">+</button>` : '';
    return `<div class="igs-settings-field"><span>${esc(META_LINE_LABELS[kind])}</span><div class="igs-mood-word-list">${tags || `<div class="igs-scene-empty">${esc(fallback)}</div>`}${add}</div></div>`;
}

function scopeBlock(scope, lines) {
    const title = scope === META_GLOBAL_SCOPE ? '通用' : scope;
    const remove = scope === META_GLOBAL_SCOPE ? '' : `<button type="button" class="igs-btn-mgr-icon" data-action="meta-scope-remove:${encSeg(scope)}" title="删除该角色的台词">×</button>`;
    return `<div class="igs-source-filter-title">${esc(title)}${remove}</div>` + META_LINE_KINDS.map((kind) => linePool(scope, kind, lines)).join('');
}

// Meta 互动的设置片段：独立开关，不参与一键档位；关闭时已保存的子设置保留不清空。
export function renderMetaFxFields(reader, more = collapsible) {
    const s = normalizeMetaFxSettings(reader && reader.metaFx);
    const toggle = checkbox(`${P}.enabled`, s.enabled, 'Meta 互动')
        + '<div class="igs-source-filter-note">角色会察觉屏幕前的你，可能影响沉浸感；不受一键档位影响，不消耗 AI 额度。</div>';
    if (!s.enabled) return toggle;
    const touch = checkbox(`${P}.poke`, s.poke, '戳立绘头部')
        + checkbox(`${P}.hover`, s.hover, '鼠标悬停头部（电脑端）');
    const reading = checkbox(`${P}.reading`, s.reading, '阅读行为吐槽')
        + field(`${P}.cooldownSec`, '吐槽间隔', segmentedInput(`${P}.cooldownSec`, String(s.cooldownSec), META_COOLDOWNS.map((n) => [String(n), `${n} 秒`]), '吐槽间隔'));
    const clock = checkbox(`${P}.clock`, s.clock, '真实时间问候')
        + (s.clock ? sub(checkbox(`${P}.festivals`, s.festivals, '节日问候')
            + field(`${P}.birthday`, '你的生日', textInput(`${P}.birthday`, s.birthday, '如 03-05，留空不启用'))) : '');
    const preview = pendingMetaDigest();
    const digest = checkbox(`${P}.digest`, s.digest, '发送时告诉 AI 本轮互动')
        + (s.digest ? sub(`<div class="igs-source-filter-note">只影响下一次生成，送出后清空。当前待送出：${esc(preview || '（暂无）')}</div>`) : '');
    const scopes = [META_GLOBAL_SCOPE, ...Object.keys(s.lines).filter((key) => key !== META_GLOBAL_SCOPE)];
    const lines = scopes.map((scope) => scopeBlock(scope, s.lines)).join('')
        + '<button type="button" class="igs-btn-mgr-icon" data-action="meta-scope-add" title="为某个角色单独设置台词">+ 角色</button>'
        + '<div class="igs-source-filter-note">角色台词优先，其次通用台词，都没有时用内置台词。角色名需与立绘角色名一致。</div>';
    return toggle + sub(touch + reading + clock + digest + more('meta-lines', '台词', lines));
}
