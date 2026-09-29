import { enabledFxTagKinds } from './fx-settings.js';

const FX_PROMPT_LINES = Object.freeze({
    call: '[igs-fx:call|来电角色名] … [igs-fx:call-end]：角色打来电话。来电标签放在通话内容之前，通话中的台词照常用[igs-char]，挂断后输出[igs-fx:call-end]',
    notify: '[igs-fx:notify|发送者|一句话内容]：手机弹出一条通知或短消息，不打断叙事；需要完整聊天记录时仍用线上聊天标签',
    flashback: '[igs-fx:flashback] … [igs-fx:flashback-end]：包住一段回忆或闪回的正文',
    dream: '[igs-fx:dream] … [igs-fx:dream-end]：包住梦境、幻觉或介于现实与想象之间的朦胧段落',
    letterbox: '[igs-fx:letterbox] … [igs-fx:letterbox-end]：包住告白、对峙、决战等需要电影感的严肃段落',
    sfx: '[igs-fx:sfx|拟声词]：巨响、撞击等瞬间的拟声大字，拟声词不超过4个字，如[igs-fx:sfx|砰]',
    eye: '[igs-fx:eye|open] / [igs-fx:eye|close]：主视角醒来睁眼 / 晕倒、入睡闭眼',
});

export function resolveFxPromptRule(settings) {
    const kinds = enabledFxTagKinds(settings);
    if (!kinds.length) return '';
    const lines = kinds.map((kind, index) => `${index + 1}. ${FX_PROMPT_LINES[kind]}`);
    return `[igs演出标签]
以下演出标签属于允许使用的igs标签，用于在关键时刻强化氛围：

${lines.join('\n')}

语法要求：
1. 每条标签独立成行，放在它所作用的正文之前
2. 字段不得换行，不得含 | 或 ]
3. 只在确实关键的时刻使用：每层回复中 call、notify、sfx、eye 这类瞬时标签合计不超过2个，不要每层都用
4. 成对标签必须闭合；不要发明未列出的类型`;
}
