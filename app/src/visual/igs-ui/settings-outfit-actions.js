import { isValidOutfitName, isValidOutfitWord, OUTFIT_RESET } from '../../scene/character-outfits.js';
import { normalizeMoodGroups } from '../../scene/mood-groups.js';
import { classifySceneKey } from '../../scene/scene-directives.js';
import { clearOutfitReview, removeOutfitReview } from '../../scene/outfit-review-store.js';
import { migrateSpriteKeys } from './sprite-key-migration.js';
import { createSettingsDialogs } from './settings-dialog.js';

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

function decodeSeg(value) {
    try { return decodeURIComponent(String(value == null ? '' : value)); } catch (error) { return String(value == null ? '' : value); }
}

function reorderKey(obj, oldKey, newKey) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k === oldKey ? newKey : k] = v;
    return out;
}

function outfitMapOf(sceneAssets, charName) {
    const all = plain(sceneAssets.characterOutfits) || (sceneAssets.characterOutfits = {});
    return plain(all[charName]) || (all[charName] = {});
}

function outfitEntry(outfits, name) {
    const entry = plain(outfits[name]);
    if (!entry) return null;
    if (!Array.isArray(entry.words)) entry.words = [];
    if (!plain(entry.moods)) entry.moods = {};
    return entry;
}

// 同一角色内服装名与词池词互斥：名称不能等于其他服装的名或词，词不能等于任何服装名或已有词。
function outfitTokenOwner(outfits, token, except = '') {
    for (const [name, entry] of Object.entries(outfits)) {
        if (name === except) continue;
        if (name === token || (Array.isArray(entry && entry.words) && entry.words.includes(token))) return name;
    }
    return '';
}

async function ask(ctx, message, value = '') {
    const dialogs = ctx.dialogs || createSettingsDialogs({ global: ctx.options.global || globalThis });
    return ((await dialogs.prompt(message, value)) || '').trim();
}

function warn(globalObj, message) {
    if (globalObj.alert) globalObj.alert(message);
}

function validateSlotName(globalObj, name) {
    if (name === OUTFIT_RESET) { warn(globalObj, '服装内不设「默认」槽：缺图时会自动回到原有立绘'); return false; }
    if (BLOCKED_KEYS.has(name)) { warn(globalObj, `「${name}」不能用作槽名`); return false; }
    return true;
}

function createOutfit(globalObj, charName, outfits, name) {
    if (!isValidOutfitName(name)) { warn(globalObj, `「${name}」不能用作服装名（不能为空、「默认」或含 | ] 换行）`); return false; }
    const owner = outfitTokenOwner(outfits, name);
    if (owner) { warn(globalObj, owner === name ? `「${charName}」已有服装「${name}」（同名）` : `「${name}」已是服装「${owner}」的词`); return false; }
    outfits[name] = { words: [], moods: {} };
    return true;
}

function addOutfitWord(globalObj, outfits, entry, word) {
    if (!isValidOutfitWord(word) || word === OUTFIT_RESET) { warn(globalObj, `「${word}」不能用作服装词`); return false; }
    const owner = outfitTokenOwner(outfits, word);
    if (owner) { warn(globalObj, owner === word ? `「${word}」已是服装名` : `「${word}」已属于服装「${owner}」`); return false; }
    entry.words.push(word);
    return true;
}

function addOutfitSlot(sceneAssets, entry, mood) {
    entry.moods[mood] = '';
    const groups = Array.isArray(sceneAssets.moodGroups) ? sceneAssets.moodGroups : (sceneAssets.moodGroups = normalizeMoodGroups(sceneAssets.moodGroups));
    if (!groups.some((g) => g && g.label === mood)) groups.unshift({ label: mood, words: [mood] });
}

// 角色卡当前选中的服装标签，只是界面状态，不写入设置。
function selectTab(settingsState, charName, outfitName) {
    const tabs = plain(settingsState.asyncState.outfitTabs) || (settingsState.asyncState.outfitTabs = {});
    if (outfitName) tabs[charName] = outfitName; else delete tabs[charName];
}

