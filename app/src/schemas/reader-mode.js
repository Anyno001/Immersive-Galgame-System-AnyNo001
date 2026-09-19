export const EMBEDDED_READER_MODE = 'embedded';

const READER_MODES = Object.freeze(['pc', 'mobile', 'web', 'fullscreen', EMBEDDED_READER_MODE]);
const STORED_READER_MODES = Object.freeze(['pc', 'mobile', 'web', 'fullscreen', EMBEDDED_READER_MODE, 'default']);

const READER_MODE_LABELS = Object.freeze({
    pc: '电脑',
    mobile: '手机',
    web: '网页全屏',
    fullscreen: '全屏',
    [EMBEDDED_READER_MODE]: '楼层内嵌',
});

export const PUBLIC_READER_MODES = READER_MODES;
export const LEGACY_READER_MODE_KEYS = STORED_READER_MODES;

export function getReaderModeLabel(mode) {
    return READER_MODE_LABELS[mode] || READER_MODE_LABELS.pc;
}

// 五种可用模式用于设置页选择器与校验；存储层额外允许 'default' 桶名。
// 旧值、空值、未知值统一回落 pc，保证历史配置无需迁移即可读取。
export function normalizePublicReaderMode(mode) {
    const value = typeof mode === 'string' ? mode.trim() : mode;
    return READER_MODES.includes(value) ? value : 'pc';
}

export function isEmbeddedReaderMode(mode) {
    return mode === EMBEDDED_READER_MODE;
}
