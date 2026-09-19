const DEFAULT_CHOICE_PATTERNS = Object.freeze([
    /^\s*[（(](\d{1,2})[）)]\s*(.+?)\s*$/gm,
    /^\s*(\d{1,2})[\.、)]\s*(.+?)\s*$/gm,
    /^\s*[-*•]\s*(.+?)\s*$/gm,
    /^\s*(?:选项|选择)\s*(\d{0,2})\s*[:：]\s*(.+?)\s*$/gm,
]);

export function buildChoiceState(input = {}) {
    const settings = normalizeChoiceSettings(input.settings);
    if (!settings.enabled) return emptyChoiceState('disabled', settings);

    const text = String(input.text || '');
    const items = parseChoiceItems(text, input.parserPreset, settings)
        .slice(0, settings.maxCount);

    return {
        visible: items.length > 0,
        items,
        layout: settings.layout,
        sendOnClick: settings.sendOnClick,
        closeAfterSend: settings.closeAfterSend,
        debounceMs: settings.debounceMs,
        parserId: String(input.parserPreset && input.parserPreset.id || ''),
        reason: items.length ? '' : 'no-choices',
    };
}

export function parseChoiceItems(text, parserPreset = null, settings = {}) {
    const source = String(text || '');
    if (!source.trim()) return [];

    const presetItems = parseWithPreset(source, parserPreset);
    const items = presetItems.length ? presetItems : parseWithDefaults(source);
    return uniqueChoiceItems(items)
        .map((item, index) => normalizeChoiceItem(item, index, settings))
        .filter((item) => item.text);
}

function parseWithPreset(source, parserPreset) {
    const data = parserPreset && typeof parserPreset === 'object'
        ? parserPreset.data || parserPreset
        : null;
    const pattern = String(data && data.pattern || '').trim();
    if (!pattern) return [];

    try {
        const flags = normalizeRegexFlags(data.flags || 'gm');
        const regex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
        const output = [];
        let match = null;
        while ((match = regex.exec(source))) {
            const groups = match.slice(1).map((value) => String(value || '').trim()).filter(Boolean);
            const label = groups.length > 1 ? groups[0] : String(output.length + 1);
            const text = groups.length ? groups[groups.length - 1] : String(match[0] || '').trim();
            if (text) output.push({ label, text, source: 'preset' });
            if (!match[0]) regex.lastIndex += 1;
        }
        return output;
    } catch (error) {
        return [];
    }
}

function parseWithDefaults(source) {
    const output = [];
    for (const regex of DEFAULT_CHOICE_PATTERNS) {
        regex.lastIndex = 0;
        let match = null;
        while ((match = regex.exec(source))) {
            const text = String(match[2] || match[1] || '').trim();
            const label = match[2] ? String(match[1] || output.length + 1).trim() : String(output.length + 1);
            if (text) output.push({ label, text, source: 'default' });
            if (!match[0]) regex.lastIndex += 1;
        }
        if (output.length) break;
    }
    return output;
}

function uniqueChoiceItems(items) {
    const seen = new Set();
    const output = [];
    for (const item of items || []) {
        const text = String(item && item.text || '').trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(item);
    }
    return output;
}

function normalizeChoiceItem(item, index, settings) {
    const label = String(item && item.label || index + 1).trim() || String(index + 1);
    const text = String(item && item.text || '').trim();
    const sendText = applySendTemplate(settings.sendTemplate, { label, text, index });
    return {
        id: `choice-${index + 1}`,
        label,
        text,
        sendText,
        source: item && item.source || 'default',
    };
}

function applySendTemplate(template, choice) {
    const source = String(template || '').trim();
    if (!source) return choice.text;
    return source
        .replace(/\{\{\s*label\s*\}\}/g, choice.label)
        .replace(/\{\{\s*text\s*\}\}/g, choice.text)
        .replace(/\{\{\s*index\s*\}\}/g, String(choice.index + 1));
}

function normalizeChoiceSettings(settings = {}) {
    return {
        enabled: settings.enabled !== false,
        layout: ['floating', 'bottom-sheet', 'inline'].includes(settings.layout) ? settings.layout : 'floating',
        sendOnClick: settings.sendOnClick !== false,
        closeAfterSend: settings.closeAfterSend !== false,
        debounceMs: clampNumber(settings.debounceMs, 0, 5000, 350),
        maxCount: clampNumber(settings.maxCount, 1, 32, 8),
        sendTemplate: String(settings.sendTemplate || ''),
    };
}

function emptyChoiceState(reason, settings) {
    return {
        visible: false,
        items: [],
        layout: settings.layout,
        sendOnClick: settings.sendOnClick,
        closeAfterSend: settings.closeAfterSend,
        debounceMs: settings.debounceMs,
        parserId: '',
        reason,
    };
}

function normalizeRegexFlags(flags) {
    return Array.from(new Set(String(flags || '').replace(/[^dgimsuvy]/g, '').split(''))).join('');
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(numeric)));
}
