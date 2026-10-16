// 设置页「CG 库」：作者预置的事件 CG，可上传或填网址，按触发词或 [igs-cg:名字] 出现。随角色卡包 / 素材预设一起导出。
import { esc } from './reader-value-utils.js';
import { menuItem, renderRowMenu, thumb } from './settings-outfit-fields.js';
import { normalizeEventCgs } from '../../scene/event-cg.js';
import { draftAssetLibrary, draftEffectiveAssets, rememberAssetScope } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { createSettingsDialogs } from './settings-dialog.js';

const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);

export function renderEventCgList(eventCgs, { resolveUrl, scopeTag, lead = '' } = {}) {
    const tag = typeof scopeTag === 'function' ? scopeTag : () => '';
    const rows = Object.entries(normalizeEventCgs(eventCgs)).map(([name, entry]) => {
        const encoded = encSeg(name);
        const menu = renderRowMenu([
            menuItem(`event-cg-upload:${encoded}`, '上传图片'),
            menuItem(`event-cg-url:${encoded}`, '填网址'),
            menuItem(`event-cg-keywords:${encoded}`, '触发词'),
            menuItem(`event-cg-nsfw:${encoded}`, entry.nsfw ? '改为过场 CG' : '标为 NSFW'),
            menuItem(`event-cg-rename:${encoded}`, '重命名'),
            menuItem(`event-cg-remove:${encoded}`, '删除', ' is-danger'),
        ], `「${name}」的操作`);
        const words = entry.keywords.length ? entry.keywords.join('、') : '未设触发词，只认标签';
        return `<div class="igs-sprite-slot" data-event-cg="${esc(name)}"><div class="igs-btn-mgr-row igs-scene-mood-row">`
            + (entry.url ? thumb(entry.url, `${name}`, '', resolveUrl) : '<span class="igs-outfit-thumb igs-outfit-thumb-empty" aria-hidden="true"></span>')
            + `<button type="button" class="igs-btn-mgr-label" data-action="event-cg-keywords:${encoded}" title="[igs-cg:${esc(name)}]　触发词：${esc(words)}">${esc(name)}${entry.nsfw ? '<span class="igs-outfit-muted">NSFW</span>' : ''}<span class="igs-outfit-muted">${esc(words)}</span></button>${tag('eventCgs', name)}`
            + `${menu}</div></div>`;
    }).join('');
    const body = rows
        ? `<div class="igs-btn-mgr-list">${rows}</div>`
        : '<div class="igs-scene-empty">还没有预置 CG，可点击右上角「+」添加</div>';
    return `${lead ? `<div class="igs-asset-folder-bar">${lead}</div>` : ''}${body}`;
}

const COMMAND_RE = /^event-cg-(add|upload|url|keywords|nsfw|rename|remove)(?::(.*))?$/;

export function handleEventCgAction(normalizedAction, ctx) {
    const match = COMMAND_RE.exec(normalizedAction);
    return match ? runEventCgAction(match[1], decodeURIComponent(match[2] || ''), ctx) : null;
}

async function runEventCgAction(command, name, ctx) {
    const { settingsState, options, persistSettingsDraft, rerenderSettings } = ctx;
    const globalObj = options.global || globalThis;
    const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
    const say = (message) => (typeof dialogs.alert === 'function' ? dialogs.alert(message) : null);
    const ask = async (message, value = '') => { const answer = await dialogs.prompt(message, value); return answer == null ? null : String(answer).trim(); };
    rememberAssetScope(settingsState, getSillyTavernContext(globalObj));
    const library = draftAssetLibrary(settingsState, command === 'add' ? null : { collections: ['eventCgs'], name });
    const map = library.eventCgs = normalizeEventCgs(library.eventCgs);
    const save = async () => { const persisted = persistSettingsDraft(); return persisted && persisted.ok === false ? persisted : rerenderSettings(); };
    if (command === 'add') {
        const next = await ask('CG 名字（AI 写 [igs-cg:名字] 时出现）：');
        if (!next) return rerenderSettings();
        if (BLOCKED.has(next) || /[\]|:]/.test(next)) { await say(`「${next}」不能用作名字`); return rerenderSettings(); }
        if (hasOwn(normalizeEventCgs(draftEffectiveAssets(settingsState).eventCgs), next)) { await say(`CG 库里已有「${next}」`); return rerenderSettings(); }
        const words = await ask(`「${next}」的触发词（正文出现就显示，用逗号或顿号分开，可留空）：`);
        if (words == null) return rerenderSettings();
        map[next] = normalizeEventCgs({ [next]: { url: '', keywords: words } })[next];
        await save();
        return runEventCgAction('upload', next, ctx);
    }
    if (!hasOwn(map, name)) return rerenderSettings();
    const entry = map[name];
    if (command === 'upload') {
        const picked = typeof ctx.pickImage === 'function' ? await ctx.pickImage() : null;
        if (!picked) return rerenderSettings();
        if (!picked.ok) { await say(picked.reason === 'too-large' ? '图片不能超过 8 MB。' : '仅支持 PNG、JPEG、WebP 和 GIF 图片。'); return rerenderSettings(); }
        const service = options.generatedAssets;
        let imported = null;
        try { imported = service && typeof service.importAssetImage === 'function' ? await service.importAssetImage(picked.dataUrl, 'background') : null; }
        catch (error) { imported = null; }
        if (!imported || !imported.ok || !imported.imageId) { await say('图片上传失败。'); return rerenderSettings(); }
        entry.url = `igs-gen:${imported.imageId}`;
        return save();
    }
    if (command === 'url') {
        const url = await ask(`「${name}」的图片网址：`, entry.url.startsWith('igs-gen:') ? '' : entry.url);
        if (url == null || !url) return rerenderSettings();
        if (!/^(https?:|data:image\/|\/|\.\/)/i.test(url)) { await say('请填 http(s) 开头的图片网址。'); return rerenderSettings(); }
        entry.url = url;
        return save();
    }
    if (command === 'keywords') {
        const words = await ask(`「${name}」的触发词（逗号或顿号分开，留空则只认 [igs-cg:${name}]）：`, entry.keywords.join('、'));
        if (words == null) return rerenderSettings();
        entry.keywords = normalizeEventCgs({ x: { keywords: words } }).x.keywords;
        return save();
    }
    if (command === 'nsfw') {
        if (entry.nsfw) delete entry.nsfw; else entry.nsfw = true;
        return save();
    }
    if (command === 'rename') {
        const next = await ask(`把「${name}」改名为：`, name);
        if (!next || next === name) return rerenderSettings();
        if (BLOCKED.has(next) || /[\]|:]/.test(next) || hasOwn(map, next)) { await say(`「${next}」不能用作名字`); return rerenderSettings(); }
        library.eventCgs = Object.fromEntries(Object.entries(map).map(([key, value]) => [key === name ? next : key, value]));
        return save();
    }
    if (command === 'remove') {
        if (typeof dialogs.confirm === 'function' && !await dialogs.confirm(`删除 CG「${name}」？`, { okLabel: '删除' })) return rerenderSettings();
        delete map[name];
        return save();
    }
    return rerenderSettings();
}
