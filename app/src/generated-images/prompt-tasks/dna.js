import { SOURCE_RULE, IDENTITY_RULE, OUTFIT_RULE } from './common.js';

export const DNA_TASK = '只整理本轮明确要求的可复用身份资料，不生成完整画面或剧情 CG。';
export const DNA_DATA = [
    '【先交图头】回复第一行直接写 slotid: 本轮实际槽号，第二行写 character: 对应规范角色键，单人单份也不省略；输入已有 slotId 不代替回复中的图头。', SOURCE_RULE, IDENTITY_RULE, OUTFIT_RULE,
    '按本次 promptTask 与 outputs.identityRequirements 交付缺失资料，不覆盖完整或主动清空身份；只在明确 sprite 用途中建立三景别候选。稳定性格独立写 personality，已有值及显式空值保持，仅缺键时提取，无依据可空。',
    '每份首行 slotid: 本轮编号，随后 character: 对应规范角色键、outfit_name、outfit_description。需要补身份时交 dna_full_body、dna_half_body、dna_portrait 及可选 dna_uc_对应景别；新身份、身份 UC 和新衣装说明只用逗号分隔的英文 TAG，身份字段非空且不超过4096字符，UC 可空。',
    '本槽 slotId 对应唯一 token，再取其 characterKey；不填别名、token 或译名。字段无索引、竖线或 meta_ 前缀。每份字段完整才以独立行 --- 分隔下一份，不输出 scene、char、镜头、姿势、背景、质量或完整绘图正文。',
    '三份身份来自同一纯 TAG 外貌母版，只删除画外部位的完整标签，权重组保持闭合，共同标签不分别重写；衣装、灰尘、血污、临时伤势、当次表情与动作不进入身份或性格。最后逐槽核对原编号、角色键、必填字段与保存资料保真。',
    '身体直接描述自身结构，不夹带衣领、内搭、裤子或鞋靴，穿戴物只写 outfit_description。可选 dna_uc_* 只写英文身份排除项，无额外排除项可省略或留空，不写沿用正向、默认值、表情姿势或交付说明。',
].join('\n');
