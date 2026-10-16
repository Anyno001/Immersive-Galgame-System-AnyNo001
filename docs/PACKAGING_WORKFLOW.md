# 酒馆助手脚本打包发布工作流

## 加载恢复与当前测试交付约定

- 每次更新升 patch、推送内测 `main`，为同一提交创建并推送 `test-vX.Y.Z`；不自动创建正式版 `vX.Y.Z` 标签。
- 构建使用 `npm.cmd run build` 与 `npm.cmd run build:loader -- --release test-vX.Y.Z`（须与 app/package.json 一致），生成 `沉浸式Galgame系统 test-vX.Y.Z.json`。`--pin` 保留锁定历史标签的能力，旧标签不得覆盖。
- CDN 模块失败或超时后，备用来源为 GitHub raw 的同一个提交或指定 ref，不跨版本回退到 CDN main。下载内容校验 IGS 文件头和版本后以 JavaScript Blob 模块加载，资源基址保留原下载地址，加载结束释放 Blob；连接中断最多重试一次。
- 本次是启动器源码变更：用户需要重新导入 `loader/igs-loader.json` 一次，仅刷新旧脚本不能获得新下载逻辑。样式和字体仍从同 ref 的 CDN 加载；真实酒馆和手机验收与本地执行分开记录。

## 固定测试版必须严格锁定（test-v0.36.66）

`build:loader -- --release test-vX.Y.Z` 通过替换 loader 内部 `PINNED_REF` 常量生成固定文件。固定版不得被全局配置覆盖，不请求 main 或其他版本作为后备；失败明确报所需 tag，实际 API 版本也必须匹配。只有同来源和同版本实例可复用。自动版 JSON 仍与 loader 源文一致；固定版内容为同一源文仅替换内部固定 tag 常量。

## 精简后的检查范围

已删除结构/静态/性能门禁脚本、批量测试入口和低价值断言，不保留原清单再默认跳过。行为用例的保留依据见 `../app/tests/README.md`；构建不附带全量检查。下载或启动故障直接核对实际发布响应与执行结果，不以 HTTP 200、构建成功或测试数量代替启动。

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

本工作区的内测项目根（发布版副本不属于默认推送目标）：

```text
Immersive-Galgame-System-AnyNo001/
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
loader/沉浸式Galgame系统 test-v<当前版本>.json
```

`loader/igs-loader.json` 是自动更新入口，内容与 `loader/igs-loader.js` 原文一致；固定测试文件 `loader/沉浸式Galgame系统 test-v<当前版本>.json` 使用同一源文，只替换内部 `PINNED_REF`，脚本名与测试标签一致。固定版失败不得回退 main。

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
| 酒馆导入发布 | A. JS-Slash-Runner Script JSON | `loader/igs-loader.json` + `loader/沉浸式Galgame系统 test-v<当前版本>.json` | `window.TavernHelper` 环境中的 loader |

不要把最终导入 JSON 写进 `app/src/`。不要把主程序业务逻辑写进 `loader/`。

## 发布前检查

每次生成可发布 loader 前，先运行：

```powershell
cd Immersive-Galgame-System-AnyNo001/app
npm.cmd run build
npm.cmd run build:loader -- --release test-v<当前版本>
```

`--release` 只接受与 `app/package.json` 一致的 `test-vX.Y.Z`，生成锁定该测试标签的 `沉浸式Galgame系统 test-vX.Y.Z.json`，并删除 loader/ 里所有旧的版本化导入件（只留最新一份）；推送时必须同时推送同名 tag。固定版失败明确报错，不回退 main。每次升版本后先生成对应导入件，再直接核对实际发布响应和启动结果。无参数的 `build:loader` 仍只更新固定入口和调试版。

