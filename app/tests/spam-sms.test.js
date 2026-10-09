import test from 'node:test';
import assert from 'node:assert/strict';
import { spamAllowed, spamBrandColor, spamKindOf } from '../src/scene/spam-sms.js';
import { applyFxToDom } from '../src/visual/igs-ui/fx-runtime.js';
import { collectNotices, groupNode } from '../src/visual/igs-ui/notify-center.js';
import { SPAM_SMS_STYLE_TEXT } from '../src/visual/igs-ui/spam-sms-style.js';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { renderFxFeatureFields } from '../src/visual/igs-ui/fx-settings-fields.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';

class FakeNode {
    constructor(doc, tag) {
        this.ownerDocument = doc;
        this.tagName = tag;
        this.children = [];
        this.parentNode = null;
        this.attrs = new Map();
        const props = new Map();
        this.style = { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k), get: (k) => props.get(k) };
        this.hidden = false;
        this.textContent = '';
        this.innerHTML = '';
        this.id = '';
        this.className = '';
        const node = this;
        this.classList = {
            add(name) { if (!node.classes().includes(name)) node.className = `${node.className} ${name}`.trim(); },
            contains(name) { return node.classes().includes(name); },
        };
    }
    classes() { return this.className.split(/\s+/).filter(Boolean); }
    appendChild(child) { return this.insertBefore(child, null); }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    insertBefore(child, ref) {
        child.remove();
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child);
        else this.children.splice(index, 0, child);
        child.parentNode = this;
        return child;
    }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
        this.parentNode = null;
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    removeAttribute(name) { this.attrs.delete(name); }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    addEventListener() {}
    matches(selector) {
        return selector.split(',').map((s) => s.trim()).some((s) => (s.startsWith('#') ? this.id === s.slice(1) : this.classList.contains(s.slice(1))));
    }
    querySelectorAll(selector) {
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (c.matches(selector)) out.push(c); walk(c); } };
        walk(this);
        return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function setup() {
    const doc = { createElement: (tag) => new FakeNode(doc, tag) };
    const root = new FakeNode(doc, 'div');
    const motion = root.appendChild(new FakeNode(doc, 'div'));
    motion.id = 'igs-stage-motion';
    for (const id of ['igs-bg', 'igs-sprite', 'igs-click-layer', 'igs-dialog-layer']) motion.appendChild(new FakeNode(doc, 'div')).id = id;
    const queue = [];
    const opts = { schedule: (fn) => { queue.push(fn); return fn; }, clear() {}, reducedMotion: false, now: () => 1000, audioScheduler: () => null };
    return { doc, root, motion, opts };
}

function card(sender, text, rs = {}, id = 1) {
    const { root, motion, opts } = setup();
    const settings = { fxTags: { enabled: true }, ...rs };
    applyFxToDom(root, { messageId: id, content: { currentIndex: 0, displayText: '台词', fx: { instants: [{ kind: 'notify', sender, text }] } }, readerSettings: settings }, opts);
    return motion.querySelector('.igs-fx-notify');
}

test('gate:spam-sms:recognizes-kinds', () => {
    assert.deepEqual(spamKindOf('淘宝', '您的红包即将过期'), { kind: 'shop', brand: '淘宝' });
    assert.equal(spamKindOf('拼多多', 'x').kind, 'shop');
    assert.equal(spamKindOf('抖音商城', 'x').kind, 'shop');
    assert.deepEqual(spamKindOf('10086', '流量即将用完'), { kind: 'carrier', brand: '中国移动' });
    assert.equal(spamKindOf('10010', 'x').brand, '中国联通');
    assert.equal(spamKindOf('中国电信', 'x').kind, 'carrier');
    assert.equal(spamKindOf('招商银行', '您尾号1234账户支出200元').kind, 'bank');
    assert.equal(spamKindOf('95588', '账户变动').kind, 'bank');
    assert.equal(spamKindOf('【某某商场】', '全场五折').kind, 'promo');
    assert.equal(spamKindOf('1069', '【某某商场】全场五折').kind, 'promo');
    for (const t of ['回复 退订', '回T退订', '点击领取', '限时抢购', '优惠券到账']) assert.equal(spamKindOf('1069', t).kind, 'promo', t);
});

test('gate:spam-sms:normal-contacts-do-not-match', () => {
    for (const [s, t] of [['妈妈', '早点回家'], ['艾米', '晚上见'], ['', '嗯'], ['小明', '我在银行门口等你']]) assert.equal(spamKindOf(s, t), null, `${s}|${t}`);
    assert.equal(spamKindOf(null, null), null);
});

