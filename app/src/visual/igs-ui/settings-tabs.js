// 正文解析：标签筛选与正文格式化两张折叠卡（原基础页）。
const PARSE_TEMPLATE = `
<div class="igs-settings-grid" data-settings-pane="parse">
  <div class="igs-source-filter igs-perf-group">
    <details data-advanced="source-filter"{{advancedFilterOpen}}>
      <summary><b>标签解析</b><span class="igs-perf-brief">{{filterBrief}}</span></summary>
      <div class="igs-perf-group-body">
        <div class="igs-settings-row igs-filter-toggle-row">{{filterToggle}}{{resetBasicSourceFilter}}</div>
        <div class="igs-settings-sub"{{filterHidden}}>
          <div class="igs-source-filter-grid">
            {{textIncludeField}}
            {{textExcludeField}}
            {{imageIncludeField}}
            {{htmlCardField}}
            {{imageCountField}}
          </div>
          <div class="igs-settings-section">{{filterOptionToggles}}</div>
        </div>
      </div>
    </details>
  </div>
  <div class="igs-source-filter igs-perf-group igs-body-format">
    <details data-advanced="body-format"{{advancedBodyFormatOpen}}>
      <summary><b>正文格式化</b><span class="igs-perf-brief">{{regexBrief}}</span></summary>
      <div class="igs-perf-group-body">
    {{regexToggle}}
    <div class="igs-settings-sub"{{regexHidden}}>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="virtual-regex"{{advancedRegexOpen}}>
        <summary>查找与替换</summary>
        <div class="igs-source-filter-grid">
          {{regexPatternField}}
          {{regexFlagsField}}
          <div class="igs-settings-full">{{regexReplacementField}}</div>
        </div>
        {{regexExtraRules}}
      </details>
      <div class="igs-settings-row">
        <button class="igs-settings-action" data-action="reset-virtual-regex" type="button">恢复默认</button>
        <button class="igs-settings-action" data-action="test-virtual-regex" type="button">测试本楼</button>
      </div>
      <div class="igs-settings-preview" data-result="virtual-regex">{{regexPreview}}</div>
    </div>
      </div>
    </details>
  </div>
</div>
`.trim();

// 备份：导出 / 导入 / 本页诊断，本地缓存。
const BACKUP_TEMPLATE = `
<div class="igs-settings-grid" data-settings-pane="backup">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">备份</div>
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="settings-export-all" type="button">导出配置</button>
      <button class="igs-settings-action" data-action="settings-import-all" type="button">导入配置</button>
      <button class="igs-settings-action" data-action="copy-page-diagnostic" type="button">本页诊断</button>
    </div>
    <div class="igs-source-filter-note">配置不含素材图片和API Key；导入不覆盖已有素材。</div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">本地缓存</div>
    <div class="igs-source-filter-grid">{{imageCacheCountField}}</div>
    {{imageCompressionField}}
    <div class="igs-source-filter-note">开启后降低显示占用；下载与编辑仍用原图。</div>
    <div class="igs-settings-row"><button class="igs-settings-action" data-action="purge-asset-cache" type="button" title="清空浏览器里缓存的图片和设置页缩略图，酒馆上的原图不动">清素材缓存</button></div>
    <div class="igs-link-row"><button class="igs-link-btn" data-action="image-cache-status" type="button">查看占用</button><span aria-hidden="true">·</span><button class="igs-link-btn" data-action="image-records-retry-backup" type="button">重试备份</button><span aria-hidden="true">·</span><button class="igs-link-btn" data-action="image-files-retry-delete" type="button">重试删除</button></div>
    <div class="igs-source-filter-note">{{imageCacheStatus}}</div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">朗读缓存</div>
    <div class="igs-source-filter-grid">{{ttsCacheField}}</div>
    <div class="igs-settings-row"><button class="igs-settings-action" data-action="tts-trim-cache" type="button">清理朗读缓存</button></div>
    <div class="igs-source-filter-note">{{ttsCacheStatus}}</div>
  </div>
</div>
`.trim();

