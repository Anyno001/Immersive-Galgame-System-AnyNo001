import { stableHash } from './danmaku-pools.js';
import { LIVE_SKIN_LINES } from './live-skin-lines.js';

// 暗网直播间皮肤的纯逻辑：平台栏解析后的皮肤选择、设置规范化、观众代号与转账 / 竞价数字的稳定生成。
// 代号与数字只由观众名（和直播间种子）哈希得出，同一观众每次都一样；不产生任何剧情文字。
// DOM 与计时在 live-skin-nodes.js，样式在 live-skin-style.js。
export const LIVE_SKINS = Object.freeze(['terminal', 'cctv', 'auction']);
export const LIVE_SKIN_LABELS = Object.freeze({ terminal: '终端', cctv: '监控', auction: '拍卖' });
export const LIVE_TERMINAL_TONES = Object.freeze(['green', 'amber']);
export const LIVE_TERMINAL_TONE_LABELS = Object.freeze({ green: '磷光绿', amber: '琥珀' });
const PROMPT_MAX = 300;

// 直播提示词里「平台」一栏的写法说明；设置里可改，留空或与默认相同即用默认。
export const LIVE_PLATFORM_DEFAULT_PROMPT = '平台一栏可省；只有地下、违禁、见不得光的直播才写：暗网（用默认风格）或 暗网·终端（黑客）/ 暗网·监控（偷拍）/ 暗网·拍卖（会所竞拍）。普通直播不写';

const pick = (list, value, fallback) => (list.includes(value) ? value : fallback);

// 直播设置里与皮肤相关的字段：默认暗网子风格、终端配色、固定暗网开关、平台栏写法。
export function normalizeLiveSkinSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const prompt = String(src.platformPrompt || '').trim().slice(0, PROMPT_MAX);
    return {
        darkSkin: pick(LIVE_SKINS, src.darkSkin, 'auction'),
        darkAll: src.darkAll === true,
        terminalTone: pick(LIVE_TERMINAL_TONES, src.terminalTone, 'green'),
        platformPrompt: prompt === LIVE_PLATFORM_DEFAULT_PROMPT ? '' : prompt,
    };
}

export function livePlatformPromptOf(live) {
    const own = live && typeof live.platformPrompt === 'string' ? live.platformPrompt.trim() : '';
    return own || LIVE_PLATFORM_DEFAULT_PROMPT;
}

// 平台栏 + 设置 → 皮肤。platform 取自标签：terminal / cctv / auction 直接指定，dark 用默认子风格，空则看「固定暗网」开关。
export function resolveLiveSkin(platform, liveSettings) {
    const cfg = normalizeLiveSkinSettings(liveSettings);
    const key = String(platform || '');
    let skin = '';
    if (LIVE_SKINS.includes(key)) skin = key;
    else if (key === 'dark' || cfg.darkAll) skin = cfg.darkSkin;
    return { skin, tone: skin === 'terminal' ? cfg.terminalTone : '' };
}

// 给 live 对象补上 skin / tone；没有皮肤时不带这两个字段，也不改原对象。
export function withLiveSkin(live, liveSettings) {
    if (!live || typeof live !== 'object') return live;
    const { skin, tone } = resolveLiveSkin(live.platform, liveSettings);
    const { skin: oldSkin, tone: oldTone, ...rest } = live;
    if (!skin) return oldSkin || oldTone ? rest : live;
    if (oldSkin === skin && (oldTone || '') === tone) return live;
    return { ...rest, skin, ...(tone ? { tone } : {}) };
}

export function skinOf(live) {
    return live && LIVE_SKINS.includes(live.skin) ? live.skin : '';
}

// 观众代号：哈希 ID / V-编号 / №编号。
export function skinCode(skin, user) {
    const h = stableHash(`${skin}|${user}`);
    if (skin === 'terminal') return `#${(h & 0xffff).toString(16).padStart(4, '0')}`;
    if (skin === 'cctv') return `V-${String(h % 10000).padStart(4, '0')}`;
    return `№${String(1 + (h % 99)).padStart(2, '0')}`;
}

