import test from 'node:test';
import assert from 'node:assert/strict';
import { statsArchiveModel } from '../src/scene/stats/stat-archive.js';
import { createStatsLedger, ledgerKey } from '../src/scene/stats/stat-ledger.js';
import { BASE_ATTRIBUTES, createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';
import { renderStatsArchive, renderStatsHeroCard } from '../src/visual/igs-ui/stats-settings-fields.js';
import { renderStatsHeroDashboard } from '../src/visual/igs-ui/stats-hero-card.js';

function fixture() {
    const base = createStatsState();
    const c = createCharacter(1);
    const after = { ...base, characters: { '小<雪>': { ...c, dims: { ...c.dims, 好感: 30 } } } };
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 1, 0), { messageId: 1, swipeId: 0, after, changes: [{ source: 'tag', target: '小<雪>', key: '好感', from: 0, to: 30, note: '感动' }] });
    ledger.entries.set(ledgerKey(ledger, 1, 1), { messageId: 1, swipeId: 1, after: base, changes: [{ source: 'tag', target: '小<雪>', key: '好感', from: 0, to: -6, note: '被丢弃的swipe' }] });
    ledger.active.set(1, 0);
    return ledger;
}

test('存档模型：取当前生效楼层的数值与变动，未生效的 swipe 不计入；没有账本返回 null（§10）', () => {
    const m = statsArchiveModel(fixture());
    assert.equal(m.characters[0].stage, '明确喜欢');
    assert.equal(m.characters[0].dims.好感, 30);
    assert.deepEqual(m.log.map((r) => r.note), ['感动']);
    assert.equal(m.total, 1);
    assert.ok(m.skills.length > 0);
    assert.equal(statsArchiveModel(null), null);
});

test('存档区渲染：转义角色名与备注；技能和变动记录默认折叠；没有存档时只出一行说明', () => {
    const html = renderStatsArchive(statsArchiveModel(fixture()));
    assert.match(html, /小&lt;雪&gt;/);
    assert.doesNotMatch(html, /小<雪>/);
    assert.doesNotMatch(html, /被丢弃/);
    assert.match(html, /data-advanced="stats-log">/);
    assert.match(html, /#1 小&lt;雪&gt; 好感 0→30（感动）/);
    assert.match(renderStatsArchive(null), /还没有数值存档/);
});

test('六维雷达取引擎数值：切换骰制只改变标签，几何投影与生命、积分、货币均不改账', () => {
    const ledger = createStatsLedger('radar', createStatsState({ money: 500 }));
    const readers = { readAbilities: () => ({ scores: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } }),
        readVitals: () => ({ hp: 41, maxHp: 82, down: false }) };
    const currency = { name: '铜钱', ready: true, balance: 240 };
    const before = JSON.stringify(ledger.initial);
    const models = ['coc7', 'dnd5e'].map((ruleset) => statsArchiveModel(ledger, {
        engine: createEngine({}, {}, ruleset, readers), currency, walletExtra: 25,
    }));
    for (const model of models) {
        assert.deepEqual(model.attributes.map((a) => a.name), [...BASE_ATTRIBUTES]);
        assert.deepEqual(model.attributes.map((a) => a.value), [75, 65, 70, 40, 60, 50]);
        assert.equal(model.wallet, 525);
        assert.equal(model.currency.balance, 240);
        assert.equal(model.vitals.hp, 41);
    }
    assert.equal(models[0].attributes[0].display, '75');
    assert.equal(models[1].attributes[0].display, '15（+2）');
    const html = models.map(renderStatsHeroDashboard);
    const points = (text) => text.match(/class="igs-stats-radar-fill" points="([^"]+)"/)[1];
    assert.equal(points(html[0]), points(html[1]));
    assert.equal(points(html[0]).split(' ').length, 6);
    assert.match(html[0], /aria-label="生命"[^>]*aria-valuemax="82"[^>]*aria-valuenow="41"/);
    assert.match(html[0], /style="width:50\.00%"/);
    assert.equal(JSON.stringify(ledger.initial), before);
});

