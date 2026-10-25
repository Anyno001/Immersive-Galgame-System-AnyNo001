// 幼麟原文件（临时目录里直接 require）和工厂实例打同一套决策，比较每次调用后的消息。
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { createScmjHost, mulberry32 } from '../src/visual/igs-ui/scmj/host.js';
import { greedyDecide } from './scmj-players.mjs';

const require = createRequire(import.meta.url);
const vendor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/visual/igs-ui/scmj/vendor/babykylin');

const proxy = `module.exports = new Proxy({}, {
    get(_target, key) {
        const source = global.__SCMJ_BRIDGE['__SLOT__'];
        const value = source[key];
        return typeof value === 'function' ? value.bind(source) : value;
    },
});
`;

function isJiang(id) {
    return [1, 4, 7, 9, 13, 16, 18, 21, 25].includes(id);
}

// 贪心出牌很难做成将对。覆盖统计在主比较之后用这套确定性打法补，两边引擎仍走同一决策。
export function jiangDecide(view) {
    if (view.pending === 'huan') {
        const groups = [[], [], []];
        for (const id of view.holds) groups[id < 9 ? 0 : id < 18 ? 1 : 2].push(id);
        const options = groups.filter((ids) => ids.length >= 3).map((ids) => ({
            ids: ids.slice().sort((a, b) => Number(isJiang(b)) - Number(isJiang(a)) || a - b),
        }));
        options.sort((a, b) => b.ids.length - a.ids.length);
        return { huan: options[0].ids.slice(0, 3) };
    }
    if (view.pending === 'dingque') {
        const n = [0, 0, 0];
        for (const id of view.holds) if (isJiang(id)) n[id < 9 ? 0 : id < 18 ? 1 : 2] += 1;
        let que = 0;
        for (let i = 1; i < 3; i += 1) if (n[i] < n[que]) que = i;
        return { que };
    }
    if (view.pending === 'action') {
        if (view.action.hu) {
            const tiles = view.holds.concat(view.pengs, view.angangs, view.diangangs, view.wangangs);
            if (!tiles.includes(view.action.pai)) tiles.push(view.action.pai);
            if (tiles.every(isJiang)) return { hu: true };
            return { guo: true };
        }
        if (view.action.gang && isJiang(Math.min(...view.action.gangpai))) return { gang: true, pai: Math.min(...view.action.gangpai) };
        if (view.action.peng && isJiang(view.action.pai)) return { peng: true };
        return { guo: true };
    }
    const queSuit = ['p', 's', 'm'][view.que];
    const queIds = queSuit ? view.holds.filter((id) => (id < 9 ? 'p' : id < 18 ? 's' : 'm') === queSuit) : [];
    if (queIds.length) return { dapai: Math.min(...queIds) };
    const junk = view.holds.filter((id) => !isJiang(id));
    const pool = junk.length ? junk : view.holds;
    return { dapai: Math.min(...pool) };
}

// 天胡、地胡搜索用的决策：能胡就胡，其余与贪心基线相同。种子 1135 出天胡，种子 47 出地胡。
export function claimDecide(view) {
    if (view.pending === 'action' && view.action.hu) return { hu: true };
    return greedyDecide(view);
}

function scriptedDecide(seed) {
    const rng = mulberry32((seed + 0x9e3779b9) >>> 0);
    return (view) => {
        if (view.pending !== 'action') return greedyDecide(view);
        const action = view.action;
        const roll = rng();
        if (action.hu) return roll < 0.62 ? { hu: true } : { guo: true };
        if (action.gang && roll < 0.7) return { gang: true, pai: Math.min(...action.gangpai) };
        if (action.peng && roll < ([1, 4, 7].includes(action.pai % 9) ? 0.95 : 0.4)) return { peng: true };
        return { guo: true };
    };
}

async function prepareOriginal() {
    const root = await mkdtemp(path.join(tmpdir(), 'scmj-orig-'));
    const game = path.join(root, 'game');
    await mkdir(game);
    await mkdir(path.join(root, 'utils'));
    await copyFile(path.join(vendor, 'gamemgr_xzdd.js'), path.join(game, 'gamemgr_xzdd.js'));
    await copyFile(path.join(vendor, 'mjutils.js'), path.join(game, 'mjutils.js'));
    await writeFile(path.join(game, 'roommgr.js'), proxy.replace('__SLOT__', 'roommgr'));
    await writeFile(path.join(game, 'usermgr.js'), proxy.replace('__SLOT__', 'usermgr'));
    await writeFile(path.join(root, 'utils/crypto.js'), proxy.replace('__SLOT__', 'crypto'));
    await writeFile(path.join(root, 'utils/db.js'), proxy.replace('__SLOT__', 'db'));
    return { root, xzddPath: path.join(game, 'gamemgr_xzdd.js'), mjPath: path.join(game, 'mjutils.js') };
}

function playFactory(seed, decide, conf) {
    return createScmjController({ seed, random: mulberry32(seed), conf }).play(decide);
}

