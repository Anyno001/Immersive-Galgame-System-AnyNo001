import * as tech from './combat-result-tech.js';
import * as mystic from './combat-result-mystic.js';
import * as darkA from './combat-result-dark-a.js';
import * as softA from './combat-result-soft-a.js';
import * as softC from './combat-result-soft-c.js';

// 按皮肤键登记的结算版式；未登记的皮肤走 combat-stage-fx.js 的通用 resultStageHtml。
export const RESULT_SKINS = Object.freeze({ tech, mystic, 'dark-a': darkA, 'soft-a': softA, 'soft-c': softC });
export const RESULT_SKINS_CSS = Object.values(RESULT_SKINS).map((m) => m.css).filter(Boolean).join('\n');
