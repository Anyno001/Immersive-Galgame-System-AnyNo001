// 电脑对手的性格层：牌效和危险度照旧由电脑麻将引擎算，推还是退、鸣不鸣、立不立按打法、场况和情绪来定。
// 打法从角色卡世界书经副 API 配出来，读不到就按名字随机分一种；玩家可以在选人时改。
import Majiang from '@kobalab/majiang-core';
import AI from '@kobalab/majiang-ai';

// push 进攻欲（-1 怂到 1 莽），call 鸣牌欲，dama 默听倾向，speed 求快（正）还是做大（负），
// skill 牌技（越低越常打出次优牌、越不看别家副露），tilt 输了之后越打越冲（正）还是越打越怂（负），tempo 思考快慢。
export const MAHJONG_STYLES = Object.freeze({
    steady: { label: '稳健型', blurb: '照牌效打，有人立直就看危险度推退', push: 0, call: 0.5, dama: 0.15, speed: 0, skill: 1, tilt: 0, tempo: 0.5 },
    attack: { label: '强攻型', blurb: '有听就立，被立直也敢追', push: 0.6, call: 0.45, dama: 0.03, speed: 0.1, skill: 0.92, tilt: 0.6, tempo: 0.3 },
    cautious: { label: '谨慎型', blurb: '能默听就默听，有人立直早早弃和', push: -0.6, call: 0.3, dama: 0.55, speed: -0.1, skill: 0.95, tilt: -0.6, tempo: 0.75 },
    swift: { label: '速攻型', blurb: '能鸣就鸣，抢先和小牌', push: 0.2, call: 0.9, dama: 0.1, speed: 0.6, skill: 0.9, tilt: 0.3, tempo: 0.2 },
    gambler: { label: '赌徒型', blurb: '硬做大牌，很少弃和', push: 0.8, call: 0.25, dama: 0.2, speed: -0.6, skill: 0.8, tilt: 0.8, tempo: 0.4 },
    sly: { label: '心机型', blurb: '默听埋伏，看准了才出手', push: -0.1, call: 0.55, dama: 0.75, speed: 0.1, skill: 0.95, tilt: -0.2, tempo: 0.6 },
    airhead: { label: '天然型', blurb: '凭感觉打，常有失误', push: 0.3, call: 0.6, dama: 0.05, speed: 0.2, skill: 0.45, tilt: 0.1, tempo: 0.35 },
});
export const STYLE_IDS = Object.freeze(Object.keys(MAHJONG_STYLES));
const PARAM_RANGE = { push: [-1, 1], call: [0, 1], dama: [0, 1], speed: [-1, 1], skill: [0.3, 1], tilt: [-1, 1], tempo: [0, 1] };
const ADJUSTABLE = ['push', 'call', 'dama', 'speed', 'skill', 'tilt'];

export const LINE_EVENTS = Object.freeze({
    riichi: '自己立直', chase: '别人立直后她追立', push: '顶着别人的立直硬打危险牌', fold: '决定弃和',
    call: '吃碰杠', win: '和牌', dama: '默听和牌', dealIn: '放铳',
    tilt: '被打得上头、下一局开局', shrink: '被打怕了、下一局开局', lead: '后半场领先', behind: '后半场落后',
});

const GENERIC_LINES = {
    riichi: ['立直。', '这手就赌一把吧。', '准备好了哦，立直！'],
    chase: ['追立！谁怕谁。', '你立我也立。', '想吓退我？没门。'],
    push: ['这张……应该不会中吧。', '不退，就这张。', '硬着头皮也要打。'],
    fold: ['这把算了，我先躲一躲。', '太危险了，不陪你玩。', '先保命要紧。'],
    call: ['碰！', '这张我要了。', '吃一口～'],
    win: ['和了！', '承让承让。', '运气站在我这边呢。'],
    dama: ['没发现我早就听牌了吧？', '默听，嘿嘿。', '不声不响才最可怕哦。'],
    dealIn: ['呜……放铳了。', '怎么偏偏是这张！', '失算了……'],
    tilt: ['可恶，下一把一定讨回来！', '我生气了，接下来不手软。', '刚才那把不算！'],
    shrink: ['……这把稳一点打。', '有点怕了，先别冒险。', '冷静，冷静。'],
    lead: ['照这样保持下去就好。', '名次我收下了。', '别想追上来哦。'],
    behind: ['还没结束呢！', '最后几把得拼一拼了。', '等着看我翻盘。'],
};

