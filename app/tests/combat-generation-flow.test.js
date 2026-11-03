import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGenerationFixture, modelReply } from './helpers/combat-generation-fixture.js';
import { createCombatDeckPanelController } from '../src/visual/igs-ui/combat-deck-panel.js';
import { deckDetailView } from '../src/visual/igs-ui/combat-deck-panel-model.js';
import { renderCombatDeckPanelHtml } from '../src/visual/igs-ui/combat-deck-panel-render.js';

const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r)); };

test('首次主角卡组也读取素材；读取失败后的手动重试可关闭失败来源恢复建档', async (t) => {
    for (const failedFirst of [false, true]) {
        const f = await createGenerationFixture({ seedHero: false });
        t.after(f.dispose);
        if (failedFirst) {
            f.host.Mvu.getMvuData = () => { throw Error('模拟失败'); };
            const result = await f.services.prepareProtagonist({ manual: true });
            assert.equal(result.reason, 'combat-material-read-failed');
            assert.equal(f.services.getProtagonist().status, 'failed');
            assert.equal(f.requests.length, 0);
        }
        const result = await f.services.prepareProtagonist({ manual: true, generationHint: '雷系剑士', materialSelection: { useMvu: !failedFirst } });
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(f.requests[0].context.generationHint, '雷系剑士');
        assert.equal(f.requests[0].context.characterMaterials.mvu.length, failedFirst ? 0 : 1);
        assert.equal(f.requests[0].context.characterMaterials.tables.length, 1);
        assert.equal(f.services.getProtagonist().status, 'ready');
    }
});

test('重建、AI 转职和升阶：提示与素材进入真实生成请求，通过校验后才落账扣费', async (t) => {
    for (const [method, cost] of [['regenerateDeck', 200], ['respecClass', 150], ['ascendClass', 300]]) {
        await t.test(method, async (t) => {
            const f = await createGenerationFixture();
            t.after(f.dispose);
            const before = await f.hero();
            const result = await f.services[method]({ generationHint: '雷系连击，保留雷刃' });
            assert.equal(result.ok, true, JSON.stringify(result));
            const request = f.requests[0];
            assert.equal(request.context.generationHint, '雷系连击，保留雷刃');
            assert.equal(request.context.characterMaterials.mvu[0].value.雷刃.等级, 3);
            assert.equal(request.context.characterMaterials.tables[0].rows[0].技能, '雷步');
            assert.equal((await f.hero()).points, before.points - cost);
        });
    }
});

test('读取失败阻止模型请求与扣费；显式关闭失败来源后可继续', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    f.host.Mvu.getMvuData = () => { throw Error('读取失败'); };
    const before = await f.hero();
    const failed = await f.services.regenerateDeck();
    assert.equal(failed.reason, 'combat-material-read-failed');
    assert.equal(f.requests.length, 0);
    assert.equal((await f.hero()).points, before.points);
    const result = await f.services.regenerateDeck({ materialSelection: { useMvu: false } });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(f.requests[0].context.characterMaterials.mvu, []);
});

test('模型故障、取消与切聊天都不会替换旧卡组或扣费', async (t) => {
    for (const mode of ['failure', 'abort', 'chat']) {
        await t.test(mode, async (t) => {
            const f = await createGenerationFixture();
            t.after(f.dispose);
            const before = await f.hero();
            const control = new AbortController();
            if (mode === 'failure') f.setFailure(true);
            if (mode === 'abort') f.setCallback(() => control.abort());
            if (mode === 'chat') f.setCallback(() => f.setChat('other-chat'));
            const result = await f.services.regenerateDeck({ signal: control.signal });
            assert.equal(result.ok, false);
            f.setChat('fixture-chat');
            const after = await f.hero();
            assert.deepEqual(after.deck, before.deck);
            assert.equal(after.points, before.points);
        });
    }
});

async function uiFixture(t) {
    const f = await createGenerationFixture();
    const dom = new JSDOM('<div id="overlay"></div>', { url: 'http://localhost/' });
    const controller = createCombatDeckPanelController(dom.window.document, {
        getLedger: () => f.services.getLedger(),
        inspectGenerationMaterials: f.services.inspectGenerationMaterials,
        regenerateDeck: f.services.regenerateDeck,
        respecClass: f.services.respecClass,
        ascendClass: f.services.ascendClass,
    });
    t.after(() => { controller.close(); dom.window.close(); f.dispose(); });
    controller.open(dom.window.document.querySelector('#overlay'));
    await settle();
    controller.invoke('page', 'deck');
    return { ...f, dom, controller, doc: dom.window.document };
}

