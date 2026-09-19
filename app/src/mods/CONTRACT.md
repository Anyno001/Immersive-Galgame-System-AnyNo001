# mods 模块契约

## 职责

- 加载会写 JS 的作者提供的本地 `.igs-mod.js` 文件。
- 默认不联网。
- 按能力页导入，不提供独立总 Mod 管理页。
- 支持合集文件拆分，拆分结果显示到对应能力页。
- 内置 provider 也按可拆卸能力处理，可被禁用、替换或覆盖配置。

## 默认权限

- `component`
- `action`
- `imageProvider`
- `sceneRule`
- `readScene`
- `patchScene`
- `storage`
- `injectCss`
- `uiSkin`

## 危险权限

- `sendMessage`
- `writeShujuku`
- `network`

危险权限必须在导入时明确提示。默认本地 Mod 不需要 `network`。