test('角色分栏保留货币重试，技能以数值格平铺，缺生命不造零值，倒地生命归零', () => {
    const ledger = createStatsLedger('hero', createStatsState());
    const model = statsArchiveModel(ledger, { engine: createEngine({}, {}, 'coc7'), heroSkills: ['电脑'],
        currency: { name: '<铜钱>', ready: false, pending: true } });
    const html = renderStatsHeroCard(model);
    assert.doesNotMatch(html, /aria-label="生命"/);
    assert.match(html, /&lt;铜钱&gt;/);
    assert.doesNotMatch(html, /<铜钱>/);
    assert.match(html, /data-action="stats-op:currency-retry"[^>]*disabled/);
    assert.match(html, /data-stats-numbers>[\s\S]*igs-stats-radar/);
    assert.match(html, /data-stats-skills>[\s\S]*igs-stats-hero-grid is-skills/);
    const down = renderStatsHeroDashboard({ ...model, vitals: { hp: 41, maxHp: 82, down: true } });
    assert.match(down, /aria-label="生命"[^>]*aria-valuenow="0"/);
});

test('变动记录：生活条英文键显示为体力、压力、积分', () => {
    const base = createStatsState();
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 2, 0), { messageId: 2, swipeId: 0, after: base, changes: [
        { source: 'tag', target: '主角', key: 'stamina', from: 100, to: 85, note: '中' },
        { source: 'tag', target: '主角', key: 'stress', from: 0, to: 10, note: '上升' },
        { source: 'challenge', target: '主角', key: 'money', from: 0, to: 100, note: '' },
    ] });
    ledger.active.set(2, 0);
    assert.deepEqual(statsArchiveModel(ledger).log.map((r) => r.key).sort(), ['体力', '压力', '积分'].sort());
});

test('变动记录：主角写成「名字（主角）」，按角色分组时主角排最前，用户名与「主角」并成一组', () => {
    const base = createStatsState();
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 1, 0), { messageId: 1, swipeId: 0, after: base, changes: [{ target: '主角', key: 'stamina', from: 80, to: 70, note: '' }] });
    ledger.entries.set(ledgerKey(ledger, 2, 0), { messageId: 2, swipeId: 0, after: base, changes: [{ target: '小雪', key: '好感', from: 0, to: 3, note: '' }, { target: '阿明', key: '侦查', from: 40, to: 41, note: '成长' }] });
    ledger.active.set(1, 0);
    ledger.active.set(2, 0);
    const m = statsArchiveModel(ledger, { heroName: '阿明', isHero: (name) => name === '阿明' });
    assert.deepEqual(m.log.map((r) => r.target), ['阿明（主角）', '小雪', '阿明（主角）']);
    assert.deepEqual(m.logGroups.map((g) => [g.name, g.total]), [['阿明（主角）', 2], ['小雪', 1]]);
    assert.equal(statsArchiveModel(ledger).log[2].target, '主角');
    const html = renderStatsArchive(m, () => '', { logByRole: true });
    assert.match(html, /<summary>阿明（主角）（2 条）<\/summary>/);
    assert.match(html, /data-action="stats-log-view:time"/);
});

test('好感总览模型：好感从高到低，只含人际维度变动，排除主角，新的在前，带天数与楼号', async () => {
    const { statsFavorOverview } = await import('../src/scene/stats/stat-archive.js');
    const base = createStatsState();
    const mk = (favor) => ({ ...createCharacter(1), dims: { ...createCharacter(1).dims, 好感: favor } });
    const after = { ...base, clock: { ...base.clock, day: 3 }, characters: { 甲: mk(10), 乙: mk(40), 主角: mk(99) } };
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 1, 0), { messageId: 1, swipeId: 0, after, changes: [
        { source: 'tag', target: '乙', key: '好感', from: 0, to: 5, note: '感动' },
        { source: 'tag', target: '乙', key: 'stamina', from: 100, to: 90, note: '亲密' },
        { source: 'tag', target: '乙', key: '芥蒂', from: 0, to: 4, note: '吃醋' },
    ] });
    ledger.active.set(1, 0);
    const list = statsFavorOverview(ledger, { isHero: (name) => name === '主角' });
    assert.deepEqual(list.map((p) => p.name), ['乙', '甲']);
    assert.deepEqual(list[0].log.map((r) => r.key), ['芥蒂', '好感']);
    assert.deepEqual(list[0].log[1], { day: 3, messageId: 1, key: '好感', from: 0, to: 5, note: '感动' });
    assert.deepEqual(list[1].log, []);
    assert.deepEqual(statsFavorOverview(null), []);
});

