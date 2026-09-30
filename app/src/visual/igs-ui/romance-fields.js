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
    const toggle = checkbox(`${P}.enabled`, s.enabled, '亲密演出');
    if (!s.enabled) return toggle;
    const layers = `<div class="igs-source-filter-grid">`
        + checkbox(`${P}.approach`, s.approach, '立绘逼近镜头')
        + checkbox(`${P}.glow`, s.glow, '暖光柔焦')
        + checkbox(`${P}.bokeh`, s.bokeh, '光斑')
        + checkbox(`${P}.backlight`, s.backlight, '逆光')
        + checkbox(`${P}.nsfwCurve`, s.nsfwCurve, 'NSFW 场景渐强渐弱')
        + `</div><div class="igs-source-filter-note">暧昧、亲密时自动加氛围，NSFW 场景最强；只做氛围，不生成画面。</div>`;
    const senses = checkbox(`${P}.edgeFx`, s.edgeFx, '边缘光影（心跳暗角、窗帘光影、热浪、色散、白场与暗转）')
        + checkbox(`${P}.softSound`, s.softSound, '亲密氛围音（心跳、呼吸、环境声压低、耳语）')
        + checkbox(`${P}.nsfwSound`, s.nsfwSound, 'NSFW 场景音效（急促心跳与呼吸、耳鸣、顶点静音、余韵钟声）')
        + checkbox(`${P}.rhythm`, s.rhythm, 'NSFW 节律演出（床的吱呀声 + 画面随节奏晃动）')
        + (s.rhythm ? sub(field(`${P}.sway`, '晃动幅度', segmentedInput(`${P}.sway`, s.sway, [['off', '关'], ['weak', '弱'], ['medium', '中'], ['strong', '强']], '晃动幅度'))
            + '<div class="igs-source-filter-note">越往后越快，顶点处戛然而止。床的材质按地点自动选（木床 / 铁床 / 车内 / 沙发 / 被褥）；对话框不晃，系统开启「减少动态效果」时只保留声音。</div>') : '')
        + '<div class="igs-source-filter-note">声音跟随「演出音效」的开关与音量；画面效果只落在画面边缘，生成的 CG 与插图不柔焦、环境滤镜减弱。</div>';
    const story = checkbox(`${P}.favorAmbience`, s.favorAmbience, '高好感角色在场时常驻暖光')
        + (s.favorAmbience ? sub(field(`${P}.favorThreshold`, '好感门槛', segmentedInput(`${P}.favorThreshold`, String(s.favorThreshold), ROMANCE_FAVOR_THRESHOLDS.map((n) => [String(n), `${n}%`]), '好感门槛'))
            + renderWordListField('romanceFx.favorWords', '好感指标名', s.favorWords)
            + '<div class="igs-source-filter-note">需开启状态栏并选择含好感指标的表格；指标名需与状态栏里显示的名称完全一致。</div>') : '')
        + checkbox(`${P}.relationCard`, s.relationCard, '关系变化卡')
        + checkbox(`${P}.rival`, s.rival, '修罗场')
        + checkbox(`${P}.confess`, s.confess, '告白演出')
        + checkbox(`${P}.memories`, s.memories, '恋爱回忆存入 CG 库')
        + (s.memories ? sub('<div class="igs-source-filter-note">与日常拍照共用相册，NSFW 场景不拍。</div>') : '');
    // 列表复用 BGM 曲目的行样式（settings-style 的 .igs-bgm-track）。
    const rows = s.actions.map((item, index) => `<div class="igs-bgm-track"><div class="igs-bgm-track-main"><b>${esc(item.name || '（未命名）')}</b><span>${esc(item.text)}</span></div>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-edit:${index}" title="修改">✎</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-remove:${index}" title="删除">×</button></div>`).join('');
    const add = s.actions.length < ROMANCE_ACTIONS_MAX ? '<button type="button" class="igs-btn-mgr-icon" data-action="romance-action-add" title="添加动作">+</button>' : '';
    const interact = checkbox(`${P}.quickActions`, s.quickActions, '立绘快捷动作')
        + (s.quickActions ? sub(`<div class="igs-bgm-tracks">${rows || '<div class="igs-scene-empty">暂无动作</div>'}${add}</div>`
            + '<div class="igs-source-filter-note">暧昧、亲密或高好感时，立绘头部旁出现心形按钮；选中的动作写入输入框，不自动发送。{角色} 会换成当前角色名。</div>') : '');
    return toggle + sub(field(`${P}.strength`, '演出强度', segmentedInput(`${P}.strength`, s.strength, [['weak', '弱'], ['medium', '中'], ['strong', '强']], '演出强度'))
        + more('romance-layers', '氛围图层', layers)
        + more('romance-senses', '声音与节律', senses)
        + more('romance-story', '好感与关系', story)
        + more('romance-actions', '互动', interact));
}
