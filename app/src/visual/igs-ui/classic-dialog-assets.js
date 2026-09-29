// 西欧古典三片素材横向拼接后的 PNG：对话框 110/744/110 × 184，姓名牌 65/244/65 × 68。
// 源图在 assets/dialog-themes/western-classic/，构建脚本按字面占位符把素材外置到 dist/skins/。
export const CLASSIC_DIALOG_ASSETS = Object.freeze({
    dialog: '__IGS_ASSET__western-classic/dialog.png__',
    name: '__IGS_ASSET__western-classic/name.png__',
});

export const CLASSIC_DIALOG_ASSET_META = Object.freeze({
    dialog: Object.freeze({ width: 964, height: 184 }),
    name: Object.freeze({ width: 374, height: 68 }),
});
