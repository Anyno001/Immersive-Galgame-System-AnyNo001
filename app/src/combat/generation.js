import { COMBAT_RULES } from './rules.js';
import { hashString } from './random.js';
import { effectsDamage, ledgerEntryId, normalizeCard, normalizeProfile, normalizeSkill, profileIdFor, validateStarterDeck } from './schema.js';

// 副 LLM 生成：程序构造请求、解析 JSON、逐实体校验；不合格实体最多定向修正 MAX_FIX_ROUNDS 轮，已通过的不再提交。
// request 与 llm 配置由调用方注入（createSecondaryLlm().request），combat 不读宿主、不落账。
// 这条链路只证明解析与校验正确，不证明模型生成质量。
export const GENERATION_KINDS = Object.freeze(['class', 'profile-deck', 'profile-skill', 'enemy', 'skill-to-card']);
export const MAX_FIX_ROUNDS = 2;

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const err = (path, reason, detail) => (detail === undefined ? { path, reason } : { path, reason, detail });

// 严格就绪：选了独立 API 却缺地址或模型时直接报错，不悄悄改走酒馆。llm 为已归一化的副 LLM 配置。
export function resolveCombatLlm(llmSettings) {
    const llm = isObj(llmSettings) ? llmSettings : {};
    if (llm.source === 'openai') {
        const missing = ['endpoint', 'model'].filter((key) => !String(llm[key] || '').trim());
        if (missing.length) return { ok: false, reason: 'combat-llm-config-incomplete', missing };
        return { ok: true, llm: { ...llm } };
    }
    return { ok: true, llm: { ...llm, source: 'tavern' } };
}

// 允许外层包代码块或前后多一句说明，内容必须是严格 JSON。
export function readGenerationJson(raw) {
    const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const attempt = (s) => {
        try { return { ok: true, value: JSON.parse(s) }; } catch { return null; }
    };
    const whole = attempt(text);
    if (whole) return whole;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return (start >= 0 && end > start && attempt(text.slice(start, end + 1))) || { ok: false, reason: 'combat-reply-not-json' };
}

// 敌人档案 ID 按 名称+档位 推导：同名同档位复用，同名不同档位分开。
export const enemyIdFor = (name, tier) => profileIdFor('enemy', `${tier}:${String(name || '').trim()}`);
// 习得的卡牌/技能 ID 由角色、技能名与来源锚点推导，同一标签重试得到同一 ID。
export const learnedIdFor = (characterId, skill, anchor) => `lc-${hashString([characterId, skill, anchor?.messageId, anchor?.swipeId, anchor?.tagHash, anchor?.occurrence].join('|'))}`;

