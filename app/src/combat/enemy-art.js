import { hash32 } from './random.js';

// 敌人外观格位：通用敌人图集（visual/igs-ui/combat-enemy-art.js）的格位键。数组顺序就是图集格序：
// 前 ENEMY_ART_BASE_COUNT 个是西幻、都市、武侠三套图集共有的基础格，其后是只在西幻图集里的物种与种族。
// 只能在末尾追加，不得删改或换序：已入库档案的 art 按键名校验，图集按序号取格。
export const ENEMY_ART_KEYS = Object.freeze([
    'grunt-m', 'grunt-f', 'elite-m', 'elite-f', 'caster-m', 'caster-f', 'assassin-m', 'assassin-f', 'chief-m', 'chief-f', 'boss-m', 'boss-f',
    'beast', 'undead', 'demon', 'giant', 'golem', 'swarm',
    'dragon', 'wyvern', 'serpent', 'basilisk', 'goblin', 'slime', 'ghost', 'orc', 'lizardfolk', 'werewolf', 'mimic', 'gargoyle',
    'elf-m', 'elf-f', 'fairy-m', 'fairy-f', 'dwarf-m', 'dwarf-f',
]);
export const ENEMY_ART_BASE_COUNT = 18;
export const isEnemyArtKey = (value) => typeof value === 'string' && ENEMY_ART_KEYS.includes(value);
// 敌人图集题材：每场遭遇一条，战斗准备时由副 LLM 按剧情与世界设定标注（encounter-theme）；只决定基础格取哪套图集，西幻独有格不受影响。
export const ENEMY_ART_THEMES = Object.freeze({ western: '西方奇幻', urban: '现代都市', wuxia: '古代武侠' });
export const isEnemyArtTheme = (value) => typeof value === 'string' && Object.hasOwn(ENEMY_ART_THEMES, value);

// 需要加「-m / -f」的类型；其余是物种，不分性别。
const GENDERED = Object.freeze({ grunt: '杂兵', elite: '精锐', caster: '术士', assassin: '刺客', chief: '头目', boss: '首领', elf: '精灵', fairy: '妖精', dwarf: '矮人' });
const SPECIES = Object.freeze({
    beast: '野兽', undead: '亡灵', demon: '妖魔', giant: '巨兽', golem: '傀儡或机械', swarm: '巨虫', dragon: '龙', wyvern: '飞龙', serpent: '巨蛇',
    basilisk: '蛇怪', goblin: '哥布林', slime: '史莱姆', ghost: '鬼魂', orc: '兽人', lizardfolk: '蜥蜴人', werewolf: '狼人', mimic: '宝箱怪', gargoyle: '石像鬼',
});

// 副 LLM 的格位目录（generation.js 的 enemy 提示）。
export function enemyArtCatalogText() {
    const list = (table) => Object.entries(table).map(([key, label]) => `${key} ${label}`).join('、');
    return `人形写「类型-性别」（m 男、f 女）：${list(GENDERED)}；怪物只写物种：${list(SPECIES)}。`;
}

