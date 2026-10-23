// 「复制本页诊断」：只摘当前页的决策结果（标签、命中哪一路、为什么回退），
// 不带台词正文、聊天内容、演出参数文本和图片本体，外链只留域名，方便用户直接贴出来求助。
import { PROMPT_ENTRY_LABELS, PROMPT_POSITION_LABELS } from '../../scene/prompt-entries.js';
import { describePromptTrigger } from '../../scene/prompt-triggers.js';
import { describeLocalStorageUsage, describeMediaUsage } from '../../storage/storage-usage.js';
import { CREATURE_ANCHOR_LABELS, CREATURE_FORM_LABELS, CREATURE_FRAMING_LABELS, CREATURE_SIZE_LABELS, normalizeCreatureDisplaySettings, storedCreatureOf } from '../../scene/creature-profile.js';

const SOURCE_LABELS = Object.freeze({
    user: '用户配置', 'user-outfit': '衣柜', library: '生成图库', temp: '临时图', placeholder: '占位图',
    cg: 'CG', 'bound-slot': '生图标记槽位', slot: '槽位图', none: '未命中',
});

const label = (source) => SOURCE_LABELS[source] || String(source || '');
const SPRITE_REASONS = { 'original-unavailable': '原装候选暂时不可读取，同角色兜底也未命中', 'original-empty': '原装无有效图片引用，同角色兜底也未命中', 'character-unregistered': '当前素材库未找到该角色或对应图片' };

