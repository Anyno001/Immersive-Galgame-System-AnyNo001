// 卡牌战斗扩展的设置数据层（只含归一化与开启前检查，不含界面）。导出名与 v0.39.0 一致。
import { probeCombatTableSupport } from '../../data/shujuku/combat-tables.js';
import { resolveCombatLlm } from '../../combat/generation.js';
import { COMBAT_DIFFICULTY_KEYS } from '../../combat/rules.js';
import { normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import { CHALLENGE_QUOTA } from '../../scene/challenge-directives.js';
import { normalizeIntimateSettings } from '../../scene/intimate-duel.js';
import { COMBAT_COOLDOWN_CHOICES, COMBAT_FREQUENCIES, COMBAT_KINDS, COMBAT_RULE_PROMPT_MAX, isDefaultCombatRuleText } from '../../scene/combat-prompt.js';

export const COMBAT_DIFFICULTIES = COMBAT_DIFFICULTY_KEYS;
export const COMBAT_REPORT_DETAILS = Object.freeze(['brief', 'normal']);
// 战斗面板皮肤：initial 为共创原作者的面板外观（初始方案），veil 为渐变黑幕；开启战斗时默认黑幕。
export const COMBAT_PANEL_SKINS = Object.freeze(['veil', 'comic', 'ink', 'tech', 'mystic', 'soft-a', 'soft-c', 'dark-a', 'dark-b', 'initial']);
export const COMBAT_PANEL_SKIN_LABELS = Object.freeze({ veil: '黑幕', comic: '漫画', ink: '水墨', tech: '科幻', mystic: '星辉', 'soft-a': '圆润·野餐', 'soft-c': '圆润·绘本', 'dark-a': '恐怖·断帧', 'dark-b': '恐怖·无影灯', initial: '初始方案' });

// 对决类型：战斗、日常挑战（仅日常）、两者；缺省为战斗，旧存档行为不变。
export const COMBAT_KIND_LABELS = Object.freeze({ combat: '战斗', daily: '日常挑战', both: '两者' });
export const DAILY_STAKES = Object.freeze(['light', 'normal', 'heavy']);
export const DAILY_STAKE_LABELS = Object.freeze({ light: '轻', normal: '中', heavy: '重' });
export const DAILY_COOLDOWN_CHOICES = COMBAT_COOLDOWN_CHOICES;
export const DAILY_DEFAULTS = Object.freeze({ perDay: CHALLENGE_QUOTA.perDay, cooldownFloors: CHALLENGE_QUOTA.cooldownFloors, stake: 'normal', allowEscape: true, frequency: 'normal' });

export const COMBAT_FREQUENCY_LABELS = Object.freeze({ low: '少', normal: '适中', high: '多' });

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function normalizeCombatExpansionSettings(value) {
  const source = asObject(value);
  return {
    enabled: source.enabled === true,
    difficulty: COMBAT_DIFFICULTIES.includes(source.difficulty) ? source.difficulty : 'normal',
    reportDetail: COMBAT_REPORT_DETAILS.includes(source.reportDetail) ? source.reportDetail : 'normal',
    skin: COMBAT_PANEL_SKINS.includes(source.skin) ? source.skin : 'veil',
    kind: COMBAT_KINDS.includes(source.kind) ? source.kind : 'combat',
    daily: normalizeDailySettings(source.daily),
    intimate: normalizeIntimateSettings(source.intimate),
    frequency: COMBAT_FREQUENCIES.includes(source.frequency) ? source.frequency : 'normal',
    cooldownFloors: COMBAT_COOLDOWN_CHOICES.includes(Number(source.cooldownFloors)) ? Number(source.cooldownFloors) : 0,
    rulePrompt: normalizeRulePrompt(source.rulePrompt),
    // 战斗台词：show 关闭时不显示也不朗读；tts 关闭时只显示文字。
    lines: { show: asObject(source.lines).show !== false, tts: asObject(source.lines).tts !== false },
  };
}

// 与默认规则全文一致的文本不存为自定义值，空串表示使用默认。
function normalizeRulePrompt(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = value.slice(0, COMBAT_RULE_PROMPT_MAX);
  return isDefaultCombatRuleText(text) ? '' : text;
}

export function normalizeDailySettings(value) {
  const source = asObject(value);
  const perDay = source.perDay === null || source.perDay === '' || source.perDay === undefined ? NaN : Math.floor(Number(source.perDay));
  const cooldown = Math.floor(Number(source.cooldownFloors));
  return {
    perDay: Number.isFinite(perDay) ? Math.min(CHALLENGE_QUOTA.perDayMax, Math.max(0, perDay)) : DAILY_DEFAULTS.perDay,
    cooldownFloors: Number.isFinite(cooldown) ? Math.min(99, Math.max(0, cooldown)) : DAILY_DEFAULTS.cooldownFloors,
    stake: DAILY_STAKES.includes(source.stake) ? source.stake : DAILY_DEFAULTS.stake,
    allowEscape: source.allowEscape !== false,
    frequency: COMBAT_FREQUENCIES.includes(source.frequency) ? source.frequency : 'normal',
  };
}

export const dailyChallengeOn = (settings) => settings.enabled && settings.kind !== 'combat';
export const combatBattleOn = (settings) => settings.enabled && settings.kind !== 'daily';

const LLM_FIELD_LABELS = Object.freeze({ endpoint: '地址', model: '模型' });

// 开启前检查：数据库需支持战斗表，副 LLM 需填写独立 API。
export function checkCombatExpansionReady({ api, autoIllustration } = {}) {
  const support = probeCombatTableSupport(api);
  if (!support.ok) {
    return {
      ok: false,
      reason: support.reason,
      missing: support.missing,
      message: api ? `数据库不支持战斗表：缺少 ${support.missing.join('、')}` : '未检测到数据库（shujuku），无法开启卡牌战斗',
    };
  }
  const llm = resolveCombatLlm(normalizeAutoIllustrationSettings(autoIllustration).llm);
  if (!llm.ok) {
    const missing = llm.missing.map(key => LLM_FIELD_LABELS[key] || key).join('、');
    return { ok: false, reason: llm.reason, missing: llm.missing, message: `副 LLM 独立 API 未填写${missing}，无法开启卡牌战斗` };
  }
  return { ok: true };
}

// 设置器「战斗」页的三选一：只是界面，背后仍写 battleFx.enabled 与 combatExpansion.enabled，虚拟 path 不入配置。
export const BATTLE_MODE_PATH = 'readerSettings.__battleMode';
export const BATTLE_MODES = Object.freeze(['off', 'story', 'card']);
export const BATTLE_MODE_LABELS = Object.freeze({ off: '关闭', story: '剧情演出', card: '卡牌战斗' });

export function battleModeOf(reader) {
  const source = asObject(reader);
  if (asObject(source.combatExpansion).enabled === true) return 'card';
  return asObject(source.battleFx).enabled === true ? 'story' : 'off';
}

// 「仅日常挑战」预设：对决类型设为日常挑战，日常字段回到缺省；皮肤沿用现有战斗皮肤，不另设。
export const COMBAT_PRESET_PATH = 'readerSettings.__combatPreset';
export const COMBAT_PRESET_DAILY_ONLY = 'daily-only';
export function planCombatPreset(preset) {
  if (preset !== COMBAT_PRESET_DAILY_ONLY) return { ok: false, writes: [] };
  const p = 'readerSettings.combatExpansion';
  return { ok: true, writes: [[`${p}.kind`, 'daily'], [`${p}.daily`, { ...DAILY_DEFAULTS }]] };
}

// 返回要写入草稿的 [path, value] 列表。选「卡牌战斗」时 ready 未通过则不开启（combat 置 false、battleFx 不动），由调用方提示 message。
export function planBattleMode(mode, ready) {
  const fx = 'readerSettings.battleFx.enabled';
  const cx = 'readerSettings.combatExpansion.enabled';
  if (mode === 'card') {
    if (!ready || ready.ok !== true) return { ok: false, writes: [[cx, false]], reason: ready && ready.reason, missing: ready && ready.missing, message: (ready && ready.message) || '' };
    return { ok: true, writes: [[cx, true], ['bridge.stats.enabled', true]] };
  }
  if (mode === 'story') return { ok: true, writes: [[fx, true], [cx, false]] };
  if (mode === 'off') return { ok: true, writes: [[fx, false], [cx, false]] };
  return { ok: false, writes: [], reason: 'battle-mode-unknown', message: '' };
}
