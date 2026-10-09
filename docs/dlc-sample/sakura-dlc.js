// IGS 示例 DLC「樱花信笺」：一套三片素材对话框皮肤 + 两个演出标签。
// 用法：酒馆助手 → 脚本 → 新建，把整段贴进去并启用（IGS 先装后装都可以）。
// 真做 DLC 时把 drawFrame / drawPlate 换成你放在 GitHub 上的图片地址（jsDelivr 链接），见 docs/DLC_接入指南.md。
(function () {
    'use strict';
    // IGS 挂在酒馆主窗口上；酒馆助手脚本跑在自己的 iframe 里，所以要找 parent。
    const host = (function () {
        try { if (window.parent && window.parent.document) return window.parent; } catch (_) { /* 跨域时退回自身 */ }
        return window;
    })();
    const doc = host.document;

    // ---- 素材：示例用画布现画，真 DLC 换成 https 图片地址 ----
    function canvas(width, height, draw) {
        const c = doc.createElement('canvas');
        c.width = width;
        c.height = height;
        draw(c.getContext('2d'));
        return c.toDataURL('image/png');
    }
    // 对话框三片素材：左右两端各 120px 是花纹（不拉伸），中间横向拉伸。
    const drawFrame = () => canvas(600, 200, (g) => {
        g.fillStyle = '#fff5f8';
        g.strokeStyle = '#e88aa8';
        g.lineWidth = 6;
        g.beginPath();
        g.roundRect(6, 16, 588, 178, 26);
        g.fill();
        g.stroke();
        g.fillStyle = '#f6c1d1';
        for (const [x, y, r] of [[40, 40, 14], [70, 28, 9], [560, 170, 14], [532, 182, 9], [28, 160, 8], [574, 36, 8]]) {
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
        }
    });
    // 姓名牌三片素材：两端各 40px 圆头。
    const drawPlate = () => canvas(200, 50, (g) => {
        g.fillStyle = '#e88aa8';
        g.beginPath();
        g.roundRect(0, 0, 200, 50, 25);
        g.fill();
    });

    function setup(IGS) {
        if (!IGS || !IGS.api || !IGS.api.uiSkins || (IGS.api.version || 0) < 1) {
            console.warn('[樱花信笺] 这个 IGS 版本还没有 DLC 接口，请先更新 IGS');
            return;
        }

        IGS.api.uiSkins.register({
            id: 'dlc-sakura',
            label: '樱花信笺',
            inherit: 'cute-pink',          // 状态栏、选项、战斗、标题卡等周边样式借「超可爱粉」
            worldviews: ['modern'],
            accent: '#e88aa8',
            sfx: 'paper',
            frame: {
                height: 200,
                image: drawFrame(),
                slice: [120, 120],          // 素材里两端花纹的原始宽度
                left: 120, right: 120,      // 显示时两端的宽度
                text: { top: 34, speakerTop: 42, right: 60, bottom: 30, left: 60 },
                plate: { image: drawPlate(), slice: [40, 40], left: 40, right: 40, height: 50, x: 40, rise: 26, lineHeight: 50, padding: '0 34px', minWidth: 140 },
            },
            typography: {
                nameFont: '"ZCOOL KuaiLe","Microsoft YaHei",sans-serif',
                nameColor: '#ffffff',
                textColor: '#5d3a4a',
                thoughtColor: '#c65f86',
                narrationColor: '#8a6a78',
                nameAlign: 'center',
            },
            css: `
                #igs-overlay[data-igs-dialog-skin="dlc-sakura"] .igs-speaker{letter-spacing:.12em;text-shadow:0 1px 0 rgba(160,60,90,.5);}
                #igs-overlay[data-igs-dialog-skin="dlc-sakura"] .igs-dialog[data-igs-narration="1"] .igs-text{font-style:italic;}
                #igs-overlay[data-igs-dialog-skin="dlc-sakura"]{--igs-cw-color:#e88aa8;--igs-tfx-accent:#e88aa8;}
            `,
        });

        // 瞬时：一阵花瓣从上往下飘，2.6 秒后 IGS 自动收掉。[igs-fx:dlc-petals] 或 [igs-fx:dlc-petals|多]
        IGS.api.stageFx.register({
            kind: 'dlc-petals',
            label: '樱花飘落',
            lifeMs: 2600,
            prompt: '浪漫、告白或离别的瞬间，在那句正文前写 [igs-fx:dlc-petals]，想要更多花瓣写 [igs-fx:dlc-petals|多]',
            css: `
                .dlc-petal{position:absolute;top:-24px;width:14px;height:10px;border-radius:70% 0 70% 0;background:#f6c1d1;opacity:.9;pointer-events:none;animation:dlc-petal-fall var(--dlc-t,2.4s) linear forwards;}
                .dlc-petal.is-still{animation:dlc-petal-fade 2.4s ease forwards;top:auto;}
                @keyframes dlc-petal-fall{to{transform:translate(var(--dlc-dx,40px),110vh) rotate(540deg);opacity:.2;}}
                @keyframes dlc-petal-fade{from{opacity:.9;}to{opacity:0;}}
            `,
            play(ctx) {
                // 用户开了「减少动态」：只放几片不动的花瓣淡出。
                const count = ctx.reduced ? 4 : (ctx.args[0] === '多' ? 36 : 18);
                for (let i = 0; i < count; i += 1) {
                    const petal = ctx.doc.createElement('i');
                    petal.className = ctx.reduced ? 'dlc-petal is-still' : 'dlc-petal';
                    petal.style.left = `${Math.random() * 100}%`;
                    if (ctx.reduced) petal.style.top = `${10 + Math.random() * 60}%`;
                    petal.style.setProperty('--dlc-t', `${1.6 + Math.random()}s`);
                    petal.style.setProperty('--dlc-dx', `${-60 + Math.random() * 120}px`);
                    petal.style.animationDelay = `${Math.random() * 0.6}s`;
                    ctx.spawn(petal);
                }
            },
        });

        // 区间：[igs-fx:dlc-sakura-wind] … [igs-fx:dlc-sakura-wind-end] 之间画面一直有花瓣慢慢飘，铺在对话框下面。
        IGS.api.stageFx.register({
            kind: 'dlc-sakura-wind',
            label: '樱花风',
            mode: 'range',
            layer: 'stage',
            prompt: '樱花树下、春日散步的整段场景，用它包住那几段正文',
            css: `
                .dlc-wind{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
                .dlc-wind i{position:absolute;top:-20px;width:12px;height:8px;border-radius:70% 0 70% 0;background:#f9d3df;opacity:.75;animation:dlc-wind-drift 7s linear infinite;}
                @keyframes dlc-wind-drift{to{transform:translate(-160px,110vh) rotate(360deg);}}
            `,
            play(ctx) {
                if (ctx.reduced) return;            // 减少动态时整个区间不播
                const box = ctx.doc.createElement('div');
                box.className = 'dlc-wind';
                for (let i = 0; i < 14; i += 1) {
                    const petal = ctx.doc.createElement('i');
                    petal.style.left = `${Math.random() * 110}%`;
                    petal.style.animationDelay = `${-Math.random() * 7}s`;
                    box.appendChild(petal);
                }
                ctx.spawn(box);                      // 不给时长：离开区间、翻出这一楼或关阅读器时 IGS 收掉
            },
        });
    }

    (host.IGS_DLC = host.IGS_DLC || []).push(setup);

    // 关掉这个脚本（或刷新）时把自己注销，免得留下失效的播放函数。
    window.addEventListener('pagehide', () => {
        const api = host.IGS && host.IGS.api;
        if (!api || !api.uiSkins) return;
        api.uiSkins.unregister('dlc-sakura');
        api.stageFx.unregister('dlc-petals');
        api.stageFx.unregister('dlc-sakura-wind');
    });
})();
