import { esc } from './reader-value-utils.js';
import { checkbox, field, rangeInput, segmentedInput, selectInput } from './settings-fields.js';
import { collapsible, renderWordListField } from './fx-settings-fields.js';
import {
    SCENE_TRANSITION_LABELS,
    SCENE_TRANSITION_STYLES,
    SPRITE_ACTION_KINDS,
    SPRITE_ACTION_LABELS,
} from './stage-direction-settings.js';
import { normalizeStageDirectionSettings } from './stage-direction-runtime.js';
import { AMBIENT_KINDS, AMBIENT_LABELS, normalizeAmbientSoundSettings, normalizeBgmSettings } from './scene-audio.js';
import { normalizeTextFxSettings } from './text-fx.js';
import { BILINGUAL_DISPLAYS, BILINGUAL_DISPLAY_LABELS, BILINGUAL_FOREIGN_LABELS, BILINGUAL_LAYOUTS, BILINGUAL_LAYOUT_LABELS, BILINGUAL_TARGET_LABELS, normalizeBilingualSettings } from './bilingual-text.js';
import { CLICK_WAIT_MARK_LABELS, normalizeClickWaitMarkSettings } from './click-wait-mark.js';
import { DAILY_FX_LABELS, normalizeDailyFxSettings } from './fx-daily-model.js';
import { DAILY_FX_KINDS } from '../../scene/daily-fx-directives.js';
import { FX_WORLDVIEW_ONLY } from '../../scene/fx-era.js';
import { normalizeUiSoundSettings } from './ui-sfx.js';
import { normalizeAudioMasterSettings } from './audio-bus.js';
import { BGM_MOOD_LABELS, BGM_PACK_LABELS, BGM_PACKS } from './bgm-library.js';
import { isDefaultBgmTrack } from '../../bgm/merge-default-bgm.js';

const P = 'readerSettings';
const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

function sub(body) {
    return `<div class="igs-settings-sub">${body}</div>`;
}

