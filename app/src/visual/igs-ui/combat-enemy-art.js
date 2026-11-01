// 战斗敌人立绘：按图集格子取图。导出名与 v0.39.0 一致。
// 图集不再内嵌 base64，样式只引用 CSS 变量 --igs-enemy-atlas-<主题>（由 combat-enemy-atlas.js 在安装后写到根节点）。
// 对应图集未安装时，enemyArtCell 返回 atlas: 'none'，面板显示中性剪影。
import { ENEMY_ART_BASE_COUNT, ENEMY_ART_KEYS, enemyArtKeyFor } from '../../combat/enemy-art.js';
import { ENEMY_ATLAS_COLS, ENEMY_ATLAS_ROWS, enemyAtlasUrlOf, enemyAtlasVarName } from './combat-enemy-atlas.js';

const PANEL = '#igs-combat-panel';
const THEME_BY_WORLDVIEW = Object.freeze({ fantasy: 'western', magic: 'western', ancient: 'wuxia' });

export const enemyArtThemeOf = worldview => THEME_BY_WORLDVIEW[String(worldview || '')] || 'urban';
const percent = (index, count) => `${count > 1 ? Math.round(index / (count - 1) * 1e4) / 100 : 0}%`;

export function enemyArtCell({ art, name, tier, worldview } = {}) {
    const index = Math.max(0, ENEMY_ART_KEYS.indexOf(enemyArtKeyFor({ art, name, tier })));
    const theme = index < ENEMY_ART_BASE_COUNT ? enemyArtThemeOf(worldview) : 'western';
    const x = percent(index % ENEMY_ATLAS_COLS, ENEMY_ATLAS_COLS);
    const y = percent(Math.floor(index / ENEMY_ATLAS_COLS), ENEMY_ATLAS_ROWS[theme]);
    // 图集未安装：返回占位格，位置字段保持同样的结构。
    if (!enemyAtlasUrlOf(theme)) return { atlas: 'none', x: '0%', y: '0%' };
    return { atlas: theme, x, y };
}

// 中性剪影：只用主题变量着色，形状是一个简单的头肩轮廓蒙版。
const SILHOUETTE = 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Ccircle cx=%2712%27 cy=%279%27 r=%274%27/%3E%3Cpath d=%27M4 22c0-5 3.6-8 8-8s8 3 8 8z%27/%3E%3C/svg%3E")';

export const COMBAT_ENEMY_ART_STYLE_TEXT = [
    `${PANEL} .igs-combat-art{display:block;background-repeat:no-repeat;background-position:var(--ea-x,0) var(--ea-y,0);}`,
    ...Object.entries(ENEMY_ATLAS_ROWS).map(([theme, rows]) => `${PANEL} .igs-combat-art[data-atlas="${theme}"]{background-image:var(${enemyAtlasVarName(theme)});background-size:${ENEMY_ATLAS_COLS * 100}% ${rows * 100}%;}`),
    `${PANEL} .igs-combat-art[data-atlas="none"]{background-color:var(--igs-cb-ink-faint);-webkit-mask:${SILHOUETTE} center bottom / contain no-repeat;mask:${SILHOUETTE} center bottom / contain no-repeat;}`,
    `${PANEL} .igs-combat-track-dot .igs-combat-art{position:absolute;left:12.5%;top:0;width:75%;height:100%;}`,
].join('\n');
