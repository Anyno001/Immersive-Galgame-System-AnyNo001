// 随身系统悬浮窗的操作：把界面上的 data-oa 动作翻译成 engine.dispatch / 生成请求。
// 原插件的 prompt() / confirm() 全部换成 IGS 页内弹窗（igs-modal：prompt 返回 string|null，confirm 返回 boolean）。
// dispatch 的参数形状集中在 OP 里，与核心 origin-apply.js 的 applyManual 一致：字段平铺，任务类型字段名 taskType，
// 列表项可传下标（核心按下标取名字入账），设世界 / 方向用 value，清空对话为 chatClear。

export const TASK_TYPES = Object.freeze(['主线', '支线', '日常']);

export const OP = Object.freeze({
    buy: (index) => ({ type: 'buy', index }),
    use: (index) => ({ type: 'use', index }),
    draw: () => ({ type: 'draw' }),
    addTask: (task) => ({ type: 'addTask', ...task }),
    editTask: (id, patch) => ({ type: 'editTask', id, patch }),
    completeTask: (id) => ({ type: 'completeTask', id }),
    deleteTask: (id) => ({ type: 'deleteTask', id }),
    addItem: (item) => ({ type: 'addItem', ...item }),
    deleteItem: (index) => ({ type: 'deleteItem', index }),
    addShop: (item) => ({ type: 'addShop', ...item }),
    deleteShop: (index) => ({ type: 'deleteShop', index }),
    addGacha: (item) => ({ type: 'addGacha', ...item }),
    deleteGacha: (index) => ({ type: 'deleteGacha', index }),
    addStat: (stat) => ({ type: 'addStat', ...stat }),
    deleteStat: (index) => ({ type: 'deleteStat', index }),
    addSkill: (skill) => ({ type: 'addSkill', ...skill }),
    deleteSkill: (index) => ({ type: 'deleteSkill', index }),
    addPerk: (perk) => ({ type: 'addPerk', ...perk }),
    deletePerk: (index) => ({ type: 'deletePerk', index }),
    setWorld: (value) => ({ type: 'setWorld', value }),
    setDirection: (value) => ({ type: 'setDirection', value }),
    pause: () => ({ type: 'pause' }),
    resume: () => ({ type: 'resume' }),
    chatClear: () => ({ type: 'chatClear' }),
});

// 核心失败时多半自带 text（例如「积分不够购买「观星镜」（需1500，现有940）」），优先用它；没有 text 时按原因码兜底。
const REASON_TEXT = Object.freeze({
    'no-points': '积分不够。',
    'no-item': '该项已不存在。',
    'no-target': '该项已不存在。',
    'no-task': '该任务已不存在。',
    'empty-pool': '奖池为空。',
    busy: '上一项请求仍在处理，请稍后再试。',
    paused: '系统已暂停。',
    disabled: '随身系统未开启。',
    'no-result': '没有生成出结果，请重试或手动添加。',
});

const intOr = (value, fallback) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};
const trim = (value) => String(value == null ? '' : value).trim();

