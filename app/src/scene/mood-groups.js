export const MOOD_GROUPS_PLACEHOLDER = '{{mood_groups}}';
export const SCENE_GROUPS_PLACEHOLDER = '{{scene_groups}}';
export const TIME_GROUPS_PLACEHOLDER = '{{time_groups}}';
export const WEATHER_GROUPS_PLACEHOLDER = '{{weather_groups}}';

// 表情分组预设：按「这张脸在台上起什么作用」分——8 档打底（每个大方向一张），
// 12 档补关系互动，16 档补情绪大档，20 档补性格细节。默认是底图。
// 动情进 20 档：不开 NSFW 时是全年龄版（含情注视），开了 NSFW 换成 actNsfw / tagsNsfw。
// tier 是这一组从哪一档开始出现（0 为兜底，8/12/16/20 为档位）。
// parent 是同方向的另一档，档位不够时按它回退；回退链最后都落到 8 档的组，垫底是不进档位的默认。
// act 是这组的招牌动作，use 是这组该用在什么场面，两者都写进生图描述，避免组间混用和撞脸。
// tags 是这组的英文表情标签，出图前硬合进 caption：写词插件常常漏写表情。
// 汗滴、怒筋、心形这些是插件的漫画特效，立绘里不画，tags 和 act 都不要带。
const PRESET_SOURCE = [
    { label: '平和', tier: 8, parent: '', act: '表情放松，嘴角轻轻上扬，眉眼舒展，姿态自然',
        use: '日常对话的底色，心情没有起伏的时候', tags: 'light smile, calm, relaxed',
        words: ['平静', '淡然', '冷静', '沉稳', '从容', '坦然', '淡定', '放松', '安心', '惬意', '温和', '温馨', '温暖', '欣慰', '释然'] },
    { label: '喜悦', tier: 8, parent: '平和', act: '微笑，眼睛弯起，肩膀放松',
        use: '高兴、被逗乐、收到好意的时候', tags: 'smile, happy',
        words: ['开心', '高兴', '愉快', '欢喜', '欣喜', '愉悦', '微笑', '轻松', '甜蜜', '期待', '满足', '幸福', '享受', '感动', '陶醉', '沉醉'] },
    { label: '愤怒', tier: 8, parent: '不满', act: '皱紧眉头，瞪眼，声音拔高',
        use: '真的发火、吵架、被触到底线的时候', tags: 'angry, furrowed brow, v-shaped eyebrows, open mouth, clenched hand',
        words: ['愤怒', '暴怒', '气愤', '愤慨', '暴躁', '怒吼', '震怒', '火大', '发火', '生气', '怒喝', '怒斥', '呵斥', '喝斥', '厉声', '咆哮', '吼叫'] },
    { label: '悲伤', tier: 8, parent: '哭泣', act: '低头，眼神暗下来，嘴角下压',
        use: '失落、被拒绝、听到坏消息的时候', tags: 'sad, frown, downcast eyes, looking down',
        words: ['难过', '伤心', '失落', '低落', '沮丧', '惆怅', '忧伤', '心酸', '孤独', '寂寞', '失望'] },
    { label: '惊讶', tier: 8, parent: '紧张', act: '眼睛睁大，嘴微张，手抬到胸前',
        use: '突然听到意外消息、事情超出预料的时候', tags: 'surprised, wide-eyed, open mouth, hand up',
        words: ['惊讶', '吃惊', '震惊', '错愕', '愣住', '意外', '诧异', '惊愕', '目瞪口呆'] },
    { label: '害羞', tier: 8, parent: '爱恋', act: '脸颊泛红，视线躲开，手无意识地碰到脸或衣角',
        use: '被夸、被表白、说漏嘴的时候', tags: 'blush, embarrassed, looking away, hand on own cheek',
        words: ['害羞', '羞涩', '脸红', '羞耻', '扭捏', '不好意思'] },
    { label: '紧张', tier: 8, parent: '怀疑', act: '身体绷紧，眉头皱起，手不知往哪放',
        use: '怕做错事、等待结果、面对强势的人的时候', tags: 'nervous, worried, furrowed brow',
        words: ['紧张', '焦虑', '不安', '忐忑', '担忧', '慌张', '害怕', '恐惧', '惊恐', '畏惧', '胆怯'] },
    { label: '思考', tier: 8, parent: '平和', act: '手托下巴，视线偏到一边，眉头轻蹙',
        use: '想事情、犹豫不决、回想过去的时候', tags: 'thinking, hand on own chin, looking to the side',
        words: ['思考', '沉思', '琢磨', '回忆', '疑惑', '困惑', '迷茫', '纠结', '犹豫', '若有所思'] },
    { label: '爱恋', tier: 12, parent: '害羞', act: '眼神柔软地看向对方，嘴角带笑，身体微微凑近',
        use: '喜欢对方、撒娇、想被哄、求亲近的时候', tags: 'blush, gentle smile, half-closed eyes, leaning forward',
        words: ['喜欢', '爱慕', '心动', '倾慕', '迷恋', '宠溺', '温柔', '深情', '怜爱', '撒娇', '依恋', '黏人', '讨好', '央求', '卖萌', '求抱抱'] },
    { label: '嫌弃', tier: 12, parents: ['愤怒', '冷淡'], act: '眉头轻皱，嘴角撇下，视线带刺',
        use: '看不上对方、被恶心到、当面给脸色的时候', tags: 'disgust, frown, narrowed eyes, sideways glance',
        words: ['嫌弃', '厌恶', '反感', '排斥', '鄙视', '鄙夷', '不屑', '白眼', '冷哼'] },
    { label: '得意', tier: 12, parent: '喜悦', act: '抬起下巴，嘴角单边上扬，双手叉腰',
        use: '赢了、占了上风、逗到对方的时候', tags: 'smug, smirk, hands on own hips',
        words: ['得意', '骄傲', '自豪', '自信', '傲慢', '炫耀', '嚣张', '挑衅', '坏笑', '捉弄', '狡黠', '嘲讽', '讥讽', '讽刺', '嗤笑', '讥笑', '冷笑', '揶揄', '戏谑', '阴阳怪气'] },
    { label: '冷淡', tier: 12, parents: ['平和', '嫌弃'], act: '视线移开不看对方，半垂着眼，面无表情',
        use: '好感度低、在生气不想理人、懒得回应的时候', tags: 'looking away, half-closed eyes, expressionless, cold',
        words: ['冷淡', '冷漠', '疏离', '无视', '敷衍', '爱答不理', '懒得理'] },
    { label: '大笑', tier: 16, parent: '喜悦', act: '张嘴大笑，眼睛眯成缝，身体前倾',
        use: '笑到失控、气氛最热的时候', tags: 'laughing, open mouth, closed eyes, leaning forward',
        words: ['大笑', '狂喜', '兴奋', '雀跃', '激动', '欢呼', '畅快', '捧腹'] },
    { label: '哭泣', tier: 16, parent: '悲伤', act: '落泪，眼角和鼻尖发红，手抹眼泪',
        use: '忍不住哭出来、情绪崩溃的时候', tags: 'crying, tears, streaming tears, wiping tears, blush',
        words: ['哭泣', '落泪', '流泪', '哽咽', '大哭', '痛哭', '心痛', '悲痛', '痛苦', '崩溃'] },
    { label: '不满', tier: 16, parent: '愤怒', act: '鼓脸噘嘴，抱臂，斜眼瞟对方',
        use: '闹小脾气、吃醋、故意不理你的时候', tags: 'pout, annoyed, crossed arms, glaring sideways',
        words: ['不满', '恼火', '窝火', '烦躁', '烦闷', '抱怨', '不服', '赌气', '闹别扭', '不悦', '吃醋', '嫉妒', '醋意', '眼红', '争宠'] },
    { label: '无奈', tier: 16, parent: '平和', act: '嘴角僵着勉强笑，眼神发飘，肩膀垮下来',
        use: '社交场合撑场面、被为难只能硬接、装没事的时候', tags: 'wry smile, strained smile, looking to the side, shrugging',
        words: ['无奈', '苦笑', '叹气', '扶额', '头疼', '认命', '哭笑不得', '无可奈何', '尴尬', '窘迫', '难堪', '冷场', '局促', '拘谨', '不自在', '假笑'] },
    { label: '心虚', tier: 20, parent: '紧张', act: '干笑，眼神飘开不敢看对方，手指挠脸颊',
        use: '说谎被戳穿、被问到不该问的、想蒙混过去的时候', tags: 'nervous smile, looking to the side, scratching own cheek',
        words: ['心虚', '理亏', '愧疚', '内疚', '装傻', '搪塞', '支吾', '含糊其辞'] },
    { label: '委屈', tier: 20, parent: '悲伤', act: '噘嘴，眼眶含泪忍着不掉，抬眼看人',
        use: '被冤枉、被凶了想讨说法的时候', tags: 'pout, teary eyes, holding back tears, looking up, blush',
        words: ['委屈', '憋屈', '冤枉', '受气', '不甘', '欲哭无泪'] },
    { label: '怀疑', tier: 20, parent: '紧张', act: '眯眼盯着对方，身体半侧，手挡在身前',
        use: '初次见面、对方来历不明、听到可疑的话的时候', tags: 'suspicious, narrowed eyes, wary, arm up',
        words: ['怀疑', '猜疑', '狐疑', '戒备', '警惕', '提防', '防备', '审视', '试探', '敌意'] },
    { label: '动情', tier: 20, parent: '爱恋', act: '眼神湿润地注视对方，嘴唇微张，脸颊泛红，呼吸变浅',
        use: '告白前后、接吻前、距离一下子拉近的时候', tags: 'blush, half-closed eyes, parted lips, looking at viewer',
        actNsfw: '眼神迷离，呼吸略急，身体贴向对方', tagsNsfw: 'blush, half-closed eyes, parted lips, heavy breathing',
        words: ['动情', '情动', '迷离', '意乱情迷', '渴求', '燥热'] },
    { label: '默认', tier: 0, act: '无表情，面无表情，闭嘴，眼神平视，带一个轻量的日常小动作，身体放松',
        use: '没有明确情绪、刚出场、当背景的时候', tags: 'expressionless, closed mouth',
        words: ['无表情', '面无表情', '无语', '木然', '沉默', '默然', '麻木', '认真', '严肃', '发呆', '愣神', '呆滞'] },
];

