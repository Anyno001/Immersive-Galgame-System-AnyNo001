// 战斗平衡模拟：托管策略驾驶经真实生成、账本与建局链装配的 v6 起始卡组，对战模板敌人，
// 按主角等级 × 相对档 × 遭遇档位 × 难度统计胜率与胜利时主角损失生命。只读调用战斗模块，不进 bundle、不进测试门禁；
// 种子确定，同参数重跑结果一致。结果只反映托管策略的强度，真人操作通常更好。满血开战。
// 用法：node scripts/combat-balance.mjs [--runs 20] [--levels 1,5,10] [--count 1] [--tiers normal,elite,boss]
//       [--rels weaker,even,stronger,formidable] [--diffs easy,normal,hard,brutal,nightmare] [--hero-skill] [--out 路径.md|路径.json]
//       [--try normal=1.2x1.5,gap=0.05x0.1x3,lv=0.08]（试调，不改规则表：在 setup 上把该档位敌人生命 × 前值、伤害倍率 × 后值；
//       gap 把规则表的 levelGap 换成生命 / 伤害每级系数（第三项为等级差上限）；lv 把 tierScalePerLevel 换成该值；
//       affix=精英去掉数x首领去掉数，从末尾去掉难度表给的常驻效果）
//       [--archetypes all|warrior,mage] [--deck-seeds 1,2,3,4] [--inspect-decks]
//       [--wins 0] [--trace --trace-run 0 --trace-from 0 --trace-steps 40]
//       [--sources template,generated,original,stitched]（敌人来源对照；显式给出时报告带来源列并追加来源校准汇总；--out 可逗号分隔同时写 .md 与 .json）
//       [--entries 条目键,…]（原版 / 缝合只取所列条目）[--tune 条目ID=生命x伤害x格挡,…]（试调，不改条目数据：以该微调重建敌人库，
//       缺项或写 - 保留条目原值；缝合项随来源条目一同换算）
// 个人牌使用本地模板夹具；职业牌由 assembleDeck 的固定池抽取。不同 deck-seed 使用独立角色 ID，不读写用户数据。
import { writeFileSync } from 'node:fs';
import { applyAction, createBattle, legalActions } from '../src/combat/engine.js';
import { chooseAllyPlay, pickCards } from '../src/combat/policy.js';
import { COMBAT_RULES, expToNextLevel } from '../src/combat/rules.js';
import { deckProfileEntities, drawCardEntity, enemyIdFor, generateEntities, generationWrites, skillProfileEntity, templateEnemy } from '../src/combat/generation.js';
import { enemyFillSkills } from '../src/combat/enemy-loadout.js';
import { enemyPool, materializeChoice } from '../src/combat/enemies/pool.js';
import { ENEMY_ENTRIES } from '../src/combat/enemies/entries.js';
import { ENEMIES as LIBRARY_ENEMIES, prepareEnemyEntries } from '../src/combat/enemies/index.js';
import { attributeViewFor, buildAllocEntries, createCombatLedger, normalizeSnapshot, upgradableRows } from '../src/combat/ledger.js';
import { ABILITY_KEYS, REL_TIERS } from '../src/combat/abilities.js';
import { cardView, weakestId } from '../src/combat/battle-state.js';
import { buildSetup } from '../src/combat/session.js';
import { hash32 } from '../src/combat/random.js';
import { ARCHETYPE_FAMILIES, heroSkillFromTemplate, solveCardTemplate, templatesFor } from '../src/combat/card-templates.js';
import { fixedCard, fixedCardGroup } from '../src/combat/fixed-cards/index.js';
import { planCardDraw } from '../src/combat/rewards.js';
import { upgradedCardFace } from '../src/combat/card-upgrade.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
// 逗号分隔的筛选：缺省取全部，未知键忽略。
const only = (name, all, keyOf = (k) => k) => { const want = String(arg(name, '')).split(',').filter(Boolean); return want.length ? all.filter((k) => want.includes(keyOf(k))) : all; };
const RUNS = Math.max(1, Number(arg('--runs', 20)) || 20);
const LEVELS = String(arg('--levels', '1,5,10')).split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= COMBAT_RULES.maxLevel);
const DECK_SEEDS = [...new Set(String(arg('--deck-seeds', '')).split(',').map(seed => seed.trim()))];
const INSPECT_DECKS = process.argv.includes('--inspect-decks');
const TRACE = process.argv.includes('--trace');
const TRACE_STEPS = Math.min(100, Math.max(1, Number(arg('--trace-steps', 40)) || 40));
const TRACE_RUN = Math.max(0, Math.floor(Number(arg('--trace-run', 0)) || 0));
const TRACE_FROM = Math.max(0, Math.floor(Number(arg('--trace-from', 0)) || 0));
const COUNT = Math.min(COMBAT_RULES.maxEnemies, Math.max(1, Number(arg('--count', 1)) || 1));
const WINS = Math.max(0, Math.floor(Number(arg('--wins', 0)) || 0));
const HERO_SKILL = process.argv.includes('--hero-skill');
// --generated：敌人换成「生成敌人」近似形状（技能全部按模板在档位伤害上限求解、数量取 skillTarget，generated 不为 false），
// 用来核对按模板敌人校准的倍率套到副 LLM 生成的敌人上是否偏强。
const GENERATED = process.argv.includes('--generated');
// --ally：阵容加一名技能型助战（模板技能，随主角同步 EXP）；--ally-single 删掉 setup 的 actions，对照两动前的强度。
const ALLY = process.argv.includes('--ally') || process.argv.includes('--ally-single') ? '白露' : '';
const ALLY_SINGLE = process.argv.includes('--ally-single');
const ALLY_VALUE = { hp: 60, skills: [['斩', 'slash'], ['守', 'guard'], ['破', 'gash']], passives: [['坚', 'turn-guard']] };
const OUT = arg('--out', '');
const TRY = Object.fromEntries(String(arg('--try', '')).split(',').filter(Boolean).map((part) => {
    const [key, value] = part.split('=');
    return [key, String(value || '').split('x').map(Number)];
}));
const MAX_ACTIONS = 3000;
const HERO = '主角';
// 敌人轮换名字：常驻效果、补技能、相对档偏移、六维与速度都按名字或档案 ID 取种子，轮换才能覆盖不同抽取结果。
const ENEMIES = Array.from({ length: 8 }, (_, i) => `试炼之敌${i + 1}`);
const TIERS = only('--tiers', ['normal', 'elite', 'boss']);
const RELS = only('--rels', Object.entries(REL_TIERS).map(([key, tier]) => [key, tier.label]), (r) => r[0]);
const DIFFS = only('--diffs', Object.keys(COMBAT_RULES.difficulty));
// D9：标准档逐职业、等级、卡组种子与来源判定；不以职业均值代替单格验收。
const WIN_TARGETS = { 'outclassed|normal': [0.95, 1], 'even|normal': [0.75, 1], 'even|elite': [0.5, 0.75] };
const ELITE_LEVELS = new Set([5, 10]);
// 敌人来源：缺省沿用旧行为（--generated 时生成近似，否则模板）；显式 --sources 时报告带来源列与校准汇总，未知或缺值直接退出。
const SOURCE_LABEL = { template: '模板', generated: '生成近似', original: '原版', stitched: '缝合' };
const MULTI = process.argv.includes('--sources');
const SOURCES = MULTI ? [...new Set(String(arg('--sources', '') || '').split(',').map((s) => s.trim()).filter(Boolean))] : [GENERATED ? 'generated' : 'template'];
const UNKNOWN_SOURCES = SOURCES.filter((s) => !Object.hasOwn(SOURCE_LABEL, s));
if (!SOURCES.length || UNKNOWN_SOURCES.length) {
    console.error(`未知敌人来源：${UNKNOWN_SOURCES.join(',') || '（空）'}；可选 ${Object.keys(SOURCE_LABEL).join(',')}`);
    process.exit(2);
}
// 特性池与战斗准备同一构造（enemyPool），固定种子；按条目键排序后按场次轮换，同场次在各职业、等级间对到同一条目。
const POOL_SEED = 'balance';
const ENTRY_ONLY = new Set(String(arg('--entries', '') || '').split(',').map((s) => s.trim()).filter(Boolean));
const TUNE = new Map(String(arg('--tune', '') || '').split(',').map((s) => s.trim()).filter(Boolean).map((part) => {
    const [id, value = ''] = part.split('=');
    const [hp, damage, block] = value.split('x').map((v) => (v === '' || v === '-' ? undefined : Number(v)));
    return [id, { hp, damage, block }];
}));
const BAD_TUNE = [...TUNE].filter(([id, t]) => !ENEMY_ENTRIES.some((e) => e.id === id)
    || Object.values(t).some((v) => v !== undefined && !(Number.isFinite(v) && v > 0)));
