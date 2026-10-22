// 武侠江湖包的演出构建器：DOM 照 plan/wuxia-ink-ui/v6 定稿（类名 wx-*），样式见 fx-wuxia-style.js。
// 每个构建器返回 { node, life, layer, sounds }；减少动态效果时只留静止终态、不跑 WAAPI；逐字与钤印的先后全在 CSS 延时里。
import { esc } from './reader-value-utils.js';
import { spriteElOf } from './stage-snapshot.js';
import { WUXIA_OATH_WORDS } from './fx-wuxia-model.js';

// 江湖令的立绘站位、停留与秘籍完全一致（不震屏），只有令牌本身的入场不同。
export const WUXIA_LIFE_MS = Object.freeze({ wxname: 3200, wxpalm: 3600, wxdart: 1800, wxmanual: 3200, wxtoken: 3200, wxoath: 3600, wxmad: 2600 });

// 节奏：停留时长与震屏延时一起放慢到 1.6 倍，与样式里的 --wxs 一致。
const PACE = 1.6;
const lifeOf = (kind, env) => Math.round(WUXIA_LIFE_MS[kind] * PACE * (env.hold || 1));
const chars = (text) => Array.from(String(text || '')).map((ch, i) => `<b class="wx-ch" style="--i:${i}">${esc(ch)}</b>`).join('');
const div = (cls, html = '') => `<div class="wx ${cls}">${html}</div>`;
const INKV = div('wx-inkv');

function animate(env, el, frames, options) {
    if (env.reduced || !el || typeof el.animate !== 'function') return null;
    try { return el.animate(frames, options); } catch { return null; }
}
function spriteOf(env, who) { try { return spriteElOf(env, who); } catch { return null; } }
function stageWidth(env) {
    const m = env.layers && env.layers.motion;
    const w = m ? Number(m.clientWidth) || 0 : 0;
    return w > 0 ? w : 960;
}
// 立绘站位（v6）：按舞台宽度比例横移，演出收束回原位；composite:add 叠在立绘自身动作上。
function standAt(env, who, frac, life) {
    const dx = `${Math.round(stageWidth(env) * frac)}px`;
    animate(env, spriteOf(env, who || env.speaker), [{ translate: '0 0' }, { translate: `${dx} 0`, offset: 0.1 }, { translate: `${dx} 0`, offset: 0.88 }, { translate: '0 0' }], { duration: life, easing: 'ease-in-out', composite: 'add' });
}
// 震屏（v6 shake-l / shake-h，逐格）。
function shake(env, delay, heavy) {
    const f = heavy ? ['0 0', '-9px 4px', '8px -5px', '-6px 3px', '5px -2px', '-2px 1px', '0 0'] : ['0 0', '-4px 2px', '3px -2px', '-2px 1px', '0 0'];
    animate(env, env.layers && env.layers.motion, f.map((translate) => ({ translate })), { delay: Math.round(delay * PACE), duration: heavy ? 420 : 260, easing: heavy ? 'steps(3,end)' : 'steps(2,end)' });
}
function build(env, kind, html, { full = false } = {}) {
    const node = env.doc.createElement('div');
    node.className = `igs-dfx igs-wx igs-wx-${kind}${full ? ' is-full' : ''}${env.reduced ? ' is-reduced' : ''}`;
    node.innerHTML = html;
    return node;
}
const out = (env, kind, layer, node, sounds) => ({ layer, life: lifeOf(kind, env), sounds, node });

