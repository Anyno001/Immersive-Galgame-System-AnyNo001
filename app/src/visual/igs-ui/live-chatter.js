// 直播路人弹幕生成器：纯函数、零 token，由 rng 注入；按场合、身份、情绪与世界观口吻混播，并带刷屏潮、复读、接话与吵架。
import {
    LIVE_AMBIENT_LINES, LIVE_BDXJ_CHARS, LIVE_BDXJ_LINES, LIVE_CLASSIC_CLICK_LINES, LIVE_CLASSIC_LINES,
    LIVE_HOST_REPLY_LINES, LIVE_MEME_LINES, LIVE_NAME_HEADS, LIVE_NAME_TAILS, LIVE_ROLE_LINES, LIVE_SCENE_ANSWERS,
    LIVE_SCENE_LINES, LIVE_SILLY_REPLY_LINES, LIVE_TONE_CLASSIC, LIVE_TONE_POOLS, LIVE_TRASH_MEME_LINES,
    AUDIENCE_AMBIENT_LINES, LIVE_FANDOM_LINES, LIVE_SCALE_TIERS, LIVE_TINY_LINES, LIVE_TONE_FANDOM, LIVE_TONE_WARN,
    LIVE_WARN_MEME_LINES, LIVE_DRAMA_BY_KIND, LIVE_ANIME_BY_KIND, LIVE_NEWAGE_MEME_LINES, LIVE_TONE_EXTRA, LIVE_ADMIN_BAN_REACT_LINES, LIVE_ADMIN_LINES, LIVE_KEEPER_PEACE_LINES,
    LIVE_KEEPER_REBUT_LINES, LIVE_TONE_ORDER, fanMedalNameFor,
} from './danmaku-pools.js';

const f = (list) => Object.freeze(list.slice());

export const LIVE_EMOJI_SPAM = f([
    '😂😂😂', '👍👍', '🤣🤣🤣🤣', '❤️❤️❤️', '🐶', '🤡', '🙏🙏', '😭😭😭', '🔥🔥🔥', '👀',
    '🍉🍉', '🤔', '💀💀', '🫠', '😅', '🥺', '👏👏👏', '🍋', '🌶️', '😍😍',
    '😱', '🙄', '😒', '🥵', '🤤', '🤭', '😏', '😆', '😹', '🫡',
    '😮', '💯', '✨✨', '🎉🎉🎉', '💩', '🐮🐮', '🌚', '😎', '🥹', '🤯',
    '🙈', '🙉', '😬', '🤝', '🫶', '💔', '😤', '🤷', '🚀🚀', '🍿',
]);

export const LIVE_EMOJI_BY_MOOD = Object.freeze({
    funny: f(['😂', '🤣', '💀', '😆', '😹']),
    love: f(['😍', '🥺', '❤️', '🥹', '🫶']),
    roast: f(['🙄', '🤡', '😅', '😒', '🤷']),
    surprise: f(['😱', '👀', '😮', '🤯']),
    sad: f(['😭', '🥺', '💔', '🥹']),
    generic: f(['👍', '🤔', '😅', '👀', '🔥']),
});

