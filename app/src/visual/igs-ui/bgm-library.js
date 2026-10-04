import { BGM_MOODS, normalizeBgmMood } from '../../scene/bgm-moods.js';
import { resolveWeatherFxKind, resolveWeatherFxTime } from './weather-fx-runtime.js';

export { BGM_MOODS, BGM_MOOD_LABELS, normalizeBgmMood } from '../../scene/bgm-moods.js';

// 背景音乐选曲：AI 只在情绪转折时写一个情绪字（[igs-fx:bgm|悲]），本地按情绪分池，再按地点归类的场景、时段、天气加分；
// 同分的曲目轮流播放、一轮内不重复；情绪与场景不变时一直放当前这首。用户自己写的地点关键词权重最高。

// 某个情绪池在当前世界观里没有曲子时，依次借用相近的池。
const MOOD_FALLBACK = Object.freeze({
    daily: ['calm', 'cheerful'], cheerful: ['daily'], sweet: ['calm', 'daily'], calm: ['daily', 'sweet'],
    sad: ['calm'], tense: ['eerie', 'battle'], battle: ['tense'], eerie: ['tense'],
});

export const BGM_PACKS = Object.freeze(['modern', 'ancient', 'magic']);
export const BGM_PACK_LABELS = Object.freeze({ modern: '现代', ancient: '古风', magic: '魔法·奇幻' });

export const BGM_SCENES = Object.freeze(['festival', 'dungeon', 'shrine', 'bar', 'shop', 'palace', 'school', 'home', 'sea', 'village', 'nature', 'street']);
export const BGM_SCENE_LABELS = Object.freeze({
    festival: '祭典', dungeon: '地下', shrine: '寺社', bar: '酒馆', shop: '店铺', palace: '宫廷', school: '校园',
    home: '家中', sea: '海边', village: '村庄', nature: '自然', street: '街市',
});
// 顺序即优先级：「神社前的夜市」先归祭典，「学校图书馆」先归校园。
const SCENE_WORDS = Object.freeze({
    festival: ['祭', '庙会', '夜市', '灯会', '烟火', '花火', '游乐园', '集市'],
    dungeon: ['地牢', '地下', '洞', '遗迹', '墓', '密室', '迷宫', '废墟', '矿', '下水道'],
    shrine: ['神社', '寺', '庙', '教堂', '祠', '佛堂', '道观', '修道院', '神殿'],
    bar: ['酒吧', '酒馆', '夜店', '客栈', '酒楼', '酒肆', '酒家'],
    shop: ['咖啡', '餐厅', '饭店', '店', '商场', '超市', '食堂', '茶馆', '茶楼', '面馆'],
    palace: ['宫', '殿', '城堡', '王座', '朝堂', '府邸', '王府', '皇'],
    school: ['教室', '学校', '校园', '操场', '社团', '天台', '图书馆', '学院', '宿舍', '课堂', '讲堂', '书院', '私塾'],
    home: ['家', '卧室', '客厅', '房间', '厨房', '公寓', '寝室', '闺房', '书房', '厢房'],
    sea: ['海', '沙滩', '港', '码头', '礁'],
    village: ['村', '乡', '小镇', '田园', '农'],
    nature: ['森林', '树林', '竹林', '山', '田', '草原', '花园', '公园', '湖', '河', '溪', '原野', '郊', '林'],
    street: ['街', '路', '巷', '广场', '车站', '市', '城'],
});
const BGM_TIMES = Object.freeze(['dawn', 'day', 'dusk', 'night', 'midnight']);
const BGM_WEATHERS = Object.freeze(['sun', 'cloud', 'rain', 'snow', 'fog', 'wind', 'sand']);

// sceneMiss：曲目标了场景却和当前地点对不上时扣分，免得宫廷管弦因为情绪对上就盖过街道小曲。
// poolSlack：比最高分只差这么多（时段或天气没对上）的也进轮播池，池子不至于只剩一两首。
const SCORE = Object.freeze({ place: 8, other: 1, mood: 6, nearMood: 2, scene: 3, sceneMiss: 3, time: 1, weather: 1, poolSlack: 1 });
const PLAYED_MAX = 24;

function text(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function pickList(value, allowed) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        const id = String(item == null ? '' : item).trim();
        if (allowed.includes(id) && !out.includes(id)) out.push(id);
    }
    return out;
}

// 曲目上的分类字段：只留认识的值；用户自建曲目缺字段时全是空数组。
export function normalizeBgmTags(item) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        packs: pickList(source.packs, BGM_PACKS),
        moods: pickList(Array.isArray(source.moods) ? source.moods.map((m) => normalizeBgmMood(m) || m) : [], BGM_MOODS),
        scenes: pickList(source.scenes, BGM_SCENES),
        times: pickList(source.times, BGM_TIMES),
        weathers: pickList(source.weathers, BGM_WEATHERS),
    };
}

// 世界观 → 曲包：古代用古风，魔法与西幻共用魔法·奇幻，其余（科幻、末日、大正）按现代。
export function bgmPackOfWorldview(worldview) {
    if (worldview === 'ancient') return 'ancient';
    if (worldview === 'magic' || worldview === 'fantasy') return 'magic';
    return 'modern';
}

export function resolveBgmScene(location) {
    const value = text(location);
    if (!value) return '';
    return BGM_SCENES.find((scene) => SCENE_WORDS[scene].some((word) => value.includes(word))) || '';
}

