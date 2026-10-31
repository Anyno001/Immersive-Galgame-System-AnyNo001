// 随身系统界面开发用的假引擎：接口与 app/src/scene/origin/origin-engine.js 的 createOriginEngine 返回值一致
// （getState / subscribe / dispatch / genTask 等），数据是写死的样例，只在内存里变，不读写任何存储。
// 正式接线见 origin-attach.js 的 attachOriginEngine(engine, hooks)；本文件只给测试与预览页用，不进正式路径。

export function sampleOriginState() {
    return {
        turn: 8,
        points: 1240,
        level: 3,
        exp: 62,
        expMax: 100,
        world: '修仙界·青云宗外门',
        direction: '',
        paused: false,
        stats: [
            { name: '魅力', val: 12, floor: 3 },
            { name: '体魄', val: 8, floor: 5 },
            { name: '悟性', val: 15, floor: 5 },
        ],
        tasks: [
            { id: 1, type: '主线', owner: '宿主', title: '拜入青云宗', desc: '通过外门考核，取得入门令牌。', cond: '取得入门令牌', reward: '积分300 悟性+2', penalty: '积分-100', limit: 8, startTurn: 2, progress: 60, status: 'active', turn: 2, floor: 2 },
            { id: 2, type: '支线', owner: '林晚', title: '替师姐取回丹药', desc: '丹房的人说药已经备好，需要有人去取。', cond: '把丹药交到林晚手上', reward: '好感+10', penalty: '', limit: 0, startTurn: 4, progress: 20, status: 'active', turn: 4, floor: 6 },
            { id: 3, type: '日常', owner: '宿主', title: '清晨吐纳一刻', desc: '', cond: '', reward: '经验+10', penalty: '', limit: 3, startTurn: 6, progress: 0, status: 'active', turn: 6, floor: 8 },
        ],
        bag: [
            { name: '回气丹', count: 2, desc: '服下后恢复少许灵力。', effect: '体魄+1', floor: 5 },
            { name: '抽奖券', count: 1, desc: '可以抽一次奖。', effect: '', floor: 7 },
        ],
        shop: [
            { name: '聚灵符', price: 300, desc: '贴身携带，修炼速度略有提升。', effect: '悟性+1', floor: 1 },
            { name: '易容面具', price: 800, desc: '短时间内改变面貌。', effect: '', floor: 1 },
            { name: '观星镜', price: 1500, desc: '能看见一些不该看见的东西。', effect: '魅力+3', floor: 1 },
        ],
        gachaPool: [
            { name: '凡品灵石', tier: 'N', weight: 50, desc: '最常见的灵石。', effect: '积分+50', floor: 1 },
            { name: '百炼飞剑', tier: 'SR', weight: 8, desc: '外门弟子梦寐以求的佩剑。', effect: '', floor: 1 },
            { name: '天命道果', tier: 'UR', weight: 1, desc: '传说中的机缘。', effect: '技能', floor: 1 },
        ],
        achievements: [
            { id: 'first', name: '初入山门', desc: '完成第一个任务', floor: 4 },
        ],
        skills: [
            { name: '御风诀', desc: '短距离内可以悬空。', floor: 5 },
        ],
        perks: [
            { kind: '权限', name: '藏经阁外层通行', desc: '可以进入藏经阁外层。', floor: 5 },
        ],
        rewardsLog: [
            { turn: 4, kind: '积分', text: '任务奖励：积分300', floor: 4 },
            { turn: 5, kind: '物品', text: '获得 回气丹×2', floor: 5 },
        ],
        log: [
            { mark: '·', text: '系统已启动', floor: 1 },
            { mark: '★', text: '解锁成就「初入山门」', floor: 4 },
            { mark: '·', text: '购买「聚灵符」(-300)', floor: 5 },
        ],
        chat: [
            { who: 'me', text: '这个世界有多危险？', turn: 6 },
            { who: 'sys', text: '比你想的要危险。先把令牌拿到手。', note: '', turn: 6 },
            { who: 'me', text: '给点提示。', turn: 7 },
            { who: 'sys', text: '考核在后山，别走正门。', note: '任务「拜入青云宗」进度 60%', turn: 7 },
        ],
    };
}

