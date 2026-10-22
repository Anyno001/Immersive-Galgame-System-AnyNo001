// 推送到表格时的单元格写法（§8A、§8B；易错点 F3/F10/F11/F12）：按原格式写回，只改目标数值。
// 纯函数，不读写表格。

const NUMBER = /-?\d+(?:\.\d+)?/;
const SEPARATOR = /[；;]/;

// 线性换算：IGS 范围 → 列范围；未设置时原样返回（四舍五入到整数）。
export function scaleValue(value, { from = null, to = null } = {}) {
    const v = Number(value) || 0;
    if (!from || !to) return Math.round(v);
    const [a, b] = from;
    const [c, d] = to;
    if (b === a) return Math.round(c);
    return Math.round(c + ((v - a) * (d - c)) / (b - a));
}

// 保留原单元格的写法："45/100" → "34/100"、"45%" → "34%"、"好感 45" → "好感 34"；负数保留负号。
// 原格内没有数字时：percent 为 true 写 "34%"，否则写 "34"。
export function formatNumberCell(original, value, { percent = false } = {}) {
    const text = String(original ?? '');
    const n = String(Math.round(Number(value) || 0));
    if (NUMBER.test(text)) return text.replace(NUMBER, n);
    return percent ? `${n}%` : n;
}

// 列里现有内容大多不是数字时，默认用阶段名写入（易错点 F10）。
export function columnLooksTextual(cells) {
    const filled = (cells || []).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (!filled.length) return false;
    const numeric = filled.filter((c) => NUMBER.test(c)).length;
    return numeric * 2 < filled.length;
}

// 列内现有数值全部落在 0–100 之外的同一窄范围（如 3–18）时提示可能需要换算（易错点 F11）。
export function suspectRange(cells) {
    const nums = (cells || []).map((c) => String(c ?? '').match(NUMBER)).filter(Boolean).map((m) => Number(m[0]));
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return max <= 20 && min >= 0 ? { min, max } : null;
}

function splitPairs(text) {
    return String(text ?? '').split(SEPARATOR).map((part) => part.trim()).filter(Boolean).map((part) => {
        const m = part.match(/^([^:：]+)[:：]\s*(.*)$/);
        return m ? { name: m[1].trim(), value: m[2].trim(), raw: part } : { name: '', value: '', raw: part };
    });
}

// 读多属性格（AcuDice 格式「健康:60；力量:45；」）。
export function readAttributeCell(text) {
    const out = {};
    for (const p of splitPairs(text)) {
        const m = p.value.match(NUMBER);
        if (p.name && m) out[p.name] = Number(m[0]);
    }
    return out;
}

// 只替换格内目标属性的数值，其余属性与顺序逐字保留；格内没有的属性追加在末尾（易错点 F3）。
export function writeAttributeCell(original, updates) {
    const pairs = splitPairs(original);
    const pending = new Map(Object.entries(updates || {}).map(([k, v]) => [k, Math.round(Number(v) || 0)]));
    const parts = pairs.map((p) => {
        if (!p.name || !pending.has(p.name)) return p.raw;
        const v = pending.get(p.name);
        pending.delete(p.name);
        return NUMBER.test(p.value) ? `${p.name}:${p.value.replace(NUMBER, String(v))}` : `${p.name}:${v}`;
    });
    for (const [name, v] of pending) parts.push(`${name}:${v}`);
    return parts.length ? `${parts.join('；')}；` : '';
}
