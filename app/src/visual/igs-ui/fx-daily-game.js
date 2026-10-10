// 在家玩游戏机的日常演出构建器：开机 console、双人对战 versus、连击狂按 combo、抢手柄耍赖 snatch。
// 由 fx-daily.js 并入 BUILDERS；样式见 fx-daily-game-style.js，音效见 fx-daily-game-sfx.js，解析见 scene/game-console.js。
// 一局的胜负沿用既有的 game 标签（fx-daily.js 的 game 构建器，按结果选 game-win / game-lose / game-draw 音效）。
import { esc } from './reader-value-utils.js';

// 停留时长（ms）：开机要留够屏幕光与标题；对战血条要留够掉血动画与 K.O.；连击要留够数字一路升级；抢手柄是瞬间的爆发。
export const GAME_FX_LIFE_MS = Object.freeze({ console: 3600, versus: 4400, combo: 3200, snatch: 2600 });
// 同一对选手在这段时间内再次出现 versus，血条从上次的数值拉扯到新数值（多次更新比分）。
const VERSUS_MEMORY_MS = 180000;
// 连击数字的升级档数：数字分几次跳到最终值，越跳越大越红。
const COMBO_STAGES = 5;
const COMBO_STAGE_MS = 380;

function make(doc, className, html = '') {
    const node = doc.createElement('div');
    node.className = className;
    if (html) node.innerHTML = html;
    return node;
}

const life = (kind, env) => Math.round(GAME_FX_LIFE_MS[kind] * (env.hold || 1));

// 手柄简笔画：圆角机身、十字键、四颗按钮。
const PAD_SVG = '<svg class="igs-dfx-snatch-svg" viewBox="0 0 120 70" aria-hidden="true"><path d="M26 10h68c14 0 22 14 24 36 1 10-6 16-14 12-8-4-12-10-20-10H36c-8 0-12 6-20 10-8 4-15-2-14-12C4 24 12 10 26 10Z" fill="#2c3350" stroke="#aab4e8" stroke-width="3" stroke-linejoin="round"/><path d="M33 24v14M26 31h14" stroke="#e8ecff" stroke-width="4" stroke-linecap="round"/><circle cx="86" cy="26" r="4.5" fill="#ff6b8a"/><circle cx="97" cy="35" r="4.5" fill="#ffd66b"/><circle cx="75" cy="35" r="4.5" fill="#6bd6ff"/><circle cx="86" cy="44" r="4.5" fill="#8cf0a0"/></svg>';

let lastVersus = null;

const clampHp = (value, fallback) => (Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback);

// 血条：红色底条（受伤的残影，比主条慢半拍追上）+ 主条；从上次的血量 --igs-hp-from 拉到 --igs-hp。
function side(cls, name, from, hp) {
    const low = hp <= 25 ? ' is-low' : '';
    return `<div class="igs-dfx-versus-side ${cls}${low}"><b>${esc(name)}</b><span class="igs-dfx-versus-bar"><i class="igs-dfx-versus-ghost" style="--igs-hp-from:${from}%;--igs-hp:${hp}%"></i><i class="igs-dfx-versus-fill" style="--igs-hp-from:${from}%;--igs-hp:${hp}%"></i></span></div>`;
}

// 数字升级：把最终连击数拆成递增的几档，每档停留一小会儿，越后越大越红；最后一档停到结束。
export function comboStages(count) {
    const total = Math.max(2, Math.floor(Number(count) || 0));
    const steps = Math.min(COMBO_STAGES, total);
    const values = [];
    for (let i = 1; i <= steps; i++) {
        const v = Math.max(1, Math.round((total * i) / steps));
        if (!values.length || v > values[values.length - 1]) values.push(v);
    }
    return values;
}