// 待确认服装词：归入已有服装、新建为服装、忽略、清空。存储独立于设置，处理成功后从列表移除。
function handleOutfitReview(command, segs, ctx) {
    const { settingsState, options, persistSettingsDraft, rerenderSettings } = ctx;
    const globalObj = options.global || globalThis;
    const storage = globalObj.localStorage;
    if (command === 'outfit-review-clear') { const written = clearOutfitReview(storage); return written.ok === false ? written : rerenderSettings(); }
    const charName = decodeSeg(segs[0]);
    const word = decodeSeg(segs[1] || '');
    if (command === 'outfit-review-dismiss') { const written = removeOutfitReview(storage, charName, word); return written.ok === false ? written : rerenderSettings(); }
    const sceneAssets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    if (!charName || BLOCKED_KEYS.has(charName) || !hasOwn(plain(sceneAssets.characters) || {}, charName)) return rerenderSettings();
    const outfits = outfitMapOf(sceneAssets, charName);
    let changed = false;
    if (command === 'outfit-review-assign') {
        const entry = outfitEntry(outfits, decodeSeg(segs[2] || ''));
        if (!entry) return rerenderSettings();
        changed = addOutfitWord(globalObj, outfits, entry, word);
    } else if (command === 'outfit-review-create') {
        changed = createOutfit(globalObj, charName, outfits, word);
        if (changed) selectTab(settingsState, charName, word);
    }
    if (!changed) return rerenderSettings();
    removeOutfitReview(storage, charName, word);
    const persisted = persistSettingsDraft();
    if (persisted.ok === false) return persisted;
    return rerenderSettings();
}

const COMMAND_RE = /^(scene-(?:add|rename|remove)-outfit(?:-(?:mood|word|scene))?|scene-set-outfit-(?:mood|avatar)-url|scene-clear-outfit-avatar|scene-outfit-(?:tab|copy-slots)|outfit-review-(?:assign|create|dismiss|clear))(?::(.*))?$/;

// 服装区 action：返回 null 表示不归本模块处理。位置 / 头部标定 key 随改名迁移、随删除清理。
export function handleOutfitAction(normalizedAction, ctx) {
    const match = COMMAND_RE.exec(normalizedAction);
    return match ? runOutfitAction(match, ctx) : null;
}

