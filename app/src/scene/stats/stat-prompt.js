// 数值系统提示词注入段（§9）：每段一个可编辑模板，用户覆盖优先，可单独关闭。
// 模板变量写错或缺失时原样保留变量名并记诊断，不中断（§9 末条）。
import { FAVOR_GATES, gateKey, stageOf } from './stat-favor.js';
import { healthStatus, STAMINA_LOW, STRESS_HIGH } from './stat-bars.js';
import { FAVOR_DIRECTIONS, HURT_TIERS, MONEY_TIERS, STAMINA_EVENTS } from './stat-vocab.js';

export const STAT_PROMPT_SEGMENTS = Object.freeze(['source', 'protagonist', 'skills', 'perception', 'present', 'sheets', 'check', 'roll', 'tags', 'mandates']);
// 后台请求的提示词（角色卡生成、批量补全）：可编辑，不参与注入开关。
export const STAT_BACKGROUND_PROMPTS = Object.freeze(['sheetGen', 'backfill']);

export const DEFAULT_STAT_PROMPTS = Object.freeze({
    source: '【数值来源】角色关系与主角状态以本段为准；表格里的数值仅作展示，与本段不一致时以本段为准。',
    protagonist: '【主角状态】生命{{生命}}/100，体力{{体力}}/100，压力{{压力}}/100，金钱{{金钱}}。{{状态描述}}',
    skills: '【主角技能】{{技能档位}}。未列出的技能按未学。',
    perception: '【主角感知】{{感知档位}}：据此决定主角能注意到什么，不需要检定。',
    present: '【{{角色}}】关系阶段：{{阶段}}。{{阶段文案}}{{组合描述}}{{突破提示}}{{亲密约束}}',
    sheets: '【{{角色}}的本事】{{资历}}；擅长：{{擅长}}。',
    check: '【本轮检定】{{技能}}{{难度}}：{{明细}}，结果【{{结果}}】。按此结果描写，不得改判。',
    roll: '【本轮骰运】若主角本轮要做有不确定性、失败有后果的事，按下表写结果，不得改判；毫无悬念的事不检定，一轮最多检定一次，用不到就不检定。\n{{结果表}}\n难度：简单＝普通人多半能做到；普通＝需要一定本事；困难＝内行也要认真对待；极难＝只有高手才有机会，少用。技能必须贴合行动。失败也要推进剧情，只是付出代价。\n用过后在正文末尾写 [igs-stat:roll|技能|难度]；对抗在场角色写 [igs-stat:roll|技能|难度|对抗:角色名]；表里没有的新技能写 [igs-stat:roll|技能|难度|所属属性]，属性只能是健康、力量、敏捷、理智、观察、魅力之一。',
    rollManual: '【检定规则】主角要做有不确定性、失败有后果的事时，写到行动发起处就停，不写结果，在正文末尾写 [igs-stat:roll|技能|难度]，对抗在场角色加 |对抗:角色名，新技能加 |所属属性。难度：简单、普通、困难、极难（少用）。毫无悬念的事不检定。',
    sheetGen: '你是跑团数值设计。按角色资料给每个角色分配数值，只输出档位词，不输出任何数字。\n属性档：很弱、偏弱、普通、出众、顶尖（非人可用「超凡」）。技能档：未学、入门、熟练、精通、大师。资历：普通人、老手、精英、大师、传奇。\n只列与「普通 / 未学」不同的项。招牌技能最多 3 个，可以是清单外的新技能，并写所属属性（健康、力量、敏捷、理智、观察、魅力之一）。\n只输出 JSON：{"角色名":{"资历":"","属性":{"属性名":"档"},"技能":{"技能名":"档"},"招牌技能":[{"名":"","属性":""}]}}',
    backfill: '你是跑团数值设计。剧情里出现了新技能，请按角色资料给每个角色补一个技能档位，只输出档位词，不输出任何数字。\n技能档：未学、入门、熟练、精通、大师。没有相关经历一律写「未学」。\n只输出 JSON：{"角色名":{"技能名":"档"}}',
    tags: '【数值标签】正文末尾按需输出以下标签，只写档位，不写任何数字：\n[igs-stat:favor|角色名|{{好感档位}}]\n[igs-stat:trust|角色名|上升/下降]\n[igs-stat:stamina|{{体力档位}}]\n[igs-stat:money|收入/花费|{{金钱档位}}]\n[igs-stat:stress|上升/下降]\n[igs-stat:hurt|{{伤势档位}}]\n[igs-stat:sleep]（入睡）\n[igs-stat:event|角色名|约会/告白/共患难]\n[igs-stat:gift|角色名|礼物类别]\n[igs-stat:skip|7天]（时间跳跃）',
    mandates: '【本轮必须写出】{{事项}}',
});