// 副 LLM 只做填写：身份字段（kind / id / name / tier）由程序填，效果只能组合固定原语。
export const GENERATION_SYSTEM = [
    '你负责为卡牌战斗系统填写结构化数据。只返回 JSON：{"entities":[{"key":"请求里的 key","value":{...}}]}。请求 entities 中的每个 key 恰好出现一次（标注 optional 的可以省略），不输出请求以外的 key，不写注释或解释。',
    'kind、id、name、tier 等身份字段由程序填写，可以省略；input 里给出的固定值必须照用。',
    '效果 effects 只能由以下原语组合，每张卡或每个技能 1–4 个：',
    '- {"op":"damage","amount":1–99,"hits":1–5,"target":"enemy|all-enemies|random-enemy"}',
    '- {"op":"block","amount":1–99,"target":"self|ally|all-allies"}；{"op":"heal","amount":1–60,"target":"self|ally|all-allies"}',
    '- {"op":"draw","amount":1–5}；{"op":"energy","amount":1–3}；{"op":"exhaust-self"}',
    '- {"op":"status","status":"vulnerable|weak|strength|dexterity|poison|regen|thorns","stacks":1–10,"target":目标}',
    '- {"op":"conditional","when":{"kind":"target-has","value":状态名}或{"kind":"self-hp-below","value":1–99}或{"kind":"cards-played-gte","value":1–10},"then":[1–3 个非 conditional 效果]}',
    '卡牌 card：{"id","name":≤20字,"type":"attack|skill|power","cost":0|1|2|3|"X","rarity":"common|uncommon|rare|personal","effects":[...],"upgraded":{"cost"?,"effects"?},"flavor"?:≤80字}。',
    '卡牌价值须贴合费用预算：0 费≈4、1 费≈8、2 费≈14、3 费≈20、X≈7；伤害每点约 1.33、格挡每点 1.6、治疗每点 2、抽一张 4、一点能量 6，群体目标×1.4。超出或明显不足都会被拒收；upgraded 须比原版强，但不超过预算上限的 1.3 倍。',
    '技能 skill：{"id","name":≤20字,"intent":"attack|defend|buff|debuff|heal|special","effects":[...],"weight":1–10,"cooldown":0–5,"description"?:≤80字}。',
    '被动 passive：{"id","name":≤20字,"trigger":"battle-start|turn-start|turn-end|on-hit|on-low-hp","effects":[1–3 个],"description"?}。所有 id 只用字母、数字、- 和 _，同一份档案内不重复。',
    '各 kind 的 value：',
    '- class：{"className":≤12字,"archetype":"warrior|guardian|ranger|assassin|mage|priest|summoner|bard","classPassive":被动,"classPool":[8–16 张卡]}。className 不得与 existingClasses 中已有职业同名。',
    '- profile-deck：{"aliases"?:[≤5 个称呼],"classRef":"input.classRef；没有时填 existingClasses 中合适职业的 id，或省略以使用同一请求里本角色的 class","base":{"hp":按所选职业原型 input.archetypeHp 的范围,"energy":3,"draw":5},"growth":{"hpPerLevel":1–8},"personalPassive":被动,"personalPool":[4–8 张卡，id 不与职业卡重复，可用 personal 稀有度],"starterDeck":[恰好 20 个卡牌 id：basic-strike 3、basic-defend 3、所用职业 classPool 中的卡 10、personalPool 中的卡 4，同名不超过 3]}',
    '- profile-skill：{"aliases"?,"className"?:≤12字,"base":{"hp":20–120},"skills":[3–5 个技能，单个技能总伤害不超过 18],"passives":[1–2 个被动]}',
    '- enemy：{"base":{"hp":input.hpRange 范围内},"skills":[2–5 个技能，单个技能总伤害不超过 input.damageCap],"passives"?:[0–2 个],"phases"?:[{"hpBelowPct":10–90,"addSkills"?:[技能],"removeSkills"?:[技能 id],"passives"?:[被动]}]}；首领至少 1 个阶段。',
    '- skill-to-card：把剧情中的技能写成 input.output 指定的一项，value 为 {"card":卡牌} 或 {"skill":技能}（id 由程序分配，可省略）；input.mode 为 upgrade 时另填 "targetId"：从 input.candidates 里选出被精进的那一项，找不到对应项时填 ""。',
    '带 previousErrors 的实体上一轮被拒收：按其中的字段路径和原因修改 previous，其余部分保持不变。',
].join('\n');

const ARCHETYPE_HP = Object.freeze(Object.fromEntries(Object.entries(COMBAT_RULES.archetypes).map(([key, a]) => [key, [...a.hp]])));
const valuesOf = (m) => (m instanceof Map ? [...m.values()] : Array.isArray(m) ? m : []);
const classSummary = (cls) => ({ id: cls.id, className: cls.className, archetype: cls.archetype, classPool: cls.classPool.map((c) => ({ id: c.id, name: c.name, type: c.type, cost: c.cost })) });

// 有卡组角色：职业已登记（classRef，或 className 与已有职业同名）时只请求个人档案；否则附带一个职业实体，
// 已有职业可供复用且未指定职业名时该实体可省略。role 为 protagonist / ally。
export function deckProfileEntities({ name, id = profileIdFor('deck-character', name), role = 'ally', classRef = null, className = '', classes } = {}) {
    const named = className ? valuesOf(classes).find((c) => c.className === className) : null;
    const ref = classRef || named?.id || null;
    const entities = [];
    let classKey = null;
    if (!ref) {
        classKey = `class:${id}`;
        const optional = !className && valuesOf(classes).length > 0;
        const fixed = className ? { className } : {};
        entities.push({ key: classKey, kind: 'class', role, owner: id, ...(optional ? { optional: true } : {}), input: { ...fixed }, fixed });
    }
    entities.push({
        key: `deck:${id}`, kind: 'profile-deck', role, owner: id,
        input: { name, archetypeHp: ARCHETYPE_HP, ...(ref ? { classRef: ref } : {}) },
        fixed: { kind: 'deck-character', id, name, ...(ref ? { classRef: ref } : {}) },
        ...(classKey ? { classKey } : {}),
    });
    return entities;
}

