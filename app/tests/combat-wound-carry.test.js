// 战后伤势带入下一场：战报楼落楼后写 wound，下一场开局生命、数值面板读到的生命都应是受伤后的值。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatLedger, vitalsForName } from '../src/combat/ledger.js';
import { buildSetup, createCombatSession, locateCombatStart, lobbyVitals, sessionKeyFor } from '../src/combat/session.js';
import { seedFor } from '../src/combat/engine.js';
import { templateEnemy } from '../src/combat/generation.js';
import { createCountingStorage } from './helpers/combat-mock-host-services.js';

globalThis.window = globalThis.window || { IGS_AUTO_BOOTSTRAP: false };
const clone = (v) => JSON.parse(JSON.stringify(v));
const attack = (id) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
const STARTER = ['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend', 'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2'];
const cls = { kind: 'class', id: 'cls-blade', className: '剑士', archetype: 'warrior', classPassive: { id: 'p', name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] }, classPool: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => attack(`c${n}`)) };
const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 }, personalPassive: { id: 'pp', name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] }, personalPool: [attack('m1'), attack('m2'), attack('m3'), attack('m4')], starterDeck: STARTER };
const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });

test('打完一场后：伤势写进账本，下一场开局与数值面板读到的都不是满血，并通知刷新', async () => {
    const tables = { profile: [row(cls, 1), row(hero, 2)], ledger: [] };
    tables.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(tables.profile), ledger: clone(tables.ledger) });
    tables.append = async (kind, records) => { const written = []; for (const r of records) if (!tables[kind].some((x) => x.id === r.id)) { tables[kind].push(clone(r)); written.push(r.id); } return { ok: true, written, present: [], rejected: [], pending: [] }; };
    const chat = [{ is_user: true, mes: '出发' }, { is_user: false, mes: '前方出现了敌人。\n[igs-combat:start|史莱姆|草原]', swipe_id: 0 }];
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    const located = locateCombatStart(chat, 1);
    const first = await ledger.effectiveState();
    const lobby = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [first.characters.get('pc-hero')], enemies: new Map(located.start.enemies.map((e) => [e.name, templateEnemy(e.name, 'normal')])) };
    assert.equal(lobbyVitals(lobby)['pc-hero'].hp, lobbyVitals(lobby)['pc-hero'].maxHp, '第一场满血');
    const built = buildSetup(lobby, located.start, { userName: '主角', combatId: located.combatId });
    const record = { v: 1, combatId: located.combatId, anchor: located.anchor, seed: seedFor(located.combatId), setup: built.setup, actions: [], encounter: '草原', tiers: built.tiers, expTargets: ['主角'] };
    const settled = [];
    const session = createCombatSession({
        ledger, tables, storage: createCountingStorage({ [sessionKeyFor('c1')]: JSON.stringify(record) }), chat, getChatId: () => 'c1', userName: '主角',
        send: async (text) => { chat.push({ is_user: true, mes: text }); return { ok: true, messageId: chat.length - 1 }; }, now: () => 1000,
        onReportSettled: (info) => settled.push(info),
    });
    assert.equal(session.resume().ok, true);
    for (let i = 0; i < 300 && session.state().status === 'battle'; i += 1) {
        const play = session.state().legal.find((a) => a.type === 'play') || { type: 'end-turn' };
        assert.equal(session.act(play).ok, true);
    }
    assert.equal(session.state().status, 'ended');
    const heroUnit = session.state().battle.units['pc-hero'];
    const fin = await session.finish();
    assert.equal(fin.ok, true);
    assert.equal(fin.session.status, 'done');
    assert.equal(settled.length, 1, '战报收尾后通知调用方刷新');
    assert.equal(settled[0].wound.ok, true);
    const written = tables.ledger.filter((e) => e.type === 'wound');
    assert.equal(written.length, 1);
    const next = await ledger.effectiveState();
    assert.deepEqual(next.inactive, []);
    const wound = next.characters.get('pc-hero').wound;
    const hurtHp = Math.max(0, heroUnit.alive ? heroUnit.hp : 0);
    assert.ok(hurtHp < heroUnit.maxHp, '本场确实受伤');
    assert.deepEqual([wound.hp, wound.maxHp], [hurtHp, heroUnit.maxHp]);
    // 数值面板读的就是同一份：vitalsForName 与开局生命一致
    const vitals = vitalsForName(next, '主角', '主角');
    const lobby2 = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [next.characters.get('pc-hero')], enemies: lobby.enemies };
    const start2 = buildSetup(lobby2, located.start, { userName: '主角', combatId: 'again' }).setup.units.find((u) => u.id === 'pc-hero');
    assert.ok(vitals.hp < vitals.maxHp);
    assert.equal(start2.hp, vitals.down ? 1 : vitals.hp);
    assert.ok(start2.hp < start2.maxHp, '下一场不是满血进');
});
