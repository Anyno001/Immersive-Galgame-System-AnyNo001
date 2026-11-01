// 照搬概念稿的皮肤登记：每套一个模块，导出 battleHtml(v, orient) 与 STYLE_TEXT。battleHtml 还是 null 的皮肤不算画布皮肤，战斗中沿用原有标记。
// 各套并行落盘时只改自己的 combat-skin-<键>.js，不改本文件。
import { markCanvasSkin } from './combat-skin-canvas.js';
import { COMBAT_SKIN_COMIC_STYLE_TEXT, comicBattleHtml } from './combat-skin-comic.js';
import * as veil from './combat-skin-veil.js';
import * as ink from './combat-skin-ink.js';
import * as tech from './combat-skin-tech.js';
import * as mystic from './combat-skin-mystic.js';
import * as soft_a from './combat-skin-soft-a.js';
import * as soft_c from './combat-skin-soft-c.js';
import * as dark_a from './combat-skin-dark-a.js';
import * as dark_b from './combat-skin-dark-b.js';

const MODULES = { comic: { battleHtml: comicBattleHtml, STYLE_TEXT: COMBAT_SKIN_COMIC_STYLE_TEXT }, 'veil': veil, 'ink': ink, 'tech': tech, 'mystic': mystic, 'soft-a': soft_a, 'soft-c': soft_c, 'dark-a': dark_a, 'dark-b': dark_b };

export const CANVAS_BATTLE = Object.freeze(Object.fromEntries(Object.entries(MODULES).filter(([, m]) => typeof m.battleHtml === 'function').map(([k, m]) => [k, m.battleHtml])));
for (const key of Object.keys(CANVAS_BATTLE)) markCanvasSkin(key);
export const CANVAS_STYLE_TEXT = Object.values(MODULES).map((m) => m.STYLE_TEXT || '').join('\n');
