import { MAGIC_METAL, MAGIC_SPARKLE_MASK, magicTint, magicVeil } from './dialog-theme-css-skins.js';
import { fairyPaper } from './dialog-theme-fairytale.js';
import { qinglvSilk } from './dialog-theme-guofeng.js';
import { HORROR_DROP_MASK, HORROR_HEART_MASK } from './dialog-theme-horror.js';
import { SCIFI_CORNERS, SCIFI_GLASS, SCIFI_RETICLE_MASK, scifiHolo } from './dialog-theme-scifi.js';
import { WASTELAND_HAZARD, WASTELAND_HAZARD_MASK, WASTELAND_STEEL, wastelandRivet, wastelandRust } from './dialog-theme-wasteland.js';

// 物品演出角落卡片：每个对话框皮肤一套专属的框，呼应该皮肤对话框自己的边框语言。
// 只改框与配色，卡片宽度、位置、动画仍由 fx-item 决定；装饰一律实色，文字用皮肤墨色。
// ::before 是「动作标记」，颜色取 --igs-item-mark：获得=物品强调色，失去=灰，使用=偏蓝；::after 放皮肤自己的角饰。
// 世界观皮（.igs-fx-item-stack[data-igs-era]:not(#igs-era-x)）优先级更高，仍压过这里。

const DEFAULT_SKIN = 'default';
const GRAY = '#8a8f99';
const NO_BLUR = '-webkit-backdrop-filter:none;backdrop-filter:none;';
const mask = (url) => `-webkit-mask:${url} center/contain no-repeat;mask:${url} center/contain no-repeat;`;
const GORE_RED = '#c4101c';