test('日期捕捉诊断：只列有日期或整点的楼，最多取最近 20 楼', async () => {
    const { statsClockTrail, describeClockTrail } = await import('../src/scene/stats/stat-archive.js');
    const base = createStatsState();
    const ledger = createStatsLedger('chat', base);
    for (let id = 0; id < 30; id += 1) {
        const clock = id === 3 ? base.clock : { ...base.clock, lastDate: `3月${id}日`, lastHour: id % 24 };
        ledger.entries.set(ledgerKey(ledger, id, 0), { messageId: id, swipeId: 0, after: { ...base, clock }, changes: [] });
        ledger.active.set(id, 0);
    }
    const rows = statsClockTrail(ledger);
    assert.equal(rows.length, 20);
    assert.equal(rows[0].messageId, 10);
    assert.deepEqual(rows[19], { messageId: 29, date: '3月29日', hour: 5 });
    assert.ok(!statsClockTrail(ledger, 100).some((r) => r.messageId === 3));
    assert.match(describeClockTrail(rows), /^日期捕捉（最近 20 楼） #10 3月10日 10时 · /);
    assert.equal(describeClockTrail([]), '');
    assert.deepEqual(statsClockTrail(null), []);
});

test('楼号：变动记录与好感总览显示账本 messageId，与阅读器楼号（宿主 id，从 0 起）一致', async () => {
    const { statsFavorOverview } = await import('../src/scene/stats/stat-archive.js');
    const base = createStatsState();
    const ledger = createStatsLedger('chat', base);
    const after = { ...base, characters: { 甲: createCharacter(1) } };
    ledger.entries.set(ledgerKey(ledger, 0, 0), { messageId: 0, swipeId: 0, after, changes: [{ source: 'tag', target: '甲', key: '好感', from: 0, to: 2, note: '' }] });
    ledger.active.set(0, 0);
    assert.equal(statsFavorOverview(ledger)[0].log[0].messageId, 0);
    assert.match(renderStatsArchive(statsArchiveModel(ledger)), /#0 甲 好感 0→2/);
});

test('每日冷却扣好感：写入 note 为「冷却」的变动，好感总览与变动记录都能看到', async () => {
    const { settleDay } = await import('../src/scene/stats/stat-day.js');
    const { statsFavorOverview } = await import('../src/scene/stats/stat-archive.js');
    const base = createStatsState();
    const c = { ...createCharacter(1), dims: { ...createCharacter(1).dims, 好感: 40 }, lastSeenDay: 1 };
    const start = { ...base, clock: { ...base.clock, day: 5 }, characters: { 甲: c } };
    const changes = [];
    const after = settleDay(start, { random: () => 0.5, changes });
    const cool = changes.find((r) => r.note === '冷却');
    assert.deepEqual([cool.target, cool.key, cool.from, cool.to], ['甲', '好感', 40, 39]);
    assert.equal(after.characters.甲.dims.好感, 39);
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 4, 0), { messageId: 4, swipeId: 0, after, changes });
    ledger.active.set(4, 0);
    assert.equal(statsFavorOverview(ledger)[0].log.find((r) => r.note === '冷却').messageId, 4);
    assert.ok(statsArchiveModel(ledger).log.some((r) => r.note === '冷却'));
});

