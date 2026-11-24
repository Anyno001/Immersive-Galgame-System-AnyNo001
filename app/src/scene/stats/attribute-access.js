import { abilitiesForName, floorSignature, normalizeSnapshot, replayCharacterState, sameSignature } from '../../combat/ledger.js';
import { heroInventoryView } from '../../combat/inventory-view.js';
import { normalizeHeroScores, normalizeNpcScores } from './ability-fields.js';
import { INIT_EDIT_CHANGE } from './attribute-profile.js';

// 同步读供检定与界面使用，不建表。战斗档案只提供别名、EXP 与装备的回放输入；纯数值模式下战斗表可缺失。
export function createAttributeAccess({ store, read, ensure, inventory, client, chat, userName, sourceFilter, chatId }) {
    let memo;
    function snapshot({ fresh = false } = {}) {
        const status = store.status();
        if (!status.ok) return status;
        if (fresh) { client.invalidate(); memo = null; }
        const tables = client.readTables();
        if (!tables.ok) return tables;
        const floors = chat(), signature = floorSignature(floors), user = userName(), filter = sourceFilter();
        const version = client.version();
        if (memo && memo.version === version && memo.data === tables.data && memo.user === user && memo.filter === filter && sameSignature(memo.signature, signature)) return memo;
        const raw = read();
        if (!raw.ok) return raw;
        if (raw.layoutPending) return { ok: false, reason: 'igs-layout-unconfirmed', layout: raw.layout };
        if (!Array.isArray(raw.attribute)) return { ok: false, reason: 'combat-attribute-table-missing', layout: raw.layout };
        const parsed = normalizeSnapshot(raw);
        if (!parsed.ok) return parsed;
        const state = replayCharacterState(parsed, floors, { userName: user, sourceFilter: filter, chatId, heroInventory: heroInventoryView(inventory.read()) });
        if (!state.ok) return state;
        memo = { ok: true, version, data: tables.data, signature, user, filter, rows: parsed.attributes, layout: raw.layout, state };
        return memo;
    }
    function source() {
        const s = snapshot();
        return { ready: s.ok, reason: s.reason, layout: s.layout || null, names: () => s.ok ? [...s.state.characters.values()].map(c => c.name) : [],
            readAbilities: (name, extra) => s.ok && store.status().ok ? abilitiesForName(s.state, name, s.user, extra) : null };
    }
    function readHero(name) {
        const s = snapshot({ fresh: true });
        if (!s.ok) return s;
        const heroName = String(name || s.user || '主角').trim() || '主角';
        const view = abilitiesForName(s.state, heroName, s.user);
        if (!view || !view.protagonist) return { ok: false, reason: 'stats-hero-not-found' };
        return { ok: true, layout: s.layout, view, rows: s.rows, initTime: s.state.attributes.fold.get(view.key)?.initTime ?? -1 };
    }
    async function initHero(name, scores, options = {}) {
        const uncapped = options.uncapped === true;
        const base = normalizeHeroScores(scores, { uncapped });
        if (!base) return { ok: false, reason: 'stats-hero-init-attributes-invalid' };
        const s = readHero(name);
        if (!s.ok) return s;
        const id = typeof options.recordId === 'string' && options.recordId.trim()
            ? options.recordId.trim() : `hero-base|${s.view.key}`;
        const existingSame = s.rows.find(row => row.id === id);
        if (existingSame) {
            return JSON.stringify(existingSame.payload?.scores) === JSON.stringify(base)
                ? { ok: true, present: [id], unchanged: true, record: existingSame }
                : { ok: false, reason: 'stats-attribute-conflict' };
        }
        if (s.view.initialized) return { ok: true, unchanged: true, skipped: true };
        if (options.expectedRevision !== undefined && options.expectedRevision !== s.view.revision) {
            return { ok: false, reason: 'stats-attribute-conflict' };
        }
        const at = Number.isInteger(options.createdAt) ? Math.max(options.createdAt, s.initTime + 1) : Math.max(Date.now(), s.initTime + 1);
        const payload = uncapped ? { scores: base, uncapped: true } : { scores: base };
        const record = { id, type: 'hero-base', character: s.view.key, createdAt: at, anchor: null, change: '初始化', payload };
        const written = await store.append(record, { ...options, expectedRows: s.rows });
        return written.ok ? { ...written, record } : written;
    }
    async function editHero(name, scores, options = {}) {
        const uncapped = options.uncapped === true;
        const base = normalizeHeroScores(scores, { uncapped });
        if (!base) return { ok: false, reason: 'stats-hero-edit-invalid' };
        let s = readHero(name);
        if (!s.ok && (s.reason === 'combat-attribute-table-missing' || s.reason === 'igs-layout-unconfirmed') && typeof ensure === 'function') {
            const ensured = await ensure(options);
            if (!ensured?.ok) return ensured || s;
            s = readHero(name);
        }
        if (!s.ok) return s;
        if (options.expectedRevision !== undefined && options.expectedRevision !== s.view.revision) {
            return { ok: false, reason: 'stats-attribute-conflict' };
        }
        const at = Math.max(Date.now(), s.initTime + 1);
        const payload = uncapped ? { scores: base, uncapped: true } : { scores: base };
        const record = { id: `hero-base|${s.view.key}|edit|${at}`, type: 'hero-base', character: s.view.key, createdAt: at,
            anchor: null, change: INIT_EDIT_CHANGE, payload };
        const written = await store.append(record, { ...options, expectedRows: s.rows });
        return written.ok ? { ...written, record } : written;
    }
    async function editNpc(name, scores, options = {}) {
        const s = snapshot();
        if (!s.ok) return s;
        const view = abilitiesForName(s.state, name, s.user);
        const base = normalizeNpcScores(scores);
        if (!view || view.protagonist || !base) return { ok: false, reason: 'stats-sheet-edit-invalid' };
        if (options.expectedRevision !== view.revision) return { ok: false, reason: 'stats-attribute-conflict' };
        const at = Math.max(Date.now(), (s.state.attributes.fold.get(view.key)?.initTime ?? -1) + 1);
        return store.append({ id: `npc-base|${view.key}|${at}`, type: 'npc-base', character: view.key, createdAt: at,
            anchor: null, change: INIT_EDIT_CHANGE, payload: { scores: base } }, { ...options, expectedRows: s.rows });
    }
    return {
        source,
        readHero,
        initHero,
        editHero,
        editNpc,
        ensure: typeof ensure === 'function' ? ensure : () => Promise.resolve({ ok: false, reason: 'combat-attribute-table-missing' }),
        status: store.status,
        recover: store.recover,
    };
}
