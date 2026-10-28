// 演出版面截图（零依赖）：本机 Chrome 无头 + CDP，把每个演出 kind 停在“停留”阶段截两张（16:9 与竖屏）。
// 用法：node scripts/fx-shot.mjs [--pack idol,coc,places,daily,campus,...|all] [--kind note,timeskip] [--size 16x9,tall] [--out <目录>] [--at 0.5] [--dialog 150]
//   --pack  包 id（FX_PACKS 的 id）或 daily（非包的日常演出）；默认 all。
//   --sheet 另外按包拼接缩略总览图 <out>/_总览/<包>-<尺寸>-<序号>.png（用于快速浏览，每张 12 格 16:9 / 12 格竖屏）。
//   --at    停留点占整段寿命的比例（默认 0.7）：所有 CSS 动画被暂停在该进度。
//   --dialog 对话框高度 px（默认 150，竖屏取 190），写入 --igs-dialog-h。
// 输出：<out>/<包>/<kind>-<尺寸>.png，默认放在仓库外的同级「演出版面审查截图」目录。
// 背景同理：--bg <图> / IGS_SHOT_BG / fx-shot.local.json 的 bg。
// 立绘：--sprite <png> / 环境变量 IGS_SHOT_SPRITE / 同目录 fx-shot.local.json 的 sprite（已被 .gitignore 的 *.local.json 排除）；都没有就用占位小人。立绘与截图都必须在仓库外。
// 原理：起一个只读静态服务（app 根目录）+ 生成的 /__fxshot.html；页面里真实调用 renderDailyFx，定时器不触发，演出节点留在舞台上。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DAILY_FX_KINDS } from '../src/scene/daily-fx-directives.js';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { FX_PACKS } from '../src/scene/fx-packs.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const outRoot = arg('out', path.resolve(appRoot, '..', '..', '演出版面审查截图'));
const packArg = arg('pack', 'all').split(',').filter(Boolean);
const kindArg = arg('kind', '').split(',').filter(Boolean);
const sizeArg = arg('size', '16x9,tall').split(',');
const at = Number(arg('at', '0.7'));
const dialogArg = arg('dialog', '');
const repoRoot = path.resolve(appRoot, '..');
if (path.resolve(outRoot).toLowerCase().startsWith(repoRoot.toLowerCase())) { console.error('截图目录不能在仓库内：' + outRoot); process.exit(1); }
const localCfgFile = path.join(import.meta.dirname, 'fx-shot.local.json');
const localCfg = fs.existsSync(localCfgFile) ? JSON.parse(fs.readFileSync(localCfgFile, 'utf8')) : {};
const sprite = [arg('sprite', ''), process.env.IGS_SHOT_SPRITE, localCfg.sprite].find((p) => p && fs.existsSync(p)) || '';
const bg = [arg('bg', ''), process.env.IGS_SHOT_BG, localCfg.bg].find((p) => p && fs.existsSync(p)) || '';
if (bg && path.resolve(bg).toLowerCase().startsWith(repoRoot.toLowerCase())) { console.error('试用背景不能放在仓库内：' + bg); process.exit(1); }
if (sprite && path.resolve(sprite).toLowerCase().startsWith(repoRoot.toLowerCase())) { console.error('试用立绘不能放在仓库内：' + sprite); process.exit(1); }
const SIZES = { '16x9': [1280, 720, '1280x720'], tall: [390, 844, '390x844'] };
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('找不到 Chrome / Edge');
const PORT = Number(process.env.IGS_SHOT_PORT) || 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// kind -> 包 id；其余归 daily，校园 / 约会类归 campus 目录由 packOf 决定。
const packOf = new Map();
for (const pack of FX_PACKS) for (const k of pack.kinds) packOf.set(k, pack.id);
// 个别 kind 的示例参数需要更像真实数据（其余用四段通用示例文字）。
const SAMPLE = {
    omikuji: ['大吉', '诸事顺遂'],
    receipt: ['可乐、薯条、汉堡', '¥38', '街角便利店'],
    timeskip: ['三小时后'],
    note: ['记得吃早饭，别空腹喝咖啡'],
    letter: ['小林', '见字如晤。近来天气转凉，务必添衣。期待下次相见。'],
    reveal: ['真相大白', '原来是你'], panel: ['任务', '主线任务', '击败守门人;获得钥匙'], count: ['金额', '0', '5000', '元'], evidence: ['染血的信', '在抽屉里找到'],
    link: ['小林', '小雪', '红线'], crowd: ['哗然', '什么？！'], reunion: ['小雪'], order: ['小林;小雪;阿明'], os: ['他怎么会在这里……'],
    birthday: ['小林', '5'], countdown: ['5', '新年快乐'], xmas: ['圣诞快乐'], redpacket: ['188', '新年快乐'], ring: ['钻戒'], wedding: ['西式', '我愿意'], test: ['阳性'], riverlamp: ['愿平安'],
    guest: ['小林', '22', '摄影师', '温柔;爱笑'], caption: ['粉字', '心动了！'], interview: ['小林', '其实我一直在等他开口。'], observe: ['小林', '好甜;太明显了'], rec: ['机位2'],
    vote: ['小林:3;小雪:2', '匿名投票'], rank: ['小林:88;小雪:76;阿明:60', '心动榜'], pulse: ['128', '小林'], relmap: ['小林>小雪;小雪=阿明'], pair: ['小林+小雪;阿明+小美', '约会配对'],
    exit: ['小林', '行程结束'], finale: ['我选你', '小林'], replay: ['心动瞬间', '小林'],
    hmrank: ['小林', '贵人', '嫔'], hmfavor: ['小林', '80', '55'], hmboard: ['甲:贵妃;乙:嫔;丙:答应'], hmflip: ['小林', '小雪;阿明'], hmselect: ['留牌子', '小林'], hmrecord: ['留', '小林'],
    hmannounce: ['皇上驾到'], hmgreet: ['晨', '甲:贵妃;乙:嫔'], hmreward: ['玉如意;锦缎;东珠', '小林'], hmprobe: ['银针', '有毒', '针尖发黑'], hmpunish: ['禁足', '小林'], hmtray: ['白绫', '小林'],
    hmthread: ['小林', '滑脉'], hmcongrats: ['小林', '恭喜娘娘'], hmglare: ['小林;小雪>阿明'],
    scent: ['小林', '雪松'], scentlink: ['小林', '小雪'], suppress: ['小林', '近身'], soothe: ['小林'], inhibitor: ['注射', '抑制剂'], bond: ['小林', '终身'], gendertest: ['小林', 'Alpha'],
    match: ['小林', '小雪', '87'], nest: ['小林'], detector: ['72', '地铁站'], phase: ['发情期', '3天', '小林'],
    relic: ['小林', '紫金葫芦', '金'], clash: ['乾坤圈', '混天绫'], mythroll: ['小林;小雪;阿明'], formation: ['九宫阵', '展开'], flame: ['小林'], thunder: ['小林'], aura: ['小林', '妖气'],
    rollcall: ['小林', '到'],
    charm: ['小林', '小雪'], drain: ['小林', '小雪'], subdue: ['符咒', '小林'], barrier: ['展开'], core: ['千年内丹'], pact: ['小林', '小雪'],
    peak: ['2', '啊'], counter: ['3', '次'], aftermath: ['床单凌乱'], bedcurtain: ['红烛'], dualcult: ['小林', '小雪', '+12'], favortip: ['小林', '+5', '60'], sigil: ['小林', '2'],
    footfall: ['渐近'], knotafter: ['小雪', '很安静'], conceive: ['140', '第一次听到'],
    mirror: ['小林'], reflect: ['车窗', '小林'], silhouette: ['小林', '逆光'], frame: ['监控', '小林'], warp: ['小林', '故障'], zoom: ['小林', '手'], mark: ['小林', '颈', '吻痕'],
    spirit: ['小林'],
    san: ['45', '-8', 'SAN', '99'], symptom: ['恐惧症', '不敢直视镜子', '中'], clue: ['沾血的钥匙', '在地板下找到'], casebook: ['线索一;线索二;线索三', '新增:1', '线索簿'],
    kp: ['你听见门后有东西在刮擦。', 'KP'], ending: ['团灭', '小林', '被怪物吞没'], dungeon: ['新副本', '击杀守卫;找到出口', '限时30分钟'], portal: ['无人医院', '第二层'],
    rating: ['S', '伤害:92;生存:88', '副本结算'], alive: ['3', '6', '存活'], rules: ['不要回头;勿开灯;勿应答', '篡改:2', '违规:3'], board: ['死者;嫌疑人;凶器', '连线:1-2', '线索板'],
    magnify: ['小林', '手', '指缝里有泥'], accuse: ['小林', '就是你！'], stats: ['小林', 'STR:60;CON:55;DEX:70;APP:45;POW:65;INT:80', '对比:STR:50', '条:HP:12/14;SAN:55'],
    elevator: ['12'], eavesdrop: ['你听到了吗'], concert: ['夜空'], flashes: ['5'], race: ['冲线', '小林', '12.3秒'], chest: ['银色长剑', '史诗'], levelup: ['10', '解锁新技能'],
    quest: ['讨伐史莱姆', '500金币', '接取'], route: ['王都', '森林', '港口'], gust: [],
    onstage: ['夜空', '小林'], fancam: ['小林', '小林 直拍'], lightsea: ['粉色', '小林应援团'], debut: ['小林:1;小雪:2;阿明:3', '出道位'], award: ['一位', '小林', '开信封'],
    fansign: ['小林', '加油！;最喜欢你了'], paparazzi: ['小林', '5'], practice: ['小林', '120'], backstage: ['小林', '3'], banner: ['我们爱你;永远支持', '粉色'],
};
// --samples <json>：{kind:[字段...]} 覆盖示例；--wait <ms>：截图前等待（让靠定时器滚动的数字跑完，默认 60）。
if (arg('samples', '')) Object.assign(SAMPLE, JSON.parse(fs.readFileSync(arg('samples', ''), 'utf8')));
const waitMs = Number(arg('wait', '60')) || 60;
const items = [];
for (const kind of DAILY_FX_KINDS) {
    const pack = packOf.get(kind) || 'daily';
    if (!packArg.includes('all') && !packArg.includes(pack)) continue;
    if (kindArg.length && !kindArg.includes(kind)) continue;
    const text = '[igs-fx:' + [kind, ...(SAMPLE[kind] || ['示例一', '示例二', '示例三', '示例四'])].join('|') + ']';
    const item = (resolveFxAtPage(extractFxDirectives(text), text.length, -1).daily || [])[0];
    if (item) items.push({ pack, kind, item });
}

