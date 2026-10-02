// 双语台词：正文写作 原文〖译文〗，每个〖〗注音它前面那一段原文（从上一个〗或行首算起）。
export const BILINGUAL_DISPLAYS = Object.freeze(['ruby', 'source', 'translation']);
export const BILINGUAL_DISPLAY_LABELS = Object.freeze({ ruby: '注音', source: '仅原文', translation: '仅译文' });
export const BILINGUAL_FOREIGN_LABELS = Object.freeze({ auto: '按角色设定', ja: '日语', en: '英语' });
export const BILINGUAL_TARGET_LABELS = Object.freeze({ 'zh-Hans': '简体中文', 'zh-Hant': '繁体中文' });

const PAIR_RE = /〖([^〖〗\n]*)〗/g;
const TAG_SPLIT_RE = /(<[^>]*>)/;
// 注音前导的空白、标点和引号留在注音外；已转义的 &quot; 当作引号。
const LEAD_RE = /^(?:\s|&quot;|[、。，,.!?！？…—～~「」『』“”‘’'（）()：:；])*/;
// 分句尾标点。半角分号不算：已转义 HTML 的实体以它结尾。
const CLAUSE_RE = /[^、，,。．.！!？?；…～~]+[、，,。．.！!？?；…～~]*\s*/g;
// 超过这个长度的注音按分句拆开，避免整句注音在窄对话框里无法折行。
const SPLIT_MIN_LENGTH = 14;

const FOREIGN_PHRASES = Object.freeze({ auto: '各自设定的母语（如日语、英语）', ja: '日语', en: '英语' });
const FOREIGN_EXAMPLES = Object.freeze({
    ja: '[igs-char:アリス|微笑|制服|おはよう〖早上好〗、今日はいい天気ですね〖今天天气真好呢〗]',
    en: '[igs-char:Alice|微笑|制服|Morning!〖早上好！〗 Lovely weather today, isn\'t it?〖今天天气真好，对吧？〗]',
});

export function normalizeBilingualSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        enabled: source.enabled === true,
        display: BILINGUAL_DISPLAYS.includes(source.display) ? source.display : 'ruby',
        foreign: Object.hasOwn(BILINGUAL_FOREIGN_LABELS, source.foreign) ? source.foreign : 'auto',
        target: Object.hasOwn(BILINGUAL_TARGET_LABELS, source.target) ? source.target : 'zh-Hans',
    };
}

// 关闭时返回空串：正文里的〖〗原样显示，与未加双语前一致。
export function resolveBilingualDisplay(settings, override) {
    const normalized = normalizeBilingualSettings(settings);
    if (!normalized.enabled) return '';
    return BILINGUAL_DISPLAYS.includes(override) ? override : normalized.display;
}

export function nextBilingualDisplay(display) {
    const index = BILINGUAL_DISPLAYS.indexOf(display);
    return BILINGUAL_DISPLAYS[(index + 1) % BILINGUAL_DISPLAYS.length];
}

export function stripBilingualTranslation(text) {
    return String(text ?? '').replace(PAIR_RE, '');
}

function visibleLength(html) {
    return Array.from(html.replace(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, 'x')).length;
}

function clausePairs(base, translation) {
    if (visibleLength(base) < SPLIT_MIN_LENGTH) return [[base, translation]];
    const bases = base.match(CLAUSE_RE) || [];
    const translations = translation.match(CLAUSE_RE) || [];
    if (bases.length < 2 || bases.length !== translations.length) return [[base, translation]];
    return bases.map((part, index) => [part, translations[index].trim()]);
}

function renderPair(base, translation, display) {
    if (display === 'source') return base;
    if (display === 'translation') return translation;
    if (!base) return translation ? `<span class="igs-bi-loose">${translation}</span>` : '';
    if (!translation) return base;
    return clausePairs(base, translation).map(([part, text]) => {
        const body = part.replace(/\s+$/, '');
        return `<ruby class="igs-bi">${body}<rt>${text}</rt></ruby>${part.slice(body.length)}`;
    }).join('');
}

function renderRun(run, display) {
    if (!run.includes('〖')) return run;
    let out = '';
    let cursor = 0;
    for (const match of run.matchAll(PAIR_RE)) {
        const before = run.slice(cursor, match.index);
        cursor = match.index + match[0].length;
        const lineStart = before.lastIndexOf('\n') + 1;
        const rest = before.slice(lineStart);
        const lead = rest.match(LEAD_RE)[0];
        // 〖前的空白只是原文与译文的分隔，不保留。
        const base = rest.slice(lead.length).replace(/\s+$/, '');
        out += before.slice(0, lineStart) + lead + renderPair(base, match[1].trim(), display);
    }
    return out + run.slice(cursor);
}

// 输入是已转义的对话框 HTML；注音不跨标签（心里话 span 等）配对。
export function renderBilingualHtml(escapedHtml, display) {
    const html = String(escapedHtml ?? '');
    if (!display || !html.includes('〖')) return html;
    return html
        .split(TAG_SPLIT_RE)
        .map((part, index) => (index % 2 === 1 ? part : renderRun(part, display)))
        .join('');
}

export function bilingualGrammarBlock(settings) {
    const s = normalizeBilingualSettings(settings);
    const lang = FOREIGN_PHRASES[s.foreign];
    const target = BILINGUAL_TARGET_LABELS[s.target];
    const example = FOREIGN_EXAMPLES[s.foreign] || FOREIGN_EXAMPLES.ja;
    return `【双语台词】所有角色（包括主角）的对白和心里话用${lang}原文书写，并按分句在原文后紧跟〖${target}译文〗，前端会把译文以注音形式显示在原文上方：
- 写在 [igs-char] 的对白栏和 [igs-thought] 的心里话栏里；不用这些标签时，写在正文的台词和心里话里。如 ${example}
- 每个分句或短句后紧跟一个〖〗，不要整段只在末尾标一次；〖〗内只写译文，不嵌套、不换行
- 旁白照常用${target}书写，不加〖〗；角色名、表情、服装、选项和其他标签字段也不写〖〗
- 本来就是${target}的话不加〖〗；其他行内标记只包住原文，不要跨过〖〗`;
}

export function resolveBilingualPromptRule(settings) {
    if (!normalizeBilingualSettings(settings).enabled) return '';
    return `[igs双语台词]\n${bilingualGrammarBlock(settings)}`;
}

// 注音页加大行高并留出顶部空间：首行译文不被滚动区裁掉，经典打字机测量也不越界。
export const BILINGUAL_STYLE_TEXT = `
#igs-overlay #igs-text:has(ruby.igs-bi){line-height:2.2;padding-top:.3em;}
#igs-overlay #igs-text ruby.igs-bi{ruby-position:over;ruby-align:center;}
#igs-overlay #igs-text ruby.igs-bi>rt{font-size:max(.52em,10px);line-height:1.1;letter-spacing:0;font-style:normal;white-space:nowrap;opacity:.78;}
#igs-overlay #igs-text .igs-bi-loose{margin-left:.2em;font-size:.62em;opacity:.78;}
`;