function renderStageFields(s, more) {
    const transition = checkbox(`${P}.sceneTransition.enabled`, s.sceneTransition.enabled, '背景与立绘转场')
        + (s.sceneTransition.enabled ? sub(`<div class="igs-source-filter-grid">`
            + field(`${P}.sceneTransition.style`, '换地点转场', selectInput(`${P}.sceneTransition.style`, s.sceneTransition.style, SCENE_TRANSITION_STYLES.map((id) => [id, SCENE_TRANSITION_LABELS[id]])))
            + field(`${P}.sceneTransition.speed`, '转场速度', segmentedInput(`${P}.sceneTransition.speed`, s.sceneTransition.speed, [['fast', '快'], ['medium', '中'], ['slow', '慢']], '转场速度'))
            + `</div>`) : '');
    const tint = checkbox(`${P}.timeTint.enabled`, s.timeTint.enabled, '环境滤镜')
        + (s.timeTint.enabled ? sub(field(`${P}.timeTint.strength`, '调色强度', segmentedInput(`${P}.timeTint.strength`, s.timeTint.strength, [['light', '弱'], ['medium', '中'], ['strong', '强']], '调色强度'))
            + checkbox(`${P}.timeTint.night`, s.timeTint.night, '夜间调色')
            + '<div class="igs-source-filter-note">关闭夜间调色后，夜晚和深夜不再压暗。开启天气演出后，还会按雨、雪、雾等天气调色。</div>') : '');
    const motion = checkbox(`${P}.spriteMotion.enabled`, s.spriteMotion.enabled, '立绘活动')
        + (s.spriteMotion.enabled ? sub(more('sprite-motion', '选择动作', `<div class="igs-source-filter-grid">`
            + checkbox(`${P}.spriteMotion.breathing`, s.spriteMotion.breathing, '待机呼吸')
            + checkbox(`${P}.spriteMotion.speakBounce`, s.spriteMotion.speakBounce, '说话轻弹')
            + checkbox(`${P}.spriteMotion.enterExit`, s.spriteMotion.enterExit, '登场 / 退场')
            + checkbox(`${P}.spriteMotion.castBreathing`, s.spriteMotion.castBreathing, '同屏角色呼吸')
            + checkbox(`${P}.spriteMotion.castLean`, s.spriteMotion.castLean, '同屏角色看向说话人')
            + `</div>`)) : '');
    const actions = checkbox(`${P}.spriteActions.enabled`, s.spriteActions.enabled, '情绪动作')
        + (s.spriteActions.enabled ? sub(more('sprite-actions', '自定义触发情绪', SPRITE_ACTION_KINDS.map((kind) => renderWordListField(`spriteActions.${kind}`, SPRITE_ACTION_LABELS[kind], s.spriteActions[kind])).join(''))) : '');
    const camera = checkbox(`${P}.camera.enabled`, s.camera.enabled, '镜头语言')
        + (s.camera.enabled ? sub(more('camera', '选择镜头', `<div class="igs-source-filter-grid">`
            + checkbox(`${P}.camera.kenBurns`, s.camera.kenBurns, '背景缓慢推镜')
            + checkbox(`${P}.camera.parallax`, s.camera.parallax, '鼠标视差（电脑端）')
            + checkbox(`${P}.camera.closeUp`, s.camera.closeUp, '情绪特写')
            + checkbox(`${P}.camera.impact`, s.camera.impact, '情绪冲击推近（带音效）')
            + checkbox(`${P}.camera.aiShots`, s.camera.aiShots, 'AI 镜头指令')
            + `</div>`
            + (s.camera.closeUp ? renderWordListField('camera.closeUpEmotions', '特写触发情绪', s.camera.closeUpEmotions) : '')
            + (s.camera.impact ? renderWordListField('camera.impactEmotions', '冲击触发情绪', s.camera.impactEmotions) : ''))) : '');
    const cast = checkbox(`${P}.stageCast.enabled`, s.stageCast.enabled, '多角色同屏（实验）')
        + (s.stageCast.enabled ? sub(checkbox(`${P}.stageCast.alignHeads`, s.stageCast.alignHeads, '按头部对齐大小与高度')
            + checkbox(`${P}.stageCast.romanceDuo`, s.stageCast.romanceDuo, '亲密演出时保留同屏角色')
            + checkbox(`${P}.stageCast.castReact`, s.stageCast.castReact, '同屏角色反应')
            + checkbox(`${P}.stageCast.castStage`, s.stageCast.castStage, '同屏角色走位')
            + '<div class="igs-source-filter-note">同场景最近说过话的角色一起显示，电脑最多 3 人，手机最多 2 人。头部对齐需要立绘已抠图或标定过头部。</div>') : '');
    return { transition, tint, motion, actions, camera, cast };
}

function renderTextFields(textFx, clickWait) {
    const tfx = checkbox(`${P}.textFx.enabled`, textFx.enabled, '行内文字效果')
        + (textFx.enabled ? sub('<div class="igs-source-filter-note">AI 会给关键字句加上抖动、吼叫等效果；关闭后只显示文字。</div>') : '');
    const glyphs = Object.entries(CLICK_WAIT_MARK_LABELS);
    const clickWaitMark = checkbox(`${P}.clickWaitMark.enabled`, clickWait.enabled, '句末等待符号')
        + (clickWait.enabled ? sub(field(`${P}.clickWaitMark.glyph`, '符号样式', selectInput(`${P}.clickWaitMark.glyph`, clickWait.glyph, glyphs))) : '');
    return { textFx: tfx, clickWaitMark };
}

