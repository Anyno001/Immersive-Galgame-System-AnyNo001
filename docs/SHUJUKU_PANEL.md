# shujuku 表格页草案

shujuku 表格页是 IGS 内置前端，不负责导入 shujuku 表格模板。

## 目标

- 读取当前 shujuku 表格数据。
- 在 IGS 设置界面内可视化编辑。
- 支持单元格编辑、整行编辑、增行、删行。
- 支持刷新数据与世界书。
- 样式受 UI/CSS 预设控制。

## API

```js
const api = window.AutoCardUpdaterAPI;
api.exportTableAsJson();
await api.updateCell(tableName, rowIndex, colIdentifier, value);
await api.updateRow(tableName, rowIndex, data);
await api.insertRow(tableName, data);
await api.deleteRow(tableName, rowIndex);
await api.refreshDataAndWorldbook();
```

## CSS 命名

```css
.igs-shujuku-panel {}
.igs-shujuku-toolbar {}
.igs-shujuku-table {}
.igs-shujuku-row {}
.igs-shujuku-cell {}
.igs-shujuku-editor {}
```

## 禁止

- 不重复 shujuku 自带模板导入。
- 不把 shujuku 表格页做成 Mod。
- 不绕过 `AutoCardUpdaterAPI` 直接改数据。
