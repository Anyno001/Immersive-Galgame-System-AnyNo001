// 进食演出的纯模型：反应词、食物 / 饮品识别、分镜节拍表与物品卡动作换算；不操作 DOM。
// 分镜由漫画符号逐拍组成（期待 → 啊呜 → 咀嚼 → 咕咚 → 反应），每拍可带拟声字与立绘动作。
import { inventoryIconKey } from './record-icons.js';

export const EAT_REACTIONS = Object.freeze({
    好吃: 'yum', 美味: 'yum', 甜: 'sweet', 辣: 'spicy', 烫: 'hot', 酸: 'sour', 苦: 'bitter', 难吃: 'bitter',
    噎: 'choke', 噎住: 'choke', 饱: 'full', 吃饱: 'full', 喂: 'feed', 被喂: 'fed',
});

export function eatReactionOf(word) {
    const key = String(word || '').trim();
    return Object.hasOwn(EAT_REACTIONS, key) ? EAT_REACTIONS[key] : 'yum';
}

const DRINK_RE = /(茶|咖啡|拿铁|奶昔|牛奶|酸奶|豆浆|果汁|饮料|饮品|汽水|可乐|苏打|啤酒|红酒|白酒|清酒|烧酒|米酒|香槟|鸡尾酒|葡萄酒|酒|药水|魔药|药剂|矿泉水|开水|热水|冰水|可可|椰汁|^水$)/;
const NOT_DRINK_RE = /(汤圆|酒心|茶叶蛋|酒酿圆子)/;
const FOOD_RE = /(寿司|拉面|面条|泡面|意面|乌冬|荞麦面|章鱼烧|泡芙|布丁|冰淇淋|雪糕|团子|丸子|包子|饺子|馒头|汉堡|披萨|薯条|薯片|零食|甜点|甜品|月饼|粽子|蛋糕|年糕|糕点|饼干|煎饼|糖果|棒棒糖|果冻|水果|坚果|粥|饭|便当|饭团|面包|吐司|三明治|点心|巧克力|烤肉|炸鸡|肉串|烤串|沙拉|汤|苹果|草莓|葡萄|桃子|梨|橘子|橙子|香蕉|西瓜|樱桃|蜜柑)/;
const EDIBLE_KEYS = new Set(['cup', 'food', 'potion', 'pill']);
const DRINK_KEYS = new Set(['cup', 'potion']);

export function isDrinkName(name) {
    const text = String(name || '').trim();
    if (!text || NOT_DRINK_RE.test(text)) return false;
    return DRINK_KEYS.has(inventoryIconKey(text)) || DRINK_RE.test(text);
}

// 背包图标已认出别的类别（钥匙、衣服……）就不当食物；认不出时再按常见食物词判断。
export function isFoodName(name) {
    const text = String(name || '').trim();
    if (!text) return false;
    const key = inventoryIconKey(text);
    if (EDIBLE_KEYS.has(key)) return true;
    return key === 'generic' && (FOOD_RE.test(text) || isDrinkName(text));
}

// 节拍：at 为相对开始的毫秒，kind 为漫画符号，onoma 为拟声字，motion 为立绘动作（bite / chew / hop / shake / dip / sway）。
const beat = (at, kind, life, onoma = '', motion = '') => ({ at, kind, life, onoma, motion });

const ENDINGS = Object.freeze({
    yum: [beat(0, 'bloom', 1300, '幸福～', 'hop')],
    sweet: [beat(0, 'heart', 1200, '甜～', 'hop'), beat(250, 'bloom', 1050)],
    spicy: [beat(0, 'spicy', 1100, '哈——', 'shake'), beat(250, 'sweat', 900)],
    hot: [beat(0, 'steam', 1200, '呼呼', 'shake'), beat(300, 'sweat', 900)],
    sour: [beat(0, 'sour', 1200, '呜……', 'dip')],
    bitter: [beat(0, 'gloom', 1100, '呃……', 'dip'), beat(450, 'sigh', 900)],
    full: [beat(0, 'full', 1300, '呼～', 'hop')],
    fed: [beat(0, 'bloom', 1200, '', 'hop'), beat(200, 'heart', 1100)],
});

