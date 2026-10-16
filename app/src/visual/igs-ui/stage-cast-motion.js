import { spriteDrawRect } from './fx-anchor.js';

export const CAST_ENTER_MS = 340;
export const CAST_MOVE_MS = 420;
export const CAST_HANDOFF_MS = 260;
export const CAST_SLIDE_PCT = 4;
export const CAST_DIM_FRAME = 'brightness(0.72) saturate(0.8)';
export const CAST_LIT_FRAME = 'brightness(1) saturate(1)';
// 修罗场里被提亮的恋爱对象：比普通陪衬亮，但仍略暗于说话人。
export const CAST_FOCUS_FRAME = 'brightness(0.95) saturate(0.95)';
// 本页正文点到名字的陪衬：比普通陪衬亮一档，低于修罗场对象。
export const CAST_CALLED_FRAME = 'brightness(0.86) saturate(0.9)';
const EASING = 'cubic-bezier(.2,.7,.3,1)';

export function castSideOf(posX) {
    const x = Number(posX);
    if (x < 40) return -1;
    if (x > 60) return 1;
    return 0;
}

// promoted：上一页在陪衬层、本页升为说话人；demoted：上一页的说话人、本页退到陪衬层。
export function resolveCastHandoff(prev, next) {
    const none = { promoted: '', demoted: '' };
    if (!prev || !next || !prev.speaker || !next.speaker || prev.speaker === next.speaker) return none;
    const prevMembers = Array.isArray(prev.members) ? prev.members : [];
    const nextMembers = Array.isArray(next.members) ? next.members : [];
    return {
        promoted: prevMembers.includes(next.speaker) ? next.speaker : '',
        demoted: nextMembers.includes(prev.speaker) ? prev.speaker : '',
    };
}

function feetFraction(sprite) {
    const feet = Number(sprite && sprite.feet);
    return feet > 0 && feet <= 1 ? feet : 1;
}

// 把图的最低不透明像素（腿）放到舞台底边。脚上面的透明边会沉到舞台下面。图高已经顶满舞台时挪不动，保持原 posY。
export function posYForFeet(stageH, sprite) {
    const h = stageH * (Number(sprite && sprite.scale) || 100) / 100;
    const room = stageH - h;
    if (!(h > 0) || Math.abs(room) < 1) return Number(sprite && sprite.posY);
    // 不设上下限：图高接近舞台高（默认 100% 附近）时要的百分比很大，截断了脚就贴不到底。
    return ((stageH - h * feetFraction(sprite)) / room) * 100;
}

// 图高正好等于舞台高时 background-position 挪不动它。脚下还有透明边就缩 1%，腾出一点空隙才能把脚贴到底。只发生在高度恰好顶满舞台时，不是改这个人的立绘高度。
const FEET_ROOM_SCALE = 0.99;

export function plantFeet(stageH, sprite) {
    const scale = Number(sprite && sprite.scale) || 100;
    const h = stageH * scale / 100;
    const stuck = h > 0 && Math.abs(stageH - h) < 1 && feetFraction(sprite) < 1;
    const next = stuck ? { ...sprite, scale: scale * FEET_ROOM_SCALE } : sprite;
    return { scale: next.scale, posY: posYForFeet(stageH, next) };
}

// background-position 的百分比是「图上该比例点对齐舞台该比例点」：图越宽槽位越往中间挤，和舞台一样宽（竖屏手机）时全员叠在正中，比舞台宽时左右对调。
// 换算成让图的中心落在舞台 centerX% 处的 posX；读不到图宽或图宽恰好等于舞台宽时返回 null，调用方沿用原 posX。
export function posXForCenter(stageW, stageH, sprite, centerX) {
    const rect = spriteDrawRect(stageW, stageH, { ...sprite, posX: 0 });
    const c = Number(centerX);
    if (!rect || !Number.isFinite(c)) return null;
    const room = stageW - rect.w;
    if (Math.abs(room) < 1) return null;
    return Math.round((stageW * c / 100 - rect.w / 2) / room * 10000) / 100;
}

