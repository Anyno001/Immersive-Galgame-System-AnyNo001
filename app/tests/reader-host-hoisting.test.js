import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// createIgsReaderHost 在中段就 return host，之后全靠函数声明提升。写在 return 之后的 const / let 永远初始化不到，
// 闭包一用就抛 ReferenceError；CG 库缩略图回调曾因此一张都不换（异常又被界面回调吞掉）。
test('gate:reader-host:no-const-or-let-after-the-factory-returns', () => {
    const file = path.resolve(import.meta.dirname, '../src/visual/igs-ui/reader-host.js');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const start = lines.findIndex((line) => line.startsWith('export function createIgsReaderHost('));
    assert.ok(start >= 0, 'factory not found');
    const end = lines.findIndex((line, i) => i > start && line === '}');
    const returnAt = lines.findIndex((line, i) => i > start && i < end && line === '    return host;');
    assert.ok(returnAt > start, 'factory return not found');
    const late = lines.slice(returnAt + 1, end)
        .map((line, i) => ({ line: returnAt + 2 + i, text: line }))
        .filter(({ text }) => /^ {4}(const|let|var|class) /.test(text));
    assert.deepEqual(late, [], 'move these above `return host;` or turn them into function declarations');
});
