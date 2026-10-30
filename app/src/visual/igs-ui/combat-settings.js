import { probeCombatTableSupport } from '../../data/shujuku/combat-tables.js';
import { resolveCombatLlm } from '../../combat/generation.js';
import { COMBAT_DIFFICULTY_KEYS } from '../../combat/rules.js';
import { normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';

// 战斗扩展设置 readerSettings.combatExpansion：默认关闭；非法值一律回到默认。难度五档（easy / normal / hard / brutal / nightmare）取自难度表，旧设置的三档键不变。
// 开启前的宿主能力（shujuku 战斗表、副 LLM 配置）检查由设置动作负责，这里只做形状归一化。
export const COMBAT_DIFFICULTIES = COMBAT_DIFFICULTY_KEYS;
export const COMBAT_REPORT_DETAILS = Object.freeze(['brief', 'normal']);

const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function normalizeCombatExpansionSettings(value) {
    const src = plain(value);
    return {
        enabled: src.enabled === true,
        difficulty: COMBAT_DIFFICULTIES.includes(src.difficulty) ? src.difficulty : 'normal',
        reportDetail: COMBAT_REPORT_DETAILS.includes(src.reportDetail) ? src.reportDetail : 'normal',
    };
}

const LLM_FIELD_LABELS = Object.freeze({ endpoint: '地址', model: '模型' });

// 开启前依次检查：数据库（shujuku）是否提供战斗表所需接口；副 LLM 选了独立 API 时地址与模型是否填写。
// 返回 { ok:true } 或 { ok:false, reason, message }；任一不通过时开关保持关闭。
export function checkCombatExpansionReady({ api, autoIllustration } = {}) {
    const tables = probeCombatTableSupport(api);
    if (!tables.ok) {
        return { ok: false, reason: tables.reason, missing: tables.missing, message: api ? `数据库不支持战斗表：缺少 ${tables.missing.join('、')}` : '未检测到数据库（shujuku），无法开启卡牌战斗' };
    }
    const llm = resolveCombatLlm(normalizeAutoIllustrationSettings(autoIllustration).llm);
    if (!llm.ok) {
        const fields = llm.missing.map((key) => LLM_FIELD_LABELS[key] || key).join('、');
        return { ok: false, reason: llm.reason, missing: llm.missing, message: `副 LLM 独立 API 未填写${fields}，无法开启卡牌战斗` };
    }
    return { ok: true };
}
