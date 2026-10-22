// 非人角色（妖魔鬼怪、怪物、使魔、坐骑、Boss、半人形种族）的写词任务：建档、立绘、差分三段，自带非人示例。
// 与人类任务分开：不写衣装、不写人类五官与表情；人类的 sprite.js、expression.js 不引用本文件。
import { DNA_WEIGHT_RULE, SOURCE_RULE } from './common.js';
import { BUILTIN_PROMPTS } from '../prompt-registry.js';
import { CREATURE_FORM_LABELS, CREATURE_SIZE_LABELS, CREATURE_ANCHOR_LABELS, CREATURE_TIERS, normalizeCreatureProfile, confirmedCreatureOf } from '../../scene/creature-profile.js';
import { moodPresetAct, moodPresetUse } from '../../scene/mood-groups.js';

// 内置预设的任务模块按人类衣装与表情撰写；非人任务的规则随任务描述发送，并声明优先级。
export const CREATURE_PRIORITY_NOTE = '【非人角色任务】本轮角色带 dna.creature 档案。以下规则优先于任务模块中关于衣装、人类外貌与面部表情的条款；任务模块的字段格式、槽号与角色键对账仍然适用。';
export const CREATURE_SPRITE_TASK = '完成非人角色的立绘任务。首次缺资料时建立可复用的非人身份候选，已有资料原样复用；不涉及衣装。';

// 身份规则：种类、体型结构、肢体器官数量、颜色、材质、标志部位写清，不写空泛形容词。
export const CREATURE_IDENTITY_RULE = [
    '【非人身份】本轮角色是非人角色，按 characterContext.dna.creature 的 form、size、anchor 建立身份，不套用人类外貌模板，不写发型、五官、肤色等人类栏目，除非该特征确属本角色。',
    '资料来源依次为保存资料、角色资料与世界书参考、本楼正文对该角色的描写；资料不足时按物种常识设计，设计结果在本次确定后贯穿三景别，不冒充原文事实。不写 scary、terrifying、powerful、dangerous 等空泛形容。',
    '身份主语写清：种类（species）；体型结构与躯体类型（四足、长身形、多足、飞行、无定形等）；肢体与器官的数量（腿、臂、翼、眼、角、尾、触手）；主色与辅色；体表材质（鳞、甲壳、黏液、骨、雾、岩石、毛皮、火焰）；标志部位及其位置。数量与位置未知时不编造。',
    'form 为 beast：身份以 no humans 开头，不写 1girl、1boy 或人类年龄与性别标签；没有可读五官时不补写人类五官。',
    'form 为 humanoid：先写性别标签（1girl 或 1boy）与年龄感，再写非人特征；下半身或躯干的非人形态（蛇尾、鱼尾、蜘蛛下身、马身）以及翼、角、兽耳是高优先级身份标签，使用 1.2::tag:: 加权并写在身份靠前位置，全身景别完整保留。',
    '三景别从同一母版删减：full_body 写完整形体；half_body 删去画外的下半身、尾部与后肢标签，保留头部、颈部、前肢与上身；portrait 仅保留头部与颈部标签。giant 体型只使用 half_body 取景，仍按同一母版删减。共同标签及权重逐字一致。',
    '身份只含稳定外貌：不含当次姿态、情绪、战斗状态、伤口、环境与场景。衣装不适用，不写 outfit_name、outfit_description、outfit_half_body；确属身体一部分的甲壳、骨饰、固有纹章写入身份。',
    DNA_WEIGHT_RULE,
].join('\n');

