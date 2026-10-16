import { SOURCE_RULE } from './common.js';
import { TEMPLATE_RULE, PICTURE_RULE } from './template.js';

export const AVATAR_TASK = '制作本轮指定角色的 Q 版头像，保留可辨认的头颈身份锚点，不重新设计身份或衣装。';
const rules = [SOURCE_RULE, PICTURE_RULE,
    '使用保存的 portrait 身份与指定衣装，强调头肩和面部，保留头发、角、非人耳及头颈标志饰品。只呈现可见领口，不带画外裙摆、鞋脚或全身体态，不扩大镜头来补画不可见特征。',
    'Q 版是画面风格，不改变保存 DNA、发色、五官锚点、衣装原名或说明。按本次要求完成头像构图、底色、质量与 UC。',
];
export const AVATAR_TEMPLATE = [...rules, TEMPLATE_RULE,
    '按本轮 slot 与角色精确绑定，只引用保存身份及所需景别；不输出 at、meta_identity、meta_signature、meta_dna_* 或临时校正字段，不建立身份候选。单张头像内部不写 ---。',
].join('\n');
export const AVATAR_CAPTION = [...rules,
    '每份首行 #本轮编号，随后 scene: 英文头像构图与共同画面、char: 本人的完整英文可见身份衣装及表情、uc: 排除项。每字段一次，char 不使用身份或衣装令牌，不写 meta、at 或 slotid；多份按本轮编号依次完成。',
].join('\n');
