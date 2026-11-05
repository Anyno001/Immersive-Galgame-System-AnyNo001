export const INTIMATE_DOMAIN = '亲密';
export const INTIMATE_MECHANICS = Object.freeze(['合拍', '主导']);
export const INTIMATE_POSITIONS = Object.freeze(['receive', 'lead', 'story']);
export const INTIMATE_POSITION_LABELS = Object.freeze({ receive: '受方', lead: '攻方', story: '随剧情' });
export const INTIMATE_DEFAULTS = Object.freeze({ enabled: false, position: 'receive', launch: true });
export const INTIMATE_TENSION_START = 3;
export const INTIMATE_SWAP_HIDDEN = 3;
export const INTIMATE_RAPPORT_HIDDEN = 3;
export const INTIMATE_FLOW_FULL = 0.6;
export const INTIMATE_LEAD_FULL = 0.5;
export const INTIMATE_ENDINGS = Object.freeze({
    合拍: Object.freeze(['水到渠成', '小插曲', '被打断', '草草收场', '心意相通']),
    主导: Object.freeze(['我方主导', '险胜', '对方主导', '反复易手', '甘拜下风', '同归于尽']),
});
export const INTIMATE_STOP = '停下';
export const INTIMATE_ALL_ENDINGS = Object.freeze([...INTIMATE_ENDINGS.合拍, ...INTIMATE_ENDINGS.主导, INTIMATE_STOP]);
export const INTIMATE_LEGACY_OUTCOME = Object.freeze({
    水到渠成: '圆满', 心意相通: '圆满', 我方主导: '圆满', 小插曲: '勉强', 险胜: '勉强',
    被打断: '失败', 草草收场: '失败', 对方主导: '失败', 反复易手: '失败', 同归于尽: '失败', 甘拜下风: '放弃', [INTIMATE_STOP]: '放弃',
});
export const INTIMATE_LINES_LINE = '- 台词（可选）：亲密标签之前可加一行 [igs-combat:lines|对方角色|开场|出招|受击|快失守]，与亲密标签一起放进正文末尾的 <igs-combat> 块；四段各写一到两句，多句用「/」隔开，每句不超过15字，受击与快失守写短促的气声';
export const INTIMATE_GRAMMAR_LINE = '【亲密对决】[igs-challenge:标题|亲密|合拍或主导|难度]：仅在一段亲密情节刚开始升温时，在该楼正文最后一行写一次，随后停笔，不写结果；合拍表示两人互相配合，主导表示争夺主动，难度写 轻松/普通/艰难，后两项可省略';

const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function normalizeIntimateSettings(value) {
    const source = plain(value);
    return {
        enabled: source.enabled === true,
        position: INTIMATE_POSITIONS.includes(source.position) ? source.position : INTIMATE_DEFAULTS.position,
        launch: source.launch !== false,
    };
}

export const intimateNsfwOn = (readerSettings, autoIllustration) => plain(autoIllustration).nsfwEnabled === true || plain(plain(readerSettings).romanceFx).enabled === true;
export const intimateOn = (readerSettings, autoIllustration) => plain(plain(readerSettings).combatExpansion).enabled === true
    && normalizeIntimateSettings(plain(readerSettings.combatExpansion).intimate).enabled && intimateNsfwOn(readerSettings, autoIllustration);

const DIGITS = Object.freeze({ 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 两: 2 });
const NUMBER = '\\d{1,3}|[零一二三四五六七八九十两]{1,3}';
const AGE_LABELED = new RegExp(`(?:年龄|年纪|\\bage)\\s*[:：=是为]?\\s*(${NUMBER})(?:\\s*(?:周岁|岁|歲)|(?![\\u4e00-\\u9fa5\\d]))`, 'gi');
const AGE_SUFFIX = new RegExp(`(?<![零一二三四五六七八九十两百\\d.])(${NUMBER})\\s*(?:周岁|岁|歲|years?[\\s-]*old|yo\\b)`, 'gi');
const PAST_AFTER = /^\s*(?:时|那年|起|开始|以前|之前|的时候)/;
const PAST_BEFORE = /(?:(?<!目)前|当年|那年)[^。！？!?\n]{0,3}$/;
const BRIDE_AGE = /二八年华/;
const COMPARE_BEFORE = /(?:相差|差了?|(?<!最)[小大长幼少多])\s*$/;

function numberOf(token) {
    if (/^\d+$/.test(token)) return Number(token);
    if (token.includes('十')) {
        const [left, right] = token.split('十');
        if (left.length > 1 || right.length > 1) return NaN;
        const tens = left ? DIGITS[left] : 1;
        const ones = right ? DIGITS[right] : 0;
        return tens * 10 + ones;
    }
    return token.length === 1 ? DIGITS[token] : NaN;
}

