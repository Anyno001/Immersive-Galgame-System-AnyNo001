import { esc } from './reader-value-utils.js';
import { checkbox, field, rangeInput, segmentedInput, selectInput } from './settings-fields.js';
import { collapsible, featureRow, perfItem, renderWordListField } from './fx-settings-fields.js';
import {
    CG_INTERLUDE_LABELS,
    CG_INTERLUDE_STYLES,
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

const grid = (body) => `<div class="igs-source-filter-grid">${body}</div>`;

function renderStageFields(s, more) {
    const transition = featureRow(more, 'transition', `${P}.sceneTransition.enabled`, s.sceneTransition.enabled, '背景与立绘转场', '换场过渡', grid(
        field(`${P}.sceneTransition.style`, '换地点转场', selectInput(`${P}.sceneTransition.style`, s.sceneTransition.style, SCENE_TRANSITION_STYLES.map((id) => [id, SCENE_TRANSITION_LABELS[id]])))
        + field(`${P}.sceneTransition.speed`, '转场速度', segmentedInput(`${P}.sceneTransition.speed`, s.sceneTransition.speed, [['fast', '快'], ['medium', '中'], ['slow', '慢']], '转场速度'))));
    const tint = featureRow(more, 'tint', `${P}.timeTint.enabled`, s.timeTint.enabled, '环境滤镜', '按时段与天气调色', field(`${P}.timeTint.strength`, '调色强度', segmentedInput(`${P}.timeTint.strength`, s.timeTint.strength, [['light', '弱'], ['medium', '中'], ['strong', '强']], '调色强度'))
        + checkbox(`${P}.timeTint.night`, s.timeTint.night, '夜间压暗'));
    const motion = featureRow(more, 'sprite-motion', `${P}.spriteMotion.enabled`, s.spriteMotion.enabled, '立绘活动', '呼吸、轻弹、登退场', grid(
        checkbox(`${P}.spriteMotion.breathing`, s.spriteMotion.breathing, '待机呼吸')
        + checkbox(`${P}.spriteMotion.speakBounce`, s.spriteMotion.speakBounce, '说话轻弹')
        + checkbox(`${P}.spriteMotion.enterExit`, s.spriteMotion.enterExit, '登场 / 退场')
        + checkbox(`${P}.spriteMotion.castBreathing`, s.spriteMotion.castBreathing, '同屏角色呼吸')
        + checkbox(`${P}.spriteMotion.castLean`, s.spriteMotion.castLean, '同屏角色看向说话人')));
    const actions = featureRow(more, 'sprite-actions', `${P}.spriteActions.enabled`, s.spriteActions.enabled, '情绪动作', '按情绪跳、抖', SPRITE_ACTION_KINDS.map((kind) => renderWordListField(`spriteActions.${kind}`, SPRITE_ACTION_LABELS[kind], s.spriteActions[kind])).join(''));
    const camera = featureRow(more, 'camera', `${P}.camera.enabled`, s.camera.enabled, '镜头语言', '推镜、特写', grid(
        checkbox(`${P}.camera.kenBurns`, s.camera.kenBurns, '背景缓慢推镜')
        + checkbox(`${P}.camera.parallax`, s.camera.parallax, '鼠标视差（电脑端）')
        + checkbox(`${P}.camera.closeUp`, s.camera.closeUp, '情绪特写')
        + checkbox(`${P}.camera.impact`, s.camera.impact, '情绪冲击推近（带音效）')
        + checkbox(`${P}.camera.aiShots`, s.camera.aiShots, 'AI镜头指令'))
        + (s.camera.closeUp ? renderWordListField('camera.closeUpEmotions', '特写触发情绪', s.camera.closeUpEmotions) : '')
        + (s.camera.impact ? renderWordListField('camera.impactEmotions', '冲击触发情绪', s.camera.impactEmotions) : ''));
    const cast = featureRow(more, 'stage-cast', `${P}.stageCast.enabled`, s.stageCast.enabled, '多角色同屏（实验）', '电脑3人、手机2人', checkbox(`${P}.stageCast.alignHeads`, s.stageCast.alignHeads, '按腿对齐到底部（需抠图）')
        + checkbox(`${P}.stageCast.romanceDuo`, s.stageCast.romanceDuo, '亲密演出时保留同屏角色')
        + checkbox(`${P}.stageCast.castReact`, s.stageCast.castReact, '同屏角色反应')
        + checkbox(`${P}.stageCast.castStage`, s.stageCast.castStage, '同屏角色走位'));
    const cgOn = CG_INTERLUDE_STYLES.some((id) => s.cgEntrance.styles[id]);
    const cgEntrance = perfItem(more, 'cg-interlude', '<span class="igs-perf-item-label">过场 CG 出场</span>', { hint: cgOn ? '勾选的效果每次随机抽' : '全不勾即关闭', detail: grid(
        CG_INTERLUDE_STYLES.map((id) => checkbox(`${P}.cgEntrance.styles.${id}`, s.cgEntrance.styles[id], CG_INTERLUDE_LABELS[id])).join('')) })
        + perfItem(more, 'cg-nsfw', field(`${P}.cgEntrance.nsfw`, 'NSFW 模糊到清晰', segmentedInput(`${P}.cgEntrance.nsfw`, s.cgEntrance.nsfw, [['off', '关'], ['fast', '快'], ['medium', '中'], ['slow', '慢']], 'NSFW 模糊到清晰')));
    return { transition, tint, motion, actions, camera, cast, cgEntrance };
}

function renderTextFields(textFx, clickWait, more) {
    const tfx = featureRow(more, 'text-fx', `${P}.textFx.enabled`, textFx.enabled, '行内文字效果', '抖动、吼叫等字效');
    const glyphs = Object.entries(CLICK_WAIT_MARK_LABELS);
    const clickWaitMark = featureRow(more, 'click-wait', `${P}.clickWaitMark.enabled`, clickWait.enabled, '句末等待符号', '', field(`${P}.clickWaitMark.glyph`, '符号样式', selectInput(`${P}.clickWaitMark.glyph`, clickWait.glyph, glyphs)));
    return { textFx: tfx, clickWaitMark };
}

function renderBilingualField(bilingual, more) {
    const displays = BILINGUAL_DISPLAYS.map((id) => [id, BILINGUAL_DISPLAY_LABELS[id]]);
    const layouts = BILINGUAL_LAYOUTS.map((id) => [id, BILINGUAL_LAYOUT_LABELS[id]]);
    return featureRow(more, 'bilingual', `${P}.bilingual.enabled`, bilingual.enabled, '双语台词', '外语台词配译文', field(`${P}.bilingual.display`, '显示方式', segmentedInput(`${P}.bilingual.display`, bilingual.display, displays, '显示方式'))
        + field(`${P}.bilingual.layout`, '注音排版', segmentedInput(`${P}.bilingual.layout`, bilingual.layout, layouts, '注音排版'))
        + grid(field(`${P}.bilingual.foreign`, '角色语言', selectInput(`${P}.bilingual.foreign`, bilingual.foreign, Object.entries(BILINGUAL_FOREIGN_LABELS)))
            + field(`${P}.bilingual.target`, '译文语言', selectInput(`${P}.bilingual.target`, bilingual.target, Object.entries(BILINGUAL_TARGET_LABELS))))
        + '<div class="igs-source-filter-note">旁白不受影响；电脑端按T键临时切换显示。</div>');
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
            + '<div class="igs-source-filter-note">音乐来自魔王魂（maou.audio）与OpenGameArt，按各自授权再配布；曲名与作者可在地点栏的 ♪ 中查看。</div>')
        : '';
    const ownBlock = own.length ? `<div class="igs-bgm-tracks">${own.map(renderTrackRow).join('')}</div>` : (pack.length ? '' : '<div class="igs-scene-empty">还没有曲目</div>');
    return packBlock + ownBlock;
}

