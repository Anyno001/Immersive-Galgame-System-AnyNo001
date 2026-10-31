import test from 'node:test';
import assert from 'node:assert/strict';
import { createRef } from './origin-ref.js';
import { extractBlock, parseBlock, splitBlock, splitReplyBlock } from '../src/scene/origin/origin-parse.js';
import { checkAchievements, checkExpiry, createCx } from '../src/scene/origin/origin-apply.js';
import { applyFloor } from '../src/scene/origin/origin-prose.js';
import { makeEntry } from '../src/scene/origin/origin-ledger.js';
import { cloneForWrite, createInitialState, fillSettings, seededRandom } from '../src/scene/origin/origin-state.js';

const S = fillSettings({ enabled: true });
const KEYS = ['points', 'level', 'exp', 'expMax', 'stats', 'tasks', 'bag', 'shop', 'gachaPool', 'achievements', 'skills', 'perks', 'rewardsLog', 'log', 'chat', 'lastTaskTurn', 'lastShopTurn', 'lastGachaTurn', 'nextId'];
// 新核心给记录加了 floor 字段，对照时去掉
const plain = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'floor' ? undefined : v)));
const pick = (st) => plain(Object.fromEntries(KEYS.map((k) => [k, st[k]])));

// 用同一串「楼」分别跑原插件与新核心，每楼比对完整状态与待发事件
function runBoth(floors, opts = {}) {
    let rnd = seededRandom(1);
    const ref = createRef(S, () => rnd());
    ref.init(createInitialState());
    let st = cloneForWrite(createInitialState());
    const events = [];
    floors.forEach((raw, i) => {
        const turn = i + 1;
        rnd = seededRandom(7 + i);
        const ex = ref.extractBlock(raw);
        const block = ex ? ex.memo.trim() : null;
        const text = ex ? (raw.slice(0, ex.start) + raw.slice(ex.end)).trimEnd() : raw;
        ref.settleFloor(turn, text, block, null);
        ref.checkAchievements(); // 原插件在下一次 buildInjection 开头补判成就；新核心在楼末判，对提示词等价
        const cx = createCx({ turn, floor: i, s: S, random: seededRandom(7 + i) });
        const sp = splitBlock(raw);
        assert.equal(sp.block, block, `第${turn}楼提块一致`);
        assert.equal(sp.text, text, `第${turn}楼剪掉块后的正文一致`);
        st = cloneForWrite(st);
        applyFloor(st, makeEntry(sp.block, sp.text, 7 + i), cx);
        checkExpiry(st, cx);
        checkAchievements(st, cx);
        events.push(...cx.events);
        assert.deepEqual(pick(st), pick(ref.state), `第${turn}楼状态与原插件一致`);
    });
    assert.deepEqual(events, ref.state.pendingEvent || [], '待发事件与原插件一致');
    return { st, ref: ref.state };
}

const FLOORS = [
    // 1 标准块 + 别名行 + 编号/项目符号
    '雨夜里她递来一把伞。\n<origin>\n新任务|类型:主线|标题:带她回家|描述:送她到家门口|条件:抵达|奖励:积分300 魅力+2|惩罚:积分-50|时限:|对象:宿主\n- 积分|+10|开场红包\n1. 属性|胆识|+1\n播报|欢迎来到这个世界\n</origin>',
    // 2 别名：[主线#1] 完成 / 发布 / 奖励 / 获取 / 标题|id|百分比写反
    '路上闲聊几句。\n<origin>\n发布|拾荒者委托|日常|捡三个瓶子\n奖励|积分+20|拾荒酬劳\n获取|铁剑×2\n拾荒者委托|2|40%|已经捡了一个\n</origin>',
    // 3 数据块写「无」
    '一夜无事。\n<origin>无</origin>',
    // 4 代码围栏 + 完成 + 技能奖励（带 积分+权限）
    '她终于到家。\n```origin\n进度|1|100|送到了\n获得|干粮|3|路上吃\n技能|夜视|黑暗中也能看清\n权限|夜间通行|可在宵禁后出入\n```',
    // 5 思维链里提到 <origin>，真块在最后；含块内余额行
    '<thinking>等下要输出 <origin> 数据块</thinking>天亮了。\n<origin>\n积分：400\n用道具|干粮|1\n成就|黎明|看见了第一缕光\n</origin>',
    // 6 积分涨到 1000+（触发成就）、买、抽奖、新商品、新奖品、时限、失败、私聊
    '集市里很热闹。\n<origin>\n积分|+900|卖掉旧物\n新商品|急救包|120|止血|生命+5\n买|急救包\n抽奖\n时限|2|5\n失败|2\n私聊|系统|别乱花钱\n新奖品|金币袋|R|30|一袋金币|积分+100\n新奖品|传说之剑|UR|1|传说|\n</origin>',
    // 7 只有正文、没有数据块：靠正文兜底（余额、获得×N、技能）
    '店主结算：奖励已发放，获得 回复药水×2。积分余额：1200。你获得技能「铁壁」。技能说明：受伤减半。',
    // 8 块里没写积分但正文扣了积分
    '被罚款，扣除积分 30。\n<origin>\n播报|已罚款\n</origin>',
];