export function agesOf(text) {
    const source = String(text || '');
    const ages = [];
    for (const match of source.matchAll(AGE_LABELED)) ages.push(numberOf(match[1]));
    for (const match of source.matchAll(AGE_SUFFIX)) {
        const before = source.slice(Math.max(0, match.index - 8), match.index);
        const after = source.slice(match.index + match[0].length, match.index + match[0].length + 4);
        if (PAST_AFTER.test(after) || PAST_BEFORE.test(before) || COMPARE_BEFORE.test(before)) continue;
        ages.push(numberOf(match[1]));
    }
    if (BRIDE_AGE.test(source)) ages.push(16);
    return ages.filter((age) => Number.isFinite(age));
}

export function explicitAgeOf(text) {
    const ages = agesOf(text);
    return ages.length ? Math.min(...ages) : null;
}

export const underageByProfile = (texts) => (Array.isArray(texts) ? texts : [texts]).some((text) => agesOf(text).some((age) => age < 18));

export function resolveIntimateGate({ on, ageBlocked, newRise, fought } = {}) {
    if (!on) return { ok: false, code: 'intimate-off' };
    if (ageBlocked) return { ok: false, code: 'intimate-age-blocked' };
    if (!newRise) return { ok: false, code: 'intimate-no-span' };
    if (fought) return { ok: false, code: 'intimate-already-fought' };
    return { ok: true };
}

export const LOVE_HATE_FAVOR_MIN = 51;
export const GRUDGE_GATE = 25;
export const GRUDGE_TIER_STEP = 25;
export const TRUST_SHAKY_MAX = 25;

const numberOr0 = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const grudgeLevel = (grudge) => {
    const value = numberOr0(grudge);
    return value <= GRUDGE_GATE ? 0 : Math.min(3, Math.ceil((value - GRUDGE_GATE) / GRUDGE_TIER_STEP));
};
export const isLoveHate = ({ favor = 0, grudge = 0 } = {}) => numberOr0(favor) >= LOVE_HATE_FAVOR_MIN && grudgeLevel(grudge) > 0;
export const isShakyLoveHate = ({ favor = 0, trust = 0, grudge = 0 } = {}) => isLoveHate({ favor, grudge }) && numberOr0(trust) <= TRUST_SHAKY_MAX;
export const fallbackMechanic = ({ favor = 0, trust = 0, grudge = 0 } = {}) => (isLoveHate({ favor, trust, grudge }) || numberOr0(grudge) > numberOr0(favor) ? '主导' : '合拍');

export function floorHasNewRise(pages, resolvePhase) {
    const list = Array.isArray(pages) ? pages : [];
    return list.some((page) => page && page.nsfwSpan && page.nsfwSpan.continued !== true && resolvePhase(page.nsfwSpan) === 'rise');
}

const LEAD_VERBS = ['按住', '压住', '压在', '扣住', '抵在', '抵住', '逼近', '拉过', '抱起', '推倒', '握住', '吻住', '捏住', '禁锢'];
export function storyPosition(text, userName) {
    const tail = String(text || '').slice(-800);
    const names = [String(userName || ''), '我', '你'].filter(Boolean);
    let mine = 0;
    let theirs = 0;
    for (const verb of LEAD_VERBS) {
        let at = tail.indexOf(verb);
        while (at >= 0) {
            const before = tail.slice(Math.max(0, at - 4), at);
            if (names.some((name) => before.includes(name))) mine += 1;
            else theirs += 1;
            at = tail.indexOf(verb, at + verb.length);
        }
    }
    return mine > theirs ? 'lead' : 'receive';
}

export const resolveIntimatePosition = (setting, text, userName) => (setting === 'story' ? storyPosition(text, userName) : INTIMATE_POSITIONS.includes(setting) ? setting : 'receive');

export function intimateEnding({ mechanic, result, heroRatio = 0, trace = {} } = {}) {
    if (result === 'escape' && trace.surrendered !== true) return INTIMATE_STOP;
    if (mechanic === '合拍') {
        if (result === 'win') {
            if (Number(trace.rapport) >= INTIMATE_RAPPORT_HIDDEN) return '心意相通';
            return Number(heroRatio) >= INTIMATE_FLOW_FULL ? '水到渠成' : '小插曲';
        }
        return trace.interruptHit === true ? '被打断' : '草草收场';
    }
    if (trace.surrendered === true) return '甘拜下风';
    if (trace.bothZero === true) return '同归于尽';
    if (Number(trace.swaps) >= INTIMATE_SWAP_HIDDEN) return '反复易手';
    if (result === 'win') return Number(heroRatio) >= INTIMATE_LEAD_FULL ? '我方主导' : '险胜';
    return '对方主导';
}

