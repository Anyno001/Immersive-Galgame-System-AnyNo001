import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import {
    applyDiceToHits, createBattleHistoryScanner, isPlayerName, readBattleCarry, readDiceEffect, resolveBattleContextFromHistory,
} from '../src/scene/battle-context.js';
import {
    planBattleFx, normalizeBattleFxSettings, resolveBattleFxPromptRule, resolveImpactPoint, isSpriteTarget, safePortraitUrl, BATTLE_TIMING, BATTLE_SKIP_RESULT_MS,
} from '../src/visual/igs-ui/fx-battle-model.js';
import { applyBattleFxToDom, cancelBattleFx, skipBattleFx, BATTLE_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-battle.js';
import { renderBattleFx } from '../src/visual/igs-ui/fx-battle-render.js';
import { battleSfxKind, BATTLE_SFX_PARTIALS } from '../src/visual/igs-ui/fx-battle-sfx.js';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const ID = { chatId: 'chat-1', messageId: 7, swipeId: 0, page: 1 };
const ON = { enabled: true };
const motionOf = (root) => root.querySelector('#igs-stage-motion');
const frontOf = (root) => root.querySelector('#igs-fx-front');
const hit = (result, extra = {}) => ({ attacker: '甲', target: '史莱姆王', skill: '斩击', result, ...extra });
const fxOf = (extra = {}) => ({ battle: null, battleStart: false, battleEnd: '', hits: [], ...extra });
const DICE_CRIT = '我挥剑。 <meta:检定结果>\n元叙事：我进行【力量】检定，1d100=3，目标=60，结果：【大成功】。\n</meta:检定结果>';
const DICE_FUMBLE_CONTEST = '<meta:检定结果>\n元叙事：我以【敏捷】对抗史莱姆的【敏捷】，1d100=98/40，目标=50/50，结果：史莱姆胜出（大失败 vs 普通成功）。\n</meta:检定结果>';

test('gate:fx-battle:parse-battle-and-hit-tags', () => {
    assert.deepEqual(parseFxBody('battle|史莱姆王|森林的守护者'), { kind: 'battle', end: false, args: ['史莱姆王', '森林的守护者'] });
    assert.deepEqual(parseFxBody('battle'), { kind: 'battle', end: false, args: ['', ''] });
    assert.deepEqual(parseFxBody('battle-end|胜利'), { kind: 'battle', end: true, args: ['win'] });
    assert.deepEqual(parseFxBody('battle-end|撤退'), { kind: 'battle', end: true, args: ['escape'] });
    assert.deepEqual(parseFxBody('battle-end|平局'), { kind: 'battle', end: true, args: [''] });
    assert.deepEqual(parseFxBody('hit|爱丽丝|史莱姆|冰霜新星|暴击'), { kind: 'hit', end: false, args: ['爱丽丝', '史莱姆', '冰霜新星', 'crit'] });
    assert.deepEqual(parseFxBody('hit|爱丽丝|史莱姆|斩击|乱写'), { kind: 'hit', end: false, args: ['爱丽丝', '史莱姆', '斩击', 'hit'] });
    assert.deepEqual(parseFxBody('hit|爱丽丝|史莱姆|斩击|constructor'), { kind: 'hit', end: false, args: ['爱丽丝', '史莱姆', '斩击', 'hit'] });
    assert.equal(parseFxBody('hit||史莱姆'), null);
    assert.equal(parseFxBody('hit-end'), null);
    assert.equal(stripMarkerDirectives('前[igs-fx:hit|甲|乙|斩|命中]后'), '前后');
});

test('gate:fx-battle:page-resolution-keeps-range-and-orders-events', () => {
    const source = '[igs-fx:battle|史莱姆王]遭遇页\n[igs-fx:hit|甲|史莱姆王|斩击][igs-fx:hit|史莱姆王|甲|撞击|格挡]交锋页\n[igs-fx:hit|甲|史莱姆王|终结技|击倒][igs-fx:battle-end|胜利]结算页\n余韵页';
    const list = extractFxDirectives(source);
    const at = (s) => source.indexOf(s);
    const p1 = resolveFxAtPage(list, at('遭遇页'), -1);
    assert.equal(p1.battleStart, true);
    assert.deepEqual(p1.battle, { foe: '史莱姆王', title: '' });
    const p2 = resolveFxAtPage(list, at('交锋页'), at('遭遇页'));
    assert.equal(p2.battleStart, false);
    assert.deepEqual(p2.hits.map((h) => h.result), ['hit', 'guard']);
    assert.ok(p2.battle);
    const p3 = resolveFxAtPage(list, at('结算页'), at('交锋页'));
    assert.equal(p3.battle, null);
    assert.equal(p3.battleEnd, 'win');
    assert.deepEqual(p3.hits.map((h) => h.result), ['ko']);
    const p4 = resolveFxAtPage(list, at('余韵页'), at('结算页'));
    assert.equal(p4.battleEnd, '');
    assert.equal(p4.hits.length, 0);
});

test('gate:fx-battle:hits-capped-per-page', () => {
    const source = `${'[igs-fx:hit|甲|乙|斩]'.repeat(5)}页`;
    const page = resolveFxAtPage(extractFxDirectives(source), source.indexOf('页'), -1);
    assert.equal(page.hits.length, 3);
});

test('gate:fx-battle:carried-battle-seeds-page-until-own-end-tag', () => {
    const carried = { battle: { foe: '史莱姆王', title: '守护者' } };
    assert.deepEqual(resolveFxAtPage([], -1, -1, carried).battle, { foe: '史莱姆王', title: '守护者' });
    const source = '续战页\n[igs-fx:battle-end|胜利]结束页';
    const list = extractFxDirectives(source);
    assert.ok(resolveFxAtPage(list, source.indexOf('续战页'), -1, carried).battle);
    const end = resolveFxAtPage(list, source.indexOf('结束页'), source.indexOf('续战页'), carried);
    assert.equal(end.battle, null);
    assert.equal(end.battleEnd, 'win');
    assert.equal(resolveFxAtPage([], -1, -1, null).battle, null);
});

test('gate:fx-battle:history-follows-hit-chain-back-to-battle-start', () => {
    const ai = (text) => ({ isUser: false, text });
    const user = (text) => ({ isUser: true, text });
    assert.deepEqual(readBattleCarry('[igs-fx:battle|狼]开打'), { battle: { foe: '狼', title: '' } });
    assert.deepEqual(readBattleCarry('[igs-fx:battle|狼]…[igs-fx:battle-end|胜利]'), { battle: null });
    assert.deepEqual(readBattleCarry('[igs-fx:hit|我|狼|斩]'), { active: true });
    assert.equal(readBattleCarry('日常'), null);
    const open = resolveBattleContextFromHistory([user('继续攻击'), ai('[igs-fx:hit|我|狼|斩]'), user('冲'), ai('[igs-fx:battle|狼|头狼]')]);
    assert.deepEqual(open.battle, { foe: '狼', title: '头狼' });
    const closed = resolveBattleContextFromHistory([ai('[igs-fx:battle-end|胜利]'), ai('[igs-fx:battle|狼]')]);
    assert.equal(closed.battle, null);
    // 长战斗：中间 6 层都只有出招（偶尔夹一层纯对白），仍能沿链找到开战标签。
    const chain = [];
    for (let i = 0; i < 6; i += 1) chain.push(user('继续'), ai(i === 3 ? '（对峙中的对白）' : '[igs-fx:hit|我|狼|斩]'));
    chain.push(ai('[igs-fx:battle|狼|头狼]'));
    assert.deepEqual(resolveBattleContextFromHistory(chain).battle, { foe: '狼', title: '头狼' });
    // 连续 2 层没有战斗标签：视为战斗已结束（包括 AI 漏写 battle-end）。
    assert.equal(resolveBattleContextFromHistory([ai('a'), ai('b'), ai('[igs-fx:battle|狼]')]).battle, null);
    assert.ok(resolveBattleContextFromHistory([ai('a'), ai('[igs-fx:battle|狼]')]).battle);
});

test('gate:fx-battle:history-scanner-stops-early', () => {
    const scanner = createBattleHistoryScanner();
    assert.equal(scanner.push({ isUser: true, text: '' }), false);
    assert.equal(scanner.push({ isUser: false, text: '日常' }), false);
    assert.equal(scanner.push({ isUser: false, text: '日常' }), true, 'no battle in two AI floors: host stops reading');
    const hit = createBattleHistoryScanner();
    assert.equal(hit.push({ isUser: false, text: '[igs-fx:battle|狼]' }), true);
    assert.deepEqual(hit.result().battle, { foe: '狼', title: '' });
    const capped = createBattleHistoryScanner();
    let stopped = false;
    for (let i = 0; i < 20 && !stopped; i += 1) stopped = capped.push({ isUser: false, text: '[igs-fx:hit|我|狼|斩]' });
    assert.ok(stopped);
    assert.equal(capped.result().battle, null);
});

test('gate:fx-battle:dice-tier-from-previous-user-message-upgrades-first-player-hit', () => {
    assert.equal(readDiceEffect(DICE_CRIT), 'crit');
    assert.equal(readDiceEffect(DICE_FUMBLE_CONTEST), 'miss');
    assert.equal(readDiceEffect('<meta:检定结果>\n结果：【普通成功】。\n</meta:检定结果>'), '');
    assert.equal(resolveBattleContextFromHistory([{ isUser: true, text: DICE_CRIT }]).dice, 'crit');
    assert.equal(resolveBattleContextFromHistory([{ isUser: false, text: '' }, { isUser: true, text: DICE_CRIT }]).dice, '', 'dice only counts right before this floor');
    assert.ok(isPlayerName('我') && isPlayerName('阿明', '阿明') && !isPlayerName('阿明'));
    const list = extractFxDirectives('[igs-fx:hit|狼|我|扑咬][igs-fx:hit|我|狼|斩击][igs-fx:hit|我|狼|再斩]');
    const upgraded = applyDiceToHits(list, 'crit');
    assert.deepEqual(upgraded.map((d) => d.args[3]), ['hit', 'crit', 'hit']);
    assert.equal(upgraded[1].dice, true);
    assert.equal(list[1].args[3], 'hit', 'original directives untouched');
    const explicit = extractFxDirectives('[igs-fx:hit|我|狼|斩击|格挡]');
    assert.equal(applyDiceToHits(explicit, 'crit'), explicit, 'explicit effects are not overridden');
    const page = resolveFxAtPage(upgraded, 999, -1);
    assert.equal(page.hits[1].dice, true);
});

test('gate:fx-battle:plan-default-off-and-skips-non-text-pages', () => {
    const fx = fxOf({ battle: { foe: 'A', title: '' }, battleStart: true });
    assert.deepEqual(normalizeBattleFxSettings(undefined), { enabled: false, letterbox: true });
    assert.equal(normalizeFxReaderSettings({}).battleFx.enabled, false);
    assert.equal(planBattleFx(fx, { settings: {}, identity: ID }).events.length, 0);
    assert.equal(planBattleFx(fx, { settings: ON, identity: ID, nsfw: true }).events.length, 0);
    assert.equal(planBattleFx(fx, { settings: ON, identity: ID, pageKind: 'chat' }).events.length, 0);
    assert.equal(planBattleFx(fx, { settings: ON, identity: ID, pageKind: 'card' }).plate, null);
    assert.equal(planBattleFx(fx, { settings: ON, identity: ID }).letterbox, true);
    assert.equal(planBattleFx(fx, { settings: { enabled: true, letterbox: false }, identity: ID }).letterbox, false);
});

test('gate:fx-battle:plan-timeline-scales-with-hold-and-classifies-targets', () => {
    const fx = fxOf({ battleStart: true, battleEnd: 'win', userName: '阿明', hits: [hit('crit', { dice: true }), hit('ko', { target: '阿明' }), hit('hit', { target: '路人' })] });
    const plan = planBattleFx(fx, { settings: ON, identity: ID, spriteName: '史莱姆' });
    assert.deepEqual(plan.events.map((e) => e.type), ['encounter', 'hit', 'hit', 'hit', 'result']);
    const g = BATTLE_TIMING;
    assert.deepEqual(plan.events.map((e) => e.at), [0, g.encounterGap, g.encounterGap + g.hitGap, g.encounterGap + g.hitGap + g.ko, g.encounterGap + 2 * g.hitGap + g.ko]);
    assert.deepEqual(plan.events.slice(1, 4).map((e) => e.targetKind), ['sprite', 'player', 'stage']);
    assert.equal(plan.events[1].diceLabel, '检定大成功');
    assert.equal(plan.events[4].text, '胜利');
    assert.equal(plan.totalMs, plan.events[4].at + g.result);
    const slow = planBattleFx(fx, { settings: ON, identity: ID, holdScale: 1.6 });
    assert.equal(slow.events[1].at, Math.round(g.encounterGap * 1.6));
    assert.equal(slow.events[4].life, Math.round(g.result * 1.6));
    assert.equal(planBattleFx({ ...fx, battleEnd: 'end' }, { settings: ON, identity: ID }).events.some((e) => e.type === 'result'), false);
    assert.ok(isSpriteTarget('史莱姆', '史莱姆王') && !isSpriteTarget('狼', '史莱姆王') && !isSpriteTarget('我', '我们'));
});

test('gate:fx-battle:impact-point-lands-on-sprite-upper-body', () => {
    const geo = { stageW: 1000, stageH: 600, dialogTop: 450 };
    const sprite = { posX: 50, posY: 100, scale: 40, naturalW: 400, naturalH: 1000, head: { x: 0.5, top: 0.05, w: 0.3 } };
    const point = resolveImpactPoint(geo, sprite);
    assert.equal(point.x, 500);
    assert.ok(point.y > 60 && point.y < 450 - 600 * 0.18 + 1, `y=${point.y}`);
    assert.equal(resolveImpactPoint(geo, null), null);
    assert.equal(resolveImpactPoint({ stageW: 0, stageH: 0 }, sprite), null);
});

test('gate:fx-battle:dom-plays-sequence-hides-hud-and-does-not-replay-same-page', () => {
    const root = makeStage();
    const timers = makeTimers();
    const sounds = [];
    const fx = fxOf({ battle: { foe: '史莱姆王', title: '守护者' }, battleStart: true, hits: [hit('crit')] });
    const plan = planBattleFx(fx, { settings: ON, identity: ID });
    const result = applyBattleFxToDom(root, plan, { ...timers, onEvent: (e) => sounds.push(battleSfxKind(e)) });
    assert.equal(result.played, true);
    const front = frontOf(root);
    const encounter = front.querySelector('.igs-fx-battle-encounter');
    assert.ok(encounter);
    assert.equal(encounter.style.vars['--igs-battle-life'], `${BATTLE_TIMING.encounter}ms`);
    assert.match(front.querySelector('.igs-fx-battle-plate').textContent, /史莱姆王 · 守护者/);
    assert.ok(root.querySelector('#igs-fx-stage').querySelector('.igs-fx-battle-vignette'));
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-show'), '1');
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-letterbox'), '1');
    timers.advance(BATTLE_TIMING.encounterGap);
    const hitNode = front.querySelector('.igs-fx-battle-hit');
    assert.equal(hitNode.getAttribute('data-igs-battle-result'), 'crit');
    assert.equal(hitNode.querySelectorAll('.igs-fx-battle-slash').length, 2);
    assert.match(hitNode.textContent, /斩击/);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-shake'), 'heavy');
    timers.advance(6000);
    assert.equal(front.querySelector('.igs-fx-battle-encounter'), null);
    assert.equal(front.querySelector('.igs-fx-battle-hit'), null);
    assert.equal(front.querySelector('.igs-fx-battle-skip'), null);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-show'), null);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-shake'), null);
    assert.ok(front.querySelector('.igs-fx-battle-plate'), 'plate stays while battle is active');
    assert.deepEqual(sounds, ['battle-encounter', 'battle-crit']);
    assert.ok(sounds.every((k) => BATTLE_SFX_PARTIALS[k]));
    assert.equal(applyBattleFxToDom(root, plan, timers).reason, 'same-page');
    assert.equal(front.querySelector('.igs-fx-battle-encounter'), null);
});

