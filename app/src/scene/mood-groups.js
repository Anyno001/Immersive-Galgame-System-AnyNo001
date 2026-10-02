export const MOOD_GROUPS_PLACEHOLDER = '{{mood_groups}}';
export const SCENE_GROUPS_PLACEHOLDER = '{{scene_groups}}';
export const TIME_GROUPS_PLACEHOLDER = '{{time_groups}}';
export const WEATHER_GROUPS_PLACEHOLDER = '{{weather_groups}}';

// 表情分组预设：两层结构——喜怒哀乐各分小、大两档（情绪层），再叠加亲密、对抗、思考（姿态层）。
// tier 是这一组从哪一档开始出现（0 为兜底，8/12/18 为档位，nsfw 只在 NSFW 开关打开时出现）。
// parent 是同方向的另一档，档位不够时按它回退；ancestors 是姿态组落到情绪层的第二条回退路径。
// act 是这组的招牌动作，写进生图描述，避免组与组画成同一张脸。
const PRESET_SOURCE = [
    { label: '喜悦', tier: 8, parent: '大笑', act: '微笑，眼睛弯起，肩膀放松', words: ['开心', '高兴', '愉快', '欢喜', '欣喜', '愉悦', '微笑', '轻松', '期待', '甜蜜'] },
    { label: '大笑', tier: 18, parent: '喜悦', act: '张嘴大笑，眼睛眯成缝，身体前倾', words: ['大笑', '狂喜', '兴奋', '雀跃', '激动', '欢呼', '畅快', '捧腹'] },
    { label: '愤怒', tier: 8, parent: '不满', act: '皱紧眉头，瞪眼，声音拔高', words: ['愤怒', '暴怒', '气愤', '愤慨', '暴躁', '怒吼', '震怒', '火大', '发火', '生气', '怒喝', '怒斥', '呵斥', '喝斥', '厉声', '咆哮', '吼叫'] },
    { label: '不满', tier: 12, parent: '愤怒', act: '抱臂，抿嘴或噘嘴，脸别向一边', words: ['不满', '恼火', '窝火', '烦躁', '烦闷', '抱怨', '不服', '赌气', '闹别扭', '不悦'] },
    { label: '悲伤', tier: 8, parent: '哭泣', act: '低头，眼神暗下来，嘴角下压', words: ['难过', '伤心', '失落', '低落', '沮丧', '惆怅', '忧伤', '心酸', '委屈', '孤独', '寂寞', '失望'] },
    { label: '哭泣', tier: 18, parent: '悲伤', act: '落泪，眼角和鼻尖发红，手抹眼泪', words: ['哭泣', '落泪', '流泪', '哽咽', '大哭', '痛哭', '心痛', '悲痛', '痛苦', '崩溃'] },
    { label: '平和', tier: 8, parent: '', act: '表情放松，嘴角轻轻上扬，眉眼舒展，姿态自然', words: ['平静', '淡然', '冷静', '沉稳', '从容', '坦然', '淡定', '放松', '安心', '惬意', '温和'] },
    { label: '陶醉', tier: 18, parent: '喜悦', ancestors: ['平和'], act: '闭眼微笑，头微微后仰，手按在胸口', words: ['陶醉', '满足', '幸福', '享受', '沉醉', '温馨', '温暖', '欣慰', '感动', '释然'] },
    { label: '害羞', tier: 8, parents: ['爱恋'], act: '脸颊泛红，视线躲开，手无意识地碰到脸或衣角', words: ['害羞', '羞涩', '脸红', '尴尬', '窘迫', '难堪', '羞耻', '扭捏', '不好意思'] },
    { label: '爱恋', tier: 8, parents: ['害羞'], act: '眼神柔软地看向对方，嘴角带笑', words: ['喜欢', '爱慕', '心动', '倾慕', '迷恋', '宠溺', '温柔', '深情', '怜爱'] },
    { label: '撒娇', tier: 18, parent: '爱恋', parents: ['爱恋', '害羞'], act: '身体前倾凑近，微微抬头看人', words: ['撒娇', '依恋', '黏人', '讨好', '央求', '卖萌', '求抱抱'] },
    { label: '嫌弃', tier: 8, parents: ['紧张', '愤怒'], act: '眉头轻皱，嘴角撇下，视线带刺', words: ['嫌弃', '厌恶', '鄙视', '反感', '排斥', '不屑', '冷淡', '冷漠', '疏离', '白眼', '冷哼'] },
    { label: '得意', tier: 18, parent: '喜悦', parents: ['喜悦'], act: '抬起下巴，嘴角单边上扬，双手叉腰', words: ['得意', '骄傲', '自豪', '自信', '挑衅', '嚣张', '傲慢', '炫耀', '坏笑', '捉弄', '狡黠', '嘲讽', '讥讽', '讽刺', '嗤笑', '讥笑', '冷笑', '揶揄', '戏谑', '阴阳怪气'] },
    { label: '紧张', tier: 8, parent: '戒备', act: '身体绷紧，眉头皱起，手不知往哪放', words: ['紧张', '焦虑', '不安', '忐忑', '担忧', '慌张', '害怕', '恐惧', '惊恐', '畏惧', '胆怯'] },
    { label: '戒备', tier: 12, parent: '紧张', act: '眯起眼睛，身体半侧，手挡在身前', words: ['戒备', '警惕', '提防', '防备', '怀疑', '猜疑', '审视', '试探', '敌意'] },
    { label: '惊讶', tier: 12, parents: ['紧张'], act: '眼睛睁大，嘴微张，手抬到胸前', words: ['惊讶', '吃惊', '震惊', '错愕', '愣住', '意外', '诧异', '惊愕', '目瞪口呆'] },
    { label: '思考', tier: 12, parents: ['平和'], act: '手托下巴，视线偏到一边，眉头轻蹙', words: ['思考', '沉思', '琢磨', '回忆', '疑惑', '困惑', '迷茫', '纠结', '犹豫', '若有所思'] },
    { label: '无奈', tier: 18, parents: ['平和'], act: '苦笑，耸肩或扶一下额头', words: ['无奈', '苦笑', '叹气', '扶额', '头疼', '认命', '哭笑不得', '无可奈何'] },
    { label: '默认', tier: 0, act: '无表情，面无表情，闭嘴，眼神平视，双手自然下垂，身体放松', words: ['无表情', '面无表情', '无语', '木然', '发呆', '愣神', '沉默', '默然', '呆滞', '麻木', '认真', '严肃'] },
    { label: '动情', tier: 'nsfw', parent: '爱恋', parents: ['爱恋'], act: '眼神迷离，嘴唇微张，脸颊泛红，呼吸略急', words: ['动情', '情动', '迷离', '意乱情迷', '渴求', '燥热'] },
];

