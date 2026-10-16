import { SOURCE_RULE } from './common.js';

export const ITEM_TASK = '为本轮清单物品制作独立静物图标。一项一图，物品是唯一主体，不绘制人物或穿着者。';
export const ITEM_PLAN = [SOURCE_RULE,
    '逐项识别物品类型、用途、材质、固有颜色、轮廓、结构与显著细节；服从来源，不把一个物品混入其他清单项目。用连贯英文表达可见物体，不写心理、剧情过程或人物动作。',
    '按 writingRequirements 与 userPrompts 写明本轮静物构图、镜头、尺寸、底色或透明底、质量与负面要求。tags 写完整画面，uc 写排除项，不输出画师。',
    '只输出 asset-plan，每项依次写 id: 本轮清单编号、tags: 完整英文静物画面、uc: 完整负面要求。编号逐字取 outputs.items，每项恰好一次，不增减或重编号；UC 可空但字段必须出现。',
    '不输出 slotid、scene、char、meta、身份或衣装令牌。不添加人、手、人体、穿着者、文字、水印或其他清单物品；背景与投影按本轮底色要求处理。',
    '示例只说明结构，编号、物品与底色用本轮输入替换：',
    'id: ch1',
    'tags: A single brass key with a round bow and three square teeth, centered in a clean isolated product view against a plain white background.',
    'uc: hands, person, text, watermark, multiple objects',
    '输出前逐项核对编号集合、物品归属、已知材质颜色与结构、单物构图及本次底色质量要求；不输出解释、JSON、标题或代码围栏。',
].join('\n');
