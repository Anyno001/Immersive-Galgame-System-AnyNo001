import { SOURCE_RULE, OUTFIT_RULE } from './common.js';

export const WARDROBE_TASK = '只整理本套命名衣装的独立英文穿着说明，作为后续绘图的可复用资料，不绘制服装静物或人物。';
export const WARDROBE_CAPTION = [SOURCE_RULE, OUTFIT_RULE,
    '本轮是独立 outfit-dna 提取：从已提供正文与衣装要求提取整套穿戴谓语；不是画面写词，不套用质量、底色、透明底、镜头或人物动作规则。衣装原名和已有说明保真，首次未指定的视觉细节按衣装规则一次补全。',
    '只使用 caption-slots 承载资料。每份从独立一行 #本轮编号 开始，随后 scene: 完整英文穿着谓语、char: 留空、uc: 留空。每个字段各一次，scene 非空；char 与 uc 留空也保留字段名。不写 slotid、at、meta、DNA、人物主语、解释或代码围栏。',
    '示例是格式说明，不是本轮设计，编号与衣装以实际输入为准：',
    '#1',
    'scene: wears a light-blue cotton short-sleeved shirt with a pointed collar and dark-navy shoulder tabs beneath a matte-black lightweight armor vest, paired with deep-navy cargo trousers, a black nylon belt and black leather mid-calf lace-up boots',
    'char:', 'uc:',
    '交付前对账槽号、衣装原名、已知主辅色与部位、材质剪裁和内外层；身体身份、性格、表情和剧情动作不进入说明。',
].join('\n');
