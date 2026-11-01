import { hash32 } from '../../combat/random.js';
import { RECORD_ICONS, lineIconSvg } from './record-icons.js';

// 卡面纹样：一组线条图（24 网格、细线、currentColor，颜色由样式层按卡牌类型着色）。
// 先按卡名在全部纹样里匹配（不受牌型限制），同分再看效果结构；卡名一个字都没命中时才在本类型的纹样里按效果结构选；仍同分按卡牌 ID 的哈希定一张。
// 同一张卡（含复制）始终同一纹样，升级只改数值时不变；生成牌按模板 ID 固定。卡名只参与匹配，不进入 SVG；SVG 只由下列程序常量拼出。本场临时牌（生成 / 复制）加虚线描边与错位残影。
const inner = (svg) => String(svg).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

const BODY = Object.freeze({
    blade: inner(RECORD_ICONS.weapon), bow: inner(RECORD_ICONS.bow), flame: inner(RECORD_ICONS.flame),
    ward: inner(RECORD_ICONS.armor), potion: inner(RECORD_ICONS.potion), book: inner(RECORD_ICONS.book),
    spark: inner(RECORD_ICONS.sparkle), scatter: inner(RECORD_ICONS.shuffle), mirror: inner(RECORD_ICONS.layers),
    clock: inner(RECORD_ICONS.watch), crown: inner(RECORD_ICONS.crown), gem: inner(RECORD_ICONS.gem),
    sprout: inner(RECORD_ICONS.flower), heart: inner(RECORD_ICONS.favor), card: inner(RECORD_ICONS.card),
    allies: inner(RECORD_ICONS.people), rewind: inner(RECORD_ICONS.undo), seek: inner(RECORD_ICONS.search), duel: inner(RECORD_ICONS.combat),
    key: inner(RECORD_ICONS.key), lantern: inner(RECORD_ICONS.lantern), candle: inner(RECORD_ICONS.candle), compass: inner(RECORD_ICONS.compass),
    dice: inner(RECORD_ICONS.dice), umbrella: inner(RECORD_ICONS.umbrella), ring: inner(RECORD_ICONS.ring), gift: inner(RECORD_ICONS.gift),
    chest: inner(RECORD_ICONS.box), quill: inner(RECORD_ICONS.pen),
    coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="6" opacity=".55"/><rect x="10" y="10" width="4" height="4"/>',
    cup: '<path d="M6.5 3.5h11c0 4.5-2.5 7.5-5.5 7.5s-5.5-3-5.5-7.5Z"/><path d="M12 11v7.5M8.5 20.5h7M7.2 6.5h9.6"/>',
    pill: inner(RECORD_ICONS.pill), satchel: inner(RECORD_ICONS.bag), map: inner(RECORD_ICONS.map), wrench: inner(RECORD_ICONS.tool),
    dagger: '<path d="M19.5 4.5 11 15l-2-2Z"/><path d="M7.5 11.5l5 5M10 14l-4.5 4.5"/><circle cx="4.8" cy="19.2" r="1"/>',
    fist: '<path d="M7 9.5V8a1.5 1.5 0 0 1 3 0v1.5M10 9V7.5a1.5 1.5 0 0 1 3 0V9M13 9V8a1.5 1.5 0 0 1 3 0v1"/><path d="M7 9.5c-1.5 0-2 1-2 2.5 0 3.5 2.5 6 6 6h1.5c2.5 0 4.5-2 4.5-5v-2.5c0-1-.7-1.5-1.5-1.5"/><path d="M5.5 12.5h4a1.5 1.5 0 0 1 0 3H8M9 18v2.5h5.5V18"/>',
    claw: '<path d="M18.5 3.5C15 9 11 15 6.5 20.5M14 2.5C11 8 7.5 13.5 3.5 17.5M21 7.5C18 12.5 14.5 17.5 10.5 21.5"/>',
    spear: '<path d="M20.5 3.5 18 9l-3.5.5.5-3.5Z"/><path d="M14.5 9.5 4 20M10 11l3 3"/>',
    hammer: '<path d="M13.4 3.6 20.4 10.6 17.6 13.4 10.6 6.4Z"/><path d="M14.1 9.9 4.5 19.5"/>',
    bolt: '<path d="M13.5 2.5 5.5 13.5h6l-1 8 8-11h-6Z"/>',
    burst: '<path d="M21.5 12 15.7 13.5 18.7 18.7 13.5 15.7 12 21.5 10.5 15.7 5.3 18.7 8.3 13.5 2.5 12 8.3 10.5 5.3 5.3 10.5 8.3 12 2.5 13.5 8.3 18.7 5.3 15.7 10.5Z"/>',
    whirl: '<path d="M3 8.5h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12.5h15.5a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16.5h7"/>',
    frost: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5M17.3 6.1 16.3 9.5 19.8 10.4M6.7 17.9 7.7 14.5 4.2 13.6M6.7 6.1 7.7 9.5 4.2 10.4M17.3 17.9 16.3 14.5 19.8 13.6"/>',
    echo: '<circle cx="6" cy="12" r="2"/><path d="M10 7.5a6.5 6.5 0 0 1 0 9M14 5a10 10 0 0 1 0 14"/><path d="M18 3a13 13 0 0 1 0 18" opacity=".45"/>',
    surge: '<path d="m5 13 7-7 7 7"/><path d="m5 19 7-7 7 7" opacity=".55"/><path d="M12 2.5v.5"/>',
    shard: '<path d="M10 3 14 9 11 21 7 10Z"/><path d="M15.5 6.5 19 10.5 16.5 17 14.5 11Z"/><path d="M10 3 11 21"/>',
    wall: '<rect x="3.5" y="5" width="17" height="14" rx="1"/><path d="M3.5 9.7h17M3.5 14.3h17M9 5v4.7M15 5v4.7M6.5 9.7v4.6M12 9.7v4.6M17.5 9.7v4.6M9 14.3V19M15 14.3V19"/>',
    talisman: '<path d="M7.5 3h9v14l-4.5 3-4.5-3Z"/><path d="M10 6.5h4M12 6.5v8M10 10.5c1.3-.8 2.7-.8 4 0M10 13.5c1.3.8 2.7.8 4 0"/><path d="M12 20v1.5"/>',
    charge: '<circle cx="12" cy="12" r="8.5"/><path d="M13 6.5 8.5 13H12l-1 4.5 4.5-6.5H12Z"/>',
    anvil: '<path d="M3.5 7.5h14l3-1.5v3l-3 1.5h-2v3l2.5 3.5h-12l2.5-3.5v-3H6C4.5 10.5 3.5 9 3.5 7.5Z"/><path d="M6 20h12M11 4.5V3M14 5l1-1"/>',
    feather: '<path d="M19.5 4.5C13 4.5 8 9 7.5 16c7.5-.5 12-5 12-11.5Z"/><path d="M15 8.5 4.5 19.5"/>',
    vial: '<path d="M10 3.5h4M10.5 3.5v4.2a6 6 0 1 0 3 0V3.5"/><path d="M6.6 13.5h10.8"/><circle cx="10.5" cy="16" r=".8"/><circle cx="13.5" cy="17.5" r=".6"/>',
    spiral: '<path d="M10.5 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0 7.5 7.5 0 0 1 15 0"/>',
    drop: '<path d="M12 3.5c3.5 4.5 6 7.5 6 10.5a6 6 0 0 1-12 0c0-3 2.5-6 6-10.5Z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
    step: '<path d="M4 17.5c4 0 5-11 9-11h6.5"/><path d="m16.5 3.5 3 3-3 3"/><path d="M3 11h3M2.5 14h2.5M5.5 7.5h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    eye: '<path d="M2.5 12C5 7.5 8.5 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-6 6.5-9.5 6.5S5 16.5 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    rune: '<circle cx="12" cy="12" r="8.5"/><path d="M12 5.5 17.6 15.2H6.4Z"/><circle cx="12" cy="12" r="1.5"/>',
    thorn: '<path d="M4 20C8 16 7 9 12 7.5S19 6 20.5 3.5"/><path d="m7 14.6-2.4-.8M9.3 9.6l-1.4-2M14.6 6.8l.2-2.4M18.2 5.6l1.6 1.6"/>',
    moon: '<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5 8 8 0 0 1-5-13.5Z"/><path d="M18 6l.5 1.5L20 8l-1.5.5L18 10l-.5-1.5L16 8l1.5-.5Z"/>',
    mountain: '<path d="M2.5 19.5 9 8l3.5 5.5 2.5-3.5 6.5 9.5Z"/><path d="m7.2 11.2 1.8 1.3 1.6-1.6"/>',
    wave: '<path d="M2.5 17c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1 3-1"/><path d="M3 12.5c3 0 5-6 10-6a4.5 4.5 0 0 1 4 6.5c-1-1.5-2.5-2-3.5-1.5"/>',
    comet: '<path d="M17.5 3l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z"/><path d="M14.5 10.5 4 21M16 13.5 10 19.5M12 9 6 15"/>',
    axe: '<path d="M15.5 8.5 4 20"/><path d="M11.5 5.5 15 2c3 1.5 5.5 4.5 6.5 8L18 13.5c-1.5-3.5-3.5-6-6.5-8Z"/>',
    scythe: '<path d="M7 21 14.5 3.5"/><path d="M14 4.5c3.5-1 6.5.5 7.5 3.5-3-1.5-6-1-8.5 1"/>',
    chain: '<rect x="3" y="9" width="10" height="6" rx="3" transform="rotate(-35 8 12)"/><rect x="11" y="9" width="10" height="6" rx="3" transform="rotate(-35 16 12)"/>',
    shuriken: '<path d="M12 2.5 13.8 10.2 21.5 12 13.8 13.8 12 21.5 10.2 13.8 2.5 12 10.2 10.2Z"/><circle cx="12" cy="12" r="1.6"/>',
    skull: '<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.6 3.5 5.8v3.2h8v-3.2c2.2-1.2 3.5-3.2 3.5-5.8A7.5 7.5 0 0 0 12 3Z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10.5 19.5v-2M13.5 19.5v-2M11.2 14.8 12 13.5l.8 1.3"/>',
    bomb: '<circle cx="10.5" cy="14" r="6.5"/><path d="M14.8 9.2 17 7c.5-2 2-3 4-2.5"/><path d="M20.5 1.8v1.2M22.2 3.6H21M7.5 12.5a3.5 3.5 0 0 1 2.5-2.5"/>',
    serpent: '<path d="M5 20.5c3 0 5-1.5 5-4s-4-3-4-6 2.5-5 6-5 5.5 1.5 6.5 3"/><path d="M18.5 8.5 21 8l-1.2 2.5"/><circle cx="15.8" cy="6.6" r=".6"/>',
    paw: '<path d="M12 12.5c-2.8 0-5 2.6-5 5 0 1.6 1.3 2.5 2.8 2.5.9 0 1.5-.5 2.2-.5s1.3.5 2.2.5c1.5 0 2.8-.9 2.8-2.5 0-2.4-2.2-5-5-5Z"/><ellipse cx="5.5" cy="10.5" rx="1.6" ry="2.1"/><ellipse cx="9.3" cy="6.5" rx="1.6" ry="2.2"/><ellipse cx="14.7" cy="6.5" rx="1.6" ry="2.2"/><ellipse cx="18.5" cy="10.5" rx="1.6" ry="2.1"/>',
    wing: '<path d="M3.5 18.5C6 10 12 5.5 20.5 4.5c-.5 2.5-2 4-4 5 1 .5 1.5 1.2 1.5 2-1.5 1-3 1.5-4.5 1.5.5.7.8 1.5.5 2.5-3.5.8-7 .5-10.5-1Z"/><path d="M8 15.5c2.5-3 5.5-5.5 9-7" opacity=".55"/>',
    crescent: '<path d="M4 18.5C9 18 17 13 19.5 4.5 21 12 15 19 4 18.5Z"/><path d="M3 14.5l2-.5M5 10.5l1.5-.8"/>',
    boot: '<path d="M8 3h6v9l5 3.5c1.2.8 1.5 2 1.5 3.5V20H5v-3l3-1Z"/><path d="M5 17.5h15.5M8 7h6"/>',
    bell: '<path d="M12 3.5a1.3 1.3 0 0 1 1.3 1.3v.5a5.5 5.5 0 0 1 4.2 5.3V15l2 2.5H4.5l2-2.5v-4.4a5.5 5.5 0 0 1 4.2-5.3v-.5A1.3 1.3 0 0 1 12 3.5Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    drum: '<ellipse cx="12" cy="9" rx="7" ry="2.5"/><path d="M5 9v7.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V9"/><path d="M5.5 11 9 18.8M18.5 11 15 18.8M12 11.5V19"/><path d="M14.5 2.5 17.5 6.5M9.5 2.5 6.5 6.5"/>',
    banner: '<path d="M5 21.5V2.5"/><path d="M5 4h13l-3 4.5 3 4.5H5"/>',
    horn: '<path d="M3.5 10v4h3l7 5V5l-7 5Z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    hourglass: '<path d="M6.5 3h11M6.5 21h11"/><path d="M7.5 3c0 4 4.5 6 4.5 9s-4.5 5-4.5 9M16.5 3c0 4-4.5 6-4.5 9s4.5 5 4.5 9"/><path d="M9.5 18.5h5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/><path d="M12 14.5V17"/>',
    scales: '<path d="M12 3.5v17M8 20.5h8M4.5 6.5h15"/><path d="M6 6.5 3 13a3 3 0 0 0 6 0ZM18 6.5 15 13a3 3 0 0 0 6 0Z"/>',
    tower: '<path d="M6 21V8h12v13M4.5 21h15"/><path d="M6 8V4h2.5v2H11V4h2v2h2.5V4H18v4"/><path d="M10.5 21v-4a1.5 1.5 0 0 1 3 0v4M11.5 11h1"/>',
    tree: '<path d="M12 2.5 6 10h3l-4 6h14l-4-6h3Z"/><path d="M12 16v5.5"/>',
    cloud: '<path d="M7 18.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1.2 4.5 4.5 0 0 1 .4 9.2Z"/>',
    storm: '<path d="M7 14.5a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.6-1 4 4 0 0 1 .3 8Z"/><path d="M8 17.5l-1 3M12 17.5l-1 3M16 17.5l-1 3"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5l-5.4 3 1.2-6L3.3 9.3l6.1-.7Z"/>',
    lotus: '<path d="M12 4.5c2 2.5 3 5 3 7.5s-1.3 4.5-3 6c-1.7-1.5-3-3.5-3-6s1-5 3-7.5Z"/><path d="M9.2 9.8C6.5 8.8 4 9 2.5 9.5c.5 4 3 7.5 9.5 8.5M14.8 9.8c2.7-1 5.2-.8 6.7-.3-.5 4-3 7.5-9.5 8.5"/><path d="M5 20.5h14"/>',
    taiji: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a4.25 4.25 0 0 1 0 8.5 4.25 4.25 0 0 0 0 8.5"/><circle cx="12" cy="7.75" r="1"/><circle cx="12" cy="16.25" r="1"/>',
    fan: '<path d="M12 20.5 3.5 12A12 12 0 0 1 20.5 12Z"/><path d="M12 20.5 7.4 9.4M12 20.5V8.5M12 20.5 16.6 9.4M8.5 17A5 5 0 0 1 15.5 17"/>',
    mask: '<path d="M4 5.5c5 1.5 11 1.5 16 0 .5 7-3 13-8 14-5-1-8.5-7-8-14Z"/><path d="M7.5 10.5c1-.8 2.5-.8 3.5 0M13 10.5c1-.8 2.5-.8 3.5 0M9.5 15c1.6 1 3.4 1 5 0"/>',
    magnet: '<path d="M5 4v9a7 7 0 0 0 14 0V4h-4v9a3 3 0 0 1-6 0V4Z"/><path d="M5 7.5h4M15 7.5h4"/>',
    orb: '<circle cx="12" cy="10.5" r="7"/><path d="M7.5 21h9l-1.5-3.5h-6Z"/><path d="M9 8a3.5 3.5 0 0 1 3-2"/>',
    palm: '<path d="M8 13V5.5a1.25 1.25 0 0 1 2.5 0V11M10.5 11V4a1.25 1.25 0 0 1 2.5 0v7M13 11V5a1.25 1.25 0 0 1 2.5 0v7M15.5 12V7.5a1.25 1.25 0 0 1 2.5 0V14c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2.3-4c-.5-1 .3-2 1.3-1.8.6.1 1 .5 1.5 1.3L8 15"/>',
    anchor: '<circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V21M8 10h8"/><path d="M4.5 13.5c0 4 3.5 7.5 7.5 7.5s7.5-3.5 7.5-7.5"/><path d="M3 15l1.5-1.5L6 15M18 15l1.5-1.5L21 15"/>',
    fang: '<path d="M3 6c3 2 15 2 18 0"/><path d="M6.5 7.3c.3 4 1.3 7.5 2.5 9.5 1.2-2 1.7-5.5 1.8-9M17.5 7.3c-.3 4-1.3 7.5-2.5 9.5-1.2-2-1.7-5.5-1.8-9"/>',
    blood: '<path d="M10 3c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10Z"/><path d="M18.5 12c1.2 1.5 2 2.6 2 3.6a2 2 0 0 1-4 0c0-1 .8-2.1 2-3.6Z"/><path d="M7.5 14a2.5 2.5 0 0 0 2 2.5"/>',
    ghost: '<path d="M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5l-2.2-1.6-2.1 1.6-2.2-1.6-2.2 1.6-2.1-1.6Z"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/>',
    cracked: '<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6Z"/><path d="M12.5 3.5 10.5 9l3 2.5-2.5 4 1 5"/>',
    whip: '<path d="M3.5 20.5l4-4"/><path d="M6.2 15.2l2.6 2.6"/><path d="M7.5 16.5c2.5-2.5 1.5-6.5 5-8.5s6.5 0 7-3.5"/><path d="M19.5 4.5l1.5-1"/>',
    web: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/><path d="M12 6.5 15.9 8.1 17.5 12 15.9 15.9 12 17.5 8.1 15.9 6.5 12 8.1 8.1Z"/><path d="M12 9.5 13.8 10.2 14.5 12 13.8 13.8 12 14.5 10.2 13.8 9.5 12 10.2 10.2Z"/>',
    recycle: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.8 3.5v3.6h-3.6M6.2 20.5v-3.6h3.6"/>',
});

