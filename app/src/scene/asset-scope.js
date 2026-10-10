// 场景、角色、衣柜、生成库按角色卡分开。根上的同名字段是全局兜底：
// 当前角色卡里没有这个名字时才用全局，卡里有同名条目时以卡为准。不借用别的卡。

const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const LIBRARY_FIELDS = ['scenes', 'characters', 'characterAliases', 'characterDna', 'characterOutfits', 'wardrobe', 'eventCgs', 'statusAvatars'];

export function resolveAssetScope(ctx) {
    if (!ctx || typeof ctx !== 'object') return { key: '', legacyKey: '', kind: 'global', label: '全局' };
    if (ctx.groupId != null && String(ctx.groupId) !== '') {
        const groups = Array.isArray(ctx.groups) ? ctx.groups : [];
        const group = groups.find((item) => item && String(item.id) === String(ctx.groupId));
        const label = group && group.name ? String(group.name) : '群聊';
        return { key: `group:${ctx.groupId}`, legacyKey: '', kind: 'group', label };
    }
    const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
    const card = ctx.characterId != null ? characters[ctx.characterId] : null;
    const avatar = card && card.avatar ? String(card.avatar).trim() : '';
    const name = (card && card.name && String(card.name).trim())
        || (typeof ctx.name2 === 'string' ? ctx.name2.trim() : '');
    if (name) {
        return {
            key: `card:${name}`,
            legacyKey: avatar ? `card:${avatar}` : '',
            kind: 'card',
            label: name,
        };
    }
    if (avatar) return { key: `card:${avatar}`, legacyKey: '', kind: 'card', label: avatar };
    return { key: '', legacyKey: '', kind: 'global', label: '全局' };
}

function ownedWorldview(card) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
    const hasWorldview = Object.prototype.hasOwnProperty.call(card, 'worldview');
    const hasAncient = Object.prototype.hasOwnProperty.call(card, 'ancient');
    if (!hasWorldview && !hasAncient) return null;
    const patch = {};
    if (hasWorldview) patch.worldview = card.worldview;
    if (hasAncient) patch.ancient = card.ancient === true;
    else if (hasWorldview) patch.ancient = card.worldview === 'ancient';
    // 恐怖世界观的风格与血腥尺度跟着角色卡走。
    for (const key of ['horrorStyle', 'horrorGore', 'carryPhone', 'carryPhonePrompt']) {
        if (Object.prototype.hasOwnProperty.call(card, key)) patch[key] = card[key];
    }
    return patch;
}

// 主界面选世界观时连同对话框皮肤一起记在角色卡上；阅读器渲染时盖过全局 readerSettings.dialogSkin。
// 皮肤 id 由视觉层校验，这里只认非空字符串。根上不写这个字段。
function ownedDialogSkin(card) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
    const skin = typeof card.dialogSkin === 'string' ? card.dialogSkin.trim() : '';
    return skin ? { dialogSkin: skin } : null;
}

export function libraryHasContent(card) {
    const lib = plain(card);
    if (ownedWorldview(lib) || ownedDialogSkin(lib)) return true;
    for (const field of LIBRARY_FIELDS) {
        if (Object.keys(plain(lib[field])).length) return true;
    }
    const generated = plain(lib.generated);
    for (const field of ['scenes', 'characters', 'characterAliases', 'expressionNotes']) {
        if (Object.keys(plain(generated[field])).length) return true;
    }
    return false;
}

// 早期按头像文件名分卡。头像名换一台酒馆就会变，读的时候挪到角色卡名字下。
export function relocateLegacyCard(sceneAssets, key, legacyKey) {
    if (!sceneAssets || !key || !legacyKey || key === legacyKey) return false;
    const cards = plain(sceneAssets.cards);
    if (!cards[legacyKey] || libraryHasContent(cards[key])) return false;
    if (!sceneAssets.cards || typeof sceneAssets.cards !== 'object' || Array.isArray(sceneAssets.cards)) sceneAssets.cards = {};
    sceneAssets.cards[key] = cards[legacyKey];
    delete sceneAssets.cards[legacyKey];
    return true;
}

// 读路径不改入参（存储里的配置是共享只读的）：旧头像名分卡只在视图里挪，真正迁移由设置草稿 / 写路径完成。
export function sceneAssetsForContext(sceneAssets, ctx) {
    const scope = resolveAssetScope(ctx);
    const cards = sceneAssets && plain(sceneAssets.cards);
    if (cards && scope.legacyKey && cards[scope.legacyKey] && scope.key && scope.key !== scope.legacyKey && !libraryHasContent(cards[scope.key])) {
        const view = { ...sceneAssets, cards: { ...cards } };
        relocateLegacyCard(view, scope.key, scope.legacyKey);
        return effectiveSceneAssets(view, scope.key);
    }
    return effectiveSceneAssets(sceneAssets, scope.key);
}

