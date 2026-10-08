import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { DEFAULT_SCENE_PROMPT_RULE, PROMPT_RULE_OFF_HINT, PROMPT_RULE_PRESET_HINT } from '../src/visual/igs-ui/reader-host-constants.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { searchSettings } from '../src/visual/igs-ui/settings-search.js';
import { scenePromptRuleEnabled } from '../src/scene/prompt-rule-content.js';

const MAIN = 'igs-scene-assets-format-rule';
const DEPTH0 = 'igs-scene-assets-depth0';

function mountWithHost({ sceneAssets = {}, readerSettings = {} } = {}) {
    const extensionPrompts = {};
    const handlers = new Map();
    const context = {
        chat: [],
        name2: '林小雨',
        extensionPrompts,
        event_types: { CHAT_CHANGED: 'chat_changed', GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended' },
        eventSource: {
            on(name, fn) { handlers.set(name, [...(handlers.get(name) || []), fn]); },
            removeListener(name, fn) { handlers.set(name, (handlers.get(name) || []).filter((h) => h !== fn)); },
        },
        setExtensionPrompt(key, value, position, depth, scan, role) {
            if (value) extensionPrompts[key] = { value, position, depth, scan, role };
            else delete extensionPrompts[key];
        },
    };
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({ sceneAssets: { enabled: true, promptRule: DEFAULT_SCENE_PROMPT_RULE, scenes: {}, characters: {}, ...sceneAssets } }),
        'igs-reader-settings-v9-default': JSON.stringify(readerSettings),
    });
    const vn = bootstrapIGS({
        global: { localStorage: storage, SillyTavern: { getContext: () => context }, setTimeout: () => 0, clearTimeout() {} },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => ({ id: 1, text: '旁白。' }), typeAndSend: async () => ({ ok: true }) },
    });
    const emit = (name, ...args) => { for (const fn of handlers.get(name) || []) fn(...args); };
    return { vn, extensionPrompts, emit, storage };
}

test('gate:prompt-rule:enabled-unless-explicitly-false', () => {
    assert.equal(scenePromptRuleEnabled({}), true);
    assert.equal(scenePromptRuleEnabled({ promptRuleEnabled: true }), true);
    assert.equal(scenePromptRuleEnabled({ promptRuleEnabled: false }), false);
    assert.equal(scenePromptRuleEnabled(null), false);
});

test('gate:prompt-rule:off-drops-scene-block-and-keeps-other-grammar', () => {
    const on = mountWithHost({ readerSettings: { chatShow: { enabled: true } } });
    const off = mountWithHost({ sceneAssets: { promptRuleEnabled: false }, readerSettings: { chatShow: { enabled: true } } });
    try {
        on.emit('chat_changed');
        off.emit('chat_changed');
        assert.match(on.extensionPrompts[MAIN].value, /【场景与台词】/);
        const value = off.extensionPrompts[MAIN].value;
        assert.doesNotMatch(value, /【场景与台词】|igs-char:角色名/);
        assert.match(value, /\[igs标签语法\]/);
        assert.match(value, /线上聊天 igs-chat/);
    } finally {
        on.vn.destroy();
        off.vn.destroy();
    }
});

test('gate:prompt-rule:off-with-nothing-else-clears-both-prompts', () => {
    const { vn, extensionPrompts, emit } = mountWithHost({ sceneAssets: { promptRuleEnabled: false } });
    try {
        emit('chat_changed');
        emit('generation_started', 'normal', {}, false);
        assert.equal(Object.hasOwn(extensionPrompts, MAIN), false);
        assert.equal(Object.hasOwn(extensionPrompts, DEPTH0), false);
    } finally {
        vn.destroy();
    }
});

test('gate:prompt-rule:off-also-applies-to-legacy-full-concatenation', () => {
    const { vn, extensionPrompts, emit } = mountWithHost({ sceneAssets: { promptRuleEnabled: false, promptAdaptive: false }, readerSettings: { chatShow: { enabled: true } } });
    try {
        emit('chat_changed');
        const value = extensionPrompts[MAIN].value;
        assert.doesNotMatch(value, /\[表情词约束\]|igs-char:角色名/);
        assert.match(value, /igs-chat/);
    } finally {
        vn.destroy();
    }
});

