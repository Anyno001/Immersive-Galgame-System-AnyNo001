import { esc } from './reader-value-utils.js';
import { checkbox, field, segmentedInput } from './settings-fields.js';
import { collapsible, featureRow, perfSubhead, renderWordListField } from './fx-settings-fields.js';
import { normalizeRomanceFxSettings, ROMANCE_ACTIONS_MAX, ROMANCE_FAVOR_THRESHOLDS } from './romance-settings.js';

const P = 'readerSettings.romanceFx';

function sub(body) {
    return `<div class="igs-settings-sub">${body}</div>`;
}

// 亲密演出的设置片段：一行开关，细项里按小标题分段（不再二级折叠）；关闭时已保存的子设置保留不清空。
export function renderRomanceFxFields(reader, more = collapsible) {
    const s = normalizeRomanceFxSettings(reader && reader.romanceFx);
    if (!s.enabled) return featureRow(more, 'romance', `${P}.enabled`, false, '亲密演出', '暧昧时加氛围');
    const layers = `<div class="igs-source-filter-grid">`
        + checkbox(`${P}.approach`, s.approach, '立绘逼近镜头')
        + checkbox(`${P}.glow`, s.glow, '暖光柔焦')
        + checkbox(`${P}.bokeh`, s.bokeh, '光斑')
        + checkbox(`${P}.backlight`, s.backlight, '逆光')
        + checkbox(`${P}.nsfwCurve`, s.nsfwCurve, 'NSFW场景渐强渐弱')
        + checkbox(`${P}.cgPan`, s.cgPan, 'CG镜头缓移')
        + `</div>`;
    const senses = checkbox(`${P}.edgeFx`, s.edgeFx, '边缘光影（暗角、光影、色散）')
        + checkbox(`${P}.softSound`, s.softSound, '亲密氛围音（心跳、呼吸、耳语）')
        + checkbox(`${P}.nsfwSound`, s.nsfwSound, 'NSFW场景音效')
        + checkbox(`${P}.rhythm`, s.rhythm, 'NSFW节律演出（吱呀声与晃动）')
        + (s.rhythm ? sub(checkbox(`${P}.rhythmSound`, s.rhythmSound, '节律音效（关掉只保留晃动）')
            + field(`${P}.sway`, '晃动幅度', segmentedInput(`${P}.sway`, s.sway, [['off', '关'], ['weak', '弱'], ['medium', '中'], ['strong', '强']], '晃动幅度'))) : '')
        + checkbox(`${P}.senses`, s.senses, '感官调度')
        + (s.senses ? sub(checkbox(`${P}.senseWords`, s.senseWords, '按正文自动识别')) : '')
        + checkbox(`${P}.undress`, s.undress, '脱衣演出')
        + checkbox(`${P}.solo`, s.solo, '独处场景')
        + '<div class="igs-source-filter-note">声音跟随「演出音效」的开关与音量。</div>';
    const story = checkbox(`${P}.favorAmbience`, s.favorAmbience, '高好感角色在场时常驻暖光')
        + (s.favorAmbience ? sub(field(`${P}.favorThreshold`, '好感门槛', segmentedInput(`${P}.favorThreshold`, String(s.favorThreshold), ROMANCE_FAVOR_THRESHOLDS.map((n) => [String(n), `${n}%`]), '好感门槛'))
            + renderWordListField('romanceFx.favorWords', '好感指标名（与状态栏显示的名称一致）', s.favorWords)) : '')
        + checkbox(`${P}.relationCard`, s.relationCard, '关系变化卡')
        + checkbox(`${P}.rival`, s.rival, '修罗场')
        + checkbox(`${P}.confess`, s.confess, '告白演出')
        + checkbox(`${P}.memories`, s.memories, '恋爱回忆存入CG库');
    // 列表复用 BGM 曲目的行样式（settings-style 的 .igs-bgm-track）。
    const rows = s.actions.map((item, index) => `<div class="igs-bgm-track"><div class="igs-bgm-track-main"><b>${esc(item.name || '（未命名）')}</b><span>${esc(item.text)}</span></div>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-edit:${index}" title="修改">✎</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-remove:${index}" title="删除">×</button></div>`).join('');
    const add = s.actions.length < ROMANCE_ACTIONS_MAX ? '<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-add" title="添加动作">+</button>' : '';
    const interact = checkbox(`${P}.quickActions`, s.quickActions, '立绘快捷动作（头旁心形按钮）')
        + (s.quickActions ? sub(`<div class="igs-bgm-tracks">${rows || '<div class="igs-scene-empty">暂无动作</div>'}${add}</div>`
            + '<div class="igs-source-filter-note">选中的动作写入输入框，不自动发送；{角色} 换成当前角色名。</div>') : '');
    return featureRow(more, 'romance', `${P}.enabled`, true, '亲密演出', '暧昧时加氛围', field(`${P}.strength`, '演出强度', segmentedInput(`${P}.strength`, s.strength, [['weak', '弱'], ['medium', '中'], ['strong', '强']], '演出强度'))
        + perfSubhead('氛围图层') + layers
        + perfSubhead('声音与节律') + senses
        + perfSubhead('好感与关系') + story
        + perfSubhead('互动') + interact);
}
