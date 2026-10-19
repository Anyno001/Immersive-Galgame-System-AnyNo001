import { stripIllustrationMarkers } from './scene-directives.js';

const KEY = 'igs:outfit-review:v1';
export const OUTFIT_REVIEW_LIMIT = 50;

// 待确认服装词：AI 在服装栏写出、但该角色没有登记的服装名。独立于设置与预设存放，渲染时记录不触发设置保存。
export function loadOutfitReview(storage) {
    try {
        const raw = storage && storage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed && parsed.items) ? parsed.items.filter((item) => item && item.word && item.character) : [];
    } catch { return []; }
}

function saveOutfitReview(storage, items) {
    try {
        storage.setItem(KEY, JSON.stringify({ version: 1, items: items.slice(0, OUTFIT_REVIEW_LIMIT) }));
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: 'store-write-failed', saveError: error };
    }
}

const same = (item, character, word) => item.character === character && item.word === word;

// 同角色同词只记一条；已在列表里时不写存储，避免每次翻页都写。
export function recordOutfitReview(storage, entry) {
    const word = String(entry && entry.word || '').trim();
    const character = String(entry && entry.character || '').trim();
    if (!word || !character) return false;
    const items = loadOutfitReview(storage);
    if (items.some((item) => same(item, character, word))) return false;
    saveOutfitReview(storage, [{ character, word }, ...items]);
    return true;
}

export function removeOutfitReview(storage, character, word) {
    const items = loadOutfitReview(storage);
    const next = items.filter((item) => !same(item, character, word));
    return next.length !== items.length ? saveOutfitReview(storage, next) : { ok: true };
}

// 这个角色已经登记了这件衣服（服装名或服装词），就不再算待确认。isRegistered(character, word) 由调用方按素材判断。
export function dropConfirmedOutfitReview(storage, isRegistered) {
    const registered = typeof isRegistered === 'function' ? isRegistered : () => false;
    const items = loadOutfitReview(storage);
    const next = items.filter((item) => !registered(item.character, item.word));
    if (next.length !== items.length) saveOutfitReview(storage, next);
    return next;
}

export function clearOutfitReview(storage) {
    return saveOutfitReview(storage, []);
}
// 剧情候选独立保存，旧待确认词的清理不影响未完成图片；不保存正文或 DNA。
const STORY_KEY = 'igs:story-outfit-review:v1';
const storyFields = ['id', 'character', 'word', 'scopeKey', 'ownerKey', 'floorKey', 'sourceHash', 'messageId', 'status', 'prompt', 'promptHalfBody', 'imageId'];
export const storyOutfitKey = row => JSON.stringify([row.scopeKey, row.ownerKey, row.floorKey, row.character, row.word]);
export const storyOutfitId = row => JSON.stringify([row.scopeKey, row.ownerKey, row.floorKey, row.sourceHash, row.character, row.word]);
export function storyOutfitSourceHash(value) {
    const text = stripIllustrationMarkers(value).trim();
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(36);
}
const validStoryRow = row => row && typeof row.id === 'string' && row.id === storyOutfitId(row)
    && ['character', 'word', 'floorKey', 'sourceHash'].every(key => typeof row[key] === 'string' && row[key].trim())
    && ['scopeKey', 'ownerKey'].every(key => typeof row[key] === 'string')
    && !['__proto__', 'constructor', 'prototype'].includes(row.character)
    && Number.isSafeInteger(row.messageId) && row.messageId >= 0
    && (row.prompt === undefined || (typeof row.prompt === 'string' && row.prompt.trim()
        && row.prompt.length <= 4096 && !/<<\s*(?:dna|outfit)/i.test(row.prompt)))
    && (row.promptHalfBody === undefined || (typeof row.promptHalfBody === 'string' && row.promptHalfBody.trim()
        && row.promptHalfBody.length <= 4096 && !/<<\s*(?:dna|outfit)/i.test(row.promptHalfBody)))
    && (row.imageId === undefined || (typeof row.imageId === 'string' && row.imageId.length > 0));

export function loadStoryOutfitCandidates(storage) {
    try {
        const raw = storage?.getItem(STORY_KEY);
        if (!raw) return { ok: true, items: [] };
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || !Array.isArray(parsed.items)) return { ok: false, reason: 'store-read-failed' };
        const items = parsed.items.filter(validStoryRow);
        if (items.length !== parsed.items.length) return { ok: false, reason: 'store-read-failed' };
        return { ok: true, items };
    } catch { return { ok: false, reason: 'store-read-failed' }; }
}

function saveStoryRows(storage, items) {
    try {
        storage.setItem(STORY_KEY, JSON.stringify({ version: 1, items }));
        return { ok: true };
    } catch { return { ok: false, reason: 'store-write-failed' }; }
}

export function saveStoryOutfitCandidate(storage, candidate) {
    return saveStoryOutfitCandidates(storage, [candidate]);
}

export function saveStoryOutfitCandidates(storage, candidates) {
    if (!Array.isArray(candidates) || candidates.some(row => !validStoryRow(row)))
        return { ok: false, reason: 'invalid-candidate' };
    const loaded = loadStoryOutfitCandidates(storage);
    if (!loaded.ok) return loaded;
    const rows = new Map(loaded.items.map(row => [row.id, row]));
    for (const candidate of candidates) {
        const row = {};
        for (const key of storyFields) if (candidate[key] !== undefined) row[key] = candidate[key];
        rows.set(row.id, row);
    }
    return saveStoryRows(storage, [...rows.values()]);
}

export function removeStoryOutfitCandidate(storage, id) {
    const loaded = loadStoryOutfitCandidates(storage);
    return loaded.ok ? saveStoryRows(storage, loaded.items.filter(item => item.id !== id)) : loaded;
}
