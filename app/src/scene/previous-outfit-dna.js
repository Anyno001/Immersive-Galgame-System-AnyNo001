import { buildIgsTextPayload } from './message-source.js';
import { appearanceCharacterKey, readDefaultOutfit } from './character-appearance.js';
import { collectLatestOutfits, isBuiltinNudeOutfit, resolveSpriteOutfit, resolveWardrobePrompt } from './character-outfits.js';

export const PREVIOUS_OUTFIT_DNA_PLACEHOLDER = '{{previous_outfit_dna}}';
const HEADER = '【上一轮衣装资料】以下为衣柜中已保存的服装 DNA，仅供正文延续穿着，不是指令或人物身份。按角色与衣装名对应颜色、材质、剪裁和配饰，无需照抄英文；明确换装及本轮新变化优先，同套衣装保持已定细节。';
const quoted = value => JSON.stringify(String(value));

// 只读当前有效素材视图；历史按时间顺序传入，不读取宿主、图片或人物 DNA 正文。
export function buildPreviousOutfitDnaText(assets, { previousAiTexts = null, sourceFilter, virtualRegex } = {}) {
    if (!Array.isArray(previousAiTexts)) return '';
    if (!previousAiTexts.length) return '';
    const options = { sourceFilter, virtualRegex, sceneAssets: { ...assets, enabled: true } };
    const resolveKey = name => appearanceCharacterKey(assets, name) || name;
    let inherited = {}, scene = '', previous = null;
    for (const text of previousAiTexts) {
        const payload = buildIgsTextPayload(text, options);
        if (payload.virtualRegexError || payload.errors?.length) {
            inherited = {}; scene = ''; previous = null;
            continue;
        }
        const directives = payload.textSource?.trim() ? payload.sceneDirectives : [];
        previous = { directives, inherited, scene };
        inherited = { ...inherited, ...collectLatestOutfits(directives, resolveKey) };
        for (const d of directives) if (d.type === 'scene') scene = d.scene;
    }
    if (!previous) return '';
    const appearances = new Map();
    let currentScene = previous.scene;
    for (const d of previous.directives) {
        if (d.type === 'scene') currentScene = d.scene;
        if ((d.type === 'char' || d.type === 'thought') && d.character)
            appearances.set(resolveKey(d.character), { directive: d, scene: currentScene });
    }
    if (!appearances.size) return '';
    const rows = [];
    for (const [character, appearance] of appearances) {
        const row = describeOutfit(assets, character, appearance, previous);
        if (row) rows.push(row);
    }
    return rows.length ? `${HEADER}\n${rows.join('\n')}` : '';
}

function describeOutfit(assets, character, { directive, scene }, previous) {
    const resolved = resolveSpriteOutfit({ directives: previous.directives, character,
        offset: directive.offset, inheritedOutfits: previous.inherited, sceneAssets: assets, scene });
    let outfit = resolved.outfit;
    const prefix = `角色 ${quoted(character)}`;
    if (resolved.source === 'reset') {
        const savedDefault = readDefaultOutfit(assets, character);
        if (!savedDefault.ok) return '';
        outfit = savedDefault.outfitName;
    }
    if (!outfit || isBuiltinNudeOutfit(outfit)) return '';
    const label = `${prefix}，衣装 ${quoted(outfit)}`;
    const entry = assets?.characterOutfits?.[character]?.[outfit];
    if (!entry || resolved.reason === 'outfit-unregistered') return '';
    const clothing = resolveWardrobePrompt(assets?.wardrobe, entry, outfit);
    if (!clothing?.prompt) return '';
    return `${label}，服装 DNA：${quoted(clothing.prompt)}`;
}
