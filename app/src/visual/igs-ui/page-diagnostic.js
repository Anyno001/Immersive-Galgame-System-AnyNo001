// 「复制本页诊断」：只摘当前页的决策结果（标签、命中哪一路、为什么回退），
// 不带台词正文、聊天内容、演出参数文本和图片本体，外链只留域名，方便用户直接贴出来求助。

const SOURCE_LABELS = Object.freeze({
    user: '用户配置', 'user-outfit': '衣柜', library: '生成图库', temp: '临时图', placeholder: '占位图',
    cg: 'CG', 'bound-slot': '生图标记槽位', slot: '槽位图', none: '未命中',
});

const label = (source) => SOURCE_LABELS[source] || String(source || '');

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
    if (!m) return c.speaker ? `说话人「${c.speaker}」未进入立绘匹配（场景素材关闭或旁白 / 系统角色）` : '无说话人';
    const why = m.outfitOffset == null ? '' : `（来源 ${m.outfitSource || '无'}${m.outfitReason ? `/${m.outfitReason}` : ''} @${m.outfitOffset}）`;
    const want = `角色「${m.character}」表情「${m.mood || '无'}」服装「${m.outfit || '无'}」${why}`;
    if (c.spriteImage) return `${want} → ${label(m.source)}，槽位「${m.slot || '默认'}」${m.quality ? `，匹配度 ${m.quality}` : ''}`;
    if (c.sceneNsfw) return `${want} → NSFW 场景隐藏立绘`;
    return `${want} → 未命中（${label(m.source)}${m.quality ? `，匹配度 ${m.quality}` : ''}）`;
}

function backgroundLine(c) {
    const m = c.backgroundMatch;
    const place = c.sceneLocation ? `地点「${c.sceneLocation}」` : '无地点';
    if (!m) return `${place} → ${c.backgroundImage ? `沿用 ${summarizeImageRef(c.backgroundImage)}` : '未匹配（场景素材关闭或无场景标签）'}`;
    return `${place} → ${label(m.source)}${m.quality ? `，匹配度 ${m.quality}` : ''}${c.backgroundTimed ? '，按时段' : ''}，${summarizeImageRef(c.backgroundImage)}`;
}

export function buildPageDiagnostic(snapshot, { version = '', worldview = '' } = {}) {
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
        `背景 ${backgroundLine(c)}`,
        `CG ${c.cgActive ? `显示中（槽位 ${c.illustrationSlot ?? '?'}）` : c.illustrationSlot != null ? `有标记（槽位 ${c.illustrationSlot}）但没有图` : '无'} · 图片 期望${c.imageExpectedCount ?? 0}/绑定${c.imageBoundCount ?? 0}/未绑${c.imageUnboundCount ?? 0}/可用${c.imageAvailableCount ?? 0}${c.imageLoading ? ' · 出图中' : ''}`,
        `演出 ${summarizeFx(c.fx).join('、') || '无'}`,
    ];
    if (notes.length) lines.push(`提示 ${notes.join('、')}`);
    return lines.join('\n');
}
