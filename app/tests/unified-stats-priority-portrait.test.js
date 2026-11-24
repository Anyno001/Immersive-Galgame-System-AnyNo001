import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { PROTAGONIST } from '../src/scene/stats/stat-engine.js';
import { TRAIT_DEFS, listTraits } from '../src/scene/stats/stat-traits.js';
import { createIgsChatStore } from '../src/data/shujuku/igs-chat-store.js';
import { readIgsChatEvidence } from '../src/storage/igs-chat-evidence.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';

import { createNaiRequestQueue } from '../src/generated-images/nai-request-queue.js';
import { createNaiOfficialClient } from '../src/generated-images/nai-official-client.js';
import { createImageBackend } from '../src/generated-images/image-backend.js';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';

import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { parseSpriteData } from '../src/generated-images/illustration/sprite-data.js';
import { characterPromptTask, singleCharacterContext } from '../src/generated-images/illustration/character-prompt-task.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { pngFixture } from './helpers/png-fixture.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test('问题1：主角与 NPC 数值在单批请求内一次性生成六维、擅长技能与初始特质，不拆分成多批请求', async (t) => {
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const handlers = new Map();
    const ctx = {
        chatId: 'chat-unified-stats-1',
        name1: '阿不思',
        name2: '小雪',
        chat: [
            { is_user: false, mes: '[igs-scene:苍白山脉|傍晚|阴]\n阿不思站在山脊旁，小雪递来一盏提灯。[igs-stat:favor|小雪|开心]', swipe_id: 0 },
        ],
        chatMetadata: {},
        getCurrentChatId: () => ctx.chatId,
        eventTypes: {
            GENERATION_STARTED: 'gs',
            GENERATION_ENDED: 'ge',
            GENERATION_STOPPED: 'gp',
            MESSAGE_SWIPED: 'ms',
            MESSAGE_DELETED: 'md',
            MESSAGE_UPDATED: 'mu',
            MESSAGE_EDITED: 'me',
            CHAT_CHANGED: 'cc',
        },
        eventSource: {
            on(name, fn) { handlers.set(name, (handlers.get(name) || []).concat([fn])); },
            removeListener(name, fn) { handlers.set(name, (handlers.get(name) || []).filter((h) => h !== fn)); },
        },
    };
    const emit = (name, ...args) => { for (const fn of handlers.get(name) || []) fn(...args); };
    const chatStore = createIgsChatStore({
        storage,
        api: () => db.api,
        chatId: () => ctx.chatId,
        chat: () => ctx.chat,
        userName: () => ctx.name1,
        evidence: (id) => readIgsChatEvidence({ context: ctx, chatId: id, storage }),
    });
    const candidateTrait = TRAIT_DEFS.find((d) => d.candidate !== false && d.protagonist && !d.nsfw && (!d.sub || !d.sub.length) && !d.req);
    assert.ok(candidateTrait, '应存在无门槛非 NSFW 通用主角/NPC 候选特质');

    const llmCalls = [];
    const rt = createStatsRuntime({
        getContext: () => ctx,
        readSettings: () => ({ enabled: true, sheetGen: 'auto', backfill: 'off', hudEnabled: true, ruleset: 'dnd5e' }),
        worldviewOf: () => 'fantasy',
        generationIdentity: () => chatStore.get(),
        generationRoute: () => 'route-unified',
        statsTables: () => chatStore.get().statsAccess,
        attributeAccess: () => chatStore.get().attributeAccess,
        currencyInventory: () => chatStore.get().inventory,
        currencyEditStorage: storage,
        getPushClient: () => chatStore.get().client,
        getBackgroundRequest: () => async (prompt) => {
            llmCalls.push(prompt);
            const userText = String(prompt?.user || '');
            const sysText = String(prompt?.system || '');
            if (userText.includes('协议版本：heroInit/')) {
                return JSON.stringify({
                    attributes: { 力量: 12, 敏捷: 14, 体质: 11, 智力: 16, 感知: 15, 魅力: 13 },
                    skills: { 侦查: '精通', 隐匿: '熟练', 说服: '熟练', 急救: '入门', 察言观色: '入门' },
                    traits: [candidateTrait.name],
                    bio: '行游于苍白山脉的年轻法师。',
                    currency: { name: '银币', initial: 80, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
                });
            }
            if (sysText.includes('NPC 角色评定初始数值')) {
                return JSON.stringify({
                    小雪: {
                        资历: '老手',
                        属性: { 力量: '普通', 敏捷: '出众', 感知: '出众' },
                        擅长: ['侦查', '潜行', '医术'],
                        比较擅长: ['察言观色', '话术', '攀爬', '魔法', '骑术'],
                        招牌技能: [{ 名: '提灯照明', 属性: '感知' }],
                        特质: [candidateTrait.name],
                    },
                });
            }
            throw new Error(`不应发起额外拆分请求: ${sysText.slice(0, 40)} | ${userText.slice(0, 60)}`);
        },
    });
    t.after(() => { rt.destroy(); chatStore.dispose(); });
    rt.sync();

    // 1) 主角自动初始化：仅 1 次请求同时产出六维、擅长技能、初始特质、简介与剧情货币
    const heroRes = await rt.noticeAction('hero-init-mode', 'auto');
    assert.equal(heroRes.ok, true, JSON.stringify(heroRes));
    await rt.whenSaved();
    for (let i = 0; i < 6; i += 1) await tick();
    assert.equal(llmCalls.length, 1, `主角初始化只应发送 1 次统一请求，实际发出 ${llmCalls.length} 次`);
    assert.match(llmCalls[0].user, /可用技能：/);
    assert.match(llmCalls[0].user, /可选特质：/);
    assert.equal(rt.abilitiesOf('阿不思')?.permanentScores?.int, 16);
    assert.equal(rt.currencyBalance(), 80);
    assert.equal(rt.getCatalog().heroBio, '行游于苍白山脉的年轻法师。');
    assert.equal(rt.getCatalog().heroAssigned, true, '主角擅长技能应在同批请求中直接落盘');
    assert.equal(rt.getCatalog().heroPicked, true);
    assert.ok(rt.archive().skills.some((s) => s.name === '侦查'), '主角擅长技能应立即生效');
    assert.ok((rt.getCatalog().traitInit || []).includes(PROTAGONIST), '主角初始特质应在同批请求中标记完成');
    assert.ok(listTraits(rt.getCatalog(), PROTAGONIST).some((tr) => tr.id === candidateTrait.id), '主角初始特质应已写入');

    // 2) NPC 自动建档：仅 1 次请求同时产出资历、六维、擅长/比较擅长、招牌技能与初始特质
    const npcPolicyRes = await rt.noticeAction('npc-policy', 'auto');
    assert.equal(npcPolicyRes.ok, true);
    for (let i = 0; i < 12; i += 1) await tick();
    await rt.whenSaved();
    assert.equal(llmCalls.length, 2, `NPC 建档只应再发出 1 次统一请求，实际总计 ${llmCalls.length} 次`);
    assert.match(llmCalls[1].user, /可选特质：/);
    assert.match(llmCalls[1].user, /魔法/, 'NPC 可用技能应包含当前世界观技能');
    const snowSheet = rt.getCatalog().sheets.小雪;
    assert.ok(snowSheet, '小雪角色卡应已落盘');
    assert.equal(snowSheet.rank, '老手');
    assert.ok(snowSheet.skills.侦查 >= 60 && snowSheet.skills.魔法 >= 30);
    assert.ok((rt.getCatalog().traitInit || []).includes('小雪'), '小雪初始特质应在同批请求中标记完成');
    assert.ok(listTraits(rt.getCatalog(), '小雪').some((tr) => tr.id === candidateTrait.id), '小雪初始特质应已写入');

    // 3) 下一楼结算后不再为主角或小雪另发初始特质拆分请求
    ctx.chat.push({ is_user: true, mes: '我们继续上山。' });
    ctx.chat.push({ is_user: false, mes: '[igs-scene:山顶|夜晚]\n小雪笑着点头。[igs-stat:favor|小雪|开心]', swipe_id: 0 });
    emit('ge', ctx.chat.length - 1);
    for (let i = 0; i < 10; i += 1) await tick();
    await rt.whenSaved();
    assert.equal(llmCalls.length, 2, '已完成统一建档的主角与 NPC 不应再触发额外初始特质或技能拆分请求');
});

test('问题2：生图串行冲突严格按 角色立绘 > 场景 > CG > 物品 顺序执行（且保留手动 urgent / 预热 high 优先）', async () => {
    // 2A. 队列单测
    const queue = createNaiRequestQueue();
    const order = [];
    const gate = deferred();
    const firstEntered = deferred();

    const p0 = queue.run('k', async () => {
        order.push('first');
        firstEntered.resolve();
        await gate.promise;
        return { ok: true };
    }, { priority: 'item' });
    await firstEntered.promise;

    const pItem = queue.run('k', async () => { order.push('item'); return { ok: true }; }, { priority: 'item' });
    const pCg = queue.run('k', async () => { order.push('cg'); return { ok: true }; }, { priority: 'cg' });
    const pBg = queue.run('k', async () => { order.push('background'); return { ok: true }; }, { priority: 'background' });
    const pSprite1 = queue.run('k', async () => { order.push('sprite-1'); return { ok: true }; }, { priority: 'sprite' });
    const pSprite2 = queue.run('k', async () => { order.push('sprite-2'); return { ok: true }; }, { priority: 'sprite' });
    const pHigh = queue.run('k', async () => { order.push('high'); return { ok: true }; }, { priority: 'high' });
    const pUrgent = queue.run('k', async () => { order.push('urgent'); return { ok: true }; }, { priority: 'urgent' });

    gate.resolve();
    await Promise.all([p0, pItem, pCg, pBg, pSprite1, pSprite2, pHigh, pUrgent]);
    assert.deepEqual(order, ['first', 'urgent', 'high', 'sprite-1', 'sprite-2', 'background', 'cg', 'item']);

    // 2B. 经 createImageBackend + createNaiOfficialClient 真实串行链路验证 imageKind 自动映射优先级
    const wireOrder = [];
    const wireGate = deferred();
    const wireFirstEntered = deferred();
    const sharedQueue = createNaiRequestQueue();
    const pngBytes = pngFixture(64, 64).bytes;
    const client = createNaiOfficialClient({
        queue: sharedQueue,
        fetch: async (_url, init) => {
            const body = JSON.parse(init.body);
            const tag = String(body.input || '');
            wireOrder.push(tag);
            if (wireOrder.length === 1) {
                wireFirstEntered.resolve();
                await wireGate.promise;
            }
            return new Response(pngBytes, { headers: { 'Content-Type': 'image/png' } });
        },
    });
    const bridge = {
        imageApi: { mode: 'nai' },
        autoIllustration: { nai: { apiKey: 'priority-test-key', model: 'nai-diffusion-4-5-full', minIntervalMs: 0 } },
    };
    const backend = createImageBackend({ nai: client, getBridge: () => bridge });
    const naiSettings = bridge.autoIllustration.nai;

    const firstReq = backend.generate({ scene: 'holder' }, naiSettings, { imageKind: 'item' });
    await wireFirstEntered.promise;
    const reqItem = backend.generate({ scene: 'item-tag' }, naiSettings, { imageKind: 'item' });
    const reqCg = backend.generate({ scene: 'cg-tag' }, naiSettings, { imageKind: 'cg' });
    const reqBg = backend.generate({ scene: 'bg-tag' }, naiSettings, { imageKind: 'background' });
    const reqSprite = backend.generate({ scene: 'sprite-tag' }, naiSettings, { imageKind: 'sprite' });

    wireGate.resolve();
    const results = await Promise.all([firstReq, reqItem, reqCg, reqBg, reqSprite]);
    assert.ok(results.every((r) => r.ok), JSON.stringify(results));
    assert.deepEqual(wireOrder, ['holder', 'sprite-tag', 'bg-tag', 'cg-tag', 'item-tag']);
});

test('问题3：replaceReader 不再抛出 messageId is not defined，且正确更新 contentMessageId', () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: 'https://igs.invalid/',
        beforeParse(window) {
            const create = window.document.createElement.bind(window.document);
            window.document.createElement = (...args) => {
                const node = create(...args);
                if (node.localName === 'style') node.type = 'text/plain';
                return node;
            };
        },
    });
    try {
        const host = createIgsReaderHost({
            global: { document: dom.window.document, window: dom.window },
            getUnifiedSettings: () => ({
                bridge: { sceneAssets: { enabled: true } },
                readerSettings: { titleScreen: false },
            }),
        });
        try {
            const first = host.openReader(
                { messageId: 0, message: { id: 0, text: '<content>\n第一楼正文。\n</content>' }, raw: '<content>\n第一楼正文。\n</content>' },
                { mode: 'fullscreen' },
            );
            assert.equal(first.ok, true);

            const replaced = host.replaceReader({
                messageId: 1,
                message: { id: 1, text: '<content>\n第二楼新正文。\n</content>' },
                raw: '<content>\n第二楼新正文。\n</content>',
            });
            assert.equal(replaced.ok, true, JSON.stringify(replaced));
            assert.equal(replaced.replaced, true);
            assert.match(String(replaced.snapshot.content.segments[0]), /第二楼新正文/);

            const replacedFallback = host.replaceReader({
                message: { text: '<content>\n沿用当前楼号的更新。\n</content>' },
                raw: '<content>\n沿用当前楼号的更新。\n</content>',
            });
            assert.equal(replacedFallback.ok, true);
            assert.equal(replacedFallback.replaced, true);
            assert.match(String(replacedFallback.snapshot.content.segments[0]), /沿用当前楼号的更新/);
        } finally {
            host.destroy();
        }
    } finally {
        dom.window.close();
    }
});

