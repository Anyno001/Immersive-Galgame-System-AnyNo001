// 生图排查日志：自动插图 / 素材补全每一步的进度与失败原因，持久化到 localStorage，
// 按「保留天数」「最多条数」自动清理，也可在设置里手动清空。
export const IMAGE_JOB_LOG_STORAGE_KEY = 'igs_image_job_log';
export const IMAGE_JOB_LOG_LEVELS = Object.freeze(['info', 'success', 'warn', 'error']);
export const DEFAULT_IMAGE_JOB_LOG_SETTINGS = Object.freeze({ retainDays: 3, maxEntries: 300 });

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 600;

const clampInt = (v, min, max, d) => {
    const n = Math.round(Number(v));
    return v == null || v === '' || !Number.isFinite(n) ? d : Math.min(max, Math.max(min, n));
};

// retainDays 为 0 表示不按时间清理，只按条数封顶。
export function normalizeImageJobLogSettings(value) {
    const src = value && typeof value === 'object' ? value : {};
    return {
        retainDays: clampInt(src.retainDays, 0, 30, DEFAULT_IMAGE_JOB_LOG_SETTINGS.retainDays),
        maxEntries: clampInt(src.maxEntries, 50, 1000, DEFAULT_IMAGE_JOB_LOG_SETTINGS.maxEntries),
    };
}

function isEntry(item) {
    return item && typeof item === 'object' && typeof item.message === 'string' && Number.isFinite(Number(item.at));
}

export function createImageJobLog(deps = {}) {
    const storage = deps.storage || null;
    const now = deps.now || (() => Date.now());
    const getSettings = deps.getSettings || (() => null);
    const listeners = new Set();
    let entries = load();
    let seq = entries.reduce((max, e) => Math.max(max, Number(e.id) || 0), 0);

    function load() {
        if (!storage || typeof storage.getItem !== 'function') return [];
        try {
            const parsed = JSON.parse(storage.getItem(IMAGE_JOB_LOG_STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
        } catch (error) {
            return [];
        }
    }

    function save() {
        if (!storage || typeof storage.setItem !== 'function') return;
        try {
            storage.setItem(IMAGE_JOB_LOG_STORAGE_KEY, JSON.stringify(entries));
        } catch (error) {
            // 存储满时丢掉较旧的一半再试一次，日志不能影响生图本身。
            entries = entries.slice(Math.floor(entries.length / 2));
            try { storage.setItem(IMAGE_JOB_LOG_STORAGE_KEY, JSON.stringify(entries)); } catch (retryError) { /* 放弃持久化 */ }
        }
    }

    function notify() {
        for (const handler of listeners) {
            try { handler(); } catch (error) { /* 监听方异常不影响记录 */ }
        }
    }

    function applyRetention() {
        const { retainDays, maxEntries } = normalizeImageJobLogSettings(getSettings());
        const before = entries.length;
        if (retainDays > 0) {
            const cutoff = now() - retainDays * DAY_MS;
            entries = entries.filter((e) => Number(e.at) >= cutoff);
        }
        if (entries.length > maxEntries) entries = entries.slice(entries.length - maxEntries);
        return before - entries.length;
    }

    return {
        add(level, message) {
            const entry = {
                id: ++seq,
                at: now(),
                level: IMAGE_JOB_LOG_LEVELS.includes(level) ? level : 'info',
                message: String(message == null ? '' : message).slice(0, MAX_MESSAGE_LENGTH),
            };
            entries.push(entry);
            applyRetention();
            save();
            notify();
            return entry;
        },
        // 新的在前，方便在设置里直接看到最近一次的结果。
        list() {
            return entries.slice().reverse().map((e) => ({ ...e }));
        },
        clear() {
            const removed = entries.length;
            entries = [];
            save();
            notify();
            return { ok: true, removed };
        },
        prune() {
            const removed = applyRetention();
            if (removed > 0) { save(); notify(); }
            return { ok: true, removed };
        },
        onChange(handler) {
            if (typeof handler !== 'function') return () => {};
            listeners.add(handler);
            return () => listeners.delete(handler);
        },
    };
}

export function formatImageJobLogTime(at) {
    const d = new Date(Number(at));
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const LEVEL_LABELS = { info: '信息', success: '成功', warn: '警告', error: '错误' };

export function formatImageJobLogText(list) {
    return (list || []).map((e) => `[${formatImageJobLogTime(e.at)}] [${LEVEL_LABELS[e.level] || e.level}] ${e.message}`).join('\n');
}

export function imageJobLogLevelLabel(level) {
    return LEVEL_LABELS[level] || level;
}
