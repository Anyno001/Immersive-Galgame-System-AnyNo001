// 校园日常演出的构建器：黑板写字 chalk、传纸条 passnote、抽屉里的发现 drawer、点名起立 rollcall、考试发卷 exam、
// 文化祭开场 festival、毕业 / 入学典礼 graduate、第二颗纽扣 button。
// 由 fx-daily.js 并入 BUILDERS；样式见 fx-daily-campus-style.js，音效见 fx-daily-campus-sfx.js，解析见 scene/campus-fx.js。
// 校园里已有的铃声 bell、广播 broadcast、成绩 score、便签 note、信件 letter 沿用既有构建器。
import { esc } from './reader-value-utils.js';
import { drawerKindOf, graduateVariantOf } from '../../scene/campus-fx.js';

// 停留时长（ms）：黑板要留够写完的 2.2s 再停一会儿；传纸条要留够飞行与展开；其余是一段完整的小分镜。
export const CAMPUS_FX_LIFE_MS = Object.freeze({
    chalk: 4800, passnote: 5400, drawer: 4400, rollcall: 3800, exam: 5000, festival: 5000, graduate: 5800, button: 5000,
});
// 板书写完的时间，与 campus-chalk 音效里的笔画长度对齐。
export const CHALK_WRITE_MS = 2200;

function make(doc, className, html = '') {
    const node = doc.createElement('div');
    node.className = className;
    if (html) node.innerHTML = html;
    return node;
}

const life = (kind, env) => Math.round(CAMPUS_FX_LIFE_MS[kind] * (env.hold || 1));

// 确定性的伪随机：同一种演出每次排布一致，不依赖 Math.random，快照与测试都稳定。
function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const CONFETTI_COLORS = Object.freeze(['#ff6b8a', '#ffd66b', '#6bd6ff', '#8cf0a0', '#c79bff', '#ffa86b']);
const PETAL_COLORS = Object.freeze(['#ffd3e0', '#ffc2d4', '#ffe3ec', '#ffb6cb']);

function confetti(count) {
    const rnd = seeded(2024);
    return Array.from({ length: count }, (_, i) => {
        const left = 4 + rnd() * 92;
        const delay = rnd() * 900;
        const dur = 1900 + rnd() * 1500;
        const drift = Math.round((rnd() - 0.5) * 120);
        const spin = Math.round(180 + rnd() * 540);
        const shape = i % 3 === 0 ? ' is-round' : i % 3 === 1 ? ' is-strip' : '';
        return `<i class="igs-dfx-festival-conf${shape}" style="left:${left.toFixed(1)}%;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};animation-delay:${Math.round(delay)}ms;animation-duration:${Math.round(dur)}ms;--igs-drift:${drift}px;--igs-spin:${spin}deg"></i>`;
    }).join('');
}

function petals(count, startDelay = 0) {
    const rnd = seeded(77);
    return Array.from({ length: count }, (_, i) => {
        const left = 2 + rnd() * 96;
        const delay = startDelay + rnd() * 2400;
        const dur = 3200 + rnd() * 2200;
        const size = 9 + Math.round(rnd() * 8);
        const drift = Math.round(30 + rnd() * 110) * (i % 2 ? 1 : -1);
        return `<i class="igs-dfx-graduate-petal" style="left:${left.toFixed(1)}%;width:${size}px;height:${Math.round(size * 0.78)}px;background:${PETAL_COLORS[i % PETAL_COLORS.length]};animation-delay:${Math.round(delay)}ms;animation-duration:${Math.round(dur)}ms;--igs-drift:${drift}px"></i>`;
    }).join('');
}

// 学士帽：菱形帽板 + 帽冠 + 垂下的流苏；三顶，抛起时间错开。
function cap(index) {
    const x = [24, 50, 74][index];
    return `<span class="igs-dfx-graduate-cap is-c${index}" style="left:${x}%"><i class="igs-dfx-graduate-board"></i><i class="igs-dfx-graduate-crown"></i><i class="igs-dfx-graduate-tassel"></i></span>`;
}

// 文化祭的彩旗配色：十二面一串，循环用六种颜色。
const BUNTING_FLAGS = ['#ff6b8a', '#ffd66b', '#6bd6ff', '#8cf0a0', '#c79bff', '#ffa86b', '#ff6b8a', '#ffd66b', '#6bd6ff', '#8cf0a0', '#c79bff', '#ffa86b'];