export const DEFAULT_STAGE_TEXT = Object.freeze({
    仇恨: '视主角为敌，会主动伤害或报复，不接受任何示好。',
    强烈反感: '明确排斥主角，冷言冷语，尽量避开接触。',
    厌烦排斥: '对主角不耐烦，敷衍应付，不会主动搭话。',
    淡淡不喜: '对主角有些疏远，礼貌但冷淡。',
    无感: '把主角当普通人，没有特别的好恶。',
    初步好感: '对主角有好印象，愿意闲聊，但不会越过普通朋友的界限。',
    明确喜欢: '在意主角，会主动关心和邀约，仍不会轻易表白或有亲密接触。',
    强烈在意: '把主角放在心上，会吃醋、会依赖，可以接受牵手拥抱。',
    深爱: '深爱主角，愿意托付真心，亲密行为自然。',
});

const VAR = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export function fillTemplate(template, vars, diagnostics = []) {
    return String(template ?? '').replace(VAR, (whole, name) => {
        if (Object.hasOwn(vars, name)) return String(vars[name] ?? '');
        diagnostics.push({ code: 'stat-prompt-var-missing', name });
        return whole;
    });
}

export function describeProtagonist(bars, { shortfall = false } = {}) {
    const notes = [];
    const health = healthStatus(bars.health);
    if (health !== '正常') notes.push(`主角处于${health}状态`);
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
    if (know < 0) notes.push('对主角有误解');
    else if (know > 50) notes.push('很了解主角');
    return notes.length ? `（${notes.join('，')}）` : '';
}

function breakthroughHint(character) {
    const favor = Number(character.dims.好感) || 0;
    const gate = FAVOR_GATES.find((g) => g === favor && !character.unlocked.includes(gateKey(g)));
    return gate === undefined ? '' : '好感已到本阶段上限，可在合适时机给主角一次更进一步的机会（邀约、独处或危机）。';
}

// 亲密门槛（§5.4）：好感 >50、信任 >25、欲望 >25 才放行；未达到时要求拒绝或回避。
export function intimacyAllowed(dims) {
    return (Number(dims.好感) || 0) > 50 && (Number(dims.信任) || 0) > 25 && (Number(dims.欲望) || 0) > 25;
}

function intimacyNote(character, { nsfw, intimacyGate }) {
    if (!nsfw || !intimacyGate || intimacyAllowed(character.dims)) return '';
    return '尚未到亲密阶段，如涉及亲密行为，她会拒绝或回避。';
}

// opts：{ prompts, disabled, stageText, present, check, mandates, shortfall, nsfw, intimacyGate,
//         skillsLine, perceptionLine, sheetLines: [{ name, rank, strong }], rollTable: [行], manualRoll }
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
        生命: bars.health, 体力: bars.stamina, 压力: bars.stress, 金钱: bars.money,
        状态描述: describeProtagonist(bars, { shortfall: opts.shortfall }),
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
                突破提示: breakthroughHint(c), 亲密约束: intimacyNote(c, opts),
            }, diagnostics);
        }).join('\n'));
    }
    const sheets = (opts.sheetLines || []).filter((s) => s && s.name && present.includes(s.name));
    if (sheets.length) {
        push('sheets', sheets.map((s) => fillTemplate(prompts.sheets, { 角色: s.name, 资历: s.rank || '普通人', 擅长: s.strong || '无特别擅长' }, diagnostics)).join('\n'));
    }
    if (opts.check) {
        const ck = opts.check;
        const threshold = ck.threshold ?? ck.target;
        push('check', fillTemplate(prompts.check, {
            技能: ck.skill, 难度: ck.difficulty && ck.difficulty !== '普通' ? `（${ck.difficulty}）` : '',
            明细: ck.detail || `1d100=${ck.roll}，需≤${threshold}`, 点数: ck.roll, 目标: threshold, 结果: ck.outcome || ck.tier,
        }, diagnostics));
    } else if (opts.rollTable && opts.rollTable.length) {
        push('roll', fillTemplate(prompts.roll, { 结果表: opts.rollTable.join('\n') }, diagnostics));
    } else if (opts.manualRoll) {
        push('roll', fillTemplate(prompts.rollManual, {}, diagnostics));
    }
    push('tags', fillTemplate(prompts.tags, {
        好感档位: FAVOR_DIRECTIONS.join('/'), 体力档位: STAMINA_EVENTS.join('/'), 金钱档位: MONEY_TIERS.join('/'), 伤势档位: HURT_TIERS.join('/'),
    }, diagnostics));
    const mandates = (opts.mandates || []).filter(Boolean);
    if (mandates.length) push('mandates', fillTemplate(prompts.mandates, { 事项: mandates.join('；') }, diagnostics));
    return { content: parts.map((p) => p.text).join('\n'), segments: parts, diagnostics };
}

// 强制事项（§9）：由上一楼结算标记推出。
export function mandatesFromFlags(flags = {}, bars = {}) {
    const out = [];
    if (flags.battle) out.push(`刚才的战斗结果为【${flags.battle.outcome}】，按此写出战斗结局，不得改判`);
    if (flags.work) out.push(`刚才的工作结果为【${flags.work.tier}】${flags.work.income ? `，收入档位${flags.work.income}` : '，没有收入'}`);
    if (flags.forcedRest) out.push('主角体力耗尽，写出主角昏睡或休息');
    if (Number(bars.health) <= 0) out.push('主角昏迷，写出被救、被俘或醒来的情节');
    return out;
}
