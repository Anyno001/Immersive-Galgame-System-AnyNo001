import { storedImageReferences } from '../../media/image-references.js';
import { openSettingsPage } from './settings-pages.js';
import { BUILTIN_NUDE_OUTFIT, normalizeOutfitForm, fuzzyOutfitName, isBuiltinNudeOutfit, isValidOutfitName, isValidOutfitWord, normalizeWardrobe, OUTFIT_RESET, resolveWardrobePrompt } from '../../scene/character-outfits.js';
import { generatedAssetIdOf } from '../../scene/asset-match.js';
import { migrateOriginalOutfits, migrationRowOf, splitMigrationWords } from '../../scene/outfit-migration.js';

import { readDefaultOutfit, outfitSpriteSlots, setOutfitSprite, pickOutfitSprite, prepareDefaultOutfitSelection } from '../../scene/character-appearance.js';
import { inspectOutfitImages } from '../../media/outfit-image-availability.js';
import { normalizeMoodGroups } from '../../scene/mood-groups.js';
import { classifySceneKey } from '../../scene/scene-directives.js';
import { clearOutfitReview, loadOutfitReview, removeOutfitReview } from '../../scene/outfit-review-store.js';
import { migrateSpriteKeys } from './sprite-key-migration.js';
import { migrateExpressionNotes } from '../../scene/expression-note-keys.js';
import { draftAssetLibrary, draftEffectiveAssets, rememberAssetScope, effectiveSceneAssets } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { createSettingsDialogs } from './settings-dialog.js';
import { beginSettingsProgress, remountSettingsNotice, SETTINGS_NOTICE_MS } from './settings-notice.js';

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CHARACTER_FIELDS = ['characters', 'characterOutfits', 'characterDefaultOutfits', 'characterSeeds', 'characterDna', 'characterAliases', 'statusAvatars'];
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

function warn(source, message) {
    const dialogs = source && source.dialogs;
    const globalObj = source && source.options ? (source.options.global || globalThis) : source;
    const ask = dialogs && typeof dialogs.alert === 'function'
        ? dialogs
        : (source && source.options ? createSettingsDialogs({ global: globalObj }) : null);
    if (ask && typeof ask.alert === 'function') {
        const pending = ask.alert(message);
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
        return;
    }
    if (globalObj && typeof globalObj.alert === 'function') globalObj.alert(message);
}

function settingsHost(globalObj) {
    const doc = globalObj && globalObj.document;
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById('igs-unified-settings') : null;
}

// 衣柜写词、出参考图要等一阵：确认后挂进度条，结束收起；成功给一条提示，失败仍走 warn 弹窗。
function wardrobeProgress(globalObj, text) {
    return beginSettingsProgress(() => settingsHost(globalObj), text);
}

function wardrobeDone(globalObj, message) {
    const el = remountSettingsNotice(settingsHost(globalObj), { message, tone: 'info', until: Date.now() + SETTINGS_NOTICE_MS }, Date.now());
    if (!el || typeof globalObj.setTimeout !== 'function') return;
    globalObj.setTimeout(() => {
        if (el.textContent === message && el.parentNode) el.parentNode.removeChild(el);
    }, SETTINGS_NOTICE_MS);
}

function validateSlotName(ctx, name) {
    if (name === OUTFIT_RESET) { warn(ctx, '服装内不设「默认」情绪：缺图时会自动改用现有立绘'); return false; }
    if (BLOCKED_KEYS.has(name)) { warn(ctx, `「${name}」不能用作情绪名`); return false; }
    return true;
}

function createOutfit(ctx, charName, outfits, name) {
    if (!isValidOutfitName(name)) { warn(ctx, `「${name}」不能用作服装名（不能为空、「默认」或含 | ] 换行）`); return false; }
    const owner = outfitTokenOwner(outfits, name);
    if (owner) { warn(ctx, owner === name ? `「${charName}」已有服装「${name}」（同名）` : `「${name}」已是服装「${owner}」的词`); return false; }
    outfits[name] = isBuiltinNudeOutfit(name) ? { words: [], moods: {}, wardrobe: BUILTIN_NUDE_OUTFIT } : { words: [], moods: {} };
    return true;
}

function addOutfitWord(ctx, outfits, entry, word) {
    if (!isValidOutfitWord(word) || word === OUTFIT_RESET) { warn(ctx, `「${word}」不能用作别名`); return false; }
    const owner = outfitTokenOwner(outfits, word);
    if (owner) { warn(ctx, owner === word ? `「${word}」已是服装名` : `「${word}」已属于服装「${owner}」`); return false; }
    entry.words.push(word);
    return true;
}

function addOutfitSlot(moodRoot, entry, mood) {
    entry.moods[mood] = '';
    const groups = Array.isArray(moodRoot.moodGroups) ? moodRoot.moodGroups : (moodRoot.moodGroups = normalizeMoodGroups(moodRoot.moodGroups));
    if (!groups.some((g) => g && g.label === mood)) groups.unshift({ label: mood, words: [mood] });
}

// 角色卡当前选中的服装标签，只是界面状态，不写入设置。
function retargetWardrobe(characterOutfits, from, to) {
    for (const outfits of Object.values(plain(characterOutfits) || {})) {
        for (const entry of Object.values(plain(outfits) || {})) {
            if (!entry || entry.wardrobe !== from) continue;
            if (to) entry.wardrobe = to;
            else delete entry.wardrobe;
        }
    }
}

// 衣柜词或参考图完成后选角色，复用已有服装立绘流程。
async function offerOutfitSprites(ctx, wardrobeName, dialogs) {
    const { settingsState, persistSettingsDraft, rerenderSettings } = ctx;
    if (typeof ctx.rerun !== 'function' || !dialogs || typeof dialogs.choose !== 'function') return null;
    const names = Object.keys(plain(draftEffectiveAssets(settingsState).characters) || {}).filter((key) => !BLOCKED_KEYS.has(key));
    if (!names.length) return null;
    // 正文新衣服的自动衣柜已知是谁穿的，不再问。
    const picked = names.includes(ctx.outfitFor) ? ctx.outfitFor : await dialogs.choose(`要给哪个角色画「${wardrobeName}」的立绘？`, names.map((key) => ({ value: key, label: key })), names[0], { dropdown: true, okLabel: '下一步', cancelLabel: '暂不生成' });
    if (!picked || !names.includes(picked)) return rerenderSettings();
    const library = draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name: picked });
    const outfits = outfitMapOf(library, picked);
    let entry = outfitEntry(outfits, wardrobeName);
    if (!entry) {
        if (!createOutfit(ctx, picked, outfits, wardrobeName)) return rerenderSettings();
        entry = outfits[wardrobeName];
    }
    entry.wardrobe = wardrobeName;
    const persisted = persistSettingsDraft();
    if (persisted.ok === false) return persisted;
    selectTab(settingsState, picked, wardrobeName);
    return ctx.rerun(`outfit-expression-set:${encodeURIComponent(picked)}:${encodeURIComponent(wardrobeName)}`);
}