export const MOOD_PRESET = PRESET_SOURCE.map((entry) => ({
    label: entry.label,
    tier: entry.tier,
    parent: String(entry.parent || ''),
    parents: Array.isArray(entry.parents) ? entry.parents.slice() : [],
    act: String(entry.act || ''),
    words: entry.words.slice(),
}));

const MOOD_PRESET_BY_LABEL = new Map(MOOD_PRESET.map((entry) => [entry.label, entry]));

export function moodPresetEntry(label) {
    return MOOD_PRESET_BY_LABEL.get(String(label || '').trim()) || null;
}

// 这一档要画哪些组：8 ⊂ 12 ⊂ 18；nsfw 为 true 时额外带上动情。
export function moodTierLabels(tier, { nsfw = false, extra = [] } = {}) {
    const value = Number(tier);
    const max = Number.isFinite(value) && value > 0 ? value : 8;
    const labels = MOOD_PRESET
        .filter((entry) => {
            if (entry.tier === 'nsfw') return nsfw;
            const t = Number(entry.tier);
            return t > 0 && t <= max;
        })
        .map((entry) => entry.label);
    // 用户自建的组要能手动放进档位；预设里没有的组按传入顺序接在后面。
    const seen = new Set(labels);
    for (const label of Array.isArray(extra) ? extra : []) {
        const name = String(label || '').trim();
        // 预设里没有的才是用户自建的组，才有必要额外带上；预设的组由档位决定。
        if (!name || seen.has(name) || MOOD_PRESET_BY_LABEL.has(name)) continue;
        seen.add(name);
        labels.push(name);
    }
    return labels;
}

// 回退顺序：先同方向的另一档（parent），再姿态组落到情绪层（parents）。只走一层，避免跨方向乱跳。
export function moodFallbackChain(label) {
    const entry = MOOD_PRESET_BY_LABEL.get(String(label || '').trim());
    if (!entry) return [];
    const out = [];
    for (const name of [entry.parent].concat(entry.parents)) {
        if (name && name !== entry.label && !out.includes(name)) out.push(name);
    }
    return out;
}

export function moodPresetWords(label) {
    const entry = MOOD_PRESET_BY_LABEL.get(String(label || '').trim());
    return entry ? entry.words.slice() : [];
}

export function moodPresetAct(label) {
    const entry = MOOD_PRESET_BY_LABEL.get(String(label || '').trim());
    return entry ? entry.act : '';
}

// 词 → 组：先精确匹配，再模糊兜底。给「套用预设词库」判定词该放哪组用。
export function resolvePresetGroup(word) {
    const target = String(word || '').trim();
    if (!target) return null;
    for (const entry of MOOD_PRESET) {
        if (entry.label === target) return entry.label;
        if (entry.words.includes(target)) return entry.label;
    }
    return fuzzyResolveMoodGroup(target, MOOD_PRESET);
}

