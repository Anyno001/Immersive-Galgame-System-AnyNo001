import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { createStatsChip } from '../src/visual/igs-ui/stats-chip.js';
import { createHeroManualModal } from '../src/visual/igs-ui/hero-manual-modal.js';
import { normalizeBridgeConfig, SENTENCE_PAGING_MIGRATION_VERSION } from '../src/visual/igs-ui/settings-host-normalize.js';
import { bootstrapIGS } from '../src/core/bootstrap.js';
import { getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';
import { LOG_READER_STYLE_TEXT } from '../src/visual/igs-ui/log-reader-style.js';
import { COMIC_STYLE_TEXT } from '../src/visual/igs-ui/comic-style.js';
import { DANMAKU_STYLE_TEXT } from '../src/visual/igs-ui/danmaku-style.js';
import { hasAnyIgsFormatTag } from '../src/scene/directive-tags.js';
import { hasVisibleIgsTagInText, hasVisibleIgsTagOnLatestFloor } from '../src/scene/message-source.js';
import { createCombatStoryContext } from '../src/host/combat-story-context.js';
import { buildBackfillRequest, buildHeroSkillRequest, buildStartRelationRequest } from '../src/scene/stats/stat-sheets.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { createIgsChatStore } from '../src/data/shujuku/igs-chat-store.js';
import { readIgsChatEvidence } from '../src/storage/igs-chat-evidence.js';
import { IGS_TABLE_SPECS } from '../src/data/shujuku/igs-table-specs.js';
import { COMBAT_TABLE_SPECS } from '../src/data/shujuku/combat-tables.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';
import { modelReply } from './helpers/combat-generation-fixture.js';
import { resolveSpriteAsset } from '../src/scene/asset-match.js';
import { effectiveSceneAssets, resolveAssetScope } from '../src/scene/asset-scope.js';
import { createCharacterDnaStore } from '../src/core/character-dna-store.js';
import { createAssetGenerationService } from '../src/generated-images/illustration/asset-generation-service.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { createStoryOutfitRuntime } from '../src/core/story-outfit-runtime.js';
import { localImageCacheFor } from '../src/media/tavern-image-cache.js';
import { numberParagraphs } from '../src/generated-images/illustration/marker-placer.js';
import { PROTAGONIST } from '../src/scene/stats/stat-engine.js';

function makeDom() {
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
    return { dom, document: dom.window.document, window: dom.window };
}

test('需求1：开启数值系统后左上角状态栏常驻显示（即使状态栏开关关闭、旁白页），主角说话不重复，关闭数值时恢复隐藏', () => {
    const { dom, document } = makeDom();
    try {
        const heroBlock = {
            name: '主角',
            metrics: [
                { key: '生命', label: '生命', value: 18, max: 20, percent: 90, text: '18/20' },
                { key: '体力', label: '体力', value: 80, max: 100, percent: 80, text: '80/100' },
            ],
        };
        const npcMetrics = [
            { key: '好感', label: '好感', value: 45, max: 100, percent: 45, text: '45' },
        ];
        let statsOn = true;
        const host = createIgsReaderHost({
            global: { document, window: dom.window },
            isStatsEnabled: () => statsOn,
            statsLookup: () => (statsOn ? (name) => (name === '白墨' ? { metrics: npcMetrics, stages: [] } : null) : null),
            statsProtagonistLookup: () => (statsOn ? (name) => (name === PROTAGONIST || name === '主角' ? { metrics: heroBlock.metrics, stages: [] } : null) : null),
            statsProtagonistBlock: () => (statsOn ? heroBlock : null),
            getUnifiedSettings: () => ({
                bridge: { sceneAssets: { enabled: true }, stats: { enabled: statsOn } },
                readerSettings: { titleScreen: false, statusHud: { enabled: false } },
            }),
        });
        try {
            // 1) 纯旁白页 + statusHud.enabled=false + statsOn=true -> 左上角状态栏常驻并显示主角条
            const narrationRaw = '<content>\n[igs-scene:古镇街道]\n薄雾笼罩着空荡的石板路。\n</content>';
            const opened = host.openReader({ messageId: 1, message: { id: 1, text: narrationRaw }, raw: narrationRaw }, { mode: 'fullscreen' });
            assert.equal(opened.ok, true);
            const hudEl = document.getElementById('igs-status-hud');
            assert.ok(hudEl);
            assert.equal(hudEl.hasAttribute('hidden'), false, '开启数值系统时旁白页状态栏必须可见');
            assert.equal(hudEl.classList.contains('igs-hud-no-avatar'), true);
            const snap1 = host.getState().activeReader.snapshot.content.statusHud;
            assert.equal(snap1.enabled, true);
            assert.equal(snap1.alwaysShow, true);
            assert.equal(snap1.hero?.metrics?.length, 2);

            // 2) 主角说话 -> 主角条只在主区出现一次，不重复叠加 hero 区
            const heroRaw = '<content>\n[igs-char:主角|平静|我们先出发吧。]\n</content>';
            host.openReader({ messageId: 2, message: { id: 2, text: heroRaw }, raw: heroRaw }, { mode: 'fullscreen' });
            const snap2 = host.getState().activeReader.snapshot.content.statusHud;
            assert.equal(snap2.metrics.length, 2, JSON.stringify({ speaker: host.getState().activeReader.snapshot.content.speaker, snap2 }));
            assert.equal(snap2.hero, undefined, '主角说话时不应重复展示第二个主角区块');

            // 3) NPC 说话 -> NPC 指标与主角常驻区块并存
            const npcRaw = '<content>\n[igs-char:白墨|微笑|欢迎回来。]\n</content>';
            host.openReader({ messageId: 3, message: { id: 3, text: npcRaw }, raw: npcRaw }, { mode: 'fullscreen' });
            const snap3 = host.getState().activeReader.snapshot.content.statusHud;
            assert.equal(snap3.metrics.some((m) => m.label === '好感'), true);
            assert.equal(snap3.hero?.metrics?.length, 2);

            // 4) 关闭数值系统且 statusHud.enabled=false -> 恢复隐藏
            statsOn = false;
            host.openReader({ messageId: 4, message: { id: 4, text: narrationRaw }, raw: narrationRaw }, { mode: 'fullscreen' });
            assert.equal(document.getElementById('igs-status-hud').hasAttribute('hidden'), true);
        } finally {
            host.destroy();
        }
    } finally {
        dom.window.close();
    }
});

test('需求2a：手机端与各阅读模式下 #igs-stats-chip 不被裁切或隐藏；重开阅读器创建新 dialog 后仍正常渲染；手填弹窗在 embedded 下挂到 body', () => {
    // 1) CSS 检查：默认外观、内嵌、日志、漫画、直播字幕都不隐藏/裁切 #igs-stats-chip
    const originalCss = getOriginalReaderStyleText();
    assert.match(originalCss, /\.igs-mode-embedded \.igs-dialog\{[^}]*overflow:visible/);
    assert.match(originalCss, /#igs-overlay\.igs-default-reader-chrome \.igs-dialog\{[^}]*overflow:visible/);
    assert.match(originalCss, /#igs-overlay\.igs-floating-mobile #igs-stats-chip/);
    assert.match(LOG_READER_STYLE_TEXT, /:not\(#igs-stats-chip\)/);
    assert.match(COMIC_STYLE_TEXT, /:not\(#igs-stats-chip\)/);
    assert.match(DANMAKU_STYLE_TEXT, /:not\(#igs-stats-chip\)/);

    // 2) stats-chip 跨 DOM 重建（关开阅读器/换楼/内嵌重挂）不能被旧 shown 缓存吞掉
    const { dom, document } = makeDom();
    try {
        let dialog = document.createElement('div');
        document.body.appendChild(dialog);
        const notice = { id: 'hero-init-mode', kind: 'onboarding', order: 0, text: '主角六维属性与擅长项尚未设定：自行填写还是自动生成？', actions: [['manual', '自行填写'], ['auto', '自动生成']] };
        const chip = createStatsChip({ getDialog: () => dialog, getNotices: () => [notice] });
        chip.sync();
        assert.equal(dialog.querySelectorAll('#igs-stats-chip .igs-stats-chip-btn').length, 2);

        // 模拟阅读器重开产生新的 #igs-dialog 元素
        dialog = document.createElement('div');
        document.body.appendChild(dialog);
        chip.sync();
        const rebuilt = dialog.querySelector('#igs-stats-chip');
        assert.ok(rebuilt);
        assert.equal(rebuilt.hasAttribute('hidden'), false);
        assert.equal(rebuilt.querySelectorAll('.igs-stats-chip-btn').length, 2, '重建 dialog 后必须重新渲染询问按钮');

        // 3) 内嵌模式下手填弹窗挂到 document.body，不被 .igs-embedded-root overflow:hidden 裁切
        const overlay = document.createElement('div');
        overlay.className = 'igs-mode-embedded';
        document.body.appendChild(overlay);
        const modal = createHeroManualModal(document, {
            getHeroName: () => '主角',
            getSkillCatalog: () => [],
            onSubmit: async () => ({ ok: true }),
        });
        assert.equal(modal.open(overlay).ok, true);
        const mounted = document.getElementById('igs-hero-manual-modal');
        assert.ok(mounted);
        assert.equal(mounted.parentElement, document.body, 'embedded 模式下手填弹窗应挂在 document.body');
        modal.close();
    } finally {
        dom.window.close();
    }
});

test('需求2b：可见 IGS 格式标签判定（忽略 thinking / 注释 / 被排除来源，识别全角与多种 IGS 标签）', () => {
    assert.equal(hasAnyIgsFormatTag('普通开场白，没有任何标签。'), false);
    assert.equal(hasAnyIgsFormatTag('[igs-scene:学院门口]'), true);
    assert.equal(hasAnyIgsFormatTag('【igs-char：绫音|微笑|你好】'), true);
    assert.equal(hasAnyIgsFormatTag('[igs-stat:好感|绫音|+5]'), true);
    assert.equal(hasAnyIgsFormatTag('<igs-combat>遭遇史莱姆</igs-combat>'), true);

    assert.equal(hasVisibleIgsTagInText('<thinking>[igs-scene:秘密]</thinking>\n正文没有标签。'), false);
    assert.equal(hasVisibleIgsTagInText('<!-- [igs-char:路人|平静|隐藏] -->\n正文没有标签。'), false);
    assert.equal(hasVisibleIgsTagInText('<draft>[igs-scene:草稿]</draft><story>真正正文</story>', { enabled: true, textIncludeTags: 'story', allowUntaggedFallback: false }), false);
    assert.equal(hasVisibleIgsTagInText('<draft>草稿</draft><story>[igs-scene:广场]\n真正正文</story>', { enabled: true, textIncludeTags: 'story', allowUntaggedFallback: false }), true);

    assert.equal(hasVisibleIgsTagOnLatestFloor([
        { is_user: false, mes: '[igs-scene:旧楼]' },
        { is_user: false, mes: '最新楼没有可见标签。<thinking>[igs-scene:隐藏]</thinking>' },
    ]), false);
    assert.equal(hasVisibleIgsTagOnLatestFloor([
        { is_user: false, mes: '旧楼没有标签' },
        { is_user: true, mes: '用户输入' },
        { is_user: false, mes: '[igs-char:绫音|平静|你好]' },
    ]), true);
});

test('需求2c：战斗与数值相关上下文提示词均包含用户输入', async () => {
    const worldCalls = [];
    const readStoryContext = createCombatStoryContext({
        SillyTavern: {
            getContext: () => ({
                chat: [
                    { is_user: true, mes: '我想扮演一名擅长剑术的流浪医生。' },
                    { is_user: false, mes: '[igs-scene:边境驿站]\n夜雨敲打着窗棂。' },
                    { is_user: true, mes: '我推开门查看外面的动静。' },
                ],
            }),
        },
    }, {
        resolveWorldInfo: async (arg) => { worldCalls.push(arg.previousText); return { ok: true, text: '' }; },
    });
    const ctx = await readStoryContext({ names: ['主角'] });
    assert.ok(ctx.story.includes('用户输入：我想扮演一名擅长剑术的流浪医生。'), '战斗上下文必须包含第一条用户输入');
    assert.ok(ctx.story.includes('用户输入：我推开门查看外面的动静。'), '战斗上下文必须包含最新用户输入');
    assert.ok(ctx.story.includes('剧情：夜雨敲打着窗棂。'), '战斗上下文应保留剧情正文');
    assert.ok(worldCalls[0].includes('流浪医生'), '世界书触发文本也应包含用户输入');

    const skillPrompt = buildHeroSkillRequest([{ name: PROTAGONIST, summary: '剑客' }], ['剑术'], { history: '用户：我想当一名潜行刺客。\n剧情：夜色降临。' });
    assert.ok(skillPrompt.user.includes('我想当一名潜行刺客'), 'buildHeroSkillRequest 必须包含用户输入历史');

    const backfillPrompt = buildBackfillRequest([{ name: '绫音', summary: '剑士' }], ['剑术'], { history: '用户：请问你擅长什么武器？\n剧情：她轻抚刀柄。' });
    assert.ok(backfillPrompt.user.includes('请问你擅长什么武器'), 'buildBackfillRequest 必须包含用户输入历史');

    const startRelPrompt = buildStartRelationRequest([{ name: '绫音', summary: '青梅竹马' }], { history: '用户：好久不见，绫音。\n剧情：她愣了一下。' });
    assert.ok(startRelPrompt.user.includes('好久不见，绫音'), 'buildStartRelationRequest 必须包含用户输入历史');
});

test('需求2d：数值与战斗在无可见 IGS 标签时不触发不建表；开开关/进对话/新楼带标签才触发；失败不建表，成功后先建表再插数据', async (t) => {
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    let chatId = 'chat-gate-1';
    let statsEnabled = true;
    let combatEnabled = true;
    const listeners = new Map();
    const emit = (k, ...args) => { for (const fn of [...(listeners.get(k) || [])]) fn(...args); };
    const ctx = {
        name1: '艾拉',
        name2: '小雪',
        chat: [{ is_user: false, mes: '普通开场白，主角尚未出场，也没有 IGS 标签。', swipe_id: 0 }],
        chatMetadata: {},
        extensionPrompts: {},
        saveMetadata() {},
        getCurrentChatId: () => chatId,
        eventTypes: {
            CHAT_CHANGED: 'cc', GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx',
            MESSAGE_SWIPED: 'ms', MESSAGE_DELETED: 'md', MESSAGE_UPDATED: 'mu', MESSAGE_EDITED: 'me',
        },
        eventSource: {
            on(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
            removeListener(k, fn) { listeners.get(k)?.delete(fn); },
        },
        setExtensionPrompt(k, value) { ctx.extensionPrompts[k] = { value }; },
    };
    const host = { AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => ctx } };
    const chatStore = createIgsChatStore({
        storage,
        api: () => host.AutoCardUpdaterAPI,
        chatId: () => chatId,
        userName: () => '艾拉',
        sourceFilter: () => undefined,
        chat: () => ctx.chat,
        evidence: (id) => readIgsChatEvidence({ context: ctx, chatId: id, storage }),
    });
    const combatServices = createCombatServices({
        global: host, storage, chatStore, getChatId: () => chatId, getUserName: () => '艾拉', getWallet: () => 1000,
        getReaderSettings: () => ({ combatExpansion: { enabled: combatEnabled, kind: 'both' } }),
        getAutoIllustration: () => ({ llm: { source: 'custom', endpoint: 'https://example.invalid/v1', apiKey: 'k', model: 'm' } }),
        readLore: async () => [],
        readStoryContext: async () => ({ story: '用户输入：我是剑士。\n剧情：微风吹过。' }),
        retryDelays: [],
        request: async (p) => {
            combatCalls.push(p);
            if (failCombat) throw new Error('combat-llm-failed');
            return modelReply(p);
        },
    });
    const statsCalls = [];
    const combatCalls = [];
    let failStats = true;
    let failCombat = true;
    const statsRuntime = createStatsRuntime({
        getContext: () => ctx,
        storage,
        generationIdentity: () => chatStore.get(),
        attributeAccess: () => chatStore.get().attributeAccess,
        statsTables: () => chatStore.get().statsAccess,
        currencyInventory: () => chatStore.get().inventory,
        currencyEditStorage: storage,
        readSettings: () => ({ enabled: statsEnabled, ruleset: 'coc7', sheetGen: 'off', backfill: 'off', autoSkill: false }),
        combatEnabled: () => combatEnabled,
        getBackgroundRequest: () => async (prompt) => {
            statsCalls.push(prompt);
            if (failStats) throw new Error('stats-llm-failed');
            return JSON.stringify({
                attributes: { 力量: 14, 敏捷: 13, 体质: 12, 智力: 11, 感知: 10, 魅力: 12 },
                bio: '来自边境的流浪剑士。',
                currency: { name: '金币', initial: 150, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
            });
        },
    });
    t.after(() => { combatServices.dispose(); statsRuntime.destroy(); });

    const sheetNames = () => Object.values(db.sheets).map((s) => s.name);
    const hasIgsStorageTable = () => sheetNames().includes(IGS_TABLE_SPECS.layout.name);
    const hasStatsLogTable = () => sheetNames().includes(IGS_TABLE_SPECS.stats.name);
    const hasAttrTable = () => sheetNames().includes(IGS_TABLE_SPECS.attribute.name);
    const hasCombatProfileTable = () => sheetNames().includes(COMBAT_TABLE_SPECS.profile.name);

    // 1) 无可见 IGS 标签的开场白 -> 数值和战斗都不启动，不弹窗，不请求，不建任何表
    statsRuntime.sync();
    const prep0 = await combatServices.prepareProtagonist();
    assert.equal(prep0.reason, 'combat-igs-tag-waiting');
    assert.equal(statsRuntime.notices().some((n) => n.id === 'hero-init-mode'), false, '无 IGS 标签时不应出现主角询问');
    assert.equal(statsCalls.length, 0);
    assert.equal(combatCalls.length, 0);
    assert.equal(hasIgsStorageTable(), false);
    assert.equal(hasStatsLogTable(), false);
    assert.equal(hasAttrTable(), false);
    assert.equal(hasCombatProfileTable(), false);

    // 2) 对话内关闭开关 -> 新楼出现 IGS 标签 -> 在对话内重新打开开关触发
    statsEnabled = false;
    statsRuntime.sync();
    ctx.chat.push({ is_user: true, mes: '我想成为一名擅长剑术的冒险者。' });
    ctx.chat.push({ is_user: false, mes: '[igs-scene:酒馆大厅]\n[igs-char:老板娘|微笑|欢迎光临。]', swipe_id: 0 });
    statsEnabled = true;
    statsRuntime.sync();
    assert.equal(statsRuntime.notices().some((n) => n.id === 'hero-init-mode'), true, '对话内打开开关且最新楼有可见 IGS 标签时必须触发主角询问');
    // 此时尚未生成成功，仍不得提前建任何表！
    assert.equal(hasIgsStorageTable(), false);
    assert.equal(hasStatsLogTable(), false);
    assert.equal(hasAttrTable(), false);

    // 3) 选择自动生成，但 LLM 失败 -> 仍不得建表或插数据
    const failRes = await statsRuntime.noticeAction('hero-init-mode', 'auto');
    assert.equal(failRes.ok, false);
    assert.equal(statsCalls.length, 1);
    assert.ok(String(statsCalls[0].user || '').includes('我想成为一名擅长剑术的冒险者'), '主角建档提示词必须包含用户输入');
    assert.equal(hasIgsStorageTable(), false, '生成失败不得建 IGS·存储 表');
    assert.equal(hasAttrTable(), false, '生成失败不得建 IGS数值·属性 表');
    assert.equal(hasStatsLogTable(), false, '生成失败不得建 IGS数值·日志 表');

    // 4) 重试自动生成，LLM 成功 -> 先自动建表再插数据（且维持 v2 布局）
    failStats = false;
    const okRes = await statsRuntime.retryCurrency();
    assert.equal(okRes.ok, true, JSON.stringify(okRes));
    assert.equal(hasIgsStorageTable(), true, '生成成功后应先建 IGS·存储 表');
    assert.equal(hasAttrTable(), true, '生成成功后应先建 IGS数值·属性 表并写入六维');
    assert.equal(hasStatsLogTable(), true, '生成成功后应建 IGS数值·日志 表并写入数据');
    assert.equal(hasCombatProfileTable(), false, '此时战斗未生成，不应建战斗表');

    // 5) 战斗主角生成：LLM 失败 -> 仍不建战斗档案表
    const combatFail = await combatServices.prepareProtagonist();
    assert.equal(combatFail.ok, false);
    assert.equal(combatCalls.length, 1);
    assert.equal(hasCombatProfileTable(), false, '战斗生成失败不得建 IGS战斗·档案 表');

    // 6) 战斗主角生成：LLM 成功 -> 先建战斗表再写入档案
    failCombat = false;
    const combatOk = await combatServices.prepareProtagonist({ manual: true });
    assert.equal(combatOk.ok, true, JSON.stringify(combatOk));
    assert.equal(hasCombatProfileTable(), true, '战斗生成成功后应先建 IGS战斗·档案 表再插入数据');

    // 7) 切换到新对话（进入对话发现最新楼有 IGS 标签且数据不存在）-> 自动触发主角询问
    chatId = 'chat-gate-2';
    const db2 = createLedgerMockHost({ supportCallbacks: true });
    db2.sheets.sheet_userbag = userInventorySheet();
    host.AutoCardUpdaterAPI = db2.api;
    ctx.chat = [
        { is_user: true, mes: '进入新世界' },
        { is_user: false, mes: '[igs-scene:星港]\n星舰缓缓停靠。', swipe_id: 0 },
    ];
    emit('cc', chatId);
    assert.equal(statsRuntime.notices().some((n) => n.id === 'hero-init-mode'), true, '进入新对话发现 IGS 标签但无数据时必须触发主角询问');
    assert.equal(Object.values(db2.sheets).some((s) => s.name === IGS_TABLE_SPECS.attribute.name), false, '进入对话触发询问前不得建表');
});

test('需求3：中途启用 IGS 后生成一楼，未有立绘的角色首登场服装立即建立立绘占位、设为默认并自动生图，其它服装归入该占位入库', async () => {
    // 1) 全角标签也能被 marker-placer 正确提取角色与服装
    const longLine1 = '欢迎回来，主人。今天外面的雨下了一整天，我已经把壁炉点着了，还泡好了你最喜欢的红茶，请先坐下来休息一会儿吧。';
    const longLine2 = '刚才那套黑丝女仆装的袖口不小心沾到了茶渍，所以我去楼上换了这套白色礼服，顺便把桌上的点心也重新摆盘了一遍，好看吗？';
    const floorText = [
        '<thinking>【igs-char：隐藏角色|平静|黑斗篷|不该出现】</thinking>',
        '[igs-scene:咖啡馆|白天|晴天]',
        `【igs-char：林雾|平静|黑丝女仆装|${longLine1}】`,
        `[igs-char:林雾|微笑|白色礼服|${longLine2}]`,
    ].join('\n');
    const parsedFullWidth = numberParagraphs('【igs-char：林雾|平静|黑丝女仆装|欢迎回来。】');
    assert.deepEqual(parsedFullWidth.characters, ['林雾']);

    // 2) 模拟中途启用：先禁用，后开启 sceneAssets.enabled = true，再由楼层准备 + 自动生图 + 剧情服装运行时协同处理
    const h = builtinImageHarness();
    h.bridge.autoIllustration.assets = { ...h.bridge.autoIllustration.assets, spriteEnabled: true, backgroundEnabled: false, maxPerFloor: 8 };
    let sceneAssets = {
        enabled: false,
        promptRule: '',
        scenes: {},
        characters: {},
        characterAliases: {},
        characterOutfits: {},
        characterDefaultOutfits: {},
        characterDna: {},
    };
    const saveAssets = (next) => {
        sceneAssets = structuredClone(next);
        return { ok: true };
    };
    const contextObj = {
        characterId: 0,
        characters: [{ name: '测试卡', avatar: 'test.png' }],
        name2: '测试卡',
        chat: [{ is_user: false, mes: floorText, swipe_id: 0 }],
        getCurrentChatId: () => 'chat-mid-enable',
    };
    const dnaStore = createCharacterDnaStore({
        readAssets: () => sceneAssets,
        readContext: () => contextObj,
        saveAssets,
    });
    const assetGlobal = { document: null };
    const mediaCache = localImageCacheFor(assetGlobal);
    const messageHost = {
        getChatId: () => 'chat-mid-enable',
        getMessageById: async () => ({ id: 0, text: floorText, swipeId: 0 }),
        readFloor: (id) => (Number(id) === 0 ? { id: 0, messageId: 0, swipeId: 0, chatId: 'chat-mid-enable', isAi: true, isLatest: true, text: floorText } : null),
        readPreviousAiTexts: () => [],
        readCharacterLore: () => [],
        on: () => () => {},
        onImageFloorReady: () => () => {},
    };
    const logs = [];
    const assetService = createAssetGenerationService({
        global: assetGlobal,
        mediaCache,
        messageHost,
        report: (level, message) => logs.push(`${level}:${message}`),
        getSettings: () => ({
            ...h.bridge,
            sceneAssets: effectiveSceneAssets(sceneAssets, resolveAssetScope(contextObj).key),
            autoIllustration: {
                ...h.bridge.autoIllustration,
                assets: { ...h.bridge.autoIllustration.assets, spriteEnabled: true, backgroundEnabled: false, maxPerFloor: 8 },
            },
        }),
        ensurePortraitPlaceholders: (entries) => dnaStore.ensurePortraitPlaceholders(entries),
        captureCharacterDnaTarget: (name) => dnaStore.capture(name),
        store: createMemoryGeneratedAssetStore(),
        llm: h.llm,
        nai: h.backend,
        matte: async (url) => url,
    });
    const storyOutfits = createStoryOutfitRuntime({
        storage: createMemoryStorage(),
        assets: assetService,
        messageHost,
        readContext: () => contextObj,
        readBridge: () => ({ sceneAssets }),
        ensurePortraitPlaceholders: (entries) => dnaStore.ensurePortraitPlaceholders(entries),
        saveAssets,
    });

    // 中途开启 IGS 素材系统！
    sceneAssets.enabled = true;

    // Step A: 走完整 processMessage(0) -> 自动建立立绘占位、将首登场服装设为默认、并把第二套服装挂到占位下入库候选
    const scopeKey = resolveAssetScope(contextObj).key;
    await storyOutfits.processMessage(0);
    const effective = effectiveSceneAssets(sceneAssets, scopeKey);
    assert.ok(effective.characters['林雾'], '必须自动建立林雾的立绘占位');
    assert.equal(Object.keys(effective.characters['林雾']).length, 0, '初始占位立绘映射为空');
    assert.equal(effective.characters['隐藏角色'], undefined, 'thinking 中的标签不得建立占位');
    assert.equal(effective.characterDefaultOutfits['林雾']?.outfitName, '黑丝女仆装', '首个登场服装必须设为默认服装');
    assert.ok(effective.characterOutfits['林雾']?.['黑丝女仆装'], '首个登场服装必须先占位建档');

    // Step B: 验证占位角色在未画完立绘时仍触发 needsGeneration=true，且有 tempSprite 时可立即显示
    const beforeSprite = resolveSpriteAsset('林雾', '平静', { sceneAssets: effective }, '黑丝女仆装');
    assert.equal(beforeSprite.needsGeneration, true, '空占位角色必须继续触发立绘自动生成');
    const withTemp = resolveSpriteAsset('林雾', '平静', { sceneAssets: effective, tempSprite: () => 'data:image/png;base64,TEMP' }, '黑丝女仆装');
    assert.equal(withTemp.url, 'data:image/png;base64,TEMP', '空占位角色在拿到临时立绘后应立即显示');
    assert.equal(withTemp.source, 'temp');

    // Step C: storyOutfits.list() 只把第二套服装（白色礼服）入库，不重复收录默认服装（黑丝女仆装）
    const rows = storyOutfits.list();
    assert.deepEqual(rows.map((r) => [r.character, r.word]), [['林雾', '白色礼服']], '首套默认服装不重复排队，第二套服装应按角色占位入库');

    // Step D: assetGenerationService.processMessage(0) 即使之前未调用 start()（中途启用），也自动初始化并生成立绘
    const genResult = await assetService.processMessage(0);
    assert.equal(genResult?.ok, true, JSON.stringify({ genResult, logs, writes: h.writes.length, wires: h.wires.length }));
    assert.ok(h.writes.length >= 1, `应触发立绘写词: ${JSON.stringify(genResult)}`);
    assert.ok(h.wires.length >= 1, `中途启用后应自动为占位角色生成默认立绘: ${JSON.stringify(genResult)}`);
    const afterAssets = effectiveSceneAssets(sceneAssets, scopeKey);
    assert.ok(afterAssets.characterDna['林雾'], '立绘生成后应保存林雾 DNA');
    assert.ok(assetService.tempSprite('林雾'), '林雾默认立绘生成后应立即产生待确认临时立绘');
    // Step E: 将第二套服装（白色礼服）按该角色立绘占位入库衣柜
    const adopted = await storyOutfits.adopt(rows[0].id, 'save');
    assert.equal(adopted?.ok, true, JSON.stringify(adopted));
    const finalAssets = effectiveSceneAssets(sceneAssets, scopeKey);
    assert.ok(finalAssets.characterOutfits['林雾']?.['黑丝女仆装'], '默认服装应保留在林雾名下');
    assert.ok(finalAssets.characterOutfits['林雾']?.['白色礼服'], '第二套服装应挂在林雾立绘占位下入库');
    assert.equal(finalAssets.characterDefaultOutfits['林雾']?.outfitName, '黑丝女仆装', '默认服装仍为首次登场服装');
    await mediaCache.destroy();
});

test('需求4：旁白按句分页与对白/心理话按句分页默认勾选，且对旧配置执行强制一次性覆盖开启并允许用户后续手动关闭', async (t) => {
    // 1) 全新配置（空对象）默认两个选项都开启，且带最新迁移版本号
    const freshNormalized = normalizeBridgeConfig({});
    assert.equal(freshNormalized.sentencePaging, true);
    assert.equal(freshNormalized.dialogueSentencePaging, true);
    assert.equal(freshNormalized.sentencePagingMigrationVersion, SENTENCE_PAGING_MIGRATION_VERSION);

    // 2) 未带迁移版本号的旧配置即使显式关闭，也被规范化强制覆盖为开启
    const legacyNormalized = normalizeBridgeConfig({ sentencePaging: false, dialogueSentencePaging: false });
    assert.equal(legacyNormalized.sentencePaging, true);
    assert.equal(legacyNormalized.dialogueSentencePaging, true);
    assert.equal(legacyNormalized.sentencePagingMigrationVersion, SENTENCE_PAGING_MIGRATION_VERSION);

    // 3) 已带迁移版本号的配置尊重用户手动关闭
    const userClosed = normalizeBridgeConfig({
        sentencePaging: false,
        dialogueSentencePaging: false,
        sentencePagingMigrationVersion: SENTENCE_PAGING_MIGRATION_VERSION,
    });
    assert.equal(userClosed.sentencePaging, false);
    assert.equal(userClosed.dialogueSentencePaging, false);

    // 4) 端到端 bootstrapIGS：写入失败时不落盘版本标记；恢复后一次性强制覆盖落盘；用户再次手动关闭后跨重启保留
    const { dom, document } = makeDom();
    t.after(() => dom.window.close());
    const mockSt = { getContext: () => ({ chat: [], chatMetadata: {}, setExtensionPrompt() {}, saveMetadata() {} }) };
    const makeGlobal = (storage) => ({
        document, localStorage: storage, SillyTavern: mockSt,
        Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
        dispatchEvent: dom.window.dispatchEvent.bind(dom.window),
        addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window),
    });

    // 4a) 写入失败：旧存储保持原样，不写入版本标记
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({ sentencePaging: false, dialogueSentencePaging: false, debug: true }),
    });
    const rawSet = storage.setItem.bind(storage);
    let blockWrites = true;
    storage.setItem = (k, v) => { if (blockWrites) throw new Error('quota-exceeded'); return rawSet(k, v); };
    const appFailed = bootstrapIGS({ global: makeGlobal(storage), autoAttachMagicWand: false, tavernSettingsSync: false });
    await appFailed.shutdown();
    const afterFailed = JSON.parse(storage.getItem('igs_bridge_config'));
    assert.equal(afterFailed.sentencePaging, false);
    assert.equal(afterFailed.dialogueSentencePaging, false);
    assert.equal(afterFailed.sentencePagingMigrationVersion, undefined);

    // 4b) 存储恢复后启动：强制一次性覆盖开启并落盘版本标记，保留其余无关字段
    blockWrites = false;
    const appMigrated = bootstrapIGS({ global: makeGlobal(storage), autoAttachMagicWand: false, tavernSettingsSync: false });
    t.after(() => appMigrated.shutdown());
    const afterMigrated = JSON.parse(storage.getItem('igs_bridge_config'));
    assert.equal(afterMigrated.sentencePaging, true, '旧配置旁白分页必须被一次性强制开启');
    assert.equal(afterMigrated.dialogueSentencePaging, true, '旧配置对白/心理话分页必须被一次性强制开启');
    assert.equal(afterMigrated.sentencePagingMigrationVersion, SENTENCE_PAGING_MIGRATION_VERSION);
    assert.equal(afterMigrated.debug, true, '无关配置项不得丢失');
    const unified = appMigrated.getUnifiedSettings();
    assert.equal(unified.bridge.sentencePaging, true);
    assert.equal(unified.bridge.dialogueSentencePaging, true);

    // 4c) 打开设置页：两个复选框已默认勾选；用户手动取消勾选保存后，跨重启不得再次强制覆盖
    const settings = appMigrated.openSettings({ page: 'perf' });
    assert.equal(settings.ok, true);
    assert.equal(settings.controller.getSnapshot().draft.bridge.sentencePaging, true);
    assert.equal(settings.controller.getSnapshot().draft.bridge.dialogueSentencePaging, true);
    assert.equal(settings.controller.setValue('bridge.sentencePaging', false).ok, true);
    assert.equal(settings.controller.setValue('bridge.dialogueSentencePaging', false).ok, true);
    assert.equal(settings.controller.close().ok, true);
    await appMigrated.shutdown();

    const appRestarted = bootstrapIGS({ global: makeGlobal(storage), autoAttachMagicWand: false, tavernSettingsSync: false });
    t.after(() => appRestarted.shutdown());
    const persistedAfterRestart = JSON.parse(storage.getItem('igs_bridge_config'));
    assert.equal(persistedAfterRestart.sentencePaging, false, '一次性迁移完成后用户再次关闭不得被覆盖');
    assert.equal(persistedAfterRestart.dialogueSentencePaging, false, '一次性迁移完成后用户再次关闭不得被覆盖');
    assert.equal(appRestarted.getUnifiedSettings().bridge.sentencePaging, false);
    assert.equal(appRestarted.getUnifiedSettings().bridge.dialogueSentencePaging, false);

    // 5) 全新空存储：默认开启且不提前污染空 localStorage，用户首次显式关闭并保存后也持久保留
    const emptyStorage = createMemoryStorage();
    const appFresh = bootstrapIGS({ global: makeGlobal(emptyStorage), autoAttachMagicWand: false, tavernSettingsSync: false });
    t.after(() => appFresh.shutdown());
    assert.equal(emptyStorage.getItem('igs_bridge_config'), null);
    assert.equal(appFresh.getUnifiedSettings().bridge.sentencePaging, true);
    assert.equal(appFresh.getUnifiedSettings().bridge.dialogueSentencePaging, true);
    const freshSettings = appFresh.openSettings({ page: 'perf' });
    assert.equal(freshSettings.ok, true);
    assert.equal(freshSettings.controller.getSnapshot().draft.bridge.sentencePaging, true);
    assert.equal(freshSettings.controller.getSnapshot().draft.bridge.dialogueSentencePaging, true);
    assert.equal(freshSettings.controller.setValue('bridge.sentencePaging', false).ok, true);
    assert.equal(freshSettings.controller.close().ok, true);
    await appFresh.shutdown();

    const appFreshRestarted = bootstrapIGS({ global: makeGlobal(emptyStorage), autoAttachMagicWand: false, tavernSettingsSync: false });
    t.after(() => appFreshRestarted.shutdown());
    assert.equal(appFreshRestarted.getUnifiedSettings().bridge.sentencePaging, false);
    assert.equal(appFreshRestarted.getUnifiedSettings().bridge.dialogueSentencePaging, true);
});

test('回归：切聊天与 shujuku 重载竞态、igs_stats_declined 与并发生成不报 igs-layout-conflict，并正常建表落盘', async (t) => {
    const createStatsFixture = ({ chatId: initialChatId, chatMetadata = {}, chat, llmHandler }) => {
        const db = createLedgerMockHost({ supportCallbacks: true });
        db.sheets.sheet_userbag = userInventorySheet();
        const tableCallbacks = new Set();
        const origRegister = db.api.registerTableUpdateCallback;
        const origUnregister = db.api.unregisterTableUpdateCallback;
        db.api.registerTableUpdateCallback = (cb) => { tableCallbacks.add(cb); origRegister?.(cb); };
        db.api.unregisterTableUpdateCallback = (cb) => { tableCallbacks.delete(cb); origUnregister?.(cb); };
        const notifyTable = (data) => { for (const cb of [...tableCallbacks]) cb(data); };
        const storage = createMemoryStorage();
        let chatId = initialChatId;
        const listeners = new Map();
        const emit = (k, ...args) => { for (const fn of [...(listeners.get(k) || [])]) fn(...args); };
        const ctx = {
            name1: '阿不思',
            name2: '小雪',
            chat: chat || [{ is_user: false, mes: '[igs-scene:山脉|傍晚]\n铅灰色的云层压在苍白山脉南麓。', swipe_id: 0 }],
            chatMetadata,
            extensionPrompts: {},
            saveMetadata() {},
            getCurrentChatId: () => chatId,
            eventTypes: {
                CHAT_CHANGED: 'cc', GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx',
                MESSAGE_SWIPED: 'ms', MESSAGE_DELETED: 'md', MESSAGE_UPDATED: 'mu', MESSAGE_EDITED: 'me',
            },
            eventSource: {
                on(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
                removeListener(k, fn) { listeners.get(k)?.delete(fn); },
            },
            setExtensionPrompt(k, value) { ctx.extensionPrompts[k] = { value }; },
        };
        const host = { AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => ctx } };
        const chatStore = createIgsChatStore({
            storage,
            api: () => host.AutoCardUpdaterAPI,
            chatId: () => chatId,
            userName: () => '阿不思',
            sourceFilter: () => undefined,
            chat: () => ctx.chat,
            evidence: (id) => readIgsChatEvidence({ context: ctx, chatId: id, storage }),
        });
        const rt = createStatsRuntime({
            getContext: () => ctx,
            storage,
            generationIdentity: () => chatStore.get(),
            attributeAccess: () => chatStore.get().attributeAccess,
            statsTables: () => chatStore.get().statsAccess,
            currencyInventory: () => chatStore.get().inventory,
            currencyEditStorage: storage,
            getPushClient: () => ({
                readTables: () => ({ ok: true, data: db.api.exportTableAsJson() }),
                registerCallback: (cb) => db.api.registerTableUpdateCallback(cb),
                unregisterCallback: (cb) => db.api.unregisterTableUpdateCallback(cb),
            }),
            readSettings: () => ({ enabled: true, ruleset: 'coc7', sheetGen: 'auto', backfill: 'off', autoSkill: false }),
            getBackgroundRequest: () => llmHandler || (async (prompt) => {
                const text = `${prompt?.system || ''}\n${prompt?.user || ''}`;
                if (text.includes('可分配技能')) {
                    return JSON.stringify({ 侦查: '精通', 聆听: '熟练', 图书馆: '熟练', 潜行: '入门', 闪避: '入门' });
                }
                return JSON.stringify({
                    attributes: { 力量: 12, 敏捷: 13, 体质: 11, 智力: 15, 感知: 14, 魅力: 12 },
                    bio: '行于苍白山脉的旅人。',
                    currency: { name: '银币', initial: 80, prices: { 少量: 5, 普通: 20, 昂贵: 80, 巨额: 400 }, rate: 1 },
                });
            }),
        });
        t.after(() => { rt.destroy(); chatStore.dispose(); });
        const sheetNames = () => Object.values(db.sheets).map((s) => s.name);
        return {
            db, storage, ctx, chatStore, rt, emit, sheetNames, notifyTable,
            setChat(nextId, nextChat, nextMeta = {}) {
                chatId = nextId;
                ctx.chat = nextChat;
                ctx.chatMetadata = nextMeta;
            },
        };
    };

    // 1) CHAT_CHANGED 竞态：Chat A 已有 v2 标记与数据；切到新聊天 Chat B 时 IGS 先于 shujuku 读到 Chat A 的旧表，
    // 随后 shujuku 先清空为 {} 并通知回调，再延迟加载 Chat B 空白表；Chat B 不得报 igs-layout-conflict，且生成后正常建表落盘。
    {
        const f = createStatsFixture({ chatId: 'chat-race-a' });
        f.rt.sync();
        const resA = await f.rt.noticeAction('hero-init-mode', 'auto');
        assert.equal(resA.ok, true, JSON.stringify(resA));
        await f.rt.whenSaved();
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.layout.name), 'Chat A 已写入 v2 标记表');

        // 切换到 Chat B：此时 db.sheets 仍是 Chat A 的旧表（模拟 shujuku CHAT_CHANGED 还没跑）
        f.setChat('chat-race-b', [{ is_user: false, mes: '[igs-scene:山脉|傍晚]\n新开局第一层。', swipe_id: 0 }], {});
        f.chatStore.reset();
        f.emit('cc');

        // 1ms 后 shujuku 执行 clearDerivedRuntimeState_ACU + notifyRuntimeTableCleared_ACU({})
        const savedSheets = f.db.sheets;
        const origExport = f.db.api.exportTableAsJson;
        let runtimeCleared = true;
        f.db.api.exportTableAsJson = () => (runtimeCleared ? {} : origExport());
        f.notifyTable({});

        // 1200ms 后 shujuku 完成 Chat B 的空白模板加载并通知回调
        for (const k of Object.keys(savedSheets)) delete savedSheets[k];
        savedSheets.sheet_userbag = userInventorySheet();
        runtimeCleared = false;
        f.db.api.exportTableAsJson = origExport;
        f.notifyTable(f.db.api.exportTableAsJson());

        // Chat B 点击自动生成 + 按人设生成：均不得报 igs-layout-conflict，且必须正常建表与落盘
        const resB = await f.rt.noticeAction('hero-init-mode', 'auto');
        assert.equal(resB.ok, true, `Chat B 自动生成失败：${JSON.stringify(resB)}`);
        await f.rt.whenSaved();
        const noticesB = f.rt.notices();
        assert.equal(noticesB.some((n) => String(n.text || '').includes('igs-layout-conflict')), false, JSON.stringify(noticesB));
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.layout.name), 'Chat B 必须创建 IGS·存储');
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.attribute.name), 'Chat B 必须创建 IGS数值·属性');
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.stats.name), 'Chat B 必须创建 IGS数值·日志');
    }

    // 2) 历史聊天带 igs_stats_declined = true 且无旧表记录：延迟建表下启用后删除 declined 标记不得触发 igs-layout-conflict
    {
        const f = createStatsFixture({ chatId: 'chat-declined-v2', chatMetadata: { igs_stats_declined: true } });
        f.rt.sync();
        assert.equal(f.rt.isChatEnabled(), true);
        assert.equal(f.ctx.chatMetadata.igs_stats_declined, undefined, '启用后旧 declined 标记已清除');
        assert.equal(f.sheetNames().includes(IGS_TABLE_SPECS.layout.name), false, '延迟建表：未生成前不提前建表');

        const res = await f.rt.noticeAction('hero-init-mode', 'auto');
        assert.equal(res.ok, true, `declined 聊天自动生成失败：${JSON.stringify(res)}`);
        await f.rt.whenSaved();
        const notices = f.rt.notices();
        assert.equal(notices.some((n) => String(n.text || '').includes('igs-layout-conflict')), false, JSON.stringify(notices));
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.layout.name));
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.attribute.name));
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.stats.name));
    }

    // 3) 空白聊天并发执行 ensureHeroInit 与 assignHeroSkills（双方均在零表状态下并发起请求，且技能先回包）：
    //    不得产生 igs-layout-conflict 或 stats-generation-log-conflict，两份生成结果均建表落盘。
    {
        let releaseHeroInit;
        const heroInitGate = new Promise((resolve) => { releaseHeroInit = resolve; });
        const f = createStatsFixture({
            chatId: 'chat-concurrent-fresh',
            llmHandler: async (prompt) => {
                const text = `${prompt?.system || ''}\n${prompt?.user || ''}`;
                if (text.includes('可分配技能')) {
                    return JSON.stringify({ 侦查: '精通', 聆听: '熟练', 图书馆: '熟练', 潜行: '入门', 闪避: '入门' });
                }
                await heroInitGate;
                return JSON.stringify({
                    attributes: { 力量: 14, 敏捷: 12, 体质: 12, 智力: 13, 感知: 11, 魅力: 10 },
                    bio: '并发测试主角。',
                    currency: { name: '金币', initial: 120, prices: { 少量: 5, 普通: 20, 昂贵: 100, 巨额: 500 }, rate: 1 },
                });
            },
        });
        f.rt.sync();
        const heroPromise = f.rt.noticeAction('hero-init-mode', 'auto');
        const skillPromise = f.rt.noticeAction('hero-pick', 'assign');
        const skillRes = await skillPromise;
        assert.equal(skillRes.ok, true, `并发 assignHeroSkills 失败：${JSON.stringify(skillRes)}`);
        releaseHeroInit();
        const heroRes = await heroPromise;
        assert.equal(heroRes.ok, true, `并发 ensureHeroInit 失败：${JSON.stringify(heroRes)}`);
        await f.rt.whenSaved();
        const notices = f.rt.notices();
        assert.equal(notices.some((n) => String(n.text || '').includes('igs-layout-conflict')), false, JSON.stringify(notices));
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.layout.name));
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.attribute.name));
        assert.ok(f.sheetNames().includes(IGS_TABLE_SPECS.stats.name));
        assert.equal(f.rt.currencyBalance(), 120);
        assert.equal(f.rt.archive()?.currency?.ready, true);
        assert.equal(f.rt.getCatalog().heroAssigned, true);
    }

    // 4) 首楼重摇/清表回到干净空白态可恢复重建；真正的布局冲突与缺标记业务行仍必须 fail-closed 拦截
    {
        const db = createLedgerMockHost({ supportCallbacks: true });
        db.sheets.sheet_userbag = userInventorySheet();
        const storage = createMemoryStorage();
        const ctx = { chatId: 'chat-conflict-guard', chat: [], chatMetadata: {}, getCurrentChatId: () => 'chat-conflict-guard' };
        const chatStore = createIgsChatStore({
            storage,
            api: () => db.api,
            chatId: () => ctx.chatId,
            chat: () => ctx.chat,
            evidence: (id) => readIgsChatEvidence({ context: ctx, chatId: id, storage }),
        });
        t.after(() => chatStore.dispose());
        const owner = chatStore.get();
        // 先确认 v2 并写入标记与属性表
        assert.equal((await owner.attributes.ensure()).ok, true);
        assert.equal(owner.layout().marked, true);

        // 4a) 若完全清空 IGS 表（模拟首楼被重摇/清表或无空回调的切聊天），回到干净空白态可恢复重建
        for (const k of Object.keys(db.sheets)) if (k !== 'sheet_userbag') delete db.sheets[k];
        owner.client.invalidate();
        const recoveredEmpty = owner.layout();
        assert.equal(recoveredEmpty.ok, true);
        assert.equal(recoveredEmpty.layout, 'v2');
        assert.equal(recoveredEmpty.marked, false);
        assert.equal((await owner.attributes.ensure()).ok, true);
        assert.equal(owner.layout().marked, true);

        // 4b) 真正冲突 1：v2 已确认后，标记丢失但 v2 业务表仍有数据行 -> 必须拦截 igs-layout-marker-missing
        const attrKey = Object.keys(db.sheets).find((k) => db.sheets[k].name === IGS_TABLE_SPECS.attribute.name);
        const layoutKey = Object.keys(db.sheets).find((k) => db.sheets[k].name === IGS_TABLE_SPECS.layout.name);
        db.sheets[attrKey].content.push(['r1', 'hero-base|x', 'x', 'hero-base', '', '1', '初始化', '1/1', '{"scores":{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}}']);
        db.sheets[layoutKey].content = [db.sheets[layoutKey].content[0]];
        owner.client.invalidate();
        assert.equal(owner.layout().reason, 'igs-layout-marker-missing');

        // 4c) 真正冲突 2：v2 已确认后，标记丢失且出现旧表数据行 -> 必须拦截 igs-layout-conflict
        delete db.sheets[attrKey];
        delete db.sheets[layoutKey];
        db.sheets[COMBAT_TABLE_SPECS.stats.uid] = {
            uid: COMBAT_TABLE_SPECS.stats.uid,
            name: COMBAT_TABLE_SPECS.stats.name,
            content: [
                ['row_id', ...COMBAT_TABLE_SPECS.stats.columns],
                ['r1', 'init-1', '', 'init', '', '1', '', '1/1', '{"state":{"protagonist":{"skills":{}},"characters":{}}}'],
            ],
        };
        owner.client.invalidate();
        assert.equal(owner.layout().reason, 'igs-layout-conflict');
    }
});
