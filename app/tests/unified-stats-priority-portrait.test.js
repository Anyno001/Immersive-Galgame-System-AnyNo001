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
