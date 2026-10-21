// 题材包清单：武侠江湖。字段同 fx-pack-myth.js；本文件只导出 PACK，由 scene/fx-packs.js 汇总。
// 只在古代背景开放（era:'ancient'）；演出焦墨落笔，任何对话框皮肤下都按这一套画，不改战斗演出。
import { WUXIA_KINDS, WUXIA_LABELS, WUXIA_PROMPT_LINES, WUXIA_TRIGGERS, parseWuxiaBody, wuxiaFxOf } from './fx-wuxia-model.js';
import { WUXIA_BUILDERS } from './fx-wuxia.js';
import { WUXIA_SFX_DEFS } from './fx-wuxia-sfx.js';
import { WUXIA_STYLE_TEXT } from './fx-wuxia-style.js';

export const PACK = {
    id: 'wuxia',
    label: '武侠江湖',
    when: '江湖人物、门派、比武与秘籍的场面才用',
    era: 'ancient',
    kinds: [...WUXIA_KINDS],
    labels: WUXIA_LABELS,
    triggers: WUXIA_TRIGGERS,
    promptLines: WUXIA_PROMPT_LINES,
    parse: (type, fields) => parseWuxiaBody(type, fields),
    of: (args) => wuxiaFxOf(args),
    builders: WUXIA_BUILDERS,
    sfx: WUXIA_SFX_DEFS,
    cssText: WUXIA_STYLE_TEXT,
};
