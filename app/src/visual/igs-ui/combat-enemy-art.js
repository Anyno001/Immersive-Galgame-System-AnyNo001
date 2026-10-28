import { ENEMY_ART_BASE_COUNT, ENEMY_ART_KEYS, enemyArtKeyFor } from '../../combat/enemy-art.js';

// 通用敌人图集（app/assets/enemies/*.webp）：透明底 192×256 单格，每行 6 格，格序同 combat/enemy-art.js 的 ENEMY_ART_KEYS。
// 西幻图集含全部格位；都市、武侠只有前 ENEMY_ART_BASE_COUNT 个基础格，其余物种与种族各题材共用西幻那一格。
// 图集地址是构建占位符：app/scripts/build.js 的 inlineEnemyAtlases 把它内嵌为 data URL，只出现在样式表里一次；单位 HTML 只带格位坐标。
const C = '#igs-combat-panel';
const COLUMNS = 6;
const ATLAS_ROWS = Object.freeze({ western: 6, urban: 3, wuxia: 3 });
const ATLAS_URL = Object.freeze({
    western: '__IGS_ENEMY_ATLAS__western.webp__',
    urban: '__IGS_ENEMY_ATLAS__urban.webp__',
    wuxia: '__IGS_ENEMY_ATLAS__wuxia.webp__',
});
// 世界观 → 图集题材：西幻、魔法用西幻；古代用武侠；现代、科幻、末日、恐怖、大正与未知值用都市。
const THEME_OF_WORLDVIEW = Object.freeze({ fantasy: 'western', magic: 'western', ancient: 'wuxia' });
export const enemyArtThemeOf = (worldview) => THEME_OF_WORLDVIEW[String(worldview || '')] || 'urban';

const pct = (i, n) => `${n > 1 ? Math.round((i / (n - 1)) * 10000) / 100 : 0}%`;

// 敌人图格位：art 合法时用 art，否则按名字推断（combat/enemy-art.js）；返回图集与 background-position 百分比。同名、同世界观永远同一格。
export function enemyArtCell({ art, name, tier, worldview } = {}) {
    const index = Math.max(0, ENEMY_ART_KEYS.indexOf(enemyArtKeyFor({ art, name, tier })));
    const atlas = index < ENEMY_ART_BASE_COUNT ? enemyArtThemeOf(worldview) : 'western';
    return { atlas, x: pct(index % COLUMNS, COLUMNS), y: pct(Math.floor(index / COLUMNS), ATLAS_ROWS[atlas]) };
}

export const COMBAT_ENEMY_ART_STYLE_TEXT = [
    `${C} .igs-combat-art{display:block;background-repeat:no-repeat;background-position:var(--ea-x,0) var(--ea-y,0);}`,
    ...Object.entries(ATLAS_ROWS).map(([atlas, rows]) => `${C} .igs-combat-art[data-atlas="${atlas}"]{background-image:url("${ATLAS_URL[atlas]}");background-size:${COLUMNS * 100}% ${rows * 100}%;}`),
    // 行动条圆点：整格按 3:4 缩进圆点（高度占满、水平居中），矮小的怪物也不会只露出空白的上半格。
    `${C} .igs-combat-track-dot .igs-combat-art{position:absolute;left:12.5%;top:0;width:75%;height:100%;}`,
].join('\n');
