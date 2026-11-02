// PR #18 的有意改动：3 槽盲翻时，原版出杂物（keepsake）的槽位按档位卡牌率有一部分改出卡牌。
// 差分测试用它把这类槽位对换成同一个占位，其余字段仍逐项比对；返回 [原版, 本版] 与替换的槽位数。
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'mythic'];
const isSlot = (value) => value && typeof value === 'object' && !Array.isArray(value) && typeof value.kind === 'string' && typeof value.rarity === 'string';

export function maskCardPromotions(orig, mine, { ignoreUpgrade = false } = {}) {
    let promoted = 0;
    const walk = (a, b) => {
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return [a, b];
            const out = a.map((item, index) => walk(item, b[index]));
            return [out.map((pair) => pair[0]), out.map((pair) => pair[1])];
        }
        if (isSlot(a) && isSlot(b)) {
            if (a.kind === 'keepsake' && b.kind === 'card') {
                if (!RARITIES.includes(b.rarity) || !Number.isInteger(b.cost) || b.cost < 0 || b.cost > 3) throw new Error('提升出的卡牌槽位字段不合法');
                promoted += 1;
                return ['promoted-card', 'promoted-card'];
            }
            if (ignoreUpgrade) {
                const { rarity: ra, count: ca, ...restA } = a;
                const { rarity: rb, count: cb, ...restB } = b;
                return [restA, restB];
            }
        }
        if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
            const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
            const left = {};
            const right = {};
            for (const key of keys) {
                const [x, y] = walk(a[key], b[key]);
                if (key in a) left[key] = x;
                if (key in b) right[key] = y;
            }
            return [left, right];
        }
        return [a, b];
    };
    const [left, right] = walk(orig, mine);
    return { orig: left, mine: right, promoted };
}
