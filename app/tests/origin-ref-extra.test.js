// 黄金对照（补）：奖励流水 rewardsLog、正文里的权限/称号、阶段任务。
// 原插件一侧走 origin-ref.js 的 settleFloorFull（照搬 applyMessage 全文），新核心一侧走 applyFloor + checkExpiry + checkAchievements（与账本回放 stepOnce 相同）。
// 原插件在下一次生成提示词时（buildInjection 开头）才补判到期与成就；这里在每楼之后补跑一次，对提示词等价。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRef } from './origin-ref.js';
import { applyManual, checkAchievements, checkExpiry, createCx } from '../src/scene/origin/origin-apply.js';
import { applyFloor, extractProseTitle, proseCompletions, proseNewTasks } from '../src/scene/origin/origin-prose.js';
import { makeEntry } from '../src/scene/origin/origin-ledger.js';
import { splitBlock } from '../src/scene/origin/origin-parse.js';
import { cloneForWrite, createInitialState, fillSettings, seededRandom } from '../src/scene/origin/origin-state.js';

const S0 = fillSettings({ enabled: true });
const KEYS = ['points', 'level', 'exp', 'expMax', 'stats', 'tasks', 'bag', 'achievements', 'skills', 'perks', 'rewardsLog', 'log', 'lastTaskTurn', 'nextId'];
const plain = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'floor' ? undefined : v)));
const pick = (st) => plain(Object.fromEntries(KEYS.map((k) => [k, st[k]])));

// 同一串楼分别跑原插件与新核心。opts.panel：原插件悬浮窗已挂载（renderPanel 会先判到期）。
function run(floors, { S = S0, panel = false } = {}) {
    const ref = createRef(S, seededRandom(1), { panel });
    ref.init(createInitialState());
    let st = cloneForWrite(createInitialState());
    const events = [];
    const perFloor = [];
    floors.forEach((raw, i) => {
        const turn = i + 1;
        const sp = splitBlock(raw);
        ref.settleFloorFull(turn, sp.text, sp.block);
        ref.checkExpiry();
        ref.checkAchievements();
        const cx = createCx({ turn, floor: i, s: S, random: seededRandom(7 + i) });
        st = cloneForWrite(st);
        applyFloor(st, makeEntry(sp.block, sp.text, 7 + i), cx);
        checkExpiry(st, cx);
        checkAchievements(st, cx);
        events.push(...cx.events);
        perFloor.push({ core: pick(st), ref: pick(ref.state) });
    });
    return { st, ref, events, perFloor, refEvents: ref.state.pendingEvent || [] };
}
function assertSame(floors, opts) {
    const r = run(floors, opts);
    r.perFloor.forEach((f, i) => assert.deepEqual(f.core, f.ref, `第${i + 1}楼状态与原插件一致`));
    assert.deepEqual(r.events, r.refEvents, '待发事件与原插件一致');
    return r;
}
const B = (...lines) => '\n<origin>\n' + lines.join('\n') + '\n</origin>';

// ---------- 纯文本函数：逐条同输入 ----------
const PROSE_SAMPLES = [
    '【主线任务阶段一已生成】任务要求：找到失落的钥匙。',
    '任务阶段3已生成，需要：三天内凑够钱。阶段3已完成。',
    '支线任务 阶段 二 生成，目标：把钥匙交给守门人',
    '阶段一已达成，阶段二已完成，阶段十已达成',
    '日常任务阶段五已生成\n任务要求：扫',
    '任务1：送信到北门。',
    '系统发布任务「护送商队」',
    '【新任务：清理地窖】',
    '任务奖励：积分100',
    '任务：积分300',
    '没有任务的正文',
    '',
];
test('阶段任务/正文标题的文本识别与原插件逐条相同', () => {
    const ref = createRef(S0);
    for (const t of PROSE_SAMPLES) {
        assert.deepEqual(proseNewTasks(t), ref.proseNewTasks(t), 'proseNewTasks: ' + t);
        assert.deepEqual(proseCompletions(t), ref.proseCompletions(t), 'proseCompletions: ' + t);
        assert.equal(extractProseTitle(t), ref.extractProseTitle(t), 'extractProseTitle: ' + t);
    }
});

// ---------- 奖励流水 ----------
test('奖励流水：预告挂到本回合新建且无奖励的任务，完成时按它发放；发放句与数据块不重复记账', () => {
    const r = assertSame([
        '系统发布任务「护送商队」。【任务奖励：积分200 疾风靴×1】' + B('新任务|类型:支线|标题:护送商队|描述:护送|条件:抵达|对象:宿主'),
        '商队平安抵达。【奖励已发放：积分200 疾风靴×1】' + B('完成|1'),
    ]);
    assert.equal(r.st.tasks[0].reward, '积分200 疾风靴×1');
    assert.equal(r.st.points, 250); // 200 + 成就「初出茅庐」50
    assert.deepEqual(r.st.bag.map((b) => [b.name, b.count]), [['疾风靴', 1]]);
    assert.deepEqual(r.st.rewardsLog.map((x) => [x.turn, x.kind]), [[1, '预告'], [2, '发放']]);
});