test('gate:fx-battle:page-turn-cancels-pending-and-plate-follows-range', () => {
    const root = makeStage();
    const timers = makeTimers();
    const fx = fxOf({ battle: { foe: 'A', title: '' }, battleStart: true, hits: [hit('hit')] });
    applyBattleFxToDom(root, planBattleFx(fx, { settings: ON, identity: ID }), timers);
    applyBattleFxToDom(root, planBattleFx(fxOf({ battleEnd: 'lose' }), { settings: ON, identity: { ...ID, page: 2 } }), timers);
    const front = frontOf(root);
    assert.equal(front.querySelector('.igs-fx-battle-encounter'), null);
    assert.equal(front.querySelector('.igs-fx-battle-plate'), null);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-letterbox'), null);
    assert.equal(front.querySelector('.igs-fx-battle-result').getAttribute('data-igs-battle-result'), 'lose');
    timers.advance(BATTLE_TIMING.encounterGap);
    assert.equal(front.querySelector('.igs-fx-battle-hit'), null, 'pending hit from previous page must not fire');
    timers.advance(BATTLE_TIMING.result);
    assert.equal(timers.size(), 0);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-show'), null);
    // 换到没有演出的页也要收掉上一页未播完的出招。
    applyBattleFxToDom(root, planBattleFx(fx, { settings: ON, identity: { ...ID, page: 3 } }), timers);
    applyBattleFxToDom(root, planBattleFx(fxOf({ battle: { foe: 'A', title: '' } }), { settings: ON, identity: { ...ID, page: 4 } }), timers);
    assert.equal(timers.size(), 0);
});