// 假引擎：dispatch 只做最简单的状态变化，足够截图与交互演示。
export function createStubOriginEngine(initial = sampleOriginState()) {
    let state = initial;
    const listeners = new Set();
    let nextId = 10;
    const emit = (change) => { for (const fn of listeners) fn(state, change); };
    const push = (type, patch) => { state = { ...state, ...patch }; emit({ type, source: 'ui' }); return { ok: true }; };
    // 平铺的 op 去掉 type 即为新条目的字段（与核心 applyManual 的写法一致）。
    const fields = ({ type, ...rest }) => rest;
    const engine = {
        getState: () => state,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        dispatch(op) {
            const o = op || {};
            switch (o.type) {
            case 'buy': {
                const item = state.shop[o.index];
                if (!item) return { ok: false, reason: 'no-target', text: '没有找到要操作的对象' };
                if (state.points < item.price) return { ok: false, reason: 'no-points', text: `积分不够购买「${item.name}」（需${item.price}，现有${state.points}）` };
                const bag = state.bag.slice();
                const hit = bag.findIndex((b) => b.name === item.name);
                if (hit >= 0) bag[hit] = { ...bag[hit], count: (bag[hit].count || 1) + 1 };
                else bag.push({ name: item.name, count: 1, desc: item.desc, effect: item.effect, floor: 9 });
                return push('buy', { points: state.points - item.price, bag });
            }
            case 'use': {
                const bag = state.bag.slice();
                const item = bag[o.index];
                if (!item) return { ok: false, reason: 'no-target', text: '没有找到要操作的对象' };
                if ((item.count || 1) > 1) bag[o.index] = { ...item, count: item.count - 1 };
                else bag.splice(o.index, 1);
                return push('use', { bag });
            }
            case 'draw': {
                if (state.points < 300) return { ok: false, reason: 'no-points', text: '积分不够（需300）' };
                return push('draw', { points: state.points - 300 });
            }
            case 'addTask': {
                const { type, taskType, ...rest } = o;
                return push('addTask', { tasks: state.tasks.concat({ ...rest, id: nextId++, type: taskType || '支线', status: 'active', progress: 0, floor: 9 }) });
            }
            case 'editTask': {
                const { taskType, ...patch } = o.patch || {};
                return push('editTask', { tasks: state.tasks.map((t) => (String(t.id) === String(o.id) ? { ...t, ...patch, ...(taskType ? { type: taskType } : {}) } : t)) });
            }
            case 'completeTask': return push('completeTask', { tasks: state.tasks.map((t) => (String(t.id) === String(o.id) ? { ...t, status: 'done', progress: 100 } : t)) });
            case 'deleteTask': return push('deleteTask', { tasks: state.tasks.filter((t) => String(t.id) !== String(o.id)) });
            case 'addItem': return push('addItem', { bag: state.bag.concat({ floor: 9, ...fields(o) }) });
            case 'deleteItem': return push('deleteItem', { bag: state.bag.filter((_, i) => i !== o.index) });
            case 'addShop': return push('addShop', { shop: state.shop.concat({ floor: 9, ...fields(o) }) });
            case 'deleteShop': return push('deleteShop', { shop: state.shop.filter((_, i) => i !== o.index) });
            case 'addGacha': return push('addGacha', { gachaPool: state.gachaPool.concat({ floor: 9, ...fields(o) }) });
            case 'deleteGacha': return push('deleteGacha', { gachaPool: state.gachaPool.filter((_, i) => i !== o.index) });
            case 'addStat': return push('addStat', { stats: state.stats.concat({ floor: 9, ...fields(o) }) });
            case 'deleteStat': return push('deleteStat', { stats: state.stats.filter((_, i) => i !== o.index) });
            case 'addSkill': return push('addSkill', { skills: state.skills.concat({ floor: 9, ...fields(o) }) });
            case 'deleteSkill': return push('deleteSkill', { skills: state.skills.filter((_, i) => i !== o.index) });
            case 'addPerk': return push('addPerk', { perks: state.perks.concat({ kind: '权限', floor: 9, ...fields(o) }) });
            case 'deletePerk': return push('deletePerk', { perks: state.perks.filter((_, i) => i !== o.index) });
            case 'setWorld': return push('setWorld', { world: String(o.value || '') });
            case 'setDirection': return push('setDirection', { direction: String(o.value || '') });
            case 'pause': return push('pause', { paused: true });
            case 'resume': return push('resume', { paused: false });
            case 'chatClear': return push('chatClear', { chat: [] });
            case 'reset': return push('reset', { ...sampleOriginState(), tasks: [], bag: [], log: [], chat: [], points: 0, level: 1, exp: 0 });
            default: return { ok: false, reason: 'unknown-op' };
            }
        },
        genTask: async () => { engine.dispatch({ type: 'addTask', taskType: '支线', owner: '宿主', title: '（样例）系统派发的任务', desc: '', reward: '积分100', penalty: '', limit: 5 }); return { ok: true }; },
        genShop: async () => ({ ok: true }),
        genGacha: async () => ({ ok: true }),
        sysChat: async (text) => {
            state = { ...state, chat: state.chat.concat({ who: 'me', text, turn: 8 }, { who: 'sys', text: '（样例回复）收到。', note: '', turn: 8 }) };
            emit({ type: 'chat', source: 'ui' });
            return { ok: true };
        },
        rpChatGen: async () => ({ ok: true }),
        rpChatCall: async (text) => {
            state = { ...state, chat: state.chat.concat({ who: 'call', text, turn: 8 }) };
            emit({ type: 'chat', source: 'ui' });
            return { ok: true };
        },
        recalcAll: async () => ({ ok: true }),
        importLegacy: async () => ({ ok: true }),
        legacyDetected: () => false,
        dismissLegacy: () => ({ ok: true }),
        isBlocked: () => null,
        lastFloorStatus: () => ({ has: true, lines: 4, wroteNone: false }),
        // 样例专用：模拟引擎因收到新楼而变化（红点演示）。
        // kind = 'load' 模拟切聊天（核心重新加载时发 { type: 'load' }）。
        simulateEvent(kind = 'task-new', text = '新任务：测试') {
            state = { ...state, log: state.log.concat({ mark: '·', text, floor: 10 }) };
            emit(kind === 'load' ? { type: 'load' } : { type: 'floor', source: 'engine', kind, text });
        },
    };
    return engine;
}
