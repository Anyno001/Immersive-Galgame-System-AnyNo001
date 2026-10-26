// 立绘碰撞截帧（零依赖）：本机 Chrome 无头 + CDP，在真实 applyFxToDom → applyClashToDom 编排下用虚拟时钟逐帧推进，
// 每个场景输出 蓄力 / 冲刺中 / 命中定格 / 受力峰值 / 回位后 等关键帧，再横向拼一张条带图。
// 用法：node scripts/clash-shot.mjs [--only id1,id2] [--out <目录>]
//      node scripts/clash-shot.mjs --serve        起本地服务，浏览器打开打印出的地址即可点按钮实时重播各场景（Ctrl+C 结束）。
// 立绘与背景取 fx-shot.local.json（sprite / bg），第二个角色是同一张图水平镜像再转色相，只在截图页里生成；截图输出在仓库外。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { clashTimeline, CLASH_GHOST_MS, CLASH_HUG_MS, CLASH_USER_MS, CLASH_HIGHFIVE_MS } from '../src/visual/igs-ui/fx-clash.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const serveOnly = args.includes('--serve');
const outRoot = arg('out', path.resolve(repoRoot, '..', '演出版面审查截图', 'clash'));
if (path.resolve(outRoot).toLowerCase().startsWith(repoRoot.toLowerCase())) { console.error('截图目录不能在仓库内：' + outRoot); process.exit(1); }
const localCfgFile = path.join(import.meta.dirname, 'fx-shot.local.json');
const localCfg = fs.existsSync(localCfgFile) ? JSON.parse(fs.readFileSync(localCfgFile, 'utf8')) : {};
const sprite = [arg('sprite', ''), process.env.IGS_SHOT_SPRITE, localCfg.sprite].find((p) => p && fs.existsSync(p)) || '';
const bg = [arg('bg', ''), process.env.IGS_SHOT_BG, localCfg.bg].find((p) => p && fs.existsSync(p)) || '';
for (const file of [sprite, bg]) if (file && path.resolve(file).toLowerCase().startsWith(repoRoot.toLowerCase())) { console.error('素材不能放在仓库内：' + file); process.exit(1); }
if (!sprite) { console.error('缺少立绘：在 scripts/fx-shot.local.json 写 sprite 路径'); process.exit(1); }
const only = arg('only', '').split(',').filter(Boolean);
const PORT = Number(process.env.IGS_SHOT_PORT) || 9353;
const SERVE_PORT = Number(arg('port', '9352'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LAND = [1280, 720];
const TALL = [390, 844];
// stage：duo 双人（A 陪衬、B 说话人）/ duo-r 双人（A 说话人、B 陪衬）/ b 只有受方 / a 只有出手方。
export const SCENES = [
    { id: 'slap-small-land', label: '巴掌 小档 双人横屏', size: LAND, stage: 'duo', clash: ['哪吒', '敖丙', 'slap', 'small'] },
    { id: 'slap-mid-land', label: '巴掌 中档 双人横屏', size: LAND, stage: 'duo', clash: ['哪吒', '敖丙', 'slap', 'mid'] },
    { id: 'slap-big-land', label: '巴掌 大档 双人横屏', size: LAND, stage: 'duo', clash: ['哪吒', '敖丙', 'slap', 'big'] },
    { id: 'slap-mid-tall', label: '巴掌 中档 双人竖屏', size: TALL, stage: 'duo', clash: ['哪吒', '敖丙', 'slap', 'mid'] },
    { id: 'slap-big-tall', label: '巴掌 大档 双人竖屏', size: TALL, stage: 'duo', clash: ['哪吒', '敖丙', 'slap', 'big'] },
    { id: 'ghost-a-land', label: '单人 身后啪 横屏', size: LAND, stage: 'b', clash: ['哪吒', '敖丙', 'slap', 'mid'] },
    { id: 'ghost-a-tall', label: '单人 身后啪 竖屏', size: TALL, stage: 'b', clash: ['哪吒', '敖丙', 'slap', 'mid'] },
    { id: 'ghost-a-back-land', label: '受方背对 身后啪 横屏', size: LAND, stage: 'b', back: true, clash: ['哪吒', '敖丙', 'slap', 'mid'] },
    { id: 'ghost-a-back-tall', label: '受方背对 身后啪 竖屏', size: TALL, stage: 'b', back: true, clash: ['哪吒', '敖丙', 'slap', 'big'] },
    { id: 'ghost-b-kick-tall', label: '单人 缺受方 踢 大档 竖屏', size: TALL, stage: 'a', clash: ['哪吒', '敖丙', 'kick', 'big'] },
    { id: 'offscreen-land', label: '画外一击 横屏', size: LAND, stage: 'b', clash: ['旁白', '敖丙', 'slap', 'mid'] },
    { id: 'user-land', label: '打主角 横屏', size: LAND, stage: 'a', clash: ['哪吒', '{{user}}', 'punch', 'big'] },
    { id: 'hug-land', label: '扑抱 双人横屏', size: LAND, stage: 'duo', clash: ['哪吒', '敖丙', 'hug', ''] },
    { id: 'highfive-land', label: '击掌 双人横屏', size: LAND, stage: 'duo', clash: ['哪吒', '敖丙', 'highfive', ''] },
    { id: 'slap-big-comic-land', label: '巴掌 大档 漫画模式', size: LAND, stage: 'duo', comic: true, clash: ['哪吒', '敖丙', 'slap', 'big'] },
];

// 关键帧时刻（毫秒）按真实时间轴算：与 fx-clash 的 clashTimeline / 各分支常量同源。
function framesOf(scene, route) {
    const [, , action, tier] = scene.clash;
    const portrait = scene.size === TALL;
    const T = clashTimeline(action, tier, { portrait });
    if (route === 'hug') {
        const H = CLASH_HUG_MS;
        const c = H.windup + H.dash;
        return [['蓄力', H.windup], ['扑过去', H.windup + H.dash * 0.6], ['贴住', c + 120], ['停留', c + 900], ['分开中', c + H.hold + H.back * 0.5], ['回位后', c + H.hold + H.back + 120]];
    }
    if (route === 'highfive') {
        const H = CLASH_HIGHFIVE_MS;
        return [['靠近', H.dash * 0.5], ['击掌', H.dash + 20], ['分开', H.dash + H.freeze + H.back * 0.5], ['回位后', H.dash + H.freeze + H.back + 100]];
    }
    const off = route === 'ghost-a' ? CLASH_GHOST_MS.peekIn : route === 'ghost-b' ? CLASH_GHOST_MS.sideIn : 0;
    if (route === 'offscreen') {
        const lead = 60;
        return [['命中前', 20], ['命中定格', lead + T.freeze * 0.5], ['受力峰值', lead + T.freeze + T.react * 0.32], ['回弹', lead + T.freeze + T.react * 0.64], ['回位后', lead + T.freeze + T.react + 120]];
    }
    const hit = route === 'user' ? T.windup + CLASH_USER_MS.rush : T.hit;
    const peak = T.knock ? (route === 'ghost-b' ? 45 : 110) : T.react * 0.32;
    const end = T.knock ? T.freeze + T.knock + 260 : T.freeze + T.react + 120;
    const list = [];
    if (route === 'ghost-a') list.push(['探出', off]);
    if (route === 'ghost-b') list.push(['滑入', off]);
    list.push(['蓄力', off + T.windup], ['冲刺中', off + T.windup + (hit - T.windup) * 0.6], ['命中定格', off + hit + T.freeze * 0.5], ['受力峰值', off + hit + T.freeze + peak]);
    if (T.knock) list.push(['淡回', off + hit + T.freeze + T.knock + 120]);
    list.push(['回位后', off + hit + end + (route === 'ghost-a' ? CLASH_GHOST_MS.out : route === 'ghost-b' ? CLASH_GHOST_MS.fade : 0)]);
    return list;
}

const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>立绘碰撞预览</title>
<style>html,body{margin:0;background:#111;color:#ddd;font-family:"Microsoft YaHei",sans-serif;}
body.shot{overflow:hidden;}
#bar{display:flex;flex-wrap:wrap;gap:6px;padding:8px;}
#bar button{padding:4px 10px;border:1px solid #555;border-radius:4px;background:#222;color:#eee;cursor:pointer;}
#bar button:hover{background:#333;}
#wrap{padding:0 8px 8px;}
body.shot #bar{display:none;}body.shot #wrap{padding:0;}
#igs-overlay{position:relative;overflow:hidden;font-size:16px;color:#fff;background:#000;}
#igs-stage-motion{position:absolute;inset:0;}
#igs-bg{position:absolute;inset:0;background:linear-gradient(180deg,#7e9bc4 0,#a9bfd8 55%,#7c8a6a 55%,#5d6b4f 100%);}
#igs-dialog-layer{position:absolute;left:0;right:0;bottom:0;height:var(--igs-dialog-h);box-sizing:border-box;padding:12px 16px;background:rgba(20,18,30,.82);border-top:1px solid #fff5;font-size:14px;z-index:4;}
</style>
<style id="igs-overlay-style"></style>
<div id="bar"></div><div id="wrap"><div id="igs-overlay"></div></div>
<script type="module">
import { getOriginalReaderStyleText } from '/src/visual/igs-ui/original-reader-source.js';
import { applyFxToDom, cancelFxEffects } from '/src/visual/igs-ui/fx-runtime.js';
import { probeSpriteHead } from '/src/visual/igs-ui/fx-anchor.js';
import { applySpeakerFlip, castFlipOriginX } from '/src/visual/igs-ui/stage-cast-render.js';
document.getElementById('igs-overlay-style').textContent = getOriginalReaderStyleText();
const preview = new URLSearchParams(location.search).has('preview');
if (!preview) document.body.classList.add('shot');
const SCENES = __SCENES__;
const imgA = '/__sprite';
async function mirrored(url) {
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.filter = 'hue-rotate(150deg) saturate(1.15)'; g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return { url: URL.createObjectURL(blob), w: img.naturalWidth, h: img.naturalHeight };
}
const B = await mirrored(imgA);
const imgB = B.url;
await probeSpriteHead(imgA, document); await probeSpriteHead(imgB, document);
const NAT = { w: B.w, h: B.h };
const clock = { now: 0, q: [], seq: 0, virtual: !preview };
const schedule = (fn, ms) => { if (!clock.virtual) return setTimeout(fn, ms); const id = ++clock.seq; clock.q.push({ id, at: clock.now + Math.max(0, Number(ms) || 0), fn }); return id; };
const clear = (id) => { if (!clock.virtual) return clearTimeout(id); clock.q = clock.q.filter((t) => t.id !== id); };
const tracked = new Map();
function adopt() { if (!clock.virtual) return; for (const a of document.getAnimations()) if (!tracked.has(a)) { tracked.set(a, clock.now); try { a.pause(); a.currentTime = 0; } catch {} } }
function seekTo(t) {
  for (;;) {
    clock.q.sort((a, b) => a.at - b.at || a.id - b.id);
    const n = clock.q[0];
    if (!n || n.at > t) break;
    clock.q.shift(); clock.now = n.at; adopt(); try { n.fn(); } catch (e) { console.error(e); } adopt();
  }
  clock.now = t; adopt();
  for (const [a, t0] of tracked) { try { a.currentTime = Math.max(0, t - t0); } catch {} }
}
const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
let SCALE = 95;
function posXFor(center, W, H) { const h = H * SCALE / 100; const w = h * NAT.w / NAT.h; return Math.round((center * W - w / 2) / (W - w) * 10000) / 100; }
function layer(el, url, posX) {
  el.style.cssText = '';
  el.style.backgroundImage = 'url("' + url + '")';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = 'auto ' + SCALE + '%';
  el.style.backgroundPosition = posX + '% 100%';
}
let seq = 0;
function build(scene) {
  const root = document.getElementById('igs-overlay');
  cancelFxEffects(root);
  for (const a of document.getAnimations()) { try { a.cancel(); } catch {} }
  tracked.clear(); clock.q = []; clock.now = 0;
  const [W, H] = scene.size;
  SCALE = W < H ? 66 : 95;
  root.style.width = W + 'px'; root.style.height = H + 'px';
  root.className = W < H ? 'igs-portrait' : 'igs-landscape';
  root.style.setProperty('--igs-dialog-h', (W < H ? 190 : 150) + 'px');
  root.innerHTML = '<div id="igs-stage-motion"><div id="igs-bg"></div><div id="igs-cast" class="igs-cast-layer"></div><div id="igs-sprite" class="igs-character-layer"></div><div id="igs-click-layer"></div><div id="igs-dialog-layer">' + scene.label + '</div></div>';
  root.querySelector('#igs-dialog-layer').style.cssText = 'top:auto;bottom:0;left:0;right:0;height:var(--igs-dialog-h);';
  if (window.clashBg) root.querySelector('#igs-bg').style.background = 'url("/__bg") center/cover no-repeat';
  const portrait = W < H;
  const left = portrait ? 0.3 : 0.27, right = portrait ? 0.7 : 0.73;
  const speakerEl = root.querySelector('#igs-sprite');
  const castLayer = root.querySelector('#igs-cast');
  const entry = (character, url, center) => ({ character, url, posX: posXFor(center, W, H), posY: 100, scale: SCALE, head: null, flip: false });
  let speaker = null; const cast = [];
  if (scene.stage === 'duo') { speaker = entry('敖丙', imgB, right); cast.push(entry('哪吒', imgA, left)); }
  else if (scene.stage === 'b') speaker = entry('敖丙', imgB, 0.5);
  else if (scene.stage === 'a') speaker = entry('哪吒', imgA, 0.5);
  if (speaker) {
    layer(speakerEl, speaker.url, speaker.posX);
    Object.assign(speakerEl.style, { display: 'block', position: 'absolute', inset: '0', width: '100%', height: '100%', transform: 'none' });
    if (scene.back) {
      speaker.flip = true;
      const h = H * SCALE / 100, w = h * NAT.w / NAT.h;
      applySpeakerFlip(speakerEl, true, speaker.posX, w / W * 100);
      speakerEl.setAttribute('data-igs-sprite-back', '1');
    }
  }
  for (const m of cast) {
    const el = document.createElement('div');
    el.className = 'igs-cast-sprite';
    el.setAttribute('data-igs-cast-char', m.character);
    layer(el, m.url, m.posX);
    el.style.filter = 'brightness(0.86) saturate(0.9)';
    el.style.setProperty('--igs-cast-origin-x', m.posX + '%');
    castLayer.appendChild(el);
  }
  const [attacker, target, action, tier] = scene.clash;
  const readerSettings = { fxTags: { enabled: true }, fxSound: { enabled: preview, volume: 0.6 }, clashFx: {}, comicMode: { enabled: Boolean(scene.comic) }, _sceneAssets: { characters: { 哪吒: { 平和: imgA }, 敖丙: { 平和: imgB } } } };
  const snapshot = { messageId: 'clash' + (++seq), readerSettings, content: { currentIndex: 0, textType: 'dialogue', speaker: speaker ? speaker.character : '', spriteCharacter: speaker ? speaker.character : '', displayText: '', fx: { instants: [], clashes: [{ attacker, target, action, tier }], clashExtra: [] } } };
  const result = applyFxToDom(root, snapshot, { sprite: speaker, cast, schedule, clear, reducedMotion: false, resolveAssetUrl: (u) => u, userName: '我' });
  adopt();
  return result;
}
window.clashRun = async (id) => { const scene = SCENES.find((s) => s.id === id); const r = build(scene); await raf(); return r.played.filter((p) => p.startsWith('clash:')).map((p) => p.slice(6)); };
window.clashSeek = async (t) => { seekTo(t); await raf(); await raf(); return true; };
if (preview) {
  const bar = document.getElementById('bar');
  for (const scene of SCENES) {
    const b = document.createElement('button'); b.textContent = scene.label;
    b.onclick = () => build(scene);
    bar.appendChild(b);
  }
  const slow = document.createElement('button'); slow.textContent = '慢放 ×0.25 开/关';
  slow.onclick = () => { window.__slow = !window.__slow; for (const a of document.getAnimations()) a.playbackRate = window.__slow ? 0.25 : 1; };
  bar.appendChild(slow);
  const origAnimate = Element.prototype.animate;
  Element.prototype.animate = function (...a) { const anim = origAnimate.apply(this, a); if (window.__slow) anim.playbackRate = 0.25; return anim; };
  build(SCENES[1]);
}
window.clashReady = true;
</script>`;

const pageHtml = () => html.replace('__SCENES__', JSON.stringify(SCENES)).replace('window.clashReady = true;', `${bg ? 'window.clashBg = true;\n' : ''}window.clashReady = true;`);

const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/__clash.html') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(pageHtml()); return; }
    if (url === '/__bg') { if (bg) { const e = path.extname(bg).toLowerCase(); res.setHeader('content-type', e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : 'image/jpeg'); fs.createReadStream(bg).pipe(res); } else { res.statusCode = 404; res.end(); } return; }
    if (url === '/__sprite') { res.setHeader('content-type', 'image/png'); fs.createReadStream(sprite).pipe(res); return; }
    if (url.startsWith('/__out/')) { const f = path.join(outRoot, url.slice(7)); if (fs.existsSync(f)) { res.setHeader('content-type', 'image/png'); fs.createReadStream(f).pipe(res); } else { res.statusCode = 404; res.end(); } return; }
    const file = path.join(appRoot, url);
    if (!file.startsWith(appRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
    const ext = path.extname(file);
    res.setHeader('content-type', ext === '.js' || ext === '.mjs' ? 'text/javascript; charset=utf-8' : ext === '.json' ? 'application/json' : ext === '.png' ? 'image/png' : 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});

fs.mkdirSync(outRoot, { recursive: true });
const previewUrl = `http://127.0.0.1:${SERVE_PORT}/__clash.html?preview=1`;
fs.writeFileSync(path.join(outRoot, '实时预览-打开方式.html'), `<!doctype html><meta charset="utf-8"><title>立绘碰撞实时预览</title>
<body style="font-family:'Microsoft YaHei',sans-serif;padding:24px;line-height:1.8">
<p>先在仓库的 app 目录运行：<code>node scripts/clash-shot.mjs --serve</code>（保持窗口开着），再点下面的链接；页面里每个按钮实时重播一个场景，带音效，可切慢放。</p>
<p><a href="${previewUrl}">${previewUrl}</a></p>
<iframe src="${previewUrl}" style="width:1320px;height:900px;border:1px solid #888"></iframe>
</body>`);

const dataUrl = (file) => { const e = path.extname(file).toLowerCase(); return `data:${e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : 'image/jpeg'};base64,${fs.readFileSync(file).toString('base64')}`; };
{
    const page = pageHtml();
    const open = page.indexOf('<script type="module">');
    const close = page.lastIndexOf('</script>');
    const entry = page.slice(open + '<script type="module">'.length, close)
        .replaceAll("from '/src/", "from './src/")
        .replace("new URLSearchParams(location.search).has('preview')", 'true')
        .replace("const imgA = '/__sprite';", `const imgA = ${JSON.stringify(dataUrl(sprite))};`)
        .replace('url("/__bg")', bg ? `url("${dataUrl(bg)}")` : 'none');
    const esbuild = await import('esbuild');
    const out = await esbuild.build({ stdin: { contents: entry, resolveDir: appRoot, loader: 'js' }, bundle: true, format: 'esm', target: 'es2022', write: false, minify: true, charset: 'utf8', logLevel: 'error' });
    const js = out.outputFiles[0].text.replaceAll('</script', '<\\/script');
    fs.writeFileSync(path.join(outRoot, '立绘碰撞预览.html'), `${page.slice(0, open)}<script type="module">${js}</script>`);
    if (args.includes('--html')) { console.log('已生成：' + path.join(outRoot, '立绘碰撞预览.html')); process.exit(0); }
}

if (serveOnly) {
    server.listen(SERVE_PORT, '127.0.0.1', () => console.log(`预览地址：${previewUrl}\n按 Ctrl+C 结束`));
} else {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
    if (!CHROME) throw new Error('找不到 Chrome / Edge');
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${path.join(os.tmpdir(), `igs-clashshot-profile${PORT}`)}`, 'about:blank'], { stdio: 'ignore' });
    let exitCode = 0;
    try {
        let ok = false;
        for (let i = 0; i < 120 && !ok; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); ok = true; } catch { await sleep(250); } }
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
            if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') pageErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
        };
        const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
        const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
        await send('Runtime.enable');
        await send('Page.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 844, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url: `${base}/__clash.html` });
        for (let i = 0; i < 80 && !(await evaluate('window.clashReady === true')); i++) await sleep(300);
        if (!(await evaluate('window.clashReady === true'))) throw new Error('页面未就绪：' + pageErrors.join(' | '));
        const strips = [];
        for (const scene of SCENES) {
            if (only.length && !only.includes(scene.id)) continue;
            const [w, h] = scene.size;
            await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
            const routes = await evaluate(`window.clashRun(${JSON.stringify(scene.id)})`);
            const route = (routes || [])[0] || 'none';
            const frames = framesOf(scene, route);
            const dir = path.join(outRoot, scene.id);
            fs.mkdirSync(dir, { recursive: true });
            const shots = [];
            for (let i = 0; i < frames.length; i++) {
                const [label, t] = frames[i];
                await evaluate(`window.clashSeek(${Math.round(t)})`);
                await sleep(40);
                const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
                const name = `${String(i + 1).padStart(2, '0')}-${label}.png`;
                fs.writeFileSync(path.join(dir, name), Buffer.from(shot.result.data, 'base64'));
                shots.push({ name, label, t: Math.round(t) });
            }
            strips.push({ scene, route, shots });
            console.log(`${scene.id} [${route}] ${shots.map((s) => `${s.label}@${s.t}`).join(' ')}`);
        }
        for (const { scene, route, shots } of strips) {
            const [w, h] = scene.size;
            const cellW = w > h ? 460 : 230;
            const cellH = Math.round(cellW * h / w);
            const total = shots.length * (cellW + 6) + 6;
            await send('Emulation.setDeviceMetricsOverride', { width: total, height: cellH + 52, deviceScaleFactor: 1, mobile: false });
            const cells = shots.map((s) => `<figure style="margin:0;width:${cellW}px"><img src="/__out/${encodeURIComponent(scene.id)}/${encodeURIComponent(s.name)}" style="width:${cellW}px;height:${cellH}px;display:block"><figcaption style="font:12px 'Microsoft YaHei';color:#ddd;padding-top:3px">${s.label} · ${s.t}ms</figcaption></figure>`).join('');
            const doc = `<body style="margin:0;background:#1b1b1b;"><div style="font:13px 'Microsoft YaHei';color:#fff;padding:4px 6px">${scene.label}（${route}）</div><div style="display:flex;gap:6px;padding:0 6px">${cells}</div></body>`;
            await evaluate(`document.open();document.write(${JSON.stringify(doc)});document.close();`);
            await evaluate("Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))");
            await sleep(120);
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            const file = path.join(outRoot, `条带-${scene.id}.png`);
            fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
        }
        console.log(`完成 ${strips.length} 个场景 -> ${outRoot}`);
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
}