export const DEFAULT_MOOD_GROUPS = MOOD_PRESET.map((entry) => ({ label: entry.label, words: entry.words.slice() }));


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

// 情绪词模糊兜底：两字词共用字太多（心动/心酸、冷静/冷漠），不能按字直接比。
// 只认「有辨识度的字」——在整个词库里只出现在同一组的字（组名与组词都算）；
// 跨组字一律忽略。目标词的有效字全部指向同一组才返回该组，否则视为冲突返回 null。
export function fuzzyResolveMoodGroup(word, groups) {
    const target = String(word || '').trim();
    if (!target) return null;
    const list = Array.isArray(groups) && groups.length ? groups : DEFAULT_MOOD_GROUPS;
    const charGroups = new Map();
    for (const group of list) {
        if (!group || typeof group !== 'object') continue;
        const label = String(group.label || '').trim();
        if (!label) continue;
        const words = Array.isArray(group.words) ? group.words : [];
        for (const entry of [label, ...words]) {
            for (const ch of Array.from(String(entry || '').trim())) {
                if (!charGroups.has(ch)) charGroups.set(ch, new Set());
                charGroups.get(ch).add(label);
            }
        }
    }
    let hit = null;
    for (const ch of new Set(Array.from(target))) {
        const labels = charGroups.get(ch);
        if (!labels || labels.size !== 1) continue;
        const [label] = labels;
        if (hit && hit !== label) return null;
        hit = label;
    }
    return hit;
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

export const VOCAB_CHAR_LIMIT = 400;

// 超出上限按条截断并注明「等」；单条本身超长时也截断，保证整段不超过上限。
export function capVocabItems(items, limit = VOCAB_CHAR_LIMIT, separator = '、') {
    const list = (Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean);
    const out = [];
    let used = 0;
    for (const item of list) {
        const cost = Array.from(item).length + (out.length ? Array.from(separator).length : 0);
        if (used + cost > limit) {
            if (!out.length) out.push(`${Array.from(item).slice(0, Math.max(1, limit - 1)).join('')}`);
            out.push('等');
            return out;
        }
        out.push(item);
        used += cost;
    }
    return out;
}

function joinCapped(items, limit, separator = '、') {
    const capped = capVocabItems(items, limit, separator);
    const tail = capped[capped.length - 1] === '等' ? capped.pop() : '';
    return capped.join(separator) + tail;
}

// 表情池精简：组名 + 代表词。立绘里单独建了槽位的词全部保留（否则 AI 写不出、精确槽永远命中不到），
// 不足 3 个再按原顺序补足；其余词仍留在词库里，AI 写出时照样由 resolveMoodGroup 归组。
export function buildCompactMoodGroupsText(groups, slotWords = [], { perGroup = 3, limit = VOCAB_CHAR_LIMIT } = {}) {
    const list = Array.isArray(groups) && groups.length ? groups : DEFAULT_MOOD_GROUPS;
    const slots = new Set((Array.isArray(slotWords) ? slotWords : Array.from(slotWords || [])).map((w) => String(w || '').trim()));
    const lines = [];
    for (const group of list) {
        const label = String(group && group.label || '').trim();
        if (!label) continue;
        const words = Array.isArray(group.words) ? group.words.map((w) => String(w || '').trim()).filter((w) => w && w !== label) : [];
        const picked = words.filter((w) => slots.has(w));
        for (const w of words) {
            if (picked.length >= perGroup) break;
            if (!picked.includes(w)) picked.push(w);
        }
        lines.push(picked.length ? `${label}：${picked.join('、')}` : label);
    }
    return joinCapped(lines, limit, '；');
}

export function buildCompactGroupsText(groups, limit = VOCAB_CHAR_LIMIT) {
    const list = Array.isArray(groups) ? groups : [];
    const lines = list.map((group) => {
        const label = String(group && group.label || '').trim();
        const words = Array.isArray(group && group.words) ? group.words.filter(Boolean) : [];
        return label ? `${label}（${words.join('、')}）` : '';
    }).filter(Boolean);
    return joinCapped(lines, limit, '；');
}

// 场景只列主名，别名交给 classifySceneKey 的别名与模糊匹配兜底。
export function buildCompactSceneNamesText(scenes, limit = VOCAB_CHAR_LIMIT) {
    if (!scenes || typeof scenes !== 'object') return '';
    const names = Object.keys(scenes).filter((name) => name && name !== '默认');
    if (!names.length) return '';
    return `场景名优先用已有场景：${joinCapped(names, limit)}`;
}