export function emptyCardLibrary() {
    return {
        scenes: {},
        characters: {},
        characterAliases: {},
        characterDna: {},
        characterOutfits: {},
        wardrobe: {},
        eventCgs: {},
        generated: { scenes: {}, characters: {}, characterAliases: {}, expressionNotes: {} },
        statusAvatars: {},
    };
}

export function ensureCardLibrary(sceneAssets, scopeKey) {
    const root = plain(sceneAssets);
    const key = String(scopeKey || '');
    if (!key) return root;
    if (!root.cards || typeof root.cards !== 'object' || Array.isArray(root.cards)) root.cards = {};
    if (!root.cards[key] || typeof root.cards[key] !== 'object' || Array.isArray(root.cards[key])) {
        root.cards[key] = emptyCardLibrary();
    }
    return root.cards[key];
}

// 按顺序叠成一个新对象，后面的同名盖前面的。
function stack(sources) {
    const out = {};
    for (const source of sources) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
        for (const name in source) if (Object.prototype.hasOwnProperty.call(source, name)) out[name] = source[name];
    }
    return out;
}

// 读路径用的合并结果。不带 cards，避免下游再扫到别的角色卡。本卡盖在全局上，不借用别的卡。
export function effectiveSceneAssets(sceneAssets, scopeKey) {
    if (!sceneAssets || typeof sceneAssets !== 'object') return sceneAssets || null;
    const { cards, ...rest } = sceneAssets;
    const key = String(scopeKey || '');
    if (!key) return rest;
    const found = cards && typeof cards === 'object' ? cards[key] : null;
    const card = found && typeof found === 'object' && !Array.isArray(found) ? found : {};
    const over = (field) => stack([rest[field], card[field]]);
    const generated = plain(rest.generated);
    const cardGenerated = plain(card.generated);
    return {
        ...rest,
        ...(ownedWorldview(card) || {}),
        ...(ownedDialogSkin(card) || {}),
        scenes: over('scenes'),
        characters: over('characters'),
        characterAliases: over('characterAliases'),
        characterDna: over('characterDna'),
        characterOutfits: over('characterOutfits'),
        wardrobe: over('wardrobe'),
        eventCgs: over('eventCgs'),
        statusAvatars: over('statusAvatars'),
        generated: {
            scenes: stack([generated.scenes, cardGenerated.scenes]),
            characters: stack([generated.characters, cardGenerated.characters]),
            characterAliases: stack([generated.characterAliases, cardGenerated.characterAliases]),
            expressionNotes: stack([generated.expressionNotes, cardGenerated.expressionNotes]),
        },
    };
}

export function normalizeAssetCards(sceneAssets) {
    if (!sceneAssets || typeof sceneAssets !== 'object') return sceneAssets;
    const cards = plain(sceneAssets.cards);
    const out = {};
    for (const [key, value] of Object.entries(cards)) {
        const name = String(key || '').trim();
        if (!name || !plain(value)) continue;
        const card = plain(value);
        out[name] = {
            scenes: plain(card.scenes),
            characters: plain(card.characters),
            characterAliases: plain(card.characterAliases),
            characterDna: plain(card.characterDna),
            characterOutfits: plain(card.characterOutfits),
            wardrobe: plain(card.wardrobe),
            eventCgs: plain(card.eventCgs),
            generated: {
                scenes: plain(plain(card.generated).scenes),
                characters: plain(plain(card.generated).characters),
                characterAliases: plain(plain(card.generated).characterAliases),
                expressionNotes: plain(plain(card.generated).expressionNotes),
            },
            statusAvatars: plain(card.statusAvatars),
            ...(ownedWorldview(card) || {}),
            ...(ownedDialogSkin(card) || {}),
        };
    }
    sceneAssets.cards = out;
    return sceneAssets;
}

const cloneEntry = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);

function moveKey(from, to, collection, name, copy = false) {
    const source = plain(from[collection]);
    if (!Object.prototype.hasOwnProperty.call(source, name)) return;
    to[collection] = { ...plain(to[collection]), [name]: copy ? cloneEntry(source[name]) : source[name] };
    if (copy) return;
    const rest = { ...source };
    delete rest[name];
    from[collection] = rest;
}

function moveGeneratedName(from, to, group, name, copy = false) {
    const fromGenerated = plain(from.generated);
    const source = plain(fromGenerated[group]);
    if (!Object.prototype.hasOwnProperty.call(source, name)) return;
    const toGenerated = plain(to.generated);
    to.generated = {
        ...toGenerated,
        [group]: { ...plain(toGenerated[group]), [name]: copy ? cloneEntry(source[name]) : source[name] },
    };
    if (copy) return;
    const rest = { ...source };
    delete rest[name];
    from.generated = { ...fromGenerated, [group]: rest };
}

