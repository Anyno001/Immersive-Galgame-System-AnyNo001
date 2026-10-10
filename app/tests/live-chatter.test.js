import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyLiveScene, classifyLiveTopic, liveQuoteFragments, liveQuoteLine, LIVE_TOPIC_BUCKETS, decorateLiveEmoji, detectLiveScale, fanNameFromText, liveEconomy, liveTier, medalLevelBias, mergeLiveScale,
    normalizeFanMedalMap, normalizeLiveCustomLines, liveUserName, LIVE_NAME_STYLES, LIVE_EMOJI_BY_MOOD, LIVE_EMOJI_SPAM, parseCnNumber, pickMedalLevel, planLiveChatter, resolveFanMedal,
} from '../src/visual/igs-ui/live-chatter.js';
import * as pools from '../src/visual/igs-ui/danmaku-pools.js';

const seeded = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const runMany = (opts, runs = 200, seed = 1) => {
    const rng = seeded(seed);
    return Array.from({ length: runs }, () => planLiveChatter(opts, rng));
};
const flat = (plans) => plans.flat();
const BASE = /^(topic|quote|scene|role|mood|ambient|meme|classic|trash|bdxj|drama|anime|newage|tiny)/;

test('gate: classifyLiveScene 各场合关键词', () => {
    const cases = {
        emotion: '今晚情感电台，有人连麦咨询',
        sing: '主播开始唱歌点歌',
        game: '开始打游戏，boss 很难',
        eat: '深夜吃火锅夜宵',
        study: '自习写作业，番茄钟开始',
        looks: '换装跳舞走秀',
        outdoor: '户外散步逛街',
        accident: '主播翻车了，好尴尬',
        chat: '随便聊聊天气',
    };
    for (const [scene, text] of Object.entries(cases)) assert.equal(classifyLiveScene({ text, pageInLive: 5, hour: 12 }).scene, scene, scene);
    // 标题只在开场前几页计分，之后场合看本页正文；命中不足 2 回落 chat；单字不再触发。
    assert.equal(classifyLiveScene({ title: '唱歌点歌', text: '', pageInLive: 2 }).scene, 'sing');
    assert.equal(classifyLiveScene({ title: '情感电台', text: '他们吵了起来，下赌注的家伙是个混球', pageInLive: 39 }).scene, 'chat');
    assert.equal(classifyLiveScene({ title: '情感电台', text: '', pageInLive: 39 }).scene, 'chat');
    assert.equal(classifyLiveScene({ text: '她端着盘子走过来，尝了一口，操作很熟练，今晚的工作结束了', pageInLive: 9 }).scene, 'chat');
    assert.equal(classifyLiveScene({ text: '主播在唱歌，旋律很好听', pageInLive: 9 }).scene, 'sing');
});

test('gate: classifyLiveScene opening/ending/late 边界', () => {
    assert.equal(classifyLiveScene({ text: '打游戏通关副本', pageInLive: 1 }).scene, 'opening');
    assert.equal(classifyLiveScene({ text: '打游戏通关副本', pageInLive: 0 }).scene, 'opening');
    assert.equal(classifyLiveScene({ text: '打游戏通关副本', pageInLive: 2 }).scene, 'game');
    assert.equal(classifyLiveScene({ text: '打游戏通关副本', pageInLive: 1, ending: true }).scene, 'ending');
    assert.equal(classifyLiveScene({ text: '', pageInLive: 9, hour: 23 }).late, true);
    assert.equal(classifyLiveScene({ text: '', pageInLive: 9, hour: 5 }).late, true);
    assert.equal(classifyLiveScene({ text: '', pageInLive: 9, hour: 0 }).late, true);
    assert.equal(classifyLiveScene({ text: '', pageInLive: 9, hour: 6 }).late, false);
    assert.equal(classifyLiveScene({ text: '', pageInLive: 9, hour: 22 }).late, false);
    assert.equal(classifyLiveScene({ text: '', pageInLive: 9 }).late, false);
});

test('gate: 池条数达标且场合夸赞占比不超过三成', () => {
    assert.ok(pools.LIVE_AMBIENT_LINES.length >= 120);
    for (const role of ['newcomer', 'regular', 'fresh', 'asker', 'hurry', 'defender', 'patron', 'lurker', 'leaving']) assert.ok(pools.LIVE_ROLE_LINES[role].length >= 14, role);
    assert.ok(pools.LIVE_ROLE_LINES.hater.length >= 40);
    assert.ok(pools.LIVE_ROLE_LINES.roaster.length >= 30);
    assert.ok(pools.LIVE_ROLE_LINES.silly.length >= 25 && pools.LIVE_ROLE_LINES.selfish.length >= 25);
    assert.ok(pools.LIVE_PROFOUND_LINES.length >= 60 && pools.LIVE_MEME_LINES.length >= 150 && pools.LIVE_TRASH_MEME_LINES.length >= 100);
    assert.ok(pools.LIVE_BDXJ_LINES.length >= 40 && LIVE_EMOJI_SPAM.length >= 40 && pools.LIVE_CLASSIC_LINES.length >= 60);
    assert.ok(pools.LIVE_HOST_REPLY_LINES.length >= 30);
    assert.ok(pools.LIVE_SC_LINES.length >= 60 && pools.LIVE_GUARD_LINES.length >= 15 && pools.LIVE_WARN_MEME_LINES.length >= 25);
    assert.ok(Object.values(pools.LIVE_FANDOM_LINES).flat().length >= 40);
    for (const scene of Object.keys(pools.LIVE_SCENE_ANSWERS)) {
        assert.ok(pools.LIVE_SCENE_ANSWERS[scene].length >= 5 && pools.LIVE_SCENE_ANSWERS[scene].length <= 8, scene);
        assert.ok(pools.LIVE_SCENE_LINES[scene].length >= 30, scene);
        const share = pools.LIVE_SCENE_PRAISE_LINES[scene].length / pools.LIVE_SCENE_LINES[scene].length;
        assert.ok(share <= 0.31, `${scene} ${share}`);
    }
    for (const tone of ['fantasy', 'ancient', 'scifi']) {
        const p = pools.LIVE_TONE_POOLS[tone];
        const count = p.ambient.length + p.memes.length + p.host.length + pools.LIVE_TONE_CLASSIC[tone].length
            + Object.values(p.roles).reduce((n, l) => n + l.length, 0) + Object.values(p.scenes).reduce((n, l) => n + l.length, 0);
        assert.ok(count >= 120, `${tone} ${count}`);
        for (const role of ['silly', 'selfish']) assert.ok(p.roles[role].length >= 8 && p.roles[role].length <= 12, `${tone}.${role}`);
        assert.ok(p.memes.length >= 40, tone);
        assert.ok(pools.LIVE_TONE_WARN[tone].length >= 5);
        assert.ok(pools.LIVE_TONE_FANDOM[tone].neutral.length >= 5 && pools.LIVE_TONE_FANDOM[tone].f.length >= 3 && pools.LIVE_TONE_FANDOM[tone].m.length >= 3);
    }
});