const STYLE_LINES = {
    steady: { riichi: ['立直。'], win: ['和了，谢谢。'], dealIn: ['……失误了。'], fold: ['这把先退。'] },
    attack: { riichi: ['立直！正面来吧！', '不立直怎么赢？'], win: ['看吧，进攻才是王道！', '一口气拿下！'], dealIn: ['切，再来！', '这点分不算什么。'], fold: ['……这次先放你一马。'] },
    cautious: { riichi: ['……那就立直吧，应该安全。'], win: ['稳稳地和了。', '按计划进行。'], dealIn: ['明明那么小心了……'], fold: ['危险牌一张都不打。', '我选择安全第一。'] },
    swift: { riichi: ['快点结束吧，立直！'], call: ['碰碰碰！', '这张也要！', '先鸣再说～'], win: ['抢先一步！', '快就是正义！'], dealIn: ['哎呀，太急了。'], fold: ['算了算了，这把不抢了。'] },
    gambler: { riichi: ['全押！立直！', '要玩就玩大的。'], win: ['看到没，这才叫大牌！', '赌赢了！'], dealIn: ['哈，下一把翻倍赢回来。', '愿赌服输。'], fold: ['这把运气不在，先收手。'] },
    sly: { riichi: ['立直哦，猜猜我在等什么？'], dama: ['你以为我还没听牌吗？', '被我埋伏到了呢。'], win: ['一切都在计算之中。'], dealIn: ['……被看穿了吗。'], fold: ['这把不值得冒险。'] },
    airhead: { riichi: ['欸，可以立直了吗？那就立直！'], call: ['这个可以碰对吧？'], win: ['欸？和了？和了！'], dealIn: ['诶诶？这张不能打吗？'], fold: ['好像很危险的样子……'] },
};

function clamp(value, low, high) {
    const n = Number(value);
    if (!Number.isFinite(n)) return low;
    return Math.min(high, Math.max(low, n));
}

function hashOf(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h;
}

function presetParams(style) {
    const base = MAHJONG_STYLES[style] || MAHJONG_STYLES.steady;
    const out = {};
    for (const key of Object.keys(PARAM_RANGE)) out[key] = base[key];
    return out;
}

function cleanLines(raw) {
    const out = {};
    for (const event of Object.keys(LINE_EVENTS)) {
        const list = Array.isArray(raw && raw[event]) ? raw[event] : (typeof (raw && raw[event]) === 'string' ? [raw[event]] : []);
        const kept = list.map((line) => String(line || '').replace(/\s+/g, ' ').trim().slice(0, 30)).filter(Boolean).slice(0, 3);
        if (kept.length) out[event] = kept;
    }
    return out;
}

// 存档、副 API 回复、手选都走这里：打法不认识就当稳健型，参数夹在范围里，台词每类最多三句。
export function normalizePersona(raw, name = '', source = '') {
    const r = raw && typeof raw === 'object' ? raw : {};
    const style = MAHJONG_STYLES[r.style] ? r.style : 'steady';
    const params = presetParams(style);
    if (r.params && typeof r.params === 'object') {
        for (const key of Object.keys(PARAM_RANGE)) if (r.params[key] != null) params[key] = clamp(r.params[key], ...PARAM_RANGE[key]);
    } else if (r.adjust && typeof r.adjust === 'object') {
        for (const key of ADJUSTABLE) params[key] = clamp(params[key] + clamp(r.adjust[key] || 0, -0.3, 0.3), ...PARAM_RANGE[key]);
    }
    return {
        name: String(name || r.name || ''),
        style,
        params,
        lines: cleanLines(r.lines),
        summary: String(r.summary || '').trim().slice(0, 80),
        source: source || r.source || 'auto',
    };
}

// 读不到世界书时按名字固定分一种，同一个人每次都一样。
export function autoPersona(name) {
    const style = STYLE_IDS[hashOf(String(name || '')) % STYLE_IDS.length];
    return normalizePersona({ style }, name, 'auto');
}

export function withStyle(persona, style) {
    const base = persona || normalizePersona({}, '');
    if (!MAHJONG_STYLES[style]) return base;
    return { ...base, style, params: presetParams(style), source: 'user' };
}

export function pickLine(persona, event, random = Math.random, avoid = '') {
    const own = persona && persona.lines && persona.lines[event];
    const style = persona && STYLE_LINES[persona.style] && STYLE_LINES[persona.style][event];
    const pool = (own && own.length ? own : (style && style.length ? style : GENERIC_LINES[event])) || [];
    const fresh = pool.length > 1 ? pool.filter((line) => line !== avoid) : pool;
    return fresh.length ? fresh[Math.floor(random() * fresh.length) % fresh.length] : '';
}

