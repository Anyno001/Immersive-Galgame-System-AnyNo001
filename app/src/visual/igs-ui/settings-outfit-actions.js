import { BUILTIN_NUDE_OUTFIT, fuzzyOutfitName, isBuiltinNudeOutfit, isValidOutfitName, isValidOutfitWord, normalizeWardrobe, OUTFIT_RESET } from '../../scene/character-outfits.js';
import { normalizeMoodGroups } from '../../scene/mood-groups.js';
import { classifySceneKey } from '../../scene/scene-directives.js';
import { clearOutfitReview, loadOutfitReview, removeOutfitReview } from '../../scene/outfit-review-store.js';
import { migrateSpriteKeys } from './sprite-key-migration.js';
import { draftAssetLibrary, draftEffectiveAssets, rememberAssetScope } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { createSettingsDialogs } from './settings-dialog.js';
import { beginSettingsProgress, remountSettingsNotice, SETTINGS_NOTICE_MS } from './settings-notice.js';

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CHARACTER_FIELDS = ['characters', 'characterOutfits', 'characterDna', 'characterAliases', 'statusAvatars'];
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
    if (name === OUTFIT_RESET) { warn(ctx, '服装内不设「默认」槽：缺图时会自动回到原有立绘'); return false; }
    if (BLOCKED_KEYS.has(name)) { warn(ctx, `「${name}」不能用作槽名`); return false; }
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

// 参考图画好后问一句：给哪个已登记角色画这套衣服的差分。选了就给该角色建同名服装（自动对上这条衣柜词），转去「表情差分」。
async function offerOutfitSprites(ctx, wardrobeName, dialogs) {
    const { settingsState, persistSettingsDraft, rerenderSettings } = ctx;
    if (typeof ctx.rerun !== 'function' || !dialogs || typeof dialogs.choose !== 'function') return null;
    const names = Object.keys(plain(draftEffectiveAssets(settingsState).characters) || {}).filter((key) => !BLOCKED_KEYS.has(key));
    if (!names.length) return null;
    // 正文新衣服的自动衣柜已知是谁穿的，不再问。
    const picked = names.includes(ctx.outfitFor) ? ctx.outfitFor : await dialogs.choose(`要给哪个角色画「${wardrobeName}」的差分立绘？`, names.map((key) => ({ value: key, label: key })), '', { cancelLabel: '暂不生成' });
    if (!picked || !names.includes(picked)) return rerenderSettings();
    const library = draftAssetLibrary(settingsState, { collections: CHARACTER_FIELDS, name: picked });
    const outfits = outfitMapOf(library, picked);
    if (!outfitEntry(outfits, wardrobeName)) {
        if (!createOutfit(ctx, picked, outfits, wardrobeName)) return rerenderSettings();
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
    }
    selectTab(settingsState, picked, wardrobeName);
    return ctx.rerun(`outfit-expression-set:${encodeURIComponent(picked)}:${encodeURIComponent(wardrobeName)}`);
}