`npm.cmd run build` 负责产物完整性及自包含检查，不在测试中重复锁定相同源码写法。`gate-contract.test.js` 保留实际 bundle 冷启动、销毁与重启验证，按启动问题选用。只改文档时只检查相关说明和引用。

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
JSON.parse(fs.readFileSync('loader/沉浸式Galgame系统 test-v<当前版本>.json', 'utf8')).content ===
    fs.readFileSync('loader/igs-loader.js', 'utf8').replace("const PINNED_REF = '';", 'const PINNED_REF = "test-v<当前版本>";')
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
GitHub API branches/main -> jsDelivr @<commit>/app/dist/igs.bundle.* -> 失败时下载并执行 GitHub raw 同一 <commit> 的 bundle
```

自动版默认读取并短期缓存 `main` 的提交哈希，优先加载不可变的 `@<commit>` bundle。仅未取得提交时使用 main；已选定提交后的加载失败不跨版本回退。无需每次修改 loader 源码版本号。
loader 先注册临时魔法棒入口，正式运行时启动后替换。自动版可由 `window.IGS_LOADER_REF` 或 `window.IGS_LOADER_CONFIG.ref` 指定 ref；固定测试版始终使用内部 `PINNED_REF`。指定 ref 不可用时只尝试同 ref 的备用来源，失败明确报错，不回退 main。

## 推荐发布步骤

```powershell
cd Immersive-Galgame-System-AnyNo001/app
npm.cmd run build
npm.cmd run build:loader -- --release test-v<当前版本>
```

```powershell
cd ..
git status --short
# 仅 git add 本轮修改的具体文件
git commit -m "Prepare loader packaging workflow"
git push origin main
git ls-remote --heads origin main
```

每次更新都为本次提交创建并推送测试标签：

```powershell
git tag -a test-v<当前版本> -m "test-v<当前版本>: Prepare loader packaging workflow"
git push origin test-v<当前版本>
git ls-remote --tags origin test-v<当前版本>
```

## 每轮推送与测试回退点规则

2026-10-15 用户新规则：每次更新均推送 main 和 `test-vX.Y.Z` 测试标签，不自动创建正式版标签；真实设备验证单独记录。每轮有文件改动时必须完成：

```powershell
git rev-parse --show-toplevel
cd app
npm.cmd run build
npm.cmd run build:loader -- --release test-v<当前版本>
cd ..
# 仅 git add 本轮修改的具体文件
git commit -m "Release v<当前版本>: <本轮说明>"
git push origin main
git ls-remote --heads origin main
```

每次更新都为本次提交创建并推送测试标签：

```powershell
git tag -a test-v<当前版本> -m "test-v<当前版本>: <本轮说明>"
git push origin test-v<当前版本>
git ls-remote --tags origin test-v<当前版本>
```

`git rev-parse --show-toplevel` 必须指向内测目录 `Immersive-Galgame-System-AnyNo001`，且 origin 为上述内测仓库。不得从工作区上级或发布版副本提交。如果标签已存在，不强推覆盖，提升 patch 版本后重新发布。

真正生成 `loader/igs-loader.json` 和版本化中文发布文件后，还需要验证：

```powershell
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('loader/igs-loader.json','utf8')); if(j.type!=='script'||typeof j.content!=='string'||!j.content.includes('igs.bundle.js')) throw new Error('bad loader json');"
# 固定测试版按上文 PINNED_REF 替换式比对；debug JSON 只与 igs-loader-debug.js 比对。
```

## 更新日志要求

- 项目级发布流程、loader、bundle、版本、GitHub 上传说明：写入本项目 `README.md`。
- 具体打包命令和发布限制：写入 `docs/RELEASE.md` 与本文件。
- 原版 Immersive Galgame System 迁移注意事项：写入本文件或单独迁移文档。
- 当前迁移说明：`docs/VISUAL_NOVEL_MIGRATION.md`
- 不要写入 `奶龙工具箱/CHANGELOG.md`，除非修改的是工具箱本身的流程、Schema、CI 或知识库。
