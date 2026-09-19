# backgrounds 模块契约

## 职责

- 管理背景资源包。
- 支持 URL 背景和本地导入背景。
- 本地背景必须经 `media` 写入 IndexedDB，刷新后仍然保留。
- 按时间、天气、地点等规则匹配背景。

## 数据类型

- `background-pack`
- `background-rule-preset`

## 禁止

- 不再单独提供图包页。
- 背景资源统一归属背景/立绘页。
- 不直接管理 Blob 生命周期，资源缓存交给 `media`。
