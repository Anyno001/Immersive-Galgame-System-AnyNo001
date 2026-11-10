import { getSillyTavernContext } from './tavern-helper-adapter.js';

export const COMBAT_TRAIT_SEED_KEY = 'igsCombatTraitSeed';
const pending = new WeakMap();
const validSeed = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128;

// 种子随聊天保存，不能只留在浏览器缓存中，否则换设备会重新洗抽取序列。
export function createCombatTraitSeed(host, getChatId) {
    async function ensure({ signal } = {}) {
        const chatId = getChatId();
        const context = getSillyTavernContext(host);
        const metadata = context?.chatMetadata;
        const alive = () => !signal?.aborted && getChatId() === chatId && getSillyTavernContext(host)?.chatMetadata === metadata;
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!chatId || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return { ok: false, reason: 'combat-trait-seed-unavailable' };
        let task = pending.get(metadata);
        if (!task) {
            const stored = metadata[COMBAT_TRAIT_SEED_KEY];
            if (stored !== undefined) return validSeed(stored) ? { ok: true, seed: stored } : { ok: false, reason: 'combat-trait-seed-invalid' };
            if (typeof context.saveMetadata !== 'function') return { ok: false, reason: 'combat-trait-seed-unavailable' };
            let seed;
            try {
                seed = Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
            } catch {
                return { ok: false, reason: 'combat-trait-seed-unavailable' };
            }
            metadata[COMBAT_TRAIT_SEED_KEY] = seed;
            task = (async () => {
                try {
                    const saved = await context.saveMetadata();
                    if (saved === false || saved?.ok === false) throw Error('save-failed');
                    return metadata[COMBAT_TRAIT_SEED_KEY] === seed ? { ok: true, seed } : { ok: false, reason: 'combat-trait-seed-invalid' };
                } catch {
                    if (metadata[COMBAT_TRAIT_SEED_KEY] === seed) delete metadata[COMBAT_TRAIT_SEED_KEY];
                    return { ok: false, reason: 'combat-trait-seed-save-failed' };
                }
            })();
            pending.set(metadata, task);
            task.finally(() => { if (pending.get(metadata) === task) pending.delete(metadata); });
        }
        const result = await task;
        return alive() ? result : { ok: false, reason: 'request-stale' };
    }
    return { ensure };
}
