// 复式强度测试。同一牌墙种子打 4 手单局，被测电脑轮流坐四个座位。
import { writeFileSync } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { SCMJ_CONF } from '../src/visual/igs-ui/scmj/host.js';
import { chengduSettle } from '../src/visual/igs-ui/scmj/rules.js';
import { createFullAi, createNaiveAi, createPlanAi, greedyDecide } from './scmj-players.mjs';

const HU = new Set(['zimo', 'hu', 'ganghua', 'dianganghua', 'gangpaohu', 'qiangganghu']);
const REJECTION = /not your turn|already hued|no need chupai|plz guo before|can't find mj|peng == false|gang == false|can't be ganged|invalid request|no need guo|it's your turn|lack of mj|can't recv huansanzhang|player has done this action|can't recv dingQue|can't find user game data|invalid pai count/;
const KINDS = ['plan', 'engine', 'greedy', 'naive'];
const SUITES = {};
for (const t of KINDS) for (const opp of KINDS) SUITES[`${t}-vs-${opp}`] = { t, opp };

function arg(name, fallback) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

// options：被测座位的 variant、K、persona；对手只用 oppPersona。
function makePlayer(kind, index, internals, userIds, options = {}) {
    if (kind === 'greedy') return null;
    if (kind === 'naive') return createNaiveAi(index, userIds[index], internals, userIds);
    if (kind === 'engine') return createFullAi(index, userIds[index], internals, userIds, options);
    return createPlanAi(index, userIds[index], internals, userIds, options);
}

function handRows(trace) {
    let rows = null;
    for (const step of trace) {
        for (const msg of step.messages) {
            if (msg.event === 'game_over_push' && msg.userId === 1001) rows = msg.data.results;
        }
    }
    return rows;
}

function suitOf(id) {
    if (id < 9) return 'p';
    if (id < 18) return 's';
    return 'm';
}

function emptyBag() {
    return { rejection: 0, queDiscard: 0, chi: 0, lizhi: 0, queMeld: 0, passHu: 0, fanChecked: 0, fanMismatch: 0 };
}

function addBag(into, from) {
    for (const key of Object.keys(into)) into[key] += from[key] || 0;
}

function audit(view, choice, bag) {
    if (view.pending === 'action' && view.action && view.action.hu && !choice.hu) bag.passHu += 1;
    if (choice.chi) bag.chi += 1;
    if (choice.dapai != null && String(choice.dapai).includes('*')) bag.lizhi += 1;
    const queSuit = ['p', 's', 'm'][view.que];
    if (choice.dapai != null && queSuit && view.holds.some((id) => suitOf(id) === queSuit) && suitOf(choice.dapai) !== queSuit) bag.queDiscard += 1;
    const meld = choice.gang ? choice.pai : (choice.peng && view.action ? view.action.pai : null);
    if (meld != null && queSuit && suitOf(meld) === queSuit) bag.queMeld += 1;
}

function checkFans(rows, ques, internals, bag) {
    if (!rows) return;
    rows.forEach((row, index) => {
        const types = (row.actions || []).map((action) => action.type);
        if (!types.some((type) => HU.has(type))) return;
        const holds = row.holds || [];
        if (!holds.length) return;
        const settled = chengduSettle(internals, {
            holds: holds.slice(),
            win: holds[holds.length - 1],
            que: ques[index],
            pengs: row.pengs || [],
            angangs: row.angangs || [],
            diangangs: row.diangangs || [],
            wangangs: row.wangangs || [],
            haidi: Boolean(row.haidihu),
            tianhu: Boolean(row.tianhu),
            dihu: Boolean(row.dihu),
            ganghu: Boolean(row.isganghu),
            qianggang: types.includes('qiangganghu'),
            zimo: types.includes('zimo') || types.includes('ganghua'),
            payers: 1,
        });
        bag.fanChecked += 1;
        if (settled.fan !== row.fan) bag.fanMismatch += 1;
    });
}

function countSide(row) {
    const types = (row && row.actions ? row.actions : []).map((action) => action.type);
    return {
        hu: types.some((type) => HU.has(type)) ? 1 : 0,
        fangpao: types.includes('fangpao') ? 1 : 0,
        chadajiao: types.includes('beichadajiao') ? 1 : 0,
        fan: types.some((type) => HU.has(type)) ? (row.fan || 0) : 0,
    };
}