// 非人示例：具体设计的岩甲蜥。只示范详细程度与字段，不是本轮角色。
export const CREATURE_EXAMPLE_LINES = Object.freeze([
    'slotid: 1',
    'character: 岩甲蜥',
    'personality: territorial, patient, slow to anger,',
    'dna_full_body: no humans, 1.2::lizard::, quadruped, four legs, five claws per foot, long thick tail, flat wedge-shaped head, two small yellow eyes, 1.2::grey stone plate armor::, rough rock-textured skin, brown underbelly, jagged dorsal ridge, three stone spikes on snout,',
    'dna_uc_full_body: bipedal, wings, fur, human face,',
    'dna_half_body: no humans, 1.2::lizard::, flat wedge-shaped head, two small yellow eyes, 1.2::grey stone plate armor::, rough rock-textured skin, jagged dorsal ridge, three stone spikes on snout, thick neck, front legs, five claws per foot,',
    'dna_uc_half_body: bipedal, wings, fur, human face,',
    'dna_portrait: no humans, 1.2::lizard::, flat wedge-shaped head, two small yellow eyes, 1.2::grey stone plate armor::, rough rock-textured skin, three stone spikes on snout, thick neck,',
    'dna_uc_portrait: wings, fur, human face,',
    'pose: all fours, head lowered, mouth closed, tail curled to one side,',
    'pose_uc: standing upright, running, jumping,',
]);

const FIELD_HEAD = '【先交图头，再交资料】回复第一行必须直接写 slotid: 本轮实际槽号，第二行写 character: 该槽对应的规范角色键。先按 outputs.rows 或 promptTask.slots 找本槽编号与角色；输入已有 slotId 不代表回复可以省略，示例编号不能代替本轮编号。每份从 slotid 重新开始，字段各一次，多份用独立行 --- 分隔。';

// outputs.format 为 sprite-data 且角色为非人角色时替换 SPRITE_DATA_RULE。
export const CREATURE_SPRITE_DATA_RULE = [
    '仅 outputs.format 为 sprite-data 且角色带 dna.creature 时执行本段：只提取可复用资料，不生成 scene、char、构图、背景或完整绘图提示词。',
    FIELD_HEAD,
    SOURCE_RULE,
    CREATURE_IDENTITY_RULE,
    '缺身份景别时输出 dna_full_body、dna_half_body、dna_portrait，以及可选 dna_uc_对应景别；各份身份主语非空，不超过4096字符，UC 只写对应身份的英文排除项，可省略或留空。已有景别逐字保留。personality 字段缺失时另写独立英文性格特点，只写稳定性格，无依据留空。',
    '每份另写 pose 与 pose_uc：pose 为物种待机姿态的英文 TAG（躯干、头部朝向、肢体、尾部摆放，符合物种习性），pose_uc 为排除项，可留空但字段保留。pose 只写姿态，不重复身份，不写场景、道具或其他生物。personality、dna_* 与 pose 均以英文逗号结尾，便于与相邻标签衔接。',
    `姿态取景：${BUILTIN_PROMPTS.creatureBeast.poseRule}`,
    '字段一行一个，无索引、竖线或 meta_ 前缀；不输出占位符、JSON、代码围栏、分析或思考正文。示例仅示范字段与详细程度，不是本轮角色：',
    ...CREATURE_EXAMPLE_LINES,
].join('\n');

// 档位说明：四档姿态的画面要点，写进差分任务描述。
export const CREATURE_TIER_ACTS = Object.freeze({
    calm: '物种待机姿态：放松、自然，口部闭合或自然半开，无攻击预备',
    menace: '登场、咆哮或蓄力：张口、竖起、伏低前冲预备，身躯压向镜头',
    wounded: '被命中或残血：后仰、蜷缩、肢体失衡，伤口、裂缝或体表发光',
    frenzy: '二阶段狂暴：形体膨胀，体表发光，甲壳或鳞片碎裂，动作幅度更大',
});