test('gate:fx-battle:sprite-target-reacts-with-additive-animation-and-ko-holds-until-page-turn', () => {
    const root = makeStage({ size: { width: 1000, height: 600 }, waapi: true });
    const timers = makeTimers();
    const sprite = { url: 'data:image/png;base64,x', posX: 50, posY: 100, scale: 40, head: { x: 0.5, top: 0.05, w: 0.3, aspect: 2.5 } };
    const plan = planBattleFx(fxOf({ hits: [hit('ko', { target: '史莱姆王' })] }), { settings: ON, identity: ID, spriteName: '史莱姆王' });
    applyBattleFxToDom(root, plan, { ...timers, sprite });
    const impact = frontOf(root).querySelector('.igs-fx-battle-impact');
    assert.equal(impact.style.left, '500px');
    assert.match(impact.style.top, /^\d+px$/);
    const spriteEl = root.querySelector('#igs-sprite');
    assert.ok(spriteEl.animations.length >= 2);
    assert.ok(spriteEl.animations.filter((a) => a.options.composite === 'add').length >= 2, 'transform/filter reactions stack on top of stage direction');
    const held = spriteEl.animations.filter((a) => a.options.fill === 'forwards');
    assert.ok(held.length && held.every((a) => a.state === 'running'));
    applyBattleFxToDom(root, planBattleFx(fxOf(), { settings: ON, identity: { ...ID, page: 2 } }), timers);
    assert.ok(held.every((a) => a.state === 'cancelled'), 'ko pose released on page turn');
});

