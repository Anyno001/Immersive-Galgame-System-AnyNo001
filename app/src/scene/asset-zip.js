// 「下载本区素材」的清单：把角色或场景里每张图摆成 zip 里的路径，只列地址，不读图片。
// 角色：角色/名字/情绪、角色/名字/头像、角色/名字/服装名/情绪；场景：场景/名字、场景/名字/时间、场景/名字/时间-天气。

const cleanSeg = (value) => String(value == null ? '' : value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '未命名';

const urlOf = (value) => String((value && typeof value === 'object' ? value.url : value) || '').trim();

function push(out, path, url) {
    if (url) out.push({ path, url });
}

function characterEntries(name, assets, out) {
    const dir = `角色/${cleanSeg(name)}`;
    for (const [mood, url] of Object.entries((assets.characters || {})[name] || {})) push(out, `${dir}/${cleanSeg(mood)}`, urlOf(url));
    push(out, `${dir}/头像`, urlOf((assets.statusAvatars || {})[name]));
    const outfits = (assets.characterOutfits || {})[name];
    for (const [outfit, entry] of Object.entries(outfits && typeof outfits === 'object' ? outfits : {})) {
        if (!entry || typeof entry !== 'object') continue;
        const sub = `${dir}/${cleanSeg(outfit)}`;
        push(out, `${sub}/底图`, urlOf(entry.base));
        push(out, `${sub}/头像`, urlOf(entry.avatar));
        for (const [mood, url] of Object.entries(entry.moods || {})) push(out, `${sub}/${cleanSeg(mood)}`, urlOf(url));
    }
}

function sceneEntries(name, assets, out) {
    const value = (assets.scenes || {})[name];
    const dir = `场景/${cleanSeg(name)}`;
    push(out, dir, urlOf(value));
    const times = value && typeof value === 'object' ? value.times || {} : {};
    for (const [time, timeValue] of Object.entries(times)) {
        push(out, `${dir}/${cleanSeg(time)}`, urlOf(timeValue));
        const weathers = timeValue && typeof timeValue === 'object' ? timeValue.weathers || {} : {};
        for (const [weather, weatherValue] of Object.entries(weathers)) push(out, `${dir}/${cleanSeg(time)}-${cleanSeg(weather)}`, urlOf(weatherValue));
    }
}

// collection：'characters' | 'scenes'；names 为当前列表里显示的条目（跟随「全部 · 本卡 · 全局」筛选）。
export function collectAssetZipEntries(assets, collection, names) {
    const source = assets && typeof assets === 'object' ? assets : {};
    const out = [];
    for (const name of Array.isArray(names) ? names : []) {
        if (collection === 'characters') characterEntries(name, source, out);
        else if (collection === 'scenes') sceneEntries(name, source, out);
    }
    return out;
}