const IMAGE_SOURCE_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="source">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">图像来源</div>
    {{imageSourceField}}
    <div class="igs-source-filter-note">{{imageSourceNote}}</div>
    {{globalArtistField}}
    <div class="igs-settings-sub" data-image-feature="external-sprite-dna"{{sourceExternalHidden}}>
      {{externalSpriteDnaField}}
    </div>
    <div class="igs-settings-sub" data-image-feature="sprite-matte-color">
      {{spriteMatteColorField}}
    </div>
    <div class="igs-settings-sub" data-image-source="nai"{{sourceNaiHidden}}>
      <div class="igs-source-filter-grid">
        <div class="igs-settings-full">{{autoNaiEndpointField}}</div>
        {{autoNaiKeyField}}{{autoNaiTransportField}}
        {{autoNaiModelField}}{{autoNaiSizeField}}
      </div>
      {{modelProfileImageRow}}
      <div class="igs-settings-sub" data-image-feature="nai-transparency"{{sourceBuiltinHidden}}>
        {{naiSpriteTransparentField}}
      </div>
      <div class="igs-settings-result" data-result="nai-models">{{autoNaiModelsMessage}}</div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="nai"{{advancedNaiOpen}}>
        <summary>采样参数</summary>
        <div class="igs-source-filter-grid">
          {{autoNaiStepsField}}{{autoNaiScaleField}}
          {{autoNaiSamplerField}}
        </div>
      </details>
    </div>
    <div class="igs-settings-sub" data-image-source="extension"{{sourceExtensionHidden}}>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="extension"{{advancedExtensionOpen}}>
        <summary>识别与等待</summary>
        <div class="igs-source-filter-grid">{{adapterField}}{{pollIntervalField}}{{pollAttemptsField}}</div>
      </details>
    </div>
    <div class="igs-settings-sub" data-image-source="dbgen"{{sourceDbgenHidden}}>
      {{dbgenSpriteTransparentField}}
    </div>
    <div class="igs-settings-sub" data-image-feature="consistency"{{sourceConsistencyHidden}}>
      <div class="igs-source-filter-grid">{{consistencyStrengthField}}{{consistencyModelField}}</div>
    </div>
    <div class="igs-settings-row"><button class="igs-settings-action" data-action="test-image" type="button">{{imageTestActionLabel}}</button><button class="igs-settings-action" data-action="open-dbgen-settings" type="button"{{sourceDbgenHidden}}>插件设置</button></div>
    <div class="igs-settings-result" data-result="image">{{imageTestHelp}}</div>
  </div>
  <div class="igs-source-filter" data-image-prompt-entry{{sourceBuiltinHidden}}>
    <div class="igs-source-filter-title">提示词组</div>
    <div class="igs-source-filter-note">已内置默认词组。</div>
    <div class="igs-settings-row"><button type="button" class="igs-settings-action" data-setting-go="image-prompt-presets">查看 / 编辑</button></div>
  </div>
</div>
`.trim();

const IMAGE_LLM_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="llm">
  <div class="igs-source-filter" data-image-feature="llm">
    <div class="igs-source-filter-title">备用模型</div>
    <div class="igs-source-filter-note">{{autoLlmNote}}</div>
    <div class="igs-source-filter-note" data-image-feature="llm-warn"{{autoLlmWarnHidden}}>{{autoLlmWarn}}</div>
    <div class="igs-source-filter-grid">
      {{autoLlmSourceField}}{{autoLlmContextField}}
    </div>
    <div class="igs-settings-sub"{{autoLlmApiHidden}}>
      <div class="igs-source-filter-grid">
        {{autoLlmEndpointField}}{{autoLlmKeyField}}
        {{autoLlmModelField}}
      </div>
      {{modelProfileLlmRow}}
      <div class="igs-settings-result" data-result="llm-models">{{autoLlmModelsMessage}}</div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="llm-request"{{autoLlmRequestOpen}}>
        <summary><b>请求参数</b></summary>
        <div class="igs-source-filter-note">写法同酒馆自定义源，YAML或JSON。</div>
        <div class="igs-settings-full">{{autoLlmIncludeHeadersField}}</div>
        <div class="igs-settings-full">{{autoLlmIncludeBodyField}}</div>
        <div class="igs-settings-full">{{autoLlmExcludeBodyField}}</div>
      </details>
    </div>
  </div>
  {{imagePromptPanel}}
  <div class="igs-source-filter" data-image-feature="llm-prompts">
    <details class="igs-settings-sub igs-settings-advanced" data-advanced="llm-prompts"{{autoLlmPromptsOpen}}>
      <summary><b>附加词</b></summary>
      <div class="igs-settings-full">{{autoLlmJailbreakHeadField}}</div>
      <div class="igs-settings-full">{{autoLlmJailbreakTailField}}</div>
    </details>
  </div>
</div>
`.trim();

