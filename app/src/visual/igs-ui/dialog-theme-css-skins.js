import { buildDialogFrameCss, scalePx, stroke } from './dialog-skin-frame.js';

export const DIALOG_SKIN_DAY_MINIMAL = 'day-minimal';
export const DIALOG_SKIN_WARM_PICTUREBOOK = 'warm-picturebook';
export const DIALOG_SKIN_ELEGANT_EUROPEAN = 'elegant-european';
export const DIALOG_SKIN_MAGIC_ACADEMY = 'magic-academy';

export const CSS_DIALOG_SKINS = Object.freeze([
    DIALOG_SKIN_DAY_MINIMAL,
    DIALOG_SKIN_WARM_PICTUREBOOK,
    DIALOG_SKIN_ELEGANT_EUROPEAN,
    DIALOG_SKIN_MAGIC_ACADEMY,
]);

const ELEGANT_BAND = '__IGS_ASSET__elegant-european/dialog.png__';

function scope(skin) {
    return `#igs-overlay .igs-dialog[data-igs-dialog-skin="${skin}"]`;
}

const NO_CHROME = 'border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;';
const NAME_TEXT = 'width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// 日间简约：还原作者 frame_message 的深色渐隐名条 + ××× 标记，正文底为半透明白。
const DAY_MINIMAL_BAR = 32;
const dayMinimal = [
    buildDialogFrameCss(DIALOG_SKIN_DAY_MINIMAL, {
        height: 172,
        text: { top: 46, speakerTop: 46, right: 56, bottom: 22, left: 64 },
        rise: 0,
        flush: true,
        frameCss: `background-color:transparent;background-image:linear-gradient(90deg,#333 0,#383835 22%,#5f5e53 34%,rgba(150,149,130,.82) 46%,rgba(205,203,188,.45) 58%,rgba(255,255,255,0) 68%),linear-gradient(180deg,rgba(255,255,255,.8),rgba(250,249,244,.86));background-position:left top,left ${DAY_MINIMAL_BAR}px;background-size:100% ${DAY_MINIMAL_BAR}px,100% calc(100% - ${DAY_MINIMAL_BAR}px);background-repeat:no-repeat;${NO_CHROME}-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);`,
        speakerCss: `left:64px;top:0;${NAME_TEXT}max-width:calc(60% - 64px);height:${DAY_MINIMAL_BAR}px;line-height:${DAY_MINIMAL_BAR}px;padding:0;background:none;border:0;font-size:16px;letter-spacing:.14em;text-shadow:0 1px 2px rgba(0,0,0,.45);`,
        textCss: 'letter-spacing:.06em;text-shadow:0 1px 0 rgba(255,255,255,.8);',
    }),
    scalePx(`${scope(DIALOG_SKIN_DAY_MINIMAL)}::before{content:"\\00d7\\00d7\\00d7";position:absolute;left:18px;top:0;height:${DAY_MINIMAL_BAR}px;line-height:${DAY_MINIMAL_BAR}px;font:15px/${DAY_MINIMAL_BAR}px "Microsoft YaHei",sans-serif;letter-spacing:1px;background:linear-gradient(90deg,#e0826c 0 33.3%,#ebe5d0 33.3% 66.6%,#b9c4a2 66.6%);-webkit-background-clip:text;background-clip:text;color:transparent;pointer-events:none;}`),
    scalePx(`${scope(DIALOG_SKIN_DAY_MINIMAL)}::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,rgba(120,118,104,.5),rgba(120,118,104,.15));pointer-events:none;}`),
].join('\n');