export function loreKey(entries) {
    return hashOf((entries || []).map((entry) => `${entry.title}\n${entry.content}`).join('\n\n')).toString(36);
}

export function buildPersonaPrompt(people) {
    const styles = STYLE_IDS.map((id) => `- ${id} ${MAHJONG_STYLES[id].label}：${MAHJONG_STYLES[id].blurb}`).join('\n');
    const events = Object.entries(LINE_EVENTS).map(([id, text]) => `${id} ${text}`).join(' / ');
    const lore = people.map(({ name, entries }) => {
        const parts = entries.map((entry) => {
            const body = String(entry.content || '');
            return entry.title ? `${entry.title}：${body}` : body;
        });
        return `【${name}】\n${parts.join('\n')}`;
    }).join('\n\n');
    const example = { 角色名: { style: 'attack', adjust: { push: 0, call: 0, dama: 0, speed: 0, skill: 0, tilt: 0 }, summary: '一句话说明她为什么这样打', lines: { riichi: ['…'], win: ['…'] } } };
    return {
        system: '你在给立直麻将小游戏里的电脑对手定性格和打法。只根据给出的世界书资料判断每个角色坐上麻将桌会怎么打、会说什么，资料里没写的按她的性格合理推断。只输出一个 JSON 对象，不要任何解释，也不要代码块。',
        user: [
            `可选打法（style 只能填下面的英文 id）：\n${styles}`,
            '在打法之外可以微调（每项 -0.3 到 0.3，不调写 0）：push 进攻欲（正数更敢推、少弃和），call 鸣牌欲，dama 默听倾向，speed 求快还是做大（正数求快），skill 牌技（对麻将不熟就调低），tilt 输了之后的反应（正数越输越冲，负数越输越怂）。',
            `台词每类写 1 到 2 句，每句不超过 20 个字，用她自己的口吻、称呼和口癖，不写动作和括号。类别：${events}`,
            `输出格式（每个角色一项，键是角色名，lines 要写全部类别）：\n${JSON.stringify(example)}`,
            `角色资料：\n${lore}`,
        ].join('\n\n'),
    };
}

function readJson(text) {
    const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(raw); } catch (error) { /* 模型常在 JSON 前后加话 */ }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (error) { return null; }
}

export function parsePersonaReply(text, names) {
    const data = readJson(text);
    const out = {};
    if (!data || typeof data !== 'object') return out;
    const list = Array.isArray(data) ? data : (Array.isArray(data.characters) ? data.characters : null);
    for (const name of names) {
        const raw = list ? list.find((item) => item && item.name === name) : data[name];
        if (raw && typeof raw === 'object' && MAHJONG_STYLES[raw.style]) out[name] = normalizePersona(raw, name, 'ai');
    }
    return out;
}

const PERSONA_KEY = 'igs-wait-mahjong-persona-v1';
const PERSONA_LIMIT = 60;

