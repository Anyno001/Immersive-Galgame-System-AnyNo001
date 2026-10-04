import { HEAD_ASPECT, spriteDrawRect, spriteWidthPercent } from './fx-anchor.js';
import { normalizeEmotionList } from './stage-shake-runtime.js';

// 亲密演出：无 CG 的恋爱 / 暧昧 / 情事氛围。档位 1 暧昧、2 亲密来自 [igs-fx:romance] 区间，3 情事来自场景 nsfw 标记。
export const ROMANCE_STRENGTHS = Object.freeze(['weak', 'medium', 'strong']);
export const ROMANCE_STRENGTH_SCALE = Object.freeze({ weak: 0.6, medium: 1, strong: 1.3 });
export const ROMANCE_SWAY_LEVELS = Object.freeze(['off', 'weak', 'medium', 'strong']);
const FX_LEVEL = Object.freeze({ ambiguous: 1, intimate: 2 });

// 中档基准：pull 为立绘向中线收拢的比例，zoom 为以头部为原点的放大倍数，其余为环境层不透明度与背景柔焦像素。
export const ROMANCE_LEVEL_PARAMS = Object.freeze({
    1: Object.freeze({ pull: 0.35, zoom: 1.04, bgBlur: 0, glow: 0.55, bokeh: 0.45, backlight: 0 }),
    2: Object.freeze({ pull: 0.65, zoom: 1.1, bgBlur: 2.5, glow: 0.8, bokeh: 0.7, backlight: 0.45 }),
    3: Object.freeze({ pull: 0.85, zoom: 1.16, bgBlur: 3.5, glow: 0.6, bokeh: 0.4, backlight: 1 }),
});

// 好感常驻氛围（0.5 档）：只开很淡的暖光与稀疏光斑，不逼近、不柔焦背景，不占用整数档位。
export const ROMANCE_FAVOR_PARAMS = Object.freeze({ pull: 0, zoom: 1, bgBlur: 0, glow: 0.3, bokeh: 0.2, backlight: 0 });
export const ROMANCE_FAVOR_THRESHOLDS = Object.freeze([40, 60, 80]);
export const ROMANCE_FAVOR_WORDS = Object.freeze(['好感', '好感度', '爱意', '心动']);

// 立绘快捷动作：模板里的 {角色} 替换为当前立绘角色名，选中后写入输入框、不自动发送。
export const ROMANCE_ACTIONS_MAX = 8;
const ACTION_NAME_MAX = 8;
const ACTION_TEXT_MAX = 60;
export const ROMANCE_ACTION_DEFAULTS = Object.freeze([
    Object.freeze({ name: '牵手', text: '（轻轻牵起{角色}的手）' }),
    Object.freeze({ name: '摸头', text: '（伸手摸了摸{角色}的头）' }),
    Object.freeze({ name: '拥抱', text: '（把{角色}轻轻拥进怀里）' }),
    Object.freeze({ name: '凝视', text: '（静静地注视着{角色}的眼睛）' }),
    Object.freeze({ name: '搭话', text: '（对{角色}说：）' }),
]);

// 编辑中允许名称或模板暂时为空（逐字输入时不能让整行消失）；菜单只列出两者都有的项。
export function normalizeRomanceActions(value) {
    if (!Array.isArray(value)) return ROMANCE_ACTION_DEFAULTS.map((item) => ({ ...item }));
    const out = [];
    for (const item of value) {
        if (!item || typeof item !== 'object' || out.length >= ROMANCE_ACTIONS_MAX) continue;
        out.push({
            name: String(item.name == null ? '' : item.name).slice(0, ACTION_NAME_MAX),
            text: String(item.text == null ? '' : item.text).slice(0, ACTION_TEXT_MAX),
        });
    }
    return out;
}

export function fillRomanceAction(template, character) {
    const name = String(character || '').trim() || '对方';
    return String(template || '').split('{角色}').join(name);
}

// NSFW 场景内强度曲线：前 3 页渐强、中段保持、在本楼层内结束时最后 2 页回落。
const CURVE_RAMP = Object.freeze([0.55, 0.8]);
const CURVE_FALL = Object.freeze([0.6, 0.8]);

