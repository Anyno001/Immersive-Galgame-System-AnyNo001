import { DAILY_FX_KINDS, DAILY_FX_PAGE_MAX, dailyFxOf, parseDailyFxBody } from './daily-fx-directives.js';
import { FEED_VIEW_MAX, foldFeedDirectives, foldStormDirectives, parseFeedBody } from './feed-platforms.js';
import { normalizeBgmCue } from './bgm-moods.js';
import { DLC_FX_ARG_MAX, DLC_FX_PAGE_MAX, getDlcFx, isDlcFxKind } from './fx-registry.js';

export const FX_TAG_KINDS = Object.freeze(['call', 'notify', 'delivery', 'flashback', 'dream', 'letterbox', 'sfx', 'eye', 'whisper', 'nickname', 'voicemail', 'contact', 'cutin', 'promise', 'movie', 'light', 'umbrella']);
export const FX_RANGE_KINDS = Object.freeze(['call', 'flashback', 'dream', 'letterbox', 'whisper', 'movie', 'light', 'umbrella']);
// 外卖 / 快递 [igs-fx:delivery|物品|配送方|阶段]：物品必填（外卖、快递、奶茶…），配送方可省，
// 阶段 order 为刚下单、arrive 为送到门口按门铃（默认）；阶段词写错按 arrive 处理。
export const FX_DELIVERY_STAGES = Object.freeze(['order', 'arrive']);
// 关灯区间：light|off 开始、light|on 或 light-end 结束；其余写法整条丢弃。
const FX_LIGHT_MODES = Object.freeze({ off: 'off', 关: 'off', 关灯: 'off', 吹灯: 'off', on: 'on', 开: 'on', 开灯: 'on', 点灯: 'on' });
export const FX_EYE_MODES = Object.freeze(['open', 'close']);
// 物品事件 [igs-fx:item|获得|名称|描述|重要]：独立于 FX_TAG_KINDS（不进入标签演出开关），由物品演出开关控制。
export const FX_ITEM_ACTIONS = Object.freeze({ 获得: 'gain', 得到: 'gain', gain: 'gain', 失去: 'lose', lose: 'lose', 使用: 'use', use: 'use' });
// 第 5 段可选：写「重要」等标记的物品获得时走屏幕中央大演出；其余写法一律当普通物品。
export const FX_ITEM_RARE_MARKS = Object.freeze(['重要', '稀有', '关键', 'rare', 'important']);
// 同页物品卡上限；超出部分只计数，由演出显示「等 N 件」。
export const FX_ITEM_PAGE_MAX = 3;
// 战斗事件 [igs-fx:battle|对手|称号] … [igs-fx:battle-end|胜利]、[igs-fx:hit|出手者|目标|招式|结果]：
// 同样独立于 FX_TAG_KINDS，由战斗演出开关控制；不带数值，结果词写错时按普通命中 / 无结算处理。
export const FX_BATTLE_RESULTS = Object.freeze({
    胜利: 'win', 获胜: 'win', win: 'win', 败北: 'lose', 战败: 'lose', 失败: 'lose', lose: 'lose',
    撤退: 'escape', 逃跑: 'escape', 逃脱: 'escape', escape: 'escape',
});
export const FX_HIT_RESULTS = Object.freeze({
    命中: 'hit', hit: 'hit', 暴击: 'crit', 会心: 'crit', crit: 'crit', 闪避: 'miss', 落空: 'miss', miss: 'miss',
    格挡: 'guard', 防御: 'guard', guard: 'guard', 击倒: 'ko', 倒下: 'ko', ko: 'ko', 治疗: 'heal', 恢复: 'heal', heal: 'heal',
});
export const FX_HIT_PAGE_MAX = 3;
// 陪衬反应 [igs-fx:react|角色名|情绪词]：独立于 FX_TAG_KINDS，由多角色同屏的 stageCast.castReact 控制；
// 角色名缺失整条丢弃，情绪词可省；角色名写「全员」表示所有陪衬；每页最多 3 条，超出丢弃。
export const FX_REACT_PAGE_MAX = 3;
// 站位 [igs-fx:stage|动作|角色A|角色B]：独立于 FX_TAG_KINDS，由 stageCast.castStage 控制。
// 靠近 / 拉开写两个不同角色；背对 / 上前 / 离开 / 入场写一个角色；复位不写角色；缺栏整条丢弃。
// 姿态（背对、上前、靠近、拉开、离开）在楼层内按偏移累积到当前页，复位清空；入场只在标签所在页生效，每页最多 3 个角色。
export const FX_STAGE_ACTIONS = Object.freeze({
    靠近: 'near', near: 'near', 拉开: 'apart', apart: 'apart', 背对: 'turn', 转身: 'turn', turn: 'turn',
    上前: 'front', front: 'front', 离开: 'leave', leave: 'leave', 复位: 'reset', reset: 'reset',
    跑进来: 'run', run: 'run', 探头: 'peek', peek: 'peek', 慢慢走进来: 'slow', slow: 'slow',
});
export const FX_STAGE_ENTRANCES = Object.freeze(['run', 'peek', 'slow']);
export const FX_STAGE_PAGE_MAX = 3;
// 亲密氛围区间 [igs-fx:romance|暧昧] / [igs-fx:romance|亲密] … [igs-fx:romance-end]：独立于 FX_TAG_KINDS，
// 由亲密演出开关控制；区间内可直接升降档，档位词写错的开始标签整条丢弃（照常从正文剥离）。
// 可选第 3 栏写对象角色名 [igs-fx:romance|暧昧|爱丽丝]，供修罗场判定；瞬时 [igs-fx:confess] 告白、[igs-fx:memory|名称] 恋爱回忆同属亲密演出。
export const FX_ROMANCE_LEVELS = Object.freeze({ 暧昧: 'ambiguous', ambiguous: 'ambiguous', 亲密: 'intimate', intimate: 'intimate' });
// 感官调度 [igs-fx:sense|蒙眼] … [igs-fx:sense-end]：同属亲密演出，作用到楼层内下一条 sense 标签为止；感官词写错整条丢弃（照常从正文剥离）。
export const FX_SENSES = Object.freeze({
    蒙眼: 'blind', 闭眼: 'blind', 黑暗: 'blind', blind: 'blind',
    耳边: 'ear', 耳语: 'ear', 耳畔: 'ear', ear: 'ear',
    触碰: 'touch', 触感: 'touch', 抚摸: 'touch', touch: 'touch',
    热: 'heat', 灼热: 'heat', 体温: 'heat', heat: 'heat',
    凉: 'cool', 冰凉: 'cool', 寒意: 'cool', cool: 'cool',
    香: 'scent', 香气: 'scent', 气味: 'scent', scent: 'scent',
    屏息: 'hush', 静止: 'hush', hush: 'hush',
    失神: 'daze', 空白: 'daze', daze: 'daze',
});
// 独处 [igs-fx:solo|想着的角色名] … [igs-fx:solo-end]：角色独自一人的情事段，角色名可省；同属亲密演出。
// 外面的动静 [igs-fx:noise|脚步]：独处时让角色以为要被发现的瞬时声音，类型写错整条丢弃。
export const FX_NOISES = Object.freeze({
    脚步: 'steps', 脚步声: 'steps', steps: 'steps',
    敲门: 'knock', 敲门声: 'knock', knock: 'knock',
    手机: 'phone', 振动: 'phone', 震动: 'phone', 来电: 'phone', phone: 'phone',
    开门: 'door', 门把: 'door', 门: 'door', door: 'door',
});
// 通话：call 为对方来电、dial 为主角拨出，video 是视频来电的简写；第 3 段写「视频」即视频通话。
// 结束标签 [igs-fx:call-end|未接] 可带原因，原因写错或省略时按正常挂断处理。
export const FX_CALL_DIRS = Object.freeze({ call: 'in', dial: 'out', video: 'in' });
export const FX_CALL_END_REASONS = Object.freeze({
    未接: 'missed', 无人接听: 'missed', 未接通: 'missed', missed: 'missed',
    拒接: 'reject', 拒绝: 'reject', reject: 'reject',
    对方挂断: 'cut', 被挂断: 'cut', 断线: 'cut', cut: 'cut',
});
const FX_VIDEO_MARKS = Object.freeze(['视频', 'video']);
// 弹幕标签：独立于 FX_TAG_KINDS，开关归 liveFx / audienceFx。
// 直播区间 [igs-fx:live|主播|标题|视角] … [igs-fx:live-end]，视角写 主播 为主播后台，其余为观看；
// 直播弹幕 [igs-fx:dm|观众|内容|类型|附加]，类型写错按普通弹幕；观众弹幕 [igs-fx:danmaku|甲/乙|样式]。
export const DANMAKU_TAG_KINDS = Object.freeze(['live', 'dm', 'danmaku']);
export const DM_TYPES = Object.freeze({
    sc: 'sc', superchat: 'sc', 醒目留言: 'sc', 留言: 'sc',
    gift: 'gift', 礼物: 'gift', 投喂: 'gift',
    guard: 'guard', 上舰: 'guard', 舰长: 'guard', 开通舰长: 'guard', 舰队: 'guard',
    enter: 'enter', 进场: 'enter', 进入: 'enter', 进入直播间: 'enter',
    admin: 'admin', 房管: 'admin', 管理: 'admin',
});
const LIVE_HOST_VIEWS = Object.freeze(['host', '主播', '主播视角', '后台']);
export const DANMAKU_STYLES = Object.freeze(['scroll', 'top', 'flood', 'color']);
export const FX_DM_PAGE_MAX = 12;
export const FX_DANMAKU_PAGE_MAX = 4;
const DANMAKU_LINE_MAX = 5;
const DANMAKU_LINE_LEN = 30;

