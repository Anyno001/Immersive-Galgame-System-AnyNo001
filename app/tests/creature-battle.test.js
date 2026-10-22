import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { readBattleCarry, createBattleHistoryScanner } from '../src/scene/battle-context.js';
import { addFrenzy, downCountFor, foeBaseName, hasGroupSuffix, matchFoeName, sameFoeName, splitFoeNames } from '../src/scene/creature-battle.js';
import { planBattleFx } from '../src/visual/igs-ui/fx-battle-model.js';
import { CREATURE_BATTLE_TIMING, annotateCreatureBattle, creatureSfxKind, disperseKindOf, foeIsDown, groupBodyCount } from '../src/visual/igs-ui/creature-battle-model.js';
import { CREATURE_SFX_PARTIALS } from '../src/visual/igs-ui/creature-battle-sfx.js';
import { absorbCreatureSprite, createCreatureState, expectedFoeImage, foeElementOf, groupBodyCover, groupBodyTargets, planGroupBodies, playCreatureEvent, settleCreatureTiers, syncGroupBodies } from '../src/visual/igs-ui/fx-creature-battle.js';
import { CREATURE_FOE_SLOTS, composeCreatureStage, resolveCreatureFoes } from '../src/visual/igs-ui/creature-layout.js';
import { layoutCastSlots } from '../src/visual/igs-ui/stage-cast-render.js';
import { editCharacterCreature } from '../src/visual/igs-ui/creature-settings.js';
import { creatureHintsOf } from '../src/scene/creature-registry.js';
import { confirmedCreatureOf, normalizeCreatureProfile } from '../src/scene/creature-profile.js';
import { HUMAN_BATTLE_TEXTS, captureHumanBattle } from './helpers/human-battle-capture.js';

const settings = { enabled: true };
const identity = { chatId: 'c', messageId: 1, swipeId: 0, page: 0 };
const dna = {
    野猪: { creature: { form: 'beast', size: 'medium', anchor: 'ground' } },
    哥布林: { creature: { form: 'beast', size: 'small', anchor: 'ground', group: true } },
    巨兽: { creature: { form: 'beast', size: 'giant', anchor: 'ground' } },
    幽灵: { creature: { form: 'humanoid', size: 'medium', anchor: 'float', temp: true } },
    待定怪: { creature: { form: 'auto', size: 'medium', anchor: 'ground' } },
};
const creatureOf = (name) => (Object.hasOwn(dna, name) ? confirmedCreatureOf(dna[name]) : null);
const plan = (fx, extra = {}) => planBattleFx({ userName: '旅人', ...fx }, { settings, identity, creatureOf, ...extra });

test('人类单对手战斗：解析、继承与计划与改动前（HEAD 源码）固化的基线逐项相同', () => {
    const expected = JSON.parse(readFileSync(new URL('./fixtures/human-battle-baseline.json', import.meta.url), 'utf8'));
    const mods = { extractFxDirectives, resolveFxAtPage, readBattleCarry, createBattleHistoryScanner, planBattleFx };
    for (const extra of [null, { creatureOf: () => null, foes: [], foeTiers: null }, { creatureOf: (name) => creatureOf(name), foes: [], foeTiers: null }, { creatureOf: (name) => creatureOf(name), keyOf: (name) => name }]) {
        const actual = captureHumanBattle(mods, extra);
        assert.deepEqual(actual.directives, expected.directives);
        assert.deepEqual(actual.carry, expected.carry);
        assert.deepEqual(actual.scanner, expected.scanner);
        for (const key of Object.keys(expected.pages)) {
            expected.pages[key].forEach((page, i) => {
                assert.deepEqual(actual.pages[key][i].input, page.input, `${key}#${i} 输入`);
                page.plans.forEach((item, j) => {
                    assert.deepEqual(actual.pages[key][i].plans[j].plan, item.plan, `${key}#${i} ${item.name}`);
                    if (extra) assert.deepEqual(actual.pages[key][i].plans[j].extra, item.plan, `${key}#${i} ${item.name} 带非人查询`);
                });
            });
        }
    }
    assert.ok(Object.keys(HUMAN_BATTLE_TEXTS).length >= 5);
});

test('待定档（auto）与人类对手：计划与不带非人查询时逐项相同', () => {
    const fx = { battle: { foe: '待定怪', title: '' }, battleStart: true, hits: [{ attacker: '我', target: '待定怪', skill: '斩', result: 'ko' }], battleEnd: 'win' };
    const base = planBattleFx(fx, { settings, identity });
    assert.deepEqual(plan(fx), base);
    assert.equal(plan(fx).creature, undefined);
    assert.equal(plan(fx).events.some((e) => e.creatures), false);
});

test('多对手拆分：单对手原样，顿号与逗号都可', () => {
    assert.deepEqual(splitFoeNames('史莱姆'), ['史莱姆']);
    assert.deepEqual(splitFoeNames('哥布林、哥布林头目，狼，狼'), ['哥布林', '哥布林头目', '狼']);
    assert.deepEqual(splitFoeNames(''), []);
    const single = extractFxDirectives('[igs-fx:battle|史莱姆|王国护卫]')[0];
    assert.deepEqual(single.args, ['史莱姆', '王国护卫']);
    const multi = extractFxDirectives('[igs-fx:battle|野猪、哥布林们|围攻]')[0];
    assert.deepEqual(multi.args, ['野猪、哥布林们', '围攻']);
    assert.equal(matchFoeName('哥布林们', ['野猪', '哥布林']), '哥布林');
    assert.equal(hasGroupSuffix('狼群'), true);
    assert.equal(foeBaseName('狼群'), '狼');
    assert.equal(matchFoeName('路人', ['野猪', '哥布林']), '');
});

