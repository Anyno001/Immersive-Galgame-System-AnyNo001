// 恐怖题材专用的打字机音色特化：只在恐怖世界观或恐怖对话框皮肤下启用，基础打字机音色不变。
// 随恐怖档位（horror-dread.js）逐档变闷、变低、变得不稳：0 档只压掉一点清脆，3 档低沉失真、会吞字也会多出回音。
export const HORROR_TYPEWRITER_TIERS = Object.freeze([
    Object.freeze({ cutoff: 3600, pitch: 0.96, jitter: 0.05, drop: 0, echo: 0, drive: 0 }),
    Object.freeze({ cutoff: 2200, pitch: 0.9, jitter: 0.07, drop: 0, echo: 0.06, drive: 0 }),
    Object.freeze({ cutoff: 1300, pitch: 0.8, jitter: 0.12, drop: 0.12, echo: 0.14, drive: 0 }),
    Object.freeze({ cutoff: 800, pitch: 0.68, jitter: 0.2, drop: 0.2, echo: 0.22, drive: 2.4 }),
]);

export function horrorTypewriterTier(level) {
    if (level === null || level === undefined || level === '') return null;
    const index = Math.round(Number(level));
    return Number.isFinite(index) && index >= 0 && index <= 3 ? HORROR_TYPEWRITER_TIERS[index] : null;
}

// 是否启用特化：恐怖世界观，或选了恐怖对话框皮肤；返回当前档位，否则 null。
export function resolveHorrorTypewriterLevel(readerSettings, level) {
    const reader = readerSettings && typeof readerSettings === 'object' ? readerSettings : {};
    const on = reader._worldview === 'horror' || /^horror-/.test(String(reader.dialogSkin || ''));
    return on ? level : null;
}

// 改写音符：整体降调、加大抖动；按固定种子吞掉少量字、在少量字后补一声更轻的回音。首个音符必响。
export function shapeHorrorNotes(notes, level) {
    const tier = horrorTypewriterTier(level);
    if (!tier || !Array.isArray(notes)) return notes;
    let seed = 7 + notes.length * 13;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = [];
    notes.forEach((note, index) => {
        if (index > 0 && rand() < tier.drop) return;
        const shaped = { ...note, pitch: note.pitch * tier.pitch, jitter: Math.max(note.jitter || 0, tier.jitter) };
        out.push(shaped);
        if (rand() < tier.echo) out.push({ ...shaped, timeMs: note.timeMs + 55, gain: (note.gain || 1) * 0.4, pitch: shaped.pitch * 0.94 });
    });
    return out;
}

function driveCurve(amount) {
    const curve = new Float32Array(256);
    for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    return curve;
}

// 在打字机输出前串一个低通（3 档再加轻度失真），返回新的输出节点；创建的节点放进 nodes 统一断开。
export function connectHorrorChain(context, output, nodes, level) {
    const tier = horrorTypewriterTier(level);
    if (!tier || !context || typeof context.createBiquadFilter !== 'function') return output;
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = tier.cutoff;
    low.Q.value = 0.9;
    low.connect(output);
    nodes.push(low);
    if (!tier.drive || typeof context.createWaveShaper !== 'function') return low;
    const shaper = context.createWaveShaper();
    shaper.curve = driveCurve(tier.drive);
    shaper.connect(low);
    nodes.push(shaper);
    return shaper;
}
