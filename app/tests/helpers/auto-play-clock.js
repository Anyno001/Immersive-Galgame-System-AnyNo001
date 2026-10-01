export function createAutoPlayClock() {
    let clock = 0;
    let sequence = 0;
    const pending = new Map();
    return {
        now: () => clock,
        setTimeout(fn, delay) {
            const id = ++sequence;
            pending.set(id, { fn, at: clock + delay });
            return id;
        },
        clearTimeout(id) { pending.delete(id); },
        size: () => pending.size,
        async advance(ms) {
            const end = clock + ms;
            for (;;) {
                const due = [...pending.entries()].filter(([, task]) => task.at <= end)
                    .sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                clock = due[1].at;
                pending.delete(due[0]);
                await due[1].fn();
            }
            clock = end;
        },
    };
}