// 温暖绘本：作者的异形姓名牌是「斜纹胶囊 + 断开的外描边」，用 CSS 重建，避免拉伸素材让斜纹变形。
// 外描边画在 ::after 上，靠 overflow:clip + overflow-clip-margin 露出牌外；不支持的浏览器只丢描边。
const WARM_INK = '#4f4a45';
const WARM_PAPER = '#f1ede9';
const warmPicturebook = [
    buildDialogFrameCss(DIALOG_SKIN_WARM_PICTUREBOOK, {
        height: 176,
        text: { top: 28, speakerTop: 36, right: 44, bottom: 26, left: 44 },
        rise: 22,
        frameCss: `background:${WARM_PAPER};border:2px solid ${WARM_INK};border-radius:14px;box-shadow:inset 0 -12px 0 #55514b,0 2px 0 rgba(79,74,69,.18);-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:34px;top:-22px;${NAME_TEXT}overflow:clip;overflow-clip-margin:8px;min-width:210px;max-width:calc(100% - 68px);height:44px;line-height:44px;padding:0 42px 0 58px;background:repeating-linear-gradient(135deg,#5b5650 0 5px,${WARM_INK} 5px 10px);border:0;border-radius:22px;box-shadow:0 0 0 3px ${WARM_PAPER};font-size:17px;font-weight:500;letter-spacing:.16em;text-shadow:0 1px 0 #2f2b27,0 0 3px rgba(47,43,39,.6);`,
        textCss: 'letter-spacing:.05em;text-shadow:0 1px 0 rgba(255,255,255,.6);',
    }),
    scalePx(`${scope(DIALOG_SKIN_WARM_PICTUREBOOK)} .igs-speaker::before{content:"";position:absolute;left:26px;top:50%;width:12px;height:12px;margin-top:-6px;background:linear-gradient(#a6dcd4 0 0) 0 0/5px 5px,linear-gradient(#a6dcd4 0 0) 7px 0/5px 5px,linear-gradient(#a6dcd4 0 0) 0 7px/5px 5px,linear-gradient(#a6dcd4 0 0) 7px 7px/5px 5px;background-repeat:no-repeat;}`),
    scalePx(`${scope(DIALOG_SKIN_WARM_PICTUREBOOK)} .igs-speaker::after{content:"";position:absolute;inset:-6px;border:2px solid ${WARM_INK};border-radius:999px;pointer-events:none;-webkit-mask:linear-gradient(#000 0 0) left top/36% 50% no-repeat,linear-gradient(#000 0 0) right bottom/40% 50% no-repeat,linear-gradient(#000 0 0) right top/30px 100% no-repeat;mask:linear-gradient(#000 0 0) left top/36% 50% no-repeat,linear-gradient(#000 0 0) right bottom/40% 50% no-repeat,linear-gradient(#000 0 0) right top/30px 100% no-repeat;}`),
].join('\n');

