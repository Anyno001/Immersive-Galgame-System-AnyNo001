import { extractSceneDirectives } from '../../scene/scene-directives.js';
import {
    OUTFIT_RESET,
    collectLatestOutfits,
    createOutfitResolver,
    outfitAllowsScene,
    outfitsOfCharacter,
    resolveWardrobePrompt,
} from '../../scene/character-outfits.js';
import { numberParagraphs } from './marker-placer.js';

const INHERITED_FLOORS = 3;

function paragraphNoForLine(paragraphs, lineIndex) {
    const list = Array.isArray(paragraphs) ? paragraphs : [];
    let hit = 0;
    for (const paragraph of list) {
        if (paragraph.lineIndex <= lineIndex) hit = paragraph.no;
        else if (!hit) return paragraph.no;
        else break;
    }
    return hit || 1;
}

function lastSceneName(directives) {
    let scene = '';
    for (const directive of Array.isArray(directives) ? directives : []) {
        if (directive && directive.type === 'scene' && directive.scene) scene = directive.scene;
    }
    return scene;
}

// 较近的楼优先，和阅读器跨楼继承同一窗口。
function inheritedOutfitMap(previousTexts, sceneAssets, resolver, resolveKey) {
    const texts = (Array.isArray(previousTexts) ? previousTexts : []).slice(-INHERITED_FLOORS);
    const result = {};
    for (let index = texts.length - 1; index >= 0; index -= 1) {
        const latest = collectLatestOutfits(
            extractSceneDirectives(texts[index], { outfitResolver: resolver }).directives,
            resolveKey,
        );
        for (const [key, value] of Object.entries(latest)) {
            if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
        }
    }
    return result;
}

function describeOutfit(sceneAssets, characterKey, outfitName, scene, inherited) {
    if (!outfitName || outfitName === OUTFIT_RESET) return null;
    const { outfits } = outfitsOfCharacter(sceneAssets.characterOutfits, sceneAssets.characterAliases, characterKey);
    const entry = outfits[outfitName];
    if (!entry) return null;
    if (inherited && !outfitAllowsScene(entry, scene)) return null;
    const wardrobe = resolveWardrobePrompt(sceneAssets.wardrobe, entry, outfitName);
    const prompt = wardrobe && wardrobe.prompt ? String(wardrobe.prompt).replace(/\s*\n\s*/g, ' ').trim() : '';
    return { outfit: outfitName, prompt, reset: false };
}

// 这一楼每个出场角色今天穿的那一套，加上衣柜里的提示词。
// 本楼写了服装就从那一段算起；本楼没写就用前几楼继承来的。没有登记服装的角色不列。
export function summarizeFloorOutfits(characters, sceneAssets, { floorText = '', previousTexts = [] } = {}) {
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    if (!assets.characterOutfits || typeof assets.characterOutfits !== 'object') return [];
    const resolver = createOutfitResolver(assets);
    const resolveKey = (name) => outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, name).key || String(name || '').trim();
    const source = String(floorText || '');
    const directives = extractSceneDirectives(source, { outfitResolver: resolver }).directives;
    const paragraphs = numberParagraphs(source).paragraphs;
    const scene = lastSceneName(directives);
    const inherited = inheritedOutfitMap(previousTexts, assets, resolver, resolveKey);
    const seen = new Set();
    const out = [];
    for (const rawName of Array.isArray(characters) ? characters : []) {
        const key = resolveKey(rawName);
        if (!key || seen.has(key)) continue;
        const { outfits } = outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, rawName);
        if (!Object.keys(outfits).length) continue;
        seen.add(key);
        const segments = [];
        const opening = describeOutfit(assets, key, inherited[key], scene, true);
        if (opening) segments.push({ from: 0, ...opening });
        for (const directive of directives) {
            if (!directive || (directive.type !== 'char' && directive.type !== 'thought') || !directive.outfit) continue;
            if (resolveKey(directive.character) !== key) continue;
            const from = paragraphNoForLine(paragraphs, directive.lineIndex);
            if (directive.outfit === OUTFIT_RESET) {
                if (segments.length && !segments[segments.length - 1].reset) segments.push({ from, outfit: '', prompt: '', reset: true });
                continue;
            }
            const info = describeOutfit(assets, key, directive.outfit, scene, false);
            if (!info) continue;
            const prev = segments[segments.length - 1];
            if (prev && !prev.reset && prev.outfit === info.outfit) continue;
            segments.push({ from, ...info });
        }
        if (segments[0] && segments[0].from === 0 && segments[1] && segments[1].from <= 1) segments.shift();
        if (!segments.some((segment) => segment.outfit)) continue;
        out.push({ name: key, segments });
    }
    return out;
}