// outputs.format 为 expression-fragments 且角色为非人角色时替换表情片段规则。
export const CREATURE_EXPRESSION_FRAGMENTS_RULE = [
    SOURCE_RULE,
    '只输出 expression-fragments，每份从 slotid: 本轮编号 开始，随后 character: 本槽规范角色键、expression: 英文姿态与状态 TAG、expression_uc: 排除项。expression 非空，UC 可空但字段不能省略。',
    '非人差分是整体姿态差分：同一角色、同一整套种子，只改变躯干、头部朝向、口部、肢体、尾部与状态（发光、伤口、膨胀、碎裂），身份 DNA 原样复用，不复述身份，不写衣装、背景、道具、镜头、质量或底色。',
    '按 outputs.rows 的 slotId 和 characterKey 写图号与角色；characterContext 提供本人身份与 creature 档案，仅作参考。每份完整写完才以独立行 --- 分隔下一份，字段无索引和竖线。',
    `姿态取景：${BUILTIN_PROMPTS.creatureBeast.poseRule}`,
    '示例仅说明字段结构，编号、角色和姿态以本轮任务为准：',
    'slotid: 1', 'character: 岩甲蜥',
    'expression: rearing back, head raised, mouth wide open, roaring, front claws lifted, tail lashing, glowing cracks on armor plates',
    'expression_uc: closed mouth, sleeping',
    '交付前对账本轮槽号集合、规范角色键和指定档位，字段各一次。',
].join('\n');

// 旧组合路径（外部来源按正文写立绘 tags）的非人补充规则。
export const CREATURE_ASSET_RULE = [
    '【非人立绘 tags 写法】清单中标注「非人角色」的立绘项不使用上面的人类写法：不写 1girl / 1boy、外观年龄、发色发型与服装。',
    '1. form 为 beast 时第一个 tag 写 no humans；form 为 humanoid 时先写性别与年龄感，再写非人特征，下半身非人形态（蛇尾、鱼尾、蜘蛛下身、马身）用 1.2::tag:: 加权。',
    '2. 依次写种类、体型结构、肢体与器官数量、主色辅色、体表材质、标志部位；不写 scary 等空泛形容。',
    '3. 再写一个符合物种习性的待机姿态；不写场景、道具、镜头、底色或其他生物。已有 DNA 的项目 tags 只写姿态。',
].join('\n');

const clean = (list) => list.filter(Boolean).join('\n');

export function creatureFacts(rawProfile) {
    const p = normalizeCreatureProfile(rawProfile) || normalizeCreatureProfile({});
    const frame = BUILTIN_PROMPTS[p.form === 'humanoid' ? 'creatureHumanoid' : 'creatureBeast'];
    // 半人形选了半身取景：取景词与姿态规则换成半身版（巨型仍按巨型局部取景）。
    const half = p.framing === 'half' && p.size !== 'giant' && Boolean(frame.halfBody);
    const framing = half ? frame.halfBody : frame.framing[p.size];
    return { profile: p, line: `非人角色档案：形态 ${CREATURE_FORM_LABELS[p.form]}（${p.form}）；体型 ${CREATURE_SIZE_LABELS[p.size]}（${p.size}）；`
        + `${CREATURE_ANCHOR_LABELS[p.anchor]}（${p.anchor}）；取景 ${framing.positive}。`, poseRule: half ? frame.halfPoseRule : frame.poseRule };
}

// 默认立绘批量写词的描述：每份一行带档案，写词规则放在系统段。
export function creatureSpriteBatchDescription(items = []) {
    const list = (Array.isArray(items) ? items : []).map((item, index) => {
        const facts = creatureFacts(item.profile);
        return `${index + 1}. ${item.name || ''}｜${facts.line}`;
    });
    return clean([
        `整理本轮非人角色的三景别纯 TAG 身份、独立性格与待机姿态，共 ${list.length} 份，slotid 从 1 到 ${list.length}。`,
        ...list,
        '每份第一行必须是 slotid: 本轮实际槽号，第二行是 character: 规范角色键。已有资料逐字保留；不写衣装，不生成构图、场景或完整绘图提示词。',
        '资料不足时读取角色资料、世界书参考与本楼正文中对该角色的描写，缺失处按物种常识设计。',
        DNA_WEIGHT_RULE,
    ]);
}

