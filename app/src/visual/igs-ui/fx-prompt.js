import { isDlcFxEnabled, listDlcFx, normalizeDlcFxSettings } from '../../scene/fx-registry.js';
import { enabledFxTagKinds } from './fx-settings.js';

const FX_PROMPT_LINES = Object.freeze({
    call: '[igs-fx:call|来电角色名] … [igs-fx:call-end]：角色打来电话；主角主动打给对方时改用[igs-fx:dial|角色名]；视频通话在名字后加第3段「视频」，如[igs-fx:call|爱丽丝|视频]。通话标签放在通话内容之前，通话中的台词照常用[igs-char]，挂断后输出[igs-fx:call-end]；没接通、被拒接或被对方挂断时写[igs-fx:call-end|未接]、[igs-fx:call-end|拒接]、[igs-fx:call-end|对方挂断]',
    notify: '[igs-fx:notify|发送者|一句话内容]：手机弹出一条通知或短消息，不打断叙事；需要完整聊天记录时仍用线上聊天标签',
    delivery: '[igs-fx:delivery|物品|配送方|阶段]：外卖、快递之类送到手上的东西，送出时舞台上方弹出一张卡片。物品写具体名目，如外卖、奶茶、快递；配送方可省，如美团骑手、顺丰；阶段写order（刚下单）或arrive（送到并按下门铃，默认），如[igs-fx:delivery|外卖|美团骑手|arrive]',
    flashback: '[igs-fx:flashback] … [igs-fx:flashback-end]：包住一段回忆或闪回的正文',
    dream: '[igs-fx:dream] … [igs-fx:dream-end]：包住梦境、幻觉或介于现实与想象之间的朦胧段落',
    letterbox: '[igs-fx:letterbox] … [igs-fx:letterbox-end]：包住告白、对峙、决战等需要电影感的严肃段落',
    sfx: '[igs-fx:sfx|拟声词]：巨响、撞击、破碎、铃响、疾风掠过等瞬间音效，只发声不显示文字，拟声词不超过4个字，如[igs-fx:sfx|砰]、[igs-fx:sfx|叮]',
    eye: '[igs-fx:eye|open] / [igs-fx:eye|close]：主视角醒来睁眼 / 晕倒、入睡闭眼',
    whisper: '[igs-fx:whisper] … [igs-fx:whisper-end]：包住耳语、悄悄话，只标说话方式，台词照常用[igs-char]',
    nickname: '[igs-fx:nickname|角色名|新称呼]：角色第一次改用新的称呼叫主角时使用，每层最多1个',
    voicemail: '[igs-fx:voicemail|发送者|一句话内容]：未接来电后留下的语音留言，通常紧跟[igs-fx:call-end|未接]',
    contact: '[igs-fx:contact|角色名]：主角与角色交换联系方式、加好友的时刻，每层最多1个',
    cutin: '[igs-fx:cutin|角色名]：角色做出决定性表情或说出关键台词的一瞬间，漫画式脸部特写；角色名可省（默认当前说话人），每层最多1个',
    promise: '[igs-fx:promise|时间|地点]：两人约好在某时某地见面或做某事的时刻，时间写剧情里的说法，地点可省，每层最多1个',
    movie: '[igs-fx:movie] … [igs-fx:movie-end]：包住在电影院或家里一起看电影的段落',
    light: '[igs-fx:light|off] … [igs-fx:light|on]：关灯后的段落，重新开灯时写[igs-fx:light|on]',
    umbrella: '[igs-fx:umbrella] … [igs-fx:umbrella-end]：包住两人撑伞同行的段落',
});

// 古代背景下同一标签换成古代的语义；其余类型沿用通用写法（现代专属类型已由 fx-era 拨掉）。
const ANCIENT_FX_PROMPT_LINES = Object.freeze({
    notify: '[igs-fx:notify|来人|一句话内容]：下人、信使、侍卫等前来通报一件事，不打断叙事，如[igs-fx:notify|小厮|老爷回府了]；需要完整书信往来时仍用书信标签',
    light: '[igs-fx:light|off] … [igs-fx:light|on]：吹灯后的段落，重新点灯时写[igs-fx:light|on]',
});

