// 读牌表：成都电脑四家自对局，在每次有人要出牌时，从出牌人的公开视角记下每个对手的特征，
// 再用真实手牌标注（是否听牌、每张牌是不是他和的牌、和了平均每家付多少）。两轮：第二轮用第一轮的表防守。
// node scripts/scmj-read-table.mjs --walls 600 --seed 1 --workers 12
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { SCMJ_CONF } from '../src/visual/igs-ui/scmj/host.js';
import { createScmjPlayer } from '../src/visual/igs-ui/scmj/player.js';
import { createReader, lossCell, LOSS_CELLS, TENPAI_CELLS, tenpaiCell, WAIT_CELLS, waitCell } from '../src/visual/igs-ui/scmj/reading.js';
import { tenpaiValues } from '../src/visual/igs-ui/scmj/rules.js';
import { countsOf } from '../src/visual/igs-ui/scmj/shanten.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/visual/igs-ui/scmj/read-table.json');
const SUIT = (id) => Math.floor(id / 9);

function arg(name, fallback) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

function blank() {
    return {
        t: [Array(TENPAI_CELLS).fill(0), Array(TENPAI_CELLS).fill(0)],
        w: [Array(WAIT_CELLS).fill(0), Array(WAIT_CELLS).fill(0)],
        l: [Array(LOSS_CELLS).fill(0), Array(LOSS_CELLS).fill(0)],
        hands: 0,
    };
}

function meldsOf(seat) {
    return { pengs: seat.pengs.slice(), angangs: seat.angangs.slice(), diangangs: seat.diangangs.slice(), wangangs: seat.wangangs.slice() };
}

function playRange(from, to, tables) {
    const bag = blank();
    const reader = createReader(tables);
    for (let seed = from; seed < to; seed += 1) {
        const controller = createScmjController({ seed, conf: { ...SCMJ_CONF, maxGames: 1 }, strict: true });
        const ids = controller.host.userIds;
        const internals = controller.xzdd.__internals;
        const players = ids.map((userId, index) => createScmjPlayer(index, userId, internals, { userIds: ids, seed: seed * 4 + index, reader }));
        let cursor = 0;
        controller.play((view) => {
            for (const step of controller.trace.slice(cursor)) {
                for (const msg of step.messages) {
                    const p = players[ids.indexOf(msg.userId)];
                    if (p) p.feed(msg);
                }
            }
            cursor = controller.trace.length;
            const me = players[view.index];
            if (view.pending === 'turn') {
                const table = me.table;
                const hand = countsOf(view.holds);
                const unseen = hand.map((n, id) => Math.max(0, 4 - table.seen[id] - n));
                for (const seat of controller.seats) {
                    const o = seat.index;
                    if (o === view.index || seat.hued || table.hued[o]) continue;
                    const waits = tenpaiValues(internals, { holds: seat.holds, que: seat.que, ...meldsOf(seat) });
                    const tc = tenpaiCell(table, o);
                    bag.t[0][tc] += 1;
                    if (!waits.length) continue;
                    bag.t[1][tc] += 1;
                    const lc = lossCell(table, o);
                    bag.l[0][lc] += 1;
                    bag.l[1][lc] += waits.reduce((sum, w) => sum + w.ron, 0) / waits.length;
                    const set = new Set(waits.map((w) => w.pai));
                    for (let k = 0; k < 27; k += 1) {
                        if (SUIT(k) === seat.que) continue;
                        const wc = waitCell(table, o, k, unseen, hand[k]);
                        bag.w[0][wc] += 1;
                        if (set.has(k)) bag.w[1][wc] += 1;
                    }
                }
            }
            return me.decide(view);
        }, 4000);
        bag.hands += 1;
    }
    return bag;
}

function merge(parts) {
    const bag = blank();
    for (const part of parts) {
        for (const key of ['t', 'w', 'l']) for (let r = 0; r < 2; r += 1) part[key][r].forEach((v, i) => { bag[key][r][i] += v; });
        bag.hands += part.hands;
    }
    return bag;
}

// 少样本的格子往全表平均收缩：p = (命中 + m × 平均) / (样本 + m)。
function shrink(counts, hits, m) {
    const total = counts.reduce((a, b) => a + b, 0);
    const prior = total ? hits.reduce((a, b) => a + b, 0) / total : 0;
    return counts.map((n, i) => Number(((hits[i] + m * prior) / (n + m)).toFixed(6)));
}

function tablesOf(bag) {
    return {
        tenpai: shrink(bag.t[0], bag.t[1], 20),
        wait: shrink(bag.w[0], bag.w[1], 20),
        loss: shrink(bag.l[0], bag.l[1], 20),
    };
}

async function pass(walls, seed, workers, tables) {
    const chunks = Math.min(workers, walls);
    const jobs = [];
    for (let i = 0; i < chunks; i += 1) {
        const from = seed + Math.floor(i * walls / chunks);
        const to = seed + Math.floor((i + 1) * walls / chunks);
        jobs.push(new Promise((resolve, reject) => {
            const worker = new Worker(new URL(import.meta.url), { workerData: { from, to, tables } });
            worker.on('message', resolve);
            worker.on('error', reject);
        }));
    }
    return merge(await Promise.all(jobs));
}

function biggest(a, b, counts) {
    let gap = 0;
    a.forEach((v, i) => { if (counts[i] >= 500) gap = Math.max(gap, Math.abs(v - b[i])); });
    return Number(gap.toFixed(4));
}

if (!isMainThread) {
    parentPort.postMessage(playRange(workerData.from, workerData.to, workerData.tables));
} else {
    const walls = Number(arg('--walls', '600'));
    const seed = Number(arg('--seed', '1'));
    const workers = Number(arg('--workers', '8'));
    const started = Date.now();
    const first = await pass(walls, seed, workers, null);
    const firstTables = tablesOf(first);
    const second = await pass(walls, seed, workers, firstTables);
    const tables = tablesOf(second);
    const body = {
        command: `node scripts/scmj-read-table.mjs --walls ${walls} --seed ${seed}`,
        seed,
        walls,
        commit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
        samples: { tenpai: second.t[0].reduce((a, b) => a + b, 0), wait: second.w[0].reduce((a, b) => a + b, 0), hands: second.hands },
        passDiff: {
            tenpai: biggest(firstTables.tenpai, tables.tenpai, second.t[0]),
            wait: biggest(firstTables.wait, tables.wait, second.w[0]),
            loss: biggest(firstTables.loss, tables.loss, second.l[0]),
        },
        ...tables,
    };
    writeFileSync(out, `${JSON.stringify(body)}\n`);
    console.log(JSON.stringify({ out, ms: Date.now() - started, samples: body.samples, passDiff: body.passDiff }));
}
