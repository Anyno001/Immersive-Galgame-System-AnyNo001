import { spriteDrawRect } from './fx-anchor.js';
import { spriteGeometry } from './fx-runtime.js';

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
const ALIGN_RATIO_MIN = 0.8;
const ALIGN_RATIO_MAX = 1.25;
const SPEAKER_ID = '@speaker';
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
    const posY = ((stageH - h * feetFraction(sprite)) / room) * 100;
    return Math.max(-200, Math.min(300, posY));
}

// 把 member 缩放到与 reference 头宽一致（限制倍数），再把腿贴到舞台底。头顶不再拉齐。
// baseHeight 是两人各自的设定高度：头宽按两人之比放大，对齐只抹平原图构图的差别，不抹平设定的高矮。缺 baseHeight 时按同高。
export function alignToReference({ stageW, stageH, reference, member }) {
    const keep = { scale: member.scale, posY: posYForFeet(stageH, member) };
    const ref = spriteDrawRect(stageW, stageH, reference);
    const own = spriteDrawRect(stageW, stageH, member);
    if (!ref || !own || !reference.head || !member.head) return keep;
    const refHeadW = ref.w * reference.head.w;
    const ownHeadW = own.w * member.head.w;
    if (!(refHeadW > 0) || !(ownHeadW > 0)) return keep;
    const tall = reference.baseHeight > 0 && member.baseHeight > 0 ? member.baseHeight / reference.baseHeight : 1;
    const ratio = Math.max(ALIGN_RATIO_MIN, Math.min(ALIGN_RATIO_MAX, refHeadW * tall / ownHeadW));
    const scale = member.scale * ratio;
    const planted = { ...member, scale };
    const rect = spriteDrawRect(stageW, stageH, planted);
    if (!rect) return keep;
    return { scale, posY: posYForFeet(stageH, planted) };
}

// 参照物默认是本场景最早开口（order 最小）的在场者；传 refKey 时用这个人（还没探测好就不对齐）。
// locked 的条目（用户手调过）不被改，但可以当参照；locked 条目按 autoGeometry（删掉槽位后的样子）另算一份，只给「还原自动」用。
export function alignCastLayouts({ stageW, stageH, entries = [], refKey = null }) {
    const out = new Map();
    const ready = entries.filter((e) => e && e.geometry && e.geometry.head);
    if (ready.length < 2) return out;
    const ref = refKey == null ? ready.reduce((a, b) => (b.order < a.order ? b : a)) : ready.find((e) => e.key === refKey);
    if (!ref) return out;
    for (const e of ready) {
        if (e === ref) {
            const source = e.locked ? e.autoGeometry : e.geometry;
            if (source) out.set(e.id, { scale: source.scale, posY: posYForFeet(stageH, source) });
            continue;
        }
        const member = e.locked ? e.autoGeometry : e.geometry;
        if (member && member.head) out.set(e.id, alignToReference({ stageW, stageH, reference: ref.geometry, member }));
    }
    return out;
}

function withBaseHeight(geometry, baseHeight) {
    return geometry && Number(baseHeight) > 0 ? { ...geometry, baseHeight: Number(baseHeight) } : geometry;
}

// 头部对齐的参照锁：参照一旦定下，只要还在台上就不换，进出场、换表情都不会让台上原有的人重新对齐。
// memo 记每人上次的对齐结果：参照换了表情、图还没探测好时先沿用，避免先跳回原样再跳回来。
export function createCastAlignLock() {
    return { ref: null, memo: new Map() };
}

const sharedAlignLock = createCastAlignLock();

function alignMemoSig(stageW, stageH, e, geometry) {
    return [stageW, stageH, e.url, geometry && geometry.scale, geometry && geometry.posY, e.baseHeight].join('|');
}

// speaker / members 条目：{ url, order, posX, posY, scale, head(手动标定或 null), baseHeight?, auto?, locked?, ... }，其余字段原样带出。
// 说话人条目带 character 时按人锁参照，否则当作同一个「说话人」。
// auto 换成对齐后的样子：「还原自动」预览的就是保存后画面上会出现的样子。
// pending 为还没有探测数据、需要先 probeSpriteHead 的地址。
export function planCastLayouts({ stageW = 0, stageH = 0, align = false, speaker = null, members = [], peek = () => null, lock = sharedAlignLock } = {}) {
    const all = [
        ...(speaker ? [{ ...speaker, id: SPEAKER_ID, key: speaker.character || SPEAKER_ID }] : []),
        ...members.map((m) => ({ ...m, id: `m:${m.character}`, key: m.character })),
    ];
    const aligned = new Map();
    const pending = [];
    if (!align) {
        lock.ref = null;
        lock.memo.clear();
    } else if (all.length > 1 && stageW > 0 && stageH > 0) {
        const entries = [];
        for (const e of all) {
            const probed = e.url ? peek(e.url) : null;
            if (!probed && e.url) pending.push(e.url);
            const locked = e.locked === true;
            entries.push({
                id: e.id,
                key: e.key,
                url: e.url,
                baseHeight: e.baseHeight,
                order: Number.isFinite(e.order) ? e.order : Number.MAX_SAFE_INTEGER,
                locked,
                geometry: withBaseHeight(spriteGeometry(e, probed), e.baseHeight),
                autoGeometry: locked && e.auto ? withBaseHeight(spriteGeometry({ ...e, ...e.auto }, probed), e.baseHeight) : null,
            });
        }
        // 参照下台了才换人：换成在场者里本场景最早开口的那个（不管图探测好没有，免得探测完又换一次）。
        if (!entries.some((e) => e.key === lock.ref)) {
            lock.ref = entries.reduce((a, b) => (b.order < a.order ? b : a)).key;
            lock.memo.clear();
        }
        const fresh = alignCastLayouts({ stageW, stageH, entries, refKey: lock.ref });
        for (const e of entries) {
            if (e.key === lock.ref) {
                if (fresh.has(e.id)) aligned.set(e.id, fresh.get(e.id));
                continue;
            }
            const sig = alignMemoSig(stageW, stageH, e, e.locked ? e.autoGeometry : e.geometry);
            const value = fresh.get(e.id);
            if (value) {
                lock.memo.set(e.key, { sig, value });
                aligned.set(e.id, value);
                continue;
            }
            const memo = lock.memo.get(e.key);
            if (memo && memo.sig === sig) aligned.set(e.id, memo.value);
        }
    }
    const finish = ({ id, key, ...e }) => {
        const value = aligned.get(id);
        if (!value) return e;
        const next = e.locked ? { ...e } : { ...e, ...value };
        if (e.auto) next.auto = { ...e.auto, ...value };
        return next;
    };
    return {
        speaker: speaker ? finish(all[0]) : null,
        members: all.slice(speaker ? 1 : 0).map(finish),
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
