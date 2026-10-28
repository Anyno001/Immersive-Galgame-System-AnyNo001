import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, makeStage, makeTimers } from './helpers/fake-dom.js';
import {
    createDemonState, demonOffset, isInnerDemonName, normalizeInnerDemonSettings, parseInnerDemonName, resolveDemonOwner, spriteCenter, stepInnerDemon,
} from '../src/scene/inner-demon.js';
import { isNonSpriteSpeaker } from '../src/scene/asset-match.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { cancelInnerDemon, playInnerDemon } from '../src/visual/igs-ui/fx-inner-demon.js';

const known = [{ key: '林小雨', names: ['小雨'] }, { key: '苏晴', names: [] }];

test('说话人名：心魔与自我对话写法', () => {
    const cases = [
        ['心魔', 'demon', ''], ['林小雨的心魔', 'demon', '林小雨'], ['林小雨（心魔）', 'demon', '林小雨'], ['林小雨(心魔)', 'demon', '林小雨'],
        ['另一个我', 'demon', ''], ['另一个自己', 'demon', ''], ['内心的声音', 'demon', ''], ['林小雨·心魔', 'demon', '林小雨'],
        ['黑化的林小雨', 'demon', '林小雨'], ['另一个林小雨', 'demon', '林小雨'], ['里林小雨', 'demon', '林小雨'], ['林小雨·里', 'demon', '林小雨'],
        ['第二人格', 'demon', ''], ['林小雨（第二人格）', 'demon', '林小雨'], ['林小雨的副人格', 'demon', '林小雨'], ['里人格', 'demon', ''],
        ['林小雨（另一个人格）', 'demon', '林小雨'], ['人格分裂', 'demon', ''], ['分裂人格', 'demon', ''], ['多重人格', 'demon', ''], ['黑化人格', 'demon', ''],
        ['镜中的我', 'demon', ''], ['镜中人', 'demon', ''], ['林小雨（本我）', 'demon', '林小雨'], ['林小雨的超我', 'demon', '林小雨'], ['林小雨（自我）', 'demon', '林小雨'],
        ['主人格', 'body', ''], ['林小雨（表人格）', 'body', '林小雨'], ['林小雨的主人格', 'body', '林小雨'],
    ];
    for (const [name, side, owner] of cases) {
        const r = parseInnerDemonName(name, known);
        assert.ok(r, name);
        assert.equal(r.side, side, name);
        assert.equal(r.owner, owner, name);
    }
});

test('说话人名：不误伤', () => {
    for (const name of ['', '林小雨', '旁白', '影子', '本我', '自我', '超我', '自己', '黑化的路人', '另一个路人', '里面的人', '心魔王', '魔']) {
        assert.equal(parseInnerDemonName(name, known), null, name);
    }
    assert.equal(isInnerDemonName('林小雨的心魔'), true);
    assert.equal(isInnerDemonName('黑化的林小雨'), false);
    // 心魔名不触发立绘生成 / 名字兜底：按非立绘说话人处理。
    assert.equal(isNonSpriteSpeaker('林小雨（心魔）'), true);
    assert.equal(isNonSpriteSpeaker('林小雨'), false);
});

test('本体解析', () => {
    const p = (name) => parseInnerDemonName(name, known);
    assert.equal(resolveDemonOwner(p('心魔'), { known, lastBody: '苏晴' }), '苏晴');
    assert.equal(resolveDemonOwner(p('心魔'), { known, lastBody: '' }), '');
    assert.equal(resolveDemonOwner(p('小雨的心魔'), { known, lastBody: '苏晴' }), '林小雨');
    assert.equal(resolveDemonOwner(p('我的心魔'), { known, lastBody: '苏晴' }), '苏晴');
    assert.equal(resolveDemonOwner(p('路人甲的心魔'), { known, lastBody: '苏晴' }), '');
    assert.equal(resolveDemonOwner(p('黑化的苏晴'), { known, lastBody: '林小雨' }), '苏晴');
    assert.equal(resolveDemonOwner(null, { known }), '');
});