function playOriginal(paths, seed, decide, conf) {
    const host = createScmjHost({ random: mulberry32(seed), conf });
    global.__SCMJ_BRIDGE = { roommgr: host.roommgr, usermgr: host.usermgr, db: host.db, crypto: host.crypto };
    const savedTimeout = global.setTimeout;
    const savedInterval = global.setInterval;
    const savedRandom = Math.random;
    const savedLog = console.log;
    global.setTimeout = (fn) => host.setTimeout(fn);
    global.setInterval = () => 0;
    Math.random = host.Math.random;
    console.log = (...args) => host.console.log(...args);
    try {
        delete require.cache[paths.xzddPath];
        delete require.cache[paths.mjPath];
        const xzdd = require(paths.xzddPath);
        return createScmjController({ host, xzdd, seed, conf }).play(decide);
    } finally {
        global.setTimeout = savedTimeout;
        global.setInterval = savedInterval;
        Math.random = savedRandom;
        console.log = savedLog;
    }
}

function firstDiff(left, right) {
    const count = Math.max(left.length, right.length);
    for (let i = 0; i < count; i += 1) {
        const a = JSON.stringify(left[i]);
        const b = JSON.stringify(right[i]);
        if (a !== b) return i;
    }
    return -1;
}

export function collectCoverage(trace) {
    const bag = {};
    for (const step of trace) {
        let huInCall = 0;
        for (const msg of step.messages) {
            if (msg.event === 'hu_push') huInCall += 1;
            if (msg.event === 'guohu_push') bag.guohu_push = (bag.guohu_push || 0) + 1;
            if (msg.event === 'game_huanpai_over_push') bag[`huan-${msg.data.method}`] = (bag[`huan-${msg.data.method}`] || 0) + 1;
            if (msg.event === 'game_over_push') {
                for (const row of msg.data.results || []) {
                    if (row.pattern) bag[`pattern-${row.pattern}`] = (bag[`pattern-${row.pattern}`] || 0) + 1;
                    for (const key of ['qingyise', 'menqing', 'zhongzhang', 'jingouhu', 'haidihu', 'tianhu', 'dihu']) {
                        if (row[key]) bag[key] = (bag[key] || 0) + 1;
                    }
                    for (const action of row.actions || []) bag[action.type] = (bag[action.type] || 0) + 1;
                }
            }
        }
        if (huInCall > 1) bag.yipaoduoxiang = (bag.yipaoduoxiang || 0) + 1;
    }
    return bag;
}

export const COVERAGE_KEYS = [
    'zimo', 'hu', 'ganghua', 'dianganghua', 'gangpaohu', 'qiangganghu',
    'chadajiao', 'beichadajiao', 'angang', 'wangang', 'diangang', 'fanggang',
    'zhuanshougang', 'maozhuanyu', 'yipaoduoxiang', 'guohu_push',
    'haidihu', 'jingouhu', 'qingyise', 'pattern-7pairs',
    'pattern-duidui', 'pattern-jiangdui', 'menqing', 'zhongzhang',
    'huan-0', 'huan-1', 'huan-2',
];

export async function runDiff(options = {}) {
    const matches = options.matches || 1;
    const seedBase = options.seedBase || 1;
    const conf = options.conf;
    const paths = await prepareOriginal();
    const coverage = {};
    try {
        for (let i = 0; i < matches; i += 1) {
            const seed = (seedBase + i) >>> 0;
            const make = options.makeDecide || (() => options.decide || scriptedDecide(seed));
            const factory = playFactory(seed, make(), conf);
            const original = playOriginal(paths, seed, make(), conf);
            const at = firstDiff(factory.trace, original.trace);
            if (at >= 0) {
                return {
                    ok: false,
                    seed,
                    at,
                    factory: factory.trace[at],
                    original: original.trace[at],
                    coverage,
                };
            }
            const found = collectCoverage(factory.trace);
            for (const [key, value] of Object.entries(found)) coverage[key] = (coverage[key] || 0) + value;
        }
        if (options.untilCovered && COVERAGE_KEYS.some((key) => !coverage[key])) {
            for (let i = 0; i < options.untilCovered && COVERAGE_KEYS.some((key) => !coverage[key]); i += 1) {
                const seed = (seedBase + 100000 + i) >>> 0;
                const factory = playFactory(seed, jiangDecide, conf);
                const original = playOriginal(paths, seed, jiangDecide, conf);
                const at = firstDiff(factory.trace, original.trace);
                if (at >= 0) return { ok: false, seed, at, factory: factory.trace[at], original: original.trace[at], coverage };
                const found = collectCoverage(factory.trace);
                for (const [key, value] of Object.entries(found)) coverage[key] = (coverage[key] || 0) + value;
            }
        }
        const missing = COVERAGE_KEYS.filter((key) => !coverage[key]);
        return { ok: missing.length === 0, missing, coverage, matches };
    } finally {
        await rm(paths.root, { recursive: true, force: true });
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const matches = Number(process.env.SCMJ_DIFF_MATCHES || process.argv[2] || 3);
    const started = Date.now();
    const result = await runDiff({ matches });
    console.log(JSON.stringify({ ...result, ms: Date.now() - started }, null, 2).slice(0, 4000));
    if (!result.ok) process.exit(1);
}
