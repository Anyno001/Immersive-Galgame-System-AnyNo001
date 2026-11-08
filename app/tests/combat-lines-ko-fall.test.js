// 登记角色战斗台词（解析、隐藏、演出、朗读）与敌人两类倒下（判定、动作、音效）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractCombatStart, extractGrowthDirectives } from '../src/scene/combat-directives.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { logRowsOf, logTextOf } from '../src/visual/igs-ui/log-reader-model.js';
import { applyCombatRuleModifiers, defaultCombatRuleText, isDefaultCombatRuleText } from '../src/scene/combat-prompt.js';
import { BATTLE_SFX_PARTIALS } from '../src/visual/igs-ui/fx-battle-sfx.js';
import { KO_FALL_KINDS, koFallKind, koFallSfx, playKoFall } from '../src/visual/igs-ui/combat-ko-fall.js';
import { COMBAT_LINE_HIT_GAP_MS, createCombatLines, indexCombatLines, matchCombatLine } from '../src/visual/igs-ui/combat-lines.js';

const LINES = '[igs-combat:lines|艾拉|看招！/来吧|喝！|唔！/呃……/啧|不可能……]';
const LINES2 = '[igs-combat:lines|山贼头目|又来送死|吃我一刀|呃|我还会回来的]';
const START = '[igs-combat:start|林间遭遇|山贼头目*1|艾拉|elite]';
const STORY = `夜风吹过林间。\n${LINES}\n${LINES2}\n${START}`;

test('lines 标签随开战标签解析，按角色整理四段并限长限量', () => {
    const { start, diagnostics } = extractCombatStart(STORY);
    assert.ok(start);
    assert.equal(start.lines.length, 2);
    assert.deepEqual(start.lines[0], { character: '艾拉', open: ['看招！', '来吧'], attack: ['喝！'], hit: ['唔！', '呃……', '啧'], down: ['不可能……'] });
    assert.deepEqual(diagnostics, []);
    const long = `${'字'.repeat(21)}/短句`;
    const cut = extractCombatStart(`[igs-combat:lines|甲|${long}|||]\n${START}`).start;
    assert.deepEqual(cut.lines[0].open, ['短句']);
    const dup = extractCombatStart(`${LINES}\n${LINES}\n${START}`);
    assert.equal(dup.start.lines.length, 1);
    assert.ok(dup.diagnostics.some((d) => d.code === 'combat-lines-duplicate'));
    const many = Array.from({ length: 9 }, (_, i) => `[igs-combat:lines|人${i}|你好|||]`).join('\n');
    assert.equal(extractCombatStart(`${many}\n${START}`).start.lines.length, 6);
});

test('lines 只认写在开战标签之前的；全空或缺角色名记诊断；没有 lines 时 start 形状不变', () => {
    const after = extractCombatStart(`${START}\n${LINES}`);
    assert.equal(after.start?.lines, undefined);
    const empty = extractCombatStart(`[igs-combat:lines|艾拉||||]\n[igs-combat:lines||你好|||]\n${START}`);
    assert.equal(empty.start.lines, undefined);
    assert.equal(empty.diagnostics.filter((d) => d.code === 'combat-lines-invalid').length, 2);
    assert.equal(Object.hasOwn(extractCombatStart(START).start, 'lines'), false);
});

test('lines 不进成长账本，也不触发未知标签诊断', () => {
    const { directives, diagnostics } = extractGrowthDirectives(`${LINES}\n[igs-combat:exp|艾拉|10|试炼]\n${START}`);
    assert.equal(directives.length, 1);
    assert.equal(diagnostics.some((d) => d.code === 'combat-tag-unknown'), false);
});

test('隐藏：行内剥离、对话框正文、窄屏阅读模式、原文模式都不显示 lines', () => {
    assert.equal(stripMarkerDirectives(LINES).trim(), '');
    assert.equal(stripMarkerDirectives(`前${LINES}后`), '前后');
    assert.equal(stripMarkerDirectives('[igs-combat:lines|艾拉|看招').trim(), '');
    const raw = `<content>\n夜风吹过林间。\n[igs-char:艾拉|平静|「来了。」]\n${LINES}\n${LINES2}\n${START}\n</content>`;
    const payload = buildIgsTextPayload({ id: 1, text: raw }, { sceneAssets: { enabled: false } });
    const bodies = payload.textSegments.join('\n');
    assert.ok(bodies.includes('夜风吹过林间'));
    for (const word of ['igs-combat', '看招', '又来送死', '我还会回来的', '林间遭遇']) assert.equal(bodies.includes(word), false, `对话框正文泄露：${word}`);
    const pages = payload.textSegments.map((s) => ({ textType: 'narration', segmentBody: s, bubbleSpeaker: '', bubbleMood: '', sceneStateForBg: null }));
    const rows = logRowsOf(pages, {});
    const shown = rows.map((r) => JSON.stringify(r)).join('\n') + pages.map(logTextOf).join('\n');
    for (const word of ['igs-combat', '看招', '又来送死', '不可能……']) assert.equal(shown.includes(word), false, `阅读模式泄露：${word}`);
    // 原文模式：宿主用 stripMarkerDirectives 逐行剥离原文（reader-host 的 stripSceneDirectiveLines 同款）。
    const original = raw.split('\n').map((line) => stripMarkerDirectives(line).trim()).filter(Boolean).join('\n');
    for (const word of ['igs-combat', '看招', '又来送死']) assert.equal(original.includes(word), false, `原文模式泄露：${word}`);
});

