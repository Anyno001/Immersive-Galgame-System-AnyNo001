// 地点语义：名称优先、说明兜底；多词命中取最长词，同长取结束位置最靠后者（中文中心语在后）。
export const MAP_PLACE_RULES = Object.freeze([
    ['sea', ['海', '港', '码头', '沙滩', '海滩', '海岸', '海边', '渔港', '灯塔']],
    ['lake', ['湖', '池塘', '池', '泉', '泳池', '水库']],
    ['river', ['河', '江', '溪', '运河', '渡口', '桥']],
    ['station', ['车站', '站台', '地铁', '电车', '铁路', '机场', '站前', '站']],
    ['school', ['学校', '学园', '学院', '大学', '高中', '初中', '中学', '小学', '幼儿园', '学堂', '书院', '操场', '校园']],
    ['shrine', ['神社', '寺', '庙', '鸟居', '教堂', '神殿', '祠', '道观', '修道院']],
    ['tower', ['钟楼', '塔', '广场', '纪念碑', '喷泉']],
    ['park', ['公园', '花园', '庭园', '森林', '树林', '山', '丘', '草原', '田', '农场', '牧场', '植物园', '墓地', '墓园', '河堤']],
    ['castle', ['城堡', '王宫', '宫殿', '皇宫', '宫城', '城主府', '要塞']],
    ['hospital', ['医院', '诊所', '医馆', '药店']],
    ['public', ['图书馆', '警局', '警察', '派出所', '政府', '市政', '公会', '协会', '体育馆', '博物馆', '美术馆', '剧院', '音乐厅', '邮局', '消防', '衙门']],
    ['commercial', ['商店', '商场', '超市', '便利店', '百货', '市场', '集市', '商店街', '商业街', '步行街', '咖啡', '餐厅', '饭店', '酒馆', '酒吧', '酒店', '旅馆', '客栈', '书店', '花店', '面包', '甜品', '影院', '游乐园', '游戏厅', '银行', '公司', '写字楼', '大厦', '店', '铺', '馆']],
    ['residential', ['家', '宅', '公寓', '住宅', '宿舍', '别墅', '小区', '房', '屋', '府', '村']],
].map(([key, words]) => Object.freeze([key, Object.freeze(words)])));

export const MAP_WATER_CATEGORIES = Object.freeze(['sea', 'lake', 'river']);

const INTERIOR_WORDS = Object.freeze(['楼', '层', '室', '房间', '厅', '走廊', '楼道', '阁楼', '地下室', '玄关', '厨房', '浴室', '卫生间', '阳台', '天台', '屋顶', '储藏', '卧']);
const INTERIOR_PARENT_WORDS = Object.freeze(['楼', '层', '家', '宅', '公寓', '宿舍', '别墅', '屋', '店', '馆', '大厦', '房']);

const THEME_RULES = Object.freeze([
    ['wafu', ['神社', '鸟居', '稻田', '田埂', '乡下', '温泉', '町', '竹林', '寺', '庙会', '祭']],
    ['fantasy', ['城堡', '王国', '公会', '骑士', '魔法', '王都', '圣殿', '精灵', '地下城', '冒险者', '魔王', '领主']],
    ['ancient', ['客栈', '坊', '宫', '门派', '衙门', '驿站', '书院', '江湖', '京城', '府', '楼阁', '酒楼']],
    ['scifi', ['空间站', '基地', '殖民', '舰', '实验室', '赛博', '义体', '区块', '穹顶', '星港', '机甲']],
]);

function bestMatch(text) {
    let best = null;
    for (const [category, words] of MAP_PLACE_RULES) {
        for (const word of words) {
            const index = text.lastIndexOf(word);
            if (index < 0) continue;
            const end = index + word.length;
            if (!best || word.length > best.length || (word.length === best.length && end > best.end)) {
                best = { category, length: word.length, end };
            }
        }
    }
    return best ? best.category : '';
}

export function classifyMapPlace(name, description = '') {
    return bestMatch(String(name ?? '').trim()) || bestMatch(String(description ?? '').trim()) || 'generic';
}

// 本层尺度：多数子地点像楼层/房间，或上级本身是建筑时判为室内，不生成城市底图。
export function resolveMapScale(parentName, childNames) {
    const names = (childNames || []).map(name => String(name ?? '').trim()).filter(Boolean);
    if (!names.length) return 'city';
    const interiorHits = names.filter(name => INTERIOR_WORDS.some(word => name.includes(word))).length;
    const parent = String(parentName ?? '').trim();
    const parentIsBuilding = Boolean(parent) && INTERIOR_PARENT_WORDS.some(word => parent.endsWith(word));
    if (interiorHits / names.length >= 0.6) return 'interior';
    if (parentIsBuilding && interiorHits / names.length >= 0.34) return 'interior';
    return 'city';
}

export function detectMapTheme(texts) {
    const joined = (texts || []).map(text => String(text ?? '')).join('\n');
    let best = { theme: 'modern', score: 1 };
    for (const [theme, words] of THEME_RULES) {
        const score = words.reduce((sum, word) => sum + (joined.split(word).length - 1), 0);
        if (score > best.score) best = { theme, score };
    }
    return best.theme;
}
