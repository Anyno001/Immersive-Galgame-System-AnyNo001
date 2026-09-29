import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { contentHash, fontSliceManifestPath, fontSliceName, parseSliceCss, rebrotliWoff2, SPLIT_FONT_MIN_BYTES } from './font-slices.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const fontSourceDir = path.join(appRoot, 'src', 'visual', 'igs-ui', 'assets', 'fonts');
const manifestDir = path.join(appRoot, 'src', 'visual', 'igs-ui', 'assets', 'font-slices');
const fontTargetDir = path.join(appRoot, 'dist', 'fonts');

const args = process.argv.slice(2);
if (args[0] === '--one') {
    await splitOne(args[1]);
    // 原生层在进程退出析构时偶发段错误，结果已落盘后直接退出。
    process.exit(0);
} else {
    const targets = args.length ? args : fs.readdirSync(fontSourceDir)
        .filter((file) => /\.(ttf|otf)$/i.test(file) && fs.statSync(path.join(fontSourceDir, file)).size >= SPLIT_FONT_MIN_BYTES);
    const failed = [];
    for (const file of targets) {
        // cn-font-split 的原生层遇到损坏字体会直接段错误，逐个放进子进程以免拖垮整批。
        const result = spawnSync(process.execPath, [import.meta.filename, '--one', file], { stdio: 'inherit' });
        if (result.status !== 0) failed.push(file);
    }
    if (failed.length) {
        console.error(`Font split failed: ${failed.join(', ')}`);
        process.exit(1);
    }
}

async function splitOne(file) {
    let fontSplit;
    try {
        ({ fontSplit } = await import('cn-font-split'));
    } catch (error) {
        throw new Error('Font splitting needs the cn-font-split dev dependency; run `pnpm install` in app/ first.');
    }
    const source = path.join(fontSourceDir, file);
    const input = fs.readFileSync(source);
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'igs-font-split-'));
    try {
        await fontSplit({
            input: new Uint8Array(input),
            outDir: workDir,
            css: { fontFamily: fontSliceName(file) },
            renameOutputFont: '[index].[ext]',
            testHtml: false,
            reporter: false,
            silent: true,
        });
        const name = fontSliceName(file);
        const targetDir = path.join(fontTargetDir, name);
        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.mkdirSync(targetDir, { recursive: true });
        const slices = parseSliceCss(fs.readFileSync(path.join(workDir, 'result.css'), 'utf8')).map(({ file: sliceFile, unicodeRange }) => {
            const bytes = rebrotliWoff2(fs.readFileSync(path.join(workDir, sliceFile)));
            const hashed = `${contentHash(bytes)}.woff2`;
            fs.writeFileSync(path.join(targetDir, hashed), bytes);
            return { file: hashed, bytes: bytes.length, unicodeRange };
        });
        if (!slices.length) throw new Error(`No slices produced for ${file}`);
        fs.mkdirSync(manifestDir, { recursive: true });
        const manifest = { source: file, sourceBytes: input.length, sourceSha256: contentHash(input, 64), slices };
        fs.writeFileSync(fontSliceManifestPath(manifestDir, file), `${JSON.stringify(manifest, null, 1)}\n`, 'utf8');
        const total = slices.reduce((sum, slice) => sum + slice.bytes, 0);
        const largest = Math.max(...slices.map((slice) => slice.bytes));
        console.log(`${file}: ${(input.length / 1048576).toFixed(2)}MB -> ${slices.length} slices ${(total / 1048576).toFixed(2)}MB, largest ${(largest / 1024).toFixed(0)}KB`);
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}
