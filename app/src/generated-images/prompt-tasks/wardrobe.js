import { SOURCE_RULE, OUTFIT_RULE } from './common.js';

export const WARDROBE_TASK = '只整理本套命名衣装的独立纯英文 TAG 服装 DNA，作为后续绘图的可复用资料，不绘制服装静物或人物。';
export const WARDROBE_CAPTION = [SOURCE_RULE, OUTFIT_RULE,
    '本轮是独立 outfit-dna 提取：从已提供正文与衣装要求提取整套纯英文服装 TAG，细节也只用标签；不是画面写词，不套用质量、底色、透明底、镜头或人物动作规则。衣装原名和已有说明保真，首次未指定的视觉细节按衣装规则一次补全。',
    '只使用 caption-slots 承载资料。每份从独立一行 #本轮编号 开始，随后 scene: 完整纯英文服装 TAG、char: 留空、uc: 留空。每个字段各一次，scene 非空；char 与 uc 留空也保留字段名。不写 slotid、at、meta、DNA、人物主语、解释或代码围栏。',
    '示例是格式说明，不是本轮设计，编号与衣装以实际输入为准：',
    '#1',
    'scene: blue shirt, collared shirt, short sleeves, epaulettes, black armor, blue pants, cargo pants, black belt, black footwear, knee boots, lace-up boots',
    'char:', 'uc:',
    '交付前对账槽号、衣装原名、已知主辅色与部位、材质剪裁和内外层；身体身份、性格、表情和剧情动作不进入说明。',
].join('\n');
