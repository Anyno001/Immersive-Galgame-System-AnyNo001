// 战斗随机数：FNV-1a 字符串哈希 + mulberry32 风格的纯函数 PRNG。
// 状态就是一个 32 位整数，每次取值返回新状态，战斗因此可以靠「种子 + 动作序列」重放。

// FNV-1a 32 位哈希，空值按空串处理。
export function hash32(input) {
    const text = String(input ?? '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

// 哈希后转 36 进制短串，用作稳定的短标识。
export function hashString(input) {
    return hash32(input).toString(36);
}

// 取一个 [0,1) 的随机数，返回 { value, state }；state 传给下一次调用。
export function nextRandom(state) {
    const next = state + 1831565813 >>> 0;
    let mixed = Math.imul(next ^ next >>> 15, next | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return { value: ((mixed ^ mixed >>> 14) >>> 0) / 4294967296, state: next };
}

// 取 [0, bound) 的整数，bound 至少按 1 算。
export function randomInt(state, bound) {
    const { value, state: next } = nextRandom(state);
    return { value: Math.floor(value * Math.max(1, bound)), state: next };
}
