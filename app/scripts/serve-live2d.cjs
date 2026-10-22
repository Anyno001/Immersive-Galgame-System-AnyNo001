// 只提供 dist 公共文件，不暴露源码、配置或聊天；只监听本机。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '../dist');
const types = { '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf', '.mp3':'audio/mpeg' };
http.createServer((req,res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Private-Network','true');
    res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control','no-store');
    if(req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if(!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    try {
        const url = new URL(req.url, 'http://127.0.0.1:18086');
        if(url.pathname === '/') { res.setHeader('Content-Type','text/plain; charset=utf-8'); return res.end('IGS Live2D 本地实验版已启动。请在酒馆助手导入 loader/IGS-Live2D-本地测试.json。关闭本窗口停止服务。'); }
        if(!url.pathname.startsWith('/app/dist/')) { res.writeHead(404); return res.end(); }
        const file = path.resolve(base, decodeURIComponent(url.pathname.slice('/app/dist/'.length)));
        if(!file.startsWith(base + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        if(req.method === 'HEAD') return res.end();
        fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end(); }
}).listen(18086,'127.0.0.1',()=>console.log('Live2D 前端服务：http://127.0.0.1:18086 （按 Ctrl+C 停止）')).on('error',error=>{ console.error(error.message); process.exitCode=1; });
