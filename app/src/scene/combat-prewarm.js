// 开战立绘预热：从开战标签取出需要先备立绘的名字。纯函数，不读写存储。
import { extractCombatStart } from './combat-directives.js';
import { combatPortraitNames, FOE_LIST_MAX } from './creature-battle.js';
import { isGroupName } from './creature-profile.js';

const NOT_FOE = new Set(['我', '玩家', '主角', '你', '{{user}}', 'user', 'User']);

// 返回 [{ role: 'enemy' | 'ally', raw, base, candidates }]。
// base 为去掉编号后缀（甲乙丙、数字）后的原名，同一 base 只出一项；群体称呼不返回。
// candidates 为战斗面板找立绘用的候选名（含 raw 与 base），预热前后用同一组名字判断有没有图。
export function combatPrewarmTargets(text, options = {}) {
    if (!/igs-combat:\s*start/i.test(String(text || ''))) return [];
    let start = null;
    try { start = extractCombatStart(text, options).start; } catch (error) { start = null; }
    if (!start) return [];
    const out = [];
    const seen = new Set();
    const add = (name, role) => {
        const raw = String(name || '').trim();
        if (!raw || NOT_FOE.has(raw) || isGroupName(raw)) return;
        const candidates = combatPortraitNames(raw);
        const base = candidates[1] && !candidates[1].endsWith('们') ? candidates[1] : raw;
        if (seen.has(base)) return;
        seen.add(base);
        out.push({ role, raw, base, candidates: [...new Set([...candidates, base])] });
    };
    for (const enemy of (start.enemies || []).slice(0, FOE_LIST_MAX)) add(enemy && enemy.name, 'enemy');
    for (const ally of start.allies || []) add(ally && ally.name || ally, 'ally');
    return out;
}
