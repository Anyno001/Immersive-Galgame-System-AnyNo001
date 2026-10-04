import fs from 'node:fs';
import path from 'node:path';
import { contentHash, findTruncatedFontTables, fontSliceName, JSDELIVR_FILE_LIMIT_BYTES, readSliceManifest, renderSliceFontFaces, SPLIT_FONT_MIN_BYTES } from './font-slices.js';
import { externalizeSkinAssets, verifySkinAssets } from './skin-assets.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const srcRoot = path.join(appRoot, 'src');
const distRoot = path.join(appRoot, 'dist');
const entryFile = path.join(srcRoot, 'index.js');

fs.mkdirSync(distRoot, { recursive: true });

const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const graph = buildModuleGraph(entryFile);
const compiled = renderBundle(graph, moduleId(entryFile));
// 地图底图：源码里以相对路径引用的图片（内置 map-demo 与 assets/map-styles 下的自带款式）统一改写为 ./maps/<文件名> 并随 bundle 发布。
const MAP_ASSET_DIRS = {
    'fixtures/record-pages/assets': path.join(appRoot, 'fixtures', 'record-pages', 'assets'),
    'assets/map-styles': path.join(srcRoot, 'visual', 'igs-ui', 'assets', 'map-styles'),
};
const MAP_ASSET_RE = /(?:\.\.?\/)+(fixtures\/record-pages\/assets|assets\/map-styles)\/([\w.-]+\.(?:png|webp|jpe?g))/g;
const mapAssets = new Map();
const mapped = compiled.replace(MAP_ASSET_RE, (_match, dir, file) => {
    mapAssets.set(file, path.join(MAP_ASSET_DIRS[dir], file));
    return `./maps/${file}`;
});
if (!mapAssets.has('map-demo-clean-night.png')) throw new Error('Map image path is missing from bundle.');
// 默认背景素材包：源码以 new URL('../../assets/backgrounds/<文件名>', import.meta.url) 引用，统一改写为 ./backgrounds/<文件名> 并复制到 dist/backgrounds/。
const BACKGROUND_ASSET_RE = /(?:\.\.?\/)+assets\/backgrounds\/([\w.-]+\.webp)/g;
const backgroundSourceDir = path.join(appRoot, 'assets', 'backgrounds');
const backgroundAssets = new Set();
const withBackgrounds = mapped.replace(BACKGROUND_ASSET_RE, (_match, file) => {
    backgroundAssets.add(file);
    return `./backgrounds/${file}`;
});
if (!backgroundAssets.size) throw new Error('Default background pack images are missing from bundle.');
// 默认曲目素材包：同背景素材包，new URL('../../assets/bgm/<文件名>', import.meta.url) 改写为 ./bgm/<文件名>，复制到 dist/bgm/。
const BGM_ASSET_RE = /(?:\.\.?\/)+assets\/bgm\/([\w.-]+\.(?:mp3|ogg))/g;
const bgmSourceDir = path.join(appRoot, 'assets', 'bgm');
const bgmAssets = new Set();
const withBgm = withBackgrounds.replace(BGM_ASSET_RE, (_match, file) => {
    bgmAssets.add(file);
    return `./bgm/${file}`;
});
if (!bgmAssets.size) throw new Error('Default BGM pack tracks are missing from bundle.');
// 内置语气音：同曲目素材包，new URL('../../assets/voice/<文件名>', import.meta.url) 改写为 ./voice/<文件名>，复制到 dist/voice/。
const VOICE_ASSET_RE = /(?:\.\.?\/)+assets\/voice\/([\w.-]+\.mp3)/g;
const voiceSourceDir = path.join(appRoot, 'assets', 'voice');
const voiceAssets = new Set();
const withVoice = withBgm.replace(VOICE_ASSET_RE, (_match, file) => {
    voiceAssets.add(file);
    return `./voice/${file}`;
});
if (!voiceAssets.size) throw new Error('Voice bark clips are missing from bundle.');
const skinAssets = await externalizeSkinAssets(withVoice, { srcRoot, distRoot });
const bundle = inlineTypewriterAudio(skinAssets.bundle);

