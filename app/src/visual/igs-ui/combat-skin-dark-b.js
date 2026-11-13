// 恐怖·无影灯（dark-b）· 战斗中画面：标记与 dark-a 相同（装饰层与结束回合灯在 combat-skin-dark-a.js 的 VARIANT 里），样式用概念稿 B.css 那一套。
import { darkBattleHtml, darkRewardRowHtml, darkStyleText } from './combat-skin-dark-a.js';
import { COMBAT_SKIN_DARK_B_CONCEPT_CSS } from './combat-skin-dark-b-concept-style.js';

export const battleHtml = (v, orient) => darkBattleHtml(v, orient, 'dark-b');
export const STYLE_TEXT = darkStyleText('dark-b', COMBAT_SKIN_DARK_B_CONCEPT_CSS);
export const rewardRowHtml = (views, o) => darkRewardRowHtml(views, o, 'dark-b');
