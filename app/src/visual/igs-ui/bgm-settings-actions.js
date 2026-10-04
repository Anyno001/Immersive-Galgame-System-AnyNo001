import { DEFAULT_BGM_PACK } from '../../bgm/default-bgm-pack.js';
import { isDefaultBgmTrack, mergeDefaultBgm, removeDefaultBgm } from '../../bgm/merge-default-bgm.js';
import { deleteTavernAudio, isTavernAudioPath, pickAudioFile, uploadTavernAudio } from '../../media/tavern-audio-files.js';
import { BGM_MOOD_LABELS, BGM_MOODS, BGM_PACK_LABELS, BGM_PACKS, bgmPackOfWorldview, normalizeBgmMood } from './bgm-library.js';
import { normalizeBgmSettings } from './scene-audio.js';

// 「声音 › 背景音乐」的曲目操作：下载 / 移除默认曲目、上传本地音频、添加直链、编辑、删除。
export const BGM_ACTION_RE = /^bgm-(?:track-(?:add|upload|edit|remove)|pack-(?:download|remove))(?::.*)?$/;

const MOOD_HINT = BGM_MOODS.map((mood) => BGM_MOOD_LABELS[mood]).join(' ');

function decodeSeg(value) {
    try { return decodeURIComponent(String(value == null ? '' : value)); }
    catch { return String(value == null ? '' : value); }
}

function splitWords(value) {
    return String(value == null ? '' : value).split(/[,，、\s]+/u).filter(Boolean);
}

function parseMoods(value) {
    const out = [];
    for (const word of splitWords(value)) {
        const mood = normalizeBgmMood(word);
        if (mood && !out.includes(mood)) out.push(mood);
    }
    return out;
}

function alertOf(globalObj) {
    return (message) => { if (typeof globalObj.alert === 'function') globalObj.alert(message); };
}

// 名称、情绪、关键词三问；任一步取消返回 null。
async function askTrackDetails(dialogs, existing, fallbackName) {
    const name = await dialogs.prompt('曲目名称：', existing ? existing.name : fallbackName || '');
    if (name == null) return null;
    const moods = await dialogs.prompt(`情绪（可多选，空格分隔：${MOOD_HINT}）；AI 标出这个情绪时优先播放。留空则只按关键词匹配：`, existing && existing.moods ? existing.moods.map((m) => BGM_MOOD_LABELS[m]).join(' ') : '');
    if (moods == null) return null;
    const keywords = await dialogs.prompt('地点关键词，用逗号或空格分隔（如 教室, 天台）；地点里出现这些词时最优先播放。情绪和关键词都留空则作为默认曲：', existing ? existing.keywords.join(', ') : '');
    if (keywords == null) return null;
    return { name: String(name).trim(), moods: parseMoods(moods), keywords: splitWords(keywords) };
}

function withDetails(base, details) {
    const track = { ...base, name: details.name, keywords: details.keywords };
    if (details.moods.length) track.moods = details.moods;
    else delete track.moods;
    return track;
}

async function choosePack(dialogs, worldview) {
    const current = bgmPackOfWorldview(worldview);
    const count = (pack) => DEFAULT_BGM_PACK.filter((item) => pack === 'all' || item.packs.includes(pack)).length;
    const choices = [
        ...[current, ...BGM_PACKS.filter((pack) => pack !== current)].map((pack) => ({
            value: pack, label: BGM_PACK_LABELS[pack], note: `${count(pack)} 首${pack === current ? '，当前世界观' : ''}`,
        })),
        { value: 'all', label: '全部', note: `${count('all')} 首，切换世界观时自动换曲包` },
    ];
    if (typeof dialogs.choose === 'function') return dialogs.choose('下载哪一套默认曲目？', choices, current);
    const raw = await dialogs.prompt(`下载哪一套默认曲目？输入：${choices.map((c) => c.label).join(' / ')}`, BGM_PACK_LABELS[current]);
    if (raw == null) return null;
    const hit = choices.find((c) => c.label === String(raw).trim() || c.value === String(raw).trim());
    return hit ? hit.value : null;
}

// 返回 { ok: false } 表示持久化失败，其余情况由调用方重绘设置页。
export async function handleBgmSettingsAction(action, { readerDraft, dialogs, persist, global: globalObj = globalThis, worldview = 'modern' }) {
    const alert = alertOf(globalObj);
    const current = normalizeBgmSettings(readerDraft.bgm);
    const [, verb, rest] = action.match(/^bgm-([a-z]+-[a-z]+)(?::(.*))?$/) || [];
    const id = decodeSeg(rest || '');
    const index = current.tracks.findIndex((track) => track.id === id);
    let removedPath = '';

    if (verb === 'pack-download') {
        const pack = await choosePack(dialogs, worldview);
        if (pack == null) return null;
        const merged = mergeDefaultBgm(current.tracks, pack);
        if (!merged.added.length) {
            alert('这一套默认曲目已经全部在列表里了。');
            return null;
        }
        current.tracks = merged.tracks;
    } else if (verb === 'pack-remove') {
        const removed = removeDefaultBgm(current.tracks);
        if (!removed.removed) return null;
        if (!await dialogs.confirm(`移除全部 ${removed.removed} 首默认曲目？你自己添加的曲目会保留。`, { okLabel: '移除' })) return null;
        current.tracks = removed.tracks;
    } else if (verb === 'track-remove') {
        if (index < 0) return null;
        removedPath = current.tracks[index].url;
        current.tracks.splice(index, 1);
    } else if (verb === 'track-upload') {
        const doc = globalObj.document;
        if (!doc) return null;
        const file = await pickAudioFile(doc);
        if (!file) return null;
        const uploaded = await uploadTavernAudio(globalObj, file);
        if (!uploaded.ok) {
            alert(uploaded.reason);
            return null;
        }
        const details = await askTrackDetails(dialogs, null, uploaded.name);
        if (!details) {
            await deleteTavernAudio(globalObj, uploaded.path);
            return null;
        }
        current.tracks.push(withDetails({ id: `t${Date.now().toString(36)}`, url: uploaded.path }, details));
    } else if (verb === 'track-add' || verb === 'track-edit') {
        const existing = index >= 0 ? current.tracks[index] : null;
        if (verb === 'track-edit' && !existing) return null;
        // 上传的文件和默认曲目不改链接，只改名称、情绪和关键词。
        let url = existing ? existing.url : '';
        if (!existing || (!isTavernAudioPath(existing.url) && !isDefaultBgmTrack(existing))) {
            const raw = await dialogs.prompt('音频直链（http/https）：', url);
            if (raw == null || !String(raw).trim()) return null;
            url = String(raw).trim();
        }
        const details = await askTrackDetails(dialogs, existing, '');
        if (!details) return null;
        const track = withDetails({ ...(existing || {}), id: existing ? existing.id : `t${Date.now().toString(36)}`, url }, details);
        if (existing) current.tracks[index] = track;
        else current.tracks.push(track);
    } else {
        return null;
    }

    const normalized = normalizeBgmSettings(current);
    if (normalized.tracks.length < current.tracks.length) {
        alert(verb === 'pack-download' ? '曲目数量已达上限，部分默认曲目没有加入。' : '链接无效：只支持 http/https 音频直链。');
        if (verb !== 'pack-download') return null;
    }
    readerDraft.bgm = normalized;
    const persisted = persist();
    if (persisted && persisted.ok === false) return persisted;
    if (removedPath) await deleteTavernAudio(globalObj, removedPath);
    return null;
}