const FRAMES = {
    [DEFAULT_SKIN]: {
        mention: '#ffd98a',
        ink: '#f2f3f7',
        card: 'background:#1e2028;border:1px solid #4a4e5c;border-radius:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 4px 16px rgba(0,0,0,.35);',
        before: 'left:7px;top:9px;bottom:9px;width:3px;border-radius:2px;',
        icon: 'background:#2c2f3a;border-radius:8px;box-shadow:inset 0 0 0 1px #4a4e5c;',
    },
    'western-classic': {
        mention: '#f0cd78',
        ink: '#eadfbf',
        card: 'background:#333726;border:1px solid #b8903f;border-radius:5px;box-shadow:inset 0 0 0 2px #262017,inset 0 0 0 3px #7a6232,0 3px 10px rgba(0,0,0,.35);padding:9px 15px 9px 14px;',
        before: 'left:4px;top:7px;bottom:7px;width:2px;',
        after: 'inset:0;background:linear-gradient(#d9b061,#d9b061) 5px 5px/5px 5px no-repeat,linear-gradient(#d9b061,#d9b061) calc(100% - 5px) 5px/5px 5px no-repeat,linear-gradient(#d9b061,#d9b061) 5px calc(100% - 5px)/5px 5px no-repeat,linear-gradient(#d9b061,#d9b061) calc(100% - 5px) calc(100% - 5px)/5px 5px no-repeat;',
        icon: 'background:radial-gradient(circle at 50% 35%,#4e5340,#2c2f22);border-radius:4px;box-shadow:inset 0 0 0 1px #b8903f;color:#d9b061;',
    },
    'day-minimal': {
        mention: '#b84a35',
        ink: '#3a3935',
        card: 'background:#f7f5ee;border:0;border-radius:0;box-shadow:0 1px 0 #b9b6a6;padding-left:16px;',
        before: 'left:0;top:0;bottom:0;width:3px;background:linear-gradient(var(--igs-item-mark) 0 33.3%,#d8d3bf 33.3% 66.6%,#b9c4a2 66.6%);',
        icon: 'background:#e7e5dc;border-radius:0;color:#6f6d62;',
        desc: 'color:#6a675c;opacity:1;',
    },
    'warm-picturebook': {
        mention: '#2c7a70',
        ink: '#4f4a45',
        card: 'background:#f1ede9;border:2px solid #4f4a45;border-radius:14px;box-shadow:inset 0 -6px 0 #55514b,0 2px 0 rgba(79,74,69,.18);padding-bottom:14px;',
        before: 'left:14px;bottom:0;width:26px;height:6px;border-radius:3px 3px 0 0;',
        icon: 'background:repeating-linear-gradient(135deg,#e7e1da 0 4px,#ded7cf 4px 8px);border-radius:10px;box-shadow:inset 0 0 0 1.5px #4f4a45;color:#4f4a45;',
        desc: 'color:#6c655e;opacity:1;',
    },
    'elegant-european': {
        mention: '#c9b8ff',
        ink: '#e4dfeb',
        card: `background:linear-gradient(90deg,rgba(6,6,12,.9),rgba(6,6,12,.74));border:0;border-radius:0;box-shadow:inset 0 1px 0 rgba(236,232,244,.5),inset 0 -1px 0 rgba(236,232,244,.3),0 4px 16px rgba(0,0,0,.4);${NO_BLUR}`,
        before: 'left:0;bottom:0;width:62%;height:1px;background:linear-gradient(90deg,var(--igs-item-mark),transparent);',
        after: 'right:7px;top:3px;content:"\\2727";font-size:11px;line-height:1;color:#c4b0ff;',
        icon: 'background:radial-gradient(circle at 50% 30%,#3d3470,#0c0c16 80%);border-radius:2px;box-shadow:inset 0 0 0 1px rgba(236,232,244,.4);color:#e4dfeb;',
    },
    'magic-academy': {
        mention: '#ffd98f',
        ink: '#e6e4f2',
        card: `background:${magicVeil(90)};border:0;border-radius:0;box-shadow:inset 0 1px 0 ${magicTint(MAGIC_METAL, 60)},inset 0 -1px 0 ${magicTint(MAGIC_METAL, 40)},0 4px 16px rgba(0,0,0,.4);padding-left:20px;padding-right:22px;${NO_BLUR}`,
        before: `left:7px;top:6px;width:11px;height:11px;background:var(--igs-item-mark);${mask(MAGIC_SPARKLE_MASK)}`,
        after: `right:8px;bottom:6px;width:9px;height:9px;background:${MAGIC_METAL};${mask(MAGIC_SPARKLE_MASK)}`,
        icon: `background:radial-gradient(circle at 50% 30%,${magicTint(MAGIC_METAL, 30)},${magicVeil(95)});border-radius:3px;box-shadow:inset 0 0 0 1px ${magicTint(MAGIC_METAL, 55)};color:#f3f1ff;`,
    },
    'fairy-tale': {
        mention: '#b04a3e',
        ink: '#4a4034',
        // 鼠尾草绿格子布边 + 奶油纸内衬 + 莓粉圆点线，对应对话框的野餐布。
        card: `border:6px solid transparent;border-radius:16px;padding:3px 10px 3px 8px;background:linear-gradient(${fairyPaper(1)},${fairyPaper(1)}) padding-box,repeating-linear-gradient(90deg,rgba(122,138,82,.3) 0 4px,transparent 4px 8px) border-box,repeating-linear-gradient(180deg,rgba(122,138,82,.3) 0 4px,transparent 4px 8px) border-box,#fbf6ea;box-shadow:0 0 0 1px rgba(122,138,82,.35),0 4px 12px rgba(60,50,30,.22);`,
        before: 'right:6px;top:5px;width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 2px #fbf6ea;z-index:1;',
        after: 'inset:0;border:2px dotted #e9a597;border-radius:10px;',
        icon: 'background:#efe8d4;border-radius:12px;box-shadow:inset 0 0 0 1.5px #e9a597;color:#7a8a52;',
        desc: 'color:#6b5d4b;opacity:1;',
    },
    'qinglv-shanshui': {
        mention: '#2f5d7c',
        ink: '#26332f',
        card: `background:${qinglvSilk('.95')};border:0;border-radius:2px;box-shadow:inset 0 1px 0 rgba(47,93,124,.45),inset 0 -1px 0 rgba(47,93,124,.45),0 2px 10px rgba(30,40,38,.14);padding-left:16px;`,
        before: 'left:5px;top:8px;bottom:8px;width:2px;background:linear-gradient(180deg,transparent,var(--igs-item-mark) 25%,var(--igs-item-mark) 75%,transparent);',
        after: 'right:6px;bottom:5px;width:7px;height:7px;background:#b8452f;border-radius:1px;',
        icon: 'background:rgba(79,143,127,.12);border-radius:0;box-shadow:inset 0 0 0 1px rgba(47,93,124,.35);color:#2f5d7c;',
        desc: 'color:#4f605a;opacity:1;',
    },
    'horror-gore': {
        mention: '#ff5a52',
        ink: '#f3ece4',
        card: 'background:#0a0a0a;border:0;border-radius:0;box-shadow:0 4px 14px rgba(0,0,0,.55);padding-left:17px;',
        before: `left:0;top:0;bottom:0;width:4px;background:var(--igs-item-mark-gore,${GORE_RED});`,
        after: `inset:0;background:linear-gradient(${GORE_RED},${GORE_RED}) 0 0/100% 3px no-repeat,linear-gradient(${GORE_RED},${GORE_RED}) 22% 0/4px 13px no-repeat,linear-gradient(${GORE_RED},${GORE_RED}) 61% 0/3px 8px no-repeat,linear-gradient(${GORE_RED},${GORE_RED}) 88% 0/5px 17px no-repeat;`,
        icon: 'background:#1a1212;border-radius:0;box-shadow:inset 0 0 0 1px #5a0d12;color:#f3ece4;',
        desc: 'color:#cfc5bb;opacity:1;',
    },
    'horror-psych': {
        mention: '#c0306a',
        ink: '#6b4a5c',
        card: 'background:radial-gradient(circle,#f9dbe6 0 1.6px,transparent 2.1px) 0 0/18px 18px,#fffafc;border:2px solid #f4a3c0;border-radius:14px;box-shadow:0 3px 0 rgba(224,119,157,.4);',
        before: `right:9px;top:6px;width:13px;height:12px;background:var(--igs-item-mark);${mask(HORROR_HEART_MASK)}`,
        after: `left:7px;bottom:5px;width:6px;height:7px;background:#b3161b;${mask(HORROR_DROP_MASK)}`,
        icon: 'background:repeating-linear-gradient(135deg,#fbe1ea 0 4px,#f7cddb 4px 8px);border-radius:10px;box-shadow:inset 0 0 0 1.5px #f4a3c0;color:#e0779d;',
        desc: 'color:#80606f;opacity:1;',
    },
    'plant-coffee': {
        mention: '#566f25',
        ink: '#5b4643',
        card: 'background:#f6f1eb;border:1.5px solid #5c4949;border-radius:18px;box-shadow:0 3px 0 rgba(92,73,73,.22);padding:8px 18px 8px 14px;',
        before: 'right:11px;top:7px;width:11px;height:11px;border-radius:0 100% 0 100%;transform:rotate(-12deg);box-shadow:0 0 0 1.5px #5c4949;',
        after: 'left:10px;right:10px;bottom:3px;height:0;border-bottom:1.5px dotted #c9b8a8;',
        icon: 'background:#ece2d6;border-radius:12px;color:#5c4949;',
        desc: 'color:#76625e;opacity:1;',
    },
    'black-white-manga': {
        mention: '#b3261e',
        ink: '#171412',
        card: 'background:radial-gradient(rgba(23,20,18,.1) 1px,transparent 1.3px) 0 0/5px 5px,#f3eee4;border:2.5px solid #171412;border-radius:2px;box-shadow:4px 4px 0 #171412;padding-left:18px;',
        before: 'left:0;top:0;bottom:0;width:8px;background:repeating-linear-gradient(-45deg,#171412 0 2px,var(--igs-item-mark) 2px 4px);border-right:2px solid #171412;',
        icon: 'background:radial-gradient(rgba(23,20,18,.28) .9px,transparent 1.2px) 0 0/4px 4px,#fff;border-radius:0;box-shadow:inset 0 0 0 2px #171412;color:#171412;',
        name: 'font-weight:800;',
        desc: 'color:#3a342f;opacity:1;',
    },
    'cute-pink': {
        mention: '#d0356a',
        ink: '#6b4454',
        card: 'background:#fff;border:2px solid #5e5356;border-radius:16px;box-shadow:0 4px 0 #d9416f;',
        before: `right:10px;top:6px;width:14px;height:13px;background:var(--igs-item-mark);${mask(HORROR_HEART_MASK)}`,
        after: 'left:14px;right:14px;bottom:3px;height:3px;border-radius:2px;background:repeating-linear-gradient(135deg,#f6b6c9 0 4px,#f29ab5 4px 8px);',
        icon: 'background:repeating-linear-gradient(135deg,#f6b6c9 0 4px,#f29ab5 4px 8px);border-radius:12px;box-shadow:0 0 0 2px #fff,0 0 0 3.5px #5e5356;color:#fff;',
        desc: 'color:#85606f;opacity:1;',
    },
    'retro-japanese': {
        mention: '#a63a2a',
        ink: '#4a3527',
        card: 'background:#f3e7cf;border:2px solid #6b4a36;border-radius:3px;box-shadow:inset 0 0 0 3px #f3e7cf,inset 0 0 0 4px #b98c5d,0 2px 6px rgba(0,0,0,.28);padding:10px 16px 10px 14px;',
        // 五圆硬币式的小章：中孔随动作换色。
        before: 'right:8px;top:7px;width:13px;height:13px;border-radius:50%;background:radial-gradient(circle,var(--igs-item-mark) 0 28%,#2f6e58 30% 100%);box-shadow:0 0 0 1.5px #4a3527;',
        icon: 'background:radial-gradient(circle at 50% 38%,#f6ecd6,#e2cfa9);border-radius:3px;box-shadow:inset 0 0 0 2px #b98c5d;color:#6b4a36;',
        desc: 'color:#6f5846;opacity:1;',
    },
    'adventure-journey': {
        mention: '#ffc56e',
        ink: '#ecdcbc',
        // 皮革卡片 + 一圈缝线 + 菱形铜铆钉。
        card: 'background:linear-gradient(180deg,#4d3c32,#3a2d26);border:2px solid #2a201b;border-radius:6px;box-shadow:inset 0 0 0 1px #b98a5a,0 3px 8px rgba(0,0,0,.35);padding:9px 14px 9px 20px;',
        before: 'left:7px;top:50%;width:8px;height:8px;margin-top:-4px;border:1.5px solid #2a201b;transform:rotate(45deg);z-index:1;',
        after: 'inset:4px;border:1px dashed #8f6c45;border-radius:3px;',
        icon: 'background:radial-gradient(circle at 50% 35%,#6a5242,#3a2d26);border-radius:4px;box-shadow:inset 0 0 0 1.5px #b98a5a;color:#d9aa6e;',
        desc: 'color:#d3c19c;opacity:1;',
    },
    // 全息投影：深蓝玻璃卡、四角青色折角，动作标记是一枚准星。
    'scifi-holo': {
        mention: '#7ff0ff',
        ink: '#e2f6ff',
        card: `background:${SCIFI_GLASS};border:1px solid ${scifiHolo('.3')};border-radius:2px;box-shadow:0 0 14px ${scifiHolo('.14')},0 4px 14px rgba(0,0,0,.4);padding-right:24px;${NO_BLUR}`,
        before: `right:7px;top:7px;width:11px;height:11px;${mask(SCIFI_RETICLE_MASK)}`,
        after: `inset:-1px;background:${SCIFI_CORNERS(9, 2)};`,
        icon: `background:linear-gradient(180deg,${scifiHolo('.16')},${scifiHolo('.04')});border-radius:2px;box-shadow:inset 0 0 0 1px ${scifiHolo('.45')};color:#bff4ff;`,
        desc: 'color:#a3b8cc;opacity:1;',
    },
    // 废土锈铁：暗钢小铁牌、两颗铆钉、角落锈斑，动作标记是一枚警示三角。
    'wasteland-rust': {
        mention: WASTELAND_HAZARD,
        ink: '#ece3cf',
        card: `background:${wastelandRivet('7px', '7px')},${wastelandRivet('calc(100% - 7px)', 'calc(100% - 7px)')},radial-gradient(ellipse 40% 90% at 100% 100%,${wastelandRust('.45')},transparent 72%),${WASTELAND_STEEL};border:2px solid #1b1915;border-radius:3px;box-shadow:inset 0 1px 0 rgba(255,236,200,.1),0 3px 10px rgba(0,0,0,.45);padding-right:26px;`,
        before: `right:9px;top:8px;width:12px;height:12px;${mask(WASTELAND_HAZARD_MASK)}`,
        icon: 'background:#211e1a;border-radius:2px;box-shadow:inset 0 0 0 1.5px #5a5245;color:#d6c6a0;',
        desc: 'color:#b9ad94;opacity:1;',
    },
    'gradient-veil': {
        mention: '#ffe08a',
        ink: '#ffffff',
        card: `background:linear-gradient(90deg,rgba(0,0,0,.66),rgba(0,0,0,.5) 80%,rgba(0,0,0,.3));border:0;border-radius:0;box-shadow:inset 0 -1px 0 rgba(255,238,184,.7);text-shadow:0 1px 3px rgba(0,0,0,.9);${NO_BLUR}`,
        before: 'left:0;top:0;bottom:0;width:2px;',
        icon: 'background:rgba(255,255,255,.1);border-radius:2px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);color:#fff;',
    },
};