test('问题4：多行 sprite-data（字段冒号后换行与 NAI 权重语法）解析成功，手动生成立绘建立默认占位并成功出图（含中途关窗）', async (t) => {
    // 4A. parseSpriteData 接受冒号后换行的字段与 NAI 权重前缀，同时仍拒绝非法字段头与代码块
    const context = singleCharacterContext('阿不思', null, undefined, {});
    const task = characterPromptTask(context, 'sprite', 'half_body', [['阿不思']]);
    const meta = {
        ...task,
        outputs: { format: 'sprite-data' },
        userPrompts: { positive: 'white background, upper body', negative: 'lowres' },
    };
    const multilineReply = [
        'slotid: 1',
        'character: 阿不思',
        'personality:',
        'calm, composed',
        'outfit_name: 法师袍',
        'outfit_description:',
        '1.2::dark blue robe::',
        '2::silver trim::, black leather boots',
        'outfit_half_body:',
        '1.2::dark blue robe::, 2::silver trim::, high collar',
        'dna_full_body:',
        '1boy, young man, silver hair, blue eyes, tall, slender',
        'dna_half_body:',
        '1boy, young man, silver hair, blue eyes',
        'dna_portrait:',
        '1boy, young man, silver hair, blue eyes',
        'dna_uc_full_body:',
        'beard',
        'dna_uc_half_body:',
        'beard',
        'dna_uc_portrait:',
        'beard',
    ].join('\n');
    const parsed = parseSpriteData(multilineReply, meta);
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    assert.equal(parsed.characterMeta.characters[0].outfit.name, '法师袍');
    assert.equal(parsed.characterMeta.characters[0].outfit.description, '1.2::dark blue robe::, 2::silver trim::, black leather boots');
    assert.equal(parsed.characterMeta.characters[0].outfit.descriptionHalfBody, '1.2::dark blue robe::, 2::silver trim::, high collar');
    assert.equal(parsed.dnaCandidates.characters[0].personality, 'calm, composed');
    assert.match(parsed.dnaCandidates.characters[0].views.half_body.subject, /silver hair/);

    const badHeader = parseSpriteData(`${multilineReply}\nscene: 1boy standing`, meta);
    assert.equal(badHeader.ok, false, '仍应拒绝非法字段头 scene:');
    const badFence = parseSpriteData(`${multilineReply}\n\`\`\``, meta);
    assert.equal(badFence.ok, false, '仍应拒绝代码围栏');

    // 4B. 端到端：手动新增角色（无发言标签、无立绘）-> 点生成立绘 -> 写词返回多行结果 -> 立刻建立默认立绘占位 -> 成功生图并采用
    for (const closeSettingsMidway of [false, true]) {
        const assets = {
            characters: {},
            characterDna: { 阿不思: { version: 2, views: {} } },
            characterOutfits: {},
            wardrobe: {},
        };
        let persistedRoot = structuredClone(assets);
        let placeholderObservedBeforePaint = false;
        let state;
        const h = builtinImageHarness({
            assets: persistedRoot,
            reply: () => {
                if (closeSettingsMidway) state.activeSettings = null;
                return multilineReply;
            },
            beforePaint() {
                const live = closeSettingsMidway ? persistedRoot : assets;
                placeholderObservedBeforePaint = Boolean(
                    Object.hasOwn(live.characters || {}, '阿不思')
                    && live.characterOutfits?.阿不思?.法师袍
                    && live.characterDefaultOutfits?.阿不思?.outfitName === '法师袍',
                );
            },
        });
        t.after(() => h.dispose());

        let seq = 0;
        const service = createAssetGenerationService({
            nai: h.backend,
            llm: h.llm,
            store: createMemoryGeneratedAssetStore(),
            messageHost: { getChatId: () => 'manual-portrait-test', readCharacterLore: async () => [] },
            getSettings: () => ({ ...h.bridge, sceneAssets: closeSettingsMidway ? persistedRoot : assets }),
            matte: async (url) => url,
            newId: () => `manual-portrait-${++seq}`,
        });

        const settings = { draft: { bridge: { sceneAssets: assets } }, asyncState: { assetScopeKey: '' } };
        state = { activeSettings: settings };
        const result = await handleSettingsAction('char-generate-sprite:%E9%98%BF%E4%B8%8D%E6%80%9D', {
            state,
            options: {
                global: { alert() {} },
                generatedAssets: service,
                getUnifiedSettings: () => ({ bridge: { sceneAssets: persistedRoot } }),
                saveUnifiedSettings: ({ bridge }) => {
                    persistedRoot = structuredClone(bridge.sceneAssets);
                    return { ok: true };
                },
            },
            dialogs: { confirm: async () => true, edit: async () => '', alert() {} },
            persistSettingsDraft: () => {
                if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
                persistedRoot = structuredClone(state.activeSettings.draft.bridge.sceneAssets);
                return { ok: true };
            },
            rerenderSettings: () => ({ ok: true }),
        });

        assert.equal(result.ok, true, `closeSettingsMidway=${closeSettingsMidway}: ${JSON.stringify(result)}`);
        assert.equal(placeholderObservedBeforePaint, true, `closeSettingsMidway=${closeSettingsMidway}: 写词完成后、出图前应已建立默认立绘占位`);
        assert.equal(h.writes.length, 1);
        assert.equal(h.wires.length, 1, `closeSettingsMidway=${closeSettingsMidway}: 应实际发起 NAI 生图请求`);
        assert.equal(persistedRoot.characterDefaultOutfits?.阿不思?.outfitName, '法师袍');
        assert.match(String(persistedRoot.characterOutfits?.阿不思?.法师袍?.moods?.平和 || ''), /^igs-gen:/);
        assert.equal(persistedRoot.characterDna?.阿不思?.identityInitialized, true);
    }
});

