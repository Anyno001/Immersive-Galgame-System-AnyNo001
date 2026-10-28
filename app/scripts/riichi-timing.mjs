// 立直 FULL（plain steady）自己回合打牌决定的耗时分布，F1 拿来和成都的 scmj-bench timing 对照。用法：node scripts/riichi-timing.mjs [局数]
import Majiang from '@kobalab/majiang-core';
import { MindfulAI } from '../src/visual/igs-ui/wait-stage-mahjong-mind.js';

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const times = [];
const n = Number(process.argv[2] || 10);
for (let seed = 1; seed <= n; seed += 1) {
    const players = [0, 1, 2, 3].map(() => new MindfulAI({ style: 'steady' }, { plain: true, think: false }));
    for (const p of players) {
        for (const name of ['action_zimo', 'action_dapai']) {
            const orig = p[name].bind(p);
            p[name] = (...args) => {
                const t0 = performance.now();
                const r = orig(...args);
                if (name === 'action_zimo' && args[0] && args[0].l === p._menfeng) times.push(performance.now() - t0);
                return r;
            };
        }
    }
    const keep = Math.random;
    Math.random = seeded(seed);
    try {
        new Majiang.Game(players, () => {}, Majiang.rule({ '場数': 1 }), 'test').do_sync();
    } finally { Math.random = keep; }
}
times.sort((a, b) => a - b);
const q = (p) => times[Math.min(times.length - 1, Math.ceil(p * times.length) - 1)];
console.log({ n: times.length, p50: q(0.5).toFixed(1), p95: q(0.95).toFixed(1), p99: q(0.99).toFixed(1), max: times[times.length - 1].toFixed(1) });
