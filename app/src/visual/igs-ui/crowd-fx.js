import { CROWD_WORDS, TAVERN_WORDS } from './scene-audio.js';
import { pushStage } from './fx-sprite-react.js';
import { playDailySfx } from './fx-daily-sfx.js';
import { normalizeFxSoundSettings } from './fx-settings.js';

// 人群氛围：地点命中人多的词时，在背景与时段叠色之间铺一层极轻的暖灰地面雾；拥挤档再加几团大而柔的光斑，横向漂一次。
// 画面里不出现任何人形：人声底噪由 scene-audio 的 crowd 环境层按人多人少分三档出声；正文写到鼓掌、欢呼等时整台轻推并发声。
// 所有模式通用，不依赖漫画模式。

const BUSY_WORDS = Object.freeze(['车站', '广场', '集市', '商场', '商店街', '步行街', '庙会', '祭典', '夏日祭', '游乐园', '市场', '码头', '机场', '人群', '人潮', '演唱会', '体育场', '会场']);
const CALM_WORDS = Object.freeze(['教室', '食堂', '餐厅', '咖啡', '酒吧', '大厅', '大堂', '礼堂']);
// 单字「街」「市」太宽（街角、市长都会命中），人群氛围只认更具体的词；环境音层自己的词表不受影响。
const CROWD_PLACE_WORDS = Object.freeze(CROWD_WORDS.filter((word) => word !== '街' && word !== '市'));
const FLOW_WORDS = Object.freeze(['车站', '商店街', '步行街', '商场', '集市', '市场', '机场']);
const GLOW_COUNT = Object.freeze([0, 0, 0, 4]);
const REACT_SOUND = Object.freeze({ clap: 'bt-applause', cheer: 'bt-applause', murmur: 'bt-murmur', gasp: 'bt-murmur', laugh: 'bt-murmur' });
const QUIET_PLACE = /卧室|房间|宿舍|浴室|病房|车内|小巷|天台|屋顶|山顶|森林|海边|密室|地牢/;

export function normalizeCrowdFxSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { enabled: src.enabled === true, react: src.react !== false };
}

const includesAny = (text, words) => words.some((word) => text.includes(word));

// 纯函数：0 无人、1 稀疏、2 人多、3 拥挤。夜里降一档。
export function resolveCrowdDensity(location, time) {
    const place = String(location || '');
    if (!place || QUIET_PLACE.test(place)) return 0;
    let level = includesAny(place, BUSY_WORDS) ? 3 : (includesAny(place, TAVERN_WORDS) || includesAny(place, CROWD_PLACE_WORDS) || includesAny(place, CALM_WORDS) ? 2 : 0);
    if (level && /夜|深夜|午夜|night|midnight/i.test(String(time || ''))) level -= 1;
    return level;
}

const REACTIONS = Object.freeze([
    ['clap', /鼓掌|掌声/],
    ['cheer', /欢呼|喝彩|叫好/],
    ['gasp', /惊呼|倒吸一口|一片惊叫/],
    ['laugh', /哄笑|哄堂大笑|笑成一片/],
    ['murmur', /哗然|议论纷纷|窃窃私语|交头接耳/],
    ['hush', /鸦雀无声|安静了下来|一片寂静|全场安静|安静下来/],
    ['turn', /纷纷转头|齐刷刷(?:地)?(?:转头|回头|看向)|众人(?:纷纷)?回头|纷纷回头|齐齐回头/],
    ['bow', /躬身行礼|齐齐行礼|众人(?:纷纷)?(?:鞠躬|行礼|跪)|纷纷(?:行礼|鞠躬|跪下)|山呼/],
]);

export function resolveCrowdReaction(text) {
    const src = String(text || '');
    const hit = REACTIONS.find(([, re]) => re.test(src));
    return hit ? hit[0] : '';
}

const states = new WeakMap();

