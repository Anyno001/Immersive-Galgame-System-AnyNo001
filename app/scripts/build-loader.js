import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const projectRoot = path.resolve(appRoot, '..');
const loaderRoot = path.join(projectRoot, 'loader');
const jsPath = path.join(loaderRoot, 'igs-loader.js');
const jsonPath = path.join(loaderRoot, 'igs-loader.json');

const content = fs.readFileSync(jsPath, 'utf8');
if (!content.includes('igs.bundle.js') || !content.includes('igs.bundle.css')) {
    throw new Error('Loader source must reference igs.bundle.js and igs.bundle.css.');
}

// 版本化固定 loader：在 loader 源前注入 IGS_LOADER_REF，把它锁定到具体 tag（不追 main、不自动更新）。
function buildPinnedContent(source, ref) {
    const prefix = `(function(){try{(window.parent&&window.parent.document?window.parent:window).IGS_LOADER_REF=${JSON.stringify(ref)};}catch(e){try{window.IGS_LOADER_REF=${JSON.stringify(ref)};}catch(e2){}}})();\n`;
    return prefix + source;
}

function writePinnedLoader(ref) {
    const pinnedContent = buildPinnedContent(content, ref);
    const pinnedName = `沉浸式Galgame系统 ${ref}.json`;
    const pinnedPath = path.join(loaderRoot, pinnedName);
    const pinnedJson = {
        type: 'script',
        enabled: false,
        name: `沉浸式Galgame系统 ${ref}`,
        id: `igs-pinned-${ref}`,
        content: pinnedContent,
        info: [
            `Immersive Galgame System 固定版 loader（锁定 ${ref}，不自动更新）。`,
            `从 GitHub/jsDelivr 加载 ${ref} tag 的 app/dist/igs.bundle.css 与 igs.bundle.js。`,
            '如需自动更新，请改用「沉浸式Galgame系统（自动更新）」loader。',
        ].join('\n'),
        button: { enabled: false, buttons: [] },
        data: {},
        export_with: { data: true, button: true },
    };
    fs.writeFileSync(pinnedPath, `${JSON.stringify(pinnedJson, null, 2)}\n`, 'utf8');
    const verify = JSON.parse(fs.readFileSync(pinnedPath, 'utf8'));
    if (verify.content !== pinnedContent || !verify.content.includes(`IGS_LOADER_REF=${JSON.stringify(ref)}`)) {
        throw new Error(`Pinned loader JSON for ${ref} does not match source.`);
    }
    console.log(`loader:pinned ok ${path.relative(projectRoot, pinnedPath)}`);
}

const loaderJson = {
    type: 'script',
    enabled: false,
    name: '沉浸式Galgame系统（自动更新）',
    id: 'dfb8828d-1687-4aff-84e3-e192def8d389',
    content,
    info: [
        'Immersive Galgame System 自动更新 loader。',
        '默认从 GitHub/jsDelivr 加载 app/dist/igs.bundle.css 与 app/dist/igs.bundle.js。',
        '测试前请确认仓库或发布资产为公开可访问。',
    ].join('\n'),
    button: {
        enabled: false,
        buttons: [],
    },
    data: {},
    export_with: {
        data: true,
        button: true,
    },
};

fs.writeFileSync(jsonPath, `${JSON.stringify(loaderJson, null, 2)}\n`, 'utf8');

const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
if (parsed.content !== content) {
    throw new Error('Loader JSON content does not match loader source.');
}

console.log(`loader:build ok ${path.relative(projectRoot, jsonPath)}`);

// 固定版 loader 按需生成：`node scripts/build-loader.js --pin v0.23.21 v0.23.15`
// 不传 --pin 时只更新自动更新版 + debug 版，不生成任何 pinned（避免每次升号堆文件）。
const pinArgIndex = process.argv.indexOf('--pin');
if (pinArgIndex !== -1) {
    const refs = process.argv.slice(pinArgIndex + 1).filter((arg) => /^v\d+\.\d+\.\d+$/.test(arg));
    if (!refs.length) {
        throw new Error('--pin requires at least one vX.Y.Z ref.');
    }
    for (const ref of refs) {
        writePinnedLoader(ref);
    }
}

// Debug loader: derived from the production source so it never drifts.
// Difference: sets root.IGS_DEBUG = true before injecting the bundle, enabling
// igsDebug() [DEBUG-*] logging. Not part of the public release.
const debugMarker = 'const root = resolveRootWindow();';
if (!content.includes(debugMarker)) {
    throw new Error('Loader source missing expected root marker for debug build.');
}
const debugContent = content
    .replace(debugMarker, `${debugMarker}\n    try { root.IGS_DEBUG = true; } catch (vnDebugError) { /* ignore */ }`)
    .replace("INSTANCE_KEY = '__IGS_AUTO_UPDATE_LOADER__'", "INSTANCE_KEY = '__IGS_AUTO_UPDATE_LOADER_DEBUG__'");

const debugJsPath = path.join(loaderRoot, 'igs-loader-debug.js');
const debugJsonPath = path.join(loaderRoot, 'igs-loader-debug.json');
fs.writeFileSync(debugJsPath, debugContent, 'utf8');

const debugLoaderJson = {
    type: 'script',
    enabled: false,
    name: '沉浸式Galgame系统（调试版）',
    id: 'f1c4a3d2-9b6e-4a71-8c2d-7e5b0a9d3f64',
    content: debugContent,
    info: [
        'Immersive Galgame System 调试版 loader（仅供开发测试）。',
        '与正式版加载同一个远程 bundle，但会设置 IGS_DEBUG=true，输出 [DEBUG-*] 控制台日志。',
        '不要随正式版一起发布给普通用户。',
    ].join('\n'),
    button: {
        enabled: false,
        buttons: [],
    },
    data: {},
    export_with: {
        data: true,
        button: true,
    },
};
fs.writeFileSync(debugJsonPath, `${JSON.stringify(debugLoaderJson, null, 2)}\n`, 'utf8');

const debugParsed = JSON.parse(fs.readFileSync(debugJsonPath, 'utf8'));
if (debugParsed.content !== debugContent || !debugContent.includes('root.IGS_DEBUG = true')) {
    throw new Error('Debug loader JSON content does not match debug loader source.');
}

console.log(`loader:debug ok ${path.relative(projectRoot, debugJsonPath)}`);