test('gate:fx-battle:player-target-flashes-screen-edge-instead-of-slash', () => {
    const root = makeStage();
    const timers = makeTimers();
    applyBattleFxToDom(root, planBattleFx(fxOf({ hits: [hit('hit', { attacker: '狼', target: '我' })] }), { settings: ON, identity: ID }), timers);
    const node = frontOf(root).querySelector('.igs-fx-battle-hit');
    assert.equal(node.getAttribute('data-igs-battle-target'), 'player');
    assert.ok(node.querySelector('.igs-fx-battle-hurt'));
    assert.equal(node.querySelector('.igs-fx-battle-slash'), null);
    assert.equal(node.querySelector('.igs-fx-battle-pop-target'), null);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-shake'), 'heavy');
    assert.equal(frontOf(root).querySelector('.igs-fx-battle-skip'), null, 'a single hit does not swallow page clicks');
});

test('gate:fx-battle:click-skips-to-result-without-turning-page', () => {
    const root = makeStage({ waapi: true });
    const timers = makeTimers();
    const sounds = [];
    const fx = fxOf({ battle: null, battleStart: true, battleEnd: 'win', hits: [hit('hit'), hit('crit')] });
    applyBattleFxToDom(root, planBattleFx(fx, { settings: ON, identity: ID }), { ...timers, onEvent: (e) => sounds.push(battleSfxKind(e)) });
    const skip = frontOf(root).querySelector('.igs-fx-battle-skip');
    assert.ok(skip);
    let stopped = false;
    skip.fire('click', { stopPropagation() { stopped = true; } });
    assert.ok(stopped);
    const front = frontOf(root);
    assert.equal(front.querySelector('.igs-fx-battle-encounter'), null);
    assert.equal(front.querySelector('.igs-fx-battle-skip'), null);
    const result = front.querySelector('.igs-fx-battle-result');
    assert.ok(result);
    assert.equal(result.style.vars['--igs-battle-life'], `${BATTLE_SKIP_RESULT_MS}ms`);
    timers.advance(10000);
    assert.equal(front.querySelector('.igs-fx-battle-hit'), null, 'skipped hits never play');
    assert.deepEqual(sounds, ['battle-encounter', 'battle-win']);
    assert.equal(timers.size(), 0);
    assert.equal(skipBattleFx(root), false);
});

