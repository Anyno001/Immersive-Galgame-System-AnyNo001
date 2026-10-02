export const TEXT_FX_KINDS = Object.freeze({
    抖: 'shake',
    波: 'wave',
    大: 'big',
    小: 'small',
    淡: 'whisper',
    强: 'strong',
    吼: 'roar',
    渐大: 'grow',
    渐小: 'fade',
});

const TEXT_FX_MAX_GRAPHEMES = 40;
const PER_CHAR_KINDS = new Set(['shake', 'wave', 'grow', 'fade']);
// 渐变类按字序插值字号，需要总字数。
const COUNTED_KINDS = new Set(['grow', 'fade']);
// 弹出类在打字机揭开该段时才播放，见 armTextFx。
const POP_SELECTOR = '.igs-tfx-big,.igs-tfx-roar';
// 半角/全角冒号都接受：模型在中文语境里常顺手写成「：」。
const MARKUP_RE = new RegExp(`\\{(${Object.keys(TEXT_FX_KINDS).join('|')})[:：]([^{}\\n\\r]+)\\}`, 'g');
const TAG_SPLIT_RE = /(<[^>]*>)/;
const ENTITY_SPLIT_RE = /(&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/i;

const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function splitGraphemes(value) {
    if (!value) return [];
    return segmenter ? Array.from(segmenter.segment(value), part => part.segment) : Array.from(value);
}

// 已转义 HTML 里的实体（&amp; 等）算一个字素，绝不拆开。
function htmlGraphemes(html) {
    const out = [];
    html.split(ENTITY_SPLIT_RE).forEach((part, index) => {
        if (!part) return;
        if (index % 2 === 1) out.push(part);
        else out.push(...splitGraphemes(part));
    });
    return out;
}

function acceptInner(inner) {
    if (!inner.trim()) return false;
    return htmlGraphemes(inner).length <= TEXT_FX_MAX_GRAPHEMES;
}

export function normalizeTextFxSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return { enabled: source.enabled === true };
}

export function stripTextFxMarkup(text) {
    return String(text ?? '').replace(MARKUP_RE, (match, _kind, inner) => (acceptInner(inner) ? inner : match));
}

function perCharHtml(inner) {
    let index = 0;
    const body = htmlGraphemes(inner)
        .map((grapheme) => {
            if (/^\s+$/.test(grapheme)) return grapheme;
            const html = `<span class="igs-tfx-ch" style="--i:${index}">${grapheme}</span>`;
            index += 1;
            return html;
        })
        .join('');
    return { body, count: index };
}

function renderRun(run) {
    return run.replace(MARKUP_RE, (match, kind, inner) => {
        if (!acceptInner(inner)) return match;
        const id = TEXT_FX_KINDS[kind];
        if (!PER_CHAR_KINDS.has(id)) return `<span class="igs-tfx igs-tfx-${id}">${inner}</span>`;
        const { body, count } = perCharHtml(inner);
        const style = COUNTED_KINDS.has(id) ? ` style="--n:${count}"` : '';
        return `<span class="igs-tfx igs-tfx-${id}"${style}>${body}</span>`;
    });
}

export function applyTextFxMarkup(escapedHtml, enabled) {
    const html = String(escapedHtml ?? '');
    if (!html.includes('{')) return html;
    return html
        .split(TAG_SPLIT_RE)
        .map((part, index) => {
            if (index % 2 === 1) return part;
            return enabled === true ? renderRun(part) : stripTextFxMarkup(part);
        })
        .join('');
}

// 换正文时先解除，打字机测量完揭开时刻后再武装，弹出动画才能对准该段出现的瞬间。
export function disarmTextFx(textEl) {
    if (textEl && textEl.dataset) delete textEl.dataset.igsTfxArmed;
}

export function armTextFx(textEl, revealDelay) {
    if (!textEl || !textEl.dataset || textEl.dataset.igsTfxArmed === '1') return;
    const pops = typeof textEl.querySelectorAll === 'function' ? textEl.querySelectorAll(POP_SELECTOR) : [];
    for (const el of pops) {
        const ms = typeof revealDelay === 'function' ? Math.max(0, Math.round(Number(revealDelay(el)) || 0)) : 0;
        el.style?.setProperty?.('--igs-tfx-delay', `${ms}ms`);
    }
    textEl.dataset.igsTfxArmed = '1';
}

