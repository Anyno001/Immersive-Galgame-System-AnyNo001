const cleanName = value => String(value ?? '').trim().slice(0, 40);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function normalizeFolderState(value) {
    const source = value && typeof value === 'object' ? value : {};
    const folders = [...new Set((Array.isArray(source.folders) ? source.folders : []).map(cleanName).filter(Boolean))];
    const assign = Object.create(null);
    if (source.assign && typeof source.assign === 'object') {
        for (const [item, folder] of Object.entries(source.assign)) {
            const name = cleanName(folder);
            if (item && folders.includes(name)) assign[item] = name;
        }
    }
    const collapsed = [...new Set((Array.isArray(source.collapsed) ? source.collapsed : []).map(cleanName))]
        .filter(name => name === '' || folders.includes(name));
    return { view: ['list', 'grid'].includes(source.view) ? source.view : 'list', folders, collapsed, assign };
}

export function editFolderState(value, operation, { name = '', to = '', item = '', view = '' } = {}) {
    const next = normalizeFolderState(value);
    const from = cleanName(name), target = cleanName(to);
    if (operation === 'view' && ['list', 'grid'].includes(view)) next.view = view;
    if (operation === 'add' && from && !next.folders.includes(from)) next.folders.push(from);
    if (operation === 'rename' && target && next.folders.includes(from) && (target === from || !next.folders.includes(target))) {
        next.folders = next.folders.map(folder => folder === from ? target : folder);
        next.collapsed = next.collapsed.map(folder => folder === from ? target : folder);
        for (const key of Object.keys(next.assign)) if (next.assign[key] === from) next.assign[key] = target;
    }
    if (operation === 'remove') {
        next.folders = next.folders.filter(folder => folder !== from);
        for (const key of Object.keys(next.assign)) if (next.assign[key] === from) delete next.assign[key];
    }
    if (operation === 'move' && item) {
        if (target && next.folders.includes(target)) next.assign[item] = target;
        else delete next.assign[item];
    }
    if (operation === 'toggle') next.collapsed = next.collapsed.includes(from)
        ? next.collapsed.filter(folder => folder !== from) : [...next.collapsed, from];
    if (operation === 'rename-item' && item && to && own(next.assign, item)) {
        next.assign[to] = next.assign[item]; delete next.assign[item];
    }
    if (operation === 'forget-item') delete next.assign[item];
    return normalizeFolderState(next);
}

export function groupFolderItems(value, names) {
    const state = normalizeFolderState(value);
    const groups = state.folders.map(folder => ({ folder, items: [] }));
    const unfiled = { folder: '', items: [] };
    for (const name of Array.isArray(names) ? names : []) {
        const group = own(state.assign, name) ? groups.find(entry => entry.folder === state.assign[name]) : null;
        (group || unfiled).items.push(name);
    }
    return [...groups, unfiled];
}
