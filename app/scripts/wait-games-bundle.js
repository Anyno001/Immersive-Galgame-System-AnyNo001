import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';

export function verifyWaitGamesBundle(program) {
    const required = ['翻牌配对', '立直麻将', '消消乐', '贪吃蛇', '飞行棋'];
    if (required.some(text => !program.includes(text))) throw new Error('主体缺少内置等待小游戏。');
    if (!program.includes('Satoshi Kobayashi') || !program.includes('MIT')) {
        throw new Error('主体缺少電脳麻将的许可声明。');
    }
    if (['成都麻将', '成都幼麟科技有限公司', '允许第三方把包含它的作品作为整体免费使用'].some(text => !program.includes(text))) {
        throw new Error('主体缺少成都麻将或幼麟许可声明。');
    }
}

export async function bundleWaitStageGames(appRoot) {
    const check = spawnSync(process.execPath, [path.join(appRoot, 'scripts/gen-scmj-vendor.mjs'), '--check'], {
        cwd: appRoot, encoding: 'utf8', timeout: 30000,
    });
    if (check.error || check.status !== 0) throw new Error(check.error?.message || check.stderr || check.stdout || '幼麟原文件与工厂不一致');
    const id = 'visual/igs-ui/wait-stage-games.js';
    const file = path.join(appRoot, 'src', id);
    const result = await build({
        entryPoints: [file], bundle: true, format: 'cjs', platform: 'browser',
        minify: true, charset: 'utf8', legalComments: 'eof', write: false, target: 'es2022', metafile: true,
    });
    const source = result.outputFiles[0].text;
    const inputs = Object.keys(result.metafile.inputs).map(input => input.replaceAll('\\', '/'));
    if (inputs.some(input => /\/(?:wait-stage-games-api|wait-stage-runtime)\.js$/.test(input) || /\/core\/bootstrap\.js$/.test(input))) {
        throw new Error('小游戏子树不得包含主体生命周期或登记表。');
    }
    verifyWaitGamesBundle(source);
    const sandbox = { console, module: { exports: {} } };
    vm.runInNewContext(source, sandbox, { timeout: 1000 });
    const pack = sandbox.module.exports.createWaitStageGamePack?.();
    if (!pack || pack.id !== 'igs-wait-games' || pack.list({ art: {}, replay: [], names: [] }).join(',') !== 'rps,mahjong,tiles,snake,ludo') {
        throw new Error('内置等待小游戏包不符合登记契约。');
    }
    return { id, file, source, dependencies: [], prebundled: true };
}
