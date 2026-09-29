import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const projectRoot = path.resolve(appRoot, '..');
const sourceRoots = ['src', 'scripts', 'tests'].map((name) => path.join(appRoot, name));
sourceRoots.push(path.join(projectRoot, 'loader'));
const jsonRoots = ['fixtures', 'src', 'docs', 'dist', 'scripts', 'tests'].map((name) => path.join(appRoot, name));
jsonRoots.push(path.join(projectRoot, 'loader'));
const topLevelJson = fs.readdirSync(appRoot).filter((name) => name.endsWith('.json')).map((name) => path.join(appRoot, name));

await checkSyntax(findFiles(sourceRoots, '.js'));

for (const file of [...findFiles(jsonRoots, '.json'), ...topLevelJson]) {
    JSON.parse(fs.readFileSync(file, 'utf8'));
}

for (const file of findFiles([path.join(appRoot, 'fixtures')], '.json')) {
    const text = fs.readFileSync(file, 'utf8');
    if (/sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|real[_-]?api[_-]?key/i.test(text)) {
        throw new Error(`Fixture may contain a real secret: ${file}`);
    }
}

console.log('gate:static ok');

async function checkSyntax(files) {
    const queue = [...files];
    const failures = [];
    const concurrency = Math.min(os.availableParallelism(), 8);
    const worker = async () => {
        while (queue.length > 0) {
            const file = queue.shift();
            const result = await runNodeCheck(file);
            if (result.status !== 0) failures.push(`JS parse failed: ${file}\n${result.output}`);
        }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (failures.length > 0) throw new Error(failures.join('\n'));
}

function runNodeCheck(file) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['--check', file], { cwd: appRoot });
        let output = '';
        child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
        child.on('error', (error) => resolve({ status: 1, output: String(error) }));
        child.on('close', (status) => resolve({ status, output }));
    });
}

function findFiles(roots, extension) {
    const output = [];
    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        visit(root, output, extension);
    }
    return output;
}

function visit(target, output, extension) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
        for (const name of fs.readdirSync(target)) {
            visit(path.join(target, name), output, extension);
        }
        return;
    }
    if (target.endsWith(extension)) output.push(target);
}
