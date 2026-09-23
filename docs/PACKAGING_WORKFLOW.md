# 酒馆助手脚本打包发布工作流

本文件是未来 AI 处理“打包、发布、更新、上传、生成酒馆助手脚本 JSON”时的固定入口。换对话后，先读本文件，再读 `docs/RELEASE.md`。

## 固定结论

- 最终发布形态：JS-Slash-Runner / 酒馆助手脚本 JSON。
- 参考样例：`D:\下载\酒馆\奶龙王\nailongwang-main\_inbox\酒馆助手脚本-玉子手机.json`。
- 发布策略：主程序远程 bundle，酒馆导入件只做自动更新 loader。
- 本项目默认不走奶龙工具箱 `project.json / latest / tavern helper` 发布壳。
- 本项目默认不运行奶龙工具箱 `pack-project`、`verify-project`、`validate`、`check-refs`，除非用户明确要求重新接入奶龙工具箱流程。

## 原版脚本来源

原版 Immersive Galgame System 脚本项目：

```text
D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System 原版备份
```

关键文件：

```text
projects/Immersive Galgame System 原版备份/project.json
projects/Immersive Galgame System 原版备份/tavern helper/bridge/src/source.js
projects/Immersive Galgame System 原版备份/tavern helper/bridge/src/index.js
projects/Immersive Galgame System 原版备份/tavern helper/bridge/src/ui/reader/original-reader.js
projects/Immersive Galgame System 原版备份/latest/酒馆助手脚本-沉浸式Galgame系统 v9.6.6.json
projects/Immersive Galgame System 原版备份/latest/Immersive Galgame System v9.6.6.js
```

原版公开 API 兼容面：

```text
openSettings()
getConfig()
getUnifiedSettings()
openViewerFromMessage()
openLatestAvailable()
generateImage()
destroy()
```

迁移或兼容这些能力时，先在 IGS 中增加 fixtures 和模拟测试，再考虑修改 `Immersive Galgame System` 本体。

## IGS 源码与产物

IGS 项目根：

```text
D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System
```

主程序源码：

```text
app/src/
```

构建产物：

```text
app/dist/igs.bundle.js
app/dist/igs.bundle.css
app/dist/manifest.json
```

`app/dist/igs.bundle.js` 必须是自包含发布文件，不得在运行时继续 `import ../src/index.js` 或其它 `app/src` 模块。loader 只会给入口 bundle 加 cache bust，如果入口再静态导入未带刷新参数的源码子模块，酒馆同一页面可能继续复用旧模块，导致已修复逻辑没有真正生效。

酒馆导入产物：

```text
loader/igs-loader.json
loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json
```

`loader/igs-loader.json` 是固定内部入口，便于脚本和测试稳定定位；`loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json` 是给用户导入的版本化发布文件。两者内容必须一致，且 JSON 的 `name` 必须保持 `沉浸式Galgame系统（自动更新）`。

loader 源码：

```text
loader/igs-loader.js
```

`loader/igs-loader.js` 只允许做这些事：

- 检查是否重复加载。
- 解析远程版本或固定版本。
- 注入 `igs.bundle.css`。
- 注入 `igs.bundle.js`。
- 给控制台输出加载状态和错误原因。

`loader/igs-loader.js` 不允许承载阅读器、设置面板、shujuku、Provider、Mod、Preset、Pack 或业务 UI。
`loader/igs-loader.json` 不提供额外酒馆助手按钮；真正用户入口只能由 `app/src/host/magic-wand-entry.js` 注入酒馆魔法棒菜单。

## 模式判定

本项目发布打包涉及两个模式：

| 阶段 | 模式 | 输出 | 入口 |
| --- | --- | --- | --- |
| IGS 主程序开发 | B. JS-Slash-Runner 纯 JS 脚本 / 独立 bundle 源码 | `app/dist/igs.bundle.js` | `window.IGS` / `window.ImmersiveGalgameSystem` |
| 酒馆导入发布 | A. JS-Slash-Runner Script JSON | `loader/igs-loader.json` + `loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json` | `window.TavernHelper` 环境中的 loader |

不要把最终导入 JSON 写进 `app/src/`。不要把主程序业务逻辑写进 `loader/`。

## 发布前检查

每次生成可发布 loader 前，先运行：

```powershell
cd "D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System\app"
npm run build:loader -- --release v<当前版本>
npm run gate
```

`--release` 接受与 `app/package.json` 一致的版本号并生成版本化自动更新导入件；每次升版本后先生成对应导入件，再运行包含发布产物一致性测试的 `gate`。无参数的 `build:loader` 仍只更新固定入口和调试版。

`gate` 顺序固定为：

```text
structure -> static -> test -> simulate -> perf -> build
```

如果只改文档，可以不跑 `npm run gate`，但最终回复必须说明 skipped 原因。
`npm run build` 会检查 `igs.bundle.js` 不含运行时 `import`；`npm run test` 也会通过 `gate:dist-bundle:is-self-contained-for-loader-cache-bust` 防止发布入口退化成源码转发壳。

## loader JSON 格式

`loader/igs-loader.json` 和版本化中文发布文件必须保持这种结构：