export const CAMPUS_BUILDERS = {
    // 黑板写字：墨绿的黑板落下，粉笔头沿着一行字一路划过，字迹随笔尖逐字浮现，笔尖扬起一点粉笔灰；底下粉笔槽里躺着几截粉笔。
    chalk(item, env) {
        const text = String(item.text || '');
        const n = Math.max(1, Array.from(text).length);
        const line = text
            ? `<span class="igs-dfx-chalk-line" style="--igs-n:${n}"><span class="igs-dfx-chalk-text">${esc(text)}</span><i class="igs-dfx-chalk-tip"></i><i class="igs-dfx-chalk-puff"></i></span>`
            : '<span class="igs-dfx-chalk-scribble"><i></i><i></i><i></i></span>';
        const node = make(env.doc, 'igs-dfx igs-dfx-chalk', `<div class="igs-dfx-chalk-board"><i class="igs-dfx-chalk-smear"></i>${line}<div class="igs-dfx-chalk-tray"><b></b><b></b><b></b></div></div>`);
        return { layer: 'front', life: life('chalk', env), sounds: ['campus-chalk'], node };
    },
    // 传纸条：折成小方块的纸条在课桌间两次起落，一路滑到画面中央，展开成带横线的纸，上面是歪歪扭扭的字迹。
    passnote(item, env) {
        const node = make(env.doc, 'igs-dfx igs-dfx-passnote', `<div class="igs-dfx-passnote-fly"><i class="igs-dfx-passnote-fold"></i></div><div class="igs-dfx-passnote-sheet"><i class="igs-dfx-passnote-crease"></i><div class="igs-dfx-passnote-text">${esc(item.text)}</div></div>`);
        return { layer: 'front', life: life('passnote', env), sounds: ['campus-pass'], node };
    },
    // 抽屉里的发现：课桌的抽屉被拉开一截，里面一道暖光，信封（或系着缎带的礼物盒）轻轻升起并摇晃，光点四散。
    drawer(item, env) {
        const kind = drawerKindOf(item.item);
        const thing = kind === 'gift'
            ? '<span class="igs-dfx-drawer-gift"><i class="igs-dfx-drawer-lid"></i><i class="igs-dfx-drawer-ribbon"></i></span>'
            : '<span class="igs-dfx-drawer-mail"><i class="igs-dfx-drawer-flap"></i><i class="igs-dfx-drawer-seal"></i></span>';
        const label = item.item ? `<div class="igs-dfx-drawer-label">${esc(item.item)}</div>` : '';
        const sparks = '<i></i><i></i><i></i><i></i><i></i>';
        const node = make(env.doc, `igs-dfx igs-dfx-drawer is-${kind}`, `<div class="igs-dfx-drawer-stage"><i class="igs-dfx-drawer-glow"></i><div class="igs-dfx-drawer-item">${thing}</div><div class="igs-dfx-drawer-sparks">${sparks}</div>${label}<div class="igs-dfx-drawer-desk"><i class="igs-dfx-drawer-front"><b></b></i></div></div>`);
        return { layer: 'front', life: life('drawer', env), sounds: ['campus-drawer'], node };
    },
    // 点名起立：四周压暗成一束聚光，出席簿的页面从上方滑入，一道荧光笔扫过名单停在这个名字上，名字被大声喊出；有应答则在下方回一句。
    rollcall(item, env) {
        const who = esc(item.who || '');
        const rows = ['', '', '', '', ''].map((_, i) => `<li${i === 3 ? ' class="is-hit"' : ''}><s></s></li>`).join('');
        const shout = who ? `<div class="igs-dfx-rollcall-name">${who}</div>` : '<div class="igs-dfx-rollcall-name is-blank">点名</div>';
        const reply = item.reply ? `<div class="igs-dfx-rollcall-reply">${esc(item.reply)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-rollcall', `<i class="igs-dfx-rollcall-dark"></i><i class="igs-dfx-rollcall-spot"></i><div class="igs-dfx-rollcall-book"><b>出席簿</b><ul>${rows}</ul><i class="igs-dfx-rollcall-mark"></i></div>${shout}${reply}`);
        return { layer: 'front', life: life('rollcall', env), sounds: ['campus-rollcall'], node };
    },
    // 考试发卷：试卷从右侧一张张滑落到桌面，圆形挂钟的分针快转，试卷顶部是科目，盖上红色「开始」章；有时长则标出「限时 N 分钟」。
    exam(item, env) {
        const subject = esc(item.subject || '考试');
        const limit = item.minutes > 0 ? `<div class="igs-dfx-exam-limit">限时 ${item.minutes} 分钟</div>` : '';
        const marks = Array.from({ length: 12 }, (_, i) => `<u style="transform:rotate(${i * 30}deg)"></u>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-exam', `<i class="igs-dfx-exam-dark"></i><div class="igs-dfx-exam-sheet is-back"></div><div class="igs-dfx-exam-sheet"><div class="igs-dfx-exam-head"><b>${subject}</b><span>姓名：＿＿＿＿</span></div><div class="igs-dfx-exam-lines"><i></i><i></i><i></i><i></i><i></i></div>${limit}<div class="igs-dfx-exam-stamp">开始</div></div><div class="igs-dfx-exam-clock"><span class="igs-dfx-exam-face">${marks}<em class="igs-dfx-exam-min"></em><em class="igs-dfx-exam-hour"></em><i></i></span></div>`);
        return { layer: 'front', life: life('exam', env), sounds: ['campus-exam'], node };
    },
    // 文化祭开场：头顶一串三角彩旗垂下来轻轻摇摆，标题像剪纸一样弹出，彩纸屑从上方纷纷飘落，两侧升起气球。
    festival(item, env) {
        const title = esc(item.title || '文化祭');
        const sub = esc(item.sub || '开幕！');
        const flags = BUNTING_FLAGS.map((color, i) => `<u style="background:${color};animation-delay:${i * 90}ms"></u>`).join('');
        const balloons = ['#ff6b8a', '#6bd6ff', '#ffd66b', '#8cf0a0'].map((color, i) => `<i class="igs-dfx-festival-balloon is-b${i}" style="background:${color}"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-festival', `<div class="igs-dfx-festival-bunting"><s></s>${flags}</div>${balloons}<div class="igs-dfx-festival-title"><b>${title}</b><span>${sub}</span></div><div class="igs-dfx-festival-confetti">${confetti(34)}</div>`);
        return { layer: 'front', life: life('festival', env), sounds: ['campus-festival'], node };
    },
    // 毕业 / 入学典礼：校门口的樱花雨一路飘落，毕业则三顶学士帽抛向空中旋转落下，入学则只有花雨与暖光；典礼字样从上方缓缓浮现。
    graduate(item, env) {
        const variant = graduateVariantOf(item.text);
        const title = esc(item.text || (variant === 'enroll' ? '入学典礼' : '毕业典礼'));
        const caps = variant === 'graduate' ? `<div class="igs-dfx-graduate-caps">${cap(0)}${cap(1)}${cap(2)}</div>` : '';
        const node = make(env.doc, `igs-dfx igs-dfx-graduate is-${variant}`, `<i class="igs-dfx-graduate-glow"></i><div class="igs-dfx-graduate-petals">${petals(variant === 'graduate' ? 22 : 30)}</div>${caps}<div class="igs-dfx-graduate-title"><b>${title}</b><i></i></div>`);
        return { layer: 'front', life: life('graduate', env), sounds: ['campus-graduate'], node };
    },
    // 第二颗纽扣：制服前襟的特写，金色纽扣连着的线「崩」地一声断开，纽扣弹起、翻转着飞到画面中央，闪出一圈光，下面写着交给谁。
    button(item, env) {
        const who = item.who ? `<div class="igs-dfx-button-who">给 ${esc(item.who)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-button', `<i class="igs-dfx-button-dark"></i><div class="igs-dfx-button-cloth"><i class="igs-dfx-button-placket"></i><span class="igs-dfx-button-spot is-a"></span><span class="igs-dfx-button-spot is-b"></span><span class="igs-dfx-button-thread"></span></div><div class="igs-dfx-button-fly"><span class="igs-dfx-button-gold"><i></i><i></i><i></i><i></i></span><i class="igs-dfx-button-ring"></i></div><div class="igs-dfx-button-title">第二颗纽扣</div>${who}`);
        return { layer: 'front', life: life('button', env), sounds: ['campus-button'], node };
    },
};
