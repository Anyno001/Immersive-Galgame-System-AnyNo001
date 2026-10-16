import { SOURCE_RULE, IDENTITY_RULE, OUTFIT_RULE } from './common.js';
import { TEMPLATE_RULE, PICTURE_RULE } from './template.js';
import { SPRITE_HALF_BODY_RULE } from '../prompt-registry.js';

export const SPRITE_TASK = '完成角色默认立绘任务。首次缺资料时建立详细且可复用的身份候选与命名衣装设计，已有资料原样复用；按本轮格式交资料或画面。外貌、独立性格和衣装分离，不把本楼动作、姿势或地点变成默认立绘。';
const identity = [SOURCE_RULE, IDENTITY_RULE, OUTFIT_RULE,
    '按 outputs.identityRequirements 的角色键、token 和 requiredFields 对账。candidate-required 补齐三景别并保留已有景别；saved-only 不重建；identity-cleared 不补建主动清空身份。仅缺 personality 键时提取独立英文稳定性格，无依据可空；已有值及显式空值保持，不复制进身份景别。',
    '资料格式不等于只摘录原文。首次候选保留角色资料的明确设定，在任务允许范围内具体化未限定的普通外貌；新衣装缺说明时一次完成详细设计。不同角色独立建模，不套用同一种脸、体态或范例衣装；正文的失忆、伤势及临时情绪不写进稳定身份。',
];
export const SPRITE_DATA = [
    '【先交图头，再交资料】回复第一行必须直接写 slotid: 本轮实际槽号，第二行写 character: 该槽对应的规范角色键。先按 outputs.rows 或 promptTask.slots 找本槽编号与角色；即使本轮仅一人一份，slotid 仍必填，不能从 character 或 personality 开始。输入已有 slotId 不代表回复可以省略，示例编号不能代替本轮编号。', ...identity,
    '本轮只交 sprite-data：每份从 slotid: 本轮编号 开始，随后 character: 规范角色键、outfit_name、outfit_description；需补身份时交 dna_full_body、dna_half_body、dna_portrait，可附 dna_uc_对应景别。各身份主语非空，不超过4096字符；UC 可空，不能只有 UC 而缺主语。',
    '按本槽 slotId 查唯一 token，再取对应 characterKey 写入 character；不填 token、别名或译名。一行一个字段，无索引、竖线或 meta_ 前缀。完整写完一份才以独立行 --- 分隔下一份，不输出 scene、char、构图、背景、质量词或完整绘图词。',
    '首次资料示例仅示范详细程度与字段，不是本轮人物。示例输入：林澄，slotId=7，成年女性，浅肤色、黑色齐肩发、杏形棕眼、鹅蛋脸，左侧银色星形发夹与小珍珠耳钉，纤细体态，性格沉静细心；衣装原名=日常裙装，蓝色及膝裙与白色开衫，允许补全未限定的普通细节。下例发型结构、局部五官和服装材质等为本次示例设计，不是额外来源事实。',
    'slotid: 7', 'character: 林澄', 'personality: composed, attentive, patient',
    'outfit_name: 日常裙装',
    'outfit_description: wears a deep-blue matte cotton-twill knee-length A-line dress with a fitted bodice, a rounded neckline, short set-in sleeves, a narrow matching fabric waistband and evenly spaced skirt pleats, beneath an open ivory-white fine-knit cardigan with long ribbed cuffs, a straight hip-length hem and small pearl-white front buttons, paired with cream ribbed ankle socks and matte-black leather low-heeled round-toe shoes with slim instep straps',
    'dna_full_body: An adult woman with light warm-toned skin, straight jet-black shoulder-length hair with a left-side part, softly curved ends and fine side-swept bangs, almond-shaped brown eyes, gently arched fine eyebrows, a soft oval face tapering to a rounded chin, a small straight nose and well-defined medium-full lips, a silver star-shaped hair clip above the left temple and small pearl stud earrings, a slender neck, gently sloping shoulders and a slim upper torso with a softly defined waist, balanced torso-to-leg proportions and slender limbs,',
    'dna_half_body: An adult woman with light warm-toned skin, straight jet-black shoulder-length hair with a left-side part, softly curved ends and fine side-swept bangs, almond-shaped brown eyes, gently arched fine eyebrows, a soft oval face tapering to a rounded chin, a small straight nose and well-defined medium-full lips, a silver star-shaped hair clip above the left temple and small pearl stud earrings, a slender neck, gently sloping shoulders and a slim upper torso with a softly defined waist,',
    'dna_portrait: An adult woman with light warm-toned skin, straight jet-black shoulder-length hair with a left-side part, softly curved ends and fine side-swept bangs, almond-shaped brown eyes, gently arched fine eyebrows, a soft oval face tapering to a rounded chin, a small straight nose and well-defined medium-full lips, a silver star-shaped hair clip above the left temple and small pearl stud earrings, a slender neck,',
    '三份是同一角色资料，不是三张图。半身和头像只删画外完整短语，不追加衣领、内搭、裤子、鞋靴或改写共同描述。身体比例直接描述身体本身，不用衣服覆盖或剪裁作身体特征；衣装只写 outfit_description，当次表情、视线和姿势不写入身份。',
    '可选 dna_uc_* 只写该景别身份需要排除的英文特征；无额外排除项时省略或留空，不写沿用正向、默认不变、表情姿势说明等自然语言指令。',
    '交付前先核对每份首行 slotid 和第二行 character 是否齐全且匹配本轮清单，再逐角色核对三景别、独立性格、衣装及全部必填字段；检查身份未混入穿戴物、景别共同描述保真和 UC 为实际排除项。只输出完整资料字段，不输出检查过程。',
].join('\n');
export const SPRITE_TEMPLATE = [...identity, TEMPLATE_RULE, PICTURE_RULE, SPRITE_HALF_BODY_RULE,
    '本轮交单人立绘模板，不输出 at 或 CG 当次身份旁路。缺身份景别时同次交 meta_dna_full_body、meta_dna_half_body、meta_dna_portrait: 本图索引 | 英文身份主语，可附 meta_dna_uc_对应景别；半身立绘也必须交齐三景别候选，不新增 partial。',
    '模板 Char 只引用自身身份和适用衣装槽，接默认站姿与平和表情，不照搬剧情动作。三景别身份不含衣装、表情、姿势或令牌；衣装旁路独立。逐槽完整写完后再分隔下一图，编号与任务一致。',
].join('\n');
export const SPRITE_CAPTION = [SOURCE_RULE, PICTURE_RULE, SPRITE_HALF_BODY_RULE,
    '本轮仅编写单人默认立绘画面，不提取或登记 DNA、性格或衣装候选。使用所给角色身份与指定衣装，保持默认站姿和平和表情，按实际取景只写可见特征。',
    '每份首行 #本轮编号，随后 scene: 英文人数、景别、机位与底色、char: 本人的完整英文可见身份、衣装、姿势与表情、uc: 排除项。若未提供编号，只交 #1 一份；已提供编号时逐一原样使用。',
    '每字段恰好一次；不使用身份或衣装令牌，不输出 slotid、meta、analysis、at、DNA 资料或 ---，多份以各自 #编号 开始。',
].join('\n');
