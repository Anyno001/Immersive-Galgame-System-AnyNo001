// 恐怖世界观：风格（血腥 / 心理 / 两者兼有）、血腥描写尺度、[igs-dread:N] 恐怖档位标签与时代规则。
// 风格与尺度存在 sceneAssets.horrorStyle / horrorGore（角色卡可单独设置，见 asset-scope.js）；
// 档位标签是纯标记（不显示），对话框皮肤经 horror-dread.js 读取，跨楼层延续到下一次标签改变它。
export const HORROR_STYLES = Object.freeze([
    Object.freeze({ id: 'gore', label: '血腥恐怖' }),
    Object.freeze({ id: 'psych', label: '心理恐怖' }),
    Object.freeze({ id: 'mixed', label: '两者兼有' }),
]);
export const HORROR_STYLE_DEFAULT = 'mixed';
export const HORROR_GORE_LEVELS = Object.freeze([
    Object.freeze({ id: 1, label: '暗示' }),
    Object.freeze({ id: 2, label: '直白' }),
    Object.freeze({ id: 3, label: '重口' }),
]);
export const HORROR_GORE_DEFAULT = 2;

export function normalizeHorrorStyle(value) {
    return HORROR_STYLES.some((item) => item.id === value) ? value : HORROR_STYLE_DEFAULT;
}

export function normalizeHorrorGore(value) {
    const level = Math.round(Number(value));
    return HORROR_GORE_LEVELS.some((item) => item.id === level) ? level : HORROR_GORE_DEFAULT;
}

// 「两者兼有」时对话框皮肤按血腥走；纯心理恐怖走崩坏皮肤。
export function horrorSkinForStyle(style) {
    return normalizeHorrorStyle(style) === 'psych' ? 'horror-psych' : 'horror-gore';
}

export const HORROR_DREAD_TAG_RE = /\[igs-dread:\s*([0-3])\s*\]/g;

// 取 text 中 endOffset 之前（不传则全文）最后一个档位标签的数值；没有返回 null。
export function findLastDreadLevel(text, endOffset) {
    const source = String(text || '');
    const limit = Number.isFinite(endOffset) && endOffset >= 0 ? endOffset : source.length;
    if (source.indexOf('[igs-dread') === -1) return null;
    let level = null;
    for (const match of source.matchAll(HORROR_DREAD_TAG_RE)) {
        if (match.index >= limit) break;
        level = Number(match[1]);
    }
    return level;
}

const GORE_RULES = Object.freeze({
    1: '血腥只用暗示：写声音、影子、气味与事后的痕迹，镜头在伤口出现前移开。',
    2: '血腥可以直白：伤口、血迹、断裂直接写出，但点到为止，不铺陈解剖细节。',
    3: '血腥可以重口：允许身体恐怖与细致的伤损描写，冲击要服务于恐惧，不为猎奇堆砌。',
});

const STYLE_RULES = Object.freeze({
    gore: '基调是血腥恐怖：威胁具体、可见、会追上来，节奏靠逃跑、躲藏与突然的暴力推进。',
    psych: '基调是心理恐怖：日常里出现细小的不对劲，异常不解释，重复出现的细节越来越扭曲；可以让叙述不可靠，让角色和读者都不确定什么是真的。少写血，恐惧来自怀疑与孤立。',
    mixed: '基调在心理恐怖与血腥恐怖之间推进：先用日常里的不对劲慢慢积累不安，真相或威胁露面时再让血腥爆发。',
});

export function buildHorrorPromptRule(sceneAssets) {
    const source = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    const style = normalizeHorrorStyle(source.horrorStyle);
    const lines = [
        '[igs时代背景]',
        `本故事是恐怖题材。${STYLE_RULES[style]}`,
        style === 'psych' ? '' : GORE_RULES[normalizeHorrorGore(source.horrorGore)],
        '上述igs标签里的文字保持现代日常的说法（手机、电话、照片等都可以用，而且常常是恐惧的来源）。',
        '[igs恐怖档位]',
        '用单独一行 [igs-dread:N] 标记当前的恐怖强度，N 取 0–3：0 平静（日常、安全）、1 不安（有点不对劲）、2 危险（威胁逼近、异常加剧）、3 爆发（正面遭遇、失控、最恐怖的瞬间）。',
        '只在强度变化时写这一行，写在变化发生的那段正文之前；强度会一直保持到下一次标签改变它。紧张过去后记得降回来，不要一直停在 3。',
    ];
    return lines.filter(Boolean).join('\n');
}
