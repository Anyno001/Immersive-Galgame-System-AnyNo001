// 随身系统楼层保留：超出保留楼数的旧楼并进底稿，状态与全保留时一致；删楼、重开、切旧楼回复都不算错。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, blk } from './origin-host.js';
import { COMPACT_SLACK } from '../src/scene/origin/origin-ledger.js';
import { llmFromProfile, normalizeOriginSettings, originRequestRoute } from '../src/visual/igs-ui/origin-settings.js';
import { JSDOM } from 'jsdom';
import { decideClick, setFocusHooks } from '../src/visual/igs-ui/phone-focus.js';

function play(h, n) {
    for (let i = 0; i < n; i += 1) {
        h.user('继续');
        h.ai('第' + i + '段\n' + (i % 4 === 0 ? blk('积分|+10|x', '获得|灵石|1') : blk('积分|+10|x')));
        if (i % 6 === 0) h.engine.dispatch({ type: 'addTask', title: '任务' + i, reward: '' });
    }
}
const core = (st) => ({ points: st.points, level: st.level, exp: st.exp, bag: st.bag.map((b) => [b.name, b.count]), tasks: st.tasks.map((t) => t.title), turn: st.turn });

test('保留楼数：合并后数值与全保留一致，存档只留最近的楼', () => {
    const all = createHarness({ keepFloors: 0 });
    const kept = createHarness({ keepFloors: 5 });
    play(all, 40);
    play(kept, 40);
    assert.deepEqual(core(kept.state()), core(all.state()));
    const save = kept.ctx.chatMetadata.origin_v2;
    assert.ok(save.base && save.base.floor > 0, '应生成底稿');
    assert.ok(save.entries.length <= 5 + COMPACT_SLACK, `逐楼存档 ${save.entries.length} 条`);
    assert.equal(all.ctx.chatMetadata.origin_v2.base, null);
    // 被合并的楼，消息里存的数据块原文也清掉了。
    assert.equal(kept.ctx.chat[1].extra.origin, undefined);
    assert.ok(JSON.stringify(save).length < JSON.stringify(all.ctx.chatMetadata.origin_v2).length);
});

test('保留楼数：重开存档后底稿照样生效，提示词照常注入', () => {
    const h = createHarness({ keepFloors: 3 });
    play(h, 30);
    const before = core(h.state());
    h.reopen();
    assert.deepEqual(core(h.state()), before);
    h.user('继续');
    assert.ok(h.injected().includes('Origin'));
});

test('保留楼数：底稿之前的楼切换回复或编辑，不再改动数值', () => {
    const h = createHarness({ keepFloors: 3 });
    play(h, 30);
    const before = core(h.state());
    h.newSwipe(1, '换一个回复\n' + blk('积分|+9999|x'));
    assert.deepEqual(core(h.state()), before);
});

test('保留楼数：删掉底稿之前的一楼，底稿与其后的楼整体前移，数值不变', () => {
    const h = createHarness({ keepFloors: 4 });
    play(h, 30);
    const before = core(h.state());
    const floor = h.ctx.chatMetadata.origin_v2.base.floor;
    h.ctx.chat.splice(2, 1);
    h.emit('msg_deleted', h.ctx.chat.length);
    assert.equal(h.ctx.chatMetadata.origin_v2.base.floor, floor - 1);
    assert.deepEqual(core(h.state()), before);
    // 删最后一楼照常回退。
    h.removeLast();
    assert.equal(h.state().turn, before.turn - 1);
});

// 差异表第 12 / 14 / 15 条：删中间楼。
function deleteAt(h, i, k = 1) {
    h.ctx.chat.splice(i, k);
    h.emit('msg_deleted', h.ctx.chat.length);
}
const pts = (h) => h.state().points;

test('删中间的用户楼：后面的 AI 楼存档跟着前移，数据块照样生效（第 12 条）', () => {
    const h = createHarness({ keepFloors: 0 });
    for (const n of [100, 10, 1]) { h.user('继续'); h.ai('正文\n' + blk('积分|+' + n + '|x')); }
    const before = pts(h);
    assert.ok(before > 0, `积分应为正：${before}`);
    deleteAt(h, 2);
    assert.equal(pts(h), before);
});

