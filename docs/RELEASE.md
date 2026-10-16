# 发布与打包工作流

## 固定测试版锁定规则（test-v0.36.66）

固定文件将 `PINNED_REF` 写为对应 `test-vX.Y.Z` 内部常量，禁止回退 main 或其他版本，禁止页面残留 ref/base 覆盖。模块必须实际创建该版本 API，否则关闭错误实例并明确报错。仅推送程序包不会更新酒馆中已导入的 loader 源码，启动器修复需重新导入对应固定版 JSON。

## 精简后的检查范围

已删除无用、重复、仅锁定源码或 CSS 字面量的检查及门禁执行入口；不以默认跳过代替删除，不重建等价全量运行器。保留行为回归见 `../app/tests/README.md`。构建只生成发布文件，发布时核对实际产物、下载和启动行为，不能用构建成功或 HTTP 200 代替启动结果。

本项目采用 GitHub 远程 bundle + 酒馆助手脚本 loader JSON 发布。loader 形态参考 `_inbox/酒馆助手脚本-玉子手机.json`。

## GitHub 仓库

- GitHub 账号：`Anyno001`
- 仓库名：`Immersive-Galgame-System-AnyNo001`
- 仓库地址：`https://github.com/Anyno001/Immersive-Galgame-System-AnyNo001`
- 本工作区内测仓库根目录：`Immersive-Galgame-System-AnyNo001/`；同级发布版副本未经明确授权不修改或推送。
- 默认分支：`main`
- 当前可见性：public

本项目是独立 GitHub 仓库，不使用上级 `nailongwang-main` 仓库提交项目内容。上传前必须确认当前目录存在自己的 `.git/`。

## 目标形态

- `app/dist/igs.bundle.js`
- `app/dist/igs.bundle.css`
- `app/dist/manifest.json`
- `loader/igs-loader.json`
- `loader/沉浸式Galgame系统 test-v<当前版本>.json`
- `loader/igs-loader.js`

`app/dist/igs.bundle.js` 是给 loader 远程加载的自包含主程序文件。它不能只是 `import ../src/index.js` 的转发入口，否则 cache bust 只会刷新入口文件，浏览器或酒馆仍可能复用旧的源码子模块。

## 边界

- 当前不走奶龙工具箱 `project.json / latest / tavern helper` 发布壳。
- loader 只负责加载远程 bundle。
- 主程序逻辑只来自 `app/`。
- 原版 Immersive Galgame System 只作为迁移来源和兼容参考，路径是 `D:\下载\酒馆\奶龙王\nailongwang-main\奶龙工具箱\projects\Immersive Galgame System 原版备份`。
- 固定测试导入件为 `loader/沉浸式Galgame系统 test-v<当前版本>.json`，内容仅替换源 loader 的内部 `PINNED_REF`，不回退 main；自动更新入口 `loader/igs-loader.json` 的内容与源 loader 一致。两者都不是直接导入 `app/dist/igs.bundle.js`。

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
GitHub API branches/main -> jsDelivr @<commit>/app/dist/igs.bundle.* -> 失败时下载并执行 GitHub raw 同一 <commit> 的 bundle
```

自动版追踪并短期缓存 `main` 提交，优先加载对应不可变 bundle；只有未取得提交时才使用 main，已选定提交后不跨版本回退。loader 先显示临时魔法棒入口，运行时启动后替换。自动版可通过 `window.IGS_LOADER_REF` 或 `window.IGS_LOADER_CONFIG.ref` 指定 ref，固定版始终服从内部 `PINNED_REF`；指定 ref 不可用时只尝试同 ref 备用来源，失败明确报错。

## 后续建议命令

```text
npm.cmd run build
npm.cmd run build:loader -- --release test-v<当前版本>
```

这些命令属于 app 自身工程，不属于奶龙工具箱校验流程。
构建只生成发布文件；实际发布响应和启动结果需要直接获取并执行确认。

生成 loader JSON 后，必须额外验证 JSON 字段和 `content`：

先用 `npm run build:loader -- --release test-v<当前版本>` 生成版本化导入件，再直接核对其 JSON 字段及 loader 原文一致性。

```powershell
node -e "const fs=require('fs'); const js=fs.readFileSync('loader/igs-loader.js','utf8'); const j=JSON.parse(fs.readFileSync('loader/igs-loader.json','utf8')); if(j.type!=='script'||j.content!==js||!j.content.includes('igs.bundle.js')) throw new Error('bad loader json');"
# 固定测试 JSON 与同一源 loader 仅替换内部 PINNED_REF 后的文本完全一致，脚本名和版本同时锁定 test-v<当前版本>。
```

## 上传流程

首次上传：

```powershell
cd Immersive-Galgame-System-AnyNo001
git init -b main
git add .
git commit -m "Initialize Immersive Galgame System"
gh repo create Anyno001/Immersive-Galgame-System-AnyNo001 --public --source . --remote origin --push
```

后续更新：

```powershell
cd Immersive-Galgame-System-AnyNo001/app
npm.cmd run build
npm.cmd run build:loader -- --release test-v<当前版本>
cd ..
git status --short
# 只 git add 已审查的本轮具体文件，不携带无关改动
git commit -m "<简短更新说明>"
git push origin main
git ls-remote --heads origin main
```

每次更新都为本次提交创建并推送测试标签：

```powershell
git tag -a test-v<当前版本> -m "test-v<当前版本>: <简短更新说明>"
git push origin test-v<当前版本>
git ls-remote --tags origin test-v<当前版本>
```

## 每轮上传并打测试标签

- 任何实现、修复、文档工作流变更、fixtures/test 变更，只要写入了文件，结束前都必须推送到 `origin/main`；同时创建并推送 `test-vMAJOR.MINOR.PATCH` 测试标签。
- 测试标签版本必须与该提交的 `app/package.json` 对应；不自动创建 `vMAJOR.MINOR.PATCH` 正式版标签，正式发布须用户另行明确要求。
- 标签已存在时禁止覆盖，提升 patch 版本再发布。
- 文档任务只检查相关说明和引用，不增加行为测试；提交、推送须在当前任务授权范围内。测试标签不代表真实设备验收，未终验时保留边界。
- 上传必须在本项目独立仓库根目录执行，先确认 `git rev-parse --show-toplevel` 返回本项目目录。

如果需要给 SillyTavern loader 直接加载 GitHub raw bundle，先确认没有真实密钥、真实聊天记录、真实 shujuku 数据和本机私有路径，再保持仓库 public 或建立单独的公开发布仓库。

private raw 地址不能作为普通用户的最终自动更新源。真正发布前必须选择 public 仓库、公开 release asset 或单独公开发布仓库。

更完整的打包发布规则见 `docs/PACKAGING_WORKFLOW.md`。