// 打法表：副 API 配好的按世界书内容记一份，世界书改了再重配；手选的单独记，优先于副 API。
export function createPersonaStore({ storage = null, service = null } = {}) {
    let svc = service;
    const live = new Map();
    const listeners = new Set();
    let data = read();

    function read() {
        try {
            const parsed = storage && typeof storage.getItem === 'function' ? JSON.parse(storage.getItem(PERSONA_KEY) || 'null') : null;
            if (parsed && typeof parsed === 'object') return { ai: parsed.ai || {}, user: parsed.user || {} };
        } catch (error) { /* 坏数据当没有 */ }
        return { ai: {}, user: {} };
    }

    function write() {
        const names = Object.keys(data.ai).sort((a, b) => (data.ai[b].at || 0) - (data.ai[a].at || 0));
        for (const name of names.slice(PERSONA_LIMIT)) delete data.ai[name];
        try { if (storage && typeof storage.setItem === 'function') storage.setItem(PERSONA_KEY, JSON.stringify(data)); } catch (error) { /* 存满了就只留在这一页 */ }
    }

    function emit() {
        for (const listener of listeners) {
            try { listener(); } catch (error) { /* 单个订阅出错不影响别的 */ }
        }
    }

    function base(name) {
        const entry = live.get(name);
        if (entry && entry.state === 'auto') return null;
        if (entry && entry.persona) return entry.persona;
        const cached = data.ai[name];
        return cached && cached.persona ? normalizePersona(cached.persona, name, 'ai') : null;
    }

    function settle(name, state, persona, note = '', retry = false) {
        live.set(name, { state, persona, note, retry });
    }

    return {
        setService(next) { svc = next || null; },
        get(name) {
            const own = base(name);
            const user = data.user[name];
            if (user && MAHJONG_STYLES[user]) return withStyle(own || autoPersona(name), user);
            return own || autoPersona(name);
        },
        state(name) {
            if (data.user[name] && MAHJONG_STYLES[data.user[name]]) return 'user';
            const entry = live.get(name);
            if (entry) return entry.state;
            return data.ai[name] ? 'ai' : 'none';
        },
        note(name) {
            const entry = live.get(name);
            return entry ? entry.note : '';
        },
        hasAi(name) { return Boolean(base(name)); },
        baseStyle(name) { return (base(name) || autoPersona(name)).style; },
        userStyle(name) { return MAHJONG_STYLES[data.user[name]] ? data.user[name] : ''; },
        setStyle(name, style) {
            if (MAHJONG_STYLES[style]) data.user[name] = style;
            else delete data.user[name];
            write();
            emit();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async ensure(names) {
            const todo = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))]
                .filter((name) => !live.has(name) || live.get(name).retry);
            if (!todo.length) return;
            todo.forEach((name) => settle(name, 'pending', base(name)));
            emit();
            let lore = null;
            if (svc && typeof svc.lore === 'function') {
                const got = await Promise.resolve(svc.lore(todo)).catch(() => null);
                lore = got && got.ok && Array.isArray(got.list) ? got.list : null;
            }
            const ask = [];
            for (const name of todo) {
                if (!lore) {
                    settle(name, base(name) ? 'ai' : 'auto', base(name) || autoPersona(name), base(name) ? '读不到世界书，沿用上次配的打法' : '读不到世界书，先随机配一种', true);
                    continue;
                }
                const hit = lore.find((item) => item && item.name === name);
                const entries = hit && Array.isArray(hit.entries) ? hit.entries.filter((entry) => entry && entry.content) : [];
                if (!entries.length) {
                    settle(name, 'auto', autoPersona(name), '角色卡世界书里没有她的条目，先随机配一种');
                    continue;
                }
                const key = loreKey(entries);
                const cached = data.ai[name];
                if (cached && cached.key === key && cached.persona) {
                    settle(name, 'ai', normalizePersona(cached.persona, name, 'ai'));
                    continue;
                }
                ask.push({ name, entries, key });
            }
            emit();
            if (!ask.length) return;
            let status = { ok: false, reason: 'unavailable' };
            try { status = svc && typeof svc.status === 'function' ? (svc.status() || status) : status; } catch (error) { /* 当作不可用 */ }
            if (!status.ok || typeof svc.ask !== 'function') {
                const note = status.reason === 'busy' ? '正文还在写，先随机配一种，下次再读世界书' : '副 API 不可用，先随机配一种';
                ask.forEach(({ name }) => settle(name, base(name) ? 'ai' : 'auto', base(name) || autoPersona(name), note, true));
                emit();
                return;
            }
            const reply = await Promise.resolve(svc.ask(buildPersonaPrompt(ask))).catch(() => null);
            const parsed = reply && reply.ok ? parsePersonaReply(reply.text, ask.map((item) => item.name)) : {};
            for (const { name, key } of ask) {
                const persona = parsed[name];
                if (persona) {
                    data.ai[name] = { key, at: Date.now(), persona: { style: persona.style, params: persona.params, lines: persona.lines, summary: persona.summary } };
                    settle(name, 'ai', persona);
                } else {
                    settle(name, base(name) ? 'ai' : 'auto', base(name) || autoPersona(name),
                        reply && reply.ok ? '副 API 的回复没读懂，先随机配一种' : '副 API 请求失败，先随机配一种', true);
                }
            }
            write();
            emit();
        },
    };
}