const roundedFontWeights = [300, 400, 500, 700];
const dialogFontAssets = [
    { family: 'LXGW WenKai', file: 'LXGWWenKai-Regular.ttf', weight: 400, style: 'normal', format: 'truetype' },
    { family: 'LXGW WenKai', file: 'LXGWWenKai-Light.ttf', weight: 300, style: 'normal', format: 'truetype' },
    { family: 'LXGW WenKai Lite', file: 'LXGWWenKaiLite-Regular.ttf', weight: 400, style: 'normal', format: 'truetype' },
    { family: 'LXGW Neo ZhiSong', file: 'LXGWNeoZhiSong.ttf', weight: 400, style: 'normal', format: 'truetype' },
    { family: 'LXGW Neo XiHei', file: 'LXGWNeoXiHei.ttf', weight: 400, style: 'normal', format: 'truetype' },
    // 该文件是 Medium 字重，但按默认正文的 400 入口注册，确保未显式设置字重时也实际命中 Medium 字形。
    { family: 'Source Han Sans CN', file: 'SourceHanSansCN-Medium.otf', weight: 400, style: 'normal', format: 'opentype' },
    { family: 'Huiwen Mincho', file: 'HuiwenMincho.otf', weight: 400, style: 'normal', format: 'opentype' },
    { family: 'Tsanger YuYang', file: 'TsangerYuYangT-W05.woff2', weight: 400, style: 'normal', format: 'woff2' },
    { family: 'Smiley Sans', file: 'SmileySans-Oblique.ttf', weight: 400, style: 'normal', format: 'truetype' },
    { family: 'ZCOOL KuaiLe', file: 'ZCOOLKuaiLe-Regular.ttf', weight: 400, style: 'normal', format: 'truetype' },
    { family: 'Yozai', file: 'Yozai-Regular.ttf', weight: 400, style: 'normal', format: 'truetype' },
    { family: 'Cinzel', file: 'Cinzel-Variable.ttf', weight: '100 900', style: 'normal', format: 'truetype' },
    { family: 'Great Vibes', file: 'GreatVibes-Regular.ttf', weight: 400, style: 'normal', format: 'truetype' },
    { family: 'Pinyon Script', file: 'PinyonScript-Regular.ttf', weight: 400, style: 'normal', format: 'truetype' },
    { family: 'Quicksand', file: 'Quicksand-Variable.ttf', weight: '300 700', style: 'normal', format: 'truetype' },
    { family: 'Caveat', file: 'Caveat-Variable.ttf', weight: '400 700', style: 'normal', format: 'truetype' },
    { family: 'IM Fell English SC', file: 'IMFellEnglishSC-Regular.ttf', weight: 400, style: 'normal', format: 'truetype' },
];
const classicFontAssets = [
    { family: 'Source Han Serif CN', file: 'SourceHanSerifCN-Regular.otf', weight: 400, style: 'normal', format: 'opentype' },
    { family: 'Cormorant Garamond', file: 'CormorantGaramond-Regular.woff2', weight: 400, style: 'normal', format: 'woff2' },
    { family: 'Cormorant Garamond', file: 'CormorantGaramond-Italic.woff2', weight: 400, style: 'italic', format: 'woff2' },
];
const fontSliceManifestDir = path.join(srcRoot, 'visual', 'igs-ui', 'assets', 'font-slices');
const bundledFontAssets = [
    ...roundedFontWeights.map((weight) => ({ family: 'IGS Rounded', file: `nowar-rounded-bliz-${weight}.ttf`, weight, style: 'normal', format: 'truetype' })),
    ...dialogFontAssets,
    ...classicFontAssets,
];
const slicedFonts = new Map();
for (const asset of bundledFontAssets) {
    const sliceManifest = readSliceManifest(fontSliceManifestDir, asset.file);
    if (sliceManifest) slicedFonts.set(asset.file, { manifest: sliceManifest, css: renderSliceFontFaces(asset, sliceManifest.slices) });
}
const css = [
    ...[...slicedFonts].map(([file, sliced]) => `@import url("./fonts/${fontSliceName(file)}/font.css?v=${contentHash(sliced.css)}");`),
    ...bundledFontAssets.filter(({ file }) => !slicedFonts.has(file)).map(({ family, file, weight, style, format }) => `@font-face { font-family: "${family}"; font-style: ${style}; font-weight: ${weight}; font-display: swap; src: url("./fonts/${file}") format("${format}"); }`),
    '.igs-stage { position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; background: #0b0d12; }',
    '.igs-background-layer, .igs-generated-layer, .igs-effect-layer, .igs-character-layer, .igs-avatar-layer, .igs-dialogue-layer, .igs-hud-layer, .igs-choice-layer, .igs-system-layer { position: absolute; inset: 0; }',
    '.igs-dialogue-layer { left: 0; right: 0; bottom: 0; width: 100%; min-height: 96px; padding: 24px; }',
    '.igs-toolbar { display: flex; gap: 8px; padding: 6px; border-radius: 8px; }',
    '',
].join('\n');

