import { resolveCharacterLive2dBinding } from './live2d-config.js';
import { resolveSpriteAsset, resolveBackgroundAsset, resolveNudeSpriteAsset, isNonSpriteSpeaker, tempAssetKeyOf } from '../../scene/asset-match.js';
import { resolveSpriteOutfit, outfitsOfCharacter, outfitAllowsScene } from '../../scene/character-outfits.js';
import { resolveCharacterDna } from '../../scene/character-dna.js';
import { classifySceneKey } from '../../scene/scene-directives.js';
import { createCastLeftTracker, otherNamesOf, namesOf, NARRATION_HOLD_PAGES } from '../../scene/narration-sprite.js';
import { STAGE_CAST_SCAN_LIMIT } from '../../scene/stage-cast.js';
import { normalizeStageCastSettings } from './stage-direction-settings.js';
import { isSystemRole } from './system-role.js';
import { lastBefore } from './reader-floor-plan.js';
import { resolveReaderSpriteAsset } from './reader-sprite-asset.js';

// 页计划里的只有引用和命中结果。图像字节及 blob 生命周期仍属于中央媒体缓存。
function createAssetLookup(initialContext) {
    let context = initialContext;
    const entries = new Map();
    const dirty = new Map();
    const updated = new Map();
    function resolve(kind, args) {
        // 整楼预处理也必须在匹配静态图前分流，而非等渲染时再隐藏。
        if (kind === 'sprite' && resolveCharacterLive2dBinding(context.live2dConfig, context.sceneAssets, args[0], args[1])) {
            return { url: '', source: 'live2d', character: args[0] };
        }
        const key = JSON.stringify([kind, ...args]);
        const cached = entries.get(key);
        if (cached && (!cached.retryAt || Date.now() < cached.retryAt)) return cached.hit;
        const dependencies = new Set();
        const temporaryKeys = new Set(), backgroundPrefixes = new Set();
        let retryMs = 0;
        const probe = (fn, ms) => typeof fn === 'function' ? url => {
            dependencies.add(url);
            const failed = fn(url);
            if (failed) retryMs = Math.max(retryMs, ms);
            return failed;
        } : undefined;
        const temporary = (fn, type) => typeof fn === 'function' ? (name, time) => {
            const key = tempAssetKeyOf(context.chatId || '', { type, name, time: type === 'background' ? '' : time });
            (type === 'background' ? backgroundPrefixes : temporaryKeys).add(key);
            return fn(name, time);
        } : undefined;
        const ctx = { ...context,
            isMissingImage: probe(context.isMissingImage, 30000),
            isUnavailableImage: probe(context.isUnavailableImage, 1500),
            tempSprite: temporary(context.tempSprite, 'sprite'),
            tempSpriteForOutfit: temporary(context.tempSpriteForOutfit, 'sprite'),
            tempBackground: temporary(context.tempBackground, 'background'),
            tempSceneTime: temporary(context.tempSceneTime, 'background') };
        const hit = kind === 'sprite' ? resolveReaderSpriteAsset(args[0], args[1], ctx, args[2])
            : kind === 'nude' ? resolveNudeSpriteAsset(args[0], args[1], ctx)
                : resolveBackgroundAsset(args[0], ctx);
        if (hit.url) dependencies.add(hit.url);
        entries.set(key, { kind, args, hit, dependencies, temporaryKeys, backgroundPrefixes, retryAt: retryMs ? Date.now() + retryMs : 0 });
        if (hit.url && hit.url !== cached?.hit.url) updated.set(key, hit.url);
        return hit;
    }
    function invalidate(detail) {
        if (detail?.chatId != null && String(detail.chatId) !== String(context.chatId || '')) return;
        const id = detail?.imageId;
        const ref = id ? `igs-gen:${id}` : '';
        for (const [key, entry] of entries) {
            if (detail?.key && !entry.temporaryKeys.has(detail.key)
                && ![...entry.backgroundPrefixes].some(prefix => detail.key.startsWith(prefix))) continue;
            if (ref ? !entry.dependencies.has(ref) : detail?.reason === 'image-retry-ready' && !entry.retryAt) continue;
            dirty.set(key, entry);
            entries.delete(key);
        }
    }
    return { sprite: (name, mood = '', outfit = '') => resolve('sprite', [name, mood || '', outfit || '']),
        nude: (name, mood = '') => resolve('nude', [name, mood]),
        background: state => resolve('background', [{ scene: state.scene, time: state.time || '', weather: state.weather || '', nsfw: state.nsfw === true }]),
        updateContext(ctx) {
            context = ctx;
            const pending = [...dirty.values()]; dirty.clear();
            for (const entry of pending) resolve(entry.kind, entry.args);
        }, invalidate,
        takeUpdatedUrls() { const values = [...new Set(updated.values())]; updated.clear(); return values; },
        get urls() { return [...new Set([...entries.values()].map(entry => entry.hit.url).filter(Boolean))]; } };
}

