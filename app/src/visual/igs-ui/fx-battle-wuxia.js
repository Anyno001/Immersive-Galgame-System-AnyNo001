// 水墨武侠战斗节点：DOM 照 plan/wuxia-ink-ui/v6 定稿搭（类名 wx-*），样式见 fx-battle-wuxia-style.js。
// 落笔位置按定稿固定，不建 .igs-fx-battle-impact；逐字、顿帧、钤印的先后全在 CSS 延时里，不加计时器。
export const WUXIA_HIT_LABELS = Object.freeze({ hit: '得手', crit: '要害', miss: '身法', guard: '化解', ko: '重创', heal: '调息' });
// 节奏：时间轴与 CSS 动画整体放慢到 1.6 倍（计时器数量不变）；CSS 侧用同值的 --wxs。
export const WUXIA_PACE = 1.6;
const RESULT_GLYPHS = Object.freeze({ win: '胜', lose: '败', escape: '遁' });
const RESULT_LINES = Object.freeze({ win: (foe) => `${foe || '对手'} · 败走`, lose: () => '力竭 · 退出三丈', escape: () => '借势脱身' });
const STROKES = Object.freeze({ hit: ['wx-s1', 'wx-sp'], crit: ['wx-s1', 'wx-s2', 'wx-sp'], ko: ['wx-s1', 'wx-s2', 'wx-sp'], miss: ['wx-ghost'], guard: ['wx-g1', 'wx-g2', 'wx-gsp'], heal: ['wx-ring', 'wx-ring r2'] });
// 印一律单字方印：判定字写在墨签上，要害、重创另钤一方。
const VERDICT_SEALS = Object.freeze({ crit: ['wx-v-seal', '中'], ko: ['wx-v-big', '伤'] });
const INKCHAR_SVG = '<svg width="0" height="0" aria-hidden="true"><filter id="igs-wx-inkchar" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="12" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" result="r"/><feGaussianBlur in="r" stdDeviation="5" result="halo"/><feColorMatrix in="halo" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .22 0" result="h2"/><feMerge><feMergeNode in="h2"/><feMergeNode in="r"/></feMerge></filter></svg>';

function el(doc, className, text) {
    const node = doc.createElement('div');
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function chars(doc, node, text) {
    Array.from(String(text)).forEach((ch, i) => {
        const c = el(doc, 'wx-ch', ch);
        if (c.style && typeof c.style.setProperty === 'function') c.style.setProperty('--i', String(i));
        node.appendChild(c);
    });
    return node;
}

export const wuxiaHurts = (event) => event.targetKind === 'player' && ['hit', 'crit', 'ko'].includes(event.result);

// 大笔先挂、墨签与字后挂：字压在墨痕之上，不被遮盖。
export function buildWuxiaEncounter(doc, node, event) {
    node.appendChild(el(doc, 'wx wx-inkv'));
    node.appendChild(el(doc, 'wx wx-e-stroke'));
    node.appendChild(el(doc, 'wx wx-tag v wx-e-tag', '狭路相逢'));
    if (event.foe) node.appendChild(el(doc, 'wx wx-e-name', event.foe));
    if (event.title) node.appendChild(el(doc, 'wx wx-e-title', event.title));
    node.appendChild(el(doc, 'wx wx-seal wx-e-seal', '战'));
    return node;
}

export function buildWuxiaHit(doc, node, event) {
    for (const cls of wuxiaHurts(event) ? [] : (STROKES[event.result] || STROKES.hit)) node.appendChild(el(doc, `wx ${cls}`));
    if (event.attacker) node.appendChild(el(doc, 'wx wx-tag v wx-h-who', event.attacker));
    if (event.skill || event.attacker) node.appendChild(chars(doc, el(doc, 'wx wx-tag v wx-h-skill'), event.skill || '攻击'));
    if (wuxiaHurts(event)) return node;
    node.appendChild(el(doc, 'wx wx-verdict wx-tag v wx-v-ink', WUXIA_HIT_LABELS[event.result] || WUXIA_HIT_LABELS.hit));
    const seal = VERDICT_SEALS[event.result];
    if (seal) node.appendChild(el(doc, `wx wx-seal ${seal[0]}`, seal[1]));
    return node;
}

export function buildWuxiaHurt(doc) {
    return el(doc, 'igs-fx-battle-wx-hurt igs-fx-transient');
}

export function buildWuxiaResult(doc, node, event, foe) {
    node.appendChild(el(doc, 'wx wx-inkv'));
    const defs = el(doc, 'wx-defs');
    defs.innerHTML = INKCHAR_SVG;
    node.appendChild(defs);
    node.appendChild(el(doc, 'wx wx-r-char', RESULT_GLYPHS[event.result] || RESULT_GLYPHS.win));
    node.appendChild(el(doc, 'wx wx-tag v wx-r-line', (RESULT_LINES[event.result] || RESULT_LINES.win)(foe)));
    if (event.result === 'win') node.appendChild(el(doc, 'wx wx-seal wx-r-seal', '胜'));
    return node;
}

// 震屏与立绘反应按定稿落笔时刻错后（再乘节奏），用 WAAPI 的 delay 播放，不另起计时器。
const SHAKES = Object.freeze({ crit: ['heavy', 980], ko: ['heavy', 1160], guard: ['light', 760] });
export function wuxiaShakeOf(event) {
    const spec = wuxiaHurts(event) ? ['heavy', 100] : (event.targetKind === 'player' ? null : SHAKES[event.result] || null);
    return spec ? [spec[0], Math.round(spec[1] * WUXIA_PACE)] : null;
}
export const WUXIA_REACT_DELAY = Object.freeze(Object.fromEntries(Object.entries({ hit: 620, crit: 1000, guard: 1000, ko: 1140, miss: 500, heal: 0 }).map(([k, v]) => [k, Math.round(v * WUXIA_PACE)])));
export const WUXIA_SHAKE_FRAMES = Object.freeze({
    heavy: { duration: 420, easing: 'steps(3,end)', frames: ['0 0', '-9px 4px', '8px -5px', '-6px 3px', '5px -2px', '-2px 1px', '0 0'], offsets: [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1] },
    light: { duration: 260, easing: 'steps(2,end)', frames: ['0 0', '-4px 2px', '3px -2px', '-2px 1px', '0 0'], offsets: [0, 0.25, 0.5, 0.75, 1] },
});