test('gate: 混播比例落在合理区间', () => {
    const sceneSet = new Set(pools.LIVE_SCENE_LINES.game);
    const entries = flat(runMany({ text: '打游戏通关副本', pageInLive: 5, hour: 12, mood: 'funny', count: 10, emoji: false }, 300));
    const base = entries.filter((e) => BASE.test(e.src) || e.src === 'warn' || e.src === 'fandom');
    const share = (prefix) => base.filter((e) => e.src.startsWith(prefix)).length / base.length;
    assert.ok(share('scene:') > 0.4 && share('scene:') < 0.6, `scene ${share('scene:')}`);
    assert.ok(share('role:') > 0.13 && share('role:') < 0.27, `role ${share('role:')}`);
    assert.ok(share('mood:') > 0.09 && share('mood:') < 0.21, `mood ${share('mood:')}`);
    assert.ok(base.filter((e) => e.src.startsWith('scene:')).every((e) => sceneSet.has(e.text) || pools.LIVE_SCENE_LINES.late.includes(e.text)));
    const roleBase = base.filter((e) => e.src.startsWith('role:'));
    const sillySelfish = roleBase.filter((e) => /silly|selfish/.test(e.src)).length / roleBase.length;
    assert.ok(sillySelfish > 0.22 && sillySelfish < 0.38, `silly ${sillySelfish}`);
    const general = base.filter((e) => ['meme', 'classic', 'trash', 'ambient', 'bdxj', 'newage'].includes(e.src));
    const memeShare = general.filter((e) => e.src === 'meme').length / general.length;
    const classicShare = general.filter((e) => e.src === 'classic').length / general.length;
    assert.ok(memeShare > 0.3 && memeShare < 0.5, `meme ${memeShare}`);
    assert.ok(classicShare > 0.1 && classicShare < 0.2, `classic ${classicShare}`);
});

test('gate: 返回格式、按 delay 升序且允许重复', () => {
    const plan = planLiveChatter({ text: '', pageInLive: 3, count: 8 }, seeded(7));
    assert.ok(plan.length >= 8);
    for (const item of plan) {
        assert.equal(typeof item.user, 'string');
        assert.ok(item.text);
        assert.ok(item.type === 'text' || item.type === 'admin');
        assert.ok(Number.isInteger(item.delay) && item.delay >= 0);
    }
    for (let i = 1; i < plan.length; i += 1) assert.ok(plan[i].delay >= plan[i - 1].delay);
    const texts = flat(runMany({ pageInLive: 3, count: 8 }, 100)).map((e) => e.text);
    assert.ok(new Set(texts).size < texts.length);
    assert.equal(planLiveChatter({ count: 0 }, () => 0.99).filter((e) => !e.src.startsWith('wave')).length, 0);
});

test('gate: 刷屏潮 1.5 秒内 3–6 个不同网名', () => {
    const waves = runMany({ pageInLive: 4, count: 4, emoji: true }, 400)
        .map((p) => p.filter((e) => e.src === 'wave:emoji' || e.src === 'wave:meme' || (e.src === 'wave:bdxj' && e.delay < 1500 && !pools.LIVE_BDXJ_LINES.includes(e.text.length > 1 ? '' : e.text) === false)));
    const real = waves.filter((w) => w.length >= 3);
    assert.ok(real.length > 40);
    for (const wave of real) {
        const spread = wave[wave.length - 1].delay - wave[0].delay;
        assert.ok(spread <= 1500, `spread ${spread}`);
        assert.equal(new Set(wave.map((e) => e.user)).size, wave.length);
    }
    const spamOnly = runMany({ pageInLive: 4, count: 0, emoji: true }, 600).map((p) => p.filter((e) => /^wave:(emoji|meme)$/.test(e.src)));
    const rate = spamOnly.filter((w) => w.length > 0).length / spamOnly.length;
    assert.ok(rate > 0.12 && rate < 0.3, `rate ${rate}`);
    for (const wave of spamOnly.filter((w) => w.length)) {
        assert.ok(wave.length >= 3 && wave.length <= 6);
        assert.ok(wave[wave.length - 1].delay - wave[0].delay <= 1500);
        assert.equal(new Set(wave.map((e) => e.user)).size, wave.length);
    }
});

test('gate: 刷屏潮包含纯 emoji 与绷典孝急单字', () => {
    const entries = flat(runMany({ pageInLive: 4, count: 0 }, 1200));
    const emojiWave = entries.filter((e) => e.src === 'wave:emoji');
    const bdxjWave = entries.filter((e) => e.src === 'wave:bdxj');
    assert.ok(emojiWave.length > 0 && emojiWave.every((e) => LIVE_EMOJI_SPAM.includes(e.text)));
    assert.ok(bdxjWave.length > 0 && bdxjWave.every((e) => pools.LIVE_BDXJ_CHARS.includes(e.text)));
    assert.ok(new Set(bdxjWave.map((e) => e.text)).size >= 3);
    const spam = entries.filter((e) => /^wave:(emoji|meme|bdxj)$/.test(e.src));
    const emojiShare = emojiWave.length / spam.length;
    const bdxjShare = bdxjWave.length / spam.length;
    assert.ok(emojiShare > 0.25 && emojiShare < 0.45, `emoji wave ${emojiShare}`);
    assert.ok(bdxjShare > 0.12 && bdxjShare < 0.3, `bdxj wave ${bdxjShare}`);
});

test('gate: 复读 AI 弹幕', () => {
    const ai = ['这也太离谱了吧', '主播笑了'];
    const plans = runMany({ pageInLive: 4, count: 2, aiLines: ai }, 300);
    const repeats = flat(plans).filter((e) => e.src === 'repeat');
    assert.ok(repeats.length > 0);
    assert.ok(repeats.every((e) => ai.includes(e.text) || e.text === '+1'));
    assert.ok(repeats.some((e) => e.text === '+1') && repeats.some((e) => ai.includes(e.text)));
    const per = plans.map((p) => p.filter((e) => e.src === 'repeat'));
    const hit = per.filter((r) => r.length > 0).length / per.length;
    assert.ok(hit > 0.5 && hit < 0.85, `hit ${hit}`);
    for (const r of per) assert.ok(r.length <= 6);
});

test('gate: newcomer 提问后有人用当前场合答句接话', () => {
    const plans = runMany({ text: '主播正在吃火锅夜宵', pageInLive: 5, count: 14, emoji: false }, 300);
    let asked = 0;
    let answered = 0;
    for (const plan of plans) {
        const ask = plan.find((e) => e.src === 'role:newcomer' && /播什么|什么内容|播啥|什么主题/.test(e.text));
        if (!ask) continue;
        asked += 1;
        const answers = plan.filter((e) => e.src === 'answer');
        if (answers.length) {
            answered += 1;
            for (const a of answers) {
                assert.ok(pools.LIVE_SCENE_ANSWERS.eat.includes(a.text));
                assert.ok(a.delay >= 2000 && a.delay <= 5200, `${a.delay}`);
            }
            assert.equal(new Set(answers.map((a) => a.user)).size, answers.length);
        }
    }
    assert.ok(asked > 5);
    assert.equal(answered, asked);
});

test('gate: hater 之后有 defender 接话与急典跟风', () => {
    const plans = runMany({ pageInLive: 4, count: 14, emoji: false }, 400);
    const withHater = plans.filter((p) => p.some((e) => e.src === 'role:hater'));
    assert.ok(withHater.length > 30);
    const defend = withHater.filter((p) => p.some((e) => e.src === 'defend')).length / withHater.length;
    const follow = withHater.filter((p) => p.some((e) => e.src === 'wave:bdxj' && e.delay >= 1200 && /[急典]/.test(e.text))).length / withHater.length;
    assert.ok(defend > 0.35 && defend < 0.65, `defend ${defend}`);
    assert.ok(follow > 0.3 && follow < 0.6, `follow ${follow}`);
    assert.ok(flat(withHater).filter((e) => e.src === 'defend').every((e) => pools.LIVE_ROLE_LINES.defender.includes(e.text)));
});