// 镜头 [igs-fx:cam|镜头|角色或方向]：独立于 FX_TAG_KINDS，由镜头语言的「AI 镜头指令」开关控制；只作用于标签所在页，每页取第一条。
// 特写可写角色名（缺省为当前说话人）；摇镜第 3 栏写 左 / 右，缺省向右；镜头词写错整条丢弃（照常从正文剥离）。
export const FX_CAMERA_SHOTS = Object.freeze({
    特写: 'closeup', 近景: 'closeup', closeup: 'closeup', 拉远: 'wide', 远景: 'wide', 全景: 'wide', wide: 'wide',
    虚化: 'focus', 景深: 'focus', 焦点: 'focus', focus: 'focus', 摇镜: 'pan', 横摇: 'pan', pan: 'pan',
    倾斜: 'tilt', 斜角: 'tilt', 荷兰角: 'tilt', tilt: 'tilt', 复位: 'reset', reset: 'reset',
});
const FX_CAMERA_PAN_DIRS = Object.freeze({ 左: 'left', 向左: 'left', left: 'left', 右: 'right', 向右: 'right', right: 'right' });

// 配乐情绪 [igs-fx:bgm|悲]：独立于 FX_TAG_KINDS，由背景音乐的情绪标签开关控制；情绪词写错整条丢弃（照常从正文剥离）。
// 作用到楼层内下一条 bgm 标签为止，跨楼由选曲层按场景沿用。
const FX_TAG_RE = /\[igs-fx:([^\]\n]*)(?:\]|$)/gm;
const FIELD_MAX = 60;

