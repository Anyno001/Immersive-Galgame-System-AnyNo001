// 电脑对手的性格层：牌效和危险度照旧由电脑麻将引擎算，推还是退、鸣不鸣、立不立按打法、场况和情绪来定。
// 打法和台词从角色卡世界书经副 API 配出来，读不到就按名字随机分一种打法、说打法自带的话；玩家可以在选人时改打法。
import Majiang from '@kobalab/majiang-core';
import AI from '@kobalab/majiang-ai';
import { riichiRules, riichiTingpai, riichiYakuXiangting } from './scmj/rules.js';
import { VOICE_MOODS, cleanAddress, cleanVoice, voiceKeys } from './wait-stage-mahjong-voice.js';

const EVAL_WIDTH = [8, 8 * 4, 8 * 4 * 2];

// push 进攻欲（-1 怂到 1 莽），call 鸣牌欲，dama 默听倾向，speed 求快（正）还是做大（负），
// skill 牌技（越低越常打出次优牌、越不看别家副露），tilt 输了之后越打越冲（正）还是越打越怂（负），tempo 思考快慢，
// talk 话多话少（只管碰杠、看热闹这类闲话，和牌放铳总会开口）。
export const MAHJONG_STYLES = Object.freeze({
    steady: { label: '稳健型', blurb: '照牌效打，有人立直就看危险度推退', push: 0, call: 0.5, dama: 0.15, speed: 0, skill: 1, tilt: 0, tempo: 0.5, talk: 0.45 },
    attack: { label: '强攻型', blurb: '有听就立，被立直也敢追', push: 0.6, call: 0.45, dama: 0.03, speed: 0.1, skill: 0.92, tilt: 0.6, tempo: 0.3, talk: 0.75 },
    cautious: { label: '谨慎型', blurb: '能默听就默听，有人立直早早弃和', push: -0.6, call: 0.3, dama: 0.55, speed: -0.1, skill: 0.95, tilt: -0.6, tempo: 0.75, talk: 0.4 },
    swift: { label: '速攻型', blurb: '能鸣就鸣，抢先和小牌', push: 0.2, call: 0.9, dama: 0.1, speed: 0.6, skill: 0.9, tilt: 0.3, tempo: 0.2, talk: 0.7 },
    gambler: { label: '赌徒型', blurb: '硬做大牌，很少弃和', push: 0.8, call: 0.25, dama: 0.2, speed: -0.6, skill: 0.8, tilt: 0.8, tempo: 0.4, talk: 0.7 },
    sly: { label: '心机型', blurb: '默听埋伏，看准了才出手', push: -0.1, call: 0.55, dama: 0.75, speed: 0.1, skill: 0.95, tilt: -0.2, tempo: 0.6, talk: 0.5 },
    airhead: { label: '天然型', blurb: '凭感觉打，常有失误', push: 0.3, call: 0.6, dama: 0.05, speed: 0.2, skill: 0.45, tilt: 0.1, tempo: 0.35, talk: 0.85 },
});
export const STYLE_IDS = Object.freeze(Object.keys(MAHJONG_STYLES));
const PARAM_RANGE = { push: [-1, 1], call: [0, 1], dama: [0, 1], speed: [-1, 1], skill: [0.3, 1], tilt: [-1, 1], tempo: [0, 1], talk: [0.1, 1] };
const ADJUSTABLE = ['push', 'call', 'dama', 'speed', 'skill', 'tilt', 'talk'];
const RULE_IDS = ['riichi', 'chengdu'];
// 一套台词至少写回这么多个键才算写好，少了下次再问。
const VOICE_ENOUGH = 12;

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

// 成都那套不许照抄立直那套的句子。
function cleanVoices(raw) {
    const riichi = cleanVoice(raw && raw.riichi, 'riichi');
    const taken = new Set(Object.values(riichi).flat());
    const chengdu = cleanVoice(raw && raw.chengdu, 'chengdu');
    for (const key of Object.keys(chengdu)) {
        const kept = chengdu[key].filter((line) => !taken.has(line));
        if (kept.length) chengdu[key] = kept;
        else delete chengdu[key];
    }
    return { riichi, chengdu };
}