```json
{
  "type": "script",
  "enabled": false,
  "name": "沉浸式Galgame系统（自动更新）",
  "id": "<固定 UUID>",
  "content": "<loader/igs-loader.js 的原文>",
  "info": "Immersive Galgame System 自动更新 loader。",
  "button": {
    "enabled": true,
    "buttons": [
      {
        "name": "Gal模拟",
        "visible": true
      }
    ]
  },
  "data": {},
  "export_with": {
    "data": true,
    "button": true
  }
}
```

`content` 必须是可直接执行的 JavaScript 字符串。JSON 反序列化后应满足：

```js
JSON.parse(fs.readFileSync('loader/igs-loader.json', 'utf8')).content === fs.readFileSync('loader/igs-loader.js', 'utf8')
JSON.parse(fs.readFileSync('loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json', 'utf8')).content === fs.readFileSync('loader/igs-loader.js', 'utf8')
```

## 远程 bundle 地址规则

当前 GitHub 仓库：

```text
https://github.com/Anyno001/Immersive-Galgame-System-AnyNo001
```

当前仓库已计划开放为 public。普通 SillyTavern 用户只能通过公开 GitHub raw、jsDelivr 或公开 Release 资产稳定加载远程 bundle；如果仓库重新设为 private，必须选择其中一个方案：

1. 将仓库保持 public，并使用 GitHub raw 或 jsDelivr 地址。
2. 源码仓库 private，另建公开发布仓库，只放 `app/dist` 和 loader。
3. 使用公开 GitHub Release 资产，并让 loader 指向 release asset。

发布前必须确认远程 bundle 中没有真实 API key、cookie、token、私有聊天记录、真实 shujuku 数据或本机私有路径。

当前 loader 默认链路：

```text
GitHub API branches/main -> jsDelivr @<commit>/app/dist/igs.bundle.* -> 失败时 fallback 到 jsDelivr @main/app/dist/igs.bundle.*
```

loader 默认读取 `main` 的最新提交哈希，并优先加载不可变的 `@<commit>` bundle，避免 jsDelivr `@main` 分支文件缓存卡住旧代码，也避免新版本标签短时未同步；不再需要每次发版都修改 `loader/igs-loader.js` 的内置版本号。
为了让魔法棒入口更早出现，loader 会在远程主程序加载完成前先注册一个临时入口；正式 IGS 运行时加载后会替换为正式入口。需要临时锁定旧版本或测试分支时，可由用户手动设置 `window.IGS_LOADER_REF = 'v0.3.6'`、`window.IGS_LOADER_REF = 'main'` 或 `window.IGS_LOADER_CONFIG.ref`。如果手动指定的非 `main` ref 在 jsDelivr 上不可用，loader 会 fallback 到 `@main`，避免导入脚本直接失败。

## 推荐发布步骤

```powershell
cd "D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System\app"
npm run build:loader -- --release v<当前版本>
npm run gate
```

```powershell
cd "D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System"
git status --short
git add .
git commit -m "Prepare loader packaging workflow"
git push origin main
git ls-remote --heads origin main
```

真实酒馆复验通过后才执行：

```powershell
git tag -a v<当前版本> -m "v<当前版本>: Prepare loader packaging workflow"
git push origin v<当前版本>
git ls-remote --tags origin v<当前版本>
```

## 每轮推送与验收后回退点规则

后续 AI 每轮结束时，只要本项目有文件改动，必须完成：

```powershell
git rev-parse --show-toplevel
cd app
npm run build:loader -- --release v<当前版本>
npm run gate
cd ..
git add .
git commit -m "Release v<当前版本>: <本轮说明>"
git push origin main
git ls-remote --heads origin main
```

仅在真实酒馆复验通过后执行：

```powershell
git tag -a v<当前版本> -m "v<当前版本>: <本轮说明>"
git push origin v<当前版本>
git ls-remote --tags origin v<当前版本>
```

`git rev-parse --show-toplevel` 必须返回 `D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System`。如果标签已存在，不强推覆盖，提升 patch 版本后重新发布。

真正生成 `loader/igs-loader.json` 和版本化中文发布文件后，还需要验证：

```powershell
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('loader/igs-loader.json','utf8')); if(j.type!=='script'||typeof j.content!=='string'||!j.content.includes('igs.bundle.js')) throw new Error('bad loader json');"
node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync('loader/igs-loader.json','utf8')); const b=JSON.parse(fs.readFileSync('loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json','utf8')); if(a.content!==b.content||a.name!==b.name) throw new Error('release json mismatch');"
```

## 更新日志要求

- 项目级发布流程、loader、bundle、版本、GitHub 上传说明：写入本项目 `README.md`。
- 具体打包命令和发布限制：写入 `docs/RELEASE.md` 与本文件。
- 原版 Immersive Galgame System 迁移注意事项：写入本文件或单独迁移文档。
- 当前迁移说明：`docs/VISUAL_NOVEL_MIGRATION.md`
- 不要写入 `奶龙工具箱/CHANGELOG.md`，除非修改的是工具箱本身的流程、Schema、CI 或知识库。

## 未来实现清单

- [x] 新增 `loader/igs-loader.js`。
- [x] 新增生成 `loader/igs-loader.json` 的脚本。
- [x] 给 loader JSON 增加反解校验。
- [ ] 确认公开远程 bundle 地址。
- [x] 在模拟测试中加入 loader 字段校验。
- [ ] 发布前更新 README 版本日志与 `app/dist/manifest.json` 版本。