test('phase 指令：同义词、区间状态、本页事件与跨楼继承', () => {
    for (const head of ['phase', '二阶段', '狂暴', 'enrage', 'frenzy']) {
        const list = extractFxDirectives(`[igs-fx:${head}|野猪]`);
        assert.deepEqual(list.map((d) => [d.kind, d.args]), [['phase', ['野猪']]], head);
    }
    assert.deepEqual(extractFxDirectives('[igs-fx:phase-end]'), []);
    const text = '[igs-fx:battle|野猪、哥布林]a[igs-fx:hit|我|野猪|斩|命中]b[igs-fx:phase|野猪]c[igs-fx:hit|野猪|我|冲撞|命中]d';
    const list = extractFxDirectives(text);
    const at = (needle) => text.indexOf(needle);
    const first = resolveFxAtPage(list, at('b[igs-fx:phase'), -1, null);
    assert.equal(first.phases, undefined);
    assert.equal(first.battle.frenzy, undefined);
    const phased = resolveFxAtPage(list, at('c[igs-fx:hit'), at('b[igs-fx:phase'), null);
    assert.deepEqual(phased.phases, [{ name: '野猪', at: 0 }]);
    assert.deepEqual(phased.battle.frenzy, ['野猪']);
    const later = resolveFxAtPage(list, text.length, at('c[igs-fx:hit'), null);
    assert.equal(later.phases, undefined);
    assert.deepEqual(later.battle.frenzy, ['野猪']);
    // 空名表示本场全部对手
    assert.deepEqual(addFrenzy([], '', '野猪、哥布林'), ['野猪', '哥布林']);
    // 跨楼继承：phase 单独一楼也算战斗仍在继续，开战楼层找到后并入名单
    assert.deepEqual(readBattleCarry('[igs-fx:phase|野猪]'), { active: true, phases: ['野猪'] });
    assert.deepEqual(readBattleCarry('[igs-fx:battle|野猪|称号][igs-fx:phase|野猪]').battle, { foe: '野猪', title: '称号', frenzy: ['野猪'] });
    const scanner = createBattleHistoryScanner();
    scanner.push({ isUser: false, text: '[igs-fx:phase|野猪]' });
    scanner.push({ isUser: false, text: '[igs-fx:battle|野猪、哥布林|围攻]' });
    assert.deepEqual(scanner.result().battle, { foe: '野猪、哥布林', title: '围攻', frenzy: ['野猪'] });
    const carried = resolveFxAtPage([], 0, -1, { battle: { foe: '野猪', title: '', frenzy: ['野猪'] } });
    assert.deepEqual(carried.battle, { foe: '野猪', title: '', frenzy: ['野猪'] });
    // 结束页记下对手
    const endText = '[igs-fx:battle|野猪][igs-fx:battle-end|胜利]';
    const over = resolveFxAtPage(extractFxDirectives(endText), endText.length, -1, null);
    assert.equal(over.battle, null);
    assert.deepEqual(over.battleOver, { foe: '野猪', title: '' });
});

test('非人对手计划：遭遇、我方打怪、怪打我方、治疗、结算都带 creatures 标注', () => {
    const fx = {
        battle: { foe: '野猪', title: '' }, battleStart: true, battleEnd: 'win',
        hits: [
            { attacker: '爱丽丝', target: '野猪', skill: '斩', result: 'crit' },
            { attacker: '野猪', target: '我', skill: '冲撞', result: 'hit' },
            { attacker: '野猪', target: '野猪', skill: '嚎叫', result: 'heal' },
            { attacker: '爱丽丝', target: '爱丽丝', skill: '自守', result: 'guard' },
            { attacker: '爱丽丝', target: '野猪', skill: '终结', result: 'ko' },
        ],
    };
    const result = plan(fx, { foeImage: 'https://example.test/pig.png', foeTiers: { menace: 'https://example.test/m.png' } });
    assert.equal(result.events[0].type, 'encounter');
    assert.equal(result.events[0].creatures[0].name, '野猪');
    assert.equal(result.events[0].creatures[0].tiers.menace, 'https://example.test/m.png');
    const hits = result.events.filter((e) => e.type === 'hit');
    assert.deepEqual(hits[0].creatures.map((c) => c.role), ['target']);
    assert.deepEqual(hits[1].creatures.map((c) => [c.role, c.name]), [['attacker', '野猪']]);
    assert.deepEqual(hits[2].creatures.map((c) => c.role), ['heal']);
    assert.equal(hits[3].creatures, undefined);
    assert.equal(hits[4].creatures[0].role, 'target');
    assert.equal(result.events[result.events.length - 1].creatures[0].name, '野猪');
    assert.equal(result.creature.foes.length, 1);
    // 其余字段与人类计划一致：去掉新增键后相同
    const strip = (p) => ({ ...p, creature: undefined, events: p.events.map((e) => ({ ...e, creatures: undefined })) });
    assert.deepEqual(JSON.parse(JSON.stringify(strip(result))), JSON.parse(JSON.stringify(strip(planBattleFx(fx, { settings, identity, foeImage: 'https://example.test/pig.png' })))));
});