export function resolveFxPromptRule(settings, { ancient = false } = {}) {
    const kinds = enabledFxTagKinds(settings);
    if (!kinds.length) return '';
    const lineOf = (kind) => (ancient && ANCIENT_FX_PROMPT_LINES[kind]) || FX_PROMPT_LINES[kind];
    const lines = kinds.map((kind, index) => `${index + 1}. ${lineOf(kind)}`);
    return `[igs演出标签]
以下演出标签属于允许使用的igs标签，用于在关键时刻强化氛围：

${lines.join('\n')}

语法要求：
1. 每条标签独立成行，放在它所作用的正文之前
2. 字段不得换行，不得含 | 或 ]
3. 只在确实关键的时刻使用：每层回复中 call、dial、notify、delivery、sfx、eye 这类瞬时标签合计不超过2个，不要每层都用
4. 成对标签必须闭合；不要发明未列出的类型`;
}

// 物品事件标签独立于演出标签开关：只在物品演出开启时注入。
export const ITEM_FX_PROMPT_LINE = '[igs-fx:item|获得|物品名|一句话描述]：角色获得、失去或使用一件具体物品时使用，动作只写 获得／失去／使用，描述可省略，如[igs-fx:item|获得|黄铜钥匙|刻着校徽的旧钥匙]；剧情关键物品获得时可在末尾加第5段「重要」，如[igs-fx:item|获得|星之坠饰|母亲留下的遗物|重要]';

export function resolveItemFxPromptRule(enabled) {
    if (enabled !== true) return '';
    return `[igs物品标签]
${ITEM_FX_PROMPT_LINE}

语法要求：
1. 标签独立成行，放在描写该物品的正文之前
2. 字段不得换行，不得含 | 或 ]；物品名写具体名称，不写数量
3. 只在物品确实易手或被使用时输出，每层回复不超过3个
4. 「重要」只留给推动剧情的关键物品，每层回复最多1个，普通物品不要加`;
}

// 配乐情绪标签独立于演出标签开关：背景音乐与其「情绪标签」都开启、且曲目里有情绪分类时才注入（只配了关键词曲目时写了也用不上）。
export const BGM_GRAMMAR_LINE = 'bgm|情绪：配乐气氛转折时写一次，情绪只写 日常、欢快、甜、静、悲、紧、战、诡 之一，如[igs-fx:bgm|悲]；气氛不变就不写。告白、噩耗、真相揭晓这类要屏住呼吸的瞬间写[igs-fx:bgm|无声]让音乐停下，之后气氛定了再写情绪';

export function bgmMoodTagEnabled(bgm) {
    const s = bgm && typeof bgm === 'object' ? bgm : {};
    return s.enabled === true && s.moodTag !== false && Array.isArray(s.tracks)
        && s.tracks.some((track) => track && Array.isArray(track.moods) && track.moods.length > 0);
}

export function resolveBgmPromptRule(bgm) {
    if (!bgmMoodTagEnabled(bgm)) return '';
    return `[igs配乐标签]
[igs-fx:bgm|情绪]：配乐气氛转折时写一次，情绪只写 日常、欢快、甜、静、悲、紧、战、诡 之一，如[igs-fx:bgm|悲]
[igs-fx:bgm|无声]：告白、噩耗、真相揭晓这类要屏住呼吸的瞬间让音乐停下；之后气氛定了再写情绪，没写时几页后音乐自己回来

语法要求：
1. 标签独立成行，放在气氛转折处的正文之前
2. 每层回复最多1个；同一场景气氛没变时不要重复输出`;
}