export const MOOD_PRESET = PRESET_SOURCE.map((entry) => ({
    label: entry.label,
    tier: entry.tier,
    parent: String(entry.parent || ''),
    parents: Array.isArray(entry.parents) ? entry.parents.slice() : [],
    act: String(entry.act || ''),
    use: String(entry.use || ''),
    actNsfw: String(entry.actNsfw || ''),
    tags: String(entry.tags || ''),
    tagsNsfw: String(entry.tagsNsfw || ''),
    words: entry.words.slice(),
}));

const MOOD_PRESET_BY_LABEL = new Map(MOOD_PRESET.map((entry) => [entry.label, entry]));

export function moodPresetEntry(label) {
    return MOOD_PRESET_BY_LABEL.get(String(label || '').trim()) || null;
}

// 这一档要画哪些组：8 ⊂ 12 ⊂ 16 ⊂ 20；nsfw 为 true 时同时带上「动情」。
export function moodTierLabels(tier, { nsfw = false, extra = [] } = {}) {
    const value = Number(tier);
    const max = Number.isFinite(value) && value > 0 ? value : 8;
    const labels = MOOD_PRESET
        .filter((entry) => Number(entry.tier) > 0 && Number(entry.tier) <= max)
        .map((entry) => entry.label);
    if (nsfw && !labels.includes('动情')) labels.push('动情');
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

// 回退顺序：先同方向的另一档（parent），兜底都落到 8 档。只走一层，避免跨方向乱跳。
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

export function moodPresetAct(label, { nsfw = false } = {}) {
    const entry = MOOD_PRESET_BY_LABEL.get(String(label || '').trim());
    if (!entry) return '';
    return (nsfw && entry.actNsfw) || entry.act;
}

// 这组该用在什么场面。写词模型靠它把力度和眼神选对，避免和相邻的组混用。
export function moodPresetUse(label) {
    const entry = MOOD_PRESET_BY_LABEL.get(String(label || '').trim());
    return entry ? entry.use : '';
}

export function moodPresetTags(label, { nsfw = false } = {}) {
    const entry = MOOD_PRESET_BY_LABEL.get(String(label || '').trim());
    if (!entry) return '';
    return (nsfw && entry.tagsNsfw) || entry.tags;
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
