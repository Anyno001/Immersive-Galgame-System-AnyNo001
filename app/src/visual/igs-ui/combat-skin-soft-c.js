// 圆润·方案C（绘本边角）· 战斗中画面：标记与方案A 相同（共用 combat-skin-soft-a.js 的 softBattleHtml），样式换成方案C 的概念稿。
import { softBattleHtml, softWiringCss } from './combat-skin-soft-a.js';
import { COMBAT_SKIN_SOFT_C_CONCEPT_CSS } from './combat-skin-soft-c-concept-style.js';

export const battleHtml = (v, orient) => softBattleHtml(v, orient, 'soft-c');
export const STYLE_TEXT = `${COMBAT_SKIN_SOFT_C_CONCEPT_CSS}${softWiringCss('soft-c')}`;