const DEFAULT_CARD = '#igs-overlay:not([data-igs-dialog-skin]) .igs-fx-item-card,#igs-overlay[data-igs-dialog-skin="default"] .igs-fx-item-card';

// default 没有属性或属性为 default；其余皮肤一个属性选择器。suffix 接在 .igs-fx-item-card 后，child 是后代。
function pick(skin, suffix = '', child = '') {
    const base = skin === DEFAULT_SKIN ? DEFAULT_CARD : `#igs-overlay[data-igs-dialog-skin="${skin}"] .igs-fx-item-card`;
    return base.split(',').map((part) => `${part}${suffix}${child ? ` ${child}` : ''}`).join(',');
}

export const ITEM_FRAME_SKINS = Object.freeze(Object.keys(FRAMES));

export function getDialogThemeItemFrameStyleText(skin) {
    const f = FRAMES[skin];
    if (!f) return '';
    const scope = skin === DEFAULT_SKIN
        ? '#igs-overlay:not([data-igs-dialog-skin]),#igs-overlay[data-igs-dialog-skin="default"]'
        : `#igs-overlay[data-igs-dialog-skin="${skin}"]`;
    const rules = [
        `${scope}{--igs-item-mention-color:${f.mention};}`,
        `${pick(skin)}{--igs-item-mark:var(--igs-item-accent-c);--igs-item-mark-gore:${GORE_RED};${f.card}color:${f.ink};}`,
        `${pick(skin, '[data-igs-item-action="lose"]')}{--igs-item-mark:${GRAY};--igs-item-mark-gore:${GRAY};}`,
        `${pick(skin, '[data-igs-item-action="use"]')}{--igs-item-mark:color-mix(in oklab,var(--igs-item-accent-c) 45%,#7fd3ff);}`,
        `${pick(skin, '::before')}{background:var(--igs-item-mark);pointer-events:none;${f.before}}`,
    ];
    if (f.after) rules.push(`${pick(skin, '::after')}{content:"";position:absolute;pointer-events:none;${f.after}}`);
    // 稀有物品用强调色描边（外圈 outline，不被卡片的 overflow 裁掉）。
    rules.push(`${pick(skin, '[data-igs-item-rare]')}{outline:1.5px solid var(--igs-item-accent-c);outline-offset:2px;}`);
    rules.push(`${pick(skin, '', '.igs-fx-item-icon')},${pick(skin, '', '.igs-fx-item-icon[data-igs-item-placeholder]')}{${f.icon}}`);
    rules.push(`${pick(skin, '', '.igs-fx-item-name')}{color:${f.ink};${f.name || ''}}`);
    rules.push(`${pick(skin, '', '.igs-fx-item-action')}{color:${f.ink};opacity:.78;}`);
    if (f.desc) rules.push(`${pick(skin, '', '.igs-fx-item-desc')}{${f.desc}}`);
    return rules.join('\n');
}