// ctx：{ engine, settings, modal, notice(level,text), setTab(id), openPage(id), back(), toggleMenu(), closeMenu(), toggleRow(key), openSettings(), close(), saveSetting(key,value), readChatInput(), clearChatInput() }
// 「修改世界」在设置页（runOriginWorldEdit），不在窗口里。
export async function runOriginAction(name, el, ctx) {
    const { engine, modal } = ctx;
    const state = engine.getState();
    const id = el && el.getAttribute ? el.getAttribute('data-id') : '';
    const index = el && el.getAttribute ? Number.parseInt(el.getAttribute('data-i'), 10) : -1;
    const ask = (message, value = '') => modal.prompt(message, value);
    const report = (result) => {
        if (result && result.ok === false && result.reason && !result.cancelled) {
            const text = (typeof result.text === 'string' && result.text.trim()) || REASON_TEXT[result.reason];
            if (text) ctx.notice('warn', text);
        }
        return result;
    };
    const dispatch = (op) => report(engine.dispatch(op));
    const generate = async (fn) => report(await fn.call(engine));

    switch (name) {
    case 'tab': ctx.setTab(id); return { ok: true };
    case 'close': ctx.close(); return { ok: true };
    case 'settings': ctx.openSettings(); return { ok: true };
    case 'menu': ctx.toggleMenu(); return { ok: true };
    case 'page': ctx.openPage(id); return { ok: true };
    case 'back': ctx.back(); return { ok: true };
    case 'row': ctx.toggleRow(id); return { ok: true };
    case 'dd-toggle': ctx.toggleDropdown(el.getAttribute('data-kind')); return { ok: true };
    case 'dd-pick': ctx.pickFilter(el.getAttribute('data-kind'), id); return { ok: true };
    case 'pause': ctx.closeMenu(); return dispatch(state.paused ? OP.resume() : OP.pause());

    case 'world': {
        const world = await ask('世界名或简述', state.world || '');
        return world === null ? { ok: true, cancelled: true } : dispatch(OP.setWorld(trim(world)));
    }

    case 'task-gen': return generate(engine.genTask);
    case 'task-add': {
        const title = trim(await ask('任务标题'));
        if (!title) return { ok: true, cancelled: true };
        const typeRaw = trim(await ask('类型：主线、支线或日常', '支线'));
        const desc = trim(await ask('一句描述'));
        const cond = trim(await ask('完成条件'));
        const reward = trim(await ask('奖励，例如：积分300 魅力+2'));
        const penalty = trim(await ask('失败惩罚（可空）'));
        const limit = Math.max(0, intOr(await ask('时限：几回合内完成，0为不限', '0'), 0));
        const owner = trim(await ask('对象：宿主或某个角色名', '宿主')) || '宿主';
        ctx.setTab('task');
        return dispatch(OP.addTask({ taskType: TASK_TYPES.includes(typeRaw) ? typeRaw : '支线', owner, title, desc, cond, reward, penalty, limit }));
    }
    case 'task-edit': {
        const task = (state.tasks || []).find((t) => String(t.id) === String(id));
        if (!task) return { ok: false, reason: 'no-item' };
        const patch = {};
        let v = await ask('标题', task.title);
        if (v === null) return { ok: true, cancelled: true };
        if (trim(v)) patch.title = trim(v);
        v = await ask('类型：主线、支线或日常', task.type);
        if (v !== null && TASK_TYPES.includes(trim(v))) patch.taskType = trim(v);
        v = await ask('描述', task.desc || '');
        if (v !== null) patch.desc = v;
        v = await ask('完成条件', task.cond || '');
        if (v !== null) patch.cond = v;
        v = await ask('奖励，例如：积分300 魅力+2', task.reward || '');
        if (v !== null) patch.reward = v;
        v = await ask('失败惩罚（可空）', task.penalty || '');
        if (v !== null) patch.penalty = v;
        v = await ask('对象：宿主或某个角色名', task.owner || '宿主');
        if (v !== null && trim(v)) patch.owner = trim(v);
        v = await ask('时限：几回合内完成，0为不限', String(task.limit || 0));
        if (v !== null && Number.isFinite(Number.parseInt(v, 10))) patch.limit = Math.max(0, Number.parseInt(v, 10));
        v = await ask('进度（0–100）', String(task.progress || 0));
        if (v !== null && Number.isFinite(Number.parseInt(v, 10))) patch.progress = Math.max(0, Math.min(100, Number.parseInt(v, 10)));
        return dispatch(OP.editTask(task.id, patch));
    }
    case 'task-done': {
        const task = (state.tasks || []).find((t) => String(t.id) === String(id));
        if (!task || task.status !== 'active') return { ok: false, reason: 'no-item' };
        return (await modal.confirm(`把「${task.title}」标记为完成并发放奖励？`)) ? dispatch(OP.completeTask(task.id)) : { ok: true, cancelled: true };
    }
    case 'task-del': {
        const task = (state.tasks || []).find((t) => String(t.id) === String(id));
        if (!task) return { ok: false, reason: 'no-item' };
        return (await modal.confirm(`删除任务「${task.title}」？`)) ? dispatch(OP.deleteTask(task.id)) : { ok: true, cancelled: true };
    }
    case 'task-direction': {
        const direction = await ask('下一个任务的大致方向，例如：一个复仇任务、让他吃醋', state.direction || '');
        if (direction === null) return { ok: true, cancelled: true };
        // 原插件同时把任务来源切到「按我给的方向」：核心 setDirection 已写设置并 saveSettings，这里再经 saveSetting 同步设置器草稿。
        const result = dispatch(OP.setDirection(trim(direction)));
        if (result && result.ok) {
            ctx.saveSetting('taskSource', 'direction');
            ctx.notice('info', '方向已记下，下次派发任务时采用。');
        }
        return result;
    }

    case 'stat-add': {
        const name2 = trim(await ask('属性名，例如：魅力、体魄、好感'));
        if (!name2) return { ok: true, cancelled: true };
        const val = intOr(await ask('初始值', '0'), 0);
        return dispatch(OP.addStat({ name: name2, val }));
    }
    case 'stat-del': return dispatch(OP.deleteStat(index));
    case 'skill-add': {
        const name2 = trim(await ask('技能名'));
        if (!name2) return { ok: true, cancelled: true };
        return dispatch(OP.addSkill({ name: name2, desc: trim(await ask('一句说明（可空）')) }));
    }
    case 'skill-del': {
        const item = (state.skills || [])[index];
        if (!item) return { ok: false, reason: 'no-item' };
        return (await modal.confirm(`删除技能「${item.name}」？`)) ? dispatch(OP.deleteSkill(index)) : { ok: true, cancelled: true };
    }
    case 'perk-add': {
        const name2 = trim(await ask('权限或称号名'));
        if (!name2) return { ok: true, cancelled: true };
        return dispatch(OP.addPerk({ name: name2, desc: trim(await ask('一句说明（可空）')) }));
    }
    case 'perk-del': {
        const item = (state.perks || [])[index];
        if (!item) return { ok: false, reason: 'no-item' };
        return (await modal.confirm(`删除「${item.name}」？`)) ? dispatch(OP.deletePerk(index)) : { ok: true, cancelled: true };
    }

    case 'bag-use': return dispatch(OP.use(index));
    case 'bag-del': return dispatch(OP.deleteItem(index));
    case 'bag-add': {
        const name2 = trim(await ask('物品名'));
        if (!name2) return { ok: true, cancelled: true };
        const count = Math.max(1, intOr(await ask('数量', '1'), 1));
        return dispatch(OP.addItem({ name: name2, count, desc: trim(await ask('说明（可空）')), effect: '' }));
    }

    case 'shop-gen': return generate(engine.genShop);
    case 'shop-buy': return dispatch(OP.buy(index));
    case 'shop-del': return dispatch(OP.deleteShop(index));
    case 'shop-add': {
        const name2 = trim(await ask('商品名'));
        if (!name2) return { ok: true, cancelled: true };
        const price = Math.max(0, intOr(await ask('价格，单位积分', '300'), 300));
        const desc = trim(await ask('说明'));
        const effect = trim(await ask('数值效果（可空），例如：魅力+10、好感+20'));
        return dispatch(OP.addShop({ name: name2, price, desc, effect }));
    }

    case 'gacha-draw': return dispatch(OP.draw());
    case 'gacha-gen': return generate(engine.genGacha);
    case 'gacha-del': return dispatch(OP.deleteGacha(index));
    case 'gacha-add': {
        const name2 = trim(await ask('奖品名'));
        if (!name2) return { ok: true, cancelled: true };
        const tier = trim(await ask('稀有度：N、R、SR、SSR或UR', 'R')) || 'R';
        const weight = Math.max(1, intOr(await ask('权重，越大越常出', '20'), 20));
        const desc = trim(await ask('说明'));
        const effect = trim(await ask('数值效果（可空），例如：积分+200、好感+30'));
        return dispatch(OP.addGacha({ name: name2, tier, weight, desc, effect }));
    }

    case 'chat-send': {
        const text = trim(ctx.readChatInput());
        if (!text) return { ok: true, cancelled: true };
        ctx.clearChatInput();
        return report(await engine.sysChat(text));
    }
    case 'chat-call': {
        const text = trim(ctx.readChatInput());
        if (!text) return { ok: true, cancelled: true };
        ctx.clearChatInput();
        return report(await engine.rpChatCall(text));
    }
    case 'chat-gen': return generate(engine.rpChatGen);
    case 'chat-clear': ctx.closeMenu(); return (await modal.confirm('清空本存档的对话记录？')) ? dispatch(OP.chatClear()) : { ok: true, cancelled: true };
    case 'legacy-import': {
        const result = report(await engine.importLegacy());
        if (result && result.ok) ctx.notice('info', `旧存档已导入，共${result.floors || 0}楼，原数据保留。`);
        return result;
    }
    case 'legacy-dismiss': return report(typeof engine.dismissLegacy === 'function' ? engine.dismissLegacy() : { ok: true });
    default: return { ok: false, reason: 'origin-action-unknown' };
    }
}