function field(value) {
    return String(value == null ? '' : value).trim().slice(0, FIELD_MAX);
}

function lookup(map, key, fallback) {
    const k = String(key || '').toLowerCase();
    return Object.hasOwn(map, k) ? map[k] : fallback;
}

// 观众弹幕一个标签可用 / 分隔多条；过长的单条截断，条数封顶。
export function danmakuLinesOf(value) {
    return String(value || '').split(/[/／]/)
        .map((line) => Array.from(line.trim()).slice(0, DANMAKU_LINE_LEN).join(''))
        .filter(Boolean)
        .slice(0, DANMAKU_LINE_MAX);
}

function parseDanmakuBody(kind, isEnd, parts) {
    if (kind === 'live') {
        if (isEnd) return { kind, end: true, args: [] };
        if (!parts[1]) return null;
        return { kind, end: false, args: [parts[1], parts[2] || '', LIVE_HOST_VIEWS.includes(String(parts[3] || '').toLowerCase()) ? 'host' : 'watch'] };
    }
    if (isEnd) return null;
    if (kind === 'dm') {
        const type = lookup(DM_TYPES, parts[3], 'text');
        if (!parts[2] && !(parts[1] && (type === 'enter' || type === 'guard'))) return null;
        return { kind, end: false, args: [parts[1] || '', parts[2] || '', type, parts[4] || ''] };
    }
    const lines = danmakuLinesOf(parts[1]);
    if (!lines.length) return null;
    const style = String(parts[2] || '').toLowerCase();
    return { kind, end: false, args: [lines.join('/'), DANMAKU_STYLES.includes(style) ? style : 'scroll'] };
}

