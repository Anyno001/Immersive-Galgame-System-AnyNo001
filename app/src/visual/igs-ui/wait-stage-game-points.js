const STALE = new Set(['request-stale', 'points-round-stale', 'points-floor-missing']);

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
        flight = Promise.resolve().then(task).then(result => { render(result); return result; }, () => {
            const result = { ok: false, reason: 'points-write-failed' };
            render(result);
            return result;
        }).finally(() => { flight = null; });
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
