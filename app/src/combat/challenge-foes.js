// 难关模板：只登记模板键、日常名称与出招模板键，数值由 challenge-setup 按难度档查表。
export const CHALLENGE_FOES = Object.freeze({
    interviewer: Object.freeze({ name: '面试官', harvest: ['经验'], words: ['面试', '面谈', '应聘', '答辩', '终面'], domains: ['话术'], skills: Object.freeze([['追问细节', 'slash'], ['沉默施压', 'curse'], ['抛出陷阱题', 'heavy'], ['不置可否', 'guard']]) }),
    judge: Object.freeze({ name: '评委', harvest: ['奖金', '经验'], words: ['评委', '比赛', '评审', '展览', '演出', '竞赛', '厨艺'], domains: ['烹饪', '艺术', '运动'], skills: Object.freeze([['挑剔点评', 'slash'], ['严苛打分', 'heavy'], ['冷眼旁观', 'curse'], ['不动声色', 'guard']]) }),
    counterpart: Object.freeze({ name: '对方', harvest: [], words: ['和解', '和好', '道歉', '吵架', '冷战', '告白', '挽回', '表白'], domains: ['魅力', '照顾'], skills: Object.freeze([['冷处理', 'guard'], ['翻旧账', 'crush'], ['沉默以对', 'curse'], ['余怒未消', 'heavy']]) }),
    deadline: Object.freeze({ name: '截稿', harvest: [], words: ['截稿', '赶稿', '交稿', '赶工', '工期', '死线', '来不及'], domains: ['应变', '家务'], skills: Object.freeze([['时间逼近', 'slash'], ['临时变卦', 'heavy'], ['越拖越紧', 'combo'], ['手忙脚乱', 'curse']]) }),
    elder: Object.freeze({ name: '长辈', harvest: [], words: ['父母', '长辈', '家长', '说服', '爸', '妈', '亲戚'], domains: [], skills: Object.freeze([['不停唠叨', 'combo'], ['担忧顾虑', 'curse'], ['坚决反对', 'heavy'], ['拿定主意', 'guard']]) }),
    examiner: Object.freeze({ name: '考官', harvest: ['经验'], words: ['考试', '考核', '测验', '考官', '笔试', '期末', '测试'], domains: ['学习'], skills: Object.freeze([['出难题', 'heavy'], ['连续发问', 'slash'], ['限定时间', 'curse'], ['不予提示', 'guard']]) }),
});

export const CHALLENGE_FOE_KEYS = Object.freeze(Object.keys(CHALLENGE_FOES));
export const CHALLENGE_FOE_FALLBACK = 'elder';

// 事件名里的词优先，其次领域的默认难关，都没有取兜底难关。
export function pickFoe(event, domain) {
    const text = String(event || '');
    for (const key of CHALLENGE_FOE_KEYS) if (CHALLENGE_FOES[key].words.some((word) => text.includes(word))) return key;
    for (const key of CHALLENGE_FOE_KEYS) if (CHALLENGE_FOES[key].domains.includes(domain)) return key;
    return CHALLENGE_FOE_FALLBACK;
}

// 事件类型决定胜利的收获：奖金只发给本身带钱的难关（如比赛），经验牌只发给有历练价值的难关；用难关登记的离散词表示，不加任何标签字段。
export const CHALLENGE_PRIZE_BY_TIER = Object.freeze({ 轻松: '少量', 普通: '普通', 艰难: '昂贵' });

export function challengeHarvest(foeKey, outcome, tier) {
    const harvest = CHALLENGE_FOES[foeKey]?.harvest || [];
    const full = outcome === '圆满';
    return { prize: full && harvest.includes('奖金') ? CHALLENGE_PRIZE_BY_TIER[tier] || CHALLENGE_PRIZE_BY_TIER.普通 : null, card: full && harvest.includes('经验') };
}

export const CHALLENGE_FOE_NAME_MAX = 20;

// 副模型选难关的回复校验，写法对齐 generation-assembly：只拒收不修正；键必须是登记过的难关，名称 1~20 字。
export function assembleChallengeFoe(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: [{ path: '', reason: 'expected-object' }] };
    const errors = [];
    const foe = typeof raw.foe === 'string' ? raw.foe.trim() : raw.foe;
    if (typeof foe !== 'string' || !CHALLENGE_FOE_KEYS.includes(foe)) errors.push({ path: 'foe', reason: 'invalid-template', detail: { allowed: [...CHALLENGE_FOE_KEYS] } });
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) errors.push({ path: 'name', reason: 'required' });
    else if ([...name].length > CHALLENGE_FOE_NAME_MAX) errors.push({ path: 'name', reason: 'too-long', detail: { max: CHALLENGE_FOE_NAME_MAX } });
    return errors.length ? { errors } : { value: { foe, name }, diagnostics: [] };
}