// 亲密氛围标签独立于演出标签开关：只在亲密演出开启时注入。只标氛围档位，不要求 AI 描写画面。
// 参数为 readerSettings.romanceFx（兼容旧的布尔调用）；对象栏、告白、回忆的写法只在对应子开关开启时出现。
export function resolveRomanceFxPromptRule(settings) {
    const s = settings === true ? { enabled: true } : settings && typeof settings === 'object' ? settings : {};
    if (s.enabled !== true) return '';
    const lines = [
        `[igs-fx:romance|暧昧${s.rival === true ? '|对象角色名' : ''}] … [igs-fx:romance-end]：包住两人关系升温、心动、暧昧的段落${s.rival === true ? '；对象角色名写与主角暧昧的那位（不写主角本人），可省略' : ''}`,
        '[igs-fx:romance|亲密]：在区间内升档，用于拥抱、依偎、亲吻等明显亲密的段落，可直接写在暧昧区间里而不先结束',
    ];
    if (s.confess === true) lines.push('[igs-fx:confess]：放在告白台词之前，只用于角色正式表白心意的那一刻，对方的回答照常写在后面');
    if (s.memories === true) lines.push('[igs-fx:memory|回忆名称]：两人关系里值得纪念的节点，如[igs-fx:memory|初次约会]、[igs-fx:memory|第一次牵手]，名称不超过8个字');
    if (s.senses !== false) lines.push(`[igs-fx:sense|感官] … [igs-fx:sense-end]：${SENSE_PROMPT_TEXT}`);
    if (s.solo !== false) lines.push(`[igs-fx:solo|想着的角色名] … [igs-fx:solo-end]：${SOLO_PROMPT_TEXT}`, `[igs-fx:noise|动静]：${NOISE_PROMPT_TEXT}`);
    const instant = s.confess === true || s.memories === true;
    return `[igs亲密氛围标签]
${lines.join('\n')}

语法要求：
1. 标签独立成行，放在它所作用的正文之前；档位只写 暧昧 或 亲密
2. 氛围回落或场景结束时输出[igs-fx:romance-end]
3. 情事段落仍按原有规则在场景标签标记 nsfw，不需要另写 romance 标签
4. 标签只标记氛围档位，不因为使用标签而增加任何露骨描写${instant ? '\n5. confess、memory 每层回复合计最多1个，只留给真正关键的时刻' : ''}`;
}

// 感官调度：亲密 / 情事段里某种感官占主导时标出来，前端据此放大这一感官、压下其余。
const SOLO_PROMPT_TEXT = '包住角色独自一人的情事段（自慰），与场景的 nsfw 标记一起用；角色此时想着某个人时写上那人的名字，否则省略';
const NOISE_PROMPT_TEXT = '独处时外面传来的动静，让角色以为要被发现，动静只写 脚步、敲门、手机、开门 之一';
const SENSE_PROMPT_TEXT = '亲密或情事段落里某一种感官明显占主导时使用，感官只写 蒙眼、耳边、触碰、热、凉、香、屏息、失神 之一；感官转移时直接写新的 sense，回到常态写 sense-end；只标感官，不因此增加露骨描写';