test('六张个人卡池重建会保存新牌，初始组仍只取四张；界面直接显示来源和效果', async (t) => {
    const f = await uiFixture(t);
    const before = await f.hero();
    f.setReply((p) => {
        const reply = JSON.parse(modelReply(p));
        for (const e of reply.entities) e.value.cards = Array.from({ length: 6 }, (_, i) => [`新招${i + 1}`, 'strike']);
        return JSON.stringify(reply);
    });
    f.controller.invoke('rebuild-open');
    await settle();
    assert.equal((await f.controller.invoke('rebuild-confirm')).ok, true);
    const hero = await f.hero();
    const ids = new Set(hero.profile.personalPool.map((c) => c.id));
    assert.equal(ids.size, 6);
    assert.equal(hero.deck.filter((id) => ids.has(id)).length, 4);
    assert.equal(hero.deck.length, 20);
    assert.equal(hero.points, before.points - 200);
    assert.deepEqual(hero.classProfile, before.classProfile);
    assert.deepEqual(hero.profile.personalPassive, before.profile.personalPassive);
    assert.deepEqual(hero.profile.heroSkill, before.profile.heroSkill);
    assert.ok(hero.profile.personalPool.every((c) => c.id.includes('-r') && c.name.startsWith('新招')));
    const rows = [...f.doc.querySelectorAll('.igs-deck-card')];
    const personal = rows.filter((r) => r.textContent.includes('个人牌'));
    assert.ok(personal.length > 0);
    assert.ok(personal.every((r) => /新招/.test(r.textContent) && /点伤害/.test(r.querySelector('.igs-deck-effect').textContent)));
    assert.ok(rows.some((r) => /职业牌/.test(r.textContent)));
    assert.ok(rows.some((r) => /基础牌/.test(r.textContent) && /点格挡/.test(r.textContent)));
    assert.ok(personal.every((r) => r.querySelector('details').textContent.includes('升级后')));
    assert.match(f.doc.body.textContent, /只更换个人牌/);
    assert.match(f.doc.body.textContent, /按当前属性预览/);
    const requests = f.requests.length;
    f.controller.invoke('page', 'status');
    f.controller.invoke('page', 'deck');
    assert.ok(f.doc.body.textContent.includes('新招'));
    assert.equal(f.requests.length, requests);
});

test('牌面预览包含 X 费规则、属性换算、升级和弃牌效果；只读且转义档案文本', async (t) => {
    const f = await uiFixture(t);
    const hero = await f.hero();
    const card = { id: 'fixture-x', name: '<img src=x>', cost: 'X', type: 'attack', rarity: 'personal', retain: true,
        effects: [{ op: 'damage', target: 'enemy', amount: 3 }], upgraded: { effects: [{ op: 'damage', target: 'enemy', amount: 4 }] },
        onDiscard: [{ op: 'draw', amount: 1 }] };
    const attrs = { ...hero.attributes, scores: { ...hero.attributes.scores, str: 18, dex: 8 }, proficiency: 2 };
    const detail = deckDetailView({ ...hero, attributes: attrs, catalog: new Map([[card.id, card]]), owned: new Map([[card.id, 1]]), deck: [card.id] });
    const fragment = JSDOM.fragment(renderCombatDeckPanelHtml({ ...f.controller.view(), detail, readonly: true }));
    const row = fragment.querySelector('.igs-deck-card');
    assert.equal(row.querySelector('img'), null);
    assert.match(row.textContent, /<img src=x>/);
    assert.match(row.querySelector('p').textContent, /每点能量结算一次.*保留.*被丢弃时：抽 1 张牌.*4 点伤害/);
    assert.match(row.querySelector('details').textContent, /升级后.*5 点伤害/);
    assert.equal(row.querySelector('button[data-deck-act="add"]'), null);
    assert.equal(row.querySelector('button[data-deck-act="remove"]'), null);
    assert.equal(card.effects[0].amount, 3);
    assert.equal(f.requests.length, 0);
});

