export const AUTO_PLAY_SPEEDS = Object.freeze({ fast: 1500, medium: 3000, slow: 5000 });

export function createReaderAutoPlay({ read, advance, sync = () => {}, timers = globalThis }) {
    let enabled = false;
    let speed = 'medium';
    let timer = null;
    let revision = 0;
    let page = null;
    let readyAt = null;
    const now = () => typeof timers.now === 'function' ? timers.now() : Date.now();
    const getState = () => ({ enabled, speed });
    const clear = () => {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
    };
    const stop = () => {
        enabled = false;
        revision += 1;
        clear();
        readyAt = null;
        sync(getState());
        return getState();
    };
    const schedule = (delay) => {
        clear();
        timer = timers.setTimeout(tick, delay);
        timer?.unref?.();
    };
    const tick = async () => {
        timer = null;
        if (!enabled) return;
        const status = read();
        if (!status || status.closed) return stop();
        if (status.page !== page) {
            page = status.page;
            readyAt = null;
        }
        if (status.blocked || status.busy) {
            readyAt = null;
            return schedule(200);
        }
        if (status.last) return stop();
        if (readyAt === null) readyAt = now();
        const remaining = AUTO_PLAY_SPEEDS[speed] - (now() - readyAt);
        if (remaining > 0) return schedule(Math.min(200, remaining));
        const token = revision;
        try {
            const result = await advance();
            if (!enabled || token !== revision) return;
            if (!result?.ok || (result.moved === false && result.reason !== 'chat-revealed')) return stop();
        } catch {
            if (token === revision) stop();
            return;
        }
        readyAt = null;
        schedule(0);
    };
    const refresh = () => {
        if (!enabled) return;
        page = null;
        readyAt = null;
        schedule(0);
    };
    return {
        getState,
        stop,
        refresh,
        toggle() {
            if (enabled) return stop();
            enabled = true;
            revision += 1;
            refresh();
            sync(getState());
            return getState();
        },
        setSpeed(value) {
            const next = Object.hasOwn(AUTO_PLAY_SPEEDS, value) ? value : 'medium';
            if (next === speed) return getState();
            speed = next;
            refresh();
            sync(getState());
            return getState();
        },
    };
}