// 临时座位排在开过口的人右侧，座位号只用于排序。
const TEMP_SEAT_ORDER = 1000;

// 名单、最近台词和换装时间线各建一次，按偏移取，避免每页回扫整楼。
function prepareStageIndex(floor, settings) {
    const cast = normalizeStageCastSettings(settings.stageCast);
    const members = new Map(), speeches = new Map(), outfits = new Map(), stages = [];
    let order = 0;
    const castable = name => cast.enabled && !isNonSpriteSpeaker(name) && !isSystemRole(name, settings.systemRole);
    for (const d of floor.outfitDirectives) {
        // 换场景：只带走判定跟过来的人（与主立绘同一判定），座位先后照旧；标签写了在场名单时名单里的人上场，
        // 名单超过座位时上一场景在台上的人优先，其次按名单顺序。仅凭同行 / 集体主语带过来的标 soft，没被写到就衰减。
        if (d.type === 'scene') {
            const reasons = new Map(typeof floor.carryOf === 'function' ? [...members.keys()].map(key => [key, floor.carryOf(d, key)]) : []);
            const kept = [...members.values()].filter(m => reasons.get(m.character));
            const rank = [...kept].sort((a, b) => a.order - b.order);
            const fresh = (typeof floor.presentOf === 'function' ? floor.presentOf(d) : []).filter(key => !members.has(key) && castable(key))
                .map((key, index) => ({ character: key, mood: '', order: kept.length + index, at: Number(d.offset) }));
            members.clear();
            for (const m of [...fresh].reverse()) members.set(m.character, m);
            for (const m of kept) {
                const soft = reasons.get(m.character) === 'company' || reasons.get(m.character) === 'group';
                members.set(m.character, { ...m, order: rank.indexOf(m), ...(soft ? { soft: true } : {}) });
            }
            order = kept.length + fresh.length;
            while (members.size > STAGE_CAST_SCAN_LIMIT) members.delete(members.keys().next().value);
            stages.push({ offset: d.offset, members: [...members.values()].reverse() });
            continue;
        }
        if (d.type !== 'char' && d.type !== 'thought') continue;
        const key = floor.keyOf(d.character);
        if (!speeches.has(key)) speeches.set(key, []);
        speeches.get(key).push(d);
        if (d.outfit || d.unknownOutfit) {
            const outfitKey = outfitsOfCharacter(settings._sceneAssets?.characterOutfits, settings._sceneAssets?.characterAliases, d.character).key || d.character;
            if (!outfits.has(outfitKey)) outfits.set(outfitKey, []);
            outfits.get(outfitKey).push(d);
        }
        if (!castable(d.character)) continue;
        const previous = members.get(key);
        members.delete(key);
        // 开口即转为正式座位（去掉 soft），座位不变。
        members.set(key, { character: key, mood: String(d.mood || '').trim(), order: previous ? previous.order : order++, at: Number(d.offset) });
        if (members.size > STAGE_CAST_SCAN_LIMIT) members.delete(members.keys().next().value);
        stages.push({ offset: d.offset, members: [...members.values()].reverse() });
    }
    const reacts = new Map(), all = [];
    for (const d of floor.fxDirectives) {
        if (d.kind !== 'react' || !d.args?.[0]) continue;
        if (d.args[0] === '全员') all.push(d);
        else {
            const key = floor.keyOf(d.args[0]);
            if (!reacts.has(key)) reacts.set(key, []);
            reacts.get(key).push(d);
        }
    }
    floor.stageIndex = { stages, speeches, outfits };
    const castAliases = floor.castAliases || settings._sceneAssets?.characterAliases || {};
    const otherNames = otherNamesOf(floor.castCharacters || settings._sceneAssets?.characters, castAliases, '', [floor.userName]);
    const namesMemo = new Map();
    const writes = (key, text) => {
        if (!namesMemo.has(key)) namesMemo.set(key, namesOf(key, castAliases[key]));
        return namesMemo.get(key).some(n => String(text || '').includes(n));
    };
    // 同屏陪衬是否已被正文写走：每人一个增量判断，每页只喂新增的原文（他开口、或页序回退时重来）。
    const castLeft = new Map();
    const leftSince = (character, speech, offset, next) => {
        let state = castLeft.get(character);
        if (!state || state.speech !== speech || offset < state.upto) {
            const end = floor.source.indexOf('\n', speech.offset);
            const from = end < 0 ? speech.offset : end;
            // 她 / 他 离场交给旁白点名的指代消解（认领到的人记在 narrationDroppedKey），陪衬各自只认写了名字的离场。
            state = { speech, upto: from, tracker: createCastLeftTracker({ name: character, aliases: castAliases[character] || [], pronoun: false, self: floor.selfNames || [],
                others: otherNames.filter(n => n !== character) }) };
            castLeft.set(character, state);
        }
        const chunk = floor.source.slice(state.upto, offset);
        state.upto = Math.max(state.upto, offset);
        return state.tracker.feed(chunk, next);
    };
    // 临时座位：旁白点名 / 感知上台、本场景还没开口的人，焦点移走后留在原座，按旁白沿用规则衰减（隔 2 页须再被写到），开口即转正。
    // soft 陪衬（同行 / 集体主语带过来的）同样衰减；宽松档不标 soft，不衰减。
    const temps = new Map(), softSeen = new Map(), softGone = new Set();
    let tempOrder = TEMP_SEAT_ORDER, sceneMark;
    for (let i = 0; i < floor.pages.length; i++) {
        const page = floor.pages[i];
        const anchor = floor.latestSpeechByPage[i];
        page.outfitOffset = page.currentOffset >= 0 ? page.currentOffset
            : anchor ? floor.locator.locate(anchor.thought || anchor.dialogue) : -1;
        const offset = page.outfitOffset;
        const at = offset >= 0 ? offset : page.fxOffset;
        page.reactMoodOf = name => {
            if (!(at >= 0) || !cast.enabled || !cast.castReact) return '';
            const key = floor.keyOf(name);
            const own = lastBefore(reacts.get(key) || [], at), everyone = lastBefore(all, at);
            const pick = own && everyone ? (own.offset >= everyone.offset ? own : everyone) : own || everyone;
            const speech = lastBefore(speeches.get(key) || [], at);
            return pick && pick.offset > (speech?.offset ?? -1) ? String(pick.args[1] || '').trim() : '';
        };
        const gone = new Map();
        if (cast.castStage) for (const [name, goneAt] of Object.entries(page.fx.goneAt || {})) {
            const key = floor.keyOf(name);
            gone.set(key, Math.max(Number(goneAt), gone.get(key) ?? -1));
        }
        const sceneHere = floor.sceneOfPage ? floor.sceneOfPage[i] : null;
        if (i > 0 && sceneHere !== sceneMark) {
            for (const key of [...temps.keys()]) {
                if (sceneHere && typeof floor.carriesAcross === 'function' && floor.carriesAcross(sceneHere, key)) temps.get(key).seen = i - 1;
                else temps.delete(key);
            }
            softSeen.clear();
            softGone.clear();
        }
        sceneMark = sceneHere;
        const focus = page.spriteChar ? floor.keyOf(page.spriteChar) : '';
        // 判断离场的原文读到本页末尾：本页的「你 / 我」走开也当页作用于同屏陪衬。
        const nextAt = floor.offsets?.[i + 1];
        const pageEnd = offset >= 0 && page.currentOffset >= 0 ? Math.max(offset, nextAt > offset ? nextAt : i + 1 >= floor.pages.length ? floor.source.length : offset) : offset;
        const staged = !(offset >= 0) || !cast.enabled ? [] : (lastBefore(stages, offset)?.members || []).filter(m => {
            if (m.character === page.narrationDroppedKey || (gone.has(m.character) && m.at < gone.get(m.character))) return false;
            if (m.soft) {
                if (!softSeen.has(m.character)) softSeen.set(m.character, i - 1);
                if (m.character === focus || writes(m.character, page.segmentBody)) softSeen.set(m.character, i);
                if (softGone.has(m.character) || i - softSeen.get(m.character) > NARRATION_HOLD_PAGES) {
                    softGone.add(m.character);
                    return false;
                }
            }
            if (m.character === focus) return true;
            const speech = lastBefore(speeches.get(m.character) || [], offset);
            if (!speech) return true;
            return !leftSince(m.character, speech, pageEnd, floor.pages[i + 1]?.segmentBody);
        });
        const seated = new Set(staged.map(m => m.character));
        for (const [key, temp] of [...temps]) {
            if (seated.has(key) || key === page.narrationDroppedKey) { temps.delete(key); continue; }
            if (key === focus || writes(key, page.segmentBody)) temp.seen = i;
            if (i - temp.seen > NARRATION_HOLD_PAGES) temps.delete(key);
        }
        page.focusTemp = Boolean(cast.enabled && offset >= 0 && focus && page.textType === 'narration' && !seated.has(focus));
        if (page.focusTemp) {
            const temp = temps.get(focus) || { character: focus, order: tempOrder++ };
            temps.set(focus, { ...temp, mood: page.spriteMood || temp.mood || '', seen: i });
        }
        page.cast = !(offset >= 0) || !cast.enabled ? [] : [...staged,
            ...[...temps.values()].map(t => ({ character: t.character, mood: t.mood, order: t.order, temp: true }))];
    }
}