export function skillProfileEntity({ name, id = profileIdFor('skill-character', name), role = 'ally' } = {}) {
    return { key: `skill:${id}`, kind: 'profile-skill', role, owner: id, input: { name }, fixed: { kind: 'skill-character', id, name } };
}

// 敌人：同名同档位复用已有档案，批量杂兵共享一份。返回 { entities, reused }。
export function enemyEntities({ enemies, tier = 'normal', existing, partyLevel = 1 } = {}) {
    const rule = COMBAT_RULES.tiers[tier];
    if (!rule) return { entities: [], reused: [], error: 'combat-tier-unknown' };
    const have = existing instanceof Map ? existing : new Map(valuesOf(existing).map((p) => [p.id, p]));
    const entities = [];
    const reused = [];
    const seen = new Set();
    for (const { name } of Array.isArray(enemies) ? enemies : []) {
        const id = enemyIdFor(name, tier);
        if (seen.has(id)) continue;
        seen.add(id);
        if (have.has(id)) {
            reused.push(id);
            continue;
        }
        entities.push({
            key: `enemy:${id}`, kind: 'enemy', role: 'enemy', owner: id,
            input: { name, tier, hpRange: [Math.round(rule.hp * 0.5), Math.round(rule.hp * 1.5)], damageCap: rule.damageCap, partyLevel },
            fixed: { kind: 'enemy', id, name, tier },
        });
    }
    return { entities, reused };
}
// 成长标签（账本 pendingGeneration 的一项）→ 生成实体或可直接落账的条目。character 为账本 effectiveState 中的角色视图。
// class 标签：职业已登记时直接给出 class 条目，不请求；learn / upgrade：有卡组角色生成卡牌，无卡组角色生成技能。
export function growthEntity(pending, character, { classes, now = 0 } = {}) {
    if (!character) return { error: 'combat-character-missing' };
    const { anchor } = pending;
    const key = `growth:${ledgerEntryId(pending.kind, character.id, anchor)}`;
    if (pending.kind === 'class') {
        const existing = valuesOf(classes).find((c) => c.className === pending.className);
        if (existing) {
            return { entry: { id: ledgerEntryId('class', character.id, anchor), type: 'class', character: character.id, anchor, payload: { classRef: existing.id }, createdAt: now } };
        }
        const fixed = { className: pending.className };
        return { entity: { key, kind: 'class', role: 'growth', owner: character.id, anchor, input: { ...fixed, characterName: character.name }, fixed } };
    }
    const output = character.kind === 'deck-character' ? 'card' : 'skill';
    const candidates = output === 'card'
        ? [...character.owned.keys()].map((id) => ({ id, name: character.catalog.get(id)?.name ?? id }))
        : character.skills.map((s) => ({ id: s.id, name: s.name }));
    return {
        entity: {
            key, kind: 'skill-to-card', role: 'growth', owner: character.id, anchor,
            learnedId: learnedIdFor(character.id, pending.skill, anchor),
            input: { characterName: character.name, skill: pending.skill, description: pending.description || '', mode: pending.kind, output, ...(pending.kind === 'upgrade' ? { candidates } : {}) },
        },
    };
}

