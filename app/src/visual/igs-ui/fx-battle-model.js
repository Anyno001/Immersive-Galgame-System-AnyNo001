// 战斗演出的纯模型：设置规范化、按页规划时间轴、冲击点计算、身份校验与提示词；不操作 DOM、不带任何数值。
// fx 为 resolveFxAtPage 的结果（battle / battleStart / battleEnd / hits / userName）。
import { isPlayerName } from '../../scene/battle-context.js';
import { FALLBACK_HEAD, HEAD_ASPECT, spriteDrawRect } from './fx-anchor.js';

export const BATTLE_HIT_LABELS = Object.freeze({ hit: '', crit: '暴击！', miss: '闪避', guard: '格挡', ko: '击倒', heal: '恢复' });
export const BATTLE_RESULT_LABELS = Object.freeze({
    win: Object.freeze({ title: 'VICTORY', text: '胜利' }),
    lose: Object.freeze({ title: 'DEFEAT', text: '败北' }),
    escape: Object.freeze({ title: 'ESCAPE', text: '成功撤退' }),
});
export const BATTLE_DICE_LABELS = Object.freeze({ crit: '检定大成功', miss: '检定大失败' });

// 基准时间轴（毫秒，停留倍率 ×1）：遭遇演出占满前 1.6 秒，之后逐招间隔出招，结算卡最后登场。
export const BATTLE_TIMING = Object.freeze({
    encounter: 1900, encounterGap: 1600, hit: 1300, hitGap: 1100, ko: 1600, result: 3000,
});
// 点击快进后结算卡的停留时间。
export const BATTLE_SKIP_RESULT_MS = 1800;

export function normalizeBattleFxSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return { enabled: src.enabled === true, letterbox: src.letterbox !== false };
}

const identityPart = (value) => String(value == null ? '' : value);

export function battleFxIdentity({ chatId, messageId, swipeId, page } = {}) {
    return [chatId, messageId, Number(swipeId) || 0, page].map(identityPart).join('|');
}

function text(value) {
    return String(value == null ? '' : value).trim();
}

// 立绘角色名与目标名：全等，或两者都不短于 2 字且一方包含另一方（「史莱姆」打「史莱姆王」）。
export function isSpriteTarget(target, spriteName) {
    const a = text(target);
    const b = text(spriteName);
    if (!a || !b) return false;
    return a === b || (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)));
}

// 目标优先级：主角 → 当前立绘角色 → 同屏陪衬角色 → 有立绘的对手（出招时临时登场）→ 舞台中上部。
function targetKindOf(target, { spriteName, userName, foe, foeImage, castNames = [] }) {
    if (isPlayerName(target, userName)) return 'player';
    if (isSpriteTarget(target, spriteName)) return 'sprite';
    if (castNames.some((name) => isSpriteTarget(target, name))) return 'cast';
    if (foeImage && isSpriteTarget(target, foe)) return 'foe';
    return 'stage';
}

// 对手立绘只接受网络图片、本地生成图的 data URL、Blob URL 与酒馆本地的相对路径，其余协议一律拒绝。
export function safePortraitUrl(url) {
    const value = text(url);
    if (!value) return '';
    if (/^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,|blob:)/i.test(value)) return value;
    return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') ? '' : value;
}

function scaled(ms, scale) {
    return Math.round(ms * scale);
}