const IMAGE_LOGS_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="logs">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">生图日志</div>
    <div class="igs-source-filter-note">出图失败时在这里看原因。</div>
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="image-log-refresh" type="button">刷新</button>
      <button class="igs-settings-action" data-action="image-log-copy" type="button">复制</button>
      <button class="igs-settings-action" data-action="image-log-clear" type="button">清空</button>
    </div>
    <div class="igs-settings-result" data-result="image-log">{{imageLogStatus}}</div>
    <div class="igs-image-log-list" data-image-log-list>{{imageLogList}}</div>
    <details class="igs-settings-sub igs-settings-advanced" data-advanced="image-log-retain"{{advancedImageLogOpen}}>
      <summary>自动清理</summary>
      <div class="igs-source-filter-grid">{{imageLogRetainDaysField}}{{imageLogMaxEntriesField}}</div>
    </details>
  </div>
</div>
`.trim();

const IMAGE_CG_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="cg">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">CG库</div>
    <div class="igs-source-filter-note">已生成的CG，点击图片查看大图。</div>
    <div class="igs-cg-actions">
      <div class="igs-cg-actions-row"><span class="igs-cg-actions-label">查看</span>
        <button class="igs-settings-action" data-action="image-cg-refresh" type="button">刷新</button>
        <button class="igs-settings-action" data-action="image-cg-order" type="button" aria-pressed="{{imageCgOldestFirst}}" title="倒序：切换最新在前 / 最早在前">{{imageCgOrderLabel}}</button>
        <button class="igs-settings-action" data-action="open-cg-gallery" type="button">收藏隐藏</button>
        <button class="igs-settings-action" data-action="image-cache-clear" type="button">清缓存</button>
      </div>
      <div class="igs-cg-actions-row"><span class="igs-cg-actions-label">删除</span>
        <button class="igs-settings-action" data-action="image-cg-select-all" type="button">全选</button>
        <button class="igs-settings-action" data-action="image-cg-delete-selected" type="button">删选中</button>
        <button class="igs-settings-action is-danger" data-action="image-cg-delete-all" type="button">删全部</button>
      </div>
    </div>
    <div class="igs-settings-result" data-result="image-cg">{{imageCgStatus}}</div>
    <div class="igs-image-cg-grid" data-image-cg-list>{{imageCgList}}</div>
  </div>
</div>
`.trim();

// 生图内容按类别分卡片（角色 / 表情差分 / Q 版 / 场景与物品 / CG / NSFW），开关、模型、画师串都在卡片里，见 settings-prompt-kinds.js。
const IMAGE_AUTO_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="auto">
  <div class="igs-source-filter-note">{{imageContentNote}}</div>
  <div class="igs-source-filter-note" data-image-feature="llm-warn"{{autoLlmWarnHidden}}>{{autoLlmWarn}}</div>
  {{promptKindsPanel}}
  {{artistLibraryPanel}}