// 原装迁移清单的行。名字 / 别名 / 说明先按已有信息预填，用户在清单里改完再迁。
function migrateSeedRows(settingsState) {
    const effective = draftEffectiveAssets(settingsState);
    const characters = plain(effective.characters) || {};
    const outfits = plain(effective.characterOutfits) || {};
    const rows = [];
    for (const [character, base] of Object.entries(characters)) {
        if (BLOCKED_KEYS.has(character)) continue;
        const info = migrationRowOf(character, base);
        if (!info.hasSprite) continue;
        const taken = new Set(Object.keys(plain(outfits[character]) || {}).map((name) => name.trim()));
        const prefer = `${character}${info.whole ? '原装' : ''}`;
        let name = '';
        // 默认名撞上已有服装就直接留空，让用户自己填，不悄悄改名。
        if (isValidOutfitName(prefer) && !taken.has(prefer)) name = prefer;
        rows.push({ character, name, words: [], note: '', prompt: '', ...info });
    }
    return rows;
}

// 清单里的输入框就地改草稿即可（跟 DNA 输入一样，关闭设置时统一保存），不重绘、不调 AI。
function updateMigrateRow(settingsState, character, fieldName, value) {
    const rows = settingsState.asyncState.migrateRows;
    const row = Array.isArray(rows) ? rows.find((item) => item.character === character) : null;
    if (!row) return { ok: true };
    if (fieldName === 'words') row.words = splitMigrationWords(value);
    else if (fieldName === 'name' || fieldName === 'note') row[fieldName] = String(value || '');
    return { ok: true };
}

// 迁移时顺手把原装默认立绘上存的那份提示词搬进新建的衣柜条目。要等接口，所以整批共用一个进度条。
async function collectMigrationPrompts(settingsState, options, rows) {
    const service = options.generatedAssets;
    const effectiveRows = rows.filter((row) => row.name);
    if (!service || typeof service.getImagePrompt !== 'function' || !effectiveRows.length) return;
    const characters = plain(draftEffectiveAssets(settingsState).characters) || {};
    const progress = beginSettingsProgress(() => settingsHost(options.global || globalThis), '读取原装提示词');
    try {
        for (const row of effectiveRows) {
            const base = plain(characters[row.character]) || {};
            const imageId = generatedAssetIdOf(String(base[OUTFIT_RESET] || ''));
            if (!imageId) continue;
            try {
                const stored = await service.getImagePrompt(imageId);
                const prompt = stored && typeof stored === 'object' ? String(stored.positive || '').trim() : '';
                if (prompt) row.prompt = prompt;
            } catch (error) { /* 取不到就留空，不打断整批 */ }
        }
    } finally {
        progress.end();
    }
}

// 一次性功能键：把已有的原装衣服整体迁成差分服装 / 衣柜。先出清单，确认后才动数据。
async function handleMigrateOutfit(command, segs, ctx) {
    const { settingsState, options, persistSettingsDraft, rerenderSettings } = ctx;
    rememberAssetScope(settingsState, getSillyTavernContext(options.global || globalThis));
    const asyncState = settingsState.asyncState;
    // 从角色行的菜单进入：清单只包含这个角色，不能把其他角色的原装立绘一起搬走。
    if (command === 'scene-migrate-outfit') {
        const character = decodeSeg(segs[0] || '');
        asyncState.migrateRows = migrateSeedRows(settingsState).filter((row) => row.character === character);
        return rerenderSettings();
    }
    if (command === 'scene-migrate-outfit-cancel') {
        delete asyncState.migrateRows;
        return rerenderSettings();
    }
    if (command === 'scene-migrate-outfit-skip') {
        const character = decodeSeg(segs[0] || '');
        const rows = Array.isArray(asyncState.migrateRows) ? asyncState.migrateRows : [];
        asyncState.migrateRows = rows.filter((row) => row.character !== character);
        return rerenderSettings();
    }
    const rows = Array.isArray(asyncState.migrateRows) ? asyncState.migrateRows : [];
    if (!rows.length) return rerenderSettings();
    if (command === 'scene-migrate-outfit-apply') await collectMigrationPrompts(settingsState, options, rows);
    // 逐行重核一遍再报（迁移本身按「已登记角色名」一批只处理一次），逐条列清楚为什么没迁、哪一格出了情况。
    const before = new Map(Object.entries(plain(draftEffectiveAssets(settingsState).characters) || {})
        .map(([key, value]) => [key, migrationRowOf(key, value)]));
    const checkpoint = structuredClone({ assets: settingsState.draft.bridge.sceneAssets,
        readerSettings: settingsState.draft.readerSettings });
    const result = { ok: true, done: [], skipped: [] };
    for (const row of rows) {
        const library = draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name: row.character });
        const moved = migrateOriginalOutfits({ sceneAssets: library,
            readerSettings: settingsState.draft.readerSettings, rows: [row] });
        result.done.push(...moved.done);
        result.skipped.push(...moved.skipped);
    }
    if (!result || result.ok === false) { warn(ctx, '没有可迁移的角色数据。'); return rerenderSettings(); }
    let persisted;
    try { persisted = persistSettingsDraft({ spriteAssetChanged: true }); }
    catch { persisted = { ok: false, reason: 'save-failed' }; }
    if (persisted?.ok === false) {
        settingsState.draft.bridge.sceneAssets = checkpoint.assets;
        settingsState.draft.readerSettings = checkpoint.readerSettings;
        return persisted;
    }
    delete asyncState.migrateRows;
    // 清单收起后条数少、提示词短，改成弹窗报结果，避免提示条一长就断在工具栏后面。
    const lines = [];
    for (const item of result.done) {
        const base = before.get(item.character);
        const cleared = base && base.count ? `原装 ${base.count} 张已搬走` : '原装已清空';
        lines.push(`${item.character} → 服装「${item.name}」：搬了 ${item.moods} 格，${cleared}${item.replacedCalm ? '（原装的「平和」已在，默认那张没搬）' : ''}`);
    }
    for (const item of result.skipped) lines.push(`${item.character}：没迁移——${item.reason}`);
    lines.push('', '基础图与全部表情已分别保留；未指定过新默认时，这套衣装继续承担原装显示。');
    const dialogs = ctx.dialogs || createSettingsDialogs({ global: options.global || globalThis });
    if (typeof dialogs.view === 'function') await dialogs.view(lines.join('\n'));
    return rerenderSettings();
}