test('黑影站位对侧、居中时退到侧边', () => {
    assert.equal(demonOffset(25), 50);
    assert.equal(demonOffset(75), -50);
    assert.equal(Math.abs(demonOffset(50)), 30);
    assert.equal(demonOffset(10), 78);
    assert.equal(spriteCenter('50% 100%', '60% auto'), 50);
    assert.equal(spriteCenter('0% 100%', '40% auto'), 20);
});

function drive(inputs) {
    let state = createDemonState();
    return inputs.map((input, i) => {
        const r = stepInnerDemon(state, { pageKey: `p${i}`, ...input });
        state = r.state;
        return r.action + (r.turn ? `:${r.turn}` : '');
    });
}
const demon = (owner = '林小雨') => ({ parsed: { side: 'demon', owner: '', word: '心魔' }, owner });
const body = { speaker: '林小雨' };

test('状态进退：本体说话不计安静，旁白连续 3 页才散', () => {
    assert.deepEqual(drive([body, demon(), body, demon(), body, {}, {}, {}]), ['none', 'enter:demon', 'stay:body', 'stay:demon', 'stay:body', 'stay', 'stay', 'leave']);
    // 本体说话打断连续计数
    assert.deepEqual(drive([demon(), {}, {}, body, {}, {}, {}]), ['enter:demon', 'stay', 'stay', 'stay:body', 'stay', 'stay', 'leave']);
});

test('状态进退：第三人说话与换场景退出，主人格算本体说话', () => {
    assert.deepEqual(drive([demon(), { speaker: '苏晴' }, demon()]), ['enter:demon', 'leave', 'enter:demon']);
    assert.deepEqual(drive([{ ...demon(), scene: '教室' }, { ...body, scene: '天台' }]), ['enter:demon', 'leave']);
    assert.deepEqual(drive([demon(), { parsed: { side: 'body', owner: '', word: '主人格' }, owner: '林小雨' }, demon('苏晴')]), ['enter:demon', 'stay:body', 'switch:demon']);
    assert.deepEqual(drive([{ parsed: { side: 'body', owner: '', word: '主人格' }, owner: '林小雨' }]), ['none']);
});

test('同页重渲染不推进计数', () => {
    let r = stepInnerDemon(createDemonState(), { pageKey: 'a', ...demon() });
    r = stepInnerDemon(r.state, { pageKey: 'b', ...body });
    const again = stepInnerDemon(r.state, { pageKey: 'b', ...body });
    assert.equal(again.action, 'keep');
    assert.equal(again.state.quiet, r.state.quiet);
});

test('设置默认开', () => {
    assert.equal(normalizeInnerDemonSettings(undefined).enabled, true);
    assert.equal(normalizeInnerDemonSettings({ enabled: false }).enabled, false);
});

test('提示词：开着带自我对话写法，关掉不带', () => {
    const on = buildTagGrammar({ readerSettings: {}, sceneRule: '规则' });
    assert.match(on.system, /角色名（心魔）/);
    assert.match(on.system, /第二人格/);
    const off = buildTagGrammar({ readerSettings: { innerDemon: { enabled: false } }, sceneRule: '规则' });
    assert.doesNotMatch(off.system, /心魔/);
});

// ---- 渲染：假 DOM ----
if (!Object.getOwnPropertyDescriptor(FakeEl.prototype, 'classList')) {
    Object.defineProperty(FakeEl.prototype, 'classList', {
        get() {
            const el = this;
            const list = () => String(el.className).split(/\s+/).filter(Boolean);
            return {
                add: (...n) => { el.className = [...new Set([...list(), ...n])].join(' '); },
                remove: (...n) => { el.className = list().filter((c) => !n.includes(c)).join(' '); },
                toggle: (n, on) => {
                    const has = list().includes(n);
                    const want = on === undefined ? !has : on;
                    if (want && !has) el.className = [...list(), n].join(' ');
                    if (!want && has) el.className = list().filter((c) => c !== n).join(' ');
                },
                contains: (n) => list().includes(n),
            };
        },
    });
}

