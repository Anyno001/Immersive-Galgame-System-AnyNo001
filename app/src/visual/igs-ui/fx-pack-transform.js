// 题材包清单：立绘变形。字段说明见 docs/FX_PACK_CONTRACT.md；本文件只导出 PACK，由 scene/fx-packs.js 汇总。
// 镜子、玻璃、屏幕映出或改变角色形象的演出：全部读当前立绘 DOM 复刻，同页最多 1 个变形层。
import { TRANSFORM_BUILDERS } from './fx-transform.js';
import { TRANSFORM_SFX_DEFS } from './fx-transform-sfx.js';
import { TRANSFORM_STYLE_TEXT } from './fx-transform-style.js';
import { XF_KINDS, parseTransformFx, transformFxOf } from './fx-transform-model.js';

const labels = {
    mirror: '镜中倒影',
    reflect: '车窗与水面倒影',
    silhouette: '剪影与磨砂玻璃',
    frame: '监控与全息框',
    warp: '立绘异化',
    zoom: '局部特写框',
    mark: '局部贴片',
    spirit: '元神出窍',
};

const triggers = {
    mirror: ['镜子', '镜中', '对镜'],
    reflect: ['倒影', '车窗', '水面'],
    silhouette: ['剪影', '磨砂玻璃', '逆光'],
    frame: ['监控', '全息', '回忆'],
    warp: ['异化', '扭曲', '故障'],
    zoom: ['特写', '凑近', '放大'],
    mark: ['红晕', '吻痕', '咬痕', '契约'],
    spirit: ['元神', '出窍', '魂魄'],
};

const promptLines = {
    mirror: '[igs-fx:mirror|角色]：角色对镜自照、镜里映出本人的一刻，镜中是翻转的本人立绘；角色可省，省略为当前说话人',
    reflect: '[igs-fx:reflect|车窗/水面|角色]：角色的脸映在车窗玻璃或水面上的一刻，写车窗或水面之一；角色可省',
    silhouette: '[igs-fx:silhouette|角色|玻璃/逆光]：角色隔着磨砂玻璃只见身影，或站在强光里只见轮廓的一刻，写玻璃或逆光之一；角色可省',
    frame: '[igs-fx:frame|监控/全息/回忆|角色]：角色出现在监控画面、全息投影或回忆画面里的一刻，写监控、全息、回忆之一；古代与魔法背景只会显示回忆框',
    warp: '[igs-fx:warp|角色|样式]：角色形象异常的一瞬，样式写故障、错位、负片、黑眼、颤抖之一，直接作用在立绘上；角色可省，样式可省',
    zoom: '[igs-fx:zoom|角色|手/唇/眼/颈]：镜头凑近角色某个部位的特写一刻，部位写手、唇、眼、颈、脸、腰之一；角色可省',
    mark: '[igs-fx:mark|角色|部位|样式]：角色身上留下可见印记的一刻，样式写潮红、吻痕、咬痕、契约纹、淤青之一，部位写脸颊、颈、额、唇、眼角之一，两项至少写一项',
    spirit: '[igs-fx:spirit|角色]：角色元神离体、魂魄飘出的一刻，本体失神下沉；角色可省',
};

export const PACK = {
    id: 'transform',
    label: '立绘变形',
    when: '角色形象被镜子、玻璃、屏幕映出或发生变形时才用',
    era: null,
    defaultOn: true,
    eraKinds: { spirit: 'ancient' },
    kinds: [...XF_KINDS],
    labels,
    triggers,
    promptLines,
    parse: parseTransformFx,
    of: transformFxOf,
    builders: { ...TRANSFORM_BUILDERS },
    sfx: { ...TRANSFORM_SFX_DEFS },
    cssText: TRANSFORM_STYLE_TEXT,
};