test('奖励流水：同一楼同文只记一次，换一楼再出现另记；两种写法（括号 / 句首）都认', () => {
    assertSame([
        '奖励发放：积分50。又说一次。【奖励发放：积分50】【结算奖励：铜钱×3】',
        '【奖励发放：积分50】\n奖励已发放：灵石×2',
        '【系统奖励：一张地图】【奖励结算：积分10】' + B('积分|+10|结算'),
    ]);
});

test('奖励流水：超过 40 条只留最后 40 条', () => {
    const many = Array.from({ length: 45 }, (_, i) => '【系统奖励：物资' + i + '号】').join('');
    const r = assertSame([many, '【奖励：尾巴】']);
    assert.equal(r.st.rewardsLog.length, 40);
    assert.equal(r.st.rewardsLog.at(-1).text, '尾巴');
});

test('奖励流水：已有奖励字段的任务、往楼新建的任务都不被预告覆盖', () => {
    assertSame([
        B('新任务|类型:主线|标题:旧任务|描述:d|条件:c|奖励:积分5'),
        '【任务奖励：积分999】' + B('新任务|类型:支线|标题:有奖励的|描述:d|条件:c|奖励:积分1', '新任务|类型:日常|标题:没奖励的|描述:d|条件:c'),
    ]);
});

// ---------- 正文权限 / 称号 ----------
test('正文权限：已开启的入栏，预告的不入；发放句里的资格/称号入栏；类别按名字判定', () => {
    const r = assertSame([
        '系统提示：已为你开启「夜行者权限」。',
        '任务完成后可获得「商会特权」。',
        '【奖励已发放：积分100，商会资格已开启】',
        '解锁了【剑圣称号】，并授予「隐身功能」。激活头衔「北境守望」',
        '完成后可获得特权，现已开启「VIP特权」',
    ]);
    assert.deepEqual(r.st.perks.map((k) => [k.name, k.kind]), [['夜行者权限', '权限'], ['商会资格', '资格'], ['剑圣称号', '称号'], ['隐身功能', '功能'], ['VIP特权', '特权']]);
});

test('正文权限：与数据块 权限| 行重名时不重复，空说明由数据块补', () => {
    assertSame([
        '你开启了「夜行者权限」。',
        '再次开启「夜行者权限」' + B('权限|夜行者权限|夜里看得清', '称号|开启荒野称号已解锁|x'),
        '奖励已发放：荒野称号、积分20',
    ]);
});

// ---------- 阶段任务 ----------
test('阶段任务：生成新阶段时先结算旧阶段；「阶段N已达成」完成对应阶段；同名不重建', () => {
    const r = assertSame([
        '【主线任务阶段一已生成】任务要求：找到失落的钥匙。',
        '钥匙到手。支线任务阶段二生成，目标：把钥匙交给守门人。',
        '阶段二已完成。',
        '主线任务阶段一已生成（重复播报）',
        '任务阶段3已生成，需要：三天内凑够钱。阶段3已完成。',
    ]);
    assert.deepEqual(r.st.tasks.map((t) => [t.title, t.status]), [['主线任务·阶段一', 'done'], ['支线任务·阶段二', 'done'], ['主线任务·阶段3', 'done']]);
});

test('阶段任务：数据块里有 新任务| 时不按正文建阶段，但「阶段N已达成」照常完成', () => {
    assertSame([
        '任务阶段一已生成，要求：守住城门',
        '任务阶段二已生成，阶段一已达成' + B('新任务|类型:日常|标题:扫地|描述:d|条件:c|奖励:积分5'),
    ]);
});

test('阶段任务：反串时归属绑定角色；暂停中整楼不结算', () => {
    assertSame(['主线任务阶段一已生成，目标：拿下擂台'], { S: fillSettings({ enabled: true, bindTo: '林夏' }) });
    const ref = createRef(S0);
    ref.init({ ...createInitialState(), paused: true });
    const st = cloneForWrite({ ...createInitialState(), paused: true });
    const text = '主线任务阶段一已生成。【奖励已发放：夜行者权限已开启】';
    ref.settleFloorFull(1, text, null);
    applyFloor(st, makeEntry(null, text, 1), createCx({ turn: 1, s: S0 }));
    assert.deepEqual(pick(st), pick(ref.state));
    assert.equal(st.tasks.length + st.perks.length + st.rewardsLog.length, 0);
});