function setup() {
    const root = makeStage();
    const doc = root.ownerDocument;
    const motion = root.querySelector('#igs-stage-motion');
    const stage = new FakeEl(doc, 'div');
    stage.id = 'igs-fx-stage';
    motion.appendChild(stage);
    const sprite = root.querySelector('#igs-sprite');
    sprite.style.backgroundImage = 'url("a.png")';
    sprite.style.backgroundSize = '40% auto';
    sprite.style.backgroundPosition = '10% 100%';
    sprite.hasAttribute = (k) => sprite.attrs.has(k);
    const timers = makeTimers();
    const assets = { characters: { 林小雨: {}, 苏晴: {} }, characterAliases: {} };
    const page = (n, speaker, spriteCharacter, extra = {}) => ({
        snapshot: { readerSettings: { _sceneAssets: assets }, content: { speaker, spriteCharacter, sceneLocation: '教室', ...extra } },
        options: {}, root, layers: { stage, doc }, reduced: false, plan: { pageKey: `m:${n}` }, state: { schedule: timers.schedule, clear: timers.clear },
    });
    return { root, stage, sprite, timers, page };
}

test('黑影渲染：本体立绘复刻、翻转、对侧，退出散去', () => {
    const { root, stage, sprite, timers, page } = setup();
    const on = { enabled: true };
    assert.deepEqual(playInnerDemon(page(0, '林小雨', '林小雨'), on), []);
    assert.deepEqual(playInnerDemon(page(1, '林小雨的心魔', '林小雨'), on), ['demon:enter']);
    const node = stage.querySelector('.igs-demon');
    assert.ok(node);
    assert.equal(node.style.vars['--igs-demon-dx'], '48%');
    const clone = node.querySelector('.igs-demon-sprite');
    assert.match(clone.getAttribute('style'), /background-image:url\("a\.png"\)/);
    assert.match(clone.getAttribute('style'), /scaleX\(-1\)/);
    assert.equal(root.getAttribute('data-igs-demon-turn'), 'demon');
    timers.advance(50);
    assert.match(node.className, /is-on/);
    assert.match(node.className, /is-lit/);
    // 本体说话：黑影暗一档；衣服表情换了黑影跟着换。
    sprite.style.backgroundImage = 'url("b.png")';
    playInnerDemon(page(2, '林小雨', '林小雨'), on);
    assert.doesNotMatch(node.className, /is-lit/);
    assert.match(clone.getAttribute('style'), /b\.png/);
    assert.equal(root.getAttribute('data-igs-demon-turn'), 'body');
    // 重复渲染同一页不新增节点
    playInnerDemon(page(2, '林小雨', '林小雨'), on);
    assert.equal(stage.querySelectorAll('.igs-demon').length, 1);
    playInnerDemon(page(3, '', '林小雨'), on);
    playInnerDemon(page(4, '', '林小雨'), on);
    assert.deepEqual(playInnerDemon(page(5, '', '林小雨'), on), ['demon:leave']);
    assert.match(node.className, /is-leaving/);
    timers.advance(1500);
    assert.equal(stage.querySelectorAll('.igs-demon').length, 0);
});

test('黑影渲染：只写「心魔」取上一位说话人，本体不在台上沿用外观；找不到不演', () => {
    const { root, stage, sprite, timers, page } = setup();
    const on = { enabled: true };
    assert.deepEqual(playInnerDemon(page(0, '心魔', ''), on), []);
    playInnerDemon(page(1, '苏晴', '苏晴'), on);
    sprite.style.display = 'none';
    assert.deepEqual(playInnerDemon(page(2, '心魔', ''), on), ['demon:enter']);
    assert.equal(stage.querySelectorAll('.igs-demon').length, 1);
    cancelInnerDemon(root);
    assert.equal(stage.querySelectorAll('.igs-demon').length, 0);
    timers.advance(2000);
});

test('黑影渲染：关闭开关立即收掉；减弱动效不滑动', () => {
    const { stage, timers, page } = setup();
    const ctx = page(1, '林小雨的心魔', '林小雨');
    ctx.reduced = true;
    playInnerDemon(ctx, { enabled: true });
    assert.match(stage.querySelector('.igs-demon').className, /is-reduced/);
    playInnerDemon(page(2, '林小雨的心魔', '林小雨'), { enabled: false });
    assert.equal(stage.querySelectorAll('.igs-demon').length, 0);
    timers.advance(2000);
});
