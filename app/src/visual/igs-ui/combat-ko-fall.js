// 战斗面板敌人倒下的两种姿态：非登记角色「颤抖着倒下」（先短促颤抖，再下沉、变灰变暗），登记角色「踉跄后仰，垂头跪落」（不颤抖，更克制）。
// 只用立绘本身的 translate / rotate / scale / filter / opacity 复刻，不加贴片、剪影或色块；样式在本文件的 COMBAT_KO_FALL_STYLE_TEXT（手写，不进设计稿生成的皮肤样式）。
// 作用在敌方单位的立绘容器（.art / .igs-combat-portrait / 图片的父节点）；挑战难关没有 .art 时落到头像容器，再没有就只做变灰变暗。
// 减少动态效果只留终态：由 combat-panel 在 reduced() 时不调用 playKoFall，终态由下面的静态规则（.is-down）给出。
export const KO_FALL_TREMBLE_MS = 1100;
export const KO_FALL_YIELD_MS = 1300;
// 命中受击反馈（COMBAT_HIT_REACT_MS）放完才开始位移，免得两段动画抢同一个元素。
export const KO_FALL_MOTION_DELAY_MS = 460;
// 倒地声比命中音晚一点，避免两声叠在一起。
export const KO_FALL_SFX_DELAY_MS = 150;

export const KO_FALL_KINDS = Object.freeze(['tremble', 'yield']);
export const koFallSfx = (kind) => (kind === 'yield' ? 'battle-ko-yield' : 'battle-ko-tremble');
export const koFallMs = (kind) => (kind === 'yield' ? KO_FALL_YIELD_MS : KO_FALL_TREMBLE_MS);

// 登记判定：
//  1. 宿主给了 isRegisteredCharacter(name)（素材库有 DNA / 立绘 / 衣柜 / 别名登记，战斗临时档 creature.temp 不算）时以它为准；
//  2. 否则正文写了战斗台词（lines）的单位算登记（有名有姓才会被写）；
//  3. 日常挑战里的「对方」（start.counterpart，有名字的人）算登记；
//  4. 其余（战斗里的怪物、杂兵、无名对手）为非登记。
export function koFallKind(name, { isRegistered = null, lineNames = null, counterpart = '', candidates = null } = {}) {
    const names = Array.isArray(candidates) && candidates.length ? candidates : [String(name || '')];
    if (typeof isRegistered === 'function') {
        try { if (names.some((n) => n && isRegistered(n) === true)) return 'yield'; } catch (error) { /* 宿主判定失败按未登记 */ }
    }
    if (lineNames && names.some((n) => lineNames.has(n))) return 'yield';
    if (counterpart && names.includes(String(counterpart))) return 'yield';
    return 'tremble';
}

// 单位块里承载倒下动作的元素：画布皮肤的 .art，初始方案的立绘容器，再退到含图片的父节点；都没有返回 null。
export function koFallBody(unitEl) {
    if (!unitEl?.querySelector) return null;
    const direct = unitEl.querySelector('.art') || unitEl.querySelector('.igs-combat-portrait');
    if (direct) return direct;
    const img = unitEl.querySelector('img,svg');
    return img?.parentElement && img.parentElement !== unitEl ? img.parentElement : null;
}

// 播放倒下姿态：unitEl 由调用方在当下取（重绘后旧节点会被换掉）。
// 先去掉再补回 is-down 并强制一次样式计算，让「变灰变暗」的过渡从倒下前的样子开始走；位移在受击反馈放完后才起。
export function playKoFall(unitEl, kind, { schedule = null } = {}) {
    if (!unitEl?.setAttribute || !KO_FALL_KINDS.includes(kind)) return false;
    const down = unitEl.classList?.contains('is-down');
    if (down) unitEl.classList.remove('is-down');
    unitEl.setAttribute('data-igs-ko-tone', kind);
    void unitEl.offsetWidth;
    if (down) unitEl.classList.add('is-down');
    const body = koFallBody(unitEl);
    if (body) {
        const start = () => {
            if (unitEl.getAttribute('data-igs-ko-tone') === kind && unitEl.classList.contains('is-down')) unitEl.setAttribute('data-igs-ko-move', kind);
        };
        if (typeof schedule === 'function') schedule(start, KO_FALL_MOTION_DELAY_MS); else start();
        if (typeof schedule === 'function') schedule(() => { unitEl.removeAttribute('data-igs-ko-move'); }, KO_FALL_MOTION_DELAY_MS + koFallMs(kind) + 60);
    }
    return true;
}

const C = '#igs-combat-panel';
const U = `${C} :is(.igs-combat-unit,.cx-unit)[data-side="enemy"]`;
const BODY = ':is(.art,.igs-combat-portrait)';
// 终态与动画末帧一致（下沉 6%、微缩、略前倾），重绘后动画类掉了也不会弹回。
const REST = 'translate:0 6%;scale:.97;rotate:3deg;';

export const COMBAT_KO_FALL_STYLE_TEXT = `
${U}.is-down ${BODY}{${REST}transform-origin:50% 100%;filter:brightness(.72);}
${U}[data-igs-ko-tone]{transition:opacity 520ms ease-out,filter 520ms ease-out;}
${U}[data-igs-ko-tone] ${BODY}{transition:filter 520ms ease-out;}
${U}[data-igs-ko-move="tremble"] ${BODY}{animation:igs-ko-tremble ${KO_FALL_TREMBLE_MS}ms cubic-bezier(.4,.1,.5,1) both;transform-origin:50% 100%;}
${U}[data-igs-ko-move="yield"] ${BODY}{animation:igs-ko-yield ${KO_FALL_YIELD_MS}ms cubic-bezier(.3,.2,.4,1) both;transform-origin:50% 100%;}
@keyframes igs-ko-tremble{
0%{translate:0 0;rotate:0deg;scale:1;}
8%{translate:-2.5% 0;rotate:-1.2deg;}16%{translate:2.5% 0;rotate:1.2deg;}24%{translate:-2.2% 0;rotate:-1deg;}
32%{translate:2% 0;rotate:1deg;}40%{translate:-1.4% 0;rotate:-.6deg;}48%{translate:1.2% 0;rotate:.6deg;scale:.995;}
60%{translate:0 1.5%;rotate:1deg;scale:.99;}
100%{translate:0 6%;rotate:3deg;scale:.97;}}
@keyframes igs-ko-yield{
0%{translate:0 0;rotate:0deg;scale:1;}
24%{translate:-1.5% -1%;rotate:-3.5deg;scale:1.005;}
46%{translate:-1% -.5%;rotate:-2.5deg;}
74%{translate:0 3.5%;rotate:2deg;scale:.98;}
100%{translate:0 6%;rotate:3deg;scale:.97;}}
@media (prefers-reduced-motion:reduce){
${U}[data-igs-ko-move] ${BODY}{animation:none;}
${U}[data-igs-ko-tone],${U}[data-igs-ko-tone] ${BODY}{transition:none;}}
`;