// 没写情绪标签时的推断：只看演出区间与时段，不看逐句表情，避免同一场戏里换来换去。
export function inferBgmMood(context = {}) {
    const ctx = context && typeof context === 'object' ? context : {};
    if (ctx.battle) return 'battle';
    if (ctx.romance) return 'sweet';
    const ranges = ctx.fxRanges && typeof ctx.fxRanges === 'object' ? ctx.fxRanges : {};
    if (ranges.flashback) return 'sad';
    if (ranges.dream) return 'calm';
    const time = resolveWeatherFxTime(ctx.time);
    if (time === 'night' || time === 'midnight') return 'calm';
    return 'daily';
}

function isTagged(track) {
    return Boolean(track.moods && track.moods.length);
}

function isDefault(track) {
    return !isTagged(track) && !(Array.isArray(track.keywords) && track.keywords.some((word) => text(word)));
}

function scoreTrack(track, view) {
    let score = 0;
    for (const raw of Array.isArray(track.keywords) ? track.keywords : []) {
        const word = text(raw);
        if (!word) continue;
        if (view.location.includes(word)) score += SCORE.place;
        else if (view.others.some((value) => value.includes(word))) score += SCORE.other;
    }
    const moods = track.moods || [];
    if (moods.includes(view.mood)) score += SCORE.mood;
    else if (moods.some((mood) => view.near.includes(mood))) score += SCORE.nearMood;
    const scenes = track.scenes || [];
    if (view.scene && scenes.includes(view.scene)) score += SCORE.scene;
    else if (view.scene && scenes.length) score -= SCORE.sceneMiss;
    if (view.time && (track.times || []).includes(view.time)) score += SCORE.time;
    if (view.weather && (track.weathers || []).includes(view.weather)) score += SCORE.weather;
    return score;
}

// memory 由调用方按阅读器保留：{ sig, id, played, seed, mood, moodScene }；skip 为真时在同一候选池里换下一首。
export function selectBgmTrack(tracks, context = {}, memory = {}) {
    const list = Array.isArray(tracks) ? tracks.filter((t) => t && t.url) : [];
    if (!list.length) return null;
    const ctx = context && typeof context === 'object' ? context : {};
    const mem = memory && typeof memory === 'object' ? memory : {};
    if (!Array.isArray(mem.played)) mem.played = [];
    const pack = BGM_PACKS.includes(ctx.pack) ? ctx.pack : 'modern';
    const allowed = list.filter((t) => !(t.packs && t.packs.length) || t.packs.includes(pack));
    if (!allowed.length) return null;
    const location = text(ctx.location);
    const time = resolveWeatherFxTime(ctx.time);
    const weather = resolveWeatherFxKind(ctx.weather);
    const mood = normalizeBgmMood(ctx.mood) || 'daily';
    const view = {
        location, time, weather, mood,
        near: MOOD_FALLBACK[mood] || [],
        scene: resolveBgmScene(location),
        others: [`${text(ctx.time)} ${time}`, `${text(ctx.weather)} ${weather}`, text(ctx.emotion)],
    };
    const current = allowed.find((t) => t.id === mem.id) || null;
    const sig = [pack, mood, view.scene, time, weather, location].join('|');
    if (!ctx.skip && current && mem.sig === sig) return current;
    mem.sig = sig;
    const scored = allowed.map((track) => ({ track, score: scoreTrack(track, view) }));
    const best = Math.max(...scored.map((s) => s.score));
    let pool = best > 0 ? scored.filter((s) => s.score > 0 && s.score >= best - SCORE.poolSlack).map((s) => s.track) : allowed.filter(isDefault);
    // 一首都没对上：用户只配了关键词曲目时照旧静音；有分类曲目时在本世界观里随便放一首，不冷场。
    if (!pool.length) pool = allowed.filter(isTagged);
    if (!pool.length) {
        mem.id = '';
        return null;
    }
    if (!ctx.skip && current && pool.includes(current)) return current;
    const offset = Math.abs(Math.trunc(Number(mem.seed) || 0)) % pool.length;
    const ordered = [...pool.slice(offset), ...pool.slice(0, offset)];
    const others = ctx.skip && current && ordered.length > 1 ? ordered.filter((t) => t !== current) : ordered;
    let pick = others.find((t) => !mem.played.includes(t.id));
    if (!pick) {
        // 这一池放完一轮：清掉本池的播放记录，从头再轮。
        mem.played = mem.played.filter((id) => !pool.some((t) => t.id === id));
        pick = ctx.skip && current ? ordered[(ordered.indexOf(current) + 1) % ordered.length] : others[0];
    }
    mem.id = pick.id;
    mem.played = [...mem.played.filter((id) => id !== pick.id), pick.id].slice(-PLAYED_MAX);
    return pick;
}

// 情绪标签只在转折时写：本页有标签用标签；没有时沿用同一场景里上次的情绪，换了场景就按演出推断。
export function resolveBgmMood(context = {}, memory = {}) {
    const ctx = context && typeof context === 'object' ? context : {};
    const scene = resolveBgmScene(ctx.location);
    const explicit = normalizeBgmMood(ctx.mood);
    if (explicit) {
        memory.mood = explicit;
        memory.moodScene = scene;
        return explicit;
    }
    if (ctx.battle) return 'battle';
    if (memory.mood && memory.moodScene === scene) return memory.mood;
    memory.mood = '';
    return inferBgmMood(ctx);
}
