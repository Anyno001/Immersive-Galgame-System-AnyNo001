import { esc } from './reader-value-utils.js';
import { field, textInput } from './settings-fields.js';
import { FORUM_USER_KEY } from './forum-reader-model.js';

// 设置器里「论坛体」展开区的小表格：标题、板块、每个角色的代号。读写走聊天元数据（虚拟 path forum.*），不进设置草稿。
const encKey = (key) => encodeURIComponent(String(key));

export function renderForumRegistryFields(data) {
    if (!data) return '<div class="igs-scene-empty">打开一个聊天后，这里可以改帖子标题、板块和角色代号</div>';
    const rows = Object.entries(data.alias || {}).map(([key, code]) => {
        const label = key === FORUM_USER_KEY ? 'User' : key;
        return field(`forum.alias.${encKey(key)}`, `${label} 的代号`, textInput(`forum.alias.${encKey(key)}`, code, '留空恢复自动'));
    }).join('');
    const po = data.po ? (data.po.kind === 'user' ? 'User' : data.po.kind === 'witness' ? `围观路人${data.po.note ? `（${esc(data.po.note)}）` : ''}` : esc(data.po.key)) : '尚未登记';
    return `<div class="igs-perf-item-subhead">本聊天的帖子</div>`
        + field('forum.title', '帖子标题', textInput('forum.title', data.title, '留空由 AI 或自动生成'))
        + field('forum.board', '板块', textInput('forum.board', data.board, '留空按世界观'))
        + `<div class="igs-settings-field"><span>当前楼主</span><em>${po}</em></div>`
        + rows;
}