// 纹样表：pools 为卡名没命中时回退用的卡牌类型；words 为卡名单字（命中一字 5 分）；phrases 为卡名词（命中一词再加 10 分）；tags 为效果标签权重（标签见 effectTags）。
const m = (key, pools, words, tags, phrases = []) => ({ key, pools: pools.split(' '), words, phrases, tags });
const MOTIFS = Object.freeze([
    m('blade', 'attack', '剑斩刀劈砍锋刃', { damage: 1 }, ['剑气', '拔刀', '居合', '一闪', '斩击']),
    m('dagger', 'attack', '匕刺暗影袭隐', { damage: 1, weak: 1 }),
    m('bow', 'attack', '弓箭射矢弩狙', { damage: 1, random: 2 }),
    m('fist', 'attack', '拳打击撞冲', { damage: 1 }, ['打击', '重拳', '冲拳']),
    m('claw', 'attack', '爪撕裂抓咬', { damage: 1, multi: 3 }),
    m('spear', 'attack', '枪矛戟突贯穿', { damage: 1, vulnerable: 2 }),
    m('hammer', 'attack', '锤槌砸轰震崩', { damage: 1, heavy: 3, 'damage-from-block': 4 }),
    m('bolt', 'attack', '雷电霆', { damage: 1, x: 2 }, ['雷霆', '闪电', '雷击', '激光']),
    m('flame', 'attack power', '火焰炎焚燃烈灼', { damage: 1, aoe: 1, strength: 1 }),
    m('burst', 'attack', '爆乱连狂', { aoe: 2, multi: 2 }),
    m('whirl', 'attack', '旋风扫舞卷', { damage: 1, aoe: 2, x: 2 }),
    m('frost', 'attack skill', '冰霜雪寒冻', { weak: 2 }, ['冰封', '霜冻']),
    m('echo', 'attack skill', '响鸣再续叠', { 'repeat-last': 6, 'replay-next': 6 }),
    m('surge', 'attack power', '怒升涨势愈', { grow: 6, strength: 1 }),
    m('shard', 'attack', '碎片晶', {}),
    m('comet', 'attack skill', '光芒彗', { damage: 1, energy: 1 }, ['流光', '流星', '彗星', '星光', '光芒']),
    m('ward', 'skill', '盾护守卫甲御防挡', { block: 3 }, ['防御', '格挡', '护盾', '守护']),
    m('wall', 'skill power', '墙壁垒城坚岩', { block: 3, 'double:block': 4 }),
    m('talisman', 'skill', '符咒札印封', { cleanse: 2 }),
    m('potion', 'skill', '药剂疗治饮泉补愈', { heal: 3, 'heal-pct': 3, regen: 2 }, ['回复', '回血', '治疗', '治愈']),
    m('book', 'skill', '书卷典读识谋策算思悟智学', { draw: 3 }),
    m('spark', 'skill', '灵闪念感悟', { draw: 1, energy: 1 }),
    m('charge', 'skill', '气力能蓄聚充息', { energy: 3, 'next-turn:energy': 3, strength: 1 }),
    m('scatter', 'skill', '弃抛散舍洗换筛', { discard: 4, 'discard-hand': 5 }),
    m('mirror', 'skill', '镜映仿拟双分幻', { copy: 6 }),
    m('anvil', 'skill', '锻造铸炼工匠召唤', { create: 6 }),
    m('feather', 'skill', '轻羽迅疾快速捷', { 'cost-mod': 6, 'hand-cost': 5 }),
    m('clock', 'skill power', '时刻待漏缓延留备', { 'next-turn': 3, 'next-turn:draw': 3, retain: 4, buff: 3 }),
    m('vial', 'skill', '毒瘴蛊腐酸', { poison: 5 }),
    m('spiral', 'skill', '惑乱眩晕迷扰', { vulnerable: 3, weak: 3 }),
    m('drop', 'skill', '净清涤洁', { cleanse: 5 }),
    m('step', 'skill', '避躲步遁跃移', { intangible: 5, dexterity: 3 }, ['闪避', '闪身', '身法']),
    m('crown', 'power', '王冠帝君霸尊', { strength: 4 }),
    m('sun', 'power', '日阳辉耀晨曦', { 'each-turn': 3 }, ['太阳', '朝阳', '烈日']),
    m('gem', 'power', '宝晶钻玉珠石', { energy: 4 }),
    m('eye', 'power', '眼瞳视察觉洞', { draw: 4 }),
    m('rune', 'power', '阵纹法术咒誓魔', { 'each-turn': 3, buff: 3 }),
    m('sprout', 'power', '花木生芽春叶', { regen: 5, heal: 2 }),
    m('thorn', 'power', '棘荆刺藤蔓', { thorns: 6 }),
    m('moon', 'power', '月夜影幽', { dexterity: 4, intangible: 3 }, ['月光', '月影']),
    m('heart', 'power', '心爱情念魂', { endure: 5, 'heal-pct': 3 }),
    m('mountain', 'power', '山岳磐镇稳', { block: 3, endure: 3 }),
    m('wave', 'power', '潮浪波流涌', { 'each-turn': 2, double: 3 }),
    m('axe', 'attack', '斧钺', { damage: 1, heavy: 2 }, ['战斧', '巨斧', '开山']),
    m('scythe', 'attack', '镰', { damage: 1, aoe: 1 }, ['镰刀', '收割', '死神']),
    m('chain', 'attack skill', '链索锢', { damage: 1, 'no-draw': 3 }, ['锁链', '铁链']),
    m('shuriken', 'attack', '镖', { damage: 1, random: 1, multi: 1 }, ['手里剑', '飞镖', '暗器']),
    m('skull', 'attack power', '骷髅骨死', { damage: 1, vulnerable: 1 }, ['骷髅', '亡灵', '死亡']),
    m('bomb', 'attack', '炸', { damage: 1, aoe: 2 }, ['炸弹', '爆破', '引爆', '炸裂']),
    m('serpent', 'attack skill', '蛇蟒龙蛟', { damage: 1, poison: 3 }, ['毒蛇', '龙息', '游龙', '神龙']),
    m('paw', 'attack power', '虎豹狼熊兽', { damage: 1, strength: 2 }, ['猛兽', '兽王', '虎啸']),
    m('wing', 'skill power', '翼翅飞翔', { dexterity: 2, intangible: 1, draw: 1 }, ['羽翼', '展翅', '飞翔']),
    m('crescent', 'attack', '弧', { damage: 1, aoe: 1 }, ['月牙', '新月', '残月', '弧光', '月轮']),
    m('boot', 'attack skill', '踢腿蹴', { damage: 1, weak: 1 }, ['飞踢', '回旋踢', '扫腿', '踢击']),
    m('bell', 'skill power', '钟铃铎', { 'each-turn': 2, weak: 1 }, ['警钟', '晨钟', '丧钟', '铃音']),
    m('drum', 'skill power', '鼓', { allies: 3, strength: 1 }, ['战鼓', '擂鼓', '鼓舞']),
    m('banner', 'skill power', '旗帜令', { allies: 3, strength: 2 }, ['战旗', '军旗', '号令']),
    m('horn', 'skill power', '吼啸咆嚎喝号', { weak: 2, vulnerable: 1 }, ['怒吼', '战吼', '咆哮', '号角']),
    m('hourglass', 'skill power', '沙', { 'next-turn': 2, retain: 2 }, ['沙漏', '时沙', '流沙']),
    m('lock', 'skill', '锁禁困缚束', { 'no-draw': 4, weak: 1 }, ['封锁', '束缚', '禁锢', '枷锁']),
    m('scales', 'skill power', '衡秤', { 'damage-from-block': 3, double: 2 }, ['天平', '平衡', '审判']),
    m('tower', 'skill power', '塔堡楼', { block: 2, endure: 2 }, ['高塔', '塔楼', '堡垒', '要塞']),
    m('tree', 'power', '树林森松', { regen: 3, block: 1 }, ['古树', '森林', '巨木', '世界树']),
    m('cloud', 'skill power', '云雾烟', { intangible: 2, weak: 1 }, ['迷雾', '云雾', '烟幕', '腾云']),
    m('storm', 'attack skill', '暴雨', { aoe: 1, random: 2, multi: 1 }, ['暴风雨', '风暴', '雷雨']),
    m('star', 'skill power', '星辰', { draw: 2, energy: 1 }, ['星辰', '群星', '星座', '繁星', '北斗']),
    m('lotus', 'skill power', '莲荷', { cleanse: 3, heal: 2 }, ['莲花', '红莲', '净莲']),
    m('taiji', 'skill power', '仪卦', { double: 3, block: 1 }, ['太极', '阴阳', '两仪', '乾坤', '八卦']),
    m('fan', 'attack skill', '扇', { aoe: 2, weak: 1, discard: 1 }, ['羽扇', '铁扇', '折扇']),
    m('mask', 'skill', '假伪具', { copy: 3, weak: 1 }, ['面具', '伪装', '假面', '变脸']),
    m('magnet', 'skill', '磁吸引', { draw: 2, copy: 2 }, ['磁力', '吸引', '引力']),
    m('orb', 'skill power', '占卜兆', { draw: 2, 'next-turn:draw': 2 }, ['预知', '占卜', '先知', '预言', '水晶球']),
    m('palm', 'attack skill', '掌止阻拦', { damage: 1, weak: 1, block: 1 }, ['掌心', '推掌', '掌风', '掌击', '手掌']),
    m('anchor', 'skill power', '锚沉', { retain: 3, endure: 2, block: 1 }, ['铁锚', '沉锚', '定锚']),
    m('fang', 'attack', '牙獠噬齿', { damage: 1, heal: 2 }, ['狼牙', '獠牙', '毒牙', '利齿']),
    m('blood', 'attack skill power', '血', { 'self-damage': 3, heal: 1 }, ['吸血', '鲜血', '血祭', '嗜血', '血誓']),
    m('ghost', 'skill power', '鬼魄怨', { intangible: 3, weak: 1 }, ['幽灵', '亡魂', '鬼影', '怨灵', '魂魄']),
    m('cracked', 'attack skill', '破', { vulnerable: 2, damage: 1 }, ['破甲', '破防', '碎甲', '破盾', '裂甲']),
    m('whip', 'attack', '鞭', { damage: 1, multi: 1, weak: 1 }, ['长鞭', '鞭挞', '软鞭']),
    m('web', 'skill power', '网蛛', { weak: 2, vulnerable: 2 }, ['蛛网', '罗网', '天网', '蛛丝']),
    m('recycle', 'skill power', '轮循', { 'discard-hand': 3, draw: 1 }, ['轮回', '循环', '回收', '周而复始']),
    m('allies', 'skill power', '盟援协伴友众', { allies: 4 }, ['援护', '同心', '协力', '并肩', '同伴']),
    m('rewind', 'skill', '溯逆倒', { 'repeat-last': 4, 'replay-next': 2 }, ['回溯', '逆转', '倒流', '时光倒流']),
    m('seek', 'skill', '寻搜查探', { draw: 2 }, ['搜寻', '探查', '寻觅', '探索']),
    m('duel', 'attack', '决', { damage: 1, vulnerable: 1 }, ['决斗', '对决', '交锋', '比武', '决战']),
    m('key', 'skill', '钥匙', { cleanse: 3, energy: 1 }, ['钥匙', '解锁', '开启', '秘钥']),
    m('lantern', 'skill power', '灯笼', { draw: 1, 'each-turn': 1 }, ['灯笼', '明灯', '提灯', '灯火']),
    m('candle', 'skill power', '烛蜡', { heal: 1, 'each-turn': 1 }, ['蜡烛', '烛火', '烛光']),
    m('compass', 'skill', '罗盘', { draw: 1, 'next-turn:draw': 2 }, ['罗盘', '指南', '方向', '指引']),
    m('dice', 'skill', '骰赌运', { random: 3 }, ['骰子', '赌徒', '命运', '好运', '运气', '赌命']),
    m('umbrella', 'skill', '伞遮庇荫', { block: 2, allies: 2 }, ['雨伞', '伞盾', '庇护', '荫蔽']),
    m('ring', 'power', '戒', { buff: 2, strength: 1 }, ['戒指', '指环', '誓约', '婚戒']),
    m('gift', 'skill', '礼赠馈', { create: 3, allies: 1 }, ['礼物', '赠礼', '馈赠']),
    m('chest', 'skill power', '箱匣柜藏', { create: 2, retain: 2 }, ['宝箱', '宝藏', '秘藏']),
    m('coin', 'skill power', '金钱币银财', { energy: 2, strength: 1 }, ['金币', '钱袋', '财宝', '铜钱']),
    m('quill', 'skill', '笔墨写绘画', { copy: 2, draw: 1 }, ['书写', '绘卷', '泼墨', '笔锋']),
    m('cup', 'skill power', '酒杯盏', { heal: 1, strength: 1 }, ['美酒', '酒杯', '豪饮', '醉意']),
    m('pill', 'skill', '丹丸', { heal: 2, regen: 2 }, ['丹药', '灵丹', '仙丹', '药丸']),
    m('satchel', 'skill', '袋囊包', { draw: 1, retain: 2, create: 1 }, ['行囊', '锦囊', '背包', '百宝袋']),
    m('map', 'skill', '图舆', { draw: 1, 'next-turn:draw': 1 }, ['地图', '舆图', '藏宝图']),
    m('wrench', 'skill', '修缮扳', { block: 1, 'cost-mod': 2 }, ['修补', '修理', '维修', '扳手']),
]);

