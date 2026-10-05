// 配乐情绪词表：标签解析（scene）与选曲（visual/bgm-library）共用。AI 只写中文单字，别名兜住常见近义写法。
export const BGM_MOODS = Object.freeze(['daily', 'cheerful', 'sweet', 'calm', 'sad', 'tense', 'battle', 'eerie']);
export const BGM_MOOD_LABELS = Object.freeze({
    daily: '日常', cheerful: '欢快', sweet: '甜', calm: '静', sad: '悲', tense: '紧', battle: '战', eerie: '诡',
});
const MOOD_ALIASES = Object.freeze({
    日常: 'daily', 平常: 'daily', 欢快: 'cheerful', 欢乐: 'cheerful', 轻快: 'cheerful', 开心: 'cheerful', 快乐: 'cheerful',
    甜: 'sweet', 甜蜜: 'sweet', 浪漫: 'sweet', 暧昧: 'sweet', 恋爱: 'sweet',
    静: 'calm', 安静: 'calm', 宁静: 'calm', 平静: 'calm', 温馨: 'calm',
    悲: 'sad', 悲伤: 'sad', 伤感: 'sad', 哀伤: 'sad', 离别: 'sad',
    紧: 'tense', 紧张: 'tense', 悬疑: 'tense', 对峙: 'tense', 严肃: 'tense',
    战: 'battle', 战斗: 'battle', 打斗: 'battle',
    诡: 'eerie', 诡异: 'eerie', 恐怖: 'eerie', 阴森: 'eerie', 神秘: 'eerie',
});

// 留白：关键时刻（告白、噩耗、真相揭晓）让音乐停下来。不是曲目情绪，不进情绪池，只能由标签或告白触发。
export const BGM_SILENCE = 'silence';
const SILENCE_WORDS = Object.freeze(['无声', '静音', '留白', '停', 'silence']);

// 配乐标签的取值：情绪，或留白；都不是时返回空串。
export function normalizeBgmCue(value) {
    const mood = normalizeBgmMood(value);
    if (mood) return mood;
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    return SILENCE_WORDS.includes(raw) ? BGM_SILENCE : '';
}

export function normalizeBgmMood(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (BGM_MOODS.includes(lower)) return lower;
    return Object.hasOwn(MOOD_ALIASES, raw) ? MOOD_ALIASES[raw] : '';
}
