// 论坛体「屏蔽演出」：开着论坛体且勾了这一项时，名单里没勾「保留」的演出一律视为关——
// 提示词不再发它们的写法（AI 不写标签），画面上也不播。只改每次新克隆的快照，不写回存档。
import { FX_PACK_SETTING_GROUPS } from '../../scene/fx-packs.js';

// [类别, 名称, 对应的设置组, 默认保留]。表情包、安科、帖内聊天截图属于论坛体自身，不在名单里。
export const FORUM_FX_GROUPS = Object.freeze([
    ['text', '文字演出', ['textFx'], true],
    ['result', '选项检定掷骰', ['resultFx'], true],
    ['favor', '好感／数值提示', ['favorToast'], true],
    ['manga', '漫画特效、心跳、闪光', ['mangaFx', 'heartbeatFx', 'flashFx', 'mangaBack'], false],
    ['tags', '演出标签（天气、通话等）', ['fxTags'], false],
    ['daily', '日常演出与题材包', ['dailyFx', ...Object.keys(FX_PACK_SETTING_GROUPS)], false],
    ['danmaku', '弹幕与心声', ['audienceFx', 'innerFx'], false],
    ['demon', '心魔黑影', ['innerDemon'], false],
    ['battle', '战斗演出与卡牌战斗', ['battleFx', 'combatExpansion'], false],
    ['romance', '亲密演出', ['romanceFx'], false],
    ['meta', 'Meta 互动', ['metaFx'], false],
    ['phone', '手机社区与通知', ['feedFx', 'notifyCenter'], false],
    ['stage', '转场、运镜、立绘动作、物品', ['sceneTransition', 'timeTint', 'spriteMotion', 'spriteActions', 'camera', 'stageCast', 'titleCard', 'itemFx', 'crowdFx'], false],
    ['sound', '声音（配乐、环境音、音效、朗读）', ['bgm', 'ambientSound', 'uiSound', 'fxSound', 'tts', 'voiceBark'], false],
].map(([id, label, keys, keep]) => Object.freeze({ id, label, keys: Object.freeze(keys), keep })));

// 保留名单存成 { 类别: true/false }，没存过的类别按默认。
export function normalizeForumFxKeep(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const g of FORUM_FX_GROUPS) out[g.id] = typeof src[g.id] === 'boolean' ? src[g.id] : g.keep;
    return out;
}

export function forumBlocksFx(readerSettings) {
    const forum = readerSettings && readerSettings.forumReader;
    return Boolean(forum && forum.on === true && forum.noFx === true);
}

// 返回新对象：被屏蔽的设置组 enabled 拨成 false，其余原样。
export function applyForumFxBlock(readerSettings) {
    if (!forumBlocksFx(readerSettings)) return readerSettings;
    const keep = normalizeForumFxKeep(readerSettings.forumReader.keepFx);
    const out = { ...readerSettings };
    for (const group of FORUM_FX_GROUPS) {
        if (keep[group.id]) continue;
        for (const key of group.keys) {
            const value = out[key];
            out[key] = { ...(value && typeof value === 'object' ? value : {}), enabled: false };
        }
    }
    return out;
}
