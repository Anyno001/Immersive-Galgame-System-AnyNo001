const STALE = new Set(['request-stale', 'points-round-stale', 'points-floor-missing']);
const SLOW_MS = 5000;
const STAGE_TEXT = {
    'points-lock-busy': '排在卡牌战斗或随身系统的写入之后',
    'points-floor-saving': '等待酒馆保存聊天',
    'points-writing': '等待数据库表格写入',
};

export function beginWaitStagePoints(ctx, rounds) {
    let round;
    try { round = typeof rounds === 'function' ? rounds() : null; } catch { round = null; }
    let node;
    let text;
    let retry;
    let flight;
    const render = result => {
        if (!node || !ctx.board.contains(node)) return;
        retry.hidden = true;
        if (result?.skipped || STALE.has(result?.reason)) text.textContent = '本局不计积分：来源楼已失效或不存在';
        else if (result?.ok && result.settled) text.textContent = `积分核准 ${result.approved}，实发 ${result.amount}${result.limitReason ? '（奖励额度限制）' : ''}`;
        else if (result?.ok) text.textContent = '本局积分记录已恢复';
        else {
            text.textContent = `积分未入账：${result?.reason || 'points-write-failed'}`;
            retry.hidden = false;
        }
    };
    const submit = task => {
        if (flight) return flight;
        text.textContent = '积分结算中';
        retry.hidden = true;
        const started = Date.now();
        const timer = setInterval(() => {
            if (!node || !ctx.board.contains(node)) { clearInterval(timer); return; }
            if (Date.now() - started < SLOW_MS) return;
            let stage = '';
            try { stage = typeof round.stage === 'function' ? round.stage() : ''; } catch { stage = ''; }
            text.textContent = `积分结算中：${STAGE_TEXT[stage] || '等待数据库表格回应'}`;
        }, 1000);
        flight = Promise.resolve().then(task).then(result => { render(result); return result; }, () => {
            const result = { ok: false, reason: 'points-write-failed' };
            render(result);
            return result;
        }).finally(() => { clearInterval(timer); flight = null; });
        return flight;
    };
    return {
        finish(result) {
            if (!round) return Promise.resolve({ ok: true, skipped: true });
            if (!node) {
                node = ctx.doc.createElement('div');
                node.className = 'igs-ws-status igs-ws-points';
                node.setAttribute('aria-live', 'polite');
                text = ctx.doc.createElement('span');
                retry = ctx.doc.createElement('button');
                retry.type = 'button';
                retry.className = 'igs-ws-chip';
                retry.textContent = '重试入账';
                retry.hidden = true;
                retry.addEventListener('click', () => submit(() => round.retry()));
                node.appendChild(text);
                node.appendChild(retry);
                ctx.board.appendChild(node);
            }
            return submit(() => round.finish(result));
        },
    };
}
