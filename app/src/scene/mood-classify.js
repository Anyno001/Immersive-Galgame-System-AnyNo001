import { normalizeAutoIllustrationSettings } from '../generated-images/illustration/auto-illustration-settings.js';

// 各组里已有的词是用户的分类习惯。新词必须按这个习惯归进已有组，不新建组。
export const MOOD_CLASSIFY_SYSTEM = [
    '你只负责把新的情绪词归入给出的已有情绪组。',
    '每一组里已经有的词，是用户自己的分类习惯。按这个习惯，为每个新词选择最合适的一个已有组。',
    '每个新词恰好出现一次。不新建组，不删除词，不改已有的词。',
    '只返回 JSON：{"assignments":[{"word":"原词","group":"已有组名"}]}。',
].join('');

export function resolveSecondaryLlm(autoIllustration) {
    const configured = normalizeAutoIllustrationSettings(autoIllustration).llm;
    const endpoint = String(configured.endpoint || '').trim();
    const model = String(configured.model || '').trim();
    if (configured.source === 'openai' && endpoint && model) return configured;
    return { ...configured, source: 'tavern' };
}

export function buildMoodClassificationRequest(groups, words) {
    const payload = {
        groups: (Array.isArray(groups) ? groups : []).map((group) => ({
            label: group && group.label,
            words: Array.isArray(group && group.words) ? group.words : [],
        })),
        words: Array.isArray(words) ? words : [],
    };
    return { system: MOOD_CLASSIFY_SYSTEM, user: JSON.stringify(payload) };
}

function readClassificationJson(raw) {
    const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(text);
    } catch { /* 模型常在 JSON 前后加一句说明 */ }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('invalid-assignments');
}

// 每个待分类的词恰好一次，组名必须是已有组。不合规就整批作废，不写进词库。
export function parseMoodClassification(raw, expectedWords, labels) {
    const parsed = readClassificationJson(raw);
    const assignments = parsed && parsed.assignments;
    const expected = new Set(expectedWords);
    const allowed = Array.isArray(labels) ? labels : [];
    const results = new Map();
    if (!Array.isArray(assignments) || assignments.length !== expected.size) throw new Error('invalid-assignments');
    for (const entry of assignments) {
        const word = entry && entry.word;
        const group = entry && entry.group;
        if (!expected.has(word) || !allowed.includes(group) || results.has(word)) throw new Error('invalid-assignment');
        results.set(word, group);
    }
    return results;
}

export function applyMoodAssignments(groups, results) {
    const next = (Array.isArray(groups) ? groups : []).map((group) => ({
        ...group,
        words: Array.isArray(group && group.words) ? group.words.slice() : [],
    }));
    const map = results instanceof Map ? results : new Map(results || []);
    for (const [word, label] of map) {
        const group = next.find((entry) => entry && entry.label === label);
        if (!group) continue;
        for (const other of next) {
            if (other !== group) other.words = other.words.filter((item) => item !== word);
        }
        if (!group.words.includes(word)) group.words.push(word);
    }
    return next;
}

// 整理整个情绪库：已有的词全部重新归组，动作、神态描写、括号里的舞台说明等不是情绪的词剔除。
export const MOOD_RECLASSIFY_SYSTEM = [
    '你负责整理一份情绪词库。给出的每个组名是一种情绪，组里的词是归到这种情绪下的词。',
    '把所有词重新检查一遍：是情绪（心情、感受、情绪状态）的，放进最合适的一个已有组；',
    '不是情绪的剔除，例如动作或姿势（点头、挥手、叹气、抱臂）、神态或身体描写（脸红、流泪、皱眉）、括号里的舞台说明、物品、地点、人名。',
    '拿不准时保留在原组。不新建组，不改组名，不改词的写法，每个词只出现一次。',
    '只返回 JSON：{"assignments":[{"word":"原词","group":"已有组名"}],"removed":["原词"]}。',
].join('');

export function buildMoodReclassifyRequest(groups) {
    const payload = {
        groups: (Array.isArray(groups) ? groups : []).map((group) => ({
            label: group && group.label,
            words: Array.isArray(group && group.words) ? group.words : [],
        })),
    };
    return { system: MOOD_RECLASSIFY_SYSTEM, user: JSON.stringify(payload) };
}

// 词多时模型常漏几个：漏掉的留在原组，不认识的词、不存在的组一律忽略；组名本身不剔除。
// 返回 { groups, moved, removed }；moved 为换了组的词数。
export function applyMoodReclassification(groups, raw) {
    const parsed = readClassificationJson(raw);
    const source = (Array.isArray(groups) ? groups : []).map((group) => ({
        ...group,
        words: Array.isArray(group && group.words) ? group.words.slice() : [],
    }));
    const labels = new Set(source.map((group) => group.label));
    const home = new Map();
    for (const group of source) for (const word of group.words) if (!home.has(word)) home.set(word, group.label);
    if (!parsed || (!Array.isArray(parsed.assignments) && !Array.isArray(parsed.removed))) throw new Error('invalid-reclassification');
    const target = new Map();
    for (const entry of Array.isArray(parsed.assignments) ? parsed.assignments : []) {
        const word = entry && entry.word;
        const group = entry && entry.group;
        if (home.has(word) && labels.has(group) && !target.has(word)) target.set(word, group);
    }
    const removed = [];
    for (const word of Array.isArray(parsed.removed) ? parsed.removed : []) {
        if (!home.has(word) || target.has(word) || labels.has(word) || removed.includes(word)) continue;
        removed.push(word);
    }
    const drop = new Set(removed);
    let moved = 0;
    const next = source.map((group) => ({ ...group, words: [] }));
    const byLabel = new Map(next.map((group) => [group.label, group]));
    for (const [word, label] of home) {
        if (drop.has(word)) continue;
        const to = target.get(word) || label;
        if (to !== label) moved += 1;
        byLabel.get(to).words.push(word);
    }
    return { groups: next, moved, removed };
}