if (BAD_TUNE.length) {
    console.error(`无效试调：${BAD_TUNE.map(([id]) => id).join(',')}（条目须存在，数值须为正数）`);
    process.exit(2);
}
// 试调时以覆盖后的微调重建敌人库；参考值只取原始生命与伤害，不受微调影响。
const LIB_ENTRIES = TUNE.size ? prepareEnemyEntries(ENEMY_ENTRIES.map((item) => {
    const t = TUNE.get(item.id);
    if (!t) return item;
    const scale = { ...(item.scale || {}) };
    for (const [k, v] of Object.entries(t)) if (v !== undefined) scale[k] = v;
    return { ...item, scale };
})).entries : LIBRARY_ENEMIES;
const TUNE_NOTE = TUNE.size ? `；条目试调 ${arg('--tune', '')}` : '';
const LIBRARY = new Map();
const isLibrary = (source) => source === 'original' || source === 'stitched';
const entryKey = (item) => (item.kind === 'stitched' ? item.profile.id : item.enemyId);
function libraryItems(tier, kind) {
    const key = `${tier}|${kind}`;
    if (!LIBRARY.has(key)) {
        const items = enemyPool({ tier, seed: POOL_SEED }, LIB_ENTRIES).filter((item) => item.kind === kind).map((item) => ({ item, key: entryKey(item) }))
            .filter(({ key: k }) => !ENTRY_ONLY.size || ENTRY_ONLY.has(k));
        items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        LIBRARY.set(key, items);
    }
    return LIBRARY.get(key);
}

// 本地生成回复夹具；当前 assembleClass 忽略旧职业牌字段，职业牌来自 v6 固定池。
const CLASS_VALUE = { className: '剑士', archetype: 'warrior', passive: ['锋锐', 'opening-strength'],
    cards: [['斩一', 'strike', 1], ['斩二', 'strike', 1], ['守三', 'guard', 1], ['守四', 'guard', 1], ['破五', 'bash', 2], ['裂六', 'rend', 1], ['守七', 'brace', 1], ['势八', 'might', 2], ['斩九', 'strike'], ['斩十', 'strike'], ['斩终', 'strike']] };
// 人物技能须取本职业允许的模板（规则 v5 职业白名单）；flurry 属刺客族，战士改用通用族的 twin。
const DECK_VALUE = { hp: 80, passive: ['意志', 'last-stand'], skill: ['星爆连斩', 'twin'], cards: [['剑一', 'strike', 1], ['盾二', 'guard', 1], ['剑三', 'twin', 2], ['愈四', 'mend', 1]] };

