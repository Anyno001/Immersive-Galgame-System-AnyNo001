import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCharacterOutfits, outfitAllowsScene, outfitAvatarOf, renameOutfitScene, resolveSpriteOutfit } from '../src/scene/character-outfits.js';
import { clearOutfitReview, loadOutfitReview, recordOutfitReview, removeOutfitReview } from '../src/scene/outfit-review-store.js';
import { buildStatusHudModel } from '../src/data/shujuku/status-hud-model.js';
import { isOutfitSwap, playSpriteOutfitSwap, spriteLookOf } from '../src/visual/igs-ui/sprite-outfit-swap.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';
import { renderOutfitReviewList } from '../src/visual/igs-ui/settings-outfit-fields.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { createMemoryStorage } from '../src/index.js';

const sceneAssets = () => ({
    characters: { 小林海斗: { 喜悦: 'https://x/base-joy.png', 害羞: 'https://x/base-shy.png', 默认: 'https://x/base.png' } },
    characterAliases: { 小林海斗: ['小林'] },
    scenes: { 海边: { url: '', words: ['沙滩'] }, 教室: { url: '' } },
    moodGroups: [{ label: '喜悦', words: ['喜悦', '开心'] }, { label: '害羞', words: ['害羞'] }],
    characterOutfits: normalizeCharacterOutfits({
        小林海斗: {
            泳装: { words: ['比基尼'], moods: { 喜悦: 'https://x/swim-joy.png', 开心: '' }, scenes: ['海边', '海边', ''], avatar: ' https://x/swim-avatar.png ' },
            校服: { words: ['制服'], moods: {} },
        },
    }),
});

test('gate:outfits:normalize-keeps-optional-scenes-and-avatar-only-when-set', () => {
    const outfits = sceneAssets().characterOutfits.小林海斗;
    assert.deepEqual(outfits.泳装.scenes, ['海边']);
    assert.equal(outfits.泳装.avatar, 'https://x/swim-avatar.png');
    assert.deepEqual(Object.keys(outfits.校服), ['words', 'moods']);
    assert.equal(outfitAllowsScene(outfits.泳装, ['海边', '沙滩']), true);
    assert.equal(outfitAllowsScene(outfits.泳装, ['教室', '教室']), false);
    assert.equal(outfitAllowsScene(outfits.泳装, ['', '']), true);
    assert.equal(outfitAllowsScene(outfits.校服, '教室'), true);
    const map = sceneAssets().characterOutfits;
    renameOutfitScene(map, '海边', '海滨');
    assert.deepEqual(map.小林海斗.泳装.scenes, ['海滨']);
    renameOutfitScene(map, '海滨', '');
    assert.equal(map.小林海斗.泳装.scenes, undefined);
});

test('gate:outfits:scene-bound-outfit-expires-when-scene-changes-unless-rewritten', () => {
    const assets = sceneAssets();
    const base = { character: '小林', sceneAssets: assets, readClues: () => ({ status: 'empty', profile: [], worn: [] }) };
    const floor = [
        { type: 'scene', scene: '海边', offset: 0 },
        { type: 'char', character: '小林海斗', outfit: '泳装', offset: 10 },
        { type: 'scene', scene: '教室', offset: 50 },
        { type: 'char', character: '小林海斗', outfit: '', offset: 60 },
        { type: 'char', character: '小林海斗', outfit: '泳装', offset: 80 },
    ];
    assert.equal(resolveSpriteOutfit({ ...base, directives: floor, offset: 20, scene: ['海边', '海边'] }).outfit, '泳装');
    // 场景换到教室后，更早写的泳装不适用新场景 → 失效回原装。
    assert.deepEqual(resolveSpriteOutfit({ ...base, directives: floor, offset: 65, scene: ['教室', '教室'] }), { outfit: '', source: '', reason: 'scene-mismatch' });
    // 场景切换之后明确再写泳装：AI 有意为之，照用。
    assert.equal(resolveSpriteOutfit({ ...base, directives: floor, offset: 90, scene: ['教室', '教室'] }).outfit, '泳装');
    // 跨楼继承同样受场景约束；不限场景的校服照常继承。
    assert.equal(resolveSpriteOutfit({ ...base, directives: [], offset: 0, inheritedOutfits: { 小林海斗: '泳装' }, scene: ['教室', '教室'] }).outfit, '');
    assert.equal(resolveSpriteOutfit({ ...base, directives: [], offset: 0, inheritedOutfits: { 小林海斗: '泳装' }, scene: ['海边', '沙滩'] }).outfit, '泳装');
    assert.equal(resolveSpriteOutfit({ ...base, directives: [], offset: 0, inheritedOutfits: { 小林海斗: '校服' }, scene: ['教室', '教室'] }).outfit, '校服');
    // 兜底来源也只匹配适用当前场景的服装。
    const clues = () => ({ status: 'ready', profile: ['穿着比基尼'], worn: [] });
    assert.equal(resolveSpriteOutfit({ ...base, readClues: clues, directives: [], offset: 0, scene: ['教室', '教室'] }).outfit, '');
    assert.equal(resolveSpriteOutfit({ ...base, readClues: clues, directives: [], offset: 0, scene: ['海边', '海边'] }).outfit, '泳装');
});