function renderSoundFields(bgm, ambient, ui, master, more) {
    const bgmBody = featureRow(more, 'bgm', `${P}.bgm.enabled`, bgm.enabled, '背景音乐', '按情绪与地点选曲', field(`${P}.bgm.volume`, '音乐音量', rangeInput(`${P}.bgm.volume`, bgm.volume, '音乐音量'))
        + checkbox(`${P}.bgm.moodTag`, bgm.moodTag, 'AI标注配乐情绪')
        + renderBgmTracks(bgm, more)
        + grid('<button type="button" class="igs-settings-action" data-action="bgm-pack-download">下载默认曲目</button>'
            + '<button type="button" class="igs-settings-action" data-action="bgm-track-upload">上传本地音频</button>'
            + '<button type="button" class="igs-settings-action" data-action="bgm-track-add">添加音频直链</button>')
        + '<div class="igs-source-filter-note">自行添加的曲目可勾选情绪或填写地点关键词（命中时优先播放）；点击地点栏的 ♪ 可查看曲名或切换曲目。</div>');
    const ambientBody = featureRow(more, 'ambient-kinds', `${P}.ambientSound.enabled`, ambient.enabled, '环境音', '鸟鸣、雨声、人声', field(`${P}.ambientSound.volume`, '环境音量', rangeInput(`${P}.ambientSound.volume`, ambient.volume, '环境音量'))
        + grid(AMBIENT_KINDS.map((kind) => checkbox(`${P}.ambientSound.${kind}`, ambient[kind], AMBIENT_LABELS[kind])).join('')));
    const uiBody = featureRow(more, 'ui-sound', `${P}.uiSound.enabled`, ui.enabled, '界面音效', '', field(`${P}.uiSound.volume`, '界面音量', rangeInput(`${P}.uiSound.volume`, ui.volume, '界面音量')));
    const masterBody = perfItem(more, 'audio-master', field(`${P}.audioMaster.volume`, '总音量', rangeInput(`${P}.audioMaster.volume`, master.volume, '总音量')));
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
    return featureRow(more, 'daily-kinds', `${P}.dailyFx.enabled`, daily.enabled, '日常演出', '做饭、拍照等小场面', grid(dailyKindsFor(worldview).map((kind) => checkbox(`${P}.dailyFx.${kind}`, daily[kind], DAILY_FX_LABELS[kind])).join('')
        + checkbox(`${P}.dailyFx.petals`, daily.petals, '樱花、落叶飘落')
        + checkbox(`${P}.dailyFx.ambience`, daily.ambience, '车窗光影、浴室水汽')
        + checkbox(`${P}.dailyFx.photoAlbum`, daily.photoAlbum, '拍照存入CG库')));
}

// 舞台调度、文字演出、日常演出与场景声音的设置片段，由「演出」页按分类重新编排；持久化路径不变。
export function renderStageDirectionFields(reader, more = collapsible, { worldview = 'modern' } = {}) {
    const src = reader && typeof reader === 'object' ? reader : {};
    return {
        ...renderStageFields(normalizeStageDirectionSettings(src), more),
        ...renderTextFields(normalizeTextFxSettings(src.textFx), normalizeClickWaitMarkSettings(src.clickWaitMark), more),
        bilingual: renderBilingualField(normalizeBilingualSettings(src.bilingual), more),
        daily: renderDailyField(normalizeDailyFxSettings(src.dailyFx), more, worldview),
        ...renderSoundFields(normalizeBgmSettings(src.bgm), normalizeAmbientSoundSettings(src.ambientSound), normalizeUiSoundSettings(src.uiSound), normalizeAudioMasterSettings(src.audioMaster), more),
    };
}
