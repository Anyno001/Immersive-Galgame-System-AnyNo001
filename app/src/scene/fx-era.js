// 时代背景：场景预设里的「适配古代背景」开关（bridge.sceneAssets.ancient）随预设切换。
// 古代模式按语义过滤演出：现代才有的事物既不写进提示词，也不播放（正文里的标签照常剥离，不会漏字）。
// 古代也有、只是画面还偏现代的演出（时间流逝、字条、书信、烟花、求签…）保留，古风皮另做。
// 实现方式是在注入提示词前、生成阅读器快照前把对应开关拨成关，不改各演出模块自己的判断。
export const FX_ERA_MODERN_ONLY = Object.freeze({
    // notify 在古代模式下换成「家仆通报」（提示词与画面都按时代切换），不在此列。
    fxTags: Object.freeze(['call', 'voicemail', 'contact', 'movie']),
    dailyFx: Object.freeze(['photo', 'bell', 'broadcast', 'alarm', 'receipt', 'tv', 'gacha', 'game', 'score']),
});
// 整块现代专属的功能（enabled 拨成关）。线上聊天在古代模式下换成「书信往来」，不在此列。
export const FX_ERA_MODERN_FEATURES = Object.freeze([]);

export const ANCIENT_ERA_PROMPT_RULE = `[igs时代背景]
本故事发生在古代。上述igs标签里填写的文字一律使用古代的说法与器物：时间写「一炷香后」「次日辰时」这类说法，不写「三小时后」「07:00」；不要出现手机、电话、照片、电视、广播等现代事物。`;

// 古代专属演出：现代模式下拨成关（不写提示词、不播放）；无需过滤时原样返回原对象。
export const FX_ERA_ANCIENT_ONLY = Object.freeze({
    dailyFx: Object.freeze(['guqin', 'go', 'poem', 'edict', 'tea', 'bow']),
});

function stripAncientOnly(readerSettings) {
    let out = null;
    for (const [key, kinds] of Object.entries(FX_ERA_ANCIENT_ONLY)) {
        const group = plain(readerSettings[key]);
        const on = kinds.filter((kind) => group[kind] === true);
        if (!on.length) continue;
        out = out || { ...readerSettings };
        out[key] = { ...group };
        for (const kind of on) out[key][kind] = false;
    }
    return out || readerSettings;
}

export function isAncientEra(sceneAssets) {
    return Boolean(sceneAssets && typeof sceneAssets === 'object' && sceneAssets.ancient === true);
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// 不改入参：古代模式返回拨掉现代专属项的新对象；现代模式只在有古代专属项开启时返回副本，否则原样返回。
export function applyFxEra(readerSettings, ancient) {
    if (!readerSettings || typeof readerSettings !== 'object') return readerSettings;
    if (ancient !== true) return stripAncientOnly(readerSettings);
    const out = { ...readerSettings };
    for (const [key, kinds] of Object.entries(FX_ERA_MODERN_ONLY)) {
        out[key] = { ...plain(out[key]) };
        for (const kind of kinds) out[key][kind] = false;
    }
    for (const key of FX_ERA_MODERN_FEATURES) out[key] = { ...plain(out[key]), enabled: false };
    return out;
}