// 修正耗尽时的模板敌人：只用规则表数值，标记 generated:false，战前界面据此标注「模板敌人」。
export function templateEnemy(name, tier = 'normal') {
    const rule = COMBAT_RULES.tiers[tier] || COMBAT_RULES.tiers.normal;
    const key = COMBAT_RULES.tiers[tier] ? tier : 'normal';
    const profile = {
        kind: 'enemy', id: enemyIdFor(name, key), name: String(name || '敌人').trim().slice(0, 20) || '敌人', tier: key, generated: false,
        base: { hp: rule.hp },
        skills: [
            { id: 't-strike', name: '猛击', intent: 'attack', effects: [{ op: 'damage', amount: Math.round(rule.damageCap * 0.6) }], weight: 3 },
            { id: 't-guard', name: '防备', intent: 'defend', effects: [{ op: 'block', amount: 6 }], weight: 1 },
        ],
        ...(key === 'boss' ? { phases: [{ hpBelowPct: 50, addSkills: [{ id: 't-fury', name: '狂怒', intent: 'buff', effects: [{ op: 'status', status: 'strength', stacks: 2 }], weight: 1, cooldown: 2 }] }] } : {}),
    };
    return normalizeProfile(profile).value;
}

// 请求：每轮只含仍待处理的实体；被拒收的实体附上一轮回复与字段路径错误，供定向修正。
export function buildGenerationRequest(slots, { context = {}, classes = [] } = {}) {
    const payload = {
        context,
        existingClasses: valuesOf(classes).map(classSummary),
        entities: slots.map((slot) => {
            const { entity, previous, errors } = slot.entity ? slot : { entity: slot };
            return {
                key: entity.key, kind: entity.kind, ...(entity.optional ? { optional: true } : {}), input: entity.input,
                ...(errors && previous !== undefined ? { previous } : {}), ...(errors ? { previousErrors: errors } : {}),
            };
        }),
    };
    return { system: GENERATION_SYSTEM, user: JSON.stringify(payload) };
}

export function profileRecord(profile, { version = 1, createdAt = 0, className } = {}) {
    return { id: profile.id, name: profile.name || profile.className, kind: profile.kind, className: className ?? profile.className ?? '', version, createdAt, definition: profile };
}
const classIdFor = (className) => profileIdFor('class', className);
const merged = (value, fixed) => ({ ...(isObj(value) ? value : {}), ...fixed });
// 已登记职业 + 本批已通过的职业。
const knownClasses = (ctx) => [...ctx.classes, ...[...ctx.accepted.values()].map((r) => r?.profile).filter((p) => p?.kind === 'class')];

// 单个实体校验。返回 { ok:true, result } / { ok:false, errors } / { deferred:true }（等同批职业先有结论）。
function validateEntity(entity, value, ctx) {
    if (!isObj(value)) return { ok: false, errors: [err('', 'expected-object')] };
    if (entity.kind === 'class') {
        const className = entity.fixed.className ?? value.className;
        const n = normalizeProfile(merged(value, { ...entity.fixed, kind: 'class', id: classIdFor(className) }));
        if (!n.ok) return { ok: false, errors: n.errors };
        if (knownClasses(ctx).some((c) => c.className === n.value.className)) return { ok: false, errors: [err('className', 'class-name-exists')] };
        const entry = entity.role === 'growth' ? { entry: growthEntry(entity, 'class', { classRef: n.value.id }, ctx.now) } : {};
        return { ok: true, result: { profile: n.value, ...entry } };
    }
    if (entity.kind === 'profile-deck') {
        const batchClass = entity.classKey ? ctx.accepted.get(entity.classKey)?.profile : null;
        const classRef = entity.fixed.classRef ?? batchClass?.id ?? value.classRef;
        // 同批职业还没有结论时先挂起，不把缺少 classRef 当作卡组本身的错误去修正。
        if (!classRef && entity.classKey && !ctx.settled.has(entity.classKey)) return { deferred: true };
        const n = normalizeProfile(merged(value, { ...entity.fixed, ...(classRef ? { classRef } : {}) }));
        if (!n.ok) return { ok: false, errors: n.errors };
        const cls = batchClass || knownClasses(ctx).find((c) => c.id === n.value.classRef) || null;
        if (!cls) {
            if (entity.classKey && !ctx.settled.has(entity.classKey)) return { deferred: true };
            return { ok: false, errors: [err('classRef', 'class-unknown')] };
        }
        const shape = validateStarterDeck(n.value, cls);
        return shape.ok ? { ok: true, result: { profile: n.value } } : { ok: false, errors: shape.errors };
    }
    if (entity.kind === 'profile-skill' || entity.kind === 'enemy') {
        const n = normalizeProfile(merged(value, entity.fixed));
        return n.ok ? { ok: true, result: { profile: n.value } } : { ok: false, errors: n.errors };
    }
    return validateGrowth(entity, value, ctx);
}