async function runOutfitAction(match, ctx) {
    const [, command, rest = ''] = match;
    const segs = rest.split(':');
    if (command.startsWith('outfit-review-')) return handleOutfitReview(command, segs, ctx);
    const { settingsState, options, persistSettingsDraft, rerenderSettings } = ctx;
    const globalObj = options.global || globalThis;
    const draft = settingsState.draft;
    const sceneAssets = draft.bridge.sceneAssets = draft.bridge.sceneAssets || {};
    const readerSettings = draft.readerSettings = draft.readerSettings || {};
    const charName = decodeSeg(segs[0]);
    if (!charName || BLOCKED_KEYS.has(charName) || !hasOwn(plain(sceneAssets.characters) || {}, charName)) return rerenderSettings();
    const outfits = outfitMapOf(sceneAssets, charName);
    const outfitName = decodeSeg(segs[1] || '');
    const entry = outfitName ? outfitEntry(outfits, outfitName) : null;
    const done = () => {
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    };

    // 输入中只写草稿，不重绘、不持久化，沿用原有情绪槽 URL 的草稿生命周期。
    if (command === 'scene-set-outfit-mood-url') {
        const mood = decodeSeg(segs[2] || '');
        if (entry && hasOwn(entry.moods, mood)) entry.moods[mood] = segs.slice(3).join(':');
        return { ok: true };
    }
    if (command === 'scene-set-outfit-avatar-url') {
        if (entry) entry.avatar = segs.slice(2).join(':');
        return { ok: true };
    }
    if (command === 'scene-outfit-tab') {
        selectTab(settingsState, charName, entry ? outfitName : '');
        return rerenderSettings();
    }
    if (command === 'scene-add-outfit') {
        const name = await ask(ctx, `为角色「${charName}」添加服装：`);
        if (!name || !createOutfit(globalObj, charName, outfits, name)) return rerenderSettings();
        selectTab(settingsState, charName, name);
        return done();
    }
    if (!entry) return rerenderSettings();

    switch (command) {
    case 'scene-rename-outfit': {
        const name = await ask(ctx, `重命名服装「${outfitName}」为：`, outfitName);
        if (!name || name === outfitName) return rerenderSettings();
        if (!isValidOutfitName(name)) { warn(globalObj, `「${name}」不能用作服装名（不能为空、「默认」或含 | ] 换行）`); return rerenderSettings(); }
        const owner = outfitTokenOwner(outfits, name, outfitName);
        if (owner) { warn(globalObj, owner === name ? `「${charName}」已有服装「${name}」（同名），改名会覆盖，已阻止` : `「${name}」已是服装「${owner}」的词`); return rerenderSettings(); }
        entry.words = entry.words.filter((word) => word !== name);
        sceneAssets.characterOutfits[charName] = reorderKey(outfits, outfitName, name);
        migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName }, { outfit: name });
        selectTab(settingsState, charName, name);
        return done();
    }
    case 'scene-remove-outfit':
        delete outfits[outfitName];
        migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName }, null);
        selectTab(settingsState, charName, '');
        return done();
    case 'scene-add-outfit-word': {
        const word = await ask(ctx, `为服装「${outfitName}」添加词（AI 写出或表格里出现该词即视为这套服装）：`);
        return word && addOutfitWord(globalObj, outfits, entry, word) ? done() : rerenderSettings();
    }
    case 'scene-remove-outfit-word': {
        const word = decodeSeg(segs[2] || '');
        entry.words = entry.words.filter((value) => value !== word);
        return done();
    }
    case 'scene-add-outfit-scene': {
        const scenes = plain(sceneAssets.scenes) || {};
        const known = Object.keys(scenes);
        if (!known.length) { warn(globalObj, '还没有登记任何场景，请先在「场景背景」里添加'); return rerenderSettings(); }
        const input = await ask(ctx, `服装「${outfitName}」适用的场景（填场景名或别名）：\n已登记：${known.slice(0, 12).join('、')}${known.length > 12 ? ' 等' : ''}`);
        if (!input) return rerenderSettings();
        const key = classifySceneKey(scenes, input).key;
        if (!key) { warn(globalObj, `没有找到场景「${input}」，请填写已登记的场景名或别名`); return rerenderSettings(); }
        const list = Array.isArray(entry.scenes) ? entry.scenes : [];
        if (!list.includes(key)) entry.scenes = [...list, key];
        return done();
    }
    case 'scene-remove-outfit-scene': {
        const scene = decodeSeg(segs[2] || '');
        entry.scenes = (Array.isArray(entry.scenes) ? entry.scenes : []).filter((value) => value !== scene);
        if (!entry.scenes.length) delete entry.scenes;
        return done();
    }
    case 'scene-clear-outfit-avatar':
        delete entry.avatar;
        return done();
    case 'scene-outfit-copy-slots': {
        const base = plain(plain(sceneAssets.characters)[charName]) || {};
        for (const mood of Object.keys(base)) {
            if (mood !== OUTFIT_RESET && !BLOCKED_KEYS.has(mood) && !hasOwn(entry.moods, mood)) entry.moods[mood] = '';
        }
        return done();
    }
    case 'scene-add-outfit-mood': {
        const preset = decodeSeg(segs[2] || '');
        const mood = preset || await ask(ctx, `服装「${outfitName}」的情绪/槽名称（建议与情绪组名一致）：`);
        if (!mood || !validateSlotName(globalObj, mood)) return rerenderSettings();
        if (hasOwn(entry.moods, mood)) { warn(globalObj, `服装「${outfitName}」已有「${mood}」槽（同名）`); return rerenderSettings(); }
        addOutfitSlot(sceneAssets, entry, mood);
        return done();
    }
    case 'scene-rename-outfit-mood':
    case 'scene-remove-outfit-mood': {
        const oldMood = decodeSeg(segs[2] || '');
        if (!hasOwn(entry.moods, oldMood)) return rerenderSettings();
        if (command === 'scene-remove-outfit-mood') {
            delete entry.moods[oldMood];
            migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName, mood: oldMood }, null);
            return done();
        }
        const mood = await ask(ctx, `重命名服装「${outfitName}」的「${oldMood}」槽为：`, oldMood);
        if (!mood || mood === oldMood || !validateSlotName(globalObj, mood)) return rerenderSettings();
        if (hasOwn(entry.moods, mood)) { warn(globalObj, `服装「${outfitName}」已有「${mood}」槽（同名），改名会覆盖，已阻止`); return rerenderSettings(); }
        entry.moods = reorderKey(entry.moods, oldMood, mood);
        migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName, mood: oldMood }, { mood });
        return done();
    }
    default:
        return rerenderSettings();
    }
}
