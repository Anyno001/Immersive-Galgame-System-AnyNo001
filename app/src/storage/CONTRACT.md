# storage 模块契约

## 职责

- 管理 IndexedDB、localStorage、Blob URL 和缓存迁移。
- 持久化本地背景、立绘、头像、预设、Mod 元信息和本地草稿。
- 提供容量统计、删除、迁移和坏数据回滚能力。
- 负责预设注册表快照的读写、归一化和坏数据回退，至少覆盖 `current`、`items`、`drafts` 和 `updatedAt`。

## 存储前缀

- IndexedDB：`vn`
- key 前缀：`vn:*`
- Blob URL 必须可重建，不作为唯一长期来源。
- `preset-store.js` 当前以 localStorage-compatible / memory adapter 固定契约，后续再替换为异步 IndexedDB adapter。
- `tavern-settings-file.js` 把全局配置键镜像到酒馆 `user/files/igs-settings.json`：启动时文件较新则写回本机，本机改动防抖上传；聊天内状态、日志、待审队列不进文件。新增全局配置键要加进它的白名单。
- 生图提示块、任务模块、current、草稿与默认／备份正文统一存于 `igs:preset-registry:v1`；单快照保存成功才替换内存并推进 epoch，失败不启用新版本。生图读取失败阻止写入覆盖；本地 revision 校验不是跨标签页事务。API 凭据不进提示词预设或导出包。
- 图像、衣装候选与设置分属不同存储，衣装保存后必须权威回读才绘图；采用失败保留同图供重试，不宣称跨存储原子提交。私有图像租约只留内存，不作为刷新恢复的持久身份；楼末候选仅存白名单，关闭／切目标后不得把迟到图片落库当作恢复成功。

## 禁止

- 禁止把本地文件只存在内存里导致刷新丢失。
- 禁止坏预设覆盖当前启用项。
- 禁止把真实 API Key 明文导出到预设或资源包。
