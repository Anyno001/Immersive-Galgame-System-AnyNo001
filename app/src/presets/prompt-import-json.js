// JSON.parse 负责语法；额外扫描对象键，避免重复字段被静默覆盖。
export function parsePromptImportJson(raw) {
    const parsed = JSON.parse(raw);
    const stack = [];
    for (let index = 0; index < raw.length; index += 1) {
        const char = raw[index], current = stack.at(-1);
        if (char === '"') {
            const start = index;
            for (index += 1; index < raw.length; index += 1) {
                if (raw[index] === '\\') index += 1;
                else if (raw[index] === '"') break;
            }
            if (current?.keys && current.expectKey) {
                const key = JSON.parse(raw.slice(start, index + 1));
                if (current.keys.has(key)) throw new Error('duplicate-json-field');
                current.keys.add(key);
                current.expectKey = false;
            }
        } else if (char === '{') stack.push({ keys: new Set(), expectKey: true });
        else if (char === '[') stack.push({});
        else if (char === '}' || char === ']') stack.pop();
        else if (char === ',' && current?.keys) current.expectKey = true;
    }
    return parsed;
}
