// 数值系统提示词注入段（§9）：每段一个可编辑模板，用户覆盖优先，可单独关闭。
// 模板变量写错或缺失时原样保留变量名并记诊断，不中断（§9 末条）。
import { grudgeTier, isRomance } from './stat-state.js';
import { hasTrait, traitCatalogOf } from './stat-traits.js';
import { compileCaptureRegex } from './stat-date.js';
import { landmineMandate } from './stat-trait-landmines.js';
import { FAVOR_GATES, gateKey, stageOf } from './stat-favor.js';
import { healthStatus, walletBalance, STAMINA_LOW, STRESS_HIGH } from './stat-bars.js';
import { FAVOR_PROMPT_GROUPS, FAVOR_STRENGTHS, STRESS_STRENGTHS, HURT_TIERS, INTIMATE_LEVELS, MONEY_TIERS, STAMINA_EVENTS } from './stat-vocab.js';
import { CHECK_ROLLS_TEMPLATE, checkRollsVars, fillCheckRolls } from '../check-rolls.js';
import { COC_CHECK_ROLLS_TEMPLATE, cocRollsVars } from './stat-coc-checks.js';
import { fameLines, fameTagLines } from './stat-fame.js';
import { STATUS_TAG_LINE, statusPromptLines } from './stat-status.js';
import { BREAK_TAG_LINE, OBSESSED_NOTE, STRESS_EXTREME, STRESS_SOURCE_TAG_LINE, strainSentence, stressLimitActive } from './stat-strain.js';
import { applyCombatRuleModifiers, COMBAT_GROWTH_LINES, COMBAT_RULE_HEAD, COMBAT_STORY_LINES, COMBAT_SYNTAX_LINES } from '../combat-prompt.js';

export const STAT_PROMPT_SEGMENTS = Object.freeze(['source', 'protagonist', 'fame', 'skills', 'perception', 'present', 'status', 'sheets', 'check', 'dice', 'tags', 'combat', 'party', 'mandates']);
// 后台请求的提示词（角色卡生成、批量补全）：可编辑，不参与注入开关。
export const STAT_BACKGROUND_PROMPTS = Object.freeze(['sheetGen', 'backfill', 'heroSkills', 'startRelations']);
// 用户提示词版本：3 起 roll、rollManual、protagonist 的旧覆盖移进 stalePrompts（模板已改名或改格式）；
// sheets、sheetGen 在本工作区仍是有效模板（NPC 属性档保留），不在失效清单里。
export const STAT_PROMPTS_VERSION = 3;
export const STAT_STALE_PROMPT_KEYS = Object.freeze(['roll', 'rollManual', 'protagonist']);