// 把一条场景、角色或衣柜从全局挪到当前角色卡，或反向挪回。角色会连同别名、DNA、服装和生成图一起走。
// copy：不挪走，复制一份（给这张卡单独做一版同名角色 / 衣服时用）。
export function moveLibraryEntry(sceneAssets, fromKey, toKey, collection, name, { copy = false } = {}) {
    const allowed = new Set(['scenes', 'characters', 'wardrobe']);
    const label = String(name || '').trim();
    if (!sceneAssets || !allowed.has(collection) || !label || String(fromKey || '') === String(toKey || '')) {
        return { ok: false, reason: 'bad-move' };
    }
    const from = fromKey ? ensureCardLibrary(sceneAssets, fromKey) : sceneAssets;
    const to = toKey ? ensureCardLibrary(sceneAssets, toKey) : sceneAssets;
    if (!Object.prototype.hasOwnProperty.call(plain(from[collection]), label)) return { ok: false, reason: 'missing' };
    moveKey(from, to, collection, label, copy);
    if (collection === 'characters') {
        for (const extra of ['characterAliases', 'characterDna', 'characterOutfits', 'statusAvatars']) {
            moveKey(from, to, extra, label, copy);
        }
        moveGeneratedName(from, to, 'characters', label, copy);
        moveGeneratedName(from, to, 'characterAliases', label, copy);
        moveGeneratedName(from, to, 'expressionNotes', label, copy);
    }
    if (collection === 'scenes') moveGeneratedName(from, to, 'scenes', label, copy);
    return { ok: true };
}

export function rememberAssetScope(settingsState, ctx) {
    const scope = resolveAssetScope(ctx);
    const bridge = settingsState && settingsState.draft && settingsState.draft.bridge;
    if (bridge && bridge.sceneAssets) relocateLegacyCard(bridge.sceneAssets, scope.key, scope.legacyKey);
    const asyncState = settingsState.asyncState = settingsState.asyncState || {};
    asyncState.assetScopeKey = scope.key;
    asyncState.assetScopeLabel = scope.label;
    asyncState.assetScopeKind = scope.kind;
    return asyncState;
}

function holds(library, collection, name) {
    const lib = plain(library);
    const [field, group] = String(collection || '').split('.');
    const bucket = group ? plain(plain(lib[field])[group]) : plain(lib[field]);
    return Object.prototype.hasOwnProperty.call(bucket, name);
}

// 设置页显示合并后的一份：本卡和全局混在一起，同名时本卡优先。
// 改一条素材要写回它所在的那一边：本卡有就写本卡，只有全局有就写全局，都没有（新建）时进本卡。
// 别的卡里的同名条目不参与。collections 可给多个字段，任一字段里有这个名字就算归属。返回 '' 表示全局。
export function assetOwnerKey(sceneAssets, cardKey, collections, name) {
    const key = String(cardKey || '');
    if (!key) return '';
    const label = String(name == null ? '' : name);
    const list = (Array.isArray(collections) ? collections : [collections]).filter(Boolean);
    if (!label || !list.length) return key;
    const card = plain(plain(plain(sceneAssets).cards)[key]);
    if (list.some((field) => holds(card, field, label))) return key;
    if (list.some((field) => holds(sceneAssets, field, label))) return '';
    return key;
}

// 本卡和全局都有同名条目：显示的是本卡那份，全局那份在这张卡里不生效。
export function assetShadowsGlobal(sceneAssets, cardKey, collection, name) {
    const key = String(cardKey || '');
    if (!key) return false;
    const card = plain(plain(plain(sceneAssets).cards)[key]);
    return holds(card, collection, String(name)) && holds(sceneAssets, collection, String(name));
}

// 设置里要改的那一份。target = { collections, name } 指明改的是哪一条；不给时按新建处理，打开了角色卡就进本卡。
export function draftAssetLibrary(settingsState, target) {
    const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
    const root = bridge.sceneAssets = bridge.sceneAssets || {};
    const asyncState = settingsState.asyncState || {};
    const cardKey = String(asyncState.assetScopeKey || '');
    if (!cardKey) return root;
    const owner = target ? assetOwnerKey(root, cardKey, target.collections, target.name) : cardKey;
    return owner ? ensureCardLibrary(root, owner) : root;
}

// 设置页读用的合并视图。没打开角色卡时就是全局本身。
export function draftEffectiveAssets(settingsState) {
    const bridge = (settingsState && settingsState.draft && settingsState.draft.bridge) || {};
    const root = bridge.sceneAssets || {};
    const cardKey = String((settingsState && settingsState.asyncState && settingsState.asyncState.assetScopeKey) || '');
    return cardKey ? effectiveSceneAssets(root, cardKey) : root;
}
