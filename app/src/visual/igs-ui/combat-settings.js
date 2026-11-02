// 卡牌战斗扩展的设置数据层（只含归一化与开启前检查，不含界面）。导出名与 v0.39.0 一致。
import { probeCombatTableSupport } from '../../data/shujuku/combat-tables.js';
import { resolveCombatLlm } from '../../combat/generation.js';
import { COMBAT_DIFFICULTY_KEYS } from '../../combat/rules.js';
import { normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';

export const COMBAT_DIFFICULTIES = COMBAT_DIFFICULTY_KEYS;
export const COMBAT_REPORT_DETAILS = Object.freeze(['brief', 'normal']);
// 战斗面板皮肤：initial 为共创原作者的面板外观（初始方案），veil 为渐变黑幕；开启战斗时默认黑幕。
export const COMBAT_PANEL_SKINS = Object.freeze(['veil', 'comic', 'ink', 'tech', 'mystic', 'soft-a', 'soft-c', 'dark-a', 'dark-b', 'initial']);
export const COMBAT_PANEL_SKIN_LABELS = Object.freeze({ veil: '黑幕', comic: '漫画', ink: '水墨', tech: '科幻', mystic: '星辉', 'soft-a': '圆润·野餐', 'soft-c': '圆润·绘本', 'dark-a': '恐怖·断帧', 'dark-b': '恐怖·无影灯', initial: '初始方案' });

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function normalizeCombatExpansionSettings(value) {
  const source = asObject(value);
  return {
    enabled: source.enabled === true,
    difficulty: COMBAT_DIFFICULTIES.includes(source.difficulty) ? source.difficulty : 'normal',
    reportDetail: COMBAT_REPORT_DETAILS.includes(source.reportDetail) ? source.reportDetail : 'normal',
    skin: COMBAT_PANEL_SKINS.includes(source.skin) ? source.skin : 'veil',
  };
}

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
