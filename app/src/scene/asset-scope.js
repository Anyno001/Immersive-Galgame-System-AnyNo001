// 场景、角色、衣柜、生成库按角色卡分开。根上的同名字段是全局兜底：
// 当前角色卡里没有这个名字时才用全局，卡里有同名条目时以卡为准。

const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const LIBRARY_FIELDS = ['scenes', 'characters', 'characterAliases', 'characterDna', 'characterOutfits', 'wardrobe', 'statusAvatars'];

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
    return patch;
}

export function libraryHasContent(card) {
    const lib = plain(card);
    if (ownedWorldview(lib)) return true;
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

export function sceneAssetsForContext(sceneAssets, ctx) {
    const scope = resolveAssetScope(ctx);
    relocateLegacyCard(sceneAssets, scope.key, scope.legacyKey);
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

function mergeGenerated(globalGenerated, cardGenerated) {
    const globalLibrary = plain(globalGenerated);
    const cardLibrary = plain(cardGenerated);
    return {
        scenes: { ...plain(globalLibrary.scenes), ...plain(cardLibrary.scenes) },
        characters: { ...plain(globalLibrary.characters), ...plain(cardLibrary.characters) },
        characterAliases: { ...plain(globalLibrary.characterAliases), ...plain(cardLibrary.characterAliases) },
        expressionNotes: { ...plain(globalLibrary.expressionNotes), ...plain(cardLibrary.expressionNotes) },
    };
}

// 读路径用的合并结果。不带 cards，避免下游再扫到别的角色卡。
export function effectiveSceneAssets(sceneAssets, scopeKey) {
    if (!sceneAssets || typeof sceneAssets !== 'object') return sceneAssets || null;
    const { cards, ...rest } = sceneAssets;
    const key = String(scopeKey || '');
    const card = key && cards && typeof cards === 'object' ? cards[key] : null;
    if (!card || typeof card !== 'object') return rest;
    const worldview = ownedWorldview(card);
    return {
        ...rest,
        ...(worldview || {}),
        scenes: { ...plain(rest.scenes), ...plain(card.scenes) },
        characters: { ...plain(rest.characters), ...plain(card.characters) },
        characterAliases: { ...plain(rest.characterAliases), ...plain(card.characterAliases) },
        characterDna: { ...plain(rest.characterDna), ...plain(card.characterDna) },
        characterOutfits: { ...plain(rest.characterOutfits), ...plain(card.characterOutfits) },
        wardrobe: { ...plain(rest.wardrobe), ...plain(card.wardrobe) },
        statusAvatars: { ...plain(rest.statusAvatars), ...plain(card.statusAvatars) },
        generated: mergeGenerated(rest.generated, card.generated),
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
            generated: {
                scenes: plain(plain(card.generated).scenes),
                characters: plain(plain(card.generated).characters),
                characterAliases: plain(plain(card.generated).characterAliases),
                expressionNotes: plain(plain(card.generated).expressionNotes),
            },
            statusAvatars: plain(card.statusAvatars),
            ...(ownedWorldview(card) || {}),
        };
    }
    sceneAssets.cards = out;
    return sceneAssets;
}

function moveKey(from, to, collection, name) {
    const source = plain(from[collection]);
    if (!Object.prototype.hasOwnProperty.call(source, name)) return;
    to[collection] = { ...plain(to[collection]), [name]: source[name] };
    const rest = { ...source };
    delete rest[name];
    from[collection] = rest;
}

function moveGeneratedName(from, to, group, name) {
    const fromGenerated = plain(from.generated);
    const source = plain(fromGenerated[group]);
    if (!Object.prototype.hasOwnProperty.call(source, name)) return;
    const toGenerated = plain(to.generated);
    to.generated = {
        ...toGenerated,
        [group]: { ...plain(toGenerated[group]), [name]: source[name] },
    };
    const rest = { ...source };
    delete rest[name];
    from.generated = { ...fromGenerated, [group]: rest };
}

// 把一条场景、角色或衣柜从全局挪到当前角色卡，或反向挪回。角色会连同别名、DNA、服装和生成图一起走。
export function moveLibraryEntry(sceneAssets, fromKey, toKey, collection, name) {
    const allowed = new Set(['scenes', 'characters', 'wardrobe']);
    const label = String(name || '').trim();
    if (!sceneAssets || !allowed.has(collection) || !label || String(fromKey || '') === String(toKey || '')) {
        return { ok: false, reason: 'bad-move' };
    }
    const from = fromKey ? ensureCardLibrary(sceneAssets, fromKey) : sceneAssets;
    const to = toKey ? ensureCardLibrary(sceneAssets, toKey) : sceneAssets;
    if (!Object.prototype.hasOwnProperty.call(plain(from[collection]), label)) return { ok: false, reason: 'missing' };
    moveKey(from, to, collection, label);
    if (collection === 'characters') {
        for (const extra of ['characterAliases', 'characterDna', 'characterOutfits', 'statusAvatars']) {
            moveKey(from, to, extra, label);
        }
        moveGeneratedName(from, to, 'characters', label);
        moveGeneratedName(from, to, 'characterAliases', label);
        moveGeneratedName(from, to, 'expressionNotes', label);
    }
    if (collection === 'scenes') moveGeneratedName(from, to, 'scenes', label);
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
    if (asyncState.assetScopeMode !== 'global' && asyncState.assetScopeMode !== 'card') {
        asyncState.assetScopeMode = scope.key ? 'card' : 'global';
    }
    if (!scope.key) asyncState.assetScopeMode = 'global';
    return asyncState;
}

// 设置里正在编辑的那一份。全局模式写根上的库，角色卡模式写 cards[key]。
export function draftAssetLibrary(settingsState) {
    const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
    const root = bridge.sceneAssets = bridge.sceneAssets || {};
    const asyncState = settingsState.asyncState || {};
    const key = asyncState.assetScopeMode === 'card' ? String(asyncState.assetScopeKey || '') : '';
    return key ? ensureCardLibrary(root, key) : root;
}