async function handleWardrobe(command, segs, ctx) {
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
        settingsState.asyncState.sceneSubTab = 'rules';
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
    const sceneAssets = draftAssetLibrary(settingsState, command === 'wardrobe-add' ? null : { collections: ['wardrobe'], name: entryName });
    const wardrobe = normalizeWardrobe(sceneAssets.wardrobe);
    sceneAssets.wardrobe = wardrobe;
    // 服装点名引用衣柜条目时，全局和本卡的服装都可能指着它，改名、删除两边一起跟上。
    const linkedOutfits = [plain(settingsState.draft.bridge.sceneAssets) || {}, draftAssetLibrary(settingsState)]
        .map((library) => library.characterOutfits);
    if (command === 'wardrobe-add') {
        const next = await ask(ctx, '服装名称：', '');
        if (!next) return rerenderSettings();
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
        if (isBuiltinNudeOutfit(next)) { warn(ctx, `「${next}」是内置项，不会加入服装库。`); return rerenderSettings(); }
        if (!isValidOutfitName(next)) { warn(ctx, `「${next}」不能用作服装名`); return rerenderSettings(); }
        if (hasOwn(wardrobe, next)) { warn(ctx, `衣柜里已有「${next}」`); return rerenderSettings(); }
        const renamed = {};
        for (const [key, value] of Object.entries(wardrobe)) renamed[key === name ? next : key] = value;
        sceneAssets.wardrobe = renamed;
        for (const outfits of linkedOutfits) retargetWardrobe(outfits, name, next);
    } else if (command === 'wardrobe-prompt') {
        if (!hasOwn(wardrobe, name)) return rerenderSettings();
        const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
        if (typeof dialogs.edit !== 'function') {
            warn(ctx, '提示词编辑当前不可用。');
            return rerenderSettings();
        }
        const current = String((wardrobe[name] && wardrobe[name].prompt) || '');
        const edited = await dialogs.edit(`「${name}」的提示词`, current);
        if (edited == null) return rerenderSettings();
        wardrobe[name] = { ...wardrobe[name], prompt: String(edited).trim() };
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
            try { written = await service.writeWardrobePrompt(subject); }
            catch (error) { written = { ok: false, error: '服装提示词编写失败' }; }
            progress.end();
            if (!written || !written.ok || !String(written.prompt || '').trim()) {
                warn(ctx, (written && written.error) || '服装提示词编写失败。');
                return rerenderSettings();
            }
            wardrobe[name] = { ...wardrobe[name], prompt: String(written.prompt).trim() };
            const persistedDirect = persistSettingsDraft();
            if (persistedDirect.ok === false) return persistedDirect;
            const renderedDirect = await rerenderSettings();
            wardrobeDone(globalObj, `「${name}」的提示词写好了。`);
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
        wardrobe[word] = { ...(wardrobe[word] || {}), prompt: String(written.prompt).trim() };
        removeOutfitReview(globalObj.localStorage, character, word);
    } else if (command === 'wardrobe-reference') {
        if (!hasOwn(wardrobe, name)) return rerenderSettings();
        const prompt = String((wardrobe[name] && wardrobe[name].prompt) || '').trim();
        if (!prompt) { warn(ctx, '请先填写这套服装的提示词。'); return rerenderSettings(); }
        const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
        const confirmed = ctx.auto || typeof dialogs.confirm !== 'function'
            || await dialogs.confirm(`用「${name}」的提示词生成一张参考图？`);
        if (!confirmed) return rerenderSettings();
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
        if (previousId && previousId !== painted.imageId && typeof service.deleteImages === 'function') {
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
        for (const outfits of linkedOutfits) retargetWardrobe(outfits, name, '');
    }
    const persisted = persistSettingsDraft();
    if (persisted.ok === false) return persisted;
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
    const dialogs = ctx.dialogs || createSettingsDialogs({ global: globalObj });
    const picked = typeof dialogs.choose === 'function'
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
    settingsState.asyncState.sceneSubTab = 'rules';
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

const COMMAND_RE = /^(scene-(?:add|rename|remove)-outfit(?:-(?:mood|word|scene))?|scene-set-outfit-(?:mood|avatar|wardrobe)-url|scene-set-outfit-(?:note|form)|scene-clear-outfit-avatar|scene-outfit-(?:tab|copy-slots)|outfit-review-(?:assign|create|dismiss|clear|auto)|wardrobe-(?:add|rename|remove|generate-prompt|reference|nsfw|for-outfit|prompt))(?::(.*))?$/;

// 服装区 action：返回 null 表示不归本模块处理。位置 / 头部标定 key 随改名迁移、随删除清理。
export function handleOutfitAction(normalizedAction, ctx) {
    const match = COMMAND_RE.exec(normalizedAction);
    return match ? runOutfitAction(match, ctx) : null;
}

async function runOutfitAction(match, ctx) {
    const [, command, rest = ''] = match;
    const segs = rest.split(':');
    if (command === 'outfit-review-auto') return handleOutfitReviewAuto(segs, ctx);
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
    if (command === 'scene-set-outfit-note') {
        if (entry) entry.note = segs.slice(2).join(':');
        return { ok: true };
    }
    if (command === 'scene-set-outfit-form') {
        if (!entry) return rerenderSettings();
        const picked = decodeSeg(segs[2] || '');
        if (!picked) delete entry.form;
        else entry.form = { gender: picked === 'female' || picked === 'male' ? picked : '' };
        return done();
    }
    if (command === 'scene-set-outfit-wardrobe-url') {
        if (!entry) return rerenderSettings();
        const picked = decodeSeg(segs[2] || '');
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
        if (!name || !createOutfit(ctx, charName, outfits, name)) return rerenderSettings();
        selectTab(settingsState, charName, name);
        return done();
    }
    if (!entry) return rerenderSettings();

    switch (command) {
    case 'scene-rename-outfit': {
        const name = await ask(ctx, `重命名服装「${outfitName}」为：`, outfitName);
        if (!name || name === outfitName) return rerenderSettings();
        if (!isValidOutfitName(name)) { warn(ctx, `「${name}」不能用作服装名（不能为空、「默认」或含 | ] 换行）`); return rerenderSettings(); }
        const owner = outfitTokenOwner(outfits, name, outfitName);
        if (owner) { warn(ctx, owner === name ? `「${charName}」已有服装「${name}」（同名），改名会覆盖，已阻止` : `「${name}」已是服装「${owner}」的词`); return rerenderSettings(); }
        entry.words = entry.words.filter((word) => word !== name);
        if (isBuiltinNudeOutfit(name)) entry.wardrobe = BUILTIN_NUDE_OUTFIT;
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
        const mood = preset || await ask(ctx, `服装「${outfitName}」的情绪/槽名称（建议与情绪组名一致）：`);
        if (!mood || !validateSlotName(ctx, mood)) return rerenderSettings();
        if (hasOwn(entry.moods, mood)) { warn(ctx, `服装「${outfitName}」已有「${mood}」槽（同名）`); return rerenderSettings(); }
        addOutfitSlot(settingsState.draft.bridge.sceneAssets, entry, mood);
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
        if (!mood || mood === oldMood || !validateSlotName(ctx, mood)) return rerenderSettings();
        if (hasOwn(entry.moods, mood)) { warn(ctx, `服装「${outfitName}」已有「${mood}」槽（同名），改名会覆盖，已阻止`); return rerenderSettings(); }
        entry.moods = reorderKey(entry.moods, oldMood, mood);
        migrateSpriteKeys(readerSettings, { character: charName, outfit: outfitName, mood: oldMood }, { mood });
        return done();
    }
    default:
        return rerenderSettings();
    }
}
