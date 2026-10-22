import { createNarrationSpriteTracker, otherNamesOf, sceneCarryOf, NARRATION_HOLD_PAGES, SCENE_AHEAD_PAGES } from '../../scene/narration-sprite.js';
import { createNarrationNamer } from '../../scene/narration-focus.js';
import { resolveCharacterLive2dBinding } from './live2d-config.js';
import { extractSceneDirectives, resolveCharacterKey, narrativeRanges, prepareIllustrationPages } from '../../scene/scene-directives.js';
import { DEFAULT_MOOD_GROUPS } from '../../scene/mood-groups.js';
import { createOutfitResolver, outfitsOfCharacter } from '../../scene/character-outfits.js';
import { extractFxDirectives, createFxPageResolver } from '../../scene/fx-directives.js';
import { applyDiceToHits } from '../../scene/battle-context.js';
import { parseChatMarker } from '../../scene/chat-blocks.js';
import { liveFallbackOf, withLiveFallback } from '../../scene/live-context.js';
import { withStormCarry } from '../../scene/storm-context.js';
import { stripBilingualTranslation } from './bilingual-text.js';
import { isSystemRole } from './system-role.js';
import { characterDnaText, detectVoiceGender } from './voice-bark.js';
import { prepareEventCgPages } from '../../scene/event-cg.js';
import { normalizeItemName } from '../../data/shujuku/item-catalog.js';

export function stripSegmentSpeaker(text) {
    return String(text || '').trim().replace(/^\*+|\*+$/g, '').replace(/^\s*\[[^\]\n]*\][：:]\s*/, '');
}

export function stripWrappingQuotes(value) {
    const source = String(value == null ? '' : value).trim();
    if (source.length < 2) return source;
    for (const [open, close] of [['“', '”'], ['‘', '’'], ['「', '」'], ['『', '』'], ['"', '"'], ["'", "'"]]) {
        if (source.startsWith(open) && source.endsWith(close)) return source.slice(open.length, -close.length).trim();
    }
    return source;
}

export function lastBefore(entries, offset, inclusive = true) {
    let lo = 0, hi = entries.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (inclusive ? entries[mid].offset <= offset : entries[mid].offset < offset) lo = mid + 1;
        else hi = mid;
    }
    return lo ? entries[lo - 1] : null;
}

// 宽松文本与原文下标的映射每楼最多构造一次；所有分页与 CG 定位共用。
export function createFloorSourceLocator(source) {
    const src = String(source || '');
    const ranges = narrativeRanges(src);
    const zones = ranges.length ? ranges : [[0, src.length]];
    let flat = null, positions = null;
    let looseBuilds = 0;
    function locate(text, from = 0, end = src.length) {
        const needle = String(text || '').trim();
        if (!needle) return -1;
        const start = Math.max(0, Number(from) || 0);
        const exact = src.indexOf(needle, start);
        if (exact >= 0 && exact + needle.length <= end) return exact;
        const loose = needle.replace(/[\s*（）\[\]]+/g, '');
        if (!loose) return -1;
        if (flat === null) {
            const chars = [], map = [];
            for (let i = 0; i < src.length; i += 1) {
                if (/[\s*（）\[\]]/.test(src[i])) continue;
                chars.push(src[i]); map.push(i);
            }
            flat = chars.join(''); positions = map; looseBuilds += 1;
        }
        let lo = 0, hi = positions.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (positions[mid] < start) lo = mid + 1; else hi = mid; }
        const hit = flat.indexOf(loose, lo);
        return hit >= 0 && positions[hit + loose.length - 1] < end ? positions[hit] : -1;
    }
    function segment(text, from = 0) {
        const plain = stripSegmentSpeaker(text);
        for (const [start, end] of zones) {
            if (end <= from) continue;
            // 正文先找，避免格式化说话人前缀注定不命中却先做一次整楼宽松扫描。
            let hit = locate(plain, Math.max(start, from), end);
            if (hit < 0 && plain !== text) hit = locate(text, Math.max(start, from), end);
            if (hit >= 0) return hit;
        }
        return -1;
    }
    return { locate, segment, get looseBuilds() { return looseBuilds; } };
}