export const WUXIA_BUILDERS = Object.freeze({
    // 名号亮相：竖排拓片，别号作小字，名字逐字写出，右下角钤名首字。
    wxname(item, env) {
        standAt(env, item.name, -0.2, lifeOf('wxname', env));
        const name = item.name || '';
        const card = div('wx-item wx-n-card', `${item.title ? `<div class="wx-k">${esc(item.title)}</div>` : ''}<div class="wx-n wx-n-name">${chars(name)}</div><div class="wx-seal wx-n-seal">${esc(Array.from(name)[0] || '名')}</div>`);
        return out(env, 'wxname', 'front', build(env, 'wxname', INKV + card, { full: true }), ['wx-name']);
    },
    // 内力对掌：两股墨纹相持、中线迸开；胜者为乙时整组左右镜像。
    wxpalm(item, env) {
        standAt(env, item.a, -0.35, lifeOf('wxpalm', env));
        const mirror = item.winner && item.winner === item.b ? ' is-mirror' : '';
        const html = `${div('wx-tag v wx-p-a', esc(item.a))}${div('wx-tag v wx-p-b', esc(item.b))}<div class="wx-clash${mirror}">${div('wx-wave l')}${div('wx-wave r')}${div('wx-p-burst')}</div>`;
        shake(env, 1600, true);
        return out(env, 'wxpalm', 'front', build(env, 'wxpalm', html), ['wx-palm']);
    },
    // 暗器：四道极细墨线疾射而过，落点洇墨，墨签写暗器名。
    wxdart(item, env) {
        const html = `${[1, 2, 3, 4].map((i) => div(`wx-dart d${i}`)).join('')}${div('wx-d-pin')}${div('wx-tag v wx-d-tag', esc(item.name))}`;
        shake(env, 500, false);
        return out(env, 'wxdart', 'front', build(env, 'wxdart', html), ['wx-dart']);
    },
    // 秘籍：只留竖排拓片（v6 不画书）。
    wxmanual(item, env) {
        standAt(env, '', 0.27, lifeOf('wxmanual', env));
        const card = div('wx-item wx-m-card', `<div class="wx-k">武学秘籍</div><div class="wx-n">${esc(item.name)}</div>${item.note ? `<div class="wx-d">${esc(item.note)}</div>` : ''}`);
        return out(env, 'wxmanual', 'front', build(env, 'wxmanual', INKV + card, { full: true }), ['wx-manual']);
    },
    // 江湖令：黑漆令牌由大落定，正面纸色「令」，下竖写令名。
    wxtoken(item, env) {
        standAt(env, '', 0.27, lifeOf('wxtoken', env));
        const html = `${INKV}${div('wx-token')}${div('wx-k-char', '令')}<div class="wx wx-k-sub" style="--n:${Array.from(item.name || '').length || 1}">${esc(item.name)}</div>`;
        return out(env, 'wxtoken', 'front', build(env, 'wxtoken', html, { full: true }), ['wx-token']);
    },
    // 结义 · 拜师：四字由淡转浓加白色外发光，旁写两人名，最后钤印。
    wxoath(item, env) {
        standAt(env, '', -0.31, lifeOf('wxoath', env));
        const words = WUXIA_OATH_WORDS[item.mode] || WUXIA_OATH_WORDS.oath;
        const names = [item.a, item.b].filter(Boolean).join(' · ');
        const seal = item.mode === 'master' ? '师' : '义';
        const html = `${INKV}${names ? div('wx-tag v wx-o-who', esc(names)) : ''}${div('wx-o-words', chars(words))}${div('wx-seal wx-o-seal', seal)}`;
        return out(env, 'wxoath', 'front', build(env, 'wxoath', html, { full: true }), ['wx-oath']);
    },
    // 走火入魔：墨自下倒灌，挂舞台层（对话框之下）；人物逐格失焦。
    wxmad(item, env) {
        shake(env, 300, true);
        animate(env, spriteOf(env, item.who || env.speaker), [{ filter: 'blur(0px)' }, { filter: 'blur(3px)', offset: 0.45 }, { filter: 'blur(0px)' }], { duration: lifeOf('wxmad', env), easing: 'steps(14,end)', composite: 'add' });
        return out(env, 'wxmad', 'stage', build(env, 'wxmad', div('wx-mad')), ['wx-mad']);
    },
});
