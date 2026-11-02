// 只读接口：IGS.api.characters（角色外貌 DNA、衣装）。
// 读取器由外部注入：readAssets 取素材库，readContext 取酒馆上下文（定位当前卡、读聊天记录），
// readClues 可选，读数据库穿戴线索。
// 读的是本卡生效视图（全局 + 本卡合并），与 IGS 出图时一致；绝不写入任何存储。
// 任何异常、未初始化、名字为空都返回 null，不抛错；返回值是深拷贝，调用方随便改。
// 只在被调用时计算，不监听、不缓存。接口只增不破：CHARACTER_API_VERSION 往后只升不降。
import { sceneAssetsForContext } from '../scene/asset-scope.js';
import { buildCharacterContext } from '../scene/character-identity.js';
import { resolveCharacterDna } from '../scene/character-dna.js';
import { collectLatestOutfits, createOutfitResolver, normalizeCharacterOutfits, outfitsOfCharacter, resolveSpriteOutfit } from '../scene/character-outfits.js';
import { classifySceneKey, extractSceneDirectives, resolveLatestSceneDirective } from '../scene/scene-directives.js';
import { getMessagePrimaryText } from '../scene/message-source.js';
import { chatMessageFlags, isReadableTurn, isTurnCandidate } from '../host/tavern-helper-adapter.js';

export const CHARACTER_API_VERSION = 2;

// 与阅读器一致：场景最多向前追溯 3 个 AI 楼。
const INHERITED_SCENE_MAX_FLOORS = 3;

const hasSubject = (dna) => Object.values(dna?.views || {}).some((view) => typeof view?.subject === 'string' && view.subject.trim());
// 楼层判定复用阅读器口径：当前楼 = 最新一条非用户、非系统、未隐藏的楼；
// 跨楼继承按阅读器翻楼列表，被 /hide 的 AI 楼照样计入，旁白、注释、用户楼跳过。
const isCurrentFloor = (m, i) => isTurnCandidate(chatMessageFlags(m, i));
const isInheritFloor = (m, i) => isReadableTurn(chatMessageFlags(m, i));

function readView(readAssets, readContext) {
    if (typeof readAssets !== 'function' || typeof readContext !== 'function') return null;
    const source = readAssets();
    if (!source || typeof source !== 'object') return null;
    const context = readContext();
    // 与阅读器同一条读路径：不改入参，结果共享只读，这里也不得原地修改。
    const effective = sceneAssetsForContext(source, context);
    return effective ? { effective, context } : null;
}

// 正文最新 AI 楼文末的衣装，判定同阅读器立绘；未登记、描述为空都算没有。
function currentOutfit(assets, characterKey, chat, readClues) {
    if (!Array.isArray(chat)) return null;
    const { key, outfits } = outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, characterKey);
    if (!key || !Object.keys(outfits).length) return null;
    let latest = chat.length - 1;
    while (latest >= 0 && !isCurrentFloor(chat[latest], latest)) latest -= 1;
    if (latest < 0) return null;
    const outfitResolver = createOutfitResolver(assets);
    const directivesOf = (m) => extractSceneDirectives(getMessagePrimaryText(m), { outfitResolver }).directives;
    // 继承用规范化后的衣装表，同阅读器 resolveInheritedOutfits。
    const normalized = normalizeCharacterOutfits(assets.characterOutfits);
    const inheritAssets = { ...assets, characterOutfits: normalized };
    const inheritResolver = createOutfitResolver(inheritAssets);
    const resolveKey = (name) => outfitsOfCharacter(normalized, assets.characterAliases, name).key || name;
    const directives = directivesOf(chat[latest]);
    // 跨楼继承：向前逐楼取最近写过的衣装（同 resolveInheritedOutfits），只找到本角色为止。
    const inheritedOutfits = {};
    let inheritedScene = null;
    let sceneDepth = 0;
    for (let i = latest - 1; i >= 0; i -= 1) {
        if (!isInheritFloor(chat[i], i)) continue;
        const text = getMessagePrimaryText(chat[i]);
        const previous = extractSceneDirectives(text, { outfitResolver: inheritResolver }).directives;
        for (const [k, v] of Object.entries(collectLatestOutfits(previous, resolveKey))) {
            if (!Object.hasOwn(inheritedOutfits, k)) inheritedOutfits[k] = v;
        }
        if (!inheritedScene && sceneDepth < INHERITED_SCENE_MAX_FLOORS) {
            sceneDepth += 1;
            inheritedScene = resolveLatestSceneDirective(previous);
        }
        if (Object.hasOwn(inheritedOutfits, key) && (inheritedScene || sceneDepth >= INHERITED_SCENE_MAX_FLOORS)) break;
    }
    const sceneRaw = String((resolveLatestSceneDirective(directives) || inheritedScene)?.scene || '').trim();
    // 同一次调用里线索只读一次。
    const clueMemo = new Map();
    const clues = (names) => {
        const memoKey = JSON.stringify(names);
        if (!clueMemo.has(memoKey)) clueMemo.set(memoKey, typeof readClues === 'function' ? readClues(names) : null);
        return clueMemo.get(memoKey);
    };
    const options = { directives, offset: Infinity, inheritedOutfits, readClues: clues,
        resolveDna: (name) => resolveCharacterDna(assets.characterDna, name)?.dna || null,
        scene: [classifySceneKey(assets.scenes, sceneRaw).key || '', sceneRaw] };
    const trace = resolveSpriteOutfit({ ...options, character: key, sceneAssets: assets });
    if (!trace.outfit || trace.reason === 'outfit-unregistered' || !Object.hasOwn(outfits, trace.outfit)) return null;
    const outfit = buildCharacterContext([key], assets, options)[0]?.outfit;
    if (!outfit || outfit.name !== trace.outfit || !String(outfit.description || '').trim()) return null;
    return outfit;
}

export function createCharactersApi({ readAssets, readContext, readClues } = {}) {
    return {
        version: CHARACTER_API_VERSION,
        // 返回 { name, dna } 或 null；name 是别名解析后的规范名。
        // options.isUser 为 true 时忽略 name，取当前卡的 User 角色（没设返回 null）。
        dna(name, { isUser = false } = {}) {
            try {
                const view = readView(readAssets, readContext);
                if (!view) return null;
                const { effective } = view;
                const requested = String(isUser ? effective.userCharacter || '' : name ?? '').trim();
                if (!requested) return null;
                const character = buildCharacterContext([requested], effective)[0];
                if (!character || !hasSubject(character.dna)) return null;
                return { name: character.characterKey, dna: structuredClone(character.dna) };
            } catch {
                return null;
            }
        },
        // 返回 { name, outfit: { name, description }, source } 或 null。
        // source：'current' 正文最新楼的当前衣装；'default' 默认衣装（本卡隐藏时取顶替那套）。
        outfit(name, { isUser = false } = {}) {
            try {
                const view = readView(readAssets, readContext);
                if (!view) return null;
                const { effective, context } = view;
                const requested = String(isUser ? effective.userCharacter || '' : name ?? '').trim();
                if (!requested) return null;
                const character = buildCharacterContext([requested], effective)[0];
                if (!character) return null;
                const current = currentOutfit(effective, character.characterKey, context?.chat, readClues);
                const picked = current ? { outfit: current, source: 'current' }
                    : String(character.outfit?.description || '').trim() ? { outfit: character.outfit, source: 'default' } : null;
                if (!picked) return null;
                return { name: character.characterKey,
                    outfit: { name: String(picked.outfit.name || ''), description: String(picked.outfit.description).trim() },
                    source: picked.source };
            } catch {
                return null;
            }
        },
    };
}
