// 统一混音总线：全阅读器只用一个 AudioContext。
// bgm / ambient / sfx / voice 四路子总线 → 压限器 → master（总音量）→ destination。
// BGM 目前仍是 HTMLAudio（外链 CORS），bgm 子总线留给以后本地音源；总音量对它按乘数生效。
export const AUDIO_BUS_NAMES = Object.freeze(['bgm', 'ambient', 'sfx', 'voice']);
export const AUDIO_MASTER_DEFAULTS = Object.freeze({ volume: 1 });
// 压限器只兜底极端叠加（暴雨 + 雷 + 连续提示音），平时不应被触发。
const COMPRESSOR = Object.freeze({ threshold: -10, knee: 6, ratio: 4, attack: 0.003, release: 0.25 });
const MASTER_TC_S = 0.05;
// 换场景时混响湿声跟环境音色调同速过渡。
const SPACE_TC_S = 0.4;
// 关闭阅读器后先让各模块淡出（scene-audio 用 300ms），再挂起。
const PARK_SUSPEND_MS = 400;

let bus = null;
let contextFactory = defaultContextFactory;
let masterVolume = AUDIO_MASTER_DEFAULTS.volume;

function defaultContextFactory() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Context ? new Context() : null;
}

export function normalizeAudioMasterSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const volume = Number(source.volume);
    return {
        volume: source.volume !== null && source.volume !== '' && Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : AUDIO_MASTER_DEFAULTS.volume,
    };
}

// 懒创建；环境不支持 WebAudio 时返回 null，各模块按原样静默。
export function getAudioBus() {
    if (bus && bus.ctx.state !== 'closed') return bus;
    bus = null;
    let ctx = null;
    try { ctx = contextFactory(); } catch { ctx = null; }
    if (!ctx) return null;
    try {
        const compressor = ctx.createDynamicsCompressor();
        for (const [key, value] of Object.entries(COMPRESSOR)) compressor[key].value = value;
        const master = ctx.createGain();
        master.gain.value = masterVolume;
        compressor.connect(master);
        master.connect(ctx.destination);
        const inputs = {};
        for (const name of AUDIO_BUS_NAMES) {
            inputs[name] = ctx.createGain();
            inputs[name].connect(compressor);
        }
        bus = { ctx, inputs, compressor, master, retry: null, visibility: null, parkTimer: null, space: null };
    } catch {
        return null;
    }
    watchVisibility(bus);
    return bus;
}

export function audioBusContext() {
    return getAudioBus()?.ctx || null;
}

// 未知名称归到 sfx；总线不可用时返回 null。
export function busInput(name) {
    const current = getAudioBus();
    if (!current) return null;
    return current.inputs[name] || current.inputs.sfx;
}

export function audioMasterVolume() {
    return masterVolume;
}

export function setAudioMasterVolume(value) {
    const volume = normalizeAudioMasterSettings({ volume: value }).volume;
    if (volume === masterVolume) return volume;
    masterVolume = volume;
    if (bus) {
        try { bus.master.gain.setTargetAtTime(volume, bus.ctx.currentTime, MASTER_TC_S); } catch { /* ignore */ }
    }
    return volume;
}

// 空间混响：voice、sfx 两路各送一份到同一个卷积器，湿声并入压限器。首次需要时才建。
// buffer 为 null 只把湿声收到 0，保留卷积器；总线不存在时关混响是空操作。
export function setAudioBusSpace(buffer, wet) {
    const current = buffer ? getAudioBus() : bus;
    if (!current) return false;
    const { ctx } = current;
    const level = buffer && Number.isFinite(wet) ? Math.max(0, Math.min(1, wet)) : 0;
    if (!current.space) {
        if (!level || typeof ctx.createConvolver !== 'function') return false;
        try {
            const convolver = ctx.createConvolver();
            const send = ctx.createGain();
            send.gain.value = 0;
            convolver.connect(send);
            send.connect(current.compressor);
            current.inputs.voice.connect(convolver);
            current.inputs.sfx.connect(convolver);
            current.space = { convolver, send, buffer: null };
        } catch {
            return false;
        }
    }
    const { space } = current;
    try {
        if (buffer && space.buffer !== buffer) {
            space.convolver.buffer = buffer;
            space.buffer = buffer;
        }
        space.send.gain.setTargetAtTime(level, ctx.currentTime, SPACE_TC_S);
    } catch { /* ignore */ }
    return true;
}