export function creatureSingleSpriteDescription(name, rawProfile, { note = '' } = {}) {
    const facts = creatureFacts(rawProfile);
    return clean([
        `整理非人角色「${name || ''}」的三景别纯 TAG 身份、独立性格与待机姿态。`,
        facts.line,
        '已有资料逐字保留；不写衣装，不生成构图、场景或完整绘图提示词。资料不足时按物种常识设计。',
        note ? `本次额外要求：\n${note}` : '',
        DNA_WEIGHT_RULE,
    ]);
}

// 差分任务描述：四档姿态只改姿态与状态；半人形的完整情绪档沿用既有情绪清单，写词按非人规则。
export function creatureExpressionDescription(name, rawProfile, moods = [], { note = '', nsfw = false } = {}) {
    const facts = creatureFacts(rawProfile);
    const rows = (Array.isArray(moods) ? moods : []).map((mood, index) => {
        const tier = CREATURE_TIERS.find((item) => item.mood === mood);
        if (tier && facts.profile.tiers === 'four') return `${index + 1}. ${tier.label}（${mood}档）；${CREATURE_TIER_ACTS[tier.id]}`;
        const use = moodPresetUse(mood), act = moodPresetAct(mood, { nsfw });
        return `${index + 1}. ${mood}${use ? `；用于${use}` : ''}${act ? `；参考动作：${act}` : ''}`;
    });
    return clean([
        `为非人角色「${name || ''}」写 ${rows.length} 份姿态差分，按编号逐项输出：`,
        facts.line,
        facts.profile.tiers === 'four'
            ? '本组是整体姿态差分：只改变躯干、头部朝向、口部、肢体、尾部与状态，不写身份、衣装、背景或道具。'
            : '半人形差分：上身姿态与可读的面部变化按各自情绪重写，非人下半身保持完整入画并与全组一致，不写身份或衣装。',
        facts.poseRule,
        note ? `本次额外要求：\n${note}` : '',
        ...rows,
        `按 slotid 1 到 ${rows.length} 的顺序输出 ${rows.length} 份。`,
    ]);
}

// 外部来源（数据库生图等）按正文单张写立绘时的描述。
export function creatureAssetDescription(need = {}, { transparent = false, includeDna = true } = {}) {
    const facts = creatureFacts(need.dna && need.dna.creature);
    const identity = includeDna && need.dna ? String(need.dna.identity || '').trim() : '';
    return clean([
        `画非人角色「${need.name || ''}」的立绘。`,
        facts.line,
        '外貌依据正文与角色设定补充：种类、体型结构、肢体与器官数量、颜色、体表材质、标志部位写清，不写 scary 等空泛形容，不画衣装。',
        facts.poseRule,
        identity ? `固定身份：\n${identity}` : '',
        transparent ? '背景保持透明，轮廓外不绘制底色。' : '背景为单一纯色，便于抠除。',
    ]);
}

// 自动建的临时档案先判定对手属于人类、半人形还是完全非人形，再决定走哪套立绘流程。
export const CREATURE_FORM_JUDGE_RULE = [
    '判定战斗对手的形态。对每个名字只输出一行：名字: human、humanoid 或 beast。',
    'human：普通人类，包括没有非人特征描写的剑客、山贼、士兵、刺客、法师等职业或身份称谓；无依据时一律判 human。',
    'humanoid：人形上身并有明确非人特征的种族，如兽人、人鱼、蛇女、魔物娘、恶魔化的人形。',
    'beast：完全非人形的生物，如野兽、怪物、魔物、幽灵、使魔、龙、史莱姆。',
    '依据依次为角色设定与世界书参考、本楼正文对该对手的描写；不凭名字中的单个字推断。不输出解释、标题或其他行。',
].join('\n');

export function creatureFormJudgeDescription({ names = [], readableText = '', lore = [] } = {}) {
    return clean([
        `【待判定的战斗对手】\n${names.map((name, index) => `${index + 1}. ${name}`).join('\n')}`,
        Array.isArray(lore) && lore.length ? `【角色设定参考】\n${lore.map((item) => `${item.name}：${item.text}`).join('\n')}` : '',
        `【本楼正文】\n${readableText}`,
        '按上述规则逐个输出。',
    ]);
}