// flags 为本楼每页是否 NSFW；continued 表示本楼第一页的 NSFW 延续自上一楼层。
// 返回当前页所在连续段 { index, length, continued, endsInFloor }，当前页不是 NSFW 时返回 null。
export function resolveNsfwSpan(flags, current, continued = false) {
    if (!Array.isArray(flags) || flags[current] !== true) return null;
    let start = current;
    while (start > 0 && flags[start - 1] === true) start -= 1;
    let end = current;
    while (end < flags.length - 1 && flags[end + 1] === true) end += 1;
    return {
        index: current - start,
        length: end - start + 1,
        continued: start === 0 && continued === true,
        endsInFloor: end < flags.length - 1,
    };
}

// 延续上一楼层的段不再渐强；延续到楼层末尾的段不回落（不知道下一楼层何时结束）。
export function nsfwCurveFactor(span) {
    if (!span) return 1;
    let factor = 1;
    if (!span.continued && span.index < CURVE_RAMP.length) factor = CURVE_RAMP[span.index];
    const fromEnd = span.length - 1 - span.index;
    if (span.endsInFloor && fromEnd < CURVE_FALL.length) factor = Math.min(factor, CURVE_FALL[fromEnd]);
    return factor;
}

// 系数只缩放氛围强度（逼近幅度、放大、柔焦、暖光、光斑、逆光），不影响剪影显隐。
export function scaleRomanceParams(params, factor) {
    if (!params || !(factor < 1)) return params;
    const k = Math.max(0, factor);
    return {
        pull: round(params.pull * k),
        zoom: round(1 + (params.zoom - 1) * k),
        bgBlur: round(params.bgBlur * k, 2),
        glow: round(params.glow * k),
        bokeh: round(params.bokeh * k),
        backlight: round(params.backlight * k),
    };
}

// 剪影从下巴往下 0.25 个头高开始，过渡带 0.5 个头高，避免「断头」观感。
const SHADE_NECK_OFFSET = 0.25;
const SHADE_FEATHER = 0.5;

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function round(value, digits = 3) {
    return Number(value.toFixed(digits));
}

export function normalizeRomanceFxSettings(value) {
    const src = plain(value);
    return {
        enabled: src.enabled === true,
        strength: ROMANCE_STRENGTHS.includes(src.strength) ? src.strength : 'medium',
        approach: src.approach !== false,
        glow: src.glow !== false,
        bokeh: src.bokeh !== false,
        backlight: src.backlight !== false,
        favorAmbience: src.favorAmbience === true,
        favorWords: normalizeEmotionList(src.favorWords, ROMANCE_FAVOR_WORDS),
        favorThreshold: ROMANCE_FAVOR_THRESHOLDS.includes(Number(src.favorThreshold)) ? Number(src.favorThreshold) : 60,
        relationCard: src.relationCard === true,
        rival: src.rival === true,
        confess: src.confess === true,
        memories: src.memories === true,
        nsfwCurve: src.nsfwCurve !== false,
        softSound: src.softSound !== false,
        nsfwSound: src.nsfwSound === true,
        rhythm: src.rhythm === true,
        rhythmSound: src.rhythmSound !== false,
        sway: ROMANCE_SWAY_LEVELS.includes(src.sway) ? src.sway : 'medium',
        edgeFx: src.edgeFx !== false,
        senses: src.senses !== false,
        senseWords: src.senseWords !== false,
        cgPan: src.cgPan !== false,
        undress: src.undress !== false,
        solo: src.solo !== false,
        quickActions: src.quickActions === true,
        actions: normalizeRomanceActions(src.actions),
    };
}

// 状态栏指标里标签精确命中好感词表的百分比取最大值；没有命中返回 null。
export function pickFavorPercent(metrics, words) {
    if (!Array.isArray(metrics) || !Array.isArray(words)) return null;
    let best = null;
    for (const metric of metrics) {
        const label = String((metric && metric.label) || '').trim();
        const value = Number(metric && metric.percent);
        if (!words.includes(label) || !Number.isFinite(value)) continue;
        if (best == null || value > best) best = value;
    }
    return best;
}

