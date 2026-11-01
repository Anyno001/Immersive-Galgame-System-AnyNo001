// 敌人立绘键：由 AI 指定的 art 键或敌人名称关键词，推断出一张预置立绘。
// 人形键为「类型-性别」（m 男、f 女），怪物只有物种。纯函数，无随机数（同名同阶级稳定）。
import { hash32 } from './random.js';

export const ENEMY_ART_KEYS = Object.freeze([
    'grunt-m', 'grunt-f', 'elite-m', 'elite-f', 'caster-m', 'caster-f', 'assassin-m', 'assassin-f',
    'chief-m', 'chief-f', 'boss-m', 'boss-f',
    'beast', 'undead', 'demon', 'giant', 'golem', 'swarm', 'dragon', 'wyvern', 'serpent', 'basilisk',
    'goblin', 'slime', 'ghost', 'orc', 'lizardfolk', 'werewolf', 'mimic', 'gargoyle',
    'elf-m', 'elf-f', 'fairy-m', 'fairy-f', 'dwarf-m', 'dwarf-f',
]);

export const ENEMY_ART_BASE_COUNT = 18;

export const isEnemyArtKey = (key) => typeof key === 'string' && ENEMY_ART_KEYS.includes(key);

// 提示词里的目录说明：人形类型与怪物物种的中文名。
const HUMANOID_LABELS = Object.freeze({ grunt: '杂兵', elite: '精锐', caster: '术士', assassin: '刺客', chief: '头目', boss: '首领', elf: '精灵', fairy: '妖精', dwarf: '矮人' });
const MONSTER_LABELS = Object.freeze({
    beast: '野兽', undead: '亡灵', demon: '妖魔', giant: '巨兽', golem: '傀儡或机械', swarm: '巨虫', dragon: '龙', wyvern: '飞龙',
    serpent: '巨蛇', basilisk: '蛇怪', goblin: '哥布林', slime: '史莱姆', ghost: '鬼魂', orc: '兽人', lizardfolk: '蜥蜴人',
    werewolf: '狼人', mimic: '宝箱怪', gargoyle: '石像鬼',
});

export function enemyArtCatalogText() {
    const list = (labels) => Object.entries(labels).map(([key, label]) => `${key} ${label}`).join('、');
    return `人形写「类型-性别」（m 男、f 女）：${list(HUMANOID_LABELS)}；怪物只写物种：${list(MONSTER_LABELS)}。`;
}

// 怪物物种关键词，按顺序匹配，先匹配先得。any：名称含有即中；tail：名称以其结尾即中。
const MONSTER_RULES = Object.freeze([
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

// 特殊种族（人形，带性别后缀）。
const RACE_RULES = Object.freeze([['elf', ['精灵']], ['fairy', ['妖精', '仙灵']], ['dwarf', ['矮人']]]);

// 名称含这些字则判为女性，否则男性。
const FEMALE_MARKS = Object.freeze(['女', '娘', '姬', '妃', '婆', '姐', '妹', '母', '姑', '嫂', '妻', '夫人', '小姐', '公主', '皇后', '王后', '姥', '妞', '嬷', '婶']);

// 人形职业关键词，按顺序匹配。
const ROLE_RULES = Object.freeze([
    ['boss', ['魔王', '首领', '教主', '宫主', '门主', '盟主', '帮主', '女王', '魔君', '皇帝', '女帝', '魔帝', '大帝']],
    ['chief', ['头目', '头领', '队长', '统领', '老大', '寨主', '堂主', '舵主', '将军', '首脑']],
    ['caster', ['法师', '术士', '巫', '道士', '方士', '祭司', '萨满', '魔女', '灵媒', '异能', '咒']],
    ['assassin', ['刺客', '杀手', '暗杀', '忍者', '影卫', '暗卫']],
    ['elite', ['骑士', '侍卫', '护卫', '禁军', '精锐', '武士', '剑客', '剑士', '佣兵', '特工', '士兵', '卫兵']],
    ['grunt', ['盗', '匪', '贼', '喽啰', '混混', '流氓', '打手', '暴徒', '小兵', '卒']],
]);

// 没有职业关键词时，按阶级在候选里用名称哈希挑一个。
const FALLBACK_ROLES = Object.freeze({ normal: ['grunt', 'caster', 'assassin'], elite: ['elite', 'chief'], boss: ['boss'] });

const matchesMonster = (name, { any = [], tail = [] }) => any.some((word) => name.includes(word)) || tail.some((word) => name.endsWith(word));

export function enemyArtKeyFor({ art, name, tier } = {}) {
    if (isEnemyArtKey(art)) return art;
    const text = String(name || '').trim();
    for (const [key, rule] of MONSTER_RULES) if (matchesMonster(text, rule)) return key;
    const gender = FEMALE_MARKS.some((mark) => text.includes(mark)) ? 'f' : 'm';
    const race = RACE_RULES.find(([, words]) => words.some((word) => text.includes(word)));
    if (race) return `${race[0]}-${gender}`;
    const fallback = FALLBACK_ROLES[tier] || FALLBACK_ROLES.normal;
    const role = (tier === 'boss' ? 'boss' : ROLE_RULES.find(([, words]) => words.some((word) => text.includes(word)))?.[0])
        || fallback[hash32(text) % fallback.length];
    return `${role}-${gender}`;
}
