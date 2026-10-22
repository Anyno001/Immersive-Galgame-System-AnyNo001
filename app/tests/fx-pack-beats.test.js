import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStage, makeTimers } from './helpers/fake-dom.js';
import { PACK } from '../src/visual/igs-ui/fx-pack-beats.js';
import { BEATS_BUILDERS } from '../src/visual/igs-ui/fx-beats-build.js';
import { beatsFxOf, parseBeatsFx } from '../src/visual/igs-ui/fx-beats-model.js';
import { ensureFxLayers } from '../src/visual/igs-ui/fx-layer.js';
import { DAILY_FX_KINDS, dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { FX_CAMERA_SHOTS, extractFxDirectives } from '../src/scene/fx-directives.js';
import { DAILY_FX_LABELS, normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { DAILY_SFX } from '../src/visual/igs-ui/fx-daily-sfx.js';
import { buildResultFxPlan } from '../src/visual/igs-ui/fx-result-model.js';
import { playResultFx, RESULT_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-result.js';
import { resolveCrowdReaction, CROWD_STYLE_TEXT } from '../src/visual/igs-ui/crowd-fx.js';
import { parseDiceCommand, resolveDiceCommand } from '../src/choices/dice-check.js';

const KINDS = ['reveal', 'panel', 'count', 'evidence', 'link', 'crowd', 'reunion', 'order', 'os'];
const parse = (kind, fields) => dailyFxOf(parseDailyFxBody(kind, fields));

function envOf({ reduced = true, ancient = false, speaker = '陈屿' } = {}) {
    const root = makeStage();
    const layers = ensureFxLayers(root);
    const sprite = root.querySelector('#igs-sprite');
    sprite.style.backgroundImage = 'url(chen.png)';
    sprite.style.backgroundPosition = '30% 100%';
    sprite.style.backgroundSize = 'auto 80%';
    return { root, doc: layers.doc, layers, reduced, hold: 1, ancient, worldview: 'modern', speaker, panelSkin: '', play() {} };
}

const SAMPLES = {
    reveal: { type: 'reveal', text: '凶手是你', sub: '一切都说得通了' },
    panel: { type: 'panel', kind: 'quest', title: '主线任务', rows: ['目标：找到钥匙', '奖励：+200 经验'] },
    count: { type: 'count', label: '账户到账', from: 0, to: 128000, unit: '元' },
    evidence: { type: 'evidence', name: '染血的手帕', desc: '边角绣着一个“沈”字' },
    link: { type: 'link', from: '陈屿', to: '林晚', style: 'redline' },
    crowd: { type: 'crowd', reaction: 'bow', text: '' },
    reunion: { type: 'reunion', who: '' },
    order: { type: 'order', names: ['陈屿', '林晚', '白墨'] },
    os: { type: 'os', text: '她为什么会在这里' },
};

test('gate:fx-pack-beats manifest registers every kind with label, trigger words, prompt line, builder and sfx', () => {
    assert.equal(PACK.id, 'beats');
    assert.deepEqual([...PACK.kinds], KINDS);
    for (const kind of KINDS) {
        assert.ok(PACK.labels[kind], `${kind} 缺中文标签`);
        assert.ok(PACK.triggers[kind].length >= 2 && PACK.triggers[kind].length <= 4, `${kind} 触发词应为 2-4 个`);
        assert.ok(PACK.promptLines[kind].startsWith(`[igs-fx:${kind}`), `${kind} 提示词应以标签语法开头`);
        assert.equal(typeof PACK.builders[kind], 'function');
    }
    assert.deepEqual(Object.keys(PACK.builders).sort(), [...KINDS].sort());
});

test('gate:fx-pack-beats kinds flow into the central tables and default on', () => {
    for (const kind of KINDS) {
        assert.ok(DAILY_FX_KINDS.includes(kind), `${kind} 应并入日常 kind`);
        assert.equal(DAILY_FX_LABELS[kind], PACK.labels[kind]);
        // 戏剧节拍是通用演出包（defaultOn）：各 kind 默认开，显式写 false 才关。
        assert.equal(normalizeDailyFxSettings({ enabled: true })[kind], true, `${kind} 应默认开`);
        assert.equal(normalizeDailyFxSettings({ enabled: true, [kind]: false })[kind], false, `${kind} 显式关仍为关`);
    }
    assert.equal(PACK.defaultOn, true);
});

test('gate:fx-pack-beats tags parse leniently and round-trip through the daily pipeline', () => {
    assert.deepEqual(parse('reveal', ['凶手是你', '一切都说得通了']), { type: 'reveal', text: '凶手是你', sub: '一切都说得通了' });
    assert.equal(parse('reveal', ['一二三四五六七八九十']).text.length, 8);
    assert.equal(parseDailyFxBody('reveal', []), null);
    assert.deepEqual(parse('panel', ['任务', '主线任务', '目标：找到钥匙;奖励：+200']), { type: 'panel', kind: 'quest', title: '主线任务', rows: ['目标：找到钥匙', '奖励：+200'] });
    assert.deepEqual(parse('panel', ['突破', '筑基成功', '修为：+1', '寿元：+50']).rows, ['修为：+1', '寿元：+50']);
    assert.deepEqual(parse('panel', ['欢迎来到副本', '规则一']), { type: 'panel', kind: 'system', title: '欢迎来到副本', rows: ['规则一'] });
    assert.equal(parse('panel', ['a;b;c;d;e;f;g;h'.split(';').join(';')]).rows.length, 0);
    assert.equal(parseDailyFxBody('panel', []), null);
    assert.deepEqual(parse('count', ['到账', '0', '128,000', '元']), { type: 'count', label: '到账', from: 0, to: 128000, unit: '元' });
    assert.deepEqual(parse('count', ['比分', '3']), { type: 'count', label: '比分', from: 0, to: 3, unit: '' });
    assert.deepEqual(parse('count', ['到账', '1200', '元']), { type: 'count', label: '到账', from: 0, to: 1200, unit: '元' });
    assert.equal(parseDailyFxBody('count', ['没有数字']), null);
    assert.deepEqual(parse('evidence', ['手帕', '染血']), { type: 'evidence', name: '手帕', desc: '染血' });
    assert.equal(parseDailyFxBody('evidence', []), null);
    assert.deepEqual(parse('link', ['陈屿', '林晚', '光丝']), { type: 'link', from: '陈屿', to: '林晚', style: 'thread' });
    assert.equal(parse('link', ['陈屿', '林晚', '乱写']).style, 'redline');
    assert.equal(parseDailyFxBody('link', ['陈屿']), null);
    assert.equal(parseDailyFxBody('link', ['陈屿', '陈屿']), null);
    assert.equal(parse('crowd', ['转头']).reaction, 'turn');
    assert.equal(parse('crowd', ['鞠躬', '山呼万岁']).text, '山呼万岁');
    assert.equal(parseDailyFxBody('crowd', ['不认识']), null);
    assert.deepEqual(parse('reunion', []), { type: 'reunion', who: '' });
    assert.deepEqual(parse('order', ['陈屿;林晚;白墨']).names, ['陈屿', '林晚', '白墨']);
    assert.deepEqual(parse('order', ['陈屿>林晚']).names, ['陈屿', '林晚']);
    assert.equal(parseDailyFxBody('order', ['陈屿']), null);
    assert.equal(parse('os', ['她为什么会在这里']).text, '她为什么会在这里');
    assert.equal(parse('os', ['一'.repeat(60)]).text.length, 40);
    assert.equal(parseBeatsFx('unknown', ['x']), null);
    assert.equal(beatsFxOf(['unknown']), null);
});

test('gate:fx-pack-beats tags are extracted from page text', () => {
    const list = extractFxDirectives('她转过身。[igs-fx:reveal|真相|原来如此]她笑了。');
    assert.deepEqual(list.map((item) => [item.kind, item.args[0]]), [['daily', 'reveal']]);
});

test('gate:fx-pack-beats builders return static nodes under reduced motion and declare defined sounds', () => {
    for (const kind of KINDS) {
        const env = envOf({ reduced: true });
        const built = BEATS_BUILDERS[kind](SAMPLES[kind], env);
        assert.ok(built, `${kind} 应返回演出`);
        assert.ok(['front', 'stage'].includes(built.layer));
        assert.ok(built.life > 0);
        assert.match(String(built.node.className), /igs-bt-/);
        assert.match(String(built.node.className), /is-reduced/);
        assert.ok(built.sounds.length >= 1);
        for (const sound of built.sounds) assert.ok(PACK.sfx[sound], `${kind} 用到未定义音效 ${sound}`);
    }
});

test('gate:fx-pack-beats life scales with env.hold', () => {
    const base = envOf();
    const slow = { ...envOf(), hold: 2 };
    for (const kind of KINDS) {
        const a = BEATS_BUILDERS[kind](SAMPLES[kind], base).life;
        const b = BEATS_BUILDERS[kind](SAMPLES[kind], slow).life;
        assert.ok(b > a, `${kind} 寿命应随 hold 增长`);
    }
});

test('gate:fx-pack-beats count card lands on the final number when reduced', () => {
    const env = envOf();
    const built = BEATS_BUILDERS.count(SAMPLES.count, env);
    assert.equal(built.node.querySelector('.igs-bt-count-num').textContent, '128,000');
    assert.equal(built.node.querySelector('.igs-bt-count-unit').textContent, '元');
    const down = BEATS_BUILDERS.count({ type: 'count', label: '存活', from: 120, to: 87, unit: '人' }, env);
    assert.match(String(down.node.querySelector('.igs-bt-count-card').className), /is-down/);
    assert.equal(down.node.querySelector('.igs-bt-count-delta').textContent, '-33');
    assert.equal(down.node.querySelector('.igs-bt-count-num').textContent, '87');
});

test('gate:fx-pack-beats panel carries type chip, rows and the world skin', () => {
    const env = envOf({ ancient: true });
    const built = BEATS_BUILDERS.panel({ type: 'panel', kind: 'result', title: '结算', rows: ['金币：+30', '耐久：-5'] }, env);
    const wrap = built.node.querySelector('.igs-bt-panel-wrap');
    assert.match(String(wrap.className), /is-result/);
    assert.match(String(wrap.className), /is-tone-ancient/);
    assert.equal(built.node.querySelector('.igs-bt-panel-chip').textContent, '结算');
    const panel = built.node.querySelector('.igs-panel');
    assert.match(panel.innerHTML, /igs-panel-row is-good/);
    assert.match(panel.innerHTML, /igs-panel-row is-bad/);
});

test('gate:fx-pack-beats evidence animates as a small item popup without inventory or era-specific treatment', () => {
    for (const ancient of [false, true]) {
        const env = envOf({ ancient, reduced: false });
        const built = BEATS_BUILDERS.evidence(SAMPLES.evidence, env);
        const stack = built.node.querySelector('.igs-fx-item-stack');
        const card = stack && stack.querySelector('.igs-fx-item-card');
        assert.ok(card, '证据须以带进场动画的物品小弹窗展示');
        assert.equal(built.node.querySelector('.igs-fx-item-showcase'), null, '不使用中央大演出');
        assert.equal(card.getAttribute('data-igs-item-action'), 'present');
        assert.equal(card.querySelector('.igs-fx-item-action').textContent, '出示证据');
        assert.equal(card.querySelector('.igs-fx-item-name').textContent, SAMPLES.evidence.name);
        assert.equal(card.querySelector('.igs-fx-item-desc').textContent, SAMPLES.evidence.desc);
        assert.equal(card.querySelector('.igs-fx-item-icon').getAttribute('data-igs-item-placeholder'), '1');
        assert.equal(card.querySelector('.igs-fx-item-seal'), null);
        assert.equal(stack.getAttribute('data-igs-era'), null);
        assert.doesNotMatch(String(built.node.className), /is-ancient/);
        assert.equal(built.sounds[0], 'bt-slap');
        assert.ok(built.life > 0);
    }
});

test('gate:fx-pack-beats link draws between head anchors, falls back for absent ends and caps at three', () => {
    const env = envOf();
    const built = BEATS_BUILDERS.link(SAMPLES.link, env);
    const box = built.node.querySelector('.igs-links');
    assert.ok(box);
    const thread = BEATS_BUILDERS.link({ ...SAMPLES.link, style: 'thread' }, env);
    assert.match(thread.node.querySelector('.igs-links').innerHTML, /is-mist/);
    assert.match(thread.node.querySelector('.igs-links').innerHTML, /is-line/);
    for (let i = 0; i < 3; i += 1) {
        const holder = env.doc.createElement('div');
        holder.className = 'igs-bt-link';
        env.layers.stage.appendChild(holder);
    }
    assert.equal(BEATS_BUILDERS.link(SAMPLES.link, env), null);
});

test('gate:fx-pack-beats order bar numbers the names and uses the stage face for the speaker', () => {
    const env = envOf();
    const built = BEATS_BUILDERS.order(SAMPLES.order, env);
    const chips = built.node.querySelectorAll('.igs-bt-order-chip');
    assert.equal(chips.length, 3);
    assert.match(String(chips[0].className), /is-first/);
    assert.ok(chips[0].querySelector('.igs-clone-sprite'), '台上说话人应裁立绘当前的脸');
    assert.equal(chips[1].querySelector('.igs-clone-sprite'), null);
    assert.equal(chips[1].querySelector('.igs-bt-order-ava').textContent, '林');
});

test('gate:fx-pack-beats crowd sets the reaction on the crowd layer and works without it', () => {
    const env = envOf();
    const layer = env.doc.createElement('div');
    layer.id = 'igs-crowd';
    env.layers.motion.appendChild(layer);
    const built = BEATS_BUILDERS.crowd({ type: 'crowd', reaction: 'turn', text: '' }, env);
    assert.equal(layer.getAttribute('data-react'), 'turn');
    assert.match(built.node.innerHTML, /众人齐齐转头/);
    layer.remove();
    assert.ok(BEATS_BUILDERS.crowd({ type: 'crowd', reaction: 'clap', text: '' }, env));
    assert.deepEqual(BEATS_BUILDERS.crowd({ type: 'crowd', reaction: 'clap', text: '' }, env).sounds, ['bt-applause']);
    assert.equal(resolveCrowdReaction('众人纷纷转头看向她'), 'turn');
    assert.equal(resolveCrowdReaction('殿内众人齐齐行礼'), 'bow');
    assert.equal(resolveCrowdReaction('全场鼓掌'), 'clap');
    assert.match(CROWD_STYLE_TEXT, /data-react="turn"/);
    assert.match(CROWD_STYLE_TEXT, /data-react="bow"/);
});

test('gate:fx-pack-beats os text picks the side away from the speaker', () => {
    const env = envOf();
    assert.match(String(BEATS_BUILDERS.os(SAMPLES.os, env).node.className), /is-right/);
    env.root.querySelector('#igs-sprite').style.backgroundPosition = '72% 100%';
    assert.match(String(BEATS_BUILDERS.os(SAMPLES.os, env).node.className), /is-left/);
});

test('gate:fx-pack-beats animated builders add stagger spans and sounds when motion is on', () => {
    const env = envOf({ reduced: false });
    assert.match(BEATS_BUILDERS.reveal(SAMPLES.reveal, env).node.innerHTML, /animation-delay:380ms/);
    assert.match(BEATS_BUILDERS.os(SAMPLES.os, env).node.innerHTML, /animation-delay:300ms/);
    assert.deepEqual(BEATS_BUILDERS.reveal(SAMPLES.reveal, env).sounds, ['bt-slam']);
});

test('gate:fx-pack-beats sfx defs are well formed and daily sfx pipeline carries them', () => {
    for (const [name, def] of Object.entries(PACK.sfx)) {
        assert.ok(Array.isArray(def.partials) && Array.isArray(def.noise), `${name} 形状不对`);
        assert.ok(def.partials.length + def.noise.length > 0);
        for (const q of def.partials) assert.ok(q.duration > 0 && q.gain > 0 && Number.isFinite(q.from) && Number.isFinite(q.to));
        for (const q of def.noise) assert.ok(q.duration > 0 && q.gain > 0);
        assert.ok(DAILY_SFX[name], `${name} 应并入日常音效表`);
    }
});

test('gate:fx-pack-beats style is merged into the daily stylesheet and honours reduced and low quality', () => {
    assert.match(DAILY_FX_STYLE_TEXT, /igs-bt-reveal-big/);
    assert.match(PACK.cssText, /\.igs-bt\.is-reduced/);
    assert.match(PACK.cssText, /data-igs-quality="low"/);
});

test('gate:fx-pack-beats camera tags accept the dramatic shots', () => {
    assert.equal(FX_CAMERA_SHOTS['壁咚'], 'closeup');
    assert.equal(FX_CAMERA_SHOTS['捏下巴'], 'closeup');
    assert.equal(FX_CAMERA_SHOTS['挡剑'], 'tilt');
    assert.equal(FX_CAMERA_SHOTS['坠落'], 'tilt');
    assert.equal(FX_CAMERA_SHOTS['落水'], 'focus');
    const list = extractFxDirectives('他一把将她按住。[igs-fx:cam|壁咚|林晚]');
    assert.deepEqual(list[0].args, ['closeup', '林晚']);
});

// 骰池与骰面。
test('gate:dice-pool parses expressions, targets and rejects unsupported dice', () => {
    assert.deepEqual(parseDiceCommand('骰池 3d6+2 [目标=12 项目=攀爬]'), { kind: 'pool', count: 3, sides: 6, modifier: 2, target: 12, under: false, label: '攀爬' });
    assert.deepEqual(parseDiceCommand('掷骰 潜行 d20 目标=15'), { kind: 'pool', count: 1, sides: 20, modifier: 0, target: 15, under: false, label: '潜行' });
    assert.equal(parseDiceCommand('投骰 2d8-1 目标=6 比较=小于').under, true);
    assert.equal(parseDiceCommand('骰池 2d6').target, null);
    assert.equal(parseDiceCommand('骰池 3d7').kind, 'invalid');
    assert.equal(parseDiceCommand('骰池 11d6').kind, 'invalid');
    assert.equal(parseDiceCommand('骰池 看看运气').kind, 'invalid');
});

test('gate:dice-pool resolves locally without AcuDice and reports tier, total and verdict', async () => {
    const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };
    const win = await resolveDiceCommand('骰池 3d6+2 目标=12', null, { random: seq([0.99, 0.5, 0.2]) });
    assert.equal(win.ok, true);
    assert.deepEqual(win.detail.dice, [6, 4, 2]);
    assert.equal(win.detail.total, 14);
    assert.equal(win.success, true);
    assert.equal(win.line, '元叙事：骰池 3d6+2，[6,4,2]+2=14，需≥12，【成功】。');
    const crit = await resolveDiceCommand('骰池 d20 目标=30', null, { random: () => 0.99 });
    assert.equal(crit.detail.tier, '大成功');
    assert.equal(crit.success, true, '单颗 d20 出 20 视为大成功');
    const fumble = await resolveDiceCommand('骰池 d20 目标=2', null, { random: () => 0 });
    assert.equal(fumble.detail.tier, '大失败');
    assert.equal(fumble.success, false);
    const plain = await resolveDiceCommand('骰池 2d6', null, { random: () => 0.5 });
    assert.equal(plain.success, undefined);
    assert.equal(plain.detail.target, null);
    const bad = await resolveDiceCommand('骰池 3d7', null, {});
    assert.equal(bad.ok, false);
});

test('gate:dice-pool plan carries one die reel per die, bounded face frames and tier tone', async () => {
    const { detail } = await resolveDiceCommand('骰池 2d6+1 目标=8 项目=撬锁', null, { random: () => 0.7 });
    const plan = buildResultFxPlan(detail);
    assert.equal(plan.layout, 'pool');
    assert.equal(plan.title, '撬锁');
    assert.deepEqual(plan.reels.map((reel) => [reel.label, reel.value, reel.die]), [['d6', 5, 6], ['d6', 5, 6]]);
    assert.equal(plan.verdict, '合计 11 · 成功');
    assert.equal(plan.tone, 'success');
    assert.equal(plan.sub, '修正+1 · 需≥8');
    const crit = buildResultFxPlan((await resolveDiceCommand('骰池 d20', null, { random: () => 0.99 })).detail);
    assert.equal(crit.tier, 'crit');
    assert.equal(crit.tone, 'crit');
    assert.equal(buildResultFxPlan({ kind: 'pool', sides: 7, dice: [3], total: 3 }), null);
    assert.equal(buildResultFxPlan({ kind: 'pool', sides: 6, dice: [9], total: 9 }), null);

    const root = makeStage();
    const timers = makeTimers();
    const played = playResultFx(root, plan, { schedule: timers.schedule, cancel: timers.clear, random: () => 0.99 });
    const card = root.querySelector('#igs-fx-front').children[0];
    assert.match(String(card.className), /is-pool/);
    assert.match(card.innerHTML, /igs-fx-result-reel is-die is-d6/);
    const frames = [...card.innerHTML.matchAll(/<span>(\d+)<\/span>/g)].map((m) => Number(m[1]));
    assert.ok(frames.every((value) => value >= 1 && value <= 6), '骰面数字不应超出 d6');
    assert.equal(frames.length, 16);
    assert.match(card.innerHTML, /igs-fx-result-note/);
    played.settled.then(() => {});
    timers.advance(10000);
});

test('gate:fx-result crit and fumble decorate the card, contest splits with VS, reduced stays plain', () => {
    const critPlan = { type: 'dice', title: '陈屿·力量', reels: [{ label: '1d100', value: 3, sub: '需≤60' }], verdict: '大成功', tone: 'crit', tier: 'crit', rollMs: 900, holdMs: 1600 };
    const make = (plan, reducedMotion) => {
        const root = makeStage();
        const timers = makeTimers();
        playResultFx(root, plan, { schedule: timers.schedule, cancel: timers.clear, random: () => 0.5, reducedMotion });
        return root.querySelector('#igs-fx-front').children[0];
    };
    assert.match(make(critPlan, false).innerHTML, /igs-fx-result-flash/);
    assert.match(make(critPlan, false).innerHTML, /igs-fx-result-rays/);
    assert.match(make({ ...critPlan, tone: 'fumble', tier: 'fumble' }, false).innerHTML, /igs-fx-result-crack/);
    assert.doesNotMatch(make(critPlan, true).innerHTML, /igs-fx-result-flash/);
    const contest = { type: 'dice', title: '对抗', layout: 'contest', reels: [{ label: '甲', value: 38, sub: '', outcome: 'win', who: '陈屿' }, { label: '乙', value: 8, sub: '', outcome: 'lose', who: '林晚' }], verdict: '陈屿胜出', tone: 'success', rollMs: 900, holdMs: 1600 };
    const card = make(contest, false);
    assert.match(String(card.className), /is-contest/);
    assert.match(card.innerHTML, /igs-fx-result-vs/);
});

test('gate:fx-result contest plan names each side for the avatar', async () => {
    const acu = { getAttributeValue: () => 50, checkByCharacter: async () => ({ roll: 10 }), contest: async () => ({ left: { roll: 38 }, right: { roll: 8 } }) };
    const plan = buildResultFxPlan((await resolveDiceCommand('对抗 林晚 理智 vs 白墨 察言观色', acu, {})).detail);
    assert.equal(plan.layout, 'contest');
    assert.deepEqual(plan.reels.map((reel) => reel.who), ['林晚', '白墨']);
});

test('gate:beats-order initials without a sprite get a per-name solid colour', () => {
    const env = envOf();
    const built = BEATS_BUILDERS.order({ type: 'order', names: ['路人甲', '路人甲', '乙丙'] }, env);
    const colors = Array.from(built.node.querySelectorAll('.igs-bt-order-ava')).map((el) => {
        const m = String(el.getAttribute('style') || '').match(/background:(#[0-9a-f]{6})/i);
        assert.ok(m, '无立绘头像应带 #rrggbb 实色底');
        return m[1];
    });
    assert.equal(colors.length, 3);
    assert.equal(colors[0], colors[1], '同名恒同色');
    const palette = ['#c2415b', '#2f7fb8', '#3f9a62', '#b8802a', '#7a5bc4', '#c4623a', '#2a9a9a', '#8a5a44'];
    for (const c of colors) assert.ok(palette.includes(c.toLowerCase()), '颜色取自八色板');
    const expected = (name) => {
        let h = 0;
        for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
        return palette[h % palette.length];
    };
    assert.equal(colors[0], expected('路人甲'));
    assert.equal(colors[2], expected('乙丙'));
});