export function summarizeImageRef(value) {
    const url = typeof value === 'string' ? value : value && typeof value === 'object' ? String(value.url || value.src || '') : '';
    if (!url) return '无';
    if (/^data:image\//i.test(url)) return `内嵌图(${Math.round((url.length * 3) / 4 / 1024)}KB)`;
    if (/^blob:/i.test(url)) return '临时 blob';
    const local = /^\/?(user\/images\/[^?#]+)/.exec(url);
    if (local) return local[1];
    try { return `外链 ${new URL(url).host}`; } catch { return '其他地址'; }
}

// 只列出这一页生效的演出种类，不带参数（参数里可能是信件、弹幕等正文）。
export function summarizeFx(fx) {
    if (!fx || typeof fx !== 'object') return [];
    const out = [];
    for (const [key, value] of Object.entries(fx)) {
        if (Array.isArray(value)) {
            if (!value.length) continue;
            const kinds = [...new Set(value.map((v) => (v && typeof v === 'object' && v.kind) || '').filter(Boolean))];
            out.push(kinds.length ? `${key}(${kinds.join('/')})` : `${key}×${value.length}`);
        } else if (value === true || (typeof value === 'string' && value) || (value && typeof value === 'object')) {
            out.push(key);
        }
    }
    return out;
}

function spriteLine(c) {
    const m = c.spriteMatch;
    if (c.chatPage || c.htmlCardPage) return '本页是聊天 / 卡片页，不显示立绘';
    if (c.cgActive) return '挂着 CG，立绘让位';
    if (c.spriteLive2d) return `角色「${c.spriteLive2d.character}」情绪「${c.spriteLive2d.mood || '默认'}」 → Live2D（静态差分已暂停）`;
    if (!m) return c.speaker ? `说话人「${c.speaker}」未进入立绘匹配（场景素材关闭或旁白 / 系统角色）` : '无说话人';
    const why = m.outfitOffset == null ? '' : `（来源 ${m.outfitSource || '无'}${m.outfitReason ? `/${m.outfitReason}` : ''} @${m.outfitOffset}）`;
    const request = Object.hasOwn(m, 'requestedOutfit') ? `，要求「${m.requestedOutfit || '默认'}」` : '';
    const reasons = {
        'default-outfit-unset': '尚未指定默认衣装', 'default-outfit-invalid': '默认衣装记录无效',
        'default-outfit-missing': '默认衣装已不存在', 'outfit-unregistered': '要求衣装未登记',
        'outfit-image-empty': '整套衣装未设人物图', 'outfit-image-missing': '人物图片已丢失',
        'outfit-image-read-error': '人物图片读取失败', 'outfit-image-decode-error': '人物图片加载或解码失败',
        'outfit-image-pending': '人物图片加载中',
    };
    const detail = [...new Set([m.reason, m.fallbackReason].filter(Boolean))]
        .map(reason => reasons[reason] || reason).join('；');
    const diagnostic = detail ? `，${detail}` : '';
    const want = `角色「${m.character}」表情「${m.mood || '无'}」服装「${m.outfit || '无'}」${request}${why}`;
    if (c.spriteImage) return `${want} → ${label(m.source)}，槽位「${m.slot || '默认'}」${m.quality ? `，匹配度 ${m.quality}` : ''}${diagnostic}`;
    if (c.sceneNsfw) return `${want} → NSFW 场景隐藏立绘`;
    return `${want} → 未命中（${SPRITE_REASONS[m.reason] || label(m.source)}${m.quality ? `，匹配度 ${m.quality}` : ''}）`;
}

function backgroundLine(c) {
    const m = c.backgroundMatch;
    const place = c.sceneLocation ? `地点「${c.sceneLocation}」` : '无地点';
    if (!m) return `${place} → ${c.backgroundImage ? `沿用 ${summarizeImageRef(c.backgroundImage)}` : '未匹配（场景素材关闭或无场景标签）'}`;
    return `${place} → ${label(m.source)}${m.quality ? `，匹配度 ${m.quality}` : ''}${c.backgroundTimed ? '，按时段' : ''}，${summarizeImageRef(c.backgroundImage)}`;
}

// 直播手机为什么出 / 不出：开关、本页是否识别到直播、NSFW 收起、回忆梦境或卡片页收起。
function liveLine(c, rs) {
    const live = rs.liveFx && typeof rs.liveFx === 'object' ? rs.liveFx : {};
    if (live.enabled !== true) return '没生效：直播间开关关着，或世界观不是现代又没开「随身带着现代手机」';
    const fx = c.fx || {};
    if (!fx.live) return '本页没有识别到直播（没写 live 标签，前文也没有开播词）';
    if (c.sceneNsfw === true && live.muteOnNsfw !== false) return '识别到了，但场景是 NSFW，被「NSFW场景收起」藏起';
    if (c.chatPage || c.htmlCardPage || fx.flashback === true || fx.dream === true) return '识别到了，本页是聊天/卡片/回忆/梦境，暂时收起';
    if (rs.feedFx && rs.feedFx.enabled === true && (fx.storm || fx.feed)) return '识别到了，让位给社区/舆论风暴手机';
    return '显示中';
}

// 非人角色：总开关、非人演出、巨型铺满，以及本页说话人的档案（只列档案字段，不带正文）。
function creatureLine(c, rs) {
    const display = normalizeCreatureDisplaySettings(rs.creatureDisplay);
    const battle = rs.battleFx && typeof rs.battleFx === 'object' ? rs.battleFx : {};
    const assets = rs._sceneAssets && typeof rs._sceneAssets === 'object' ? rs._sceneAssets : {};
    const dnaMap = assets.characterDna && typeof assets.characterDna === 'object' ? assets.characterDna : {};
    const who = String((c.spriteMatch && c.spriteMatch.character) || c.spriteCharacter || c.speaker || '');
    const profile = who && Object.hasOwn(dnaMap, who) ? storedCreatureOf(dnaMap[who]) : null;
    const head = `${display.enabled ? '开' : '关（所有角色按人类处理）'} · 非人演出${battle.creature === false ? '关' : '开'}${battle.enabled === true ? '' : '（战斗演出未开）'} · 巨型铺满${display.giantFill ? '开' : '关'}`;
    if (!profile) return `${head} · 本页说话人无非人档案`;
    const parts = [CREATURE_FORM_LABELS[profile.form] || '待判定', CREATURE_SIZE_LABELS[profile.size], CREATURE_ANCHOR_LABELS[profile.anchor],
        `取景${CREATURE_FRAMING_LABELS[profile.framing || 'full']}`, profile.form === 'humanoid' ? `情绪档${profile.tiers === 'four' ? '四档' : '完整'}` : '', profile.temp ? '临时档案' : ''].filter(Boolean);
    return `${head} · 说话人「${who}」${parts.join('/')}`;
}

// 最近一次注入的按需块：每块展开/收起、原因（命中词、上楼标签…）、字数，以及写了自己位置的块的注入位置与深度。
function promptLines(report) {
    const blocks = report && report.blocks ? Object.entries(report.blocks) : [];
    if (!blocks.length) return [];
    const total = blocks.reduce((sum, [, item]) => sum + (item.active ? item.chars || 0 : 0), 0);
    return [`提示词按需块（共展开 ${total} 字）`, ...blocks.map(([key, item]) => `  ${PROMPT_ENTRY_LABELS[key] || key} ${item.reason === 'off' ? '' : item.active ? '展开' : '收起'} ${describePromptTrigger(item)}${item.active && item.chars ? ` · ${item.chars} 字` : ''}${item.position ? ` · ${PROMPT_POSITION_LABELS[item.position] || item.position}${item.position === 'depth' ? ` @D${item.depth}` : ''}` : ''}`.replace(/ {2,}/g, ' ').replace(/^ /, '  '))];
}

// 朗读这一页：没开 / 本页会念 / 本页没念的原因（原因只认这一页的）。
function ttsLine(c, rs, snapshot, skip) {
    if (!rs.tts || rs.tts.enabled !== true) return '未开启';
    const page = `${c.messageId ?? snapshot.messageId}:${c.currentIndex}`;
    return skip && skip.key === page && skip.reason ? `本页未朗读：${skip.reason}` : '本页会朗读（或还没轮到）';
}

export function buildPageDiagnostic(snapshot, { version = '', worldview = '', promptReport = null, mediaStats = null, ttsSkip = null } = {}) {
    if (!snapshot || !snapshot.content) return '';
    const c = snapshot.content;
    const rs = snapshot.readerSettings || {};
    const segments = Array.isArray(c.segments) ? c.segments.length : 0;
    const kind = c.chatPage ? '聊天页' : c.htmlCardPage ? '卡片页' : `正文(${c.textType || '?'})`;
    const cast = Array.isArray(c.castSprites) ? c.castSprites.map((m) => m && m.character).filter(Boolean) : [];
    const notes = [...(c.warnings || []), ...(c.errors || [])].map((w) => (w && w.code) || '').filter(Boolean);
    const lines = [
        `[IGS 本页诊断] v${version}`,
        `楼层 ${c.messageId ?? snapshot.messageId ?? '?'} · 第 ${(Number(c.currentIndex) || 0) + 1}/${segments} 页 · ${kind} · 来源 ${c.sourceKind || '?'}`,
        `世界观 ${worldview || '未设'} · 对话框皮肤 ${rs.dialogSkin || '默认'}`,
        `场景 ${c.sceneLocation || '-'} | ${c.sceneTime || '-'} | ${c.sceneWeather || '-'}${c.sceneNsfw ? ' | nsfw' : ''}${c.sceneDread ? ' | 恐怖' : ''}`,
        `说话人 ${c.speaker || '-'} · 情绪 ${c.statusEmotion || '-'}`,
        `立绘 ${spriteLine(c)}`,
        `同台 ${cast.length ? cast.join('、') : '无'}`,
        `User立绘：${c.userChar && c.userChar.key ? `${c.userChar.key}（${c.userChar.source === 'manual' ? '手动指定' : '按用户名'}）` : '无'}`,
        `背景 ${backgroundLine(c)}`,
        `CG ${c.cgActive ? `显示中（槽位 ${c.illustrationSlot ?? '?'}）` : c.cgWaiting ? `有标记（槽位 ${c.illustrationSlot}）但图片未就绪，保留场景与立绘` : c.illustrationSlot != null ? `有标记（槽位 ${c.illustrationSlot}）但没有图` : '无'} · 图片 期望${c.imageExpectedCount ?? 0}/绑定${c.imageBoundCount ?? 0}/未绑${c.imageUnboundCount ?? 0}/可用${c.imageAvailableCount ?? 0}${c.imageLoading ? ' · 出图中' : ''}`,
        `演出 ${summarizeFx(c.fx).join('、') || '无'}`,
    ];
    if (notes.length) lines.push(`提示 ${notes.join('、')}`);
    lines.push(`直播 ${liveLine(c, rs)}`);
    lines.push(`朗读 ${ttsLine(c, rs, snapshot, ttsSkip)}`);
    lines.push(`非人角色 ${creatureLine(c, rs)}`);
    lines.push(...promptLines(promptReport));
    if (mediaStats) lines.push(`图片资源 ${describeMediaUsage(mediaStats)}`);
    let local = '';
    try { local = describeLocalStorageUsage(globalThis.localStorage, { topKeys: 5 }); } catch { /* 无 localStorage */ }
    if (local) lines.push(local);
    return lines.join('\n');
}