test('二阶段事件插在已出招数之后，其后事件顺延；名字为空对应全部非人对手', () => {
    const fx = {
        battle: { foe: '野猪、哥布林', title: '' }, battleStart: false, battleEnd: '',
        hits: [{ attacker: '我', target: '野猪', skill: 'a', result: 'hit' }, { attacker: '野猪', target: '我', skill: 'b', result: 'hit' }],
        phases: [{ name: '野猪', at: 1 }],
    };
    const base = planBattleFx(fx, { settings, identity });
    const out = plan(fx);
    assert.deepEqual(out.events.map((e) => e.type), ['hit', 'phase', 'hit']);
    const phase = out.events[1];
    assert.equal(phase.creatures[0].name, '野猪');
    assert.equal(phase.at, base.events[1].at);
    assert.equal(out.events[2].at, base.events[1].at + phase.life + Math.round(CREATURE_BATTLE_TIMING.phaseGap));
    assert.equal(out.totalMs, out.events[2].at + out.events[2].life);
    const all = plan({ ...fx, phases: [{ name: '', at: 0 }] });
    assert.deepEqual(all.events.map((e) => e.type), ['phase', 'hit', 'hit']);
    assert.equal(all.events[0].creatures.length, 2);
    // 人类对手的 phase 被忽略
    const human = planBattleFx({ ...fx, battle: { foe: '强盗', title: '' }, phases: [{ name: '强盗', at: 0 }] }, { settings, identity, creatureOf });
    assert.deepEqual(human.events.map((e) => e.type), ['hit', 'hit']);
    // 基准狂暴名单：本页发生的二阶段不算基准
    const carried = plan({ ...fx, battle: { foe: '野猪', title: '', frenzy: ['野猪'] }, phases: [] });
    assert.deepEqual(carried.creature.frenzy, ['野猪']);
    assert.equal(carried.creature.foes[0].frenzy, true);
    const samePage = plan({ ...fx, battle: { foe: '野猪', title: '', frenzy: ['野猪'] }, phases: [{ name: '野猪', at: 0 }] });
    assert.deepEqual(samePage.creature.frenzy, []);
});

test('多对手与同名杂兵：目标匹配、成群标记、同屏上限', () => {
    const fx = {
        battle: { foe: '野猪、哥布林们', title: '围攻' }, battleStart: true, battleEnd: '',
        hits: [{ attacker: '我', target: '哥布林们', skill: '横扫', result: 'hit' }, { attacker: '我', target: '野猪', skill: '刺', result: 'miss' }],
    };
    const out = plan(fx, { foes: [{ name: '野猪', image: 'https://example.test/pig.png', tiers: null }, { name: '哥布林们', image: 'https://example.test/gob.png', tiers: null }] });
    assert.deepEqual(out.creature.foes.map((f) => [f.name, f.group]), [['野猪', false], ['哥布林', true]]);
    assert.equal(out.events[1].creatures[0].name, '哥布林');
    assert.equal(out.events[1].targetKind, 'foe');
    assert.equal(out.events[1].portrait, 'https://example.test/gob.png');
    assert.equal(out.events[2].creatures[0].name, '野猪');
    assert.equal(out.plate.foe, '野猪、哥布林们');
    const stage = composeCreatureStage({ speaker: { character: '爱丽丝', image: 'a.png' }, members: [], foes: [{ character: '野猪', image: 'p.png' }, { character: '哥布林', image: 'g.png' }, { character: '蝙蝠', image: 'b.png' }] });
    assert.deepEqual(stage.members.map((m) => m.character), ['野猪', '哥布林']);
    assert.deepEqual(stage.pin, ['野猪', '哥布林']);
    assert.equal(CREATURE_FOE_SLOTS, 2);
    const slots = layoutCastSlots({ members: [{ character: '路人', order: 1 }, { character: '野猪', order: 9 }, { character: '哥布林', order: 9 }], hasSpeaker: true, capacity: 3, pin: ['野猪', '哥布林'] });
    assert.deepEqual(slots.members.map((m) => m.character).sort(), ['哥布林', '野猪']);
    // 单对手写法的 pin 仍是字符串
    assert.equal(composeCreatureStage({ speaker: { character: '爱丽丝', image: 'a.png' }, foe: { character: '野猪', image: 'p.png' } }).pin, '野猪');
});

test('档案标了 group 的对手无需「们」也按成群处理，并带上已倒下数量', () => {
    const out = plan({ battle: { foe: '哥布林', title: '', down: ['哥布林'] }, hits: [] });
    assert.equal(out.creature.foes[0].group, true);
    assert.equal(out.creature.foes[0].down, 1);
});

