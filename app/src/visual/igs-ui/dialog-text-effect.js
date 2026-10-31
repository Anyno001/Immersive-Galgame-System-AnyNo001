// 文字增强（readerSettings.dialogTextEffect）：对话框正文与窄屏阅读模式共用同一算法。
// 返回 { paintOrder, stroke, shadow }；没开或参数不合法时三项都是空串。
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
    // 先绘制描边再绘制填充：内侧半圈由原字色盖住，描边只在字形外侧可见。
    return kind === 'outline'
        ? { paintOrder: 'stroke fill', stroke: `${size * 2}px ${ink}`, shadow: '' }
        : { paintOrder: '', stroke: '', shadow: `0 ${size * 1.25}px ${size * 2.5}px ${ink}` };
}
