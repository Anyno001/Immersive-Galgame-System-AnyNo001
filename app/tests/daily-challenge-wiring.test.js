import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSession, sessionKeyFor } from '../src/combat/session.js';
import { CARD_UPGRADE_RULES } from '../src/combat/card-upgrade.js';
import { replayBattle } from '../src/combat/engine.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { parseChallengeReport } from '../src/combat/challenge-report.js';
import { CHALLENGE_REWARD_TAG_HASH, DAILY_DECK_TAG_HASH, DAILY_LOOT_TAG_HASH, DAILY_PURGE_TAG_HASH, DAILY_UPGRADE_TAG_HASH, DAILY_WIN_TAG_HASH, replayCharacterState } from '../src/combat/ledger.js';
import { normalizeLedgerEntry } from '../src/combat/schema.js';
import { renderCombatPanelHtml } from '../src/visual/igs-ui/combat-panel-render.js';
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

test('无数据库 API 时日常选敌仍可运行，切换模型后不发布旧备战结果', async t => {
    const chat = [{ is_user: false, mes: TAG, swipe_id: 0 }];
    const entered = Promise.withResolvers(), release = Promise.withResolvers();
    const models = [];
    let model = 'fixture-before';
    const services = createCombatServices({
        global: { SillyTavern: { getContext: () => ({ chat }) } },
        getChatId: () => 'daily-no-database', getUserName: () => '我', storage: memoryStorage(),
        getReaderSettings: () => ({ combatExpansion: { enabled: true, kind: 'daily' } }),
        getAutoIllustration: () => ({ llm: { source: 'custom', endpoint: 'https://example.invalid/v1', apiKey: 'fixture', model } }),
       getChallengeSnapshot: () => ({ bars: { stamina: 100, stress: 0 }, skills: { 话术: { value: 60 } } }),
        retryDelays: [], generationMaxRounds: 0,
        request: async (prompt, llm) => {
            const [entity] = JSON.parse(prompt.user).entities;
            models.push(llm.model);
            if (models.length === 1) { entered.resolve(); await release.promise; }
            return JSON.stringify({ entities: [{ key: entity.key, value: { foe: entity.input.foes[0].key, name: '面试官' } }] });
        },
    });
    t.after(() => { release.resolve(); services.dispose(); });
    const session = services.getSession();
    const statuses = [];
    t.after(session.subscribe(state => statuses.push(state.status)));
    const first = services.autoPrepare(0);
    await Promise.race([entered.promise, first.then(r => assert.fail(`选敌未发起：${r.reason}`))]);
    model = 'fixture-after';
    release.resolve();
    assert.equal((await first).reason, 'request-stale');
    assert.equal(session.state().status, 'blocked');
    assert.deepEqual(statuses, []);
    assert.equal((await session.prepare(0)).ok, true);
    assert.equal(session.state().status, 'lobby');
    assert.deepEqual(statuses, ['lobby']);
    assert.deepEqual(models, ['fixture-before', 'fixture-after']);
});