// 名称推断：只在没有合法 art 时使用（模板敌人、旧档案）。先认物种与种族，再认性别与人形类型；类型认不出时按名字哈希在档位候选里固定挑一格，同名永远同图。
// any：名字里出现即命中；tail：名字以它结尾才命中（单字物种词，避免误伤人名中间的字）。按顺序匹配，越具体越靠前。
const SPECIES_WORDS = Object.freeze([
    ['mimic', { any: ['宝箱怪', '拟态'] }],
    ['slime', { any: ['史莱姆', '黏液', '粘液', '软泥'] }],
    ['goblin', { any: ['哥布林', '地精'] }],
    ['gargoyle', { any: ['石像鬼'] }],
    ['werewolf', { any: ['狼人'] }],
    ['lizardfolk', { any: ['蜥蜴人', '蜥人'] }],
    ['orc', { any: ['半兽人', '兽人', '奥克'] }],
    ['basilisk', { any: ['蛇怪', '蜥蜴'] }],
    ['wyvern', { any: ['飞龙', '翼龙'] }],
    ['dragon', { any: ['巨龙', '恶龙', '魔龙'], tail: ['龙'] }],
    ['ghost', { any: ['幽灵', '鬼魂', '怨灵', '亡魂', '幽魂', '厉鬼', '恶鬼', '冤魂'] }],
    ['undead', { any: ['骷髅', '僵尸', '丧尸', '亡灵', '骸骨', '尸'] }],
    ['golem', { any: ['傀儡', '魔像', '石像', '机器人', '机甲', '机械', '人偶', '铜人'] }],
    ['giant', { any: ['巨人', '食人魔', '巨魔', '巨猿', '泰坦'] }],
    ['demon', { any: ['恶魔', '魔鬼', '妖魔', '魔物'], tail: ['妖', '魔', '怪'] }],
    ['serpent', { any: ['巨蟒', '大蛇'], tail: ['蛇', '蟒'] }],
    ['swarm', { any: ['蜘蛛', '蜈蚣', '螳螂', '蝎', '虫', '蚁'], tail: ['蜂'] }],
    ['beast', { any: ['野猪', '蝙蝠'], tail: ['狼', '犬', '狗', '虎', '豹', '熊', '狮', '狐', '兽', '獒', '鹰', '豺'] }],
]);
const RACE_WORDS = Object.freeze([['elf', ['精灵']], ['fairy', ['妖精', '仙灵']], ['dwarf', ['矮人']]]);
const FEMALE_WORDS = Object.freeze(['女', '娘', '姬', '妃', '婆', '姐', '妹', '母', '姑', '嫂', '妻', '夫人', '小姐', '公主', '皇后', '王后', '姥', '妞', '嬷', '婶']);
const TYPE_WORDS = Object.freeze([
    ['boss', ['魔王', '首领', '教主', '宫主', '门主', '盟主', '帮主', '女王', '魔君', '皇帝', '女帝', '魔帝', '大帝']],
    ['chief', ['头目', '头领', '队长', '统领', '老大', '寨主', '堂主', '舵主', '将军', '首脑']],
    ['caster', ['法师', '术士', '巫', '道士', '方士', '祭司', '萨满', '魔女', '灵媒', '异能', '咒']],
    ['assassin', ['刺客', '杀手', '暗杀', '忍者', '影卫', '暗卫']],
    ['elite', ['骑士', '侍卫', '护卫', '禁军', '精锐', '武士', '剑客', '剑士', '佣兵', '特工', '士兵', '卫兵']],
    ['grunt', ['盗', '匪', '贼', '喽啰', '混混', '流氓', '打手', '暴徒', '小兵', '卒']],
]);
const TIER_POOL = Object.freeze({ normal: ['grunt', 'caster', 'assassin'], elite: ['elite', 'chief'], boss: ['boss'] });
const hit = (text, { any = [], tail = [] }) => any.some((w) => text.includes(w)) || tail.some((w) => text.endsWith(w));

// 敌人外观格位：合法 art 原样返回；否则按名称推断。首领档的人形一律用首领格，物种不受档位影响。
export function enemyArtKeyFor({ art, name, tier } = {}) {
    if (isEnemyArtKey(art)) return art;
    const text = String(name || '').trim();
    for (const [key, words] of SPECIES_WORDS) if (hit(text, words)) return key;
    const gender = FEMALE_WORDS.some((w) => text.includes(w)) ? 'f' : 'm';
    const race = RACE_WORDS.find(([, words]) => words.some((w) => text.includes(w)));
    if (race) return `${race[0]}-${gender}`;
    const pool = TIER_POOL[tier] || TIER_POOL.normal;
    const typed = tier === 'boss' ? 'boss' : TYPE_WORDS.find(([, words]) => words.some((w) => text.includes(w)))?.[0];
    return `${typed || pool[hash32(text) % pool.length]}-${gender}`;
}