test('gate:prompt-rule:settings-switch-shows-reminder-and-stops-injection', async () => {
    const { vn, extensionPrompts, storage, emit } = mountWithHost();
    try {
        const opened = await vn.openLatestAvailable('pc');
        emit('chat_changed');
        assert.match(extensionPrompts[MAIN].value, /【场景与台词】/);
        let settings = (await opened.reader.controller.invokeAction('settings')).controller;
        settings.switchTab('scene');
        let html = settings.switchSceneSubTab('rules').snapshot.html;
        assert.match(html, /AI 格式规则<span class="igs-outfit-muted">发给聊天模型<\/span>/);
        assert.match(html, /class="igs-switch is-on" data-switch="bridge\.sceneAssets\.promptRuleEnabled" aria-pressed="true"><i><\/i><span>自动注入格式规则</);
        assert.ok(html.includes(PROMPT_RULE_PRESET_HINT));
        assert.match(html, /data-action="copy-prompt-rule"[^>]*>复制到酒馆预设</);

        settings.toggle('bridge.sceneAssets.promptRuleEnabled');
        html = settings.getSnapshot().html;
        assert.match(html, /AI 格式规则<span class="igs-outfit-muted">已关闭<\/span>/);
        assert.match(html, /class="igs-switch" data-switch="bridge\.sceneAssets\.promptRuleEnabled" aria-pressed="false"/);
        assert.ok(html.includes(PROMPT_RULE_OFF_HINT));
        assert.match(html, /data-prompt-rule-draft="1"/, '关闭后仍可编辑和复制规则');
        assert.equal(settings.close().ok, true);

        assert.equal(JSON.parse(storage.getItem('igs_bridge_config')).sceneAssets.promptRuleEnabled, false);
        assert.equal(Object.hasOwn(extensionPrompts, MAIN), false);
        assert.equal(Object.hasOwn(extensionPrompts, DEPTH0), false);

        settings = (await opened.reader.controller.invokeAction('settings')).controller;
        settings.switchTab('scene');
        settings.switchSceneSubTab('rules');
        settings.toggle('bridge.sceneAssets.promptRuleEnabled');
        assert.equal(settings.close().ok, true);
        assert.match(extensionPrompts[MAIN].value, /【场景与台词】/);
    } finally {
        vn.destroy();
    }
});

function copyCtx({ sceneAssets = {}, asyncState = {}, clipboardOk = true, tavern = null } = {}) {
    const calls = { clip: null, dialogs: [], rerender: 0 };
    const draft = {
        bridge: {
            sceneAssets: {
                enabled: true,
                promptRule: DEFAULT_SCENE_PROMPT_RULE,
                moodGroups: [{ label: '开心', words: ['微笑', '大笑'] }, { label: '难过', words: ['低落'] }],
                timeGroups: [{ label: '傍晚', words: ['黄昏'] }],
                weatherGroups: [],
                scenes: { 教室: { url: '', words: ['课室'], times: {} } },
                characterOutfits: { 林小雨: { 校服: { note: '上学' }, 睡衣: {} } },
                characters: {},
                ...sceneAssets,
            },
        },
        readerSettings: {},
    };
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState } },
        options: {
            global: {
                navigator: { clipboard: { writeText: async (text) => { if (!clipboardOk) throw new Error('denied'); calls.clip = text; } } },
                ...(tavern ? { SillyTavern: { getContext: () => tavern } } : {}),
            },
        },
        dialogs: { edit: async (message, value, opts) => { calls.dialogs.push({ message, value, opts }); return value; }, confirm: async () => true },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => { calls.rerender += 1; return { ok: true }; },
        buildRegexPreview: () => '',
    };
    return { ctx, calls, asyncState, draft };
}