const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>fxshot</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:"Microsoft YaHei",sans-serif;}
#igs-overlay{position:absolute;inset:0;overflow:hidden;font-size:16px;color:#fff;}
#igs-stage-motion{position:absolute;inset:0;}
#igs-bg{position:absolute;inset:0;background:linear-gradient(180deg,#7e9bc4 0,#a9bfd8 55%,#7c8a6a 55%,#5d6b4f 100%);}
#igs-sprite{position:absolute;inset:0;background:no-repeat 50% 100%/auto 88%;}
#igs-dialog-layer{position:absolute;left:0;right:0;bottom:0;height:var(--igs-dialog-h);box-sizing:border-box;padding:12px 16px;background:rgba(20,18,30,.82);border-top:1px solid #fff5;font-size:14px;}
.igs-fx-layer{position:absolute;inset:0;pointer-events:none;}
</style>
<style id="igs-overlay-style"></style>
<div id="host"></div>
<script type="module">
import { getOriginalReaderStyleText } from '/src/visual/igs-ui/original-reader-source.js';
import { cancelDailyFx, renderDailyFx } from '/src/visual/igs-ui/fx-daily.js';
import { FX_PACKS_ACTIVE, packSwitchPath } from '/src/scene/fx-packs.js';
import { DAILY_FX_KINDS } from '/src/scene/daily-fx-directives.js';
document.getElementById('igs-overlay-style').textContent = getOriginalReaderStyleText();
const person = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 440"><ellipse cx="100" cy="52" rx="36" ry="40" fill="#e8c9a8" stroke="#6b4a2e" stroke-width="3"/><path d="M62 52 C60 8 140 8 138 52 C128 30 72 30 62 52Z" fill="#5a3a2a"/><path d="M60 100 H140 L170 300 H30Z" fill="#c76b7e"/><rect x="62" y="300" width="30" height="130" fill="#334"/><rect x="108" y="300" width="30" height="130" fill="#334"/></svg>');
const readerSettings = { dailyFx: { enabled: true, panelSkin: false } };
for (const kind of DAILY_FX_KINDS) readerSettings.dailyFx[kind] = true;
for (const pack of FX_PACKS_ACTIVE) {
  const [g, k] = packSwitchPath(pack).split('.');
  readerSettings[g] = Object.assign(readerSettings[g] || {}, { [k]: true });
  if (pack.requires) readerSettings[pack.requires] = Object.assign(readerSettings[pack.requires] || {}, { enabled: true });
}
let seq = 0;
window.fxShot = (item, dialogH, at) => {
  const old = document.getElementById('igs-overlay');
  if (old) { cancelDailyFx(old); old.remove(); }
  const root = document.createElement('div');
  root.id = 'igs-overlay';
  root.style.setProperty('--igs-dialog-h', dialogH + 'px');
  root.innerHTML = '<div id="igs-stage-motion"><div id="igs-bg"></div><div id="igs-sprite"></div><div id="igs-dialog-layer">旁白：这里是对话框占位，演出不应压到这条线以下。</div></div>';
  document.getElementById('host').appendChild(root);
  if (window.fxBg) root.querySelector('#igs-bg').style.background = 'url("/__bg") center/cover no-repeat';
  const sp = root.querySelector('#igs-sprite');
  sp.style.cssText = 'display:block;background-image:url("' + (window.fxSprite ? '/__sprite' : person) + '");background-repeat:no-repeat;background-size:auto 88%;background-position:50% 100%';
  root.querySelector('#igs-dialog-layer').style.cssText = 'top:auto;bottom:0;left:0;right:0;height:var(--igs-dialog-h);';
  const ctx = { reducedMotion: false, schedule: () => 0, clear() {}, playSfx() {}, onPhoto() {}, cast: [], sprite: null };
  const snap = { messageId: 'shot' + (++seq), readerSettings, content: { currentIndex: 0, textType: 'dialogue', speaker: '角色', spriteCharacter: '角色', sceneLocation: '', fx: { daily: [item] } } };
  let played = [];
  try { played = renderDailyFx(root, snap, ctx).played; } catch (e) { return { error: String(e && e.stack || e) }; }
  // 停在停留阶段：所有动画暂停到 at * 寿命（寿命来自 --igs-dfx-life，缺省 3000ms）。
  const lifeOf = (el) => { const v = parseFloat(getComputedStyle(el).getPropertyValue('--igs-dfx-life')); return v > 0 ? v : 3000; };
  for (const a of document.getAnimations()) {
    const target = a.effect && a.effect.target;
    const host = target && target.closest ? target.closest('.igs-dfx, .igs-fx-layer') : null;
    const life = host ? lifeOf(host) : 3000;
    try { a.pause(); a.currentTime = life * at; } catch {}
  }
  const front = root.querySelector('#igs-fx-front');
  const stage = root.querySelector('#igs-fx-stage');
  const nodes = (front ? front.children.length : 0) + (stage ? stage.querySelectorAll('.igs-dfx, [class*="igs-coc"], [class*="igs-id"]').length : 0);
  // 类名撞车自检：演出根节点的类名又被内部子元素复用，会让内层样式误套到根节点上。
  const dup = [];
  for (const n of [...(front ? front.children : []), ...(stage ? stage.children : [])]) for (const t of (n.className || '').split(' ')) { if (/^igs-/.test(t) && t !== 'igs-dfx' && n.querySelector('.' + t)) dup.push(t); }
  // 字号自检：演出内带文字的元素里最小的计算字号（规范：正文 >= 12px，装饰小字 >= 10px）。
  let small = null;
  for (const n of [...(front ? front.children : []), ...(stage ? stage.children : [])]) for (const el of [n, ...n.querySelectorAll('*')]) {
    const own = [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim()).map((c) => c.textContent.trim()).join('');
    if (!own) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (!small || fs < small.px) small = { px: Math.round(fs * 10) / 10, text: own.slice(0, 8) };
  }
  return { played, nodes, dup, small };
};
window.fxReady = true;
</script>`;

const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/__fxshot.html') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(html.replace('window.fxReady = true;', `${sprite ? 'window.fxSprite = true;\n' : ''}${bg ? 'window.fxBg = true;\n' : ''}window.fxReady = true;`));
        return;
    }
    if (url === '/__bg') { if (bg) { const e = path.extname(bg).toLowerCase(); res.setHeader('content-type', e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : 'image/jpeg'); fs.createReadStream(bg).pipe(res); } else { res.statusCode = 404; res.end(); } return; }
    if (url === '/__sprite') { if (sprite) { res.setHeader('content-type', 'image/png'); fs.createReadStream(sprite).pipe(res); } else { res.statusCode = 404; res.end(); } return; }
    if (url.startsWith('/__out/')) { const f = path.join(outRoot, url.slice(7)); if (fs.existsSync(f)) { res.setHeader('content-type', 'image/png'); fs.createReadStream(f).pipe(res); } else { res.statusCode = 404; res.end(); } return; }
    const file = path.join(appRoot, url);
    if (!file.startsWith(appRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
    const ext = path.extname(file);
    res.setHeader('content-type', ext === '.js' || ext === '.mjs' ? 'text/javascript; charset=utf-8' : ext === '.json' ? 'application/json' : ext === '.png' ? 'image/png' : 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\igs-fxshot-profile${PORT}`, 'about:blank'], { stdio: 'ignore' });
