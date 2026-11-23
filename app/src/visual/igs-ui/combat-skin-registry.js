// 照搬概念稿的皮肤登记：每套一个模块，导出 battleHtml(v, orient) 与 STYLE_TEXT。battleHtml 还是 null 的皮肤不算画布皮肤，战斗中沿用原有标记。
// 各套并行落盘时只改自己的 combat-skin-<键>.js，不改本文件。
import { markCanvasSkin, REWARD_ROW_CSS } from './combat-skin-canvas.js';
import { COMBAT_SKIN_COMIC_STYLE_TEXT, comicBattleHtml, rewardRowHtml as comicRewardRowHtml } from './combat-skin-comic.js';
import * as veil from './combat-skin-veil.js';
import * as ink from './combat-skin-ink.js';
import * as tech from './combat-skin-tech.js';
import * as mystic from './combat-skin-mystic.js';
import * as soft_a from './combat-skin-soft-a.js';
import * as soft_c from './combat-skin-soft-c.js';
import * as dark_a from './combat-skin-dark-a.js';
import * as dark_b from './combat-skin-dark-b.js';

const MODULES = { comic: { battleHtml: comicBattleHtml, STYLE_TEXT: COMBAT_SKIN_COMIC_STYLE_TEXT, rewardRowHtml: comicRewardRowHtml }, 'veil': veil, 'ink': ink, 'tech': tech, 'mystic': mystic, 'soft-a': soft_a, 'soft-c': soft_c, 'dark-a': dark_a, 'dark-b': dark_b };

export const CANVAS_BATTLE = Object.freeze(Object.fromEntries(Object.entries(MODULES).filter(([, m]) => typeof m.battleHtml === 'function').map(([k, m]) => [k, m.battleHtml])));
for (const key of Object.keys(CANVAS_BATTLE)) markCanvasSkin(key);
export const CANVAS_REWARD = Object.freeze(Object.fromEntries(Object.entries(MODULES).filter(([, m]) => typeof m.rewardRowHtml === 'function').map(([k, m]) => [k, m.rewardRowHtml])));
const CANVAS_ID_RE = /#igs-cx-canvas:where\(\[data-cx="([^"]+)"\]\)/g;
const CARD_OR_RESET_SEL_RE = /\.card(?![\w-])|#igs-cx-canvas:where\(\[data-cx="[^"]+"\]\)\s+(?:\*|svg|button)\s*$/;

function splitTopLevelCommas(selList) {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < selList.length; i += 1) {
        const ch = selList[i];
        if (ch === '(' || ch === '[') depth += 1;
        else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0) {
            out.push(selList.slice(start, i));
            start = i + 1;
        }
    }
    out.push(selList.slice(start));
    return out;
}

// 将各画布皮肤只写在 #igs-cx-canvas 下的 .card 样式与画布根自定义色变量同步覆盖到演出影子容器 .igs-cx-ghost（排除结算奖励行 .igs-cx-rw），
// 确保抽卡、弃牌、拖牌与出牌飞行中的影子卡与手牌视觉 100% 一致，不再出现落位前后样式跳变或回退旧概念样式。
export function mirrorCardRulesForGhost(css) {
    const src = String(css || '');
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        if (src[i] === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            if (end < 0) { out += src.slice(i); break; }
            out += src.slice(i, end + 2);
            i = end + 2;
            continue;
        }
        const brace = src.indexOf('{', i);
        if (brace < 0) { out += src.slice(i); break; }
        const header = src.slice(i, brace);
        // 找到匹配的右花括号
        let depth = 1;
        let j = brace + 1;
        while (j < n && depth > 0) {
            if (src[j] === '/' && src[j + 1] === '*') {
                const cEnd = src.indexOf('*/', j + 2);
                j = cEnd < 0 ? n : cEnd + 2;
                continue;
            }
            if (src[j] === '{') depth += 1;
            else if (src[j] === '}') depth -= 1;
            j += 1;
        }
        const body = src.slice(brace + 1, j - 1);
        const trimmed = header.trim();
        if (trimmed.startsWith('@media') || trimmed.startsWith('@supports') || trimmed.startsWith('@container')) {
            out += `${header}{${mirrorCardRulesForGhost(body)}}`;
        } else if (trimmed.startsWith('@')) {
            out += src.slice(i, j);
        } else if (header.includes('#igs-cx-canvas:where([data-cx="')) {
            const extraVars = [];
            const rewritten = splitTopLevelCommas(header).map((sel) => {
                if (!sel.includes('#igs-cx-canvas:where([data-cx="')) return sel;
                if (CARD_OR_RESET_SEL_RE.test(sel.trim())) {
                    return sel.replace(CANVAS_ID_RE, ':is(#igs-cx-canvas,.igs-cx-ghost:not(.igs-cx-rw)):where([data-cx="$1"])');
                }
                const rootOnly = sel.trim().match(/^#igs-overlay\s+#igs-cx-canvas:where\(\[data-cx="([^"]+)"\]\)$/);
                if (rootOnly && body.includes('--')) {
                    const decls = body.split(';').map((d) => d.trim()).filter((d) => d.startsWith('--') && d.includes(':'));
                    if (decls.length) extraVars.push(`#igs-overlay .igs-cx-ghost:not(.igs-cx-rw):where([data-cx="${rootOnly[1]}"]){${decls.join(';')};}`);
                }
                return sel;
            }).join(',');
            out += `${rewritten}{${body}}${extraVars.length ? `\n${extraVars.join('\n')}` : ''}`;
        } else {
            out += src.slice(i, j);
        }
        i = j;
    }
    return out;
}

export const CANVAS_STYLE_TEXT = `${Object.values(MODULES).map((m) => mirrorCardRulesForGhost(m.STYLE_TEXT || "")).join("\n")}\n${REWARD_ROW_CSS}`;
