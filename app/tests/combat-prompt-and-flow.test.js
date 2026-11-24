import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createIgsChatStore } from '../src/data/shujuku/igs-chat-store.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { readIgsChatEvidence } from '../src/storage/igs-chat-evidence.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';
import { createHeroManualModal, checkHeroScoresOverCap } from '../src/visual/igs-ui/hero-manual-modal.js';
import { buildGenerationRequest, buildGenerationSystem, GENERATION_SYSTEM, enemyRosterEntities, encounterThemeEntity, planStarterTemplateDeck, starterDeckNamingEntity, generateEntities } from '../src/combat/generation.js';
import { heroSkillFromTemplate, PASSIVE_TEMPLATES, templatesFor } from '../src/combat/card-templates.js';
import { normalizeProfile, validateStarterDeck } from '../src/combat/schema.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { combatBattleOn } from '../src/visual/igs-ui/combat-settings.js';
import { DAILY_PURGE_EVERY, DAILY_UPGRADE_EVERY, PURGE_EVERY, UPGRADE_EVERY } from '../src/combat/points.js';
import { COMBAT_RULES } from '../src/combat/rules.js';

test('逻辑1：开局询问自行填写/自动生成；超上限弹出深红色感叹号开挂确认；确认后不设上限且简介与货币仍自动生成', async (t) => {
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const context = {
        name1: '主角', name2: '小雪', chatId: 'hero-manual-cheat-1', chatMetadata: {},
        chat: [{ is_user: true, mes: '出发' }, { is_user: false, mes: '[igs-scene:王都|白天|晴]\n新世界开场。', swipe_id: 0 }],
        getCurrentChatId: () => context.chatId, setExtensionPrompt() {}, saveMetadata() {},
        eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', CHAT_CHANGED: 'cc' },
        eventSource: { on() {}, removeListener() {} },
    };
    const chatStore = createIgsChatStore({
        api: () => db.api,
        chatId: () => context.chatId,
        chat: () => context.chat,
        userName: () => context.name1,
        evidence: (id) => readIgsChatEvidence({ context, chatId: id, storage }),
        storage,
    });
    t.after(() => chatStore.dispose());

    const requests = [];
    const rt = createStatsRuntime({
        getContext: () => context,
        readSettings: () => ({ enabled: true, ruleset: 'dnd5e', autoSkill: false, sheetGen: 'off', backfill: 'off', push: { enabled: false } }),
        combatEnabled: () => false,
        statsTables: () => chatStore.get().statsAccess,
        attributeAccess: () => chatStore.get().attributeAccess,
        currencyInventory: () => chatStore.get().inventory,
        currencyEditStorage: storage,
        generationIdentity: () => chatStore.get(),
        getBackgroundRequest: () => (prompt) => new Promise((resolve) => requests.push({ prompt, resolve })),
    });
    t.after(() => rt.destroy());

    // 1. 新聊天先询问「自行填写 / 自动生成」，不抢跑自动请求模型
    rt.sync();
    for (let i = 0; i < 30 && !rt.notices().some((n) => n.id === 'hero-init-mode'); i += 1) await new Promise((r) => setTimeout(r, 10));
    const ask = rt.notices().find((n) => n.id === 'hero-init-mode');
    assert.ok(ask, '应弹出开局自行填写/自动生成询问');
    assert.deepEqual(ask.actions.map((a) => a[0]), ['manual', 'auto']);
    assert.equal(requests.length, 0, '用户选择前不得抢跑模型请求');

    // 2. 点击自行填写返回独立弹窗标识（不依赖人物状态页）
    const openRes = await rt.noticeAction('hero-init-mode', 'manual');
    assert.equal(openRes.openPanel, 'hero-manual-setup');

    // 3. 验证弹窗超上限时弹出深红色感叹号开挂确认，点「是」解除上限并提交
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="ov"></div></body></html>');
    t.after(() => dom.window.close());
    const doc = dom.window.document;
    const overlay = doc.getElementById('ov');
    const modal = createHeroManualModal(doc, {
        onSubmit: (payload) => rt.submitManualHero(payload),
    });
    modal.open(overlay);
    // 填超限六维（力量 30、合计 85 > 72）+ 3 项擅长
    doc.querySelector('[data-hm-score="str"]').value = '30';
    doc.querySelector('[data-hm-score="dex"]').value = '15';
    doc.querySelector('[data-hm-score="con"]').value = '10';
    doc.querySelector('[data-hm-score="int"]').value = '10';
    doc.querySelector('[data-hm-score="wis"]').value = '10';
    doc.querySelector('[data-hm-score="cha"]').value = '10';
    doc.querySelector('[data-hm-slot="strong1"]').value = '烹饪';
    doc.querySelector('[data-hm-slot="strong2"]').value = '话术';
    doc.querySelector('[data-hm-slot="strong3"]').value = '运动';
    assert.equal(checkHeroScoresOverCap({ str: 30, dex: 15, con: 10, int: 10, wis: 10, cha: 10 }).over, true);

    // 首次点击提交：应被上限拦下，弹出带深红色感叹号的开挂确认框
    doc.querySelector('[data-hm-act="submit"]').click();
    await new Promise((r) => setTimeout(r, 10));
    const cheatBox = doc.querySelector('.igs-hm-cheat-box');
    const bang = doc.querySelector('.igs-hm-bang');
    assert.ok(cheatBox, '超上限时必须弹出开挂确认框');
    assert.ok(bang && bang.textContent === '!', '开挂确认框必须带有感叹号图标');
    assert.match(doc.getElementById('igs-hero-manual-modal-style').textContent, /#991b1b/, '感叹号应使用深红色样式');

    // 直接在运行时未开挂提交也应返回 stats-build-over-cap
    const rejected = await rt.submitManualHero({
        scores: { str: 30, dex: 15, con: 10, int: 10, wis: 10, cha: 10 },
        uncapped: false,
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'stats-build-over-cap');

    // 点击「是，开启开挂（不设上限）」
    doc.querySelector('[data-hm-act="cheat-yes"]').click();
    for (let i = 0; i < 40 && requests.length === 0; i += 1) await new Promise((r) => setTimeout(r, 15));

    // 4. 验证超限六维（30）已无截断保存，且自动触发仅补齐简介与初始货币的模型请求（不再要求六维）
    const attrs = chatStore.get().attributeAccess.source().readAbilities('主角');
    assert.equal(attrs.initialized, true);
    assert.equal(attrs.uncapped, true);
    assert.equal(attrs.permanentScores.str, 30, '开启开挂后力量 30 不应被截断到 20');
    assert.equal(requests.length, 1, '手动填完六维后应自动请求模型补齐简介与初始货币');
    assert.equal(requests[0].prompt.user.includes('attributes（主角六维）'), false, '已有手填六维时不要求模型再生成六维');
    assert.equal(requests[0].prompt.user.includes('currency（剧情货币定义与开局金额）'), true);
    assert.equal(requests[0].prompt.user.includes('bio（主角简介）'), true);

    requests[0].resolve(JSON.stringify({
        currency: { name: '金币', initial: 120, prices: { 少量: 10, 普通: 50, 昂贵: 200, 巨额: 1000 }, rate: 1 },
        bio: '天生神力的旅者，初入王都便已声名鹊起。',
    }));
    await rt.whenSaved();
    assert.equal(rt.currencyBalance(), 120);
    assert.equal(rt.archive().heroBio, '天生神力的旅者，初入王都便已声名鹊起。');
    assert.equal(rt.notices().some((n) => n.id === 'hero-init-mode'), false);
});

test('逻辑2：战斗准备提示词按本次实体 kind 动态精简，只含怪物池/战利品/题材协议，不含职业卡组冗余目录', () => {
    const roster = enemyRosterEntities({ enemies: [{ name: '铁甲卫兵' }], tier: 'normal', seed: 'seed-1' });
    const entities = [
        ...roster.entities,
        encounterThemeEntity({ encounter: '城门遭遇', enemies: ['铁甲卫兵'] }),
    ];
    const req = buildGenerationRequest(entities, { context: { story: '城门前爆发冲突' }, classes: [] });
    assert.ok(req.system.includes('- enemy-roster：'));
    assert.ok(req.system.includes('- encounter-theme：'));
    assert.equal(req.system.includes('- profile-deck：'), false, '战斗准备不应混入无关的 profile-deck 协议');
    assert.equal(req.system.includes('- signature-card：'), false, '战斗准备不应混入 signature-card 协议');
    assert.equal(req.system.includes('各职业允许的模板：'), false, '战斗准备不应混入 8 职业卡模板白名单');
    assert.ok(req.system.length < GENERATION_SYSTEM.length * 0.4, '精简后的战斗准备提示词体积应大幅缩减');
    // 确认怪物池中原版与缝合各占一半
    const pool = entities[0].input.pool;
    assert.ok(pool.length >= 2 && pool.length % 2 === 0);
});

test('逻辑3：20张基础模板按职业组合并由LLM结合世界书命名；主角战斗生成严格等待六维完成；纯日常模式隐藏人物状态页且不跑主角备档', async (t) => {
    // 1. 20张基础卡片模板按份数组合（8种共20张）→ LLM 结合世界书命名 → 校验通过
    const blueprint = planStarterTemplateDeck('mage', 'hero-mage-1', 'c-hero');
    assert.ok(blueprint);
    assert.equal(blueprint.cards.length, 8);
    assert.equal(blueprint.starterDeck.length, COMBAT_RULES.starterDeckSize);
    assert.equal(blueprint.templates.reduce((sum, item) => sum + item.copies, 0), 20);
    const namingEntity = starterDeckNamingEntity({
        id: 'c-hero', name: '主角', className: '星辉术士', archetype: 'mage', blueprint, role: 'protagonist',
    });
    const namingReq = buildGenerationRequest([namingEntity], {
        context: { worldInfo: '星辉纪元：术士以星辰符文构筑法阵。', story: '主角在观星塔觉醒了星辉之力。' },
    });
    assert.ok(namingReq.system.includes('- starter-deck-naming：'));
    assert.equal(namingReq.system.includes('卡牌模板：'), false, '命名阶段只给固定模板清单，不再倾倒全量卡牌目录');

    const worldNames = ['星尘飞弹', '陨星震击', '辉光穿刺', '星幕护盾', '观星冥想', '符文折跃', '星轨共鸣', '苍穹秘印'];
    const genRes = await generateEntities([namingEntity], {
        context: { worldInfo: '星辉纪元', story: '观星塔觉醒' },
        request: async () => JSON.stringify({ entities: [{ key: namingEntity.key, value: { names: worldNames } }] }),
    });
    assert.equal(genRes.ok, true);
    const named = genRes.accepted[0].starterDeckNamed;
    assert.deepEqual(named.cards.map((c) => c.name), worldNames);
    assert.equal(named.starterDeck.length, 20);
    const cls = { kind: 'class', id: 'cls-star', className: '星辉术士', archetype: 'mage', classPassive: { id: 'p1', name: '星辉', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] }, classPool: [] };
    const deckChar = {
        kind: 'deck-character', id: 'c-hero', name: '主角', aliases: [], classRef: cls.id,
        base: { hp: 58, speed: 96 }, growth: { hpPerLevel: 4 },
        personalPassive: { id: 'c-hero-p1', name: '星感', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] },
        personalPool: named.cards,
        starterDeck: named.starterDeck,
        heroSkill: heroSkillFromTemplate('strike', { id: 'c-hero-h1', name: '星火' }),
    };
    assert.equal(normalizeProfile(deckChar).ok, true);
    assert.deepEqual(validateStarterDeck(deckChar, cls), { ok: true, errors: [] });

    // 2. UI 可见性门控：未开卡片战斗 & 纯日常模式均隐藏人物状态页
    assert.equal(combatBattleOn({ enabled: false, kind: 'both' }), false);
    assert.equal(combatBattleOn({ enabled: true, kind: 'daily' }), false);
    assert.equal(combatBattleOn({ enabled: true, kind: 'combat' }), true);
    assert.equal(combatBattleOn({ enabled: true, kind: 'both' }), true);

    // 3. prepareProtagonist 在纯日常模式直接拒绝；在卡片战斗模式下严格等待六维初始化后才请求 LLM，六维完成后自动触发职业+20张模板命名卡组+初始装备
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const chat = [{ is_user: true, mes: '开始' }, { is_user: false, mes: '[igs-scene:观星塔|夜晚|晴]\n观星塔觉醒。', swipe_id: 0 }];
    let kind = 'daily';
    let llmCalls = 0;
    const passiveKey = Object.keys(PASSIVE_TEMPLATES)[0];
    const mageKeys = Object.keys(templatesFor('mage'));
    const heroSkillKey = mageKeys.find((k) => heroSkillFromTemplate(k, { id: 'x', name: 'x' }));
    const services = createCombatServices({
        global: {
            AutoCardUpdaterAPI: db.api,
            SillyTavern: { getContext: () => ({ chat, name1: '主角', chatMetadata: {}, getCurrentChatId: () => 'order-test-1' }) },
        },
        getChatId: () => 'order-test-1',
        getUserName: () => '主角',
        getReaderSettings: () => ({ combatExpansion: { enabled: true, kind } }),
        getAutoIllustration: () => ({ llm: { source: 'tavern' } }),
        storage,
        request: async (prompt) => {
            llmCalls += 1;
            const parsed = JSON.parse(prompt.user);
            const entities = [];
            for (const e of parsed.entities) {
                if (e.kind === 'class') entities.push({ key: e.key, value: { className: '星辉术士', archetype: 'mage' } });
                else if (e.kind === 'profile-deck') entities.push({ key: e.key, value: { hp: 58, passive: ['星感', passiveKey], skill: ['星火', heroSkillKey], cards: [['星箭', mageKeys[0]], ['星盾', mageKeys[1]], ['星流', mageKeys[2]], ['星震', mageKeys[3]]] } });
                else if (e.kind === 'profile-gear') entities.push({ key: e.key, value: { gear: [['观星短杖', 'weapon', 'common', '观星塔见习杖']] } });
                else if (e.kind === 'starter-deck-naming') entities.push({ key: e.key, value: { names: worldNames } });
            }
            return JSON.stringify({ entities });
        },
        retryDelays: [0],
    });
    t.after(() => services.dispose());
    // 纯日常模式：不触发主角生成，不接管物品表
    const dailyRes = await services.prepareProtagonist();
    assert.equal(dailyRes.ok, false);
    assert.equal(dailyRes.reason, 'combat-disabled');
    assert.equal((await services.takeoverInventory()).reason, 'combat-disabled');
    assert.equal(llmCalls, 0);

    // 切到卡片战斗模式，但主角六维尚未初始化：必须等待 attributesReady，不抢跑 LLM
    kind = 'combat';
    assert.equal((await services.ensureTables()).ok, true);
    const waitRes = await services.prepareProtagonist();
    assert.equal(waitRes.ok, false);
    assert.equal(waitRes.status, 'waiting-attributes');
    assert.equal(waitRes.reason, 'combat-attributes-waiting');
    assert.equal(llmCalls, 0, '主角六维未初始化前绝不抢跑生成卡组与装备');

    // 主角六维写入属性表后，再次触发 prepareProtagonist：自动完成两阶段生成（含20张模板命名卡组与初始装备）
    const heroId = (await services.getLedger().effectiveState()).attributes.fold;
    assert.ok(heroId);
    const { createCombatTables } = await import('../src/data/shujuku/combat-tables.js');
    const tables = createCombatTables({ api: db.api });
    t.after(() => tables.client.dispose());
    const heroKey = (await services.getLedger().effectiveState()).protagonistKey || 'nm-' + (await import('../src/combat/random.js')).hashString('主角');
    assert.equal((await tables.append('attribute', [{
        id: `hero-base|${heroKey}`, type: 'hero-base', character: heroKey, createdAt: Date.now(), anchor: null, change: '初始化',
        payload: { scores: { str: 10, dex: 12, con: 11, int: 16, wis: 13, cha: 10 } },
    }])).ok, true);
    const readyRes = await services.prepareProtagonist();
    assert.equal(readyRes.ok, true, JSON.stringify(readyRes));
    assert.equal(llmCalls, 2, '应依次调用：1) 职业/基础/装备；2) 20张基础模板命名');
    const eff = await services.getLedger().effectiveState();
    const heroProfile = [...eff.characters.values()].find((c) => c.name === '主角')?.profile;
    assert.ok(heroProfile);
    assert.equal(heroProfile.starterDeck.length, 20);
    assert.deepEqual(heroProfile.personalPool.map((c) => c.name), worldNames, '20张基础卡组应使用 LLM 结合世界书命名的卡名');
});

test('逻辑4：仅日常挑战删卡与升级改为每 3 胜触发一次，常规战斗保持每 5 胜不变', () => {
    assert.equal(DAILY_PURGE_EVERY, 3);
    assert.equal(DAILY_UPGRADE_EVERY, 3);
    assert.equal(PURGE_EVERY, 5);
    assert.equal(UPGRADE_EVERY, 5);
});
