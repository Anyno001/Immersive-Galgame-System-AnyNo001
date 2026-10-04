import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { detectPromptTriggers } from '../src/scene/prompt-triggers.js';
import { detectImaginedTarget, detectNoiseByText, detectSoloByText, registeredNames } from '../src/visual/igs-ui/romance-senses.js';
import { SOLO_TEMPO, resolveIntimateTempo } from '../src/visual/igs-ui/romance-intimate.js';
import { resolveIntimatePlan } from '../src/visual/igs-ui/romance-intimate-runtime.js';
import { DREAM_STYLE_TEXT, closeDreamFigure, syncDreamFigure } from '../src/visual/igs-ui/romance-solo.js';
import { applyRomanceToDom, closeRomanceFx } from '../src/visual/igs-ui/romance-runtime.js';
import { normalizeRomanceFxSettings } from '../src/visual/igs-ui/romance-settings.js';
import { renderRomanceFxFields } from '../src/visual/igs-ui/romance-fields.js';
import { romanceGrammarLines } from '../src/visual/igs-ui/fx-prompt.js';
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

function makeStage() {
    const doc = { defaultView: { getComputedStyle: () => ({ transform: '' }) }, createElement: () => makeEl(doc) };
    const root = makeEl(doc, { id: 'igs-overlay' });
    const stage = root.appendChild(makeEl(doc, { id: 'igs-stage-motion' }));
    stage.appendChild(makeEl(doc, { id: 'igs-bg' }));
    stage.appendChild(makeEl(doc, { id: 'igs-sprite' }));
    stage.appendChild(makeEl(doc, { id: 'igs-click-layer' }));
    return { root, stage };
}

test('gate:romance-solo:tags-parse-range-target-and-page-noise', () => {
    const src = '前\n[igs-fx:solo|雪乃]\n一\n[igs-fx:noise|脚步]\n二\n三\n[igs-fx:noise|乱写]\n四\n[igs-fx:solo-end]\n五';
    const directives = extractFxDirectives(src);
    const at = (word, prev = -1) => resolveFxAtPage(directives, src.indexOf(word), prev);
    assert.equal(at('前').solo, null);
    assert.deepEqual(at('一').solo, { target: '雪乃' });
    assert.equal(at('二', src.indexOf('一')).noise, 'steps');
    assert.equal(at('三', src.indexOf('二')).noise, '', 'noise belongs to its own page only');
    assert.equal(at('四', src.indexOf('三')).noise, '', 'unknown noise word is dropped');
    assert.equal(at('五').solo, null);
    const untargeted = '[igs-fx:solo]\n独处';
    assert.deepEqual(resolveFxAtPage(extractFxDirectives(untargeted), untargeted.indexOf('独处')).solo, { target: '' });
});

test('gate:romance-solo:text-detection', () => {
    assert.equal(detectSoloByText('她咬着被角开始自慰。'), true);
    assert.equal(detectSoloByText('她独自坐在窗边。'), false);
    assert.equal(detectNoiseByText('门外传来了脚步声。'), 'steps');
    assert.equal(detectNoiseByText('有人在敲门。'), 'knock');
    assert.equal(detectNoiseByText('枕边的手机忽然震动起来。'), 'phone');
    assert.equal(detectNoiseByText('门把手转了一下。'), 'door');
    assert.equal(detectNoiseByText('窗外很安静。'), '');
    const names = registeredNames({ characters: { 雪乃: {}, 结衣: {} }, characterAliases: { 雪乃: ['雪之下'] } });
    assert.equal(detectImaginedTarget('脑海里浮现出雪之下的脸。', names), '雪乃');
    assert.equal(detectImaginedTarget('她想着结衣的笑。', names, '雪乃'), '结衣');
    assert.equal(detectImaginedTarget('她想着自己的事情，楼下的雪乃还没睡。', names), '', 'name outside the imagine window is ignored');
    assert.equal(detectImaginedTarget('想着雪乃。', names, '雪乃'), '', 'the solo character is not her own fantasy');
});

test('gate:romance-solo:plan-swaps-bed-for-sheets-and-muffled-breath', () => {
    const settings = normalizeRomanceFxSettings({ enabled: true, nsfwSound: true, rhythm: true, strength: 'strong' });
    const duo = resolveIntimatePlan({ level: 3, phase: 'climax', settings, sound: SOUND, location: '客厅沙发' });
    const solo = resolveIntimatePlan({ level: 3, phase: 'climax', settings, sound: SOUND, location: '客厅沙发', solo: true });
    assert.equal(duo.material, 'sofa');
    assert.equal(solo.material, 'futon');
    assert.equal(solo.solo, true);
    assert.equal(solo.knock, false);
    assert.equal(solo.settle, false);
    assert.ok(solo.breathLowpass > 0 && solo.breathLowpass < 2400);
    assert.ok(solo.sway.x < duo.sway.x && solo.sway.r < duo.sway.r, 'a faint tremble instead of the bed sway');
    assert.equal(solo.tempo, SOLO_TEMPO.climax);
    assert.equal(resolveIntimateTempo('climax', null, 999, SOLO_TEMPO).bpm, 92, 'solo climax caps lower');
    // 开关关掉时按原来的双人节律；独处声景只在情事档。
    assert.equal(resolveIntimatePlan({ level: 3, phase: 'climax', settings: { ...settings, solo: false }, sound: SOUND, solo: true }).solo, false);
    assert.equal(resolveIntimatePlan({ level: 2, settings, sound: SOUND, solo: true }).solo, false);
    assert.equal(resolveIntimatePlan({ level: 3, phase: 'steady', settings, sound: SOUND, noise: 'knock' }).noise, 'knock');
    assert.equal(resolveIntimatePlan({ level: 3, phase: 'steady', settings, sound: { enabled: false, volume: 0 }, noise: 'knock' }).noise, '');
});

