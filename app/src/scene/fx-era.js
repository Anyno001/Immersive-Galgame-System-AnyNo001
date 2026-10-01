// 时代背景：一键档位条「适配世界」下拉选古代时写入 bridge.sceneAssets.ancient（经 scene/worldview.js），随场景预设切换。
// 古代模式按语义过滤演出：现代才有的事物既不写进提示词，也不播放（正文里的标签照常剥离，不会漏字）。
// 古代也有、只是画面还偏现代的演出（时间流逝、字条、书信、烟花、求签…）保留，古风皮另做。
// 实现方式是在注入提示词前、生成阅读器快照前把对应开关拨成关，不改各演出模块自己的判断。
export const FX_ERA_MODERN_ONLY = Object.freeze({
    // notify 在古代模式下换成「家仆通报」（提示词与画面都按时代切换），不在此列。
    fxTags: Object.freeze(['call', 'voicemail', 'contact', 'movie']),
    dailyFx: Object.freeze(['photo', 'bell', 'broadcast', 'alarm', 'receipt', 'tv', 'gacha', 'game', 'score']),
});
// 整块现代专属的功能（enabled 拨成关）。线上聊天在古代模式下换成「书信往来」，不在此列。
export const FX_ERA_MODERN_FEATURES = Object.freeze(['liveFx']);

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


// 西幻 / 科幻 / 末日：在现代基线（先拨掉古代专属项）上，再拨掉与该世界观冲突的演出。
// fxTags / dailyFx 列出要拨成关的类型，features 列出整块拨成关（enabled:false）的功能。
export const FX_WORLDVIEW_OFF = Object.freeze({
    // 西幻没有现代电子设备：与古代共用现代专属表。
    fantasy: Object.freeze({ ...FX_ERA_MODERN_ONLY, features: FX_ERA_MODERN_FEATURES }),
    // 科幻保留全部现代演出，画面与说法由换皮和提示词切换。
    scifi: Object.freeze({ features: Object.freeze([]) }),
    // 末日：通讯（对讲机、广播）仍在，末日前才有的日常服务与直播拨掉。
    apocalypse: Object.freeze({
        fxTags: Object.freeze(['movie']),
        dailyFx: Object.freeze(['receipt', 'tv', 'gacha', 'game', 'score']),
        features: Object.freeze(['liveFx']),
    }),
    // 大正：有座机、电报、照相与活动写真，没有手机社交、电视、扭蛋与电子游戏。
    taisho: Object.freeze({
        fxTags: Object.freeze(['voicemail', 'contact']),
        dailyFx: Object.freeze(['alarm', 'receipt', 'tv', 'gacha', 'game', 'score']),
        features: Object.freeze(['liveFx']),
    }),
});

export const FANTASY_ERA_PROMPT_RULE = `[igs时代背景]
本故事发生在西方奇幻世界。上述igs标签里填写的文字一律使用奇幻世界的说法与器物：时间写「钟楼敲过三下后」「次日黎明」这类说法，不写「三小时后」「07:00」；通报写信使、侍从或传讯魔法；不要出现手机、电话、照片、电视、广播等现代事物。`;

export const SCIFI_ERA_PROMPT_RULE = `[igs时代背景]
本故事发生在科幻未来。上述igs标签里填写的文字使用未来科技的说法：通讯写通讯器、全息投影、舰内广播或终端消息，时间可写标准时、舰内时或周期；不要出现马车、烛火、纸质书信等前现代器物，除非剧情明确提到。`;

export const APOCALYPSE_ERA_PROMPT_RULE = `[igs时代背景]
本故事发生在末日之后。上述igs标签里填写的文字使用末日幸存者的说法：通讯写对讲机、短波电台、残存终端或手写字条，时间写「天黑前」「第三天清晨」或幸存天数；物资匮乏，不要写外卖、影院、直播等末日前才有的日常服务。`;

export const TAISHO_ERA_PROMPT_RULE = `[igs时代背景]
本故事发生在大正时代（和洋折衷的近代日本）。上述igs标签里填写的文字使用大正时代的说法与器物：通讯写电报、黑色座机、书信或差人传话，电话指要接线员转接的座机；娱乐写活动写真、留声机、咖啡馆；时间可写钟点；不要出现手机、电视、网络、直播等现代事物。`;

export const WORLDVIEW_PROMPT_RULES = Object.freeze({
    ancient: ANCIENT_ERA_PROMPT_RULE,
    fantasy: FANTASY_ERA_PROMPT_RULE,
    scifi: SCIFI_ERA_PROMPT_RULE,
    apocalypse: APOCALYPSE_ERA_PROMPT_RULE,
    taisho: TAISHO_ERA_PROMPT_RULE,
});

// 现代与未知 id 返回空串（不追加时代规则）。
export function resolveWorldviewPromptRule(worldview) {
    return WORLDVIEW_PROMPT_RULES[worldview] || '';
}

function stripKinds(readerSettings, off) {
    const out = { ...readerSettings };
    for (const key of ['fxTags', 'dailyFx']) {
        const kinds = off[key];
        if (!kinds || !kinds.length) continue;
        out[key] = { ...plain(out[key]) };
        for (const kind of kinds) out[key][kind] = false;
    }
    for (const key of off.features || []) out[key] = { ...plain(out[key]), enabled: false };
    return out;
}

// 按世界观 id 过滤演出，不改入参；ancient 与 applyFxEra(_, true) 完全等价，modern / 未知 id 与 applyFxEra(_, false) 等价。
export function applyFxWorldview(readerSettings, worldview) {
    if (!readerSettings || typeof readerSettings !== 'object') return readerSettings;
    if (worldview === 'ancient') return applyFxEra(readerSettings, true);
    const base = stripAncientOnly(readerSettings);
    const off = FX_WORLDVIEW_OFF[worldview];
    return off ? stripKinds(base, off) : base;
}
