// 战斗演出的渲染适配：reader-dom-render 每次渲染调用一次。
// 关闭时只清理曾挂过的演出；同一页重绘不重播；翻回看过的页是否重播跟随演出风格的「重播」开关；
// 停留时间与灵动风格沿用漫画演出的 fxStyle，音效沿用 fxSound。
import { planBattleFx, normalizeBattleFxSettings, battleFxIdentity } from './fx-battle-model.js';
import { applyBattleFxToDom, cancelBattleFx } from './fx-battle.js';
import { battleSfxKind, playBattleSfx } from './fx-battle-sfx.js';
import { FX_HOLD_SCALE, normalizeFxSoundSettings, normalizeFxStyleSettings } from './fx-settings.js';
import { pickFxAccent } from './fx-symbols.js';
import { probeSpriteHead } from './fx-anchor.js';
import { castKeyOfSnapshot } from './stage-cast-render.js';
import { prefersReducedMotion } from './reduced-motion.js';

const SEEN_LIMIT = 256;
const mountedRoots = new WeakSet();
const seenPages = new WeakMap();

function pageKindOf(content) {
    if (content.chatPage === true) return 'chat';
    if (content.htmlCardPage === true) return 'card';
    return 'text';
}

function seenOf(root) {
    let seen = seenPages.get(root);
    if (!seen) { seen = { keys: new Set(), last: '' }; seenPages.set(root, seen); }
    return seen;
}

export function renderBattleFx(root, snapshot, ctx = {}) {
    if (!root || !snapshot) return { played: false, reason: 'empty' };
    const readerSettings = snapshot.readerSettings || {};
    if (!normalizeBattleFxSettings(readerSettings.battleFx).enabled) {
        if (mountedRoots.has(root)) { cancelBattleFx(root); mountedRoots.delete(root); }
        return { played: false, reason: 'disabled' };
    }
    const content = snapshot.content || {};
    const style = normalizeFxStyleSettings(readerSettings.fxStyle);
    const sprite = ctx.sprite && ctx.sprite.url ? ctx.sprite : null;
    const cast = Array.isArray(ctx.cast) ? ctx.cast.filter((c) => c && c.url && c.character) : [];
    const fx = content.fx || null;
    let foeImage = '';
    try { foeImage = fx && fx.foeImage ? String((typeof ctx.resolveAssetUrl === 'function' ? ctx.resolveAssetUrl(fx.foeImage) : fx.foeImage) || '') : ''; } catch (error) { foeImage = ''; }
    let plan = planBattleFx(fx, {
        settings: readerSettings.battleFx,
        identity: {
            chatId: snapshot.chatId || ctx.chatId || '',
            messageId: snapshot.messageId,
            swipeId: snapshot.swipeId || 0,
            page: content.currentIndex,
        },
        nsfw: content.sceneNsfw === true,
        pageKind: pageKindOf(content),
        holdScale: FX_HOLD_SCALE[style.hold],
        spriteName: sprite ? content.spriteCharacter || content.speaker || '' : '',
        foeImage,
        castNames: cast.map((c) => c.character),
        keyOf: castKeyOfSnapshot(snapshot),
    });
    if (!plan.plate && !plan.events.length && !mountedRoots.has(root)) return { played: false, reason: 'no-battle' };
    if (plan.identity) {
        const seen = seenOf(root);
        const key = battleFxIdentity(plan.identity);
        if (plan.events.length) {
            if (key !== seen.last && seen.keys.has(key) && !style.replay) plan = { ...plan, events: [], totalMs: 0 };
            seen.keys.add(key);
            if (seen.keys.size > SEEN_LIMIT) seen.keys.delete(seen.keys.values().next().value);
        }
        seen.last = key;
    }
    // 目标在场时冲击点要读立绘头位：提前探测，出招时从缓存同步取。
    if (sprite && plan.events.some((e) => e.targetKind === 'sprite')) {
        try { probeSpriteHead(sprite.url, root.ownerDocument).catch(() => null); } catch (error) { /* 探测失败退回舞台默认位置 */ }
    }
    for (const c of cast) {
        if (!plan.events.some((e) => e.targetKind === 'cast' && e.targetChar === c.character)) continue;
        try { probeSpriteHead(c.url, root.ownerDocument).catch(() => null); } catch (error) { /* 探测失败退回舞台默认位置 */ }
    }
    let reducedMotion = false;
    try { reducedMotion = prefersReducedMotion(); } catch (error) { reducedMotion = false; }
    const sound = normalizeFxSoundSettings(readerSettings.fxSound);
    const play = typeof ctx.playSfx === 'function' ? ctx.playSfx : (kind) => playBattleSfx(kind, sound, { audioScheduler: ctx.audioScheduler });
    let accent = '';
    try { accent = pickFxAccent(ctx.theme) || ''; } catch (error) { accent = ''; }
    const result = applyBattleFxToDom(root, plan, {
        reducedMotion,
        schedule: ctx.schedule,
        clear: ctx.clear,
        accent,
        sprite,
        cast,
        motion: style.motion,
        ancient: readerSettings._ancientEra === true,
        xianxia: readerSettings.dialogSkin === 'xianxia-ink',
        worldview: String(readerSettings._worldview || ''),
        onEvent: (event) => play(battleSfxKind(event, String(readerSettings._worldview || ''))),
    });
    mountedRoots.add(root);
    return result;
}
