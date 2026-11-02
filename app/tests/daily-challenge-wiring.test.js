import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSession } from '../src/combat/session.js';
import { parseChallengeReport } from '../src/combat/challenge-report.js';
import { CHALLENGE_REWARD_TAG_HASH } from '../src/combat/ledger.js';
import { normalizeCombatExpansionSettings, planCombatPreset } from '../src/visual/igs-ui/combat-settings.js';
import { CHALLENGE_GRAMMAR_LINE, combatGrammarEnabled, resolveChallengePromptSegment, resolveCombatPromptRule } from '../src/scene/combat-prompt.js';
import { resolveCombatEntry } from '../src/visual/igs-ui/combat-entry.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { IGS_INLINE_DIRECTIVE_NAMES, stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { challengeDirectiveOf } from '../src/combat/challenge-report.js';
import { deriveChallengeHistory } from '../src/combat/challenge-history.js';

const TAG = '[igs-challenge:终面|话术|普通|压力]';
const memoryStorage = () => {
    const data = new Map();
    return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
};

function makeSession({ kinds = { combat: false, challenge: true }, appended = [], storage = memoryStorage(), stake = 'normal', chat = [{ is_user: false, mes: `面试官抬起头。\n${TAG}`, swipe_id: 0 }] } = {}) {
    const requests = [];
    const sent = [];
    const session = createCombatSession({
        chat: () => chat, getChatId: () => 'chat-1', userName: '我', storage, kinds,
        request: async () => { requests.push(1); throw new Error('no llm'); }, llm: { source: 'tavern' }, now: () => 1,
        ledger: { append: async (entries) => { appended.push(...entries); return { ok: true }; }, scan: async () => { throw new Error('日常局不应扫描战斗账本'); }, effectiveState: async () => { throw new Error('日常局不应读取账本'); } },
        tables: { append: async () => { throw new Error('日常局不应写档案'); } },
        send: async (text) => { chat.push({ is_user: true, mes: text }); sent.push(text); return { ok: true, messageId: chat.length - 1 }; },
        challenge: { state: () => ({ bars: { stamina: 100, stress: 0 }, skills: { 话术: { value: 60 } }, present: ['小林'], favors: { 小林: 40 } }), allowEscape: true, stake },
        retryDelays: [],
    });
    return { session, chat, sent, requests };
}

test('日常挑战备战不读账本、不写档案，副模型选难关失败时沿用本地难关，大厅列出好感达标的在场人物', async () => {
    const { session } = makeSession();
    const prepared = await session.prepare(0);
    assert.ok(prepared.ok, JSON.stringify(prepared.reason));
    const state = session.state();
    assert.equal(state.status, 'lobby');
    assert.equal(state.kind, 'challenge');
    assert.equal(state.challenge.foe, 'interviewer');
    assert.deepEqual(state.challengeCandidates.map((item) => item.name), ['小林']);
    assert.match(state.combatId, /^ch\|/);
});

test('只认战斗标签的对决类型不把挑战标签当开局', async () => {
    const { session } = makeSession({ kinds: { combat: true, challenge: false } });
    const prepared = await session.prepare(0);
    assert.equal(prepared.ok, false);
    assert.equal(prepared.reason, 'combat-start-missing');
});

test('托管打完一局后发出挑战战报，不写伤势与战利品，战报楼被识别为已完成', async () => {
    const appended = [];
    const { session, chat, sent } = makeSession({ appended });
    await session.prepare(0);
    assert.ok(session.pickChallengeAllies(['小林']).ok);
    assert.deepEqual(session.state().challenge.allies, ['小林']);
    const auto = session.autoPlay();
    assert.ok(auto.ok, JSON.stringify(auto.reason));
    assert.equal(session.state().status, 'ended');
    assert.ok(session.state().final.text.includes('<igs-challenge-report'));
    const finished = await session.finish();
    assert.ok(finished.ok, JSON.stringify(finished.reason));
    assert.equal(session.state().status, 'done');
    const report = parseChallengeReport(sent[0]);
    assert.ok(report);
    assert.deepEqual(report.allies, ['小林']);
    assert.equal(appended.some((entry) => entry.type === 'wound' || entry.type === 'consume'), false);
    for (const entry of appended) assert.equal(entry.type === 'learn' && entry.anchor.tagHash === CHALLENGE_REWARD_TAG_HASH, true);
    const again = makeSession();
    again.chat.push(chat[1]);
    await again.session.prepare(0);
    assert.equal(again.session.state().status, 'done');
});

test('放弃直接记为放弃结局并发出战报', async () => {
    const { session, sent } = makeSession();
    await session.prepare(0);
    const result = await session.abandon();
    assert.ok(result.ok, JSON.stringify(result.reason));
    assert.equal(parseChallengeReport(sent[0]).outcome, '放弃');
});