// 优雅欧式：作者 frame_message 的通栏黑纱贴合阅读器左右与底边。几何按原图 0.7 缩放：275→192，两道线在 y≈76/168。
// 拼法照作者三切片：中央饰纹（连同穿过它的线段）原样居中不动，两侧细线向外延伸、在两端渐隐；
// 细线不得穿过饰纹，否则会填进花纹之间的空隙。黑纱横向均匀，用一列像素拉满。
const ELEGANT_TOP_LINE = 76;
const ELEGANT_BOTTOM_LINE = 168;
// 饰纹按作者中段切片重描为矢量：位图只有 1px 线稿，高倍屏放大、对话框缩放后会糊成一团。
// 中心菱形镂空 + 内芯，两侧 C 形卷草、叶片与波浪尾；线稿下垫 1px 暗影，亮背景上也托得住。
// 上饰纹的线在 y=12、花纹朝上；下饰纹整体上下翻转，线在 y=6。两端直线与两侧细线同色、不垫暗影，接口无台阶；
// 1px 线心须落在半像素上才与 CSS 细线（占 y..y+1）重合；背景定位按整像素取整，故在 SVG 内整体下移 .5。
const ELEGANT_ORNAMENT = { width: 220, height: 18, topLine: 12, bottomLine: 6 };
const ELEGANT_LINE = 'rgba(255,255,255,.5)';
const ELEGANT_SCROLL_HALF = [
    'M113.4 12H119C123 12 123.4 5 128 5C132 5 133.6 9.6 130.2 10.1C128.2 10.4 127.5 8.1 129.2 7.7',
    'M128 12H146',
    'M134 12Q137.5 7.4 142.4 8.6Q138.6 10.4 134 12Z',
    'M146 12C149.4 12 150 7.2 154 7.2C157 7.2 157.6 10.6 155.1 10.8C153.7 10.9 153.4 9.3 154.5 9.1',
    'M146 12H158C162 12 163 9.4 167 9.4S171 12 175 12C178 12 179 10.6 182 10.6S185 12 188 12',
].join('');
function elegantOrnament(flip) {
    const { width, height } = ELEGANT_ORNAMENT;
    const art = (dot) => `<path d="M110 2L116 9L110 16L104 9Z"/><path d="M110 6.4L112.2 9L110 11.6L107.8 9Z" ${dot}/><circle cx="110" cy=".9" r=".9" ${dot}/><path d="${ELEGANT_SCROLL_HALF}"/><path d="${ELEGANT_SCROLL_HALF}" transform="matrix(-1 0 0 1 220 0)"/>`;
    const turn = flip ? `matrix(1 0 0 -1 0 ${height + 0.5})` : 'translate(0 .5)';
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="${turn}" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#000" stroke-opacity=".45" stroke-width="1.6" transform="translate(0 .8)">${art('fill="#000" fill-opacity=".45" stroke="none"')}</g><g stroke="#fff" stroke-opacity=".82">${art('fill="#fff" fill-opacity=".82" stroke="none"')}</g><path d="M0 12H32M188 12H220" stroke="#fff" stroke-opacity=".5" stroke-linecap="butt"/></g></svg>`);
}
function elegantLines(y) {
    const side = `calc(50% - ${ELEGANT_ORNAMENT.width / 2}px) 1px`;
    return {
        image: `linear-gradient(90deg,rgba(255,255,255,0) 15px,${ELEGANT_LINE} 100px),linear-gradient(270deg,rgba(255,255,255,0) 15px,${ELEGANT_LINE} 100px)`,
        position: `left ${y}px,right ${y}px`,
        size: `${side},${side}`,
    };
}
const ELEGANT_TOP = elegantLines(ELEGANT_TOP_LINE);
const ELEGANT_BOTTOM = elegantLines(ELEGANT_BOTTOM_LINE);
const ELEGANT_ORNAMENT_SIZE = `${ELEGANT_ORNAMENT.width}px ${ELEGANT_ORNAMENT.height}px`;
const elegantEuropean = buildDialogFrameCss(DIALOG_SKIN_ELEGANT_EUROPEAN, {
    height: 192,
    text: { top: 88, speakerTop: 88, right: 72, bottom: 30, left: 72 },
    rise: 0,
    flush: true,
    frameCss: `background-color:transparent;background-image:${elegantOrnament(false)},${elegantOrnament(true)},${ELEGANT_TOP.image},${ELEGANT_BOTTOM.image},url("${ELEGANT_BAND}");background-position:center ${ELEGANT_TOP_LINE - ELEGANT_ORNAMENT.topLine}px,center ${ELEGANT_BOTTOM_LINE - ELEGANT_ORNAMENT.bottomLine}px,${ELEGANT_TOP.position},${ELEGANT_BOTTOM.position},0 0;background-size:${ELEGANT_ORNAMENT_SIZE},${ELEGANT_ORNAMENT_SIZE},${ELEGANT_TOP.size},${ELEGANT_BOTTOM.size},100% 100%;background-repeat:no-repeat;${NO_CHROME}`,
    // 黑纱上的字用 1px 实描边 + 1px 投影托住，不用模糊光晕（光晕会让字边发虚）。
    speakerCss: `left:56px;top:${ELEGANT_TOP_LINE - 36}px;${NAME_TEXT}max-width:calc(100% - 112px);height:32px;line-height:32px;padding:0;background:none;border:0;font-size:22px;font-weight:400;letter-spacing:.06em;text-shadow:${stroke('rgba(0,0,0,.55)')},0 1px 0 rgba(0,0,0,.9);`,
    textCss: `letter-spacing:.06em;text-shadow:${stroke('rgba(0,0,0,.55)')},0 1px 0 rgba(0,0,0,.85);`,
});