// 场况：名次、和上下家的分差、这是第几局。东风战第四局起（含延长）算最后一局。
export function readSituation(model, seat) {
    const ids = (model && model.player_id) || [0, 1, 2, 3];
    const defen = (model && model.defen) || [];
    const scores = [0, 1, 2, 3].map((l) => Number(defen[ids[l]]) || 0);
    const mine = scores[seat];
    const higher = scores.filter((score, l) => l !== seat && score > mine);
    const lower = scores.filter((score, l) => l !== seat && score <= mine);
    const rank = 1 + higher.length;
    const gapUp = higher.length ? Math.min(...higher) - mine : 0;
    const gapDown = lower.length ? mine - Math.max(...lower) : 0;
    const hand = (Number(model && model.zhuangfeng) || 0) * 4 + (Number(model && model.jushu) || 0);
    const allLast = hand >= 3;
    const late = Math.min(1, hand / 3);
    const dealer = seat === 0;
    let push = 0;
    let speed = 0;
    let call = 0;
    let dama = 0;
    if (rank === 1) {
        push -= (0.2 + (gapDown >= 12000 ? 0.25 : 0)) * late + (allLast ? 0.35 : 0);
        if (allLast) { speed += 0.4; call += 0.25; dama += 0.3; }
    } else if (rank === 2) {
        if (allLast) push -= 0.1;
    } else if (rank === 3) {
        push += 0.15 * late + (allLast ? 0.2 : 0);
    } else {
        push += 0.3 * late + (allLast ? 0.45 : 0);
    }
    if (allLast && rank > 1) {
        if (gapUp > 8000) { speed -= 0.6; call -= 0.3; } else if (gapUp > 3900) speed -= 0.3;
        else if (gapUp <= 2000) { speed += 0.4; call += 0.15; }
    }
    if (dealer) push += 0.1;
    return { scores, rank, gapUp, gapDown, hand, allLast, late, dealer, push, speed, call, dama };
}

export function createMind() {
    return { heat: 0, conf: 0, streak: 0 };
}

// 新的一局情绪往回落一些。
export function calmMind(mind) {
    mind.heat *= 0.7;
    mind.conf *= 0.8;
}

// 一局的结果怎么影响她：tilt 为正越输越冲，为负越输越怂；赢了长信心。
export function feelResult(mind, params, outcome) {
    const tilt = Number(params && params.tilt) || 0;
    const points = Number(outcome && outcome.points) || 0;
    if (outcome.kind === 'win') {
        mind.conf += 0.3 + (points >= 8000 ? 0.2 : 0);
        mind.heat *= 0.5;
        mind.streak = Math.max(1, mind.streak + 1);
    } else if (outcome.kind === 'dealIn') {
        const hurt = 0.3 + Math.min(0.5, points / 16000);
        mind.heat += tilt * hurt * 1.2;
        mind.conf -= hurt * 0.8;
        mind.streak = Math.min(-1, mind.streak - 1);
    } else if (outcome.kind === 'tsumoed') {
        const hurt = 0.1 + Math.min(0.25, points / 24000);
        mind.heat += tilt * hurt;
        mind.conf -= hurt * 0.4;
    }
    mind.heat = clamp(mind.heat, -1, 1);
    mind.conf = clamp(mind.conf, -1, 1);
}

export function mindMood(mind) {
    if (!mind) return '';
    if (mind.heat > 0.4) return '愤怒';
    if (mind.heat < -0.4) return '紧张';
    if (mind.conf > 0.6) return '喜悦';
    return '';
}

export function decisionKnobs(params, situation, mind) {
    const p = params || presetParams('steady');
    const s = situation || { push: 0, speed: 0, call: 0, dama: 0 };
    const m = mind || createMind();
    return {
        push: clamp(p.push + s.push + m.heat * 0.6 + m.conf * 0.2, -1, 1),
        call: clamp(p.call + s.call + m.heat * 0.15, 0, 1),
        dama: clamp(p.dama + s.dama - m.heat * 0.2, 0, 1),
        speed: clamp(p.speed + s.speed, -1, 1),
        skill: clamp(p.skill - Math.abs(m.heat) * 0.15, 0.3, 1),
    };
}

const PLAIN_KNOBS = Object.freeze({ push: 0, call: 0.5, dama: 0, speed: 0, skill: 1 });

// options.plain：不看性格、场况和情绪，只防立直，出牌与原引擎一致（对照用）。
// options.think === false：不报思考时间（同步对局）。
export class MindfulAI extends AI {
    constructor(persona, options = {}) {
        super();
        this.persona = normalizePersona(persona || {}, persona && persona.name, persona && persona.source);
        this.random = typeof options.random === 'function' ? options.random : Math.random;
        this.plain = Boolean(options.plain);
        this.think = options.think !== false;
        this.mind = createMind();
        this.intent = '';
        this.damaHand = false;
        this.pendingThink = 0;
        this._damaMemo = new Map();
    }

    setPersona(persona) {
        if (persona) this.persona = normalizePersona(persona, persona.name, persona.source);
    }