export function playWall(seed, suite, options = {}) {
    const spec = SUITES[suite];
    const tested = { variant: options.variant, K: options.K, persona: options.persona, plan: options.plan, seed };
    const rival = { persona: options.oppPersona, seed };
    const conf = { ...SCMJ_CONF, maxGames: 1 };
    const scores = [];
    const bag = emptyBag();
    let hu = 0;
    let fangpao = 0;
    let chadajiao = 0;
    let fanSum = 0;
    let fanN = 0;
    let oppHu = 0;
    let oppFangpao = 0;
    let oppHands = 0;
    let sumOff = 0;
    const decideMs = [];
    for (let seat = 0; seat < 4; seat += 1) {
        const controller = createScmjController({ seed, conf, strict: true });
        const userIds = controller.host.userIds;
        const kinds = [0, 1, 2, 3].map((index) => (index === seat ? spec.t : spec.opp));
        const players = kinds.map((kind, index) => makePlayer(kind, index, controller.xzdd.__internals, userIds,
            { ...(index === seat ? tested : rival), seed: seed * 4 + index }));
        let cursor = 0;
        const played = controller.play((view) => {
            for (const step of controller.trace.slice(cursor)) {
                for (const msg of step.messages) {
                    const player = players.find((item, index) => item && userIds[index] === msg.userId);
                    if (player) player.feed(msg);
                }
            }
            cursor = controller.trace.length;
            const started = Date.now();
            const player = players[view.index];
            const choice = player ? player.decide(view) : greedyDecide(view);
            if (view.index === seat) {
                decideMs.push(Date.now() - started);
                audit(view, choice, bag);
            }
            return choice;
        }, 2000);
        bag.rejection += played.logs.filter((line) => REJECTION.test(line)).length;
        const rows = handRows(played.trace);
        checkFans(rows, controller.seats.map((item) => item.que), controller.xzdd.__internals, bag);
        const row = rows && rows[seat];
        const total = rows ? rows.reduce((sum, item) => sum + item.score, 0) : 0;
        if (total !== 0) sumOff += 1;
        const side = countSide(row);
        scores.push(row ? row.score : 0);
        hu += side.hu;
        fangpao += side.fangpao;
        chadajiao += side.chadajiao;
        if (side.hu) {
            fanSum += side.fan;
            fanN += 1;
        }
        (rows || []).forEach((item, index) => {
            if (index === seat) return;
            const other = countSide(item);
            oppHands += 1;
            oppHu += other.hu;
            oppFangpao += other.fangpao;
        });
    }
    const mean = scores.reduce((sum, score) => sum + score, 0) / 4;
    return { seed, scores, mean, hu, fangpao, chadajiao, fanSum, fanN, oppHu, oppFangpao, oppHands, sumOff, bag, decideMs };
}

function ci(values) {
    const n = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
    const half = 1.96 * Math.sqrt(variance) / Math.sqrt(n);
    return { n, mean, low: mean - half, high: mean + half };
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, index)];
}

function report(rows) {
    const hands = rows.length * 4;
    const bag = emptyBag();
    for (const row of rows) addBag(bag, row.bag);
    const oppHands = rows.reduce((sum, row) => sum + row.oppHands, 0);
    return {
        score: ci(rows.map((row) => row.mean)),
        huRate: rows.reduce((sum, row) => sum + row.hu, 0) / hands,
        fangpaoRate: rows.reduce((sum, row) => sum + row.fangpao, 0) / hands,
        chadajiaoRate: rows.reduce((sum, row) => sum + row.chadajiao, 0) / hands,
        oppHuRate: oppHands ? rows.reduce((sum, row) => sum + row.oppHu, 0) / oppHands : 0,
        oppFangpaoRate: oppHands ? rows.reduce((sum, row) => sum + row.oppFangpao, 0) / oppHands : 0,
        meanFan: (() => {
            const n = rows.reduce((sum, row) => sum + row.fanN, 0);
            const fan = rows.reduce((sum, row) => sum + row.fanSum, 0);
            return n ? fan / n : 0;
        })(),
        scoreSumNotZero: rows.reduce((sum, row) => sum + row.sumOff, 0),
        bag,
    };
}

function timing(rows) {
    const times = rows.flatMap((row) => row.decideMs);
    return { n: times.length, p50: percentile(times, 50), p95: percentile(times, 95), p99: percentile(times, 99), over250: times.filter((t) => t > 250).length, max: times.length ? Math.max(...times) : 0 };
}

async function main() {
    const suite = arg('--suite', 'full-vs-greedy');
    const walls = Number(arg('--walls', '2'));
    const workers = Number(arg('--workers', '1'));
    const seedBase = Number(arg('--seed-base', '1'));
    const out = arg('--out', '');
    const options = {
        variant: arg('--variant', ''),
        K: Number(arg('--k', '0')) || 0,
        persona: arg('--persona', ''),
        oppPersona: arg('--opp-persona', ''),
        plan: arg('--plan', '') ? JSON.parse(arg('--plan', '')) : undefined,
    };
    if (!SUITES[suite]) throw new Error(`未知套件 ${suite}`);
    const started = Date.now();
    const chunks = Math.min(workers, walls);
    const tasks = [];
    for (let i = 0; i < chunks; i += 1) {
        const from = Math.floor(i * walls / chunks);
        const to = Math.floor((i + 1) * walls / chunks);
        if (chunks === 1) {
            const rows = [];
            for (let w = from; w < to; w += 1) rows.push(playWall(seedBase + w, suite, options));
            tasks.push(rows);
        } else {
            tasks.push(new Promise((resolve, reject) => {
                const worker = new Worker(new URL(import.meta.url), { workerData: { from, to, seedBase, suite, options } });
                worker.on('message', resolve);
                worker.on('error', reject);
            }));
        }
    }
    const parts = await Promise.all(tasks);
    const rows = parts.flat().sort((a, b) => a.seed - b.seed);
    const summary = report(rows);
    const decide = timing(rows);
    for (const row of rows) delete row.decideMs;
    // 汇总文件只放确定的内容（E8 逐字节比较）；耗时、并行数、机器另存。
    const body = { suite, walls, seedBase, options, summary, rows };
    const run = { suite, walls, seedBase, options, workers: chunks, ms: Date.now() - started, cores: availableParallelism(), cpu: cpus()[0]?.model || '', node: process.version, decide };
    if (out) {
        writeFileSync(out, `${JSON.stringify(body)}\n`);
        writeFileSync(out.replace(/\.json$/, '') + '.timing.json', `${JSON.stringify(run, null, 1)}\n`);
    }
    console.log(JSON.stringify({ ...run, summary }));
}

if (!isMainThread) {
    const rows = [];
    for (let w = workerData.from; w < workerData.to; w += 1) rows.push(playWall(workerData.seedBase + w, workerData.suite, workerData.options));
    parentPort.postMessage(rows);
} else if (process.argv[1] && process.argv[1].endsWith('scmj-bench.mjs')) {
    await main();
}
