import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { detectPromptTriggers } from '../src/scene/prompt-triggers.js';
import {
    CG_SHOTS,
    applySenseToPlan,
    detectSenseByText,
    detectUndressByText,
    isNudeOutfit,
    pickCgShot,
    planUndress,
    resolvePageSense,
} from '../src/visual/igs-ui/romance-senses.js';
import { cancelCgPan, syncCgPan } from '../src/visual/igs-ui/romance-cg-pan.js';
import { SENSES_STYLE_TEXT } from '../src/visual/igs-ui/romance-senses-style.js';
import { closeRomanceIntimate, resolveIntimatePlan, syncRomanceIntimate } from '../src/visual/igs-ui/romance-intimate-runtime.js';
import { normalizeRomanceFxSettings } from '../src/visual/igs-ui/romance-settings.js';
import { renderRomanceFxFields } from '../src/visual/igs-ui/romance-fields.js';
import { romanceGrammarLines, resolveRomanceFxPromptRule } from '../src/visual/igs-ui/fx-prompt.js';
import { collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';

const SOUND = { enabled: true, volume: 0.5 };
const span = (index, length) => ({ index, length, continued: false, endsInFloor: true });

function makeEl(doc, { id = '', className = '' } = {}) {
    const attrs = new Map();
    const vars = new Map();
    const el = {
        id, className, ownerDocument: doc, children: [], parentNode: null, offsetWidth: 0,
        style: {
            setProperty(name, value) { vars.set(name, String(value)); },
            removeProperty(name) { vars.delete(name); },
            getPropertyValue(name) { return vars.get(name) || ''; },
            vars,
        },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        hasAttribute(name) { return attrs.has(name); },
        removeAttribute(name) { attrs.delete(name); },
        appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
        insertBefore(child, ref) {
            child.parentNode = el;
            const index = ref ? el.children.indexOf(ref) : -1;
            if (index < 0) el.children.push(child);
            else el.children.splice(index, 0, child);
            return child;
        },
        removeChild(child) { el.children.splice(el.children.indexOf(child), 1); child.parentNode = null; },
        remove() { if (el.parentNode) el.parentNode.removeChild(el); },
        querySelector(selector) {
            const match = selector.startsWith('.') ? (node) => node.className === selector.slice(1) : (node) => node.id === selector.slice(1);
            const walk = (node) => {
                for (const child of node.children) {
                    if (match(child)) return child;
                    const found = walk(child);
                    if (found) return found;
                }
                return null;
            };
            return walk(el);
        },
    };
    return el;
}

function makeStage(transform = '') {
    const doc = { defaultView: { getComputedStyle: () => ({ transform }) }, createElement: () => makeEl(doc) };
    const root = makeEl(doc, { id: 'igs-overlay' });
    const stage = root.appendChild(makeEl(doc, { id: 'igs-stage-motion' }));
    stage.appendChild(makeEl(doc, { id: 'igs-bg' }));
    stage.appendChild(makeEl(doc, { id: 'igs-sprite' }));
    stage.appendChild(makeEl(doc, { id: 'igs-click-layer' }));
    return { root, stage };
}

test('gate:romance-senses:tag-parses-and-carries-until-next-sense', () => {
    const src = '开头\n[igs-fx:sense|蒙眼]\n第一页\n第二页\n[igs-fx:sense|耳边]\n第三页\n[igs-fx:sense|乱写]\n第四页\n[igs-fx:sense-end]\n第五页';
    const directives = extractFxDirectives(src);
    assert.deepEqual(directives.filter((d) => d.kind === 'sense').map((d) => (d.end ? 'end' : d.args[0])), ['blind', 'ear', 'end']);
    const at = (word) => resolveFxAtPage(directives, src.indexOf(word)).sense;
    assert.equal(at('开头'), '');
    assert.equal(at('第一页'), 'blind');
    assert.equal(at('第二页'), 'blind');
    assert.equal(at('第三页'), 'ear');
    assert.equal(at('第四页'), 'ear', 'unknown sense word is dropped, previous range keeps going');
    assert.equal(at('第五页'), '');
});

test('gate:romance-senses:keyword-fallback-with-priority-and-tag-first', () => {
    assert.equal(detectSenseByText('她用丝带蒙住了我的眼睛。'), 'blind');
    assert.equal(detectSenseByText('她贴着我的耳朵轻声说。'), 'ear');
    assert.equal(detectSenseByText('指尖从锁骨缓缓划过。'), 'touch');
    assert.equal(detectSenseByText('我屏住呼吸，指尖停在半空。'), 'hush', 'deprivation senses win over touch');
    assert.equal(detectSenseByText('脑子里一片空白。'), 'daze');
    assert.equal(detectSenseByText('她的体温透过衬衫传来。'), 'heat');
    assert.equal(detectSenseByText('微凉的夜风吹进来。'), 'cool');
    assert.equal(detectSenseByText('发间淡淡的清香。'), 'scent');
    assert.equal(detectSenseByText('今天天气不错。'), '');
    assert.deepEqual(resolvePageSense({ fx: { sense: 'heat' }, text: '指尖划过' }), { sense: 'heat', source: 'tag' });
    assert.deepEqual(resolvePageSense({ fx: {}, text: '指尖划过' }), { sense: 'touch', source: 'text' });
    assert.deepEqual(resolvePageSense({ fx: {}, text: '指尖划过', keywords: false }), { sense: '', source: '' });
});

test('gate:romance-senses:mix-amplifies-one-sense-and-mutes-others', () => {
    const settings = normalizeRomanceFxSettings({ enabled: true, nsfwSound: true, rhythm: true });
    const base = resolveIntimatePlan({ level: 3, phase: 'steady', settings, sound: SOUND });
    const hush = applySenseToPlan(base, 'hush');
    assert.equal(hush.breath, 0, 'hush stops breathing sounds');
    assert.equal(hush.creak, false);
    assert.equal(hush.sway, null, 'hush freezes the sway');
    assert.ok(hush.duck < base.duck, 'scene audio drops further');
    assert.ok(hush.heartGain > 1, 'only the heartbeat remains, louder');
    const ear = applySenseToPlan(base, 'ear');
    assert.equal(ear.breathPan, true);
    assert.ok(ear.breathGain > 1);
    const scent = applySenseToPlan(base, 'scent');
    assert.ok(scent.breath > base.breath, 'scent stretches the breath');
    const daze = applySenseToPlan(base, 'daze');
    assert.equal(daze.tinnitus, true);
    // 没开亲密声音时不替用户压 BGM。
    const quiet = applySenseToPlan({ level: 2, duck: 0 }, 'hush');
    assert.equal(quiet.duck, 0);
    assert.equal(applySenseToPlan(base, 'unknown'), base);
});

test('gate:romance-senses:plan-keeps-visuals-on-mild-levels-and-respects-switches', () => {
    const settings = normalizeRomanceFxSettings({ enabled: true });
    const mild = resolveIntimatePlan({ level: 1, settings, sound: SOUND, sense: 'touch' });
    assert.equal(mild.sense, 'touch');
    assert.equal(mild.senseVisual, true);
    const off = resolveIntimatePlan({ level: 1, settings: { ...settings, senses: false }, sound: SOUND, sense: 'touch' });
    assert.equal(off.sense, undefined);
    const noEdge = resolveIntimatePlan({ level: 1, settings: { ...settings, edgeFx: false, softSound: false }, sound: SOUND, sense: 'touch' });
    assert.equal(noEdge, null, 'nothing to show or play');
    const undress = resolveIntimatePlan({ level: 2, settings, sound: SOUND, undress: 'outfit' });
    assert.equal(undress.undress, true);
    assert.equal(undress.undressVisual, true);
    const nsfwMuted = resolveIntimatePlan({ level: 3, phase: 'steady', settings, sound: SOUND, undress: 'text' });
    assert.equal(nsfwMuted.undress, false, 'nsfw undress sound follows the nsfw sound switch');
    assert.equal(resolveIntimatePlan({ level: 2, settings: { ...settings, undress: false }, sound: SOUND, undress: 'text' }).undress, undefined);
});

test('gate:romance-senses:undress-by-outfit-or-text-forward-only', () => {
    const memory = new Map();
    assert.equal(planUndress(memory, { character: '雪乃', nude: false, text: '她笑了。' }), '');
    assert.equal(planUndress(memory, { character: '雪乃', nude: true, text: '……' }), 'outfit');
    assert.equal(planUndress(memory, { character: '雪乃', nude: true, text: '……' }), '', 'same outfit again is not a new undress');
    assert.equal(planUndress(memory, { character: '', text: '她解开了衬衫的扣子。' }), 'text');
    assert.equal(planUndress(memory, { character: '', text: '浴巾滑落在地。' }), 'text');
    assert.equal(planUndress(memory, { character: '', text: '他脱下外套递给我。', forward: false }), '');
    assert.equal(detectUndressByText('她解开发绳。'), false);
    const sceneAssets = {
        characterOutfits: { 雪乃: { 夜里: { words: ['夜里'], moods: {}, wardrobe: '裸体' }, 校服: { words: ['校服'], moods: {} } } },
    };
    assert.equal(isNudeOutfit(sceneAssets, '雪乃', '夜里'), true);
    assert.equal(isNudeOutfit(sceneAssets, '雪乃', '校服'), false);
    assert.equal(isNudeOutfit(sceneAssets, '雪乃', '裸体'), true);
    assert.equal(isNudeOutfit(sceneAssets, '雪乃', ''), false);
});

test('gate:romance-senses:cg-shots-stay-inside-the-frame-and-follow-phase', () => {
    for (const [name, shot] of Object.entries(CG_SHOTS)) {
        for (const f of [shot.from, shot.to]) {
            const room = ((f.s - 1) / (2 * f.s)) * 100;
            assert.ok(Math.abs(f.x) <= room && Math.abs(f.y) <= room, `${name} never reveals the edge`);
        }
    }
    assert.equal(pickCgShot({ url: '', level: 3 }), '');
    assert.equal(pickCgShot({ url: 'a.png', level: 0 }), '');
    assert.equal(pickCgShot({ url: 'a.png', level: 3, phase: 'climax' }), 'push');
    assert.equal(pickCgShot({ url: 'a.png', level: 3, phase: 'after' }), 'pull');
    assert.equal(pickCgShot({ url: 'a.png', level: 2, sense: 'touch' }), 'push');
    assert.match(pickCgShot({ url: 'a.png', level: 3, phase: 'rise' }), /^tilt-/);
    assert.equal(pickCgShot({ url: 'a.png', level: 3, phase: 'steady' }), pickCgShot({ url: 'a.png', level: 3, phase: 'steady' }), 'stable across re-renders');
});

test('gate:romance-senses:cg-pan-dom-continues-from-current-position', () => {
    const { stage } = makeStage('matrix(1.1, 0, 0, 1.1, 0, -12)');
    assert.equal(syncCgPan(stage, { url: 'a.png', shot: 'tilt-down' }), 'tilt-down');
    assert.equal(stage.getAttribute('data-igs-cgp'), '1');
    assert.match(stage.style.vars.get('--igs-cgp-a'), /^scale\(1\.2\) translate/);
    assert.equal(stage.style.vars.get('--igs-cgp-iter'), 'infinite');
    // 同一张 CG 换镜头：从当前位置接着走，动画名换一个以便重播。
    syncCgPan(stage, { url: 'a.png', shot: 'pull' });
    assert.equal(stage.getAttribute('data-igs-cgp'), '2');
    assert.equal(stage.style.vars.get('--igs-cgp-a'), 'matrix(1.1, 0, 0, 1.1, 0, -12)');
    assert.equal(stage.style.vars.get('--igs-cgp-iter'), '1');
    syncCgPan(stage, { url: 'a.png', shot: 'pull', hold: true });
    assert.equal(stage.getAttribute('data-igs-cgp'), '2', 're-render does not restart');
    assert.equal(stage.getAttribute('data-igs-cgp-hold'), '1');
    syncCgPan(stage, { url: '', shot: 'pull' });
    assert.equal(stage.getAttribute('data-igs-cgp'), null);
    assert.equal(stage.style.vars.size, 0);
    cancelCgPan(stage);
});

test('gate:romance-senses:front-layer-shows-sense-ripple-and-undress-sweep', () => {
    const { root, stage } = makeStage();
    const settings = normalizeRomanceFxSettings({ enabled: true });
    const info = (index, extra = {}) => ({ level: 2, settings, fxSound: SOUND, messageId: 3, index, coarse: false, rng: () => 0.2, ...extra });
    syncRomanceIntimate(root, info(0));
    const front = stage.querySelector('.igs-rm-front');
    assert.equal(front.getAttribute('data-igs-rm-sense'), null);
    syncRomanceIntimate(root, info(1, { sense: 'ear' }));
    assert.equal(front.getAttribute('data-igs-rm-sense'), 'ear');
    assert.equal(front.getAttribute('data-igs-rm-ear'), 'l');
    syncRomanceIntimate(root, info(2, { sense: 'touch' }));
    assert.equal(front.getAttribute('data-igs-rm-ear'), null);
    assert.equal(stage.querySelector('.igs-rm-sense').getAttribute('data-igs-rm-ripple'), '1');
    syncRomanceIntimate(root, info(3, { undress: 'text' }));
    assert.equal(stage.querySelector('.igs-rm-sweep').getAttribute('data-igs-rm-sweep'), '1');
    // 翻回旧页不重播扫光。
    stage.querySelector('.igs-rm-sweep').removeAttribute('data-igs-rm-sweep');
    syncRomanceIntimate(root, info(1, { undress: 'text' }));
    assert.equal(stage.querySelector('.igs-rm-sweep').getAttribute('data-igs-rm-sweep'), null);
    // 关了边缘光影：感官只调声音，不出画面。
    syncRomanceIntimate(root, info(4, { sense: 'heat', settings: { ...settings, edgeFx: false } }));
    assert.equal(front.getAttribute('data-igs-rm-sense'), null);
    closeRomanceIntimate(root);
    assert.equal(stage.querySelector('.igs-rm-front'), null);
});

test('gate:romance-senses:styles-only-edge-on-cg-and-no-heavy-effects', () => {
    assert.doesNotMatch(SENSES_STYLE_TEXT, /backdrop-filter|mix-blend-mode/);
    assert.doesNotMatch(SENSES_STYLE_TEXT, /#igs-(bg|sprite|cast)[^{]*\{[^}]*filter:/);
    assert.doesNotMatch(SENSES_STYLE_TEXT, /igs-dialog/);
    // 挂 CG 时蒙眼只压边缘：中心透明。
    assert.match(SENSES_STYLE_TEXT, /\[data-igs-rm-asset\] \.igs-rm-front\[data-igs-rm-sense="blind"\] \.igs-rm-sense\{background:radial-gradient\([^)]*transparent/);
    // CG 运镜盖过「挂 CG 时关掉背景推镜」。
    assert.match(SENSES_STYLE_TEXT, /#igs-overlay #igs-stage-motion\[data-igs-cgp="1"\] #igs-bg\{animation:igs-cgp-1[^}]*!important/);
    assert.match(SENSES_STYLE_TEXT, /prefers-reduced-motion[\s\S]*data-igs-cgp\] #igs-bg\{animation:none!important/);
});

test('gate:romance-senses:prompt-and-settings', () => {
    assert.ok(romanceGrammarLines({ enabled: true }).some((line) => line.startsWith('sense|感官')));
    assert.ok(!romanceGrammarLines({ enabled: true, senses: false }).some((line) => line.startsWith('sense|')));
    assert.match(resolveRomanceFxPromptRule({ enabled: true }), /\[igs-fx:sense\|感官\]/);
    const block = collectGrammarBlocks({ romanceFx: { enabled: true } }).find((b) => b.key === 'romance');
    assert.match(block.index, /sense/);
    // NSFW 场景标签出现时展开亲密语法（感官写法在情事段里用得上）。
    assert.ok(detectPromptTriggers({ recentAiTexts: ['[igs-scene:卧室|夜晚|晴|nsfw]\n……'] }).has('romance'));
    const s = normalizeRomanceFxSettings({});
    assert.equal(s.senses, true);
    assert.equal(s.senseWords, true);
    assert.equal(s.cgPan, true);
    assert.equal(s.undress, true);
    const html = renderRomanceFxFields({ romanceFx: { enabled: true } });
    for (const key of ['senses', 'senseWords', 'cgPan', 'undress']) assert.match(html, new RegExp(`romanceFx\\.${key}`));
    assert.doesNotMatch(renderRomanceFxFields({ romanceFx: { enabled: true, senses: false } }), /romanceFx\.senseWords/);
});

test('gate:romance-senses:runtime-wires-sense-cg-pan-and-typewriter', async () => {
    const { applyRomanceToDom, closeRomanceFx } = await import('../src/visual/igs-ui/romance-runtime.js');
    const { root, stage } = makeStage();
    const snap = (content, romance = {}) => ({
        messageId: 9,
        readerSettings: { romanceFx: { enabled: true, ...romance }, typewriter: { speed: 'fast' } },
        content: { textType: 'narration', fx: { romance: 'intimate' }, currentIndex: 0, ...content },
    });
    const ctx = { reducedMotion: false, rng: () => 0.2 };
    // 屏息：CG 运镜定格、打字机降一档、对话框挂上感官属性。
    const hush = applyRomanceToDom(root, snap({ text: '她屏住了呼吸。', illustrationActive: true, illustrationUrl: 'cg1.png' }), ctx);
    assert.equal(hush.sense, 'hush');
    assert.equal(hush.typewriter.speed, 'medium');
    assert.ok(hush.cgShot);
    assert.equal(stage.getAttribute('data-igs-cgp-hold'), '1');
    assert.equal(root.getAttribute('data-igs-rm-sense'), 'hush');
    // 标签优先于正文；关掉 CG 缓移后不运镜。
    const tagged = applyRomanceToDom(root, snap({ text: '她屏住了呼吸。', fx: { romance: 'intimate', sense: 'heat' }, illustrationActive: true, illustrationUrl: 'cg1.png', currentIndex: 1 }, { cgPan: false }), ctx);
    assert.equal(tagged.sense, 'heat');
    assert.equal(tagged.cgShot, '');
    assert.equal(stage.getAttribute('data-igs-cgp'), null);
    // 没有 CG 的页不运镜；回落到 0 档全部清掉。
    applyRomanceToDom(root, snap({ fx: { romance: '' }, text: '指尖划过', currentIndex: 2 }), ctx);
    assert.equal(root.getAttribute('data-igs-rm-sense'), null);
    assert.equal(stage.getAttribute('data-igs-cgp'), null);
    closeRomanceFx(root);
});
