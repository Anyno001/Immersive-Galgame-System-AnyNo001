import { normalizePromptEntries, PROMPT_ENTRY_DEPTH_MAX, PROMPT_ENTRY_KEYS, PROMPT_ENTRY_LABELS, PROMPT_POSITION_LABELS } from '../../scene/prompt-entries.js';
import { defaultPromptKeywords, describePromptTrigger } from '../../scene/prompt-triggers.js';
import { esc } from './reader-value-utils.js';
import { FX_PROMPT_KEYS, normalizeFxPromptsSettings } from './fx-settings.js';
import { fxBuiltinPromptTexts, FX_PROMPT_LABELS } from './fx-settings-fields.js';
import { checkbox, field, numberInput, segmentedInput, selectInput, textareaInput } from './settings-fields.js';

// 写法规则页下半：演出写法按世界书条目排版。每条 启用 / 常驻 / 关键词 / 注入位置 / 深度 / 正文，一行一条，同一时间只展开一条。
const P = 'bridge.sceneAssets.promptEntries';
const FX = 'readerSettings.fxPrompts';
const FIXED_KEYS = FX_PROMPT_KEYS.filter((key) => !PROMPT_ENTRY_KEYS.includes(key));
export const chars = (text) => Array.from(String(text || '')).length;

// 打字时就地改字数节点（输入不重绘）。清空表示恢复内置写法，实际发送的是内置那份，所以显示内置字数。
export function updateCharCounts(root, path, value) {
    if (!root || !path) return;
    for (const node of root.querySelectorAll('[data-char-count-for]')) {
        if (node.getAttribute('data-char-count-for') !== path) continue;
        const fallback = Number(node.getAttribute('data-char-fallback')) || 0;
        const text = String(value || '');
        node.textContent = String(text ? chars(text) : fallback);
    }
}

function globalLabel(sceneAssets) {
    return sceneAssets && sceneAssets.promptPlacement === 'depth0' ? PROMPT_POSITION_LABELS.depth0 : PROMPT_POSITION_LABELS.system;
}

// 每条规则下方的小字：用几个关键词点明用途。关键词、位置等仍在展开后的编辑区里查看与修改。
const ENTRY_PURPOSES = Object.freeze({
    chat: '消息 · 群聊 · 语音',
    daily: '做饭 · 拍照 · 散步',
    wardrobe: '换装 · 登场',
    play: '猜拳 · 抽卡 · 对局',
    courtesy: '礼让 · 递物',
    campus: '课堂 · 社团 · 考试',
    battle: '攻击 · 受击 · 技能',
    romance: '暧昧 · 心动 · 氛围',
    live: '直播 · 弹幕 · 礼物',
    feed: '帖子 · 评论 · 舆论',
    camera: '推近 · 拉远 · 倾斜',
    fx: '来电 · 闪回 · 梦境',
    item: '获得 · 使用 · 展示',
    bgm: '情绪配乐',
    cast: '同屏站位',
    audience: '旁观反应',
    text: '强调 · 颤抖 · 渐隐',
    bilingual: '原文 · 译文',
    dlc: '扩展提供',
    packtransform: '镜像 · 变形',
    packbeats: '揭晓 · 公告 · 重逢',
    packfestival: '婚礼 · 生日 · 节庆',
    packvariety: '小屋 · 观察室 · 告白',
    packharem: '晋封 · 侍寝 · 请安',
    packabo: '信息素 · 标记 · 发情期',
    packmyth: '封神 · 志怪 · 降妖',
    packnsfw: '亲密阶段',
    packcoc: '检定 · 副本 · 推理',
    packplaces: '电梯 · 演唱会 · 竞技场',
    packidol: '打歌 · 应援 · 选秀',
    packcamera: '移动 · 追逐 · 潜行',
});

function entryPurpose(key, name) {
    return ENTRY_PURPOSES[key] || (name || '');
}

function lastLine(item) {
    if (!item) return '';
    const state = item.reason === 'off' ? '' : item.active ? '已发送' : '未发送';
    const size = item.active && item.chars ? ` · ${item.chars}字` : '';
    return `上次：${[state, describePromptTrigger(item)].filter(Boolean).join(' · ')}${size}`;
}

const flag = (key, which, on, label, disabled = false) => `<button type="button" class="igs-switch${on ? ' is-on' : ''}" data-action="prompt-entry-flag:${esc(key)}:${which}" aria-pressed="${on ? 'true' : 'false'}"${disabled ? ' disabled' : ''}><i></i><span>${esc(label)}</span></button>`;

function rowShell(key, name, hint, open, body) {
    return `<div class="igs-perf-item igs-prompt-entry" data-prompt-entry="${esc(key)}">`
        + `<button type="button" class="igs-prompt-entry-row${open ? ' is-open' : ''}" data-action="ui-toggle-open:prompt-entry-${esc(key)}" aria-expanded="${open ? 'true' : 'false'}">`
        + `<span class="igs-prompt-entry-name">${esc(name)}</span><small class="igs-perf-item-hint">${esc(hint)}</small><i class="igs-prompt-entry-chev"></i></button>`
        + (open ? `<div class="igs-perf-item-body">${body}</div>` : '') + '</div>';
}