export function prepareReaderFloorAssets(floor, { payload, readerSettings, assetMatchCtx, tableData }) {
    const stageSettings = JSON.stringify(readerSettings.stageCast);
    const hudSettings = JSON.stringify([readerSettings.statusHud?.enabled, readerSettings.statusHud?.tables]);
    const strict = assetMatchCtx.strict === true;
    const live2dKey = JSON.stringify([readerSettings._live2d?.enabled, Object.keys(readerSettings._live2d?.bindings || {}), readerSettings._sceneAssets?.characterAliases]);
    if (floor.assets && floor.tablesRevision === tableData.revision && floor.stageSettings === stageSettings
        && floor.hudSettings === hudSettings && floor.matchStrict === strict && floor.live2dKey === live2dKey) {
        floor.assets.updateContext(assetMatchCtx);
        return floor.assets;
    }
    if (!floor.stageIndex || floor.stageSettings !== stageSettings) prepareStageIndex(floor, readerSettings);
    floor.stageSettings = stageSettings;
    floor.hudSettings = hudSettings;
    const sceneAssets = readerSettings._sceneAssets || {};
    if (readerSettings.statusHud?.enabled && readerSettings.statusHud.tables?.length) {
        const names = new Set(floor.sceneDirectives.filter(d => d.character).map(d => floor.keyOf(d.character)));
        if (floor.sceneSpeaker) names.add(floor.keyOf(floor.sceneSpeaker));
        tableData.prepareCharacters(names, readerSettings.statusHud.tables, sceneAssets.characterAliases);
    }
    // 关闭/移除绑定后允许静态图恢复；开启时不能留下旧静态命中的预加载 URL。
    const lookup = floor.live2dKey === live2dKey && floor.assets || createAssetLookup(assetMatchCtx);
    floor.live2dKey = live2dKey;
    if (floor.matchStrict !== strict) lookup.invalidate();
    floor.matchStrict = strict;
    lookup.updateContext(assetMatchCtx);
    const outfitCache = new Map();
    const scenes = floor.outfitDirectives.filter(d => d.type === 'scene');
    const inheritedOutfits = payload.inheritedOutfits;
    // 楼首换了场（地点或时段与上一楼不同）：本楼还没写到这人的衣服时，取同一场景里往后第一次写的；没换场沿用上一楼。
    const headScene = scenes[0] || null;
    const prevScene = floor.inheritedSceneState;
    const headChanged = Boolean(headScene && (!prevScene
        || String(headScene.scene || '').trim() !== String(prevScene.scene || '').trim()
        || String(headScene.time || '').trim() !== String(prevScene.time || '').trim()));
    const headSceneEnd = scenes[1] ? scenes[1].offset : Infinity;
    const noDefaultSprite = new Map();
    const defaultEmpty = name => {
        if (!noDefaultSprite.has(name)) noDefaultSprite.set(name, !lookup.sprite(name).url);
        return noDefaultSprite.get(name);
    };
    function outfitFor(index, character) {
        const page = floor.pages[index];
        const { key: found, outfits } = outfitsOfCharacter(sceneAssets.characterOutfits, sceneAssets.characterAliases, character);
        const key = found || character;
        const tags = floor.stageIndex.outfits.get(key) || [];
        let tag = lastBefore(tags, page.outfitOffset);
        const scene = lastBefore(scenes, page.outfitOffset);
        // 默认立绘是空的：楼首没换场也往后取同场景第一次写的衣服，免得落到空的原装上。
        const ahead = !tag && scene === headScene && (headChanged || (found && defaultEmpty(character)))
            ? tags.find(d => d.offset >= (headScene?.offset ?? 0) && d.offset < headSceneEnd) || null : null;
        if (ahead) tag = ahead;
        const cacheKey = JSON.stringify([key, tag?.offset ?? -1, scene?.offset ?? -1]);
        if (!outfitCache.has(cacheKey)) {
            const rawScene = String(page.sceneStateForBg?.scene || '').trim();
            const sceneNames = [classifySceneKey(sceneAssets.scenes, rawScene).key || '', rawScene];
            let resolved = resolveSpriteOutfit({ directives: [scene, tag].filter(Boolean), character,
                offset: ahead ? ahead.offset : page.outfitOffset, inheritedOutfits, sceneAssets,
                scene: sceneNames,
                readClues: tableData.outfitClues,
                resolveDna: name => resolveCharacterDna(sceneAssets.characterDna, name)?.dna || null });
            // 仍落空就从衣柜挑一套适用本场景的，有图的优先，没图的也照选。
            if (!resolved.outfit && resolved.source !== 'reset' && found && defaultEmpty(character)) {
                const names = Object.keys(outfits).filter(name => outfitAllowsScene(outfits[name], sceneNames));
                const hasArt = name => Object.values(outfits[name]?.moods || {}).some(v => String(v || '').trim()) || String(outfits[name]?.base || '').trim();
                const pick = names.find(hasArt) || names[0];
                if (pick) resolved = { outfit: pick, source: 'wardrobe', reason: 'no-default-sprite' };
            }
            outfitCache.set(cacheKey, resolved);
        }
        return outfitCache.get(cacheKey);
    }
    lookup.outfitFor = outfitFor;
    floor.assets = lookup;
    // 整楼需求先匹配好，缺图/恢复时只使相关命中失效，在用到它的页上精准补齐。
    if (sceneAssets.enabled) {
        if (floor.inheritedSceneState) lookup.background(floor.inheritedSceneState);
        for (let i = 0; i < floor.pages.length; i++) {
            const page = floor.pages[i];
            if (page.sceneStateForBg) lookup.background(page.sceneStateForBg);
            const people = [{ character: page.spriteChar, mood: page.spriteMood }, ...page.cast];
            for (const person of people) {
                if (!person.character) continue;
                const outfit = outfitFor(i, person.character).outfit;
                lookup.sprite(person.character, person.mood, outfit);
                const react = page.reactMoodOf(person.character);
                if (react) lookup.sprite(person.character, react, outfit);
                if (page.fx.poses?.[person.character]?.back) lookup.sprite(person.character, '背影', outfit);
            }
            if (page.sceneStateForBg?.nsfw && page.bubbleSpeaker) lookup.nude(page.bubbleSpeaker, page.bubbleMood);
            if (page.fx.battle?.foe) lookup.sprite(page.fx.battle.foe);
        }
    }
    floor.tablesRevision = tableData.revision;
    return lookup;
}