// 返回 { kind, end, args } 或 null；end 表示区间结束标签（call-end 等）。
export function parseFxBody(body) {
    // 社区标签内容栏比通用 60 字长，先于通用切分处理。
    const feed = parseFeedBody(body);
    if (feed !== undefined) return feed;
    const parts = String(body || '').split('|').map(field);
    const head = parts[0].toLowerCase();
    const isEnd = head.endsWith('-end');
    const kind = isEnd ? head.slice(0, -4) : head;
    if (kind === 'item' && !isEnd) {
        const actionKey = String(parts[1] || '').toLowerCase();
        const action = Object.hasOwn(FX_ITEM_ACTIONS, actionKey) ? FX_ITEM_ACTIONS[actionKey] : '';
        const name = parts[2] || '';
        if (!action || !name) return null;
        const rare = FX_ITEM_RARE_MARKS.includes(String(parts[4] || '').toLowerCase());
        return { kind, end: false, args: rare ? [action, name, parts[3] || '', 'rare'] : [action, name, parts[3] || ''] };
    }
    if (kind === 'battle') {
        if (isEnd) return { kind, end: true, args: [lookup(FX_BATTLE_RESULTS, parts[1], '')] };
        return { kind, end: false, args: [parts[1] || '', parts[2] || ''] };
    }
    if (kind === 'romance') {
        if (isEnd) return { kind, end: true, args: [] };
        const level = lookup(FX_ROMANCE_LEVELS, parts[1], '');
        return level ? { kind, end: false, args: parts[2] ? [level, parts[2]] : [level] } : null;
    }
    if (kind === 'sense') {
        if (isEnd) return { kind, end: true, args: [] };
        const sense = lookup(FX_SENSES, parts[1], '');
        return sense ? { kind, end: false, args: [sense] } : null;
    }
    if (kind === 'solo') return isEnd ? { kind, end: true, args: [] } : { kind, end: false, args: [parts[1] || ''] };
    if (kind === 'noise') {
        const noise = isEnd ? '' : lookup(FX_NOISES, parts[1], '');
        return noise ? { kind, end: false, args: [noise] } : null;
    }
    if (kind === 'react') return !isEnd && parts[1] ? { kind, end: false, args: [parts[1], parts[2] || ''] } : null;
    if (kind === 'stage') {
        if (isEnd) return null;
        const action = lookup(FX_STAGE_ACTIONS, parts[1], '');
        if (!action) return null;
        if (action === 'reset') return { kind, end: false, args: ['reset', '', ''] };
        if (!parts[2]) return null;
        const pair = action === 'near' || action === 'apart';
        if (pair && (!parts[3] || parts[3] === parts[2])) return null;
        return { kind, end: false, args: [action, parts[2], pair ? parts[3] : ''] };
    }
    if (kind === 'bgm') {
        const mood = isEnd ? '' : normalizeBgmCue(parts[1]);
        return mood ? { kind, end: false, args: [mood] } : null;
    }
    if (kind === 'cam') {
        const shot = isEnd ? '' : lookup(FX_CAMERA_SHOTS, parts[1], '');
        if (!shot) return null;
        if (shot === 'pan') return { kind, end: false, args: [shot, lookup(FX_CAMERA_PAN_DIRS, parts[2], 'right')] };
        return { kind, end: false, args: [shot, shot === 'closeup' ? parts[2] || '' : ''] };
    }
    if (kind === 'confess') return isEnd ? null : { kind, end: false, args: [] };
    if (kind === 'memory') return !isEnd && parts[1] ? { kind, end: false, args: [parts[1]] } : null;
    if (kind === 'hit' && !isEnd) {
        if (!parts[1] && !parts[3]) return null;
        return { kind, end: false, args: [parts[1] || '', parts[2] || '', parts[3] || '', lookup(FX_HIT_RESULTS, parts[4], 'hit')] };
    }
    if (Object.hasOwn(FX_CALL_DIRS, kind)) {
        if (isEnd) return { kind: 'call', end: true, args: [lookup(FX_CALL_END_REASONS, parts[1], 'end')] };
        if (!parts[1]) return null;
        const video = kind === 'video' || FX_VIDEO_MARKS.includes(String(parts[2] || '').toLowerCase());
        return { kind: 'call', end: false, args: [parts[1], FX_CALL_DIRS[kind], video ? 'video' : 'voice'] };
    }
    if (DANMAKU_TAG_KINDS.includes(kind)) return parseDanmakuBody(kind, isEnd, parts);
    if (DAILY_FX_KINDS.includes(kind)) {
        const args = isEnd ? null : parseDailyFxBody(kind, parts.slice(1));
        return args ? { kind: 'daily', end: false, args } : null;
    }
    // DLC 演出：只认已登记的 kind；区间型才有 -end。参数原样带给作者的 play，最多 DLC_FX_ARG_MAX 栏。
    if (isDlcFxKind(kind)) {
        const def = getDlcFx(kind);
        if (!def) return null;
        if (isEnd) return def.mode === 'range' ? { kind, end: true, args: [], dlc: true } : null;
        return { kind, end: false, args: parts.slice(1, 1 + DLC_FX_ARG_MAX), dlc: true };
    }
    if (!FX_TAG_KINDS.includes(kind)) return null;
    if (isEnd) return FX_RANGE_KINDS.includes(kind) ? { kind, end: true, args: [] } : null;
    const args = parts.slice(1);
    if (kind === 'notify' && !args[1] && !args[0]) return null;
    // 称呼变化两栏都要有；语音留言发送者可省（与 notify 同形）。
    if (kind === 'nickname' && !(args[0] && args[1])) return null;
    if (kind === 'voicemail' && !args[1] && !args[0]) return null;
    if (kind === 'contact' && !args[0]) return null;
    if (kind === 'promise' && !args[0]) return null;
    if (kind === 'light') {
        const mode = lookup(FX_LIGHT_MODES, args[0], '');
        if (mode === 'off') return { kind, end: false, args: ['off'] };
        if (mode === 'on') return { kind, end: true, args: [] };
        return null;
    }
    if (kind === 'sfx' && !args[0]) return null;
    // 外卖 / 快递：物品栏必填；配送方可省；阶段词只认 order / arrive，写别的按 arrive（默认送到）。
    if (kind === 'delivery') {
        if (!args[0]) return null;
        const stage = String(args[2] || '').toLowerCase();
        return { kind, end: false, args: [args[0], args[1] || '', FX_DELIVERY_STAGES.includes(stage) ? stage : 'arrive'] };
    }
    if (kind === 'eye') {
        const mode = String(args[0] || '').toLowerCase();
        if (!FX_EYE_MODES.includes(mode)) return null;
        return { kind, end: false, args: [mode] };
    }
    return { kind, end: false, args };
}