function bodyField(key, label, text, own, builtinText = '') {
    const path = own ? `${P}.${key}.text` : `${FX}.${key}`;
    const note = own ? '' : `${label}的写法；改动即覆盖，清空恢复内置。`;
    const count = `<span data-char-count-for="${esc(path)}" data-char-fallback="${chars(builtinText)}">${chars(text)}</span>`;
    return `<label class="igs-settings-field"><span>正文（${count}字）</span>${textareaInput(path, text, '清空恢复默认')}${note ? `<em>${esc(note)}</em>` : ''}</label>`;
}

function entryRow(key, entry, ctx) {
    const { builtin, fx, report, open, fallbackPos } = ctx;
    const ownText = !FX_PROMPT_KEYS.includes(key);
    const text = (ownText ? entry.text : fx[key]) || builtin[key] || '';
    const available = Boolean(text);
    // 功能没开、又没改过设置的条目不列出，免得列表里全是用不到的行。
    if (!available && entry.mode === 'auto' && !entry.keys && !entry.position && !entry.text) return '';
    const purpose = entryPurpose(key, PROMPT_ENTRY_LABELS[key]);
    const hint = entry.mode === 'off' ? `已关闭 · ${purpose}` : !available ? `功能未开启 · ${purpose}` : purpose;
    let body = '';
    if (open) {
        const off = entry.mode === 'off';
        const last = lastLine(report && report[key]);
        const posItems = [['', `跟随全局（${fallbackPos}）`], ['system', PROMPT_POSITION_LABELS.system], ['depth0', PROMPT_POSITION_LABELS.depth0], ['depth', PROMPT_POSITION_LABELS.depth]];
        body = `<div class="igs-prompt-entry-flags">${flag(key, 'enabled', !off, '启用')}${flag(key, 'always', entry.mode === 'always', '常驻', off)}</div>`
            + (entry.mode === 'auto' ? field(`${P}.${key}.keys`, '触发关键词', textareaInput(`${P}.${key}.keys`, entry.keys || defaultPromptKeywords(key), '清空恢复默认'), '用、分隔；/…/ 写正则') : '')
            + field(`${P}.${key}.position`, '注入位置', selectInput(`${P}.${key}.position`, entry.position, posItems))
            + (entry.position === 'depth' ? field(`${P}.${key}.depth`, '插入深度', numberInput(`${P}.${key}.depth`, entry.depth, 0, PROMPT_ENTRY_DEPTH_MAX), '倒数第几条消息处，0 为最末') : '')
            + bodyField(key, PROMPT_ENTRY_LABELS[key], text, ownText, builtin[key])
            + (last ? `<div class="igs-source-filter-note">${esc(last)}</div>` : '')
            + `<div class="igs-settings-row"><button type="button" class="igs-settings-action" data-action="prompt-entry-reset:${esc(key)}">恢复默认</button></div>`;
    }
    return rowShell(key, PROMPT_ENTRY_LABELS[key], hint, open, body);
}

function fixedRow(key, ctx) {
    const { builtin, fx, open } = ctx;
    const text = fx[key] || builtin[key] || '';
    if (!text) return '';
    return rowShell(key, FX_PROMPT_LABELS[key], entryPurpose(key, FX_PROMPT_LABELS[key]), open, open ? bodyField(key, FX_PROMPT_LABELS[key], text, false, builtin[key]) : '');
}

// reader 为当前设置里的 readerSettings（取内置写法与总开关）；report 为最近一次注入的情况；isOpen(key) 判断某行是否展开。
export function renderPromptEntryFields(sceneAssets, { reader = {}, report = null, isOpen = () => false } = {}) {
    const entries = normalizePromptEntries(sceneAssets && sceneAssets.promptEntries);
    const fx = normalizeFxPromptsSettings(reader && reader.fxPrompts);
    const blocks = report && report.blocks ? report.blocks : null;
    const builtin = fxBuiltinPromptTexts(reader || {});
    const ctx = { builtin, fx, report: blocks, fallbackPos: globalLabel(sceneAssets) };
    const open = (key) => isOpen(`prompt-entry-${key}`);
    const rows = PROMPT_ENTRY_KEYS.map((key) => entryRow(key, entries[key], { ...ctx, open: open(key) })).join('');
    const fixed = FIXED_KEYS.map((key) => fixedRow(key, { ...ctx, open: open(key) })).join('');
    // 只露两个开关；写法、复制全部与条目列表收进折叠。
    const head = `<div class="igs-settings-row igs-switch-stack">${checkbox(`${FX}.inject`, fx.inject, '使用内置演出规则')}${checkbox(`${FX}.resident`, fx.resident, '全量常驻（更耗费用，默认关）')}</div>`;
    const inner = field(`${FX}.style`, '写法', segmentedInput(`${FX}.style`, fx.style, [['detailed', '详细'], ['compact', '精简']], '写法'))
        + '<div class="igs-settings-row"><button type="button" class="igs-settings-action" data-action="fx-prompts-copy-all">复制全部</button></div>'
        + '<div class="igs-source-filter-note">展开后可设常驻、关键词、注入位置与正文，未修改即为默认。</div>'
        + rows
        + (fixed ? `<div class="igs-settings-subhead">固定写法</div>${fixed}` : '');
    return '<div class="igs-source-filter-title">演出写法</div>'
        + head
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="prompt-entries"${isOpen('prompt-entries') ? ' open' : ''}><summary>演出条目与写法</summary>${inner}</details>`;
}
