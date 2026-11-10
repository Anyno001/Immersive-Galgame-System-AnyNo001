// 卡组增强的脱敏宿主：真实生成校验和账本，模型只用确定性替身。
import assert from 'node:assert/strict';
import { createCombatServices } from '../../src/core/combat-services.js';
import { createCombatTables } from '../../src/data/shujuku/combat-tables.js';
import { deckProfileEntities, generateEntities, generationWrites } from '../../src/combat/generation.js';
import { createCombatGenerationMaterials } from '../../src/host/combat-generation-materials.js';
import { createLedgerMockHost, userInventorySheet } from './combat-mock-host-ledger.js';
import { createMemoryStorage } from '../../src/storage/preset-store.js';

export function modelReply(prompt) {
    const payload = JSON.parse(prompt.user);
    return JSON.stringify({ entities: payload.entities.map((e) => {
        const cards = (n) => Array.from({ length: n }, (_, i) => [`雷刃${i + 1}`, 'strike']);
        let value;
        if (e.kind === 'class') value = { className: e.key.includes('respec') ? '雷剑客' : '剑士', archetype: 'warrior' };
        else if (e.kind === 'profile-deck') value = { passive: ['雷脉', 'opening-guard'], skill: ['雷刃', 'strike'], cards: cards(4) };
        else if (e.kind === 'class-tier') value = { tierName: '御雷', cards: cards(3) };
        else if (e.kind === 'profile-gear') value = { gear: [['长剑', 'weapon', 'common']] };
        else if (e.kind === 'draw-card') value = { card: ['雷光斩', 'strike'] };
        return { key: e.key, value };
    }) });
}

export async function createGenerationFixture({ seedHero = true } = {}) {
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    db.sheets.sheet_skills = { uid: 'sheet_skills', name: '人物技能表', content: [['所属角色', '技能', '状态'], ['艾拉', '雷步', '已掌握']] };
    const tables = createCombatTables({ api: db.api });
    assert.equal((await tables.ensure()).ok, true);
    const generated = await generateEntities(deckProfileEntities({ name: '艾拉', role: 'protagonist' }), { request: async (p) => modelReply(p), llm: { source: 'tavern' } });
    assert.equal(generated.ok, true, JSON.stringify(generated.rejected));
    if (seedHero) assert.equal((await tables.append('profile', generationWrites(generated, { createdAt: 1 }).profiles)).ok, true);
    const chat = [{ is_user: true, mes: '出发' }, ...Array.from({ length: 30 }, () => ({ is_user: false, mes: '修炼完成。\n[igs-combat:exp|艾拉|50|修炼]', swipe_id: 0 }))];
    const variables = { stat_data: { 主角: { 技能: { 雷刃: { 状态: '已掌握', 等级: 3 } } } } };
    const host = { AutoCardUpdaterAPI: db.api, Mvu: { getMvuData: () => variables }, SillyTavern: { getContext: () => ({ chat }) } };
    let chatId = 'fixture-chat';
    let failure = false;
    let callback = null;
    let reply = modelReply;
    const requests = [];
    const services = createCombatServices({
        global: host, storage: createMemoryStorage(), getChatId: () => chatId, getUserName: () => '艾拉', getWallet: () => 5000,
        getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
        getAutoIllustration: () => ({ llm: { source: 'custom', endpoint: 'https://example.invalid/v1', apiKey: 'fixture', model: 'fixture' } }),
        readGenerationMaterials: createCombatGenerationMaterials(host),
        readLore: async () => [{ name: '艾拉', text: '擅长用剑' }],
        readStoryContext: async () => ({ story: '雷光围绕剑刃。' }), retryDelays: [],
        request: async (p) => { requests.push(JSON.parse(p.user)); if (callback) await callback(); if (failure) throw Error('模拟模型故障'); return reply(p); },
    });
    await services.getLedger().scan();
    const state = await services.getLedger().effectiveState();
    assert.equal(state.ok, true, JSON.stringify(state));
    if (seedHero) assert.ok(state.attributes.heroId);
    return { db, host, variables, requests, services,
        hero: () => services.getLedger().effectiveState().then((s) => s.characters.get(s.attributes.heroId)),
        setFailure: (value) => { failure = value; }, setCallback: (value) => { callback = value; }, setChat: (id) => { chatId = id; },
        setReply: (value) => { reply = value; },
        dispose: () => services.resetChat() };
}