const BASE_PROMPTS = {
    source: '【数值来源】角色关系与主角状态以下列数值为准；表格中的数值仅供展示，不一致时以下列数值为准。',
    protagonist: '【主角状态】生命{{生命}}，体力{{体力}}/100，压力{{压力}}/100，金钱{{金钱}}。{{状态描述}}',
    skills: '【主角技能】{{技能档位}}。未列出的技能视为未学。',
    perception: '【主角感知】{{感知档位}}：主角能注意到什么由此决定，无需检定。',
    present: '【{{角色}}】关系阶段：{{阶段}}（由数值系统决定，本轮不得改变）。{{阶段文案}}{{组合描述}}{{突破提示}}{{亲密约束}}',
    presentRule: '以上角色本轮的态度、措辞与肢体接触必须符合各自的关系阶段；不得因一次对话、一份礼物或主角的请求就进入更亲近的阶段。主角做出超出当前阶段的亲近举动时，角色按本阶段的态度推开或避开。',
    breakthrough: '好感已达本阶段上限，可在合适的时机给主角一次更进一步的机会（如邀约、独处或一场危机）；机会只给一次，主角未能把握就维持原阶段。',
    intimacyForced: '与主角的亲密行为是剧情所迫，并非出于好感；态度、言语与神情仍按当前关系阶段和芥蒂程度表现，不因亲密行为而变得温顺或亲近。',
    intimacy: '尚不满足亲密条件：亲吻、抚摸、性行为等一律拒绝或回避，即使主角坚持、哀求或以剧情相逼也不例外。',
    sheets: '【{{角色}}的能力】{{资历}}；擅长：{{擅长}}；属性加值：{{六维加值}}。',
    check: '【本轮检定】{{技能}}{{难度}}：{{明细}}，结果为【{{结果}}】。正文按此结果描写，不得改判。',
    diceManual: '【检定规则】主角要做有不确定性、失败有后果的事时，写到行动发起处就停，不写结果，在正文末尾写 [igs-stat:roll|技能|难度]，对抗在场角色时追加 |对抗:角色名，使用新技能时追加 |所属属性。难度分为简单、普通、困难、极难，极难应少用。毫无悬念的事不检定。',
    sheetGen: '你是跑团数值设计。按角色资料给每个角色分配数值，只输出档位词，不输出任何数字。\n属性档：很弱、偏弱、普通、出众、顶尖（非人可用「超凡」），属性写 力量、敏捷、体质、智力、感知、魅力 与 理智。技能：从可用技能里按人设选「擅长」3 项、「比较擅长」5 项，其余技能不写。资历：普通人、老手、精英、大师、传奇。\n属性只列与「普通」不同的项。招牌技能最多 3 个，可以是清单外的新技能，并写所属属性（力量、敏捷、体质、智力、感知、魅力之一）。\n只输出 JSON：{"角色名":{"资历":"","属性":{"属性名":"档"},"擅长":["技能名"],"比较擅长":["技能名"],"招牌技能":[{"名":"","属性":""}]}}',
    backfill: '你是跑团数值设计。剧情里出现了新技能，请按角色资料给每个角色补一个技能档位，只输出档位词，不输出任何数字。\n技能档：主角用未学、入门、熟练、精通、大师；其他角色用相对主角同项技能的生疏、略逊、相当、擅长、精通、大师。没有相关经历一律写「未学」。\n只输出 JSON：{"角色名":{"技能名":"档"}}',
    heroSkills: '你是跑团数值设计。按主角的人设与经历，为可分配技能逐项评定档位，只输出档位词，不输出任何数字。\n档位：未学、入门、熟练、精通、大师。名额有限：大师至多 1 项，精通至多 2 项，熟练至多 6 项，入门至多 8 项，其余一律写「未学」。\n只给与人设有明确关联的技能评档，没有相关经历的写「未学」。\n只输出 JSON：{"技能名":"档"}',
    startRelations: '你是恋爱模拟游戏的数值设计。按主角资料、剧情设定和角色资料判断每个角色在故事开始时与主角的关系，只输出关系档，不输出任何数字。\n主角资料和剧情设定里写到的与某角色的关系同样算数，例如写明某角色喜欢、依恋或讨厌主角。\n关系档：仇视、疏远、陌生、熟人、朋友、亲密、恋人。两份资料都没有写到与主角的关系时写「陌生」；同学、同事、邻居写「熟人」；青梅竹马、家人写「亲密」；只有资料或剧情明确写了恋爱关系才写「恋人」。\n关系中另有猜忌或旧怨时，在关系档后加「+修饰」，最多两个：猜忌（怀疑主角，如怀疑出轨）、戒备（提防主角）、心结（对主角有不满或隔阂）、积怨（长期怨恨）、背叛过（曾被主角背叛）。没有就不加。\n只输出 JSON：{"角色名":"关系档"}，例如 {"林夏":"恋人+猜忌"}',
    tags: [
        '【数值标签】正文末尾按需输出以下标签，只写档位，不写数字。',
        '总则：',
        '- 关系类标签只记角色对主角本人（而非其身体）态度的变化；角色此刻的情绪、因他人或无关之事而起的情绪、尚未针对主角的误会，以及主角自己的心意，都不写。',
        '- 伪装或身份未揭晓时按真实身份写，被附身时按掌控身体的意识写；只对具名个人写，群体、代词、无名者与临时称呼不写。',
        '- 亲密行为本身不算好感事件，按主角在过程中的态度判断；压力按主角的感受写，放松为下降，紧张、担心、被迫为上升；伤势只记真实受伤，双方同意的玩法中的疼痛不写。',
        '- 强度可省略（好感按方向词默认，信任、芥蒂按小，压力按中）：小＝日常小事，中＝用心或较为突出的事，大＝强烈打动或伤害，重大＝约会、告白、共患难、托付生死或背叛决裂，正向重大需同楼写 event 标签。',
        '关系：',
        '[igs-stat:start|角色名|仇视/疏远/陌生/熟人/朋友/亲密/恋人]（角色首次出场且上文未列出关系阶段时写一次；有猜疑或旧怨时加「+猜忌/戒备/心结/积怨/背叛过」，一直跟在主角身边加「+随身」，没有实体的残魂、器灵、系统加「+无实体」，如 恋人+猜忌）',
        '[igs-stat:startfix|角色名|信任/芥蒂|轻/中/重]（开场后才揭示的旧有隔阂，每个角色每项只写一次）',
        '[igs-stat:favor|角色名|{{好感档位}}|{{强度}}]（尴尬不是害羞；吃醋只在角色因占有欲或在意而真的对主角不满时写，恋人、家人、朋友皆可，玩笑或乐在其中不写，吃醋已含芥蒂，不另写 grudge）',
        '[igs-stat:trust|角色名|上升/下降|{{强度}}]（上升如守约、出面善后、危难时挺身而出；下降如说谎、爽约、出卖）',
        '[igs-stat:grudge|角色名|上升/下降|{{强度}}]（芥蒂是对主角的不满与心结，可与好感同时很高；上升如被敷衍、冷落、羞辱，下降如道歉、弥补、释怀、接纳、和解）',
        '[igs-stat:know|角色名|上升/下降]（深谈、得知主角的秘密或真实一面时上升，发现此前对主角的看法有误时下降）',
        '[igs-stat:event|角色名|约会/告白/共患难/交心]（约会、告白只在角色发起或接受时写，被拒不写；交心用于朋友、家人间的深谈、托付秘密、并肩扛事）',
        '[igs-stat:event|角色名|夸奖/批评/拒绝/背叛/求助/信仰质疑/耳语/重逢/提起/守约/失约/顶撞/命令/冷落/炫耀]（仅作记录，事件发生时写一次：被夸奖、被批评、被拒绝、遭背叛、向TA求助、质疑其信仰、耳语、久别重逢、被他人提起；顶撞、命令、冷落、炫耀只记主角对TA做的：主角当面反驳TA或与TA硬碰硬、主角不容商量地对TA下令、主角有意不理睬TA或把TA晾在一旁、主角当面向TA夸耀财富成就或魅力；与上一行的关键事件不同，不影响关系进展）',
        '[igs-stat:event|角色名|吸血/歌唱/发情]（正文有吸血、歌唱、发情的描写时写一次）',
        '[igs-stat:gift|角色名|礼物类别]',
        '生活（档位前可加角色名，不写角色名则指主角）：',
        '[igs-stat:stamina|{{体力档位}}]',
        '[igs-stat:money|收入/花费|{{金钱档位}}]',
        '[igs-stat:stress|上升/下降|{{压力强度}}]（上升：小＝琐事烦心，中＝受批评、争吵，大＝重大失败、亲友出事，极大＝创伤性事件，如遭到侵犯、目睹亲友死亡、被至亲背叛；下降：小＝小憩，中＝娱乐、倾诉，大＝心事彻底解决）',
        '[igs-stat:hurt|{{伤势档位}}]',
        '[igs-stat:hero|离体/复归]（主角死亡、昏迷或灵魂离体时写离体，回到身体时写复归）',
        '[igs-stat:sleep]（入睡）；[igs-stat:skip|7天]（时间跳跃）',
        '成长：',
        '[igs-stat:grow|角色名|技能名]（苦练、拜师等长期成长时写，同一技能每天最多一次）',
        '[igs-stat:insight|角色名|技能名]（想通、开窍或生死关头的突破时写；日常练习用 grow）',
    ].join('\n'),
    mandates: '【本轮必须写出】{{事项}}',
    fame: '【声望】以下是各方对相关人物的看法，正文中旁人的反应须与之相符：\n{{声望}}',
    status: '【角色状态】以下状态由数值系统记录，正文中须与之相符：\n{{状态}}',
};

