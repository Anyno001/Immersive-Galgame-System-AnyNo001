# Visual Novel AI 协作流程

## 门禁与测试精简

- 对整套已有门禁筛选实际价值，删除无用、重复或只锁定源码写法和样式字面量的检查，不以默认不运行代替删除，也不无差别删除有效行为回归。
- 不为凑数量或覆盖率新增测试，不自动重建全量门禁。围绕实际故障直接定位、修复并核对结果；构建只负责生成发布文件。
- 排查下载、语法或启动错误时，直接获取实际发布响应并执行对应文件；不把酒馆、手机调试或导出数据作为这类排查的前提。
- 本地构建成功、测试数量或 HTTP 200 均不能证明下载内容有效或程序已经启动。交付只报告本轮实际执行结果。

本文件是 `projects/Visual Novel/` 的项目级协作规则。上级分流仍以 `../../AGENTS.md` 与 `../../../AGENTS.md` 为准；本项目当前是独立 app 工程，最终发布为独立酒馆助手脚本 loader JSON，不默认接入奶龙工具箱发布壳。

## 基本约定

- 项目目录以当前本地工作区中的本项目独立 Git 仓库为准，不依赖固定盘符或历史检出路径。
- 默认工作形态：`loader/` 只放远程 bundle loader，主程序只放 `app/`。
- 最终导入产物：`loader/酒馆助手脚本-Visual Novel（自动更新） v<当前版本>.json`，格式参考 `D:\下载\酒馆\奶龙王\nailongwang-main\_inbox\酒馆助手脚本-玉子手机.json`；`loader/vn-loader.json` 保留为固定内部入口和自动化校验基准。
- 原版脚本来源：`D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Visual Novel 原版备份`。
- 打包发布入口文档：`docs/PACKAGING_WORKFLOW.md` 与 `docs/RELEASE.md`。
- 不新增 `project.json`、`latest/`、`archive/`、`tavern helper/` 等奶龙工具箱发布壳目录，除非用户明确要求重新接入工具箱流程。
- 不运行奶龙工具箱 `pack-project`、`verify-project`、`validate`、`check-refs` 作为本项目验收，除非用户明确要求。
- 不提交真实 API key、cookie、token、私有聊天记录、真实 shujuku 数据库或用户本地资源。
- 项目级变更只记录在本目录 `README.md`，不写入奶龙工具箱 `CHANGELOG.md`。
- 防止结构腐化是硬要求：改动前先读现有模块契约，优先复用已有入口、类型、helper 与状态流。

## 任务风险级别

每次开始前先判断风险，并按风险选择验证动作。

- `R0` 只读、讨论、方案：不改文件、不验证、不提交、不发布。
- `R1` 文档、契约、fixtures 计划或非运行逻辑修改：检查相关文件自洽，必要时运行静态检索，不打包、不发布。
- `R2` 单模块普通 JS/CSS 小改：选择能验证本次行为变化的已有用例；不追加全量测试。
- `R3` 跨模块运行时、状态、registry、storage、shujuku、generated-images 或公开 API 修改：只对当前改动做必要的定向检查，禁止自动批量测试。
- `R4` loader、dist、发布流程、版本号或远程 bundle 链路修改：生成发布文件，直接获取并执行实际发布文件，记录下载和启动结果。
- `R5` 真实 provider、真实 shujuku 写入、真实用户数据迁移或不可逆操作：先用 fake provider / fake shujuku / fixtures 做确定性模拟，真实链路必须等用户明确确认。

本项目常规验证以 Visual Novel 模拟测试替换 NailongHub 的安装版实机验真。例外：bug 修复在模拟测试覆盖不到、或现象只在用户真实酒馆+存量数据下出现时，按 `docs/AI_WORKFLOW.md` 的「真机调试与复验」用 CDP 直连（F12 手动探针兜底）做真机定位与终验，真实设备验证单独记录；每次更新均推送 `vX.Y.Z` 版本标签，统一使用 `vX.Y.Z` 版本标签。

## 执行清单规则

功能修改、bug 修复、结构调整和发布流程改动开始时，使用短清单推进，并在每项完成后立即更新状态。

```text
- [ ] 确认目标、工作树与受影响的调用链
- [ ] 完成修改及必要的调用方、文档同步
- [ ] 验证受影响的真实行为；涉及产物时核对构建结果
- [ ] 回传实际结果与未验证范围
```

只列当前任务适用的事项，不为填满清单增加测试或检查。提交、推送和打标签仅在当前任务授权范围内执行。

## 修改前读取顺序

1. 根目录 `README.md`
2. 本文件 `AGENTS.md`
3. `docs/AI_WORKFLOW.md`
4. `功能总集表.md`
5. 目标模块 `app/src/<模块>/CONTRACT.md`
6. 涉及跨模块数据时读取 `docs/ARCHITECTURE.md` 与 `docs/SCHEMA_AND_FIXTURES.md`
7. 涉及打包、发布、上传、loader、远程 bundle、GitHub Release 或酒馆助手脚本 JSON 时读取 `docs/PACKAGING_WORKFLOW.md` 与 `docs/RELEASE.md`

shujuku 数据层读取 `app/src/data/shujuku/CONTRACT.md`。模型提示词 schema 读取 `app/src/prompts/schemas/CONTRACT.md`。跨模块通用 schema 读取 `app/src/schemas/CONTRACT.md`。

## 防结构腐化约束