// 精简语法（tag-grammar 统一拼接）：只写「类型|参数：用途」，通用规则由组装器写一次。
export const FX_GRAMMAR_LINES = Object.freeze({
    call: 'call|来电角色名 … call-end：角色来电，通话台词照常用 igs-char；视频通话加第3段「视频」；主角拨出改用 dial|角色名；没接通写 call-end|未接、call-end|拒接 或 call-end|对方挂断',
    notify: 'notify|发送者|一句话内容：手机弹出一条通知或短消息，不打断叙事',
    flashback: 'flashback … flashback-end：包住回忆或闪回',
    dream: 'dream … dream-end：包住梦境、幻觉或介于现实与想象之间的朦胧段落',
    letterbox: 'letterbox … letterbox-end：包住告白、对峙、决战等需要电影感的严肃段落',
    sfx: 'sfx|拟声词：巨响、撞击、破碎、铃响等瞬间音效，只发声不显示，拟声词不超过4字',
    eye: 'eye|open / eye|close：主视角醒来睁眼 / 晕倒、入睡闭眼',
    whisper: 'whisper … whisper-end：包住耳语、悄悄话，只标说话方式，台词照常用 igs-char',
    nickname: 'nickname|角色名|新称呼：角色第一次改用新的称呼叫主角时，每层最多1个',
    voicemail: 'voicemail|发送者|一句话内容：未接来电后留下的语音留言，通常紧跟 call-end|未接',
    contact: 'contact|角色名：主角与角色交换联系方式、加好友的时刻，每层最多1个',
    cutin: 'cutin|角色名：角色做出决定性表情或说出关键台词的一瞬间的漫画式脸部特写，角色名可省（默认当前说话人），每层最多1个',
    promise: 'promise|时间|地点：两人约好在某时某地见面或做某事的时刻，时间写剧情里的说法，地点可省，每层最多1个',
    movie: 'movie … movie-end：包住一起看电影的段落',
    light: 'light|off … light|on：关灯后的段落，重新开灯写 light|on',
    umbrella: 'umbrella … umbrella-end：包住撑伞同行的段落',
});

const ANCIENT_FX_GRAMMAR_LINES = Object.freeze({
    notify: 'notify|来人|一句话内容：下人、信使、侍卫等前来通报一件事，不打断叙事',
    light: 'light|off … light|on：吹灯后的段落，重新点灯写 light|on',
});

export function fxGrammarLines(settings, { ancient = false } = {}) {
    return enabledFxTagKinds(settings).map((kind) => (ancient && ANCIENT_FX_GRAMMAR_LINES[kind]) || FX_GRAMMAR_LINES[kind]);
}

export const ITEM_FX_GRAMMAR_LINE = 'item|获得|物品名|一句话描述：角色获得、失去或使用具体物品，动作只写 获得/失去/使用，描述可省，物品名不写数量；推动剧情的关键物品在末尾加「重要」，每层最多1个';

export function romanceGrammarLines(settings) {
    const s = settings === true ? { enabled: true } : settings && typeof settings === 'object' ? settings : {};
    if (s.enabled !== true) return [];
    const lines = [
        `romance|暧昧${s.rival === true ? '|对象角色名' : ''} … romance-end：包住关系升温、心动、暧昧的段落${s.rival === true ? '，对象角色名不写主角本人、可省' : ''}；拥抱、亲吻等明显亲密处在区间内写 romance|亲密 升档；只标氛围，不因此增加露骨描写`,
    ];
    if (s.confess === true) lines.push('confess：放在正式告白台词之前，对方的回答照常写在后面');
    if (s.memories === true) lines.push('memory|回忆名称：两人关系里值得纪念的节点，名称不超过8字');
    if (s.senses !== false) lines.push(`sense|感官 … sense-end：${SENSE_PROMPT_TEXT}`);
    if (s.solo !== false) lines.push(`solo|想着的角色名 … solo-end：${SOLO_PROMPT_TEXT}`, `noise|动静：${NOISE_PROMPT_TEXT}`);
    return lines;
}


// 陪衬反应标签独立于演出标签开关：只在多角色同屏与其「陪衬反应」子开关同时开启时注入。
export const STAGE_CAST_REACT_PROMPT_LINE = '[igs-fx:react|角色名|情绪]：同场景里没在说话的角色对当前台词有明显反应时使用，如[igs-fx:react|爱丽丝|害羞]；所有人一起吃惊时角色名写「全员」';

export function resolveStageCastFxPromptRule(stageCast) {
    const s = stageCast && typeof stageCast === 'object' ? stageCast : {};
    const lines = s.enabled === true
        ? [s.castReact === true ? STAGE_CAST_REACT_PROMPT_LINE : '', s.castStage === true ? STAGE_CAST_STAGE_PROMPT_LINE : ''].filter(Boolean)
        : [];
    if (!lines.length) return '';
    return `[igs同屏角色标签]
以下标签属于允许使用的igs标签，用于表现同场景里其他角色的反应与走位：

${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}

语法要求：
1. 标签独立成行，放在引起反应的台词之前
2. 字段不得换行，不得含 | 或 ]
3. 只在反应或走位明显时使用，每种标签每层回复最多3个，不要每层都用`;
}