const manifest = {
    name: 'Immersive Galgame System',
    version: packageJson.version,
    entry: 'igs.bundle.js',
    style: 'igs.bundle.css',
};

const fontSourceDir = path.join(srcRoot, 'visual', 'igs-ui', 'assets', 'fonts');
const fontTargetDir = path.join(distRoot, 'fonts');
const fontLicenseFiles = [
    'OFL.txt', 'SourceHanSerifCN-LICENSE.txt', 'SourceHanSansCN-LICENSE.txt',
    'Cormorant-OFL.txt', 'Cormorant-OFL-FAQ.txt', 'LXGW-OFL.txt', 'Yozai-OFL.txt',
    'HuiwenMincho-CC0.txt', 'TsangerYuYangT-MIT.txt', 'SmileySans-OFL.txt',
    'Cinzel-OFL.txt', 'ZCOOLKuaiLe-OFL.txt', 'GreatVibes-OFL.txt', 'PinyonScript-OFL.txt',
    'Quicksand-OFL.txt', 'Caveat-OFL.txt', 'IMFellEnglish-OFL.txt',
];
fs.mkdirSync(fontTargetDir, { recursive: true });
for (const weight of roundedFontWeights) {
    const name = `nowar-rounded-bliz-${weight}.ttf`;
    const source = path.join(fontSourceDir, name);
    if (!fs.existsSync(source) || fs.readFileSync(source).subarray(0, 4).toString('hex') !== '00010000') {
        throw new Error(`Bundled font is missing or invalid: ${source}`);
    }
    publishFont(source, name);
}
for (const asset of dialogFontAssets) {
    const source = path.join(fontSourceDir, asset.file);
    if (!fs.existsSync(source)) throw new Error(`Bundled dialog font is missing: ${source}`);
    const signature = fs.readFileSync(source).subarray(0, 4).toString('ascii');
    if (!['OTTO', 'wOF2', '\0\x01\0\0'].includes(signature)) throw new Error(`Bundled dialog font is invalid: ${source}`);
    publishFont(source, asset.file);
}
for (const asset of classicFontAssets) {
    const source = path.join(fontSourceDir, asset.file);
    if (!fs.existsSync(source)) {
        throw new Error(`Bundled classic font is missing or invalid: ${source}`);
    }
    const signature = fs.readFileSync(source).subarray(0, 4).toString('ascii');
    if (!['OTTO', 'wOF2', '\0\x01\0\0'].includes(signature)) throw new Error(`Bundled classic font is missing or invalid: ${source}`);
    publishFont(source, asset.file);
}
for (const licenseName of fontLicenseFiles) {
    const source = path.join(fontSourceDir, licenseName);
    if (!fs.existsSync(source)) throw new Error(`Bundled font license is missing: ${source}`);
    fs.copyFileSync(source, path.join(fontTargetDir, licenseName));
}
// 地图页的既有城市美术随 bundle 一起发布；白天沿用现有 map-demo-day.png。
const mapSourceDir = path.join(appRoot, 'fixtures', 'record-pages', 'assets');
const mapTargetDir = path.join(distRoot, 'maps');
fs.mkdirSync(mapTargetDir, { recursive: true });
for (const variant of ['dawn', 'day', 'dusk', 'night', 'minight']) {
    const sourceName = variant === 'day' ? 'map-demo-day.png' : `map-demo-clean-${variant}.png`;
    const source = path.join(mapSourceDir, sourceName);
    if (!fs.existsSync(source) || fs.readFileSync(source).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        throw new Error(`Bundled map image is missing or invalid: ${source}`);
    }
    fs.copyFileSync(source, path.join(mapTargetDir, sourceName));
}
for (const [file, source] of mapAssets) {
    if (!fs.existsSync(source)) throw new Error(`Bundled map image is missing: ${source}`);
    fs.copyFileSync(source, path.join(mapTargetDir, file));
}
// 默认背景素材包：只复制 bundle 实际引用的 webp，并校验文件签名与 jsDelivr 单文件上限。
const backgroundTargetDir = path.join(distRoot, 'backgrounds');
fs.rmSync(backgroundTargetDir, { recursive: true, force: true });
fs.mkdirSync(backgroundTargetDir, { recursive: true });
for (const file of backgroundAssets) {
    const source = path.join(backgroundSourceDir, file);
    if (!fs.existsSync(source)) throw new Error(`Default background image is missing: ${source}`);
    const head = fs.readFileSync(source).subarray(0, 12);
    if (head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WEBP') throw new Error(`Default background image is not webp: ${source}`);
    if (fs.statSync(source).size > JSDELIVR_FILE_LIMIT_BYTES) throw new Error(`Default background image exceeds the jsDelivr file limit: ${source}`);
    fs.copyFileSync(source, path.join(backgroundTargetDir, file));
}
// 默认曲目：只复制 bundle 实际引用的音频，并校验文件签名（mp3 带 ID3 头或帧同步、ogg 为 OggS）与 jsDelivr 单文件上限。
const bgmTargetDir = path.join(distRoot, 'bgm');
fs.rmSync(bgmTargetDir, { recursive: true, force: true });
fs.mkdirSync(bgmTargetDir, { recursive: true });
for (const file of bgmAssets) {
    const source = path.join(bgmSourceDir, file);
    if (!fs.existsSync(source)) throw new Error(`Default BGM track is missing: ${source}`);
    const head = fs.readFileSync(source).subarray(0, 4);
    const valid = file.endsWith('.ogg')
        ? head.toString('latin1') === 'OggS'
        : head.toString('latin1', 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    if (!valid) throw new Error(`Default BGM track is not a valid audio file: ${source}`);
    if (fs.statSync(source).size > JSDELIVR_FILE_LIMIT_BYTES) throw new Error(`Default BGM track exceeds the jsDelivr file limit: ${source}`);
    fs.copyFileSync(source, path.join(bgmTargetDir, file));
}
fs.copyFileSync(path.join(bgmSourceDir, 'CREDITS.md'), path.join(bgmTargetDir, 'CREDITS.md'));
// 语气音：只复制 bundle 实际引用的 mp3，校验签名与 jsDelivr 单文件上限。
const voiceTargetDir = path.join(distRoot, 'voice');
fs.rmSync(voiceTargetDir, { recursive: true, force: true });
fs.mkdirSync(voiceTargetDir, { recursive: true });
for (const file of voiceAssets) {
    const source = path.join(voiceSourceDir, file);
    if (!fs.existsSync(source)) throw new Error(`Voice bark clip is missing: ${source}`);
    const head = fs.readFileSync(source).subarray(0, 4);
    if (!(head.toString('latin1', 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0))) throw new Error(`Voice bark clip is not a valid mp3: ${source}`);
    if (fs.statSync(source).size > JSDELIVR_FILE_LIMIT_BYTES) throw new Error(`Voice bark clip exceeds the jsDelivr file limit: ${source}`);
    fs.copyFileSync(source, path.join(voiceTargetDir, file));
}
fs.copyFileSync(path.join(voiceSourceDir, 'CREDITS.md'), path.join(voiceTargetDir, 'CREDITS.md'));
fs.writeFileSync(path.join(distRoot, 'igs.bundle.debug.js'), bundle, 'utf8');
fs.writeFileSync(path.join(distRoot, 'igs.bundle.js'), await minifyBundle(bundle), 'utf8');
fs.writeFileSync(path.join(distRoot, 'igs.bundle.css'), css, 'utf8');
fs.writeFileSync(path.join(distRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
if (bundle.includes('__IGS_TYPEWRITER_AUDIO__')) {
    throw new Error('Build output contains unresolved asset placeholders.');
}
verifySkinAssets(bundle, distRoot);

for (const name of ['igs.bundle.js', 'igs.bundle.debug.js', 'igs.bundle.css', 'manifest.json']) {
    const file = path.join(distRoot, name);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
        throw new Error(`Build output is missing or empty: ${name}`);
    }
}

const builtBundle = fs.readFileSync(path.join(distRoot, 'igs.bundle.js'), 'utf8');
if (/^\s*import\s/m.test(builtBundle) || builtBundle.includes("from '../src/index.js'")) {
    throw new Error('Build output must be self-contained and must not import app/src modules at runtime.');
}

console.log('gate:build ok');

function buildModuleGraph(rootFile) {
    const modules = new Map();
    visit(rootFile);
    return modules;

    function visit(file) {
        const absolute = path.resolve(file);
        const id = moduleId(absolute);
        if (modules.has(id)) return;
        const source = fs.readFileSync(absolute, 'utf8').replace(/\r\n?/g, '\n');
        const dependencies = extractDependencies(source).map((request) => resolveLocalModule(absolute, request));
        modules.set(id, { id, file: absolute, source, dependencies });
        for (const dependency of dependencies) {
            visit(dependency.file);
        }
    }
}

function renderBundle(graph, entryId) {
    const transformed = [];
    let entryExports = [];
    for (const module of graph.values()) {
        const result = transformModule(module);
        if (module.id === entryId) entryExports = result.exportNames;
        transformed.push([
            `__igsRegister(${JSON.stringify(module.id)}, function(module, exports, require) {`,
            result.code,
            '});',
        ].join('\n'));
    }

    const exportNames = Array.from(new Set(entryExports)).filter((name) => name !== 'default').sort();
    const publicConstants = exportNames
        .map((name) => `const ${name} = __igsEntry[${JSON.stringify(name)}];`)
        .join('\n');
    const publicExport = exportNames.length ? `export { ${exportNames.join(', ')} };\n` : '';

    return [
        '// Generated by app/scripts/build.js. Do not edit this file directly.',
        `// IGS version: ${packageJson.version}`,
        'const __igsModules = new Map();',
        'const __igsCache = new Map();',
        'function __igsRegister(id, factory) { __igsModules.set(id, factory); }',
        'function __igsDefine(target, name, getter) { Object.defineProperty(target, name, { enumerable: true, get: getter }); }',
        'function __igsReExport(target, source, pairs) { for (const pair of pairs) __igsDefine(target, pair[1], () => source[pair[0]]); }',
        'function __igsRequire(id) {',
        '    if (__igsCache.has(id)) return __igsCache.get(id).exports;',
        '    const factory = __igsModules.get(id);',
        '    if (!factory) throw new Error(`IGS module not found: ${id}`);',
        '    const module = { exports: {} };',
        '    __igsCache.set(id, module);',
        '    factory(module, module.exports, __igsRequire);',
        '    return module.exports;',
        '}',
        ...transformed,
        `const __igsEntry = __igsRequire(${JSON.stringify(entryId)});`,
        publicConstants,
        'const __igsGlobalObject = globalThis.window || globalThis;',
        'if (__igsGlobalObject && __igsGlobalObject.IGS_AUTO_BOOTSTRAP !== false && !__igsGlobalObject.IGS && typeof bootstrapIGS === "function") {',
        '    bootstrapIGS({ global: __igsGlobalObject });',
        '}',
        publicExport + 'export default __igsEntry;',
        '',
    ].join('\n');
}

function publishFont(source, name) {
    const truncated = findTruncatedFontTables(fs.readFileSync(source));
    if (truncated.length) throw new Error(`Bundled font is truncated (${truncated.join(', ')}); re-download it: ${source}`);
    const sliced = slicedFonts.get(name);
    if (!sliced) {
        if (fs.statSync(source).size >= SPLIT_FONT_MIN_BYTES) throw new Error(`Bundled font must be sliced; run \`npm run build:fonts ${name}\`: ${source}`);
        fs.copyFileSync(source, path.join(fontTargetDir, name));
        return;
    }
    if (contentHash(fs.readFileSync(source), 64) !== sliced.manifest.sourceSha256) throw new Error(`Font slices are stale; run \`npm run build:fonts ${name}\`.`);
    const sliceDir = path.join(fontTargetDir, fontSliceName(name));
    for (const slice of sliced.manifest.slices) {
        if (!fs.existsSync(path.join(sliceDir, slice.file))) throw new Error(`Font slice is missing; run \`npm run build:fonts ${name}\`: ${slice.file}`);
    }
    fs.writeFileSync(path.join(sliceDir, 'font.css'), sliced.css, 'utf8');
    fs.rmSync(path.join(fontTargetDir, name), { force: true });
}

async function minifyBundle(source) {
    let esbuild;
    try {
        esbuild = await import('esbuild');
    } catch (error) {
        throw new Error('Build needs the esbuild dev dependency; run `pnpm install` in app/ first.');
    }
    const result = await esbuild.transform(source, { minify: true, format: 'esm', legalComments: 'none', charset: 'utf8' });
    const header = source.split('\n').slice(0, 2).join('\n');
    return `${header}\n${result.code}`;
}

function inlineTypewriterAudio(bundle) {
    const names = ['dududu.ogg', 'keyboard.ogg'];
    let result = bundle;
    for (const name of names) {
        const placeholder = `__IGS_TYPEWRITER_AUDIO__${name}__`;
        if (!result.includes(placeholder)) throw new Error(`Typewriter audio placeholder is missing: ${name}`);
        const file = path.join(srcRoot, 'visual', 'igs-ui', 'assets', 'audio', `typewriter-${name}`);
        if (!fs.existsSync(file)) throw new Error(`Typewriter audio asset is missing: ${file}`);
        const bytes = fs.readFileSync(file);
        if (bytes.length < 60 || bytes.subarray(0, 4).toString('ascii') !== 'OggS') {
            throw new Error(`Typewriter audio asset is invalid: ${file}`);
        }
        result = result.replaceAll(placeholder, `data:audio/ogg;base64,${bytes.toString('base64')}`);
    }
    return result;
}

function transformModule(module) {
    const exportNames = [];
    const localExportNames = [];
    let importCounter = 0;
    let code = module.source;

    code = code.replace(/^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];\s*$/gm, (_match, clause, request) => {
        const resolved = resolveLocalModule(module.file, request);
        return renderImportClause(clause, resolved.id);
    });

    code = code.replace(/^\s*export\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];\s*$/gm, (_match, specifierText, request) => {
        const resolved = resolveLocalModule(module.file, request);
        const pairs = parseSpecifierPairs(specifierText);
        for (const pair of pairs) exportNames.push(pair.exported);
        importCounter += 1;
        return `const __igsReExportSource${importCounter} = require(${JSON.stringify(resolved.id)});\n__igsReExport(exports, __igsReExportSource${importCounter}, ${JSON.stringify(pairs.map((pair) => [pair.imported, pair.exported]))});`;
    });

    code = code.replace(/^\s*export\s+(async\s+function|function|class)\s+([A-Za-z_$][\w$]*)/gm, (_match, kind, name) => {
        exportNames.push(name);
        localExportNames.push(name);
        return `${kind} ${name}`;
    });

    code = code.replace(/^\s*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_match, kind, name) => {
        exportNames.push(name);
        localExportNames.push(name);
        return `${kind} ${name}`;
    });

    code = code.replace(/^\s*export\s+\{([\s\S]*?)\};\s*$/gm, (_match, specifierText) => {
        const pairs = parseSpecifierPairs(specifierText);
        for (const pair of pairs) exportNames.push(pair.exported);
        return pairs.map((pair) => `__igsDefine(exports, ${JSON.stringify(pair.exported)}, () => ${pair.imported});`).join('\n');
    });

    const localExports = Array.from(new Set(localExportNames));
    if (localExports.length) {
        code += `\n${localExports.map((name) => `__igsDefine(exports, ${JSON.stringify(name)}, () => ${name});`).join('\n')}`;
    }

    if (/^\s*(import|export)\s/m.test(code)) {
        throw new Error(`Unsupported module syntax remains in ${path.relative(appRoot, module.file)}`);
    }

    return { code, exportNames: Array.from(new Set(exportNames)) };
}