function growthEntry(entity, type, payload, now) {
    return { id: ledgerEntryId(type, entity.owner, entity.anchor), type, character: entity.owner, anchor: entity.anchor, payload, createdAt: now };
}

// skill-to-card：卡牌 / 技能 ID 由程序分配；upgrade 找不到目标时转为 learn 并记诊断。
function validateGrowth(entity, value, ctx) {
    const { input } = entity;
    const field = input.output;
    const raw = value[field];
    if (!isObj(raw)) return { ok: false, errors: [err(field, 'expected-object')] };
    let mode = input.mode;
    const diagnostics = [];
    if (mode === 'upgrade' && !(input.candidates || []).some((c) => c.id === value.targetId)) {
        mode = 'learn';
        diagnostics.push({ code: 'combat-upgrade-as-learn', key: entity.key, targetId: value.targetId ?? null });
    }
    const id = mode === 'upgrade' ? value.targetId : entity.learnedId;
    const n = field === 'card' ? normalizeCard({ ...raw, id }) : normalizeSkill({ ...raw, id });
    if (!n.ok) return { ok: false, errors: n.errors.map((e) => ({ ...e, path: e.path ? `${field}.${e.path}` : field })) };
    if (field === 'skill' && effectsDamage(n.value.effects) > COMBAT_RULES.allySkillDamageCap) {
        return { ok: false, errors: [err('skill.effects', 'damage-cap', { cap: COMBAT_RULES.allySkillDamageCap })] };
    }
    const payload = mode === 'upgrade' ? { targetId: id, [field]: n.value } : { [field]: n.value };
    return { ok: true, result: { entry: growthEntry(entity, mode, payload, ctx.now) }, diagnostics };
}
const KIND_ORDER = Object.freeze({ class: 0, 'profile-deck': 1, 'profile-skill': 2, enemy: 3, 'skill-to-card': 4 });
const cancelled = (accepted) => ({ ok: false, reason: 'request-stale', accepted: [], rejected: [], diagnostics: [], discarded: accepted.size });

// 本轮回复 → key 到 value；重复 key 只认第一次，请求以外的 key 只记诊断。
function replyValues(raw, keys, diagnostics) {
    const parsed = readGenerationJson(raw);
    if (!parsed.ok || !Array.isArray(parsed.value?.entities)) return { error: parsed.ok ? 'combat-reply-shape' : parsed.reason };
    const values = new Map();
    for (const item of parsed.value.entities) {
        const key = isObj(item) ? item.key : undefined;
        if (!keys.has(key)) diagnostics.push({ code: 'combat-reply-unknown-key', key: typeof key === 'string' ? key.slice(0, 80) : null });
        else if (values.has(key)) diagnostics.push({ code: 'combat-reply-duplicate-key', key });
        else values.set(key, item.value);
    }
    return { values };
}

function rejection(entity, errors) {
    const out = { key: entity.key, kind: entity.kind, role: entity.role, owner: entity.owner, errors: errors.slice(0, 8) };
    // 敌人修正耗尽改用模板敌人（不入库）；主角进入 blocked；队友本次不参战。
    if (entity.kind === 'enemy') out.fallback = { kind: 'template-enemy', profile: templateEnemy(entity.fixed.name, entity.fixed.tier) };
    else if (entity.role === 'protagonist') out.fallback = { kind: 'blocked' };
    else if (entity.role === 'ally') out.fallback = { kind: 'skip' };
    return out;
}