export const INTIMATE_ENDING_TEXT = Object.freeze({
    水到渠成: '一切自然而然',
    小插曲: '中途有些笨拙与笑场，两人反而更亲近了',
    被打断: '被外界打断，余温未散，留待下次',
    草草收场: '节奏没有对上，气氛有些尴尬',
    心意相通: '不必言说的默契，两人心意相通',
    我方主导: '此后由主角掌控节奏',
    险胜: '主角夺回了主动，但对方随时可能反扑',
    对方主导: '此后由对方掌控节奏',
    反复易手: '谁也不肯认输，主动权几经易手，两人相互撕扯',
    甘拜下风: '主角主动交出了主导，此后由对方掌控节奏',
    同归于尽: '两败俱伤，难分彼此',
    [INTIMATE_STOP]: '主角叫停了这一幕，不算输赢，也没有代价',
});

export const INTIMATE_MARKS = Object.freeze({ suppressed: 'suppressed', defeated: 'defeated' });
const MARK_BY_ENDING = Object.freeze({ 我方主导: 'suppressed', 险胜: 'suppressed', 对方主导: 'defeated', 甘拜下风: 'defeated' });
export const markForEnding = (ending) => MARK_BY_ENDING[ending] || null;
export const isRapportWin = (ending) => ['水到渠成', '小插曲', '心意相通'].includes(ending);

const gates = new Map();
const gateKey = (chatId, messageId) => `${chatId}|${messageId}`;
export function setIntimateGate(chatId, messageId, gate) {
    if (!gate) gates.delete(gateKey(chatId, messageId));
    else gates.set(gateKey(chatId, messageId), gate);
    if (gates.size > 40) gates.delete(gates.keys().next().value);
}
export const getIntimateGate = (chatId, messageId) => gates.get(gateKey(chatId, messageId)) || null;

export const INTIMATE_FOUGHT_KEY = 'igs_intimate_fought';
export const readFoughtKeys = (metadata) => (Array.isArray(plain(metadata)[INTIMATE_FOUGHT_KEY]) ? metadata[INTIMATE_FOUGHT_KEY] : []);

let activeDuel = null;
export const setIntimateDuel = (duel) => { activeDuel = duel && duel.partner ? { partner: String(duel.partner), stage: 0 } : null; };
export const getIntimateDuel = () => activeDuel;
export const INTIMATE_DUEL_MOOD = '动情';
export const INTIMATE_DUEL_MOOD_STRONG = Object.freeze(['意乱情迷', '迷离', '情动']);
export const INTIMATE_STAGE_HALF = 0.5;
export const INTIMATE_STAGE_LOW = 0.2;

export const duelStageOf = (ratio) => {
    const value = Number(ratio);
    if (!Number.isFinite(value)) return 0;
    return value < INTIMATE_STAGE_LOW ? 2 : value < INTIMATE_STAGE_HALF ? 1 : 0;
};

export function createDuelLowGate() {
    let fired = '';
    return (combatId, ratio) => {
        if (!combatId || !(Number(ratio) < INTIMATE_STAGE_LOW) || fired === combatId) return false;
        fired = combatId;
        return true;
    };
}

export function advanceIntimateDuel(ratio) {
    if (!activeDuel) return false;
    const next = duelStageOf(ratio);
    if (next <= activeDuel.stage) return false;
    activeDuel.stage = next;
    return true;
}

export const INTIMATE_WHISPER_CARDS = Object.freeze(['小声说喜欢', '情话', '低声命令', '确认心意', '撒娇夺权']);
export const isWhisperCard = (name) => INTIMATE_WHISPER_CARDS.includes(String(name || ''));

export const INTIMATE_HEART_REST = 66;
export const INTIMATE_HEART_PEAK = 100;
export const intimateHeartBpm = (ratio) => {
    const value = Math.min(1, Math.max(0, Number.isFinite(Number(ratio)) ? Number(ratio) : 1));
    return Math.round(INTIMATE_HEART_REST + (INTIMATE_HEART_PEAK - INTIMATE_HEART_REST) * (1 - value));
};

export const intimateCreakWindow = (turn, rounds) => Number(rounds) > 0 && Number(turn) >= Number(rounds) - 1;

export const INTIMATE_ENDING_LINE = (ending) => (INTIMATE_ENDING_TEXT[ending] ? `${ending}。${INTIMATE_ENDING_TEXT[ending]}` : '');