// 按需注入（tag-grammar）用的精简写法，开关条件与 resolveStageCastFxPromptRule 一致。
export const STAGE_CAST_REACT_GRAMMAR_LINE = 'react|角色名|情绪：同场景里没在说话的角色对当前台词有明显反应时用，所有人一起吃惊时角色名写「全员」，每层最多3个';

// 站位标签：只在多角色同屏与「走位」子开关同时开启时注入。
export const STAGE_CAST_STAGE_PROMPT_LINE = '[igs-fx:stage|动作|角色|角色]：同场景角色明显走位时使用，动作只写 靠近／拉开（写两个角色）、背对／上前／离开（写一个角色）、复位（不写角色）；角色上场的那一刻可写 跑进来／探头／慢慢走进来，如[igs-fx:stage|靠近|爱丽丝|鲍勃]、[igs-fx:stage|探头|爱丽丝]；离开的角色再次说话即回到场上';
export const STAGE_CAST_STAGE_GRAMMAR_LINE = 'stage|动作|角色|角色：同场景角色明显走位时用，动作只写 靠近/拉开（两个角色）、背对/上前/离开（一个角色）、复位（不写角色），上场时可写 跑进来/探头/慢慢走进来；离开的角色再次说话即回到场上，每层最多3个';

// AI 镜头指令：镜头语言与其「AI 镜头指令」子开关同时开启时注入。
export const CAMERA_GRAMMAR_LINE = 'cam|镜头|角色或方向：关键时刻改变镜头，镜头只写 特写（推到说话人脸上，可写角色名）／拉远（人物退远、显得孤单或渺小）／虚化（背景糊掉、只看人物）／摇镜（横扫环境，第3段写 左 或 右）／倾斜（不安、眩晕、失衡）；只作用于标签所在那一页，平常不要用，每层最多2个';

export function cameraGrammarLines(camera) {
    const s = camera && typeof camera === 'object' ? camera : {};
    return s.enabled === true && s.aiShots !== false ? [CAMERA_GRAMMAR_LINE] : [];
}

export function stageCastGrammarLines(stageCast) {
    const s = stageCast && typeof stageCast === 'object' ? stageCast : {};
    if (s.enabled !== true) return [];
    return [s.castReact === true ? STAGE_CAST_REACT_GRAMMAR_LINE : '', s.castStage === true ? STAGE_CAST_STAGE_GRAMMAR_LINE : ''].filter(Boolean);
}

// DLC 演出：已登记、没被关掉、作者写了说明的才告诉模型。语法提示由 IGS 按模式补上，作者只写什么时候用。
export function dlcFxGrammarLines(dlcFxSettings) {
    const settings = normalizeDlcFxSettings(dlcFxSettings);
    return listDlcFx()
        .filter((def) => def.prompt && isDlcFxEnabled(def.kind, settings))
        .map((def) => (def.mode === 'range'
            ? `${def.kind} … ${def.kind}-end（区间，包住整段）：${def.prompt}`
            : `${def.kind}|参数（瞬时，参数可省）：${def.prompt}`));
}

export function resolveDlcFxPromptRule(dlcFxSettings) {
    const lines = dlcFxGrammarLines(dlcFxSettings);
    if (!lines.length) return '';
    return `[igs扩展演出标签]
以下是扩展包提供的演出标签，写法同 igs 演出标签：[igs-fx:类型|参数]，区间型用 [igs-fx:类型-end] 结束：

${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}

只在确实合适的时刻使用，每层回复最多用 2 个；不要发明未列出的类型。`;
}
