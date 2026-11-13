import { createCombatSession } from '../../../src/combat/session.js';
import { createCombatLedger } from '../../../src/combat/ledger.js';
import { enemyIdFor } from '../../../src/combat/generation.js';
import { createMemoryStorage } from '../../../src/storage/preset-store.js';
import { abilityMod } from '../../../src/combat/abilities.js';
import { enemyById, materializeEnemy } from '../../../src/combat/enemies/index.js';

const TEMPLATE_IDS = ['en-sts1-act1-12', 'en-sts2-hive-02', 'en-sts2-hive-05'];

// 战斗面板预览：内存战斗表 + 内存存档 + 本地聊天快不出网。
const clone = (v) => JSON.parse(JSON.stringify(v));
const attack = (id, name, amount = 6, cost = 1) => ({ id, name, type: 'attack', cost, rarity: 'common', effects: [{ op: 'damage', amount }] });
const guard = (id, name) => ({ id, name, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const passive = (id, trigger = 'battle-start') => ({ id, name: '被动', trigger, effects: [{ op: 'block', amount: 2 }] });
const STARTER = ['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
    'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2'];
const classDef = { kind: 'class', id: 'cls-blade', className: '剑士', archetype: 'warrior', classPassive: passive('p-edge'),
    classPool: [attack('c1', '断流'), attack('c2', '回旋斩'), guard('c3', '律动'), guard('c4', '招架'), attack('c5', '突刺'), attack('c6', '重斩', 12, 2), guard('c7', '执剑'), guard('c8', '内息')] };
const heroDef = { kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: passive('p-will', 'on-low-hp'), personalPool: [attack('m1', '流星一击'), guard('m2', '风之离'), attack('m3', '烈风'), guard('m4', '恭保')], starterDeck: STARTER };
const enemyDef = (name, amount) => ({ kind: 'enemy', id: enemyIdFor(name, 'normal'), name, tier: 'normal', base: { hp: 40 },
    skills: [{ id: 'e1', name: '撕咬', intent: 'attack', effects: [{ op: 'damage', amount }] }, { id: 'e2', name: '低吼', intent: 'debuff', effects: [{ op: 'status', status: 'weak', stacks: 1 }] }] });
const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });

export function createCombatPreview({ attributes = false, templates = false } = {}) {
    const foes = templates ? TEMPLATE_IDS.map((id) => {
        const entry = enemyById(id);
        if (!entry) throw new Error(`combat-preview-template-missing:${id}`);
        const profile = materializeEnemy(entry, 'original', { id: enemyIdFor(entry.name, entry.tier) });
        if (!profile) throw new Error(`combat-preview-template-unavailable:${id}`);
        return profile;
    }) : [enemyDef('野狼', 5)];
    const enemyNames = templates ? foes.map((profile) => profile.name).join(',') : '野狼*2';
    const chat = [{ mes: '出发', is_user: true }, { mes: `桥头传来低吼。\n[igs-combat:start|月下桥头|${enemyNames}]`, swipe_id: 0, is_user: false }];
    const stats = { sends: 0 };
    const t = { profile: [row(classDef, 1), row(heroDef, 2), ...foes.map((profile, i) => row(profile, i + 3))], ledger: [] };
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger) });
    t.append = async (kind, records) => { for (const r of records) t[kind].push(clone(r)); return { ok: true, written: records.map((r) => r.id), present: [], rejected: [], pending: [] }; };
    const baseLedger = createCombatLedger({ tables: t, chat: () => chat, userName: '主角', now: () => 1 });
    const ledger = !attributes ? baseLedger : { ...baseLedger, async effectiveState(...args) {
        const state = await baseLedger.effectiveState(...args);
        if (!state.ok) return state;
        const scores = { str: 16, dex: 16, con: 10, int: 8, wis: 14, cha: 20 };
        const enhance = (character) => {
            if (character.kind !== 'deck-character') return character;
            const catalog = new Map(character.catalog);
            for (const [id, card] of catalog) {
                const effects = id === 'c1' ? [{ op: 'damage', amount: 30, target: 'enemy' }]
                    : id === 'c2' ? [{ op: 'damage', amount: 30, target: 'enemy' }, { op: 'block', amount: 6, target: 'self' }]
                        : card.effects;
                catalog.set(id, { ...card, effects, ...(id === 'c2' ? { archetype: 'mage' } : {}),
                    upgraded: { effects: effects.map(effect => ['damage', 'block'].includes(effect.op) ? { ...effect, amount: effect.amount + 3 } : effect) } });
            }
            return { ...character, catalog, level: 2, points: 500, freeDraws: [2], freeUpgrades: [2],
                attributes: { ...character.attributes, level: 2, initialized: true, table: 'ok', proficiency: 2, scores,
                    mods: Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, abilityMod(value)])) } };
        };
        return { ...state, characters: new Map([...state.characters].map(([id, character]) => [id, enhance(character)])) };
    } };
    const send = async (text) => { stats.sends += 1; chat.push({ mes: text, is_user: true }); return { ok: true, messageId: chat.length - 1 }; };
    const session = createCombatSession({ ledger, tables: t, llm: { source: 'tavern' }, send, storage: createMemoryStorage(),
        chat: () => chat, getChatId: 'preview-chat', userName: '主角', now: () => 2 });
    return { session, ledger, stats, messageId: 1 };
}
