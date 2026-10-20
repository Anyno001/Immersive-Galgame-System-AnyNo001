import { SOURCE_RULE } from './common.js';
import { SPRITE_TEMPLATE_RULE, SPRITE_PICTURE_RULE } from './template.js';
import { SPRITE_HALF_BODY_RULE } from '../prompt-registry.js';

export const EXPRESSION_TASK = '只处理本轮指定表情，保持角色身份和当前命名衣装，不借表情重新设计人物。';
export const EXPRESSION_FRAGMENTS = [SOURCE_RULE,
    '只输出 expression-fragments，每份从 slotid: 本轮编号 开始，随后 character: 本槽规范角色键、expression: 英文面部变化、expression_uc: 面部排除项。expression 非空，UC 可空但字段不能省略。',
    '按 outputs.rows 的 slotId 和 characterKey 写图号与角色，不写别名。characterContext 提供本人身份 DNA 和当前衣装，仅作为表情参考。按本轮指定表情与用户要求，只写眼、眉、嘴、脸颊等可见变化，可结合所给性格，不复述身份、衣装，不写身体姿势、手势、道具、背景、镜头、质量或底色。',
    '每份完整写完才以独立行 --- 分隔下一份，单份不写分隔符。字段无索引和竖线，只交指定表情片段，不输出 scene、char、meta 或 DNA 候选。',
    '示例仅说明字段结构，编号、角色和表情以本轮任务为准：',
    'slotid: 1', 'character: 示例角色',
    'expression: eyebrows gently raised, eyes slightly widened and lips parted in surprise',
    'expression_uc: closed eyes',
    '交付前对账本轮槽号集合、规范角色键和指定表情，字段各一次，不复用其他槽的表情。',
].join('\n');
export const EXPRESSION_TEMPLATE = [SOURCE_RULE, SPRITE_TEMPLATE_RULE, SPRITE_PICTURE_RULE, SPRITE_HALF_BODY_RULE,
    '本轮按指定表情逐图输出完整立绘模板。每个 slot 是一张独立图片，不是同图多个表情；本图索引从0开始，只绑定该槽角色。',
    '只引用保存身份、所需景别和当前衣装，改变指定的可见面部表情，不沿用剧情坐姿或动作，不更换衣装。完整写完本图字段再分隔下一图。',
    '不输出 at、meta_identity、meta_signature、meta_dna_* 或临时校正字段，不建立身份候选。',
].join('\n');