test('提示词一次性覆盖迁移 rev 1 -> 2：强制覆盖旧自定义 heroInit 与 sheetGen，保留其余提示词与迁移后新编辑', async (t) => {
    const { bootstrapIGS } = await import('../src/core/bootstrap.js');
    const { STAT_PROMPT_MIGRATION_VERSION } = await import('../src/scene/stats/stat-prompt.js');
    const { normalizeStatsSettings } = await import('../src/scene/stats/stat-settings.js');
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://igs.invalid/' });
    t.after(() => dom.window.close());
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            stats: {
                enabled: false,
                promptsVersion: 6,
                promptMigrationVersion: 1,
                prompts: {
                    heroInit: '用户在 v1 之后自定义的旧 heroInit',
                    sheetGen: '用户在 v1 之后自定义的旧 sheetGen',
                    backfill: '用户在 v1 之后自定义的 backfill 保留',
                    heroSkills: '用户自定义 heroSkills 保留',
                    present: '用户自定义 present 保留',
                },
            },
        }),
    });
    const mockSt = { getContext: () => ({ chat: [], chatMetadata: {}, setExtensionPrompt() {}, saveMetadata() {} }) };
    const makeGlobal = () => ({
        document: dom.window.document,
        localStorage: storage,
        SillyTavern: mockSt,
        Event: dom.window.Event,
        CustomEvent: dom.window.CustomEvent,
        dispatchEvent: dom.window.dispatchEvent.bind(dom.window),
        addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window),
    });

    const app = bootstrapIGS({ global: makeGlobal(), autoAttachMagicWand: false, tavernSettingsSync: false });
    t.after(() => app.shutdown());
    const migrated = normalizeStatsSettings(app.getUnifiedSettings().bridge.stats);
    assert.equal(migrated.promptMigrationVersion, STAT_PROMPT_MIGRATION_VERSION);
    assert.equal(STAT_PROMPT_MIGRATION_VERSION, 2);
    assert.equal(migrated.prompts.heroInit, undefined, 'rev 2 应一次性覆盖旧自定义 heroInit 改用新版默认');
    assert.equal(migrated.prompts.sheetGen, undefined, 'rev 2 应一次性覆盖旧自定义 sheetGen 改用新版默认');
    assert.equal(migrated.prompts.backfill, '用户在 v1 之后自定义的 backfill 保留', 'rev 2 不应误删 rev 1 之后保存的 backfill');
    assert.equal(migrated.prompts.heroSkills, '用户自定义 heroSkills 保留');
    assert.equal(migrated.prompts.present, '用户自定义 present 保留');

    const opened = app.openSettings({ page: 'stats' });
    assert.equal(opened.ok, true);
    assert.equal(opened.controller.setValue('bridge.stats.prompts.heroInit', '迁移后新编 heroInit').ok, true);
    assert.equal(opened.controller.setValue('bridge.stats.prompts.sheetGen', '迁移后新编 sheetGen').ok, true);
    assert.equal(opened.controller.close().ok, true);
    await app.shutdown();

    const restarted = bootstrapIGS({ global: makeGlobal(), autoAttachMagicWand: false, tavernSettingsSync: false });
    t.after(() => restarted.shutdown());
    const reloaded = normalizeStatsSettings(restarted.getUnifiedSettings().bridge.stats);
    assert.equal(reloaded.prompts.heroInit, '迁移后新编 heroInit', '迁移完成后用户新编辑必须跨重启保留');
    assert.equal(reloaded.prompts.sheetGen, '迁移后新编 sheetGen');
    await restarted.shutdown();
});