// 评论区里的名字：普通观众用代号，主播与房管用各风格的固定称呼。
export function skinLabel(skin, msg) {
    if (msg && msg.type === 'host') return skin === 'terminal' ? '[主播]' : skin === 'cctv' ? String(msg.user || '主播') : '主';
    if (msg && msg.type === 'admin') return skin === 'terminal' ? '[系统]' : skin === 'cctv' ? '系统' : '司仪';
    return skinCode(skin, msg && msg.user);
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
export function onionAddress(seed, length = 16) {
    let h = stableHash(`onion|${seed}`) || 1;
    let out = '';
    for (let i = 0; i < length; i += 1) {
        h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
        out += B32[(h >>> 24) % 32];
    }
    return `${out}.onion`;
}

export function shortHash(seed) {
    const a = stableHash(`h1|${seed}`).toString(16).padStart(8, '0');
    const b = stableHash(`h2|${seed}`).toString(16).padStart(8, '0');
    return `${a.slice(0, 4)}…${b.slice(-4)}`;
}

const GUARD_VALUE = Object.freeze({ 总督: 20000, 提督: 5000, 舰长: 1000 });

// 一条打赏折成的基础数值：醒目留言取金额，上舰按档，礼物按数量乘稳定单价。
export function tipValue(msg) {
    const type = msg && msg.type;
    if (type === 'sc') {
        const n = Number(String(msg.extra || '').replace(/[^\d.]/g, ''));
        return Math.max(30, Math.round(n) || 30);
    }
    if (type === 'guard') {
        const text = String(msg.extra || msg.text || '');
        const level = Object.keys(GUARD_VALUE).find((key) => text.includes(key)) || '舰长';
        return GUARD_VALUE[level];
    }
    const count = Math.max(1, Math.min(9999, Number(String(msg && msg.extra || '').replace(/[^\d]/g, '')) || 1));
    return count * (20 + (stableHash(String(msg && msg.text || '')) % 80));
}

// 拍卖：一次打赏折成的加价，取整到千，上限 3 万。
export function auctionRaise(value) {
    return Math.min(30000, Math.max(1000, Math.round((Number(value) || 0) * 10 / 1000) * 1000));
}

const thousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 数字显示：终端为 NXC 两位小数，监控为整数，拍卖为千分位（compact 时 ≥1 万写成 N.N万）。
export function formatSkinAmount(skin, raw, compact = false) {
    const n = Number(raw) || 0;
    if (skin === 'terminal') return (n / 100).toFixed(2);
    if (skin === 'auction') {
        if (compact && n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万`;
        return thousands(n);
    }
    return String(Math.round(n));
}

// 榜单：[{ code, value }]。终端 / 监控累加，拍卖取最高出价。
export function seedBoard(skin, key) {
    const h = stableHash(`board|${skin}|${key}`);
    const values = skin === 'terminal' ? [60 + (h % 40), 40 + (h % 20), 20 + (h % 15)]
        : skin === 'cctv' ? [300 + (h % 300), 200 + (h % 100), 100 + (h % 80)]
            : [50000 + (h % 10) * 1000, 47000 + (h % 5) * 500, 44000 + (h % 4) * 500];
    return values.map((value, i) => ({ code: skinCode(skin, `${key}#${i}`), value }));
}

export function boardAdd(board, skin, code, value) {
    const list = board.map((row) => ({ ...row }));
    const row = list.find((item) => item.code === code);
    if (row) row.value = skin === 'auction' ? Math.max(row.value, value) : row.value + value;
    else list.push({ code, value });
    list.sort((a, b) => b.value - a.value);
    return list.slice(0, 6);
}

export function boardTop(board, count = 3) {
    return board.slice(0, count);
}

// 转账 / 打赏 / 加价条的文字：每行一组，首项是界面字，其余是数字与代号。
export function tipLines(skin, { code, value, seq = 0, raise = 0, lead = false }) {
    if (skin === 'terminal') return [['转账', '已确认', `+${formatSkinAmount('terminal', value)} NXC`], ['哈希', shortHash(`${code}|${seq}`), '来自', code]];
    if (skin === 'cctv') return [['收到打赏', code, `+${value}`]];
    return [[code, '加价', `+${thousands(raise)}`, ...(lead ? ['领先'] : [])]];
}

export function clockText(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    const h = Math.floor(total / 3600);
    return `${h ? `${pad(h)}:` : ''}${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export function timecode(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

// 摄像头编号：由主播与标题得出，固定。
export function camNumber(seed) {
    return String(1 + (stableHash(`cam|${seed}`) % 16)).padStart(2, '0');
}

// 本地路人弹幕的皮肤口吻：按概率出一条，没有则返回空串。rng 用调用方传入的以保持可复现。
export const LIVE_SKIN_FLAVOR_CHANCE = 0.3;
const EDGY_CHANCE = 0.25;
export function skinFlavorLine(skin, rng, blockHostile = false) {
    const set = LIVE_SKIN_LINES[skin];
    if (!set || rng() >= LIVE_SKIN_FLAVOR_CHANCE) return '';
    const pool = !blockHostile && rng() < EDGY_CHANCE ? set.edgy : set.plain;
    return pool[Math.floor(rng() * pool.length) % pool.length] || '';
}