// 魔法星夜（id 仍为 magic-academy，已选用户直接换新）：不用实心框，靠透明与星光营造神秘感。
// 通栏薄纱自上而下由全透明渐入暮色，没有硬边；一道银线两端渐隐，正中月牙星徽；
// 线上方留白里放一小组淡星座，四芒星缓慢闪烁（只动透明度，舞台暂停或减少动态时静止）。
// 学院配色只染细线、星徽与薄纱底色（--igs-ma-*，reader-dom-render 写在 #igs-overlay 上），选项与状态栏共用。
export const MAGIC_HOUSES = Object.freeze([
    Object.freeze({ id: 'starlight', label: '星银', metal: '#cfd5f2', hi: '#f3f1ff', veil: '#1b1a44' }),
    Object.freeze({ id: 'scarlet', label: '红金', metal: '#e2c48e', hi: '#ffe4b4', veil: '#36172f' }),
    Object.freeze({ id: 'emerald', label: '绿银', metal: '#c7d6d8', hi: '#ecfaf6', veil: '#0f2b2c' }),
    Object.freeze({ id: 'sapphire', label: '蓝铜', metal: '#d7a87c', hi: '#f6cfa6', veil: '#141d47' }),
    Object.freeze({ id: 'amber', label: '黄黑', metal: '#e6c763', hi: '#fde6a0', veil: '#1f1b15' }),
    // 墨夜：底色近黑、不带蓝紫，装饰默认香槟金，可在设置里改色（readerSettings.magicAccent）。
    Object.freeze({ id: 'obsidian', label: '墨夜', metal: '#d4b98a', hi: '#f3e6c8', veil: '#08080b', custom: true }),
]);
export const MAGIC_ACCENT_DEFAULT = '#d4b98a';
export function normalizeMagicAccent(value) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : MAGIC_ACCENT_DEFAULT;
}
// 高光取装饰色与白色各半，用十六进制写死，@property 补间不必解析 color-mix。
const lighten = (hex) => `#${[1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) + 255) / 2).toString(16).padStart(2, '0')).join('')}`;
export const MAGIC_HOUSE_DEFAULT = 'starlight';
export function normalizeMagicHouse(value) {
    return MAGIC_HOUSES.some((house) => house.id === value) ? value : MAGIC_HOUSE_DEFAULT;
}
export function magicHouseVars(value, accent) {
    const house = MAGIC_HOUSES.find((item) => item.id === normalizeMagicHouse(value));
    if (house.custom && accent) {
        const metal = normalizeMagicAccent(accent);
        return { '--igs-ma-metal': metal, '--igs-ma-hi': lighten(metal), '--igs-ma-veil': house.veil };
    }
    return { '--igs-ma-metal': house.metal, '--igs-ma-hi': house.hi, '--igs-ma-veil': house.veil };
}
export const MAGIC_METAL = 'var(--igs-ma-metal,#cfd5f2)';
export const MAGIC_METAL_HI = 'var(--igs-ma-hi,#f3f1ff)';
export const MAGIC_VEIL = 'var(--igs-ma-veil,#1b1a44)';
export const magicTint = (color, percent) => `color-mix(in srgb,${color} ${percent}%,transparent)`;
export const magicVeil = (percent) => magicTint(MAGIC_VEIL, percent);
// 四芒星笔形（24×24），选项、状态栏等处复用。
export const MAGIC_SPARKLE_PATH = 'M12 0Q13 11 24 12Q13 13 12 24Q11 13 0 12Q11 11 12 0Z';
export const MAGIC_SPARKLE_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${MAGIC_SPARKLE_PATH}"/></svg>`);
const sparkle = (x, y, size, opacity) => `<path d="${MAGIC_SPARKLE_PATH}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})" fill="#fff" fill-opacity="${opacity}"/>`;
const MAGIC_LINE_Y = 46;
const MAGIC_EMBLEM = { width: 64, height: 26 };
// 星徽作遮罩、填学院高光色：月牙开口朝右托住正中的四芒星，右侧两点小星。
const MAGIC_EMBLEM_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="26" viewBox="0 0 64 26"><mask id="m"><rect width="64" height="26" fill="#fff"/><circle cx="21.4" cy="11.6" r="6.4" fill="#000"/></mask><circle cx="18" cy="13" r="7.2" fill="#fff" mask="url(#m)"/>${sparkle(32, 13, 16, 1)}<circle cx="43.5" cy="8.5" r="1.1" fill="#fff"/><circle cx="46.5" cy="16" r=".75" fill="#fff" fill-opacity=".8"/></svg>`);
// 星座：六颗星以极淡的线相连，放在银线上方右侧的留白里。
const MAGIC_CONSTELLATION = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="132" height="36" viewBox="0 0 132 36"><path d="M4 26L30 14L58 20L86 6L124 16M58 20L66 32" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".7"/>${[[4, 26, 1.2], [30, 14, 1.6], [58, 20, 1.3], [86, 6, 1.8], [124, 16, 1.2], [66, 32, 1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity=".75"/>`).join('')}</svg>`);
// 闪烁层：几颗四芒星散在留白与两侧边缘，避开正文。
const MAGIC_TWINKLE = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="184" viewBox="0 0 1000 184" preserveAspectRatio="none">${sparkle(150, 22, 11, 0.9)}${sparkle(352, 30, 7, 0.7)}${sparkle(612, 18, 8, 0.75)}${sparkle(28, 122, 8, 0.6)}${sparkle(974, 98, 9, 0.65)}${sparkle(950, 166, 6, 0.5)}</svg>`);
// 星尘：百分比坐标随框宽铺开，一张 SVG 一层背景，免得多层渐变与 size/position 列表错位。
const MAGIC_DUST = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${[[6, 12, 1], [17, 34, 1.3], [24, 8, 0.8], [33, 40, 1], [46, 14, 1.1], [55, 32, 0.8], [68, 10, 1], [77, 38, 1.2], [93, 22, 0.9], [3, 72, 0.9], [97, 60, 1], [12, 92, 0.8], [88, 86, 0.9], [40, 94, 0.7], [64, 90, 0.8]]
    .map(([x, y, r], i) => `<circle cx="${x}%" cy="${y}%" r="${r}" fill="#f0f0ff" fill-opacity="${i % 3 ? 0.5 : 0.85}"/>`).join('')}</svg>`);
// 薄纱下段偏黑：学院底色先压向近黑再做透明度，只留一层色调，正文底更沉。
const magicVeilDark = (percent, keep) => magicTint(`color-mix(in srgb,${MAGIC_VEIL} ${keep}%,#04040a)`, percent);
const magicHalfLine = (dir) => `linear-gradient(${dir},transparent 3%,${magicTint(MAGIC_METAL, 70)} 34%)`;
const MAGIC_SIDE = `calc(50% - ${MAGIC_EMBLEM.width / 2 + 6}px) 1px`;
const magicAcademy = [
    buildDialogFrameCss(DIALOG_SKIN_MAGIC_ACADEMY, {
        height: 184,
        text: { top: 58, speakerTop: 60, right: 72, bottom: 20, left: 72 },
        rise: 0,
        flush: true,
        frameCss: `background-color:transparent;background-image:${magicHalfLine('90deg')},${magicHalfLine('270deg')},${MAGIC_CONSTELLATION},${MAGIC_DUST},radial-gradient(ellipse 28% 70px at 50% ${MAGIC_LINE_Y}px,${magicTint(MAGIC_METAL, 16)},transparent),linear-gradient(180deg,transparent 0,${magicVeil(28)} ${MAGIC_LINE_Y}px,${magicVeilDark(72, 45)} 62%,${magicVeilDark(94, 30)});background-position:left ${MAGIC_LINE_Y}px,right ${MAGIC_LINE_Y}px,right 56px top 4px,0 0,0 0,0 0;background-size:${MAGIC_SIDE},${MAGIC_SIDE},132px 36px,100% 100%,100% 100%,100% 100%;background-repeat:no-repeat;${NO_CHROME}`,
        speakerCss: `left:56px;top:${MAGIC_LINE_Y - 38}px;${NAME_TEXT}max-width:calc(100% - 112px);height:34px;line-height:34px;padding:0 0 0 24px;background:none;border:0;font-size:21px;font-weight:400;letter-spacing:.1em;text-shadow:${stroke('rgba(8,8,30,.45)')},0 0 12px ${magicTint(MAGIC_METAL_HI, 55)};`,
        textCss: `letter-spacing:.06em;text-shadow:${stroke('rgba(8,8,30,.4)')},0 1px 2px rgba(6,6,24,.85);`,
    }),
    scalePx(`${scope(DIALOG_SKIN_MAGIC_ACADEMY)} .igs-speaker::before{content:"";position:absolute;left:2px;top:50%;width:13px;height:13px;margin-top:-7px;background:${MAGIC_METAL_HI};-webkit-mask:${MAGIC_SPARKLE_MASK} center/contain no-repeat;mask:${MAGIC_SPARKLE_MASK} center/contain no-repeat;filter:drop-shadow(0 0 3px ${magicTint(MAGIC_METAL_HI, 80)});}`),
    scalePx(`${scope(DIALOG_SKIN_MAGIC_ACADEMY)}::after{content:"";position:absolute;left:50%;top:${MAGIC_LINE_Y - MAGIC_EMBLEM.height / 2}px;width:${MAGIC_EMBLEM.width}px;height:${MAGIC_EMBLEM.height}px;transform:translateX(-50%);background:${MAGIC_METAL_HI};-webkit-mask:${MAGIC_EMBLEM_MASK} center/100% 100% no-repeat;mask:${MAGIC_EMBLEM_MASK} center/100% 100% no-repeat;filter:drop-shadow(0 0 4px ${magicTint(MAGIC_METAL_HI, 75)});pointer-events:none;}`),
    `${scope(DIALOG_SKIN_MAGIC_ACADEMY)}::before{content:"";position:absolute;inset:0;background:${MAGIC_TWINKLE} 0 0/100% 100% no-repeat;pointer-events:none;opacity:.5;animation:igs-ma-twinkle 4.8s ease-in-out infinite alternate;will-change:opacity;}`,
    '@keyframes igs-ma-twinkle{0%{opacity:.25}55%{opacity:.9}100%{opacity:.5}}',
    // 学院色按说话角色切换：注册为颜色属性才能补间，换人时薄纱与细线 0.6s 渐变；不支持 @property 的浏览器直接切换。
    // 同一条 transition 带上 overlay 淡出的 opacity，免得覆盖 .igs-fading。
    ...[['metal', '#cfd5f2'], ['hi', '#f3f1ff'], ['veil', '#1b1a44']].map(([name, initial]) => `@property --igs-ma-${name}{syntax:"<color>";inherits:true;initial-value:${initial};}`),
    `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_MAGIC_ACADEMY}"]{transition:opacity .25s,--igs-ma-metal .6s ease,--igs-ma-hi .6s ease,--igs-ma-veil .6s ease;}`,
    `#igs-overlay[data-igs-paused] .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_MAGIC_ACADEMY}"]::before{animation-play-state:paused;}`,
    `@media (prefers-reduced-motion: reduce){${scope(DIALOG_SKIN_MAGIC_ACADEMY)}::before{animation:none;opacity:.6;}}`,
    // 窄屏左右留白减半，正文多出一两个字宽；姓名随之左移。
    `@media (max-width:640px){${scalePx(`${scope(DIALOG_SKIN_MAGIC_ACADEMY)},${scope(DIALOG_SKIN_MAGIC_ACADEMY)}[data-igs-has-speaker="1"]{padding-left:36px;padding-right:36px;}${scope(DIALOG_SKIN_MAGIC_ACADEMY)} .igs-speaker{left:24px;max-width:calc(100% - 48px);}`)}}`,
].join('\n');

export const CSS_DIALOG_STYLE_BY_SKIN = Object.freeze({
    [DIALOG_SKIN_DAY_MINIMAL]: dayMinimal,
    [DIALOG_SKIN_WARM_PICTUREBOOK]: warmPicturebook,
    [DIALOG_SKIN_ELEGANT_EUROPEAN]: elegantEuropean,
    [DIALOG_SKIN_MAGIC_ACADEMY]: magicAcademy,
});

export const CSS_DIALOG_STYLE_TEXT = Object.values(CSS_DIALOG_STYLE_BY_SKIN).join('\n');
