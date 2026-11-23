import { ASI_POINTS, DEFAULT_REL_TIER, asiCountAt, defaultPrefs, deriveAbilities, levelCap, normalizePrefs, prefsFromScores, relLevel } from '../../combat/abilities.js';
import { COMBAT_RULES, expProgress } from '../../combat/rules.js';
import { hash32 } from '../../combat/random.js';

export const INIT_EDIT_CHANGE = '手改';
const order = { rel: 0, story: 1, reward: 2, alloc: 3 };
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const isBase = row => row.type === 'init' || row.type === 'hero-base' || row.type === 'npc-base';
const empty = () => ({ init: null, initId: null, heroBase: null, heroBaseId: null, heroUncapped: false, initTime: -1, rel: [], story: [], reward: [], alloc: [] });

export function foldAttributes(records, actorKey, scanFloor, diagnostics) {
    const fold = new Map(), inactive = [];
    const bucketFor = character => {
        const key = actorKey(character) ?? character;
        if (!fold.has(key)) fold.set(key, empty());
        return fold.get(key);
    };
    for (const row of records.filter(isBase).sort((a, b) => a.createdAt - b.createdAt || byId(a, b))) {
        const bucket = bucketFor(row.character);
        if (row.type === 'npc-base') {
            bucket.npcBase = row.payload.scores;
            bucket.npcBaseId = row.id;
            bucket.initTime = row.createdAt;
        } else if (row.type === 'hero-base') {
            if ((bucket.init || bucket.heroBase || bucket.npcBase) && row.change !== INIT_EDIT_CHANGE) {
                diagnostics.push({ code: 'combat-attribute-init-duplicate', id: row.id, character: row.character });
            } else {
                bucket.heroBase = row.payload.scores;
                bucket.heroUncapped = row.payload.uncapped === true;
                bucket.heroBaseId = row.id;
                bucket.initTime = row.createdAt;
            }
        } else if ((bucket.init || bucket.heroBase || bucket.npcBase) && row.change !== INIT_EDIT_CHANGE) {
            diagnostics.push({ code: 'combat-attribute-init-duplicate', id: row.id, character: row.character });
        } else {
            bucket.init = row.payload;
            bucket.heroBase = null;
            bucket.heroUncapped = false;
            bucket.heroBaseId = null;
            delete bucket.npcBase;
            delete bucket.npcBaseId;
            bucket.initId = row.id;
            bucket.initTime = row.createdAt;
        }
    }
    const events = records.filter(r => !isBase(r)).sort((a, b) => a.anchor.messageId - b.anchor.messageId
        || order[a.type] - order[b.type] || a.anchor.occurrence - b.anchor.occurrence || byId(a, b));
    for (const row of events) {
        const { messageId, swipeId, tagHash, occurrence } = row.anchor;
        const floor = scanFloor(messageId);
        const reason = !floor ? 'message-missing' : floor.swipeId !== swipeId ? 'swipe-changed'
            : row.type !== 'alloc' && !floor.keys.has(`${tagHash}#${occurrence}`) ? 'tag-missing' : null;
        if (reason) inactive.push({ id: row.id, reason });
        else bucketFor(row.character)[row.type].push(row);
    }
    return { fold, inactive };
}

const roles = Object.keys(COMBAT_RULES.archetypes);
const roleFor = (name, archetype) => roles.includes(archetype) ? archetype : roles[hash32(`role:${name}`) % roles.length];

export function computeAttributes({ key, name, protagonist, exp = 0, archetype, className = '', gearBonuses = [], fallbackPrefs = null }, context) {
    const bucket = context.fold.get(key) || empty();
    const init = bucket.init;
    const heroBase = protagonist && bucket.heroBase ? bucket.heroBase : null;
    const heroUncapped = Boolean(protagonist && bucket.heroUncapped);
    const role = init?.role ?? roleFor(name, archetype);
    const prefs = heroBase ? prefsFromScores(heroBase) : init ? { major: init.major, minor: init.minor, weak: init.weak } : normalizePrefs(fallbackPrefs) || defaultPrefs(role);
    const relation = protagonist ? null : bucket.rel.at(-1)?.payload;
    const tier = protagonist ? null : relation?.tier ?? DEFAULT_REL_TIER;
    const level = protagonist ? expProgress(exp).level : relation
        ? Math.max(1, Math.min(levelCap(false), relation.anchorLevel + relation.offset))
        : relLevel({ name, tier, anchorLevel: context.heroLevel });
    const picks = bucket.alloc.flatMap(row => row.payload.picks || [row.payload]);
    const grants = [...bucket.story, ...bucket.reward].map(row => row.payload);
    const adjustments = [...grants.filter(item => item.ability !== 'free'), ...picks];
    // 角色卡删除或重生成只撤掉它点名取代的那条手改；之后确认的手改 ID 不同，仍然生效。
    const ownBase = !protagonist && bucket.npcBase && !context.baseDrops?.has(bucket.npcBaseId) ? bucket.npcBase : null;
    const legacyBase = !protagonist && !init && !ownBase ? context.sheetBases?.get(name) : null;
    const npcBase = !protagonist && (ownBase || legacyBase);
    const input = { prefs, name, level, protagonist, tier: tier ?? DEFAULT_REL_TIER, base: init?.scores, heroBase, heroUncapped, npcBase, adjustments };
    const permanent = deriveAbilities(input);
    const effective = gearBonuses.length ? deriveAbilities({ ...input, adjustments: [...adjustments, ...gearBonuses] }) : permanent;
    const free = grants.reduce((n, item) => n + (item.ability === 'free' ? item.amount : 0), 0);
    const spent = picks.reduce((n, item) => n + item.amount, 0);
    const balance = protagonist ? Math.max(0, asiCountAt(level, true) * ASI_POINTS + free - spent) : 0;
    const baseId = heroBase ? bucket.heroBaseId : ownBase ? bucket.npcBaseId : null;
    const revision = JSON.stringify([key, bucket.initId, level, ...(heroBase ? [bucket.heroBaseId] : []), ...(npcBase ? [baseId || legacyBase] : []), ...[...bucket.rel, ...bucket.story, ...bucket.reward, ...bucket.alloc].map(row => row.id)]);
    const initialized = !!(init || heroBase || npcBase);
    const source = initialized ? 'formal' : (protagonist ? 'default' : 'relative');
    return { key, className: className || init?.className || '', role, prefs, initialized, uncapped: heroUncapped, source, protagonist: !!protagonist,
        tier, relTagged: !!relation, level, ...effective, permanentScores: permanent.scores, balance, table: context.table, revision, baseId };
}