async function handleWardrobe(command, segs, ctx, { editLibrary, resolveEditLibrary, createMissing = false, editTitle } = {}) {
    const { settingsState, options, persistSettingsDraft, rerenderSettings } = ctx;
    const globalObj = options.global || globalThis;
    rememberAssetScope(settingsState, getSillyTavernContext(options.global || globalThis));
    const name = decodeSeg(segs[0] || '');
    if (command === 'wardrobe-for-outfit') {
        const outfitName = decodeSeg(segs[1] || '');
        const effective = draftEffectiveAssets(settingsState);
        const own = plain(plain(effective.characterOutfits) || {});
        const outfit = plain((plain(own[name]) || {})[outfitName]);
        if (!outfit) return rerenderSettings();
        const linked = typeof outfit.wardrobe === 'string' && outfit.wardrobe.trim() ? outfit.wardrobe.trim() : outfitName;
        if (!isValidOutfitName(linked)) return rerenderSettings();
        openSettingsPage(settingsState, 'wardrobe');
        settingsState.asyncState.wardrobeFocus = linked;
        if (hasOwn(plain(effective.wardrobe) || {}, linked)) return rerenderSettings();
        const library = draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name });
        library.wardrobe = { ...normalizeWardrobe(library.wardrobe), [linked]: { prompt: '' } };
        const created = persistSettingsDraft();
        if (created.ok === false) return created;
        return rerenderSettings();
    }
    // 「待确认」里的生成提示词带着 角色:词，写的是那个词；其余按衣柜条目名找它所在的一边。
    const entryName = command === 'wardrobe-generate-prompt' && segs.length > 1 ? decodeSeg(segs[1] || '') : name;
    const readLibrary = () => resolveEditLibrary?.() || editLibrary || draftAssetLibrary(settingsState, command === 'wardrobe-add' ? null : { collections: ['wardrobe'], name: entryName });
    let sceneAssets = readLibrary();
    let previousWardrobe = sceneAssets.wardrobe;
    let wardrobe = normalizeWardrobe(sceneAssets.wardrobe);
    sceneAssets.wardrobe = wardrobe;
    const root = settingsState.draft.bridge.sceneAssets;
    const scope = settingsState.asyncState?.assetScopeKey;
    const draft = settingsState.draft;
    const unchanged = () => {
        if ((ctx.isCurrent && !ctx.isCurrent()) || settingsState.draft !== draft
            || settingsState.asyncState?.assetScopeKey !== scope) return false;
        const live = readLibrary();
        sceneAssets = live;
        previousWardrobe = live.wardrobe;
        wardrobe = normalizeWardrobe(live.wardrobe);
        live.wardrobe = wardrobe;
        return true;
    };
    const conflict = () => ({ ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT',
        error: '本次服装文字或所属库已修改，原资料未覆盖' });
    // 服装点名引用衣柜条目时，全局和本卡的服装都可能指着它，改名、删除两边一起跟上。
    const linkedOutfits = () => [plain(settingsState.draft.bridge.sceneAssets) || {}, draftAssetLibrary(settingsState)]
        .map((library) => library.characterOutfits);
    const linkUndo = new Map();
    const retargetLinks = (next) => {
        for (const outfits of linkedOutfits()) {
            for (const entries of Object.values(plain(outfits) || {})) {
                for (const entry of Object.values(plain(entries) || {})) {
                    if (entry?.wardrobe === name && !linkUndo.has(entry)) linkUndo.set(entry, entry.wardrobe);
                }
            }
            retargetWardrobe(outfits, name, next);
        }
    };
    if (command === 'wardrobe-add') {
        const next = await ask(ctx, '服装名称：', '');
        if (!next) return rerenderSettings();
        if (!unchanged()) return conflict();
        if (isBuiltinNudeOutfit(next)) { warn(ctx, `「${next}」是内置项，不会加入服装库。`); return rerenderSettings(); }
        if (!isValidOutfitName(next)) { warn(ctx, `「${next}」不能用作服装名`); return rerenderSettings(); }
        if (hasOwn(wardrobe, next)) { warn(ctx, `衣柜里已有「${next}」`); return rerenderSettings(); }
        // 名字和具体要求分开问；自动流程（默认开）接着写提示词、出参考图，关掉就停在这里等手动点。
        const auto = settingsState.draft.bridge.sceneAssets.wardrobeAutoFlow !== false;
        const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
        const note = typeof dialogs.edit === 'function'
            ? await dialogs.edit(`「${next}」的具体要求（款式、颜色、材质、配饰等，可留空）`, '', { okLabel: auto ? '开始生成' : '保存', cancelLabel: '取消' })
            : '';
        if (note == null) return rerenderSettings();
        if (!unchanged()) return conflict();
        if (hasOwn(wardrobe, next)) { warn(ctx, `衣柜里已有「${next}」`); return rerenderSettings(); }
        wardrobe[next] = String(note).trim() ? { prompt: '', note: String(note).trim() } : { prompt: '' };
        const added = persistSettingsDraft();
        if (added.ok === false) return added;
        if (!auto) return rerenderSettings();
        const seg = [encodeURIComponent(next)];
        const chained = { ...ctx, auto: true };
        await handleWardrobe('wardrobe-generate-prompt', seg, chained);
        const written = normalizeWardrobe(draftEffectiveAssets(settingsState).wardrobe)[next];
        if (!written || !written.prompt) return rerenderSettings();
        return handleWardrobe('wardrobe-reference', seg, chained);
    } else if (command === 'wardrobe-rename') {
        if (!hasOwn(wardrobe, name)) return rerenderSettings();
        const next = await ask(ctx, `把「${name}」改名为：`, name);
        if (!next || next === name) return rerenderSettings();
        if (!unchanged()) return conflict();
        if (isBuiltinNudeOutfit(next)) { warn(ctx, `「${next}」是内置项，不会加入服装库。`); return rerenderSettings(); }
        if (!isValidOutfitName(next)) { warn(ctx, `「${next}」不能用作服装名`); return rerenderSettings(); }
        if (hasOwn(wardrobe, next)) { warn(ctx, `衣柜里已有「${next}」`); return rerenderSettings(); }
        const renamed = {};
        for (const [key, value] of Object.entries(wardrobe)) renamed[key === name ? next : key] = value;
        sceneAssets.wardrobe = renamed;
        retargetLinks(next);
    } else if (command === 'wardrobe-prompt' || command === 'wardrobe-half-prompt') {
        if (!hasOwn(wardrobe, name) && !createMissing) return rerenderSettings();
        const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
        if (typeof dialogs.edit !== 'function') {
            warn(ctx, '提示词编辑当前不可用。');
            return rerenderSettings();
        }
        const field = command === 'wardrobe-half-prompt' ? 'promptHalfBody' : 'prompt';
        const current = String(wardrobe[name]?.[field] || '');
        const edited = await dialogs.edit(editTitle || `「${name}」的${field === 'promptHalfBody' ? '半身服装 DNA' : '提示词'}`, current);
        if (edited == null) return rerenderSettings();
        if (!unchanged()) return conflict();
        const value = String(edited).trim();
        wardrobe[name] = { ...wardrobe[name], [field]: value };
        // 完整母版变更后不能继续套用旧半身视图；下次立绘生成按新母版补齐。
        if (field === 'prompt' && value !== current) delete wardrobe[name].promptHalfBody;
    } else if (command === 'wardrobe-nsfw') {
        if (!hasOwn(wardrobe, name)) return rerenderSettings();
        if (wardrobe[name].nsfwBoost === true) delete wardrobe[name].nsfwBoost;
        else wardrobe[name].nsfwBoost = true;
    } else if (command === 'wardrobe-generate-prompt') {
        const word = decodeSeg(segs[1] || '');
        const character = name;
        if (!word && hasOwn(wardrobe, name)) {
            const subject = { character: '', outfit: name, nsfwBoost: wardrobe[name].nsfwBoost === true };
            const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
            const existing = String((wardrobe[name] && wardrobe[name].prompt) || '').trim();
            // 手动点时先给看具体要求，可改；自动流程直接用新建时填的。
            let note = String((wardrobe[name] && wardrobe[name].note) || '');
            if (!ctx.auto) {
                const edited = typeof dialogs.edit === 'function'
                    ? await dialogs.edit(`${existing ? `重新生成「${name}」的提示词并覆盖现有内容` : `为「${name}」生成服装提示词`}。具体要求（可留空）：`, note, { okLabel: '生成提示词', cancelLabel: '取消' })
                    : note;
                if (edited == null) return rerenderSettings();
                if (!unchanged()) return conflict();
                note = String(edited).trim();
                wardrobe[name] = { ...wardrobe[name], note };
                if (!note) delete wardrobe[name].note;
            }
            subject.note = note;
            const service = options.generatedAssets;
            if (!service || typeof service.writeWardrobePrompt !== 'function') {
                warn(ctx, '当前无法编写服装提示词。');
                return rerenderSettings();
            }
            const progress = wardrobeProgress(globalObj, `写提示词：${name}`);
            let written;
            try { written = await service.writeWardrobePrompt({ ...subject, shouldStart: unchanged }); }
            catch (error) { written = { ok: false, error: '服装提示词编写失败' }; }
            progress.end();
            if (!written || !written.ok || !String(written.prompt || '').trim()) {
                warn(ctx, (written && written.error) || '服装提示词编写失败。');
                return rerenderSettings();
            }
            if (!unchanged()) return { ...conflict(), candidatePrompt: String(written.prompt).trim() };
            wardrobe[name] = { ...wardrobe[name], prompt: String(written.prompt).trim() };
            if (written.promptHalfBody !== undefined) wardrobe[name].promptHalfBody = written.promptHalfBody;
            else delete wardrobe[name].promptHalfBody;
            const persistedDirect = persistSettingsDraft();
            if (persistedDirect.ok === false) return persistedDirect;
            const renderedDirect = await rerenderSettings();
            wardrobeDone(globalObj, `「${name}」的提示词写好了。`);
            if (!ctx.auto) return (await offerOutfitSprites(ctx, name, dialogs)) || renderedDirect;
            return renderedDirect;
        }
        if (!character || !word) return rerenderSettings();
        if (!isValidOutfitName(word)) { warn(ctx, `「${word}」不能存进衣柜`); return rerenderSettings(); }
        const pending = loadOutfitReview(globalObj.localStorage);
        if (!pending.some((item) => item.character === character && item.word === word)) return rerenderSettings();
        const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
        const confirmed = typeof dialogs.confirm === 'function'
            ? await dialogs.confirm(`为「${character}」的服装「${word}」写一份提示词，并放进衣柜？`)
            : true;
        if (!confirmed) return rerenderSettings();
        const service = options.generatedAssets;
        if (!service || typeof service.writeWardrobePrompt !== 'function') {
            warn(ctx, '当前无法编写服装提示词。');
            return rerenderSettings();
        }
        const progress = wardrobeProgress(globalObj, `写提示词：${word}`);
        let written;
        try { written = await service.writeWardrobePrompt({ character, outfit: word }); }
        catch (error) { written = { ok: false, error: '服装提示词编写失败' }; }
        progress.end();
        if (!written || !written.ok || !String(written.prompt || '').trim()) {
            warn(ctx, (written && written.error) || '服装提示词编写失败。');
            return rerenderSettings();
        }
        if (!unchanged()) return { ...conflict(), candidatePrompt: String(written.prompt).trim() };
        wardrobe[word] = { ...(wardrobe[word] || {}), prompt: String(written.prompt).trim() };
        if (written.promptHalfBody !== undefined) wardrobe[word].promptHalfBody = written.promptHalfBody;
        else delete wardrobe[word].promptHalfBody;
        removeOutfitReview(globalObj.localStorage, character, word);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        const rendered = await rerenderSettings();
        return (await offerOutfitSprites({ ...ctx, outfitFor: character }, word, dialogs)) || rendered;
    } else if (command === 'wardrobe-reference') {
        if (!hasOwn(wardrobe, name)) return rerenderSettings();
        const prompt = String((wardrobe[name] && wardrobe[name].prompt) || '').trim();
        if (!prompt) { warn(ctx, '请先填写这套服装的提示词。'); return rerenderSettings(); }
        const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
        const confirmed = ctx.auto || typeof dialogs.confirm !== 'function'
            || await dialogs.confirm(`用「${name}」的提示词生成一张参考图？`);
        if (!confirmed) return rerenderSettings();
        if (!unchanged()) return conflict();
        const service = options.generatedAssets;
        if (!service || typeof service.paintWardrobeReference !== 'function') {
            warn(ctx, '当前无法生成参考图。');
            return rerenderSettings();
        }
        const progress = wardrobeProgress(globalObj, `生图中：${name}·参考图`);
        let painted;
        try { painted = await service.paintWardrobeReference({ prompt, nsfwBoost: wardrobe[name].nsfwBoost === true }); }
        catch (error) { painted = { ok: false, error: '出参考图失败' }; }
        progress.end();
        if (!painted || !painted.ok || !painted.imageId) {
            warn(ctx, (painted && painted.error) || '出参考图失败。');
            return rerenderSettings();
        }
        if (!unchanged()) return { ...conflict(), candidateImageId: painted.imageId };
        const previousEntry = wardrobe[name];
        const previous = String((previousEntry && previousEntry.reference) || '');
        wardrobe[name] = { ...wardrobe[name], reference: `igs-gen:${painted.imageId}` };
        const previousId = previous.startsWith('igs-gen:') ? previous.slice('igs-gen:'.length) : '';
        let persisted;
        try { persisted = persistSettingsDraft(); }
        catch (error) { persisted = { ok: false, reason: 'save-failed', saveError: error }; }
        if (!persisted || persisted === false || persisted.ok === false) {
            wardrobe[name] = previousEntry;
            if (!persisted || !persisted.rollbackFailed) {
                try {
                    const deleted = typeof service.deleteImages === 'function' && await service.deleteImages([painted.imageId]);
                    if (!deleted || deleted.ok === false) warn(ctx, '新参考图未能从本机清除。');
                } catch (error) { warn(ctx, '新参考图未能从本机清除。'); }
            }
            return persisted && persisted !== false ? persisted : { ok: false, reason: 'save-failed' };
        }
        if (previousId && previousId !== painted.imageId && typeof service.deleteImages === 'function'
            && !storedImageReferences(globalObj, settingsState.draft.bridge.sceneAssets).ids.has(previousId)) {
            try {
                const deleted = await service.deleteImages([previousId]);
                if (deleted === false || (deleted && deleted.ok === false)) warn(ctx, '旧参考图未能从本机清除。');
            } catch (error) { warn(ctx, '旧参考图未能从本机清除。'); }
        }
        const renderedRef = await rerenderSettings();
        wardrobeDone(globalObj, `「${name}」的参考图画好了。`);
        return (await offerOutfitSprites(ctx, name, dialogs)) || renderedRef;
    } else if (command === 'wardrobe-remove') {
        if (!hasOwn(wardrobe, name)) return rerenderSettings();
        delete wardrobe[name];
        retargetLinks('');
    }
    let persisted;
    try { persisted = persistSettingsDraft(); }
    catch (error) { persisted = { ok: false, reason: 'save-failed', saveError: error }; }
    if (!persisted || persisted.ok === false) {
        if (previousWardrobe === undefined) delete sceneAssets.wardrobe;
        else sceneAssets.wardrobe = previousWardrobe;
        for (const [entry, linked] of linkUndo) entry.wardrobe = linked;
        return persisted || { ok: false, reason: 'save-failed' };
    }
    return rerenderSettings();
}