// 效果标签：首个效果权重 2，其余效果与嵌套效果沿用外层权重；被弃时效果权重 1。
function effectTags(card) {
    const tags = new Map();
    const add = (k, w) => tags.set(k, (tags.get(k) || 0) + w);
    const walk = (list, base, first) => {
        let lead = first;
        for (const e of Array.isArray(list) ? list : []) {
            if (!e || e.op === 'exhaust-self') continue;
            const w = lead ? base * 2 : base;
            lead = false;
            add(e.op, w);
            if (e.status) add(e.status, w);
            if (e.target === 'all-enemies') add('aoe', w);
            if (e.target === 'random-enemy') add('random', w);
            if (e.target === 'all-allies' || e.target === 'other-allies' || e.target === 'ally') add('allies', w);
            if (e.hits > 1) add('multi', w);
            if (e.strengthScale > 1) add('heavy', w);
            if (e.op === 'double') add(`double:${e.stat}`, w);
            if (e.op === 'next-turn' && e.gain) add(`next-turn:${e.gain}`, w);
            if (Array.isArray(e.then)) walk(e.then, w, false);
        }
    };
    walk(card?.effects, 1, true);
    walk(card?.onDiscard, 1, false);
    if (card?.cost === 'X') add('x', 2);
    if (card?.retain) add('retain', 2);
    return tags;
}