test('对手档案与图的取法：成群后缀回落本名、二阶段后基准用狂暴档', () => {
    const spriteOf = (name, mood) => ({ url: `${name}-${mood || '常态'}.png`, character: name });
    const list = resolveCreatureFoes({ raw: '野猪、哥布林们、路人', dnaMap: dna, spriteOf, frenzy: ['野猪'], withTiers: true });
    assert.deepEqual(list.map((f) => [f.raw, f.name]), [['野猪', '野猪'], ['哥布林们', '哥布林']]);
    assert.equal(list[0].image, '野猪-不满.png');
    assert.equal(list[1].image, '哥布林-常态.png');
    assert.deepEqual(Object.keys(list[1].tiers), ['menace', 'wounded', 'frenzy']);
    const phased = resolveCreatureFoes({ raw: '野猪', dnaMap: dna, spriteOf, frenzy: ['野猪'], phases: [{ name: '野猪', at: 0 }] });
    assert.equal(phased[0].image, '野猪-常态.png');
    assert.deepEqual(resolveCreatureFoes({ raw: '待定怪', dnaMap: dna, spriteOf }), []);
});

test('建档线索：多对手逐个登记，单对手不变', () => {
    assert.deepEqual(creatureHintsOf('[igs-fx:battle|史莱姆|护卫]').map((h) => h.name), ['史莱姆']);
    assert.deepEqual(creatureHintsOf('[igs-fx:battle|史莱姆、蝙蝠|围攻]').map((h) => h.name), ['史莱姆', '蝙蝠']);
});

test('消散方式与音效：按形态选择，音效按体型分档', () => {
    assert.equal(disperseKindOf({ anchor: 'float', form: 'beast', size: 'medium' }), 'smoke');
    assert.equal(disperseKindOf({ anchor: 'ground', form: 'humanoid', size: 'medium' }), 'smoke');
    assert.equal(disperseKindOf({ anchor: 'ground', form: 'beast', size: 'giant' }), 'sink');
    assert.equal(disperseKindOf({ anchor: 'ground', form: 'beast', size: 'large' }), 'sink');
    assert.equal(disperseKindOf({ anchor: 'ground', form: 'beast', size: 'small' }), 'shatter');
    assert.equal(groupBodyCount({ group: false, size: 'small' }), 1);
    assert.equal(groupBodyCount({ group: true, size: 'small' }), 3);
    assert.equal(groupBodyCount({ group: true, size: 'small' }, true), 2);
    for (const kind of ['roar', 'hurt', 'fade']) for (const size of ['small', 'medium', 'large', 'giant']) assert.ok(CREATURE_SFX_PARTIALS[creatureSfxKind(kind, size)], `${kind}-${size}`);
    const low = (kind, size) => Math.min(...CREATURE_SFX_PARTIALS[creatureSfxKind(kind, size)].map((p) => Math.min(p.from, p.to)));
    assert.ok(low('roar', 'giant') < low('roar', 'small'));
});

test('转正：临时档案去掉临时标记，其余字段保留', () => {
    const base = { identity: 'x', creature: normalizeCreatureProfile({ form: 'beast', size: 'large', temp: true, seenAt: 5 }) };
    const next = editCharacterCreature(base, 'temp', 'false');
    assert.equal(next.creature.temp, false);
    assert.equal(next.creature.size, 'large');
    assert.equal(next.creature.seenAt, undefined);
    assert.equal(next.identity, 'x');
    assert.equal(editCharacterCreature({ creature: normalizeCreatureProfile({ temp: false }) }, 'temp', 'false'), null);
});

// ---- DOM 层：最小假元素，验证档位切换、动画登记与回收，不涉及真实渲染 ----
function fakeEl(name, extra = {}) {
    const attrs = new Map(Object.entries(extra.attrs || {}));
    const el = {
        tagName: 'DIV', classList: { contains: (c) => (extra.classes || []).includes(c) }, parentNode: null, children: [],
        style: { backgroundImage: 'url("calm.png")', backgroundSize: '100% auto', backgroundPosition: '50% 100%', display: '', getPropertyValue: () => '', setProperty() {} },
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), hasAttribute: (k) => attrs.has(k), setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k),
        animate(frames, opts) { el.calls.push({ frames, opts }); return { cancel() {}, finish() {} }; }, calls: [], remove() {},
        insertBefore() {}, querySelector: () => null, querySelectorAll: () => [],
    };
    el.name = name;
    return el;
}

function fakeHost({ reduced = false, low = false } = {}) {
    const sprite = fakeEl('野猪');
    const timers = [];
    const sounds = [];
    const shakes = [];
    const motion = { querySelector: (sel) => (sel === '#igs-sprite' ? sprite : null), animate: () => ({}) };
    const host = {
        doc: { createElement: () => fakeEl('ghost') }, root: { querySelector: () => null }, motion, stage: null, front: null, cs: createCreatureState(),
        reduced, low, pace: 1, spriteName: '野猪',
        track: (fn, ms) => timers.push({ fn, ms }), keep() {}, anim: (el, frames, opts) => el.animate(frames, opts),
        shake: (level) => shakes.push(level), sfx: (kind) => sounds.push(kind),
    };
    return { host, sprite, timers, sounds, shakes };
}

const summary = (extra = {}) => ({ name: '野猪', size: 'medium', form: 'beast', anchor: 'ground', group: false, temp: false, tiers: { menace: 'menace.png', wounded: 'wounded.png', frenzy: 'frenzy.png' }, ...extra });

