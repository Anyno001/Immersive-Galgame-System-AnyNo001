import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';

const appRoot = path.resolve(import.meta.dirname, '..');
const projectRoot = path.resolve(appRoot, '..');
const loaderRoot = path.join(projectRoot, 'loader');
const version = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version;

const result = await build({
    entryPoints: [path.join(appRoot, 'src/plugins/wait-stage-games-entry.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    charset: 'utf8',
    legalComments: 'eof',
    write: false,
    target: 'es2022',
});
const program = result.outputFiles[0].text;
if (program.includes('bootstrapIGS') || program.includes('wait-stage-runtime')) {
    throw new Error('等待小游戏脚本带进了 Gal 前端主体。');
}
if (!program.includes('翻牌配对') || !program.includes('立直麻将') || !program.includes('消消乐') || !program.includes('贪吃蛇') || !program.includes('__IGS_WAIT_GAME_PACK__')) {
    throw new Error('等待小游戏脚本缺少玩法或安装标记。');
}
if (!program.includes('Satoshi Kobayashi') || !program.includes('MIT')) {
    throw new Error('等待小游戏脚本缺少電脳麻将的许可声明。');
}

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {};
sandbox.parent = sandbox;
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);
vm.runInContext(program, sandbox, { timeout: 1000 });
const pack = sandbox.__IGS_WAIT_GAME_PACK__;
if (!pack || pack.id !== 'igs-wait-games' || pack.list({ art: {}, replay: [], names: [] }).join(',') !== 'rps,mahjong,tiles,snake') {
    throw new Error('等待小游戏脚本没有登记到宿主窗口。');
}

const content = `// IGS 等待小游戏 v${version}。和 Gal 前端分开导入；启用后，等回复时才会出现小游戏。\n${program}`;
const jsPath = path.join(loaderRoot, 'igs-wait-games.js');
const jsonPath = path.join(loaderRoot, `等待小游戏 v${version}.json`);
fs.writeFileSync(jsPath, content, 'utf8');
const json = {
    type: 'script',
    enabled: false,
    name: `沉浸式Galgame系统 · 等待小游戏 v${version}`,
    id: 'igs-wait-games',
    content,
    info: [
        `等待过场小游戏 v${version}：猜拳、立直麻将、消消乐、贪吃蛇、这句是谁说的、翻牌配对、心情猜猜。`,
        '立直麻将使用電脳麻将（@kobalab/majiang-core、@kobalab/majiang-ai，MIT）的规则、算点和电脑。开局从卡里的立绘里选三位对手。牌局存在本地，离开后下次等待可以接着打。东风战，赤宝牌，一家和。',
        '这是独立脚本，不包含 Gal 前端。请先导入并启用沉浸式 Galgame 系统，再启用本脚本。',
        '没启用本脚本时，等待层只轮换台词，不会加载小游戏。',
    ].join('\n'),
    data: {},
};
fs.writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
const verify = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
if (verify.content !== content) throw new Error('等待小游戏 JSON 与脚本不一致。');
console.log(`wait-games ok ${path.relative(projectRoot, jsonPath)}`);