</div>
`.trim();

const READER_DIALOG_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="dialog">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">风格{{resetReaderDialogStyle}}</div>
    {{dialogSkinField}}
    {{gradientVeilFields}}
    {{magicHouseField}}
    <div class="igs-settings-row igs-switch-stack igs-dialog-style-options">{{statusLineToggle}}</div>
    <div class="igs-source-filter-grid">{{resumePromptField}}</div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">尺寸{{resetReaderDialogSize}}</div>
    <div class="igs-source-filter-grid">
      {{dialogWidthField}}
      {{classicDialogWidthPercentField}}
      {{skinDialogScaleField}}
      {{dialogHeightField}}
      {{dialogAutoHeightField}}
      {{inputScaleField}}
    </div>
  </div>
  <div class="igs-source-filter igs-perf-group">
    <details data-advanced="dialog-glass"{{advancedDialogGlassOpen}}>
      <summary><b>面板透明度</b><span class="igs-perf-brief">{{glassScopeNote}}</span></summary>
      <div class="igs-perf-group-body">
    <div class="igs-source-filter-grid">
      {{glassOpacityField}}
      {{dialogBgOpacityField}}
      {{dialogBgField}}
    </div>
    <div class="igs-settings-row">{{backdropFilterToggle}}{{resetReaderDialogBackground}}</div>
      </div>
    </details>
  </div>
</div>
`.trim();