function selectTab(settingsState, charName, outfitName) {
    const tabs = plain(settingsState.asyncState.outfitTabs) || (settingsState.asyncState.outfitTabs = {});
    if (outfitName) tabs[charName] = outfitName; else delete tabs[charName];
    // 切到某套服装时，这个角色在列表里一定是展开的。
    settingsState.asyncState.advancedOpen = { ...(settingsState.asyncState.advancedOpen || {}), [`char-open:${charName}`]: true };
}

// 正文出现新衣服：先在衣柜里模糊找，找到就给角色建服装对上衣柜、记下正文写法，直接转表情差分；
// 没有就新建衣柜条目 → 写提示词 → 出参考图 → 给这个角色画差分（同衣柜「＋」的自动流程）。
async function handleOutfitReviewAuto(segs, ctx) {
    const { settingsState, options, persistSettingsDraft, rerenderSettings } = ctx;
    const globalObj = options.global || globalThis;
    const charName = decodeSeg(segs[0] || '');
    const word = decodeSeg(segs[1] || '');
    rememberAssetScope(settingsState, getSillyTavernContext(globalObj));
    const effective = draftEffectiveAssets(settingsState);
    if (!charName || BLOCKED_KEYS.has(charName) || !isValidOutfitName(word) || !hasOwn(plain(effective.characters) || {}, charName)) return rerenderSettings();
    const wardrobe = normalizeWardrobe(effective.wardrobe);
    const fuzzy = hasOwn(wardrobe, word) ? word : fuzzyOutfitName(wardrobe, word);
    const outfits = outfitMapOf(draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name: charName }), charName);
    // 让用户选：衣柜模糊命中 / 归入角色已有服装（正文写法记成别名）/ 生成新衣服。
    const choices = [
        ...(fuzzy ? [{ value: `w:${fuzzy}`, label: `用衣柜里的「${fuzzy}」` }] : []),
        ...Object.keys(outfits).map((name) => ({ value: `o:${name}`, label: `归入「${name}」（加别名）` })),
        { value: 'new', label: `生成新衣服「${word}」` },
    ];
    // 段末面板已在下拉菜单里选好时直接用，不再弹询问。
    const preset = decodeSeg(segs[2] || '');
    const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
    const picked = preset ? preset : typeof dialogs.choose === 'function'
        ? await dialogs.choose(`「${charName}」穿了衣柜里没有的「${word}」：`, choices, choices[0].value, { cancelLabel: '稍后' })
        : choices[0].value;
    if (!picked || !choices.some((c) => c.value === picked)) return rerenderSettings();
    const hit = picked === 'new' ? '' : picked.slice(2);
    if (hit) {
        if (!outfitEntry(outfits, hit) && !createOutfit(ctx, charName, outfits, hit)) return rerenderSettings();
        if (word !== hit) addOutfitWord(ctx, outfits, outfitEntry(outfits, hit), word);
        if (picked.startsWith('o:')) {
            removeOutfitReview(globalObj.localStorage, charName, word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
            selectTab(settingsState, charName, hit);
            return rerenderSettings();
        }
        removeOutfitReview(globalObj.localStorage, charName, word);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        selectTab(settingsState, charName, hit);
        return ctx.rerun(`outfit-expression-set:${encodeURIComponent(charName)}:${encodeURIComponent(hit)}`);
    }
    const library = draftAssetLibrary(settingsState, null);
    library.wardrobe = { ...normalizeWardrobe(library.wardrobe), [word]: { prompt: '' } };
    removeOutfitReview(globalObj.localStorage, charName, word);
    const added = persistSettingsDraft();
    if (added.ok === false) return added;
    openSettingsPage(settingsState, 'wardrobe');
    settingsState.asyncState.wardrobeFocus = word;
    const seg = [encodeURIComponent(word)];
    const chained = { ...ctx, auto: true, outfitFor: charName };
    await handleWardrobe('wardrobe-generate-prompt', seg, chained);
    const written = normalizeWardrobe(draftEffectiveAssets(settingsState).wardrobe)[word];
    if (!written || !written.prompt) return rerenderSettings();
    return handleWardrobe('wardrobe-reference', seg, chained);
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
    rememberAssetScope(settingsState, getSillyTavernContext(options.global || globalThis));
    const sceneAssets = draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name: charName });
    if (!charName || BLOCKED_KEYS.has(charName) || !hasOwn(plain(sceneAssets.characters) || {}, charName)) return rerenderSettings();
    const outfits = outfitMapOf(sceneAssets, charName);
    let changed = false;
    if (command === 'outfit-review-assign') {
        const entry = outfitEntry(outfits, decodeSeg(segs[2] || ''));
        if (!entry) return rerenderSettings();
        changed = addOutfitWord(ctx, outfits, entry, word);
    } else if (command === 'outfit-review-create') {
        changed = createOutfit(ctx, charName, outfits, word);
        if (changed) selectTab(settingsState, charName, word);
    }
    if (!changed) return rerenderSettings();
    removeOutfitReview(storage, charName, word);
    const persisted = persistSettingsDraft();
    if (persisted.ok === false) return persisted;
    return rerenderSettings();
}

