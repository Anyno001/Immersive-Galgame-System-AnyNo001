// 从素材清单生成表情包运行时数据（src/stickers/data/daimao.js、nga.js）。
// 用法：node scripts/build-sticker-data.mjs [素材根目录]；素材根目录默认是仓库上两级的 gal/。
// 呆猫八条读 表情包-呆猫八条/成品/stickers-daimao.json；AC娘读 表情包-NGA-AC娘/表情索引.csv（只收「适合当表情」为「是」的）。
// 运行时只保留挑图和描述匹配要用的字段：file、desc、emotions、persona，以及 text（图上文字）、tags；AC娘另有 w、h。
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const galRoot = path.resolve(process.argv[2] || path.join(appRoot, '..', '..'));
const outDir = path.join(appRoot, 'src', 'stickers', 'data');

// 情绪名 → id：与 sticker-catalog.js 保持一致，只在这里读一份名字。
const catalogSource = fs.readFileSync(path.join(appRoot, 'src', 'stickers', 'sticker-catalog.js'), 'utf8');
const NAME_TO_ID = new Map([...catalogSource.matchAll(/^ {4}entry\('(\w+)',\s*'([^']+)'/gm)].map((m) => [m[2], m[1]]));
if (NAME_TO_ID.size !== 24) throw new Error(`Sticker catalog should have 24 emotions, found ${NAME_TO_ID.size}`);
const IDS = new Set(NAME_TO_ID.values());

function pack(item) {
    const out = {};
    for (const [k, v] of Object.entries(item)) {
        if (Array.isArray(v) ? v.length : v !== '' && v != null) out[k] = v;
    }
    return out;
}

function writeModule(file, exportName, note, items) {
    const body = items.map((it) => `    ${JSON.stringify(pack(it))},`).join('\n');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, file), `// ${note}\n// 由 scripts/build-sticker-data.mjs 生成，不要手改。\nexport const ${exportName} = Object.freeze([\n${body}\n]);\n`);
    console.log(file, items.length);
}

// 呆猫八条
{
    const json = JSON.parse(fs.readFileSync(path.join(galRoot, '表情包-呆猫八条', '成品', 'stickers-daimao.json'), 'utf8'));
    const items = json.items.map((it) => {
        for (const e of it.emotions || []) if (!IDS.has(e)) throw new Error(`Unknown emotion id ${e} in ${it.file}`);
        return {
            file: it.file,
            desc: String(it.desc || '').trim(),
            text: String(it.text || '').trim(),
            tags: Array.isArray(it.tags) ? it.tags : [],
            emotions: it.emotions || [],
            persona: it.persona || [],
        };
    });
    writeModule('daimao.js', 'DAIMAO_ITEMS', '呆猫八条：一图多情绪，emotions 为空的归「未分类」（只能被描述匹配挑到）。', items);
}

// NGA AC娘
function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i += 1;
            row.push(cell); cell = '';
            if (row.some((x) => x !== '')) rows.push(row);
            row = [];
        } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

{
    const csv = fs.readFileSync(path.join(galRoot, '表情包-NGA-AC娘', '表情索引.csv'), 'utf8').replace(/^﻿/, '');
    const [head, ...rows] = parseCsv(csv);
    const col = (name) => head.indexOf(name);
    const [cFile, cDesc, cEmo, cW, cH, cOk] = ['文件', '画面描述', '情绪', '宽', '高', '适合当表情'].map(col);
    if ([cFile, cDesc, cEmo, cW, cH, cOk].some((i) => i < 0)) throw new Error('NGA csv header mismatch');
    const items = [];
    for (const r of rows) {
        if (r[cOk] !== '是') continue;
        const emotions = r[cEmo].split(/\s+/).filter(Boolean).map((name) => {
            const id = NAME_TO_ID.get(name);
            if (!id) throw new Error(`Unknown emotion name ${name} in ${r[cFile]}`);
            return id;
        });
        items.push({ file: r[cFile], desc: r[cDesc].trim(), emotions, w: Number(r[cW]), h: Number(r[cH]) });
    }
    writeModule('nga.js', 'NGA_ITEMS', 'NGA AC娘：透明底小图，行内显示；情绪为空的归「未分类」。', items);
}
