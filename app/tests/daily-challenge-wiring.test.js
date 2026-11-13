import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSession } from '../src/combat/session.js';
import { parseChallengeReport } from '../src/combat/challenge-report.js';
import { CHALLENGE_REWARD_TAG_HASH } from '../src/combat/ledger.js';
import { normalizeCombatExpansionSettings, planCombatPreset } from '../src/visual/igs-ui/combat-settings.js';
import { CHALLENGE_GRAMMAR_LINE, combatGrammarEnabled, combatOnCooldown, defaultCombatRuleText, floorsSinceCombatStart, applyCombatRuleModifiers, chatForCooldown, resolveChallengePromptSegment, resolveCombatPromptRule } from '../src/scene/combat-prompt.js';
import { resolveCombatEntry } from '../src/visual/igs-ui/combat-entry.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { DEFAULT_STAT_PROMPTS, buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
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


test('上一场撤退后未发战报，更晚的开战楼开打时旧战斗作废、新挑战进入大厅', async () => {
    const storage = memoryStorage();
    const first = makeSession({ storage });
    await first.session.prepare(0);
    first.session.start();
    assert.ok(first.session.act({ type: 'escape' }).ok);
    assert.equal(first.session.state().status, 'ended');
    first.session.flushPersist();
    first.chat.push({ is_user: true, mes: '继续' }, { is_user: false, mes: `又一场。\n[igs-challenge:夺枪|格斗|普通|体力]`, swipe_id: 0 });
    const second = makeSession({ storage, chat: first.chat });
    second.session.resume();
    assert.ok(['ended', 'send-failed'].includes(second.session.state().status));
    assert.equal(second.session.dropSuperseded(0), false);
    assert.equal(second.session.dropSuperseded(2), true);
    assert.equal(second.session.state().status, 'idle');
    await second.session.prepare(2);
    assert.equal(second.session.state().status, 'lobby');
    assert.equal(second.session.state().anchor.messageId, 2);
    const third = makeSession({ storage, chat: first.chat });
    third.session.resume();
    assert.notEqual(third.session.state().status, 'ended');
});