    knobs() {
        if (this.plain) return PLAIN_KNOBS;
        return decisionKnobs(this.persona.params, readSituation(this._model, this._menfeng), this.mind);
    }

    takeIntent() {
        const intent = this.intent;
        this.intent = '';
        return intent;
    }

    // 回复要不要晚一点交：只有真的做了决定（打牌、鸣牌、和牌）才停顿。
    thinkDelay(reply) {
        const ms = this.pendingThink;
        this.pendingThink = 0;
        if (!this.think || !reply || !(reply.dapai || reply.fulou || reply.hule || reply.gang)) return 0;
        return Math.round(ms);
    }

    noteThink(extra) {
        if (!this.think) return;
        const tempo = this.persona.params.tempo;
        this.pendingThink = (180 + tempo * 620 + extra) * (0.75 + this.random() * 0.5);
    }

    qipai(qipai) {
        super.qipai(qipai);
        calmMind(this.mind);
        this._damaMemo = new Map();
        this.damaHand = false;
        this.intent = '';
    }

    hule(hule) {
        if (hule && Number.isInteger(this._menfeng)) {
            const me = this._menfeng;
            const kind = hule.l === me ? 'win' : (hule.baojia === me ? 'dealIn' : (hule.baojia == null ? 'tsumoed' : 'other'));
            const points = kind === 'tsumoed' ? (Number(hule.defen) || 0) / 3 : Number(hule.defen) || 0;
            feelResult(this.mind, this.persona.params, { kind, points });
        }
        super.hule(hule);
    }

    // 别家有多吓人：立直是 1；副露看几副露、巡目、宝牌和染手；门清到很晚才算一点点。
    threatOf(l) {
        const hand = this._model.shoupai[l];
        if (!hand) return 0;
        if (hand.lizhi) return 1;
        if (this.plain) return 0;
        const melds = hand._fulou || [];
        const he = this._model.he[l];
        const turns = (he && he._pai && he._pai.length) || 0;
        if (!melds.length) return turns >= 13 ? 0.15 : 0;
        let t = melds.length >= 3 ? 0.6 : (melds.length === 2 ? 0.38 : 0.12);
        t *= turns >= 10 ? 1.25 : (turns >= 6 ? 1 : 0.75);
        const dora = ((this.shan && this.shan.baopai) || []).map((p) => Majiang.Shan.zhenbaopai(p));
        let bonus = 0;
        for (const m of melds) {
            const s = m[0];
            for (const n of m.match(/\d/g) || []) {
                if (dora.includes(s + (n === '0' ? '5' : n))) bonus += 0.08;
                if (n === '0') bonus += 0.08;
            }
            if (/^z([567])\1\1/.test(m)) bonus += 0.06;
        }
        const suits = new Set(melds.map((m) => m[0]));
        if (melds.length >= 2 && suits.size === 1 && !suits.has('z')) bonus += 0.12;
        return Math.min(0.9, t + Math.min(0.3, bonus));
    }

    // 危险度和引擎同一把尺子：按每个有威胁的人各算一遍再按威胁加权取最大。立直的人和引擎完全一样。
    dangerOf(bingpai, skill) {
        const suanpai = this._suanpai;
        let fear = 0;
        let combined = null;
        for (let l = 0; l < 4; l += 1) {
            if (l === this._menfeng) continue;
            let t = this.threatOf(l);
            if (t < 1) t *= 0.4 + 0.6 * skill;
            if (t < 0.3) continue;
            const w = {};
            let sum = 0;
            for (const s of ['m', 'p', 's', 'z']) {
                for (let n = 1; n < suanpai._paishu[s].length; n += 1) {
                    w[s + n] = suanpai.suan_weixian(s + n, l, bingpai[s][n]);
                    sum += w[s + n];
                }
            }
            combined = combined || {};
            for (const p of Object.keys(w)) {
                const v = w[p] / (sum || 1) * 100 * (l === 0 ? 1.5 : 1) * t;
                combined[p] = Math.max(combined[p] || 0, v);
            }
            fear = Math.max(fear, t);
        }
        if (!combined) return { weixian: null, fear: 0 };
        return { weixian: (p) => combined[p[0] + (+p[1] || 5)], fear };
    }