test('战斗块 <igs-combat>：开战仍判在末尾、带上台词；三处都不显示；流式未闭合也不露', () => {
    const block = `<igs-combat>\n${LINES}\n${LINES2}\n${START}\n</igs-combat>`;
    const raw = `<content>\n夜风吹过林间。\n${block}\n</content>`;
    const { start } = extractCombatStart(raw);
    assert.ok(start, '块写法应识别开战');
    assert.ok(start.lines?.length >= 1, '块内 lines 应带进开战');
    const plain = `夜风吹过林间。\n${LINES}\n${START}`;
    assert.ok(extractCombatStart(plain).start, '旧写法照常识别');
    const payload = buildIgsTextPayload({ id: 1, text: raw }, { sceneAssets: { enabled: false } });
    const bodies = payload.textSegments.join('\n');
    assert.ok(bodies.includes('夜风吹过林间'));
    for (const word of ['igs-combat', '<', '看招', '林间遭遇']) assert.equal(bodies.includes(word), false, `对话框正文泄露：${word}`);
    const pages = payload.textSegments.map((s) => ({ textType: 'narration', segmentBody: s, bubbleSpeaker: '', bubbleMood: '', sceneStateForBg: null }));
    const shown = logRowsOf(pages, {}).map((r) => JSON.stringify(r)).join('\n') + pages.map(logTextOf).join('\n');
    for (const word of ['igs-combat', '看招']) assert.equal(shown.includes(word), false, `阅读模式泄露：${word}`);
    const original = raw.split('\n').map((line) => stripMarkerDirectives(line).trim()).filter(Boolean).join('\n');
    for (const word of ['igs-combat', '看招']) assert.equal(original.includes(word), false, `原文模式泄露：${word}`);
    // 流式中途：只写出开头、块未闭合，或标签只写出一半。
    for (const partial of ['<igs-combat>', '<igs-combat>\n[igs-combat:lines|艾拉|看', '<igs-com', '</igs-combat']) {
        const text = partial.split('\n').map((line) => stripMarkerDirectives(line).trim()).filter(Boolean).join('\n');
        assert.equal(text, '', `流式残片泄露：${partial}`);
    }
});