test('DOM：命中切受创档再回落；暴击更重；击倒去色消散；快进与翻页回到原图', () => {
    const { host, sprite, timers, sounds } = fakeHost();
    assert.equal(foeElementOf(host, '野猪'), sprite);
    assert.equal(playCreatureEvent(host, { type: 'hit', result: 'hit', creatures: [{ ...summary(), role: 'target' }] }, 1300), true);
    assert.equal(sprite.style.backgroundImage, 'url("wounded.png")');
    assert.ok(sounds[0].startsWith('creature-hurt'));
    assert.ok(sprite.calls.length >= 2);
    timers.shift().fn();
    assert.equal(sprite.style.backgroundImage, 'url("calm.png")');
    const before = sprite.calls.length;
    playCreatureEvent(host, { type: 'hit', result: 'crit', creatures: [{ ...summary(), role: 'target' }] }, 1300);
    assert.ok(sprite.calls.length > before);
    const critFilter = sprite.calls[sprite.calls.length - 2].frames.map((f) => f.filter).join(' ');
    assert.match(critFilter, /brightness\(3\.2\)/);
    settleCreatureTiers(host.cs, { full: true });
    assert.equal(sprite.style.backgroundImage, 'url("calm.png")');
    // 击倒：切受创图、播放消散音效，并留下 fill:forwards 的离场动画
    const ko = fakeHost();
    playCreatureEvent(ko.host, { type: 'hit', result: 'ko', creatures: [{ ...summary({ size: 'large' }), role: 'target' }] }, 1600);
    assert.equal(ko.sprite.style.backgroundImage, 'url("wounded.png")');
    assert.ok(ko.sounds.some((k) => k.startsWith('creature-fade-large')));
    assert.ok(ko.sprite.calls.some((c) => c.opts.fill === 'forwards'));
    // 读者换图后不覆盖
    const swapped = fakeHost();
    playCreatureEvent(swapped.host, { type: 'hit', result: 'hit', creatures: [{ ...summary(), role: 'target' }] }, 1300);
    swapped.sprite.style.backgroundImage = 'url("other.png")';
    settleCreatureTiers(swapped.host.cs, { full: true });
    assert.equal(swapped.sprite.style.backgroundImage, 'url("other.png")');
});

test('DOM：怪前冲切威吓档并震屏；二阶段切狂暴档保留；减少动效不位移', () => {
    const lunge = fakeHost();
    playCreatureEvent(lunge.host, { type: 'hit', result: 'hit', creatures: [{ ...summary(), role: 'attacker' }] }, 1300);
    assert.equal(lunge.sprite.style.backgroundImage, 'url("menace.png")');
    assert.ok(lunge.sprite.calls.some((c) => c.frames.some((f) => /scale\(1\.26\)/.test(f.transform || ''))));
    lunge.timers.find((t) => t.ms > 0 && t.ms < 500).fn();
    assert.deepEqual(lunge.shakes, ['heavy']);
    const phase = fakeHost();
    playCreatureEvent(phase.host, { type: 'phase', creatures: [summary()] }, 2300);
    phase.timers[0].fn();
    assert.equal(phase.sprite.style.backgroundImage, 'url("frenzy.png")');
    settleCreatureTiers(phase.host.cs);
    assert.equal(phase.sprite.style.backgroundImage, 'url("frenzy.png")');
    settleCreatureTiers(phase.host.cs, { full: true });
    assert.equal(phase.sprite.style.backgroundImage, 'url("calm.png")');
    const still = fakeHost({ reduced: true });
    playCreatureEvent(still.host, { type: 'hit', result: 'crit', creatures: [{ ...summary(), role: 'target' }] }, 1300);
    assert.equal(still.sprite.calls.length, 0);
    assert.equal(still.sprite.style.backgroundImage, 'url("wounded.png")');
    // 不在台上的对手不处理
    const off = fakeHost();
    assert.equal(playCreatureEvent(off.host, { type: 'hit', result: 'hit', creatures: [{ ...summary({ name: '别人' }), role: 'target' }] }, 1300), false);
});

test('DOM：收服时立绘缩小被吸入法器位置；减少动效只淡出', () => {
    const el = fakeEl('野猪');
    const anims = absorbCreatureSprite(el, { x: 20, y: 28 }, { life: 3000, origin: { x: 60, y: 100 } });
    assert.equal(anims.length, 2);
    const frames = el.calls[0].frames;
    assert.match(frames[1].transform, /scale\(1\)/);
    assert.match(frames[2].transform, /scale\(\.62\)/);
    assert.match(frames[3].transform, /translate\(-40%,-72%\) scale\(\.04\)/);
    // 吸入完成后保持消失（forwards），不再现身
    assert.equal(el.calls[0].opts.fill, 'forwards');
    assert.equal(el.calls[1].opts.fill, 'forwards');
    assert.equal(el.calls[1].frames.at(-1).opacity, 0);
    const still = fakeEl('野猪');
    absorbCreatureSprite(still, { x: 20, y: 28 }, { reduced: true });
    assert.equal(still.calls.length, 1);
    assert.equal(still.calls[0].frames[0].transform, undefined);
});

