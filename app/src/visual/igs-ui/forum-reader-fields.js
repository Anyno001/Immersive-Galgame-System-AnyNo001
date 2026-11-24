import { esc } from './reader-value-utils.js';
import { field, textInput } from './settings-fields.js';
import { FORUM_USER_KEY, titleAt } from './forum-reader-model.js';
import { describePo, threadAt } from './forum-reader-threads.js';

// 设置器里「论坛体」展开区的登记表：板块全局一个，每个帖子一块（楼主、当前标题、代号），楼主可手动改。读写走聊天元数据（虚拟 path forum.*），不进设置草稿。
const encKey = (key) => encodeURIComponent(String(key));

function poLabel(po) {
    if (!po) return '尚未登记';
    if (po.kind === 'user') return 'User';
    if (po.kind === 'witness') return `围观路人${po.note ? `（${po.note}）` : ''}`;
    return po.key;
}

function poText(po) {
    if (!po) return '';
    if (po.kind === 'user') return 'User';
    if (po.kind === 'witness') return po.note ? `路人:${po.note}` : '路人';
    return po.key;
}

// 帖子、角色两层折叠：收起时标题行就能看到楼主、标题、代号，窄屏不必横排输入框。
const fold = (key, summary, body, open = false) => `<details class="igs-settings-advanced igs-perf-more" data-advanced="perf-${esc(key)}"${open ? ' open' : ''}><summary>${esc(summary)}</summary>${body}</details>`;

export function renderForumRegistryFields(data) {
    if (!data) return '<div class="igs-scene-empty">打开一个聊天后，这里可以改帖子标题、板块和角色代号</div>';
    const threads = Array.isArray(data.threads) ? data.threads : [];
    const current = threadAt(data, Infinity);
    const blocks = threads.map((t, i) => {
        const keys = [...new Set([...(t.po && t.po.kind === 'char' ? [t.po.key] : []), ...Object.keys(t.alias || {}), ...Object.keys(t.names || {})])];
        const rows = keys.map((key) => {
            const label = key === FORUM_USER_KEY ? 'User' : key;
            const path = `forum.alias.${t.id}.${encKey(key)}`;
            const namesPath = `forum.names.${t.id}.${encKey(key)}`;
            const code = (t.alias || {})[key];
            const names = (t.names || {})[key] || [];
            const summary = [label, code || (t.po && t.po.kind === 'char' && t.po.key === key ? '楼主' : ''), names.length ? `别名 ${names.join('、')}` : ''].filter(Boolean).join(' · ');
            const isPo = t.po && t.po.kind === 'char' && t.po.key === key;
            const drop = isPo ? '' : `<div class="igs-mood-word-tag">${esc(label)}<button type="button" class="igs-mood-word-del" data-action="forum-drop:${esc(t.id)}:${encKey(key)}" title="删除这个角色条目">×</button></div>`;
            return fold(`forum-${t.id}-${encKey(key)}`, summary, (code ? field(path, '代号', textInput(path, code, '留空恢复自动')) : '')
                + field(namesPath, '别名', textInput(namesPath, names.join('、'), '用顿号分隔'), '正文与台词里的别名也按代号显示')
                + drop);
        }).join('');
        const title = titleAt(t, Infinity);
        const summary = [`帖子 ${i + 1}`, poLabel(t.po), title ? `《${title}》` : '', keys.length ? `${keys.length} 人` : ''].filter(Boolean).join(' · ');
        const addPath = `forum.add.${t.id}`;
        const body = field(`forum.po.${t.id}`, '楼主', textInput(`forum.po.${t.id}`, poText(t.po), '角色名、User或「路人:身份」'))
            + field(`forum.title.${t.id}`, '当前标题', textInput(`forum.title.${t.id}`, title, '留空由 AI 或自动生成'))
            + rows
            + field(addPath, '添加未出场角色', textInput(addPath, '', '填角色名，回车添加并生成代号'));
        return fold(`forum-${t.id}`, summary, body, current ? current.id === t.id : i === 0);
    }).join('');
    return field('forum.board', '板块', textInput('forum.board', data.board, '留空按世界观'))
        + (blocks || '<div class="igs-scene-empty">本聊天还没有登记帖子</div>');
}

export { describePo };