function documentOf() {
    const doc = globalThis.document;
    return doc && typeof doc.addEventListener === 'function' ? doc : null;
}

function disarmRetry(current) {
    if (!current.retry) return;
    const { doc, handler } = current.retry;
    current.retry = null;
    try { doc.removeEventListener('pointerdown', handler, true); } catch { /* ignore */ }
}

// 自动播放策略会拒绝无手势的 resume()，等下一次点击再试一次。
function armRetry(current) {
    const doc = documentOf();
    if (current.retry || !doc) return;
    const handler = () => {
        disarmRetry(current);
        if (bus === current && !current.hidden) resumeAudioBus({ retry: false });
    };
    current.retry = { doc, handler };
    doc.addEventListener('pointerdown', handler, true);
}

// 返回的 Promise 在 resume 结束后兑现为 context（是否 running 由调用方判断），不会 reject。
export function resumeAudioBus({ retry = true } = {}) {
    const current = getAudioBus();
    if (!current) return Promise.resolve(null);
    cancelParkedSuspend(current);
    const { ctx } = current;
    if (ctx.state === 'running' || current.hidden || typeof ctx.resume !== 'function') return Promise.resolve(ctx);
    let pending;
    try { pending = Promise.resolve(ctx.resume()); } catch { pending = Promise.reject(); }
    return pending.then(() => {
        if (retry && ctx.state !== 'running') armRetry(current);
        return ctx;
    }, () => {
        if (retry) armRetry(current);
        return ctx;
    });
}

function watchVisibility(current) {
    const doc = documentOf();
    if (!doc) return;
    current.hidden = doc.hidden === true;
    const handler = () => {
        const hidden = doc.hidden === true;
        if (hidden === current.hidden) return;
        current.hidden = hidden;
        if (hidden) {
            // 当场挂起：iOS 与部分安卓 WebView 切后台后 JS 立即冻结，延时挂起不会执行。
            if (typeof current.ctx.suspend !== 'function') return;
            try { Promise.resolve(current.ctx.suspend()).catch(() => {}); } catch { /* ignore */ }
            return;
        }
        // 可见即恢复，不以是否有环境音为条件，否则打字音与提示音会一直静音。
        resumeAudioBus();
    };
    current.visibility = { doc, handler };
    doc.addEventListener('visibilitychange', handler);
}

function cancelParkedSuspend(current) {
    clearTimeout(current.parkTimer);
    current.parkTimer = null;
}

// 关闭阅读器后挂起 context，省掉空转的音频线程；先等各模块淡出。
// 下一次 resumeAudioBus（打字音、提示音起播前都会调）即恢复；环境音自己 resume，重开阅读器时先 unparkAudioBus 取消未到点的挂起。
export function parkAudioBus() {
    const current = bus;
    if (!current || typeof current.ctx.suspend !== 'function') return false;
    cancelParkedSuspend(current);
    current.parkTimer = setTimeout(() => {
        current.parkTimer = null;
        if (bus !== current) return;
        try { Promise.resolve(current.ctx.suspend()).catch(() => {}); } catch { /* ignore */ }
    }, PARK_SUSPEND_MS);
    return true;
}

export function unparkAudioBus() {
    if (bus) cancelParkedSuspend(bus);
}

// 仅供测试：替换 context 工厂并丢弃现有总线。
export function resetAudioBusForTest(factory) {
    if (bus) {
        disarmRetry(bus);
        clearTimeout(bus.parkTimer);
        if (bus.visibility) {
            try { bus.visibility.doc.removeEventListener('visibilitychange', bus.visibility.handler); } catch { /* ignore */ }
        }
    }
    bus = null;
    masterVolume = AUDIO_MASTER_DEFAULTS.volume;
    contextFactory = typeof factory === 'function' ? factory : defaultContextFactory;
}