// 旁白里常见、情绪词库没收的说法，换成默认情绪组名。
const NARRATION_MOOD_HINTS = Object.freeze({ 怒火: '愤怒', 恼怒: '愤怒', 气得: '愤怒', 动怒: '愤怒', 怒气: '愤怒', 恼火: '愤怒', 怒意: '愤怒' });
// 旁白里的情绪词只认神态写法（委屈地、一脸委屈、有些委屈、小雪委屈）；「那些委屈」「见惯试探」是名词，不换表情。
const MOOD_NEGATE_RE = /(?:不|没|没有|并不|毫不|毫无|从不|别)$/;
const MOOD_FORM_AFTER_RE = /^(?:地|得|着|起来|极了|不已)/;
const MOOD_FORM_BEFORE_RE = /(?:一脸|满脸|满面|写满了?|露出|透着|感到|觉得|显得|变得|几分|有些|有点儿?|很|十分|非常|越发|愈发|更加|格外|一阵)$/;
const MOOD_SUBJECT_TAIL = '(?:微微|轻轻|忍不住|不禁|顿时|立刻|突然|忽然|瞬间|终于|又|也|还)?$';

const normalizeFingerprint = (s) => stripBilingualTranslation(s)
    .replace(/\*（[^）]*）\*/g, '').replace(/[\[\]\*（）]/g, '').replace(/\s+/g, '').trim();

