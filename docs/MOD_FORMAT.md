# Mod 格式草案

Mod 是给会写 JS 的作者使用的能力扩展文件。

## 文件后缀

```text
.igs-mod.js
```

## 基本结构

```js
export default {
    id: 'author.feature',
    name: '示例 Mod',
    version: '1.0.0',
    type: 'image-provider',
    permissions: [],
    setup(api) {
        // register providers, request builders, components, actions, rules
    },
};
```

## 导入规则

- 不提供全局 Mod 管理页。
- Mod 在对应能力页导入、导出、启用和禁用。
- 合集文件可由任意能力页导入，再由 `registry` 按 `type` 拆分。

## 可拆卸内置能力

- st-chatu8 和 chami 作为内置 `image-provider` 注册。
- 内置 provider 必须能在生图插件页启用、禁用、替换。
- provider 的选择器、轮询和按钮匹配配置属于 `image-provider-preset`，不是核心硬编码。
- 关闭某个 provider 后，不应继续扫描它对应的 DOM 或触发它的按钮。

## 生图相关 Mod 类型

- `image-provider`
- `image-request-builder`

Provider 负责请求、轮询和解析返回；Request Builder 负责模型专属提示词/工作流请求结构。

## 危险权限

- `sendMessage`
- `writeShujuku`
- `network`

危险权限必须在导入时显示给用户确认。