test('gate:outfits:outfit-review-store-dedupes-and-clears', () => {
    const storage = createMemoryStorage();
    assert.equal(recordOutfitReview(storage, { character: '小林海斗', word: '浴衣' }), true);
    assert.equal(recordOutfitReview(storage, { character: '小林海斗', word: '浴衣' }), false);
    assert.equal(recordOutfitReview(storage, { character: '雪乃', word: '浴衣' }), true);
    assert.equal(recordOutfitReview(storage, { character: '', word: 'x' }), false);
    assert.deepEqual(loadOutfitReview(storage), [{ character: '雪乃', word: '浴衣' }, { character: '小林海斗', word: '浴衣' }]);
    removeOutfitReview(storage, '雪乃', '浴衣');
    assert.deepEqual(loadOutfitReview(storage), [{ character: '小林海斗', word: '浴衣' }]);
    clearOutfitReview(storage);
    assert.deepEqual(loadOutfitReview(storage), []);
});

test('gate:outfits:status-hud-avatar-follows-outfit-of-sprite-character', () => {
    const assets = { ...sceneAssets(), statusAvatars: { 小林海斗: 'https://x/char-avatar.png' } };
    const model = (outfitFor, character = '小林') => buildStatusHudModel({ settings: { enabled: true, tables: [] }, sceneAssets: assets, character, outfitFor }).avatar;
    assert.equal(model({ character: '小林海斗', outfit: '泳装' }), 'https://x/swim-avatar.png');
    assert.equal(model({ character: '小林海斗', outfit: '校服' }), 'https://x/char-avatar.png');
    assert.equal(model({ character: '小林海斗', outfit: '' }), 'https://x/char-avatar.png');
    assert.equal(model({ character: '雪乃', outfit: '泳装' }), 'https://x/char-avatar.png');
    assert.equal(model(undefined), 'https://x/char-avatar.png');
    assert.equal(outfitAvatarOf(assets.characterOutfits, assets.characterAliases, '小林', '默认'), '');
});

