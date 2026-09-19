# components 模块契约

## 职责

- 提供 `ComponentRegistry`，管理可选 UI 组件。
- 支持组件插槽、启用状态、排序、依赖声明和移动端适配声明。
- 允许 JS 作者通过对应能力入口导入组件 Mod。

## 组件插槽

- `stage.background`
- `stage.effect`
- `stage.character`
- `dialogue`
- `choice`
- `toolbar`
- `status`
- `settings`

## 禁止

- 禁止组件直接改写核心状态；必须通过 `actions` 或 `scene` API。
- 禁止组件绕过 `.igs-` CSS 前缀污染全局。
- 禁止组件自行创建总 Mod 管理入口。