test('黄金样本：8 楼链路的结算结果与原插件逐楼一致（别名、编号、围栏、思维链、余额行、抽奖、成就）', () => {
    const { st } = runBoth(FLOORS);
    assert.ok(st.tasks.length >= 2 && st.skills.some((k) => k.name === '夜视'));
    assert.ok(st.achievements.some((a) => a.id === 'first'));
});

test('提块：思维链里的 <origin> 不算；代码围栏；未闭合；过长未闭合不剪；多块取最后一个', () => {
    const cases = [
        '<thinking>写 <origin> 吧</thinking>正文\n<origin>\n积分|+1|x\n</origin>',
        '正文\n```origin\n积分|+2|y\n```\n',
        '正文\n<origin>\n积分|+3|z',
        '正文\n<origin>\n' + '很长的一段'.repeat(400),
        '<origin>\n积分|+1|a\n</origin>中间<origin>\n积分|+9|b\n</origin>',
        '<数据板>\n进度|1|50|x\n</数据板>',
        '没有块的正文',
        '',
    ];
    const ref = createRef(S);
    for (const c of cases) assert.deepEqual(extractBlock(c), ref.extractBlock(c), c.slice(0, 20));
    assert.equal(splitBlock('甲\n<origin>无</origin>').block, '无');
    assert.equal(splitBlock('甲\n<origin>无</origin>').text, '甲');
    assert.equal(splitBlock('没有块').block, null);
});

test('逐行解析：别名与容错写法产出对应操作', () => {
    const r = parseBlock('[支线#3]|完成\n购买|短剑\n消耗|药水|2\n特权|VIP|永久\n积分：80\n系统：说明\n无\n发布|找猫|主线|在巷子里');
    const kinds = r.ops.map((o) => o.k);
    assert.deepEqual(kinds, ['done', 'buy', 'use', 'perk', 'newTask', 'balance']);
    assert.equal(r.balance, 80);
    const nt = r.ops.find((o) => o.k === 'newTask');
    assert.equal(nt.title, '找猫');
    assert.equal(nt.ty, '主线');
    const alt = parseBlock('跑腿|3|50%').ops[0];
    assert.equal(alt.k, 'progress');
    assert.equal(alt.alt, '跑腿');
    const inl = parseBlock('获得|药水×3').ops[0];
    assert.equal(inl.inline, true);
    assert.equal(inl.count, '3');
    assert.equal(parseBlock('新任务|主线|只写位置|描述1|条件1|奖励1|惩罚1|7').ops[0].limit, 7);
});

test('系统对话回复里的数据块可不闭合；<thinking> 被剪掉；「系统：」前缀被去掉', () => {
    const r = splitReplyBlock('<thinking>想想</thinking>系统：好吧给你。\n<origin>\n积分|+5|奖励');
    assert.equal(r.text, '好吧给你。');
    assert.equal(r.block, '积分|+5|奖励');
});