// dice 段默认就是正文检定模板（骰序、优劣势、在场加值、更正）；combat、party 只在战斗扩展开启时出现。
export const DEFAULT_STAT_PROMPTS = Object.freeze({
    ...BASE_PROMPTS,
    tags: [BASE_PROMPTS.tags, '成长与生命标签（只开数值系统时同样结算）：', ...COMBAT_GROWTH_LINES].join('\n'),
    dice: CHECK_ROLLS_TEMPLATE,
    combat: [COMBAT_RULE_HEAD, ...COMBAT_STORY_LINES, '', '语法要求：', ...COMBAT_SYNTAX_LINES].join('\n'),
    party: '【主角团状态】以下是主角与最近一场并肩作战的同伴当前的状态，战斗留下的伤势会带到下一场。正文对伤势与体力的描写须与之相符，不写具体数值：\n{{同伴}}',
});

// 在场角色段里的两句附加约束：写进 present 模板的 {{突破提示}}、{{亲密约束}}，可编辑但不单独开关。
export const STAT_INLINE_PROMPTS = Object.freeze(['presentRule', 'breakthrough', 'intimacy', 'intimacyForced']);

// 非恋爱对象（含亲人）的阶段文案：只覆盖初步好感、明确喜欢、强烈在意、深爱四档，负向与无感沿用 DEFAULT_STAGE_TEXT。
export const DEFAULT_STAGE_TEXT_PLATONIC = Object.freeze({
    初步好感: '对主角有好印象，愿意闲聊、帮些小忙；交往仍有分寸。',
    明确喜欢: '在意主角，会主动关心、分享近况，愿意为主角花时间。',
    强烈在意: '把主角放在心上，遇事会想到主角，会依赖也会护着主角。',
    深爱: '视主角为最重要的人之一，愿意托付心事与信任；仍保有自己的性格与底线，不会无条件顺从。',
});

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

