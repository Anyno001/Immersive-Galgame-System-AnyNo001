import { buildCompactGroupsText, buildCompactMoodGroupsText, buildCompactSceneNamesText, buildMoodGroupsText, buildGroupsText, buildSceneGroupsText, MOOD_GROUPS_PLACEHOLDER, SCENE_GROUPS_PLACEHOLDER, TIME_GROUPS_PLACEHOLDER, WEATHER_GROUPS_PLACEHOLDER } from './mood-groups.js';
import { buildOutfitGroupsText, buildScopedOutfitGroupsText, normalizeCharacterOutfits, OUTFIT_GROUPS_PLACEHOLDER } from './character-outfits.js';

// 素材页「自动注入格式规则」：缺省为开，只有明确存了 false 才不把场景规则发给聊天模型。
export function scenePromptRuleEnabled(sceneAssets) {
    return Boolean(sceneAssets) && sceneAssets.promptRuleEnabled !== false;
}

export function firstMoodWord(sceneAssets) {
    const groups = sceneAssets && Array.isArray(sceneAssets.moodGroups) ? sceneAssets.moodGroups : [];
    const group = groups.find((g) => g && Array.isArray(g.words) && g.words.some(Boolean));
    return group ? String(group.words.find(Boolean)) : '';
}

function moodSlotWords(sceneAssets) {
    const words = new Set();
    for (const moods of Object.values((sceneAssets && sceneAssets.characters) || {})) {
        if (moods && typeof moods === 'object') for (const word of Object.keys(moods)) words.add(word);
    }
    return words;
}

// 把规则里的词表占位符换成素材库内容。compact 是按需注入用的精简词表（服装只列在场角色）；
// 不带 compact 是完整词表，旧拼接注入和「复制到酒馆预设」都用这一份。
export function resolvePromptRuleContent(sceneAssets, { compact = false, presentText = null } = {}) {
    let rule = String(sceneAssets.promptRule || '');
    if (rule.includes(MOOD_GROUPS_PLACEHOLDER)) {
        const moods = compact ? buildCompactMoodGroupsText(sceneAssets.moodGroups, moodSlotWords(sceneAssets)) : buildMoodGroupsText(sceneAssets.moodGroups);
        rule = rule.split(MOOD_GROUPS_PLACEHOLDER).join(moods);
    }
    if (rule.includes(SCENE_GROUPS_PLACEHOLDER)) {
        rule = rule.split(SCENE_GROUPS_PLACEHOLDER).join(compact ? buildCompactSceneNamesText(sceneAssets.scenes) : buildSceneGroupsText(sceneAssets.scenes));
    }
    if (rule.includes(TIME_GROUPS_PLACEHOLDER)) {
        rule = rule.split(TIME_GROUPS_PLACEHOLDER).join(compact ? buildCompactGroupsText(sceneAssets.timeGroups) : buildGroupsText(sceneAssets.timeGroups));
    }
    if (rule.includes(WEATHER_GROUPS_PLACEHOLDER)) {
        rule = rule.split(WEATHER_GROUPS_PLACEHOLDER).join(compact ? buildCompactGroupsText(sceneAssets.weatherGroups) : buildGroupsText(sceneAssets.weatherGroups));
    }
    if (rule.includes(OUTFIT_GROUPS_PLACEHOLDER)) {
        const outfits = normalizeCharacterOutfits(sceneAssets.characterOutfits);
        rule = rule.split(OUTFIT_GROUPS_PLACEHOLDER).join(compact
            ? buildScopedOutfitGroupsText(outfits, { presentText, characterAliases: sceneAssets.characterAliases })
            : buildOutfitGroupsText(outfits));
    }
    return compact ? rule.replace(/\n{2,}/g, '\n').trim() : rule;
}