export function resolveTextFxPromptRule(enabled) {
    if (enabled !== true) return '';
    return `[igs文字演出]
台词或旁白正文中可以用 {效果:文字} 给一小段文字加上演出效果，效果只能从以下9种中选：

1. {抖:文字}：颤抖，用于害怕、寒冷、气到发抖或强忍哭腔，如「{抖:别、别过来……}」
2. {波:文字}：波浪起伏，用于撒娇、哼歌、得意或醉意，如「{波:好开心呀～}」
3. {大:文字}：放大加粗，用于大喊、惊呼等强烈情绪，如「{大:站住！}」
4. {吼:文字}：巨大字号并带冲击震动，只用于怒喝、咆哮、撕心裂肺的呼喊，如「{吼:给我滚出去！}」
5. {渐大:文字}：逐字越来越大，用于情绪层层爆发、越说越激动，如「{渐大:你到底要我怎样啊}」
6. {渐小:文字}：逐字越来越小越淡，用于说着说着没了底气、话音渐渐消失，如「{渐小:其实我……也不是……}」
7. {小:文字}：缩小变淡，用于小声嘀咕、底气不足，如「{小:才、才没有呢}」
8. {淡:文字}：轻淡如耳语，用于耳语、呢喃或远处隐约传来的声音
9. {强:文字}：高亮强调，用于关键词、重要名字或决定性的一句

语法要求：
1. 只写在台词或旁白正文里，不要用于角色名、选项、其他igs标签的字段内
2. 文字只写短语，不超过15个字，不得换行，不得含 { 或 }
3. 不得嵌套，一段文字只用一种效果；冒号用半角 :
4. 每层回复最多使用2处，只在情绪真正需要时使用，不要每层都用；{吼:} 比 {大:} 更重，普通大声说话用 {大:}
5. 不要发明未列出的效果`;
}

export const TEXT_FX_GRAMMAR = Object.freeze([
    ['抖', '害怕、寒冷、气到发抖或强忍哭腔'],
    ['波', '撒娇、哼歌、得意或醉意'],
    ['大', '大喊、惊呼'],
    ['吼', '怒喝、咆哮，比「大」更重'],
    ['渐大', '越说越激动'],
    ['渐小', '说着说着没了底气'],
    ['小', '小声嘀咕'],
    ['淡', '耳语、呢喃或远处隐约的声音'],
    ['强', '关键词、重要名字或决定性的一句'],
]);

export function textFxGrammarBlock() {
    const kinds = TEXT_FX_GRAMMAR.map(([name, use]) => `${name}（${use}）`).join('；');
    return `【文字演出】台词或旁白里可以用 {效果:文字} 给不超过15字的短语加效果，冒号用半角，不嵌套，不用于角色名、选项和标签字段，每层最多2处，只在情绪真正需要时用。效果只有以下${TEXT_FX_GRAMMAR.length}种：${kinds}`;
}