const clone = (v) => JSON.parse(JSON.stringify(v));
// --archetypes：all 或逗号分隔的职业键；未知键忽略。缺省 null 表示沿用战士固定卡组。
const ARCHETYPES = (() => {
    const raw = String(arg('--archetypes', ''));
    if (!raw) return null;
    const all = Object.keys(ARCHETYPE_FAMILIES);
    const picked = raw === 'all' ? all : raw.split(',').filter((key) => all.includes(key));
    return picked.length ? picked : null;
})();
const CLASS_RARITIES = ['common', 'uncommon', 'rare', 'epic'];
// 个人牌按费用槽选本职业可解模板；人物技能取第一个允许的模板。
function archetypeValue(entity, archetype) {
    const keys = Object.keys(templatesFor(archetype));
    const slotsOf = (count) => {
        const slots = Array.isArray(entity.input?.costSlots) && entity.input.costSlots.length ? entity.input.costSlots : [1];
        return Array.from({ length: count }, (_, i) => slots[i % slots.length]);
    };
    const cards = (count, rarities, tag) => slotsOf(count).map((cost, i) => {
        const ok = keys.filter((key) => rarities.every((rarity) => solveCardTemplate(key, cost, rarity)));
        if (!ok.length) throw new Error(`职业 ${archetype} 没有 ${cost} 费可解模板`);
        return [`${tag}${i + 1}`, ok[i % ok.length], cost];
    });
    if (entity.kind === 'class') return { className: archetype, archetype, passive: CLASS_VALUE.passive, cards: cards(11, CLASS_RARITIES, '职') };
    if (entity.kind === 'profile-deck') {
        const skill = keys.find((key) => heroSkillFromTemplate(key, { id: 'x', name: 'x' }));
        return { hp: DECK_VALUE.hp, passive: DECK_VALUE.passive, skill: ['本命', skill], cards: cards(4, ['personal'], '个') };
    }
    return ALLY_VALUE;
}
const ai = (mes) => ({ mes, swipe_id: 0, is_user: false });
const user = (mes) => ({ mes, is_user: true });
const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)}%`);

function memoryTables(profile) {
    const t = { profile: clone(profile), ledger: [], attribute: [] };
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger), attribute: clone(t.attribute) });
    t.append = async (kind, records) => {
        for (const r of records) if (!t[kind].some((x) => x.id === r.id && x.version === r.version)) t[kind].push(clone(r));
        return { ok: true, written: records.map((r) => r.id), present: [], rejected: [], pending: [] };
    };
    return t;
}

async function heroProfiles(archetype = null, deckSeed = '') {
    const id = deckSeed ? `pc-balance-${hash32(`deck:${deckSeed}`).toString(16)}` : undefined;
    const entities = deckProfileEntities({ name: HERO, ...(id ? { id } : {}), role: 'protagonist', classes: [] });
    if (ALLY) entities.push(skillProfileEntity({ name: ALLY, role: 'ally' }));
    const fixedValue = (e) => (e.kind === 'class' ? CLASS_VALUE : e.kind === 'profile-skill' ? ALLY_VALUE : DECK_VALUE);
    const request = async (req) => JSON.stringify({ entities: JSON.parse(req.user).entities.map((e) => ({ key: e.key, value: archetype ? archetypeValue(e, archetype) : fixedValue(e) })) });
    const result = await generateEntities(entities, { request, llm: { source: 'tavern' } });
    if (!result.ok) throw new Error(`起始卡组组装失败：${JSON.stringify(result.rejected).slice(0, 300)}`);
    const profiles = generationWrites(result, { createdAt: 1 }).profiles;
    const hero = profiles.find(row => row.definition.kind === 'deck-character')?.definition;
    const cls = profiles.find(row => row.id === hero?.classRef)?.definition;
    const shape = COMBAT_RULES.starterDeckShapeV6;
    const total = Object.values(shape).flat().reduce((sum, n) => sum + n, 0);
    const personal = new Set(hero?.personalPool?.map(card => card.id));
    const counts = new Map();
    for (const cardId of hero?.starterDeck || []) counts.set(cardId, (counts.get(cardId) || 0) + 1);
    const fixedCount = [...counts].filter(([cardId]) => fixedCardGroup(cardId) === cls?.archetype).reduce((sum, [, n]) => sum + n, 0);
    const personalCount = [...counts].filter(([cardId]) => personal.has(cardId)).reduce((sum, [, n]) => sum + n, 0);
    if (hero?.starterDeck?.length !== total || cls?.classPool?.length !== 0 || fixedCount !== total - shape.personal[0] || personalCount !== shape.personal[0]) {
        throw new Error(`非 v6 起始卡组：${JSON.stringify({ archetype, deckSeed, fixedCount, personalCount, total: hero?.starterDeck?.length })}`);
    }
    if (INSPECT_DECKS) {
        const cards = [...counts].map(([cardId, copies]) => {
            const card = fixedCard(cardId) || hero.personalPool.find(card => card.id === cardId);
            const direct = op => card.effects.filter(effect => effect.op === op).reduce((sum, effect) => sum + effect.amount * (op === 'damage' ? effect.hits || 1 : 1), 0);
            return { id: cardId, name: card.name, type: card.type, cost: card.cost, copies, damage: direct('damage'), block: direct('block') };
        });
        console.log(JSON.stringify({ archetype: cls.archetype, deckSeed, fixedCount, personalCount, cards }));
    }
    return profiles;
}

// 属性提升点：主擅长、次擅长依次加到上限，再按其余属性顺序；每条不超过 2 点（buildAllocEntries 的单条上限），模拟玩家正常加点。
function allocPicks(attr) {
    const order = [attr.prefs.major, attr.prefs.minor, ...ABILITY_KEYS.filter((k) => k !== attr.prefs.major && k !== attr.prefs.minor)];
    const picks = [];
    let left = attr.balance;
    for (const k of order) {
        let room = attr.cap - attr.scores[k];
        while (left > 0 && room > 0) {
            const n = Math.min(2, left, room);
            picks.push({ ability: k, amount: n });
            left -= n;
            room -= n;
        }
    }
    return picks;
}

const deckSnapshot = (hero) => hero.deckEntries.map(row => {
    const card = hero.catalog.get(row.cardId);
    if (!card) throw new Error(`参战卡牌缺失：${row.cardId}`);
    return { ...row, card: clone(row.upgraded ? upgradedCardFace(card) : card) };
});

// 在独立内存账本兑现等级奖励；本地模板回复不代表线上模型的模板选择概率。
async function growEliteDeck(ledger, initial) {
    const heroId = initial.attributes.heroId;
    const read = async () => {
        const state = await ledger.effectiveState();
        if (!state.ok || !state.characters.get(heroId)) throw new Error(`成长读回失败：${state.reason || 'hero-missing'}`);
        return state;
    };
    const requireWrite = (result, action) => {
        if (result?.ok !== true) throw new Error(`成长${action}失败：${result?.reason || JSON.stringify(result?.errors || [])}`);
    };
    let state = initial;
    let hero = state.characters.get(heroId);
    const before = { size: hero.deck.length, points: hero.points, draws: [...hero.freeDraws], upgrades: [...hero.freeUpgrades] };
    const growth = { policy: 'level-rewards-v1', flipPolicy: 'seeded-blind', upgradePolicy: 'first-eligible-deck-copy', draws: [], upgrades: [] };
    for (const level of before.draws) {
        const plan = planCardDraw(hero);
        if (!plan) throw new Error(`等级${level}抽卡规划失败`);
        const entity = drawCardEntity({ character: hero, plan });
        const keys = Object.keys(templatesFor(plan.archetype)).filter(key => solveCardTemplate(key, plan.cost, plan.rarity)).sort();
        if (!keys.length) throw new Error(`等级${level}没有可解抽卡模板`);
        const template = keys[hash32(`balance-draw-template|${plan.seed}`) % keys.length];
        const request = async req => JSON.stringify({ entities: JSON.parse(req.user).entities.map(e => ({ key: e.key, value: { card: [`历练${level}`, template] } })) });
        const generated = await generateEntities([entity], { request, llm: { source: 'tavern' }, classes: state.classes });
        const card = generated.ok && generated.accepted.find(item => item.card)?.card;
        if (!card) throw new Error(`等级${level}抽卡装配失败：${JSON.stringify(generated.rejected).slice(0, 300)}`);
        const choices = plan.fixedIds.map(id => clone(fixedCard(id)));
        choices.splice(plan.randomAt, 0, card);
        requireWrite(await ledger.drawCard(heroId, { drawId: plan.drawId, choices, free: { level } }), '抽卡');
        const position = hash32(`balance-draw-flip|${plan.seed}`) % choices.length;
        requireWrite(await ledger.flipCard(heroId, plan.drawId, position), '翻牌');
        state = await read();
        if (state.characters.get(heroId).pendingDraw?.flipped !== position) throw new Error('翻牌位置读回不一致');
        requireWrite(await ledger.pickCard(heroId, plan.drawId, position), '入组');
        state = await read();
        hero = state.characters.get(heroId);
        growth.draws.push({ level, seed: plan.seed, template, position, choices, selected: choices[position].id });
    }
    for (const level of before.upgrades) {
        const row = upgradableRows(hero)[0];
        if (!row) throw new Error(`等级${level}没有可升级副本`);
        requireWrite(await ledger.upgradeCard(heroId, { level, copyId: row.copyId, cardId: row.cardId }), '升级');
        state = await read();
        hero = state.characters.get(heroId);
        if (!hero.deckEntries.some(item => item.copyId === row.copyId && item.upgraded)) throw new Error('升级副本读回不一致');
        growth.upgrades.push({ level, copyId: row.copyId, cardId: row.cardId });
    }
    if (hero.deck.length !== before.size + before.draws.length || hero.points !== before.points
        || hero.freeDraws.length || hero.freeUpgrades.length || hero.pendingDraw || hero.deckNeedsAdjust) {
        throw new Error('等级成长结果不符合抽卡、升级或零支出契约');
    }
    return { state, growth };
}

// 账本世界：走正文标签与扫描入账的真实路径。EXP 楼按剧情每楼封顶 50 写到目标等级；相对档非「相当」时再写一楼 rel 标签
//（档位生效楼的主角等级 + 名字散列偏移，与正文打档一致）；随后把主角的属性提升点全部分配。
async function buildWorld(profiles, level, rel, grown = false) {
    const tables = memoryTables(profiles);
    const chat = [user('开始')];
    let need = 0;
    for (let l = 1; l < level; l += 1) need += expToNextLevel(l);
    for (; need > 0; need -= 50) chat.push(ai(`修炼有成。\n[igs-combat:exp|${HERO}|${Math.min(50, need)}|修炼]${ALLY ? `\n[igs-combat:exp|${ALLY}|${Math.min(50, need)}|修炼]` : ''}`));
    const relLabel = RELS.find((r) => r[0] === rel)?.[1];
    if (rel !== 'even') chat.push(ai(ENEMIES.map((n) => `[igs-combat:rel|${n}|${relLabel}]`).join('\n')));
    const ledger = createCombatLedger({ tables, chat, userName: HERO, now: () => 1 });
    const scanned = await ledger.scan();
    if (!scanned.ok) throw new Error(`账本扫描失败：${JSON.stringify(scanned).slice(0, 300)}`);
    let state = await ledger.effectiveState();
    const heroId = state.ok ? state.attributes.heroId : null;
    if (!heroId || !state.characters.get(heroId)) throw new Error(`主角档案缺失：${state.reason || ''}`);
    const attr = state.characters.get(heroId).attributes;
    if (attr?.balance > 0) {
        const built = buildAllocEntries(normalizeSnapshot(tables.read()), chat, state, heroId, allocPicks(attr), 1);
        if (!built.ok) throw new Error(`属性分配失败：${built.reason}`);
        await tables.append('attribute', built.entries);
        state = await ledger.effectiveState();
    }
    let growth = null;
    if (grown) ({ state, growth } = await growEliteDeck(ledger, state));
    const hero = state.characters.get(heroId);
    if (hero.level !== level || hero.deckNeedsAdjust) throw new Error(`主角状态异常：等级 ${hero.level}，卡组需调整 ${hero.deckNeedsAdjust}`);
    const ally = ALLY ? [...state.characters.values()].find((v) => v.name === ALLY) : null;
    if (ALLY && !ally) throw new Error('助战档案缺失');
    const loadout = { kind: grown ? 'level-rewards' : 'starter', growth, deck: deckSnapshot(hero), points: hero.points,
        freeDraws: [...hero.freeDraws], freeUpgrades: [...hero.freeUpgrades] };
    if (INSPECT_DECKS) console.log(JSON.stringify({ level, rel, heroId, loadout }));
    return { state, hero, ally, loadout };
}

const PURPOSE = { discard: 'discard', copy: 'copy', 'cost-mod': 'cost' };

// 主角回合：待选时按托管选牌；--hero-skill 时人物技能可用就先放（有目标时打最弱的敌人）；其余交给托管出牌，没牌可出就结束回合。
function nextAction(s) {
    if (s.pending) return { type: 'choose', insts: pickCards(s, s.pending.options, s.pending.count, PURPOSE[s.pending.kind] || 'discard') };
    if (HERO_SKILL) {
        const foe = weakestId(s, 'enemy');
        const skill = legalActions(s).find((a) => a.type === 'hero-skill' && !a.skillId && (!a.targetId || a.targetId === foe));
        if (skill) return skill;
    }
    const play = chooseAllyPlay(s, s.controlledId);
    return play ? { type: 'play', ...play } : { type: 'end-turn' };
}

// 托管动作被引擎拒收时改用同一张牌的第一个合法动作，仍不行就结束回合；拒收次数计入报告。动作数用尽记超时，不伪造胜负。
function runBattle(setup, seed, trace = false) {
    const created = createBattle(setup, seed);
    if (!created.ok) return { outcome: 'error', reason: created.error?.reason || 'create-failed' };
    let s = created.state;
    let rejects = 0;
    for (let n = 0; n < MAX_ACTIONS && !s.outcome; n += 1) {
        let action = nextAction(s);
        let r = applyAction(s, action);
        if (trace && n >= TRACE_FROM && n < TRACE_FROM + TRACE_STEPS) {
            const card = action.inst ? cardView(s, action.inst) : null;
            console.log(JSON.stringify({ step: n, turn: s.turn, action: { ...action, ...(card ? { cardId: card.id, name: card.name } : {}) },
                units: s.order.map(id => { const u = s.units[id]; return { id, hp: u.hp, block: u.block, energy: u.energy, statuses: u.statuses, res: u.res }; }),
                events: (r.events || []).filter(e => ['damage', 'block', 'summon', 'minion-loss', 'defeated', 'status'].includes(e.type)),
                outcome: r.state?.outcome, error: r.error }));
        }
        if (!r.ok) {
            rejects += 1;
            action = legalActions(s).find((a) => a.type === 'play' && a.inst === action.inst) || { type: 'end-turn' };
            r = applyAction(s, action);
            if (!r.ok) return { outcome: 'error', reason: r.error?.reason || 'action-rejected', rejects };
        }
        s = r.state;
    }
    const hero = s.units[s.controlledId];
    return { outcome: s.outcome || 'timeout', turn: s.turn, rejects, lost: (hero.maxHp - Math.max(0, hero.hp)) / hero.maxHp,
        ...(!s.outcome ? { diagnostic: { turn: s.turn, units: s.order.map(id => {
            const u = s.units[id]; return { id, hp: u.hp, block: u.block, statuses: u.statuses, res: u.res };
        }), hand: (s.piles[s.controlledId]?.hand || []).map(inst => cardView(s, inst)?.id) } } : {}) };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fixed = (x, d = 1) => (x === null ? '—' : x.toFixed(d));
const DIFF_LABEL = { easy: '轻松', normal: '标准', hard: '困难', brutal: '严酷', nightmare: '噩梦' };
const TIER_LABEL = { normal: '普通', elite: '精英', boss: '首领' };

// 试调：先撤掉规则表的等级系数与等级差系数再换上试调值，最后乘档位试调倍率；只改本场 setup 的敌人单位。le 为敌人推导等级。
function tweak(u, tier, g, le) {
    const [th = 1, td = 1] = TRY[tier] || [];
    let hp = th;
    let dmg = td;
    if (TRY.lv) hp *= (1 + TRY.lv[0] * (le - 1)) / (1 + COMBAT_RULES.tierScalePerLevel * (le - 1));
    if (TRY.gap) {
        const [gh = 0, gd = 0, cap = Infinity] = TRY.gap;
        const gc = Math.min(g, cap);
        hp *= (1 + gh * gc) / (1 + COMBAT_RULES.levelGap.hp * g);
        dmg *= (1 + gd * gc) / (1 + COMBAT_RULES.levelGap.damage * g);
    }
    if (hp !== 1) u.maxHp = Math.max(1, Math.min(9999, Math.round(u.maxHp * hp)));
    if (dmg !== 1) u.damageScale = Math.min(5, Math.round(u.damageScale * dmg * 100) / 100);
    const cut = TRY.affix ? (tier === 'elite' ? TRY.affix[0] : tier === 'boss' ? TRY.affix[1] : 0) || 0 : 0;
    if (cut > 0 && Array.isArray(u.passives)) {
        const affixes = u.passives.filter((p) => p?.source === 'affix');
        const drop = new Set(affixes.slice(Math.max(0, affixes.length - cut)));
        u.passives = u.passives.filter((p) => !drop.has(p));
    }
}

// 一场的敌人档案：模板 / 生成近似按名字构造；原版 / 缝合取特性池第 run 项，按剧情名与档位 ID 物化（与战斗准备 rosterProfiles 同一调用）。
function enemyProfile(source, name, tier, level, run) {
    const t = templateEnemy(name, tier);
    if (source === 'template') return { profile: t, entry: null };
    if (source === 'generated') {
        const { generated: _g, ...rest } = t;
        return { profile: { ...rest, skills: enemyFillSkills({ ...t, skills: [] }, level, 'normal') }, entry: null };
    }
    const items = libraryItems(tier, source);
    const { item, key } = items[run % items.length];
    return { profile: materializeChoice(item, { id: enemyIdFor(name, tier), name }), entry: key };
}

// 一格：敌人名字按场次轮换；阵容只含主角（与开战大厅同形状），setup 由 buildSetup 按当场难度生成；各来源共用同一战斗种子。
function simulateCell(world, level, rel, relLabel, tier, diff, source) {
    const cell = { level, rel, relLabel, tier, diff, count: COUNT, battleWins: WINS, generated: source === 'generated', runs: 0, win: 0, defeat: 0, timeout: 0, error: 0, lost: [], turns: [], samples: [], rejects: 0, heroHp: null, enemyHp: [], enemyLevel: [], crowd: null, reserveCount: null, errors: {}, source, entries: {} };
    cell.loadout = world.loadout;
    cell.assessment = tier === 'elite' && !ELITE_LEVELS.has(level) ? 'stress' : 'formal';
    // 本档位特性池为空（如首领）：整格标不适用，不计失败。
    if (isLibrary(source) && !libraryItems(tier, source).length) return { ...cell, na: true, health: { mean: null, min: null, p10: null, median: null, p90: null, max: null }, target: null };
    const fail = (reason) => { cell.error += 1; cell.errors[reason] = (cell.errors[reason] || 0) + 1; };
    for (let run = 0; run < RUNS; run += 1) {
        // 每轮条目遍历后偏移名字；条目数等于名字数时也能覆盖不同等级偏移和难度特性。
        const cycle = isLibrary(source) ? Math.floor(run / libraryItems(tier, source).length) : 0;
        const name = ENEMIES[(run + cycle) % ENEMIES.length];
        const attr = attributeViewFor(world.state, name);
        const { profile, entry } = enemyProfile(source, name, tier, attr?.level ?? world.hero.level, run);
        const stat = entry ? (cell.entries[entry] ??= { runs: 0, win: 0, defeat: 0 }) : null;
        if (stat) stat.runs += 1;
        cell.runs += 1;
        if (!profile) { fail('materialize-failed'); continue; }
        const lobby = { heroId: world.hero.id, battleWins: WINS, allies: world.ally ? [world.hero, world.ally] : [world.hero], controllable: [world.hero.id],
            enemies: new Map([[name, profile]]), enemyAttributes: attr ? new Map([[name, attr]]) : new Map() };
        const built = buildSetup(lobby, { tier, allies: ALLY ? [ALLY] : [], enemies: [{ name, count: COUNT }] }, { difficulty: diff, userName: HERO });
        if (built.ok && ALLY_SINGLE) for (const u of built.setup.units) delete u.actions;
        if (!built.ok) { fail(built.reason); continue; }
        cell.crowd = built.setup.crowd;
        cell.reserveCount = built.setup.reserve?.length || 0;
        const g = attr ? Math.max(0, attr.level - world.hero.level) : 0;
        for (const u of built.setup.units) if (u.side === 'enemy') tweak(u, tier, g, attr?.level ?? world.hero.level);
        cell.heroHp = built.setup.units.find((u) => u.id === world.hero.id).maxHp;
        cell.enemyHp.push(mean(built.setup.units.filter((u) => u.side === 'enemy').map((u) => u.maxHp)));
        if (attr) cell.enemyLevel.push(attr.level);
        const r = runBattle(built.setup, hash32(`balance|${level}|${rel}|${tier}|${diff}|${run}`), TRACE && run === TRACE_RUN);
        cell.samples.push({ run, enemy: name, ...(entry ? { entry } : {}), outcome: r.outcome, remaining: Number.isFinite(r.lost) ? 1 - r.lost : null, turn: r.turn, rejects: r.rejects || 0 });
        cell.rejects += r.rejects || 0;
        if (r.outcome === 'victory') { cell.win += 1; cell.lost.push(r.lost); cell.turns.push(r.turn); if (stat) stat.win += 1; }
        else if (r.outcome === 'defeat') { cell.defeat += 1; cell.turns.push(r.turn); if (stat) stat.defeat += 1; }
        else if (r.outcome === 'timeout') {
            cell.timeout += 1;
            cell.timeouts ??= [];
            cell.timeouts.push({ run, ...r.diagnostic });
        }
        else fail(r.reason);
    }
    const remaining = cell.lost.map(value => 1 - value).sort((a, b) => a - b);
    const quantile = q => remaining.length ? remaining[Math.floor((remaining.length - 1) * q)] : null;
    cell.health = { mean: mean(remaining), min: quantile(0), p10: quantile(0.1), median: quantile(0.5), p90: quantile(0.9), max: quantile(1) };
    const eligible = tier !== 'elite' || (ELITE_LEVELS.has(level) && world.loadout.kind === 'level-rewards');
    const range = WINS < 5 && diff === 'normal' && eligible ? WIN_TARGETS[`${rel}|${tier}`] : null;
    cell.target = range ? { min: range[0], max: range[1], scope: 'cell',
        passed: cell.win >= range[0] * cell.runs && cell.win <= range[1] * cell.runs
            && cell.error === 0 && cell.timeout === 0 && cell.rejects === 0 } : null;
    return cell;
}

function verdict(c) {
    if (c.assessment === 'stress') return '压力测试（不计D9）';
    if (!c.target) return '';
    const range = `${pct(c.target.min)}–${pct(c.target.max)}`;
    return `${c.target.passed ? '达标' : '未达标'}（${range}）`;
}

const rateOf = (c) => (c.runs ? c.win / c.runs : null);
const loadoutLabel = (c) => c.loadout.kind === 'level-rewards'
    ? `成长${c.loadout.deck.length}张/${c.loadout.growth.draws.length}抽${c.loadout.growth.upgrades.length}升` : `起始${c.loadout.deck.length}张`;
// 显式 --sources 时每行带来源标签；旧调用输出逐字不变。
const srcTag = (c) => (MULTI ? `${SOURCE_LABEL[c.source]} ` : '');
function report(cells) {
    // --brief：逐职业、种子保留胜率、余血分布与错误／超时／动作拒收。
    if (process.argv.includes('--brief')) return cells.map(c => (c.na
        ? `L${c.level} N${c.count} W${c.battleWins} ${c.relLabel}${TIER_LABEL[c.tier]}${DIFF_LABEL[c.diff] || c.diff} ${srcTag(c)}不适用（本档位特性池为空）`
        : `L${c.level} N${c.count} W${c.battleWins} ${c.relLabel}${TIER_LABEL[c.tier]}${DIFF_LABEL[c.diff] || c.diff} ${srcTag(c)}${loadoutLabel(c)} 胜${pct(rateOf(c))} ${verdict(c)} 余血${pct(c.health.mean)} ${fixed(mean(c.turns))}回合 异常${c.error}/${c.timeout}/${c.rejects}`)).join('\n');
    const tried = Object.keys(TRY).length ? `；试调 ${arg('--try', '')}` : '';
    const enemyNote = MULTI ? `来源 ${SOURCES.map((s) => SOURCE_LABEL[s]).join('、')}` : (GENERATED ? '生成敌人近似形状' : '模板敌人');
    const out = ['# 战斗平衡模拟', '', `每格 ${RUNS} 场；敌人 ${COUNT} 只（${enemyNote}，名字轮换 ${ENEMIES.length} 个）；主角${HERO_SKILL ? '使用' : '不使用'}人物技能；托管策略；满血开战${tried}${TUNE_NOTE}。`, ''];
    for (const level of LEVELS) {
        const mine = cells.filter((c) => c.level === level);
        out.push(`## 主角 ${level} 级（标准档生命 ${mine.find((c) => c.diff === 'normal')?.heroHp ?? '—'}）`, '',
            `| 相对档 | 档位 | 难度 |${MULTI ? ' 来源 |' : ''} 敌人等级 | 敌人生命 | 胜率 | 胜利损失生命 | 平均回合 | 败 / 超时 / 错误 / 拒收 | 标准档对照 |`, `|---|---|---|${MULTI ? '---|' : ''}---|---|---|---|---|---|---|`);
        for (const c of mine) {
            const head = `| ${c.relLabel} | ${TIER_LABEL[c.tier]} | ${DIFF_LABEL[c.diff] || c.diff} |${MULTI ? ` ${SOURCE_LABEL[c.source]} |` : ''}`;
            if (c.na) { out.push(`${head} — | — | 不适用 | — | — | — | 本档位特性池为空 |`); continue; }
            const hp = mean(c.enemyHp);
            out.push(`${head} ${fixed(mean(c.enemyLevel))} | ${hp === null ? '—' : Math.round(hp)} | ${pct(rateOf(c))} | ${pct(mean(c.lost))} | ${fixed(mean(c.turns))} | ${c.defeat} / ${c.timeout} / ${c.error} / ${c.rejects} | ${loadoutLabel(c)} ${verdict(c)} |`);
        }
        out.push('');
    }
    if (DIFFS.length > 1) {
        out.push('## 难度梯度（胜率，按难度从低到高）', '', `| 等级 | 相对档 | 档位 |${MULTI ? ' 来源 |' : ''} 各档胜率 | 平均每档降幅 |`, `|---|---|---|${MULTI ? '---|' : ''}---|---|`);
        for (const level of LEVELS) for (const [rel, relLabel] of RELS) for (const tier of TIERS) for (const source of SOURCES) {
            const row = DIFFS.map((d) => cells.find((c) => c.level === level && c.rel === rel && c.tier === tier && c.diff === d && c.source === source));
            if (row.some((c) => !c || c.na)) continue;
            const rates = row.map(rateOf);
            const drop = ((rates[0] - rates[rates.length - 1]) / (rates.length - 1)) * 100;
            out.push(`| ${level} | ${relLabel} | ${TIER_LABEL[tier]} |${MULTI ? ` ${SOURCE_LABEL[source]} |` : ''} ${rates.map(pct).join(' → ')} | ${drop.toFixed(1)} 个百分点 |`);
        }
        out.push('');
    }
    const errors = {};
    for (const c of cells) for (const [k, v] of Object.entries(c.errors)) errors[k] = (errors[k] || 0) + v;
    const rejects = cells.reduce((s, c) => s + c.rejects, 0);
    if (Object.keys(errors).length || rejects) out.push(`异常：错误 ${JSON.stringify(errors)}；托管动作被拒收 ${rejects} 次。`, '');
    return out.join('\n');
}