test('gate:fx-battle:reduced-motion-is-static-silent-and-shakeless', () => {
    const root = makeStage({ waapi: true, size: { width: 800, height: 450 } });
    const timers = makeTimers();
    const sounds = [];
    const sprite = { url: 'data:image/png;base64,x', posX: 50, posY: 100, scale: 40, head: { x: 0.5, top: 0.05, w: 0.3, aspect: 2 } };
    applyBattleFxToDom(root, planBattleFx(fxOf({ hits: [hit('ko')] }), { settings: ON, identity: ID, spriteName: '史莱姆王' }), { reducedMotion: true, sprite, ...timers, onEvent: () => sounds.push(1) });
    const node = frontOf(root).querySelector('.igs-fx-battle-hit');
    assert.equal(node.getAttribute('data-igs-fx-static'), '1');
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-shake'), null);
    assert.equal((root.querySelector('#igs-sprite').animations || []).length, 0);
    assert.deepEqual(sounds, []);
});

test('gate:fx-battle:render-adapter-follows-style-replay-and-cleans-up', () => {
    const root = makeStage();
    const timers = makeTimers();
    const page = (index, fx) => ({ messageId: 1, readerSettings: { battleFx: ON, fxStyle: { motion: 'snappy', hold: 'long' } }, content: { currentIndex: index, fx } });
    const opening = fxOf({ battle: { foe: 'A', title: '' }, battleStart: true });
    const ctx = { ...timers, playSfx: () => null };
    assert.equal(renderBattleFx(root, page(0, opening), ctx).played, true);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-motion'), 'snappy');
    assert.equal(frontOf(root).querySelector('.igs-fx-battle-encounter').style.vars['--igs-battle-life'], `${Math.round(BATTLE_TIMING.encounter * 1.6)}ms`);
    renderBattleFx(root, page(1, fxOf({ battle: { foe: 'A', title: '' } })), ctx);
    assert.equal(renderBattleFx(root, page(0, opening), ctx).played, false, 'revisited page does not replay by default');
    assert.ok(frontOf(root).querySelector('.igs-fx-battle-plate'));
    const replay = (index, fx) => ({ ...page(index, fx), readerSettings: { battleFx: ON, fxStyle: { replay: true } } });
    renderBattleFx(root, replay(1, fxOf({ battle: { foe: 'A', title: '' } })), ctx);
    assert.equal(renderBattleFx(root, replay(0, opening), ctx).played, true, 'replay switch replays');
    const off = renderBattleFx(root, { messageId: 1, readerSettings: {}, content: { currentIndex: 0, fx: opening } }, {});
    assert.equal(off.reason, 'disabled');
    assert.equal(frontOf(root).querySelector('.igs-fx-battle-plate'), null);
    assert.equal(frontOf(root).querySelector('.igs-fx-battle-encounter'), null);
    assert.equal(motionOf(root).getAttribute('data-igs-fx-battle-motion'), null);
    assert.equal(cancelBattleFx(root), false);
    const idle = makeStage();
    assert.equal(renderBattleFx(idle, { messageId: 1, readerSettings: { battleFx: ON }, content: { currentIndex: 0, fx: { hits: [] } } }, {}).reason, 'no-battle');
    assert.equal(idle.querySelector('#igs-fx-front'), null, 'no layers are created for pages without battle');
});

