// 把幼麟原文件原文包进工厂。除工厂包裹和 __internals 一行外不改原文。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vendor = resolve(here, '../src/visual/igs-ui/scmj/vendor/babykylin');
const outPath = resolve(here, '../src/visual/igs-ui/scmj/xzdd-factory.generated.js');
const MARK = {
    mjutils: '___MJUTILS_SOURCE___',
    xzdd: '___XZDD_SOURCE___',
};

const BEGIN_MJ = '/* @@mjutils-begin@@ */\n';
const END_MJ = '/* @@mjutils-end@@ */';
const BEGIN_XZ = '/* @@xzdd-begin@@ */\n';
const END_XZ = '/* @@xzdd-end@@ */';

export function renderFactory(mjutils, xzdd) {
    return `/*!
 * 幼麟棋牌-四川麻将 v1.0
 * 版权所有者为成都幼麟科技有限公司。
 * 本规则按该开源协议随脚本发布，允许第三方把包含它的作品作为整体免费使用。
 * 由 scripts/gen-scmj-vendor.mjs 生成，勿手改。原文见 scmj/vendor/babykylin/，版权与许可见 COPYRIGHT.md。
 * 2026-10-23：工厂包裹两个原文件；gamemgr_xzdd.js 末尾追加 exports.__internals 一行。
 */
export function createXzdd(host) {
    const mjModule = { exports: {} };
    const mjutils = (function (require, module, exports, setTimeout, setInterval, console, Math) {
        ${BEGIN_MJ}${mjutils}${END_MJ}
        return module.exports;
    })(host.require, mjModule, mjModule.exports, host.setTimeout, host.setInterval, host.console, host.Math);
    host.bindMjutils(mjutils);
    const xzModule = { exports: {} };
    const xzdd = (function (require, module, exports, setTimeout, setInterval, console, Math) {
        ${BEGIN_XZ}${xzdd}${END_XZ}
        exports.__internals = { checkCanTingPai, calculateResult, computeFanScore, getMJType, isTinged };
        return module.exports;
    })(host.require, xzModule, xzModule.exports, host.setTimeout, host.setInterval, host.console, host.Math);
    return xzdd;
}
`;
}

function between(text, begin, end) {
    const start = text.indexOf(begin);
    if (start < 0) throw new Error(`生成文件缺少 ${begin}`);
    const from = start + begin.length;
    const stop = text.indexOf(end, from);
    if (stop < 0) throw new Error(`生成文件缺少 ${end}`);
    return text.slice(from, stop);
}

export function extractSources(text) {
    return {
        mjutils: between(text, BEGIN_MJ, END_MJ),
        xzdd: between(text, BEGIN_XZ, END_XZ),
    };
}

function sha(buf) {
    return createHash('sha256').update(buf).digest('hex');
}

const mjutils = readFileSync(resolve(vendor, 'mjutils.js'), 'utf8');
const xzdd = readFileSync(resolve(vendor, 'gamemgr_xzdd.js'), 'utf8');
const rendered = renderFactory(mjutils, xzdd);
const check = process.argv.includes('--check');
if (check) {
    const current = readFileSync(outPath, 'utf8');
    if (current !== rendered) {
        console.error('xzdd-factory.generated.js 与原文件不一致');
        process.exit(1);
    }
    const pulled = extractSources(current);
    if (pulled.mjutils !== mjutils || pulled.xzdd !== xzdd) {
        console.error('抽出的原文与 vendor 不一致');
        process.exit(1);
    }
    console.log(`scmj vendor check ok ${sha(mjutils)} ${sha(xzdd)}`);
} else {
    writeFileSync(outPath, rendered);
    const pulled = extractSources(readFileSync(outPath, 'utf8'));
    if (pulled.mjutils !== mjutils || pulled.xzdd !== xzdd) {
        console.error('写回后原文对不上');
        process.exit(1);
    }
    console.log(`scmj vendor generated ${outPath}`);
}