export const GAME_BUILDERS = {
    // 开机：房间暗下去，屏幕光从下方映上来，底部浮出平台标志、游戏名与闪烁的 PRESS START。
    console(item, env) {
        const platform = item.platform ? esc(item.platform) : 'GAME';
        const game = item.game ? `<span class="igs-dfx-console-game">${esc(item.game)}</span>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-console', `<i class="igs-dfx-console-dark"></i><i class="igs-dfx-console-light"></i><i class="igs-dfx-console-scan"></i><div class="igs-dfx-console-boot"><span class="igs-dfx-console-plat">${platform}</span>${game}<span class="igs-dfx-console-press">PRESS START</span></div>`);
        return { layer: 'front', life: life('console', env), sounds: ['game-boot'], node };
    },
    // 双人对战：借战斗 HUD 的取色与描边（跟随战斗皮肤的强调色），顶部左右各一条血条，中间 VS；
    // 同一对选手再次出现时血条从上次的数值拉扯过去，残血闪红，某方归零时打出 K.O.。
    versus(item, env) {
        const p1 = item.p1 || '1P';
        const p2 = item.p2 || '2P';
        const now = Date.now();
        const prev = lastVersus && lastVersus.key === `${p1}|${p2}` && now - lastVersus.at < VERSUS_MEMORY_MS ? lastVersus : null;
        const hp1 = clampHp(item.hp1, 100);
        const hp2 = clampHp(item.hp2, 100);
        const from1 = prev ? prev.hp1 : 100;
        const from2 = prev ? prev.hp2 : 100;
        lastVersus = { key: `${p1}|${p2}`, at: now, hp1, hp2 };
        const ko = hp1 <= 0 || hp2 <= 0;
        const koHtml = ko ? `<div class="igs-dfx-versus-ko">K.O.</div>` : '';
        const node = make(env.doc, `igs-dfx igs-dfx-versus${ko ? ' has-ko' : ''}`, `<i class="igs-dfx-versus-edge"></i><div class="igs-dfx-versus-hud">${side('is-p1', p1, from1, hp1)}<span class="igs-dfx-versus-vs">VS</span>${side('is-p2', p2, from2, hp2)}</div>${koHtml}`);
        return { layer: 'front', life: life('versus', env), sounds: ko ? ['game-versus', 'game-ko'] : ['game-versus'], node };
    },
    // 连击：屏幕边缘红光脉动并轻微抖动，右侧 COMBO 数字分档跳升，一档比一档大、一档比一档红；按键轮流被「按下」。
    combo(item, env) {
        let count;
        if (item.count > 0) {
            const stages = comboStages(item.count);
            const last = stages.length - 1;
            const spans = stages.map((v, i) => `<b class="igs-dfx-combo-num is-s${Math.min(i, 4)}${i === last ? ' is-last' : ''}" style="animation-delay:${i * COMBO_STAGE_MS}ms">${v}</b>`).join('');
            count = `<div class="igs-dfx-combo-nums">${spans}</div><span class="igs-dfx-combo-unit">HIT COMBO</span>`;
        } else {
            count = '<div class="igs-dfx-combo-nums"><b class="igs-dfx-combo-num is-s3 is-last is-mash">!!</b></div><span class="igs-dfx-combo-unit">MASH</span>';
        }
        const move = item.move ? `<div class="igs-dfx-combo-move">${esc(item.move)}</div>` : '';
        const keys = ['A', 'B', 'X', 'Y', 'A', 'B', 'X', 'Y'].map((k, i) => `<i style="animation-delay:${i * 70}ms">${k}</i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-combo', `<i class="igs-dfx-combo-edge"></i><div class="igs-dfx-combo-board"><div class="igs-dfx-combo-count">${count}</div>${move}<div class="igs-dfx-combo-pad">${keys}</div></div>`);
        return { layer: 'front', life: life('combo', env), sounds: ['game-combo'], node };
    },
    // 抢手柄 / 耍赖：手柄左右猛晃，几道拉扯线，上方蹦出气泡字。
    snatch(item, env) {
        const act = esc(item.act || '抢手柄');
        const node = make(env.doc, 'igs-dfx igs-dfx-snatch', `<div class="igs-dfx-snatch-stage"><div class="igs-dfx-snatch-pad">${PAD_SVG}</div><div class="igs-dfx-snatch-lines"><i></i><i></i><i></i></div><div class="igs-dfx-snatch-act">${act}</div></div>`);
        return { layer: 'front', life: life('snatch', env), sounds: ['game-snatch'], node };
    },
};
