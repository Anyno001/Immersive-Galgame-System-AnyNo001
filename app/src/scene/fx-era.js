// 时代背景：一键档位条「适配世界」下拉写入 bridge.sceneAssets.worldview（经 scene/worldview.js），古代同时写 ancient。
// 古代模式按语义过滤演出：现代才有的事物既不写进提示词，也不播放（正文里的标签照常剥离，不会漏字）。
// 古代也有、只是画面还偏现代的演出（时间流逝、字条、书信、烟花、求签…）保留，古风皮另做。
// 实现方式是在注入提示词前、生成阅读器快照前把对应开关拨成关，不改各演出模块自己的判断。
import { buildHorrorPromptRule } from './horror.js';

export const FX_ERA_MODERN_ONLY = Object.freeze({
    // notify 在古代模式下换成「家仆通报」（提示词与画面都按时代切换），不在此列。
    fxTags: Object.freeze(['call', 'voicemail', 'contact', 'movie']),
    // 车票、淋浴、吹风机都是近代以后的东西；古代与西幻坐车按马车演，洗浴只留水汽与泼水。
    dailyFx: Object.freeze(['photo', 'bell', 'broadcast', 'alarm', 'receipt', 'tv', 'gacha', 'game', 'score', 'ticket', 'shower', 'hairdry']),
});
// 整块现代专属的功能（enabled 拨成关）。线上聊天在古代模式下换成「书信往来」，不在此列。
export const FX_ERA_MODERN_FEATURES = Object.freeze(['liveFx']);

export const ANCIENT_ERA_PROMPT_RULE = `[igs时代背景]
本故事发生在古代。上述igs标签里填写的文字一律使用古代的说法与器物：时间写「一炷香后」「次日辰时」这类说法，不写「三小时后」「07:00」；不要出现手机、电话、照片、电视、广播等现代事物。`;

// 古代专属演出：现代模式下拨成关（不写提示词、不播放）；无需过滤时原样返回原对象。
export const FX_ERA_ANCIENT_ONLY = Object.freeze({
    dailyFx: Object.freeze(['guqin', 'go', 'poem', 'edict', 'tea', 'bow']),
});
// 魔法世界专属演出：施咒、魔药、猫头鹰送信、骑扫帚、吼叫信，其他世界观一律拨成关。
export const FX_MAGIC_ONLY = Object.freeze({
    dailyFx: Object.freeze(['spell', 'potion', 'owl', 'broom', 'howler']),
});
// 恐怖世界专属演出：停电、敲门、耳边低语。
export const FX_HORROR_ONLY = Object.freeze({
    dailyFx: Object.freeze(['blackout', 'knock', 'murmur']),
});
// 世界观专属演出表：当前世界观以外的表全部拨成关。
export const FX_WORLDVIEW_ONLY = Object.freeze({ ancient: FX_ERA_ANCIENT_ONLY, magic: FX_MAGIC_ONLY, horror: FX_HORROR_ONLY });

function stripExclusive(readerSettings, worldview) {
    let out = null;
    for (const [owner, table] of Object.entries(FX_WORLDVIEW_ONLY)) {
        if (owner === worldview) continue;
        for (const [key, kinds] of Object.entries(table)) {
            const group = plain(out ? out[key] : readerSettings[key]);
            const on = kinds.filter((kind) => group[kind] === true);
            if (!on.length) continue;
            out = out || { ...readerSettings };
            out[key] = { ...group };
            for (const kind of on) out[key][kind] = false;
        }
    }
    return out || readerSettings;
}

