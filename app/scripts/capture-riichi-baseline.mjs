// 在改成都麻将之前，用固定种子跑完整东风战，记下牌谱哈希。
// 随机源与 tests/wait-stage-mahjong-mind.test.js 的 seeded() 相同。
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Majiang from '@kobalab/majiang-core';
import AI from '@kobalab/majiang-ai';
import { MAHJONG_STYLES, MindfulAI } from '../src/visual/igs-ui/wait-stage-mahjong-mind.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = resolve(root, 'fixtures/mahjong/riichi-baseline.json');

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

function play(players, seed) {
    const keep = Math.random;
    Math.random = seeded(seed);
    try {
        const game = new Majiang.Game(players, () => {}, Majiang.rule({ '場数': 1 }), 'test');
        game.do_sync();
        return game._paipu;
    } finally {
        Math.random = keep;
    }
}

function sha256(paipu) {
    return createHash('sha256').update(JSON.stringify(paipu)).digest('hex');
}

const commit = execSync('git rev-parse HEAD', { cwd: resolve(root, '..'), encoding: 'utf8' }).trim();
const styles = Object.keys(MAHJONG_STYLES);
const records = [];

for (let seed = 1; seed <= 20; seed += 1) {
    const paipu = play([new AI(), new AI(), new AI(), new AI()], seed);
    records.push({ kind: 'ai', seed, seat: null, style: null, sha256: sha256(paipu) });
    process.stderr.write(`ai ${seed}\n`);
}

for (const style of styles) {
    for (let seed = 1; seed <= 10; seed += 1) {
        const players = [new AI(), new AI(), new AI(), new AI()];
        players[0] = new MindfulAI({ style }, { think: false, random: seeded(seed + 1000) });
        const paipu = play(players, seed);
        records.push({ kind: 'mindful', seed, seat: 0, style, sha256: sha256(paipu) });
        process.stderr.write(`${style} ${seed}\n`);
    }
}

const doc = {
    commit,
    rule: { '場数': 1 },
    note: 'MindfulAI 坐 0 号位，其余三家为原版 AI。random 为 seeded(seed + 1000)，牌山随机源为 seeded(seed)。',
    records,
};
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
process.stderr.write(`wrote ${records.length} records\n`);