// 存档、副 API 回复、手选都走这里：打法不认识就当稳健型，参数夹在范围里，台词只留认识的键。
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
        voice: cleanVoices(r.voice),
        address: cleanAddress(r.address),
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

export function voiceCount(persona, rules) {
    const voice = persona && persona.voice && persona.voice[rules === 'chengdu' ? 'chengdu' : 'riichi'];
    return voice ? Object.keys(voice).length : 0;
}

export function loreKey(entries) {
    return hashOf((entries || []).map((entry) => `${entry.title}\n${entry.content}`).join('\n\n')).toString(36);
}

const TABLE_BRIEF = {
    riichi: '这一套坐日式立直麻将：有吃碰杠、立直、默听、宝牌、役和役满，点数按符番算，东风战四局，有人被打到负分就结束。',
    chengdu: '这一套坐成都麻将血战到底：没有吃，只有碰和杠；开局每人换三张、再定缺一门，缺门打完才能胡；一家胡了其余人接着打，直到只剩一家或牌摸完；流局时没听牌的要被查叫赔钱；封顶 4 番，共打四局。只用碰、杠、暗杠、点杠、弯杠、胡、自摸、点炮、查叫、血战、缺门这些说法，不许出现立直、追立、默听、宝牌、役满、荣和、放铳。',
};

const EXAMPLE_LINES = {
    riichi: { 'win.ron': ['…', '…'], dealIn: ['…', '…'], 'yaku.国士无双': ['…'] },
    chengdu: { 'win.ron': ['…', '…'], dealIn: ['…', '…'], 'pattern.清一色': ['…'] },
};