test('已有属性初始化后转职：新职业名与被动可见，职业池供预览，旧卡不丢且不重复扣费', async (t) => {
    const f = await uiFixture(t);
    const ledger = f.services.getLedger();
    const init = await ledger.writeInit('艾拉', { className: '剑士', role: 'warrior', major: 'str', minor: 'dex', weak: 'cha' });
    assert.equal(init.ok, true, JSON.stringify(init));
    const before = await f.hero();
    assert.equal(before.attributes.initialized, true);
    f.setReply((p) => {
        const reply = JSON.parse(modelReply(p));
        reply.entities[0].value.passive = ['雷势', 'turn-guard'];
        return JSON.stringify(reply);
    });
    f.controller.invoke('respec-open');
    f.controller.invoke('respec-pick', '');
    await settle();
    assert.match(f.doc.body.textContent, /保留已有卡组.*不会直接获得/);
    const result = await f.controller.invoke('respec-confirm');
    assert.equal(result.ok, true, JSON.stringify(result));
    const hero = await f.hero();
    assert.equal(hero.className, '雷剑客');
    assert.equal(hero.attributes.className, '雷剑客');
    assert.equal(hero.classProfile.classPassive.name, '雷势');
    assert.deepEqual(hero.deck, before.deck);
    assert.deepEqual(hero.owned, before.owned);
    assert.deepEqual(hero.attributes.scores, before.attributes.scores);
    assert.equal(hero.points, before.points - 150);
    assert.equal(f.controller.view().detail.className, '雷剑客');
    const pool = f.doc.querySelector('.igs-deck-pool');
    assert.match(pool.querySelector('summary').textContent, /雷剑客.*11 种/);
    assert.equal(pool.querySelectorAll('.igs-deck-card').length, 11);
    assert.equal(pool.querySelector('button'), null);
    assert.ok([...pool.querySelectorAll('.igs-deck-card')].every((r) => /未拥有/.test(r.textContent) && /点伤害/.test(r.textContent)));
    assert.match(f.doc.body.textContent, /职业被动/);
    assert.match(f.doc.body.textContent, /雷势/);
    const requestCount = f.requests.length;
    f.services.resetChat();
    await f.controller.invoke('reload');
    assert.equal(f.controller.view().detail.className, '雷剑客');
    assert.equal((await f.hero()).points, before.points - 150);
    assert.equal(f.requests.length, requestCount);
    assert.equal((await f.services.respecClass({ classRef: before.classRef })).ok, true);
    assert.equal((await f.hero()).attributes.className, '剑士');
    assert.equal(f.requests.length, requestCount);
});

test('根级技能等素材手动勾选后立即更新分组计数，手填路径不打断输入并去重', async (t) => {
    const f = await uiFixture(t);
    f.variables.stat_data = { 角色: { 职业: '龙骑士', 职业专精: '近战', 天赋列表: ['龙血'] }, 技能: { 龙息: { 等级: 1 } } };
    f.controller.invoke('rebuild-open');
    await settle();
    const summary = () => f.doc.querySelector('[data-generation-summary]').textContent;
    assert.match(summary(), /已选 0 组变量/);
    for (const path of ['/角色/职业', '/角色/职业专精', '/角色/天赋列表', '/技能']) {
        const checkbox = f.doc.querySelector(`[data-generation-field="path"][value="${path}"]`);
        checkbox.checked = true;
        checkbox.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
    }
    assert.match(summary(), /已选 4 组变量/);
    const extra = f.doc.querySelector('[data-generation-field="paths"]');
    extra.value = '/技能\n/其他能力';
    extra.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
    assert.equal(f.doc.querySelector('[data-generation-field="paths"]'), extra);
    assert.match(summary(), /已选 5 组变量/);
    const use = f.doc.querySelector('[data-generation-field="useMvu"]');
    use.checked = false;
    use.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
    assert.match(summary(), /已选 0 组变量/);
});

test('真实卡组面板输入、勾选、失败重试与取消：不误发请求，不丢中文提示，不把文本当 HTML', async (t) => {
    const f = await uiFixture(t);
    f.controller.invoke('rebuild-open');
    await settle();
    let input = f.doc.querySelector('[data-generation-field="hint"]');
    assert.ok(input);
    input.value = '雷系近战 <img src=x onerror=alert(1)>';
    input.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
    const useMvu = f.doc.querySelector('[data-generation-field="useMvu"]');
    useMvu.checked = false;
    useMvu.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
    assert.equal(f.doc.querySelector('[data-generation-field="hint"]').value, input.value);
    assert.equal(f.doc.querySelector('img[onerror]'), null);
    f.setFailure(true);
    assert.equal((await f.controller.invoke('rebuild-confirm')).ok, false);
    assert.equal(f.controller.view().rebuild, true);
    assert.equal(f.doc.querySelector('[data-generation-field="hint"]').value, input.value);
    assert.deepEqual(f.requests[0].context.characterMaterials.mvu, []);
    f.setFailure(false);
    assert.equal((await f.controller.invoke('rebuild-confirm')).ok, true);
    assert.equal(f.controller.view().rebuild, false);
    f.controller.invoke('rebuild-open');
    await settle();
    const n = f.requests.length;
    f.controller.invoke('rebuild-cancel');
    assert.equal(f.requests.length, n);
    assert.equal(f.doc.querySelector('[data-generation-field="hint"]'), null);
});

test('转职已有职业不展示 AI 表单；新职业与升阶展示输入和素材；关闭拒收迟到预览', async (t) => {
    const f = await uiFixture(t);
    f.controller.invoke('respec-open');
    assert.equal(f.doc.querySelector('[data-generation-field="hint"]'), null);
    f.controller.invoke('respec-pick', '');
    await settle();
    assert.ok(f.doc.querySelector('[data-generation-field="hint"]'));
    f.controller.invoke('respec-cancel');
    f.controller.invoke('ascend-open');
    await settle();
    assert.ok(f.doc.querySelector('[data-generation-field="hint"]'));
    const pending = f.controller.invoke('generation-refresh');
    f.controller.close();
    await pending;
    assert.equal(f.controller.view(), null);
    assert.equal(f.requests.length, 0);
});
