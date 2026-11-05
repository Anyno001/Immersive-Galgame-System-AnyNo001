const SPOKEN_TYPES = new Set(['text', 'voice']);

export function chatTtsLine({ msgKey = '', userName = '', sceneAssets, nsfw = false, context = '', spriteTags = null }, message, index) {
    const text = message.kind === 'recall' ? message.original : message.text;
    if (!text || (message.kind === 'msg' && !SPOKEN_TYPES.has(message.type || 'text'))) return null;
    return {
        key: `${msgKey}:${index}`,
        textType: 'dialogue', text,
        speaker: (message.self && userName) || message.displayName || '',
        speakerKey: message.self && userName ? String(sceneAssets?.userCharacter || '').trim() : '',
        mood: '', phone: false, nsfw, whisper: false, context, spriteTags,
    };
}