const COMMAND_RE = /^(scene-(?:add|rename|remove)-outfit(?:-(?:mood|word|scene))?|scene-promote-outfit|scene-set-default-outfit|scene-set-outfit-(?:mood|avatar|wardrobe)-url|scene-set-outfit-(?:note|form)|scene-clear-outfit-avatar|scene-outfit-(?:tab|copy-slots|dna|half-dna)|scene-migrate-outfit(?:-(?:cancel|apply|skip|run))?|outfit-review-(?:assign|create|dismiss|clear|auto)|wardrobe-(?:add|rename|remove|generate-prompt|reference|nsfw|for-outfit|prompt|half-prompt))(?::(.*))?$/;

// 服装区 action：返回 null 表示不归本模块处理。位置 / 头部标定 key 随改名迁移、随删除清理。
// 地址编辑、槽删除和文件上传共用只读预检；调用方在真正写入前再次检查租约。
function captureOutfitTarget(ctx) {
    const { settingsState } = ctx;
    const scope = settingsState.asyncState?.assetScopeKey;
    return () => settingsState.asyncState?.assetScopeKey === scope;
}

export async function inspectCurrentOutfitImages(ctx, sceneAssets, charName, outfitName, candidate) {
    const { options } = ctx;
    const isCurrent = captureOutfitTarget(ctx, sceneAssets, charName, outfitName);
    const availability = await inspectOutfitImages(candidate, {
        global: options.global || globalThis,
        readStoredImage: options.generatedAssets?.readStoredImage?.bind(options.generatedAssets),
    });
    return isCurrent() ? { ok: true, availability, isCurrent }
        : { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '正在自动续接衣装操作' };
}

