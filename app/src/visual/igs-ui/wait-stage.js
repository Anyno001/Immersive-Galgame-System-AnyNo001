// 等待过场：五种阅读器模式共用一层黑屏 + 一句短台词。台词把「最近几楼的台词回放」和「通用兜底」混在一池轮换。
export const WAIT_STAGE_DEFAULTS = Object.freeze({
    enabled: true,
    games: true,
    voice: true,
    lineSeconds: 6,
});

export function normalizeWaitStageSettings(value) {
    const src = value && typeof value === 'object' ? value : {};
    const seconds = Number(src.lineSeconds);
    return {
        enabled: src.enabled !== false,
        games: src.games !== false,
        voice: src.voice !== false,
        lineSeconds: Number.isFinite(seconds) ? Math.min(16, Math.max(3, Math.round(seconds))) : WAIT_STAGE_DEFAULTS.lineSeconds,
    };
}

export const WAIT_STAGE_FALLBACK_LINES = Object.freeze([
    '还在努力写作…',
    '正在斟酌下一句…',
    '笔尖停了一下，马上就好…',
    '故事还在路上…',
    '正在把这一幕写完…',
    '再等一下，就快写到了…',
    '情节正往前挪…',
    '正写得入神，别急…',
]);

export const WAIT_STAGE_FAILURES = Object.freeze({
    empty: { title: '正在恢复故事回复', text: '正在继续取得可阅读的正文，原输入已保留。' },
    failed: { title: '正在恢复故事回复', text: '正在续接本次回复，已取得的正文和原输入已保留。' },
    stopped: { title: '回复已停止', text: '这次生成被中止了，尚未切换到下一楼。' },
    read: { title: '正在恢复回复读取', text: '正在继续读取本次回复，当前楼和已有正文已保留。' },
    send: { title: '正在恢复消息发送', text: '正在续接原消息，输入内容已保留。' },
});

function shuffle(list, random) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const swap = out[i];
        out[i] = out[j];
        out[j] = swap;
    }
    return out;
}

// 一条角色台词接一条通用口吻，不让回放连着刷屏；回放不够时全靠兜底。
export function weaveWaitStageLines(replay = [], fallback = WAIT_STAGE_FALLBACK_LINES, options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.round(options.limit)) : 14;
    const quoted = shuffle(replay.filter((line) => line && String(line.text || '').trim()), random);
    const plain = shuffle(fallback.slice(), random);
    const out = [];
    let qi = 0;
    let pi = 0;
    while (out.length < limit && (qi < quoted.length || pi < plain.length)) {
        if (qi < quoted.length) out.push(quoted[qi++]);
        if (out.length < limit && pi < plain.length) out.push({ who: '', text: plain[pi++] });
    }
    return out;
}

