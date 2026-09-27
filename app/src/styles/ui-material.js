import { IGS_CAUSTIC_ART } from './ui-caustic-art.js';
import { IGS_FROST_NIGHT_RGB } from './glass-material.js';

// 霜夜材质：设置、资料页、地图卡片、toast 共用同一底色与同一套厚度/圆角/墨色，
// 只调不透明度区分层级；模糊全屏只做一层，面板本身不再叠第二层 backdrop。
export const IGS_UI_NIGHT_RGB = IGS_FROST_NIGHT_RGB;
export const IGS_UI_DAY_RGB = '250,250,249';

export const IGS_UI_THICKNESS = Object.freeze({ airy: 0.3, thin: 0.6, regular: 0.64, thick: 0.88 });
export const IGS_UI_RADIUS = Object.freeze({ small: '4px', control: '6px', card: '8px' });
export const IGS_UI_BLUR = 'blur(28px) saturate(150%)';
// 资料页整页：更透、更艳、压暗，场景色被放大成晕染，文字仍有稳定对比。
export const IGS_UI_BLUR_VIVID = 'blur(40px) saturate(185%) brightness(.84)';
export const IGS_UI_PANE = 'rgba(255,255,255,.07)';
export const IGS_UI_PANE_EDGE = 'inset 0 1px 0 rgba(255,255,255,.09)';

export const IGS_UI_INK = Object.freeze({ primary: '#eceae6', secondary: 'rgba(236,234,230,.72)', tertiary: 'rgba(236,234,230,.5)', quaternary: 'rgba(236,234,230,.34)' });
export const IGS_UI_FILL = Object.freeze({ rest: 'rgba(255,255,255,.06)', hover: 'rgba(255,255,255,.1)', active: 'rgba(255,255,255,.16)' });
export const IGS_UI_WARM = '#f2d49b';

export const IGS_UI_ELEVATION = '0 28px 64px -18px rgba(0,0,0,.55)';
export const IGS_UI_EDGE_NIGHT = 'inset 0 1px 0 rgba(255,255,255,.07)';
export const IGS_UI_EDGE_DAY = 'inset 0 1px 0 rgba(255,255,255,.9)';

export const IGS_UI_FONT_SANS = '-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI","Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC",sans-serif';
export const IGS_UI_FONT_SERIF = '"Source Han Serif CN","Noto Serif CJK SC","Noto Serif SC","Songti SC",serif';

const grain = (channel, alpha) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 ${channel} 0 0 0 0 ${channel} 0 0 0 0 ${channel} 0 0 0 ${alpha} 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;
export const IGS_UI_GRAIN_NIGHT = grain(1, '.05');
export const IGS_UI_GRAIN_DAY = grain(0, '.035');

export function igsUiSurface(thickness, theme = 'night') {
    return theme === 'day'
        ? `${IGS_UI_GRAIN_DAY},rgba(${IGS_UI_DAY_RGB},${thickness})`
        : `${IGS_UI_GRAIN_NIGHT},rgba(${IGS_UI_NIGHT_RGB},${thickness})`;
}

// 水底焦散：scripts/caustic-art.mjs 预生成。设置器允许平铺；其余界面只放一张，
// 从左上向右下渐隐，避免规则纹路铺满整页。各界面只调尺度与浓度。
export const IGS_UI_LIQUID_KEYFRAMES = '@keyframes igs-ui-liquid{0%,100%{transform:translate3d(-1.5%,-1%,0)}50%{transform:translate3d(1.5%,1%,0)}}';

// tint：把焦散当遮罩、用纯色填充，纹路颜色随主题高亮色走，而不是固定白线。
export function igsUiLiquidRule(selector, opacity = 1, { tile = false, tint = '' } = {}) {
    const size = 'var(--igs-ui-caustic-size,640px) var(--igs-ui-caustic-size,640px)';
    const repeat = tile ? 'repeat' : 'no-repeat';
    const artwork = tint
        ? `background-color:${tint};-webkit-mask-image:${IGS_CAUSTIC_ART};mask-image:${IGS_CAUSTIC_ART};-webkit-mask-position:left top;mask-position:left top;-webkit-mask-size:${size};mask-size:${size};-webkit-mask-repeat:${repeat};mask-repeat:${repeat};`
        : `background-image:${IGS_CAUSTIC_ART};background-position:left top;background-size:${size};background-repeat:${repeat};`;
    const fade = tile || tint
        ? ''
        : '-webkit-mask-image:linear-gradient(135deg,#000 0%,rgba(0,0,0,.82) 42%,transparent 88%);mask-image:linear-gradient(135deg,#000 0%,rgba(0,0,0,.82) 42%,transparent 88%);';
    return `${selector}{content:"";position:absolute;inset:-4%;z-index:0;pointer-events:none;${artwork}${fade}opacity:${opacity};animation:igs-ui-liquid 60s ease-in-out infinite;will-change:transform;}
@media (prefers-reduced-motion:reduce){${selector}{animation:none;}}
@media (prefers-reduced-transparency:reduce){${selector}{display:none;}}`;
}