test('对局中刷新后按种子与动作序列恢复同一局', async () => {
    const storage = memoryStorage();
    const first = makeSession({ storage });
    await first.session.prepare(0);
    first.session.start();
    assert.ok(first.session.act({ type: 'end-turn' }).ok);
    first.session.flushPersist();
    const turn = first.session.state().battle.turn;
    const second = makeSession({ storage, chat: first.chat });
    assert.ok(second.session.resume().ok);
    assert.equal(second.session.state().status, 'battle');
    assert.equal(second.session.state().battle.turn, turn);
});

test('对决类型缺省为战斗，旧存档的提示词与设置不变；仅日常挑战不注入战斗语法', () => {
    const legacy = normalizeCombatExpansionSettings({ enabled: true, difficulty: 'hard', skin: 'ink' });
    assert.equal(legacy.kind, 'combat');
    assert.deepEqual(legacy.daily, { perDay: 1, cooldownFloors: 8, stake: 'normal', allowEscape: true });
    assert.equal(legacy.difficulty, 'hard');
    const weird = normalizeCombatExpansionSettings({ enabled: true, kind: 'x', daily: { perDay: 9, cooldownFloors: -3, stake: 'z', allowEscape: false } });
    assert.equal(weird.kind, 'combat');
    assert.deepEqual(weird.daily, { perDay: 3, cooldownFloors: 0, stake: 'normal', allowEscape: false });
    assert.ok(resolveCombatPromptRule({ combatExpansion: { enabled: true } }).includes('igs-combat:start'));
    assert.equal(resolveCombatPromptRule({ combatExpansion: { enabled: true, kind: 'daily' } }), '');
    assert.ok(resolveCombatPromptRule({ combatExpansion: { enabled: true, kind: 'both' } }).includes('igs-combat:start'));
    assert.equal(combatGrammarEnabled({ combatExpansion: { enabled: true, kind: 'daily' } }), false);
    assert.deepEqual(planCombatPreset('daily-only').writes[0], ['readerSettings.combatExpansion.kind', 'daily']);
});

test('日常语法行只在启用日常挑战且额度与冷却通过时出现', () => {
    const daily = { combatExpansion: { enabled: true, kind: 'daily' } };
    assert.equal(resolveChallengePromptSegment(daily, { ok: true }).content, CHALLENGE_GRAMMAR_LINE);
    assert.equal(resolveChallengePromptSegment(daily, { ok: false, reason: 'quota' }), null);
    assert.equal(resolveChallengePromptSegment({ combatExpansion: { enabled: true } }, { ok: true }), null);
    assert.ok(resolveChallengePromptSegment({ combatExpansion: { enabled: true, kind: 'both' } }, { ok: true }));
    assert.ok(!CHALLENGE_GRAMMAR_LINE.includes('不要') && !CHALLENGE_GRAMMAR_LINE.includes('不得'));
});

test('挑战入口只在对决类型含日常挑战且额度通过时出现，战斗标签优先', () => {
    const floor = (mes) => ({ isAi: true, isLatest: true, chatId: 'c', messageId: 3, swipeId: 0, text: mes });
    const run = (kind, mes, quota) => resolveCombatEntry({ readerSettings: { combatExpansion: { enabled: true, kind } }, floor: floor(mes), lastPage: true, challengeQuota: quota });
    assert.equal(run('combat', TAG), null);
    assert.equal(run('daily', TAG).kind, 'challenge');
    assert.equal(run('both', TAG).event, '终面');
    assert.equal(run('daily', TAG, { ok: false, reason: 'quota' }), null);
    const combatTag = '[igs-combat:start|街头|混混|]';
    assert.equal(run('daily', combatTag), null);
    assert.equal(run('both', combatTag).kind, undefined);
});

test('挑战战报楼由紧随其后的楼结算：额外指令不受卡牌战斗接管影响', () => {
    const before = createStatsState({ day: 1 });
    const report = parseChallengeReport(`<igs-challenge-report id="rabc" result="lose" outcome="失败" tier="普通" stake="压力" domain="话术" foe="" counterpart="" allies="">`);
    const directive = challengeDirectiveOf(report, 4);
    const settled = settleFloorText(before, '她点点头。', { noBattle: true, extraDirectives: [directive], random: () => 0.5 });
    assert.ok(settled.state.protagonist.bars.stress > before.protagonist.bars.stress);
    assert.equal(settled.state.clock.lastChallengeReport, 'rabc');
    const ignored = settleFloorText(before, '她点点头。', { noBattle: true, extraDirectives: [{ kind: 'battle' }, null], random: () => 0.5 });
    assert.equal(ignored.state.protagonist.bars.stress, before.protagonist.bars.stress);
});

test('挑战标签登记为行内指令，不会漏进正文', () => {
    assert.ok(IGS_INLINE_DIRECTIVE_NAMES.includes('challenge'));
    assert.equal(stripMarkerDirectives(`她看着你。\n${TAG}`).trim(), '她看着你。');
});

