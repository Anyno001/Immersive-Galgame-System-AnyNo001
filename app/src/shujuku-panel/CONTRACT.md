# shujuku-panel 模块契约

## 职责

- 提供内置 shujuku 表格可编辑前端。
- 支持查看表格、编辑单元格、增行、删行、保存到 shujuku、刷新数据与世界书。
- 表格读写必须通过 `data/shujuku` 适配层。
- 不重复 shujuku 自带的模板导入能力。

## API

- `window.AutoCardUpdaterAPI.exportTableAsJson()`
- `window.AutoCardUpdaterAPI.updateCell(...)`
- `window.AutoCardUpdaterAPI.updateRow(...)`
- `window.AutoCardUpdaterAPI.insertRow(...)`
- `window.AutoCardUpdaterAPI.deleteRow(...)`
- `window.AutoCardUpdaterAPI.refreshDataAndWorldbook()`

## 样式

所有样式必须使用 `.igs-shujuku-*` class，允许 UI/CSS 预设覆盖。
