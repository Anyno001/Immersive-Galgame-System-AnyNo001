# Visual Novel AI 协作流程

本文件是 `projects/Visual Novel/` 的项目级协作规则。上级分流仍以 `../../AGENTS.md` 与 `../../../AGENTS.md` 为准；本项目当前是独立 app 工程，最终发布为独立酒馆助手脚本 loader JSON，不默认接入奶龙工具箱发布壳。

## 基本约定

- 默认项目目录：`D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Visual Novel`
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
- `R2` 单模块普通 JS/CSS 小改：运行相关单测或最小模拟测试，能运行时再补 `pnpm test`。
- `R3` 跨模块运行时、状态、registry、storage、shujuku、generated-images 或公开 API 修改：运行 `pnpm test`、`pnpm simulate`、必要的局部 smoke。
- `R4` loader、dist、发布流程、版本号或远程 bundle 链路修改：运行 `pnpm build`、`pnpm simulate`、`pnpm perf`，并保留模拟发布证据。
- `R5` 真实 provider、真实 shujuku 写入、真实用户数据迁移或不可逆操作：先用 fake provider / fake shujuku / fixtures 做确定性模拟，真实链路必须等用户明确确认。

本项目常规验证以 Visual Novel 模拟测试替换 NailongHub 的安装版实机验真。例外：bug 修复在模拟测试覆盖不到、或现象只在用户真实酒馆+存量数据下出现时，按 `docs/AI_WORKFLOW.md` 的「真机调试与复验」用 CDP 直连（F12 手动探针兜底）做真机定位与终验，真机验过才打 tag。

## 执行清单规则

功能修改、bug 修复、结构调整和发布流程改动开始时，使用短清单推进，并在每项完成后立即更新状态。

```text
- [ ] 理解需求并确认风险级别
- [ ] 检查当前工作区状态
- [ ] 阅读 README、AGENTS、AI_WORKFLOW 与目标模块 CONTRACT
- [ ] 检查是否已有可复用模块，避免重复补丁
- [ ] 实现修改
- [ ] 更新 README 更新日志和相关 docs
- [ ] 按风险级别运行模拟测试或记录 skipped 原因
- [ ] 提交本项目 Git 仓库、推送 `origin/main`、创建并推送版本标签
- [ ] 回传变更、验证证据、技术债与残余风险
```

不适用的项目标记为 `[x] 不适用：原因`。失败的项目保持未完成状态，并在最终回复说明当前状态。

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

- 静态证据：读取过的 `CONTRACT.md`、docs、schema 或调用链。
- 单元证据：`pnpm test` 或目标测试文件。
- 模拟证据：`pnpm simulate`，使用 fake TavernHelper、fake shujuku、fake image provider 与 fixtures。
- 构建证据：`pnpm build`。
- 性能证据：`pnpm perf`，重点看移动端布局、大图资源、轮询和缓存。

当前未接入命令时，不伪造通过结果。应补充 fixtures、测试矩阵或 skipped 原因，并说明残余风险。

## 发布策略

- 只讨论、只规划、只审查时，不提交、不打包、不发布。
- 用户要求实现时，默认做到本地修改、文档更新、可执行范围内的模拟验证、升版本号、提交、推送 GitHub main；版本标签按「GitHub 回退点硬要求」在真机验证通过后才打。
- 用户明确要求只做本地草稿、不上传或不打标签时，才跳过 GitHub 上传；最终回复必须说明 skipped 原因。
- 用户明确要求发布酒馆导入件时，才额外生成 loader、release notes 或 GitHub Release。
- 发布候选不得依赖真实 API key、真实聊天记录或真实 shujuku 数据作为唯一验证来源。
- 最终给酒馆导入的是版本化中文发布文件，不是 `app/dist/vn.bundle.js`，也不是原版 `Visual Novel` 的 `latest/*.json`。
- `loader/vn-loader.json` 和版本化中文发布文件的 `content` 必须来自 `loader/vn-loader.js` 原文，JSON 反序列化后必须完全一致。
- 远程 bundle 地址必须是普通用户可访问的公开地址；当前 private 仓库的 raw 地址不能作为最终发布源。
- 发布流程、字段格式和校验命令以 `docs/PACKAGING_WORKFLOW.md` 为准。

## GitHub 回退点硬要求

版本号、tag 与修复闭环的细则以 `CLAUDE.md` 的「版本号同步清单 / 提交与推送规则 / Bug 修复闭环」为准，本节与其保持一致。

- 每一轮产生文件改动、push 到 main 前都必须升 patch 版本号并同步脚本内版本号（`app/package.json`、`app/src/core/bootstrap.js` 的 `IGS_VERSION`、`README.md`），不复用上次已 push 的版本号；升号后 `npm run build` + `npm run build:loader` 让 dist 与 loader 版本号对齐。
- 结束前必须在本项目独立仓库执行 `git add .`、`git commit`、`git push origin main`。
- **tag 与 push 分离**：push 可随时累加；版本标签只在真机 CDP 测试通过后才打，且**必须与脚本内版本号对齐**（验过的那一版是 `vX.Y.Z` 就打 `vX.Y.Z`）。真机调试用 CDP 直连优先、F12 手动探针兜底（见 `docs/AI_WORKFLOW.md` 的「真机调试与复验」）。
- 真机测试失败时改完再升号 push，真机重验；失败的中间版本号只留 commit 历史、不打 tag。CDP 不可用时本地 gate + 真机导出数据本地复跑通过即可打 tag，并在回复注明未做 CDP 真机终验。
- 版本标签已存在时不得强推覆盖；提升 patch 版本重来。
- 上传前必须确认 `git rev-parse --show-toplevel` 指向 `D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Visual Novel`，禁止从上级 `nailongwang-main` 仓库提交本项目。
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

当前项目版本使用 `vMAJOR.MINOR.PATCH`。

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
