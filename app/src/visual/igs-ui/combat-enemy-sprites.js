import { esc } from './reader-value-utils.js';
import { storedCreatureOf } from '../../scene/creature-profile.js';
import { menuItem, renderRowMenu, thumb as outfitThumb } from './settings-outfit-fields.js';

const encSeg = (value) => encodeURIComponent(String(value));
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// 敌人名单的数据源：本卡 characterDna 里带 creature 档案或 combatFoe 标记的条目。
// 战斗对手自动建档（临时档）与手动设为非人的角色都落在这里，开战预热与楼层补全也只在这里建档；
// 判定为人类或在本页取消非人的对手带 combatFoe 标记（profile 为 null），同样留在名单。
// 战斗留档只记数值，不含外貌档案，所以不作为来源。临时档在前，按最近出场倒序。
export function listCombatEnemies(sceneAssets) {
    const dnaMap = plain(plain(sceneAssets).characterDna);
    const temp = (item) => Number(item.profile?.temp === true);
    return Object.keys(dnaMap)
        .map((name) => ({ name, profile: storedCreatureOf(dnaMap[name]), human: plain(dnaMap[name]).combatFoe === true }))
        .filter((item) => item.profile || item.human)
        .sort((a, b) => (temp(b) - temp(a)) || ((b.profile?.seenAt || 0) - (a.profile?.seenAt || 0)));
}

function adoptedUrl(sceneAssets, name) {
    const slots = plain(plain(sceneAssets.characters)[name]);
    const keys = ['默认', '平和', ...Object.keys(slots)];
    for (const key of keys) {
        const value = typeof slots[key] === 'string' ? slots[key].trim() : '';
        if (value) return value;
    }
    return '';
}

// 当前用图：已采用立绘 > 待确认的临时立绘（开战预热或楼层补全生成）> 图集格或剪影。
export function enemySpriteState(sceneAssets, name, tempSprite) {
    const adopted = adoptedUrl(sceneAssets, name);
    if (adopted) return { url: adopted, kind: 'adopted', label: '已采用立绘' };
    let temp = '';
    try { temp = typeof tempSprite === 'function' ? String(tempSprite(name) || '') : ''; } catch (error) { temp = ''; }
    if (temp) return { url: temp, kind: 'temp', label: '待确认立绘' };
    return { url: '', kind: 'none', label: '无立绘，战斗中用图集或剪影' };
}

// 卡片里的短标注；完整说明写在区块顶部。
const STATE_SHORT = Object.freeze({ adopted: '已采用', temp: '待确认', none: '无立绘' });

// 战斗页「敌人立绘管理」：版式照立绘页的角色行（缩略图 + 名字 + 一个常用按钮 + ⋯ 菜单）。
// 生成与重画沿用 char-generate-sprite（带进度与停止），非人开关、转正复用 char-creature，删除与备注为 combat-enemy-sprite 的两个动作。
// 折叠时只出标题与人数，不渲染行、不取缩略图（缩略图会触发解码）；展开时由设置页重绘一次补出内容。
export function renderCombatEnemySprites({ sceneAssets = {}, resolveUrl, tempSprite, isOpen } = {}) {
    const list = listCombatEnemies(sceneAssets);
    const opened = typeof isOpen === 'function' && isOpen('combat-enemy-sprites');
    const summary = `<summary>敌人立绘管理${list.length ? `（${list.length}）` : ''}</summary>`;
    const head = `<details class="igs-settings-sub igs-settings-advanced" data-advanced="combat-enemy-sprites" data-combat-enemy-sprites${opened ? ' open' : ''}>${summary}`;
    if (!opened) return `${head}</details>`;
    const notes = plain(sceneAssets.characterSpriteNotes);
    const rows = list.map(({ name, profile }) => {
        const state = enemySpriteState(sceneAssets, name, tempSprite);
        const e = encSeg(name);
        const note = String(notes[name] || '').trim();
        const menu = renderRowMenu([
            menuItem(`combat-enemy-sprite:note:${e}`, note ? '修改写词备注' : '写词备注'),
            profile?.temp ? menuItem(`char-creature:temp:${e}:false`, '转为正式角色') : '',
            profile ? menuItem(`char-creature:enabled:${e}:human`, '取消非人角色') : menuItem(`char-creature:enabled:${e}:true`, '设为非人角色'),
            profile ? '' : menuItem(`combat-enemy-sprite:unlist:${e}`, '移出敌人名单'),
            state.kind === 'none' ? '' : menuItem(`combat-enemy-sprite:remove:${e}`, '删除立绘', ' is-danger'),
        ], `「${name}」的操作`);
        // 卡片结构与衣柜一致：竖图缩略图 → 名字 + ⋯ → 来源 → 生成/重画。
        return `<div class="igs-sprite-slot igs-wardrobe-item" data-combat-enemy="${esc(name)}"><div class="igs-btn-mgr-row igs-scene-mood-row">`
            + outfitThumb(state.url, `${name}立绘`, '', resolveUrl)
            + `<span class="igs-btn-mgr-label igs-wardrobe-name"${note ? ` title="写词备注：${esc(note)}"` : ''}>${esc(name)}</span>`
            + menu
            + `<span class="igs-outfit-muted">${!profile ? '人类' : profile.temp ? '临时档' : '非人'} · ${esc(STATE_SHORT[state.kind])}</span>`
            + `<button type="button" class="igs-review-link igs-outfit-quick-btn" data-action="char-generate-sprite:${e}">${state.kind === 'none' ? '生成立绘' : '重画'}</button>`
            + '</div></div>';
    }).join('');
    return head
        + '<div class="igs-source-filter-note">本卡的战斗对手，含人类与非人角色。开战标签出现时自动备图；无立绘时战斗中用图集或剪影。</div>'
        + (rows ? `<div class="igs-btn-mgr-list igs-wardrobe-list is-tall">${rows}</div>` : '<div class="igs-scene-empty">本卡暂无战斗对手档案</div>')
        + '</details>';
}