- 改动前先搜索调用链，不只在报错点附近补丁。
- 同类逻辑第二次出现可以接受，第三次必须抽 helper、adapter 或注册表。
- 新功能必须有明确归属层：host、core、scene、visual、media、registry、storage、generated-images、prompts、shujuku-panel、api。
- 不在入口文件堆业务逻辑；入口只做启动、注册和模块装配。
- 不复制粘贴 provider、preset、pack、mod 的相似代码，优先走统一 adapter 或数据驱动映射。
- 每个新能力要走统一注册、统一权限、统一日志和统一模拟测试入口。
- 兜底逻辑必须写清触发条件、可删除条件和测试样例。
- 修改后检查未使用代码、死分支、重复常量、重复 CSS token 与跨层依赖。

## 验证与模拟测试

验证证据按层记录：

- 行为回归：从 `app/tests/` 选择与本次改动直接相关的已有用例，用 `node --test tests/<文件>.test.js` 执行；选择依据是行为风险，不是源码写法、样式字面量或测试数量。
- 构建与启动：需要生成产物时，在 `app/` 执行 `npm.cmd run build`；bundle 冷启动、销毁与重启检查保留为独立行为验证。
- 实际环境：fake host、fixtures 与 Node 测试不等于真实酒馆、手机或真实 provider 验收；性能结论须注明实际运行路径与测量条件。

验证未执行或失败时如实报告，不为填补清单新建测试矩阵或恢复已删除的门禁。

## 发布策略

- 只讨论、只规划、只审查时，不提交、不打包、不发布。
- 用户要求实现时，默认做到本地修改、文档更新、可执行范围内的模拟验证、升版本号、提交、推送 GitHub main；同时按「GitHub 回退点硬要求」创建并推送 `vX.Y.Z` 版本标签。
- 用户明确要求只做本地草稿、不上传或不打标签时，才跳过 GitHub 上传；最终回复必须说明 skipped 原因。
- 用户明确要求发布酒馆导入件时，才额外生成 loader、release notes 或 GitHub Release。
- 发布候选不得依赖真实 API key、真实聊天记录或真实 shujuku 数据作为唯一验证来源。
- 最终给酒馆导入的是版本化中文发布文件，不是 `app/dist/vn.bundle.js`，也不是原版 `Visual Novel` 的 `latest/*.json`。
- `loader/vn-loader.json` 和版本化中文发布文件的 `content` 必须来自 `loader/vn-loader.js` 原文，JSON 反序列化后必须完全一致。
- 远程 bundle 地址必须是普通用户可访问的公开地址；当前 private 仓库的 raw 地址不能作为最终发布源。
- 发布流程、字段格式和校验命令以 `docs/PACKAGING_WORKFLOW.md` 为准。

## GitHub 回退点硬要求

版本号、tag 与修复闭环的细则以 `CLAUDE.md` 的「版本号同步清单 / 提交与推送规则 / Bug 修复闭环」为准，本节与其保持一致。

- 每一轮产生文件改动、push 到 main 前都必须升 patch 版本号并同步脚本内版本号（`app/package.json`、`app/src/core/bootstrap.js` 的 `IGS_VERSION`、`README.md`），不复用上次已 push 的版本号；升号后 `npm run build` + `npm run build:loader -- --release v<当前版本>` 让 dist 与 loader 版本号对齐。
- 结束前必须在本项目独立仓库选择性暂存本轮文件，执行 `git commit`、`git push origin main`，保留无关工作区改动。
- **2026-10-18 用户纠正**：经用户授权发布时，标签统一使用 `vX.Y.Z`，与程序及在线导入包版本一致；不再创建带 test 前缀的新标签。标签不代表真实设备验收，验证范围另行记录。
- 修复继续变化时再次升号、提交并推送新的版本标签；CDP 不可用时明确记录真实酒馆和手机未终验，不阻断版本标签交付。
- 版本标签已存在时不得强推覆盖；提升 patch 版本重来。
- 上传前必须确认 `git rev-parse --show-toplevel` 指向当前本地工作区中的本项目独立仓库，且 `origin` 与本项目目标 GitHub 仓库一致；禁止从上级仓库提交本项目，不以历史绝对路径作为上传门禁。
- 上传后必须回查 `git status --short --branch`、`git ls-remote --heads origin main`；打 tag 后回查 `git ls-remote --tags origin v<当前版本>`，确认远程分支和标签存在。
- 只有用户明确要求“只本地修改/不要上传/不要打标签”时才能跳过；跳过必须写入最终回复和必要的 README/docs 技术债记录。

## 技术债记录

实现、修复、发布或替代验证后，如果留下技术债、临时方案、无法执行的验证或后续步骤，必须记录在项目 `README.md` 更新日志或相关 docs 中。

记录至少包含：

- 已完成内容
- 技术债或 skipped 项
- 暂时留下原因
- 下一步处理计划
- 建议处理版本或触发时机

## 版本号规则

程序版本使用 `MAJOR.MINOR.PATCH`；每次更新的版本标签使用 `vMAJOR.MINOR.PATCH`，统一使用 `vX.Y.Z` 版本标签。

- 文档、契约、测试计划补充：增加 patch，例如 `v0.1.5` -> `v0.1.6`
- 新功能模块或可用模拟测试：增加 minor，并重置 patch，例如 `v0.1.6` -> `v0.2.0`
- 运行时边界或发布形态重大变化：增加 major，并重置 minor/patch，例如 `v0.9.4` -> `v1.0.0`

每次版本变化至少同步更新根 `README.md` 的当前状态和更新日志。

## 最终回复要求

完成后用简体中文说明：

- 修改了哪些文件
- 风险级别
- 已运行的验证项和 skipped 项
- GitHub push 和版本标签结果
- 是否新增抽象
- 是否留下技术债和残余风险

如果本轮只修改本地协作文档，且用户未要求提交，要明确说明未提交。