// speaker / members 条目：{ url, order, posX, posY, scale, centerX?, auto?, locked?, ... }，其余字段原样带出。
// scale 是这个人自己的立绘高度（已经乘过全局缩放）。这里不改它：不看槽位、不看头宽、不看谁在台上。
// heightScale 记下进来时的高度，供编辑保存时除掉「上前」这类只画在这一页的姿态。
// align 为真时只把脚贴到舞台底（改 posY）。locked 的人保持手摆的位置；auto 是删掉槽位后的位置，高度仍是原来的。
// centerX 是自动槽位的中心（舞台宽度百分比）：图探测好后按实际宽度换算 posX，锁定条目只换算 auto。
// pending 为还没有探测数据、需要先 probeSpriteHead 的地址。没探测到脚之前不贴底。
export function planCastLayouts({ stageW = 0, stageH = 0, align = false, speaker = null, members = [], peek = () => null } = {}) {
    const roster = [...(speaker ? [speaker] : []), ...(members || [])];
    const pending = [];
    const sized = roster.length > 1 && stageW > 0 && stageH > 0;
    const remember = (url) => {
        if (url && !pending.includes(url)) pending.push(url);
    };
    const centered = (sprite, centerX, probed) => {
        if (!sized || !probed) return sprite;
        const posX = posXForCenter(stageW, stageH, { ...sprite, naturalW: probed.naturalW, naturalH: probed.naturalH }, centerX);
        return posX == null ? sprite : { ...sprite, posX };
    };
    const plant = (sprite, probed) => {
        const feet = probed && Number(probed.feet) > 0 ? Number(probed.feet) : undefined;
        const planted = plantFeet(stageH, feet ? { ...sprite, feet } : sprite);
        return { ...sprite, scale: planted.scale, posY: planted.posY };
    };
    const finish = (entry) => {
        const e = entry || {};
        const probed = sized && e.url ? peek(e.url) : null;
        const centerX = Number(e.centerX);
        const hasCenter = Number.isFinite(centerX);
        if (sized && e.url && !probed && (align || hasCenter)) remember(e.url);
        const heightScale = Number(e.scale) || 100;
        let next = { ...e, heightScale };
        if (sized && align && !e.locked && probed) next = plant(next, probed);
        if (hasCenter && !e.locked) next = centered(next, centerX, probed);
        if (e.auto) {
            let auto = { ...e.auto };
            if (sized && align && probed) auto = plant(auto, probed);
            if (hasCenter) auto = centered(auto, centerX, probed);
            next.auto = { posX: auto.posX, posY: auto.posY, scale: auto.scale };
        }
        return next;
    };
    return {
        speaker: speaker ? finish(speaker) : null,
        members: (members || []).map(finish),
        pending,
    };
}

// 说话人横向平移（收成单人 / 回到多人时复用）；位置没变或无动画能力时返回 false。
export function playSpeakerMove(spriteEl, fromX, toX, posY) {
    if (!spriteEl || typeof spriteEl.animate !== 'function' || fromX == null || toX == null || Number(fromX) === Number(toX)) return false;
    spriteEl.animate([{ backgroundPosition: `${fromX}% ${posY}%` }, { backgroundPosition: `${toX}% ${posY}%` }], {
        duration: CAST_MOVE_MS, easing: EASING, fill: 'backwards',
    });
    return true;
}

// #igs-sprite 上的说话人：上一页不在台上就从近侧滑入；换了位置就平移；从陪衬升上来就由暗转亮。
export function playSpeakerCastMotion(spriteEl, prevStage, speaker, handoff = {}, { skipEnter = false } = {}) {
    if (!spriteEl || typeof spriteEl.animate !== 'function' || !prevStage || !speaker || !speaker.key) return [];
    const played = [];
    const memberX = prevStage.memberX || {};
    const fromX = prevStage.speaker === speaker.key ? prevStage.speakerX : memberX[speaker.key];
    if (fromX == null) {
        if (skipEnter) return played;
        const side = castSideOf(speaker.posX);
        if (side) {
            spriteEl.animate([{ transform: `translateX(${side * CAST_SLIDE_PCT}%)` }, { transform: 'translateX(0)' }], {
                duration: CAST_ENTER_MS, easing: EASING, fill: 'backwards', composite: 'add',
            });
        }
        played.push('enter');
        return played;
    }
    if (playSpeakerMove(spriteEl, fromX, speaker.posX, speaker.posY)) played.push('move');
    if (handoff.promoted === speaker.key) {
        // 接在样式表算好的环境调色后面播；只写压暗/提亮会把调色整段顶掉，说话人每次接过台词都闪一下原色。
        const view = spriteEl.ownerDocument && spriteEl.ownerDocument.defaultView;
        const graded = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(spriteEl).filter : '';
        const base = graded && graded !== 'none' ? `${graded} ` : '';
        spriteEl.animate([{ filter: `${base}${CAST_DIM_FRAME}` }, { filter: `${base}${CAST_LIT_FRAME}` }], { duration: CAST_HANDOFF_MS, easing: 'ease-out', fill: 'backwards' });
        played.push('promote');
    }
    return played;
}
