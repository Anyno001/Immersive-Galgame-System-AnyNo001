// 战斗平衡模拟（计划 5.6 / S10）：托管策略（policy.js 的 chooseAllyPlay / pickCards）驾驶模板卡组主角，对战模板敌人，
// 按主角等级 × 相对档 × 遭遇档位 × 难度统计胜率与胜利时主角损失生命。只读调用战斗模块，不进 bundle、不进测试门禁；
// 种子确定，同参数重跑结果一致。结果只反映托管策略的强度，真人操作通常更好。满血开战。
// 用法：node scripts/combat-balance.mjs [--runs 20] [--levels 1,5,10] [--count 1] [--tiers normal,elite,boss]
//       [--rels even,stronger,formidable] [--diffs easy,normal,hard,brutal,nightmare] [--hero-skill] [--out 路径.md|路径.json]
//       [--try normal=1.2x1.5,gap=0.05x0.1x3,lv=0.08]（试调，不改规则表：在 setup 上把该档位敌人生命 × 前值、伤害倍率 × 后值；
//       gap 把规则表的 levelGap 换成生命 / 伤害每级系数（第三项为等级差上限）；lv 把 tierScalePerLevel 换成该值；
//       affix=精英去掉数x首领去掉数，从末尾去掉难度表给的常驻效果）
//       [--archetypes all|warrior,mage]（规则 v5：按职业生成模板卡组并分职业输出；缺省为战士固定卡组）
import { writeFileSync } from 'node:fs';
import { applyAction, createBattle, legalActions } from '../src/combat/engine.js';
import { chooseAllyPlay, pickCards } from '../src/combat/policy.js';
import { COMBAT_RULES, expToNextLevel } from '../src/combat/rules.js';
import { deckProfileEntities, generateEntities, generationWrites, skillProfileEntity, templateEnemy } from '../src/combat/generation.js';
import { enemyFillSkills } from '../src/combat/enemy-loadout.js';
import { attributeViewFor, buildAllocEntries, createCombatLedger, normalizeSnapshot } from '../src/combat/ledger.js';
import { ABILITY_KEYS } from '../src/combat/abilities.js';
import { weakestId } from '../src/combat/battle-state.js';
import { buildSetup } from '../src/combat/session.js';
import { hash32 } from '../src/combat/random.js';
import { ARCHETYPE_FAMILIES, heroSkillFromTemplate, solveCardTemplate, templatesFor } from '../src/combat/card-templates.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
// 逗号分隔的筛选：缺省取全部，未知键忽略。
const only = (name, all, keyOf = (k) => k) => { const want = String(arg(name, '')).split(',').filter(Boolean); return want.length ? all.filter((k) => want.includes(keyOf(k))) : all; };
const RUNS = Math.max(1, Number(arg('--runs', 20)) || 20);
const LEVELS = String(arg('--levels', '1,5,10')).split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= COMBAT_RULES.maxLevel);
const COUNT = Math.min(COMBAT_RULES.maxEnemies, Math.max(1, Number(arg('--count', 1)) || 1));
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
const RELS = only('--rels', [['even', '相当'], ['stronger', '稍强'], ['formidable', '强敌']], (r) => r[0]);
const DIFFS = only('--diffs', Object.keys(COMBAT_RULES.difficulty));
// 计划 5.6 的标准档校准目标：[胜率下限, 上限, 胜利时损失生命下限, 上限]（%）。
const TARGET = { 'normal|even': [85, 95, 25, 45], 'elite|even': [70, 85, 45, 65], 'boss|even': [55, 70, 60, 85], 'normal|stronger': [65, 80, 45, 70], 'normal|formidable': [50, 65, 45, 70] };

// 模板卡组：与 generation 测试同一组模板键（职业 11 张 + 个人 4 张）；费用、稀有度与数值由组装层按规则求解。
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
// 按职业生成模板卡组：每个费用槽轮流取该职业允许、且在所需稀有度下都可解的模板；人物技能取第一个可作人物技能的允许模板。
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