// 来源校准汇总（仅显式 --sources）：同职业、等级、相对档、档位、难度、场次与战斗种子下，各来源只换敌人档案。
const groupKey = (c) => `${c.archetype ?? '-'}|${c.deckSeed}|${c.level}|${c.rel}|${c.tier}|${c.diff}`;
const groupLabel = (c) => `${c.archetype ?? 'warrior(固定)'}${c.deckSeed ? ` seed=${c.deckSeed}` : ''} L${c.level} ${c.relLabel}${TIER_LABEL[c.tier]}${DIFF_LABEL[c.diff] || c.diff}`;
function calibration(cells) {
    const live = cells.filter((c) => !c.na);
    const out = ['# 敌人来源校准汇总', '', `特性池种子 \`${POOL_SEED}\`；原版 / 缝合按条目键排序后按场次轮换，与模板、生成近似共用同一战斗种子与建局链。生成近似为模板形状技能按档位上限求解，不代表副 LLM 实际输出。`, ''];
    const na = cells.filter((c) => c.na);
    if (na.length) out.push(`不适用格 ${na.length} 个（${[...new Set(na.map((c) => `${TIER_LABEL[c.tier]}${SOURCE_LABEL[c.source]}`))].join('、')}：本档位特性池为空，不计入统计）。`, '');
    out.push('## 来源总览', '', '| 档位 | 来源 | 格数 | 场次 | 胜率 | 平均回合 | 胜利余血 | 败 / 超时 / 错误 / 拒收 |', '|---|---|---|---|---|---|---|---|');
    for (const tier of TIERS) for (const source of SOURCES) {
        const mine = live.filter((c) => c.tier === tier && c.source === source);
        if (!mine.length) continue;
        const runs = mine.reduce((s, c) => s + c.runs, 0);
        const win = mine.reduce((s, c) => s + c.win, 0);
        const sum = (k) => mine.reduce((s, c) => s + c[k], 0);
        out.push(`| ${TIER_LABEL[tier]} | ${SOURCE_LABEL[source]} | ${mine.length} | ${runs} | ${pct(runs ? win / runs : null)} | ${fixed(mean(mine.flatMap((c) => c.turns)))} | ${pct(mean(mine.flatMap((c) => c.lost.map((x) => 1 - x))))} | ${sum('defeat')} / ${sum('timeout')} / ${sum('error')} / ${sum('rejects')} |`);
    }
    out.push('');
    // 均值仅作诊断；目标按组内最差单格判定。
    const byLevel = new Map();
    for (const c of live) {
        const k = `${c.level}|${c.rel}|${c.tier}|${c.diff}|${c.source}`;
        if (!byLevel.has(k)) byLevel.set(k, []);
        byLevel.get(k).push(c);
    }
    out.push('## 分组最差结果（均值仅作诊断）', '', '| 等级 | 相对档 | 档位 | 难度 | 来源 | 职业×种子格数 | 均值 | 最低格 | 最高格 | 逐格目标 |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const group of byLevel.values()) {
        const c0 = group[0];
        const rates = group.map((c) => ({ c, r: rateOf(c) }));
        const avg = mean(rates.map((x) => x.r));
        const lo = rates.reduce((a, b) => (b.r < a.r ? b : a));
        const hi = rates.reduce((a, b) => (b.r > a.r ? b : a));
        const t = c0.target;
        const judge = t ? `${group.every(c => c.target?.passed) ? '全部达标' : `${group.filter(c => !c.target?.passed).length} 格未达标`}（${pct(t.min)}–${pct(t.max)}）` : '';
        out.push(`| ${c0.level} | ${c0.relLabel} | ${TIER_LABEL[c0.tier]} | ${DIFF_LABEL[c0.diff] || c0.diff} | ${SOURCE_LABEL[c0.source]} | ${group.length} | ${pct(avg)} | ${lo.c.archetype ?? '-'} seed=${lo.c.deckSeed} ${lo.c.win}/${lo.c.runs} | ${hi.c.archetype ?? '-'} seed=${hi.c.deckSeed} ${hi.c.win}/${hi.c.runs} | ${judge} |`);
    }
    out.push('');
    // 相对模板的胜率差：同组同种子，只换敌人来源。
    const template = new Map(live.filter((c) => c.source === 'template').map((c) => [groupKey(c), c]));
    const diffs = live.filter((c) => c.source !== 'template' && template.has(groupKey(c)))
        .map((c) => ({ c, d: rateOf(c) - rateOf(template.get(groupKey(c))), base: rateOf(template.get(groupKey(c))) }))
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || a.c.level - b.c.level);
    if (diffs.length) {
        out.push('## 相对模板偏差最大的分组（前 12）', '', '| 分组 | 来源 | 胜率 | 模板胜率 | 差值 | 平均回合 |', '|---|---|---|---|---|---|');
        for (const { c, d, base } of diffs.slice(0, 12)) out.push(`| ${groupLabel(c)} | ${SOURCE_LABEL[c.source]} | ${pct(rateOf(c))} | ${pct(base)} | ${d >= 0 ? '+' : ''}${Math.round(d * 100)} 个百分点 | ${fixed(mean(c.turns))} |`);
        out.push('');
    }
    // 普通与精英均按单格判定；保留最差组和失败总数。
    const off = live.filter((c) => c.target).map((c) => {
        const r = rateOf(c);
        return { c, r, gap: r < c.target.min ? r - c.target.min : r > c.target.max ? r - c.target.max : 0 };
    }).filter((x) => !x.c.target.passed).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    out.push('## 未达标单格（前 12，含异常）', '');
    if (!off.length) out.push('无。', '');
    else {
        out.push('| 分组 | 来源 | 胜率 | 目标 | 偏离 | 错误 / 超时 / 拒收 |', '|---|---|---|---|---|---|');
        for (const { c, r, gap } of off.slice(0, 12)) out.push(`| ${groupLabel(c)} | ${SOURCE_LABEL[c.source]} | ${c.win}/${c.runs}（${pct(r)}） | ${pct(c.target.min)}–${pct(c.target.max)} | ${gap >= 0 ? '+' : ''}${Math.round(gap * 100)} 个百分点 | ${c.error} / ${c.timeout} / ${c.rejects} |`);
        out.push(`未达标单格共 ${off.length} 个。`, '');
    }
    // 条目胜率：跨职业、等级合并；场次为该条目实际参战次数。
    for (const tier of TIERS) for (const source of SOURCES.filter(isLibrary)) {
        const agg = new Map();
        for (const c of live.filter((x) => x.tier === tier && x.source === source)) for (const [key, s] of Object.entries(c.entries)) {
            const a = agg.get(key) || { runs: 0, win: 0, defeat: 0 };
            a.runs += s.runs; a.win += s.win; a.defeat += s.defeat;
            agg.set(key, a);
        }
        if (!agg.size) continue;
        const rows = [...agg].map(([key, a]) => ({ key, ...a, rate: a.runs ? a.win / a.runs : null })).sort((a, b) => a.rate - b.rate || (a.key < b.key ? -1 : 1));
        const shown = rows.length <= 16 ? rows : [...rows.slice(0, 8), null, ...rows.slice(-8)];
        out.push(`## ${TIER_LABEL[tier]}${SOURCE_LABEL[source]}条目胜率（${rows.length} 个条目，按胜率升序${rows.length > 16 ? '，列最低与最高各 8 个' : ''}）`, '', '| 条目 | 场次 | 胜 | 败 | 胜率 |', '|---|---|---|---|---|');
        for (const r of shown) out.push(r ? `| ${r.key} | ${r.runs} | ${r.win} | ${r.defeat} | ${pct(r.rate)} |` : '| … | | | | |');
        out.push('');
    }
    return out.join('\n');
}

