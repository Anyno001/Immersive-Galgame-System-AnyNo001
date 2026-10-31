import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blk, createHarness } from './origin-host.js';
import { fillSettings } from '../src/scene/origin/origin-state.js';

const ORIGINAL = 'G:/奶龙Code/gal/参考文件/origin-sillytavern/index.js';

test('注入：放在 ev.chat 最后一条、system 角色；dryRun、总开关关、暂停时不注入', () => {
    const h = createHarness();
    h.user('hi');
    const chat = h.prompt();
    assert.equal(chat.length, 2);
    assert.equal(chat[1].role, 'system');
    assert.match(chat[1].content, /^【Origin 状态】\n世界：未设定\n积分：0 ｜ 等级 Lv\.1\n/);
    assert.match(chat[1].content, /<origin>\n进度\|任务id\|新百分比0-100\|一句依据/);
    const ev = { chat: [{ role: 'user', content: 'x' }], dryRun: true };
    h.emit('prompt_ready', ev);
    assert.equal(ev.chat.length, 1, 'dryRun 不注入');
    h.engine.dispatch({ type: 'pause' });
    assert.equal(h.injected(), '', '暂停时不注入');
    const off = createHarness({ enabled: false });
    assert.equal(off.injected(), '', '总开关关');
});

test('注入提示词原文逐字照搬：原插件 buildInjection 里的每一段静态文案都在新文件里', () => {
    const src = readFileSync(ORIGINAL, 'utf8').split('\n').slice(101, 181).join('\n');
    const mine = readFileSync(new URL('../src/scene/origin/origin-inject.js', import.meta.url), 'utf8');
    const lits = [...src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]).filter((s) => /[一-龥]/.test(s) && s.length >= 6);
    assert.ok(lits.length > 60, '取到的文案段数 ' + lits.length);
    const missing = lits.filter((s) => !mine.includes(s));
    assert.deepEqual(missing, []);
});

test('反串模式注入：绑定角色、私聊行、商城与自主行动提示', () => {
    const h = createHarness({ bindTo: '小雪', budget: 8000 });
    h.user('hi');
    const t = h.injected();
    const cut = createHarness({ bindTo: '小雪' });
    cut.user('hi');
    assert.ok(cut.injected().length <= 1400, '默认预算 1400 字截断（原插件行为）');
    assert.match(t, /★本系统绑定的是角色【小雪】/);
    assert.match(t, /私聊\|系统 或 小雪\|一句话/);
    assert.match(t, /商城（可花积分买，当前积分0）/);
    assert.match(t, /买\|商品名/);
});

test('状态只读：getState 返回冻结对象，原地修改直接抛错；写时浅拷不影响缓存；宿主设置不被改', () => {
    const h = createHarness();
    h.user('u'); h.ai('a' + blk('获得|药水|1', TASKLINE));
    const s = h.state();
    assert.throws(() => { s.points = 99; }, TypeError);
    assert.throws(() => { s.bag.push({ name: 'x' }); }, TypeError);
    assert.throws(() => { s.bag[0].count = 9; }, TypeError);
    assert.equal(h.state(), s, '无变化时返回同一份缓存');
    h.engine.dispatch({ type: 'addItem', name: '钥匙' });
    assert.notEqual(h.state(), s);
    assert.equal(s.bag.length, 1, '旧快照不被后续写入改动');
    assert.equal(h.state().bag.length, 2);
    assert.equal(Object.isFrozen(h.settingsObj), true);
    assert.equal(h.settingsSaved, undefined, '核心不写全局设置');
    const filled = fillSettings(h.settingsObj);
    assert.notEqual(filled, h.settingsObj);
    assert.equal(h.settingsObj.sysName, undefined, '补默认值不改宿主对象');
});
const TASKLINE = '新任务|类型:主线|标题:找猫|描述:d|条件:c|奖励:积分20|惩罚:|时限:|对象:宿主';