test('综合（悬浮窗挂载，原插件常态）：数值一致；已知差异 4：成就记录与正文阶段完成记录的先后不同', () => {
    const r = run([
        '系统发布任务「护送商队」。【任务奖励：积分200 疾风靴×1】' + B('新任务|类型:支线|标题:护送商队|描述:护送|条件:抵达|时限:3|对象:宿主'),
        '【主线任务阶段一已生成】任务要求：找到钥匙。已为你开启「夜行者权限」。',
        '阶段一已达成。【奖励已发放：积分200 疾风靴×1】' + B('完成|1'),
    ], { panel: true });
    const noLog = ({ log, ...rest }) => rest;
    r.perFloor.forEach((f, i) => {
        assert.deepEqual(noLog(f.core), noLog(f.ref), `第${i + 1}楼数值与原插件一致`);
        assert.deepEqual([...f.core.log.map((l) => l.text)].sort(), [...f.ref.log.map((l) => l.text)].sort(), `第${i + 1}楼记录条目相同`);
    });
    assert.deepEqual(r.events, r.refEvents);
    const t = (log) => log.map((l) => l.text);
    const last = r.perFloor[2];
    // 原插件 applyBlock 末尾就判成就，排在正文「阶段一已达成」之前；新核心楼末才判
    assert.ok(t(last.ref.log).indexOf('解锁成就「初出茅庐」　+50') < t(last.ref.log).indexOf('完成「主线任务·阶段一」'));
    assert.ok(t(last.core.log).indexOf('解锁成就「初出茅庐」　+50') > t(last.core.log).indexOf('完成「主线任务·阶段一」'));
});

// ---------- 已知差异（不改 src，只把差异钉住；差异被修掉后这些断言会失败，届时改成 assertSame） ----------
test('已知差异 1：数据块把积分推过 1000、正文余额又压回去时，原插件已在块末发了「腰缠万贯」，新核心按楼末积分判定不发', () => {
    const r = run(['当前积分：800' + B('积分|+1200|卖地')]);
    assert.equal(r.ref.state.points, 800);
    assert.ok(r.ref.state.achievements.some((a) => a.id === 'rich'), '原插件：成就已解锁（+50 被余额覆盖掉）');
    assert.equal(r.st.points, 800);
    assert.ok(!r.st.achievements.some((a) => a.id === 'rich'), '新核心：未解锁');
});

test('已知差异 2：到期与正文余额 / 正文阶段完成的先后（原插件悬浮窗挂载时在数据块之后立即判到期）', () => {
    const lim = (title) => B('新任务|类型:支线|标题:' + title + '|描述:d|条件:c|奖励:积分40|惩罚:积分-50|时限:1|对象:宿主');
    // a. 到期惩罚在原插件里被随后的正文余额覆盖
    const a = run(['开始' + lim('送信'), '当前积分：300' + B('播报|嗯')], { panel: true });
    assert.equal(a.ref.state.points, 300);
    assert.equal(a.st.points, 250);
    // b. 同一楼正文写「阶段1已达成」：原插件先判超时失败，新核心先完成
    const b = run(['开始' + lim('护送·阶段1'), '阶段1已达成' + B('播报|嗯')], { panel: true });
    assert.equal(b.ref.state.tasks[0].status, 'failed');
    assert.equal(b.st.tasks[0].status, 'done');
    // 悬浮窗未挂载时（到期只在生成提示词时判），两边一致
    assertSame(['开始' + lim('送信'), '当前积分：300' + B('播报|嗯')]);
});

test('已知差异 3：同一回合里楼层结算与手动操作的物品去重。原插件按回合去重（同回合再发同名物品被吞），新核心按每楼 / 每条操作去重', () => {
    const floors = [
        B('新任务|类型:日常|标题:甲|描述:d|条件:c|奖励:疾风靴×1', '新任务|类型:日常|标题:乙|描述:d|条件:c|奖励:疾风靴×1'),
        B('完成|1'),
    ];
    const r = run(floors);
    // 第 2 楼之后、第 3 楼之前，手动把任务乙标完成（原插件 action('done') → applyBlock('完成|2')）
    r.ref.setTurn(2);
    r.ref.applyBlock('完成|2');
    const st = cloneForWrite(r.st);
    applyManual(st, { type: 'completeTask', id: 2 }, createCx({ turn: 2, floor: 1, s: S0 }));
    assert.equal(r.ref.state.bag.find((b) => b.name === '疾风靴').count, 1, '原插件：第二双被同回合去重吞掉');
    assert.equal(st.bag.find((b) => b.name === '疾风靴').count, 2, '新核心：发两双');
});
