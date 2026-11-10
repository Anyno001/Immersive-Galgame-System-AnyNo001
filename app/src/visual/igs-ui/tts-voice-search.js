import { esc } from './reader-value-utils.js';

const selectSources = new WeakMap();
const languageAliases = [
    ['中文', '汉语 zh chinese'], ['日文', '日语 ja japanese'], ['英文', '英语 en english'],
    ['韩文', '韩语 ko korean'], ['法文', '法语 fr french'], ['德文', '德语 de german'],
    ['西班牙文', '西班牙语 es spanish'], ['葡萄牙文', '葡萄牙语 pt portuguese'],
    ['俄文', '俄语 ru russian'], ['意大利文', '意大利语 it italian'],
    ['阿拉伯文', '阿拉伯语 ar arabic'], ['粤语', 'yue cantonese'],
];
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().trim();

export function matchesTtsVoiceSearch(text, query) {
    // 语言别名只从末尾的语言标记扩展，不把名称中恰好出现的字当成语言。
    const aliases = languageAliases.find(([label]) => text.endsWith(` · ${label}`))?.[1] || '';
    const haystack = normalize(`${text} ${aliases}`);
    return normalize(query).split(/\s+/).every(word => haystack.includes(word));
}

const SEARCH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';

// kind：select 下拉（搜索框默认收起，点下拉旁的放大镜展开）、pool 默认声音候选、lib 声音库列表（后两种搜索框常显）。
export function renderTtsVoiceSearch(key, body, { kind = 'select', label = '声音' } = {}) {
    const input = `<input class="igs-asset-move" type="search" data-tts-voice-search="${esc(key)}" aria-label="搜索${esc(label)}" placeholder="搜索名称、ID或语言" autocomplete="off">`;
    const empty = '<div class="igs-source-filter-note" data-tts-voice-search-empty role="status" hidden>没有匹配的声音</div>';
    const head = `<div class="igs-tts-voice-search" data-tts-voice-search-scope="${esc(key)}" data-tts-voice-search-kind="${kind}">`;
    if (kind !== 'select') return head + input + body + empty + '</div>';
    return head + `<div class="igs-tts-voice-search-row">${body}<details class="igs-tts-voice-search-fold"><summary class="igs-btn-mgr-icon" title="搜索${esc(label)}" aria-label="搜索${esc(label)}">${SEARCH_ICON}</summary></details></div>`
        + input + empty + '</div>';
}

function filterRows(scope, query) {
    let count = 0;
    for (const row of scope.querySelectorAll('[data-tts-voice-row]')) {
        row.hidden = !matchesTtsVoiceSearch(row.getAttribute('data-tts-voice-row'), query);
        if (!row.hidden) count++;
    }
    // 折叠着的文件夹里没有行，保持原样。
    for (const folder of scope.querySelectorAll('.igs-asset-folder')) {
        if (folder.querySelector('[data-tts-voice-row]')) folder.hidden = !folder.querySelector('[data-tts-voice-row]:not([hidden])');
    }
    return count;
}

function filterSelect(scope, query, fresh) {
    const select = scope.querySelector('select');
    if (!select) return 0;
    if (fresh) selectSources.delete(select);
    if (!selectSources.has(select)) selectSources.set(select, [...select.children].map(node => node.cloneNode(true)));
    // 局部 DOM 更新可能先移走当前 option，浏览器此时会自动选中首项。
    // 重绘以最新渲染的 selected 标记恢复，输入时则保留用户当前的实时选择。
    const value = fresh ? (select.querySelector('option[selected]')?.value ?? select.value) : select.value;
    const nodes = [], retained = [];
    let count = 0;
    const keep = option => {
        if (!option.value) return true; // 自动、同台词等入口始终保留。
        if (matchesTtsVoiceSearch(`${option.value} ${option.textContent}`, query)) { count++; return true; }
        if (option.value === value) retained.push(option);
        return false;
    };
    for (const original of selectSources.get(select)) {
        const node = original.cloneNode(true);
        if (node.tagName === 'OPTGROUP') {
            for (const option of [...node.children]) if (!keep(option)) option.remove();
            if (node.children.length) nodes.push(node);
        } else if (keep(node)) nodes.push(node);
    }
    if (retained.length) {
        const group = select.ownerDocument.createElement('optgroup');
        group.label = '当前已选（不符合筛选）';
        group.append(...retained);
        nodes.push(group);
    }
    select.replaceChildren(...nodes);
    select.value = value; // 搜索不能隐式选中第一个匹配项或触发设置保存。
    return count;
}

function filterPool(scope, query) {
    let count = 0;
    for (const button of scope.querySelectorAll('[data-action^="tts-pool-toggle:"]')) {
        const id = decodeURIComponent((button.getAttribute('data-action') || '').split(':').pop());
        button.hidden = !(matchesTtsVoiceSearch(button.textContent, query) || matchesTtsVoiceSearch(`${id} ${button.textContent}`, query));
        if (!button.hidden) count++;
    }
    for (const folder of scope.querySelectorAll('.igs-asset-folder')) {
        const visible = [...folder.querySelectorAll('[data-action^="tts-pool-toggle:"]')].filter(node => !node.hidden).length;
        folder.hidden = !visible;
        const counter = folder.querySelector('.igs-asset-folder-count');
        if (counter) counter.textContent = String(visible);
    }
    return count;
}

export function applyTtsVoiceSearch(input, { fresh = false } = {}) {
    const scope = input.closest('[data-tts-voice-search-scope]');
    if (!scope) return;
    const kind = scope.getAttribute('data-tts-voice-search-kind');
    const count = kind === 'pool' ? filterPool(scope, input.value)
        : kind === 'lib' ? filterRows(scope, input.value) : filterSelect(scope, input.value, fresh);
    const empty = scope.querySelector('[data-tts-voice-search-empty]');
    if (empty) empty.hidden = !normalize(input.value) || count > 0;
}

// 只保留当前设置会话的查询；重绘后以最新声音库重新筛选，不写用户设置或缓存配置。
export function restoreTtsVoiceSearch(root, queries = {}) {
    for (const input of root.querySelectorAll('[data-tts-voice-search]')) {
        input.value = queries[input.getAttribute('data-tts-voice-search')] || '';
        // 还在筛选的下拉保持搜索框展开。
        const fold = input.value ? input.closest('[data-tts-voice-search-scope]')?.querySelector('.igs-tts-voice-search-fold') : null;
        if (fold) fold.open = true;
        applyTtsVoiceSearch(input, { fresh: true });
    }
}
