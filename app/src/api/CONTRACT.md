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

0.36.88 本地草稿：`IGS.api.promptPresets` 也接到同一 PresetRegistry，供生图预设管理使用；保存/激活、导入冲突、草稿 revision 与默认升级校验归 presets 层。管理和预览本身不触发写词/生图，不暴露内部租约、凭据或原图快照。兼容全局不存在顶层 `IGS.promptPresets` 别名。

## 角色外貌 DNA 与衣装（只读）

`IGS.api.characters`（`version: 2`）：

- `dna(name, { isUser = false } = {})`：同步返回 `{ name, dna }` 或 `null`。`name` 为经 IGS 别名表解析后的规范角色名；`dna` 为 IGS 现有结构（`{ version: 2, views: { full_body | half_body | portrait: { subject, negative? } }, personality? }`）的深拷贝。
- `isUser: true` 时忽略 `name`，取当前卡的 User 角色；未设置返回 `null`。
- 读取本卡生效视图（全局与本卡合并），与 IGS 出图时一致。`views` 中没有任何非空 `subject`、名字为空、IGS 未初始化或读取异常均返回 `null`，不抛错。
- `outfit(name, { isUser = false } = {})`：同步返回 `{ name, outfit: { name, description }, source }` 或 `null`。`name` 解析与 `isUser` 规则同 `dna()`；`outfit.description` 为该衣装的英文外貌 tag（IGS 出图时使用的衣装提示词）。
  - `source: 'current'`：正文最新一条 AI 楼（非用户、非系统）文末按 IGS 立绘规则判定的当前衣装，含跨楼继承与场景适用判断。
  - `source: 'default'`：当前衣装无效（未写、未登记、描述为空）时取默认衣装；默认那套在本卡隐藏时取顶替它的那套。
  - 两者都没有返回 `null`。只在调用时计算，不监听、不缓存。
- 只读，不写入任何存储；返回值为深拷贝，读取异常返回 `null`，不抛错。

## 稳定性要求

公开 API 只增不破；破坏性变更必须进入主版本升级。

阅读器自动跟回复的 `openViewerFromMessage` 调用可附带内部 `canReplace()` 条件；在开始准备正文和最终替换阅读源前复核，关闭阅读器、取消等待或新一轮生成后返回 `reply-stale`，不得重开或覆盖阅读器。普通调用不传此条件时语义不变。

## 兼容要求

- 迁移期保留 Immersive Galgame System 既有公开能力的兼容入口：`openSettings()`、`getConfig()`、`getUnifiedSettings()`、`generateImage()`、`destroy()`。
- 酒馆入口诊断能力：`ensureMagicWandEntry()`、`getMagicWandEntryState()`。
- 新二创能力优先挂在 `IGS.api.*` 下，不继续扩散旧 `ImmersiveGalgameSystemBridge` 调试入口。

## 媒体诊断（v0.36.39）

兼容全局新增 `IGS.media`，暴露 `stats/clearCache/auditImages/auditFiles/collectImages/flush/retryDeletes`。审计只读；collect 只删除无引用的候选，并由媒体层再次复查。缓存清理与业务资产删除分离，接口不返回原始图片字节或 API Key。生命周期装配与 destroy 仍由 core 管理。

v0.36.43：`destroy()` 继续返回同步结果，新增 `shutdown()` 等待同一次销毁的全部收尾。调用方需要重载时使用 `await api.shutdown()` 并检查 `ok`；失败不得继续加载新实例。`IGS.media.destroy()` 是媒体内部的幂等异步关闭，不代替完整脚本停用。
