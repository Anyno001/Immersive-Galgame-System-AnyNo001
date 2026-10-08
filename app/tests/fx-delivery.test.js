import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, filterFxByKinds, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { applyFxEra } from '../src/scene/fx-era.js';
import { resolveFxPromptRule } from '../src/visual/igs-ui/fx-prompt.js';
import { enabledFxTagKinds, normalizeFxTagsSettings, FX_TAG_LABELS } from '../src/visual/igs-ui/fx-settings.js';
import { FX_SFX_PARTIALS } from '../src/visual/igs-ui/fx-sfx.js';
import { FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-style.js';
import { renderDeliveryCard } from '../src/visual/igs-ui/fx-runtime.js';

function fakeDoc() {
    const make = () => ({
        children: [], attrs: {}, className: '', textContent: '', innerHTML: '',
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return this.attrs[k]; },
        appendChild(c) { this.children.push(c); return c; },
    });
    return { createElement: make };
}

test('gate:fx-delivery:parses-item-sender-stage-and-defaults', () => {
    assert.deepEqual(parseFxBody('delivery|外卖|美团骑手|order'), { kind: 'delivery', end: false, args: ['外卖', '美团骑手', 'order'] });
    assert.deepEqual(parseFxBody('delivery|快递'), { kind: 'delivery', end: false, args: ['快递', '', 'arrive'] });
    assert.deepEqual(parseFxBody('delivery|奶茶||乱写'), { kind: 'delivery', end: false, args: ['奶茶', '', 'arrive'] });
    assert.equal(parseFxBody('delivery'), null);
    assert.equal(parseFxBody('delivery-end'), null);
});

test('gate:fx-delivery:page-instant-and-kind-filter', () => {
    const text = '正文\n[igs-fx:delivery|外卖|美团骑手|arrive]\n门铃响了。';
    const directives = extractFxDirectives(text);
    const fx = resolveFxAtPage(directives, text.length, -1);
    assert.deepEqual(fx.instants, [{ kind: 'delivery', item: '外卖', sender: '美团骑手', stage: 'arrive' }]);
    assert.equal(filterFxByKinds(fx, ['notify']).instants.length, 0);
    assert.equal(filterFxByKinds(fx, ['delivery']).instants.length, 1);
});

test('gate:fx-delivery:opt-in-label-prompt-and-era', () => {
    assert.equal(FX_TAG_LABELS.delivery, '外卖 / 快递');
    // 后加类型需显式勾选，老存档不会突然收到新语法。
    assert.equal(normalizeFxTagsSettings({ enabled: true }).delivery, false);
    assert.ok(!enabledFxTagKinds({ enabled: true }).includes('delivery'));
    const on = { enabled: true, delivery: true };
    assert.ok(enabledFxTagKinds(on).includes('delivery'));
    assert.match(resolveFxPromptRule(on), /\[igs-fx:delivery\|物品\|配送方\|阶段\]/);
    // 古代 / 西幻没有外卖快递：拨成关。
    const ancient = applyFxEra({ fxTags: on }, true);
    assert.equal(ancient.fxTags.delivery, false);
});

test('gate:fx-delivery:card-sound-and-style', () => {
    const doc = fakeDoc();
    const arrive = renderDeliveryCard(doc, { item: '快递', sender: '顺丰', stage: 'arrive' });
    assert.equal(arrive.attrs['data-stage'], 'arrive');
    assert.match(arrive.children[0].innerHTML, /M3 7\.5/);
    assert.equal(arrive.children[1].children[0].textContent, '快递已送达');
    assert.equal(arrive.children[1].children[1].textContent, '顺丰正在门口');
    const order = renderDeliveryCard(doc, { item: '奶茶', sender: '', stage: 'order' }, ' is-scifi');
    assert.equal(order.className, 'igs-fx-delivery is-scifi');
    assert.equal(order.children[1].children[0].textContent, '奶茶已下单');
    assert.equal(order.children[1].children[1].textContent, '等待配送');
    assert.ok(Array.isArray(FX_SFX_PARTIALS.doorbell) && FX_SFX_PARTIALS.doorbell.length > 0);
    assert.match(FX_STYLE_TEXT, /\.igs-fx-delivery\{/);
});
