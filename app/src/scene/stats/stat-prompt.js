// 数值系统提示词注入段（§9）：每段一个可编辑模板，用户覆盖优先，可单独关闭。
// 模板变量写错或缺失时原样保留变量名并记诊断，不中断（§9 末条）。
import { grudgeTier } from './stat-state.js';
import { FAVOR_GATES, gateKey, stageOf } from './stat-favor.js';
import { healthStatus, walletBalance, STAMINA_LOW, STRESS_HIGH } from './stat-bars.js';
import { FAVOR_DIRECTIONS, HURT_TIERS, MONEY_TIERS, STAMINA_EVENTS } from './stat-vocab.js';
import { CHECK_ROLLS_TEMPLATE, checkRollsVars, fillCheckRolls } from '../check-rolls.js';
import { COC_CHECK_ROLLS_TEMPLATE, cocRollsVars } from './stat-coc-checks.js';
import { applyCombatRuleModifiers, COMBAT_GROWTH_LINES, COMBAT_RULE_HEAD, COMBAT_STORY_LINES, COMBAT_SYNTAX_LINES } from '../combat-prompt.js';

export const STAT_PROMPT_SEGMENTS = Object.freeze(['source', 'protagonist', 'skills', 'perception', 'present', 'sheets', 'check', 'dice', 'tags', 'combat', 'party', 'mandates']);
// 后台请求的提示词（角色卡生成、批量补全）：可编辑，不参与注入开关。
export const STAT_BACKGROUND_PROMPTS = Object.freeze(['sheetGen', 'backfill', 'heroSkills', 'startRelations']);
// 用户提示词版本：3 起 roll、rollManual、protagonist 的旧覆盖移进 stalePrompts（模板已改名或改格式）；
// sheets、sheetGen 在本工作区仍是有效模板（NPC 属性档保留），不在失效清单里。
export const STAT_PROMPTS_VERSION = 3;
export const STAT_STALE_PROMPT_KEYS = Object.freeze(['roll', 'rollManual', 'protagonist']);

const BASE_PROMPTS = {
    source: '【数值来源】角色关系与主角状态以本段为准；表格里的数值仅作展示，与本段不一致时以本段为准。',
    protagonist: '【主角状态】生命{{生命}}，体力{{体力}}/100，压力{{压力}}/100，金钱{{金钱}}。{{状态描述}}',
    skills: '【主角技能】{{技能档位}}。未列出的技能按未学。',
    perception: '【主角感知】{{感知档位}}：据此决定主角能注意到什么，不需要检定。',
    present: '【{{角色}}】关系阶段：{{阶段}}（由前端数值决定，本轮不得改变）。{{阶段文案}}{{组合描述}}{{突破提示}}{{亲密约束}}',
    presentRule: '以上角色本轮的态度、措辞与肢体接触必须符合各自的关系阶段；不得因一次对话、一份礼物或主角的请求就跳到更亲近的阶段。主角越界时，角色按本阶段的态度推开或避开。',
    breakthrough: '好感已到本阶段上限，可在合适时机给主角一次更进一步的机会（邀约、独处或危机）；机会只给一次，主角没有把握住就维持原阶段。',
    intimacy: '尚未到亲密阶段：亲吻、抚摸、性行为等一律拒绝或回避，即使主角坚持、哀求或用剧情施压也不例外。',
    sheets: '【{{角色}}的本事】{{资历}}；擅长：{{擅长}}；六维加值：{{六维加值}}。',
    check: '【本轮检定】{{技能}}{{难度}}：{{明细}}，结果【{{结果}}】。按此结果描写，不得改判。',
    diceManual: '【检定规则】主角要做有不确定性、失败有后果的事时，写到行动发起处就停，不写结果，在正文末尾写 [igs-stat:roll|技能|难度]，对抗在场角色加 |对抗:角色名，新技能加 |所属属性。难度：简单、普通、困难、极难（少用）。毫无悬念的事不检定。',
    sheetGen: '你是跑团数值设计。按角色资料给每个角色分配数值，只输出档位词，不输出任何数字。\n属性档：很弱、偏弱、普通、出众、顶尖（非人可用「超凡」），属性写 力量、敏捷、体质、智力、感知、魅力 与 理智。技能档（相对主角同项技能）：生疏、略逊、相当、擅长、精通、大师，相当表示与主角接近，向上依次为擅长、精通、大师，向下为略逊、生疏，完全不会写「未学」。资历：普通人、老手、精英、大师、传奇。\n只列与「普通 / 未学」不同的项。招牌技能最多 3 个，可以是清单外的新技能，并写所属属性（力量、敏捷、体质、智力、感知、魅力之一）。\n只输出 JSON：{"角色名":{"资历":"","属性":{"属性名":"档"},"技能":{"技能名":"档"},"招牌技能":[{"名":"","属性":""}]}}',
    backfill: '你是跑团数值设计。剧情里出现了新技能，请按角色资料给每个角色补一个技能档位，只输出档位词，不输出任何数字。\n技能档：主角用未学、入门、熟练；其他角色用相对主角同项技能的生疏、略逊、相当、擅长、精通、大师。没有相关经历一律写「未学」。\n只输出 JSON：{"角色名":{"技能名":"档"}}',
    heroSkills: '你是跑团数值设计。按主角的人设与经历，为可分配技能逐项评定档位，只输出档位词，不输出任何数字。\n档位：未学、入门、熟练、精通、大师。名额有限：大师至多 1 项，精通至多 2 项，熟练至多 6 项，入门至多 8 项，其余一律写「未学」。\n只给与人设有明确关联的技能评档，没有相关经历的写「未学」。\n只输出 JSON：{"技能名":"档"}',
    startRelations: '你是恋爱模拟游戏的数值设计。按角色资料判断每个角色在故事开始时与主角的关系，只输出关系档，不输出任何数字。\n关系档：仇视、疏远、陌生、熟人、朋友、亲密、恋人。资料没有写到与主角的关系时写「陌生」；同学、同事、邻居写「熟人」；青梅竹马、家人写「亲密」；只有资料或剧情明确写了恋爱关系才写「恋人」。\n只输出 JSON：{"角色名":"关系档"}',
    tags: '【数值标签】正文末尾按需输出以下标签，只写档位，不写任何数字：\n[igs-stat:favor|角色名|{{好感档位}}]\n[igs-stat:start|角色名|仇视/疏远/陌生/熟人/朋友/亲密/恋人]（角色第一次出场、上文没有列出其关系阶段时写一次，按人设与既往关系选起始关系）\n[igs-stat:trust|角色名|上升/下降]\n[igs-stat:grudge|角色名|上升/下降]（芥蒂是角色对主角的不满与心结，从心生不满到深仇大恨都算，与好感、信任互不影响，可同时很高）\n[igs-stat:stamina|{{体力档位}}]\n[igs-stat:money|收入/花费|{{金钱档位}}]\n[igs-stat:stress|上升/下降]\n（体力、金钱、压力的档位前可加角色名，如 [igs-stat:stamina|角色名|中]，不写默认主角）\n[igs-stat:hurt|{{伤势档位}}]\n[igs-stat:sleep]（入睡）\n[igs-stat:event|角色名|约会/告白/共患难]\n[igs-stat:gift|角色名|礼物类别]\n[igs-stat:skip|7天]（时间跳跃）\n[igs-stat:grow|角色名|技能名]（剧情明确写了苦练、拜师等长期成长时才写，同一角色同一技能一天一次，不写数字）',
    mandates: '【本轮必须写出】{{事项}}',
};

