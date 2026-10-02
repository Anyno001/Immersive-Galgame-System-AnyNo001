import { DAILY_FX_KINDS, DAILY_FX_PAGE_MAX } from '../../scene/daily-fx-directives.js';

export const DAILY_FX_LABELS = Object.freeze({
    timeskip: '时间跳跃', photo: '拍照', letter: '信件', note: '便签', bell: '校园铃声', broadcast: '广播',
    fireworks: '烟花', touch: '触碰心动', alarm: '闹钟', omikuji: '抽签', receipt: '小票', tv: '电视',
    rps: '猜拳', gacha: '扭蛋', game: '一起打游戏', score: '成绩单', pat: '摸头', poke: '捏脸', fever: '测体温',
    cheers: '碰杯', cook: '做饭', cat: '撸猫',
    guqin: '抚琴', go: '对弈', poem: '题诗', edict: '圣旨 / 告示', tea: '敬茶', bow: '行礼',
    spell: '施咒', potion: '熬魔药', owl: '猫头鹰送信', broom: '骑扫帚', howler: '吼叫信',
});
// 后加的日常类型需显式勾选：旧存档里日常演出已开启的用户不会突然收到新语法。
const DAILY_FX_OPT_IN = new Set(['rps', 'gacha', 'game', 'score', 'pat', 'poke', 'fever', 'cheers', 'cook', 'cat', 'guqin', 'go', 'poem', 'edict', 'tea', 'bow', 'spell', 'potion', 'owl', 'broom', 'howler']);

export function normalizeDailyFxSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = { enabled: src.enabled === true, petals: src.petals !== false, photoAlbum: src.photoAlbum !== false };
    for (const kind of DAILY_FX_KINDS) out[kind] = DAILY_FX_OPT_IN.has(kind) ? src[kind] === true : src[kind] !== false;
    return out;
}

export function enabledDailyFxKinds(settings) {
    const s = normalizeDailyFxSettings(settings);
    return s.enabled ? DAILY_FX_KINDS.filter((kind) => s[kind]) : [];
}

// 聊天页与卡片页本身就是全屏演出；NSFW 场景不插日常小演出。
export function planDailyFx(fx, options = {}) {
    const settings = normalizeDailyFxSettings(options.settings);
    if (!settings.enabled || options.nsfw === true || (options.pageKind && options.pageKind !== 'text')) return [];
    const list = fx && Array.isArray(fx.daily) ? fx.daily : [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
        if (!item || !settings[item.type] || seen.has(item.type)) continue;
        seen.add(item.type);
        out.push(item);
        if (out.length >= DAILY_FX_PAGE_MAX) break;
    }
    return out;
}
