import { esc } from './reader-value-utils.js';
import { checkbox, field, segmentedInput } from './settings-fields.js';
import { collapsible, renderWordListField } from './fx-settings-fields.js';
import { normalizeRomanceFxSettings, ROMANCE_ACTIONS_MAX, ROMANCE_FAVOR_THRESHOLDS } from './romance-settings.js';

const P = 'readerSettings.romanceFx';

function sub(body) {
    return `<div class="igs-settings-sub">${body}</div>`;
}

// 亲密演出的设置片段：强度常显，图层与好感 / 关系设置收进折叠区；关闭时已保存的子设置保留不清空。
export function renderRomanceFxFields(reader, more = collapsible) {
    const s = normalizeRomanceFxSettings(reader && reader.romanceFx);
    const toggle = checkbox(`${P}.enabled`, s.enabled, '亲密演出（读取 igs-fx:romance 标签与 NSFW 场景）');
    if (!s.enabled) return toggle;
    const layers = `<div class="igs-source-filter-grid">`
        + checkbox(`${P}.approach`, s.approach, '立绘逼近镜头')
        + checkbox(`${P}.glow`, s.glow, '暖光柔焦')
        + checkbox(`${P}.bokeh`, s.bokeh, '光斑')
        + checkbox(`${P}.backlight`, s.backlight, '逆光')
        + checkbox(`${P}.nsfwCurve`, s.nsfwCurve, 'NSFW 场景强度曲线（渐强 → 保持 → 回落）')
        + `</div><div class="igs-source-filter-note">暧昧、亲密两档由 AI 用标签标出，NSFW 场景自动进入最高档；只做氛围暗示，不生成任何画面。</div>`;
    const story = checkbox(`${P}.favorAmbience`, s.favorAmbience, '好感常驻氛围（好感够高的角色在场时常驻淡淡暖光）')
        + (s.favorAmbience ? sub(field(`${P}.favorThreshold`, '好感门槛', segmentedInput(`${P}.favorThreshold`, String(s.favorThreshold), ROMANCE_FAVOR_THRESHOLDS.map((n) => [String(n), `${n}%`]), '好感门槛'))
            + renderWordListField('romanceFx.favorWords', '好感指标名', s.favorWords)
            + '<div class="igs-source-filter-note">需开启状态栏并选择含好感指标的表格；指标名需与状态栏里显示的名称完全一致。</div>') : '')
        + checkbox(`${P}.relationCard`, s.relationCard, '关系变化卡（状态栏「关系」列变化时弹出）')
        + (s.relationCard ? sub('<div class="igs-source-filter-note">读取状态栏已选表格中列名含「关系」的文字；首次读到只记录，之后变化才弹卡。</div>') : '')
        + checkbox(`${P}.rival`, s.rival, '修罗场（暧昧对象以外的角色出场时转冷色并弹心碎）')
        + checkbox(`${P}.confess`, s.confess, '告白演出（读取 igs-fx:confess：黑边、心跳、打字放慢、回答前停顿）')
        + checkbox(`${P}.memories`, s.memories, '恋爱回忆（读取 igs-fx:memory，拍下当前画面存进 CG 库）')
        + (s.memories ? sub('<div class="igs-source-filter-note">与日常演出拍照共用相册；NSFW 场景不拍。同一楼层同一回忆只存一次。</div>') : '');
    // 列表复用 BGM 曲目的行样式（settings-style 的 .igs-bgm-track）。
    const rows = s.actions.map((item, index) => `<div class="igs-bgm-track"><div class="igs-bgm-track-main"><b>${esc(item.name || '（未命名）')}</b><span>${esc(item.text)}</span></div>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-edit:${index}" title="修改">✎</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-remove:${index}" title="删除">×</button></div>`).join('');
    const add = s.actions.length < ROMANCE_ACTIONS_MAX ? '<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-add" title="添加动作">+</button>' : '';
    const interact = checkbox(`${P}.quickActions`, s.quickActions, '立绘快捷动作（头部旁心形按钮，选中后写入输入框、不自动发送）')
        + (s.quickActions ? sub(`<div class="igs-bgm-tracks">${rows || '<div class="igs-scene-empty">暂无动作</div>'}${add}</div>`
            + '<div class="igs-source-filter-note">暧昧、亲密档或好感常驻时显示；NSFW 场景不显示。{角色} 会换成当前立绘角色名；楼层内嵌模式没有输入框时改为复制到剪贴板。</div>') : '');
    return toggle + sub(field(`${P}.strength`, '演出强度', segmentedInput(`${P}.strength`, s.strength, [['weak', '弱'], ['medium', '中'], ['strong', '强']], '演出强度'))
        + more('romance-layers', '氛围图层', layers)
        + more('romance-story', '好感与关系', story)
        + more('romance-actions', '互动', interact));
}
