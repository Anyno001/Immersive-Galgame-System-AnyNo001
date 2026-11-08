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
    const rel = decodeURIComponent(url.pathname);
    // 预览页用相对路径导入 fixtures 与资源，根路径直接返回页面会按「/」解析导致模块 404、页面全黑；改为重定向到页面自身路径并保留查询参数。
    if (rel === '/') {
        res.writeHead(302, { location: `/fixtures/record-pages/preview.html${url.search}`, 'cache-control': 'no-store' });
        res.end();
        return;
    }
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