function renderBilingualField(bilingual) {
    const displays = BILINGUAL_DISPLAYS.map((id) => [id, BILINGUAL_DISPLAY_LABELS[id]]);
    const layouts = BILINGUAL_LAYOUTS.map((id) => [id, BILINGUAL_LAYOUT_LABELS[id]]);
    return checkbox(`${P}.bilingual.enabled`, bilingual.enabled, '双语台词')
        + (bilingual.enabled ? sub(field(`${P}.bilingual.display`, '显示方式', segmentedInput(`${P}.bilingual.display`, bilingual.display, displays, '显示方式'))
            + field(`${P}.bilingual.layout`, '注音排版', segmentedInput(`${P}.bilingual.layout`, bilingual.layout, layouts, '注音排版'))
            + `<div class="igs-source-filter-grid">`
            + field(`${P}.bilingual.foreign`, '角色语言', selectInput(`${P}.bilingual.foreign`, bilingual.foreign, Object.entries(BILINGUAL_FOREIGN_LABELS)))
            + field(`${P}.bilingual.target`, '译文语言', selectInput(`${P}.bilingual.target`, bilingual.target, Object.entries(BILINGUAL_TARGET_LABELS)))
            + `</div>`
            + '<div class="igs-source-filter-note">AI 会用外语写所有角色的台词和心里话，并用〖〗附上译文，以小字显示在原文上方；旁白不受影响。注音排版：交错＝整段译文随原文逐行交错；译文在上＝完整译文放在原文上方；按分句＝每个分句各自注音（AI 也会一句一个〖〗）。电脑端按 T 键可临时切换注音、仅原文、仅译文。</div>') : '');
}

function trackSummary(track) {
    const parts = [];
    if (track.moods) parts.push(track.moods.map((mood) => BGM_MOOD_LABELS[mood]).join('、'));
    if (track.keywords.length) parts.push(`地点：${track.keywords.join('、')}`);
    if (track.credit) parts.push(track.credit);
    return parts.length ? parts.map(esc).join(' · ') : '默认曲（没有匹配时播放）';
}

function renderTrackRow(track) {
    const keywords = trackSummary(track);
    return `<div class="igs-bgm-track"><div class="igs-bgm-track-main"><b>${esc(track.name)}</b><span>${keywords}</span></div>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="bgm-track-edit:${encSeg(track.id)}" title="编辑">✎</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="bgm-track-remove:${encSeg(track.id)}" title="删除">×</button></div>`;
}

// 默认曲目折叠成一行摘要，展开才逐首列出；自己加的曲目始终逐行显示。
function renderBgmTracks(bgm, more) {
    const own = bgm.tracks.filter((track) => !isDefaultBgmTrack(track));
    const pack = bgm.tracks.filter(isDefaultBgmTrack);
    const counts = BGM_PACKS.map((id) => [BGM_PACK_LABELS[id], pack.filter((track) => track.packs && track.packs.includes(id)).length])
        .filter(([, count]) => count).map(([label, count]) => `${label} ${count}`).join(' · ');
    const packBlock = pack.length
        ? more('bgm-pack-tracks', `默认曲目 ${pack.length} 首（${counts}）`, `<div class="igs-bgm-tracks">${pack.map(renderTrackRow).join('')}</div>`
            + '<button type="button" class="igs-settings-action" data-action="bgm-pack-remove">移除全部默认曲目</button>'
            + '<div class="igs-source-filter-note">音乐来自魔王魂（maou.audio）与 OpenGameArt，按各自授权再配布；曲名和作者在地点栏的 ♪ 里可以看到。</div>')
        : '';
    const ownBlock = own.length ? `<div class="igs-bgm-tracks">${own.map(renderTrackRow).join('')}</div>` : (pack.length ? '' : '<div class="igs-scene-empty">还没有曲目</div>');
    return packBlock + ownBlock;
}