// 卡名得分：命中一个字 5 分，命中一个词再加 10 分。
function nameScore(motif, name) {
    let s = 0;
    for (const ch of motif.words) if (name.includes(ch)) s += 5;
    for (const w of motif.phrases) if (name.includes(w)) s += 10;
    return s;
}

function effectScore(motif, tags) {
    let s = 0;
    for (const [k, w] of Object.entries(motif.tags)) s += (tags.get(k) || 0) * w;
    return s;
}

// 取得分最高的一组（同分全部保留）。
function best(list, scoreOf) {
    let top = -1;
    let out = [];
    for (const x of list) {
        const s = scoreOf(x);
        if (s > top) { top = s; out = [x]; } else if (s === top) out.push(x);
    }
    return { top, out };
}

const POOLS = new Set(['attack', 'skill', 'power']);
// 生成牌（create）按模板 ID 固定纹样；复制牌沿用原卡 ID，与原卡同一纹样。
const TOKEN_MOTIF = Object.freeze({ 'token-shard': 'shard', 'token-ward': 'talisman', 'token-spark': 'spark' });

// 选纹样：先按卡名在全部纹样里比（不受牌型限制，如攻击牌「流光」照名字配流光纹样），同分再比效果结构；
// 卡名一个字都没命中时才在本类型的纹样里按效果结构比（未知类型在全部纹样里比）。仍同分按卡牌 ID（没有时用卡名）的哈希取一张。
export function cardMotifKey(card) {
    if (Object.hasOwn(TOKEN_MOTIF, String(card?.id ?? ''))) return TOKEN_MOTIF[card.id];
    const name = String(card?.name ?? '');
    const tags = effectTags(card);
    const named = best(MOTIFS, (x) => nameScore(x, name));
    const pool = named.top > 0 ? named.out
        : POOLS.has(card?.type) ? MOTIFS.filter((x) => x.pools.includes(card.type)) : MOTIFS;
    const { out } = best(pool, (x) => effectScore(x, tags));
    return out.length ? out[hash32(String(card?.id ?? name)) % out.length].key : 'card';
}

// 纹样表里的全部纹样键（结构校验与总览用）。
export const CARD_MOTIF_KEYS = Object.freeze(MOTIFS.map((x) => x.key));

// 按纹样键出图，未知键返回空串。temp：本场临时牌（生成或复制），同一纹样画两层，错位淡化的残影 + 虚线主体。
export function cardMotifSvgByKey(key, temp = false) {
    const body = Object.hasOwn(BODY, key) ? BODY[key] : '';
    if (!body) return '';
    if (!temp) return lineIconSvg(body);
    return lineIconSvg(`<g opacity=".35" transform="translate(1.6 -1.6)">${body}</g><g stroke-dasharray="2.2 1.6">${body}</g>`);
}

export function cardMotifSvg(card) {
    const temp = Boolean(card?.temp);
    return cardMotifSvgByKey(cardMotifKey(card), temp) || cardMotifSvgByKey('card', temp);
}