export function hasFxTags(text) {
    return String(text || '').includes('[igs-fx:');
}

export function extractFxDirectives(source) {
    const text = String(source || '');
    if (!hasFxTags(text)) return [];
    const out = [];
    for (const m of text.matchAll(FX_TAG_RE)) {
        const parsed = parseFxBody(m[1]);
        if (parsed) out.push({ ...parsed, offset: m.index });
    }
    return out;
}

function callOf(d) {
    return { name: d.args[0], dir: d.args[1] || 'in', mode: d.args[2] || 'voice' };
}

// 挂断沿用被结束那通电话的对象、方向与类型，演出据此区分「未接来电 / 无人接听」、是否收起视频窗，并写进通话记录。
function instantOf(d, openCall) {
    if (d.kind === 'call') {
        if (!d.end) return { kind: 'call', ...callOf(d) };
        return { kind: 'call-end', reason: d.args[0] || 'end', name: openCall ? openCall.name : '', dir: openCall ? openCall.dir : 'in', mode: openCall ? openCall.mode : 'voice' };
    }
    if (d.kind === 'notify') return { kind: 'notify', sender: d.args[1] ? d.args[0] : '', text: d.args[1] || d.args[0] };
    if (d.kind === 'delivery') return { kind: 'delivery', item: d.args[0], sender: d.args[1] || '', stage: d.args[2] || 'arrive' };
    if (d.kind === 'sfx') return { kind: 'sfx', text: d.args[0] };
    if (d.kind === 'eye') return { kind: 'eye', mode: d.args[0] };
    if (d.kind === 'nickname') return { kind: 'nickname', name: d.args[0], nick: d.args[1] };
    if (d.kind === 'voicemail') return { kind: 'voicemail', sender: d.args[1] ? d.args[0] : '', text: d.args[1] || d.args[0] };
    if (d.kind === 'contact') return { kind: 'contact', name: d.args[0] };
    if (d.kind === 'cutin') return { kind: 'cutin', name: d.args[0] || '' };
    if (d.kind === 'promise') return { kind: 'promise', time: d.args[0], place: d.args[1] || '' };
    if (d.kind === 'light' && !d.end) return { kind: 'light', mode: 'off' };
    return null;
}

