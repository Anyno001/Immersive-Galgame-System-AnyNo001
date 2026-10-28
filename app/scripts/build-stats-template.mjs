// 生成 IGS 数值系统适配版 shujuku 模板（§8C）。只读基准模板，不改原件。
// 用法（在 app/ 下）：node scripts/build-stats-template.mjs [基准模板路径]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATS_TEMPLATE_FILE, adaptStatsTemplate } from '../src/data/shujuku/stats-template-adapt.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.argv[2] || path.join(here, '../../../参考文件/TavernDB_template_恋爱Gal_一键开关(1).json'));
const outDir = path.resolve(here, '../../docs/templates');
const target = path.join(outDir, STATS_TEMPLATE_FILE);

if (!fs.existsSync(source)) {
    console.error(`基准模板不存在：${source}`);
    process.exit(1);
}
const adapted = adaptStatsTemplate(JSON.parse(fs.readFileSync(source, 'utf8')));
fs.mkdirSync(outDir, { recursive: true });
const text = JSON.stringify(adapted);
fs.writeFileSync(target, text, 'utf8');
console.log(`wrote ${path.relative(process.cwd(), target)} bytes=${Buffer.byteLength(text)}`);
