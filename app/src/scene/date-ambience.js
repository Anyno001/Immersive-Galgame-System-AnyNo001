// 约会地点氛围层：按 [igs-scene] 的地点词判断咖啡厅 / 水族馆 / 电影院 / 海边 / 夜景，返回常驻氛围层的 kind，供 fx-daily 渲染。
// 只认约会场所，判不出返回 null，交给 place-ambience 之外的兜底；水下（海底、海中）归 place-ambience，这里不碰。
import { GAME_AMBIENCE_WORDS } from './game-console.js';
const CINEMA_WORDS = Object.freeze(['电影院', '影院', '影厅', '放映厅', '电影厅', '影城', '戏院', 'cinema']);
const AQUARIUM_WORDS = Object.freeze(['水族馆', '海洋馆', '水母馆', '海洋世界', '海洋公园', '海洋乐园', 'aquarium']);
const BEACH_WORDS = Object.freeze(['海边', '沙滩', '海滩', '海岸', '海滨', 'beach']);
const NIGHTVIEW_WORDS = Object.freeze([
    '天台', '屋顶', '楼顶', '观景台', '瞭望台', '公园夜景', '城市夜景', '夜景', '摩天楼', 'rooftop',
]);
// 帝王后宫：寝宫殿阁的帷帐与宫灯，只在古代世界观生效。帷帐类（床帐、纱帐）出垂纱，其余是宫灯。
const PALACE_WORDS = Object.freeze(['寝宫', '寝殿', '后宫', '内殿', '宫殿', '皇宫', '宫中', '宫里', '养心殿', '乾清宫', '坤宁宫', '凤仪宫', '御书房', '大殿', '金殿', '凤阁', '龙榻', '闺阁', '暖阁', '帐中', '帐内', '罗帐', '帷帐', '纱帐', '床帐', '洞房', '新房', '东宫', '偏殿']);
const CURTAIN_WORDS = Object.freeze(['龙榻', '帐中', '帐内', '罗帐', '帷帐', '纱帐', '床帐', '洞房', '新房', '闺阁', '暖阁']);
const CAFE_WORDS = Object.freeze([
    '咖啡厅', '咖啡馆', '咖啡店', '咖啡', '餐厅', '西餐厅', '餐馆', '甜品店', '下午茶', '茶餐厅', '奶茶店', 'diner', 'restaurant', 'cafe',
]);

function rawOf(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function includesAny(text, words) {
    return words.some((word) => text.includes(word));
}

export const DATE_AMBIENCE_KINDS = Object.freeze(['cafe', 'aquarium', 'cinema', 'beach', 'nightview', 'palace', 'console']);

// 约会场所都是环境叠色、不扫光带：NSFW 页也保留。
export const DATE_STILL_KINDS = Object.freeze(['cafe', 'aquarium', 'cinema', 'beach', 'nightview', 'palace', 'console']);

export const DATE_AMBIENCE_HTML = Object.freeze({
    cafe: '<i class="igs-dfx-amb-cafelight"></i><i class="igs-dfx-amb-cafedust"></i>',
    aquarium: '<i class="igs-dfx-amb-caustics"></i><i class="igs-dfx-amb-aquaglow"></i>',
    cinema: '<i class="igs-dfx-amb-cinedark"></i><i class="igs-dfx-amb-screenglow"></i>',
    beach: '<i class="igs-dfx-amb-seashimmer"></i><i class="igs-dfx-amb-horizon"></i>',
    nightview: '<i class="igs-dfx-amb-citybokeh"></i>',
    // 电视 / 游戏机：房间偏暗，屏幕的彩色闪光自下而上映在脸上，还有一道缓缓下移的扫描带。
    console: '<i class="igs-dfx-amb-roomdark"></i><i class="igs-dfx-amb-tvlight"></i><i class="igs-dfx-amb-tvscan"></i>',
    palace: '<i class="igs-dfx-amb-palaceglow"></i><i class="igs-dfx-amb-lamps"><b></b><b></b><b></b></i><i class="igs-dfx-amb-veil"></i>',
});

// 返回 { kind: 'cafe'|'aquarium'|'cinema'|'beach'|'nightview'|'palace', variant } 或 null；variant 目前只有 palace 的 curtain（帷帐），其余空串。
// 影院、水族馆先判，海边与夜景次之，咖啡餐厅最宽泛放最后：「海边餐厅」是海边，「水族馆里的餐厅」是水族馆，「屋顶咖啡厅」是夜景。
export function resolveDateAmbience(location, { worldview = '' } = {}) {
    const raw = rawOf(location);
    if (!raw) return null;
    // 后宫：古代世界观下的寝宫殿阁先判（「御花园的凉亭」不算）；垂纱变体给床帐 / 洞房。
    if (String(worldview || '') === 'ancient' && includesAny(raw, PALACE_WORDS)) {
        return { kind: 'palace', variant: includesAny(raw, CURTAIN_WORDS) ? 'curtain' : '' };
    }
    if (includesAny(raw, CINEMA_WORDS)) return { kind: 'cinema', variant: '' };
    if (includesAny(raw, AQUARIUM_WORDS)) return { kind: 'aquarium', variant: '' };
    if (includesAny(raw, BEACH_WORDS)) return { kind: 'beach', variant: '' };
    if (includesAny(raw, NIGHTVIEW_WORDS)) return { kind: 'nightview', variant: '' };
    if (includesAny(raw, GAME_AMBIENCE_WORDS)) return { kind: 'console', variant: '' };
    if (includesAny(raw, CAFE_WORDS)) return { kind: 'cafe', variant: '' };
    return null;
}