export const TEXT_FX_STYLE_TEXT = `
@keyframes igs-tfx-shake{0%,100%{transform:translate(0,0);}20%{transform:translate(-1px,1px);}40%{transform:translate(1.5px,-1px);}60%{transform:translate(-1.5px,-.5px);}80%{transform:translate(1px,1.5px);}}
@keyframes igs-tfx-wave{0%,100%{transform:translateY(0);}50%{transform:translateY(-.24em);}}
#igs-overlay #igs-text .igs-tfx{white-space:inherit;}
#igs-overlay #igs-text .igs-tfx-ch{display:inline-block;white-space:pre;}
#igs-overlay #igs-text .igs-tfx-shake .igs-tfx-ch{will-change:transform;animation:igs-tfx-shake .36s linear infinite;animation-delay:calc(var(--i,0) * -137ms);}
#igs-overlay #igs-text .igs-tfx-wave .igs-tfx-ch{will-change:transform;animation:igs-tfx-wave 1.4s ease-in-out infinite;animation-delay:calc(var(--i,0) * 90ms - 4.2s);}
@keyframes igs-tfx-pop{0%{opacity:.25;transform:scale(1.4);}60%{opacity:1;transform:scale(.96);}100%{opacity:1;transform:none;}}
@keyframes igs-tfx-roar{0%{opacity:0;transform:scale(2.2);}34%{opacity:1;transform:scale(.9);}46%{transform:scale(1.06) translate(-.06em,.03em);}58%{transform:scale(1) translate(.06em,-.03em);}70%{transform:translate(-.04em,.02em);}84%{transform:translate(.02em,0);}100%{opacity:1;transform:none;}}
#igs-overlay #igs-text .igs-tfx-big{display:inline-block;font-size:1.32em;font-weight:700;line-height:1;transform-origin:50% 65%;}
#igs-overlay #igs-text .igs-tfx-roar{display:inline-block;margin:0 .04em;font-size:1.62em;font-weight:900;line-height:1;letter-spacing:.02em;transform-origin:50% 70%;}
#igs-overlay #igs-text[data-igs-tfx-armed="1"] .igs-tfx-big{animation:igs-tfx-pop .32s cubic-bezier(.2,.9,.3,1.2) var(--igs-tfx-delay,0ms) both;}
#igs-overlay #igs-text[data-igs-tfx-armed="1"] .igs-tfx-roar{animation:igs-tfx-roar .56s cubic-bezier(.2,.9,.3,1) var(--igs-tfx-delay,0ms) both;}
#igs-overlay #igs-text .igs-tfx-grow .igs-tfx-ch,#igs-overlay #igs-text .igs-tfx-fade .igs-tfx-ch{line-height:1;--igs-tfx-t:calc(var(--i,0) / max(var(--n,1) - 1, 1));}
#igs-overlay #igs-text .igs-tfx-grow .igs-tfx-ch{font-size:calc(1em + var(--igs-tfx-t) * .6em);font-weight:700;}
#igs-overlay #igs-text .igs-tfx-fade .igs-tfx-ch{font-size:calc(1em - var(--igs-tfx-t) * .32em);opacity:calc(1 - var(--igs-tfx-t) * .5);}
#igs-overlay #igs-text .igs-tfx-small{font-size:.84em;opacity:.82;}
#igs-overlay #igs-text .igs-tfx-whisper{opacity:.55;letter-spacing:.08em;font-style:italic;}
#igs-overlay #igs-text .igs-tfx-strong{color:var(--igs-tfx-accent,#ffd479);text-shadow:0 0 .4em var(--igs-tfx-glow,rgba(255,196,90,.55));}
#igs-overlay[data-igs-dialog-skin="western-classic"]{--igs-tfx-accent:#ffd98a;--igs-tfx-glow:rgba(255,200,110,.5);}
#igs-overlay[data-igs-dialog-skin="elegant-european"]{--igs-tfx-accent:#e6d8ff;--igs-tfx-glow:rgba(195,180,230,.8);}
#igs-overlay[data-igs-dialog-skin="gradient-veil"]{--igs-tfx-accent:#ffe08f;--igs-tfx-glow:rgba(255,200,110,.45);}
#igs-overlay[data-igs-dialog-skin="retro-japanese"]{--igs-tfx-accent:#b8321f;--igs-tfx-glow:#f5ead3;}
#igs-overlay[data-igs-dialog-skin="adventure-journey"]{--igs-tfx-accent:#8a4f16;--igs-tfx-glow:rgba(255,250,238,.95);}
#igs-overlay[data-igs-dialog-skin="plant-coffee"]{--igs-tfx-accent:#a4492a;--igs-tfx-glow:rgba(255,255,255,.9);}
#igs-overlay[data-igs-dialog-skin="magic-academy"]{--igs-tfx-accent:#f0cf78;--igs-tfx-glow:rgba(255,214,120,.85);}
#igs-overlay[data-igs-dialog-skin="qinglv-shanshui"]{--igs-tfx-accent:#2f5d7c;--igs-tfx-glow:rgba(244,240,229,.9);}
#igs-overlay[data-igs-dialog-skin="warm-picturebook"]{--igs-tfx-accent:#c8553d;--igs-tfx-glow:rgba(255,255,255,.8);}
#igs-overlay[data-igs-dialog-skin="day-minimal"]{--igs-tfx-accent:#b0503f;--igs-tfx-glow:rgba(255,255,255,.9);}
#igs-overlay[data-igs-dialog-skin="black-white-manga"]{--igs-tfx-accent:#000;--igs-tfx-glow:#fff;}
#igs-overlay[data-igs-dialog-skin="black-white-manga"] #igs-text .igs-tfx-strong{font-weight:900;}
#igs-overlay[data-igs-dialog-skin="cute-pink"]{--igs-tfx-accent:#e0467a;--igs-tfx-glow:rgba(255,255,255,.95);}
@media (prefers-reduced-motion: reduce){
#igs-overlay #igs-text .igs-tfx-ch{animation:none!important;will-change:auto!important;}
#igs-overlay #igs-text .igs-tfx-big,#igs-overlay #igs-text .igs-tfx-roar{animation:none!important;}
}
`;