test('annotateCreatureBattle：没有 creatureOf 或没有非人角色时返回同一个计划', () => {
    const fx = { battle: { foe: '强盗', title: '' }, hits: [{ attacker: '我', target: '强盗', skill: 'a', result: 'hit' }] };
    const base = planBattleFx(fx, { settings, identity });
    assert.equal(annotateCreatureBattle(base, fx, { creatureOf }), base);
    assert.equal(annotateCreatureBattle(base, fx, {}), base);
    assert.equal(syncGroupBodies(fakeHost().host, base), undefined);
});

// ---- 击倒 / 收服跨页保持 ----
test('跨页保持：击倒与收服记入 battle.down，本页自己的不算，群怪按身影数', () => {
    const text = '[igs-fx:battle|野猪、哥布林]a[igs-fx:hit|我|野猪|斩|击倒]b[igs-fx:subdue|金钵|哥布林]c[igs-fx:hit|我|哥布林们|扫|击倒]d';
    const list = extractFxDirectives(text);
    const at = (needle) => text.indexOf(needle);
    const page2 = resolveFxAtPage(list, at('c[igs-fx:hit'), at('b[igs-fx:subdue'), null);
    assert.deepEqual(page2.battle.down, ['野猪', '哥布林']);
    const page3 = resolveFxAtPage(list, text.length, at('c[igs-fx:hit'), null);
    assert.deepEqual(page3.battle.down, ['野猪', '哥布林', '哥布林们']);
    // 本页的击倒与收服不算已倒下
    assert.equal(downCountFor(page2, '哥布林'), 0);
    assert.equal(downCountFor(page2, '野猪'), 1);
    assert.equal(downCountFor(page3, '野猪'), 1);
    assert.equal(downCountFor(page3, '哥布林'), 1);
    // 战斗结束那页仍认得已倒下的
    const endText = text + '[igs-fx:battle-end|胜利]';
    const over = resolveFxAtPage(extractFxDirectives(endText), endText.length, text.length - 1, null);
    assert.equal(downCountFor(over, '野猪'), 1);
    // 非群怪倒一次就不再上台；群怪倒完所有身影才不上台
    assert.equal(foeIsDown(page3, '野猪', { group: false, size: 'medium' }), true);
    assert.equal(foeIsDown({ battle: { foe: '哥布林', down: ['哥布林'] } }, '哥布林', { group: true, size: 'small' }), false);
    assert.equal(foeIsDown({ battle: { foe: '哥布林', down: ['哥布林', '哥布林们', '哥布林'] } }, '哥布林', { group: true, size: 'small' }), true);
    assert.equal(foeIsDown({ battle: { foe: '野猪', down: ['野猪', '野猪'] } }, '野猪', { group: true, size: 'large' }), true);
});

test('跨楼继承：击倒与收服随战斗链带到下一楼，人类的有无不影响其余字段', () => {
    assert.deepEqual(readBattleCarry('[igs-fx:battle|野猪|x][igs-fx:hit|我|野猪|斩|击倒]').battle, { foe: '野猪', title: 'x', down: ['野猪'] });
    assert.deepEqual(readBattleCarry('[igs-fx:hit|我|野猪|斩|击倒]'), { active: true, down: ['野猪'] });
    assert.deepEqual(readBattleCarry('[igs-fx:hit|我|野猪|斩|命中]'), { active: true });
    // 只有收服标签、没有战斗标签的楼层不算战斗仍在继续
    assert.equal(readBattleCarry('[igs-fx:subdue|金钵|野猪]'), null);
    const scanner = createBattleHistoryScanner();
    scanner.push({ isUser: false, text: '[igs-fx:hit|我|哥布林们|扫|击倒][igs-fx:subdue|金钵|野猪]' });
    scanner.push({ isUser: false, text: '[igs-fx:battle|野猪、哥布林|围攻][igs-fx:hit|我|哥布林们|扫|击倒]' });
    assert.deepEqual(scanner.result().battle.down, ['哥布林们', '哥布林们', '野猪']);
    const carried = resolveFxAtPage([], 0, -1, { battle: { foe: '野猪', title: '', down: ['野猪'] } });
    assert.deepEqual(carried.battle.down, ['野猪']);
});

test('群怪身影：按立绘宽度收拢并收进可视区，窄舞台也全部可见', () => {
    const phone = { stageW: 390, stageH: 844 };
    const inside = (list) => list.every((x) => x >= 390 * 0.08 - 1 && x <= 390 * 0.92 + 1);
    // 贴右：都排到左边
    const right = groupBodyTargets({ ...phone, cx: 290, w: 120 }, 2);
    assert.ok(right.every((x) => x < 290) && inside(right));
    // 贴左：都排到右边
    const left = groupBodyTargets({ ...phone, cx: 100, w: 120 }, 2);
    assert.ok(left.every((x) => x > 100) && inside(left));
    // 居中：一左一右
    const mid = groupBodyTargets({ ...phone, cx: 195, w: 90 }, 2);
    assert.ok(mid[0] < 195 && mid[1] > 195 && inside(mid));
    // 立绘很大、中心在舞台外：以可见一侧为准，仍全部落在可视区
    for (const cx of [-200, 40, 500, 900]) for (const w of [60, 300, 900]) assert.ok(inside(groupBodyTargets({ ...phone, cx, w }, 2)), `${cx}/${w}`);
    assert.equal(groupBodyTargets({ ...phone, cx: 195, w: 90 }, 1).length, 1);
    // 电脑横屏
    assert.ok(inside(groupBodyTargets({ stageW: 390, stageH: 300, cx: 273, w: 80 }, 2)));
});

