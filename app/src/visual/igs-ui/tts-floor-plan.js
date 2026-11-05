import { buildIgsTextPayload } from '../../scene/message-source.js';
import { extractSceneDirectives, resolveLatestSceneDirective } from '../../scene/scene-directives.js';
import { parseHtmlCardMarker } from '../../scene/html-cards.js';
import { formatChatBlockAsText, parseChatMarker } from '../../scene/chat-blocks.js';
import { buildChatPageModel, normalizeChatShowSettings } from './chat-show-runtime.js';
import { chatTtsLine } from './chat-tts-line.js';
import { isSystemRole } from './system-role.js';
import { nextTtsHintOf, prepareReaderFloor } from './reader-floor-plan.js';
import { normalizeRomanceFxSettings, resolveRomanceLevel } from './romance-settings.js';

export function ttsPageWhisper(page, readerSettings) {
    const settings = normalizeRomanceFxSettings(readerSettings.romanceFx);
    const level = resolveRomanceLevel({ settings, fx: page?.fx, nsfw: page?.sceneStateForBg?.nsfw === true, pageKind: 'text' });
    return Boolean(page?.fx?.whisper) || (level === 2 && settings.softSound !== false) || (level === 3 && settings.nsfwSound === true);
}

export function ttsPageHint(page, keyOf, readerSettings) {
    const hint = nextTtsHintOf(page, keyOf);
    return hint ? { ...hint, whisper: ttsPageWhisper(page, readerSettings) } : null;
}

export function prepareTtsFloorPlan(floor, readerSettings, { sourceFilter, virtualRegex, userName = '', readFloor } = {}) {
    const extracted = buildIgsTextPayload(floor.text, {
        sourceFilter, virtualRegex, sceneAssets: readerSettings._sceneAssets,
        sentencePaging: readerSettings._sentencePaging,
        dialogueSentencePaging: readerSettings._dialogueSentencePaging,
    });
    let inheritedSceneState = null, aiFloors = 0;
    if (readerSettings._sceneAssets?.enabled && readFloor) {
        for (let id = floor.messageId - 1, scanned = 0; id >= 0 && aiFloors < 3 && scanned < 12; id--, scanned++) {
            const previous = readFloor(id);
            if (!previous?.isAi) continue;
            aiFloors++;
            inheritedSceneState = resolveLatestSceneDirective(extractSceneDirectives(previous.text).directives);
            if (inheritedSceneState) break;
        }
    }
    return prepareReaderFloor({
        text: extracted.formattedText, segments: extracted.textSegments, extracted,
        payload: { raw: floor.text, messageId: floor.messageId, inheritedSceneState }, scene: {}, readerSettings, userName,
    });
}

export function ttsFloorLines(prepared, readerSettings, { userName = '' } = {}) {
    const { segments, pages, keyOf, chats = [], text } = prepared;
    const assets = readerSettings._sceneAssets;
    const chatSettings = normalizeChatShowSettings(readerSettings.chatShow);
    return segments.flatMap((segment, index) => {
        if (parseHtmlCardMarker(segment) >= 0) return [];
        const page = pages[index];
        if (!page) return [];
        const hint = ttsPageHint(page, keyOf, readerSettings);
        const common = { context: text, spriteTags: readerSettings._tempSpriteTags, nsfw: Boolean(page.sceneStateForBg?.nsfw) };
        const chat = chats[parseChatMarker(segment)];
        if (chat) {
            const systemOnly = chat.messages.every(message => message.kind !== 'msg' || isSystemRole(message.sender, readerSettings.systemRole));
            if (systemOnly) return [{ line: { ...common, textType: 'narration', text: chat.messages.map(message => message.text).filter(Boolean).join('\n') } }];
            if (!chatSettings.enabled) return [{ line: { ...common, textType: page.textType, text: formatChatBlockAsText(chat) } }];
            const model = buildChatPageModel(chat, chatSettings, {
                userName, characterAliases: assets?.characterAliases, systemRole: readerSettings.systemRole,
                pagesAfter: segments.length - 1 - index,
            });
            return model.messages.flatMap((message, at) => {
                const line = chatTtsLine({ userName, sceneAssets: assets, ...common }, message, at);
                return line ? [{ line: { ...common, ...line } }] : [];
            });
        }
        return [{ line: {
            ...common, ...hint, textType: page.textType === 'system' ? 'narration' : page.textType, speaker: page.bubbleSpeaker || '',
            whisper: ttsPageWhisper(page, readerSettings),
            text: assets?.enabled ? page.segmentBody : segment,
        } }];
    });
}
