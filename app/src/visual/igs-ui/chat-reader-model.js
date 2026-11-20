import { normalizeChatReaderSettings } from './chat-reader-settings.js';
import { isContinuation } from './log-reader-model.js';

export { CHAT_READER_DIMS, CHAT_READER_GAPS, CHAT_READER_RADII, normalizeChatReaderSettings } from './chat-reader-settings.js';

// 头像取景框（px）：比纵向小，取景偏移仍以头像宽为单位，与纵向共用存下的取景。
export const CHAT_AVATAR_BOX = Object.freeze({ w: 40, h: 40, faceY: 17 });

// 同一人连续说话、情绪组不变才归一组（与纵向同一口径）：换了情绪另起一组，组头换成该情绪的差分头像并重新写名字。
export function isChatCont(rows, i) {
    return isContinuation(rows, i);
}

export function chatSettingsOf(readerSettings) {
    const s = normalizeChatReaderSettings(readerSettings && readerSettings.chatReader);
    return s.chain ? s : { ...s, perTap: 1 };
}