let exitCode = 0;
try {
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); ok = true; } catch { await sleep(250); } }
    if (!ok) throw new Error('CDP 不可达');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0;
    const pending = new Map();
    const pageErrors = [];
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    };
    const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: `${base}/__fxshot.html` });
    for (let i = 0; i < 60 && !(await evaluate('window.fxReady === true')); i++) await sleep(300);
    if (!(await evaluate('window.fxReady === true'))) throw new Error('页面未就绪：' + pageErrors.join(' | '));
    let done = 0;
    const problems = [];
    for (const size of sizeArg) {
        const [w, h, label] = SIZES[size] || SIZES['16x9'];
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
        const dialogH = Number(dialogArg) || (w < 768 ? 190 : 150);
        for (const { pack, kind, item } of items) {
            const r = await evaluate(`window.fxShot(${JSON.stringify(item)}, ${dialogH}, ${at})`);
            if (!r || r.error) { problems.push(`${pack}/${kind}-${label}: ${r ? r.error.split('\n')[0] : '无返回'}`); continue; }
            if (r.dup && r.dup.length) problems.push(`${pack}/${kind}-${label}: 类名撞车 ${r.dup.join(',')}`);
            if (r.small && r.small.px < 10) problems.push(`${pack}/${kind}-${label}: 字号过小 ${r.small.px}px「${r.small.text}」`);
            if (!r.nodes) problems.push(`${pack}/${kind}-${label}: 未生成演出节点（played=${JSON.stringify(r.played)}）`);
            await sleep(waitMs);
            if (args.includes('--probe')) console.log(kind, label, JSON.stringify(await evaluate("[...document.querySelectorAll('#igs-fx-front, #igs-fx-front *, .igs-pl-chest')].map(e => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return [e.id || e.className, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), c.position, c.opacity, c.display]; })")));
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            const dir = path.join(outRoot, pack);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${kind}-${label}.png`), Buffer.from(shot.result.data, 'base64'));
            done++;
        }
    }
    if (args.includes('--sheet')) {
        const byPack = new Map();
        for (const { pack, kind } of items) { if (!byPack.has(pack)) byPack.set(pack, []); byPack.get(pack).push(kind); }
        const sheetDir = path.join(outRoot, '_总览');
        fs.mkdirSync(sheetDir, { recursive: true });
        for (const size of sizeArg) {
            const [w, h, label] = SIZES[size] || SIZES['16x9'];
            const wide = w > h;
            const cols = wide ? 3 : 6;
            const cell = wide ? 640 : 260;
            const per = wide ? 12 : 12;
            const cellH = Math.round(cell * h / w);
            for (const [pack, kinds] of byPack) {
                for (let from = 0, n = 1; from < kinds.length; from += per, n++) {
                    const part = kinds.slice(from, from + per);
                    const rows = Math.ceil(part.length / cols);
                    await send('Emulation.setDeviceMetricsOverride', { width: cols * cell, height: rows * (cellH + 18), deviceScaleFactor: 1, mobile: false });
                    const cells = part.map((k) => `<figure style="margin:0;width:${cell}px;height:${cellH + 18}px;font:12px sans-serif;color:#fff"><img src="/__out/${encodeURIComponent(pack)}/${encodeURIComponent(k)}-${label}.png" style="width:${cell}px;height:${cellH}px;display:block"><figcaption>${k}</figcaption></figure>`).join('');
                    const doc = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${cell}px)">${cells}</body>`;
                    await evaluate(`document.open();document.write(${JSON.stringify(doc)});document.close();`);
                    await evaluate("Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))");
                    await sleep(150);
                    const shot = await send('Page.captureScreenshot', { format: 'png' });
                    fs.writeFileSync(path.join(sheetDir, `${pack}-${label}-${n}.png`), Buffer.from(shot.result.data, 'base64'));
                }
            }
        }
    }
    console.log(`完成 ${done} 张 -> ${outRoot}`);
    if (problems.length) console.log('问题：\n' + problems.join('\n'));
    if (pageErrors.length) console.log('页面异常：\n' + pageErrors.slice(0, 10).join('\n'));
    ws.close();
} catch (error) {
    console.error(error);
    exitCode = 1;
} finally {
    chrome.kill();
    server.close();
    process.exit(exitCode);
}