test('gate: 犯傻之后偶有人接话', () => {
    const plans = runMany({ pageInLive: 4, count: 14, emoji: false }, 400).filter((p) => p.some((e) => e.src === 'role:silly'));
    assert.ok(plans.length > 30);
    const replied = plans.filter((p) => p.some((e) => e.src === 'sillyReply')).length / plans.length;
    assert.ok(replied > 0.15 && replied < 0.5, `${replied}`);
    assert.ok(flat(plans).filter((e) => e.src === 'sillyReply').every((e) => pools.LIVE_SILLY_REPLY_LINES.includes(e.text)));
});

test('gate: 扣1 句子引发 1/11/111 刷屏', () => {
    const plans = runMany({ pageInLive: 4, count: 20, emoji: false }, 600);
    const withClick = plans.filter((p) => p.some((e) => /扣1/.test(e.text) && !e.src.startsWith('wave')));
    assert.ok(withClick.length > 10);
    const waved = withClick.filter((p) => p.some((e) => e.src === 'wave:click'));
    assert.ok(waved.length / withClick.length > 0.4 && waved.length / withClick.length < 0.8);
    for (const p of waved) {
        const wave = p.filter((e) => e.src === 'wave:click');
        assert.ok(wave.length >= 3 && wave.length <= 8);
        assert.ok(wave.every((e) => /^1{1,3}$/.test(e.text)));
        assert.equal(new Set(wave.map((e) => e.user)).size, wave.length);
    }
});

test('gate: 警告梗在 love 情绪或暧昧时上调并可成小刷屏', () => {
    const rate = (opts) => {
        const entries = flat(runMany({ pageInLive: 4, count: 12, emoji: false, ...opts }, 300, 11));
        return entries.filter((e) => e.src === 'warn').length / entries.filter((e) => BASE.test(e.src) || e.src === 'warn' || e.src === 'fandom').length;
    };
    const calm = rate({ mood: 'funny' });
    assert.ok(rate({ mood: 'love' }) > calm * 2.5, `${rate({ mood: 'love' })} vs ${calm}`);
    assert.ok(rate({ mood: 'funny', spicy: true }) > calm * 2.5);
    const waves = runMany({ pageInLive: 4, count: 6, mood: 'love' }, 300, 12).map((p) => p.filter((e) => e.src === 'wave:warn')).filter((w) => w.length);
    assert.ok(waves.length > 30);
    for (const wave of waves) {
        assert.ok(wave.length >= 3 && wave.length <= 5);
        assert.ok(wave.every((e) => e.text === '警告一次'));
        assert.equal(new Set(wave.map((e) => e.user)).size, wave.length);
    }
    const toneWave = flat(runMany({ pageInLive: 4, count: 6, mood: 'love', tone: 'scifi' }, 200, 12)).filter((e) => e.src === 'wave:warn');
    assert.ok(toneWave.length > 0 && toneWave.every((e) => pools.LIVE_TONE_WARN.scifi.includes(e.text)));
});

test('gate: 饭圈称呼按主播性别过滤', () => {
    const lines = (hostGender, extra = {}) => flat(runMany({ pageInLive: 4, count: 14, emoji: false, hostGender, ...extra }, 500, 21)).filter((e) => e.src === 'fandom').map((e) => e.text);
    const neutral = new Set(pools.LIVE_FANDOM_LINES.neutral);
    const none = lines(null);
    assert.ok(none.length > 40 && none.every((t) => neutral.has(t)));
    const female = lines('f');
    assert.ok(female.some((t) => pools.LIVE_FANDOM_LINES.f.includes(t)));
    assert.ok(female.every((t) => neutral.has(t) || pools.LIVE_FANDOM_LINES.f.includes(t)));
    const male = lines('m');
    assert.ok(male.some((t) => pools.LIVE_FANDOM_LINES.m.includes(t)));
    assert.ok(male.every((t) => neutral.has(t) || pools.LIVE_FANDOM_LINES.m.includes(t)));
    assert.equal(female.some((t) => pools.LIVE_FANDOM_LINES.m.includes(t)), false);
    const looks = flat(runMany({ text: '换装跳舞', pageInLive: 5, count: 14, emoji: false }, 200, 22)).filter((e) => e.src === 'fandom').length;
    const chat = flat(runMany({ text: '随便聊聊', pageInLive: 5, count: 14, emoji: false }, 200, 22)).filter((e) => e.src === 'fandom').length;
    assert.ok(looks > chat * 2, `${looks} vs ${chat}`);
    const ancient = flat(runMany({ pageInLive: 4, count: 14, tone: 'ancient', emoji: false, hostGender: 'm' }, 300, 23)).filter((e) => e.src === 'fandom').map((e) => e.text);
    const set = pools.LIVE_TONE_FANDOM.ancient;
    assert.ok(ancient.length > 10 && ancient.every((t) => set.neutral.includes(t) || set.m.includes(t)));
});

test('gate: tiny 规模混入「就我一个人吗」类弹幕', () => {
    const tiny = flat(runMany({ pageInLive: 4, count: 14, tier: 'tiny', emoji: false }, 200, 31)).filter((e) => e.src === 'tiny');
    assert.ok(tiny.length > 20 && tiny.every((e) => pools.LIVE_TINY_LINES.includes(e.text)));
    assert.equal(flat(runMany({ pageInLive: 4, count: 14, tier: 'big' }, 100, 31)).some((e) => e.src === 'tiny'), false);
});

test('gate: 短剧梗按情绪挂钩，love 多苦命鸳鸯、anger 与 tense 多狗血', () => {
    assert.ok(pools.LIVE_DRAMA_MEME_LINES.length >= 80);
    for (const kind of ['romance', 'dogblood', 'other']) assert.ok(pools.LIVE_DRAMA_BY_KIND[kind].length >= 25, kind);
    const romance = new Set(pools.LIVE_DRAMA_BY_KIND.romance);
    const dogblood = new Set(pools.LIVE_DRAMA_BY_KIND.dogblood);
    const share = (mood, set) => {
        const drama = flat(runMany({ pageInLive: 4, count: 14, mood, emoji: false }, 300, 51)).filter((e) => e.src === 'drama');
        return { n: drama.length, hit: drama.filter((e) => set.has(e.text)).length / drama.length };
    };
    const love = share('love', romance);
    assert.ok(love.n > 40 && love.hit > 0.6, JSON.stringify(love));
    const anger = share('anger', dogblood);
    const tense = share('tense', dogblood);
    assert.ok(anger.hit > 0.6 && tense.hit > 0.6, JSON.stringify([anger, tense]));
    assert.ok(share('funny', romance).hit < 0.5);
    const rate = (mood) => flat(runMany({ pageInLive: 4, count: 14, mood, emoji: false }, 300, 52)).filter((e) => e.src === 'drama').length;
    assert.ok(rate('love') > rate('funny') * 2);
});

