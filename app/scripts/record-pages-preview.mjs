// 本地静态服务：为 fixtures/record-pages/preview.html 提供生产控制器/样式与字体资源。
// 仅开发用截图入口，不进入发布产物；不引入新框架。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.IGS_PREVIEW_PORT || 4173);

const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.otf': 'font/otf',
    '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/fixtures/record-pages/preview.html';
    if (rel === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    const file = path.resolve(appRoot, '.' + rel);
    if (!file.startsWith(appRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
    }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
    console.log(`record-pages preview: http://127.0.0.1:${port}/`);
});