test('提示词：规则里有 lines 一条；冷却期连同 lines 行一起去掉', () => {
    const rule = defaultCombatRuleText({ combatExpansion: { enabled: true } });
    assert.ok(rule.includes('[igs-combat:lines|角色|开场|出招|受击|倒下]'));
    assert.ok(rule.includes('每句不超过15字'));
    assert.equal(rule.includes('已登记'), false);
    assert.ok(rule.includes('本场首次登场的具名敌人'));
    // 旧默认文本仍识别为默认（没有自定义）
    const legacy = rule.replace(/- \[igs-combat:lines\|.*/, '- [igs-combat:lines|角色|开场|出招|受击|倒下]：只给有名有姓、已登记的参战角色写（敌我都可），写在战斗块内、awaken 行与开战标签之前；每个角色一条，一场最多6条；四段各写一到两句，多句用「/」隔开，每句不超过15字，受击写短促的语气词（如 唔！/呃……/啧）；无名杂兵不写');
    assert.notEqual(legacy, rule);
    assert.equal(isDefaultCombatRuleText(legacy), true);
    assert.equal(isDefaultCombatRuleText(rule), true);
    assert.equal(isDefaultCombatRuleText(`${rule}
自定义`), false);
    const cooled = applyCombatRuleModifiers(rule, { combatSinceStart: 1, combatExpansion: { cooldownFloors: 4 } });
    assert.equal(cooled.includes('- [igs-combat:lines|'), false);
    assert.equal(cooled.includes('- [igs-combat:start|'), false);
    assert.ok(cooled.includes('本层不安排开战'));
});

test('敌人两类倒下：登记判定', () => {
    assert.deepEqual([...KO_FALL_KINDS], ['tremble', 'yield']);
    assert.equal(koFallKind('哥布林甲'), 'tremble');
    assert.equal(koFallKind('哥布林甲', { isRegistered: () => false }), 'tremble');
    assert.equal(koFallKind('山贼头目', { isRegistered: (n) => n === '山贼头目' }), 'yield');
    assert.equal(koFallKind('山贼头目甲', { isRegistered: (n) => n === '山贼头目', candidates: ['山贼头目甲', '山贼头目'] }), 'yield');
    assert.equal(koFallKind('山贼头目', { lineNames: new Set(['山贼头目']) }), 'yield');
    assert.equal(koFallKind('上司', { counterpart: '上司' }), 'yield');
    assert.equal(koFallKind('怪', { isRegistered: () => { throw new Error('x'); } }), 'tremble');
});

test('两类倒下各有合成音效，且与原击倒音不同', () => {
    for (const kind of KO_FALL_KINDS) {
        const partials = BATTLE_SFX_PARTIALS[koFallSfx(kind)];
        assert.ok(Array.isArray(partials) && partials.length >= 3, kind);
    }
    assert.notEqual(koFallSfx('tremble'), koFallSfx('yield'));
    assert.ok(BATTLE_SFX_PARTIALS['battle-ko']);
});

test('倒下动作：挂属性、重触发过渡、延后位移并清理；无立绘容器只做变灰', () => {
    const { document } = new JSDOM('<div class="cx-unit foe is-down" data-side="enemy"><div class="art"><img></div></div><div class="cx-unit foe is-down" data-side="enemy"><span class="x"></span></div>').window;
    const [withArt, bare] = document.querySelectorAll('.cx-unit');
    const queue = [];
    const schedule = (fn, ms) => queue.push([ms, fn]);
    assert.equal(playKoFall(withArt, 'tremble', { schedule }), true);
    assert.equal(withArt.getAttribute('data-igs-ko-tone'), 'tremble');
    assert.ok(withArt.classList.contains('is-down'));
    assert.equal(withArt.hasAttribute('data-igs-ko-move'), false);
    queue.sort((a, b) => a[0] - b[0]);
    queue[0][1]();
    assert.equal(withArt.getAttribute('data-igs-ko-move'), 'tremble');
    queue[1][1]();
    assert.equal(withArt.hasAttribute('data-igs-ko-move'), false);
    const none = [];
    assert.equal(playKoFall(bare, 'yield', { schedule: (fn, ms) => none.push([ms, fn]) }), true);
    assert.equal(bare.getAttribute('data-igs-ko-tone'), 'yield');
    assert.equal(none.length, 0);
    assert.equal(playKoFall(withArt, 'bogus'), false);
});

test('台词匹配：登记名、单位编号后缀与主角别名', () => {
    const map = indexCombatLines(extractCombatStart(`[igs-combat:lines|我|走|||]\n${LINES2}\n${START}`).start.lines);
    assert.ok(matchCombatLine(map, { name: '山贼头目' }));
    assert.ok(matchCombatLine(map, { name: '山贼头目甲' }));
    assert.equal(matchCombatLine(map, { name: '路人' }), null);
    assert.ok(matchCombatLine(map, { name: '艾拉', isHero: true }));
    assert.equal(matchCombatLine(map, { name: '艾拉', isHero: false }), null);
});

test('台词演出：textContent 显示、受击节流、朗读优先级、加速只显示文字、停止收尾', async () => {
    const { document } = new JSDOM('<div id="p" style="position:relative"><div class="cx-unit" data-unit="u1"></div></div>').window;
    const root = document.getElementById('p');
    const unit = root.firstChild;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
    unit.getBoundingClientRect = () => ({ left: 100, top: 100, width: 80, height: 120 });
    const spoken = [];
    const prefetched = [];
    const cancelled = [];
    const tts = {
        speak: (line) => { const h = { line, done: new Promise(() => {}), cancel: () => cancelled.push(line.text) }; spoken.push(line); return h; },
        prefetch: async (line) => { prefetched.push(line.text); },
    };
    const timers = [];
    let speed = 1;
    let clock = 1000;
    const lines = createCombatLines({
        doc: document, getRoot: () => root, speed: () => speed, schedule: (fn, ms) => timers.push([ms, fn]),
        getTtsContext: () => ({ settings: { enabled: true }, sceneAssets: null }), tts, now: () => clock,
    });
    const parsed = [{ character: '山贼头目', open: ['&amp;<i>'], attack: ['吃我一刀'], hit: ['唔'], down: ['倒了'] }];
    assert.equal(lines.setLines(parsed, 'cb|1'), true);
    assert.equal(lines.setLines(parsed, 'cb|1'), false);
    await lines.prefetch([{ name: '山贼头目甲' }, { name: '路人' }]);
    assert.deepEqual(prefetched, ['&amp;<i>', '吃我一刀', '唔', '倒了']);
    const u = { name: '山贼头目' };
    assert.equal(lines.say(u, unit, 'open'), true);
    const bubble = root.querySelector('.igs-combat-line');
    assert.equal(bubble.textContent, '&amp;<i>');
    assert.equal(bubble.querySelector('i'), null, '只经 textContent 写入');
    assert.equal(spoken.at(-1).speaker, '山贼头目');
    assert.equal(lines.say(u, unit, 'hit'), true);
    assert.equal(spoken.length, 1, '低优先级受击只显示文字，不顶掉开场朗读');
    assert.equal(lines.say(u, unit, 'hit'), false, '同单位受击节流');
    clock += COMBAT_LINE_HIT_GAP_MS + 1;
    assert.equal(lines.say(u, unit, 'hit'), true);
    assert.equal(lines.say(u, unit, 'down'), true);
    assert.equal(spoken.length, 2);
    assert.ok(cancelled.length >= 1, '倒下顶掉旧朗读');
    speed = 2;
    lines.say(u, unit, 'down');
    assert.equal(spoken.length, 2, '演出加速只显示文字');
    assert.ok(root.querySelector('.igs-combat-line'));
    lines.stop();
    assert.equal(root.querySelector('.igs-combat-line'), null);
    for (const [, fn] of timers) fn();
    assert.equal(lines.say({ name: '路人' }, unit, 'open'), false);
});

test('朗读关闭或没给上下文：只显示文字', () => {
    const { document } = new JSDOM('<div id="p"><div class="cx-unit" data-unit="u1"></div></div>').window;
    const root = document.getElementById('p');
    const unit = root.firstChild;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
    unit.getBoundingClientRect = () => ({ left: 100, top: 100, width: 80, height: 120 });
    let called = 0;
    const tts = { speak: () => { called += 1; return null; }, prefetch: () => { called += 1; } };
    for (const ctx of [() => null, () => ({ settings: { enabled: false } })]) {
        const lines = createCombatLines({ doc: document, getRoot: () => root, schedule: () => {}, getTtsContext: ctx, tts });
        lines.setLines([{ character: '甲', open: ['你好'], attack: [], hit: [], down: [] }], 'x');
        assert.equal(lines.say({ name: '甲' }, unit, 'open'), true);
        assert.equal(called, 0);
    }
});

test('开关：show 为假不显示也不朗读，tts 为假只显示，缺省都开', async () => {
    const { document } = new JSDOM('<div id="p"><div class="cx-unit" data-unit="u1"></div></div>').window;
    const root = document.getElementById('p');
    const unit = root.firstChild;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
    unit.getBoundingClientRect = () => ({ left: 100, top: 100, width: 80, height: 120 });
    const entry = [{ character: '甲', open: ['你好'], attack: [], hit: [], down: [] }];
    const run = async (prefs) => {
        let spoken = 0;
        let fetched = 0;
        const tts = { speak: () => { spoken += 1; return { done: new Promise(() => {}), cancel() {} }; }, prefetch: async () => { fetched += 1; } };
        const lines = createCombatLines({ doc: document, getRoot: () => root, schedule: () => {}, getTtsContext: () => ({ settings: { enabled: true } }), getPrefs: prefs, tts });
        lines.setLines(entry, 'x');
        await lines.prefetch([{ name: '甲' }]);
        const shown = lines.say({ name: '甲' }, unit, 'open');
        const bubbles = root.querySelectorAll('.igs-combat-line').length;
        lines.stop();
        return { shown, bubbles, spoken, fetched };
    };
    assert.deepEqual(await run(() => ({ show: false, tts: true })), { shown: false, bubbles: 0, spoken: 0, fetched: 0 });
    assert.deepEqual(await run(() => ({ show: true, tts: false })), { shown: true, bubbles: 1, spoken: 0, fetched: 0 });
    assert.deepEqual(await run(() => ({ show: true, tts: true })), { shown: true, bubbles: 1, spoken: 1, fetched: 1 });
    assert.deepEqual(await run(null), { shown: true, bubbles: 1, spoken: 1, fetched: 1 });
});