    // 引擎的出牌流程，门槛按进攻欲缩放：push=0 时与引擎相同。
    select_dapai() {
        const k = this.knobs();
        const a = k.push;
        const hard = 13 * 2 ** (a * 0.8);
        const mid = 8 * 2 ** (a * 0.8);
        const safe = 3.2;
        const evScale = 2 ** (-a * 1.5);
        const { weixian, fear } = this.dangerOf(this.shoupai._bingpai, k.skill);
        // 手里有现物就弃和是引擎的习惯；敢打的人只看这张本身有多危险。
        const bail = fear >= 0.6 && a < 0.45;
        let anquan;
        let min = Infinity;
        if (weixian) {
            for (const p of this.get_dapai(this.shoupai)) {
                if (weixian(p) < min) {
                    min = weixian(p);
                    anquan = p;
                }
            }
        }
        let dapai = anquan;
        let max = -1;
        let minTingpai = 0;
        let bestFree = null;
        let bestFreeEv = -1;
        const backtrack = [];
        const pool = [];
        const nXiangting = Majiang.Util.xiangting(this.shoupai);
        const paishu = this._suanpai.get_paishu();
        const paijia = this._suanpai.make_paijia(this.shoupai);
        const count = (shoupai) => Majiang.Util.tingpai(shoupai).map((p) => this._suanpai._paishu[p[0]][p[1]]).reduce((x, y) => x + y, 0);
        for (const p of this.get_dapai(this.shoupai).reverse().sort((x, y) => paijia(x) - paijia(y))) {
            if (!dapai) dapai = p;
            const shoupai = this.shoupai.clone().dapai(p);
            if ((nXiangting > 2 && this.xiangting(shoupai) > nXiangting) || Majiang.Util.xiangting(shoupai) > nXiangting) {
                if (anquan) continue;
                if (nXiangting < 2) backtrack.push(p);
                continue;
            }
            const ev = this.eval_shoupai(shoupai, paishu);
            const nTingpai = count(shoupai);
            if (ev > bestFreeEv) {
                bestFreeEv = ev;
                bestFree = p;
            }
            if (weixian && weixian(p) > min) {
                const w = weixian(p);
                if (w >= hard) continue;
                if (nXiangting > 2 || (nXiangting > 0 && ev < 80 * evScale)) {
                    if (w >= mid) continue;
                    if (min < safe && bail) continue;
                } else if ((nXiangting > 0 && ev < 750 * evScale) || (nXiangting === 0 && ev < 50 * evScale)) {
                    if (w >= mid) continue;
                    if (min < safe && w >= safe && bail) continue;
                }
            }
            pool.push({ p, ev, n: nTingpai });
            if (ev - max > 0.0000001) {
                max = ev;
                dapai = p;
                minTingpai = nTingpai * 6;
            }
        }
        const firstMax = max;
        for (const p of backtrack) {
            const shoupai = this.shoupai.clone().dapai(p);
            const nTingpai = count(shoupai);
            if (nTingpai < minTingpai) continue;
            const ev = this.eval_backtrack(shoupai, paishu, p[0] + (+p[1] || 5), firstMax * 2);
            pool.push({ p, ev, n: nTingpai });
            if (ev - max > 0.0000001) {
                max = ev;
                dapai = p;
            }
        }
        const pick = this.restyle(pool, dapai, k);
        let out = pick.p;
        let intent = '';
        let extra = 0;
        if (weixian) extra += 350;
        if (pick.close) extra += 250;
        const threatened = weixian && fear >= 0.6;
        if (threatened && out === anquan && bestFree && bestFree !== anquan && nXiangting > 0) intent = 'fold';
        else if (threatened && weixian(out) >= mid * 0.9) intent = 'push';
        if (this.select_lizhi(out) && pick.ev >= 350 * 2 ** (-a)) {
            extra += 300;
            if (!this.plain && this.preferDama(out, k)) {
                this.damaHand = true;
                intent = intent || 'dama';
            } else {
                out += '*';
                intent = this._model.shoupai.some((hand, l) => l !== this._menfeng && hand && hand.lizhi) ? 'chase' : 'riichi';
            }
        }
        this.intent = intent;
        this.noteThink(extra);
        return out;
    }

