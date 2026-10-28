// 两轮自对局，统计对手轮到出牌时的听牌比例。第一轮不防守，第二轮用第一轮的表。
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { createScmjAi } from '../src/visual/igs-ui/scmj/ai-seat.js';
import { SCMJ_CONF } from '../src/visual/igs-ui/scmj/host.js';
import { seatThreatIndex } from '../src/visual/igs-ui/scmj/rules.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/visual/igs-ui/scmj/threat-table.json');
const CELLS = 125;

function args(name, fallback) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

function canTenpai(internals, holds, que) {
    if (que >= 0 && holds.some((id) => (id < 9 ? 0 : id < 18 ? 1 : 2) === que)) return false;
    const probe = (hand) => {
        const seat = {
            holds: hand.slice(),
            countMap: {},
            que,
            tingMap: {},
            pengs: [],
            angangs: [],
            diangangs: [],
            wangangs: [],
        };
        for (const id of hand) seat.countMap[id] = (seat.countMap[id] || 0) + 1;
        internals.checkCanTingPai({ conf: SCMJ_CONF }, seat);
        return Object.keys(seat.tingMap).length > 0;
    };
    const seen = new Set();
    for (let i = 0; i < holds.length; i += 1) {
        if (seen.has(holds[i])) continue;
        seen.add(holds[i]);
        const next = holds.slice();
        next.splice(i, 1);
        if (probe(next)) return true;
    }
    return false;
}

function blank() {
    return { counts: Array(CELLS).fill(0), hits: Array(CELLS).fill(0), samples: 0, matches: 0 };
}

function playPass(seedBase, need, threat) {
    const bag = blank();
    for (let seed = seedBase; bag.samples < need; seed += 1) {
        const controller = createScmjController({ seed, strict: true });
        const ais = controller.host.userIds.map((userId, index) => createScmjAi(index, userId, controller.xzdd.__internals));
        for (const ai of ais) ai.rules.state.threat = threat ? (bin) => threat[bin] || 0 : null;
        let cursor = 0;
        controller.play((view) => {
            for (const step of controller.trace.slice(cursor)) {
                for (const msg of step.messages) {
                    const ai = ais.find((item) => item.userId === msg.userId);
                    if (ai) ai.feed(msg);
                }
            }
            cursor = controller.trace.length;
            const seat = ais[view.index];
            if (view.pending === 'turn' && seat.opened && bag.samples < need) {
                const bin = seatThreatIndex(seat.ai, (view.index - seat.button + 4) % 4, seat.rules.state);
                bag.counts[bin] += 1;
                if (canTenpai(controller.xzdd.__internals, view.holds, view.que)) bag.hits[bin] += 1;
                bag.samples += 1;
            }
            return seat.decide(view);
        }, 4000);
        bag.matches += 1;
    }
    bag.p = bag.counts.map((count, index) => (bag.hits[index] + 1) / (count + 2));
    return bag;
}

function bigDiff(left, right) {
    const cells = [];
    for (let i = 0; i < CELLS; i += 1) {
        if (left.counts[i] < 200 && right.counts[i] < 200) continue;
        const gap = Math.abs(left.p[i] - right.p[i]);
        if (gap > 0.1) cells.push({ i, gap: Number(gap.toFixed(4)), n: [left.counts[i], right.counts[i]] });
    }
    return cells;
}

const samples = args('--samples', 20000);
const seed = args('--seed', 1);
const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const started = Date.now();
const first = playPass(seed, samples, null);
let second = playPass(seed, samples, first.p);
let diff = bigDiff(first, second);
let passes = [summarize(first), summarize(second)];
if (diff.length) {
    const third = playPass(seed, samples, second.p);
    diff = bigDiff(second, third);
    second = third;
    passes.push(summarize(third));
}

function summarize(bag) {
    return { samples: bag.samples, matches: bag.matches, occupied: bag.counts.filter((n) => n > 0).length };
}

const body = {
    command: `node scripts/scmj-threat-table.mjs --samples ${samples} --seed ${seed}`,
    seed,
    commit,
    samples,
    passes,
    diff,
    bins: {
        discards: ['0-3', '4-6', '7-9', '10-12', '13+'],
        melds: [0, 1, 2, 3, 4],
        gap: ['0', '1', '2', '>=3', 'never'],
    },
    counts: second.counts,
    hits: second.hits,
    p: second.p.map((value) => Number(value.toFixed(6))),
};
writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify({ out, ms: Date.now() - started, passes, diff: diff.length }, null, 2));