// dice 段默认就是正文检定模板（骰序、优劣势、在场加值、更正）；combat、party 只在战斗扩展开启时出现。
export const DEFAULT_STAT_PROMPTS = Object.freeze({
    ...BASE_PROMPTS,
    tags: [BASE_PROMPTS.tags, '成长与生命标签（只开数值系统时同样结算）：', ...COMBAT_GROWTH_LINES].join('\n'),
    dice: CHECK_ROLLS_TEMPLATE,
    combat: [COMBAT_RULE_HEAD, ...COMBAT_STORY_LINES, '', '语法要求：', ...COMBAT_SYNTAX_LINES].join('\n'),
    party: '【主角团状态】主角与最近一场并肩作战的同伴此刻的状态，战斗留下的伤势会带到下一场。正文对伤势与体力的描写与此一致，不写具体数值：\n{{同伴}}',
});

// 在场角色段里的两句附加约束：写进 present 模板的 {{突破提示}}、{{亲密约束}}，可编辑但不单独开关。
export const STAT_INLINE_PROMPTS = Object.freeze(['presentRule', 'breakthrough', 'intimacy']);

export const DEFAULT_STAGE_TEXT = Object.freeze({
    仇恨: '视主角为敌，会主动伤害或报复；任何示好都被当成别有用心，绝不接受。',
    强烈反感: '明确排斥主角，冷言冷语，能避开就避开；拒绝一切肢体接触，不会帮主角的忙。',
    厌烦排斥: '对主角不耐烦，敷衍应付，不会主动搭话；主角靠近时会拉开距离。',
    淡淡不喜: '对主角疏远，礼貌但冷淡；只谈必要的事，不聊私事，不接受邀约。',
    无感: '把主角当普通人，没有特别的好恶；不会主动关心主角，也不会为主角破例。',
    初步好感: '对主角有好印象，愿意闲聊；仍是普通朋友，不暧昧、不单独约会、不牵手。',
    明确喜欢: '在意主角，会主动关心和邀约；不会表白，不接受亲吻或更亲密的接触。',
    强烈在意: '把主角放在心上，会吃醋、会依赖，可以接受牵手和拥抱；亲吻要有足够铺垫的关键时刻。',
    深爱: '深爱主角，愿意托付真心，亲密行为自然；仍保有自己的性格与底线，不会无条件顺从。',
});