test('圆满且难关登记了经验时，战报发出后把经验牌写成挂在战报楼上的 learn 记录', async () => {
    const appended = [];
    const chat = [{ is_user: false, mes: '考场很安静。\n[igs-challenge:期末考试|学习|轻松|压力]', swipe_id: 0 }];
    const session = createCombatSession({
        chat: () => chat, getChatId: () => 'chat-1', userName: '我', storage: memoryStorage(), kinds: { combat: false, challenge: true }, retryDelays: [], now: () => 1,
        request: async () => { throw new Error('no llm'); }, tables: {},
        ledger: { append: async (entries) => { appended.push(...entries); return { ok: true }; } },
        send: async (text) => { chat.push({ is_user: true, mes: text }); return { ok: true, messageId: chat.length - 1 }; },
        challenge: { state: () => ({ bars: { stamina: 100, stress: 0 }, skills: { 学习: { value: 60 } } }), allowEscape: true, stake: 'normal' },
    });
    await session.prepare(0);
    assert.ok(session.autoPlay().ok);
    assert.equal(session.state().challengeSummary.outcome, '圆满');
    assert.ok((await session.finish()).ok);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].type, 'learn');
    assert.deepEqual(appended[0].anchor, { messageId: 1, swipeId: 0, tagHash: CHALLENGE_REWARD_TAG_HASH, occurrence: 0 });
});

test('面板按日常说法渲染大厅、对局、结算与挑战记录', async () => {
    const { battleView, challengeLobbyView, endView } = await import('../src/visual/igs-ui/combat-panel-model.js');
    const { renderCombatPanelHtml } = await import('../src/visual/igs-ui/combat-panel-render.js');
    const { deriveChallengeHistory } = await import('../src/combat/challenge-history.js');
    const { buildChallengeReport } = await import('../src/combat/challenge-report.js');
    const { session } = makeSession();
    await session.prepare(0);
    session.pickChallengeAllies(['小林']);
    const lobby = challengeLobbyView(session.state());
    const lobbyHtml = renderCombatPanelHtml({ status: 'lobby', lobby, challenge: true, portraits: {}, enemyArt: {} });
    for (const word of ['迎接挑战', '交给托管', '放弃', '协助者', '挑战记录', '终面']) assert.ok(lobbyHtml.includes(word), word);
    assert.ok(!lobbyHtml.includes('开始战斗') && !lobbyHtml.includes('跳过战斗'));
    session.start();
    const state = session.state();
    const view = battleView(state.battle, state.legal, { challenge: true });
    const cards = view.hand.map((card) => `${card.text}${card.keywords || ''}`).join('');
    assert.ok(!/伤害|格挡|生命/.test(cards));
    assert.ok(['施压', '拖延', '强化', '刁难', '调整', '特殊'].includes(view.enemies[0].intent.label));
    session.autoPlay();
    const ended = session.state();
    const end = endView(ended.battle, ended.events, { challenge: true, summary: ended.challengeSummary });
    assert.ok(['成功', '失败', '放弃'].includes(end.label));
    const battleHtml = renderCombatPanelHtml({ status: 'battle', challenge: true, battle: battleView(state.battle, state.legal, { challenge: true }), portraits: {}, enemyArt: {}, encounter: '终面', skin: 'initial' });
    assert.ok(battleHtml.includes('放弃') && !battleHtml.includes('撤退'));
    const win = buildChallengeReport({ combatId: 'ch|0|0|a|0', event: '期末考试', outcome: '圆满', tier: '普通', stake: '压力', domain: '学习', foe: 'examiner' });
    const history = deriveChallengeHistory([{ floor: 4, text: win.text }]);
    const historyHtml = renderCombatPanelHtml({ status: 'idle', challenge: true, historyOpen: true, history });
    assert.ok(historyHtml.includes('期末考试') && historyHtml.includes('初战告捷') && historyHtml.includes('第4楼'));
});

test('代价轻重只偏移代价档位：战报与挑战记录显示标签原写的难度，结算指令用偏移后的档位', async () => {
    const hard = [{ is_user: false, mes: '面试官抬起头。\n[igs-challenge:终面|话术|艰难|压力]', swipe_id: 0 }];
    const { session, sent } = makeSession({ chat: hard, stake: 'light' });
    await session.prepare(0);
    assert.equal(session.state().challenge.tier, '艰难');
    const result = await session.abandon();
    assert.ok(result.ok, JSON.stringify(result.reason));
    assert.match(sent[0], /tier="艰难" cost="普通"/);
    const report = parseChallengeReport(sent[0]);
    assert.equal(challengeDirectiveOf(report, 1).tier, '普通');
    assert.equal(deriveChallengeHistory([{ floor: 1, text: sent[0] }]).entries[0].tier, '艰难');
});