// 未开启、NSFW、聊天页或卡片页返回空计划；plate 为战斗进行中常驻的对手名牌，events 为本页一次性演出。
// holdScale 来自演出风格的停留时间档位；spriteName 为当前立绘角色，用来判断目标是否在场；foeImage 为对手立绘的可显示地址。
export function planBattleFx(fx, { settings, identity, nsfw = false, pageKind = 'text', holdScale = 1, spriteName = '', foeImage = '', castNames = [] } = {}) {
    const empty = { plate: null, letterbox: false, events: [], identity: null, totalMs: 0 };
    const config = normalizeBattleFxSettings(settings);
    if (!config.enabled || nsfw || pageKind !== 'text' || !fx) return empty;
    const scale = Number.isFinite(Number(holdScale)) && Number(holdScale) > 0 ? Number(holdScale) : 1;
    const userName = text(fx.userName);
    const events = [];
    let at = 0;
    const battle = fx.battle && typeof fx.battle === 'object' ? { foe: text(fx.battle.foe), title: text(fx.battle.title) } : null;
    const portrait = safePortraitUrl(foeImage);
    if (fx.battleStart === true) {
        events.push({ type: 'encounter', at, life: scaled(BATTLE_TIMING.encounter, scale), foe: battle ? battle.foe : '', title: battle ? battle.title : '', portrait: battle && battle.foe ? portrait : '' });
        at += scaled(BATTLE_TIMING.encounterGap, scale);
    }
    for (const hit of Array.isArray(fx.hits) ? fx.hits : []) {
        const result = Object.hasOwn(BATTLE_HIT_LABELS, hit && hit.result) ? hit.result : 'hit';
        const target = text(hit.target);
        const targetKind = targetKindOf(target, { spriteName, userName, foe: battle ? battle.foe : '', foeImage: portrait, castNames });
        events.push({
            type: 'hit', at, life: scaled(BATTLE_TIMING.hit, scale), result,
            attacker: text(hit.attacker), target, skill: text(hit.skill),
            label: BATTLE_HIT_LABELS[result],
            diceLabel: hit.dice === true ? BATTLE_DICE_LABELS[result] || '' : '',
            targetKind,
            targetChar: targetKind === 'cast' ? castNames.find((name) => isSpriteTarget(target, name)) : '',
            portrait: targetKind === 'foe' ? portrait : '',
        });
        at += scaled(result === 'ko' ? BATTLE_TIMING.ko : BATTLE_TIMING.hitGap, scale);
    }
    const end = text(fx.battleEnd);
    if (end && Object.hasOwn(BATTLE_RESULT_LABELS, end)) {
        events.push({ type: 'result', at, life: scaled(BATTLE_TIMING.result, scale), result: end, ...BATTLE_RESULT_LABELS[end] });
    }
    const last = events[events.length - 1];
    const plate = battle && !end ? battle : null;
    return {
        plate,
        letterbox: Boolean(plate) && config.letterbox,
        events,
        identity: identity ? { ...identity } : null,
        totalMs: last ? last.at + last.life : 0,
    };
}

// 冲击点落在目标立绘的上半身（头部下方约 1.3 个头高），夹在舞台内且不压对话框；立绘几何不可用时返回 null 走舞台默认位置。
export function resolveImpactPoint(geo, sprite) {
    const stageW = Number(geo && geo.stageW);
    const stageH = Number(geo && geo.stageH);
    if (!(stageW > 0) || !(stageH > 0)) return null;
    const rect = spriteDrawRect(stageW, stageH, sprite);
    if (!rect) return null;
    const head = sprite.head || FALLBACK_HEAD;
    const headW = rect.w * head.w;
    const x = rect.left + rect.w * head.x;
    const y = rect.top + rect.h * head.top + headW * HEAD_ASPECT * 1.3;
    const floor = Math.max(stageH * 0.3, Math.min(stageH, Number(geo.dialogTop) || stageH) - stageH * 0.18);
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    return { x: Math.round(clamp(x, stageW * 0.12, stageW * 0.88)), y: Math.round(clamp(y, stageH * 0.2, floor)) };
}

export function resolveBattleFxPromptRule(enabled) {
    if (enabled !== true) return '';
    return `[igs战斗标签]
正文出现战斗时，用以下标签驱动战斗演出（只有画面效果，不显示任何数值）：

1. [igs-fx:battle|对手名|对手称号] … [igs-fx:battle-end|结果]：包住整场战斗；称号可省略；结果只写 胜利／败北／撤退，战斗未分胜负就结束时可不写结果
2. [igs-fx:hit|出手者|目标|招式名|效果]：一次攻击、技能或治疗；效果只写 命中／暴击／闪避／格挡／击倒／治疗，省略按命中处理，如[igs-fx:hit|爱丽丝|史莱姆|冰霜新星|暴击]；主角出手或被攻击时，出手者或目标写「我」

语法要求：
1. 标签独立成行，放在描写该动作的正文之前
2. 字段不得换行，不得含 | 或 ]，不要写伤害数字或血量
3. 每层回复中 hit 不超过3个，只标关键的出招；非战斗场景不要使用
4. battle 与 battle-end 必须成对；战斗跨越多层回复时，只在开战那层写 battle，battle-end 写在分出结果的那一层
5. 上一条用户消息带有检定结果时，出招效果应与之相符：大成功写暴击，大失败写闪避`;
}

export const BATTLE_GRAMMAR_LINES = Object.freeze([
    'battle|对手名|对手称号 … battle-end|结果：包住整场战斗，称号可省，结果只写 胜利/败北/撤退；跨多层时只在开战那层写 battle，battle-end 写在分出结果的那层',
    'hit|出手者|目标|招式名|效果：一次攻击、技能或治疗，效果只写 命中/暴击/闪避/格挡/击倒/治疗，省略按命中；主角写「我」；不写伤害数字；每层最多3个；上条用户消息带检定结果时，大成功写暴击、大失败写闪避',
]);