test('gate:outfits:swap-plays-only-when-same-character-changes-outfit', () => {
    const look = (character, outfit, url) => ({ character, outfit, url });
    assert.equal(isOutfitSwap(look('A', '', 'a.png'), look('A', '泳装', 's.png')), true);
    assert.equal(isOutfitSwap(look('A', '泳装', 's.png'), look('A', '', 'a.png')), true);
    assert.equal(isOutfitSwap(look('A', '', 'a.png'), look('A', '', 'b.png')), false, 'mood change');
    assert.equal(isOutfitSwap(look('A', '', 'a.png'), look('B', '泳装', 's.png')), false, 'speaker change');
    assert.equal(isOutfitSwap(look('A', '', 'a.png'), look('A', '泳装', 'a.png')), false, 'same image');
    assert.equal(isOutfitSwap(null, look('A', '泳装', 's.png')), false, 'first page');
    assert.deepEqual(spriteLookOf({ speaker: '小林', spriteCharacter: '小林海斗', spriteOutfit: '泳装' }, 'u'), look('小林海斗', '泳装', 'u'));

    const removed = [];
    const classes = new Set();
    const parent = { insertBefore(node) { this.ghost = node; }, querySelector: () => parent.ghost || null, removeChild(node) { removed.push(node); parent.ghost = null; } };
    const timers = [];
    const doc = { createElement: () => ({ style: {}, setAttribute() {}, parentNode: parent }), defaultView: { setTimeout: (fn) => { timers.push(fn); return 1; } } };
    const sprite = { ownerDocument: doc, parentNode: parent, style: { cssText: 'background-image:url(a.png)' }, offsetWidth: 1,
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
    assert.equal(playSpriteOutfitSwap(sprite, { reducedMotion: true }), false);
    assert.equal(parent.ghost, undefined);
    assert.equal(playSpriteOutfitSwap(sprite, { reducedMotion: false }), true);
    assert.equal(parent.ghost.style.cssText, 'background-image:url(a.png)');
    assert.ok(classes.has('igs-sprite-outfit-in'));
    const firstTimer = timers[0];
    assert.equal(playSpriteOutfitSwap(sprite, { reducedMotion: false }), true);
    firstTimer();
    assert.ok(classes.has('igs-sprite-outfit-in'), 'stale timer must not end the newer swap');
    timers[1]();
    assert.ok(!classes.has('igs-sprite-outfit-in'));
    assert.equal(parent.ghost, null);
});

test('gate:outfits:settings-tabs-show-outfit-panel-with-fallback-preview', () => {
    const assets = sceneAssets();
    const render = (outfitTabs) => renderCharacterAssetList(assets.characters, {
        characterOutfits: assets.characterOutfits, aliases: assets.characterAliases, moodGroups: assets.moodGroups, outfitTabs, sceneAssets: assets,
    });
    const base = render({});
    assert.match(base, /class="igs-outfit-tab is-active"[^>]*data-action="scene-outfit-tab:%E5%B0%8F%E6%9E%97%E6%B5%B7%E6%96%97:">原装/);
    assert.match(base, />泳装<span class="igs-outfit-tab-count">1<\/span>/);
    assert.match(base, /data-scene-char="小林海斗" data-scene-mood="喜悦"/);
    assert.doesNotMatch(base, /data-outfit-panel=/);

    const swim = render({ 小林海斗: '泳装' });
    assert.match(swim, /data-outfit-panel="泳装"/);
    assert.doesNotMatch(swim, /data-scene-char="小林海斗" data-scene-mood=/);
    assert.match(swim, /data-scene-outfit-mood="喜悦" value="https:\/\/x\/swim-joy\.png"/);
    // 服装里「开心」槽没填图：同组的「喜悦」有图 → 借用。
    assert.match(swim, /data-outfit-slot="开心">.*?is-ghost.*?未填 · 借用「喜悦」/);
    // 服装没有「害羞」：回落原装，提供「补这一格」；「默认」不列出。
    assert.match(swim, /data-outfit-fallback="害羞">.*?base-shy\.png.*?回落原装「害羞」.*?data-action="scene-add-outfit-mood:[^"]+:%E5%AE%B3%E7%BE%9E"/);
    assert.doesNotMatch(swim, /data-outfit-fallback="默认"/);
    assert.match(swim, /按原装补齐 1 格/);
    assert.match(swim, /海边<button type="button" class="igs-mood-word-del" data-action="scene-remove-outfit-scene:/);
    assert.match(swim, /data-scene-outfit-avatar="泳装" value="https:\/\/x\/swim-avatar\.png"/);

    const school = render({ 小林海斗: '校服' });
    assert.match(school, /适用场景<\/span><div class="igs-mood-word-list"><span class="igs-outfit-muted">不限/);
    assert.match(school, /还没有这套服装的情绪槽/);
    assert.match(render({ 小林海斗: '已删除' }), /class="igs-outfit-tab is-active"[^>]*>原装/);

    const review = renderOutfitReviewList([{ character: '小林海斗', word: '浴衣' }, { character: '路人', word: '西装' }], assets.characterOutfits, assets.characters);
    assert.match(review, /data-action="outfit-review-assign:[^"]+:%E6%B5%B4%E8%A1%A3:%E6%B3%B3%E8%A3%85">归入「泳装」/);
    assert.match(review, /outfit-review-create:[^"]+:%E6%B5%B4%E8%A1%A3/);
    // 待确认服装行只标角色；无立绘角色保留「角色未登记立绘」说明为何没有归入按钮。
    assert.match(review, /<span class="igs-source-filter-note">路人<\/span><span class="igs-source-filter-note">角色未登记立绘<\/span>/);
    assert.doesNotMatch(review, /未登记的服装|按原装显示/);
    assert.equal(renderOutfitReviewList([], {}, {}), '');
});

function createCtx(prompts = []) {
    const storage = createMemoryStorage();
    const alerts = [];
    const draft = { bridge: { sceneAssets: sceneAssets() }, readerSettings: {} };
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: { global: { localStorage: storage, prompt: () => prompts.shift() || '', alert: (m) => alerts.push(m) } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, storage, alerts, prompts, sa: () => draft.bridge.sceneAssets, async: () => ctx.state.activeSettings.asyncState };
}

const enc = (...parts) => parts.map((p) => encodeURIComponent(p)).join(':');

test('gate:outfits:settings-actions-tabs-fill-slots-scenes-avatar-and-review', async () => {
    const t = createCtx();
    const run = (action, ...answers) => { t.prompts.push(...answers); return handleSettingsAction(action, t.ctx); };
    await run(`scene-outfit-tab:${enc('小林海斗', '泳装')}`);
    assert.deepEqual(t.async().outfitTabs, { 小林海斗: '泳装' });
    await run(`scene-outfit-tab:${enc('小林海斗', '不存在')}`);
    assert.deepEqual(t.async().outfitTabs, {});

    await run(`scene-add-outfit:${enc('小林海斗')}`, '睡衣');
    assert.equal(t.async().outfitTabs.小林海斗, '睡衣', 'new outfit becomes the active tab');
    await run(`scene-outfit-copy-slots:${enc('小林海斗', '睡衣')}`);
    assert.deepEqual(t.sa().characterOutfits.小林海斗.睡衣.moods, { 喜悦: '', 害羞: '' });
    await run(`scene-add-outfit-mood:${enc('小林海斗', '校服', '害羞')}`);
    assert.deepEqual(t.sa().characterOutfits.小林海斗.校服.moods, { 害羞: '' });
    assert.equal(t.prompts.length, 0);

    await run(`scene-rename-outfit:${enc('小林海斗', '睡衣')}`, '睡袍');
    assert.equal(t.async().outfitTabs.小林海斗, '睡袍');
    await run(`scene-remove-outfit:${enc('小林海斗', '睡袍')}`);
    assert.equal(t.async().outfitTabs.小林海斗, undefined);

    await run(`scene-add-outfit-scene:${enc('小林海斗', '校服')}`, '不存在的地方');
    assert.equal(t.sa().characterOutfits.小林海斗.校服.scenes, undefined);
    await run(`scene-add-outfit-scene:${enc('小林海斗', '校服')}`, '沙滩');
    await run(`scene-add-outfit-scene:${enc('小林海斗', '校服')}`, '教室');
    assert.deepEqual(t.sa().characterOutfits.小林海斗.校服.scenes, ['海边', '教室']);
    await run(`scene-remove-outfit-scene:${enc('小林海斗', '校服', '海边')}`);
    assert.deepEqual(t.sa().characterOutfits.小林海斗.校服.scenes, ['教室']);
    await run(`scene-rename-bg:${enc('教室')}`, 'B班教室');
    assert.deepEqual(t.sa().characterOutfits.小林海斗.校服.scenes, ['B班教室']);
    await run(`scene-remove-bg:${enc('B班教室')}`);
    assert.equal(t.sa().characterOutfits.小林海斗.校服.scenes, undefined);

    assert.deepEqual(await handleSettingsAction(`scene-set-outfit-avatar-url:${enc('小林海斗', '校服')}:data:image/png;base64,AA==`, t.ctx), { ok: true });
    assert.equal(t.sa().characterOutfits.小林海斗.校服.avatar, 'data:image/png;base64,AA==');
    await run(`scene-clear-outfit-avatar:${enc('小林海斗', '校服')}`);
    assert.equal(t.sa().characterOutfits.小林海斗.校服.avatar, undefined);

    recordOutfitReview(t.storage, { character: '小林海斗', word: '泳衣' });
    recordOutfitReview(t.storage, { character: '小林海斗', word: '浴衣' });
    recordOutfitReview(t.storage, { character: '小林海斗', word: '制服' });
    await run(`outfit-review-assign:${enc('小林海斗', '泳衣', '泳装')}`);
    assert.deepEqual(t.sa().characterOutfits.小林海斗.泳装.words, ['比基尼', '泳衣']);
    await run(`outfit-review-create:${enc('小林海斗', '浴衣')}`);
    assert.ok(t.sa().characterOutfits.小林海斗.浴衣);
    assert.equal(t.async().outfitTabs.小林海斗, '浴衣');
    // 「制服」已是校服的词：归入泳装被拒，保留在待确认里。
    await run(`outfit-review-assign:${enc('小林海斗', '制服', '泳装')}`);
    assert.deepEqual(loadOutfitReview(t.storage), [{ character: '小林海斗', word: '制服' }]);
    await run(`outfit-review-dismiss:${enc('小林海斗', '制服')}`);
    assert.deepEqual(loadOutfitReview(t.storage), []);
});
