import { parseTables } from './table-parser.js';

const TABLE = /技能|能力|法术|天赋|功法|异能|skill|abilit|spell|talent/i;
const OWNER = /^(所属角色|持有者|拥有者|使用者|掌握者|角色名称|角色名|角色|人物|姓名|owner|character)$/i;
const STATE = /^(状态|掌握状态|学习状态|解锁状态|是否解锁|status)$/i;
const LOCKED = /未掌握|未习得|未学会|未学习|未解锁|不可用|待解锁|locked|unlearned/i;
const text = (v) => String(v ?? '').trim();

// 技能表只读；有归属列时严格匹配，无归属列时必须由用户主动勾选。
export function collectCombatSkillMaterials(raw, names) {
    return parseTables(raw).filter((t) => TABLE.test(t.name) && !t.name.startsWith('IGS'))
        .slice(0, 40).map((t) => {
            const owner = t.columns.findIndex((c) => OWNER.test(text(c)));
            const state = t.columns.findIndex((c) => STATE.test(text(c)));
            const rows = t.rows.filter((row) => Array.isArray(row) && (owner < 0 || names.includes(text(row[owner])))
                && (state < 0 || (!LOCKED.test(text(row[state])) && !/^(否|false|0)$/i.test(text(row[state])))));
            return { id: t.uid, name: t.name, selected: owner >= 0 && rows.length > 0,
                ownership: owner < 0 ? '归属不明，由用户确认适用于当前角色；不能自动视为已掌握' : '已按所属角色筛选',
                rows: rows.map((row) => Object.fromEntries(t.columns.map((c, i) => [text(c), row[i] ?? '']))) };
        });
}
