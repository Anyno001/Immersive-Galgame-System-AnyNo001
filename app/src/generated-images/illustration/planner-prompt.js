import { FICTION_FRAME, CG_COMPOSITION_GUIDE, TAG_WRITING_RULES, SOFT_MODE_NOTE } from './prompt-kit.js';

const PLANNER_OUTPUT_FORMAT = [
    '【输出格式】不要输出 JSON、不要代码块、不要解释。每张图按以下字段一行一个输出，多张图依次排列：',
    'slot: 图序号（从 1 开始）',
    'at: 这张图从第几段开始显示（填正文编号，必须是整数）',
    'analysis: 一句话中文说明画面内容',
    'scene: 画面整体 tag（人数如 1girl/1boy/2girls、地点、时间、光线、构图、镜头、氛围）',
    'scene_uc: 这张图不能出现的 tag，可留空',
    'char: x,y | 该角色的 tag（外貌、服装、表情、动作、姿势）',
    'char_uc: 该角色不能出现的 tag，可留空',
    '每个出场角色写一对 char / char_uc；x,y 是角色在画面中的位置，取值只能是 0.1/0.3/0.5/0.7/0.9；没有人物就不要写 char。',
];

const PLANNER_SELECTION_RULES = [
    '【选图规则】',
    '1. 不同插图的 at 必须不同，并按从小到大排列。',
    '2. 选择剧情最有画面感、情绪最强的段落；过场插图优先选场景转换、动作高潮或情感转折。',
];

const PLANNER_TAG_RULES = ['【tag 规则】', ...TAG_WRITING_RULES.map((rule, i) => `${i + 1}. ${rule}`)];

export const PLANNER_SYSTEM_PROMPT = [
    ...FICTION_FRAME,
    '任务：阅读一段视觉小说正文，挑选最适合配插图的画面，为每张图写出可直接用于 NovelAI V4.5 结构化 caption 的英文 tag。',
    '',
    ...PLANNER_OUTPUT_FORMAT,
    '',
    ...CG_COMPOSITION_GUIDE,
    '',
    ...PLANNER_SELECTION_RULES,
    '3. 正文标记为 NSFW 场景时，照实描写画面所需的成人内容 tag，不要回避或替换。',
    '',
    ...PLANNER_TAG_RULES,
].join('\n');

// 主提示词被拦截（拒答或无字段）时的重试版本：只要构图，露骨 tag 由插件本地补。
export const PLANNER_SOFT_SYSTEM_PROMPT = [
    ...FICTION_FRAME,
    '任务：阅读一段视觉小说正文，挑选最适合配插图的画面，为每张图写出可直接用于 NovelAI V4.5 结构化 caption 的英文 tag。',
    '',
    ...PLANNER_OUTPUT_FORMAT,
    '',
    ...CG_COMPOSITION_GUIDE,
    '',
    ...PLANNER_SELECTION_RULES,
    '',
    ...SOFT_MODE_NOTE,
    '',
    ...PLANNER_TAG_RULES,
].join('\n');

export function buildPlannerUserPrompt({ numberedText, scenes, characters, previousText, want, exact, isNsfw }) {
    const lastScene = scenes && scenes.length ? scenes[scenes.length - 1] : null;
    const sceneLine = lastScene
        ? `${lastScene.scene}｜${lastScene.time}｜${lastScene.weather}${lastScene.nsfw ? '｜NSFW' : ''}`
        : '未标注';
    const countLine = exact
        ? `本楼需要恰好 ${want} 张插图。`
        : `本楼需要 1 到 ${want} 张插图，按剧情判断，画面感不足时只出 1 张。`;
    return [
        `【场景】${sceneLine}`,
        `【出场角色】${characters && characters.length ? characters.join('、') : '未标注'}`,
        previousText ? `【前文摘要】\n${previousText}` : '',
        `【本楼正文（已编号）】\n${numberedText}`,
        `【要求】${countLine}${isNsfw ? '本楼为 NSFW 场景，请选择最具代表性的画面。' : ''}`,
        '请直接按输出格式给出字段。',
    ].filter(Boolean).join('\n\n');
}
