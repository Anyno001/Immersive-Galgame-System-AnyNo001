# api 模块契约

## 职责

- 提供给二创作者的公开 API。
- API 按能力分组，不提供泛用的 `registerAnything`。

## 命名

- `window.IGS`
- `window.ImmersiveGalgameSystem`

## 分组示例

```js
IGS.api.imageProviders.register(provider);
IGS.api.imageProviders.unregister(id);
IGS.api.imageRequestBuilders.register(builder);
IGS.api.actions.register(action);
IGS.api.components.register(component);
IGS.api.choiceComponents.register(component);
IGS.api.themePresets.register(preset);
IGS.api.uiSkins.register(preset);
IGS.api.sceneRegexPresets.register(preset);
IGS.api.textFilterPresets.register(preset);
IGS.api.textFormatPresets.register(preset);
IGS.api.backgroundPacks.register(pack);
IGS.api.characterPacks.register(pack);
IGS.api.promptPresets.register(preset);
```

文本预设分组在保留 `register/unregister/get/list` 的同时，继续对外暴露：

- `setCurrent(id)`：把已通过校验的预设设为当前启用项。
- `getCurrent()`：读取当前启用的完整预设。
- `export(id)`：导出单个预设，保持 `igs_preset_v1` 结构。
- `exportAll()`：导出当前分组全部预设，保持 `igs-import-bundle` 结构。

`sceneRegexPresets`、`textFilterPresets`、`textFormatPresets` 必须走同一套 runtime `PresetRegistry`，不能在 UI 或 API 层各自维护第二份 current 状态。

## 稳定性要求

公开 API 只增不破；破坏性变更必须进入主版本升级。

## 兼容要求

- 迁移期保留 Immersive Galgame System 既有公开能力的兼容入口：`openSettings()`、`getConfig()`、`getUnifiedSettings()`、`generateImage()`、`destroy()`。
- 酒馆入口诊断能力：`ensureMagicWandEntry()`、`getMagicWandEntryState()`。
- 新二创能力优先挂在 `IGS.api.*` 下，不继续扩散旧 `ImmersiveGalgameSystemBridge` 调试入口。
