import { createCachedTableClient, createCombatTables } from './combat-tables.js';
import { IGS_LAYOUT_RECORD, IGS_MARKER_SPECS, IGS_TABLE_SPECS } from './igs-table-specs.js';
import { resolveIgsLayout } from './igs-chat-layout.js';
import { createInventoryTables } from './inventory-tables.js';
import { createTableReadiness } from './table-readiness.js';
import { createOriginStore } from './origin-store.js';
import { createPointsStore } from './points-store.js';
import { createAttributeIntent } from '../../storage/attribute-intent.js';
import { createAttributeStore } from '../../scene/stats/attribute-store.js';
import { createAttributeAccess } from '../../scene/stats/attribute-access.js';
import { sheetBasesOf, sheetDropsOf } from '../../scene/stats/stat-persist.js';

const leaseActive = shouldStart => {
    try { return !shouldStart || shouldStart() === true; } catch { return false; }
};
const stale = () => ({ ok: false, status: 'failed', reason: 'request-stale' });
const stateOf = result => {
    const waiting = ['not-ready', 'missing-api', 'combat-table-not-ready', 'combat-table-runtime-not-ready'].includes(result.reason);
    return { ...result, reason: result.reason === 'not-ready' ? 'combat-table-not-ready' : result.reason,
        status: result.ok ? 'ready' : result.status || (waiting ? 'waiting' : 'failed') };
};

