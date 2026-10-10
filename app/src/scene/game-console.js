// 在家玩游戏机：日常演出标签的解析 + 「电视 / 游戏机」常驻氛围层的地点词。
// 纯数据与纯函数，不碰 DOM、不碰音频；渲染见 visual/igs-ui/fx-daily-game.js，音效见 fx-daily-game-sfx.js。
// 四个单次标签：开机 console、双人对战 versus、连击狂按 combo、抢手柄耍赖 snatch；胜负沿用已有的 game 标签。
export const GAME_FX_KINDS = Object.freeze(['console', 'versus', 'combo', 'snatch']);

// 地点里出现这些词，就挂上屏幕光映在脸上的氛围层（房间偏暗），环境音同步出游戏 BGM 与手柄咔嗒声。
// 「客厅」「卧室」太宽，不单独触发；正文里打游戏靠 console 标签点亮同样的画面。
export const GAME_AMBIENCE_WORDS = Object.freeze(['游戏机', '游戏房', '游戏室', '游戏厅', '电玩', '街机', '掌机', 'switch', 'ps5', 'ps4', 'xbox']);

const text = (value) => String(value == null ? '' : value).trim();

// 血量 / 比分条：认 0–100 的数字（可带 %），写错或没写按满血。
export function gameHpOf(value) {
    const m = text(value).match(/\d+(?:\.\d+)?/);
    if (!m) return 100;
    return Math.max(0, Math.min(100, Math.round(Number(m[0]))));
}

// 返回 fx-directives 统一的参数数组；字段写错按最宽松的合法形式处理。
export function parseGameFxBody(type, fields) {
    const [a = '', b = '', c = '', d = ''] = (fields || []).map(text);
    switch (type) {
    // 开机：游戏名、平台都可省（省了只有开机画面）。
    case 'console': return ['console', a.slice(0, 16), b.slice(0, 10)];
    // 双人对战：1P、2P 名字可省（默认 1P / 2P），血量可省（默认满血）。
    // 第二栏就是数字、后面不满四栏时（如 versus|林小雨|60|20）视为省了 2P 名字，其后依次是 1P 与 2P 血量。
    case 'versus': {
        const shifted = /^\d+%?$/.test(b) && !d;
        const [n2, h1, h2] = shifted ? ['', b, c] : [b, c, d];
        return ['versus', a.slice(0, 8), n2.slice(0, 8), String(gameHpOf(h1)), String(gameHpOf(h2))];
    }
    // 连击：数字取 2–999，没写数字按「狂按」；后面可带游戏里的招式名。
    case 'combo': {
        const n = Number.parseInt(a, 10);
        return ['combo', n >= 2 ? String(Math.min(999, n)) : '', b.slice(0, 8)];
    }
    // 抢手柄 / 耍赖：动作字样可省（默认「抢手柄」），角色名可省。
    case 'snatch': return ['snatch', a.slice(0, 8), b];
    default: return null;
    }
}

export function gameFxOf(args) {
    const [type, a = '', b = '', c = '', d = ''] = args || [];
    switch (type) {
    case 'console': return { type, game: a, platform: b };
    case 'versus': return { type, p1: a, p2: b, hp1: Number(c), hp2: Number(d) };
    case 'combo': return { type, count: Number(a) || 0, move: b };
    case 'snatch': return { type, act: a, who: b };
    default: return null;
    }
}