// 只准备可复用的正文数据和资源身份；不在这里读取或永久保存 blob URL。
export function prepareReaderFloor({ text, segments, extracted, payload, scene, readerSettings, userName = '' }) {
    const sceneAssets = readerSettings._sceneAssets || null;
    const sceneDirectives = Array.isArray(extracted.sceneDirectives) ? extracted.sceneDirectives
        : Array.isArray(payload.sceneDirectives) ? payload.sceneDirectives : [];
    const hasIgsDirectives = sceneDirectives.length > 0;
    const source = String(extracted.markerLayoutSource || payload.raw || text || '');
    const locator = createFloorSourceLocator(source);
    let held = -1;
    const locatedOffsets = [];
    const offsets = segments.map((segment) => {
        const found = locator.segment(segment, held < 0 ? 0 : held + 1);
        locatedOffsets.push(found);
        if (found >= 0) held = found;
        return held;
    });
    const inheritedSceneState = payload.inheritedSceneState && payload.inheritedSceneState.scene
        ? { ...payload.inheritedSceneState, lastDirectiveType: 'scene' } : null;
    const outfitDirectives = extractSceneDirectives(source, { outfitResolver: createOutfitResolver(sceneAssets) }).directives;
    const scenes = outfitDirectives.filter(d => d.type === 'scene');
    const sceneAt = (offset) => {
        const own = offset >= 0 ? lastBefore(scenes, offset, false) : null;
        return own && own.scene ? { ...own, character: '', mood: '', lastDirectiveType: 'scene' } : inheritedSceneState;
    };
    const sceneStates = offsets.map(sceneAt);
    const dread = Array.from(source.matchAll(/\[igs-dread:\s*([0-3])\s*\]/g), m => ({ offset: m.index, value: Number(m[1]) }));
    const charThoughtDirectives = sceneDirectives.filter(d => d.type === 'char' || d.type === 'thought');
    const fingerprints = new Map(charThoughtDirectives.map(d => [d, normalizeFingerprint(d.type === 'thought' ? d.thought : d.dialogue)]));
    const bySpeaker = new Map(), speechByPage = new Map(), byFingerprint = new Map();
    for (const d of charThoughtDirectives) {
        if (!bySpeaker.has(d.character)) bySpeaker.set(d.character, []);
        bySpeaker.get(d.character).push(d);
        const fingerprint = fingerprints.get(d);
        if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, []);
        byFingerprint.get(fingerprint).push(d);
        const index = Number(d.segmentIndex);
        if (!speechByPage.has(index)) speechByPage.set(index, []);
        speechByPage.get(index).push(d);
    }
    const latestSpeechByPage = [];
    let latestSpeech = null;
    for (let i = 0; i < segments.length; i++) {
        if (speechByPage.has(i)) latestSpeech = speechByPage.get(i).find(d => d.character) || latestSpeech;
        latestSpeechByPage.push(latestSpeech);
    }
    const thoughtPages = new Map();
    for (const d of charThoughtDirectives) {
        if (d.type !== 'thought') continue;
        const start = Number(d.segmentIndex), thought = fingerprints.get(d);
        if (!Number.isInteger(start) || start < 0 || !thought) continue;
        let consumed = '';
        for (let i = start; i < segments.length; i++) {
            const m = String(segments[i] || '').match(/^\s*\*+\s*([\s\S]*?)\s*\*+\s*$/);
            const part = m ? normalizeFingerprint(m[1]) : '';
            if (!part || !thought.startsWith(consumed + part)) break;
            consumed += part;
            if (!thoughtPages.has(i)) thoughtPages.set(i, d);
        }
    }
    // 角色名单：上传区 + 生成区（AI 生成的角色和别名只登记在生成区），同名时上传区优先；每楼合并一次，主名换算、点名、沿用共用。
    const generatedLib = sceneAssets?.generated && typeof sceneAssets.generated === 'object' ? sceneAssets.generated : {};
    const castCharacters = { ...(generatedLib.characters || {}), ...(sceneAssets?.characters || {}) };
    const castAliases = {};
    // 手动指定的 USER 立绘角色（须在名单里）：酒馆用户名在本次解析中归到它名下，只改这份新拼的别名表，不碰存储。
    const userCharacter = String(sceneAssets?.userCharacter || '').trim();
    // 名单含默认槽或衣柜里有图都算：换装后的立绘只登记在衣柜，不影响「你」开头的旁白换成主角。
    const userCharKey = userCharacter && (Object.hasOwn(castCharacters, userCharacter)
        || Object.keys(outfitsOfCharacter(sceneAssets?.characterOutfits, sceneAssets?.characterAliases, userCharacter).outfits).length > 0) ? userCharacter : '';
    for (const map of [generatedLib.characterAliases, sceneAssets?.characterAliases]) {
        for (const [key, list] of Object.entries(map && typeof map === 'object' ? map : {})) {
            if (Array.isArray(list)) castAliases[key] = [...(castAliases[key] || []), ...list];
        }
    }
    if (userCharKey && userName && !castAliases[userCharKey]?.includes(userName)) castAliases[userCharKey] = [...(castAliases[userCharKey] || []), userName];
    // 只有模型、没有静态图的角色也参加新版旁白点名与场景继承。仅扩展本楼名单，不写静态素材库。
    if (readerSettings._live2d?.enabled) for (const name of Object.keys(readerSettings._live2d.bindings || {})) {
        const key = resolveCharacterKey(castCharacters, castAliases, name) || name;
        if (!Object.hasOwn(castCharacters, key)) castCharacters[key] = {};
    }
    const castKeyMemo = new Map();
    const castKeyOf = name => {
        if (!castKeyMemo.has(name)) castKeyMemo.set(name, resolveCharacterKey(castCharacters, castAliases, name) || name);
        return castKeyMemo.get(name);
    };
    const keyOf = castKeyOf;
    // 本楼说过话 / 有心理活动的 + 前 3 个 AI 楼的；宿主没给前楼名单时（null）不拦。
    const castNearby = Array.isArray(payload.recentCast)
        ? new Set([...charThoughtDirectives.map(d => d.character), ...payload.recentCast].filter(Boolean).map(castKeyOf))
        : null;
    const thoughtCharacters = new Set(charThoughtDirectives.filter(d => d.type === 'thought').map(d => keyOf(d.character)));
    const othersMemo = new Map();
    const othersFor = key => {
        if (!othersMemo.has(key)) othersMemo.set(key, otherNamesOf(castCharacters, castAliases, key, [userName]));
        return othersMemo.get(key);
    };
    const userKey = userCharKey || (userName ? castKeyOf(userName) : '');
    const selfNames = userKey ? [...new Set([userName, ...(castAliases[userKey] || [])].filter(Boolean))] : [];
    // 换场景判断同行 / 留下时的「主角」：酒馆用户名（没对应角色时也算）加上 User 立绘的别名。
    const selfAll = [...new Set([userName, ...selfNames].filter(Boolean))];
    const genderMemo = new Map();
    const genderOf = key => {
        if (!genderMemo.has(key)) genderMemo.set(key, detectVoiceGender(characterDnaText(sceneAssets, key)));
        return genderMemo.get(key);
    };
    // 绑定了 Live2D、默认槽有图、或图只在衣柜里（换装后的立绘），都算有素材。
    const hasSprites = key => Boolean(resolveCharacterLive2dBinding(readerSettings._live2d, sceneAssets, key))
        || Object.keys(castCharacters[key] || {}).length > 0
        || Object.keys(outfitsOfCharacter(sceneAssets?.characterOutfits, sceneAssets?.characterAliases, key).outfits).length > 0;
    // 旁白点名：主角要有素材才上；其他人要在名单里。句首主语 / 感知者 / 被看见的人算本楼露面；只是句中顺口提到的，须本楼或前 3 个 AI 楼露过面（宿主没给前楼名单时不拦）。
    // 指定了 User 立绘时，「你」开头的旁白页也换成主角（第二人称故事）。
    // 已离场、还没被写回来的人：旁白再提他的名字也不上立绘（开口，或这一页正文写他回来了才解除）。
    const goneKeys = new Set();
    let pageText = '';
    // 这一页正文有没有把他写回来。
    const wroteBack = key => {
        const probe = createNarrationSpriteTracker({ name: key, aliases: castAliases[key] || [], others: othersFor(key), gender: genderOf(key), gone: true });
        probe(pageText);
        return !probe.gone;
    };
    const namer = createNarrationNamer({ characters: castCharacters, aliases: castAliases, userKey, userNames: selfNames, genderOf, youLead: Boolean(userCharKey),
        allow: (key, { mention = false } = {}) => (!goneKeys.has(key) || wroteBack(key)) && (key === userKey ? hasSprites(key) : Object.hasOwn(castCharacters, key) && (castNearby === null || castNearby.has(key) || !mention)) });
    // 换场景时谁跟过来（见 carriesAcrossScene）：每个场景标签、每个人只判一次，主立绘与同屏陪衬共用结果。
    const carryMode = ['strict', 'smart', 'loose'].includes(sceneAssets?.sceneCarryMode) ? sceneAssets.sceneCarryMode : 'smart';
    // 段落以场景标签开头（「[igs-scene:…]你听着……」）时，标签和这一页同处一个偏移，这一页已属新场景。
    const sceneOfPage = offsets.map(offset => offset >= 0 ? lastBefore(scenes, offset, true) : null);
    const sceneFirstPage = new Map();
    sceneOfPage.forEach((d, i) => { if (d && !sceneFirstPage.has(d)) sceneFirstPage.set(d, i); });
    const sceneLeads = new Map();
    const carryMemo = new Map(), edgeMemo = new Map(), presentMemo = new Map();
    const SCENE_TAG_RE = /\[igs-[^\]\n]*\]?|\*/g;
    const segmentSpeaker = text => (String(text || '').match(/^\s*\*?\s*\[([^\]]+)\]\s*[:：]/) || [])[1] || '';
    // 场景标签自带的在场名单（第 5 段）：解析出的主名，空表示没写或一个也认不出。
    const presentOf = d => {
        if (!presentMemo.has(d)) presentMemo.set(d, [...new Set((Array.isArray(d.present) ? d.present : [])
            .map(name => resolveCharacterKey(castCharacters, castAliases, name)).filter(Boolean))]);
        return presentMemo.get(d);
    };
    const edgeOf = d => {
        if (!edgeMemo.has(d)) {
            const end = source.indexOf(']', d.offset) + 1 || d.offset;
            const parts = text => text.replace(SCENE_TAG_RE, '').split(/[。！？!?…\n]/).map(s => s.trim()).filter(Boolean);
            const index = scenes.indexOf(d);
            const prev = index > 0 ? scenes[index - 1] : inheritedSceneState;
            const time = s => String(s?.time || '').trim();
            edgeMemo.set(d, { before: parts(source.slice(Math.max(0, d.offset - 240), d.offset)).pop() || '',
                after: parts(source.slice(end, end + 240))[0] || '',
                timeJump: Boolean(time(prev) && time(d) && time(prev) !== time(d)) });
        }
        return edgeMemo.get(d);
    };
    // 返回保留依据（'present' 在场名单 / 'ahead' / 'company' / 'group' / 'loose'），'' 为清掉。
    const carryOf = (d, key) => {
        const memoKey = `${d.offset}|${key}`;
        if (!carryMemo.has(memoKey)) {
            const present = presentOf(d);
            let keep;
            if (present.length) keep = present.includes(key) ? 'present' : '';
            else {
                const first = sceneFirstPage.has(d) ? sceneFirstPage.get(d) : segments.length;
                const ahead = [];
                for (let j = first; j < segments.length && j < first + SCENE_AHEAD_PAGES && sceneOfPage[j] === d; j++) {
                    const speaker = segmentSpeaker(segments[j]);
                    ahead.push({ text: segments[j], by: !speaker ? '' : castKeyOf(speaker) === key ? 'own' : 'other' });
                }
                keep = sceneCarryOf({ name: key, aliases: castAliases[key] || [], others: othersFor(key), self: selfAll,
                    lead: sceneLeads.get(d.offset) === key, gender: genderOf(key), ...edgeOf(d), ahead, mode: carryMode });
            }
            carryMemo.set(memoKey, keep);
        }
        return carryMemo.get(memoKey);
    };
    const carriesAt = (d, key) => Boolean(carryOf(d, key));
    // 旁白点名后的情绪：旁白里以神态写法出现的情绪词（情绪组 + 该角色自己的表情槽名，两字起）取最靠前的一个；没有就沿用上一句。
    let groupMoodWords = null;
    const narrationMood = (text, name) => {
        if (!groupMoodWords) {
            const groups = Array.isArray(sceneAssets?.moodGroups) && sceneAssets.moodGroups.length ? sceneAssets.moodGroups : DEFAULT_MOOD_GROUPS;
            groupMoodWords = groups.flatMap((g) => [g && g.label, ...(Array.isArray(g && g.words) ? g.words : [])]);
            groupMoodWords.push(...Object.keys(NARRATION_MOOD_HINTS));
        }
        const slots = Object.keys(castCharacters[castKeyOf(name)] || {});
        const body = String(text || '');
        const own = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const subjectRe = new RegExp(`(?:${own ? `${own}|` : ''}[她他你])${MOOD_SUBJECT_TAIL}`);
        const isForm = (at, end) => {
            const before = body.slice(Math.max(0, at - 8), at);
            if (MOOD_NEGATE_RE.test(before)) return false;
            return MOOD_FORM_AFTER_RE.test(body.slice(end)) || MOOD_FORM_BEFORE_RE.test(before) || subjectRe.test(before);
        };
        let best = '', bestAt = Infinity;
        for (const raw of [...slots, ...groupMoodWords]) {
            const word = String(raw || '').trim();
            if (Array.from(word).length < 2 || word === '默认') continue;
            let at = body.indexOf(word);
            while (at >= 0 && at <= bestAt && !isForm(at, at + word.length)) at = body.indexOf(word, at + 1);
            if (at >= 0 && (at < bestAt || (at === bestAt && word.length > best.length))) { best = word; bestAt = at; }
        }
        return NARRATION_MOOD_HINTS[best] || best;
    };
    let lastBubble = null;
    const lastMoodByKey = new Map();
    let narrationTracker = null;
    // 本场景起始页：换场景没跟过来时，按段索引兜底取说话人也不越过它。
    let speechFloor = 0;
    const pages = [];
    for (let normalizedIndex = 0; normalizedIndex < segments.length; normalizedIndex++) {
        const currentText = segments[normalizedIndex];
        const sceneStateForBg = sceneStates[normalizedIndex];
        if (!sceneAssets?.enabled) {
            pages.push({ textType: 'narration', bubbleSpeaker: '', bubbleMood: '', segmentBody: currentText,
                spriteChar: '', spriteMood: '', systemSpeaker: '', currentOffset: offsets[normalizedIndex], sceneStateForBg });
            continue;
        }
        // 跨过 [igs-scene]：上一页的立绘人物只有判定跟过来才沿用（计数从头算），否则不再沿用；
        // 标签写了在场名单而上一页的人不在其中时，名单里第一个有素材的人上场。
        const sceneHere = sceneOfPage[normalizedIndex];
        if (normalizedIndex > 0 && sceneHere && sceneHere !== sceneOfPage[normalizedIndex - 1]) {
            const prev = pages[normalizedIndex - 1];
            const leadKey = prev.spriteChar ? castKeyOf(prev.spriteChar) : '';
            if (leadKey) sceneLeads.set(sceneHere.offset, leadKey);
            const enter = presentOf(sceneHere).find(key => key !== leadKey && hasSprites(key));
            if (leadKey && carriesAt(sceneHere, leadKey)) {
                lastBubble = { speaker: prev.spriteChar, mood: prev.spriteMood, index: normalizedIndex - 1 };
            } else if (enter) {
                lastBubble = { speaker: enter, mood: lastMoodByKey.get(enter) || '', index: normalizedIndex - 1 };
            } else lastBubble = null;
            speechFloor = normalizedIndex;
            narrationTracker = null;
            goneKeys.clear();
            namer.cross(key => carriesAt(sceneHere, key));
        }
        let textType = 'narration', bubbleSpeaker = '', bubbleMood = '', segmentBody = currentText;
        let spriteMood = '', systemSpeaker = '', spriteLeft = false;
        // Match this bubble back to its directive by speaker + dialogue/thought text
        // fingerprint, not by row ordinal. Reformatting (image blocks, italic narration,
        // merged/stripped lines) desyncs any positional counter, so we look the source
        // text up directly. normalizeFingerprint strips the translation tail *（…）*,
        // bilingual 〖…〗 translations, brackets and whitespace so a substring compare is stable.
        // 严格认领：整句相等，或当前段不少于 6 字且是指令原文的片段。
        // 12 字前缀的双向包含会让「……」「嗯。」这类短台词认领以它开头或含它的旁白，只能用于已判定类型的段补情绪。
        const textMatchesDirective = (bodyKey, d) => {
            const src = fingerprints.get(d);
            if (!bodyKey || !src) return false;
            return bodyKey === src || (bodyKey.length >= 6 && src.includes(bodyKey));
        };
        const findDirectiveByText = (speaker, body, match = {}) => {
            const bodyKey = normalizeFingerprint(body);
            if (!bodyKey) return null;
            const exactMatches = (byFingerprint.get(bodyKey) || []).filter(d => (!speaker || d.character === speaker) && (!match.type || d.type === match.type));
            const exact = lastBefore(exactMatches, offsets[normalizedIndex]) || exactMatches[0];
            if (exact) return exact;
            const probe = bodyKey.slice(0, 12);
            const pool = (speaker ? bySpeaker.get(speaker) || [] : charThoughtDirectives).filter((d) => !match.type || d.type === match.type);
            for (const d of pool) {
                if (match.strict) {
                    if (textMatchesDirective(bodyKey, d)) return d;
                    continue;
                }
                const src = fingerprints.get(d);
                if (src && (src.includes(probe) || probe.includes(src.slice(0, 12)))) return d;
            }
            return null;
        };
        // 分页后的短心理话不足六字，不能靠全文子串匹配认领。仅从该
        // 指令的可见起始页连续消费 *…* 页；一旦越过原文或遇到旁白就停止。
        const findPagedThought = () => thoughtPages.get(normalizedIndex) || null;
        const classifySegment = (segText) => {
            // 没有任何 [igs-*:] 指令时禁止按文本外形猜测台词/心理话，统一按旁白兜底。
            if (!hasIgsDirectives) return null;
            const seg = String(segText || '');
            const tMatch = seg.match(/^\s*\*\s*(?:\[([^\]]+)\]\s*[:：]\s*)?([\s\S]*?)\s*\*\s*$/);
            const dMatch = seg.match(/^\s*\[([^\]]+)\]\s*[:：]\s*([\s\S]*)$/);
            if (tMatch) {
                let sp = tMatch[1] ? tMatch[1].trim() : '';
                // 正文可能写作 **…**（成对双星号），匹配指令前剥掉残留星号。
                const bodyText = String(tMatch[2] || '').replace(/^\s*\*+\s*/, '').replace(/\s*\*+\s*$/, '').trim();
                // 无角色名的 *…* 也可能是 AI 的斜体旁白：只有严格对上某条心里话指令才算心理活动。
                const matched = sp
                    ? findDirectiveByText(sp, bodyText) || findDirectiveByText(sp, tMatch[2])
                    : findDirectiveByText('', bodyText, { strict: true, type: 'thought' })
                        || (seg === currentText ? findPagedThought() : null);
                if (!sp && !matched) return null;
                if (!sp) sp = matched.character || '';
                return { textType: 'thought', speaker: sp, mood: matched ? (matched.mood || '') : '', body: seg };
            }
            if (dMatch) {
                const sp = dMatch[1].trim();
                const matched = findDirectiveByText(sp, dMatch[2]);
                return { textType: 'dialogue', speaker: sp, mood: matched ? (matched.mood || '') : '', body: stripWrappingQuotes(dMatch[2]) };
            }
            return null;
        };
        const classified = classifySegment(currentText);
        if (classified) {
            textType = classified.textType;
            bubbleSpeaker = classified.speaker;
            bubbleMood = classified.mood;
            segmentBody = classified.body;
        }
        // 兜底：段落缺「[名字]：」前缀（自定义格式化规则等）时找回说话人。
        // 段索引会错位、文本相似度会误认，两条路径都必须严格对上指令原文，旁白页不借用相邻台词。
        if (!bubbleSpeaker) {
            const probeKey = normalizeFingerprint(String(currentText || '')
                .replace(/^\s*\*+\s*/, '').replace(/\s*\*+\s*$/, '')
                .replace(/^\s*\[[^\]]+\]\s*[:：]\s*/, ''));
            const segDirective = (speechByPage.get(normalizedIndex) || []).find((d) => textMatchesDirective(probeKey, d));
            // 「……」「嗯。」这类短句旁白与台词可能逐字相同，不带段索引佐证时不按文本认领。
            const matchedDirective = segDirective
                || (probeKey.length >= 6 ? findDirectiveByText('', probeKey, { strict: true }) : null);

            if (matchedDirective) {
                textType = matchedDirective.type === 'thought' ? 'thought' : 'dialogue';
                bubbleSpeaker = matchedDirective.character || scene.speaker;
                bubbleMood = matchedDirective.mood || '';
            }
        }
        // 系统类角色的台词按独立旁白样式渲染：不显示立绘与状态栏角色，名字按设置决定。
        if (textType === 'dialogue' && isSystemRole(bubbleSpeaker, readerSettings.systemRole)) {
            textType = 'system';
            systemSpeaker = bubbleSpeaker;
            bubbleSpeaker = '';
            bubbleMood = '';
        }

        // Sprite resolves from the bubble's own speaker/mood, not the row-counted
        // segmentIndex (which desyncs once char/thought tags are reformatted into
        // visible bubble lines). Background still follows directive accumulation.
        let spriteChar = bubbleSpeaker;
        spriteMood = bubbleMood;
        // 旁白点名（默认开）：感知句的宾语、开头三个字内的名字、或能唯一归属的她 / 他（见 narration-focus），立绘换成这个人。
        // 点名页自己也做离场判断（「小雪转身离开」当页就收），后面的旁白接着沿用。
        // 情绪：旁白里的情绪词 → 这个人本楼上次的情绪 → 默认。
        let inheritFrom = null, inheritHold = NARRATION_HOLD_PAGES;
        if (textType === 'narration') {
            // 已离场的人这一页正文写他回来了（名字不在句首也算），先解除，再走旁白点名。
            pageText = currentText;
            for (const key of [...goneKeys]) if (wroteBack(key)) goneKeys.delete(key);
        }
        if (textType === 'narration' && !spriteChar && sceneAssets.narrationNameSwitch !== false) {
            const focus = normalizedIndex > 0 && pages[normalizedIndex - 1].spriteChar ? castKeyOf(pages[normalizedIndex - 1].spriteChar) : '';
            // 上一页台上没人（楼首页、人都走了）：名字不在开头也认，免得开场旁白空立绘。
            const named = namer.read(currentText, { focus, loose: !focus });
            if (named) {
                spriteChar = named;
                spriteMood = narrationMood(currentText, named) || lastMoodByKey.get(named) || '';
                lastBubble = { speaker: named, mood: spriteMood, index: normalizedIndex - 1, hold: NARRATION_HOLD_PAGES + 1 };
                inheritFrom = lastBubble.index;
                inheritHold = lastBubble.hold;
            }
        } else if (bubbleSpeaker) { namer.note(castKeyOf(bubbleSpeaker)); goneKeys.delete(castKeyOf(bubbleSpeaker)); }
        // 旁白直接继承已准备的最近说话页，不再回扫前面的所有页。
        if (!spriteChar && lastBubble) {
            spriteChar = lastBubble.speaker;
            spriteMood = lastBubble.mood;
            inheritFrom = lastBubble.index;
            inheritHold = lastBubble.hold || NARRATION_HOLD_PAGES;
        }
        // 回溯也失败时（段落前缀被剥离，文本已不含「[名字]：」）按段索引取 char/thought 指令。
        // 只用于立绘继承，不改 textType，避免把旁白页误判成角色页。
        if (!spriteChar) {
            const d = latestSpeechByPage[normalizedIndex];
            if (d && !(Number(d.segmentIndex) < speechFloor)) {
                spriteChar = d.character;
                spriteMood = d.mood || '';
                if (Number(d.segmentIndex) < normalizedIndex) inheritFrom = Number(d.segmentIndex);
            }
        }
        // 旁白页沿用的立绘：写到这个人离开就清掉；离台词超过 2 页且旁白不再写这个人也收起（见 narration-sprite）。
        let narrationDropped = false;
        let narrationDroppedKey = '';
        if (spriteChar && inheritFrom !== null) {
            const key = keyOf(spriteChar);
            const pov = (userKey && userKey === key)
                || thoughtCharacters.has(key);
            if (!narrationTracker || narrationTracker.key !== key || narrationTracker.anchor !== inheritFrom || narrationTracker.index !== normalizedIndex - 1) {
                narrationTracker = { key, anchor: inheritFrom, index: inheritFrom,
                    push: createNarrationSpriteTracker({ name: spriteChar, aliases: [key, ...(castAliases[key] || [])], others: othersFor(key), pov, gender: genderOf(key), hold: inheritHold, self: selfAll }) };
                for (let i = inheritFrom + 1; i < normalizedIndex; i++) narrationTracker.push(segments[i], segments[i + 1]);
            }
            const keep = narrationTracker.push(currentText, segments[normalizedIndex + 1]);
            // 真离场记下来；沿用到期只是不再显示，不算离场。
            if (narrationTracker.push.gone) goneKeys.add(key); else goneKeys.delete(key);
            narrationTracker.index = normalizedIndex;
            if (!keep) {
                spriteChar = '';
                spriteMood = '';
                narrationDropped = true;
                spriteLeft = true;
                if (narrationTracker.push.gone || narrationTracker.push.soft) narrationDroppedKey = key;
            }
        }
        if (!spriteChar && !narrationDropped && sceneStateForBg && sceneStateForBg.character) {
            // Fallback for untransformed/legacy paths where the bubble text still
            // carries the raw tag (no reformatted "[名字]：" line to parse).
            spriteChar = sceneStateForBg.character;
            spriteMood = sceneStateForBg.mood || '';
        }
        if (classified && classified.speaker) lastBubble = { ...classified, index: normalizedIndex };
        if (spriteChar && spriteMood) lastMoodByKey.set(castKeyOf(spriteChar), spriteMood);
        pages.push({ textType, bubbleSpeaker, bubbleMood, segmentBody, systemSpeaker, spriteChar, spriteMood,
            narrationDropped, narrationDroppedKey, spriteLeft, currentOffset: offsets[normalizedIndex], sceneStateForBg,
            sceneDread: (lastBefore(dread, offsets[normalizedIndex] < 0 ? source.length : offsets[normalizedIndex], false)?.value) ?? payload.inheritedDread ?? null });
    }
    const flags = sceneStates.map(s => Boolean(s && s.nsfw));
    for (let start = 0; start < pages.length;) {
        if (!flags[start]) { start++; continue; }
        let end = start;
        while (end + 1 < pages.length && flags[end + 1]) end++;
        for (let i = start; i <= end; i++) pages[i].nsfwSpan = {
            index: i - start, length: end - start + 1,
            continued: start === 0 && Boolean(payload.inheritedSceneState?.nsfw), endsInFloor: end < pages.length - 1,
        };
        start = end + 1;
    }
    const liveFallback = readerSettings.liveFx?.enabled === true ? liveFallbackOf(userName) : null;
    const rawFx = extractFxDirectives(source);
    const liveFx = liveFallback ? withLiveFallback(rawFx, source, payload.liveContext, liveFallback) : rawFx;
    const fxDirectives = payload.stormContext && readerSettings.feedFx?.enabled === true && readerSettings.feedFx?.storm?.enabled !== false
        ? withStormCarry(liveFx, payload.stormContext) : liveFx;
    const battleContext = payload.battleContext || null;
    const battleFx = battleContext ? applyDiceToHits(fxDirectives, battleContext.dice, userName) : fxDirectives;
    const cues = battleFx.filter(d => d.cue && d.kind === 'live');
    const feeds = battleFx.filter(d => d.kind === 'app' && !d.end);
    const fxForPage = createFxPageResolver(battleFx, battleContext);
    for (let i = 0; i < pages.length; i++) {
        let at = offsets[i];
        const prev = i ? offsets[i - 1] : -1;
        if (at < 0 && parseChatMarker(segments[i]) >= 0) {
            const chatStart = source.slice(prev + 1).search(/\[igs-(?:chat:|msg:)/);
            if (chatStart >= 0) at = prev + 1 + chatStart;
        }
        const next = i + 1 < pages.length ? locatedOffsets[i + 1] : Infinity;
        const paged = next > at && cues.some(d => d.offset > at && d.offset < next)
            ? battleFx.map(d => d.cue && d.kind === 'live' && d.offset > at && d.offset < next ? { ...d, offset: at } : d)
                .sort((a, b) => a.offset - b.offset) : battleFx;
        let feedNext = -1;
        if (at >= 0 && feeds.some(d => d.offset > at)) {
            feedNext = Infinity;
            for (let n = i + 1; n < pages.length; n++) if (locatedOffsets[n] > at) { feedNext = locatedOffsets[n]; break; }
        }
        pages[i].fxOffset = at;
        pages[i].fx = fxForPage(at, prev, feedNext, paged);
        if (battleContext) pages[i].fx.userName = userName;
    }
    const illustrations = prepareIllustrationPages({ source, offsets, segments, holdPages: readerSettings.cgHoldPages,
        inheritedNsfw: Boolean(payload.inheritedSceneState?.nsfw), sceneAt });
    const eventCgs = prepareEventCgPages({ source, segments, holdPages: readerSettings.cgHoldPages, eventCgs: sceneAssets?.eventCgs });
    const tagItems = fxDirectives.filter(d => d.kind === 'item').map(d => ({ action: d.args[0], name: d.args[1], description: d.args[2] || '' }));
    const itemTargets = new Map();
    const itemPageFor = name => {
        if (!itemTargets.has(name)) itemTargets.set(name, Math.max(0, segments.findIndex(text => String(text || '').includes(name))));
        return itemTargets.get(name);
    };
    return { text, segments, source, sceneDirectives, outfitDirectives, inheritedSceneState, pages, offsets,
        sceneAt, locator, keyOf, castCharacters, castAliases, selfNames: selfAll, carriesAcross: carriesAt, carryOf, sceneOfPage, sceneLeads, presentOf, genderOf, userName, userKey, userSource: userCharKey ? 'manual' : userKey ? 'name' : '', sceneSpeaker: scene.speaker, latestSpeechByPage, fxDirectives, illustrations, eventCgs,
        tagItems, tagNames: new Set(tagItems.map(item => normalizeItemName(item.name))), itemPageFor, assets: null, tablesRevision: -1 };
}