export function createIgsChatStore({ api, chatId, chat = () => [], userName = () => '', sourceFilter = () => undefined, evidence, storage, cellMax, onAttributesConfirmed, onAttributesPending }) {
    let owner = null, generation = 0, disposed = false, tail = Promise.resolve();
    const serial = task => {
        const run = tail.then(task, task);
        tail = run.catch(() => {});
        return run;
    };
    const current = held => !disposed && owner === held && api() === held.api && chatId() === held.chatId;
    function retire() {
        owner?.readiness.dispose();
        owner?.releaseSubscriptions();
        owner?.client.dispose();
        owner = null;
    }
    function get() {
        if (disposed) throw new Error('igs-chat-store-disposed');
        const id = chatId(), host = api();
        if (owner && (owner.api !== host || owner.chatId !== id)) retire();
        if (owner) return owner;
        const client = createCachedTableClient({ api: host });
        const held = { api: host, chatId: id, generation: ++generation, client };
        const subscriptions = new Set();
        held.releaseSubscriptions = () => { for (const off of [...subscriptions]) off(); };
        owner = held;
        const valid = () => current(held) && Boolean(id);
        const legacy = createCombatTables({ api: host, client, serial, cellMax });
        const modern = createCombatTables({ api: host, client, serial, cellMax, specs: IGS_TABLE_SPECS });
        const marker = createCombatTables({ api: host, client, serial, cellMax, specs: IGS_MARKER_SPECS });
        held.readiness = createTableReadiness({ client, chatId: id, generation, serial, isCurrent: valid });
        let confirmedLayout = null;
        function layout(recoveryRecords = []) {
            if (!valid()) return stale();
            const loaded = client.readSheets();
            if (!valid()) return stale();
            if (!loaded.ok) return stateOf(loaded);
            let proof;
            try { proof = evidence(id); } catch { proof = { ok: false, reason: 'igs-legacy-evidence-read-failed' }; }
            const result = resolveIgsLayout(loaded.sheets, proof, { recoveryRecords, cellMax });
            if (!result.ok) return result;
            if (confirmedLayout && (result.layout !== confirmedLayout || (confirmedLayout === 'v2' && !result.marked))) {
                return { ok: false, status: 'failed', reason: 'igs-layout-conflict' };
            }
            if (result.layout === 'legacy' || result.marked) confirmedLayout = result.layout;
            return result;
        }
        const storageFor = state => state.layout === 'legacy' ? legacy : modern;
        let initialization = null;
        async function initialize(shouldStart, recoveries) {
            if (!valid() || !shouldStart()) return stale();
            client.invalidate();
            let state = layout(recoveries());
            if (!state.ok || state.layout === 'legacy' || state.marked) return state;
            const made = await marker.ensure({ shouldStart: () => valid() && shouldStart() });
            if (!valid() || !shouldStart()) return stale();
            if (!made.ok) return stateOf(made);
            client.invalidate();
            state = layout(recoveries());
            if (!state.ok || state.layout === 'legacy' || state.marked) return state;
            const written = await marker.append('layout', IGS_LAYOUT_RECORD, {
                retainOnFailure: false, refresh: false, recoverSegments: true, shouldStart: () => {
                    if (!valid() || !shouldStart()) return false;
                    const next = layout(recoveries());
                    return next.ok && next.layout === 'v2';
                },
            });
            if (!valid() || !shouldStart()) return stale();
            client.invalidate();
            const checked = layout();
            return checked.ok && checked.marked ? checked : stateOf(written.ok
                ? { ok: false, reason: 'igs-layout-write-unverified' } : written);
        }
        function ensureLayout(shouldStart, recoveryRecords = []) {
            if (!leaseActive(shouldStart)) return Promise.resolve(stale());
            if (!initialization) {
                const job = { waiters: new Set(), promise: null };
                initialization = job;
                const active = () => valid() && [...job.waiters].some(waiter => leaseActive(waiter.shouldStart));
                const recoveries = () => [...job.waiters].filter(waiter => leaseActive(waiter.shouldStart))
                    .flatMap(waiter => waiter.recoveryRecords);
                job.promise = Promise.resolve().then(() => initialize(active, recoveries));
                job.promise.finally(() => { if (initialization === job) initialization = null; }).catch(() => {});
            }
            const job = initialization;
            const waiter = { shouldStart, recoveryRecords };
            job.waiters.add(waiter);
            return job.promise.finally(() => job.waiters.delete(waiter));
        }
        function tables(kinds, remap = {}) {
            const mapped = (kind, state) => state.layout === 'legacy' ? remap[kind] || kind : kind;
            const recoveries = records => Array.isArray(records) && records.every(item => kinds.includes(item?.kind) && item.record)
                ? records.map(item => ({ ...item, kind: remap[item.kind] || item.kind })) : null;
            function read({ kinds: selected = kinds, recoveryRecords = [] } = {}) {
                const proof = recoveries(recoveryRecords);
                if (!proof) return { ok: false, reason: 'igs-recovery-record-invalid' };
                const state = layout(proof);
                if (!state.ok) return state;
                if (!Array.isArray(selected) || selected.some(kind => !kinds.includes(kind))) return { ok: false, reason: 'combat-table-unknown-kind' };
                const source = storageFor(state).read({ kinds: selected.map(kind => mapped(kind, state)) });
                if (!source.ok || !valid()) return valid() ? stateOf(source) : stale();
                const out = { ok: true, status: 'ready', layout: state.layout,
                    layoutPending: state.layout === 'v2' && !state.marked, diagnostics: [], missing: [], optionalMissing: [] };
                for (const kind of selected) {
                    const physical = mapped(kind, state);
                    out[kind] = source[physical];
                    if (source[`${physical}Raw`]) out[`${kind}Raw`] = source[`${physical}Raw`];
                    if (source.missing.includes(physical)) out.missing.push(kind);
                    if (source.optionalMissing.includes(physical)) out.optionalMissing.push(kind);
                    out.diagnostics.push(...source.diagnostics.filter(item => item.kind === physical).map(item => ({ ...item, kind })));
                }
                return out;
            }

            async function ensure({ shouldStart, signal, kinds: selected = kinds, recoveryRecords = [] } = {}) {
                const alive = () => valid() && !signal?.aborted && leaseActive(shouldStart);
                if (!Array.isArray(selected) || selected.some(kind => !kinds.includes(kind))) return { ok: false, reason: 'combat-table-unknown-kind' };
                const proof = recoveries(recoveryRecords);
                if (!proof) return { ok: false, reason: 'igs-recovery-record-invalid' };
                const state = await ensureLayout(alive, proof);
                if (!alive()) return stale();
                if (!state.ok) return state;
                const result = await storageFor(state).ensure({ kinds: [...new Set(selected.map(kind => mapped(kind, state)))],
                    shouldStart: () => alive() && layout(proof).layout === state.layout });
                return alive() ? stateOf(result) : stale();
            }
            async function append(kind, records, options = {}) {
                if (!kinds.includes(kind)) return { ok: false, reason: 'combat-table-unknown-kind' };
                const own = (Array.isArray(records) ? records : [records]).map(record => ({ kind, record }));
                const proof = recoveries(options.recoveryRecords || []);
                if (!proof) return { ok: false, reason: 'igs-recovery-record-invalid' };
                const heldProof = recoveries(own);
                if (!heldProof) return { ok: false, reason: 'igs-recovery-record-invalid' };
                const state = layout([...proof, ...(options.recoverSegments === true ? heldProof : [])]);
                if (!state.ok) return state;
                const alive = () => valid() && !options.signal?.aborted && leaseActive(options.shouldStart);
                if (!alive()) return stale();
                if (state.layout === 'v2' && !state.marked) return { ok: false, reason: 'igs-layout-unconfirmed' };
                const writable = () => {
                    if (!alive()) return false;
                    const next = layout([...proof, ...heldProof]);
                    return next.ok && next.layout === state.layout && (next.layout === 'legacy' || next.marked);
                };
                const result = await storageFor(state).append(mapped(kind, state), records, { ...options, shouldStart: writable });
                return alive() ? stateOf(result) : stale();
            }
            return {
                client, serial, read, ensure, append, layout,
                subscribe(listener) {
                    if (!valid() || typeof listener !== 'function') return () => {};
                    let active = true;
                    const updated = () => { if (active && valid()) { client.invalidate(); listener(); } };
                    const off = () => {
                        if (!active) return;
                        active = false;
                        subscriptions.delete(off);
                        client.unregisterCallback(updated);
                    };
                    subscriptions.add(off);
                    try { if (!client.registerCallback(updated)) off(); } catch { off(); }
                    return off;
                },
                probe: () => valid() ? legacy.probe() : stale(),
                matchesIncomplete(kind, record, records = [{ kind, record }]) {
                    if (!kinds.includes(kind)) return false;
                    const proof = recoveries(records);
                    const state = proof && layout(proof);
                    return !!state?.ok && storageFor(state).matchesIncomplete(mapped(kind, state), record);
                },
                pending: () => [...legacy.pending(), ...modern.pending()].filter(item => kinds.includes(item.kind) || Object.values(remap).includes(item.kind)),
                async flush() {
                    const state = layout();
                    if (!valid()) return stale();
                    const source = state.ok ? storageFor(state) : confirmedLayout && storageFor({ layout: confirmedLayout });
                    if (!source || (!state.ok && !source.pending().length)) return state;
                    const result = await source.flush();
                    return valid() ? result : stale();
                },
                isWriting: () => legacy.isWriting() || modern.isWriting() || marker.isWriting(),
            };
        }
        const inventory = createInventoryTables({ api: host, client, serial });
        const inventoryCall = async (method, args, options = {}) => {
            const alive = () => valid() && !options.signal?.aborted && leaseActive(options.shouldStart);
            if (!alive()) return stale();
            const state = await ensureLayout(alive);
            if (!alive()) return stale();
            if (!state.ok) return state;
            const result = await inventory[method](...args, { ...options, shouldStart: () => {
                if (!alive()) return false;
                const next = layout();
                return next.ok && next.layout === state.layout && (next.layout === 'legacy' || next.marked);
            } });
            return alive() ? result : stale();
        };
        held.inventory = {
            client, probe: () => valid() ? inventory.probe() : stale(),
            read: () => valid() ? inventory.read() : stale(), isWriting: inventory.isWriting,
            ensure: options => inventoryCall('ensure', [], options),
            changeQuantities: (changes, options) => inventoryCall('changeQuantities', [changes], options),
            setGearRow: (name, record, options) => inventoryCall('setGearRow', [name, record], options),
            prepareRename: (input, options) => inventoryCall('prepareRename', [input], options),
            rename: (guard, options) => inventoryCall('rename', [guard], options),
        };
        held.layout = layout;
        const combatTables = tables(['profile', 'ledger', 'attribute']);
        held.stats = tables(['stats']);
        function readCharacters(options) {
            const raw = combatTables.read(options);
            if (!raw.ok || !Array.isArray(raw.attribute)) return raw;
            const log = held.stats.read();
            if (!log.ok) return log;
            if (log.diagnostics.length) return { ok: false, reason: 'stats-sheet-log-invalid', diagnostics: log.diagnostics };
            const stats = log.stats || [];
            return { ...raw, sheetBases: sheetBasesOf(stats), baseDrops: new Set(sheetDropsOf(stats).values()) };
        }
        // 纯属性读口：允许战斗档案与战斗日志表尚未建立（纯数值新聊天不建战斗表），但仍严格要求属性表本身存在且可读。
        function readAttributesSnapshot(options) {
            const raw = readCharacters(options);
            if (!raw.ok || !Array.isArray(raw.attribute)) return raw;
            return {
                ...raw,
                profile: Array.isArray(raw.profile) ? raw.profile : [],
                ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
                missing: (raw.missing || []).filter(kind => kind !== 'profile' && kind !== 'ledger'),
            };
        }
        held.raw = { ...combatTables, read: readCharacters };
        held.statsAccess = {
            get ok() { return held.stats.probe().ok; },
            get reason() { return held.stats.probe().reason; },
            get version() { return `${held.generation}:${client.version()}`; },
            read: options => held.stats.read(options), invalidate: () => client.invalidate(),
            ensure: options => held.stats.ensure(options),
            append: (records, options) => held.stats.append('stats', records, options),
            matchesIncomplete: record => held.stats.matchesIncomplete('stats', record),
        };
        held.attributes = tables(['attribute']);
        held.attributeStore = createAttributeStore({ tables: held.attributes, chatId: id,
            journal: createAttributeIntent(storage, id), isCurrent: valid,
            onConfirmed: () => onAttributesConfirmed?.(held), onPending: () => onAttributesPending?.(held) });
        held.attributeAccess = createAttributeAccess({ store: held.attributeStore, read: readAttributesSnapshot,
            ensure: options => held.attributes.ensure(options),
            inventory: held.inventory, client, chat, userName, sourceFilter, chatId: id });
        let pointsTail = Promise.resolve();
        held.withPointsLock = task => {
            const run = pointsTail.then(task, task);
            pointsTail = run.catch(() => {});
            return run;
        };
        held.origin = createOriginStore({ tables: tables(['origin'], { origin: 'ledger' }), kind: 'origin' });
        held.points = createPointsStore({ tables: tables(['points'], { points: 'ledger' }), kind: 'points', chat, chatId });
        return held;
    }
    return { get, reset: retire, dispose() { disposed = true; retire(); } };
}
