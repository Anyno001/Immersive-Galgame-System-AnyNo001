# NAI 生图控制

## 功能与设置

设置位置：生图与AI → 图像来源 → 内置 NAI；只控制内置 NAI，外部插件继续使用其自身设置。

| 功能 | 配置 | 行为 |
| --- | --- | --- |
| 生图间隔 | `nai.minIntervalEnabled` 默认 false；`nai.minIntervalMs` 默认 2000，范围 0–60000 毫秒 | 开关关闭时不额外等待；打开后，同一密钥的上一项请求真正结束后，下一项至少等待该间隔；0 不额外等待，不同密钥可并行 |
| 云端队列 | `nai.cloudQueue.enabled`，默认 false | 生成与局部重绘在本机串行及冷却后统一取号，获得放行再发送 NAI |
| 队列地址 | `nai.cloudQueue.endpoint` | 默认空；未填写时开关打开也不排队。旧版自动填入的公共节点地址在未开启队列时清空。设置页收在「间隔与排队」折叠区 |
| 排队超时 | `nai.cloudQueue.timeoutMs`，默认 180000，范围 10000–900000 毫秒 | 与生图超时分离，排队不消耗真正发送后的预算 |
| V5 Full 档位 | `nai.effort`，默认 high，可选 medium | 旧配置默认 High，Medium 实际使用对应专模，固定 14 步和 Euler Ancestral |

CG、立绘、背景、物品、卡面、头像与 infill 复用 NAI 客户端。间隔和云端队列不需要在每个素材服务重复实现；云端未放行的任务不制造本机完成冷却时间。设置沿原即时保存和模型预设；旧预设缺少 effort 时使用 High，缺少队列开关时关闭队列。

## 请求与取消

- 本机队列即使一度清空，新任务也遵守剩余冷却；429 自动重试取退避和用户间隔中较大值，不叠加外层重试。等待取消不发送，已发送后不提前释放本机凭据锁。
- 云端只发送标准 SHA-256 密钥标识、随机参与者/任务 ID 和锁 token；不发送明文密钥、NAI Authorization、提示词、图片或聊天。哈希复用现有 `imageSha256`，没有短哈希降级。
- 云端协议为 `POST /join-queue`、`GET /my-turn`、`POST /complete`、`POST /leave-queue`；每秒轮询，单次网络请求最多 10 秒，连续三次轮询失败退出。加入不自动重试，加入回执迟到时再退出同一任务。
- 锁仅属于单个任务闭包；获锁后等 1 秒，首次发送及每次 429 重试前检查原任务/token。失锁、超时、服务不可用或协议无效时停止，不绕过队列直接生成。
- 排队取消或目标失效时退出；已发送则等实际发送结束。网络发送状态未知时不主动释放云锁，由服务端过期回收；释放失败保留图片，不重新计费生成。
- 排队沿原 report 写日志，释放耗时单列“队列收尾”；日志不输出哈希、token 或陌生参与者个性语。

## Medium 模型

`nai-effort.js` 按最终用途模型映射，保留持久配置中的原步数与采样器：

- `nai-diffusion-5-full` → `nai-diffusion-5-full-medium`。
- `nai-diffusion-5-full-inpainting` → `nai-diffusion-5-full-medium-inpainting`。
- Medium 固定 `steps: 14`、`sampler: k_euler_ancestral`，省略 `cfg_rescale` 和 `skip_cfg_above_sigma`。
- V4、V4.5、V5 Curated 不因开关更换型号；CG/立绘/背景/物品的型号覆盖先解析，之后才应用档位。
- 设置页显示 Medium 的实际生效参数并锁定相应输入，切回 High 恢复原值。caption、画师、透明底、噪声计划、尺寸和编辑事务沿用原逻辑。
- 单独给 Full 设置 14 步不等于 Medium；不承诺固定的节费比例或画质等价。

## 与智绘姬的兼容与限制

参考：[st-chatu8](https://github.com/damoshen123/st-chatu8)，固定提交 `340a337b44b6089662408df3a33287fe50d45d75`，核对时间 2026-11-01。对照打包源码中的 `SerialLock.release`、`utils/queueService.js`、`generateNovelAI`、`cleanNovelAIPayload` 和 infill 路径，按 Gal 现有模块独立实现行为及协议，没有复制其成段代码、UI 或资源。

同一密钥、同一节点且都开启队列时，Gal 可与智绘姬按相同 SHA-256 标识共同排队；不同密钥分别排队。直接使用 NAI 官网或未接队列的插件不会被约束，同账号不同 Key 也不会自动合并。

[公共参考服务源码](https://huggingface.co/spaces/st-chatu/novelai-queue/blob/main/main.py)的 `LOCK_TIMEOUT=15`，`/my-turn` 不续租，也没有 heartbeat 接口。慢图超过 15 秒后仍可能与后续请求并发；客户端在发送前确认 token 不能消除此服务端限制，也不能保证线上部署与公开源码完全一致。需要严格覆盖慢任务时，应由服务端提供更长租约或续租，并让共用者使用相同兼容节点。

## 验证范围

- 使用模拟时钟和网络验证同 Key 串行/间隔、异 Key 并行、取消、真实发送后冷却、429 间隔与预算。
- 模拟两个独立客户端共享队列、生成与 infill、正式任务快照及用途覆盖、默认/自定义节点、关闭零访问、迟到加入回执、超时/轮询失败、未知发送状态、释放失败与失锁停止。
- 验证 Medium 模型及固定参数、旧设置/预设兼容、保存重开和切回 High 不丢配置。
- 0.39.1 独立测试件已由用户手测间隔（含 20000 毫秒）与 Medium，并观察到一次完整真实云端取号/放行/生成/结束成功。多人并发、慢图超过租约、实际计费和画质未现场验证。
- 本 PR 基于上游 main `c3c5f16d`（0.39.2）；34 项功能定向模拟检查和现有局部重绘/取消保护 2 项通过，构建以及正式/调试包自动与手动启动、关闭和重启检查通过；不提交 dist、loader、测试导入包，不修改版本或创建发布标签。保存提速修复由独立 PR #15 审查，不作为本 PR 的前置依赖。
