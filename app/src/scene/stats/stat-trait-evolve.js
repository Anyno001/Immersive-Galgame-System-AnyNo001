// 特质进化：原地替换，来源沿用原条目。叶子模块：不导入 stat-traits 与规则文件。
// 傲娇：引起注意通过满 3 次 → 坦率；冰山：信任 ≥ 80 → 融化的冰山（反弹表暂无冰山，noticeCount.冰山 ≥ 3 的接口一并留好）。
const NOTICE_NEED = 3;
const TRUST_NEED = 80;
const LIKE_NEED = 26;
const COMRADE_NEED = 8;
const num = (v) => Number(v) || 0;

export const EVOLUTIONS = Object.freeze([
    Object.freeze({ from: '傲娇', to: '坦率', ok: (c) => num(c.noticeCount && c.noticeCount.傲娇) >= NOTICE_NEED }),
    Object.freeze({ from: '冰山', to: '融化的冰山', ok: (c) => num(c.dims && c.dims.信任) >= TRUST_NEED || num(c.noticeCount && c.noticeCount.冰山) >= NOTICE_NEED }),
    // 蛋糕叉：叉子对蛋糕的好感达到「喜欢」（26）后，尝到味道变为守护。
    Object.freeze({ from: '尝到味道', to: '守护', ok: (c) => num(c.dims && c.dims.好感) >= LIKE_NEED }),
    // 玻璃心：并肩取胜累计 8 次（主角自己挂时为主角取胜 8 次，记在 clock.heroBattleWins）→ 坚韧。
    // 坚韧与玻璃心所在轴另一侧互斥；身上已有爱哭鬼、破碎感、脆弱（键 fragile）时不进化。
    Object.freeze({ from: '玻璃心', to: '坚韧', block: Object.freeze(['爱哭鬼', '破碎感', '脆弱', 'fragile']), ok: (c) => num(c.comradeWins) >= COMRADE_NEED }),
]);

const isOn = (e) => e === true || Boolean(e && e.on === true);

/// 返回应进化的 [{ name, from, to }]。traits 为 { 角色: { 键: 条目 } }；捆绑来的条目、合成的组成项、新特质已存在的不进化。
export function evolveCandidates(state, traits) {
    const out = [];
    if (!traits || typeof traits !== 'object') return out;
    for (const [name, own] of Object.entries(traits)) {
        const c = (state.characters && state.characters[name]) || (name === '主角' ? { comradeWins: state.clock && state.clock.heroBattleWins } : null);
        if (!c || !own || typeof own !== 'object') continue;
        const inCombo = new Set();
        for (const [key, e] of Object.entries(own)) if (key.startsWith('combo:') && isOn(e) && e && Array.isArray(e.parts)) e.parts.forEach((p) => inCombo.add(p));
        for (const rule of EVOLUTIONS) {
            const e = own[rule.from];
            if (!isOn(e)) continue;
            if (e && e.src === 'bound') continue;
            if (inCombo.has(rule.from) || isOn(own[rule.to])) continue;
            if (rule.block && rule.block.some((b) => isOn(own[b]))) continue;
            if (rule.ok(c)) out.push({ name, from: rule.from, to: rule.to });
        }
    }
    return out;
}

/// 把进化写进 traits（不原地改）：新条目沿用原条目的其余字段。
export function applyEvolutions(traits, list) {
    let next = traits;
    for (const { name, from, to } of list) {
        const own = next && next[name];
        if (!own || !isOn(own[from])) continue;
        const { [from]: old, ...rest } = own;
        next = { ...next, [name]: { ...rest, [to]: old === true ? { on: true, src: 'manual' } : { ...old } } };
    }
    return next;
}

export const evolveText = ({ name, from, to }) => `${name}的「${from}」变成了「${to}」。`;
