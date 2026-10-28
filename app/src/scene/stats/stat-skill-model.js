// 辅助模型兜底选技能（§4.1、易错点 G1/G2）：只能从给定清单里选；返回清单外的技能、数字、超时或失败一律按「无需检定」继续，不阻塞发送。
export const MODEL_TIMEOUT_MS = 8000;
export const MODEL_DIFFICULTIES = Object.freeze(['普通', '困难', '极难', '无需检定']);
export const DEFAULT_SKILL_CHOICE_SYSTEM = '你是检定裁判。只从给定技能清单中选一个技能和一个难度档，不得输出清单外的技能名或任何数字。只输出 JSON：{"skill":"技能名","difficulty":"普通|困难|极难|无需检定"}。闲聊、日常移动、没有风险或对手时选「无需检定」。';

const NONE = Object.freeze({ skill: null, difficulty: '无需检定' });

export function buildSkillChoicePrompt(text, pool, system = DEFAULT_SKILL_CHOICE_SYSTEM) {
    return { system, user: `技能清单：${pool.join('、')}\n玩家行动：${String(text ?? '').slice(0, 300)}` };
}

export function parseModelSkillChoice(reply, pool) {
    let obj = null;
    try {
        const match = String(reply ?? '').match(/\{[\s\S]*\}/);
        obj = match ? JSON.parse(match[0]) : null;
    } catch (error) { obj = null; }
    const skill = obj && typeof obj.skill === 'string' ? obj.skill.trim() : '';
    const difficulty = obj && typeof obj.difficulty === 'string' ? obj.difficulty.trim() : '';
    if (difficulty === '无需检定') return { ...NONE, ok: true };
    if (!pool.includes(skill) || !MODEL_DIFFICULTIES.includes(difficulty)) return { ...NONE, ok: false, reason: 'model-choice-invalid' };
    return { skill, difficulty, ok: true };
}

// request(prompt) => Promise<string | { text }>，由宿主副 LLM 通道提供。
export async function chooseSkillWithModel(text, { skills = [], candidates = [], request, timeoutMs = MODEL_TIMEOUT_MS, system } = {}) {
    const pool = candidates.length ? candidates : skills;
    if (typeof request !== 'function' || !pool.length) return { ...NONE, ok: false, reason: 'model-unavailable' };
    const prompt = buildSkillChoicePrompt(text, pool, system || DEFAULT_SKILL_CHOICE_SYSTEM);
    let timer = null;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs); });
    try {
        const reply = await Promise.race([Promise.resolve().then(() => request(prompt)), timeout]);
        if (reply && reply.timedOut) return { ...NONE, ok: false, reason: 'model-timeout' };
        return parseModelSkillChoice(typeof reply === 'string' ? reply : reply && reply.text, pool);
    } catch (error) {
        return { ...NONE, ok: false, reason: 'model-failed' };
    } finally {
        clearTimeout(timer);
    }
}
