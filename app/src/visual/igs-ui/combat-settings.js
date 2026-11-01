// 卡牌战斗扩展的设置数据层（只含归一化与开启前检查，不含界面）。导出名与 v0.39.0 一致。
import { probeCombatTableSupport } from '../../data/shujuku/combat-tables.js';
import { resolveCombatLlm } from '../../combat/generation.js';
import { COMBAT_DIFFICULTY_KEYS } from '../../combat/rules.js';
import { normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';

export const COMBAT_DIFFICULTIES = COMBAT_DIFFICULTY_KEYS;
export const COMBAT_REPORT_DETAILS = Object.freeze(['brief', 'normal']);

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function normalizeCombatExpansionSettings(value) {
  const source = asObject(value);
  return {
    enabled: source.enabled === true,
    difficulty: COMBAT_DIFFICULTIES.includes(source.difficulty) ? source.difficulty : 'normal',
    reportDetail: COMBAT_REPORT_DETAILS.includes(source.reportDetail) ? source.reportDetail : 'normal',
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