export const WAIT_STAGE_STYLE_TEXT = `
@keyframes igs-ws-in{0%{opacity:0;}100%{opacity:1;}}
@keyframes igs-ws-out{0%{opacity:1;}100%{opacity:0;}}
@keyframes igs-ws-rise{0%{opacity:0;transform:translateY(8px);}100%{opacity:1;transform:translateY(0);}}
@keyframes igs-ws-pulse{0%,100%{opacity:.5;transform:scale(1);}50%{opacity:1;transform:scale(1.06);}}
.igs-waitstage{position:relative;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;overflow:hidden;width:100%;height:100%;background:radial-gradient(ellipse at center,color-mix(in srgb,var(--igs-empty-bg,#16181a) 78%,transparent) 0%,color-mix(in srgb,var(--igs-empty-bg,#16181a) 95%,transparent) 100%);-webkit-backdrop-filter:blur(18px) saturate(.92);backdrop-filter:blur(18px) saturate(.92);color:var(--igs-bar-ink,#e8e5df);font-family:inherit;text-align:center;pointer-events:auto;animation:igs-ws-in .42s ease-out both;transition:background .35s ease;}
#igs-overlay .igs-waitstage{position:absolute;inset:0;z-index:6;border-radius:0;}
.igs-waitstage.igs-embedded-loading{min-height:220px;border-radius:6px;}
.igs-waitstage.igs-ws-closing{animation:igs-ws-out .32s ease-in both;pointer-events:none;}
.igs-waitstage.is-exit{background:radial-gradient(ellipse at center,color-mix(in srgb,var(--igs-empty-bg,#16181a) 68%,transparent) 0%,color-mix(in srgb,var(--igs-empty-bg,#16181a) 90%,transparent) 100%);-webkit-backdrop-filter:blur(22px) saturate(1);backdrop-filter:blur(22px) saturate(1);}
.igs-waitstage.is-error .igs-ws-dots{display:none;}
.igs-waitstage.is-error{justify-content:flex-start;overflow:auto;}
.igs-waitstage.is-error .igs-ws-body{flex-shrink:0;margin:auto 0;}
.igs-ws-error-mark{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:color-mix(in srgb,#d98d83 14%,transparent);color:#e4aca3;font-size:24px;animation:igs-ws-rise .4s ease-out both;}
.igs-ws-error-title{font-size:18px;line-height:1.5;letter-spacing:.06em;}
.igs-ws-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;margin-top:6px;}
.igs-ws-actions[hidden],.igs-ws-line[hidden],.igs-ws-dots[hidden]{display:none;}
.igs-ws-body{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:min(520px,92%);animation:igs-ws-rise .5s ease-out both;}
.igs-ws-dots{display:flex;align-items:center;justify-content:center;gap:6px;color:currentColor;}
.igs-ws-dots .igs-embedded-loading-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;animation:igs-embedded-pulse 1.1s ease-in-out infinite;}
.igs-ws-dots .igs-embedded-loading-dot:nth-child(2){animation-delay:.18s;}
.igs-ws-dots .igs-embedded-loading-dot:nth-child(3){animation-delay:.36s;}
.igs-waitstage.is-exit .igs-ws-dots .igs-embedded-loading-dot{animation-duration:.7s;}
.igs-ws-line{display:flex;flex-direction:column;align-items:center;gap:6px;min-height:3.4em;justify-content:center;}
.igs-ws-quote{max-width:100%;color:var(--igs-bar-ink,#e8e5df);font-size:15px;line-height:1.7;letter-spacing:.04em;text-wrap:pretty;animation:igs-ws-rise .45s ease-out both;}
.igs-ws-quote::before{content:"「";opacity:.42;}
.igs-ws-quote::after{content:"」";opacity:.42;}
.igs-ws-who{font-size:11px;letter-spacing:.16em;opacity:.5;}
.igs-ws-note{color:color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 62%,transparent);font-size:13px;line-height:1.7;letter-spacing:.14em;animation:igs-ws-rise .45s ease-out both;}
.igs-ws-chip{box-sizing:border-box;height:30px;padding:0 14px;border:0;border-radius:999px;background:color-mix(in srgb,var(--igs-bar-ink,#fff) 9%,transparent);color:inherit;font:inherit;font-size:12px;letter-spacing:.08em;cursor:pointer;transition:background .18s ease,opacity .18s ease;}
.igs-ws-chip:hover{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 18%,transparent);}
.igs-ws-chip.is-on{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 22%,transparent);font-weight:600;}
.igs-ws-chip.is-off{opacity:.4;cursor:default;}
.igs-ws-close{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));right:calc(10px + env(safe-area-inset-right,0px));z-index:2;display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:color-mix(in srgb,var(--igs-bar-ink,#fff) 9%,transparent);color:inherit;opacity:.72;cursor:pointer;transition:background .18s ease,opacity .18s ease;}
.igs-ws-close:hover,.igs-ws-close:focus-visible{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 18%,transparent);opacity:1;}
@media (prefers-reduced-motion: reduce){
.igs-waitstage,.igs-ws-body,.igs-ws-note,.igs-ws-quote,.igs-ws-error-mark{animation:none!important;}
.igs-ws-dots .igs-embedded-loading-dot{animation:none!important;opacity:.6;}
}
`;
