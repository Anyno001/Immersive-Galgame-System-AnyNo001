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
// 两轮车：自行车（含后座双载）与机动的摩托 / 电动车。都是开放式骑行（风声、铃铛），不是封闭车厢。
// 「自行车上」含「车上」，必须在汽车之前判定；马车世界没有两轮车，一律按马车处理。
const BIKE_WORDS = Object.freeze(['自行车', '单车', '脚踏车', '骑车', '骑行', '骑单车', '山地车', '公路车', '童车', '后座双载']);
const MOTO_WORDS = Object.freeze(['摩托车', '摩托', '机车', '电动车', '电瓶车', '踏板车', '绵羊车', '机车后座']);
// 飞行器：现代客机 / 直升机的机舱。明说在机舱里的词，在机场里也算登机了。
const PLANE_CABIN_WORDS = Object.freeze(['机舱', '机内', '直升机', '战机座舱']);
const PLANE_WORDS = Object.freeze(['飞机', '客机', '航班', '货机']);
// 邮轮、飞船也有的舱位词：地点里带船、舰、艇、游轮之类的字样时归它们，否则才算机舱。
const CABIN_SHARED_WORDS = Object.freeze(['客舱', '舷窗', '头等舱', '经济舱', '公务舱']);
// 人还在机场：「候机厅等航班」「停机坪看飞机」都在地上，只有明说进了机舱才算。
const AIRPORT_RE = /机场|候机|航站|登机口|登机桥|停机坪/;
// 飞艇 / 飞毯 / 热气球不分世界观（蒸汽朋克、西幻、现代都有），一律按飞行器的 airship 变体，光影更暖更缓。
const AIRSHIP_WORDS = Object.freeze(['飞艇', '飞空艇', '空艇', '热气球', '飞毯', '魔毯']);
// 露天飞行：御剑、乘云、骑龙 / 飞马 / 仙鹤，人直接在风里。不分世界观（仙侠、西幻、魔法都有）。
// 只收明说「在飞」的词：「云海」「云端」常是山上看景，「剑上」「龙背山」太容易误伤，都不收。
const SKY_WORDS = Object.freeze([
    '御剑', '飞剑上', '剑光中', '腾云', '驾云', '筋斗云', '祥云上', '云头上', '仙鹤背', '鹤背上',
    '龙背', '骑龙', '飞马背', '天马背', '骑着天马', '狮鹫背', '骑狮鹫', '鹰背', '凤背', '鸾背', '飞兽背',
    '扫帚上', '骑扫帚', '高空中', '半空中', '空中飞行', '飞行中', '飞在空中', '云层之上', '云层上方',
]);
const SKY_FALSE_FRIENDS = /空中(?:花园|走廊|楼阁|餐厅|酒吧|庭院|连廊)|高空(?:作业|餐厅|酒吧|观景台)/g;
// 修仙武侠的古风地点（只在古代世界观生效，避免「云海」在现代误伤旅游景点）：客栈酒肆、洞府丹房、云海仙山。
const INN_WORDS = Object.freeze(['客栈', '酒肆', '酒楼', '镖局', '茶寮', '驿站']);
const CAVE_WORDS = Object.freeze(['洞府', '仙府', '石室', '丹房', '山洞', '密室', '石洞', '洞窟']);
const CLOUDSEA_WORDS = Object.freeze(['云海', '仙山', '天宫', '天庭', '云端', '仙岛', '瑶池']);
const SHOWER_WORDS = Object.freeze(['淋浴', '花洒', '冲澡']);
const ONSEN_WORDS = Object.freeze(['温泉', '露天风吕', '露天浴', '汤池', '野汤']);
const BATH_WORDS = Object.freeze([
    ...SHOWER_WORDS, ...ONSEN_WORDS, '浴室', '浴缸', '浴池', '浴场', '澡堂', '钱汤', '浴桶', '浴房', '浴间', '风吕', '桑拿', '汗蒸',
]);
// 水下与太空不分世界观（人鱼哪个时代都有）。
const UNDERWATER_WORDS = Object.freeze([
    '水下', '水底', '水中', '海中', '湖中', '海底', '深海', '湖底', '河底', '潭底', '海沟', '海渊', '龙宫', '水晶宫', '珊瑚礁',
    '海藻林', '海草林', '海带林', '人鱼王国', '人鱼宫', '人鱼族', '亚特兰蒂斯', '海神殿', '沉船',
]);
// 阳光照不到的深处：不挂光柱，换成幽幽发光的浮游。
const ABYSS_WORDS = Object.freeze(['深海', '海沟', '海渊', '海底深处', '海洋深处', '深渊']);
const SPACE_WORDS = Object.freeze(['太空', '外太空', '宇宙空间', '星际空间', '真空', '月面', '月球表面', '小行星带']);
// 太空站、飞船里有空气；但「舱外」「太空站外」是真空，要在剥掉假朋友之前先认。
const SPACE_OUTSIDE_WORDS = Object.freeze(['舱外', '太空漫步', '太空站外', '空间站外', '飞船外']);
// 「温泉街」「海水浴场」不是在洗澡，「船坞」不在船上，「海底捞」「海底隧道」「深海潜艇」「海底世界水族馆」里有空气，太空站、太空舱里不是真空；
// 「机场」「候机厅」「航站楼」「停机坪」在地上还没登机，不算在机舱里（先剥掉「飞机场」里的「机场」，剩不下「飞机」）。
// 「飞船」「星舰」「宇宙船」里有空气、不在水上，「纸飞机」不是坐飞机。
// 「停车场」「车站」「浴衣」本身就不在词表里。
const FALSE_FRIENDS = /温泉(?:街|镇|乡|村)|海水浴场|日光浴场|船坞|船厂|海底捞|海底(?:隧道|餐厅)|[^\s，,（）()]*(?:潜水?艇|水族馆)[^\s，,（）()]*|太空(?:站|舱|船|港|电梯|中心|馆)|机场|候机(?:厅|楼|室)?|航站楼?|登机(?:口|桥)|停机坪|飞船|星舰|宇宙船|纸飞机/g;

