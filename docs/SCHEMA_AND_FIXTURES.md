# Schema、Fixtures 与模拟测试

本项目保留运行时数据 schema 与真实行为回归所需的 fixtures。模拟结果与真实酒馆验收分开记录。

## Schema 落点

| 类型 | 位置 | 说明 |
| --- | --- | --- |
| 跨模块通用数据结构 | `app/src/schemas/` | SceneState、ImportManifest、ModPermission、ResourcePack 等跨目录共享结构 |
| 模型提示词和工作流 schema | `app/src/prompts/schemas/` | NAI、ComfyUI、GPT 图像、banana 等模型专属输入输出 |
| shujuku 表格模型 | `app/src/data/shujuku/` | 表格行、sheet 映射、刷新结果、错误结构 |
| Mod / Preset / Pack 格式 | `app/src/registry/` 或 `app/src/schemas/` | 导入清单和能力声明放通用 schema，运行时代码放 registry |

优先使用 JSON Schema 描述可导入文件格式，优先使用 Zod 或轻量 runtime validator 描述运行时 LLM 输出和外部 API 返回值。schema 样例只能放脱敏短样例，不放真实聊天正文、真实 API key 或大段 prompt。

## Fixtures 规则

`app/fixtures/` 只放模拟测试数据：

- fake TavernHelper 聊天消息
- 标准 IGS 正文、空聊天、乱码文本、含时空栏正文
- 含生图段正文和 provider 响应
- fake shujuku 表格和写表结果
- 背景、立绘、头像资源包样例
- 移动端和桌面端布局输入样例

fixtures 文件应短小、可读、可复用。需要大资源时只放 manifest 和占位 URL，不放真实图片包。

## 行为回归与证据

保留范围统一见 `../app/tests/README.md`，不再维护逐域必跑矩阵或重复的门禁命令表。只选能验证当前行为风险的已有用例，不为覆盖率、数量或矩阵完整性补项。

例如，在 `app/` 验证阅读器准备缓存：

```text
node --test tests/reader-floor-preparation.test.js
```

报告实际命令、退出结果和未覆盖的环境。未执行、失败或只有 fixtures 证据时，不声称真实酒馆、手机或 provider 已验收。

## 图片数据边界（v0.36.39）

| 数据 | Schema / 归属 | 回归重点 |
| --- | --- | --- |
| 内容缓存 | `igs-image-cache` v3，files 内容 / meta 别名 | 同内容去重、原子 quota abort、条目与字节预算、活跃租约、多页面失效、清理中断、四路下载、销毁 |
| 图片业务记录 | 素材 schema v2；CG / 照片原有 schema | 原图不可变、metadata 不读像素、revision 冲突、重画失败保旧图 |
| 媒体日志 / 备份 | `igs-media-journal` v1；四类酒馆备份 v2 | WAL 准备失败、离线上传恢复、版本合并、tombstone 防复活、浏览器数据丢失后恢复删除队列 |
| 配置引用 | `igs-settings.json` v2；地图记录独立权威 | 网络/500 不覆盖、远程键合并、地图旧配置迁移与删除、导入新 ID/共享链接/头像/失败补偿 |

## 预设持久化与公开接口夹具

- `S8 storage`：新增 `app/fixtures/presets/preset-registry-snapshot.json`，覆盖预设 current 和 items 的持久化恢复。
- `S9 registry`：新增 `app/fixtures/presets/text-presets-import-bundle.json` 与 `bad-current-overwrite-bundle.json`，覆盖文本预设导入、坏预设拒收和 current 守卫。
- `S10 api`：文本预设公开分组继续覆盖 `register/unregister/get/list`，并补充 `setCurrent/getCurrent/export/exportAll` 契约。

## DNA 模板离线夹具

- `app/tests/unit.test.js` 的 `character dna` 与生命周期用例覆盖四景别、旧中文原文和权重、手工清空、精确景别选择；旧自由文本不自动拆分。
- `app/tests/image-source-adapters.test.js` 的 `gate:dna-template` 使用合成角色，覆盖 DBGen 工作台扁平回复交接、自身身份展开、相似名与跨角色提及、缺身份／景别、冲突模式、取消和其他来源隔离。真实 DBGen service/gateway 配合假 transport 捕获最终 wire；内置 NAI 普通生成及 infill 采用同样捕获方式。
- DBGen `tests/domain/flat-imagegen.test.js`、`tests/application/generate-slots.test.js`、`tests/domain/nai.test.js`、`tests/domain/img2img.test.js`、`tests/adapters/gateway.test.js` 覆盖旧 API、两条写词入口、新旁路与定稿 generate/img2img/infill。离线 fixture 不证明真实模型身份一致性、服务端开关行为、业务采用或全部存储回读。

### 命名衣装与内置一致性覆盖

- 衣装、作用域和预设的既有用例覆盖唯一新默认、原装映射、旧档保留、角色卡归属及保存失败；不从旧服装字段推断新默认。
- `auto-illustration.test.js` 的内置一致性、衣装预检、目标衣装契约和完整参考几何用例验证确认前零请求、来源失效、取消／迟到拒收、原快照保留及统一几何 plan。
- `cg-records-backup.test.js` 使用真实 IndexedDB Adapter 接口和已有事务替身，覆盖新旧轮次经文件备份、清缓存恢复的往返，以及坏来源拒收和私有租约剔除；不代表浏览器或酒馆实机事务验收。
- `preset-generated-library.test.js`、`asset-generation.test.js` 覆盖全库衣柜、候选和 CG 引用保留，读取失败拒删及删除边界的迟到引用复核。跨设置、CG 库与酒馆文件不承诺原子性。
- 生图功能以 IGS 内置 NAI 为目标；DBGen 相关夹具仅描述保留的兼容覆盖，不代表本轮已验证。操作与视觉验收表见 [命名衣装与内置一致性重绘](IGS_WARDROBE_CONSISTENCY.md)，本轮实际结果单独记录。

## 媒体生命周期夹具

- `media-cache-lifecycle`、`media-cache-concurrency`、`media-storage-lifecycle`、`media-transactions`、`media-settings-concurrency` 覆盖统一缓存、存储生命周期、事务与设置并发。
- `helpers/fake-idb.js` 模拟多 store 原子事务、abort、quota 与升级；`helpers/fake-media-server.js` 模拟文件和图片 API，不接触真实图库。
- 严格引用读取等待备份恢复完成；网络、非法 schema 或坏记录必须拒绝清理，合法空旧备份仍可恢复。文件回收用现有 `drain()` 等待备份确认与引用复核，不以固定延时推断完成。
- 真实酒馆、移动端解码内存和真实 provider 为未验证边界，不用 fixture 结果替代真机验收。

## 验证证据格式

只运行与变更相关的已有行为用例，命令使用 `node --test tests/<文件>.test.js`；构建入口以 `app/package.json` 为准。报告风险级别、证据文件、实际命令、发现数及通过／失败／取消／跳过数，并区分导入阻断与进入行为后的失败。历史记录中的门禁命令与计数不是本轮验证结果。

未覆盖真实 provider、真实 shujuku、酒馆／手机或性能边界时明确写为未验证；不将模拟结果称为实机验收。