function renderSoundFields(bgm, ambient, ui, master, more) {
    const bgmBody = checkbox(`${P}.bgm.enabled`, bgm.enabled, '背景音乐')
        + (bgm.enabled ? sub(field(`${P}.bgm.volume`, '音乐音量', rangeInput(`${P}.bgm.volume`, bgm.volume, '音乐音量'))
            + checkbox(`${P}.bgm.moodTag`, bgm.moodTag, 'AI 标注配乐情绪')
            + renderBgmTracks(bgm, more)
            + '<div class="igs-source-filter-grid">'
            + '<button type="button" class="igs-settings-action" data-action="bgm-pack-download">下载默认曲目</button>'
            + '<button type="button" class="igs-settings-action" data-action="bgm-track-upload">上传本地音频</button>'
            + '<button type="button" class="igs-settings-action" data-action="bgm-track-add">添加音频直链</button>'
            + '</div>'
            + '<div class="igs-source-filter-note">AI 在气氛转折时写一个情绪字（日常、欢快、甜、静、悲、紧、战、诡），按情绪选曲，再按地点、时段、天气挑最合适的一首，同类曲子轮流放。进战斗几乎硬切、转入悲伤慢慢沉下去；告白或 AI 写「无声」时音乐停几页留白。'
            + '自己的曲目可以勾情绪，也可以填地点关键词（命中时最优先）。上传的音频存在酒馆的 user/files 文件夹。点地点栏的 ♪ 可以看曲名、换一首。</div>') : '');
    const ambientBody = checkbox(`${P}.ambientSound.enabled`, ambient.enabled, '环境音')
        + (ambient.enabled ? sub(field(`${P}.ambientSound.volume`, '环境音量', rangeInput(`${P}.ambientSound.volume`, ambient.volume, '环境音量'))
            + more('ambient-kinds', '选择声音类型', `<div class="igs-source-filter-grid">${AMBIENT_KINDS.map((kind) => checkbox(`${P}.ambientSound.${kind}`, ambient[kind], AMBIENT_LABELS[kind])).join('')}</div>`
                + '<div class="igs-source-filter-note">按当前地点、时间与天气自动选择：树林清晨有鸟鸣、夜里草地有虫鸣、海边有浪声、街市有人声；室内的雨声会变闷。</div>')) : '');
    const uiBody = checkbox(`${P}.uiSound.enabled`, ui.enabled, '界面音效')
        + (ui.enabled ? sub(field(`${P}.uiSound.volume`, '界面音量', rangeInput(`${P}.uiSound.volume`, ui.volume, '界面音量'))) : '');
    const masterBody = field(`${P}.audioMaster.volume`, '总音量', rangeInput(`${P}.audioMaster.volume`, master.volume, '总音量'));
    return { master: masterBody, bgm: bgmBody, ambient: ambientBody, ui: uiBody };
}

// 其他世界观的专属日常（古风抚琴、魔法施咒等）不列出；已存的勾选保留，切回对应世界观时照常显示。
function dailyKindsFor(worldview) {
    const foreign = new Set(Object.entries(FX_WORLDVIEW_ONLY)
        .filter(([owner]) => owner !== worldview)
        .flatMap(([, table]) => table.dailyFx || []));
    return DAILY_FX_KINDS.filter((kind) => !foreign.has(kind));
}

function renderDailyField(daily, more, worldview) {
    return checkbox(`${P}.dailyFx.enabled`, daily.enabled, '日常演出')
        + (daily.enabled ? sub(more('daily-kinds', '选择日常类型', `<div class="igs-source-filter-grid">${dailyKindsFor(worldview).map((kind) => checkbox(`${P}.dailyFx.${kind}`, daily[kind], DAILY_FX_LABELS[kind])).join('')}`
            + checkbox(`${P}.dailyFx.petals`, daily.petals, '樱花、落叶飘落')
            + checkbox(`${P}.dailyFx.photoAlbum`, daily.photoAlbum, '拍照存入 CG 库')
            + `</div>`
            + '<div class="igs-source-filter-note">只会出现勾选的类型；音效在「声音 › 演出音效」里开关。</div>')) : '');
}

// 舞台调度、文字演出、日常演出与场景声音的设置片段，由「演出」页按分类重新编排；持久化路径不变。
export function renderStageDirectionFields(reader, more = collapsible, { worldview = 'modern' } = {}) {
    const src = reader && typeof reader === 'object' ? reader : {};
    return {
        ...renderStageFields(normalizeStageDirectionSettings(src), more),
        ...renderTextFields(normalizeTextFxSettings(src.textFx), normalizeClickWaitMarkSettings(src.clickWaitMark)),
        bilingual: renderBilingualField(normalizeBilingualSettings(src.bilingual)),
        daily: renderDailyField(normalizeDailyFxSettings(src.dailyFx), more, worldview),
        ...renderSoundFields(normalizeBgmSettings(src.bgm), normalizeAmbientSoundSettings(src.ambientSound), normalizeUiSoundSettings(src.uiSound), normalizeAudioMasterSettings(src.audioMaster), more),
    };
}
