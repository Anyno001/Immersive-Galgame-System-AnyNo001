// 一张角色卡的场景素材包：库、立绘像素、提示词、立绘位置。按角色卡名字认，不认酒馆内部 id。

const PIXEL_FIELDS = ['dataUrl', 'originalDataUrl', 'workingDataUrl', 'alphaMaskDataUrl'];
const FORMAT = 'igs-character-card';

function crc32(bytes) {
    let crc = ~0;
    for (let i = 0; i < bytes.length; i += 1) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return ~crc >>> 0;
}

function zipStore(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
        const name = encoder.encode(file.name);
        const data = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
        const crc = crc32(data);
        const local = new Uint8Array(30 + name.length);
        const view = new DataView(local.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x0800, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, 0, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, data.length, true);
        view.setUint32(22, data.length, true);
        view.setUint16(26, name.length, true);
        view.setUint16(28, 0, true);
        local.set(name, 30);
        parts.push(local, data);
        const cen = new Uint8Array(46 + name.length);
        const cenView = new DataView(cen.buffer);
        cenView.setUint32(0, 0x02014b50, true);
        cenView.setUint16(4, 20, true);
        cenView.setUint16(6, 20, true);
        cenView.setUint16(8, 0x0800, true);
        cenView.setUint16(10, 0, true);
        cenView.setUint16(12, 0, true);
        cenView.setUint16(14, 0, true);
        cenView.setUint32(16, crc, true);
        cenView.setUint32(20, data.length, true);
        cenView.setUint32(24, data.length, true);
        cenView.setUint16(28, name.length, true);
        cenView.setUint16(30, 0, true);
        cenView.setUint16(32, 0, true);
        cenView.setUint16(34, 0, true);
        cenView.setUint16(36, 0, true);
        cenView.setUint32(38, 0, true);
        cenView.setUint32(42, offset, true);
        cen.set(name, 46);
        central.push(cen);
        offset += local.length + data.length;
    }
    let cdSize = 0;
    for (const part of central) cdSize += part.length;
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(8, files.length, true);
    eocdView.setUint16(10, files.length, true);
    eocdView.setUint32(12, cdSize, true);
    eocdView.setUint32(16, offset, true);
    const out = new Uint8Array(offset + cdSize + eocd.length);
    let cursor = 0;
    for (const part of parts) {
        out.set(part, cursor);
        cursor += part.length;
    }
    for (const part of central) {
        out.set(part, cursor);
        cursor += part.length;
    }
    out.set(eocd, cursor);
    return out;
}

function unzipStore(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let eocd = -1;
    const scanFrom = Math.max(0, data.length - 22 - 65535);
    for (let i = data.length - 22; i >= scanFrom; i -= 1) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) return [];
    const count = view.getUint16(eocd + 8, true);
    let cursor = view.getUint32(eocd + 16, true);
    const files = [];
    for (let index = 0; index < count; index += 1) {
        if (cursor + 46 > data.length || view.getUint32(cursor, true) !== 0x02014b50) break;
        const method = view.getUint16(cursor + 10, true);
        const size = view.getUint32(cursor + 20, true);
        const nameLen = view.getUint16(cursor + 28, true);
        const extraLen = view.getUint16(cursor + 30, true);
        const commentLen = view.getUint16(cursor + 32, true);
        const localOff = view.getUint32(cursor + 42, true);
        const name = new TextDecoder().decode(data.subarray(cursor + 46, cursor + 46 + nameLen));
        if (method !== 0) return [];
        const localNameLen = view.getUint16(localOff + 26, true);
        const localExtraLen = view.getUint16(localOff + 28, true);
        const start = localOff + 30 + localNameLen + localExtraLen;
        files.push({ name, bytes: data.slice(start, start + size) });
        cursor += 46 + nameLen + extraLen + commentLen;
    }
    return files;
}

function parseDataUrl(value) {
    const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(String(value || ''));
    if (!match || typeof atob !== 'function') return null;
    const bin = atob(match[2].replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return { mime: match[1], bytes };
}

function bytesToDataUrl(bytes, mime) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return `data:${mime};base64,${btoa(bin)}`;
}

function extOf(mime) {
    const type = String(mime || '').toLowerCase();
    if (type === 'image/png') return 'png';
    if (type === 'image/jpeg') return 'jpg';
    if (type === 'image/webp') return 'webp';
    if (type === 'image/gif') return 'gif';
    return 'bin';
}

function safeId(id) {
    return String(id || '').replace(/[^A-Za-z0-9._-]/g, '_') || 'image';
}

export function spriteEntriesForNames(map, names, withMode) {
    const set = new Set((Array.isArray(names) ? names : []).map((name) => String(name || '').trim()).filter(Boolean));
    const out = {};
    for (const [key, value] of Object.entries(map && typeof map === 'object' ? map : {})) {
        const parts = String(key).split('::');
        if (withMode) parts.shift();
        const character = String(parts[0] || '').split('|')[0];
        if (set.has(character)) out[key] = value;
    }
    return out;
}

export function mergeLabelGroups(current, incoming) {
    const base = (Array.isArray(current) ? current : []).map((group) => ({
        label: String(group && group.label || '').trim(),
        words: Array.isArray(group && group.words) ? group.words.map((word) => String(word || '').trim()).filter(Boolean) : [],
    })).filter((group) => group.label);
    for (const group of Array.isArray(incoming) ? incoming : []) {
        const label = String(group && group.label || '').trim();
        if (!label) continue;
        const words = Array.isArray(group.words) ? group.words.map((word) => String(word || '').trim()).filter(Boolean) : [];
        const found = base.find((item) => item.label === label);
        if (!found) {
            base.push({ label, words: words.length ? words : [label] });
            continue;
        }
        for (const word of words) {
            if (!found.words.includes(word)) found.words.push(word);
        }
    }
    return base;
}