test('托管打完一局后需完成三选一卡牌翻牌才发战报，写入领域固定牌库与胜场，战报楼被识别为已完成', async () => {
    const appended = [];
    const { session, chat, sent } = makeSession({ appended });
    await session.prepare(0);
    assert.ok(session.pickChallengeAllies(['小林']).ok);
    assert.deepEqual(session.state().challenge.allies, ['小林']);
    const auto = session.autoPlay();
    assert.ok(auto.ok, JSON.stringify(auto.reason));
    assert.equal(session.state().status, 'ended');
    assert.ok(session.state().final.text.includes('<igs-challenge-report'));
    // 胜利时必须先三选一翻牌才能发送战报。
    assert.equal((await session.finish()).reason, 'combat-flip-required');
    assert.equal(session.state().flip.status, 'ready');
    assert.equal(session.state().flip.cards.length, 3);
    assert.equal((await session.flip(0)).ok, true);
    assert.equal(session.state().flip.cards.every((c) => c.faceUp && c.slot?.kind === 'card'), true);
    assert.equal((await session.pickCard(0)).ok, true);
    const pickedCard = session.state().flip.cards.find((c) => c.chosen).slot.card;
    const finished = await session.finish();
    assert.ok(finished.ok, JSON.stringify(finished.reason));
    assert.equal(session.state().status, 'done');
    const report = parseChallengeReport(sent[0]);
    assert.ok(report);
    assert.deepEqual(report.allies, ['小林']);
    assert.equal(appended.some((entry) => entry.type === 'wound' || entry.type === 'consume'), false);
    assert.deepEqual(appended.map((e) => e.type), ['daily-deck', 'daily-win', 'daily-loot']);
    assert.equal(appended[0].anchor.tagHash, DAILY_DECK_TAG_HASH);
    assert.equal(appended[0].payload.domain, '话术');
    assert.equal(appended[0].payload.deck.length, 20);
    assert.equal(appended[0].payload.deck.some((id) => id.startsWith('ch-ally-')), false, '临时协助者牌不得写入永久固定牌库');
    assert.equal(appended[1].anchor.tagHash, DAILY_WIN_TAG_HASH);
    assert.equal(appended[2].anchor.tagHash, DAILY_LOOT_TAG_HASH);
    assert.deepEqual(appended[2].payload.card, pickedCard);
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
        assert.equal((await first.session.loadFlip()).ok, true);
        assert.equal((await first.session.flip(1)).ok, true);
        assert.equal((await first.session.pickCard(0)).ok, true);
        const card = first.session.state().flip.cards.find((c) => c.chosen).slot.card;
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
            assert.ok((await restore.session.reconcileDelivered()).ok);
            assert.equal(restore.session.state().status, 'done');
            assert.equal(attempts, 2);
            assert.deepEqual(writes.map((e) => e.type), ['daily-deck', 'daily-win', 'daily-loot']);
            assert.deepEqual(writes[2].payload.card, card);
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

test('纯日常模式无战斗档案：首次完成后按领域固定牌库、三选一纯卡牌翻牌、各领域胜场独立计数、满3胜免费删牌与升级及回退撤销', async (t) => {
    const storage = memoryStorage();
    const chat = [];
    const entries = [];
    let speechSkill = 65;
    let cookSkill = 20;
    const snapshot = () => ({ ok: true, profiles: new Map(), entries: [...entries], attributes: [], diagnostics: [] });
    const ledger = {
        read: async () => ({ ok: true, entries: [...entries] }),
        append: async (batch) => {
            for (const raw of batch) {
                const norm = normalizeLedgerEntry(raw);
                assert.equal(norm.ok, true, JSON.stringify(norm.errors));
                if (!entries.some((e) => e.id === norm.value.id)) entries.push(norm.value);
            }
            return { ok: true };
        },
        effectiveState: async ({ throughMessageId } = {}) => {
            const slice = Number.isInteger(throughMessageId) ? chat.slice(0, throughMessageId + 1) : chat;
            return replayCharacterState(snapshot(), slice, { userName: '我' });
        },
    };
    const makeDaily = () => createCombatSession({
        chat: () => chat, getChatId: () => 'chat-daily-fixed', userName: '我', storage,
        kinds: { combat: false, challenge: true },
        request: async () => { throw new Error('no llm'); }, llm: { source: 'tavern' }, now: () => 1,
        ledger,
        tables: { append: async () => { throw new Error('纯日常不写战斗档案'); } },
        send: async (text) => { chat.push({ is_user: true, mes: text, swipe_id: 0 }); return { ok: true, messageId: chat.length - 1 }; },
        challenge: { state: () => ({ bars: { stamina: 100, stress: 0 }, skills: { 话术: { value: speechSkill }, 烹饪: { value: cookSkill } }, present: ['小林'], favors: { 小林: 40 } }), allowEscape: true, stake: 'normal' },
        retryDelays: [],
    });

    const playOne = async (tag, { escape = false, flipPos = 0, acceptCard = true, purgeIdx = null, upgradeIdx = null } = {}) => {
        const floorIdx = chat.length;
        chat.push({ is_user: false, mes: `剧情推进。\n${tag}`, swipe_id: 0 });
        const session = makeDaily();
        t.after(() => session.dispose());
        assert.equal((await session.prepare(floorIdx)).ok, true);
        const setupBefore = session.state().challengeSetup;
        if (escape) {
            assert.equal(session.start().ok, true);
            assert.equal(session.act({ type: 'escape' }).ok, true);
            assert.equal((await session.finish()).ok, true);
            return { setupBefore, flip: null };
        }
        assert.equal(session.pickChallengeAllies(['小林']).ok, true);
        assert.equal(session.autoPlay().ok, true);
        assert.equal((await session.loadFlip()).ok, true);
        const flipBefore = session.state().flip;
        assert.equal(flipBefore.status, 'ready');
        assert.equal(flipBefore.cards.length, 3);
        assert.equal((await session.flip(flipPos)).ok, true);
        const afterFlip = session.state().flip;
        assert.equal(afterFlip.cards.every((c) => c.faceUp && c.slot?.kind === 'card'), true, '日常战利品必须三槽均为卡牌');
        const names = new Set(afterFlip.cards.map((c) => c.slot.card.name));
        assert.equal(names.size, 3, '三选一卡牌名称应互不相同');
        assert.equal((await session.pickCard(acceptCard ? 0 : 'skip')).ok, true);
        let purgedCopy = null;
        let upgradedCopy = null;
        if (purgeIdx !== null) {
            const p = session.state().flip.purge;
            assert.equal(p?.available, true);
            assert.equal(p.cost, 0, '日常删卡必须免费');
            // 校验渲染文案显示「免费」而非「消耗0积分」。
            const html = renderCombatPanelHtml({ status: 'ended', challenge: true, flip: session.state().flip, purgeOpen: true, purgeFocus: p.cards[purgeIdx].copyId,
                battle: { allies: [], enemies: [], hand: [], items: [], turn: 1 }, end: { outcome: 'victory', label: '通过', allies: [], turn: 1 } });
            assert.ok(html.includes('删一张牌（免费）'));
            assert.ok(html.includes('删除这张（免费）'));
            assert.equal(html.includes('消耗0积分'), false);
            purgedCopy = p.cards[purgeIdx].copyId;
            assert.equal((await session.pickPurge(purgedCopy)).ok, true);
        }
        if (upgradeIdx !== null) {
            const u = session.state().flip.upgrade;
            assert.equal(u?.available, true);
            upgradedCopy = u.cards[upgradeIdx].copyId;
            if (purgedCopy) assert.equal((await session.pickUpgrade(purgedCopy)).reason, 'combat-card-upgrade-purge-conflict');
            assert.equal((await session.pickUpgrade(upgradedCopy)).ok, true);
        }
        assert.equal((await session.finish()).ok, true);
        return { setupBefore, flip: session.state().flip, purgedCopy, upgradedCopy };
    };

    // 1. 话术第 1 场：完成后固定 20 张牌库 + 计 1 胜 + 翻牌收下第 21 张。
    await playOne('[igs-challenge:初面|话术|轻松|压力]', { flipPos: 0, acceptCard: true });
    let eff = await ledger.effectiveState();
    assert.equal(eff.dailyDecks.get('话术').wins, 1);
    assert.equal(eff.dailyDecks.get('话术').deck.length, 21);
    const fixedSnapshot = [...eff.dailyDecks.get('话术').deck];

    // 2. 话术技能值剧变后打第 2 场：仍沿用已固定的 21 张牌库，不重算；放弃新卡后张数仍为 21、胜场变为 2。
    speechSkill = 5;
    const second = await playOne('[igs-challenge:复面|话术|轻松|压力]', { flipPos: 1, acceptCard: false });
    assert.deepEqual(second.setupBefore.units[0].deck.map((d) => (typeof d === 'string' ? d : d.cardId)), fixedSnapshot);
    eff = await ledger.effectiveState();
    assert.equal(eff.dailyDecks.get('话术').wins, 2);
    assert.equal(eff.dailyDecks.get('话术').deck.length, 21);

    // 3. 换到「烹饪」领域打第 1 场（中途撤退）：同样固定 20 张烹饪牌库，烹饪胜场为 0，不影响话术胜场 2。
    await playOne('[igs-challenge:试菜|烹饪|轻松|压力]', { escape: true });
    eff = await ledger.effectiveState();
    assert.equal(eff.dailyDecks.get('烹饪').wins, 0);
    assert.equal(eff.dailyDecks.get('烹饪').deck.length, 20);
    assert.equal(eff.dailyDecks.get('话术').wins, 2);

    // 4. 烹饪赢 1 场：烹饪胜场独立变为 1、牌库 21 张；话术胜场仍为 2。
    await playOne('[igs-challenge:厨艺赛|烹饪|轻松|压力]', { flipPos: 2, acceptCard: true });
    eff = await ledger.effectiveState();
    assert.equal(eff.dailyDecks.get('烹饪').wins, 1);
    assert.equal(eff.dailyDecks.get('烹饪').deck.length, 21);
    assert.equal(eff.dailyDecks.get('话术').wins, 2);

    // 5. 话术赢第 3 场（按领域独立计满 3 胜触发免费删牌与免费升级；此前第 1、2 胜未触发，烹饪 1 胜互不干扰）。
    const third = await playOne('[igs-challenge:终面|话术|轻松|压力]', { flipPos: 0, acceptCard: true, purgeIdx: 0, upgradeIdx: 1 });
    eff = await ledger.effectiveState();
    const speechAfter3 = eff.dailyDecks.get('话术');
    assert.equal(speechAfter3.wins, 3);
    assert.equal(speechAfter3.purges, 1);
    assert.equal(speechAfter3.deckEntries.some((r) => r.copyId === third.purgedCopy), false, '删掉的副本应永久移除');
    assert.equal(speechAfter3.deckEntries.find((r) => r.copyId === third.upgradedCopy)?.upgraded, true, '升级的副本应永久保持升级');
    assert.equal(speechAfter3.deck.length, 21, '原21张 + 翻牌1张 - 删牌1张 = 21张');
    assert.equal(eff.dailyDecks.get('烹饪').wins, 1, '话术满3胜不影响烹饪计数');

    // 6. 第 4 场话术开战读到已删牌+已升级的固定牌库。
    const fourthFloor = chat.length;
    chat.push({ is_user: false, mes: '第四场。\n[igs-challenge:加面|话术|轻松|压力]', swipe_id: 0 });
    const fourth = makeDaily();
    t.after(() => fourth.dispose());
    assert.equal((await fourth.prepare(fourthFloor)).ok, true);
    const fourthDeck = fourth.state().challengeSetup.units[0].deck;
    assert.equal(fourthDeck.some((d) => d.copyId === third.purgedCopy), false);
    assert.equal(fourthDeck.find((d) => d.copyId === third.upgradedCopy)?.upgraded, true);

    // 7. 回退第 3 场战报楼（swipe 变化）：话术胜场回退为 2、删牌与升级全部撤销。
    const thirdReportFloor = fourthFloor - 1;
    chat[thirdReportFloor] = { ...chat[thirdReportFloor], swipe_id: 1 };
    const rewound = await ledger.effectiveState();
    assert.equal(rewound.dailyDecks.get('话术').wins, 2);
    assert.equal(rewound.dailyDecks.get('话术').purges, 0);
    assert.equal(rewound.dailyDecks.get('话术').deckEntries.some((r) => r.copyId === third.purgedCopy), true);
    assert.equal(rewound.dailyDecks.get('话术').deckEntries.find((r) => r.copyId === third.upgradedCopy)?.upgraded, false);
});

test('日常挑战：敌人池缝合与战斗一致、准备期先拼合模板再由LLM按世界观起名（含首战初始牌与3张战利品）、盲选可放弃', async (t) => {
    const { createCombatLedger } = await import('../src/combat/ledger.js');
    const { createBattle } = await import('../src/combat/engine.js');
    const { cardView } = await import('../src/combat/battle-state.js');
    const { domainSkillMultiplier, DOMAIN_CARD_POOLS } = await import('../src/combat/challenge-cards.js');
    const { enemyPool } = await import('../src/combat/enemies/pool.js');
    const { attributeScalingTip, attributeNumberOptions } = await import('../src/visual/igs-ui/combat-card-art.js');
    const { challengeLobbyView } = await import('../src/visual/igs-ui/combat-panel-model.js');
    const { renderCombatPanelHtml } = await import('../src/visual/igs-ui/combat-panel-render.js');

    // 1. 专精属性加减值曲线（50 分基准 1.00×，0 分 0.70×，100 分 1.50×）
    assert.equal(domainSkillMultiplier(0), 0.7);
    assert.equal(domainSkillMultiplier(25), 0.85);
    assert.equal(domainSkillMultiplier(50), 1);
    assert.equal(domainSkillMultiplier(80), 1.3);
    assert.equal(domainSkillMultiplier(100), 1.5);

    // 2. 完整准备期：先由程序拼合模板（敌人池 + 首次初始牌 + 3 张领域战利品牌），再由单次 LLM 请求起名与写来历
    const chat = [];
    const ledgerRows = [];
    const tables = {
        read: () => ({ ok: true, missing: [], diagnostics: [], profile: [], ledger: ledgerRows.slice(), attribute: [] }),
        append: async (kind, records) => {
            const written = [];
            for (const rec of records) {
                if (kind === 'ledger' && !ledgerRows.some((r) => r.id === rec.id)) {
                    ledgerRows.push(JSON.parse(JSON.stringify(rec)));
                    written.push(rec.id);
                }
            }
            return { ok: true, written, present: [], rejected: [], pending: [] };
        },
    };
    const ledger = createCombatLedger({ tables, chat: () => chat, chatId: 'daily-llm-stitch', userName: '主角' });
    const llmRequests = [];
    let currentSkill = 90; // 烹饪 90 -> 1.40× (+40%)
    const makeDaily = () => createCombatSession({
        chat: () => chat, getChatId: () => 'daily-llm-stitch', userName: '主角', ledger,
        storage: memoryStorage(), random: () => 0.2,
        kinds: { combat: false, challenge: true },
        challenge: {
            state: () => ({ bars: { stamina: 100, stress: 0 }, skills: { 烹饪: { value: currentSkill }, 话术: { value: 10 } }, present: [], favors: {} }),
            allowEscape: true,
        },
        llm: { source: 'custom', endpoint: 'https://example.invalid/v1', apiKey: 'k', model: 'm' },
        request: async (prompt) => {
            const [entity] = JSON.parse(prompt.user).entities;
            llmRequests.push(entity);
            assert.ok(Array.isArray(entity.input.pool) && entity.input.pool.length >= 2, '准备请求必须携带 enemyPool');
            assert.ok(Array.isArray(entity.input.lootCards) && entity.input.lootCards.length === 3, '准备请求必须携带程序先拼合的 3 张战利品牌');
            assert.ok(entity.input.lootCards.every((c) => typeof c.summary === 'string' && c.summary.includes('费·')), '每张战利品牌必须先给出拼合后的效果摘要');
            assert.ok(Array.isArray(entity.input.styleSamples) && entity.input.styleSamples.length > 0);
            const pickCode = entity.input.pool[1].code;
            const deckCards = (entity.input.deckCards || []).map((c, idx) => ({
                id: c.id,
                name: `星厨秘技${idx + 1}`,
                origin: `在星港酒馆悟出的第${idx + 1}手`,
            }));
            const lootCards = entity.input.lootCards.map((c) => ({
                index: c.index,
                name: `御膳灵感${c.index + 1}`,
                origin: `通过这场厨艺试炼领悟的第${c.index + 1}招`,
            }));
            return JSON.stringify({
                entities: [{
                    key: entity.key,
                    value: { foe: 'judge', name: '星际美食评审', code: pickCode, deckCards, lootCards },
                }],
            });
        },
        send: async (text) => { chat.push({ is_user: true, mes: text, swipe_id: 0 }); return { ok: true, messageId: chat.length - 1 }; },
        now: () => 5000 + chat.length,
    });

    // 第一场（烹饪 90）：首次打烹饪，准备请求应携带 deckCards + lootCards + enemyPool
    chat.push({ is_user: false, mes: '星港厨艺赛。\n[igs-challenge:星港厨艺赛|烹饪|轻松|压力]', swipe_id: 0 });
    const s1 = makeDaily();
    t.after(() => s1.dispose());
    assert.equal((await s1.prepare(0)).ok, true);
    assert.equal(llmRequests.length, 1, '选敌、初始牌命名与3张战利品命名合并为单次准备请求');
    assert.ok(llmRequests[0].input.deckCards.length >= 5, '首次挑战该领域应先拼合初始领域牌并交给LLM起名');
    assert.ok(llmRequests[0].input.deckCards.every((c) => typeof c.summary === 'string' && c.summary.includes('费·')));
    const setup1 = s1.state().challengeSetup;
    const hero1 = setup1.units[0];
    const foe1 = setup1.units.find((u) => u.side === 'enemy');
    assert.equal(foe1.name, '星际美食评审');
    assert.ok(foe1.template && ['original', 'stitched'].includes(foe1.template.model), '日常敌人须来自与战斗一致的 enemyPool 模板/缝合体系');
    assert.deepEqual(hero1.domainScaling, { domain: '烹饪', skillValue: 90, multiplier: 1.4 });
    // 验证初始领域牌已套用 LLM 按世界观生成的名称与来历
    assert.equal(hero1.catalog['ch-push'].name, '星厨秘技1');
    assert.equal(hero1.catalog['ch-push'].flavor, '在星港酒馆悟出的第1手');
    // 验证大厅 UI 与渲染层展示专精加值徽章
    const lobby1 = challengeLobbyView(s1.state());
    assert.equal(lobby1.skillValue, 90);
    assert.equal(lobby1.domainMultiplier, 1.4);
    const lobbyHtml1 = renderCombatPanelHtml({ status: 'lobby', lobby: lobby1 });
    assert.ok(lobbyHtml1.includes('烹饪 90 (+40%)'), lobbyHtml1);
    // 验证引擎内实时专精加值（伤害/格挡放大 1.4×）与提示文案
    const battle1 = createBattle({ rulesVersion: 7, cardUpgradeRules: 1, exhaustRules: 1, ...setup1 }, 123);
    assert.equal(battle1.ok, true, JSON.stringify(battle1.error));
    const strikeInst1 = Object.keys(battle1.state.cards).find((k) => battle1.state.cards[k].cardId === 'basic-strike');
    const strikeView1 = cardView(battle1.state, strikeInst1);
    assert.equal(strikeView1.effects[0].amount, Math.round(hero1.catalog['basic-strike'].effects[0].amount * 1.4));
    assert.equal(strikeView1.attributeScaling[0].ability, '烹饪');
    assert.equal(strikeView1.attributeScaling[0].skillValue, 90);
    assert.ok(attributeScalingTip(strikeView1.attributeScaling[0]).includes('烹饪(90) ×1.4'));
    assert.equal(attributeNumberOptions(strikeView1).numberPart({ path: 'effects.0.amount' }).mark, 'up');

    // 开打托管胜利 -> 盲翻 1 张 -> 确认带 LLM 世界观卡名与来历 -> 选择「放弃(skip)」不加入牌库但仍固定初始牌库与计胜
    assert.equal(s1.autoPlay().ok, true);
    assert.equal((await s1.loadFlip()).ok, true);
    assert.equal(s1.state().flip.cards.length, 3);
    assert.equal((await s1.flip(0)).ok, true);
    const chosenSlot = s1.state().flip.cards.find((c) => c.chosen).slot;
    assert.match(chosenSlot.name, /^御膳灵感[123]$/);
    assert.match(chosenSlot.origin, /^通过这场厨艺试炼领悟的第[123]招$/);
    assert.equal(chosenSlot.card.flavor, chosenSlot.origin);
    // 盲选后选择放弃
    assert.equal((await s1.pickCard('skip')).ok, true);
    assert.equal((await s1.finish()).ok, true);
    const eff1 = await ledger.effectiveState();
    const cookDeck = eff1.dailyDecks.get('烹饪');
    assert.equal(cookDeck.wins, 1);
    assert.equal(cookDeck.deck.length, 20, '盲选后放弃战利品时牌库保持 20 张');
    assert.equal(cookDeck.catalog.get('ch-push').name, '星厨秘技1', '首次固定的领域牌库永久保存 LLM 世界观卡名');
    assert.equal(cookDeck.catalog.get('ch-push').flavor, '在星港酒馆悟出的第1手');

    // 第二场（同领域烹饪，但技能降到 10 验证减值 0.76×）：已固定牌库不再请求 deckCards，但仍复用固定牌库并对旧牌实时减值！
    currentSkill = 10; // 烹饪 10 -> 0.76× (-24%)
    const floor2 = chat.length;
    chat.push({ is_user: false, mes: '第二场厨艺考。\n[igs-challenge:第二场厨艺考|烹饪|轻松|压力]', swipe_id: 0 });
    const s2 = makeDaily();
    t.after(() => s2.dispose());
    assert.equal((await s2.prepare(floor2)).ok, true);
    assert.equal(llmRequests.length, 2);
    assert.equal(llmRequests[1].input.deckCards, undefined, '该领域已固定牌库后不再重复请求初始牌起名');
    assert.equal(llmRequests[1].input.lootCards.length, 3, '每场仍为新战利品3张卡生成世界观名称与来历');
    const setup2 = s2.state().challengeSetup;
    assert.equal(setup2.units[0].catalog['ch-push'].name, '星厨秘技1', '第二场继续沿用已固定的世界观牌名');
    assert.deepEqual(setup2.units[0].domainScaling, { domain: '烹饪', skillValue: 10, multiplier: 0.76 });
    const battle2 = createBattle({ rulesVersion: 7, cardUpgradeRules: 1, exhaustRules: 1, ...setup2 }, 456);
    assert.equal(battle2.ok, true);
    const strikeInst2 = Object.keys(battle2.state.cards).find((k) => battle2.state.cards[k].cardId === 'basic-strike');
    const strikeView2 = cardView(battle2.state, strikeInst2);
    assert.equal(strikeView2.effects[0].amount, Math.round(setup2.units[0].catalog['basic-strike'].effects[0].amount * 0.76));
    assert.equal(attributeNumberOptions(strikeView2).numberPart({ path: 'effects.0.amount' }).mark, 'down');
    const lobbyHtml2 = renderCombatPanelHtml({ status: 'lobby', lobby: challengeLobbyView(s2.state()) });
    assert.ok(lobbyHtml2.includes('烹饪 10 (-24%)'), lobbyHtml2);
    // 领域池非空且各领域拥有独立专属池
    assert.ok(DOMAIN_CARD_POOLS.烹饪.length >= 10 && DOMAIN_CARD_POOLS.话术.length >= 10);
    assert.notDeepEqual(DOMAIN_CARD_POOLS.烹饪, DOMAIN_CARD_POOLS.话术);
});

test('回归：日常挑战战前对阵显示对方默认立绘；敌人按 ASCII ID 从 enemyPool 物化且重平衡后满足各档血量与克制起手稀有度', async () => {
    const { buildChallengeSetup } = await import('../src/combat/challenge-setup.js');
    const { challengeLobbyView } = await import('../src/visual/igs-ui/combat-panel-model.js');
    const { renderCombatPanelHtml } = await import('../src/visual/igs-ui/combat-panel-render.js');

    const built = buildChallengeSetup({
        start: { event: '应对苏曼珠的遗产代管逼宫', domain: '感知', tier: '普通', counterpart: '苏曼珠' },
        state: { bars: { stamina: 80, stress: 20 }, skills: { 感知: { value: 60 } } },
        user: { name: '陈默' },
        enemySeed: 'sumanzhu-1',
        deckSeed: 'sumanzhu-1',
    });
    assert.equal(built.ok, true);
    const foe = built.setup.units.find((u) => u.side === 'enemy');
    assert.equal(foe.name, '苏曼珠');
    assert.ok(foe.template, '仅传 enemySeed 时应成功物化 enemyPool 模板，不得因中文 ID 回退到弱版旧难关');
    assert.ok(foe.maxHp >= 85, `普通档敌人血量应 ≥ 85，实际 ${foe.maxHp}`);
    // 技能 60 的起手牌组保持克制（避免全套 rare + 泛滥回血与专精倍率双重膨胀）
    const heroCatalog = built.setup.units[0].catalog;
    assert.equal(heroCatalog['ch-push'].rarity, 'common');
    assert.equal(heroCatalog['ch-hold'].rarity, 'common');
    assert.equal(heroCatalog['ch-combo'].rarity, 'uncommon');
    assert.equal(heroCatalog['ch-life-2'].effects.some((e) => e.op === 'heal'), false);

    // 战前对阵传入对方默认立绘 URL 后必须渲染 <img>，不再硬编码空串退回剪影
    const lobby = challengeLobbyView({ challenge: built.setup.challenge, challengeSetup: built.setup, challengeCandidates: [] });
    const html = renderCombatPanelHtml({
        status: 'lobby',
        lobby,
        portraits: { 陈默: 'https://example.invalid/chenmo.png', 苏曼珠: 'https://example.invalid/sumanzhu.png' },
    });
    assert.ok(html.includes('https://example.invalid/chenmo.png'), '主角立绘应正常显示');
    assert.ok(html.includes('https://example.invalid/sumanzhu.png'), '日常挑战对方有默认立绘时必须显示立绘');

    // 各档血量下限校验
    const easy = buildChallengeSetup({ start: { event: '小测', domain: '话术', tier: '轻松' }, state: { bars: { stamina: 80, stress: 20 }, skills: { 话术: { value: 50 } } }, user: { name: '陈默' }, enemySeed: 'e-1', deckSeed: 'e-1' });
    const hard = buildChallengeSetup({ start: { event: '大考', domain: '话术', tier: '艰难' }, state: { bars: { stamina: 80, stress: 20 }, skills: { 话术: { value: 50 } } }, user: { name: '陈默' }, enemySeed: 'h-1', deckSeed: 'h-1' });
    assert.ok(easy.setup.units.find((u) => u.side === 'enemy').maxHp >= 50);
    assert.ok(hard.setup.units.find((u) => u.side === 'enemy').maxHp >= 130);
});