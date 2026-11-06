import { intimateHeartBpm, isWhisperCard } from '../../scene/intimate-duel.js';

const DIM_MS = 520;

export const INTIMATE_DUEL_FX_STYLE_TEXT = `
@keyframes igs-duel-beat{0%,100%{outline-color:transparent;}8%,22%{outline-color:var(--igs-cb-duel-accent,#c8506e);}}
#igs-combat-panel[data-igs-duel-beat] :is(.igs-combat-card,.cx-card){outline:2px solid transparent;outline-offset:-2px;animation:igs-duel-beat var(--igs-duel-beat,0.9s) ease-out infinite;}
#igs-combat-panel[data-igs-combat-reduced] :is(.igs-combat-card,.cx-card){animation:none;}
.igs-duel-dim{position:absolute;inset:0;z-index:5;background:var(--igs-cb-duel-ground,#121212);opacity:0;pointer-events:none;animation:igs-duel-dim ${DIM_MS}ms ease-in-out both;}
@keyframes igs-duel-dim{0%{opacity:0;}45%{opacity:.5;}100%{opacity:0;}}
.igs-duel-result{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;flex:1;min-height:0;background:var(--igs-cb-duel-ground,#121212);animation:igs-duel-fade 900ms ease-out both;}
.igs-duel-result-line{margin:0;padding:0 24px;color:var(--igs-cb-duel-ink,#d8d8d8);font-size:14px;letter-spacing:.14em;line-height:1.9;text-align:center;}
@keyframes igs-duel-fade{0%{opacity:0;}100%{opacity:1;}}
#igs-overlay[data-igs-duel] #igs-sprite{translate:0 0;rotate:0deg;}
`;

// 亲密对决演出：手牌随对方血条加快心跳描边，打出耳语类牌时压暗一下并配音效。对决不设回合上限，没有结尾演出窗口。
export function createIntimateDuelFx({ doc, getRoot, sfx, reduced = () => false, setTimer = (fn, ms) => setTimeout(fn, ms) } = {}) {
    let lastBpm = 0;

    const root = () => getRoot?.() || null;

    function setBeat(bpm) {
        const el = root();
        if (!el) return;
        if (reduced() || !(bpm > 0)) {
            el.removeAttribute?.('data-igs-duel-beat');
            return;
        }
        if (bpm !== lastBpm) el.style?.setProperty?.('--igs-duel-beat', `${(60 / bpm).toFixed(3)}s`);
        el.setAttribute?.('data-igs-duel-beat', '');
        lastBpm = bpm;
    }

    function sync({ ratio = 1, ended = false } = {}) {
        setBeat(ended ? 0 : intimateHeartBpm(ratio));
    }

    function onPlay(cardName) {
        if (!isWhisperCard(cardName)) return;
        sfx?.('range-whisper');
        const el = root();
        if (!el || reduced() || typeof doc?.createElement !== 'function') return;
        const dim = doc.createElement('div');
        dim.className = 'igs-duel-dim';
        el.appendChild(dim);
        setTimer(() => dim.remove?.(), DIM_MS + 50);
    }

    function stop() {
        setBeat(0);
        lastBpm = 0;
    }

    return { sync, onPlay, stop };
}