function embedImageRecords(records, files) {
    const images = {};
    (Array.isArray(records) ? records : []).forEach((record, index) => {
        if (!record || !record.id) return;
        const meta = {};
        const stored = {};
        for (const [field, value] of Object.entries(record)) {
            if (!PIXEL_FIELDS.includes(field)) meta[field] = value;
        }
        for (const field of PIXEL_FIELDS) {
            const parsed = parseDataUrl(record[field]);
            if (!parsed) {
                if (typeof record[field] === 'string' && record[field]) meta[field] = record[field];
                continue;
            }
            const name = `images/${index}-${safeId(record.id)}-${field}.${extOf(parsed.mime)}`;
            files.push({ name, bytes: parsed.bytes });
            stored[field] = { name, mime: parsed.mime };
        }
        meta.files = stored;
        images[record.id] = meta;
    });
    return images;
}

function restoreImageRecords(storedImages, byName) {
    const images = [];
    for (const meta of Object.values(storedImages && typeof storedImages === 'object' ? storedImages : {})) {
        if (!meta || typeof meta !== 'object' || !meta.id) continue;
        const record = { ...meta };
        const fileMap = record.files && typeof record.files === 'object' ? record.files : {};
        delete record.files;
        for (const field of PIXEL_FIELDS) {
            const info = fileMap[field];
            if (!info || !byName.has(info.name)) continue;
            record[field] = bytesToDataUrl(byName.get(info.name), info.mime || 'application/octet-stream');
        }
        images.push(record);
    }
    return images;
}

function readPackManifest(bytes) {
    const files = unzipStore(bytes);
    const jsonFile = files.find((file) => file.name === 'pack.json');
    if (!jsonFile) return null;
    try {
        return { files, manifest: JSON.parse(new TextDecoder().decode(jsonFile.bytes)) };
    } catch (error) {
        return null;
    }
}

export function buildCharacterCardPack(input = {}) {
    const files = [];
    const images = embedImageRecords(input.images, files);
    const manifest = {
        format: FORMAT,
        version: 1,
        characterName: String(input.characterName || '').trim(),
        library: input.library && typeof input.library === 'object' ? input.library : {},
        images,
        spriteLayouts: input.spriteLayouts && typeof input.spriteLayouts === 'object' ? input.spriteLayouts : {},
        spriteHeads: input.spriteHeads && typeof input.spriteHeads === 'object' ? input.spriteHeads : {},
        moodGroups: Array.isArray(input.moodGroups) ? input.moodGroups : [],
        timeGroups: Array.isArray(input.timeGroups) ? input.timeGroups : [],
        weatherGroups: Array.isArray(input.weatherGroups) ? input.weatherGroups : [],
        worldview: typeof input.worldview === 'string' ? input.worldview : '',
    };
    files.unshift({ name: 'pack.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) });
    return zipStore(files);
}

export function parseCharacterCardPack(bytes) {
    const packed = readPackManifest(bytes);
    if (!packed) return null;
    const { files, manifest } = packed;
    if (!manifest || manifest.format !== FORMAT || !String(manifest.characterName || '').trim()) return null;
    const byName = new Map(files.map((file) => [file.name, file.bytes]));
    const images = restoreImageRecords(manifest.images, byName);
    return {
        characterName: String(manifest.characterName).trim(),
        library: manifest.library && typeof manifest.library === 'object' ? manifest.library : {},
        images,
        spriteLayouts: manifest.spriteLayouts && typeof manifest.spriteLayouts === 'object' ? manifest.spriteLayouts : {},
        spriteHeads: manifest.spriteHeads && typeof manifest.spriteHeads === 'object' ? manifest.spriteHeads : {},
        moodGroups: Array.isArray(manifest.moodGroups) ? manifest.moodGroups : [],
        timeGroups: Array.isArray(manifest.timeGroups) ? manifest.timeGroups : [],
        weatherGroups: Array.isArray(manifest.weatherGroups) ? manifest.weatherGroups : [],
        worldview: typeof manifest.worldview === 'string' ? manifest.worldview : '',
    };
}

const SETTINGS_FORMAT = 'igs-settings-pack';

// 整份插件配置：基础、阅读器、素材、生图，外加这些设置引用的图片。不含密钥。
export function buildSettingsArchive(input = {}) {
    const files = [];
    const images = embedImageRecords(input.images, files);
    const manifest = {
        format: SETTINGS_FORMAT,
        version: 1,
        settings: input.settings && typeof input.settings === 'object' ? input.settings : {},
        scenePresets: input.scenePresets && typeof input.scenePresets === 'object' ? input.scenePresets : { presets: {}, active: '' },
        images,
    };
    files.unshift({ name: 'pack.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) });
    return zipStore(files);
}

export function parseSettingsArchive(bytes) {
    const packed = readPackManifest(bytes);
    if (!packed) return null;
    const { files, manifest } = packed;
    if (!manifest || manifest.format !== SETTINGS_FORMAT || !manifest.settings || typeof manifest.settings !== 'object') return null;
    const byName = new Map(files.map((file) => [file.name, file.bytes]));
    const presets = manifest.scenePresets && typeof manifest.scenePresets === 'object' ? manifest.scenePresets : {};
    return {
        settings: manifest.settings,
        scenePresets: {
            presets: presets.presets && typeof presets.presets === 'object' ? presets.presets : {},
            active: typeof presets.active === 'string' ? presets.active : '',
        },
        images: restoreImageRecords(manifest.images, byName),
    };
}
