import { SOURCE_RULE } from './common.js';

export const BACKGROUND_TASK = '绘制本轮指定地点的视觉小说背景空镜，不新增剧情人物。';
const rules = [SOURCE_RULE,
    '连贯描述建筑风格、空间结构、陈设地标、相对位置、时间、天气和必要光影。同一连续道路、墙面或列车不拆为多个互斥对象；区分固有颜色与光照。',
    '已提供前文只帮助延续同一空间的标志物位置和合理光影，明确换地点或时间推进才改变状态。不搬用旧镜头，不凭空消除持续痕迹。',
    '不添加人物、剪影、动物或文字，不输出人物身份、衣装与表情字段。按本次 writingRequirements/userPrompts 写明尺寸、镜头、质量、UC 和底色。',
];
export const BACKGROUND_CAPTION = [...rules,
    '只输出本轮 outputs.slotIds，每份以独立一行 #编号 开始，随后 scene: 完整英文背景画面、char: 留空、uc: 排除项。三个字段各一次，scene 非空，char 和 uc 的空值不省略字段；不输出 slotid、at、meta 或身份令牌。',
    '#1',
    'scene: An empty concrete shelter hall with canvas cots along the walls and supply crates beside a steel door, lit by pale emergency lamps.',
    'char:', 'uc: people, silhouettes, animals, text, watermark',
    '示例编号与背景不是本轮任务，逐项替换并核对编号和地点，不增减项目。',
].join('\n');
export const BACKGROUND_PLAN = [...rules,
    '本轮使用 asset-plan：每项依次写 id: outputs.items 中的原编号、tags: 完整英文背景画面、uc: 完整负面要求。每项一次，不增减或重编号；不写 slotid、scene、char 或人物旁路。混合清单中的非背景项仅按其明确 type 和描述完成，不让背景规则新增人物。',
].join('\n');