test('gate:spam-sms:card-classes-per-kind', () => {
    const shop = card('拼多多', '百亿补贴 速来');
    assert.ok(shop.classList.contains('is-spam') && shop.classList.contains('is-spam-shop'));
    assert.equal(shop.style.get('--igs-spam-c'), '#e02e24');
    assert.equal(shop.querySelector('.igs-spam-go').textContent, '去看看');
    assert.equal(shop.querySelector('.igs-spam-ad').textContent, '广告');
    assert.match(shop.querySelector('.igs-spam-ico').innerHTML, /<svg/);
    assert.equal(card('某店', '内容', {}).classList.contains('is-spam'), false);
    assert.equal(card('未知店', '【未知店】开业', {}).style.get('--igs-spam-c'), '#ff5000');
    const bank = card('招商银行', '支出¥200.5元，余额3000元');
    assert.ok(bank.classList.contains('is-spam-bank'));
    assert.match(bank.querySelector('.igs-spam-ico').innerHTML, /<svg/);
    assert.deepEqual(bank.querySelectorAll('.igs-spam-amount').map((n) => n.textContent), ['¥200.5', '3000元']);
    const promo = card('1069', '【大甩卖】限时五折');
    assert.ok(promo.classList.contains('is-spam-promo'));
    assert.equal(promo.querySelector('.igs-spam-lead').textContent, '【大甩卖】');
    assert.equal(promo.querySelector('.igs-spam-tag').textContent, '限时');
    assert.equal(card('1069', '【大甩卖】清仓').querySelector('.igs-spam-tag'), null);
});

test('gate:spam-sms:unsubscribe-hint-only-when-missing', () => {
    const none = card('10086', '您的套餐已升级');
    assert.ok(none.classList.contains('is-spam-carrier'));
    assert.equal(none.querySelector('.igs-spam-unsub').textContent, '退订回T');
    assert.equal(none.querySelector('.igs-fx-notify-sender').textContent, '10086');
    assert.equal(card('10086', '套餐升级，回T退订').querySelector('.igs-spam-unsub'), null);
    assert.equal(card('10086', '套餐升级，退订请回复0000').querySelector('.igs-spam-unsub'), null);
});

test('gate:spam-sms:worldview-and-switch-gate', () => {
    assert.equal(card('淘宝', '红包', { _worldview: 'ancient', _ancientEra: true }).classList.contains('is-spam'), false);
    assert.equal(card('淘宝', '红包', { _worldview: 'fantasy' }).classList.contains('is-spam'), false);
    assert.equal(card('淘宝', '红包', { _worldview: 'fantasy', _carryPhone: true }).classList.contains('is-spam'), true);
    assert.equal(card('淘宝', '红包', { _worldview: 'scifi' }).classList.contains('is-spam'), true);
    assert.equal(card('淘宝', '红包', { fxTags: { enabled: true, spam: false } }).classList.contains('is-spam'), false);
    assert.equal(spamAllowed({ _worldview: 'horror' }), true);
    assert.equal(spamAllowed({}), true);
});

test('gate:spam-sms:text-is-never-html-injected', () => {
    const evil = '<b onclick=x()>';
    const promo = card('1069', `【${evil}】限时 ${evil}`);
    assert.equal(promo.innerHTML, '');
    assert.ok(promo.textContent === '' || !promo.textContent.includes('<script'));
    assert.equal(promo.querySelector('.igs-spam-lead').textContent, `【${evil}】`);
    const bank = card('招商银行', `${evil} 200元`);
    for (const n of bank.querySelectorAll('.igs-spam-amount')) assert.equal(n.innerHTML, '');
    assert.ok(!SPAM_SMS_STYLE_TEXT.includes('infinite') && !/animation/.test(SPAM_SMS_STYLE_TEXT));
});

test('gate:spam-sms:notify-center-marks-ads', () => {
    const snap = (rs) => ({ messageId: 3, content: { currentIndex: 0, fx: { instants: [{ kind: 'notify', sender: '美团', text: '红包' }, { kind: 'notify', sender: '妈妈', text: '回家' }] } }, readerSettings: rs });
    const list = collectNotices(snap({}), {});
    assert.equal(list[0].spam, 'shop');
    assert.equal(list[0].spamColor, spamBrandColor('美团'));
    assert.equal(list[1].spam, undefined);
    assert.equal(collectNotices(snap({ _worldview: 'ancient', _ancientEra: true }), {})[0].spam, undefined);
    const { doc } = setup();
    const box = groupNode(doc, { app: 'notify', list });
    const items = box.querySelectorAll('.igs-nc-item');
    assert.equal(items[0].querySelector('.igs-nc-ad').textContent, '广告');
    assert.equal(items[0].querySelector('.igs-nc-spamdot').style.get('background'), '#ffc300');
    assert.equal(items[1].querySelector('.igs-nc-ad'), null);
});

test('gate:spam-sms:setting-default-on-and-boolean-path', () => {
    assert.equal(normalizeFxReaderSettings({}).fxTags.spam, true);
    assert.equal(normalizeFxReaderSettings({ fxTags: { spam: false } }).fxTags.spam, false);
    assert.equal(normalizeSettingsValue('readerSettings.fxTags.spam', 'false'), false);
    assert.equal(normalizeSettingsValue('readerSettings.fxTags.spam', true), true);
    assert.match(renderFxFeatureFields({ fxTags: { enabled: true } }).tags, /readerSettings\.fxTags\.spam[\s\S]*垃圾短信样式/);
});

test('gate:spam-sms:prompt-line-is-short', () => {
    const { system, depth0 } = buildTagGrammar({ readerSettings: { fxTags: { enabled: true, notify: true } }, sceneRule: '' });
    assert.ok(`${system}\n${depth0}`.includes('垃圾广告短信'));
    assert.ok(Array.from('偶尔可写垃圾广告短信，发送者写平台名').length <= 20);
});