test('gate: 动漫梗按情绪与场合挂钩', () => {
    assert.ok(pools.LIVE_ANIME_MEME_LINES.length >= 80);
    for (const kind of ['chuuni', 'hot', 'romance', 'misc']) assert.ok(pools.LIVE_ANIME_BY_KIND[kind].length >= 20, kind);
    const pick = (opts, kinds) => {
        const anime = flat(runMany({ pageInLive: 4, count: 14, emoji: false, ...opts }, 300, 61)).filter((e) => e.src === 'anime');
        const set = new Set(kinds.flatMap((k) => pools.LIVE_ANIME_BY_KIND[k]));
        return { n: anime.length, hit: anime.filter((e) => set.has(e.text)).length / anime.length };
    };
    const love = pick({ mood: 'love' }, ['romance']);
    const fight = pick({ mood: 'tense' }, ['chuuni', 'hot']);
    const game = pick({ text: '打游戏通关副本', mood: 'funny' }, ['chuuni', 'hot']);
    assert.ok(love.n > 30 && love.hit > 0.6, JSON.stringify(love));
    assert.ok(fight.hit > 0.6 && game.hit > 0.6, JSON.stringify([fight, game]));
    assert.ok(pick({ text: '换装跳舞', mood: 'funny' }, ['romance']).hit > 0.6);
    const baseRate = flat(runMany({ pageInLive: 4, count: 14, mood: 'funny', emoji: false }, 300, 62)).filter((e) => e.src === 'anime').length;
    assert.ok(fight.n > baseRate * 1.8);
});

test('gate: 新时代梗占通用池约一成五，吃播颜值带货更高', () => {
    assert.ok(pools.LIVE_NEWAGE_MEME_LINES.length >= 60);
    const ratio = (text) => {
        const entries = flat(runMany({ text, pageInLive: 5, count: 14, mood: 'funny', emoji: false }, 300, 71));
        const general = entries.filter((e) => ['meme', 'classic', 'trash', 'ambient', 'bdxj', 'newage'].includes(e.src));
        return general.filter((e) => e.src === 'newage').length / general.length;
    };
    const normal = ratio('随便聊聊');
    assert.ok(normal > 0.1 && normal < 0.2, `${normal}`);
    for (const text of ['吃火锅夜宵', '换装跳舞', '直播带货上链接']) assert.ok(ratio(text) > normal * 1.5, text);
    assert.equal(classifyLiveScene({ text: '主播在带货，上链接，福袋', pageInLive: 5 }).scene, 'shop');
    const answers = flat(runMany({ text: '带货上链接秒杀', pageInLive: 5, count: 14, emoji: false }, 200, 72)).filter((e) => e.src === 'answer');
    assert.ok(answers.length === 0 || answers.every((e) => /带货|链接|福袋|卖/.test(e.text)));
});

test('gate: 世界观口吻带穿越感的短剧、动漫、新时代变体', () => {
    for (const tone of ['fantasy', 'ancient', 'scifi']) {
        const extra = pools.LIVE_TONE_EXTRA[tone];
        for (const key of ['drama', 'anime', 'newage']) assert.ok(extra[key].length >= 10, `${tone}.${key}`);
        const entries = flat(runMany({ pageInLive: 4, count: 14, tone, mood: 'love', emoji: false }, 200, 81));
        assert.ok(entries.some((e) => e.src === 'drama' && extra.drama.includes(e.text)), tone);
        assert.ok(entries.some((e) => e.src === 'anime' && extra.anime.includes(e.text)), tone);
        assert.ok(entries.some((e) => e.src === 'newage' && extra.newage.includes(e.text)), tone);
        assert.ok(entries.filter((e) => ['drama', 'anime', 'newage'].includes(e.src)).every((e) => Object.values(extra).flat().includes(e.text)));
    }
    const modern = flat(runMany({ pageInLive: 4, count: 14, mood: 'love', emoji: false }, 100, 82)).filter((e) => e.src === 'drama');
    assert.ok(modern.every((e) => pools.LIVE_DRAMA_MEME_LINES.includes(e.text)));
});

test('gate: 点名主播与用户名', () => {
    const all = flat(runMany({ pageInLive: 4, count: 4, userName: '阿喵', hostName: '小夏' }, 500));
    assert.ok(all.some((e) => e.text === '@小夏 看我'));
    assert.ok(all.some((e) => e.src === 'mention' && e.text.includes('阿喵')));
    assert.ok(!flat(runMany({ pageInLive: 4, count: 4 }, 300)).some((e) => e.src === 'mention' && /阿喵/.test(e.text)));
});

test('gate: hostSaid 非空时插入 1–2 条回应主播', () => {
    for (const plan of runMany({ pageInLive: 4, count: 3, hostSaid: '今天讲个故事', emoji: false }, 60)) {
        const host = plan.filter((e) => e.src === 'host');
        assert.ok(host.length >= 1 && host.length <= 2);
        assert.ok(host.every((e) => pools.LIVE_HOST_REPLY_LINES.includes(e.text)));
    }
    assert.ok(runMany({ pageInLive: 4, count: 3 }, 60).every((p) => !p.some((e) => e.src === 'host')));
});

test('gate: tone 切换取到对应池', () => {
    for (const tone of ['fantasy', 'ancient', 'scifi']) {
        const p = pools.LIVE_TONE_POOLS[tone];
        const allowed = new Set([
            ...p.ambient, ...p.memes, ...p.host, ...pools.LIVE_TONE_CLASSIC[tone], ...p.sillyReply, ...pools.LIVE_TONE_WARN[tone],
            ...Object.values(p.roles).flat(), ...Object.values(p.scenes).flat(), ...Object.values(p.answers).flat(),
            ...Object.values(pools.AUDIENCE_AMBIENT_LINES).flat(), ...Object.values(pools.LIVE_TONE_FANDOM[tone]).flat(),
            ...Object.values(pools.LIVE_TONE_EXTRA[tone]).flat(), ...pools.LIVE_TONE_ORDER[tone].keeper, ...pools.LIVE_TONE_ORDER[tone].peace, ...pools.LIVE_TONE_ORDER[tone].rebut,
        ]);
        const entries = flat(runMany({ pageInLive: 4, count: 10, tone, emoji: false, hostGender: 'f' }, 150, 3))
            .filter((e) => !/^(wave|repeat|mention|admin|banReact)/.test(e.src));
        assert.ok(entries.length > 100);
        assert.deepEqual(entries.filter((e) => !allowed.has(e.text)).map((e) => e.text), [], tone);
    }
    const modern = flat(runMany({ pageInLive: 4, count: 10, tone: 'modern', emoji: false }, 60)).filter((e) => e.src.startsWith('scene:'));
    assert.ok(modern.every((e) => !pools.LIVE_TONE_POOLS.ancient.memes.includes(e.text)));
    const ancient = flat(runMany({ pageInLive: 4, count: 10, tone: 'ancient', emoji: false }, 60)).map((e) => e.text);
    assert.ok(ancient.some((t) => pools.LIVE_TONE_POOLS.ancient.memes.includes(t)));
    const unknown = flat(runMany({ pageInLive: 4, count: 6, tone: 'weird', emoji: false }, 20));
    assert.ok(unknown.length > 0);
});

