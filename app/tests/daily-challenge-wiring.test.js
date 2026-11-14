import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSession, sessionKeyFor } from '../src/combat/session.js';
import { CARD_UPGRADE_RULES } from '../src/combat/card-upgrade.js';
import { replayBattle } from '../src/combat/engine.js';
import { parseChallengeReport } from '../src/combat/challenge-report.js';
import { CHALLENGE_REWARD_TAG_HASH } from '../src/combat/ledger.js';
import { normalizeCombatExpansionSettings, planCombatPreset } from '../src/visual/igs-ui/combat-settings.js';
import { CHALLENGE_GRAMMAR_LINE, combatGrammarEnabled, combatOnCooldown, defaultCombatRuleText, floorsSinceCombatStart, applyCombatRuleModifiers, chatForCooldown, resolveChallengePromptSegment, resolveCombatPromptRule } from '../src/scene/combat-prompt.js';
import { resolveCombatEntry, unfinishedCombatState } from '../src/visual/igs-ui/combat-entry.js';
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

function makeSession({ kinds = { combat: false, challenge: true }, appended = [], ledger, storage = memoryStorage(), stake = 'normal', sendResult, delivered = true, chat = [{ is_user: false, mes: `面试官抬起头。\n${TAG}`, swipe_id: 0 }] } = {}) {
    const requests = [];
    const sent = [];
    const session = createCombatSession({
        chat: () => chat, getChatId: () => 'chat-1', userName: '我', storage, kinds,
        request: async () => { requests.push(1); throw new Error('no llm'); }, llm: { source: 'tavern' }, now: () => 1,
        ledger: ledger || { append: async (entries) => { appended.push(...entries); return { ok: true }; }, scan: async () => { throw new Error('日常局不应扫描战斗账本'); }, effectiveState: async () => { throw new Error('日常局不应读取账本'); } },
        tables: { append: async () => { throw new Error('日常局不应写档案'); } },
        send: async (text) => { if (delivered) chat.push({ is_user: true, mes: text }); sent.push(text); return sendResult || { ok: true, messageId: chat.length - 1 }; },
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

test('挑战与亲密新局保存升级契约，恢复照读快照且不向旧局补标记', async (t) => {
    for (const intimate of [false, true]) {
        const storage = memoryStorage();
        const options = { storage, ...(intimate ? {
            kinds: { combat: false, challenge: true, intimate: () => ({ launch: true, mechanic: '合拍', partner: '小林' }) },
            chat: [{ is_user: false, mes: '两人完成配合。', swipe_id: 0 }],
        } : {}) };
        const first = makeSession(options);
        t.after(() => first.session.dispose());
        assert.equal((await first.session.prepare(0)).ok, true);
        assert.equal(first.session.start().ok, true);
        assert.equal(first.session.state().record.setup.cardUpgradeRules, CARD_UPGRADE_RULES);
        assert.equal(first.session.state().battle.cardUpgradeRules, CARD_UPGRADE_RULES);
        assert.equal(first.session.state().record.setup.exhaustRules, 1);
        assert.equal(first.session.state().battle.exhaustRules, 1);
        assert.equal(!!first.session.state().record.setup.challenge.intimate, intimate);
        first.session.flushPersist();
        const key = sessionKeyFor('chat-1');
        const saved = JSON.parse(storage.getItem(key));
        assert.equal(saved.setup.cardUpgradeRules, CARD_UPGRADE_RULES);
        const restored = makeSession({ ...options, chat: first.chat });
        t.after(() => restored.session.dispose());
        assert.equal(restored.session.resume().ok, true);
        assert.deepEqual(restored.session.state().battle, first.session.state().battle);
        delete saved.setup.cardUpgradeRules;
        delete saved.setup.exhaustRules;
        storage.setItem(key, JSON.stringify(saved));
        const legacyBytes = storage.getItem(key);
        const legacy = makeSession({ ...options, chat: first.chat });
        t.after(() => legacy.session.dispose());
        assert.equal(legacy.session.resume().ok, true);
        assert.equal(Object.hasOwn(legacy.session.state().record.setup, 'cardUpgradeRules'), false);
        assert.equal(Object.hasOwn(legacy.session.state().battle, 'cardUpgradeRules'), false);
        assert.equal(Object.hasOwn(legacy.session.state().record.setup, 'exhaustRules'), false);
        assert.equal(Object.hasOwn(legacy.session.state().battle, 'exhaustRules'), false);
        assert.deepEqual(legacy.session.state().battle, replayBattle(saved.setup, saved.seed, saved.actions).state);
        assert.equal(storage.getItem(key), legacyBytes);
    }
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

test('战报已落楼但回执失败：下一楼不再显示返回入口，收束不重复发送', async () => {
    const storage = memoryStorage();
    const first = makeSession({ storage, sendResult: { ok: false, reason: 'receipt-lost' } });
    try {
        await first.session.prepare(0);
        first.session.start();
        assert.ok(unfinishedCombatState(first.session));
        assert.ok(first.session.act({ type: 'escape' }).ok);
        assert.ok(unfinishedCombatState(first.session));
        const sent = await first.session.finish();
        assert.equal(sent.ok, false);
        assert.equal(first.session.state().status, 'send-failed');
        first.chat.push({ is_user: false, mes: '战斗结束，继续前行。', swipe_id: 0 });
        assert.equal(first.session.state().resumable, false);
        assert.equal(unfinishedCombatState(first.session), null);
        assert.equal(first.session.dropSuperseded(2), false);
        assert.equal((await first.session.reconcileDelivered()).ok, true);
        assert.equal(first.session.state().status, 'done');
        assert.equal(first.sent.length, 1);
        const second = makeSession({ storage, chat: first.chat });
        try {
            assert.equal(second.session.resume().ok, true);
            assert.equal(unfinishedCombatState(second.session), null);
            assert.equal(second.sent.length, 0);
        } finally { second.session.dispose(); }
    } finally { first.session.dispose(); }
});

test('战报尚未落楼的发送失败仍可返回并重试', async () => {
    const storage = memoryStorage();
    const first = makeSession({ storage, delivered: false, sendResult: { ok: false, reason: 'send-offline' } });
    try {
        await first.session.prepare(0);
        first.session.start();
        assert.ok(first.session.act({ type: 'escape' }).ok);
        assert.equal((await first.session.finish()).ok, false);
        first.session.flushPersist();
        assert.equal(first.session.state().status, 'send-failed');
        assert.equal(first.chat.length, 1);
        assert.equal(first.sent.length, 1);
        const restore = makeSession({ storage, chat: first.chat });
        try {
            assert.ok(restore.session.resume().ok);
            assert.equal(restore.session.state().status, 'send-failed');
            assert.ok(unfinishedCombatState(restore.session));
            assert.equal(restore.session.state().resumable, true);
            assert.ok((await restore.session.retrySend()).ok);
            assert.equal(restore.session.state().status, 'done');
            assert.equal(restore.chat.length, 2);
            assert.equal(restore.sent.length, 1);
            assert.ok(parseChallengeReport(restore.chat[1].mes));
            assert.equal(unfinishedCombatState(restore.session), null);
        } finally { restore.session.dispose(); }
    } finally { first.session.dispose(); }
});

for (const committedBeforeFailure of [false, true]) test(`挑战奖励${committedBeforeFailure ? '已入账但回执丢失' : '写入失败'}后刷新只补结算，不重发战报`, async () => {
    const storage = memoryStorage();
    const entries = new Map();
    const writes = [];
    let failOnce = true;
    let attempts = 0;
    const ledger = {
        read: async () => ({ ok: true, entries: [...entries.values()] }),
        append: async (batch) => {
            attempts += 1;
            for (const entry of batch) {
                const previous = entries.get(entry.id);
                if (previous) assert.deepEqual(entry, previous);
                else if (!failOnce || committedBeforeFailure) { entries.set(entry.id, entry); writes.push(entry); }
            }
            if (failOnce) { failOnce = false; return { ok: false, reason: 'receipt-lost' }; }
            return { ok: true };
        },
    };
    const first = makeSession({ storage, ledger, chat: [{ is_user: false, mes: '[igs-challenge:终面|话术|轻松|压力]', swipe_id: 0 }] });
    try {
        await first.session.prepare(0);
        assert.ok(first.session.pickChallengeAllies(['小林']).ok);
        assert.ok(first.session.autoPlay().ok);
        assert.equal(first.session.state().challengeSummary.outcome, '圆满');
        const card = first.session.state().challengeSummary.card;
        assert.ok(card);
        const failed = await first.session.finish();
        assert.equal(failed.reason, 'combat-settlement-failed');
        assert.equal(first.session.state().settlementError, 'receipt-lost');
        assert.equal(first.session.state().reportDelivered, true);
        assert.equal(first.session.state().resumable, false);
        first.session.flushPersist();
        const restore = makeSession({ storage, ledger, chat: first.chat });
        try {
            assert.ok(restore.session.resume().ok);
            assert.deepEqual(restore.session.state().challengeSummary.card, card);
            assert.ok((await restore.session.reconcileDelivered()).ok);
            assert.equal(restore.session.state().status, 'done');
            assert.equal(attempts, 2);
            assert.equal(writes.length, 1);
            assert.deepEqual(writes[0].payload.card, card);
            assert.equal(first.sent.length, 1);
            assert.equal(restore.sent.length, 0);
            assert.equal(first.chat.length, 2);
        } finally { restore.session.dispose(); }
    } finally { first.session.dispose(); }
});

test('结算前账本读取失败保留待结算记录，重试前不写账本', async () => {
    const storage = memoryStorage();
    let readFailed = true;
    let writes = 0;
    const ledger = {
        read: async () => { if (readFailed) throw new Error('read-offline'); return { ok: true, entries: [] }; },
        append: async () => { writes += 1; return { ok: true }; },
    };
    const first = makeSession({ storage, ledger });
    try {
        await first.session.prepare(0);
        first.session.start();
        first.session.act({ type: 'escape' });
        const failed = await first.session.finish();
        assert.equal(failed.reason, 'combat-settlement-failed');
        assert.equal(failed.detail, 'combat-ledger-read-failed');
        assert.equal(writes, 0);
        assert.equal(first.session.state().status, 'send-failed');
        readFailed = false;
        assert.ok((await first.session.retrySend()).ok);
        assert.equal(first.session.state().status, 'done');
        assert.equal(first.sent.length, 1);
    } finally { first.session.dispose(); }
});