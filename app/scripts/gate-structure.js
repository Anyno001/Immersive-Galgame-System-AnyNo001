import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const projectRoot = path.resolve(appRoot, '..');
const forbidden = [
    path.join(projectRoot, 'project.json'),
    path.join(projectRoot, 'latest'),
    path.join(projectRoot, 'archive'),
    path.join(projectRoot, 'tavern helper'),
];
const required = [
    path.join(appRoot, 'package.json'),
    path.join(appRoot, 'src', 'index.js'),
    path.join(appRoot, 'src', 'core', 'bootstrap.js'),
    path.join(appRoot, 'src', 'api', 'public-api.js'),
    path.join(projectRoot, 'AGENTS.md'),
    path.join(projectRoot, 'docs', 'AI_WORKFLOW.md'),
    path.join(projectRoot, 'docs', 'PACKAGING_WORKFLOW.md'),
    path.join(projectRoot, 'loader', 'igs-loader.js'),
    path.join(projectRoot, 'loader', 'igs-loader.json'),
];

for (const target of forbidden) {
    assert(!fs.existsSync(target), `Forbidden toolbox shell path exists: ${target}`);
}

for (const target of required) {
    assert(fs.existsSync(target), `Required path is missing: ${target}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const scriptsText = JSON.stringify(packageJson.scripts || {});
for (const command of ['pack-project', 'verify-project', 'check-refs']) {
    assert(!scriptsText.includes(command), `Gate scripts must not call toolbox command: ${command}`);
}

console.log('gate:structure ok');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
