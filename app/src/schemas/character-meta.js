// 插件旁路角色资料；不属于 NAI caption。未知身份、重复映射和非法规划位置拒绝绑定。
const blocked = new Set(['__proto__', 'constructor', 'prototype']);
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 4096) => typeof v === 'string' && v.length <= max;
const point = (v) => plain(v) && [v.x, v.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1);

export function checkCharacterMeta(raw, caption, allowedKeys) {
    if (raw === undefined) return { ok: true, value: undefined };
    const fail = (reason, field, issue = 'invalid', captionIndex, detail) => {
        const diagnostic = { code: reason, field, issue,
            ...(Number.isInteger(captionIndex) && captionIndex >= 0 && captionIndex < 16 && { captionIndex }),
            ...(detail && { detail }) };
        const details = [`code=${reason}`, `字段=${field}`, `原因=${issue}`,
            ...(diagnostic.captionIndex !== undefined ? [`captionIndex=${diagnostic.captionIndex}`] : []),
            ...(detail ? [`detail=${detail}`] : [])];
        return { ok: false, reason, diagnostic,
            error: `角色资料无法可靠绑定，原图保持不变 [${details.join('；')}]` };
    };
    if (!plain(raw) || raw.version !== 1 || !Array.isArray(raw.characters) || raw.characters.length > 16)
        return fail('character-meta-shape', 'characterMeta');
    const chars = caption?.v4_prompt?.caption?.char_captions;
    if (!Array.isArray(chars)) return fail('character-meta-caption', 'caption.char');
    const keys = new Set();
    const indexes = new Set();
    const characters = [];
    for (const c of raw.characters) {
        if (!plain(c)) return fail('character-meta-key', 'binding.characterKey');
        if (!text(c.characterKey, 128) || !c.characterKey.trim() || blocked.has(c.characterKey))
            return fail('character-meta-key', 'binding.characterKey', 'invalid', c.captionIndex);
        if (keys.has(c.characterKey)) return fail('character-meta-binding', 'binding.characterKey', 'duplicate', c.captionIndex);
        if (indexes.has(c.captionIndex)) return fail('character-meta-binding', 'binding.captionIndex', 'duplicate', c.captionIndex);
        if (allowedKeys && !allowedKeys.includes(c.characterKey))
            return fail('character-meta-binding', 'binding.characterKey', 'mismatch', c.captionIndex);
        if (!Number.isInteger(c.captionIndex) || c.captionIndex < 0 || c.captionIndex >= chars.length)
            return fail('character-meta-index', 'binding.captionIndex', 'invalid', c.captionIndex);
        keys.add(c.characterKey); indexes.add(c.captionIndex);
        if (!plain(c.outfit)) return fail('character-meta-text', 'meta_outfit_description', 'invalid',
            c.captionIndex, 'object-required');
        for (const [field, value, max] of [['meta_identity', c.identityAnchor, 4096],
            ['meta_signature', c.signatureDetails, 4096], ['meta_outfit_name', c.outfit?.name, 128],
            ['meta_outfit_description', c.outfit?.description, 4096]]) {
            if (!text(value, max)) return fail('character-meta-text', field, 'invalid', c.captionIndex,
                typeof value === 'string' ? 'text-too-long' : 'string-required');
        }
        if (!Array.isArray(c.centers) || c.centers.length > 8 || !c.centers.every(point))
            return fail('character-meta-position', 'caption.char', 'invalid', c.captionIndex);
        const actual = chars[c.captionIndex].centers;
        if (c.centers.length && (!Array.isArray(actual) || actual.length !== c.centers.length || c.centers.some((p, i) => p.x !== actual[i]?.x || p.y !== actual[i]?.y)))
            return fail('character-meta-position-mismatch', 'caption.char', 'mismatch', c.captionIndex);
        const r = c.region;
        if (r !== undefined && (!point(r) || !Number.isFinite(r.width) || !Number.isFinite(r.height) || r.width <= 0 || r.height <= 0 || r.x + r.width > 1 || r.y + r.height > 1))
            return fail('character-meta-region', 'meta_region', 'invalid', c.captionIndex);
        characters.push({ characterKey:c.characterKey, captionIndex: c.captionIndex,
            identityAnchor: c.identityAnchor.trim(), signatureDetails: c.signatureDetails.trim(),
            outfit: { name: c.outfit.name.trim(), description: c.outfit.description.trim() },
            centers: c.centers.map((p) => ({ x: p.x, y: p.y })), positionExplicit: c.positionExplicit === true,
            ...(r && { region: { x: r.x, y: r.y, width: r.width, height: r.height } }) });
    }
    return { ok: true, value: { version: 1, characters } };
}