const VAR = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export function fillTemplate(template, vars, diagnostics = []) {
    return String(template ?? '').replace(VAR, (whole, name) => {
        if (Object.hasOwn(vars, name)) return String(vars[name] ?? '');
        diagnostics.push({ code: 'stat-prompt-var-missing', name });
        return whole;
    });
}

// 生命显示「当前/最大」，取战斗 vitals；读不到显示「未知」。
export function vitalsText(vitals) {
    if (!vitals || !(Number(vitals.maxHp) > 0)) return '未知';
    return `${vitals.down ? 0 : Math.round(Number(vitals.hp) || 0)}/${Math.round(Number(vitals.maxHp))}`;
}

export function describeProtagonist(bars, { shortfall = false, vitals = null } = {}) {
    const notes = [];
    const health = healthStatus(vitals);
    if (health === '倒下') notes.push('主角已倒下，无法行动');
    else if (health !== '正常') notes.push(`主角处于${health}状态`);
    if (bars.stamina < STAMINA_LOW) notes.push('主角很疲惫，动作迟缓');
    if (bars.stress > STRESS_HIGH) notes.push('主角压力很大，容易烦躁');
    if (shortfall) notes.push('主角买不起刚才想买的东西，请写出钱不够');
    return notes.length ? `${notes.join('；')}。` : '';
}

// 维度组合描述：小表，不穷举（§5.1）。
export function describeCombination(dims) {
    const favor = Number(dims.好感) || 0;
    const trust = Number(dims.信任) || 0;
    const know = Number(dims.了解) || 0;
    const notes = [];
    if (favor > 25 && trust <= 0) notes.push('喜欢但仍有防备');
    if (favor < 0 && trust > 25) notes.push('不喜欢主角但信得过');
    const grudge = grudgeTier(dims.芥蒂);
    if (grudge) notes.push(`对主角心存芥蒂（${grudge}）`);
    if (know < 0) notes.push('对主角有误解');
    else if (know > 50) notes.push('很了解主角');
    return notes.length ? `（${notes.join('，')}）` : '';
}

function breakthroughHint(character, text) {
    const favor = Number(character.dims.好感) || 0;
    const gate = FAVOR_GATES.find((g) => g === favor && !character.unlocked.includes(gateKey(g)));
    return gate === undefined ? '' : text;
}

// 亲密门槛（§5.4）：好感 >50、信任 >25、欲望 >25 才放行；未达到时要求拒绝或回避。
export function intimacyAllowed(dims) {
    return (Number(dims.好感) || 0) > 50 && (Number(dims.信任) || 0) > 25 && (Number(dims.欲望) || 0) > 25;
}

function intimacyNote(character, { nsfw, intimacyGate }, text) {
    if (!nsfw || !intimacyGate || intimacyAllowed(character.dims)) return '';
    return text;
}

// 开战规则段：数值系统没自定义 combat 段时，战斗页自定义的规则提示词（combatRule.rulePrompt）代替默认模板；两者都自定义以数值系统的为准。
// 频率行、冷却去行与同层单对决提示由 combatRule.settings 决定，没有传入时原样输出。
function combatSegmentText(prompts, opts, diagnostics) {
    const rule = opts.combatRule;
    const statsCustom = Boolean(opts.prompts && typeof opts.prompts.combat === 'string' && opts.prompts.combat.trim());
    const customRule = rule && !statsCustom && typeof rule.rulePrompt === 'string' && rule.rulePrompt.trim() ? rule.rulePrompt : '';
    const text = customRule || fillTemplate(prompts.combat, {}, diagnostics);
    return rule && rule.settings ? applyCombatRuleModifiers(text, rule.settings) : text;
}