// 一次只问一个人、一套牌桌：句子少了模型才肯为每一句想她会怎么说。
export function buildPersonaPrompt({ name, entries }, { rules = 'riichi', keep = null, cast = [] } = {}) {
    const r = rules === 'chengdu' ? 'chengdu' : 'riichi';
    const lore = (entries || []).map((entry) => {
        const body = String(entry.content || '');
        return entry.title ? `${entry.title}：${body}` : body;
    }).join('\n');
    const keys = Object.entries(voiceKeys(r)).map(([key, meta]) => {
        const slots = meta.slots.length ? `（可用 ${meta.slots.map((slot) => `{${slot}}`).join(' ')}）` : '';
        return `- ${key}：${meta.label}${slots}`;
    }).join('\n');
    const others = [...new Set((cast || []).map((one) => String(one || '').trim()).filter((one) => one && one !== name && one !== '你'))];
    const styles = STYLE_IDS.map((id) => `- ${id} ${MAHJONG_STYLES[id].label}：${MAHJONG_STYLES[id].blurb}`).join('\n');
    const example = keep
        ? { address: { 你: '她对玩家的称呼' }, lines: EXAMPLE_LINES[r] }
        : { style: 'attack', adjust: { push: 0, call: 0, dama: 0, speed: 0, skill: 0, tilt: 0, talk: 0 }, summary: '一句话说明她为什么这样打', address: { 你: '她对玩家的称呼' }, lines: EXAMPLE_LINES[r] };
    const styleBlock = keep
        ? `她的打法已经定了：${(MAHJONG_STYLES[keep.style] || MAHJONG_STYLES.steady).label}（${keep.summary || (MAHJONG_STYLES[keep.style] || MAHJONG_STYLES.steady).blurb}）。这次只写台词，不要改打法。`
        : [
            `先给她定打法（style 只能填下面的英文 id）：\n${styles}`,
            '打法之外可以微调（每项 -0.3 到 0.3，不调写 0）：push 进攻欲（正数更敢推、少弃和），call 鸣牌欲，dama 默听倾向（只在立直麻将里生效），speed 求快还是做大（正数求快），skill 牌技（对麻将不熟就调低），tilt 输了之后的反应（正数越输越冲，负数越输越怂），talk 话多话少（正数在碰杠、看别人和牌时更爱插嘴）。',
        ].join('\n');
    return {
        system: [
            '你是 galgame 编剧，在给游戏里的麻将小游戏写对手的台词。对手是这张角色卡里的人物，玩家（{{user}}）也坐在桌上。',
            '你的任务是让她在牌桌上像她本人一样开口：自称、口癖、语气、对玩家和其他人的态度、她在意什么、她怕什么，都要从世界书资料里来；资料没写的按她的性格合理推断。',
            '只输出一个 JSON 对象，不要解释，不要代码块。',
        ].join('\n'),
        user: [
            `角色：${name}`,
            TABLE_BRIEF[r],
            styleBlock,
            [
                '台词要求：',
                '1. 每个键写 2 句，标 ★ 的特殊牌型写 1 到 2 句。每句不超过 22 个字，只写她说出口的话，不写动作、旁白、括号和表情符号。',
                '2. 两句换个角度：一句冲着人说（挑衅、撒娇、安慰、抱怨、调情都行），一句是自言自语或漏出来的真心话。',
                '3. 必须是只有她才会这么说的话。换个角色说也成立的句子不要写，比如「我胡了」「放铳了」「运气真好」。也不要每句都报牌名、念规则。',
                '4. 局势要从话里听得出来，而且按她的性格反应：领先时是从容、得意还是不安，落后时是不甘、硬撑还是想哭；同样是放铳，好强的人嘴硬，胆小的人慌，傲娇找借口，腹黑记仇。',
                '5. 和玩家的关系要体现出来：被玩家点炮、胡了玩家的牌、输给玩家时，话要带着她和玩家之间的感情和称呼。',
                '6. 占位符会在说话时换成实际内容：{对方} 是这件事里的另一方（是玩家时换成她对玩家的称呼），{牌} 是相关的那张牌，{番} 是番数，{点} 是点数。每个键后面写了能用哪些，没写的不要用。叫对方一律写 {对方}，不要写死名字。',
                `7. 可以在句首加一个表情标签，只能从 ${VOICE_MOODS.join(' ')} 里选，例如「[害羞]才、才不是运气好呢」。不加就用默认表情。`,
                `8. address 写她怎么称呼玩家（键写「你」）${others.length ? `，以及资料里和她有关系的这些人：${others.join('、')}` : ''}。资料没写就按关系推断，完全不认识的不写。`,
            ].join('\n'),
            [
                '示例（虚构的傲娇大小姐，只看写法，不要照抄）：',
                '差：「我胡了。」「放铳了，可惜。」——谁都能说。',
                '好：win.ron「[喜悦]哼，{对方}的牌本小姐收下了」「早说过你赢不了我的」；dealIn「这、这种程度才不痛呢！」「[愤怒]{对方}给我记住！」',
            ].join('\n'),
            `键（lines 里每个都要写）：\n${keys}`,
            `输出格式：\n${JSON.stringify(example)}`,
            `${name}的世界书资料：\n${lore}`,
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

// 回复可能是 { style, lines }，也可能包了一层 { 名字: {...} } 或 { characters: [...] }。
export function parsePersonaReply(text, name, { rules = 'riichi', keep = null } = {}) {
    const r = rules === 'chengdu' ? 'chengdu' : 'riichi';
    const data = readJson(text);
    if (!data || typeof data !== 'object') return null;
    let raw = data;
    if (Array.isArray(data)) raw = data.find((item) => item && item.name === name) || data[0];
    else if (Array.isArray(data.characters)) raw = data.characters.find((item) => item && item.name === name) || data.characters[0];
    else if (data[name] && typeof data[name] === 'object') raw = data[name];
    if (!raw || typeof raw !== 'object') return null;
    const lines = raw.lines || raw[r] || raw.voice || null;
    const base = keep || (MAHJONG_STYLES[raw.style] ? raw : null);
    if (!base && !lines) return null;
    const persona = normalizePersona({
        style: base ? base.style : autoPersona(name).style,
        params: keep ? keep.params : undefined,
        adjust: keep ? undefined : raw.adjust,
        summary: keep ? keep.summary : raw.summary,
        address: { ...((keep && keep.address) || {}), ...cleanAddress(raw.address) },
        voice: { [r]: lines },
    }, name, 'ai');
    return persona;
}

const PERSONA_KEY = 'igs-wait-mahjong-persona-v1';
const PERSONA_LIMIT = 60;

// 打法和台词表：副 API 配好的按世界书内容记一份，世界书改了再重配；两套牌桌的台词分开问、分开记。
// 手选的打法单独记，优先于副 API，但台词照用副 API 写的。重写丢掉手选，连打法带当前这套台词再问一次。
export function createPersonaStore({ storage = null, service = null } = {}) {
    let svc = service;
    const live = new Map();
    const flight = new Set();
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

    function cachedPersona(name) {
        const cached = data.ai[name];
        return cached && cached.persona && MAHJONG_STYLES[cached.persona.style] ? normalizePersona(cached.persona, name, 'ai') : null;
    }

    function base(name) {
        const entry = live.get(name);
        if (entry && entry.state === 'auto') return null;
        if (entry && entry.persona) return entry.persona;
        return cachedPersona(name);
    }

    function settle(name, rules, state, persona, note = '', retry = false) {
        const entry = live.get(name) || { done: new Set() };
        if (retry) entry.done.delete(rules);
        else entry.done.add(rules);
        const rewriting = Boolean(entry.rewriting) && RULE_IDS.some((id) => id !== rules && flight.has(`${name}\n${id}`));
        Object.assign(entry, { state, persona, note: rewriting ? entry.note : note, retry, rewriting });
        live.set(name, entry);
    }

    function fallback(name, rules, note) {
        const own = base(name);
        settle(name, rules, own ? 'ai' : 'auto', own || autoPersona(name), note, true);
    }

    function keep(name, persona, key) {
        const cached = data.ai[name];
        const prev = cached && cached.key === key && cached.persona ? normalizePersona(cached.persona, name, 'ai') : null;
        const voice = { ...(prev ? prev.voice : {}) };
        for (const id of RULE_IDS) if (Object.keys(persona.voice[id] || {}).length) voice[id] = persona.voice[id];
        const merged = { ...persona, voice, address: { ...(prev ? prev.address : {}), ...persona.address } };
        data.ai[name] = { key, at: Date.now(), persona: { v: 2, style: merged.style, params: merged.params, summary: merged.summary, address: merged.address, voice } };
        return normalizePersona(data.ai[name].persona, name, 'ai');
    }

    async function askOne(item, rules, cast) {
        const reply = await Promise.resolve(svc.ask(buildPersonaPrompt(item, { rules, keep: item.keep, cast }))).catch(() => null);
        const parsed = reply && reply.ok ? parsePersonaReply(reply.text, item.name, { rules, keep: item.keep }) : null;
        if (!parsed) {
            fallback(item.name, rules, reply && reply.ok ? '副 API 的回复没读懂，先用打法自带的台词' : '副 API 请求失败，先用打法自带的台词');
        } else {
            const persona = keep(item.name, parsed, item.key);
            if (item.force) delete data.user[item.name];
            const enough = voiceCount(persona, rules) >= VOICE_ENOUGH;
            settle(item.name, rules, 'ai', persona, enough ? '' : '副 API 写回的台词太少，缺的先用打法自带的', !enough);
            write();
        }
        flight.delete(`${item.name}\n${rules}`);
        emit();
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
            const entry = live.get(name);
            if (entry && entry.rewriting) return 'rewrite';
            if (data.user[name] && MAHJONG_STYLES[data.user[name]]) return 'user';
            if (entry) return entry.state;
            return cachedPersona(name) ? 'ai' : 'none';
        },
        busy(name) {
            return RULE_IDS.some((id) => flight.has(`${name}\n${id}`));
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
        // cast：同桌的人，副 API 顺便写她怎么称呼这些人。force：不看缓存，打法和当前这套台词都重问。
        async ensure(names, { rules = 'riichi', cast = [], force = false } = {}) {
            const r = rules === 'chengdu' ? 'chengdu' : 'riichi';
            const todo = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))].filter((name) => {
                if (flight.has(`${name}\n${r}`)) return false;
                if (force) return true;
                const entry = live.get(name);
                return !entry || entry.retry || !entry.done.has(r);
            });
            if (!todo.length) return;
            for (const name of todo) {
                flight.add(`${name}\n${r}`);
                const own = base(name);
                const entry = live.get(name) || { done: new Set() };
                const rewriting = force || Boolean(entry.rewriting && RULE_IDS.some((id) => id !== r && flight.has(`${name}\n${id}`)));
                Object.assign(entry, {
                    state: own && !force ? 'ai' : 'pending',
                    persona: own,
                    note: force ? '正在重新生成打法和台词…' : (entry.rewriting ? entry.note : '正在读世界书…'),
                    rewriting,
                });
                live.set(name, entry);
            }
            emit();
            let lore = null;
            if (svc && typeof svc.lore === 'function') {
                const got = await Promise.resolve(svc.lore(todo)).catch(() => null);
                lore = got && got.ok && Array.isArray(got.list) ? got.list : null;
            }
            const ask = [];
            for (const name of todo) {
                if (!lore) {
                    fallback(name, r, base(name) ? '读不到世界书，沿用上次配的' : '读不到世界书，先随机配一种打法');
                    flight.delete(`${name}\n${r}`);
                    continue;
                }
                const hit = lore.find((item) => item && item.name === name);
                const entries = hit && Array.isArray(hit.entries) ? hit.entries.filter((entry) => entry && entry.content) : [];
                if (!entries.length) {
                    settle(name, r, 'auto', autoPersona(name), '角色卡世界书里没有她的条目，先随机配一种打法');
                    flight.delete(`${name}\n${r}`);
                    continue;
                }
                const key = loreKey(entries);
                const cached = data.ai[name];
                const same = cached && cached.key === key && cached.persona && MAHJONG_STYLES[cached.persona.style];
                const stored = same ? normalizePersona(cached.persona, name, 'ai') : null;
                if (!force && stored && cached.persona.v === 2 && voiceCount(stored, r) >= VOICE_ENOUGH) {
                    settle(name, r, 'ai', stored);
                    flight.delete(`${name}\n${r}`);
                    continue;
                }
                ask.push({ name, entries, key, keep: force ? null : stored, force });
            }
            emit();
            if (!ask.length) return;
            let status = { ok: false, reason: 'unavailable' };
            try { status = svc && typeof svc.status === 'function' ? (svc.status() || status) : status; } catch (error) { /* 当作不可用 */ }
            if (!status.ok || typeof svc.ask !== 'function') {
                const note = status.reason === 'busy' ? '正文还在写，先用打法自带的台词，下次再读世界书' : '副 API 不可用，先用打法自带的台词';
                for (const { name } of ask) {
                    fallback(name, r, note);
                    flight.delete(`${name}\n${r}`);
                }
                emit();
                return;
            }
            for (const item of ask) {
                const entry = live.get(item.name);
                if (entry) entry.note = item.force ? '正在重新生成打法和台词…' : '正在按世界书写台词…';
            }
            emit();
            // 单独配的副 API 一起问；走酒馆主连接时一个一个来，别和正文抢。
            if (status.via === 'secondary') await Promise.all(ask.map((item) => askOne(item, r, cast)));
            else for (const item of ask) await askOne(item, r, cast);
        },
        refresh(name, options = {}) {
            const who = String(name || '').trim();
            if (!who) return Promise.resolve();
            return this.ensure([who], { ...options, force: true });
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
        this.rules = options.rules || riichiRules();
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
        if (this.rules.installSuanpai) this.rules.installSuanpai(this, qipai);
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
        if (this.rules.threatOf) return this.rules.threatOf(this, l);
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
            if (this.rules.ignoreSeat && this.rules.ignoreSeat(this, l)) continue;
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
                const dealer = this.rules.dealerWeight ? this.rules.dealerWeight(l) : (l === 0 ? 1.5 : 1);
            const v = w[p] / (sum || 1) * 100 * dealer * t;
                combined[p] = Math.max(combined[p] || 0, v);
            }
            fear = Math.max(fear, t);
        }
        if (!combined) return { weixian: null, fear: 0 };
        return { weixian: (p) => combined[p[0] + (+p[1] || 5)], fear };
    }

    xiangting(shoupai) {
        if (this.rules.yaku) return riichiYakuXiangting(this, shoupai);
        return this.rules.xiangting(shoupai);
    }

    tingpai(shoupai) {
        if (this.rules.yaku) return riichiTingpai(this, shoupai);
        return this.rules.listWaits(this, shoupai);
    }

    get_dapai(shoupai) {
        const list = super.get_dapai(shoupai);
        return this.rules.filterDapai ? this.rules.filterDapai(this, list, shoupai) : list;
    }

    get_chi_mianzi(shoupai, p) {
        if (this.rules.allowChi === false) return [];
        return super.get_chi_mianzi(shoupai, p);
    }

    allow_hule(shoupai, p, hupai) {
        if (this.rules.allowHule === false) return false;
        return super.allow_hule(shoupai, p, hupai);
    }

    allow_lizhi(shoupai, p) {
        if (this.rules.allowLizhi === false) return false;
        return super.allow_lizhi(shoupai, p);
    }

    allow_pingju(shoupai) {
        if (this.rules.allowPingju === false) return false;
        return super.allow_pingju(shoupai);
    }

    allow_no_daopai(shoupai) {
        if (this.rules.allowNoDaopai === false) return false;
        return super.allow_no_daopai(shoupai);
    }

    get_defen(shoupai, rongpai) {
        let paistr = shoupai.toString();
        if (rongpai) paistr = paistr.replace(/^([^\*,]*)(.*)$/, `$1${rongpai}$2`);
        if (this.rules.cacheExtra) paistr += this.rules.cacheExtra(this);
        if (this._defen_cache[paistr] != null) return this._defen_cache[paistr];
        const defen = this.rules.defen(this, shoupai, rongpai);
        this._defen_cache[paistr] = defen;
        return defen;
    }

    eval_shoupai(shoupai, paishu, back) {
        const paistr = shoupai.toString() + (back != null ? `:${back}` : '');
        if (this._eval_cache[paistr] != null) return this._eval_cache[paistr];
        let rv = 0;
        const nXiangting = this.rules.xiangting(shoupai);
        if (nXiangting === -1) {
            rv = this.get_defen(shoupai);
        } else if (shoupai._zimo) {
            for (const p of this.get_dapai(shoupai)) {
                const next = shoupai.clone().dapai(p);
                if (this.rules.xiangting(next) > nXiangting) continue;
                const ev = this.eval_shoupai(next, paishu, back);
                if (ev > rv) rv = ev;
            }
        } else if (nXiangting < 3) {
            for (const p of this.rules.expand(this.rules.tingpai(shoupai))) {
                if (p === back) { rv = 0; break; }
                if (paishu.val(p) === 0) continue;
                const next = shoupai.clone().zimo(p);
                paishu.pop(p);
                let ev = this.eval_shoupai(next, paishu, back);
                if (!back) {
                    if (nXiangting > 0) ev += this.eval_fulou(shoupai, p, paishu, back);
                }
                paishu.push(p);
                rv += ev * paishu.val(p);
            }
            rv /= EVAL_WIDTH[nXiangting];
        } else {
            for (const p of this.rules.expand(this.tingpai(shoupai))) {
                if (paishu.val(p, 1) === 0) continue;
                rv += paishu.val(p, 1) * this.rules.waitWeight(p);
            }
        }
        this._eval_cache[paistr] = rv;
        return rv;
    }

    eval_backtrack(shoupai, paishu, back, min) {
        const nXiangting = this.rules.xiangting(shoupai);
        let rv = 0;
        for (const p of this.rules.expand(this.rules.tingpai(shoupai))) {
            if (p.replace(/0/, '5') === back) continue;
            if (paishu.val(p) === 0) continue;
            const next = shoupai.clone().zimo(p);
            paishu.pop(p);
            const ev = this.eval_shoupai(next, paishu, back);
            paishu.push(p);
            if (ev - min > 0.0000001) rv += ev * paishu.val(p);
        }
        return rv / EVAL_WIDTH[nXiangting];
    }

    eval_fulou(shoupai, p, paishu, back) {
        const nXiangting = this.rules.xiangting(shoupai);
        let pengMax = 0;
        for (const m of this.get_peng_mianzi(shoupai, `${p}+`)) {
            const next = shoupai.clone().fulou(m);
            if (this.rules.xiangting(next) >= nXiangting) continue;
            pengMax = Math.max(this.eval_shoupai(next, paishu, back), pengMax);
        }
        let chiMax = 0;
        for (const m of this.get_chi_mianzi(shoupai, `${p}-`)) {
            const next = shoupai.clone().fulou(m);
            if (this.rules.xiangting(next) >= nXiangting) continue;
            chiMax = Math.max(this.eval_shoupai(next, paishu, back), chiMax);
        }
        return this.rules.mixFulou(pengMax, chiMax);
    }

    select_gang(info) {
        let nXiangting = this.rules.xiangting(this.shoupai);
        if (this._model.shoupai.find((s) => s.lizhi) && nXiangting > 0) return undefined;
        const paishu = this._suanpai.get_paishu();
        if (nXiangting < 3) {
            let gang;
            let max = this.eval_shoupai(this.shoupai, paishu);
            for (const m of this.get_gang_mianzi(this.shoupai) || []) {
                const shoupai = this.shoupai.clone().gang(m);
                if (this.rules.xiangting(shoupai) >= 3) continue;
                let ev = this.eval_shoupai(shoupai, paishu);
                if (this.rules.gangFee) ev += this.rules.gangFee(this, m);
                if (info) {
                    const p = m.match(/\d{4}$/) ? m.slice(0, 2) : m[0] + m.slice(-1);
                    const tingpai = this.rules.tingpai(shoupai);
                    const nTingpai = tingpai.map((tile) => this._suanpai._paishu[tile[0]][tile[1]]).reduce((x, y) => x + y, 0);
                    info.push({ p, m, n_xiangting: nXiangting, ev, tingpai, n_tingpai: nTingpai });
                }
                if (ev - max > -0.0000001) {
                    gang = m;
                    max = ev;
                }
            }
            return gang;
        }
        nXiangting = this.xiangting(this.shoupai);
        for (const m of this.get_gang_mianzi(this.shoupai) || []) {
            const shoupai = this.shoupai.clone().gang(m);
            if (this.xiangting(shoupai) === nXiangting) {
                if (info) {
                    const p = m.match(/\d{4}$/) ? m.slice(0, 2) : m[0] + m.slice(-1);
                    const ev = this.eval_shoupai(shoupai, paishu);
                    const tingpai = this.rules.tingpai(shoupai);
                    const nTingpai = tingpai.map((tile) => this._suanpai._paishu[tile[0]][tile[1]]).reduce((x, y) => x + y, 0);
                    info.push({ p, m, n_xiangting: nXiangting, ev, tingpai, n_tingpai: nTingpai });
                }
                return m;
            }
        }
        return undefined;
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
        const nXiangting = this.rules.xiangting(this.shoupai);
        const paishu = this._suanpai.get_paishu();
        const paijia = this._suanpai.make_paijia(this.shoupai);
        const count = (shoupai) => this.rules.tingpai(shoupai).map((p) => this._suanpai._paishu[p[0]][p[1]]).reduce((x, y) => x + y, 0);
        for (const p of this.get_dapai(this.shoupai).reverse().sort((x, y) => paijia(x) - paijia(y))) {
            if (!dapai) dapai = p;
            const shoupai = this.shoupai.clone().dapai(p);
            if ((nXiangting > 2 && this.xiangting(shoupai) > nXiangting) || this.rules.xiangting(shoupai) > nXiangting) {
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
        let nXiangting = this.rules.xiangting(this.shoupai);
        const riichi = this._model.shoupai.find((s) => s && s.lizhi);
        if (riichi && nXiangting >= 3) return undefined;
        const d = ['', '+', '=', '-'][(4 + this._model.lunban - this._menfeng) % 4];
        const p = dapai.p.slice(0, 2) + d;
        if (nXiangting < 3) {
            const mianzi = (this.get_gang_mianzi(this.shoupai, p) || [])
                .concat(this.get_peng_mianzi(this.shoupai, p) || [])
                .concat(this.get_chi_mianzi(this.shoupai, p) || []);
            if (!mianzi.length) return undefined;
            const paishu = this._suanpai.get_paishu();
            let best = this.eval_shoupai(this.shoupai, paishu, '') * 2 ** ((0.5 - k.call) * 1.8);
            let fulou;
            for (const m of mianzi) {
                const shoupai = this.shoupai.clone().fulou(m);
                const x = this.rules.xiangting(shoupai);
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
        const mianzi = (this.get_peng_mianzi(this.shoupai, p) || []).concat(this.get_chi_mianzi(this.shoupai, p) || []);
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
