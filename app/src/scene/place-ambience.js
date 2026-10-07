// 载具、洗浴、水下与太空：按 [igs-scene] 的地点词判断「人在车里 / 船上 / 浴室 / 水底 / 真空里」，供日常演出的持续氛围层与环境音共用一张词表。
// 只看地点，不看正文；判断不出时返回 null，两边都不做任何事。古代与西幻没有汽车火车，「车里」一律按马车处理。
const TRAIN_WORDS = Object.freeze(['电车', '列车', '火车', '地铁', '车厢', '新干线', '高铁', '轻轨']);
const SHIP_WORDS = Object.freeze(['船', '甲板', '舰', '帆', '渡轮', '轮渡', '游轮', '邮轮', '客轮', '货轮']);
const SUBWAY_WORDS = Object.freeze(['地铁', '地下铁', '隧道']);
const CAR_WORDS = Object.freeze([
    '车里', '车内', '车上', '车中', '轿车', '汽车', '出租车', '计程车', '的士', '巴士', '公交车', '公车', '大巴', '校车',
    '副驾', '后座', '驾驶座', '驾驶室', '跑车', '房车', '敞篷',
]);
const CARRIAGE_WORDS = Object.freeze(['马车', '轿子', '轿中', '轿内', '花轿', '牛车', '驿车', '车驾', '车辇', '銮驾', '辇']);
const SHOWER_WORDS = Object.freeze(['淋浴', '花洒', '冲澡']);
const ONSEN_WORDS = Object.freeze(['温泉', '露天风吕', '露天浴', '汤池', '野汤']);
const BATH_WORDS = Object.freeze([
    ...SHOWER_WORDS, ...ONSEN_WORDS, '浴室', '浴缸', '浴池', '浴场', '澡堂', '钱汤', '浴桶', '浴房', '浴间', '风吕', '桑拿', '汗蒸',
]);
// 水下与太空不分世界观（人鱼哪个时代都有）。
const UNDERWATER_WORDS = Object.freeze(['水下', '水底', '水中', '海底', '深海', '湖底', '河底', '潭底', '海沟', '龙宫', '水晶宫', '珊瑚礁']);
const SPACE_WORDS = Object.freeze(['太空', '外太空', '宇宙空间', '星际空间', '真空', '月面', '月球表面', '小行星带']);
// 太空站、飞船里有空气；但「舱外」「太空站外」是真空，要在剥掉假朋友之前先认。
const SPACE_OUTSIDE_WORDS = Object.freeze(['舱外', '太空漫步', '太空站外', '空间站外', '飞船外']);
// 「温泉街」「海水浴场」不是在洗澡，「船坞」不在船上，「海底捞」「海底隧道」里有空气，太空站、太空舱里不是真空；
// 「停车场」「车站」「浴衣」本身就不在词表里。
const FALSE_FRIENDS = /温泉(?:街|镇|乡|村)|海水浴场|日光浴场|船坞|船厂|海底捞|海底(?:隧道|餐厅)|太空(?:站|舱|船|港|电梯|中心|馆)/g;

function rawOf(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function includesAny(text, words) {
    return words.some((word) => text.includes(word));
}

const HORSE_DRAWN_WORLDS = Object.freeze(['ancient', 'fantasy']);

// 氛围是「环境本身」的地点：NSFW 页也保留（不扫光带、不晃），载具则只在 SFW 页挂。
export const STILL_PLACE_KINDS = Object.freeze(['bath', 'underwater', 'space']);
export const VEHICLE_KINDS = Object.freeze(['train', 'car', 'carriage', 'ship']);

export function isHorseDrawnWorld(worldview) {
    return HORSE_DRAWN_WORLDS.includes(String(worldview || ''));
}

// 返回 { kind: 'underwater'|'space'|'bath'|'carriage'|'train'|'car'|'ship', variant } 或 null。
// variant：train 的 subway（地下隧道）、bath 的 shower / onsen；其余为空串。
// 水下、真空最先（「沉船的甲板」在水底）；再洗浴后载具：「游轮上的浴场」在浴场里；马车先于汽车：「马车车厢」不算列车。
export function resolvePlaceAmbience(location, { worldview = '' } = {}) {
    const horseDrawn = isHorseDrawnWorld(worldview);
    const raw = rawOf(location);
    if (!raw) return null;
    if (includesAny(raw, SPACE_OUTSIDE_WORDS)) return { kind: 'space', variant: '' };
    const text = raw.replace(FALSE_FRIENDS, '');
    if (includesAny(text, UNDERWATER_WORDS)) return { kind: 'underwater', variant: '' };
    if (includesAny(text, SPACE_WORDS)) return { kind: 'space', variant: '' };
    if (includesAny(text, BATH_WORDS)) {
        const variant = includesAny(text, SHOWER_WORDS) ? 'shower' : includesAny(text, ONSEN_WORDS) ? 'onsen' : '';
        return { kind: 'bath', variant };
    }
    if (includesAny(text, CARRIAGE_WORDS)) return { kind: 'carriage', variant: '' };
    if (includesAny(text, TRAIN_WORDS)) return { kind: horseDrawn ? 'carriage' : 'train', variant: !horseDrawn && includesAny(text, SUBWAY_WORDS) ? 'subway' : '' };
    if (includesAny(text, CAR_WORDS)) return { kind: horseDrawn ? 'carriage' : 'car', variant: '' };
    if (includesAny(text, SHIP_WORDS)) return { kind: 'ship', variant: '' };
    return null;
}