// 生成主流程：首轮提交全部实体，之后每轮只提交仍未通过的实体（附上一轮回复与错误），最多修正 maxRounds 轮。
// request(req, llm) 为注入的副 LLM 调用；signal 中止或迟到的结果一律返回 request-stale，已通过的实体也不交付。
export async function generateEntities(entities, { request, llm = {}, signal, context = {}, classes = [], now = 0, maxRounds = MAX_FIX_ROUNDS } = {}) {
    const ready = resolveCombatLlm(llm);
    if (!ready.ok) return { ok: false, reason: ready.reason, missing: ready.missing, accepted: [], rejected: [], diagnostics: [] };
    if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable', accepted: [], rejected: [], diagnostics: [] };
    const list = [...(Array.isArray(entities) ? entities : [])].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const ctx = { classes: valuesOf(classes), accepted: new Map(), settled: new Set(), now };
    const diagnostics = [];
    const rejected = [];
    const held = new Map();
    let active = list.map((entity) => ({ entity }));
    let requests = 0;

    const settle = (entity, value) => {
        const checked = validateEntity(entity, value, ctx);
        if (checked.deferred) return { deferred: true };
        if (checked.ok) {
            ctx.accepted.set(entity.key, checked.result);
            ctx.settled.add(entity.key);
            diagnostics.push(...(checked.diagnostics || []));
            return { ok: true };
        }
        return { ok: false, errors: checked.errors };
    };

    for (let round = 0; round <= maxRounds && (active.length || held.size); round += 1) {
        const next = [];
        if (active.length) {
            if (signal?.aborted) return cancelled(ctx.accepted);
            let raw;
            try {
                requests += 1;
                raw = await request(buildGenerationRequest(active, { context, classes: ctx.classes }), { ...ready.llm, ...(signal ? { signal } : {}) });
            } catch (error) {
                if (signal?.aborted || error?.reason === 'request-stale') return cancelled(ctx.accepted);
                const detail = String(error?.message || error).slice(0, 160);
                for (const slot of [...active, ...held.values()]) rejected.push(rejection(slot.entity, [err('', 'combat-llm-request-failed', { detail })]));
                active = [];
                held.clear();
                break;
            }
            if (signal?.aborted) return cancelled(ctx.accepted);
            const reply = replyValues(raw, new Set(active.map((s) => s.entity.key)), diagnostics);
            for (const slot of active) {
                const { entity } = slot;
                if (reply.error) {
                    next.push({ entity, previous: slot.previous, errors: [err('', reply.error)] });
                    continue;
                }
                if (!reply.values.has(entity.key)) {
                    if (entity.optional) ctx.settled.add(entity.key);
                    else next.push({ entity, previous: slot.previous, errors: [err('', 'entity-missing')] });
                    continue;
                }
                const value = reply.values.get(entity.key);
                const outcome = settle(entity, value);
                if (outcome.deferred) held.set(entity.key, { entity, value });
                else if (!outcome.ok) next.push({ entity, previous: value, errors: outcome.errors });
            }
        }
        // 等职业结论的卡组角色：职业已通过或已无法通过时重核，不重新提交尚未被拒的回复。
        const lastRound = round === maxRounds;
        for (const [key, slot] of [...held]) {
            const classKey = slot.entity.classKey;
            if (lastRound && !ctx.settled.has(classKey)) ctx.settled.add(classKey);
            const outcome = settle(slot.entity, slot.value);
            if (outcome.deferred) continue;
            held.delete(key);
            if (!outcome.ok) next.push({ entity: slot.entity, previous: slot.value, errors: outcome.errors });
        }
        if (lastRound) {
            for (const slot of next) rejected.push(rejection(slot.entity, slot.errors));
            active = [];
        } else active = next;
    }
    for (const slot of held.values()) rejected.push(rejection(slot.entity, [err('classRef', 'class-unknown')]));

    const accepted = list.filter((e) => ctx.accepted.has(e.key))
        .map((e) => ({ key: e.key, kind: e.kind, role: e.role, owner: e.owner, ...ctx.accepted.get(e.key) }));
    return {
        ok: rejected.length === 0,
        accepted,
        rejected,
        diagnostics,
        requests,
        blocked: rejected.some((r) => r.fallback?.kind === 'blocked'),
    };
}

// 待落账内容：通过的档案进档案表，成长条目进日志表；模板敌人不入库，由会话在内存中使用。
export function generationWrites(result, { createdAt = 0 } = {}) {
    const profiles = [];
    const entries = [];
    for (const item of result?.accepted || []) {
        if (item.profile) profiles.push(profileRecord(item.profile, { createdAt }));
        if (item.entry) entries.push(item.entry);
    }
    return { profiles, entries };
}





