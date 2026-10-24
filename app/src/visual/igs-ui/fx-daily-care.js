// 体贴动作与水下吐气泡演出：开门礼让、护在身前、贴心照料、公主抱、吐气泡。
// 共用做法：立绘用 WAAPI add 叠加侧身、前倾、上提；前景用实色小物件（门、盾弧、线稿图标、花瓣）说清楚在做什么；动作字样做成小牌。
// 由 fx-daily.js 并入 BUILDERS；样式见 fx-daily-care-style.js，音效见 fx-daily-r3-sfx.js。
import { esc } from './reader-value-utils.js';
import { make } from './fx-daily-kit.js';
import { spriteElOf } from './stage-snapshot.js';
import { SPRITE_ACTION_FRAMES } from './sprite-actions.js';
import { bodyAnchor, castFigures, clamp, lifeOf, round1, safeAnimate, seeded } from './fx-daily-r3-kit.js';

const TEND_ICONS = Object.freeze({
    blanket: 'M3 8c3-2 6 2 9 0s6 2 9 0v10c-3 2-6-2-9 0s-6-2-9 0ZM3 13c3-2 6 2 9 0s6 2 9 0',
    cup: 'M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5ZM16 11h2a2.5 2.5 0 0 1 0 5h-2M8 3c-1 1.5 1 2.5 0 4M12 3c-1 1.5 1 2.5 0 4',
    pill: 'M9 3h6v3H9ZM7 6h10v14H7ZM7 11h10M12 13.5v4M10 15.5h4',
    towel: 'M4 7h14v12H4ZM4 11h14M8 15h6M19 3c-1.5 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.5-2-2-4Z',
    heart: 'M12 20 5 13a4.5 4.5 0 0 1 6.5-6.2L12 7.3l.5-.5A4.5 4.5 0 0 1 19 13Z',
});
const PETAL_COLORS = Object.freeze(['#f4ebe6', '#eedfdb', '#f8f1e4']);

function tendIconOf(act) {
    const s = String(act || '');
    if (/毯|被|衣|披|盖/.test(s)) return 'blanket';
    if (/药|丸|胶囊/.test(s)) return 'pill';
    if (/汗|巾|帕|擦|脸/.test(s)) return 'towel';
    if (/水|茶|汤|杯|饮|喝/.test(s)) return 'cup';
    return 'heart';
}

const card = (act, style) => (act ? `<div class="igs-dfx-care-card" style="${style}">${esc(act)}</div>` : '');

function swing(el, env, frames, life) {
    if (env.reduced) return null;
    return safeAnimate(el, frames, { duration: life, easing: 'ease-in-out', composite: 'add' });
}