export function isAncientEra(sceneAssets) {
    return Boolean(sceneAssets && typeof sceneAssets === 'object' && sceneAssets.ancient === true);
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// 不改入参：古代模式返回拨掉现代专属项的新对象；现代模式只在有其他世界观专属项开启时返回副本，否则原样返回。
export function applyFxEra(readerSettings, ancient) {
    if (!readerSettings || typeof readerSettings !== 'object') return readerSettings;
    if (ancient !== true) return stripExclusive(readerSettings, '');
    const out = { ...stripExclusive(readerSettings, 'ancient') };
    for (const [key, kinds] of Object.entries(FX_ERA_MODERN_ONLY)) {
        out[key] = { ...plain(out[key]) };
        for (const kind of kinds) out[key][kind] = false;
    }
    for (const key of FX_ERA_MODERN_FEATURES) out[key] = { ...plain(out[key]), enabled: false };
    return out;
}


// 西幻 / 科幻 / 末日 / 大正 / 魔法：在现代基线（先拨掉其他世界观专属项）上，再拨掉与该世界观冲突的演出。
// fxTags / dailyFx 列出要拨成关的类型，features 列出整块拨成关（enabled:false）的功能。
export const FX_WORLDVIEW_OFF = Object.freeze({
    // 西幻没有现代电子设备：与古代共用现代专属表。
    fantasy: Object.freeze({ ...FX_ERA_MODERN_ONLY, features: FX_ERA_MODERN_FEATURES }),
    // 科幻保留全部现代演出，画面与说法由换皮和提示词切换。
    scifi: Object.freeze({ features: Object.freeze([]) }),
    // 末日：通讯（对讲机、广播）仍在，末日前才有的日常服务与直播拨掉。
    apocalypse: Object.freeze({
        fxTags: Object.freeze(['movie']),
        dailyFx: Object.freeze(['receipt', 'tv', 'gacha', 'game', 'score', 'ticket', 'hairdry']),
        features: Object.freeze(['liveFx']),
    }),
    // 大正：有座机、电报、照相与活动写真，没有手机社交、电视、扭蛋与电子游戏。
    taisho: Object.freeze({
        fxTags: Object.freeze(['voicemail', 'contact']),
        dailyFx: Object.freeze(['alarm', 'receipt', 'tv', 'gacha', 'game', 'score', 'hairdry']),
        features: Object.freeze(['liveFx']),
    }),
    // 魔法世界没有麻瓜电子设备，传讯靠猫头鹰与魔法；照片会动、城堡有钟声、魔法扩音可作广播，这三项保留。
    magic: Object.freeze({
        fxTags: FX_ERA_MODERN_ONLY.fxTags,
        dailyFx: Object.freeze(['alarm', 'receipt', 'tv', 'gacha', 'game', 'score', 'hairdry']),
        features: FX_ERA_MODERN_FEATURES,
    }),
    // 恐怖：现代日常照常（手机、直播都可以是恐惧来源），只拨掉与氛围相冲的轻快演出。
    horror: Object.freeze({
        dailyFx: Object.freeze(['fireworks', 'gacha', 'game', 'score']),
        features: Object.freeze([]),
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

export const MAGIC_ERA_PROMPT_RULE = `[igs时代背景]
本故事发生在魔法世界（隐藏在现实中的巫师社会与魔法学院）。上述igs标签里填写的文字使用魔法世界的说法与器物：书信由猫头鹰送达，通报写猫头鹰、守护神传话或魔法广播；时间写「宵禁钟声后」「第二节魔药课后」「次日清晨」这类说法，不写「07:00」；照片会动、画像会说话、烛火悬在半空都属寻常；咒语、魔杖、魔药、扫帚、学院、级长、禁林等是日常用语；不要出现手机、电话、电视、网络等麻瓜电子设备，除非剧情明确提到麻瓜世界。`;

export const WORLDVIEW_PROMPT_RULES = Object.freeze({
    ancient: ANCIENT_ERA_PROMPT_RULE,
    fantasy: FANTASY_ERA_PROMPT_RULE,
    scifi: SCIFI_ERA_PROMPT_RULE,
    apocalypse: APOCALYPSE_ERA_PROMPT_RULE,
    taisho: TAISHO_ERA_PROMPT_RULE,
    magic: MAGIC_ERA_PROMPT_RULE,
});

// 现代与未知 id 返回空串（不追加时代规则）；恐怖规则随 sceneAssets 里的风格与血腥尺度生成。
export function resolveWorldviewPromptRule(worldview, sceneAssets) {
    if (worldview === 'horror') return buildHorrorPromptRule(sceneAssets);
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
    const base = stripExclusive(readerSettings, worldview);
    const off = FX_WORLDVIEW_OFF[worldview];
    return off ? stripKinds(base, off) : base;
}