test('窄舞台群怪：每个身影的头部被遮挡不超过 1/3，排不下降为 2 个并加大错位；横屏保持 3 个', () => {
    const phone = { stageW: 390, stageH: 844, dialogTop: 640 };
    const boxOf = (cx, w, hy, r) => ({ ...phone, cx, w, hx: cx, hy, r, ox: cx });
    for (const [cx, w, hy, r] of [[300, 220, 420, 90], [300, 150, 480, 60], [195, 200, 400, 80], [90, 260, 380, 110], [330, 300, 450, 120]]) {
        const box = boxOf(cx, w, hy, r);
        const plan2 = planGroupBodies(box, 2, true);
        assert.ok(plan2.length >= 1 && plan2.length <= 2);
        assert.ok(groupBodyCover(box, plan2) <= 1 / 3 + 1e-9 || plan2.length === 1, `${cx}/${w}`);
        for (const config of plan2) assert.ok(config.target >= 390 * 0.08 - 1 && config.target <= 390 * 0.92 + 1);
        // 竖屏的后排比横屏更高
        assert.ok(plan2[0].lift >= 0.1);
    }
    // 前排把后排头部大面积盖住时降为 1 个，且更高
    const crowded = boxOf(195, 300, 420, 120);
    const fallback = planGroupBodies(crowded, 2, true);
    assert.equal(fallback.length, 1);
    assert.ok(groupBodyCover(crowded, fallback) <= 1 / 3 + 1e-9);
    // 横屏维持 2 个后排（共 3 个）
    const wide = { stageW: 1280, stageH: 720, dialogTop: 520, cx: 900, w: 160, hx: 900, hy: 400, r: 40, ox: 900 };
    assert.equal(planGroupBodies(wide, 2, false).length, 2);
});

test('DOM：遭遇卡在对手已上台时不再放第二张对手立绘（由 fx-battle 调用 foeElementOf 判断）', () => {
    const { host, sprite } = fakeHost();
    assert.equal(foeElementOf(host, '野猪'), sprite);
    assert.equal(foeElementOf(host, '没上台的'), null);
});

// ---- 严格匹配、逗号、档位还原、收服翻页、测量缓存 ----
test('对手名匹配：精确优先，包含匹配只在没有精确匹配且候选唯一时才算', () => {
    assert.equal(matchFoeName('哥布林', ['哥布林头目', '哥布林']), '哥布林');
    assert.equal(matchFoeName('哥布林头目', ['哥布林头目', '哥布林']), '哥布林头目');
    assert.equal(matchFoeName('头目', ['哥布林头目', '哥布林']), '哥布林头目');
    assert.equal(matchFoeName('哥布林', ['哥布林头目', '哥布林队长']), '');
    assert.equal(matchFoeName('哥布林们', ['哥布林头目', '哥布林']), '哥布林');
    assert.equal(sameFoeName('哥布林头目', '哥布林'), false);
});

test('哥布林头目、哥布林：击倒哥布林不算头目倒下，phase 哥布林不让头目狂暴', () => {
    const local = { ...dna, 哥布林头目: { creature: { form: 'beast', size: 'medium', anchor: 'ground' } }, 哥布林: { creature: { form: 'beast', size: 'small', anchor: 'ground' } } };
    const own = (name) => (Object.hasOwn(local, name) ? confirmedCreatureOf(local[name]) : null);
    const fx = { battle: { foe: '哥布林头目、哥布林', title: '', down: ['哥布林'], frenzy: ['哥布林'] }, hits: [], phases: [] };
    assert.equal(downCountFor(fx, '哥布林头目'), 0);
    assert.equal(downCountFor(fx, '哥布林'), 1);
    const out = planBattleFx({ userName: '旅人', ...fx }, { settings, identity, creatureOf: own });
    assert.deepEqual(out.creature.foes.map((f) => [f.name, f.frenzy, f.down]), [['哥布林头目', false, 0], ['哥布林', true, 1]]);
    const phased = planBattleFx({ userName: '旅人', battle: { foe: '哥布林头目、哥布林', title: '', frenzy: ['哥布林'] }, hits: [{ attacker: '我', target: '哥布林', skill: 'a', result: 'ko' }], phases: [{ name: '哥布林', at: 0 }] }, { settings, identity, creatureOf: own });
    const phase = phased.events.find((e) => e.type === 'phase');
    assert.deepEqual(phase.creatures.map((c) => c.name), ['哥布林']);
    assert.deepEqual(phased.events.find((e) => e.type === 'hit').creatures.map((c) => c.name), ['哥布林']);
    const spriteOf = (name, mood) => ({ url: `${name}-${mood || '常态'}.png`, character: name });
    const list = resolveCreatureFoes({ raw: '哥布林头目、哥布林', dnaMap: local, spriteOf, frenzy: ['哥布林'] });
    assert.deepEqual(list.map((f) => f.image), ['哥布林头目-常态.png', '哥布林-不满.png']);
});

