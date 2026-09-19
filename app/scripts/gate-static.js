import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const projectRoot = path.resolve(appRoot, '..');
const sourceRoots = ['src', 'scripts', 'tests'].map((name) => path.join(appRoot, name));
sourceRoots.push(path.join(projectRoot, 'loader'));
const jsonRoots = ['fixtures', 'src', '.'].map((name) => path.join(appRoot, name));
jsonRoots.push(path.join(projectRoot, 'loader'));

for (const file of findFiles(sourceRoots, '.js')) {
    const result = spawnSync(process.execPath, ['--check', file], {
        cwd: appRoot,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`JS parse failed: ${file}\n${result.stderr || result.stdout}`);
    }
}

for (const file of findFiles(jsonRoots, '.json')) {
    JSON.parse(fs.readFileSync(file, 'utf8'));
}

for (const file of findFiles([path.join(appRoot, 'fixtures')], '.json')) {
    const text = fs.readFileSync(file, 'utf8');
    if (/sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|real[_-]?api[_-]?key/i.test(text)) {
        throw new Error(`Fixture may contain a real secret: ${file}`);
    }
}

console.log('gate:static ok');

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