export const STAMINA_OVERDRAWN = '主角体力透支，头晕乏力，难以继续行动';

// dateMode：本聊天已捕捉状态栏日期，体力归零不强制入睡，改为提示透支（替换「很疲惫」一句）。
export function describeProtagonist(bars, { shortfall = false, vitals = null, dateMode = false } = {}) {
    const notes = [];
    const health = healthStatus(vitals);
    if (health === '倒下') notes.push('主角已倒下，无法行动');
    else if (health !== '正常') notes.push(`主角处于${health}状态`);
    if (dateMode && bars.stamina <= 0) notes.push(STAMINA_OVERDRAWN);
    else if (bars.stamina < STAMINA_LOW) notes.push('主角很疲惫，动作迟缓');
    // 压力转换后或撑到极限时，改写对应状态句（只有 rev ≥ 2 的楼会写出这些字段）。
    const strain = strainSentence('主角', bars);
    if (strain) notes.push(strain);
    else if (bars.stress > STRESS_HIGH) notes.push('主角压力很大，容易烦躁');
    if (shortfall) notes.push('主角钱不够，买不起刚才想买的东西，正文需写出这一点');
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

// 亲密门槛（§5.4）：欲望 >25，或好感 >50 且信任 >25，满足其一即放行；都不满足时要求拒绝或回避。
// 恋爱对象沿用原逻辑；非恋爱对象只认欲望（亲人 >50，其余 >25）。不传 role 时按恋爱对象。
export function intimacyAllowed(dims, { romance = true, kin = false } = {}) {
    const desire = Number(dims.欲望) || 0;
    if (!romance) return desire > (kin ? 50 : 25);
    if (desire > 25) return true;
    return (Number(dims.好感) || 0) > 50 && (Number(dims.信任) || 0) > 25;
}

// forced：该角色已开「亲密门槛豁免」，门槛未达时不再要求拒绝，改用 intimacyForced。
function intimacyNote(character, { nsfw, intimacyGate, forced, role }, text, forcedText) {
    if (!nsfw || !intimacyGate || intimacyAllowed(character.dims, role)) return '';
    return forced ? forcedText : text;
}

export const INTIMATE_TAG_LINE = `[igs-stat:intimate|角色名|${INTIMATE_LEVELS.join('/')}]（发生亲密行为时写：轻＝亲吻、爱抚，中、重按激烈程度区分；对象是无名者或多人时，角色名写群体）`;
export const DESIRE_TAG_LINE = '[igs-stat:desire|角色名|上升/下降]（欲望是对主角的身体吸引；只在正文明确写出角色对主角本人动了心思时上升，被冒犯、兴致被打断、遭冷落时下降；不因穿着、外貌或意外接触而写，尴尬、回避不写）';
// 低频标签按需出现：有恋爱对象时才给「恋爱结束」，有近期可退的信任下降、芥蒂上升时才给「误会解除」。
export const ROMANCE_END_TAG_LINE = '[igs-stat:romance|角色名|结束]（恋爱关系真正结束、角色已放下这段感情时写一次，如分手后释怀、和平离婚、约定做回朋友；吵架、冷战、暂时分开、赌气说分手、仍在挽回或仍有留恋时不写）';
export const CLEAR_TAG_LINE = '[igs-stat:clear|角色名]（误会澄清、真相大白时写；误会仍在、只是道歉或暂时和好时不写）';

function conditionalTagLines(state, opts) {
    const entries = Object.entries(state.characters || {});
    const lines = [];
    if (entries.some(([name, c]) => isRomance(c, name, opts.romanceSeen))) lines.push(ROMANCE_END_TAG_LINE);
    if (entries.some(([, c]) => Array.isArray(c && c.recentHurts) && c.recentHurts.length)) lines.push(CLEAR_TAG_LINE);
    return lines;
}

// 有人撑到极限时才给转换标签与压力来源写法。
function strainTagLines(state) {
    const all = [state.protagonist && state.protagonist.bars, ...Object.values(state.characters || {}).map((c) => c && c.bars)];
    if (all.some((bars) => stressLimitActive(bars))) return [BREAK_TAG_LINE];
    return all.some((bars) => bars && !bars.strain && (Number(bars.stress) || 0) >= STRESS_EXTREME) ? [STRESS_SOURCE_TAG_LINE] : [];
}

// NPC 的体力与压力（第五点六节定稿措辞）：数值正常时不写；压力转换后或撑到极限时改写状态句；痴迷的角色另写念念不忘。
export const NPC_TIRED = '很疲惫，动作变慢，容易走神';
export const NPC_EXHAUSTED = '体力耗尽，撑不住了，需要立刻休息';
export const NPC_STRESSED = '有心事，睡不好，容易烦躁';
export const NPC_STRESS_EXTREME = '神经紧绷到了极限，一点小事就可能失态';
function staminaNote(character, name) {
    const own = character.bars && typeof character.bars === 'object' ? character.bars : null;
    const notes = [];
    const stamina = Number(own && own.stamina);
    if (Number.isFinite(stamina) && stamina <= 0) notes.push(`${name}${NPC_EXHAUSTED}。`);
    else if (Number.isFinite(stamina) && stamina < STAMINA_LOW) notes.push(`${name}${NPC_TIRED}。`);
    const strain = strainSentence(name, own);
    const stress = Number(own && own.stress) || 0;
    if (strain) notes.push(`${strain}。`);
    else if (stress >= STRESS_EXTREME) notes.push(`${name}${NPC_STRESS_EXTREME}。`);
    else if (stress > STRESS_HIGH) notes.push(`${name}${NPC_STRESSED}。`);
    if (character.obsessed) notes.push(`${name}${OBSESSED_NOTE}。`);
    return notes.join('');
}

// 「我对TA」备注（设置开启时由调用方传入 heroNotes）：该角色有备注才附一句，空则不附。
function heroNoteText(name, notes) {
    const text = notes && typeof notes[name] === 'string' ? notes[name].trim().replace(/[。.]+$/, '') : '';
    return text ? `主角对其：${text}。` : '';
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
//         combatOn, partyLines, dateRegex（日期正则原文，空或非法则不算日期模式）, heroNotes（「我对TA」备注，未开启注入时不传） }
export function buildStatsPrompt(state, opts = {}) {
    const diagnostics = [];
    const prompts = { ...DEFAULT_STAT_PROMPTS, ...(opts.prompts || {}) };
    const stageText = { ...DEFAULT_STAGE_TEXT, ...(opts.stageText || {}) };
    const platonicText = { ...DEFAULT_STAGE_TEXT_PLATONIC, ...(opts.stageTextPlatonic || {}) };
    const disabled = new Set(opts.disabled || []);
    const bars = state.protagonist.bars;
    const parts = [];
    const push = (id, text) => { if (!disabled.has(id) && text) parts.push({ id, text }); };
    push('source', fillTemplate(prompts.source, {}, diagnostics));
    push('protagonist', fillTemplate(prompts.protagonist, {
        生命: vitalsText(opts.vitals), 体力: bars.stamina, 压力: bars.stress, 金钱: walletBalance(bars, opts.walletExtra),
        状态描述: describeProtagonist(bars, { shortfall: opts.shortfall, vitals: opts.vitals, dateMode: Boolean(compileCaptureRegex(opts.dateRegex).regex && state.clock && state.clock.lastDate) }),
    }, diagnostics));
    // 声望：本聊天开了声望条才注入（fameBars 由调用方从聊天级目录传入）。
    const fame = fameLines(state, opts.fameBars, { present: opts.present || [] });
    if (fame.length) push('fame', fillTemplate(prompts.fame, { 声望: fame.join('\n') }, diagnostics));
    if (opts.skillsLine) push('skills', fillTemplate(prompts.skills, { 技能档位: opts.skillsLine }, diagnostics));
    if (opts.perceptionLine) push('perception', fillTemplate(prompts.perception, { 感知档位: opts.perceptionLine }, diagnostics));
    const present = (opts.present || []).filter((name) => state.characters[name]);
    if (present.length) {
        push('present', present.map((name) => {
            const c = state.characters[name];
            const stage = stageOf(c.dims.好感).name;
            // 非恋爱对象（含亲人）：四档正向阶段改用去恋爱化的文案；亲密门槛按身份区分。
            const romance = isRomance(c, name, opts.romanceSeen);
            const role = { romance, kin: hasTrait(state, traitCatalogOf(opts.traits), name, 'kin') };
            const text = !romance && Object.hasOwn(DEFAULT_STAGE_TEXT_PLATONIC, stage) ? platonicText[stage] : stageText[stage];
            return fillTemplate(prompts.present, {
                角色: name, 阶段: stage, 阶段文案: text || '', 组合描述: describeCombination(c.dims),
                突破提示: breakthroughHint(c, prompts.breakthrough), 亲密约束: intimacyNote(c, { ...opts, role, forced: (opts.forcedNames || []).includes(name) }, prompts.intimacy, prompts.intimacyForced),
            }, diagnostics) + staminaNote(c, name) + heroNoteText(name, opts.heroNotes);
        }).concat(prompts.presentRule ? [fillTemplate(prompts.presentRule, {}, diagnostics)] : []).join('\n'));
    }
    // 状态（B 批）：只给在场角色；来源与单条开关由 statusPromptLines 把关，旧特质注入五项并入此段。opts.statusCat 为 { statuses }，特质读 opts.traits。
    const statusLines = statusPromptLines(state, { ...(opts.statusCat || {}), traits: opts.traits, nsfw: opts.nsfw }, present);
    if (statusLines.length) push('status', fillTemplate(prompts.status, { 状态: statusLines.join('\n') }, diagnostics));
    const sheets = (opts.sheetLines || []).filter((s) => s && s.name && present.includes(s.name));
    if (sheets.length) {
        push('sheets', sheets.map((s) => fillTemplate(prompts.sheets, { 角色: s.name, 资历: s.rank || '普通人', 擅长: s.strong || '无特别擅长', 六维加值: s.bonus || '由数值系统按其实力估算' }, diagnostics)).join('\n'));
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
        好感档位: FAVOR_PROMPT_GROUPS.map((g) => `${g.label}：${g.words.join('/')}`).join('；'), 压力强度: STRESS_STRENGTHS.slice(0, 3).join('/'), 强度: FAVOR_STRENGTHS.join('/'), 好感强度: FAVOR_STRENGTHS.join('/'), 体力档位: STAMINA_EVENTS.join('/'), 金钱档位: MONEY_TIERS.join('/'), 伤势档位: HURT_TIERS.join('/'),
    }, diagnostics) + [...conditionalTagLines(state, opts), ...fameTagLines(opts.fameBars), ...strainTagLines(state), STATUS_TAG_LINE(opts.worlds)].map((line) => `\n${line}`).join('') + (opts.nsfw ? `\n${DESIRE_TAG_LINE}` : '') + (opts.nsfw && opts.intimateCost && opts.intimateCost !== 'off' ? `\n${INTIMATE_TAG_LINE}` : ''));
    if (opts.combatOn) push('combat', combatSegmentText(prompts, opts, diagnostics));
    const party = (opts.partyLines || []).filter(Boolean);
    if (opts.combatOn && party.length) push('party', fillTemplate(prompts.party, { 同伴: party.join('\n') }, diagnostics));
    const mandates = (opts.mandates || []).filter(Boolean);
    if (mandates.length) push('mandates', fillTemplate(prompts.mandates, { 事项: mandates.join('；') }, diagnostics));
    return { content: parts.map((p) => p.text).join('\n'), segments: parts, diagnostics };
}

// 强制事项（§9）：由上一楼结算标记推出。
// fame：本聊天仍开着声望时才带上一楼声望归零、满格的强制事项。
export function mandatesFromFlags(flags = {}, vitals = null, { fame = false } = {}) {
    const out = [];
    if (fame && Array.isArray(flags.fame)) out.push(...flags.fame.filter((t) => typeof t === 'string' && t));
    if (flags.battle) out.push(`上一楼的战斗结果为【${flags.battle.outcome}】，按此写出战斗结局，不得改判`);
    if (flags.work) out.push(`上一楼的打工结果为【${flags.work.tier}】${flags.work.income ? `，收入档位${flags.work.income}` : '，没有收入'}`);
    if (flags.forcedRest) out.push('主角体力耗尽，写出主角昏睡或休息');
    // 关键事件大失败：只在紧接着的下一楼出现一次（flags 来自上一楼）。
    if (flags.keyFumble && flags.keyFumble.event) out.push(`上一楼的${flags.keyFumble.event}出了岔子，本楼正文需体现`);
    if (flags.landmine) { const line = landmineMandate(flags.landmine); if (line) out.push(line); }
    if (healthStatus(vitals) === '倒下') out.push('主角已倒下，写出被救、被俘或醒来的情节');
    return out;
}