// 吃：期待 → 啊呜 → 嚼嚼 → 咕咚 → 反应；噎住时咕咚换成「唔！」再咽下去。
function eatingBeats(reaction) {
    const lead = reaction === 'fed'
        ? [beat(0, 'blush', 900, ''), beat(200, 'sweat', 700)]
        : [beat(0, 'sparkle', 600), beat(150, 'drool', 650, '嘶溜')];
    const bite = [beat(750, 'chomp', 500, '啊呜', 'bite'), beat(1250, 'munch', 1100, '嚼嚼', 'chew')];
    const swallow = reaction === 'choke'
        ? [beat(2350, 'surprise', 700, '唔！', 'shake'), beat(3000, 'gulp', 500, '咕咚')]
        : [beat(2350, 'gulp', 450, '咕咚')];
    const endAt = reaction === 'choke' ? 3500 : 2800;
    const ending = reaction === 'choke' ? [beat(0, 'sigh', 1000, '呼……', 'dip')] : (ENDINGS[reaction] || ENDINGS.yum);
    return [...lead, ...bite, ...swallow, ...ending.map((b) => ({ ...b, at: b.at + endAt }))];
}

// 喝：期待 → 咕嘟咕嘟 → 噗哈～（或按反应收尾）。
function drinkingBeats(reaction) {
    const lead = reaction === 'fed' ? [beat(0, 'blush', 800)] : [beat(0, 'sparkle', 600)];
    const gulps = [beat(600, 'bubbles', 1300, '咕嘟咕嘟', 'chew')];
    const ending = reaction === 'yum' || reaction === 'full' ? [beat(0, 'full', 1200, '噗哈～', 'hop')]
        : reaction === 'choke' ? [beat(0, 'surprise', 800, '咳咳！', 'shake'), beat(400, 'sweat', 700)]
            : (ENDINGS[reaction] || ENDINGS.yum);
    return [...lead, ...gulps, ...ending.map((b) => ({ ...b, at: b.at + 1950 }))];
}

// 喂对方：说话人举着食物说「啊～」，再冒一颗心；吃的是画面外的对方，所以不播咀嚼。
const FEEDING_BEATS = Object.freeze([beat(0, 'aah', 1600, '', 'sway'), beat(1350, 'heart', 1000)]);

export function planEatBeats(eat, { reduced = false } = {}) {
    const food = String((eat && eat.food) || '').trim();
    const reaction = eatReactionOf(eat && eat.reaction);
    const drink = isDrinkName(food);
    const beats = reaction === 'feed' ? FEEDING_BEATS.map((b) => ({ ...b }))
        : drink ? drinkingBeats(reaction) : eatingBeats(reaction);
    // 减弱动态时只留最后的反应符号，不动立绘。
    if (reduced) return beats.slice(-1).map((b) => ({ ...b, at: 0, motion: '' }));
    return beats;
}

export function eatItemAction(name) {
    return isDrinkName(name) ? 'drink' : 'eat';
}

// 物品卡：食物被「失去 / 使用」时改成吃掉 / 喝掉；本页的进食标签补一张卡（同名物品只改动作不重复）。
export function applyEatToItems(fx, { itemOn = false, eatOn = false, max = 3 } = {}) {
    if (!fx || !Array.isArray(fx.items)) return fx;
    if (itemOn) {
        for (const item of fx.items) {
            if ((item.action === 'lose' || item.action === 'use') && isFoodName(item.name)) item.action = eatItemAction(item.name);
        }
    }
    if (!eatOn) return fx;
    for (const entry of Array.isArray(fx.daily) ? fx.daily : []) {
        if (!entry || entry.type !== 'eat' || !entry.food) continue;
        const action = eatItemAction(entry.food);
        const same = fx.items.find((item) => String(item.name || '').trim() === entry.food);
        if (same) { if (same.action !== 'gain') same.action = action; continue; }
        if (fx.items.length < max) fx.items.push({ action, name: entry.food, description: '' });
    }
    return fx;
}