test('收块：块原文存 message.extra.origin，正文剪掉块；通知走 host.notify', () => {
    const h = createHarness();
    h.user('u');
    const i = h.ai('正文。\n' + blk(TASKLINE, '播报|欢迎'));
    const m = h.ctx.chat[i];
    assert.equal(m.mes, '正文。');
    assert.equal(m.swipes[0], '正文。');
    assert.match(m.extra.origin.blocks[0], /新任务\|类型:主线/);
    assert.deepEqual(h.notes.map((n) => n.kind), ['task-new', 'broadcast']);
    assert.equal(h.state().tasks[0].floor, 1, '记录带楼号');
    assert.equal(h.engine.lastFloorStatus().has, true);
    const n = createHarness();
    n.user('u'); n.ai('x' + blk('无'));
    assert.deepEqual(n.engine.lastFloorStatus(), { has: false, lines: 0, wroteNone: true });
});

test('存档：重开后状态一致；格式非法或版本更新时拒收，不覆盖原数据', () => {
    const h = createHarness();
    h.user('u'); h.ai('a' + blk(TASKLINE, '技能|夜视|x'));
    h.engine.dispatch({ type: 'setWorld', value: '雨城' });
    const before = JSON.stringify(h.state());
    h.reopen();
    assert.equal(JSON.stringify(h.engine.getState()), before);
    assert.equal(h.engine.getState().world, '雨城');
    const bad = createHarness();
    bad.ctx.chatMetadata.origin_v2 = { version: 99, entries: [], ops: [] };
    bad.engine.reload();
    assert.equal(bad.engine.isBlocked(), 'origin-save-newer');
    assert.deepEqual(bad.engine.dispatch({ type: 'addItem', name: 'x' }), { ok: false, reason: 'origin-save-newer' });
    assert.equal(bad.ctx.chatMetadata.origin_v2.version, 99, '原数据没被覆盖');
});

test('旧存档导入：检测 chatMetadata.origin 与楼层 originBlocks，按楼重建，不覆盖原数据，只提示一次', () => {
    const h = createHarness();
    h.user('u');
    const m = { ...h.ctx.chat[0] };
    h.ctx.chat.push({ name: 'Bot', is_user: false, is_system: false, mes: '她笑了。', swipe_id: 0, swipes: ['她笑了。'], extra: { originBlocks: { 0: '积分|+30|旧存档\n获得|旧剑|1' } } });
    const legacy = { world: '旧世界', direction: '复仇', skills: [{ name: '旧技', desc: '', turn: 1 }], shop: [{ name: '旧货', price: 10, desc: '', effect: '' }] };
    h.ctx.chatMetadata.origin = legacy;
    assert.ok(m);
    assert.equal(h.engine.legacyDetected(), true);
    const r = h.engine.importLegacy();
    assert.deepEqual({ ok: r.ok, floors: r.floors }, { ok: true, floors: 1 });
    const s = h.state();
    assert.equal(s.points, 30);
    assert.deepEqual(h.bag(), { 旧剑: 1 });
    assert.equal(s.world, '旧世界');
    assert.equal(s.direction, '复仇');
    assert.deepEqual(s.skills.map((k) => k.name), ['旧技']);
    assert.equal(h.ctx.chatMetadata.origin, legacy, '原插件数据原样保留');
    assert.equal(h.engine.legacyDetected(), false);
});