const SCENE_KEYWORDS = Object.freeze([
    ['accident', /翻车|尴尬|出错|失误|事故|社死|摔|打翻|口误|忘词|断网|卡住/],
    ['emotion', /情感|连麦|咨询|树洞|倾诉|失恋|分手|恋爱|表白|感情|电台|开导/],
    ['sing', /唱歌|歌|唱|演唱|点歌|麦|旋律|弹琴|吉他|钢琴|琴/],
    ['game', /游戏|打游戏|关卡|副本|通关|对战|开黑|boss|比赛|电竞|操作|队友/i],
    ['shop', /带货|链接|上架|秒杀|福利款|下单|购物车|橱窗|福袋|直播卖/],
    ['eat', /吃|美食|火锅|夜宵|外卖|做饭|烹饪|奶茶|烧烤|尝|零食|泡面|餐/],
    ['study', /学习|自习|作业|复习|考试|写论文|办公|工作|加班|看书|备考|读书|番茄钟/],
    ['looks', /换装|穿搭|舞蹈|跳舞|化妆|试穿|裙|造型|走秀|妆|美颜/],
    ['outdoor', /户外|散步|街头|旅行|旅游|逛街|公园|海边|爬山|景点|外出|路上/],
]);
const LATE_FROM = 23;
const LATE_TO = 5;
const LATE_SHARE = 0.35;
const SCENE_SHARE = 0.5;
const ROLE_SHARE = 0.2;
const MOOD_SHARE = 0.15;
const ROLE_SILLY_SELFISH = 0.3;
const MEME_SHARE = 0.4;
const CLASSIC_SHARE = 0.15;
const TRASH_SHARE = 0.1;
const SPAM_CHANCE = 0.25;
const SPAM_EMOJI = 0.35;
const SPAM_BDXJ = 0.2;
const SPAM_CLICK_ONE = 0.6;
const REPEAT_CHANCE = 0.4;
const DEFEND_CHANCE = 0.5;
const BDXJ_AFTER_HATER = 0.4;
const SILLY_REPLY_CHANCE = 0.3;
const EMOJI_CHANCE = 0.2;
const EMOJI_FRONT = 0.15;
const MENTION_HOST = 0.06;
const MENTION_USER = 0.05;
const CUSTOM_MAX_LINES = 200;
const CUSTOM_MAX_CHARS = 40;
const ASK_RE = /播什么|什么内容|播啥|什么主题|什么节目/;
const CLICK_RE = /扣1/;
const ROLE_WEIGHT = Object.freeze({
    newcomer: 1.2, regular: 1, fresh: 0.8, asker: 1, hurry: 1, hater: 1, roaster: 0.8, defender: 0.5, patron: 0.5,
    lurker: 0.8, leaving: 0.6, pseudo: 1, keeper: 0.6,
});
const EMOJI_MOOD_RE = Object.freeze([
    ['funny', /哈|笑|草|绷|xswl|蚌|整活/i],
    ['roast', /就这|急|典|孝|下头|离谱|尬|摆烂|寄|装|水|阴间/],
    ['love', /心动|爱|甜|磕|嗑|awsl|好看|美|可爱|喜欢|好听/i],
    ['sad', /泪|哭|难过|心疼|破防|舍不得/],
    ['surprise', /？|\?|卧槽|什么|反转|没想到|惊|好家伙/],
]);
const TEMPLATES_USER = Object.freeze(['{n}在吗', '{n}来了', '{n}看这边', '欢迎{n}', '{n}好呀']);
const TOLERANT_TONES = Object.freeze(['fantasy', 'ancient', 'scifi']);
const KEEPER_AFTER_WAVE = 0.35;
const KEEPER_AFTER_PEACE = 0.4;
const KEEPER_REBUT = 0.2;
const ADMIN_AFTER_WAVE = 0.15;
const ADMIN_BAN_REACT = 0.5;
const SHOP_ANSWERS = Object.freeze(['在带货', '直播卖东西', '带货直播', '在上链接', '福利场，有福袋']);
const NEWAGE_SHARE = 0.15;
const NEWAGE_SHARE_HOT = 0.3;
const DRAMA_SHARE = 0.05;
const DRAMA_SHARE_HOT = 0.18;
const ANIME_SHARE = 0.05;
const ANIME_SHARE_HOT = 0.14;
const KIND_MATCH = 0.7;
const WARN_SHARE = 0.03;
const WARN_SHARE_HOT = 0.2;
const WARN_WAVE_HOT = 0.25;
const FANDOM_SHARE = 0.08;
const FANDOM_LOOKS_SHARE = 0.25;
const TINY_SHARE = 0.2;
const FAN_NAME_RE = Object.freeze([
    /粉丝(?:们)?(?:自称|自封|自称为|称自己为|称呼自己为)[「『“"'《【(（]?([^\s「」『』“”"'《》【】()（），。,.！!？?、]{2,6})/,
    /粉丝(?:们)?(?:叫做|名叫|叫|称为|名为|昵称为|昵称是|名是|名字是|名字叫)[「『“"'《【(（]?([^\s「」『』“”"'《》【】()（），。,.！!？?、]{2,6})/,
    /粉丝(?:团|群|名)(?:叫|叫做|是|名为|为)?[「『“"'《【(（]([^\s「」『』“”"'《》【】()（），。,.！!？?、]{2,6})/,
    /粉丝们?[（(「『“"]([^\s「」『』“”"'《》【】()（），。,.！!？?、]{2,6}(?:家军|家|粉|卫|崽|军|党|团|后援会))[）)」』”"]/,
    /粉丝[^。！？\n]{0,6}?([一-龥]{1,3}(?:家军|家|粉|卫|崽|军|党))(?![一-龥])/,
]);
const FAN_NAME_BAD_RE = /^(?:是|他|她|它|他们|她们|我们|你们|自己|一些|很多|大家|所有|其他|不少|一群|粉丝|主播|观众|网友)/;

const CUSTOM_BOOST = 0.25;
const clean = (value) => String(value ?? '').trim();
const pick = (list, rng) => (list.length ? list[Math.floor(rng() * list.length) % list.length] : '');
const pickBoost = (list, mine, rng) => (Array.isArray(mine) && mine.length && rng() < CUSTOM_BOOST ? pick(mine, rng) : pick(list, rng));
const between = (min, max, rng) => min + Math.floor(rng() * (max - min + 1));
const pickWeighted = (entries, rng) => {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = rng() * total;
    for (const [key, weight] of entries) {
        roll -= weight;
        if (roll < 0) return key;
    }
    return entries[entries.length - 1][0];
};

export function classifyLiveScene({ title = '', text = '', pageInLive, ending = false, hour } = {}) {
    const late = Number.isFinite(hour) && (hour >= LATE_FROM || hour <= LATE_TO);
    if (ending) return { scene: 'ending', late };
    if (Number.isFinite(pageInLive) && pageInLive <= 1) return { scene: 'opening', late };
    const haystack = `${clean(title)}\n${clean(text)}`;
    let best = 'chat';
    let bestScore = 0;
    for (const [scene, re] of SCENE_KEYWORDS) {
        const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
        const score = (haystack.match(new RegExp(re.source, flags)) || []).length;
        if (score > bestScore) {
            best = scene;
            bestScore = score;
        }
    }
    return { scene: best, late };
}

export function normalizeLiveCustomLines(raw) {
    if (!raw) return {};
    const source = typeof raw === 'string' || Array.isArray(raw) ? { ambient: raw } : raw;
    if (typeof source !== 'object') return {};
    const out = {};
    for (const [key, value] of Object.entries(source)) {
        const list = (Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/))
            .map((line) => Array.from(clean(line)).slice(0, CUSTOM_MAX_CHARS).join(''))
            .filter(Boolean)
            .slice(0, CUSTOM_MAX_LINES);
        if (list.length && key) out[key] = Object.freeze(list);
    }
    return out;
}

function resolvePools(tone, custom) {
    const toneKey = TOLERANT_TONES.includes(tone) ? tone : 'modern';
    const extra = (key) => custom[key] || [];
    if (toneKey === 'modern') {
        const sceneOf = (scene) => [...(LIVE_SCENE_LINES[scene] || LIVE_SCENE_LINES.chat), ...extra(scene)];
        return {
            tone: toneKey,
            scene: sceneOf,
            answers: (scene) => (scene === 'shop' ? SHOP_ANSWERS : LIVE_SCENE_ANSWERS[scene] || LIVE_SCENE_ANSWERS.chat),
            roles: Object.fromEntries(Object.entries(LIVE_ROLE_LINES).map(([role, list]) => [role, [...list, ...extra(role)]])),
            ambient: [...LIVE_AMBIENT_LINES, ...extra('ambient')],
            memes: LIVE_MEME_LINES,
            classic: [...LIVE_CLASSIC_LINES, ...LIVE_CLASSIC_CLICK_LINES],
            trash: LIVE_TRASH_MEME_LINES,
            host: [...LIVE_HOST_REPLY_LINES, ...extra('host')],
            sillyReply: LIVE_SILLY_REPLY_LINES,
            warn: LIVE_WARN_MEME_LINES,
            fandom: LIVE_FANDOM_LINES,
            drama: LIVE_DRAMA_BY_KIND,
            anime: LIVE_ANIME_BY_KIND,
            newage: [...LIVE_NEWAGE_MEME_LINES, ...extra('newage')],
            keeperPeace: LIVE_KEEPER_PEACE_LINES,
            keeperRebut: LIVE_KEEPER_REBUT_LINES,
            admin: LIVE_ADMIN_LINES,
            adminUser: '房管',
            banReact: LIVE_ADMIN_BAN_REACT_LINES,
        };
    }
    const base = LIVE_TONE_POOLS[toneKey];
    const sceneOf = (scene) => [...(base.scenes[scene] || base.scenes.chat), ...extra(scene)];
    return {
        tone: toneKey,
        scene: sceneOf,
        answers: (scene) => (scene === 'shop' ? SHOP_ANSWERS : base.answers[scene] || base.answers.chat),
        roles: Object.fromEntries(Object.entries({ ...base.roles, keeper: LIVE_TONE_ORDER[toneKey].keeper }).map(([role, list]) => [role, [...list, ...extra(role)]])),
        ambient: [...base.ambient, ...extra('ambient')],
        memes: base.memes,
        classic: LIVE_TONE_CLASSIC[toneKey],
        trash: [],
        host: [...base.host, ...extra('host')],
        sillyReply: base.sillyReply,
        warn: LIVE_TONE_WARN[toneKey],
        fandom: LIVE_TONE_FANDOM[toneKey],
        drama: { other: LIVE_TONE_EXTRA[toneKey].drama },
        anime: { other: LIVE_TONE_EXTRA[toneKey].anime },
        newage: [...LIVE_TONE_EXTRA[toneKey].newage, ...extra('newage')],
        keeperPeace: LIVE_TONE_ORDER[toneKey].peace,
        keeperRebut: LIVE_TONE_ORDER[toneKey].rebut,
        admin: LIVE_TONE_ORDER[toneKey].admin,
        adminUser: LIVE_TONE_ORDER[toneKey].user,
        banReact: LIVE_TONE_ORDER[toneKey].react,
    };
}

function nameMaker(rng, taken = new Set(), nameOpts = {}, repeat = false) {
    const history = Array.isArray(nameOpts.recent) ? nameOpts.recent.slice() : [];
    return () => {
        for (let tries = 0; tries < 40; tries += 1) {
            const name = liveUserName(rng, { ...nameOpts, recent: repeat ? history : null });
            if (repeat || !taken.has(name)) {
                taken.add(name);
                history.push(name);
                return name;
            }
        }
        const name = `${pick(LIVE_NAME_HEADS, rng)}${pick(LIVE_NAME_TAILS, rng)}${taken.size}`;
        taken.add(name);
        history.push(name);
        return name;
    };
}

function emojiMood(text) {
    const hit = EMOJI_MOOD_RE.find(([, re]) => re.test(text));
    return hit ? hit[0] : 'generic';
}

export function decorateLiveEmoji(text, tone, rng) {
    const chance = tone === 'modern' || tone === 'scifi' ? EMOJI_CHANCE : EMOJI_CHANCE / 2;
    if (rng() >= chance) return text;
    const set = LIVE_EMOJI_BY_MOOD[emojiMood(text)];
    const count = between(1, 3, rng);
    const first = pick(set, rng);
    const marks = rng() < 0.6 ? first.repeat(count) : Array.from({ length: count }, () => pick(set, rng)).join('');
    return rng() < EMOJI_FRONT ? `${marks}${text}` : `${text}${marks}`;
}

function kindPick(kinds, preferred, rng) {
    const names = Object.keys(kinds);
    const wanted = preferred.filter((name) => kinds[name]);
    const kind = wanted.length && rng() < KIND_MATCH ? pick(wanted, rng) : pick(names, rng);
    return pick(kinds[kind] || [], rng);
}

function fandomLines(pools, gender) {
    const set = pools.fandom;
    return [...set.neutral, ...(gender === 'f' ? set.f : gender === 'm' ? set.m : [])];
}

function pickRole(pools, tone, late, rng) {
    const available = Object.keys(pools.roles).filter((role) => pools.roles[role].length);
    const regular = available.filter((role) => role !== 'silly' && role !== 'selfish').map((role) => [role, ROLE_WEIGHT[role] ?? 1]);
    const special = available.filter((role) => role === 'silly' || role === 'selfish');
    if (special.length && rng() < ROLE_SILLY_SELFISH) return pick(special, rng);
    return pickWeighted(regular, rng);
}

export function planLiveChatter(opts = {}, rng = Math.random) {
    const {
        title, text, pageInLive, ending, hour, mood, aiLines, hostSaid, userName, tone = 'modern', custom, count, hostName, hostGender, tier,
    } = opts;
    const hot = mood === 'love' || Boolean(opts.spicy);
    const emoji = opts.emoji !== false;
    const classified = classifyLiveScene({ title, text, pageInLive, ending, hour });
    const scene = opts.scene || classified.scene;
    const late = opts.late ?? classified.late;
    const customLines = custom && typeof custom === 'object' ? custom : {};
    const pools = resolvePools(tone, customLines);
    const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 6;
    const out = [];
    const nameOpts = { tone: pools.tone, tier, emoji, host: hostName, recent: opts.recentNames };
    const used = nameMaker(rng, new Set(), nameOpts, true);
    const wavesOf = () => nameMaker(rng, new Set(), nameOpts);
    const push = (user, line, delay, src, type = 'text') => out.push({ user, text: line, type, delay: Math.round(delay), src });
    let askSeen = false;
    let clickSeen = false;
    let haterSeen = false;
    let sillySeen = false;

    for (let i = 0; i < total; i += 1) {
        const delay = rng() * 2400;
        const roll = rng();
        let line = '';
        let src = 'ambient';
        if (roll < SCENE_SHARE) {
            const useLate = late && scene !== 'late' && rng() < LATE_SHARE;
            if (scene === 'looks' && !late && rng() < FANDOM_LOOKS_SHARE) {
                line = pick(fandomLines(pools, hostGender), rng);
                src = 'fandom';
            } else {
                line = pickBoost(pools.scene(useLate ? 'late' : scene), customLines[useLate ? 'late' : scene], rng);
                src = `scene:${useLate ? 'late' : scene}`;
            }
        } else if (roll < SCENE_SHARE + ROLE_SHARE) {
            const role = pickRole(pools, pools.tone, late, rng);
            line = pickBoost(pools.roles[role] || [], customLines[role], rng);
            src = `role:${role}`;
            if (role === 'newcomer' && ASK_RE.test(line)) askSeen = true;
            if (role === 'hater') haterSeen = true;
            if (role === 'silly') sillySeen = true;
        } else if (roll < SCENE_SHARE + ROLE_SHARE + MOOD_SHARE) {
            line = pick(AUDIENCE_AMBIENT_LINES[mood] || AUDIENCE_AMBIENT_LINES.generic, rng);
            src = `mood:${mood || 'generic'}`;
        } else {
            const pre = rng();
            const warnShare = hot ? WARN_SHARE_HOT : WARN_SHARE;
            const dramaMood = mood === 'love' || mood === 'anger' || mood === 'tense' || mood === 'surprise';
            const animeMood = mood === 'love' || mood === 'tense' || mood === 'anger' || scene === 'game' || scene === 'looks';
            const dramaShare = dramaMood ? DRAMA_SHARE_HOT : DRAMA_SHARE;
            const animeShare = animeMood ? ANIME_SHARE_HOT : ANIME_SHARE;
            const newageShare = scene === 'eat' || scene === 'looks' || scene === 'shop' ? NEWAGE_SHARE_HOT : NEWAGE_SHARE;
            const sub = rng();
            const cuts = [warnShare, FANDOM_SHARE, dramaShare, animeShare, tier === 'tiny' ? TINY_SHARE : 0];
            let acc = 0;
            const slot = cuts.findIndex((share) => {
                acc += share;
                return pre < acc;
            });
            if (slot === 0 && pools.warn.length) {
                line = pick(pools.warn, rng);
                src = 'warn';
            } else if (slot === 1) {
                line = pick(fandomLines(pools, hostGender), rng);
                src = 'fandom';
            } else if (slot === 2) {
                line = kindPick(pools.drama, mood === 'love' ? ['romance'] : ['dogblood'], rng);
                src = 'drama';
            } else if (slot === 3) {
                const want = mood === 'love' || scene === 'looks' ? ['romance'] : mood === 'tense' || mood === 'anger' || scene === 'game' ? ['chuuni', 'hot'] : [];
                line = kindPick(pools.anime, want, rng);
                src = 'anime';
            } else if (slot === 4) {
                line = pick(LIVE_TINY_LINES, rng);
                src = 'tiny';
            } else if (sub < MEME_SHARE) {
                line = pick(pools.memes, rng);
                src = 'meme';
            } else if (sub < MEME_SHARE + CLASSIC_SHARE) {
                line = pick(pools.classic, rng);
                src = 'classic';
            } else if (sub < MEME_SHARE + CLASSIC_SHARE + newageShare) {
                line = pick(pools.newage, rng);
                src = 'newage';
            } else if (sub < MEME_SHARE + CLASSIC_SHARE + newageShare + TRASH_SHARE && pools.trash.length) {
                line = pick(pools.trash, rng);
                src = 'trash';
            } else if (sub < 0.97 || pools.tone !== 'modern') {
                line = pickBoost(pools.ambient, customLines.ambient, rng);
            } else {
                line = pick(LIVE_BDXJ_LINES, rng);
                src = 'bdxj';
            }
        }
        if (!line) continue;
        if (CLICK_RE.test(line)) clickSeen = true;
        push(used(), line, delay, src);
    }

    const said = clean(hostSaid);
    if (said) {
        const n = between(1, 2, rng);
        for (let i = 0; i < n; i += 1) push(used(), pick(pools.host, rng), 600 + rng() * 2200, 'host');
    }

    if (rng() < MENTION_HOST) push(used(), `@${clean(hostName) || '主播'} 看我`, rng() * 2400, 'mention');
    if (clean(userName) && rng() < MENTION_USER) {
        push(used(), pick(TEMPLATES_USER, rng).replace('{n}', clean(userName)), rng() * 2400, 'mention');
    }

    const aiList = Array.isArray(aiLines) ? aiLines.map(clean).filter(Boolean) : [];
    for (const ai of aiList) {
        if (rng() >= REPEAT_CHANCE) continue;
        const wave = wavesOf();
        const n = between(1, 3, rng);
        let at = 500 + rng() * 1200;
        for (let i = 0; i < n; i += 1) {
            push(wave(), rng() < 0.5 ? ai : '+1', at, 'repeat');
            at += 150 + rng() * 700;
        }
    }

    const hasAsk = askSeen;
    if (hasAsk) {
        const answerer = wavesOf();
        const n = rng() < 0.3 ? 2 : 1;
        for (let i = 0; i < n; i += 1) push(answerer(), pick(pools.answers(scene), rng), 2000 + rng() * 2000 + i * 600, 'answer');
    }
    if (haterSeen) {
        const crowd = wavesOf();
        if (rng() < DEFEND_CHANCE) {
            const defendAt = 1000 + rng() * 1500;
            push(crowd(), pick(pools.roles.defender || [], rng), defendAt, 'defend');
            if (rng() < KEEPER_AFTER_PEACE) {
                const peaceAt = defendAt + 400 + rng() * 900;
                push(crowd(), pick(pools.keeperPeace, rng), peaceAt, 'keeperPeace');
                if (rng() < KEEPER_REBUT) push(crowd(), pick(pools.keeperRebut, rng), peaceAt + 500 + rng() * 900, 'keeperRebut');
            }
        }
        if (rng() < BDXJ_AFTER_HATER) {
            const char = pick(['急', '典'], rng);
            const n = between(2, 4, rng);
            let at = 1200 + rng() * 800;
            for (let i = 0; i < n; i += 1) {
                push(crowd(), rng() < 0.5 ? char : pick(LIVE_BDXJ_LINES.filter((l) => l.includes(char)), rng), at, 'wave:bdxj');
                at += 120 + rng() * 380;
            }
        }
    }
    if ((hot || haterSeen) && pools.warn.length && rng() < WARN_WAVE_HOT) {
        const wave = wavesOf();
        const n = between(3, 5, rng);
        let at = 800 + rng() * 900;
        for (let i = 0; i < n; i += 1) {
            push(wave(), pools.warn[0], at, 'wave:warn');
            at += 100 + rng() * 350;
        }
    }
    if (sillySeen && rng() < SILLY_REPLY_CHANCE) push(used(), pick(pools.sillyReply, rng), 1000 + rng() * 2000, 'sillyReply');

    if (clickSeen && rng() < SPAM_CLICK_ONE) {
        const wave = wavesOf();
        const n = between(3, 8, rng);
        let at = 500 + rng() * 800;
        for (let i = 0; i < n; i += 1) {
            push(wave(), '1'.repeat(between(1, 3, rng)), at, 'wave:click');
            at += 80 + rng() * 260;
        }
    }

    if (rng() < SPAM_CHANCE) {
        const wave = wavesOf();
        const n = between(3, 6, rng);
        const start = rng() * 1000;
        const kind = rng();
        const emojiWave = emoji && kind < SPAM_EMOJI;
        const bdxjWave = !emojiWave && (kind < SPAM_EMOJI + SPAM_BDXJ || (!emoji && kind < SPAM_BDXJ)) && pools.tone === 'modern';
        const shortList = [...pools.memes, ...pools.classic].filter((line) => Array.from(line).length <= 6);
        const shortLine = pick(shortList, rng);
        const emojiA = pick(LIVE_EMOJI_SPAM, rng);
        const emojiB = pick(LIVE_EMOJI_SPAM, rng);
        let bdxjIndex = between(0, LIVE_BDXJ_CHARS.length - 1, rng);
        const waveUsers = [];
        let waveEnd = start;
        for (let i = 0; i < n; i += 1) {
            const at = start + (1500 * i) / Math.max(1, n);
            waveEnd = at;
            const before = out.length;
            if (emojiWave) push(wave(), rng() < 0.7 ? emojiA : emojiB, at, 'wave:emoji');
            else if (bdxjWave) {
                push(wave(), rng() < 0.7 ? LIVE_BDXJ_CHARS[bdxjIndex % LIVE_BDXJ_CHARS.length] : pick(LIVE_BDXJ_CHARS, rng), at, 'wave:bdxj');
                bdxjIndex += 1;
            } else push(wave(), shortLine, at, 'wave:meme');
            waveUsers.push(out[before].user);
        }
        const crowd = nameMaker(rng, new Set(waveUsers), nameOpts);
        if (rng() < KEEPER_AFTER_WAVE) {
            let at = waveEnd + 300 + rng() * 700;
            const k = between(1, 2, rng);
            for (let i = 0; i < k; i += 1) {
                push(crowd(), pick(pools.roles.keeper, rng), at, 'keeper');
                at += 500 + rng() * 700;
            }
            if (rng() < KEEPER_REBUT) push(crowd(), pick(pools.keeperRebut, rng), at + 300 + rng() * 800, 'keeperRebut');
        }
        if (rng() < ADMIN_AFTER_WAVE) {
            const target = pick(waveUsers, rng);
            const raw = pick(pools.admin, rng);
            const banned = raw.includes('{n}');
            const adminAt = waveEnd + 400 + rng() * 900;
            push(pools.adminUser, raw.replace('{n}', target), adminAt, 'admin', 'admin');
            if (banned && rng() < ADMIN_BAN_REACT) {
                const k = between(1, 2, rng);
                let at = adminAt + 600 + rng() * 1200;
                for (let i = 0; i < k; i += 1) {
                    push(crowd(), pick(pools.banReact, rng).replace('{n}', target), at, 'banReact');
                    at += 400 + rng() * 800;
                }
            }
        }
    }

    const result = out.map((entry) => {
        if (!emoji) return entry.text && /\p{Extended_Pictographic}/u.test(entry.text) ? { ...entry, text: entry.text.replace(/\p{Extended_Pictographic}️?/gu, '').trim() || '？' } : entry;
        if (entry.src.startsWith('wave') || entry.src === 'tiny' || entry.src === 'repeat' || entry.src === 'mention' || entry.type === 'admin' || /\p{Extended_Pictographic}/u.test(entry.text)) return entry;
        return { ...entry, text: decorateLiveEmoji(entry.text, pools.tone, rng) };
    });
    return result.sort((a, b) => a.delay - b.delay);
}

const stripNameQuotes = (name) => clean(name).replace(/[「」『』“”"'《》【】()（）]/g, '');

export function fanNameFromText(text, streamer) {
    const source = clean(text);
    if (!source) return '';
    const host = clean(streamer);
    const sentences = source.split(/[。！？!?\n]/).filter(Boolean);
    for (const sentence of sentences) {
        if (!/粉丝|粉团/.test(sentence)) continue;
        const aboutHost = !host || sentence.includes(host) || /[她他它]的粉丝|主播的粉丝|自己的粉丝|粉丝们?(?:自称|叫|称)/.test(sentence)
            || sentences.length <= 2;
        if (!aboutHost) continue;
        for (const re of FAN_NAME_RE) {
            const found = re.exec(sentence);
            if (!found) continue;
            const name = stripNameQuotes(found[1]);
            const length = Array.from(name).length;
            if (length >= 2 && length <= 6 && !FAN_NAME_BAD_RE.test(name)) return name;
        }
    }
    return '';
}

export function normalizeFanMedalMap(raw) {
    const pairs = [];
    if (typeof raw === 'string') {
        for (const line of raw.split(/\r?\n/)) {
            const at = line.search(/[=＝:：]/);
            if (at > 0) pairs.push([line.slice(0, at), line.slice(at + 1)]);
        }
    } else if (raw && typeof raw === 'object') pairs.push(...Object.entries(raw));
    const out = {};
    for (const [key, value] of pairs) {
        const host = clean(key);
        const medal = Array.from(clean(value)).slice(0, 6).join('');
        if (host && medal) out[host] = medal;
    }
    return out;
}

export function resolveFanMedal({ streamer, fromText, customMap } = {}) {
    const host = clean(streamer);
    const map = customMap && typeof customMap === 'object' ? customMap : {};
    if (host) {
        if (map[host]) return map[host];
        const loose = Object.keys(map).find((key) => key && (host.includes(key) || key.includes(host)));
        if (loose) return map[loose];
    }
    return clean(fromText) || fanMedalNameFor(host);
}

const CN_DIGIT = Object.freeze({ 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 });
const CN_SMALL_UNIT = Object.freeze({ 十: 10, 百: 100, 千: 1000 });
const CN_BIG_UNIT = Object.freeze({ 万: 1e4, 亿: 1e8 });
const ARABIC_UNIT = Object.freeze({ 万: 1e4, w: 1e4, 千: 1e3, k: 1e3, 亿: 1e8 });
const NUM_TOKEN = '(\\d[\\d,]*(?:\\.\\d+)?(?:万|千|亿|[kKwW])?|[零一二两三四五六七八九十百千万亿]+)[+＋]?';
const FANS_AFTER = '粉(?:丝|(?![红色末笔底白嫩蒸条面]))';
const SCALE_PATTERNS = Object.freeze([
    ['fans', `粉丝(?:数|量|团)?(?:已经|已)?(?:突破|超过|达到|破|超|达|有|约|近|是|共有|共|才|仅有|仅|只有)?[：:\\s]*${NUM_TOKEN}`],
    ['fans', `${NUM_TOKEN}\\s*(?:个|位|名)?${FANS_AFTER}`],
    ['viewers', `${NUM_TOKEN}\\s*(?:个)?人(?:正)?在(?:线|看)`],
    ['viewers', `在线(?:人数)?(?:约|有|达|超|破)?[：:\\s]*${NUM_TOKEN}`],
    ['viewers', `直播间(?:里|内|有|共有|约有|共)*${NUM_TOKEN}\\s*人`],
    ['viewers', `${NUM_TOKEN}\\s*人(?:正在)?观看`],
    ['heat', `(?:热度|人气)(?:值)?(?:已经|已)?(?:突破|超过|达到|破|超|达|是|有|约)?[：:\\s]*${NUM_TOKEN}`],
    ['heat', `${NUM_TOKEN}\\s*(?:的)?(?:热度|人气)`],
]);
const SCALE_BREAK_SRC = '(?:突破|超过|破|过|上)(十万|百万|千万|万|千)(?:人|粉丝?)?';
const SCALE_HINTS = Object.freeze([
    ['huge', /顶流|头部主播|当红|千万粉丝|热搜|爆火|现象级/],
    ['mid', /小有名气|腰部|有些人气|有点人气/],
    ['small', /小主播|新人主播|刚开播|刚入行|不太有名/],
    ['tiny', /没什么人看|冷清|零星几个人|寥寥无几|空荡荡|没人看/],
]);
const FANS_CUTS = Object.freeze([100, 5000, 100000, 2000000]);
const VIEWERS_CUTS = Object.freeze([20, 500, 5000, 100000]);
const HINT_ORDER = Object.freeze(['huge', 'mid', 'small', 'tiny']);
const ECONOMY = Object.freeze({
    tiny: { basePopularity: 12, viewerRange: [1, 15], densityMul: 0.5, giftRate: 0.03, scRate: 0.005, scAmounts: [30], guardRate: 0, guardLevels: {} },
    small: { basePopularity: 300, viewerRange: [20, 400], densityMul: 0.8, giftRate: 0.07, scRate: 0.03, scAmounts: [30, 30, 30, 50], guardRate: 0.002, guardLevels: { captain: 1 } },
    mid: { basePopularity: 5000, viewerRange: [300, 4000], densityMul: 1, giftRate: 0.1, scRate: 0.08, scAmounts: [30, 30, 50, 100], guardRate: 0.01, guardLevels: { captain: 1 } },
    big: { basePopularity: 60000, viewerRange: [4000, 80000], densityMul: 1.3, giftRate: 0.14, scRate: 0.2, scAmounts: [30, 50, 100, 200, 500], guardRate: 0.04, guardLevels: { captain: 0.9, admiral: 0.1 } },
    huge: { basePopularity: 600000, viewerRange: [60000, 900000], densityMul: 1.6, giftRate: 0.2, scRate: 0.4, scAmounts: [50, 100, 200, 500, 1000, 2000], guardRate: 0.08, guardLevels: { captain: 0.55, admiral: 0.38, governor: 0.07 } },
});
const MEDAL_BIAS = Object.freeze({
    tiny: { min: 1, max: 8, skew: 1.8 }, small: { min: 1, max: 14, skew: 1.5 }, mid: { min: 1, max: 20, skew: 1.2 },
    big: { min: 1, max: 28, skew: 0.9 }, huge: { min: 3, max: 34, skew: 0.7 },
});

export function parseCnNumber(raw) {
    const source = clean(raw).replace(/[,，+＋\s]/g, '').replace(/^(?:约|近|超过|超|过|破|上|突破|大约|将近|不到)+/, '').replace(/(?:多|余|左右|以上)$/, '');
    if (!source) return null;
    const arabic = /^(\d+(?:\.\d+)?)(万|千|亿|k|w)?$/i.exec(source);
    if (arabic) return Math.round(Number(arabic[1]) * (arabic[2] ? ARABIC_UNIT[arabic[2].toLowerCase()] : 1));
    if (!/^[零一二两三四五六七八九十百千万亿]+$/.test(source)) return null;
    let total = 0;
    let section = 0;
    let digit = null;
    let lastUnit = 0;
    let zero = false;
    for (const ch of source) {
        if (ch === '零') zero = true;
        if (ch in CN_DIGIT) digit = CN_DIGIT[ch];
        else if (ch in CN_SMALL_UNIT) {
            section += (digit ?? 1) * CN_SMALL_UNIT[ch];
            digit = null;
            lastUnit = CN_SMALL_UNIT[ch];
        } else {
            section += digit ?? 0;
            total += (section || 1) * CN_BIG_UNIT[ch];
            section = 0;
            digit = null;
            lastUnit = CN_BIG_UNIT[ch];
        }
    }
    if (digit !== null) section += lastUnit >= 100 && !zero ? (digit * lastUnit) / 10 : digit;
    return total + section;
}

function scalePick(candidates, streamer) {
    if (!candidates.length) return null;
    const host = clean(streamer);
    const about = host ? candidates.filter((c) => c.sentence.includes(host)) : [];
    const list = about.length ? about : candidates;
    return list[list.length - 1].value;
}

export function detectLiveScale(text, streamer) {
    const source = clean(text);
    const result = { fans: null, viewers: null, heat: null, hints: [] };
    if (!source) return result;
    const found = { fans: [], viewers: [], heat: [] };
    for (const sentence of source.split(/[。！？!?\n]/).filter(Boolean)) {
        for (const [key, pattern] of SCALE_PATTERNS) {
            const re = new RegExp(pattern, 'g');
            let match = re.exec(sentence);
            while (match) {
                const value = parseCnNumber(match[1]);
                if (value) found[key].push({ value, sentence });
                match = re.exec(sentence);
            }
        }
        for (const clause of sentence.split(/[，,；;、]/)) {
            const breaks = new RegExp(SCALE_BREAK_SRC, 'g');
            let hit = breaks.exec(clause);
            while (hit) {
                const key = /粉/.test(clause) ? 'fans' : /在线|在看|观看|人在/.test(clause) ? 'viewers' : /热度|人气/.test(clause) ? 'heat' : '';
                const value = parseCnNumber(hit[1]);
                if (key && value) found[key].push({ value, sentence });
                hit = breaks.exec(clause);
            }
        }
    }
    for (const key of ['fans', 'viewers', 'heat']) result[key] = scalePick(found[key], streamer);
    result.hints = SCALE_HINTS.filter(([, re]) => re.test(source)).map(([hint]) => hint);
    return result;
}

const tierOfNumber = (value, cuts) => cuts.filter((cut) => value >= cut).length;

export function liveTier({ fans, viewers, heat, hints } = {}) {
    if (Number.isFinite(viewers)) return LIVE_SCALE_TIERS[tierOfNumber(viewers, VIEWERS_CUTS)];
    if (Number.isFinite(fans)) return LIVE_SCALE_TIERS[tierOfNumber(fans, FANS_CUTS)];
    if (Number.isFinite(heat)) return LIVE_SCALE_TIERS[tierOfNumber(heat, FANS_CUTS)];
    const list = Array.isArray(hints) ? hints : [];
    return HINT_ORDER.find((hint) => list.includes(hint)) || null;
}

export function liveEconomy(tier) {
    const base = ECONOMY[tier] || ECONOMY.mid;
    return { ...base, viewerRange: [...base.viewerRange], scAmounts: [...base.scAmounts], guardLevels: { ...base.guardLevels } };
}

export function medalLevelBias(tier) {
    return { ...(MEDAL_BIAS[tier] || MEDAL_BIAS.mid) };
}

export function pickMedalLevel(tier, rng = Math.random) {
    const { min, max, skew } = medalLevelBias(tier);
    return min + Math.floor((max - min + 1) * (rng() ** skew) * 0.999999);
}

export function mergeLiveScale(prev, next) {
    const before = prev && typeof prev === 'object' ? prev : {};
    const after = next && typeof next === 'object' ? next : {};
    const pickKey = (key) => (Number.isFinite(after[key]) ? after[key] : Number.isFinite(before[key]) ? before[key] : null);
    const hints = Array.isArray(after.hints) && after.hints.length ? after.hints.slice() : Array.isArray(before.hints) ? before.hints.slice() : [];
    return { fans: pickKey('fans'), viewers: pickKey('viewers'), heat: pickKey('heat'), hints };
}

const NAME_MIN = 2;
const NAME_MAX = 12;
const NAME_REPEAT = 0.15;
const NAME_NOUNS = Object.freeze(['橘猫', 'momo酱', '用户', '奶茶', '小熊', '汽水', '布丁', '柠檬', '团子', '年糕', '土豆', '仓鼠', '企鹅', '小狗', '西瓜', '芝士']);
const NAME_REDUP = Object.freeze(['小咪咪', '糖糖', '阿狸狸', '团团子', '毛毛', '球球', '饭饭', '啾啾', '喵喵', '豆豆', '乐乐', '菲菲', '朵朵', '圆圆', '花花', '果果', '花卷卷', '阿宝宝', '包包', '丫丫']);
const NAME_ENGLISH = Object.freeze(['Sakura', 'Lucky7', 'xiaoming', 'yyds_fan', 'sunshine_', 'mochi', 'Kiki', 'Momo', 'Coco', 'Luna', 'Mia', 'Neko', 'Bubble', 'Toast', 'Pudding', 'Nana', 'Echo', 'Yuki', 'Rico', 'Fox_', 'lemon_tea', 'moon_light', 'xiaobai', 'cat_lover', 'tomato', 'Daisy', 'Alex_', 'night_owl']);
const NAME_SENTENCES = Object.freeze([
    '今天也想摸鱼', '我真的会谢', '别催了在写了', '早睡早起身体好', '不想上班', '快乐星球居民', '一只不想努力的猫', '再看五分钟就睡', '明天一定早起', '我只是路过',
    '想吃火锅', '今天不想说话', '摸鱼第一名', '间歇性努力', '持续性摆烂', '我在等外卖', '别问我是谁', '不开心就睡觉', '请叫我熬夜冠军', '努力减肥中',
    '人间清醒', '快乐就好', '随便取的名', '这个名字不重要', '谁懂我的快乐',
]);
const NAME_PUN = Object.freeze(['芝士就是力量', '薯条要加番茄酱', '栓Q我的家', '尼古拉斯·狗蛋', '王富贵', '李铁柱', '张翠花', '赵日天', '马冬梅', '夏洛特烦恼', '隔壁老王', '二狗子', '翠花上酸菜', '蜜雪冰城甜蜜蜜', '奥利给']);
const NAME_ROLES = Object.freeze([
    '退休法师', '在逃公主', '深夜食堂老板', '打工人9527', '考研人', '社畜一号', '全职猫奴', '自由撰稿人', '外卖小哥', '摸鱼专员',
    '失业青年', '全职奶爸', '熬夜选手', '实习生一号', '被窝探险家', '干饭人', '追番人', '电子榨菜师', '熬夜修仙者', '午睡冠军',
]);
const NAME_SYMBOL_CORES = Object.freeze(['星河', '奶茶', '冬', '小鹿', '雾', '晚风', '栀子', '星野', '雪', '阿宁', '竹']);
const SYMBOLS_PLAIN = Object.freeze(['·{x}·', '_{x}_', '〆 {x} ', '丶{x}', '「{x}」', '{x}ぃ', 'ღ{x}', '≈{x}≈', '﹏{x}', '{x}ゞ']);
const SYMBOLS_FANCY = Object.freeze(['✧ {x} ✧', '★{x}★', '☆{x}☆', '♡{x}♡']);
const NAME_EMOJI_BASES = Object.freeze([['小熊', '🐻'], ['柠檬', '🍋'], ['橘子', '🍊'], ['小猫', '🐱'], ['樱花', '🌸'], ['草莓', '🍓'], ['兔兔', '🐰'], ['月亮', '🌙'], ['四叶草', '🍀'], ['小鱼', '🐟'], ['狐狸', '🦊'], ['企鹅', '🐧'], ['西瓜', '🍉'], ['奶茶', '🧋']]);
const NAME_FAN_TEMPLATES = Object.freeze(['{h}的小迷妹', '{h}本命', '{h}家的崽', '单推{h}一万年', '{h}永远的神', '{h}后援会']);
const TONE_NAMES = Object.freeze({
    ancient: Object.freeze({
        fixed: ['青衫客', '云中鹤', '落花有意', '无名剑修', '江湖路人', '长安过客', '山野散人', '归鸿', '听雨', '明月照人', '逍遥子', '一叶舟', '过路书生', '醉卧沙场', '烟雨江南', '浪迹天涯'],
        prefixes: ['清风', '无忧', '青云', '白鹤', '闲云', '碧水', '寒江', '松涛', '半夏', '听雪'],
        suffixes: ['道人', '散人', '居士', '先生', '剑客'],
        sentences: ['今日不宜早起', '愿得一人心', '且听风吟', '莫问前程', '不如归去', '酒入愁肠', '闲看庭前花', '山高水长'],
    }),
    fantasy: Object.freeze({
        fixed: ['见习魔导士', '星尘旅人', '龙族后裔', '森林守望者', '魔药学徒', '月下女巫', '学院新生', '结界维修工', '炼金术士', '路过的吟游诗人'],
        prefixes: ['夜莺', '月光', '星尘', '晨露', '灰烬', '风铃', '焰', '霜'],
        suffixes: ['法师', '魔导士', '术士', '学徒'],
        extra: ['精灵莉亚', '精灵艾拉', '精灵薇薇', '龙骑士阿尔', '龙骑士凯恩', '龙骑士洛克'],
        sentences: ['今天也想摸鱼（魔法版）', '再看五分钟就睡', '想吃魔法火锅', '不想上课', '施法失败了', '魔药还没炼完'],
    }),
    scifi: Object.freeze({
        fixed: ['深空旅人', '星港守夜人', '拾荒者', '轨道信使', '引航员', '数据幽灵', '舰桥观众', '机械师', '冷冻人'],
        prefixes: ['XC', 'MK', 'RX', 'QZ', 'NX'],
        suffixes: ['星港旅人', '星港信使', '星港守夜人'],
        sentences: ['今天也想摸鱼（星际版）', '再看五分钟就休眠', '想吃营养膏', '不想值班', '信号不太好', '我在挂机'],
    }),
});
export const LIVE_NAME_STYLES = Object.freeze([
    'adjNoun', 'nounNum', 'defaultUser', 'redup', 'english', 'sentence', 'fandom', 'symbol', 'emojiEnd', 'pun', 'role',
]);

const digits = (n, rng) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join('');
const lengthOf = (name) => Array.from(name).length;

function defaultUserName(rng) {
    const roll = rng();
    if (roll < 0.45) return `用户${digits(between(8, 10, rng), rng)}`;
    if (roll < 0.75) return `bili_${digits(between(6, 7, rng), rng)}`;
    return `手机用户${digits(4, rng)}`;
}

function toneName(tone, rng) {
    const set = TONE_NAMES[tone];
    const roll = rng();
    if (roll < 0.35) return pick(set.fixed, rng);
    if (roll < 0.7) {
        if (tone === 'scifi') {
            const style = rng();
            if (style < 0.4) return `${pick(set.prefixes, rng)}-${between(100, 9999, rng)}`;
            if (style < 0.7) return `舰员${between(1, 999, rng)}`;
            return pick(set.suffixes, rng);
        }
        if (tone === 'fantasy' && rng() < 0.4) return pick(set.extra, rng);
        return `${pick(set.prefixes, rng)}${pick(set.suffixes, rng)}`;
    }
    return pick(set.sentences, rng);
}

function buildNameByStyle(style, rng, ctx) {
    switch (style) {
        case 'adjNoun': return `${pick(LIVE_NAME_HEADS, rng)}${pick(LIVE_NAME_TAILS, rng)}`;
        case 'nounNum': return `${pick(NAME_NOUNS, rng)}${rng() < 0.3 ? ' ' : ''}${rng() < 0.5 ? digits(4, rng) : String(between(2, 9999, rng))}`;
        case 'defaultUser': return defaultUserName(rng);
        case 'redup': return pick(NAME_REDUP, rng);
        case 'english': return pick(NAME_ENGLISH, rng);
        case 'sentence': return pick(NAME_SENTENCES, rng);
        case 'fandom': {
            const host = Array.from(clean(ctx.host)).slice(0, 4).join('');
            return host ? pick(NAME_FAN_TEMPLATES, rng).replace('{h}', host) : `${pick(LIVE_NAME_HEADS, rng)}${pick(LIVE_NAME_TAILS, rng)}`;
        }
        case 'symbol': {
            const core = rng() < 0.6 ? pick(NAME_SYMBOL_CORES, rng) : pick(LIVE_NAME_TAILS, rng);
            const table = ctx.emoji && rng() < 0.35 ? SYMBOLS_FANCY : SYMBOLS_PLAIN;
            return pick(table, rng).replace('{x}', core).trim();
        }
        case 'emojiEnd': {
            const [base, mark] = pick(NAME_EMOJI_BASES, rng);
            return ctx.emoji ? `${base}${mark}` : base;
        }
        case 'pun': return pick(NAME_PUN, rng);
        case 'role': return pick(NAME_ROLES, rng);
        default: return `${pick(LIVE_NAME_HEADS, rng)}${pick(LIVE_NAME_TAILS, rng)}`;
    }
}

function styleWeights(tier, hasHost, emoji) {
    const big = tier === 'big' || tier === 'huge';
    const tiny = tier === 'tiny';
    return [
        ['adjNoun', 24], ['nounNum', 10], ['defaultUser', tiny ? 25 : big ? 6 : 10], ['redup', 8], ['english', 9],
        ['sentence', big ? 18 : 10], ['fandom', hasHost ? (big ? 9 : 6) : 0], ['symbol', big ? 14 : 7], ['emojiEnd', emoji ? 6 : 0],
        ['pun', 8], ['role', 7],
    ];
}

export function liveUserName(rng = Math.random, opts = {}) {
    const { tone = 'modern', tier, host, recent, style } = opts;
    const emoji = opts.emoji !== false;
    if (Array.isArray(recent) && recent.length && rng() < NAME_REPEAT) return pick(recent, rng);
    const ctx = { host, emoji };
    for (let tries = 0; tries < 6; tries += 1) {
        let name;
        if (style) name = buildNameByStyle(style, rng, ctx);
        else if (TOLERANT_TONES.includes(tone) && rng() < 0.6) name = toneName(tone, rng);
        else if (TOLERANT_TONES.includes(tone) && tone !== 'scifi') {
            name = buildNameByStyle(pickWeighted([['adjNoun', 5], ['redup', 2], ['sentence', 2], ['fandom', clean(host) ? 2 : 0], ['emojiEnd', emoji ? 1 : 0]], rng), rng, ctx);
        } else name = buildNameByStyle(pickWeighted(styleWeights(tier, Boolean(clean(host)), emoji), rng), rng, ctx);
        const size = lengthOf(name);
        if (size >= NAME_MIN && size <= NAME_MAX) return name;
    }
    return `${pick(LIVE_NAME_HEADS, rng)}${pick(LIVE_NAME_TAILS, rng)}`;
}