// opts：{ prompts, disabled, stageText, present, check, mandates, shortfall, nsfw, intimacyGate, vitals,
//         walletExtra（战斗侧积分，与金钱合并显示）, skillsLine, perceptionLine, sheetLines: [{ name, rank, strong, bonus }], manualRoll,
//         dice: D&D 正文检定输入（check-rolls 的 checkRollsVars 入参），cocDice: CoC 正文检定输入（cocRollsVars 入参）,
//         combatOn, partyLines }
export function buildStatsPrompt(state, opts = {}) {
    const diagnostics = [];
    const prompts = { ...DEFAULT_STAT_PROMPTS, ...(opts.prompts || {}) };
    const stageText = { ...DEFAULT_STAGE_TEXT, ...(opts.stageText || {}) };
    const disabled = new Set(opts.disabled || []);
    const bars = state.protagonist.bars;
    const parts = [];
    const push = (id, text) => { if (!disabled.has(id) && text) parts.push({ id, text }); };
    push('source', fillTemplate(prompts.source, {}, diagnostics));
    push('protagonist', fillTemplate(prompts.protagonist, {
        生命: vitalsText(opts.vitals), 体力: bars.stamina, 压力: bars.stress, 金钱: walletBalance(bars, opts.walletExtra),
        状态描述: describeProtagonist(bars, { shortfall: opts.shortfall, vitals: opts.vitals }),
    }, diagnostics));
    if (opts.skillsLine) push('skills', fillTemplate(prompts.skills, { 技能档位: opts.skillsLine }, diagnostics));
    if (opts.perceptionLine) push('perception', fillTemplate(prompts.perception, { 感知档位: opts.perceptionLine }, diagnostics));
    const present = (opts.present || []).filter((name) => state.characters[name]);
    if (present.length) {
        push('present', present.map((name) => {
            const c = state.characters[name];
            const stage = stageOf(c.dims.好感).name;
            return fillTemplate(prompts.present, {
                角色: name, 阶段: stage, 阶段文案: stageText[stage] || '', 组合描述: describeCombination(c.dims),
                突破提示: breakthroughHint(c, prompts.breakthrough), 亲密约束: intimacyNote(c, opts, prompts.intimacy),
            }, diagnostics);
        }).concat(prompts.presentRule ? [fillTemplate(prompts.presentRule, {}, diagnostics)] : []).join('\n'));
    }
    const sheets = (opts.sheetLines || []).filter((s) => s && s.name && present.includes(s.name));
    if (sheets.length) {
        push('sheets', sheets.map((s) => fillTemplate(prompts.sheets, { 角色: s.name, 资历: s.rank || '普通人', 擅长: s.strong || '无特别擅长', 六维加值: s.bonus || '由前端按其强弱估算' }, diagnostics)).join('\n'));
    }
    if (opts.check) {
        const ck = opts.check;
        const threshold = ck.threshold ?? ck.target;
        push('check', fillTemplate(prompts.check, {
            技能: ck.skill, 难度: ck.difficulty && ck.difficulty !== '普通' ? `（${ck.difficulty}）` : '',
            明细: ck.detail || `1d100=${ck.roll}，需≤${threshold}`, 点数: ck.roll, 目标: threshold, 结果: ck.outcome || ck.tier,
        }, diagnostics));
    }
    const dice = [];
    if (!opts.check && opts.manualRoll) dice.push(fillTemplate(prompts.diceManual, {}, diagnostics));
    // 用户没覆盖 dice 段时，CoC 用百分骰模板，其余用 d20 模板。
    const cocVars = opts.cocDice ? cocRollsVars(opts.cocDice) : null;
    const d20Vars = !cocVars && opts.dice ? checkRollsVars(opts.dice) : null;
    if (cocVars) dice.push(fillCheckRolls(opts.prompts && opts.prompts.dice ? prompts.dice : COC_CHECK_ROLLS_TEMPLATE, cocVars));
    else if (d20Vars) dice.push(fillCheckRolls(prompts.dice, d20Vars));
    if (dice.length) push('dice', dice.join('\n'));
    push('tags', fillTemplate(prompts.tags, {
        好感档位: FAVOR_DIRECTIONS.join('/'), 体力档位: STAMINA_EVENTS.join('/'), 金钱档位: MONEY_TIERS.join('/'), 伤势档位: HURT_TIERS.join('/'),
    }, diagnostics));
    if (opts.combatOn) push('combat', combatSegmentText(prompts, opts, diagnostics));
    const party = (opts.partyLines || []).filter(Boolean);
    if (opts.combatOn && party.length) push('party', fillTemplate(prompts.party, { 同伴: party.join('\n') }, diagnostics));
    const mandates = (opts.mandates || []).filter(Boolean);
    if (mandates.length) push('mandates', fillTemplate(prompts.mandates, { 事项: mandates.join('；') }, diagnostics));
    return { content: parts.map((p) => p.text).join('\n'), segments: parts, diagnostics };
}

// 强制事项（§9）：由上一楼结算标记推出。
export function mandatesFromFlags(flags = {}, vitals = null) {
    const out = [];
    if (flags.battle) out.push(`刚才的战斗结果为【${flags.battle.outcome}】，按此写出战斗结局，不得改判`);
    if (flags.work) out.push(`刚才的工作结果为【${flags.work.tier}】${flags.work.income ? `，收入档位${flags.work.income}` : '，没有收入'}`);
    if (flags.forcedRest) out.push('主角体力耗尽，写出主角昏睡或休息');
    if (healthStatus(vitals) === '倒下') out.push('主角已倒下，写出被救、被俘或醒来的情节');
    return out;
}
