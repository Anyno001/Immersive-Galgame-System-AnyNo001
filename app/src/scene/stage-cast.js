// 在场名单：当前页之前、同一 [igs-scene] 区间内开过口的角色，最近开口的在前。
// order 是本场景首次开口的先后，渲染层按它排左右，说话人切换时其他人不跳位。
// goneAt 为站位标签「离开」的偏移（{ 角色名: offset }，键可为别名）：最后一次开口早于离开的人不进名单，再次开口即回台。
export function resolveStageCast({ directives, offset, isEligible, keyOf, limit = 3, goneAt = null } = {}) {
    const at = Number(offset);
    if (!Array.isArray(directives) || !Number.isFinite(at) || at < 0) return [];
    const eligible = typeof isEligible === 'function' ? isEligible : () => true;
    const canonical = typeof keyOf === 'function' ? keyOf : (name) => name;
    const max = Math.max(1, Math.floor(Number(limit)) || 1);
    const members = new Map();
    let nextOrder = 0;
    for (const d of directives) {
        if (!d || !(Number(d.offset) <= at)) break;
        if (d.type === 'scene') {
            members.clear();
            nextOrder = 0;
            continue;
        }
        if (d.type !== 'char' && d.type !== 'thought') continue;
        const name = String(d.character || '').trim();
        if (!name || !eligible(name)) continue;
        const key = String(canonical(name) || name);
        const prev = members.get(key);
        members.delete(key);
        members.set(key, { character: key, mood: String(d.mood || '').trim(), order: prev ? prev.order : nextOrder++, at: Number(d.offset) });
        if (members.size > max) members.delete(members.keys().next().value);
    }
    const gone = new Map();
    if (goneAt && typeof goneAt === 'object') {
        for (const [name, at] of Object.entries(goneAt)) {
            const key = String(canonical(name) || name);
            if (Number.isFinite(Number(at))) gone.set(key, Math.max(Number(at), gone.has(key) ? gone.get(key) : -1));
        }
    }
    return Array.from(members.values()).reverse()
        .filter((m) => !(gone.has(m.character) && m.at < gone.get(m.character)))
        .map(({ at, ...m }) => m);
}

// 名单先宽扫再按有无立绘挑人，避免无图角色占掉名额；3 是电脑端同屏上限，窄屏由渲染层再截断。
export const STAGE_CAST_SCAN_LIMIT = 6;
export const STAGE_CAST_MAX_SEATS = 3;

// cast 为 resolveStageCast 的结果（最近开口在前）。resolve(m) 返回陪衬条目或 null（无图）；
// 凑满 seats 后不再解析，只继续找说话人的 order。
// pin 为必须优先保留的角色（修罗场的恋爱对象），先于最近开口的人解析；不在 cast 里时忽略。
export function pickCastMembers(cast, { speakerKey = '', seats = STAGE_CAST_MAX_SEATS - 1, resolve, pin = '' } = {}) {
    const max = Math.max(0, Math.floor(Number(seats)) || 0);
    const members = [];
    let speakerOrder = null;
    const list = Array.isArray(cast) ? cast : [];
    const ordered = pin && pin !== speakerKey ? [...list.filter((m) => m && m.character === pin), ...list.filter((m) => !m || m.character !== pin)] : list;
    for (const m of ordered) {
        if (!m) continue;
        if (speakerKey && m.character === speakerKey) {
            speakerOrder = m.order;
            continue;
        }
        if (members.length >= max || typeof resolve !== 'function') continue;
        const hit = resolve(m);
        if (hit) members.push({ ...hit, order: m.order });
    }
    return { members, speakerOrder };
}


// 点名检测：本页正文里出现了哪些陪衬的名字或别名（characterAliases[主名] = [别名…]）。
// 只认 2 个字以上的名字 / 别名，避免单字名误伤；返回命中的陪衬主名，按 members 顺序。
export const CALLED_CAST_MIN_LENGTH = 2;

export function findCalledCast(text, members, aliases) {
    const body = String(text || '');
    if (!body || !Array.isArray(members) || !members.length) return [];
    const map = aliases && typeof aliases === 'object' ? aliases : {};
    const out = [];
    for (const m of members) {
        const key = String((m && m.character) || '').trim();
        if (!key || out.includes(key)) continue;
        const names = [key, ...(Array.isArray(map[key]) ? map[key] : [])]
            .map((name) => String(name || '').trim())
            .filter((name) => name.length >= CALLED_CAST_MIN_LENGTH);
        if (names.some((name) => body.includes(name))) out.push(key);
    }
    return out;
}