test('gate: custom 与内置池合并', () => {
    const custom = { game: ['自定义游戏句'], newcomer: ['自定义新人句'], ambient: ['自定义通用句'] };
    const all = flat(runMany({ text: '打游戏通关副本', pageInLive: 5, count: 12, custom, emoji: false }, 300)).map((e) => e.text);
    assert.ok(all.includes('自定义游戏句'));
    assert.ok(all.includes('自定义新人句'));
    assert.ok(all.includes('自定义通用句'));
    assert.ok(all.some((t) => pools.LIVE_SCENE_LINES.game.includes(t)));
    assert.equal(pools.LIVE_SCENE_LINES.game.includes('自定义游戏句'), false);
    assert.deepEqual(custom.game, ['自定义游戏句']);
});

test('gate: emoji 概率、位置与按情绪挑选', () => {
    const entries = flat(runMany({ pageInLive: 4, count: 12 }, 300, 5)).filter((e) => BASE.test(e.src));
    const withEmoji = entries.filter((e) => EMOJI_RE.test(e.text));
    const rate = withEmoji.length / entries.length;
    assert.ok(rate > 0.14 && rate < 0.26, `rate ${rate}`);
    assert.ok(withEmoji.some((e) => EMOJI_RE.test(Array.from(e.text)[0])));
    assert.ok(withEmoji.filter((e) => !EMOJI_RE.test(Array.from(e.text)[0])).length > withEmoji.length * 0.7);
    assert.ok(withEmoji.every((e) => e.text.replace(/\p{Extended_Pictographic}️?/gu, '').length > 0));
    const funny = withEmoji.filter((e) => /哈哈|笑死/.test(e.text));
    assert.ok(funny.length > 0 && funny.every((e) => LIVE_EMOJI_BY_MOOD.funny.some((m) => e.text.includes(m))));
    const toneRate = (tone) => {
        const list = flat(runMany({ pageInLive: 4, count: 12, tone }, 300, 5)).filter((e) => BASE.test(e.src));
        return list.filter((e) => EMOJI_RE.test(e.text)).length / list.length;
    };
    const aRate = toneRate('ancient');
    assert.ok(aRate < rate * 0.75 && aRate > 0.04, `ancient ${aRate}`);
    assert.ok(toneRate('fantasy') < rate * 0.75);
    assert.ok(toneRate('scifi') > 0.14);
    const sample = decorateLiveEmoji('哈哈哈', 'modern', () => 0.01);
    assert.ok(EMOJI_RE.test(sample) && sample.includes('哈哈哈'));
    assert.equal(decorateLiveEmoji('哈哈哈', 'modern', () => 0.99), '哈哈哈');
});

test('gate: emoji 关闭时没有 emoji', () => {
    const all = flat(runMany({ pageInLive: 4, count: 12, emoji: false }, 400, 9));
    assert.ok(all.length > 1000);
    assert.equal(all.filter((e) => EMOJI_RE.test(e.text)).length, 0);
    assert.equal(all.some((e) => e.src === 'wave:emoji'), false);
    assert.ok(flat(runMany({ pageInLive: 4, count: 12, emoji: true }, 400, 9)).some((e) => e.src === 'wave:emoji'));
});

test('gate: 深夜与场合混入 late 句', () => {
    const lateLines = new Set(pools.LIVE_SCENE_LINES.late);
    const entries = flat(runMany({ text: '打游戏通关副本', pageInLive: 5, hour: 2, count: 12, emoji: false }, 200)).filter((e) => e.src === 'scene:late');
    assert.ok(entries.length > 100);
    assert.ok(entries.every((e) => lateLines.has(e.text)));
    assert.equal(flat(runMany({ text: '打游戏通关副本', pageInLive: 5, hour: 14, count: 12 }, 100)).some((e) => e.src === 'scene:late'), false);
});

test('gate: 池内容不含脏话与群体攻击词', () => {
    const banned = /傻[逼B]|妈的|操你|滚蛋|丑八怪|胖子|矮子|智障|残废|脑残|黑鬼|河南人|东北人|女人就/;
    const all = [
        ...pools.LIVE_HATER_LINES, ...pools.LIVE_ROASTER_LINES, ...pools.LIVE_TRASH_MEME_LINES, ...pools.LIVE_MEME_LINES,
        ...pools.LIVE_BDXJ_LINES, ...pools.LIVE_SC_LINES, ...Object.values(pools.LIVE_SCENE_LINES).flat(),
    ].filter((l) => !/离谱他妈给离谱开门/.test(l));
    assert.deepEqual(all.filter((l) => banned.test(l)), []);
});

test('gate: normalizeLiveCustomLines', () => {
    assert.deepEqual(normalizeLiveCustomLines(''), {});
    assert.deepEqual(normalizeLiveCustomLines(null), {});
    assert.deepEqual(normalizeLiveCustomLines({ game: '  \n\n' }), {});
    assert.deepEqual(normalizeLiveCustomLines('甲\n\n 乙 \r\n丙'), { ambient: ['甲', '乙', '丙'] });
    assert.deepEqual(normalizeLiveCustomLines(['甲', '', '  ', '乙']), { ambient: ['甲', '乙'] });
    const out = normalizeLiveCustomLines({ game: ['字'.repeat(60), 'ok'], eat: 'a\nb', hater: Array.from({ length: 300 }, (_, i) => `l${i}`) });
    assert.equal(Array.from(out.game[0]).length, 40);
    assert.deepEqual(out.eat, ['a', 'b']);
    assert.equal(out.hater.length, 200);
});

test('gate: fanNameFromText 正例', () => {
    const positives = [
        ['粉丝自称『吒吒子』，每天都来蹲守', '', '吒吒子'],
        ['她的粉丝叫砚台，都很听话', '', '砚台'],
        ['小夏的粉丝们（夏家军）早早就到了', '小夏', '夏家军'],
        ['粉丝名是「小星星」', '', '小星星'],
        ['小夏的粉丝团《夏日团》正在刷屏', '小夏', '夏日团'],
        ['听说林雪的粉丝自称雪崽', '林雪', '雪崽'],
        ['粉丝们自称为“向日葵”', '', '向日葵'],
        ['他的粉丝称为柠檬卫', '', '柠檬卫'],
        ['主播苏苏的粉丝叫做苏苏粉', '苏苏', '苏苏粉'],
    ];
    for (const [text, streamer, expected] of positives) assert.equal(fanNameFromText(text, streamer), expected, text);
});

test('gate: fanNameFromText 反例', () => {
    assert.equal(fanNameFromText('', '小夏'), '');
    assert.equal(fanNameFromText('今天天气很好，她开了直播', '小夏'), '');
    assert.equal(fanNameFromText('粉丝很多，大家都在刷礼物。她笑了笑。', '小夏'), '');
    assert.equal(fanNameFromText('粉丝们都很开心。', '小夏'), '');
    assert.equal(fanNameFromText('粉丝叫他们别吵', ''), '');
    assert.equal(fanNameFromText('粉丝自称是她们', ''), '');
});