test('gate:romance-solo:dream-figure-sits-under-sprite-and-fades', () => {
    const { stage } = makeStage();
    assert.equal(syncDreamFigure(stage, { url: '' }), false);
    assert.equal(stage.querySelector('.igs-rm-dream'), null);
    assert.equal(syncDreamFigure(stage, { url: 'a"b.png', side: 'l' }), true);
    const el = stage.querySelector('.igs-rm-dream');
    const sprite = stage.querySelector('#igs-sprite');
    assert.equal(stage.children.indexOf(el), stage.children.indexOf(sprite) - 1, 'between background/CG and sprite');
    assert.equal(el.style.backgroundImage, 'url("a\\"b.png")');
    assert.equal(el.getAttribute('data-igs-rm-dream-side'), 'l');
    assert.equal(el.getAttribute('data-igs-rm-dream-on'), '1');
    syncDreamFigure(stage, { url: '' });
    assert.equal(el.getAttribute('data-igs-rm-dream-on'), null, 'fades out first');
    assert.ok(stage.querySelector('.igs-rm-dream'));
    syncDreamFigure(stage, { url: 'c.png' });
    assert.equal(stage.querySelector('.igs-rm-dream'), el, 'reused while fading');
    closeDreamFigure(stage);
    assert.equal(stage.querySelector('.igs-rm-dream'), null);
    assert.doesNotMatch(DREAM_STYLE_TEXT, /#igs-(bg|sprite|cast)[^{]*\{[^}]*filter:/);
    assert.match(DREAM_STYLE_TEXT, /data-igs-quality="low"[^{]*\{filter:none;\}/);
});

test('gate:romance-solo:runtime-detects-solo-span-fantasy-and-noise', () => {
    const { root, stage } = makeStage();
    const sceneAssets = { characters: { 雪乃: { 默认: 'yukino.png' }, 结衣: { 默认: 'yui.png' } } };
    const page = (index, text, extra = {}) => ({
        messageId: 21,
        readerSettings: { romanceFx: { enabled: true, nsfwSound: true }, _sceneAssets: sceneAssets },
        content: { textType: 'narration', sceneNsfw: true, nsfwSpan: span(index, 6), currentIndex: index, fx: { romance: '' }, text, spriteCharacter: '结衣', ...extra },
    });
    const ctx = { reducedMotion: false, rng: () => 0.2, resolveAssetUrl: (url) => `/user/images/${url}` };
    assert.equal(applyRomanceToDom(root, page(0, '夜深了。'), ctx).solo, false);
    const first = applyRomanceToDom(root, page(1, '她咬着被角开始自慰，脑海里浮现出雪乃的脸。'), ctx);
    assert.equal(first.solo, '雪乃');
    assert.equal(first.dream, true);
    assert.equal(stage.querySelector('.igs-rm-dream').style.backgroundImage, 'url("/user/images/yukino.png")');
    // 同一段往后：仍是独处，沿用想着的人；门外有动静时屏息。
    const steps = applyRomanceToDom(root, page(2, '门外传来了脚步声。'), ctx);
    assert.equal(steps.solo, '雪乃');
    assert.equal(steps.noise, 'steps');
    assert.equal(steps.sense, 'hush');
    // 标签写的对象优先；写的是自己时不出人影。
    const tagged = applyRomanceToDom(root, page(3, '……', { fx: { romance: '', solo: { target: '结衣' } } }), ctx);
    assert.equal(tagged.solo, '结衣');
    assert.equal(tagged.dream, false);
    closeRomanceFx(root);
    assert.equal(stage.querySelector('.igs-rm-dream'), null);
});

test('gate:romance-solo:prompt-and-settings', () => {
    const lines = romanceGrammarLines({ enabled: true });
    assert.ok(lines.some((line) => line.startsWith('solo|想着的角色名')));
    assert.ok(lines.some((line) => line.startsWith('noise|动静')));
    assert.ok(!romanceGrammarLines({ enabled: true, solo: false }).some((line) => line.startsWith('solo|')));
    assert.match(collectGrammarBlocks({ romanceFx: { enabled: true } }).find((b) => b.key === 'romance').index, /solo\/noise/);
    assert.ok(detectPromptTriggers({ recentAiTexts: ['[igs-fx:solo]'] }).has('romance'));
    assert.equal(normalizeRomanceFxSettings({}).solo, true);
    assert.match(renderRomanceFxFields({ romanceFx: { enabled: true } }), /romanceFx\.solo/);
});
