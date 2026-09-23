# 发布与打包工作流

本项目采用 GitHub 远程 bundle + 酒馆助手脚本 loader JSON 发布。loader 形态参考 `_inbox/酒馆助手脚本-玉子手机.json`。

## GitHub 仓库

- GitHub 账号：`Anyno001`
- 仓库名：`Immersive-Galgame-System-AnyNo001`
- 仓库地址：`https://github.com/Anyno001/Immersive-Galgame-System-AnyNo001`
- 本地仓库根目录：`D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System`
- 默认分支：`main`
- 当前可见性：public

本项目是独立 GitHub 仓库，不使用上级 `nailongwang-main` 仓库提交项目内容。上传前必须确认当前目录存在自己的 `.git/`。

## 目标形态

- `app/dist/igs.bundle.js`
- `app/dist/igs.bundle.css`
- `app/dist/manifest.json`
- `loader/igs-loader.json`
- `loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json`
- `loader/igs-loader.js`

`app/dist/igs.bundle.js` 是给 loader 远程加载的自包含主程序文件。它不能只是 `import ../src/index.js` 的转发入口，否则 cache bust 只会刷新入口文件，浏览器或酒馆仍可能复用旧的源码子模块。

## 边界

- 当前不走奶龙工具箱 `project.json / latest / tavern helper` 发布壳。
- loader 只负责加载远程 bundle。
- 主程序逻辑只来自 `app/`。
- 原版 Immersive Galgame System 只作为迁移来源和兼容参考，路径是 `D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System 原版备份`。
- 最终给用户导入的是版本化中文发布文件 `loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json`，不是 `app/dist/igs.bundle.js`。`loader/igs-loader.json` 保留为固定内部入口和自动化校验基准。

## loader JSON 格式

`loader/igs-loader.json` 和版本化中文发布文件必须都是 JS-Slash-Runner 可导入脚本：

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

`loader/igs-loader.js` 只做重复加载检查、版本解析、CSS 注入、JS 注入和错误提示，不承载业务 UI。
`loader/igs-loader.json` 不提供额外酒馆助手按钮；正式入口必须由主程序注入酒馆魔法棒菜单。

默认远程加载策略：

```text
GitHub API branches/main -> jsDelivr @<commit>/app/dist/igs.bundle.* -> 失败时 fallback 到 jsDelivr @main/app/dist/igs.bundle.*
```

loader 默认追踪 GitHub API 返回的 `main` 最新提交哈希，并优先加载该提交对应的不可变 bundle；酒馆端导入一次 loader 后，后续只要仓库 `main` 更新，就会继续拉取最新 bundle，不再要求 loader 源码同步改版本号。loader 会在远程主程序加载完成前先显示临时魔法棒入口，正式运行时加载后替换为正式入口。需要临时锁定旧版本或测试分支时，也可以手动设置 `window.IGS_LOADER_REF` 或 `window.IGS_LOADER_CONFIG.ref`；指定的非 `main` ref 不可用时会 fallback 到 `@main`。

## 后续建议命令

```text
npm run build:loader -- --release v<当前版本>
npm run gate
npm run build
npm run test
npm run simulate
npm run perf
```

这些命令属于 app 自身工程，不属于奶龙工具箱校验流程。
其中 `npm run build` 与 `npm run test` 会共同检查 dist bundle 自包含，避免自动更新脚本加载到旧子模块。

生成 loader JSON 后，必须额外验证 JSON 字段和 `content`：

先用 `npm run build:loader -- --release v<当前版本>` 生成版本化导入件；`npm run gate` 内的 `gate:loader:versioned-release-matches-source-and-internal-entry` 也会检查此产物和固定入口完全一致。

```powershell
node -e "const fs=require('fs'); const js=fs.readFileSync('loader/igs-loader.js','utf8'); const j=JSON.parse(fs.readFileSync('loader/igs-loader.json','utf8')); if(j.type!=='script'||j.content!==js||!j.content.includes('igs.bundle.js')) throw new Error('bad loader json');"
node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync('loader/igs-loader.json','utf8')); const b=JSON.parse(fs.readFileSync('loader/酒馆助手脚本-沉浸式Galgame系统（自动更新） v<当前版本>.json','utf8')); if(a.content!==b.content||a.name!==b.name) throw new Error('release json mismatch');"
```

## 上传流程

首次上传：

```powershell
cd "D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System"
git init -b main
git add .
git commit -m "Initialize Immersive Galgame System"
gh repo create Anyno001/Immersive-Galgame-System-AnyNo001 --public --source . --remote origin --push
```

后续更新：

```powershell
cd "D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System\app"
npm run build:loader -- --release v<当前版本>
npm run gate
cd ..
git status --short
git add .
git commit -m "<简短更新说明>"
git push origin main
git ls-remote --heads origin main
```

仅在真实酒馆复验通过后执行：

```powershell
git tag -a v<当前版本> -m "v<当前版本>: <简短更新说明>"
git push origin v<当前版本>
git ls-remote --tags origin v<当前版本>
```

## 每轮上传与真机复验后打标签

- 任何实现、修复、文档工作流变更、fixtures/test 变更，只要写入了文件，结束前都必须推送到 `origin/main`；真实酒馆复验通过前不创建版本标签。
- 复验通过后标签格式固定为 `vMAJOR.MINOR.PATCH`，必须与已验收版本的 `app/package.json` 对应。
- 标签已存在时禁止覆盖，提升 patch 版本再发布。
- 文档-only 任务可以跳过 `npm run gate`，但仍需提交、推送；打标签仍须等待真实酒馆复验，跳过验证须在最终回复说明。
- 上传必须在本项目独立仓库根目录执行，先确认 `git rev-parse --show-toplevel` 返回本项目目录。

如果需要给 SillyTavern loader 直接加载 GitHub raw bundle，先确认没有真实密钥、真实聊天记录、真实 shujuku 数据和本机私有路径，再保持仓库 public 或建立单独的公开发布仓库。

private raw 地址不能作为普通用户的最终自动更新源。真正发布前必须选择 public 仓库、公开 release asset 或单独公开发布仓库。

更完整的打包发布规则见 `docs/PACKAGING_WORKFLOW.md`。
