# schemas 契约

`app/src/schemas/` 存放跨模块共享的机器可读数据结构。它解决“多个模块都要理解同一种对象”的问题，不承载业务实现。

## 允许放入

- SceneState、ScenePatch、CharacterMatch、BackgroundMatch 等跨 `scene` 与 `visual` 的结构。
- ModManifest、PresetManifest、PackManifest、ImportResult 等跨 `registry`、`mods`、`presets`、`media` 的结构。
- PublicApiResult、PermissionDeclaration、ActionDescriptor 等跨 `api`、`actions`、`mods` 的结构。
- 可导入文件格式的 JSON Schema。
- 运行时校验器的薄封装，但必须无副作用。

## 不允许放入

- provider 请求构建逻辑。
- DOM 渲染、样式 token 或 UI 组件。
- shujuku 具体写表实现。
- 大段 prompt、真实聊天正文、真实 API key。
- 只被单个模块使用的私有类型。

## 与其他 schema 目录的关系

- `app/src/prompts/schemas/` 只放模型提示词、图像工作流和 provider 参数 schema。
- `app/src/data/shujuku/` 可以保留 shujuku 私有表格结构。
- 当结构被三个以上模块共享，或需要作为导入文件格式公开时，迁入本目录。

## 命名建议

```text
scene-state.schema.json
import-manifest.schema.json
mod-permission.schema.json
resource-pack.schema.json
public-api-result.schema.json
```

每个新增 schema 应同步补充短 fixtures 和 `docs/SCHEMA_AND_FIXTURES.md` 中的测试覆盖说明。