// initial.battle：跨楼层继承的未结束战斗，作为本楼第一条战斗标签之前的区间状态。
// 瞬时标签落在 (prevOffset, offset] 内时归当前页；首页 prevOffset 传 -1。
// 区间状态取 offset 之前最近一次开/关；同类瞬时演出每页只取第一个。
// 站位标签累积：poses[角色] = { flip, front }，links 为靠近 / 拉开的角色对（同一对只留最后一次），
// goneAt[角色] = 离开标签的偏移（其后再开口即回台，由名单层判断），entrances 只收当前页的入场。
function applyStageDirective(result, d, current) {
    const [action, a, b] = d.args;
    if (action === 'reset') {
        result.poses = {};
        result.links = [];
        result.goneAt = {};
        return;
    }
    if (FX_STAGE_ENTRANCES.includes(action)) {
        if (current && !result.entrances[a] && Object.keys(result.entrances).length < FX_STAGE_PAGE_MAX) result.entrances[a] = action;
        return;
    }
    if (action === 'leave') {
        result.goneAt[a] = d.offset;
        return;
    }
    if (action === 'turn' || action === 'front') {
        const prev = result.poses[a] || { flip: false, front: false };
        result.poses[a] = action === 'turn' ? { ...prev, flip: !prev.flip } : { ...prev, front: true };
        return;
    }
    const key = [a, b].sort().join('\u0000');
    result.links = result.links.filter((l) => [l.a, l.b].sort().join('\u0000') !== key);
    result.links.push({ a, b, kind: action });
}