function rawOf(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function includesAny(text, words) {
    return words.some((word) => text.includes(word));
}

// raw 是原地点（判断「在机场」「带船字」），text 是剥掉假朋友后的。
function isInPlane(raw, text) {
    if (includesAny(text, PLANE_CABIN_WORDS)) return true;
    if (AIRPORT_RE.test(raw)) return false;
    if (includesAny(text, PLANE_WORDS)) return true;
    return includesAny(text, CABIN_SHARED_WORDS) && !includesAny(raw, SHIP_WORDS) && !raw.includes('艇');
}

const HORSE_DRAWN_WORLDS = Object.freeze(['ancient', 'fantasy']);
const XIAN_WORLDS = Object.freeze(['ancient']);

// 氛围是「环境本身」的地点：NSFW 页也保留（不扫光带、不晃），载具则只在 SFW 页挂。
export const STILL_PLACE_KINDS = Object.freeze(['bath', 'underwater', 'space', 'inn', 'cave', 'cloudsea']);
// sky（露天飞行）也算载具：人在风里移动，NSFW 页不挂。
export const VEHICLE_KINDS = Object.freeze(['train', 'car', 'carriage', 'ship', 'plane', 'bike', 'sky']);

export function isHorseDrawnWorld(worldview) {
    return HORSE_DRAWN_WORLDS.includes(String(worldview || ''));
}

// 返回 { kind: 'underwater'|'space'|'bath'|'carriage'|'train'|'car'|'ship'|'plane'|'bike'|'sky', variant } 或 null。
// variant：train 的 subway（地下隧道）、bath 的 shower / onsen、underwater 的 abyss（深海）、plane 的 airship（飞艇 / 热气球 / 飞毯）；其余为空串。
// 水下、真空最先（「沉船的甲板」在水底）；再洗浴后载具：「游轮上的浴场」在浴场里；飞行器先于马车、马车先于汽车：「飞艇」不算列车、「马车车厢」不算列车。
export function resolvePlaceAmbience(location, { worldview = '' } = {}) {
    const horseDrawn = isHorseDrawnWorld(worldview);
    const raw = rawOf(location);
    if (!raw) return null;
    if (includesAny(raw, SPACE_OUTSIDE_WORDS)) return { kind: 'space', variant: '' };
    const text = raw.replace(FALSE_FRIENDS, '');
    if (includesAny(text, UNDERWATER_WORDS)) return { kind: 'underwater', variant: includesAny(text, ABYSS_WORDS) ? 'abyss' : '' };
    if (includesAny(text, SPACE_WORDS)) return { kind: 'space', variant: '' };
    if (includesAny(text, BATH_WORDS)) {
        const variant = includesAny(text, SHOWER_WORDS) ? 'shower' : includesAny(text, ONSEN_WORDS) ? 'onsen' : '';
        return { kind: 'bath', variant };
    }
    if (includesAny(text, AIRSHIP_WORDS)) return { kind: 'plane', variant: 'airship' };
    if (isInPlane(raw, text)) return { kind: 'plane', variant: horseDrawn ? 'airship' : '' };
    // 露天飞行排在机舱之后：「飞行中的客机」在机舱里；排在马车之前：「龙背上的车驾」在天上。
    if (includesAny(text.replace(SKY_FALSE_FRIENDS, ''), SKY_WORDS)) return { kind: 'sky', variant: '' };
    // 古风地点插在露天飞行之后（「御剑穿云海」仍归 sky）、马车之前。
    if (XIAN_WORLDS.includes(String(worldview || ''))) {
        if (includesAny(text, CLOUDSEA_WORDS)) return { kind: 'cloudsea', variant: '' };
        if (includesAny(text, CAVE_WORDS)) return { kind: 'cave', variant: '' };
        if (includesAny(text, INN_WORDS)) return { kind: 'inn', variant: '' };
    }
    if (includesAny(text, CARRIAGE_WORDS)) return { kind: 'carriage', variant: '' };
    // 两轮车在列车、汽车之前判定：「自行车」「电动车」里都含「车」，否则会被当成汽车或列车。
    if (includesAny(text, BIKE_WORDS)) return horseDrawn ? { kind: 'carriage', variant: '' } : { kind: 'bike', variant: '' };
    if (includesAny(text, MOTO_WORDS)) return horseDrawn ? { kind: 'carriage', variant: '' } : { kind: 'bike', variant: 'moto' };
    if (includesAny(text, TRAIN_WORDS)) return { kind: horseDrawn ? 'carriage' : 'train', variant: !horseDrawn && includesAny(text, SUBWAY_WORDS) ? 'subway' : '' };
    if (includesAny(text, CAR_WORDS)) return { kind: horseDrawn ? 'carriage' : 'car', variant: '' };
    if (includesAny(text, SHIP_WORDS)) return { kind: 'ship', variant: '' };
    return null;
}