test('主角与 NPC 卡片：六维雷达图居右上角，主角显示擅长技能且无技能时提供按人设生成入口', async () => {
    const { JSDOM } = await import('jsdom');
    const { createRecordPanelController } = await import('../src/visual/igs-ui/record-panel.js');
    const ledger = createStatsLedger('hero', createStatsState({ skills: [] }));
    const readers = { readAbilities: () => ({ scores: { str: 6, dex: 11, con: 8, int: 13, wis: 13, cha: 12 }, initialized: true }) };
    const model = {
        ...statsArchiveModel(ledger, { engine: createEngine({}, {}, 'dnd5e', readers) }),
        needsPick: false,
    };
    const dashHtml = renderStatsHeroDashboard(model);
    assert.ok(dashHtml.indexOf('igs-stats-condition') < dashHtml.indexOf('igs-stats-radar-panel'), '设置页当前状态在左，六维雷达图在右上');
    const emptyCard = renderStatsHeroCard(model);
    assert.match(emptyCard, /data-action="stats-op:hero-assign"/, '主角技能为空时提供按人设生成擅长按钮');
    const pickCard = renderStatsHeroCard({ ...model, needsPick: true });
    assert.match(pickCard, /data-stats-hero-pick[\s\S]*data-action="stats-op:hero-assign"/, '选择擅长技能区提供按人设自动生成按钮');

    // 人际关系页：主角与 NPC 都在卡片右上角渲染六维雷达图，展示默认立绘，且主角无表行时展示酒馆人设简介
    const dom = new JSDOM('<div id="overlay"><div id="igs-db-layer"></div></div>');
    const doc = dom.window.document;
    const globalObj = {
        SillyTavern: {
            getContext: () => ({
                name1: '陈默',
                powerUserSettings: { persona_description: '二十二岁刚继承老宅的普通青年，性格沉稳内敛。' },
            }),
        },
        AutoCardUpdaterAPI: {
            exportTableAsJson: () => ({
                sheet_zhong_yao_jue_se_biao: {
                    uid: 'sheet_zhong_yao_jue_se_biao',
                    name: '重要角色表',
                    content: [
                        [null, '姓名', '年龄', '外貌', '人际关系'],
                        ['0', '刘桂芳', '40', '圆盘脸', '陈默:雇主'],
                    ],
                },
            }),
        },
    };
    const attrs = model.attributes;
    let assignCalls = 0;
    let portraitReady = false;
    let notifyPortrait = null;
    const controller = createRecordPanelController(doc, globalObj, null, {
        statsProtagonistLookup: () => () => ({
            metrics: [{ label: '生命', percent: 100, display: '57/57' }],
            stages: [],
            sheet: { name: '主角', hero: true, strong: ['察言观色 精通', '话术 熟练'], missing: false },
            attributes: attrs,
        }),
        statsLookup: () => (name) => (name === '刘桂芳' ? {
            metrics: [{ label: '好感', percent: 15, display: '15' }],
            stages: [{ label: '关系阶段', value: '初步好感' }],
            sheet: { name: '刘桂芳', rank: '普通人', strong: ['家务 熟练', '烹饪 熟练'], provisional: false },
            attributes: attrs,
        } : { metrics: [], stages: [] }),
        statsAssignHero: async () => { assignCalls += 1; return { ok: true }; },
        resolvePersonPortrait: (name) => {
            if (name === '刘桂芳') return 'data:image/png;base64,TElV';
            if (name === '陈默' && portraitReady) return 'data:image/png;base64,Q0hFTg==';
            return '';
        },
        subscribePortraits: (handler) => { notifyPortrait = handler; return () => { notifyPortrait = null; }; },
    });
    try {
        controller.open(doc.querySelector('#overlay'), {}, 'relationships');
        const detail = () => doc.querySelector('.igs-record-relationship-detail')?.innerHTML || '';
        // 首个选中 NPC「刘桂芳」：右上角雷达图 + 默认立绘 + 擅长
        assert.match(detail(), /igs-record-person-top has-radar/, 'NPC 卡启用右上角雷达布局');
        assert.match(detail(), /igs-record-person-radar[\s\S]*igs-stats-radar/, 'NPC 卡右上角渲染六维雷达图');
        assert.match(detail(), /igs-record-person-portrait[\s\S]*data:image\/png;base64,TElV/, 'NPC 卡渲染默认立绘');
        assert.match(detail(), /<span>擅长<\/span><strong>家务 熟练、烹饪 熟练<\/strong>/, 'NPC 卡展示擅长技能');

        // 切换到由关系边派生出的主角「陈默」：展示主角简介、擅长技能与右上角雷达图
        const heroBtn = [...doc.querySelectorAll('[data-record-act="person"]')].find((b) => b.textContent.includes('陈默'));
        assert.ok(heroBtn);
        heroBtn.click();
        assert.match(detail(), /igs-record-person-top has-radar/, '主角卡启用右上角雷达布局');
        assert.match(detail(), /igs-record-person-radar[\s\S]*igs-stats-radar/, '主角卡右上角渲染六维雷达图');
        assert.match(detail(), /<span>擅长<\/span><strong>察言观色 精通、话术 熟练<\/strong>/, '主角卡展示擅长技能');
        assert.match(detail(), /<dt>主角简介<\/dt><dd>二十二岁刚继承老宅的普通青年，性格沉稳内敛。<\/dd>/, '主角卡展示酒馆人设简介');
        assert.doesNotMatch(detail(), /仅记录了姓名，未提供身份或描述/);
        assert.doesNotMatch(detail(), /igs-record-person-portrait/, '无默认立绘时不占立绘框');

        // 模拟图库读回主角默认立绘：订阅触发后自动刷新出立绘与头像
        portraitReady = true;
        notifyPortrait?.({ reason: 'image-loaded' });
        assert.match(detail(), /igs-record-person-portrait[\s\S]*data:image\/png;base64,Q0hFTg==/, '图库读回后主角卡自动渲染默认立绘');
        assert.ok(doc.querySelectorAll('.igs-record-avatar-img').length >= 2, '人物索引与关系图节点同步渲染立绘头像');
    } finally {
        controller.close();
        dom.window.close();
    }
    assert.equal(assignCalls, 0);
});
