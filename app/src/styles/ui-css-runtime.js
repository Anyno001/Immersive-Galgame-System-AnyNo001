const CSS_PRESET_TYPES = Object.freeze([
    'theme-preset',
    'ui-layout-preset',
    'ui-skin-preset',
    'css-preset',
]);

export function buildUiCssRuntime(input = {}) {
    const ui = normalizeUiSettings(input.ui);
    const catalog = input.catalog || {};
    const sources = [];
    const blocks = [];

    if (!ui.cssPresetsEnabled) {
        return { css: '', sources, skipped: ['css-presets-disabled'] };
    }

    for (const type of CSS_PRESET_TYPES) {
        const id = resolveCssPresetId(type, ui, catalog);
        const item = id ? findCatalogItem(catalog, type, id) : findCurrentCatalogItem(catalog, type);
        const css = extractCssFromItem(item);
        if (!css) continue;
        sources.push({ type, id: item.id, name: item.name || item.label || item.id });
        blocks.push(`/* ${type}:${item.id} */\n${css}`);
    }

    if (ui.customCss) {
        sources.push({ type: 'custom-css', id: 'settings', name: '用户 CSS' });
        blocks.push(`/* custom-css */\n${ui.customCss}`);
    }

    const css = filterCssForScope(blocks.join('\n\n'), ui);
    return {
        css,
        sources,
        skipped: css ? [] : (blocks.length ? ['blocked-by-scope'] : []),
    };
}

function resolveCssPresetId(type, ui, catalog) {
    if (type === 'ui-skin-preset') return ui.currentSkin === 'default' ? '' : ui.currentSkin;
    if (type === 'css-preset') return ui.cssPreset;
    return String(catalog && catalog.current && catalog.current[type] || '').trim();
}

function findCurrentCatalogItem(catalog, type) {
    const id = String(catalog && catalog.current && catalog.current[type] || '').trim();
    return id ? findCatalogItem(catalog, type, id) : null;
}

function findCatalogItem(catalog, type, id) {
    const items = catalog && catalog.items && Array.isArray(catalog.items[type])
        ? catalog.items[type]
        : [];
    return items.find((item) => String(item && item.id || '') === String(id || '')) || null;
}

function extractCssFromItem(item) {
    const data = item && typeof item === 'object' ? item.data || item : null;
    if (!data) return '';
    return String(
        data.css
        || data.customCss
        || data.cssText
        || data.style
        || data.styles
        || '',
    ).trim();
}

function filterCssForScope(css, ui) {
    const source = String(css || '').trim();
    if (!source) return '';
    if (ui.advancedCssEnabled && ui.cssScope === 'advanced') {
        return stripDangerousCss(source);
    }

    const safeBlocks = [];
    const withoutImports = stripDangerousCss(source);
    appendSafeCssBlocks(safeBlocks, withoutImports);
    return safeBlocks.join('\n');
}

function stripDangerousCss(css) {
    return String(css || '')
        .replace(/@import[^;]+;/gi, '')
        .replace(/url\s*\(\s*(['"]?)javascript:[\s\S]*?\1\s*\)/gi, 'url("")');
}

function appendSafeCssBlocks(output, css) {
    for (const block of parseTopLevelBlocks(css)) {
        if (!block.prelude || !block.body) continue;
        if (isSafeAtRule(block.prelude)) {
            const nested = [];
            appendSafeCssBlocks(nested, block.body);
            if (nested.length) {
                output.push(`${block.prelude}{\n${nested.join('\n')}\n}`);
            }
            continue;
        }
        if (isSafeVnSelector(block.prelude)) {
            output.push(`${block.prelude}{${block.body}}`);
        }
    }
}

function parseTopLevelBlocks(css) {
    const source = String(css || '');
    const blocks = [];
    let cursor = 0;
    while (cursor < source.length) {
        const open = source.indexOf('{', cursor);
        if (open < 0) break;
        const prelude = cleanCssPrelude(source.slice(cursor, open));
        const close = findMatchingBrace(source, open);
        if (close < 0) break;
        blocks.push({
            prelude,
            body: source.slice(open + 1, close).trim(),
        });
        cursor = close + 1;
    }
    return blocks;
}

function findMatchingBrace(source, openIndex) {
    let depth = 0;
    let quote = '';
    for (let index = openIndex; index < source.length; index += 1) {
        const char = source[index];
        const previous = source[index - 1];
        if (quote) {
            if (char === quote && previous !== '\\') quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function cleanCssPrelude(value) {
    return String(value || '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

function isSafeAtRule(prelude) {
    const text = String(prelude || '').trim().toLowerCase();
    return text.startsWith('@media ') || text.startsWith('@supports ');
}

function isSafeVnSelector(selector) {
    const text = String(selector || '').trim();
    if (!text) return false;
    return text.split(',')
        .map((part) => part.trim())
        .every((part) => /^(#igs-|\.igs-|\[data-igs-)/.test(part));
}

function normalizeUiSettings(ui = {}) {
    return {
        currentSkin: String(ui.currentSkin || ''),
        cssPreset: String(ui.cssPreset || ''),
        cssScope: ui.cssScope === 'advanced' ? 'advanced' : 'igs-only',
        cssPresetsEnabled: ui.cssPresetsEnabled !== false,
        advancedCssEnabled: ui.advancedCssEnabled === true,
        customCss: String(ui.customCss || ''),
    };
}