test('删中间的 AI 楼：这一楼的效果和挂在它后面的手动操作一起撤销，后面的操作跟着前移（第 13 / 14 条）', () => {
    const h = createHarness({ keepFloors: 0 });
    h.user('1'); h.ai('一\n' + blk('新任务|类型:支线|标题:甲|描述:d|条件:c|奖励:|惩罚:|时限:|对象:宿主'));
    h.user('2'); h.ai('二\n' + blk('新任务|类型:支线|标题:乙|描述:d|条件:c|奖励:|惩罚:|时限:|对象:宿主'));
    h.engine.dispatch({ type: 'addTask', title: '挂在第二楼后', reward: '' });
    h.user('3'); h.ai('三\n' + blk('新任务|类型:支线|标题:丙|描述:d|条件:c|奖励:|惩罚:|时限:|对象:宿主'));
    h.engine.dispatch({ type: 'addTask', title: '挂在最后', reward: '' });
    const titles = () => h.state().tasks.map((t) => t.title);
    assert.ok(titles().includes('挂在第二楼后') && titles().includes('挂在最后'));
    deleteAt(h, 3);
    const t = titles();
    assert.ok(!t.includes('挂在第二楼后'), '删掉的楼之后挂的操作应一起删');
    assert.ok(t.includes('挂在最后'), '后面的操作应跟着前移、仍然生效');
    h.reopen();
    assert.deepEqual(titles(), t);
});

test('删中间楼后，后面楼的抽奖结果不变（种子随楼前移，第 15 条）', () => {
    const h = createHarness({ keepFloors: 0 });
    h.user('1'); h.ai('一');
    h.user('2'); h.ai('二');
    h.user('3'); h.ai('三\n' + blk('积分|+5000|x'));
    for (let i = 0; i < 6; i += 1) h.engine.dispatch({ type: 'draw' });
    const bag = JSON.stringify(h.bag());
    deleteAt(h, 1, 2);
    assert.equal(JSON.stringify(h.bag()), bag);
});

test('保留楼数：默认 30，0 表示全部保留，非法值回落', () => {
    assert.equal(normalizeOriginSettings({}).keepFloors, 30);
    assert.equal(normalizeOriginSettings({ keepFloors: 0 }).keepFloors, 0);
    assert.equal(normalizeOriginSettings({ keepFloors: 'x' }).keepFloors, 30);
    assert.equal(normalizeOriginSettings({ keepFloors: -3 }).keepFloors, 0);
});

test('备用模型预设：选了副 LLM 预设就用预设的连接，预设已删回落当前连接', () => {
    const llm = Object.freeze({ source: 'tavern', endpoint: '', model: '' });
    const profiles = [{ id: 'p1', name: '便宜', kind: 'llm', values: { 'bridge.autoIllustration.llm.endpoint': 'https://x/v1', 'bridge.autoIllustration.llm.model': 'm-x', 'bridge.autoIllustration.llm.apiKey': 'k' } },
        { id: 'p2', name: '生图', kind: 'image', values: {} }];
    const r = originRequestRoute({ route: 'llm', llmProfile: 'p1' }, llm, profiles);
    assert.equal(r.via, 'llm');
    assert.deepEqual([r.llm.source, r.llm.endpoint, r.llm.model, r.llm.apiKey], ['openai', 'https://x/v1', 'm-x', 'k']);
    assert.equal(llm.endpoint, '');
    assert.deepEqual(originRequestRoute({ route: 'llm', llmProfile: 'gone' }, llm, profiles), { via: 'tavern' });
    assert.deepEqual(originRequestRoute({ route: 'tavern', llmProfile: 'p1' }, llm, profiles), { via: 'tavern' });
    assert.equal(llmFromProfile(profiles[1], llm), null);
});

// 直播手机在场时，盖在手机上的随身系统窗口要能点：根节点捕获阶段不得把点击当成「点手机」吞掉。
test('手机焦点：点在随身系统窗口 / 入口坞上不进焦点、不拦点击', () => {
    const dom = new JSDOM('<div id="root"><div class="host"><div class="igs-live-phone"></div></div><div class="front"><div class="igs-entry-dock"><button class="igs-or-entry"></button></div><div class="igs-or-win"><div class="row">行</div></div></div></div>');
    const doc = dom.window.document;
    const root = doc.getElementById('root');
    const phone = doc.querySelector('.igs-live-phone');
    phone.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000 });
    const state = {};
    setFocusHooks(state, root, { host: doc.querySelector('.host'), textEl: () => null, refit() {}, editing: () => false });
    const fire = (node) => {
        let reached = false;
        node.addEventListener('click', () => { reached = true; }, { once: true });
        node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
        return reached;
    };
    assert.equal(fire(doc.querySelector('.igs-or-win .row')), true);
    assert.equal(fire(doc.querySelector('.igs-or-entry')), true);
    assert.equal(state.focus.on, false);
    // 对照：点在手机本身仍进焦点。
    fire(phone);
    assert.equal(state.focus.on, true);
    assert.equal(decideClick({ focus: false, inPhone: false, motion: 'tap' }), 'pass');
});