test('dispatch：计划里的每种 op 都能执行，失败返回 { ok:false, reason }', () => {
    const h = createHarness();
    h.user('u'); h.ai('a' + blk('积分|+2000|x', '获得|药水|2'));
    const d = (op) => h.engine.dispatch(op);
    assert.equal(d({ type: 'addTask', title: '手动任务', taskType: '日常', desc: 'd', cond: 'c', reward: '积分10', penalty: '', limit: 5, owner: '宿主' }).ok, true);
    const tid = h.state().tasks[0].id;
    assert.equal(d({ type: 'editTask', id: tid, patch: { progress: 50, title: '改名任务' } }).ok, true);
    assert.equal(h.state().tasks[0].progress, 50);
    assert.equal(d({ type: 'completeTask', id: tid }).ok, true);
    assert.equal(h.state().tasks[0].status, 'done');
    assert.equal(d({ type: 'completeTask', id: tid }).reason, 'not-active');
    assert.equal(d({ type: 'deleteTask', id: tid }).ok, true);
    assert.equal(d({ type: 'addItem', name: '钥匙', count: 2 }).ok, true);
    assert.equal(d({ type: 'deleteItem', name: '钥匙' }).ok, true);
    assert.equal(d({ type: 'deleteItem', name: '钥匙' }).reason, 'no-item');
    assert.equal(d({ type: 'addShop', name: '盾', price: 100, desc: '', effect: '' }).ok, true);
    assert.equal(d({ type: 'buy', name: '盾' }).ok, true);
    assert.equal(d({ type: 'buy', index: 0 }).ok, true, '按下标购买');
    assert.equal(d({ type: 'deleteShop', name: '盾' }).ok, true);
    assert.equal(d({ type: 'use', name: '药水' }).ok, true);
    assert.equal(d({ type: 'addGacha', name: '小奖', tier: 'N', weight: 5 }).ok, true);
    assert.equal(d({ type: 'draw' }).ok, true);
    assert.equal(d({ type: 'deleteGacha', name: '小奖' }).ok, true);
    assert.equal(d({ type: 'addStat', name: '魅力', val: 3 }).ok, true);
    assert.equal(d({ type: 'deleteStat', name: '魅力' }).ok, true);
    assert.equal(d({ type: 'addSkill', name: '剑术', desc: '砍' }).ok, true);
    assert.equal(d({ type: 'addSkill', name: '剑术' }).reason, 'exists');
    assert.equal(d({ type: 'deleteSkill', name: '剑术' }).ok, true);
    assert.equal(d({ type: 'addPerk', name: '通行权限', desc: '' }).ok, true);
    assert.equal(d({ type: 'deletePerk', name: '通行权限' }).ok, true);
    assert.equal(d({ type: 'setWorld', value: '仙侠' }).ok, true);
    assert.equal(d({ type: 'setDirection', value: '复仇' }).ok, true);
    assert.equal(h.state().direction, '复仇');
    assert.equal(d({ type: 'pause' }).ok, true);
    assert.equal(h.state().paused, true);
    assert.equal(d({ type: 'resume' }).ok, true);
    assert.equal(d({ type: 'draw', free: true }).ok, true, 'free 参数被忽略，按付费抽');
    assert.equal(d({ type: 'nope' }).reason, 'unknown-op');
    assert.equal(d({ type: 'reset' }).ok, true);
    assert.equal(h.state().points, 0);
    assert.equal(h.state().world, '');
});

test('生成请求：派任务 / 商城 / 奖池 / 系统对话 / 私聊 / 喊话，忙时返回 busy', async () => {
    const h = createHarness({ bindTo: '小雪' });
    h.user('u'); h.ai('a');
    h.generateImpl = async (kind) => ({
        task: '新任务|类型:支线|标题:送信|描述:d|条件:c|奖励:积分5|惩罚:|时限:|对象:小雪',
        shop: '商品|护符|150|挡灾|', gacha: '奖品|铜钱|N|50|一枚|\n奖品|玉佩|SSR|2|传家|好感+30',
        sysChat: '系统：成交。\n<origin>\n积分|+20|奖励\n</origin>',
        rpChat: '私聊|系统|小心\n私聊|小雪|知道了',
    }[kind]);
    assert.equal((await h.engine.genTask()).ok, true);
    assert.equal(h.state().tasks[0].title, '送信');
    assert.equal((await h.engine.genShop()).ok, true);
    assert.deepEqual(h.state().shop.map((x) => x.name), ['护符']);
    assert.equal((await h.engine.genGacha()).ok, true);
    assert.equal(h.state().gachaPool.length, 2);
    assert.equal((await h.engine.sysChat('给我加点积分')).ok, true);
    assert.equal(h.state().points, 20);
    assert.deepEqual(h.state().chat.map((c) => c.who), ['me', 'sys']);
    assert.match(h.state().chat[1].note, /积分\+20/);
    h.user('next');
    assert.match(h.injected(), /宿主刚在系统频道对系统说「给我加点积分」/);
    assert.equal((await h.engine.rpChatGen()).ok, true);
    assert.deepEqual(h.state().chat.slice(-2).map((c) => c.who), ['sys', 'char']);
    assert.equal((await h.engine.rpChatCall('该交作业了')).ok, true);
    assert.match(h.injected(), /系统私下对 小雪 说：「该交作业了」/);
    let release;
    h.generateImpl = () => new Promise((r) => { release = r; });
    const first = h.engine.genTask();
    assert.deepEqual(await h.engine.genShop(), { ok: false, reason: 'busy' });
    release('新任务|类型:支线|标题:慢任务|描述:d|条件:c');
    assert.equal((await first).ok, true);
});