// 0 = 无；NSFW 场景恒为 3；聊天页与 HTML 卡片页没有立绘舞台，不进入亲密演出。
export function resolveRomanceLevel({ settings, fx, nsfw, pageKind } = {}) {
    if (!normalizeRomanceFxSettings(settings).enabled || (pageKind && pageKind !== 'text')) return 0;
    if (nsfw === true) return 3;
    return FX_LEVEL[fx && fx.romance] || 0;
}


// 修罗场对象（纯函数）：romance 区间的对象栏写了人、且不是当前说话人时返回对象的角色名，否则 ''。
// 对象栏缺省时不算修罗场（不依赖 romance-runtime 的区间缓存）；keyOf 用于别名归一。
export function resolveRomanceRivalTarget(fx, speakerKey, keyOf = (name) => name) {
    const f = fx && typeof fx === 'object' ? fx : {};
    if (!FX_LEVEL[f.romance] || Number(f.romanceAt) < 0) return '';
    const raw = String(f.romanceTarget || '').trim();
    const speaker = String(speakerKey || '').trim();
    if (!raw || !speaker) return '';
    const target = String(keyOf(raw) || raw);
    return target !== speaker ? target : '';
}

// level 为 1 / 2 / 3，或 'favor'（好感常驻 0.5 档）。
export function resolveRomanceParams(level, strength) {
    const base = level === 'favor' ? ROMANCE_FAVOR_PARAMS : ROMANCE_LEVEL_PARAMS[level];
    if (!base) return null;
    const k = ROMANCE_STRENGTH_SCALE[strength] || 1;
    const cap = (v) => round(Math.min(1, v * k));
    return {
        pull: cap(base.pull),
        zoom: round(1 + (base.zoom - 1) * k),
        bgBlur: round(base.bgBlur * k, 2),
        glow: cap(base.glow),
        bokeh: cap(base.bokeh),
        backlight: cap(base.backlight),
    };
}

// 头部在舞台上的矩形（像素）；缺原图尺寸或头部时返回 null。
function headBox(stageW, stageH, sprite, head) {
    if (!head) return null;
    const rect = spriteDrawRect(stageW, stageH, sprite);
    if (!rect) return null;
    const w = head.w * rect.w;
    const h = w * HEAD_ASPECT;
    return { cx: rect.left + head.x * rect.w, top: rect.top + head.top * rect.h, w, h };
}

// 逼近：立绘 background-position 为 posX% 时，居中所需位移 = (1 - 图宽%) × (50 - posX)，单位为舞台宽度 %。
// 放大原点取头部中心（舞台 %），脸基本不动、身体向下超出对话框；缺头部数据时退回现有特写的原点。
export function computeRomanceApproach({ stageW, stageH, sprite, head, params } = {}) {
    if (!sprite || !params) return null;
    const posX = Number.isFinite(Number(sprite.posX)) ? Number(sprite.posX) : 50;
    const widthPct = spriteWidthPercent(stageW, stageH, sprite);
    const dx = (1 - widthPct / 100) * (50 - posX) * params.pull;
    const box = stageW > 0 && stageH > 0 ? headBox(stageW, stageH, sprite, head) : null;
    return {
        dx: round(dx, 2),
        zoom: params.zoom,
        originX: box ? round(box.cx / stageW * 100, 2) : posX,
        originY: box ? round((box.top + box.h / 2) / stageH * 100, 2) : 28,
    };
}

// 仅露脸剪影的颈线（舞台高度 %）；只信任手动标定的头部，其余返回 null → 整张剪影。
export function computeShadeNeck({ stageW, stageH, sprite, head } = {}) {
    if (!(stageW > 0) || !(stageH > 0)) return null;
    const box = headBox(stageW, stageH, sprite, head);
    if (!box) return null;
    const neck = box.top + box.h * (1 + SHADE_NECK_OFFSET);
    return { neck: round(neck / stageH * 100, 2), end: round((neck + box.h * SHADE_FEATHER) / stageH * 100, 2) };
}
