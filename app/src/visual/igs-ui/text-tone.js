import { COMIC_TONE_KINDS } from './comic-settings.js';

// 对话泡外形判定（纯函数）：文本类型优先，其次 AI 写下的语气记号，最后看情绪词表。
// 返回 narration / thought / shout / fear / whisper / dark / cute / calm / phone / system / speech。
const SHOUT_MARK = /[！!]{2,}|\{吼[:：]/;

export function resolveComicTone({ textType = '', text = '', emotion = '', tones = null, whisper = false, phone = false } = {}) {
    if (textType === 'narration') return 'narration';
    if (textType === 'system' || textType === 'chat') return 'system';
    if (textType === 'thought') return 'thought';
    const raw = String(text || '');
    if (SHOUT_MARK.test(raw)) return 'shout';
    const target = String(emotion || '').trim();
    if (target && tones) {
        const hit = COMIC_TONE_KINDS.find((kind) => Array.isArray(tones[kind]) && tones[kind].includes(target));
        if (hit) return hit;
    }
    if (whisper) return 'whisper';
    if (phone) return 'phone';
    return 'speech';
}