const t0 = Date.now();
const cells = [];
for (const archetype of ARCHETYPES || [null]) for (const deckSeed of DECK_SEEDS) {
    const profiles = await heroProfiles(archetype, deckSeed);
    for (const level of LEVELS) for (const [rel, relLabel] of RELS) {
        const world = await buildWorld(profiles, level, rel);
        for (const tier of TIERS) {
            const prepared = tier === 'elite' && ELITE_LEVELS.has(level) ? await buildWorld(profiles, level, rel, true) : world;
            for (const diff of DIFFS) for (const source of SOURCES) cells.push({ ...simulateCell(prepared, level, rel, relLabel, tier, diff, source), archetype, deckSeed });
        }
    }
}
// 分职业时每个职业各出一份报告（--brief 每行前缀职业键）。
const text = ARCHETYPES
    ? ARCHETYPES.map((a) => {
        return DECK_SEEDS.map(seed => {
            const mine = cells.filter(c => c.archetype === a && c.deckSeed === seed);
            const label = `${a}${seed ? ` seed=${seed}` : ''}`;
            return process.argv.includes('--brief') ? report(mine).split('\n').map(line => `${label} ${line}`).join('\n') : `## 职业 ${label}\n\n${report(mine)}`;
        }).join('\n');
    }).join('\n')
    : DECK_SEEDS.map(seed => report(cells.filter(c => c.deckSeed === seed))).join('\n');
const full = MULTI ? `${text}\n\n${calibration(cells)}` : text;
console.log(full);
console.log(`用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
// --out 可逗号分隔：.json 写逐格数据，其余写文本报告。
for (const path of OUT.split(',').map((p) => p.trim()).filter(Boolean)) {
    writeFileSync(path, path.endsWith('.json') ? JSON.stringify(cells, null, 2) : `${full}\n`, 'utf8');
}