const READER_TEXT_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="text">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">排版{{resetReaderTextLayout}}</div>
    <div class="igs-source-filter-grid">
      {{fontSizeField}}
      {{dialogFontWeightField}}
    </div>
    <div class="igs-settings-row">{{dialogTextEffectToggle}}</div>
    {{dialogTextEffectOptions}}
  </div>
  <div class="igs-source-filter igs-text-style">
    <div class="igs-source-filter-title">文字样式{{resetReaderTextStyle}}</div>
    <div class="igs-source-filter-note"{{themeNoteHidden}}>开启「角色」页的场景素材模式后可自定义</div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">角色名</div><div class="igs-settings-row">{{nameFontField}}{{nameColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">台词</div><div class="igs-settings-row">{{textFontField}}{{textColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">旁白</div><div class="igs-settings-row">{{narrationFontField}}{{narrationColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">心里话</div><div class="igs-settings-row">{{thoughtFontField}}{{thoughtColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{dividerHidden}}><div class="igs-settings-subhead">分隔线</div><div class="igs-settings-row">{{dividerField}}{{dividerColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">上传字体</div>{{customFontManager}}</div>
    <div class="igs-settings-group igs-text-style-line igs-system-role"{{themeHidden}}><div class="igs-settings-subhead">系统消息</div>{{systemRoleFields}}</div>
    {{systemRoleAdvanced}}
  </div>
</div>
`.trim();

const READER_PERFORMANCE_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="performance">{{performanceSections}}</div>
`.trim();

// 「界面」分类拆四个子页：阅读器 / 背景状态 / 选项 / 工具栏；每页都保留 data-reader-pane="interface"，引导和测试按它找。
const READER_UI_READER_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="interface" data-ui-sub="reader">
  {{openModeField}}
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">阅读器</div>
    <div class="igs-settings-row">{{settingsToggles}}</div>
  </div>
  {{shortcutsField}}
</div>
`.trim();

const READER_UI_BG_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="interface" data-ui-sub="bg">
  <div class="igs-source-filter"><div class="igs-source-filter-title">背景图{{resetReaderInterfaceBackground}}</div><div class="igs-source-filter-grid">{{imgModeField}}{{imgBrightnessField}}</div></div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">状态栏{{resetReaderInterfaceStatusHud}}</div>{{statusHudSection}}</div>
</div>
`.trim();

const READER_UI_OPTION_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="interface" data-ui-sub="option">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">选项气泡{{resetReaderInterfaceOptionBubble}}</div>
    {{optionBubbleToggle}}
    <div class="igs-settings-sub"{{optionBubbleHidden}}>
      {{optionFontSizeField}}
      {{optionBubbleWidthToggle}}
      {{optionBubblePositionField}}
      {{optionBubbleActionField}}
      {{optionSourcesField}}
    </div>
  </div>
</div>
`.trim();

const READER_UI_BAR_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="interface" data-ui-sub="bar">
  <div class="igs-source-filter"><div class="igs-source-filter-title">工具栏{{resetReaderInterfaceToolbar}}</div><div class="igs-source-filter-grid">{{toolbarScaleField}}{{toolbarDockField}}{{inputPlacementField}}{{toolbarSplitField}}{{toolbarPlateField}}{{dialogBarAlignField}}</div>{{pinnedButtonsField}}</div>
</div>
`.trim();

// 角色、场景两个分类的所有页面顶部共用的头部：素材模式开关和当前角色卡；开关关闭时内容整块隐藏。
const SCENE_HEAD_TEMPLATE = `
<div class="igs-scene-settings">
  <div class="igs-settings-row">{{sceneToggle}}</div>
  <div class="igs-scene-settings-content"{{sceneHidden}}>
    {{assetScopeBar}}
    <div class="igs-scene-settings-subpane">{{scenePane}}</div>
  </div>
</div>
`.trim();

// 写法规则：发给聊天模型的格式规则，可关掉自动注入改由酒馆预设提供。
const RULES_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="rules">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">AI格式规则<span class="igs-outfit-muted">{{promptRuleTag}}</span></div>
    {{promptRuleToggle}}
    <details class="igs-settings-sub igs-settings-advanced" data-advanced="prompt-rule-edit"{{advancedPromptRuleOpen}}>
      <summary>规则内容与注入位置</summary>
      {{promptRuleHint}}
      {{promptRuleField}}
      <div class="igs-settings-row">
        <button class="igs-settings-action" data-action="reset-prompt-rule" type="button">恢复默认</button>
        <button class="igs-settings-action" data-action="save-prompt-rule" type="button">保存</button>
        <button class="igs-settings-action" data-action="copy-prompt-rule" type="button" title="复制到酒馆预设">复制预设</button>
      </div>
      <div class="igs-settings-result" data-result="prompt-rule">{{promptRuleStatus}}</div>
      {{promptRuleOutfitHint}}
      {{promptPlacementField}}
    </details>
    {{promptAdvanced}}
  </div>
</div>
`.trim();

// 衣柜与情绪：只在生图时用的衣柜提示词，和聊天、生图共用的情绪组。
const WARDROBE_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="wardrobe">
  <div class="igs-source-filter" data-wardrobe-section>
    <div class="igs-source-filter-title">衣柜提示词<span class="igs-outfit-muted">生图用</span>{{wardrobeSelectToggle}}<button class="igs-btn-mgr-icon igs-title-add" data-action="wardrobe-add" type="button" title="添加一条衣柜提示词" aria-label="添加一条衣柜提示词">+</button></div>
    <div class="igs-source-filter-note">生成服装立绘时使用的服装描述；未指定时使用同名的那一条。</div>
    {{wardrobeSection}}
  </div>
  <div class="igs-source-filter" data-mood-section>
    <div class="igs-source-filter-title">情绪组<span class="igs-outfit-muted">聊天与生图共用</span></div>
    <div class="igs-source-filter-note">情绪词按组匹配立绘，缺图时依次回退到相近档位和默认立绘。</div>
    {{moodSection}}
  </div>
</div>
`.trim();

// 预置CG：作者预置的、正文触发的 CG；在 CG库 页底部的折叠「高级：正文触发的预置CG」里。
const EVENTCG_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="eventcg">
  <div class="igs-source-filter" data-event-cg-section>
    <div class="igs-source-filter-title">预置CG<button class="igs-btn-mgr-icon igs-title-add" data-action="event-cg-add" type="button" title="添加一张预置CG" aria-label="添加一张预置CG">+</button></div>
    <div class="igs-source-filter-note">正文出现触发词或[igs-cg:名字]时显示对应图片，命中的楼层不再生成过场CG。</div>
    {{eventCgSection}}
  </div>
</div>
`.trim();

export { RULES_TEMPLATE, WARDROBE_TEMPLATE, EVENTCG_TEMPLATE, SCENE_HEAD_TEMPLATE, PARSE_TEMPLATE, BACKUP_TEMPLATE };

// 数值系统：总开关在最上；关闭时下方整块隐藏，只留一行说明。
const STATS_TEMPLATE = `
<div class="igs-settings-grid" data-settings-pane="stats">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">数值系统</div>
    <div class="igs-settings-row">{{statsToggle}}</div>
    <div class="igs-source-filter-note"{{statsOffNoteHidden}}>开启后，好感、技能、体力与金钱由脚本掷骰结算，AI 只报告发生了什么。每个聊天第一次使用时可以选择是否启用。</div>
  </div>
  <div class="igs-settings-sub"{{statsHidden}}>
    <div class="igs-source-filter">
      <div class="igs-source-filter-title">规则</div>
      <div class="igs-settings-section">{{autoSkillField}}{{intimacyField}}</div>
      <div class="igs-source-filter-grid">{{registerField}}{{hudLabelField}}</div>
    </div>
    <div class="igs-source-filter">
      <div class="igs-source-filter-title">生活条</div>
      <div class="igs-settings-section">{{barsFields}}</div>
    </div>
    <div class="igs-source-filter">
      <div class="igs-source-filter-title">同步到表格</div>
      <div class="igs-settings-section">{{pushField}}</div>
      {{statsMappingFields}}
      <div class="igs-source-filter-note">表格里的数值只作展示；在表格里改动的数值会在下一次同步时被覆盖。</div>
      <div class="igs-source-filter-note">推荐导入「IGS 数值系统适配版」表格模板：填表 AI 不再改好感与属性，导入后无需配置。</div>
      <div class="igs-settings-row">
        <button class="igs-settings-action" data-action="stats-template-download" type="button">下载适配版表格模板</button>
      </div>
    </div>
    <div class="igs-source-filter">{{statsPromptFields}}</div>
    <div class="igs-source-filter">
      <div class="igs-source-filter-title">存档</div>
      {{statsArchiveFields}}
    </div>
    <div class="igs-source-filter">
      <div class="igs-source-filter-title">本聊天</div>
      <div class="igs-source-filter-note" data-result="stats-chat">{{statsChatNote}}</div>
      <div{{statsBuildHidden}}>{{statsBuildFields}}</div>
      <div class="igs-settings-row">
        <button class="igs-settings-action" data-action="stats-chat-enable" type="button"{{statsChatEnableHidden}}>快速开始（默认数值）</button>
        <button class="igs-settings-action" data-action="stats-chat-disable" type="button"{{statsChatDisableHidden}}>本聊天暂停（数值冻结）</button>
      </div>
    </div>
  </div>
</div>
`.trim();

const PAGE_TEMPLATES = Object.freeze({
    style: READER_DIALOG_TEMPLATE,
    text: READER_TEXT_TEMPLATE,
    'ui-reader': READER_UI_READER_TEMPLATE,
    'ui-bg': READER_UI_BG_TEMPLATE,
    'ui-option': READER_UI_OPTION_TEMPLATE,
    'ui-bar': READER_UI_BAR_TEMPLATE,
    'perf-text': READER_PERFORMANCE_TEMPLATE,
    'perf-stage': READER_PERFORMANCE_TEMPLATE,
    'perf-story': READER_PERFORMANCE_TEMPLATE,
    'perf-special': READER_PERFORMANCE_TEMPLATE,
    'perf-rhythm': READER_PERFORMANCE_TEMPLATE,
    sound: READER_PERFORMANCE_TEMPLATE,
    wardrobe: WARDROBE_TEMPLATE,
    cglib: IMAGE_CG_TEMPLATE,
    source: IMAGE_SOURCE_TEMPLATE,
    kinds: IMAGE_AUTO_TEMPLATE,
    llm: IMAGE_LLM_TEMPLATE,
    rules: RULES_TEMPLATE,
    parse: PARSE_TEMPLATE,
    stats: STATS_TEMPLATE,
    data: BACKUP_TEMPLATE,
    logs: IMAGE_LOGS_TEMPLATE,
});

// 页面模板（chars / scenes / review 的内容是列表，在渲染器里直接生成，没有模板；dash 同理）。
export function getPageTemplate(page) {
    return PAGE_TEMPLATES[String(page || '').trim()] || '';
}
