import { normalizePromptEntries, PROMPT_ENTRY_COOLDOWN_MAX, PROMPT_ENTRY_KEYS, PROMPT_ENTRY_LABELS, PROMPT_ENTRY_SCAN_MAX, PROMPT_ENTRY_STICKY_MAX } from '../../scene/prompt-entries.js';
import { defaultPromptKeywords, describePromptTrigger } from '../../scene/prompt-triggers.js';
import { esc } from './reader-value-utils.js';
import { field, selectInput, textareaInput, textInput } from './settings-fields.js';

const P = 'bridge.sceneAssets.promptEntries';
const MODE_ITEMS = [['auto', '关键词触发'], ['always', '常驻'], ['off', '关闭']];
const SCAN_ITEMS = Array.from({ length: PROMPT_ENTRY_SCAN_MAX + 1 }, (_, n) => [n, n ? `你的输入 + AI 上 ${n} 楼` : '只看你的输入']);
const floors = (max, zero) => Array.from({ length: max + 1 }, (_, n) => [n, n ? `${n} 楼` : zero]);

function lastLine(item) {
    if (!item) return '';
    const state = item.reason === 'off' ? '' : item.active ? '展开' : '收起';
    const chars = item.active && item.chars ? ` · ${item.chars} 字` : '';
    return `上次：${[state, describePromptTrigger(item)].filter(Boolean).join(' · ')}${chars}`;
}

function entryCard(key, entry, report, open) {
    const modeName = MODE_ITEMS.find(([v]) => v === entry.mode)[1];
    const last = lastLine(report && report[key]);
    const custom = entry.keys || entry.secondary || entry.exclude || entry.scan !== 1 || entry.sticky || entry.cooldown || entry.mode !== 'auto';
    const auto = entry.mode === 'auto';
    const body = field(`${P}.${key}.mode`, '方式', selectInput(`${P}.${key}.mode`, entry.mode, MODE_ITEMS))
        + (auto ? field(`${P}.${key}.keys`, '关键词', textareaInput(`${P}.${key}.keys`, entry.keys || defaultPromptKeywords(key), '留空恢复默认'), '用、分隔；/…/ 写正则')
            + field(`${P}.${key}.secondary`, '次要词', textInput(`${P}.${key}.secondary`, entry.secondary, '如：微博、朋友圈'), '填了就要同一段里也出现其中一个才算')
            + field(`${P}.${key}.exclude`, '排除词', textInput(`${P}.${key}.exclude`, entry.exclude, '如：直播间看过的电影'), '同一段里出现就不算')
            + field(`${P}.${key}.scan`, '扫描范围', selectInput(`${P}.${key}.scan`, entry.scan, SCAN_ITEMS))
            + field(`${P}.${key}.sticky`, '黏性', selectInput(`${P}.${key}.sticky`, entry.sticky, floors(PROMPT_ENTRY_STICKY_MAX, '不保持')), '触发后再保持展开几楼')
            + field(`${P}.${key}.cooldown`, '冷却', selectInput(`${P}.${key}.cooldown`, entry.cooldown, floors(PROMPT_ENTRY_COOLDOWN_MAX, '不冷却')), '收起后几楼内不再展开') : '')
        + `<div class="igs-settings-row"><button type="button" class="igs-settings-action" data-action="prompt-entry-reset:${esc(key)}"${custom ? '' : ' disabled'}>恢复默认</button></div>`;
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="prompt-entry-${esc(key)}"${open ? ' open' : ''}>`
        + `<summary>${esc(PROMPT_ENTRY_LABELS[key])} · ${esc(modeName)}${last ? `<small class="igs-switch-note"> ${esc(last)}</small>` : ''}</summary>${body}</details>`;
}

// 按需注入下的每块条目（世界书式）；report 为最近一次注入的情况。
export function renderPromptEntryFields(sceneAssets, { report = null, isOpen = () => false } = {}) {
    const entries = normalizePromptEntries(sceneAssets && sceneAssets.promptEntries);
    const blocks = report && report.blocks ? report.blocks : null;
    return '<div class="igs-source-filter-note">每块可设关键词、次要词、排除词、扫描范围、黏性和冷却；不改就和默认一样。触发原因和字数也会写进「本页诊断」。</div>'
        + PROMPT_ENTRY_KEYS.map((key) => entryCard(key, entries[key], blocks, isOpen(`prompt-entry-${key}`))).join('');
}