function renderImportClause(clause, targetId) {
    const normalized = String(clause || '').trim();
    if (!normalized) return `require(${JSON.stringify(targetId)});`;
    if (normalized.startsWith('{')) {
        return `const { ${renderDestructuring(parseSpecifierPairs(normalized.slice(1, -1)))} } = require(${JSON.stringify(targetId)});`;
    }
    if (normalized.startsWith('* as ')) {
        const name = normalized.slice(5).trim();
        return `const ${name} = require(${JSON.stringify(targetId)});`;
    }
    const commaIndex = normalized.indexOf(',');
    if (commaIndex >= 0) {
        const defaultName = normalized.slice(0, commaIndex).trim();
        const namedClause = normalized.slice(commaIndex + 1).trim();
        const lines = [`const ${defaultName} = require(${JSON.stringify(targetId)}).default;`];
        if (namedClause.startsWith('{')) {
            lines.push(`const { ${renderDestructuring(parseSpecifierPairs(namedClause.slice(1, -1)))} } = require(${JSON.stringify(targetId)});`);
        }
        return lines.join('\n');
    }
    return `const ${normalized} = require(${JSON.stringify(targetId)}).default;`;
}

function renderDestructuring(pairs) {
    return pairs.map((pair) => pair.imported === pair.exported ? pair.imported : `${pair.imported}: ${pair.exported}`).join(', ');
}

function parseSpecifierPairs(text) {
    return String(text || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const pieces = part.split(/\s+as\s+/);
            const imported = pieces[0].trim();
            const exported = (pieces[1] || pieces[0]).trim();
            return { imported, exported };
        });
}

function extractDependencies(source) {
    const dependencies = [];
    collect(/^\s*import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"];\s*$/gm);
    collect(/^\s*export\s+\{[\s\S]*?\}\s+from\s+['"]([^'"]+)['"];\s*$/gm);
    return dependencies;

    function collect(regex) {
        let match = regex.exec(source);
        while (match) {
            dependencies.push(match[1]);
            match = regex.exec(source);
        }
    }
}

function resolveLocalModule(fromFile, request) {
    if (!request.startsWith('.')) {
        throw new Error(`Build does not support external dependency ${request} in ${path.relative(appRoot, fromFile)}`);
    }
    const resolved = path.resolve(path.dirname(fromFile), request);
    if (!resolved.startsWith(srcRoot)) {
        throw new Error(`Build dependency escapes src/: ${request} in ${path.relative(appRoot, fromFile)}`);
    }
    return { file: resolved, id: moduleId(resolved) };
}

function moduleId(file) {
    return path.relative(appRoot, file).replace(/\\/g, '/');
}
