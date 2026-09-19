# CLAUDE.md

本文件是 Claude Code 的项目指令文件。

## 项目概述

Immersive Galgame System 是一个 SillyTavern（酒馆）的酒馆助手脚本，提供视觉小说阅读器、AI 图片生成集成、场景素材模式和统一设置面板。

## 关键路径

- 源码：`app/src/`
- 测试：`app/tests/`
- 构建产物：`app/dist/`
- 远程加载器：`loader/`
- 文档：`docs/`

## 验收命令

```bash
npm run gate    # 完整验收：structure + static + test + simulate + perf + build
npm test        # 单元测试（53 个）
npm run simulate # 模拟测试（37 个）
npm run build   # 构建 bundle
```

## 版本号同步清单

**每次 push 到 main 前都必须升 patch 版本号**（如 0.23.11 → 0.23.12），并同步更新以下文件：

1. `app/package.json` — `"version": "X.Y.Z"`
2. `app/src/core/bootstrap.js` — `const IGS_VERSION = 'X.Y.Z'`
3. `README.md` — 当前状态行和更新日志
4. 升号后必须 `npm run build`（dist bundle 内 `IGS version` 注释随之更新）+ `npm run build:loader`（更新 `loader/igs-loader.json` 自动更新版 + 生成当前版本的固定版 `loader/沉浸式Galgame系统 vX.Y.Z.json`）

## Loader 说明

`loader/` 下有两类 loader：

- **自动更新版** `igs-loader.json`（脚本名「沉浸式Galgame系统（自动更新）」）：拉取 `@main` 最新代码，push 到 main 后真机即可加载验证。这是开发/日常使用的 loader，固定一个文件、不带版本号。
- **固定版** `沉浸式Galgame系统 vX.Y.Z.json`：在 loader 源前注入 `IGS_LOADER_REF='vX.Y.Z'`，锁定加载该 tag 的 bundle、不自动更新。`build:loader` 会按当前 `package.json` 版本生成。固定版要真正可用，前提是 `vX.Y.Z` tag 已打并推送（否则 jsDelivr 拉 `@vX.Y.Z` 会 404）。

历史上曾每次升号生成一份「（自动更新） vX.Y.Z.json」副本，但它们内容全同且都指向 `@main`、不锁版本，纯属冗余，已于 v0.23.21 清理，并改为上述固定版机制。

`app/tests/gate-contract.test.js` 与 `app/tests/simulate.test.js` 自 v0.23.9 起已改为动态读 `package.json` 版本号（`pkgVersion`/`readJson`），无需手改；但升号后必须重新 `npm run build` 让 dist 版本号对齐，否则 `gate-contract` 校验 dist 版本会失败。

## 提交与推送规则

- 每次有文件改动必须提交并推送到 main（`git push origin main`）。
- **每次 push 前都升 patch 版本号并同步脚本内版本号**（见上文「版本号同步清单」），不复用上次已 push 的版本号。
- **tag 与 push 分离**：push 可随时累加；版本标签只在真机 CDP 测试通过后才打。loader 拉取 `@main`，push 到 main 后真机即可加载新代码验证。
- **tag 必须与脚本内版本号对齐**：真机验过的那一版版本号是 `X.Y.Z`，就打 `git tag vX.Y.Z`，不打不对应的号。
- 真机测试失败时，改完再升号 push（新版本号），真机重验；只给真机验过的那一版打 tag——失败的中间版本号只留在 commit 历史，不打 tag。
- 禁止覆盖旧标签；不要用 `git tag -d` + 重建的方式覆盖已推送的标签。

## Bug 修复闭环

修复 bug 按以下闭环，**真机测试通过才算结束、才打 tag**：

1. 修复 + 升 patch 版本号（同步脚本内版本号）+ `npm run build` + `npm run build:loader` + 本地 `npm run gate` 全绿。
2. 本地预验：用真机导出的真实数据本地复跑修复后代码，确认逻辑正确（第一道闸，能挡掉方向性错误）。
3. `git commit` + `git push origin main`（先推 main，让真机能加载新 bundle；暂不打 tag）。
4. CDP 真机测试：触发真机重载新 bundle，抓状态确认现象消失（第二道闸）。
5. 成功 → 给当前版本号打 `git tag vX.Y.Z` + `git push origin vX.Y.Z`，结束；失败 → 回第 1 步，再升号、再 push、再验，只给真机验过的版本打 tag。

真机调试用 CDP 直连自动注入（详见 `docs/AI_WORKFLOW.md` 的「真机调试与复验」）。CDP 不可用（用户不在/不愿重启浏览器/手机端）时，本地 gate + 真机导出数据本地复跑通过即可打 tag 结束，并在回复注明未做 CDP 真机终验。


## 修改前必读

1. `README.md`
2. `AGENTS.md`（协作规则，不要修改此文件）
3. 目标模块的 `CONTRACT.md`

## 代码风格

- 无注释优先，只在 WHY 不明显时加一行注释
- 不加 JSDoc、不加 TODO 注释
- 测试名以 `gate:` 前缀开头
- ES Module 语法，Node 原生 test runner

## 场景素材模式相关文件

- `app/src/scene/scene-directives.js` — @igs-scene 标签解析
- `app/src/host/prompt-injector.js` — AI 提示词注入
- `app/src/visual/igs-ui/reader-host.js` — 设置面板 + 阅读器渲染
- `app/src/scene/message-source.js` — 正文管线集成