test('gate:fx-battle:foe-portrait-plan-and-url-whitelist', () => {
    assert.equal(safePortraitUrl('https://a.b/wolf.png'), 'https://a.b/wolf.png');
    assert.equal(safePortraitUrl('/user/images/wolf.png'), '/user/images/wolf.png');
    assert.equal(safePortraitUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
    assert.equal(safePortraitUrl('javascript:alert(1)'), '');
    assert.equal(safePortraitUrl('//evil.example/x.png'), '');
    const fx = fxOf({ battle: { foe: '头狼', title: '' }, battleStart: true, hits: [hit('crit', { target: '头狼' }), hit('hit', { target: '爱丽丝' })] });
    const plan = planBattleFx(fx, { settings: ON, identity: ID, spriteName: '爱丽丝', foeImage: '/img/wolf.png' });
    assert.equal(plan.events[0].portrait, '/img/wolf.png');
    assert.deepEqual(plan.events.slice(1).map((e) => e.targetKind), ['foe', 'sprite'], 'on-stage sprite wins over the foe portrait');
    assert.equal(plan.events[1].portrait, '/img/wolf.png');
    const bare = planBattleFx(fx, { settings: ON, identity: ID, foeImage: 'javascript:x' });
    assert.equal(bare.events[0].portrait, '');
    assert.equal(bare.events[1].targetKind, 'stage');
});

test('gate:fx-battle:foe-portrait-shows-in-encounter-and-steps-in-for-hits', () => {
    const root = makeStage();
    const timers = makeTimers();
    const fx = fxOf({ battle: { foe: '头狼', title: '' }, battleStart: true, hits: [hit('ko', { target: '头狼' })], foeImage: 'asset://wolf' });
    const snapshot = { messageId: 1, readerSettings: { battleFx: ON }, content: { currentIndex: 0, fx } };
    renderBattleFx(root, snapshot, { ...timers, playSfx: () => null, resolveAssetUrl: (url) => url.replace('asset://', '/img/') + '.png' });
    const encounter = frontOf(root).querySelector('.igs-fx-battle-encounter');
    assert.equal(encounter.querySelector('.igs-fx-battle-vs-portrait').getAttribute('src'), '/img/wolf.png');
    timers.advance(BATTLE_TIMING.encounterGap);
    const foe = root.querySelector('#igs-fx-stage').querySelector('.igs-fx-battle-foe');
    assert.ok(foe, 'foe steps onto the stage layer under the dialog');
    assert.equal(foe.getAttribute('data-igs-battle-result'), 'ko');
    assert.equal(foe.querySelector('.igs-fx-battle-foe-body').getAttribute('src'), '/img/wolf.png');
    timers.advance(BATTLE_TIMING.hit);
    assert.equal(root.querySelector('#igs-fx-stage').querySelector('.igs-fx-battle-foe'), null, 'foe leaves with the hit');
    cancelBattleFx(root);
    assert.equal(root.querySelector('#igs-fx-stage').querySelector('.igs-fx-battle-foe'), null);
});

test('gate:fx-battle:prompt-rule-only-when-enabled', () => {
    assert.equal(resolveBattleFxPromptRule(false), '');
    assert.equal(resolveBattleFxPromptRule(undefined), '');
    const rule = resolveBattleFxPromptRule(true);
    assert.match(rule, /\[igs-fx:battle\|对手名/);
    assert.match(rule, /\[igs-fx:hit\|出手者\|目标\|招式名\|效果\]/);
    assert.match(rule, /不要写伤害数字/);
    assert.match(rule, /大成功写暴击/);
});

test('gate:fx-battle:ancient-era-switches-to-ink-and-seal-markup-modern-unchanged', () => {
    const fx = fxOf({ battle: { foe: '青衣剑客', title: '华山弃徒' }, battleStart: true, hits: [hit('hit', { skill: '落英剑法' })] });
    const run = (ancient) => {
        const root = makeStage();
        const timers = makeTimers();
        const readerSettings = ancient ? { battleFx: ON, _ancientEra: true } : { battleFx: ON };
        const page = (index, pageFx) => renderBattleFx(root, { messageId: 1, readerSettings, content: { currentIndex: index, fx: pageFx } }, { ...timers, playSfx: () => null });
        page(0, fx);
        const front = frontOf(root);
        const encounter = front.querySelector('.igs-fx-battle-encounter');
        const plate = front.querySelector('.igs-fx-battle-plate');
        const vignette = root.querySelector('#igs-fx-stage').querySelector('.igs-fx-battle-vignette');
        timers.advance(BATTLE_TIMING.encounterGap);
        const hitNode = front.querySelector('.igs-fx-battle-hit');
        const pending = timers.size();
        page(1, fxOf({ battleEnd: 'win' }));
        const result = front.querySelector('.igs-fx-battle-result');
        return { encounter, plate, vignette, hitNode, result, pending };
    };
    const old = run(false);
    for (const node of [old.encounter, old.plate, old.vignette, old.hitNode, old.result]) assert.doesNotMatch(node.className, /is-ancient/);
    assert.equal(old.encounter.querySelector('.igs-fx-battle-vs-cap').textContent, 'ENCOUNTER');
    assert.equal(old.encounter.querySelector('.igs-fx-battle-seal'), null);
    assert.equal(old.plate.querySelector('.igs-fx-battle-plate-mark').textContent, 'VS');
    assert.equal(old.hitNode.querySelector('.igs-fx-battle-pop-label'), null, 'modern plain hit has no label');
    assert.equal(old.result.querySelector('.igs-fx-battle-ribbon-title').textContent, 'VICTORY');
    const ink = run(true);
    for (const node of [ink.encounter, ink.plate, ink.vignette, ink.hitNode, ink.result]) assert.match(node.className, /\bis-ancient\b/);
    assert.equal(ink.encounter.querySelector('.igs-fx-battle-vs-cap').textContent, '狭路相逢');
    assert.equal(ink.encounter.querySelector('.igs-fx-battle-seal').textContent, '战');
    assert.equal(ink.plate.querySelector('.igs-fx-battle-plate-mark').textContent, '战');
    assert.equal(ink.hitNode.querySelector('.igs-fx-battle-skill-name').textContent, '落英剑法');
    assert.equal(ink.hitNode.querySelectorAll('.igs-fx-battle-slash').length, 1, 'same slash node, restyled as ink sword light');
    assert.equal(ink.hitNode.querySelector('.igs-fx-battle-pop-label').textContent, '命中');
    assert.equal(ink.result.querySelector('.igs-fx-battle-ribbon-title').textContent, '胜');
    assert.equal(ink.result.querySelector('.igs-fx-battle-ribbon-text').textContent, '胜利');
    // 同一套时间轴：古代与现代在同一时刻播到同样的节点。
    assert.equal(ink.pending, old.pending);
    assert.match(BATTLE_FX_STYLE_TEXT, /\.igs-fx-battle-hit\.is-ancient \.igs-fx-battle-slash\{/);
    assert.match(BATTLE_FX_STYLE_TEXT, /\[data-igs-fx-static\] \.igs-fx-battle-slash/, 'reduced motion still hides the sword light');
});

test('gate: battle targets a stage cast member by name after the speaker', () => {
    const fx = { hits: [{ attacker: '甲', target: '乙', result: 'hit' }, { attacker: '乙', target: '甲', result: 'hit' }] };
    const plan = planBattleFx(fx, { settings: ON, identity: ID, spriteName: '甲', castNames: ['乙'] });
    assert.equal(plan.events[0].targetKind, 'cast');
    assert.equal(plan.events[0].targetChar, '乙');
    assert.equal(plan.events[1].targetKind, 'sprite');
    assert.equal(plan.events[1].targetChar, '');
});