// 回复解析：每个名字一行；认不出的名字不出现在结果里。
export function parseCreatureFormJudgement(reply, names = []) {
    const forms = { human: 'human', 人类: 'human', humanoid: 'humanoid', 半人形: 'humanoid', 半人: 'humanoid', beast: 'beast', 非人: 'beast', 完全非人形: 'beast', 怪物: 'beast' };
    const verdict = {};
    for (const line of String(reply || '').split(/\r?\n/)) {
        const match = /^\s*(?:[-*\d.\s]*)(.+?)\s*[:：]\s*([A-Za-z\u4e00-\u9fff]+)\s*$/.exec(line);
        if (!match) continue;
        const name = names.find((item) => item === match[1].trim());
        const form = forms[match[2].toLowerCase()] || forms[match[2]];
        if (name && form) verdict[name] = form;
    }
    return Object.keys(verdict).length ? { ok: true, verdict } : { ok: false, error: '没有可用的形态判定' };
}

// ---- CG 出镜 ----

// 仅当本图的角色池含已登记的非人角色时，随写词任务附加；人类 CG 文本不含本段。
export const CREATURE_CG_RULE = [
    '【非人角色 CG 出镜】下列已登记的非人角色在本图出镜时，按 named 处理：独立一对 char/char_uc 与完整 meta 字段，meta_kind 写 named，使用本人 token，不降为 generic 或 object。未登记的路人怪物、成群杂兵仍写 generic，动物或非人物客体仍写 object。',
    '身份：meta_identity 写其已保存的身份 TAG（可从 characterContext 的 availableFrames 选景别）；form 为 beast 时身份以 no humans 开头，不写 1girl、1boy 或人类年龄、性别标签，不补写发型、五官、肤色等人类栏目，除非该特征确属本角色；form 为 humanoid 时先写性别标签与年龄感，再写非人特征，下半身的非人形态（蛇尾、鱼尾、蜘蛛下身、马身）使用 1.2::tag:: 加权。身份中的 no humans 等身份标签原样保留，不因画面里有人类同框而删除。',
    '体型与构图：small 缩小进画面；medium 与人物同大；large 允许占据更大画幅并俯视人物；giant 只取局部（仰视的上半身或头部、出框），meta_frame 用 half_body，人物渺小地站在其前。同图中的人类按人类规则交付，互不借用字段。',
    '衣装：非人角色没有衣装。其 char 不写 <<outfit:token>>（图头的 outfit_mode: template 照常写），meta_outfit_id、meta_outfit_name、meta_outfit_description 三项字段保留并全部留空，不交付衣装名或说明。确属身体一部分的甲壳、骨饰、固有纹章写入身份。',
    'Char 动作与状态写本图当次姿态：符合物种习性的攻击、扑击、咆哮、盘绕、受创等，可含战斗中的命中、碎甲、发光伤口；不重抄身份，不写 scary 等空泛形容。战斗关键一击的 CG 中，对手（若在下列名单）以 named 出镜，与我方人物各交完整字段。NSFW 画面沿用同一套字段与写法，不另设限制。',
].join('\n');

// 从 CG 角色上下文（characterKey 与 dna）取出非人角色清单；没有则返回空串。
export function creatureCgRule(context) {
    const rows = (Array.isArray(context) ? context : []).flatMap((c) => {
        const profile = confirmedCreatureOf(c && c.dna);
        return c && profile ? [`${c.characterKey}（${CREATURE_FORM_LABELS[profile.form] || CREATURE_FORM_LABELS.beast}（${profile.form}）；`
            + `${CREATURE_SIZE_LABELS[profile.size]}（${profile.size}）；${CREATURE_ANCHOR_LABELS[profile.anchor]}（${profile.anchor}））`] : [];
    });
    if (!rows.length) return '';
    return [CREATURE_PRIORITY_NOTE, CREATURE_CG_RULE, `本图可出镜的已登记非人角色：${rows.join('；')}。`].join('\n');
}
