import { esc } from './reader-value-utils.js';
import { field, textInput } from './settings-fields.js';
import { FORUM_USER_KEY, titleAt } from './forum-reader-model.js';
import { describePo } from './forum-reader-threads.js';

// 设置器里「论坛体」展开区的登记表：板块全局一个，每个帖子一块（楼主、当前标题、代号）。读写走聊天元数据（虚拟 path forum.*），不进设置草稿。
const encKey = (key) => encodeURIComponent(String(key));

function poLabel(po) {
    if (!po) return '尚未登记';
    if (po.kind === 'user') return 'User';
    if (po.kind === 'witness') return `围观路人${po.note ? `（${esc(po.note)}）` : ''}`;
    return esc(po.key);
}

export function renderForumRegistryFields(data) {
    if (!data) return '<div class="igs-scene-empty">打开一个聊天后，这里可以改帖子标题、板块和角色代号</div>';
    const threads = Array.isArray(data.threads) ? data.threads : [];
    const blocks = threads.map((t, i) => {
        const rows = Object.entries(t.alias || {}).map(([key, code]) => {
            const label = key === FORUM_USER_KEY ? 'User' : key;
            const path = `forum.alias.${t.id}.${encKey(key)}`;
            return field(path, `${label} 的代号`, textInput(path, code, '留空恢复自动'));
        }).join('');
        const head = `<div class="igs-settings-field"><span>帖子 ${i + 1} 楼主</span><em>${poLabel(t.po)}</em></div>`;
        return head + field(`forum.title.${t.id}`, '当前标题', textInput(`forum.title.${t.id}`, titleAt(t, Infinity), '留空由 AI 或自动生成')) + rows;
    }).join('');
    return field('forum.board', '板块', textInput('forum.board', data.board, '留空按世界观'))
        + (blocks || '<div class="igs-scene-empty">本聊天还没有登记帖子</div>');
}

export { describePo };