// 光斑只在换场景时横向漂一次（WAAPI，不循环）；减少动态效果时不漂。
function driftGlows(layer, doc) {
    const view = doc && doc.defaultView;
    if (view && typeof view.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    Array.from(layer.querySelectorAll('.igs-crowd-glow')).forEach((glow, i) => {
        if (typeof glow.animate !== 'function') return;
        try {
            glow.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${i % 2 ? -6 : 6}vw)` }], { duration: 14000 + i * 2500, easing: 'ease-in-out', fill: 'forwards' });
        } catch { /* 无 WAAPI */ }
    });
}

export function applyCrowdFx(root, snapshot) {
    const motion = root && root.querySelector ? root.querySelector('#igs-stage-motion') : null;
    if (!motion) return 0;
    const reader = (snapshot && snapshot.readerSettings) || {};
    const content = (snapshot && snapshot.content) || {};
    const settings = normalizeCrowdFxSettings(reader.crowdFx);
    const blocked = content.sceneNsfw === true || content.illustrationActive === true;
    const density = settings.enabled && !blocked ? resolveCrowdDensity(content.sceneLocation, content.sceneTime) : 0;
    let layer = motion.querySelector('#igs-crowd');
    if (!density) {
        if (layer) layer.remove();
        return 0;
    }
    const doc = root.ownerDocument;
    const bg = motion.querySelector('#igs-bg');
    if (!layer) {
        layer = doc.createElement('div');
        layer.id = 'igs-crowd';
        layer.setAttribute('aria-hidden', 'true');
    }
    // 紧跟在背景图后：时段叠色层插在立绘之前，会一起染到地面雾上。
    if (bg && bg.parentNode === motion && bg.nextSibling !== layer) motion.insertBefore(layer, bg.nextSibling);
    else if (!layer.parentNode) motion.appendChild(layer);
    const night = /夜|深夜|午夜|night|midnight/i.test(String(content.sceneTime || ''));
    const rain = /雨/.test(String(content.sceneWeather || ''));
    const key = `${content.sceneLocation}|${density}|${night}|${rain}`;
    let state = states.get(root);
    if (!state) { state = { key: '', pageKey: '', timer: null }; states.set(root, state); }
    if (state.key !== key) {
        state.key = key;
        const glows = GLOW_COUNT[density] || 0;
        layer.innerHTML = '<i class="igs-crowd-haze"></i>' + '<i class="igs-crowd-glow"></i>'.repeat(glows);
        layer.setAttribute('data-density', String(density));
        layer.setAttribute('data-tone', rain ? 'rain' : (night ? 'night' : 'day'));
        layer.setAttribute('data-flow', includesAny(String(content.sceneLocation || ''), FLOW_WORDS) ? '1' : '0');
        if (glows) driftGlows(layer, doc);
    }
    const pageKey = `${snapshot && snapshot.messageId}:${content.currentIndex}`;
    if (settings.react && state.pageKey !== pageKey) {
        state.pageKey = pageKey;
        const reaction = resolveCrowdReaction(content.displayText || content.text);
        clearTimeout(state.timer);
        if (reaction) {
            layer.setAttribute('data-react', reaction);
            // 安静下来、齐齐转头保持到翻页；其余反应 1.8 秒后回到日常。
            if (reaction !== 'hush' && reaction !== 'turn') state.timer = setTimeout(() => layer.removeAttribute('data-react'), 1800);
            const quiet = root.getAttribute && root.getAttribute('data-igs-quality') === 'low';
            const reduced = Boolean(doc.defaultView && typeof doc.defaultView.matchMedia === 'function' && doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches);
            if (!quiet && !reduced) pushStage({ root, reduced: false }, { scale: 1.015, duration: 1600 });
            if (REACT_SOUND[reaction]) playDailySfx(REACT_SOUND[reaction], normalizeFxSoundSettings(reader.fxSound));
        } else layer.removeAttribute('data-react');
    }
    return density;
}

export const CROWD_STYLE_TEXT = `
#igs-crowd{position:absolute;inset:0;pointer-events:none;overflow:hidden;animation:igs-crowd-in .8s ease both;--igs-crowd-haze:rgba(176,164,150,.12);--igs-crowd-glow:rgba(255,206,150,.14);}
#igs-crowd[data-tone="night"]{--igs-crowd-haze:rgba(190,150,110,.1);--igs-crowd-glow:rgba(255,184,110,.16);}
#igs-crowd[data-tone="rain"]{--igs-crowd-haze:rgba(150,164,184,.12);--igs-crowd-glow:rgba(170,196,230,.12);}
#igs-crowd .igs-crowd-haze{position:absolute;left:0;right:0;bottom:0;height:34%;background:linear-gradient(to top,var(--igs-crowd-haze),transparent);}
#igs-crowd .igs-crowd-glow{position:absolute;display:block;width:22%;height:26%;border-radius:50%;background:radial-gradient(closest-side,var(--igs-crowd-glow),transparent);mix-blend-mode:screen;transition:opacity .5s ease;}
#igs-crowd .igs-crowd-glow:nth-child(2){left:6%;bottom:30%;width:26%;height:30%;}
#igs-crowd .igs-crowd-glow:nth-child(3){left:34%;bottom:36%;width:18%;height:22%;opacity:.7;}
#igs-crowd .igs-crowd-glow:nth-child(4){left:58%;bottom:28%;width:24%;height:28%;opacity:.85;}
#igs-crowd .igs-crowd-glow:nth-child(5){left:78%;bottom:38%;width:16%;height:20%;opacity:.6;}
#igs-crowd:is([data-react="clap"],[data-react="cheer"]) .igs-crowd-glow{opacity:1;}
#igs-crowd[data-react="hush"] .igs-crowd-glow{opacity:.25;}
@keyframes igs-crowd-in{from{opacity:0;}to{opacity:1;}}
#igs-overlay[data-igs-comic="mono"] #igs-crowd{filter:grayscale(1);}
#igs-overlay[data-igs-quality="low"] #igs-crowd .igs-crowd-glow{display:none;}
@media (prefers-reduced-motion: reduce){#igs-crowd,#igs-crowd *{animation:none!important;}}
`;
