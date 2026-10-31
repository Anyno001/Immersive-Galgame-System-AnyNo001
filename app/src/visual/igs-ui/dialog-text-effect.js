// 文字增强（readerSettings.dialogTextEffect）：对话框正文与窄屏阅读模式共用同一算法。
// 返回 { paintOrder, stroke, shadow }；没开或参数不合法时三项都是空串。
// 描边用八向文字阴影画在字形外侧：-webkit-text-stroke 是骑在字形边线上描，部分手机浏览器不认 paint-order，
// 描边会吃进字里、字色部分变细。
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];

export function dialogTextEffectCss(readerSettings) {
    const rs = readerSettings || {};
    const kind = rs.dialogTextEffect;
    const color = rs.dialogTextEffectColor;
    const strength = Number(rs.dialogTextEffectStrength);
    const sizeRaw = Number(rs.dialogTextEffectSize);
    if ((kind !== 'outline' && kind !== 'shadow') || !/^#[0-9a-fA-F]{6}$/.test(color)
        || !Number.isFinite(strength) || !Number.isFinite(sizeRaw)) return { paintOrder: '', stroke: '', shadow: '' };
    const rgb = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(',');
    const ink = `rgba(${rgb},${Math.max(5, Math.min(50, strength)) / 100})`;
    const size = Math.max(0.4, Math.min(2, sizeRaw));
    if (kind === 'shadow') return { paintOrder: '', stroke: '', shadow: `0 ${size * 1.25}px ${size * 2.5}px ${ink}` };
    const r = Math.round(size * 100) / 100;
    const shadow = DIRS.map(([x, y]) => `${Math.round(x * r * 100) / 100}px ${Math.round(y * r * 100) / 100}px 0 ${ink}`).join(',');
    return { paintOrder: '', stroke: '', shadow };
}
