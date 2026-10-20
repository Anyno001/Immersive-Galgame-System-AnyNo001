import { SOURCE_RULE, IDENTITY_RULE, OUTFIT_RULE, OUTFIT_HALF_BODY_RULE } from './common.js';
import { SPRITE_TEMPLATE_RULE, SPRITE_PICTURE_RULE } from './template.js';
import { SPRITE_HALF_BODY_RULE } from '../prompt-registry.js';

export const SPRITE_TASK = '完成角色默认立绘任务。首次缺资料时建立详细且可复用的身份候选与命名衣装设计，已有资料原样复用；按本轮格式交资料或画面。外貌、独立性格和衣装分离，不把本楼动作、姿势或地点变成默认立绘。';
const identity = [SOURCE_RULE, IDENTITY_RULE, OUTFIT_RULE,
    '按 outputs.identityRequirements 的角色键、token 和 requiredFields 对账。candidate-required 补齐三景别并保留已有景别；saved-only 不重建；identity-cleared 不补建主动清空身份。仅缺 personality 键时提取独立英文稳定性格，无依据可空；已有值及显式空值保持，不复制进身份景别。',
    '资料格式不等于只摘录原文。首次候选保留角色资料的明确设定，在任务允许范围内具体化未限定的普通外貌；新衣装缺说明时一次完成详细设计。不同角色独立建模，不套用同一种脸、体态或范例衣装；正文的失忆、伤势及临时情绪不写进稳定身份。',
];
export const SPRITE_DATA = [
    OUTFIT_HALF_BODY_RULE,
    '【先交图头，再交资料】回复第一行必须直接写 slotid: 本轮实际槽号，第二行写 character: 该槽对应的规范角色键。先按 outputs.rows 或 promptTask.slots 找本槽编号与角色；即使本轮仅一人一份，slotid 仍必填，不能从 character 或 personality 开始。输入已有 slotId 不代表回复可以省略，示例编号不能代替本轮编号。', ...identity,
    '本轮只交 sprite-data：每份从 slotid: 本轮编号 开始，随后 character: 规范角色键、outfit_name、outfit_description、outfit_half_body；需补身份时交 dna_full_body、dna_half_body、dna_portrait，可附 dna_uc_对应景别。各身份主语非空，不超过4096字符；UC 可空，不能只有 UC 而缺主语。',
    '按本槽 slotId 查唯一 token，再取对应 characterKey 写入 character；不填 token、别名或译名。一行一个字段，无索引、竖线或 meta_ 前缀。完整写完一份才以独立行 --- 分隔下一份，不输出 scene、char、构图、背景、质量词或完整绘图词。',
    '首次资料示例仅示范详细程度与字段，不是本轮人物。示例输入：林澄，slotId=7，成年女性，浅肤色、黑色齐肩发、杏形棕眼、鹅蛋脸，左侧银色星形发夹与小珍珠耳钉，纤细体态，性格沉静细心；衣装原名=日常裙装，蓝色及膝裙与白色开衫，允许补全未限定的普通细节。下例发型结构、局部五官和服装材质等为本次示例设计，不是额外来源事实。',
    'slotid: 7', 'character: 林澄', 'personality: composed, attentive, patient',
    'outfit_name: 日常裙装',
    'outfit_description: 1.2::blue dress::, cotton dress, fitted bodice, round neckline, short puff sleeves, high waist, pleated dress, knee-length dress, 1.2::white cardigan::, knit cardigan, ribbed cuffs, open cardigan, long sleeves, hip-length cardigan, white socks, ankle socks, black mary janes, low heels',
    'outfit_half_body: 1.2::blue dress::, cotton dress, fitted bodice, round neckline, short puff sleeves, high waist, pleated dress, 1.2::white cardigan::, knit cardigan, ribbed cuffs, open cardigan, long sleeves, hip-length cardigan',
    'dna_full_body: 1girl, adult, 1.2::black hair::, medium hair, straight hair, side part, swept bangs, sidelocks, hair tucked behind ear, brown eyes, almond-shaped eyes, thin eyebrows, oval face, light skin, hairclip, silver hair ornament, 1.2::star hair ornament::, earrings, small earrings, 1.2::pearl earrings::, slim, narrow waist',
    'dna_half_body: 1girl, adult, 1.2::black hair::, medium hair, straight hair, side part, swept bangs, sidelocks, hair tucked behind ear, brown eyes, almond-shaped eyes, thin eyebrows, oval face, light skin, hairclip, silver hair ornament, 1.2::star hair ornament::, earrings, small earrings, 1.2::pearl earrings::, slim, narrow waist',
    'dna_portrait: 1girl, adult, 1.2::black hair::, medium hair, straight hair, side part, swept bangs, sidelocks, hair tucked behind ear, brown eyes, almond-shaped eyes, thin eyebrows, oval face, light skin, hairclip, silver hair ornament, 1.2::star hair ornament::, earrings, small earrings, 1.2::pearl earrings::',
    '半身衣装仍有裙身类别、材质与腰部褶裥，只有画外裙长和鞋袜被删除；头像仅从全身身份删除躯干体态，不另加脸部修饰。示例的刘海、眼型、腰线和服装结构不能套给所有角色，按各自来源与允许的首次设计独立确定。',
    '三份是同一角色资料，不是三张图。三景别只从同一 TAG 母版删除画外部位的完整标签，不追加衣领、内搭、裤子、鞋靴或改写共同标签；无额外画外标签时全身与半身允许相同。身体标签直接表达身体本身，衣装分写 outfit_description 与 outfit_half_body，当次表情、视线和姿势不写入身份。',
    '可选 dna_uc_* 只写该景别身份需要排除的英文特征；无额外排除项时省略或留空，不写沿用正向、默认不变、表情姿势说明等自然语言指令。',
    '交付前先核对每份首行 slotid 和第二行 character 是否齐全且匹配本轮清单，再逐角色核对三景别、独立性格、完整衣装、半身派生及全部必填字段；首次候选有具体发型和五官组合，新衣装有逐件结构，身份不含鞋袜或其他穿戴物，半身衣装不含画外长度和腿脚细节。共同描述保真，UC 为实际排除项。只输出完整资料字段，不输出检查过程。',
].join('\n');
export const SPRITE_TEMPLATE = [...identity, SPRITE_TEMPLATE_RULE, SPRITE_PICTURE_RULE, SPRITE_HALF_BODY_RULE,
    '本轮交单人立绘模板，不输出 at 或 CG 当次身份旁路。缺身份景别时同次交 meta_dna_full_body、meta_dna_half_body、meta_dna_portrait: 本图索引 | 纯英文身份 TAG，可附 meta_dna_uc_对应景别；半身立绘也必须交齐三景别候选，不新增 partial。',
    '模板 Char 只引用自身身份和适用衣装槽，接默认站姿与平和表情，不照搬剧情动作。三景别身份不含衣装、表情、姿势或令牌；衣装旁路独立。逐槽完整写完后再分隔下一图，编号与任务一致。',
].join('\n');
export const SPRITE_CAPTION = [SOURCE_RULE, SPRITE_PICTURE_RULE, SPRITE_HALF_BODY_RULE,
    '本轮仅编写单人默认立绘画面，不提取或登记 DNA、性格或衣装候选。使用所给角色身份与指定衣装，保持默认站姿和平和表情，按实际取景只写可见特征。',
    '每份首行 #本轮编号，随后 scene: 英文人数、景别、机位与底色、char: 本人的完整英文可见身份、衣装、姿势与表情、uc: 排除项。若未提供编号，只交 #1 一份；已提供编号时逐一原样使用。',
    '每字段恰好一次；不使用身份或衣装令牌，不输出 slotid、meta、analysis、at、DNA 资料或 ---，多份以各自 #编号 开始。',
].join('\n');
