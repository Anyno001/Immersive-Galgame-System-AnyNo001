export const MOOD_GROUPS_PLACEHOLDER = '{{mood_groups}}';
export const SCENE_GROUPS_PLACEHOLDER = '{{scene_groups}}';
export const TIME_GROUPS_PLACEHOLDER = '{{time_groups}}';
export const WEATHER_GROUPS_PLACEHOLDER = '{{weather_groups}}';

export const DEFAULT_MOOD_GROUPS = [
    { label: '喜悦', words: ['开心', '欢喜', '欣喜', '愉悦', '满足', '幸福', '甜蜜', '狂喜', '兴奋', '雀跃', '畅快', '陶醉', '得意', '骄傲', '自豪', '自信'] },
    { label: '愤怒', words: ['愤怒', '暴怒', '气愤', '愤慨', '暴躁', '怨恨', '敌意', '恼火', '窝火', '生气', '烦躁', '烦闷'] },
    { label: '悲伤', words: ['难过', '伤心', '心酸', '忧伤', '惆怅', '失落', '低落', '沮丧', '悲伤', '心痛', '悲痛', '痛苦', '委屈', '不甘', '失望', '受伤', '孤独', '寂寞', '落寞'] },
    { label: '紧张', words: ['焦虑', '紧张', '不安', '忐忑', '担忧', '慌张', '焦躁', '害怕', '恐惧', '惊恐', '畏惧', '胆怯', '心慌', '警惕', '戒备'] },
    { label: '平和', words: ['平静', '淡然', '冷静', '沉稳', '从容', '坦然', '淡定', '温馨', '舒畅', '惬意', '温暖', '欣慰', '释然', '感动', '感恩'] },
    { label: '害羞', words: ['害羞', '尴尬', '窘迫', '难堪', '困惑', '迷茫', '疑惑', '纠结', '犹豫', '无奈', '无语'] },
    { label: '嫌弃', words: ['厌恶', '嫌弃', '鄙视', '反感', '排斥', '抗拒', '不屑', '冷淡', '冷漠', '疏离', '麻木'] },
    { label: '爱恋', words: ['喜欢', '爱慕', '迷恋', '倾慕', '宠溺', '依恋', '心动', '认真'] },
];

export function normalizeMoodGroups(value) {
    if (!Array.isArray(value)) return cloneDefaultMoodGroups();
    const groups = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const label = String(item.label || '').trim();
        if (!label) continue;
        const words = Array.isArray(item.words)
            ? item.words.map((w) => String(w || '').trim()).filter(Boolean)
            : [];
        groups.push({ label, words });
    }
    return groups.length ? groups : cloneDefaultMoodGroups();
}

export function resolveMoodGroup(word, groups) {
    const target = String(word || '').trim();
    if (!target) return null;
    const list = Array.isArray(groups) && groups.length ? groups : DEFAULT_MOOD_GROUPS;
    for (const group of list) {
        if (!group || typeof group !== 'object') continue;
        const label = String(group.label || '').trim();
        if (label === target) return label;
        const words = Array.isArray(group.words) ? group.words : [];
        if (words.some((w) => String(w || '').trim() === target)) return label;
    }
    return null;
}

export function buildMoodGroupsText(groups) {
    const list = Array.isArray(groups) && groups.length ? groups : DEFAULT_MOOD_GROUPS;
    return list.map((group) => {
        const label = String(group && group.label || '').trim();
        const words = Array.isArray(group && group.words) ? group.words.filter(Boolean) : [];
        return `${label}组：${words.join('、')}`;
    }).filter((line) => line && line !== '组：').join('\n');
}

// 通用组文本：任意 [{label,words}] 列表，无默认池兜底（场景/时间/天气专用）。
export function buildGroupsText(groups) {
    const list = Array.isArray(groups) ? groups : [];
    return list.map((group) => {
        const label = String(group && group.label || '').trim();
        const words = Array.isArray(group && group.words) ? group.words.filter(Boolean) : [];
        return `${label}组：${words.join('、')}`;
    }).filter((line) => line && line !== '组：').join('\n');
}

// 场景名词库是内嵌式（scenes[名].words），先转成 [{label,words}] 再生成组文本。
export function buildSceneGroupsText(scenes) {
    if (!scenes || typeof scenes !== 'object') return '';
    const list = Object.keys(scenes).map((name) => {
        const entry = scenes[name];
        const words = entry && typeof entry === 'object' && Array.isArray(entry.words) ? entry.words : [];
        return { label: name, words };
    });
    return buildGroupsText(list);
}

function cloneDefaultMoodGroups() {
    return DEFAULT_MOOD_GROUPS.map((group) => ({ label: group.label, words: group.words.slice() }));
}