export const CARE_BUILDERS = {
    // 开门礼让：门不画出来，只有暖光从一侧画面边缘漫进来；立绘侧身让出路，结尾轻点一下头，小牌上写着这一下的动作。
    opendoor(item, env) {
        const life = lifeOf('opendoor', env);
        const b = bodyAnchor(env, item.who);
        const doorLeft = b.x >= 50 ? 8 : 70;
        const dir = doorLeft < b.x ? -1 : 1;
        const node = make(env.doc, 'igs-dfx igs-dfx-opendoor',
            `<i class="igs-dfx-opendoor-light ${dir < 0 ? 'is-left' : 'is-right'}"></i>${card(item.act, `left:${doorLeft + 11}%;top:6%`)}`);
        const sprite = spriteElOf(env, item.who);
        swing(sprite, env, [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 }, { transform: `translate(${-dir * 3}%,0) rotate(${-dir * 0.8}deg)`, offset: 0.3 },
            { transform: `translate(${-dir * 3}%,0) rotate(${-dir * 0.8}deg)`, offset: 0.7 }, { transform: 'translate(0,0) rotate(0deg)', offset: 1 },
        ], life);
        if (!env.reduced) {
            safeAnimate(sprite, SPRITE_ACTION_FRAMES.nod.frames.map((transform) => ({ transform })), {
                duration: SPRITE_ACTION_FRAMES.nod.duration, delay: Math.round(life * 0.7), easing: SPRITE_ACTION_FRAMES.nod.easing, composite: 'add',
            });
        }
        return { layer: 'stage', life, sounds: ['door-handle', 'door'], node };
    },

    // 护在身前：来袭的流矢般的细光从一侧射来，撞上立绘身前一道弧形盾光后偏折散开；被护者一侧亮起暖光，立绘向前顿一下。
    shield(item, env) {
        const life = lifeOf('shield', env);
        const b = bodyAnchor(env, item.who);
        const cast = castFigures(env).find((c) => Math.abs(c.x - b.x) > 4) || null;
        const dir = cast ? (b.x >= cast.x ? 1 : -1) : (b.x < 50 ? 1 : -1);
        const arcX = round1(clamp(b.x + dir * 13, 6, 94));
        const top = round1(clamp(b.head - 6, 6, 40));
        const rnd = seeded(5521);
        const streaks = Array.from({ length: 6 }, (_, i) => {
            const dist = 28 + Math.round(rnd() * 12);
            const style = [
                `left:${round1(clamp(arcX + dir * (dist + 3), 2, 96))}%`, `top:${round1(top + 6 + (i / 5) * 40)}%`,
                `--m:${round1(-dir * (dist / 6))}`, `--bx:${dir * 30}px`, `--by:${Math.round((rnd() - 0.5) * 90)}px`, `--br:${Math.round((rnd() - 0.5) * 100)}deg`,
                `animation-delay:${Math.round(180 + i * 130)}ms`,
            ].join(';');
            return `<b style="${style}"></b>`;
        }).join('');
        const halo = cast ? `<i class="igs-dfx-shield-halo" style="left:${cast.x}%;top:${round1(clamp(b.chest, 20, 70))}%"></i>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-shield',
            `${halo}<div class="igs-dfx-shield-wall${dir < 0 ? ' is-flip' : ''}" style="left:${arcX}%;top:${top}%"><i class="igs-dfx-shield-arc"></i><i class="igs-dfx-shield-edge"></i></div>${streaks}${card(item.act, `left:${arcX}%;top:4%`)}`);
        swing(spriteElOf(env, item.who), env, [
            { transform: 'translate(0,0) scale(1)', offset: 0 }, { transform: `translate(${dir * 2}%,0) scale(1.05)`, offset: 0.14 },
            { transform: `translate(${dir * 1.4}%,0) scale(1.03)`, offset: 0.26 }, { transform: `translate(${dir * 1.4}%,0) scale(1.03)`, offset: 0.78 }, { transform: 'translate(0,0) scale(1)', offset: 1 },
        ], life);
        if (cast) {
            swing(cast.el, env, [
                { transform: 'translate(0,0)', filter: 'brightness(1)', offset: 0 }, { transform: `translate(${-dir * 2}%,0)`, filter: 'brightness(.92)', offset: 0.24 },
                { transform: `translate(${-dir * 2}%,0)`, filter: 'brightness(.92)', offset: 0.78 }, { transform: 'translate(0,0)', filter: 'brightness(1)', offset: 1 },
            ], life);
        }
        return { layer: 'stage', life, sounds: ['shield-ward'], node };
    },

    // 贴心照料：按动作字样画一幅线稿小图（毯、水、药、巾），线条一笔笔勾出来，一只手从下方托着它递过去；立绘微微侧身承接。
    tend(item, env) {
        const life = lifeOf('tend', env);
        const b = bodyAnchor(env, item.who);
        const icon = tendIconOf(item.act);
        const ix = round1(clamp(b.x < 50 ? b.x + 20 : b.x - 20, 14, 86));
        const iy = round1(clamp(b.chest - 12, 14, 56));
        const dir = b.x < 50 ? -1 : 1;
        const node = make(env.doc, 'igs-dfx igs-dfx-tend',
            `<i class="igs-dfx-tend-halo" style="left:${b.x}%;top:${round1(clamp(b.chest, 20, 72))}%"></i><div class="igs-dfx-tend-tile" style="left:${ix}%;top:${iy}%"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" pathLength="1" d="${TEND_ICONS[icon]}"/></svg>${item.act ? `<span>${esc(item.act)}</span>` : ''}</div>`);
        swing(spriteElOf(env, item.who), env, [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 }, { transform: `translate(0,.6%) rotate(${dir * 0.9}deg)`, offset: 0.3 },
            { transform: `translate(0,.6%) rotate(${dir * 0.9}deg)`, offset: 0.7 }, { transform: 'translate(0,0) rotate(0deg)', offset: 1 },
        ], life);
        return { layer: 'stage', life, sounds: ['tend-soft'], node };
    },

    // 公主抱 / 背起：在台有另一人时两人先靠拢再一同被托起，衣摆轻轻摇摆，花瓣自上方飘落；单人时只是立绘被托起。
    carry(item, env) {
        const life = lifeOf('carry', env);
        const b = bodyAnchor(env, item.who);
        const partner = castFigures(env).find((c) => Math.abs(c.x - b.x) > 3) || null;
        const midX = partner ? round1((b.x + partner.x) / 2) : b.x;
        const gap = partner ? partner.x - b.x : 0;
        const lift = (dx) => [
            { transform: 'translate(0,0) scale(1)', offset: 0 }, { transform: `translate(${round1(dx)}%,0) scale(1)`, offset: 0.16 },
            { transform: `translate(${round1(dx)}%,-3.6%) scale(1.02)`, offset: 0.38 }, { transform: `translate(${round1(dx)}%,-3.6%) scale(1.02)`, offset: 0.78 }, { transform: 'translate(0,0) scale(1)', offset: 1 },
        ];
        const sway = [{ transform: 'rotate(0deg)', offset: 0 }, { transform: 'rotate(-1.4deg)', offset: 0.3 }, { transform: 'rotate(1.2deg)', offset: 0.55 }, { transform: 'rotate(-.6deg)', offset: 0.8 }, { transform: 'rotate(0deg)', offset: 1 }];
        const main = spriteElOf(env, item.who);
        swing(main, env, lift(gap * 0.18), life);
        swing(main, env, sway, life);
        if (partner) {
            swing(partner.el, env, lift(-gap * 0.32), life);
            swing(partner.el, env, sway, life);
        }
        const rnd = seeded(6143);
        const petals = Array.from({ length: 8 }, (_, i) => `<i style="left:${round1(clamp(midX - 16 + rnd() * 32, 4, 96))}%;background:${PETAL_COLORS[i % 3]};--sw:${Math.round((rnd() - 0.5) * 90)}px;--rot:${Math.round(180 + rnd() * 360)}deg;animation-delay:${Math.round(rnd() * 1500)}ms;animation-duration:${Math.round(1700 + rnd() * 900)}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-carry',
            `<div class="igs-dfx-carry-stage" style="left:${midX}%"><i class="igs-dfx-carry-lift"></i><i class="igs-dfx-carry-glow"></i></div><div class="igs-dfx-carry-petals">${petals}</div>${card(item.act, `left:${midX}%;top:6%`)}`);
        return { layer: 'stage', life, sounds: ['carry-lift'], node };
    },

    // 吐气泡：从嘴边一串大小不一的气泡摇摇摆摆浮起，升到高处时「啵」地破开，溅出一圈水纹。
    bubble(item, env) {
        const b = bodyAnchor(env, '');
        const rnd = seeded(4409);
        const beads = Array.from({ length: 10 }, (_, i) => {
            const size = 6 + Math.round(rnd() * 11);
            const dur = Math.round(1500 + rnd() * 700);
            const delay = i * 150 + Math.round(rnd() * 120);
            const style = [
                `--igs-bb-s:${size}px`, `margin-left:${Math.round((rnd() - 0.5) * 12)}px`, `--sw:${Math.round(5 + rnd() * 9)}px`, `--rise:${Math.round(95 + rnd() * 70)}px`,
                `--d:${delay}ms`, `--t:${dur}ms`, `animation-delay:${delay}ms`, `animation-duration:${dur}ms`,
            ].join(';');
            return `<i style="${style}"></i>`;
        }).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-bubble', `<div class="igs-dfx-bubble-mouth" style="left:${b.x}%;top:${b.mouth}%">${beads}</div>`);
        return { layer: 'stage', life: lifeOf('bubble', env), sounds: ['blub', 'bubble-pop'], node };
    },
};
