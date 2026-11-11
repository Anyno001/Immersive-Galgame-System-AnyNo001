# Schema、Fixtures 与模拟测试

本项目保留运行时数据 schema 与真实行为回归所需的 fixtures。模拟结果与真实酒馆验收分开记录。

0.36.88 本地草稿的角色 DNA 新增可选 `clearedViews` 景别名数组，由手动主体编辑维护、由 `normalizeCharacterDna` 保留。负面词占位与主动清空分开处理；旧记录缺少此字段仍按已保存空主体兼容读取。角色完整参考、共享任务取消、来源隔离和丢图采用的定向复现见 `app/tests/external-sprite-dna.test.js`、`app/tests/builtin-entry-flow.test.js` 与 `app/tests/asset-scope.test.js`；不接触真实用户记录。

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

0.36.88 本地迁入增加角色绑定、三景别/衣装模板与 prompt recipe 的纯校验，见 `schemas/character-meta.js`、`outfit-template.js`、`prompt-recipe.js`。旧 DNA 保留原格式，显式升级按角色进行。preset snapshot 保留生图草稿、默认基线和备份；CG 一致性字段继续经过当前 WAL、原子 revision、统一图片引用与 GC，不替换媒体数据库。对应的 fake 入口、存储与协议检查及未验证边界见 [PR #8 审核记录](PR8_PORT_REVIEW_20261016.md)，不恢复全量运行器。

| 数据 | Schema / 归属 | 回归重点 |
| --- | --- | --- |
| 内容缓存 | `igs-image-cache` v4，files 内容 / meta 别名与 displayCompressed | 同内容去重、原子 quota abort、高低水位批量 LRU、活跃租约、多页面失效、压缩模式切换/重启、清理中断、四路下载、销毁 |
| 图片业务记录 | 素材 schema v2；CG / 照片原有 schema | 原图不可变、metadata 不读像素、revision 冲突、重画失败保旧图 |
| 媒体日志 / 备份 | `igs-media-journal` v1；四类酒馆备份 v2 | WAL 准备失败、离线上传恢复、版本合并、tombstone 防复活、浏览器数据丢失后恢复删除队列 |
| 配置引用 | `igs-settings.json` v2；地图记录独立权威 | 网络/500 不覆盖、远程键合并、地图旧配置迁移与删除、导入新 ID/共享链接/头像/失败补偿 |

新增 `media-cache-lifecycle`、`media-cache-concurrency`、`media-storage-lifecycle`、`media-transactions`、`media-settings-concurrency` 测试。`helpers/fake-idb.js` 模拟多 store 原子事务、abort、quota 与升级；`helpers/fake-media-server.js` 模拟文件和图片 API，不接触真实图库。真实酒馆、移动端解码内存和真实 provider 为未验证边界，不用这些 fixture 结果替代真机验收。

0.36.88 旧立绘迁移补全：普通衣装的 `base` 与 `moods` 分别承接原默认和表情，`legacyOriginal: 1` 标记旧注记归属；`igs:sprite-migration:pending` 为本机多键恢复日志，`spriteMigrationNotesPending` 保护文件未确认的旧注记。运行证据见 `outfit-migration.test.js` 的启动、导入、重启、文件确认和故障恢复用例；这些检查使用 fake 存储/端口。

2026-10-17 来源边界修正：上述三景别、recipe 和发送快照约束只用于内置生成。外部 DBGen 的 fixture 仅实现现有 `generateSinglePrompt` / `generate`，不声明新能力；`external-image-boundary.test.js` 确认 DNA 只附参考、插件完整内容保持、缺景别可生成、不接管插件 LLM，不伪造发送证据。来源切换遗留的内置未展开占位符不会直接送交外部计费出图。

可选外部建档新增布尔 `bridge.imageApi.externalSpriteDna`（默认 false）。`external-sprite-dna.test.js` 使用真实 IGS 资料预设/解析和模拟副 API、模拟外部接口核对先建档保存再出图、关闭零增量请求、手动确认/取消、旧档复用、并发去重、失败后恢复、目标失效与卡级/草稿持久化；不代表真实模型输出或插件联调验收。

自动建档补充同楼十人仅一次副 API/一次设定读取、乱序回复归属、排除已有 DNA、主名/别名去重、漏角色整批拒收、任一目标变化拒收，以及重叠楼层共享角色但不阻塞新角色的行为回归；不依赖源码字符串或请求实现写法。

可选 `bridge.imageCache.compressDisplay` 缺省 false，旧配置不会自动启用。显示转码/迟到结果拒收、同模式重启复用、原图导出不污染缓存、素材包五类图片字段/默认映射/备注往返及 CRC/回滚由 `display-archive.test.js` 定向覆盖；`tavern-image-cache.test.js` 检查数量/字节超限批量清到 80%、最近访问顺序与后续写入余量。独立无头 Chrome 使用生成的 2000×2400 透明测试图核对实际 WebP、透明度和原图字节，不连接真实图库或 provider。

缓存批量清理补全：`cache-eviction` 为阅读器正文、12 类辅助 Map、音频、解码与图片索引统一 80% 低水位，数量向下取整且至少一项。registry 统计增加 `lowWaterRatio`，不修改业务 schema 或 TTL；`media-cache-governance.test.js` 覆盖本所有者/全局字节批量回收与完整视图，`reader-floor-preparation.test.js` 覆盖 8→6 楼及准备复用，`tts.test.js` 覆盖 60→48 / 300→240 与清理后的迟到任务。全仓检查范围和保留的业务历史见 [容量淘汰核查](CACHE_EVICTION_AUDIT_20261017.md)。

卡牌战斗 v0.39.84：`offer.payload.randomKey` 为可选新增字段，旧记录仍可读取与重放；新续战记录也保留随机键。特性序号 `expectedDraws` 仅作写入前预检，不进入历史载荷。`combat-random-domain.test.js` 覆盖跨聊天隔离及旧奖励/准备/会话兼容，`combat-trait-draw.test.js` 补充生成防重入与过期序号拒收；所有数据均为内存替身。