test('多对手只按「、」和全角「，」拆分，ASCII 逗号留在名字里', () => {
    assert.deepEqual(splitFoeNames('Arthur, King of Britons'), ['Arthur, King of Britons']);
    assert.deepEqual(splitFoeNames('哥布林、狼，蝙蝠'), ['哥布林', '狼', '蝙蝠']);
    assert.deepEqual(creatureHintsOf('[igs-fx:battle|Arthur, King of Britons|x]').map((h) => h.name), ['Arthur, King of Britons']);
});

test('档位还原：翻页后阅读器已按当前档写好的图不再被改回原图', () => {
    // 二阶段钉成狂暴图后翻页：新一页基准也是狂暴图（图地址与钉住时相同），不得退回常态
    const sticky = fakeHost();
    playCreatureEvent(sticky.host, { type: 'phase', creatures: [summary()] }, 2300);
    sticky.timers[0].fn();
    assert.equal(sticky.sprite.style.backgroundImage, 'url("frenzy.png")');
    settleCreatureTiers(sticky.host.cs, { full: true, expected: () => 'url("frenzy.png")' });
    assert.equal(sticky.sprite.style.backgroundImage, 'url("frenzy.png")');
    // 新一页的基准应是常态而元素上还是本模块钉的图：改回新一页的基准
    const stale = fakeHost();
    playCreatureEvent(stale.host, { type: 'phase', creatures: [summary()] }, 2300);
    stale.timers[0].fn();
    settleCreatureTiers(stale.host.cs, { full: true, expected: () => 'url("calm.png")' });
    assert.equal(stale.sprite.style.backgroundImage, 'url("calm.png")');
    // 阅读器写了别的图（如说话情绪图）：不碰
    const other = fakeHost();
    playCreatureEvent(other.host, { type: 'hit', result: 'ko', creatures: [{ ...summary(), role: 'target' }] }, 1600);
    other.sprite.style.backgroundImage = 'url("mood.png")';
    settleCreatureTiers(other.host.cs, { full: true, expected: () => 'url("calm.png")' });
    assert.equal(other.sprite.style.backgroundImage, 'url("mood.png")');
    // 没有新一页的信息：退回最初的图
    const legacy = fakeHost();
    playCreatureEvent(legacy.host, { type: 'result', result: 'lose', creatures: [summary()] }, 3000);
    assert.equal(legacy.sprite.style.backgroundImage, 'url("menace.png")');
    settleCreatureTiers(legacy.host.cs, { full: true });
    assert.equal(legacy.sprite.style.backgroundImage, 'url("calm.png")');
    // 期望函数：二阶段后的页面用狂暴档
    const host = fakeHost();
    const expect = expectedFoeImage(host.host, { creature: { foes: [{ name: '野猪', frenzy: true, image: 'calm.png', tiers: { frenzy: 'frenzy.png' } }] } });
    assert.equal(expect(host.sprite), 'url("frenzy.png")');
});

test('收服后翻页：保持消失的动画由日常演出登记，翻页取消，立绘恢复', async () => {
    const { makeStage, makeTimers } = await import('./helpers/fake-dom.js');
    const { renderDailyFx } = await import('../src/visual/igs-ui/fx-daily.js');
    const root = makeStage({ waapi: true });
    const sprite = root.querySelector('#igs-sprite');
    sprite.style.backgroundImage = 'url("boar.png")';
    const timers = makeTimers();
    const snapshot = (id, fx) => ({
        messageId: id,
        readerSettings: { dailyFx: { enabled: true, packMyth: true, subdue: true }, _sceneAssets: { enabled: true, characterDna: dna }, fxSound: { enabled: false, volume: 0 } },
        content: { spriteCharacter: '野猪', speaker: '野猪', currentIndex: 0, fx },
    });
    const ctx = { reducedMotion: false, schedule: timers.schedule, clear: timers.clear, playSfx: () => {} };
    renderDailyFx(root, snapshot('m1', { daily: [{ type: 'subdue', mode: 'bowl', who: '野猪' }] }), ctx);
    const held = (sprite.animations || []).filter((a) => a.options && a.options.fill === 'forwards');
    assert.equal(held.length, 2);
    assert.ok(held.every((a) => a.state === 'running'));
    renderDailyFx(root, snapshot('m2', { daily: [] }), ctx);
    assert.ok(held.every((a) => a.state === 'cancelled'), '翻页后保持消失的动画被取消');
});

test('群怪测量缓存：签名不变不重测，舞台尺寸变化才重建', () => {
    const { host, sprite } = fakeHost();
    host.motion.clientWidth = 390;
    host.motion.clientHeight = 844;
    host.doc = { createElement: () => fakeEl('ghost') };
    sprite.parentNode = { insertBefore(node) { node.parentNode = this; }, children: [] };
    const plan = { plate: { foe: '野猪' }, events: [], creature: { foes: [{ name: '野猪', group: true, size: 'small', down: 0 }] } };
    syncGroupBodies(host, plan);
    const first = host.cs.groups.get('野猪');
    syncGroupBodies(host, plan);
    assert.equal(host.cs.groups.get('野猪'), first);
    host.motion.clientWidth = 360;
    syncGroupBodies(host, plan);
    assert.notEqual(host.cs.groups.get('野猪').sig, first.sig);
});