    // speed>0 偏向进张多的，speed<0 偏向每张进张更值钱的；牌技不满时在差不多的几张里随手挑。
    restyle(pool, dapai, k) {
        const chosen = pool.find((item) => item.p === dapai);
        if (!chosen || pool.length < 2) return { p: dapai, ev: chosen ? chosen.ev : 0, close: false };
        const nMax = Math.max(...pool.map((item) => item.n));
        const vMax = Math.max(...pool.map((item) => item.ev / (item.n + 1)));
        const fast = Math.max(0, k.speed) * 0.8;
        const big = Math.max(0, -k.speed) * 0.9;
        const score = (item) => {
            let s = item.ev;
            if (fast) s *= ((item.n + 2) / (nMax + 2)) ** fast;
            if (big && vMax > 0) s *= ((item.ev / (item.n + 1)) / vMax) ** big;
            return s;
        };
        let best = chosen;
        let top = score(chosen);
        if (fast || big) {
            top = -Infinity;
            for (const item of pool) {
                const s = score(item);
                if (s - top > 0.0000001) {
                    top = s;
                    best = item;
                }
            }
        }
        const sloppy = 1 - k.skill;
        if (sloppy > 0.02 && this.random() < sloppy * 0.8) {
            const near = pool.filter((item) => score(item) >= top * (1 - sloppy * 0.45));
            if (near.length) best = near[Math.floor(this.random() * near.length) % near.length];
        }
        return { p: best.p, ev: best.ev, close: pool.filter((item) => score(item) >= top * 0.9).length > 1 };
    }

    // 门清听牌且不立直也有役：按默听倾向、手牌大小、别家是否立直决定这手默听；同一手只掷一次。
    preferDama(out, k) {
        const after = this.shoupai.clone().dapai(out);
        const key = after.toString();
        if (this._damaMemo.has(key)) return this._damaMemo.get(key);
        let low = Infinity;
        for (const p of Majiang.Util.tingpai(after)) {
            const hule = Majiang.Util.hule(after, `${p}=`, {
                rule: this._rule,
                zhuangfeng: this._model.zhuangfeng,
                menfeng: this._menfeng,
                hupai: { lizhi: 0 },
                baopai: this.shan.baopai,
                jicun: { changbang: 0, lizhibang: 0 },
            });
            if (!hule || !hule.defen) {
                low = 0;
                break;
            }
            low = Math.min(low, hule.defen);
        }
        let chance = 0;
        if (low > 0 && low < Infinity) {
            const others = this._model.shoupai.some((hand, l) => l !== this._menfeng && hand && hand.lizhi);
            chance = k.dama + (low >= 7700 ? 0.35 : (low >= 5200 ? 0.15 : 0)) + (others ? 0.1 : 0);
        }
        const dama = this.random() < Math.min(0.95, chance);
        this._damaMemo.set(key, dama);
        return dama;
    }

    // 引擎的鸣牌流程：call=0.5 时与引擎相同，越高越肯为了速度少一点期望值去鸣。
    select_fulou(dapai) {
        const k = this.knobs();
        const evScale = 2 ** (-k.push * 1.5);
        let nXiangting = Majiang.Util.xiangting(this.shoupai);
        const riichi = this._model.shoupai.find((s) => s && s.lizhi);
        if (riichi && nXiangting >= 3) return undefined;
        const d = ['', '+', '=', '-'][(4 + this._model.lunban - this._menfeng) % 4];
        const p = dapai.p.slice(0, 2) + d;
        if (nXiangting < 3) {
            const mianzi = this.get_gang_mianzi(this.shoupai, p)
                .concat(this.get_peng_mianzi(this.shoupai, p))
                .concat(this.get_chi_mianzi(this.shoupai, p));
            if (!mianzi.length) return undefined;
            const paishu = this._suanpai.get_paishu();
            let best = this.eval_shoupai(this.shoupai, paishu, '') * 2 ** ((0.5 - k.call) * 1.8);
            let fulou;
            for (const m of mianzi) {
                const shoupai = this.shoupai.clone().fulou(m);
                const x = Majiang.Util.xiangting(shoupai);
                if (x >= 3) continue;
                const ev = this.eval_shoupai(shoupai, paishu);
                if (riichi) {
                    if (x > 0 && ev < 750 * evScale) continue;
                    if (x === 0 && ev < 250 * evScale) continue;
                }
                if (ev - best > 0.0000001) {
                    best = ev;
                    fulou = m;
                }
            }
            if (fulou) this.noteThink(200);
            return fulou;
        }
        const mianzi = this.get_peng_mianzi(this.shoupai, p).concat(this.get_chi_mianzi(this.shoupai, p));
        if (!mianzi.length) return undefined;
        nXiangting = this.xiangting(this.shoupai);
        for (const m of mianzi) {
            const shoupai = this.shoupai.clone().fulou(m);
            if (this.xiangting(shoupai) >= nXiangting) continue;
            if (k.call < 0.5 && this.random() < (0.5 - k.call) * 1.6) return undefined;
            this.noteThink(200);
            return m;
        }
        return undefined;
    }
}