test('gate:prompt-rule:copy-gives-a-standalone-rule-with-word-lists-filled-in', async () => {
    const { ctx, calls, asyncState } = copyCtx();
    const result = await handleSettingsAction('copy-prompt-rule', ctx);
    assert.equal(result.ok, true);
    const text = calls.clip;
    assert.ok(text.startsWith('[igs标签语法]'), text.slice(0, 30));
    assert.match(text, /通用规则：每条标签独占一行/);
    assert.match(text, /【场景与台词】/);
    assert.match(text, /开心组：微笑、大笑\n难过组：低落/);
    assert.match(text, /傍晚组：黄昏/);
    assert.match(text, /教室组：课室/);
    assert.match(text, /林小雨：校服（上学） \/ 睡衣|林小雨[\s\S]*校服[\s\S]*睡衣/);
    assert.match(text, /示例：\n\[igs-scene:教室\|傍晚\|晴天\]\n\[igs-char:林小雨\|微笑\|校服\|/);
    assert.doesNotMatch(text, /\{\{\w+\}\}/);
    assert.doesNotMatch(text, /\n{3,}/);
    assert.doesNotMatch(text, /【按需】/);
    assert.equal(calls.dialogs.length, 1);
    assert.equal(calls.dialogs[0].value, text);
    assert.match(calls.dialogs[0].message, /已复制到剪贴板[\s\S]*粘贴后请关闭「自动注入格式规则」/);
    assert.equal(calls.dialogs[0].opts.okLabel, '关闭');
    assert.equal(asyncState.promptRuleStatus, '已复制词表展开后的完整规则。');
    assert.equal(calls.rerender, 1);
});

test('gate:prompt-rule:copy-uses-unsaved-draft-and-skips-turn-off-hint-when-already-off', async () => {
    const { ctx, calls } = copyCtx({ sceneAssets: { promptRuleEnabled: false }, asyncState: { promptRuleDraft: '自定义规则\n表情：\n{{mood_groups}}' } });
    await handleSettingsAction('copy-prompt-rule', ctx);
    assert.match(calls.clip, /自定义规则\n表情：\n开心组：微笑、大笑/);
    assert.doesNotMatch(calls.clip, /【场景与台词】/);
    assert.doesNotMatch(calls.dialogs[0].message, /请关闭/);
});

test('gate:prompt-rule:copy-follows-the-open-card-library', async () => {
    const { ctx, calls } = copyCtx({
        sceneAssets: { cards: { 'card:卡甲': { scenes: { 天台: { url: '', words: ['屋顶'], times: {} } } } } },
        tavern: { name2: '卡甲' },
    });
    await handleSettingsAction('copy-prompt-rule', ctx);
    assert.match(calls.clip, /教室组：课室/);
    assert.match(calls.clip, /天台组：屋顶/);
});

test('gate:prompt-rule:copy-failure-still-shows-the-full-text-for-manual-copy', async () => {
    const { ctx, calls, asyncState } = copyCtx({ clipboardOk: false });
    await handleSettingsAction('copy-prompt-rule', ctx);
    assert.equal(calls.clip, null);
    assert.match(calls.dialogs[0].message, /复制失败，请手动全选下方内容后复制/);
    assert.match(calls.dialogs[0].value, /【场景与台词】/);
    assert.equal(asyncState.promptRuleStatus, '复制失败，请在弹窗中手动复制。');
});

test('gate:prompt-rule:save-status-says-nothing-is-sent-while-off', async () => {
    const { ctx, asyncState, draft } = copyCtx({ sceneAssets: { promptRuleEnabled: false }, asyncState: { promptRuleDraft: '新规则' } });
    await handleSettingsAction('save-prompt-rule', ctx);
    assert.equal(draft.bridge.sceneAssets.promptRule, '新规则');
    assert.equal(asyncState.promptRuleStatus, '提示词已保存；自动注入已关闭，不会发送给聊天模型。');
});

test('gate:prompt-rule:settings-search-finds-the-switch', () => {
    for (const query of ['酒馆预设', '格式规则', '关闭注入']) {
        const [first] = searchSettings(query);
        assert.equal(first && first.id, 'prompt-rule-inject', query);
    }
    assert.deepEqual({ ...searchSettings('酒馆预设')[0].target, open: [] }, { tab: 'scene', sceneSubTab: 'rules', open: [] });
});