test('gate: normalizeFanMedalMap 与 resolveFanMedal', () => {
    assert.deepEqual(normalizeFanMedalMap(''), {});
    assert.deepEqual(normalizeFanMedalMap('小夏=夏家军\n 阿雪：雪崽 \n无效行\n=空\n小红=超长超长超长超长牌名'), { 小夏: '夏家军', 阿雪: '雪崽', 小红: '超长超长超长' });
    assert.deepEqual(normalizeFanMedalMap({ 甲: ' 乙团 ', 丙: '' }), { 甲: '乙团' });
    assert.equal(resolveFanMedal({ streamer: '小夏', fromText: '正文牌', customMap: { 小夏: '自定义牌' } }), '自定义牌');
    assert.equal(resolveFanMedal({ streamer: '小夏同学', fromText: '正文牌', customMap: { 小夏: '宽松牌' } }), '宽松牌');
    assert.equal(resolveFanMedal({ streamer: '小', fromText: '正文牌', customMap: { 小夏: '反向牌' } }), '反向牌');
    assert.equal(resolveFanMedal({ streamer: '小夏', fromText: '正文牌', customMap: {} }), '正文牌');
    const auto = resolveFanMedal({ streamer: '小夏' });
    assert.ok(pools.FAN_MEDAL_SUFFIXES.some((s) => auto === `小${s}`));
    assert.equal(auto, resolveFanMedal({ streamer: '小夏' }));
    assert.equal(pools.fanMedalName('小夏'), '小团子');
    assert.equal(pools.fanMedalNameFor('小夏', ' 专属 '), '专属');
});

test('gate: parseCnNumber', () => {
    const cases = [
        ['三千', 3000], ['1.2万', 12000], ['十万+', 100000], ['百万', 1000000], ['千万', 10000000], ['两千五', 2500],
        ['三万五', 35000], ['一百二十', 120], ['万', 10000], ['十二', 12], ['3,000', 3000], ['1.5亿', 150000000],
        ['二十', 20], ['一千二百零五', 1205], ['5k', 5000], ['2w', 20000], ['约三千', 3000], ['八十', 80], ['两万', 20000], ['一百万', 1000000],
    ];
    for (const [raw, expected] of cases) assert.equal(parseCnNumber(raw), expected, raw);
    for (const bad of ['abc', '', '三千块钱', null, undefined]) assert.equal(parseCnNumber(bad), null, String(bad));
});

test('gate: detectLiveScale 正例与反例', () => {
    assert.deepEqual(detectLiveScale('她有1.2万粉丝，直播间三千人在线，热度破万。', ''), { fans: 12000, viewers: 3000, heat: 10000, hints: [] });
    assert.equal(detectLiveScale('粉丝三千，今天来了不少人', '').fans, 3000);
    assert.equal(detectLiveScale('小夏的3万粉都在等她', '小夏').fans, 30000);
    assert.equal(detectLiveScale('粉丝数突破十万+', '').fans, 100000);
    assert.equal(detectLiveScale('在线人数：两千五', '').viewers, 2500);
    assert.equal(detectLiveScale('现在有八十人在看', '').viewers, 80);
    assert.equal(detectLiveScale('粉丝破万了', '').fans, 10000);
    assert.equal(detectLiveScale('人气值一百二十', '').heat, 120);
    assert.equal(detectLiveScale('粉丝才八十个', '').fans, 80);
    assert.equal(detectLiveScale('小主播，没什么人看').hints.includes('small'), true);
    assert.equal(detectLiveScale('她是顶流，上了热搜', '').hints.includes('huge'), true);
    assert.equal(detectLiveScale('小有名气的腰部主播', '').hints.includes('mid'), true);
    assert.equal(detectLiveScale('直播间冷清，零星几个人', '').hints.includes('tiny'), true);
    const none = { fans: null, viewers: null, heat: null, hints: [] };
    assert.deepEqual(detectLiveScale('她花了三千块钱买了条裙子', ''), none);
    assert.deepEqual(detectLiveScale('粉色的裙子很好看，粉红色的灯光', ''), none);
    assert.deepEqual(detectLiveScale('三千年前的故事，一万个理由', ''), none);
    assert.deepEqual(detectLiveScale('', ''), none);
    assert.deepEqual(detectLiveScale('她在人群里走了三千步', ''), none);
});

test('gate: liveTier 边界与回落', () => {
    assert.equal(liveTier({ viewers: 19 }), 'tiny');
    assert.equal(liveTier({ viewers: 20 }), 'small');
    assert.equal(liveTier({ viewers: 499 }), 'small');
    assert.equal(liveTier({ viewers: 500 }), 'mid');
    assert.equal(liveTier({ viewers: 5000 }), 'big');
    assert.equal(liveTier({ viewers: 100000 }), 'huge');
    assert.equal(liveTier({ fans: 99 }), 'tiny');
    assert.equal(liveTier({ fans: 100 }), 'small');
    assert.equal(liveTier({ fans: 5000 }), 'mid');
    assert.equal(liveTier({ fans: 100000 }), 'big');
    assert.equal(liveTier({ fans: 2000000 }), 'huge');
    assert.equal(liveTier({ heat: 5000 }), 'mid');
    assert.equal(liveTier({ fans: 100, viewers: 30000, hints: ['tiny'] }), 'big');
    assert.equal(liveTier({ hints: ['huge'] }), 'huge');
    assert.equal(liveTier({ hints: ['small', 'tiny'] }), 'small');
    assert.equal(liveTier({ hints: ['tiny'] }), 'tiny');
    assert.equal(liveTier({ hints: [] }), null);
    assert.equal(liveTier({}), null);
    assert.equal(liveTier(), null);
});

test('gate: liveEconomy 随规模单调增长', () => {
    const tiers = ['tiny', 'small', 'mid', 'big', 'huge'];
    const eco = tiers.map((tier) => liveEconomy(tier));
    for (let i = 1; i < eco.length; i += 1) {
        for (const key of ['scRate', 'guardRate', 'basePopularity', 'densityMul', 'giftRate']) assert.ok(eco[i][key] > eco[i - 1][key] || (key === 'guardRate' && eco[i][key] > eco[i - 1][key]), `${tiers[i]} ${key}`);
        assert.ok(Math.max(...eco[i].scAmounts) >= Math.max(...eco[i - 1].scAmounts));
    }
    assert.equal(eco[0].scRate, 0.005);
    assert.equal(eco[0].guardRate, 0);
    assert.equal(eco[0].densityMul, 0.5);
    assert.deepEqual(eco[0].guardLevels, {});
    assert.equal(Math.max(...eco[3].scAmounts), 500);
    assert.equal(Math.max(...eco[4].scAmounts), 2000);
    assert.equal(eco[4].densityMul, 1.6);
    assert.ok(eco[4].guardLevels.governor > 0 && !eco[3].guardLevels.governor && eco[3].guardLevels.admiral > 0);
    assert.deepEqual(liveEconomy('nope'), liveEconomy('mid'));
    const copy = liveEconomy('mid');
    copy.scAmounts.push(9999);
    assert.equal(liveEconomy('mid').scAmounts.includes(9999), false);
});

test('gate: medalLevelBias 规模越大等级越高', () => {
    const mean = (tier) => {
        const rng = seeded(41);
        return Array.from({ length: 2000 }, () => pickMedalLevel(tier, rng)).reduce((a, b) => a + b, 0) / 2000;
    };
    const means = ['tiny', 'small', 'mid', 'big', 'huge'].map(mean);
    for (let i = 1; i < means.length; i += 1) assert.ok(means[i] > means[i - 1], `${means}`);
    const bias = medalLevelBias('huge');
    for (let i = 0; i < 200; i += 1) {
        const level = pickMedalLevel('huge', seeded(i));
        assert.ok(level >= bias.min && level <= bias.max);
    }
    assert.deepEqual(medalLevelBias('none'), medalLevelBias('mid'));
});