function repairDefaultOutfit(sceneAssets, charName, removedOutfit = '', candidate) {
    const current = sceneAssets.characterDefaultOutfits?.[charName];
    if (!current || (removedOutfit && current.outfitName !== removedOutfit)) return;
    const choices = Object.entries(sceneAssets.characterOutfits?.[charName] || {})
        .filter(([name, entry]) => name !== removedOutfit && Object.keys(outfitSpriteSlots(entry)).length);
    const defaults = { ...sceneAssets.characterDefaultOutfits };
    if (candidate && Object.keys(outfitSpriteSlots(candidate)).length) return;
    if (choices.length) defaults[charName] = { version: 1, outfitName: choices[0][0] };
    else delete defaults[charName];
    sceneAssets.characterDefaultOutfits = defaults;
}

export async function guardDefaultOutfitImages(ctx, sceneAssets, charName, outfitName, candidate) {
    if (readDefaultOutfit(sceneAssets, charName).outfitName === outfitName)
        repairDefaultOutfit(sceneAssets, charName, outfitName, candidate);
    return { ok: true };
}

export function handleOutfitAction(normalizedAction, ctx) {
    const match = COMMAND_RE.exec(normalizedAction);
    return match ? runOutfitAction(match, ctx) : null;
}

async function runOutfitAction(match, ctx) {
    const [, command, rest = ''] = match;
    const segs = rest.split(':');
    if (command === 'outfit-review-auto') return handleOutfitReviewAuto(segs, ctx);
    if (command.startsWith('scene-migrate-outfit')) {
        const state = ctx.settingsState;
        if (!plain(state.asyncState)) state.asyncState = {};
        return handleMigrateOutfit(command, segs, ctx);
    }
    if (command.startsWith('outfit-review-')) return handleOutfitReview(command, segs, ctx);
    const { settingsState, options, persistSettingsDraft, rerenderSettings } = ctx;
    if (command.startsWith('wardrobe-')) return handleWardrobe(command, segs, ctx);
    const globalObj = options.global || globalThis;
    const draft = settingsState.draft;
    rememberAssetScope(settingsState, getSillyTavernContext(options.global || globalThis));
    const charName = decodeSeg(segs[0]);
    const sceneAssets = draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name: charName });
    const readerSettings = draft.readerSettings = draft.readerSettings || {};
    if (!charName || BLOCKED_KEYS.has(charName) || !hasOwn(plain(sceneAssets.characters) || {}, charName)) return rerenderSettings();
    const outfits = outfitMapOf(sceneAssets, charName);
    const outfitName = decodeSeg(segs[1] || '');
    const entry = outfitName ? outfitEntry(outfits, outfitName) : null;
    const before = () => ({ characterOutfits: structuredClone(sceneAssets.characterOutfits),
        characterDefaultOutfits: structuredClone(sceneAssets.characterDefaultOutfits),
        generated: structuredClone(sceneAssets.generated),
        readerSettings: structuredClone(readerSettings),
        outfitTabs: { ...settingsState.asyncState.outfitTabs } });
    let checkpoint;
    const isDefault = () => readDefaultOutfit(sceneAssets, charName).outfitName === outfitName;
    const conflict = () => ({ ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '正在自动续接衣装操作' });
    const leaseExpired = result => result.isCurrent && !result.isCurrent();
    const inspectCurrent = candidate => inspectCurrentOutfitImages(ctx, sceneAssets, charName, outfitName, candidate);
    const protectDefaultImages = candidate => guardDefaultOutfitImages(ctx, sceneAssets, charName, outfitName, candidate);
    const done = () => {
        let persisted;
        try { persisted = persistSettingsDraft({ spriteAssetChanged: true }); }
        catch (error) { persisted = { ok: false, reason: 'save-failed', saveError: error }; }
        if (!persisted || persisted === false || persisted.ok === false) {
            if (checkpoint) {
                for (const key of ['characterOutfits', 'characterDefaultOutfits', 'generated']) {
                    if (checkpoint[key] === undefined) delete sceneAssets[key];
                    else sceneAssets[key] = checkpoint[key];
                }
                draft.readerSettings = checkpoint.readerSettings;
                settingsState.asyncState.outfitTabs = checkpoint.outfitTabs;
            }
            rerenderSettings();
            return persisted || { ok: false, reason: 'save-failed' };
        }
        return rerenderSettings();
    };

    // 输入中只写草稿，不重绘、不持久化，沿用原有情绪槽 URL 的草稿生命周期。
    if (command === 'scene-set-outfit-mood-url') {
        const mood = decodeSeg(segs[2] || '');
        const url = segs.slice(3).join(':');
        if (entry && (mood === '默认' ? hasOwn(entry, 'base') : hasOwn(entry.moods, mood))) {
            Object.assign(entry, setOutfitSprite(entry, mood, url));
        }
        return { ok: true };
    }
    if (command === 'scene-set-outfit-avatar-url') {
        if (entry) entry.avatar = segs.slice(2).join(':');
        return { ok: true };
    }
    if (command === 'scene-set-outfit-note') {
        if (entry) entry.note = segs.slice(2).join(':');
        return { ok: true };
    }
    if (command === 'scene-set-outfit-form') {
        checkpoint = before();
        if (!entry) return rerenderSettings();
        const picked = decodeSeg(segs[2] || '');
        const fieldName = decodeSeg(segs[3] || '') || 'gender';
        if (fieldName === 'gender') {
            if (!picked) delete entry.form;
            else entry.form = normalizeOutfitForm({ ...entry.form, gender: picked });
        } else if (fieldName === 'age' || fieldName === 'note') {
            const next = normalizeOutfitForm({ ...entry.form, [fieldName]: picked });
            if (entry.form || next.age || next.note) entry.form = next;
        }
        return done();
    }
    if (command === 'scene-set-outfit-wardrobe-url') {
        checkpoint = before();
        if (!entry) return rerenderSettings();
        const picked = decodeSeg(segs[2] || '');
        const candidate = { ...entry, wardrobe: picked };
        const wardrobe = draftEffectiveAssets(settingsState).wardrobe;
        if (!picked) delete entry.wardrobe;
        else if (isBuiltinNudeOutfit(picked) || isValidOutfitName(picked)) entry.wardrobe = picked;
        return done();
    }
    if (command === 'scene-outfit-tab') {
        selectTab(settingsState, charName, entry ? outfitName : '');
        return rerenderSettings();
    }
    if (command === 'scene-add-outfit') {
        const name = await ask(ctx, `为角色「${charName}」添加服装：`);
        if (!name) return rerenderSettings();
        checkpoint = before();
        if (!createOutfit(ctx, charName, outfits, name)) return rerenderSettings();
        selectTab(settingsState, charName, name);
        return done();
    }
    if (!entry) return rerenderSettings();

    checkpoint = before();
    switch (command) {
    case 'scene-promote-outfit':
    case 'scene-set-default-outfit': {
        let inspected = await inspectCurrent(entry);
        if (!inspected.ok) return inspected;
        if (leaseExpired(inspected)) return conflict();
        let selected = prepareDefaultOutfitSelection(sceneAssets, charName, outfitName, inspected.availability);
        if (!selected.ok) {
            // 缺图接入已有单张立绘链；沿用原角色、衣装和设置操作的检查点。
            const generated = await ctx.rerun(`outfit-expression-retry:${encodeURIComponent(charName)}:${encodeURIComponent(outfitName)}:${encodeURIComponent('平和')}`);
            if (generated?.ok === false || generated?.cancelled) return generated;
            const latest = draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name: charName });
            const outfit = latest.characterOutfits?.[charName]?.[outfitName];
            inspected = await inspectCurrent(outfit);
            if (!inspected.ok || leaseExpired(inspected)) return conflict();
            selected = prepareDefaultOutfitSelection(latest, charName, outfitName, inspected.availability);
            if (!selected.ok) return selected;
            Object.assign(latest, selected.patch);
            const saved = persistSettingsDraft({ spriteAssetChanged: true });
            return saved?.ok === false ? saved : rerenderSettings();
        }
        checkpoint = before();
        Object.assign(sceneAssets, selected.patch);
        return done();
    }
    case 'scene-outfit-dna':
    case 'scene-outfit-half-dna': {
        if (isBuiltinNudeOutfit(entry.wardrobe) || isBuiltinNudeOutfit(outfitName)) return rerenderSettings();
        const effective = draftEffectiveAssets(settingsState);
        const current = resolveWardrobePrompt(effective.wardrobe, entry, outfitName);
        const linked = current?.name || String(entry.wardrobe || outfitName).trim();
        if (!isValidOutfitName(linked)) return rerenderSettings();
        const scope = settingsState.asyncState?.assetScopeKey;
        // 两个入口编辑同一衣柜条目，保留当前绑定及参考图等附加资料。
        const half = command === 'scene-outfit-half-dna';
        return handleWardrobe(half ? 'wardrobe-half-prompt' : 'wardrobe-prompt', [encodeURIComponent(linked)], { ...ctx,
            isCurrent: () => (!ctx.isCurrent || ctx.isCurrent()) && settingsState.draft === draft
                && settingsState.asyncState?.assetScopeKey === scope,
        }, { createMissing: !current, ...(!current && { editLibrary: sceneAssets,
            resolveEditLibrary: () => draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name: charName }) }),
            editTitle: `编辑${half ? '半身服装 DNA' : '服装描述'} · ${charName} / ${outfitName}` });
    }
    case 'scene-rename-outfit': {
        const isCurrent = captureOutfitTarget(ctx, sceneAssets, charName, outfitName, true);
        const name = await ask(ctx, `重命名服装「${outfitName}」为：`, outfitName);
        if (!name || name === outfitName) return rerenderSettings();
        if (!isCurrent()) return conflict();
        if (!isValidOutfitName(name)) { warn(ctx, `「${name}」不能用作服装名（不能为空、「默认」或含 | ] 换行）`); return rerenderSettings(); }
        const owner = outfitTokenOwner(outfits, name, outfitName);
        if (owner) { warn(ctx, owner === name ? `「${charName}」已有服装「${name}」（同名），改名会覆盖，已阻止` : `「${name}」已是服装「${owner}」的词`); return rerenderSettings(); }
        checkpoint = before();
        const boundDna = resolveWardrobePrompt(draftEffectiveAssets(settingsState).wardrobe, entry, outfitName);
        entry.words = entry.words.filter((word) => word !== name);
        if (isBuiltinNudeOutfit(name)) entry.wardrobe = BUILTIN_NUDE_OUTFIT;
        else if (!isBuiltinNudeOutfit(entry.wardrobe) && boundDna?.prompt) entry.wardrobe = boundDna.name;
        sceneAssets.characterOutfits[charName] = reorderKey(outfits, outfitName, name);
        if (sceneAssets.characterDefaultOutfits?.[charName]?.version === 1 && sceneAssets.characterDefaultOutfits[charName].outfitName === outfitName) {
            sceneAssets.characterDefaultOutfits = { ...sceneAssets.characterDefaultOutfits,
                [charName]: { version: 1, outfitName: name } };
        }
        migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName }, { outfit: name });
        migrateExpressionNotes(sceneAssets, { character: charName, outfit: outfitName }, { outfit: name });
        selectTab(settingsState, charName, name);
        return done();
    }
    case 'scene-remove-outfit':
        if (isDefault()) repairDefaultOutfit(sceneAssets, charName, outfitName);
        delete outfits[outfitName];
        migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName }, null);
        migrateExpressionNotes(sceneAssets, { character: charName, outfit: outfitName }, null);
        selectTab(settingsState, charName, '');
        return done();
    case 'scene-add-outfit-word': {
        const word = await ask(ctx, `给服装「${outfitName}」添加别名（正文或表格里出现这个词，就按这套服装显示）：`);
        return word && addOutfitWord(ctx, outfits, entry, word) ? done() : rerenderSettings();
    }
    case 'scene-remove-outfit-word': {
        const word = decodeSeg(segs[2] || '');
        entry.words = entry.words.filter((value) => value !== word);
        return done();
    }
    case 'scene-add-outfit-scene': {
        const scenes = plain(draftEffectiveAssets(settingsState).scenes) || {};
        const known = Object.keys(scenes);
        if (!known.length) { warn(ctx, '尚未登记任何场景，请先在「场景背景」中添加。'); return rerenderSettings(); }
        const input = await ask(ctx, `服装「${outfitName}」适用的场景（填场景名或别名）：\n已登记：${known.slice(0, 12).join('、')}${known.length > 12 ? ' 等' : ''}`);
        if (!input) return rerenderSettings();
        const key = classifySceneKey(scenes, input).key;
        if (!key) { warn(ctx, `没有找到场景「${input}」，请填写已登记的场景名或别名。`); return rerenderSettings(); }
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
        const mood = preset || await ask(ctx, `服装「${outfitName}」的情绪名称（建议与情绪组名一致）：`);
        if (!mood || !validateSlotName(ctx, mood)) return rerenderSettings();
        if (hasOwn(entry.moods, mood)) { warn(ctx, `服装「${outfitName}」已有「${mood}」情绪（同名）`); return rerenderSettings(); }
        addOutfitSlot(settingsState.draft.bridge.sceneAssets, entry, mood);
        return done();
    }
    case 'scene-rename-outfit-mood':
    case 'scene-remove-outfit-mood': {
        const oldMood = decodeSeg(segs[2] || '');
        if (!hasOwn(outfitSpriteSlots(entry), oldMood)) return rerenderSettings();
        if (command === 'scene-remove-outfit-mood') {
            const remaining = { ...entry.moods };
            delete remaining[oldMood];
            const candidate = { ...entry, moods: remaining };
            if (oldMood === '默认') delete candidate.base;
            const guarded = await protectDefaultImages(candidate);
            if (!guarded.ok) return guarded;
            if (leaseExpired(guarded)) return conflict();
            checkpoint = before();
            if (oldMood === '默认') delete entry.base;
            else delete entry.moods[oldMood];
            migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName, mood: oldMood }, null);
            migrateExpressionNotes(sceneAssets, { character: charName, outfit: outfitName, mood: oldMood }, null);
            return done();
        }
        if (oldMood === '默认') return rerenderSettings();
        const isCurrent = captureOutfitTarget(ctx, sceneAssets, charName, outfitName);
        const mood = await ask(ctx, `重命名服装「${outfitName}」的「${oldMood}」槽为：`, oldMood);
        if (!mood || mood === oldMood || !validateSlotName(ctx, mood)) return rerenderSettings();
        if (!isCurrent()) return conflict();
        if (hasOwn(entry.moods, mood)) { warn(ctx, `服装「${outfitName}」已有「${mood}」槽（同名），改名会覆盖，已阻止`); return rerenderSettings(); }
        checkpoint = before();
        entry.moods = reorderKey(entry.moods, oldMood, mood);
        migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName, mood: oldMood }, { mood });
        migrateExpressionNotes(sceneAssets, { character: charName, outfit: outfitName, mood: oldMood }, { mood });
        return done();
    }
    default:
        return rerenderSettings();
    }
}
