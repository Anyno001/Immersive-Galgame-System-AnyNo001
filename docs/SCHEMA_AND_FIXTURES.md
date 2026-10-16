# Schema、Fixtures 与模拟测试

本项目用机器可读 schema、fixtures 和模拟测试降低 AI 修改风险。真实酒馆实机不作为当前验收要求。

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

## 模拟测试矩阵

| 编号 | 测试域 | 目标 |
| --- | --- | --- |
| `S0` | loader | loader 地址拼接、缓存版本、远程 bundle fallback |
| `S1` | host | fake TavernHelper 消息读取、输入框写入、发送触发 |
| `S2` | scene | 正文解析、时空栏、说话人、情绪、空文本回退 |
| `S3` | resource match | 背景规则、立绘、头像和资源包命中 |
| `S4` | visual | 桌面/移动布局、图层顺序、视觉模式切换 |
| `S5` | choices | 选项浮窗、点击后写入输入框、取消和重复点击 |
| `S6` | generated-images | provider 队列、轮询、失败重试、结果归一化 |
| `S7` | shujuku | fake shujuku 增删改、刷新世界书、失败返回处理 |
| `S8` | storage | IndexedDB/localStorage 迁移、Blob URL 生命周期 |
| `S9` | registry | Mod / Preset / Pack 导入、权限声明、冲突检测 |
| `S10` | api | `window.IGS` 公开 API 权限、错误返回和兼容别名 |

## 当前覆盖补充（v0.2.5）

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
- 本轮执行范围仅内置链路，DBG 不纳入修改或验收。实际计数、历史失败、产物边界和真实视觉验收表见 [命名衣装与内置一致性重绘](IGS_WARDROBE_CONSISTENCY.md)。

## 命令约定

后续接入真实构建后，优先使用：

```text
npm run gate
```

当前可执行单项命令：

```text
npm run structure
npm run static
npm run test
npm run simulate
npm run perf
npm run build
```

pnpm 目标命令：

```text
pnpm gate
pnpm test
pnpm simulate
pnpm build
pnpm perf
```

命令未接入或无法执行时，AI 不得声称测试通过。应改为说明：

- 已做静态文档或调用链自检
- 哪些模拟测试尚未接入
- skipped 原因
- 残余风险

## 验证证据格式

每次实现完成后，最终回复或本地记录至少写明：

```text
风险级别：R1/R2/R3/R4/R5
静态证据：读取的 CONTRACT/docs/schema
模拟证据：运行的 S0-S10 项或 skipped 原因
命令证据：npm run gate 或 pnpm test/simulate/build/perf 的结果
残余风险：未覆盖真实 provider、真实 shujuku 或性能边界时写清楚
```

本项目的“实机验真”由 `S0-S10` 的模拟矩阵替代。只有用户明确要求发布实测时，才临时增加真实酒馆或真实 provider 验证。