export function resolveFxAtPage(directives, offset, prevOffset = -1, initial = null) {
    const carried = initial && initial.battle && typeof initial.battle === 'object' ? { foe: String(initial.battle.foe || ''), title: String(initial.battle.title || '') } : null;
    const result = { instants: [], call: null, flashback: false, dream: false, letterbox: false, whisper: false, movie: false, lightsOff: false, umbrella: false, items: [], itemOverflow: 0, daily: [], battle: carried, battleStart: false, battleEnd: '', hits: [], reacts: [], poses: {}, links: [], goneAt: {}, entrances: {}, romance: '', romanceTarget: '', romanceAt: -1, confess: false, memory: '', live: null, dms: [], danmaku: [], bgmMood: '', cam: null, storm: null };
    // 感官调度：区间状态，作用到下一条 sense / sense-end。
    result.sense = '';
    // 独处：区间状态 { target }；外面的动静：只归标签所在页。
    result.solo = null;
    result.noise = '';
    // DLC 演出：dlc 收本页的瞬时标签 [{ kind, args }]；dlcRanges 收到此为止仍开着的区间 { kind: args }。
    result.dlc = [];
    result.dlcRanges = {};
    const at = Number(offset);
    if (!Array.isArray(directives) || !directives.length || !Number.isFinite(at) || at < 0) return result;
    const from = Number.isFinite(Number(prevOffset)) ? Number(prevOffset) : -1;
    const seen = new Set();
    for (const d of directives) {
        if (d.offset > at) break;
        const openCall = result.call;
        if (d.kind === 'call') result.call = d.end ? null : { ...callOf(d), at: d.offset };
        else if (d.kind === 'flashback') result.flashback = !d.end;
        else if (d.kind === 'dream') result.dream = !d.end;
        else if (d.kind === 'letterbox') result.letterbox = !d.end;
        else if (d.kind === 'whisper') result.whisper = !d.end;
        else if (d.kind === 'movie') result.movie = !d.end;
        else if (d.kind === 'light') result.lightsOff = !d.end;
        else if (d.kind === 'umbrella') result.umbrella = !d.end;
        else if (d.kind === 'battle') result.battle = d.end ? null : { foe: d.args[0], title: d.args[1] };
        else if (d.kind === 'live') result.live = d.end ? null : { name: d.args[0], title: d.args[1], view: d.args[2] };
        else if (d.kind === 'bgm') result.bgmMood = d.args[0];
        else if (d.kind === 'romance') {
            result.romance = d.end ? '' : d.args[0];
            // 区间内升降档不换对象：未写对象的升档标签沿用本区间已有对象。
            if (d.end) { result.romanceTarget = ''; result.romanceAt = -1; }
            else {
                if (result.romanceAt < 0) result.romanceAt = d.offset;
                if (d.args[1]) result.romanceTarget = d.args[1];
            }
        }
        else if (d.kind === 'sense') result.sense = d.end ? '' : d.args[0];
        else if (d.kind === 'solo') result.solo = d.end ? null : { target: d.args[0] || (result.solo && result.solo.target) || '' };
        if (d.kind === 'stage') {
            applyStageDirective(result, d, d.offset > from);
            continue;
        }
        if (d.dlc) {
            const def = getDlcFx(d.kind);
            if (def && def.mode === 'range') {
                if (d.end) delete result.dlcRanges[d.kind];
                else result.dlcRanges[d.kind] = d.args;
            } else if (def && d.offset > from && result.dlc.length < DLC_FX_PAGE_MAX && !result.dlc.some((item) => item.kind === d.kind)) {
                result.dlc.push({ kind: d.kind, args: d.args });
            }
            continue;
        }
        if (d.offset <= from || d.kind === 'romance' || d.kind === 'sense' || d.kind === 'solo') continue;
        if (d.kind === 'noise') { if (!result.noise) result.noise = d.args[0]; continue; }
        if (d.kind === 'confess') { result.confess = true; continue; }
        if (d.kind === 'memory') { if (!result.memory) result.memory = d.args[0]; continue; }
        // 同页先开战后结算时两者都保留，演出按「遭遇 → 出招 → 结算」顺序播放。
        if (d.kind === 'battle') {
            if (d.end) result.battleEnd = d.args[0] || 'end';
            else { result.battleStart = true; result.battleEnd = ''; }
            continue;
        }
        if (d.kind === 'hit') {
            if (result.hits.length < FX_HIT_PAGE_MAX) {
                result.hits.push({ attacker: d.args[0], target: d.args[1], skill: d.args[2], result: d.args[3], dice: d.dice === true });
            }
            continue;
        }
        if (d.kind === 'cam') {
            if (!result.cam) result.cam = { shot: d.args[0], target: d.args[1] };
            continue;
        }
        if (d.kind === 'live') continue;
        if (d.kind === 'dm') {
            if (result.dms.length < FX_DM_PAGE_MAX) result.dms.push({ user: d.args[0], text: d.args[1], type: d.args[2], extra: d.args[3] });
            continue;
        }
        if (d.kind === 'danmaku') {
            if (result.danmaku.length < FX_DANMAKU_PAGE_MAX) result.danmaku.push({ lines: d.args[0].split('/'), style: d.args[1] });
            continue;
        }
        if (d.kind === 'react') {
            if (result.reacts.length < FX_REACT_PAGE_MAX) result.reacts.push({ target: d.args[0], emotion: d.args[1] || '' });
            continue;
        }
        if (d.kind === 'daily') {
            const daily = dailyFxOf(d.args);
            if (daily && result.daily.length < DAILY_FX_PAGE_MAX && !result.daily.some((item) => item.type === daily.type)) result.daily.push(daily);
            continue;
        }
        if (d.kind === 'item') {
            if (result.items.length < FX_ITEM_PAGE_MAX) {
                const item = { action: d.args[0], name: d.args[1], description: d.args[2] };
                if (d.args[3] === 'rare') item.rarity = 'rare';
                result.items.push(item);
            }
            else result.itemOverflow += 1;
            continue;
        }
        const instant = instantOf(d, openCall);
        if (!instant || seen.has(instant.kind)) continue;
        seen.add(instant.kind);
        result.instants.push(instant);
    }
    // 手机社区：区间内取最近几条帖子，本页新出现的标 fresh。
    const feed = foldFeedDirectives(directives, at);
    result.feed = feed ? { platform: feed.platform, owner: feed.owner, posts: feed.posts.slice(-FEED_VIEW_MAX).map((post) => ({ ...post, fresh: post.offset > from })) } : null;
    // 舆论风暴：区间内累积到当前页的 @ 评论，本页新出现的标 fresh。
    result.storm = foldStormDirectives(directives, at, from);
    return result;
}

export function filterFxByKinds(fx, enabledKinds) {
    const allow = new Set(enabledKinds || []);
    return {
        instants: fx.instants.filter((item) => allow.has(item.kind === 'call-end' ? 'call' : item.kind)),
        call: allow.has('call') ? fx.call : null,
        flashback: allow.has('flashback') && Boolean(fx.flashback),
        dream: allow.has('dream') && Boolean(fx.dream),
        letterbox: allow.has('letterbox') && Boolean(fx.letterbox),
        items: allow.has('item') ? (fx.items || []) : [],
        itemOverflow: allow.has('item') ? (fx.itemOverflow || 0) : 0,
    };
}
