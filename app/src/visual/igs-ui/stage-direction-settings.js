import { normalizeEmotionList } from './stage-shake-runtime.js';

const freezeList = (list) => Object.freeze(list.slice());

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function pick(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

export const SCENE_TRANSITION_STYLES = Object.freeze(['fade', 'black', 'wipe', 'iris', 'blinds']);
export const SCENE_TRANSITION_LABELS = Object.freeze({ fade: '淡入淡出', black: '黑场', wipe: '横擦', iris: '圈入', blinds: '百叶窗' });
export const SCENE_TRANSITION_SPEEDS = Object.freeze(['fast', 'medium', 'slow']);

export function normalizeSceneTransitionSettings(value) {
    const src = plain(value);
    return {
        enabled: src.enabled === true,
        style: pick(src.style, SCENE_TRANSITION_STYLES, 'fade'),
        speed: pick(src.speed, SCENE_TRANSITION_SPEEDS, 'medium'),
    };
}

export const TIME_TINT_STRENGTHS = Object.freeze(['light', 'medium', 'strong']);

export function normalizeTimeTintSettings(value) {
    const src = plain(value);
    return { enabled: src.enabled === true, strength: pick(src.strength, TIME_TINT_STRENGTHS, 'medium') };
}

export function normalizeSpriteMotionSettings(value) {
    const src = plain(value);
    return {
        enabled: src.enabled === true,
        breathing: src.breathing !== false,
        castBreathing: src.castBreathing !== false,
        castLean: src.castLean !== false,
        speakBounce: src.speakBounce !== false,
        enterExit: src.enterExit !== false,
    };
}

export const SPRITE_ACTION_KINDS = Object.freeze(['hop', 'recoil', 'sink', 'sway', 'lunge', 'nod', 'shake', 'tremble', 'retreat']);
export const SPRITE_ACTION_LABELS = Object.freeze({
    hop: '轻跳（开心）', recoil: '后仰（惊讶）', sink: '下沉（沮丧）', sway: '摇摆（害羞）', lunge: '前冲（生气）', nod: '点头（认同）',
    shake: '摇头（否认）', tremble: '发抖（害怕）', retreat: '后退（戒备）',
});
export const SPRITE_ACTION_DEFAULTS = Object.freeze({
    hop: freezeList(['开心', '高兴', '欢喜', '兴奋', '雀跃', '喜悦', '欢快', '快乐', '激动']),
    recoil: freezeList(['惊讶', '吃惊', '震惊', '惊恐', '惊吓', '惊慌', '慌张']),
    sink: freezeList(['沮丧', '失落', '难过', '伤心', '悲伤', '低落', '失望', '委屈', '疲惫']),
    sway: freezeList(['害羞', '羞涩', '脸红', '腼腆', '扭捏', '不好意思']),
    lunge: freezeList(['生气', '愤怒', '恼火', '气愤', '暴怒', '不满', '激昂']),
    nod: freezeList(['认同', '同意', '赞同', '肯定', '点头', '理解', '安心']),
    shake: freezeList(['否认', '拒绝', '不行', '摇头', '不信']),
    tremble: freezeList(['害怕', '恐惧', '颤抖', '发抖', '寒冷']),
    retreat: freezeList(['退缩', '畏惧', '戒备', '警惕']),
});

export function normalizeSpriteActionSettings(value) {
    const src = plain(value);
    const out = { enabled: src.enabled === true };
    for (const kind of SPRITE_ACTION_KINDS) out[kind] = normalizeEmotionList(src[kind], SPRITE_ACTION_DEFAULTS[kind]);
    return out;
}

export const CAMERA_CLOSE_UP_DEFAULTS = freezeList(['震惊', '严肃', '认真', '深情', '哭泣', '决然', '冷酷', '坚决']);

export function normalizeCameraSettings(value) {
    const src = plain(value);
    return {
        enabled: src.enabled === true,
        kenBurns: src.kenBurns !== false,
        parallax: src.parallax !== false,
        closeUp: src.closeUp !== false,
        closeUpEmotions: normalizeEmotionList(src.closeUpEmotions, CAMERA_CLOSE_UP_DEFAULTS),
    };
}

// 多角色同屏：实验功能，不进入一键演出档位；人数上限按设备固定，不开放配置。
// romanceDuo（默认关）：恋爱演出时暧昧档保留陪衬退到背景、修罗场对象同台；关闭时有档位即收成单人。
// castReact（默认关）：陪衬反应（react 标签、点名提亮、全员小跳、戳陪衬）；提示词只在开启时注入。
export function normalizeStageCastSettings(value) {
    const src = plain(value);
    return { enabled: src.enabled === true, alignHeads: src.alignHeads !== false, romanceDuo: src.romanceDuo === true, castReact: src.castReact === true, castStage: src.castStage === true };
}

export const STAGE_DIRECTION_NORMALIZERS = Object.freeze({
    sceneTransition: normalizeSceneTransitionSettings,
    timeTint: normalizeTimeTintSettings,
    spriteMotion: normalizeSpriteMotionSettings,
    spriteActions: normalizeSpriteActionSettings,
    camera: normalizeCameraSettings,
    stageCast: normalizeStageCastSettings,
});

export const STAGE_DIRECTION_WORD_LIST_PATHS = Object.freeze([
    ...SPRITE_ACTION_KINDS.map((kind) => `spriteActions.${kind}`),
    'camera.closeUpEmotions',
]);

export function pickSpriteAction(emotion, actions) {
    const target = String(emotion == null ? '' : emotion).trim();
    if (!actions.enabled || !target) return '';
    return SPRITE_ACTION_KINDS.find((kind) => actions[kind].includes(target)) || '';
}

export function pickCloseUp(emotion, camera) {
    const target = String(emotion == null ? '' : emotion).trim();
    return camera.enabled && camera.closeUp && Boolean(target) && camera.closeUpEmotions.includes(target);
}
