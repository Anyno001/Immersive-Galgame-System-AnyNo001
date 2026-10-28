// 生成「发送内容黄金样本」：内置默认预设 x 每个任务 x 每个场合，经装配器得到的 messages。
// 依据当前（未被 UI 改动的）presets/prompt-preset-renderer.js 与 generated-images/image-prompt-defaults.js、prompt-tasks/*。
// 提示词文字变化后需有意重新生成：在 app 目录运行  node scripts/gen-image-prompt-golden.mjs
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderImagePromptPreset } from '../src/presets/prompt-preset-renderer.js';
import { IMAGE_PROMPT_TASKS } from '../src/presets/prompt-preset.js';
import { createDefaultImagePromptPreset } from '../src/generated-images/image-prompt-defaults.js';
import { buildPreviewInput } from '../src/visual/igs-ui/settings-image-prompt-editor.js';

const data = createDefaultImagePromptPreset().data;
const messages = {};
for (const task of IMAGE_PROMPT_TASKS) {
    const module = data.modules.find(m => m.identifier === data.taskMap[task]);
    const formats = module.contentByFormat ? Object.keys(module.contentByFormat) : ['sprite-data'];
    for (const format of formats) {
        const result = renderImagePromptPreset(data, task, buildPreviewInput(data, task, format));
        if (!result.ok) throw new Error(`${task}/${format} ${JSON.stringify(result)}`);
        messages[`${task}/${format}`] = result.request.messages;
    }
}
const dir = fileURLToPath(new URL('../src/generated-images/', import.meta.url));
const files = ['image-prompt-defaults.js', ...readdirSync(dir + 'prompt-tasks').map(name => 'prompt-tasks/' + name)].sort();
const sha = createHash('sha1');
for (const file of files) sha.update(file).update(readFileSync(dir + file));
let head = '';
try { head = execSync('git rev-parse --short HEAD', { cwd: dir }).toString().trim(); } catch { /* 无 git 时留空 */ }
const out = fileURLToPath(new URL('../tests/fixtures/image-prompt-default-messages.json', import.meta.url));
mkdirSync(new URL('../tests/fixtures/', import.meta.url), { recursive: true });
writeFileSync(out, JSON.stringify({ meta: { generatedAt: new Date().toISOString(), gitHead: head, promptSourceSha1: sha.digest('hex'), cases: Object.keys(messages).length }, messages }, null, 1) + '\n', 'utf8');
console.log('已生成', out, Object.keys(messages).length, '个用例');