test('gate: mergeLiveScale 新值覆盖旧值，缺失沿用', () => {
    const prev = { fans: 3000, viewers: 80, heat: null, hints: ['small'] };
    assert.deepEqual(mergeLiveScale(prev, { fans: null, viewers: 500, heat: null, hints: [] }), { fans: 3000, viewers: 500, heat: null, hints: ['small'] });
    assert.deepEqual(mergeLiveScale(prev, { fans: 20000, viewers: null, heat: 900, hints: ['huge'] }), { fans: 20000, viewers: 80, heat: 900, hints: ['huge'] });
    assert.deepEqual(mergeLiveScale(null, { fans: 1, viewers: null, heat: null, hints: [] }), { fans: 1, viewers: null, heat: null, hints: [] });
    assert.deepEqual(mergeLiveScale(prev, null), { fans: 3000, viewers: 80, heat: null, hints: ['small'] });
    assert.deepEqual(mergeLiveScale(undefined, undefined), { fans: null, viewers: null, heat: null, hints: [] });
    assert.deepEqual(prev, { fans: 3000, viewers: 80, heat: null, hints: ['small'] });
});

test('gate: liveUserName 每种结构都能生成且长度 2-12', () => {
    const rng = seeded(91);
    for (const style of LIVE_NAME_STYLES) {
        const names = Array.from({ length: 200 }, () => liveUserName(rng, { style, host: '小夏', emoji: true }));
        assert.ok(new Set(names).size > 1 || style === 'fandom', style);
        for (const name of names) {
            const size = Array.from(name).length;
            assert.ok(size >= 2 && size <= 12, `${style} ${name}`);
        }
    }
    assert.ok(pools.LIVE_NAME_HEADS.length >= 60 && pools.LIVE_NAME_TAILS.length >= 60);
    const patterns = {
        nounNum: /\d/, defaultUser: /^(用户\d{8,10}|bili_\d{6,7}|手机用户\d{4})$/, english: /^[A-Za-z0-9_]+$/, fandom: /小夏/,
    };
    for (const [style, re] of Object.entries(patterns)) assert.ok(Array.from({ length: 50 }, () => liveUserName(rng, { style, host: '小夏' })).every((n) => re.test(n)), style);
    assert.ok(Array.from({ length: 50 }, () => liveUserName(rng, { style: 'fandom' })).every((n) => Array.from(n).length >= 2));
    assert.match(liveUserName(seeded(1), { style: 'emojiEnd', emoji: true }), EMOJI_RE);
    assert.doesNotMatch(liveUserName(seeded(1), { style: 'emojiEnd', emoji: false }), EMOJI_RE);
    assert.equal(typeof liveUserName(), 'string');
});

test('gate: liveUserName emoji 开关与整体结构分布', () => {
    const rng = seeded(92);
    const off = Array.from({ length: 3000 }, () => liveUserName(rng, { emoji: false, host: '小夏' }));
    assert.equal(off.filter((n) => EMOJI_RE.test(n)).length, 0);
    const on = Array.from({ length: 3000 }, () => liveUserName(rng, { emoji: true, host: '小夏' }));
    assert.ok(on.filter((n) => EMOJI_RE.test(n)).length > 100);
    const defaults = on.filter((n) => /^(用户\d{8,10}|bili_\d|手机用户\d)/.test(n)).length / on.length;
    assert.ok(defaults > 0.06 && defaults < 0.16, `default ${defaults}`);
    assert.ok(on.filter((n) => /小夏/.test(n)).length > 50);
    assert.ok(on.some((n) => /^[A-Za-z]/.test(n)) && on.some((n) => /^[·_〆丶「]/.test(n)));
    const share = (tier) => {
        const r = seeded(93);
        const list = Array.from({ length: 4000 }, () => liveUserName(r, { tier, emoji: false, host: '小夏' }));
        return {
            def: list.filter((n) => /^(用户\d{8,10}|bili_\d|手机用户\d)/.test(n)).length / list.length,
            long: list.filter((n) => Array.from(n).length >= 7).length / list.length,
            sym: list.filter((n) => /^[·_〆丶「ღ≈﹏]|[ぃゞ」·_≈]$/.test(n)).length / list.length,
        };
    };
    const tiny = share('tiny');
    const mid = share('mid');
    const big = share('big');
    assert.ok(tiny.def > mid.def * 1.8, `${tiny.def} ${mid.def}`);
    assert.ok(big.def < mid.def && big.sym > mid.sym * 1.4, JSON.stringify([big, mid]));
});

test('gate: liveUserName 世界观口吻', () => {
    const names = (tone) => {
        const rng = seeded(94);
        return Array.from({ length: 600 }, () => liveUserName(rng, { tone, emoji: false, host: '小夏' }));
    };
    for (const tone of ['ancient', 'fantasy', 'scifi']) for (const n of names(tone)) assert.ok(Array.from(n).length >= 2 && Array.from(n).length <= 12, n);
    const ancient = names('ancient');
    assert.ok(ancient.filter((n) => /青衫客|云中鹤|落花有意|无名剑修|道人$|散人$|居士$/.test(n)).length > 100);
    const fantasy = names('fantasy');
    assert.ok(fantasy.filter((n) => /法师$|魔导士|精灵|龙骑士/.test(n)).length > 80);
    const scifi = names('scifi');
    assert.ok(scifi.filter((n) => /^(XC|MK|RX|QZ|NX)-\d+$/.test(n)).length > 40);
    assert.ok(scifi.filter((n) => /^舰员\d+$|星港/.test(n)).length > 40);
    const modern = names('modern');
    assert.equal(modern.some((n) => /^(XC|MK|RX|QZ|NX)-\d+$/.test(n) || /道人$|散人$/.test(n)), false);
});

test('gate: 同场直播网名可重复约一成五，刷屏潮内互不相同', () => {
    const rng = seeded(95);
    let repeated = 0;
    let total = 0;
    for (let i = 0; i < 300; i += 1) {
        const rolls = [];
        const recent = [];
        for (let j = 0; j < 20; j += 1) {
            const name = liveUserName(rng, { recent });
            if (recent.includes(name)) repeated += 1;
            recent.push(name);
            rolls.push(name);
            total += 1;
        }
    }
    const rate = repeated / total;
    assert.ok(rate > 0.1 && rate < 0.2, `repeat ${rate}`);
    const plans = runMany({ pageInLive: 4, count: 0 }, 1500, 96);
    for (const plan of plans) {
        const wave = plan.filter((e) => /^wave:/.test(e.src));
        assert.equal(new Set(wave.map((e) => e.user)).size, wave.length);
    }
    const mainNames = flat(runMany({ pageInLive: 4, count: 16, emoji: false }, 100, 97).map((p) => [p.filter((e) => /^(scene|role|mood|meme|classic|ambient)/.test(e.src))])).map((list) => list.map((e) => e.user));
    assert.ok(mainNames.some((names) => new Set(names).size < names.length));
    for (const e of flat(runMany({ pageInLive: 4, count: 10, tone: 'ancient', emoji: false }, 50, 98)).filter((x) => x.type === 'text')) {
        assert.ok(Array.from(e.user).length >= 2 && Array.from(e.user).length <= 12 + 3, e.user);
    }
});