async function heroProfiles(archetype = null) {
    const entities = deckProfileEntities({ name: HERO, role: 'protagonist', classes: [] });
    if (ALLY) entities.push(skillProfileEntity({ name: ALLY, role: 'ally' }));
    const fixedValue = (e) => (e.kind === 'class' ? CLASS_VALUE : e.kind === 'profile-skill' ? ALLY_VALUE : DECK_VALUE);
    const request = async (req) => JSON.stringify({ entities: JSON.parse(req.user).entities.map((e) => ({ key: e.key, value: archetype ? archetypeValue(e, archetype) : fixedValue(e) })) });
    const result = await generateEntities(entities, { request, llm: { source: 'tavern' } });
    if (!result.ok) throw new Error(`模板卡组组装失败${archetype ? `（${archetype}）` : ''}：${JSON.stringify(result.rejected).slice(0, 300)}`);
    return generationWrites(result, { createdAt: 1 }).profiles;
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

// 账本世界：走正文标签与扫描入账的真实路径。EXP 楼按剧情每楼封顶 50 写到目标等级；相对档非「相当」时再写一楼 rel 标签
//（档位生效楼的主角等级 + 名字散列偏移，与正文打档一致）；随后把主角的属性提升点全部分配。
async function buildWorld(profiles, level, rel) {
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
    const hero = state.characters.get(heroId);
    if (hero.level !== level || hero.deckNeedsAdjust) throw new Error(`主角状态异常：等级 ${hero.level}，卡组需调整 ${hero.deckNeedsAdjust}`);
    const ally = ALLY ? [...state.characters.values()].find((v) => v.name === ALLY) : null;
    if (ALLY && !ally) throw new Error('助战档案缺失');
    return { state, hero, ally };
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
function runBattle(setup, seed) {
    const created = createBattle(setup, seed);
    if (!created.ok) return { outcome: 'error', reason: created.error?.reason || 'create-failed' };
    let s = created.state;
    let rejects = 0;
    for (let n = 0; n < MAX_ACTIONS && !s.outcome; n += 1) {
        let action = nextAction(s);
        let r = applyAction(s, action);
        if (!r.ok) {
            rejects += 1;
            action = legalActions(s).find((a) => a.type === 'play' && a.inst === action.inst) || { type: 'end-turn' };
            r = applyAction(s, action);
            if (!r.ok) return { outcome: 'error', reason: r.error?.reason || 'action-rejected', rejects };
        }
        s = r.state;
    }
    const hero = s.units[s.controlledId];
    return { outcome: s.outcome || 'timeout', turn: s.turn, rejects, lost: (hero.maxHp - Math.max(0, hero.hp)) / hero.maxHp };
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

// 一格：敌人名字按场次轮换；阵容只含主角（与开战大厅同形状），setup 由 buildSetup 按当场难度生成。
function enemyProfile(name, tier, level) {
    const t = templateEnemy(name, tier);
    if (!GENERATED) return t;
    const { generated: _g, ...rest } = t;
    return { ...rest, skills: enemyFillSkills({ ...t, skills: [] }, level, 'normal') };
}

function simulateCell(world, level, rel, relLabel, tier, diff) {
    const cell = { level, rel, relLabel, tier, diff, runs: 0, win: 0, defeat: 0, timeout: 0, error: 0, lost: [], turns: [], rejects: 0, heroHp: null, enemyHp: [], enemyLevel: [], errors: {} };
    const fail = (reason) => { cell.error += 1; cell.errors[reason] = (cell.errors[reason] || 0) + 1; };
    for (let run = 0; run < RUNS; run += 1) {
        const name = ENEMIES[run % ENEMIES.length];
        const attr = attributeViewFor(world.state, name);
        const lobby = { heroId: world.hero.id, allies: world.ally ? [world.hero, world.ally] : [world.hero], controllable: [world.hero.id],
            enemies: new Map([[name, enemyProfile(name, tier, attr?.level ?? world.hero.level)]]), enemyAttributes: attr ? new Map([[name, attr]]) : new Map() };
        const built = buildSetup(lobby, { tier, allies: ALLY ? [ALLY] : [], enemies: [{ name, count: COUNT }] }, { difficulty: diff, userName: HERO });
        if (built.ok && ALLY_SINGLE) for (const u of built.setup.units) delete u.actions;
        cell.runs += 1;
        if (!built.ok) { fail(built.reason); continue; }
        const g = attr ? Math.max(0, attr.level - world.hero.level) : 0;
        for (const u of built.setup.units) if (u.side === 'enemy') tweak(u, tier, g, attr?.level ?? world.hero.level);
        cell.heroHp = built.setup.units.find((u) => u.id === world.hero.id).maxHp;
        cell.enemyHp.push(mean(built.setup.units.filter((u) => u.side === 'enemy').map((u) => u.maxHp)));
        if (attr) cell.enemyLevel.push(attr.level);
        const r = runBattle(built.setup, hash32(`balance|${level}|${rel}|${tier}|${diff}|${run}`));
        cell.rejects += r.rejects || 0;
        if (r.outcome === 'victory') { cell.win += 1; cell.lost.push(r.lost); cell.turns.push(r.turn); }
        else if (r.outcome === 'defeat') { cell.defeat += 1; cell.turns.push(r.turn); }
        else if (r.outcome === 'timeout') cell.timeout += 1;
        else fail(r.reason);
    }
    return cell;
}

function verdict(c) {
    const t = c.diff === 'normal' ? TARGET[`${c.tier}|${c.rel}`] : null;
    if (!t) return '';
    const rate = (c.win / c.runs) * 100;
    const lost = mean(c.lost);
    const a = rate < t[0] ? '胜率偏低' : rate > t[1] ? '胜率偏高' : '胜率达标';
    const b = lost === null ? '无胜场' : lost * 100 < t[2] ? '损失偏低' : lost * 100 > t[3] ? '损失偏高' : '损失达标';
    return `${a}、${b}（${t[0]}–${t[1]}% / ${t[2]}–${t[3]}%）`;
}

function report(cells) {
    // --brief：每格一行（等级 相对档 档位 难度 胜率 胜利损失 平均回合），供校准时多组对比。
    if (process.argv.includes('--brief')) return cells.map((c) => `L${c.level} ${c.relLabel}${TIER_LABEL[c.tier]}${DIFF_LABEL[c.diff] || c.diff} ${pct(c.win / c.runs)} ${pct(mean(c.lost))} ${fixed(mean(c.turns))}`).join('\n');
    const tried = Object.keys(TRY).length ? `；试调 ${arg('--try', '')}` : '';
    const out = ['# 战斗平衡模拟', '', `每格 ${RUNS} 场；敌人 ${COUNT} 只（${GENERATED ? '生成敌人近似形状' : '模板敌人'}，名字轮换 ${ENEMIES.length} 个）；主角${HERO_SKILL ? '使用' : '不使用'}人物技能；托管策略；满血开战${tried}。`, ''];
    for (const level of LEVELS) {
        const mine = cells.filter((c) => c.level === level);
        out.push(`## 主角 ${level} 级（标准档生命 ${mine.find((c) => c.diff === 'normal')?.heroHp ?? '—'}）`, '',
            '| 相对档 | 档位 | 难度 | 敌人等级 | 敌人生命 | 胜率 | 胜利损失生命 | 平均回合 | 败 / 超时 / 错误 | 标准档对照 |', '|---|---|---|---|---|---|---|---|---|---|');
        for (const c of mine) {
            const hp = mean(c.enemyHp);
            out.push(`| ${c.relLabel} | ${TIER_LABEL[c.tier]} | ${DIFF_LABEL[c.diff] || c.diff} | ${fixed(mean(c.enemyLevel))} | ${hp === null ? '—' : Math.round(hp)} | ${pct(c.win / c.runs)} | ${pct(mean(c.lost))} | ${fixed(mean(c.turns))} | ${c.defeat} / ${c.timeout} / ${c.error} | ${verdict(c)} |`);
        }
        out.push('');
    }
    if (DIFFS.length > 1) {
        out.push('## 难度梯度（胜率，按难度从低到高）', '', '| 等级 | 相对档 | 档位 | 各档胜率 | 平均每档降幅 |', '|---|---|---|---|---|');
        for (const level of LEVELS) for (const [rel, relLabel] of RELS) for (const tier of TIERS) {
            const rates = DIFFS.map((d) => cells.find((c) => c.level === level && c.rel === rel && c.tier === tier && c.diff === d)).map((c) => c.win / c.runs);
            const drop = ((rates[0] - rates[rates.length - 1]) / (rates.length - 1)) * 100;
            out.push(`| ${level} | ${relLabel} | ${TIER_LABEL[tier]} | ${rates.map(pct).join(' → ')} | ${drop.toFixed(1)} 个百分点 |`);
        }
        out.push('');
    }
    const errors = {};
    for (const c of cells) for (const [k, v] of Object.entries(c.errors)) errors[k] = (errors[k] || 0) + v;
    const rejects = cells.reduce((s, c) => s + c.rejects, 0);
    if (Object.keys(errors).length || rejects) out.push(`异常：错误 ${JSON.stringify(errors)}；托管动作被拒收 ${rejects} 次。`, '');
    return out.join('\n');
}

const t0 = Date.now();
const cells = [];
for (const archetype of ARCHETYPES || [null]) {
    const profiles = await heroProfiles(archetype);
    for (const level of LEVELS) for (const [rel, relLabel] of RELS) {
        const world = await buildWorld(profiles, level, rel);
        for (const tier of TIERS) for (const diff of DIFFS) cells.push({ ...simulateCell(world, level, rel, relLabel, tier, diff), archetype });
    }
}
// 分职业时每个职业各出一份报告（--brief 每行前缀职业键）。
const text = ARCHETYPES
    ? ARCHETYPES.map((a) => {
        const mine = cells.filter((c) => c.archetype === a);
        return process.argv.includes('--brief') ? report(mine).split('\n').map((line) => `${a} ${line}`).join('\n') : `## 职业 ${a}\n\n${report(mine)}`;
    }).join('\n')
    : report(cells);
console.log(text);
console.log(`用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (OUT) writeFileSync(OUT, OUT.endsWith('.json') ? JSON.stringify(cells, null, 2) : `${text}\n`, 'utf8');