test('主角擅长项混合模式：用户手选直接完整覆盖 AI 回包，且迟到 AI 回包绝不覆盖用户手选', async (t) => {
    const makeEnv = (chatId, handler) => {
        const db = createLedgerMockHost({ supportCallbacks: true });
        db.sheets.sheet_userbag = userInventorySheet();
        const storage = createMemoryStorage();
        const ctx = {
            chatId,
            name1: '阿不思',
            name2: '小雪',
            chat: [{ is_user: false, mes: '[igs-scene:山脚|白天|晴]\n旅程开始。', swipe_id: 0 }],
            chatMetadata: {},
            getCurrentChatId: () => ctx.chatId,
            eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', CHAT_CHANGED: 'cc' },
            eventSource: { on() {}, removeListener() {} },
        };
        const chatStore = createIgsChatStore({
            storage,
            api: () => db.api,
            chatId: () => ctx.chatId,
            chat: () => ctx.chat,
            userName: () => ctx.name1,
            evidence: (id) => readIgsChatEvidence({ context: ctx, chatId: id, storage }),
        });
        const makeRuntime = () => createStatsRuntime({
            getContext: () => ctx,
            readSettings: () => ({ enabled: true, sheetGen: 'off', backfill: 'off', hudEnabled: true, ruleset: 'dnd5e' }),
            worldviewOf: () => 'fantasy',
            generationIdentity: () => chatStore.get(),
            generationRoute: () => `route-${chatId}`,
            statsTables: () => chatStore.get().statsAccess,
            attributeAccess: () => chatStore.get().attributeAccess,
            currencyInventory: () => chatStore.get().inventory,
            currencyEditStorage: storage,
            getPushClient: () => chatStore.get().client,
            getBackgroundRequest: () => handler,
        });
        const rt = makeRuntime();
        t.after(() => { rt.destroy(); chatStore.dispose(); });
        rt.sync();
        return { db, storage, ctx, chatStore, rt, makeRuntime };
    };

    const aiReply = JSON.stringify({
        attributes: { 力量: 11, 敏捷: 15, 体质: 12, 智力: 16, 感知: 14, 魅力: 10 },
        skills: { 侦查: '精通', 潜行: '熟练', 察言观色: '熟练', 话术: '入门', 医术: '入门' },
        bio: '苍白山脉的旅人。',
        currency: { name: '银币', initial: 90, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
    });

    // 场景 A：用户先点自动生成，随后在 AI 回包前手动填写擅长项 -> AI 迟到回包正常写六维/货币/简介，但绝不覆盖用户手选擅长项
    {
        const gate = deferred();
        const entered = deferred();
        const env = makeEnv('chat-hybrid-user-first', async () => {
            entered.resolve();
            await gate.promise;
            return aiReply;
        });
        const autoRun = env.rt.noticeAction('hero-init-mode', 'auto');
        await entered.promise;

        const openRes = env.rt.noticeAction('hero-pick', 'open');
        assert.equal(openRes.openSettings, 'stats');
        const pickRes = env.rt.heroOp('pick', '', {
            skills: { 剑术: 60, 魔法: 60, 骑术: 60, 攀爬: 30, 跳跃: 30 },
            slots: { strong1: '剑术', strong2: '魔法', strong3: '骑术', good1: '攀爬', good2: '跳跃' },
        });
        assert.equal(pickRes.ok, true);
        assert.equal(env.rt.getCatalog().heroSkillsManual, true);

        gate.resolve();
        const autoRes = await autoRun;
        assert.equal(autoRes.ok, true, JSON.stringify(autoRes));
        await env.rt.whenSaved();

        assert.equal(env.rt.abilitiesOf('阿不思')?.permanentScores?.int, 16, 'AI 六维应正常写入');
        assert.equal(env.rt.currencyBalance(), 90, 'AI 货币应正常入账');
        assert.equal(env.rt.getCatalog().heroBio, '苍白山脉的旅人。');
        const names = Object.keys(env.rt.getCatalog().protagonistBase).sort();
        assert.deepEqual(names, ['剑术', '攀爬', '跳跃', '骑术', '魔法'], '迟到 AI 回包不得覆盖或混入用户手选擅长项');
        assert.equal(env.rt.getCatalog().heroSkillsManual, true);

        // 冷重载后仍保留 heroSkillsManual 标记与用户手选项
        env.rt.destroy();
        env.chatStore.reset();
        const cold = env.makeRuntime();
        t.after(() => cold.destroy());
        cold.sync();
        assert.equal(cold.getCatalog().heroSkillsManual, true);
        assert.deepEqual(Object.keys(cold.getCatalog().protagonistBase).sort(), ['剑术', '攀爬', '跳跃', '骑术', '魔法']);
        const unconfirmedAssign = await cold.heroOp('assign', '', { overwrite: false });
        assert.equal(unconfirmedAssign.reason, 'needs-confirm', '未确认时 AI 分配不得静默覆盖手选项');
    }

    // 场景 B：点自动生成 -> 点手动选择打开 3+5 选择器 -> AI 先回包（选择器保持可见不消失）-> 用户提交手选，完整清空覆盖旧 AI 技能
    {
        const gate = deferred();
        const entered = deferred();
        const env = makeEnv('chat-hybrid-ai-first', async () => {
            entered.resolve();
            await gate.promise;
            return aiReply;
        });
        const autoRun = env.rt.noticeAction('hero-init-mode', 'auto');
        await entered.promise;

        const openRes = env.rt.noticeAction('hero-pick', 'open');
        assert.equal(openRes.openSettings, 'stats');

        gate.resolve();
        const autoRes = await autoRun;
        assert.equal(autoRes.ok, true, JSON.stringify(autoRes));
        await env.rt.whenSaved();

        assert.ok(env.rt.getCatalog().protagonistBase.侦查, 'AI 先回包时先写入临时 AI 技能');
        assert.equal(env.rt.archive().needsPick, true, '用户已点手动选择时，AI 回包不得把 3+5 选择区顶消失');

        const pickRes = env.rt.heroOp('pick', '', {
            skills: { 剑术: 60, 魔法: 60, 骑术: 60, 攀爬: 30 },
            slots: { strong1: '剑术', strong2: '魔法', strong3: '骑术', good1: '攀爬' },
        });
        assert.equal(pickRes.ok, true);
        await env.rt.whenSaved();

        const baseKeys = Object.keys(env.rt.getCatalog().protagonistBase).sort();
        assert.deepEqual(baseKeys, ['剑术', '攀爬', '骑术', '魔法'], '用户手选必须完整覆盖 AI 回包，不残留任何旧 AI 技能');
        assert.equal(env.rt.getCatalog().heroSkillsManual, true);
        assert.equal(env.rt.archive().needsPick, false);
    }

    // 场景 C：AI 全自动完成后，用户在设置页点「手动重选擅长（覆盖当前）」可随时重新展开 3+5 选择区并覆盖 AI 回包
    {
        const env = makeEnv('chat-hybrid-reopen', async () => aiReply);
        const autoRes = await env.rt.noticeAction('hero-init-mode', 'auto');
        assert.equal(autoRes.ok, true);
        await env.rt.whenSaved();
        assert.equal(env.rt.archive().needsPick, false);
        assert.ok(env.rt.getCatalog().protagonistBase.侦查);

        assert.equal(env.rt.heroOp('pick-open', '', {}).ok, true);
        assert.equal(env.rt.archive().needsPick, true, '点击手动重选擅长后应重新展示 3+5 选择区');

        const pickRes = env.rt.heroOp('pick', '', {
            skills: { 烹饪: 60, 艺术: 60, 学习: 60 },
            slots: { strong1: '烹饪', strong2: '艺术', strong3: '学习' },
        });
        assert.equal(pickRes.ok, true);
        await env.rt.whenSaved();
        assert.deepEqual(Object.keys(env.rt.getCatalog().protagonistBase).sort(), ['学习', '烹饪', '艺术']);
        assert.equal(env.rt.archive().needsPick, false);
    }
});

test('主角擅长技能单批容错解析与并发完成不误报 stats-generation-conflict', async (t) => {
    const { parseHeroInitReply } = await import('../src/scene/stats/stat-hero-init.js');
    const { createSkillRegistry } = await import('../src/scene/stats/stat-registry.js');
    const registry = createSkillRegistry({});

    // 1) 单批 heroInit 容错解析：支持技能空格、别名与嵌套 擅长/比较擅长
    const parsedAlias = parseHeroInitReply(JSON.stringify({
        attributes: { 力量: 10, 敏捷: 12, 体质: 11, 智力: 15, 感知: 14, 魅力: 11 },
        skills: { ' 侦察 ': '精通', 交涉: '熟练', 急救: '入门' },
        currency: { name: '银币', initial: 50, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
    }), {
        needAttributes: true,
        needCurrency: true,
        needSkills: true,
        availableSkills: ['侦查', '话术', '潜行', '医术'],
        registry,
    });
    assert.equal(parsedAlias.ok, true);
    assert.equal(parsedAlias.skills?.侦查, '精通', '别名与带空格技能应归一命中可用技能');
    assert.equal(parsedAlias.skills?.话术, '熟练', '交涉应通过注册表别名归一为话术');
    assert.equal(parsedAlias.skills?.医术, '入门', '急救应通过注册表别名归一为医术');

    const parsedNested = parseHeroInitReply(JSON.stringify({
        attributes: { 力量: 10, 敏捷: 12, 体质: 11, 智力: 15, 感知: 14, 魅力: 11 },
        skills: { 擅长: ['侦查', '说服'], 比较擅长: '隐匿、急救' },
        currency: { name: '银币', initial: 50, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
    }), {
        needAttributes: true,
        needCurrency: true,
        needSkills: true,
        availableSkills: ['侦查', '话术', '潜行', '医术'],
        registry,
    });
    assert.equal(parsedNested.ok, true);
    assert.deepEqual(Object.keys(parsedNested.skills || {}).sort(), ['侦查', '医术', '潜行', '话术']);

    // 2) 自动初始化进行中不向用户暴露重复的「按人设生成」按钮；且若并发 assignHeroSkills 晚于 heroInit 返回，静默跳过绝不报 stats-generation-conflict
    const heroGate = deferred();
    const skillGate = deferred();
    const skillEntered = deferred();
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const ctx = {
        chatId: 'chat-no-false-skill-conflict',
        name1: '阿不思',
        name2: '小雪',
        chat: [{ is_user: false, mes: '[igs-scene:山脚|白天|晴]\n旅程开始。', swipe_id: 0 }],
        chatMetadata: {},
        getCurrentChatId: () => ctx.chatId,
        eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', CHAT_CHANGED: 'cc' },
        eventSource: { on() {}, removeListener() {} },
    };
    const chatStore = createIgsChatStore({
        storage,
        api: () => db.api,
        chatId: () => ctx.chatId,
        chat: () => ctx.chat,
        userName: () => ctx.name1,
        evidence: (id) => readIgsChatEvidence({ context: ctx, chatId: id, storage }),
    });
    const rt = createStatsRuntime({
        getContext: () => ctx,
        readSettings: () => ({ enabled: true, sheetGen: 'off', backfill: 'off', hudEnabled: true, ruleset: 'dnd5e' }),
        worldviewOf: () => 'fantasy',
        generationIdentity: () => chatStore.get(),
        generationRoute: () => 'route-conflict-fix',
        statsTables: () => chatStore.get().statsAccess,
        attributeAccess: () => chatStore.get().attributeAccess,
        currencyInventory: () => chatStore.get().inventory,
        currencyEditStorage: storage,
        getPushClient: () => chatStore.get().client,
        getBackgroundRequest: () => async (prompt, task = {}) => {
            const text = `${prompt?.system || ''}\n${prompt?.user || ''}`;
            if (text.includes('可分配技能：')) {
                skillEntered.resolve();
                await skillGate.promise;
                task.onRetry?.({ attempt: 1, maxRetries: 2 });
                return JSON.stringify({ 潜行: '精通', 急救: '熟练' });
            }
            await heroGate.promise;
            return JSON.stringify({
                attributes: { 力量: 11, 敏捷: 14, 体质: 12, 智力: 16, 感知: 13, 魅力: 10 },
                skills: { 侦查: '精通', 察言观色: '熟练', 话术: '熟练' },
                bio: '苍白山脉的年轻法师。',
                currency: { name: '银币', initial: 80, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
            });
        },
    });
    t.after(() => { rt.destroy(); chatStore.dispose(); });
    rt.sync();

    const heroRun = rt.noticeAction('hero-init-mode', 'auto');
    const pickNotice = rt.notices().find((n) => n.id === 'hero-pick');
    assert.ok(pickNotice, '初始化期间仍允许手动选择覆盖');
    assert.equal(pickNotice.actions.some(([act]) => act === 'assign'), false, '主角初始化已在单批生成技能时，hero-pick 不应展示重复的「按人设生成」按钮');

    // 即使外部/旧路径并发触发了 assignHeroSkills，且 heroInit 先落库技能：
    const skillRun = rt.heroOp('assign', '', { overwrite: false });
    await skillEntered.promise;
    heroGate.resolve();
    const heroRes = await heroRun;
    assert.equal(heroRes.ok, true);
    await rt.whenSaved();

    skillGate.resolve();
    const skillRes = await skillRun;
    assert.equal(skillRes.ok, true, `并发 heroInit 先完成时 assignHeroSkills 不应失败：${JSON.stringify(skillRes)}`);
    assert.equal(skillRes.skipped, 'already-assigned');
    assert.equal(rt.notices().some((n) => n.id === 'hero-skills' && String(n.text || '').includes('stats-generation-conflict')), false, '不得弹出 stats-generation-conflict 报错条');
    assert.ok(rt.getCatalog().protagonistBase.侦查, 'heroInit 单批生成的擅长技能应完整保留');
});

test('人际关系页：重要角色表为空/缺表/未收录主角时仍直接展示主角六维、擅长与生活条，并支持数值更新自动刷新', async (t) => {
    const { createRecordPanelController } = await import('../src/visual/igs-ui/record-panel.js');
    const attrs = [
        { name: '力量', value: 55, display: '11（+0）' },
        { name: '敏捷', value: 70, display: '14（+2）' },
        { name: '体质', value: 60, display: '12（+1）' },
        { name: '智力', value: 80, display: '16（+3）' },
        { name: '感知', value: 65, display: '13（+1）' },
        { name: '魅力', value: 50, display: '10（+0）' },
    ];

    // 场景 1：重要角色表为空（0 行）且主角六维/擅长/生活条已生成 -> 人际关系页不再显示「匹配表没有可阅读的记录」，直接渲染主角与已登记 NPC
    {
        const dom = new JSDOM('<div id="overlay"><div id="igs-db-layer"></div></div>');
        t.after(() => dom.window.close());
        const doc = dom.window.document;
        let heroReady = false;
        let notifyStats = null;
        const globalObj = {
            SillyTavern: { getContext: () => ({ name1: '阿不思', powerUserSettings: {} }) },
            AutoCardUpdaterAPI: {
                exportTableAsJson: () => ({
                    sheet_zhong_yao_jue_se_biao: {
                        uid: 'sheet_zhong_yao_jue_se_biao',
                        name: '重要角色表',
                        content: [[null, '姓名', '年龄', '外貌', '人际关系']],
                    },
                }),
            },
        };
        const controller = createRecordPanelController(doc, globalObj, null, {
            statsProtagonistLookup: () => (heroReady ? () => ({
                metrics: [
                    { label: '生命', percent: 100, display: '55/55' },
                    { label: '体力', percent: 100, display: '100' },
                ],
                stages: [],
                sheet: { name: '主角', hero: true, strong: ['侦查 精通', '察言观色 熟练'], missing: false },
                bio: '右手握着木质法师杖的年轻旅人。',
                attributes: attrs,
            }) : null),
            statsFavorOverview: () => (heroReady ? {
                nsfw: false,
                people: [{ name: '小雪', dims: { 好感: 20, 信任: 15, 了解: 10, 芥蒂: 0 }, romance: false, kin: false, metrics: [], log: [] }],
            } : null),
            statsLookup: () => (name) => (heroReady && name === '小雪' ? {
                metrics: [{ label: '好感', percent: 20, display: '20' }],
                stages: [{ label: '关系阶段', value: '初步好感' }],
                sheet: { name: '小雪', rank: '普通人', strong: ['急救 熟练'], provisional: false },
                attributes: attrs,
            } : { metrics: [], stages: [] }),
            subscribeStats: (handler) => { notifyStats = handler; return () => { notifyStats = null; }; },
        });
        t.after(() => controller.close());

        controller.open(doc.querySelector('#overlay'), {}, 'relationships');
        assert.match(doc.body.textContent || '', /匹配表没有可阅读的记录/, '数值尚未就绪且表为空时保持原空态提示');

        // 模拟主角六维等数据生成完成触发 stats-updated -> 面板自动刷新并展示主角六维雷达图与数据
        heroReady = true;
        notifyStats?.({});
        const html = doc.querySelector('#igs-record-panel')?.innerHTML || '';
        assert.doesNotMatch(html, /匹配表没有可阅读的记录/, '主角生成六维后不得再提示匹配表没有可阅读的记录');
        assert.doesNotMatch(html, /当前来源没有可识别的人物记录/);
        assert.match(html, /<h2>阿不思<\/h2>/, '应默认选中并展示主角阿不思');
        assert.match(html, /igs-record-person-radar[\s\S]*igs-stats-radar/, '主角卡应展示六维雷达图');
        assert.match(html, /生命[\s\S]*55\/55/, '主角卡应展示生命条');
        assert.match(html, /<span>擅长<\/span><strong>侦查 精通、察言观色 熟练<\/strong>/, '主角卡应展示擅长技能');
        assert.match(html, /右手握着木质法师杖的年轻旅人。/, '主角卡应展示生成的主角简介');
        assert.ok([...doc.querySelectorAll('[data-record-act="person"]')].some((b) => b.textContent.includes('小雪')), '已登记数值 NPC 也应一并展示');
    }

    // 场景 2：完全没有重要角色/关系表（no-tables）时，主角生成六维后同样在人际关系页显示
    {
        const dom = new JSDOM('<div id="overlay"><div id="igs-db-layer"></div></div>');
        t.after(() => dom.window.close());
        const doc = dom.window.document;
        const globalObj = {
            SillyTavern: { getContext: () => ({ name1: '阿不思', powerUserSettings: {} }) },
            AutoCardUpdaterAPI: { exportTableAsJson: () => ({}) },
        };
        const controller = createRecordPanelController(doc, globalObj, null, {
            statsProtagonistLookup: () => () => ({
                metrics: [{ label: '体力', percent: 100, display: '100' }],
                stages: [],
                sheet: { name: '主角', hero: true, strong: ['侦查 精通'], missing: false },
                attributes: attrs,
            }),
        });
        t.after(() => controller.close());
        controller.open(doc.querySelector('#overlay'), {}, 'relationships');
        const html = doc.querySelector('#igs-record-panel')?.innerHTML || '';
        assert.doesNotMatch(html, /未找到匹配的人际关系表/);
        assert.match(html, /<h2>阿不思<\/h2>/);
        assert.match(html, /igs-record-person-radar[\s\S]*igs-stats-radar/);
    }
});