test('gate: keeper 池与刷屏潮后的维持秩序', () => {
    assert.ok(pools.LIVE_KEEPER_LINES.length >= 30);
    assert.ok(pools.LIVE_ADMIN_LINES.length >= 15 && pools.LIVE_ADMIN_LINES.some((l) => l.includes('{n}')));
    assert.equal(pools.LIVE_ROLE_LINES.keeper, pools.LIVE_KEEPER_LINES);
    const waved = runMany({ pageInLive: 4, count: 0, emoji: false }, 3000, 101)
        .filter((p) => p.some((e) => /^wave:(emoji|meme|bdxj)$/.test(e.src)));
    assert.ok(waved.length > 400);
    const keeperRate = waved.filter((p) => p.some((e) => e.src === 'keeper')).length / waved.length;
    assert.ok(keeperRate > 0.27 && keeperRate < 0.43, `keeper ${keeperRate}`);
    const keepers = flat(waved).filter((e) => e.src === 'keeper');
    assert.ok(keepers.every((e) => pools.LIVE_KEEPER_LINES.includes(e.text)));
    const withKeeper = waved.filter((p) => p.some((e) => e.src === 'keeper'));
    const rebut = withKeeper.filter((p) => p.some((e) => e.src === 'keeperRebut')).length / withKeeper.length;
    assert.ok(rebut > 0.1 && rebut < 0.32, `rebut ${rebut}`);
    assert.ok(flat(waved).filter((e) => e.src === 'keeperRebut').every((e) => pools.LIVE_KEEPER_REBUT_LINES.includes(e.text)));
    for (const plan of withKeeper) {
        const wave = plan.filter((e) => /^wave:/.test(e.src));
        const end = Math.max(...wave.map((e) => e.delay));
        const waveUsers = new Set(wave.map((e) => e.user));
        for (const k of plan.filter((e) => e.src === 'keeper')) {
            assert.ok(k.delay >= end);
            assert.equal(waveUsers.has(k.user), false);
        }
    }
});

test('gate: 房管消息、禁言点名与围观', () => {
    const waved = runMany({ pageInLive: 4, count: 0, emoji: false }, 4000, 111)
        .filter((p) => p.some((e) => /^wave:(emoji|meme|bdxj)$/.test(e.src)));
    const admins = waved.map((p) => p.find((e) => e.type === 'admin'));
    const adminRate = admins.filter(Boolean).length / waved.length;
    assert.ok(adminRate > 0.09 && adminRate < 0.22, `admin ${adminRate}`);
    let bans = 0;
    let reacts = 0;
    waved.forEach((plan, i) => {
        const admin = admins[i];
        if (!admin) return;
        assert.equal(admin.user, '房管');
        assert.equal(admin.src, 'admin');
        assert.ok(admin.text.length > 0 && !admin.text.includes('{n}'));
        if (!/^已(?:禁言|将)/.test(admin.text)) return;
        bans += 1;
        const waveUsers = plan.filter((e) => /^wave:/.test(e.src)).map((e) => e.user);
        const target = waveUsers.find((u) => admin.text.includes(u));
        assert.ok(target, `${admin.text} not naming a wave user`);
        const react = plan.filter((e) => e.src === 'banReact');
        if (react.length) {
            reacts += 1;
            assert.ok(react.length <= 2);
            assert.ok(react.every((e) => e.delay > admin.delay));
            assert.ok(react.every((e) => !e.text.includes('{n}')));
        }
    });
    assert.ok(bans > 30);
    assert.ok(reacts / bans > 0.3 && reacts / bans < 0.7, `react ${reacts / bans}`);
    assert.equal(flat(runMany({ pageInLive: 4, count: 10, emoji: true }, 100, 112)).filter((e) => e.type === 'admin').every((e) => !EMOJI_RE.test(e.text)), true);
    const reactTexts = flat(waved).filter((e) => e.src === 'banReact').map((e) => e.text);
    assert.ok(reactTexts.length > 0);
});

test('gate: hater 与 defender 吵起来后约四成有人劝架', () => {
    const plans = runMany({ pageInLive: 4, count: 14, emoji: false }, 1500, 121).filter((p) => p.some((e) => e.src === 'defend'));
    assert.ok(plans.length > 100);
    const peace = plans.filter((p) => p.some((e) => e.src === 'keeperPeace')).length / plans.length;
    assert.ok(peace > 0.3 && peace < 0.5, `peace ${peace}`);
    assert.ok(flat(plans).filter((e) => e.src === 'keeperPeace').every((e) => pools.LIVE_KEEPER_PEACE_LINES.includes(e.text)));
});

test('gate: 世界观口吻的 keeper 与房管变体', () => {
    for (const tone of ['fantasy', 'ancient', 'scifi']) {
        const set = pools.LIVE_TONE_ORDER[tone];
        for (const key of ['keeper', 'peace', 'rebut', 'admin', 'react']) assert.ok(set[key].length >= 5, `${tone}.${key}`);
        assert.ok(set.admin.some((l) => l.includes('{n}')));
        const entries = flat(runMany({ pageInLive: 4, count: 14, tone, emoji: false }, 1500, 131));
        const admins = entries.filter((e) => e.type === 'admin');
        assert.ok(admins.length > 5, tone);
        assert.ok(admins.every((e) => e.user === set.user), tone);
        assert.ok(admins.every((e) => set.admin.some((l) => new RegExp(`^${l.replace('{n}', '.+')}$`).test(e.text))), tone);
        assert.ok(entries.filter((e) => e.src === 'keeper').every((e) => set.keeper.includes(e.text)), tone);
    }
    assert.equal(pools.LIVE_TONE_ORDER.ancient.admin.includes('执事弟子：禁止喧哗'), true);
    assert.equal(pools.LIVE_TONE_ORDER.scifi.admin.includes('星网管理员：请保持频道整洁'), true);
});

test('gate: 剧情话题桶与台词摘词（本地、命中本页正文）', () => {
    const text = '常规操作谈能说那个下赌注的家伙确实是个混球。不过愿赌服输，被骗了只能怪你自己眼瞎心软。怎么，端盘子的，你今晚是特地来找小爷给你申冤的？';
    const topic = classifyLiveTopic(text);
    assert.ok(topic && ['scam', 'gamble', 'conflict', 'service'].includes(topic.name), String(topic && topic.name));
    assert.ok(topic.lines.length >= 15 && topic.lines.length <= 20);
    assert.equal(classifyLiveTopic('今天天气不错'), null);
    for (const [, , lines] of LIVE_TOPIC_BUCKETS) assert.ok(lines.length >= 15 && lines.length <= 20);
    const frags = liveQuoteFragments(text, ['端盘子的']);
    assert.ok(frags.length > 0 && frags.every((x) => Array.from(x).length >= 2 && Array.from(x).length <= 6));
    assert.ok(!frags.includes('端盘子的'));
    assert.ok(liveQuoteLine('愿赌服输', 'modern', () => 0.99).includes('愿赌服输'));
    const entries = flat(runMany({ text, pageInLive: 9, hour: 12, count: 10, emoji: false }, 200));
    const topicShare = entries.filter((e) => e.src.startsWith('topic:')).length / entries.filter((e) => BASE.test(e.src)).length;
    assert.ok(topicShare > 0.15 && topicShare < 0.45, 'topic ' + topicShare);
    assert.ok(entries.some((e) => e.src === 'quote'));
    // 话题句只用于现代口吻。
    assert.ok(!flat(runMany({ text, pageInLive: 9, tone: 'ancient', count: 10 }, 50)).some((e) => e.src.startsWith('topic:')));
});
