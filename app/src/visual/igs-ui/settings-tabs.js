const BASIC_TAB_TEMPLATE = `
<div class="igs-settings-grid">
  {{performancePresetBar}}
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">通用</div>
    {{openModeField}}
    <div class="igs-settings-row">{{settingsToggles}}</div>
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="settings-export-all" type="button">导出配置</button>
      <button class="igs-settings-action" data-action="settings-import-all" type="button">导入配置</button>
      <button class="igs-settings-action" data-action="onboarding-start" type="button">新手引导</button>
      <button class="igs-settings-action" data-action="copy-page-diagnostic" type="button">本页诊断</button>
    </div>
    <div class="igs-source-filter-note">配置不含素材图片和 API Key；导入不覆盖已有素材。</div>
  </div>
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

const IMAGE_TAB_TEMPLATE = `
<div class="igs-image-settings">
  <div class="igs-image-subtabs" role="tablist" aria-label="生图设置分类">{{imageSubTabs}}</div>
  <div class="igs-image-subpane">{{imageSubPane}}</div>
</div>
`.trim();

const IMAGE_SOURCE_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="source">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">图像来源</div>
    {{imageSourceField}}
    <div class="igs-source-filter-note">{{imageSourceNote}}</div>
    <div class="igs-settings-sub" data-image-source="nai"{{sourceNaiHidden}}>
      <div class="igs-source-filter-grid">
        {{autoNaiKeyField}}
        {{autoNaiModelField}}{{autoNaiSizeField}}
        <div class="igs-settings-full">{{autoNaiArtistField}}</div>
        <div class="igs-settings-full">{{autoNaiNegativeField}}</div>
      </div>
      <div class="igs-settings-result" data-result="nai-models">{{autoNaiModelsMessage}}</div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="nai"{{advancedNaiOpen}}>
        <summary>连接与采样</summary>
        <div class="igs-source-filter-grid">
          {{autoNaiTransportField}}{{autoNaiEndpointField}}
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
    <details class="igs-settings-sub igs-settings-advanced" data-advanced="kind-models"{{advancedKindModelsOpen}}>
      <summary>按类型单独指定模型（可选）</summary>
      <div class="igs-source-filter-note">剧情 CG、立绘、背景、物品可以各用一个模型，留空跟随上面的模型。对内置 NAI 和数据库生图插件生效；智绘姬、柏宝绘用插件自己的模型。</div>
      <div class="igs-source-filter-grid">{{kindModelFields}}</div>
    </details>
    <div class="igs-settings-row"><button class="igs-settings-action" data-action="test-image" type="button">{{imageTestActionLabel}}</button><button class="igs-settings-action" data-action="open-dbgen-settings" type="button"{{sourceDbgenHidden}}>插件设置</button></div>
    <div class="igs-settings-result" data-result="image">{{imageTestHelp}}</div>
  </div>
</div>
`.trim();

const IMAGE_LLM_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="llm">
  <div class="igs-source-filter" data-image-feature="llm">
    <div class="igs-source-filter-title">副 LLM</div>
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
      <div class="igs-settings-result" data-result="llm-models">{{autoLlmModelsMessage}}</div>
    </div>
  </div>
  <div class="igs-source-filter igs-perf-group" data-image-feature="llm-prompts">
    <details data-advanced="llm-prompts"{{autoLlmPromptsOpen}}>
      <summary><b>提示词</b><span class="igs-perf-brief">系统提示词 · 头尾附加词，清空即恢复内置</span></summary>
      <div class="igs-perf-group-body">
        <div class="igs-settings-full">{{autoLlmPromptIllustrationField}}</div>
        <div class="igs-settings-full">{{autoLlmPromptIllustrationSoftField}}</div>
        <div class="igs-settings-full">{{autoLlmPromptAssetField}}</div>
        <div class="igs-settings-full">{{autoLlmPromptAssetSoftField}}</div>
        <div class="igs-settings-full">{{autoLlmJailbreakHeadField}}</div>
        <div class="igs-settings-full">{{autoLlmJailbreakTailField}}</div>
      </div>
    </details>
  </div>
</div>
`.trim();

const IMAGE_LOGS_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="logs">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">生图日志</div>
    <div class="igs-source-filter-note">出图失败时在这里看原因。</div>
    <div class="igs-source-filter-grid">{{imageLogRetainDaysField}}{{imageLogMaxEntriesField}}</div>
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="image-log-refresh" type="button">刷新</button>
      <button class="igs-settings-action" data-action="image-log-copy" type="button">复制</button>
      <button class="igs-settings-action" data-action="image-log-clear" type="button">清空</button>
    </div>
    <div class="igs-settings-result" data-result="image-log">{{imageLogStatus}}</div>
    <div class="igs-image-log-list" data-image-log-list>{{imageLogList}}</div>
  </div>
</div>
`.trim();

const IMAGE_CG_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="cg">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">CG 库</div>
    <div class="igs-source-filter-note">生成过的 CG 都在这里，点图看大图。</div>
    <div class="igs-source-filter-grid">{{imageCacheCountField}}</div>
    <div class="igs-settings-row"><button class="igs-settings-action" data-action="purge-asset-cache" type="button" title="清空浏览器里缓存的图片和设置页缩略图，酒馆上的原图不动">清除素材缓存</button></div>
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

const IMAGE_AUTO_TEMPLATE = `
<div class="igs-settings-grid" data-image-pane="auto">
  <div class="igs-source-filter-note">{{imageContentNote}}</div>
  <div class="igs-source-filter-note" data-image-feature="llm-warn"{{autoLlmWarnHidden}}>{{autoLlmWarn}}</div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">剧情 CG</div>
    {{autoNsfwField}}
    <div class="igs-settings-sub" data-image-feature="nsfw"{{autoNsfwHidden}}>
      <div class="igs-source-filter-grid">{{autoNsfwCountField}}</div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="nsfw"{{advancedNsfwOpen}}>
        <summary>NSFW 附加词</summary>
        <div class="igs-settings-full">{{autoAssetNsfwExtraField}}</div>
      </details>
    </div>
    {{autoInterludeField}}
    <div class="igs-settings-sub" data-image-feature="interlude"{{autoInterludeHidden}}>
      <div class="igs-source-filter-grid">{{autoInterludeProbabilityField}}{{autoInterludeMaxField}}</div>
    </div>
  </div>
  <div class="igs-source-filter" data-image-feature="assets">
    <div class="igs-source-filter-title">素材补全<span class="igs-outfit-muted">未登记的人物与场景</span></div>
    <div class="igs-source-filter-note"{{assetSceneWarnHidden}}>需先在「素材」页开启场景素材模式。</div>
    <div class="igs-source-filter-grid">{{autoAssetSpriteField}}<button type="button" class="igs-settings-action" data-action="open-character-dna" title="在素材 → 角色立绘中编辑角色 DNA">角色 DNA</button>{{autoAssetBackgroundField}}</div>
    <div class="igs-settings-sub" data-image-feature="asset-options"{{autoAssetOptionsHidden}}>
      <div class="igs-source-filter-grid">
        {{autoAssetMaxField}}
        {{autoAssetSpriteSizeField}}{{autoAssetBackgroundSizeField}}
      </div>
      <details class="igs-settings-sub igs-settings-advanced" data-advanced="asset-templates"{{advancedAssetTemplatesOpen}}>
        <summary>提示词模板</summary>
        <div class="igs-settings-full">{{autoAssetBackgroundTemplateField}}</div>
        <div class="igs-settings-full">{{autoAssetBackgroundNegativeTemplateField}}</div>
        <div class="igs-settings-full">{{autoAssetSpriteTemplateField}}</div>
        <div class="igs-settings-full">{{autoAssetSpriteNegativeTemplateField}}</div>
      </details>
    </div>
  </div>
  <div class="igs-source-filter" data-image-feature="item-images">
    <div class="igs-source-filter-title">物品图<span class="igs-outfit-muted">背包与获得物品</span></div>
    <div class="igs-source-filter-grid">{{itemImageFields}}</div>
  </div>
</div>
`.trim();

const READER_TAB_TEMPLATE = `
<div class="igs-reader-settings">
  <div class="igs-reader-subtabs" role="tablist" aria-label="阅读器设置分类">{{readerSubTabs}}</div>
  <div class="igs-reader-subpane">{{readerSubPane}}</div>
</div>
`.trim();

const READER_DIALOG_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="dialog">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">风格{{resetReaderDialogStyle}}</div>
    {{dialogSkinField}}
    {{gradientVeilFields}}
    {{magicHouseField}}
    <div class="igs-settings-row igs-switch-stack">{{statusLineToggle}}</div>
  </div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">尺寸{{resetReaderDialogSize}}</div>
    <div class="igs-source-filter-grid">
      {{dialogWidthField}}
      {{classicDialogWidthPercentField}}
      {{skinDialogScaleField}}
      {{dialogHeightField}}
      {{inputScaleField}}
    </div>
  </div>
  <div class="igs-source-filter igs-perf-group">
    <details data-advanced="dialog-glass"{{advancedDialogGlassOpen}}>
      <summary><b>面板玻璃</b><span class="igs-perf-brief">{{glassScopeNote}}</span></summary>
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
    <div class="igs-source-filter-note"{{themeNoteHidden}}>开启素材页的场景素材模式后可自定义</div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">角色名</div><div class="igs-settings-row">{{nameFontField}}{{nameColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">台词</div><div class="igs-settings-row">{{textFontField}}{{textColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">旁白</div><div class="igs-settings-row">{{narrationFontField}}{{narrationColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">心里话</div><div class="igs-settings-row">{{thoughtFontField}}{{thoughtColorField}}</div></div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">系统角色</div>{{systemRoleFields}}</div>
    <div class="igs-settings-group igs-text-style-line"{{themeHidden}}><div class="igs-settings-subhead">上传字体</div>{{customFontManager}}</div>
    <div class="igs-settings-group igs-text-style-line"{{dividerHidden}}><div class="igs-settings-subhead">分隔线</div><div class="igs-settings-row">{{dividerField}}{{dividerColorField}}</div></div>
  </div>
</div>
`.trim();

const READER_PERFORMANCE_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="performance">{{performanceSections}}</div>
`.trim();

const READER_INTERFACE_TEMPLATE = `
<div class="igs-settings-grid" data-reader-pane="interface">
  <div class="igs-source-filter"><div class="igs-source-filter-title">背景图{{resetReaderInterfaceBackground}}</div><div class="igs-source-filter-grid">{{imgModeField}}{{imgBrightnessField}}</div></div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">状态栏{{resetReaderInterfaceStatusHud}}</div>{{statusHudSection}}</div>
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">选项气泡{{resetReaderInterfaceOptionBubble}}</div>
    {{optionBubbleToggle}}
    <div class="igs-settings-sub"{{optionBubbleHidden}}>
      <div class="igs-source-filter-grid">{{optionFontSizeField}}{{optionBubbleWidthToggle}}</div>
      {{optionBubblePositionField}}
      {{optionBubbleActionField}}
    </div>
  </div>
  <div class="igs-source-filter"><div class="igs-source-filter-title">工具栏{{resetReaderInterfaceToolbar}}</div><div class="igs-source-filter-grid">{{toolbarScaleField}}{{toolbarDockField}}{{toolbarSplitField}}{{dialogBarAlignField}}</div>{{pinnedButtonsField}}</div>
</div>
`.trim();

const SCENE_TAB_TEMPLATE = `
<div class="igs-scene-settings">
  <div class="igs-settings-row">{{sceneToggle}}</div>
  <div class="igs-scene-settings-content"{{sceneHidden}}>
    {{assetScopeBar}}
    <div class="igs-scene-settings-subtabs" role="tablist" aria-label="素材分类">{{sceneSubTabs}}</div>
    <div class="igs-scene-settings-subpane">{{sceneSubPane}}</div>
  </div>
</div>
`.trim();

// 规则页：上面是发给聊天模型的格式规则（可关掉自动注入，改由酒馆预设提供），下面是只在生图时用的衣柜提示词，两样分开写清楚。
export const SCENE_RULES_TEMPLATE = `
<div class="igs-settings-grid" data-scene-settings-pane="rules">
  <div class="igs-source-filter">
    <div class="igs-source-filter-title">AI 格式规则<span class="igs-outfit-muted">{{promptRuleTag}}</span></div>
    {{promptRuleToggle}}
    {{promptRuleField}}
    <div class="igs-settings-row">
      <button class="igs-settings-action" data-action="reset-prompt-rule" type="button">恢复默认</button>
      <button class="igs-settings-action" data-action="save-prompt-rule" type="button">保存</button>
      <button class="igs-settings-action" data-action="copy-prompt-rule" type="button">复制到酒馆预设</button>
    </div>
    <div class="igs-settings-result" data-result="prompt-rule">{{promptRuleStatus}}</div>
    {{promptRuleOutfitHint}}
    {{promptAdvanced}}
  </div>
  <div class="igs-source-filter" data-wardrobe-section>
    <div class="igs-source-filter-title">衣柜提示词<span class="igs-outfit-muted">生图用</span><button class="igs-btn-mgr-icon igs-title-add" data-action="wardrobe-add" type="button" title="添加一条衣柜提示词" aria-label="添加一条衣柜提示词">+</button></div>
    <div class="igs-source-filter-note">生成服装立绘时使用的服装描述；未指定时使用同名的那一条。</div>
    {{wardrobeSection}}
  </div>
  <div class="igs-source-filter" data-event-cg-section>
    <div class="igs-source-filter-title">CG 库<span class="igs-outfit-muted">作者预置</span><button class="igs-btn-mgr-icon igs-title-add" data-action="event-cg-add" type="button" title="添加一张预置 CG" aria-label="添加一张预置 CG">+</button></div>
    <div class="igs-source-filter-note">正文出现触发词，或 AI 写 [igs-cg:名字] 时显示这张图，停留页数同 CG；命中的楼不再生成过场图。可上传或填网址，随角色卡包和素材预设导出。</div>
    {{eventCgSection}}
  </div>
  <div class="igs-source-filter" data-mood-section>
    <div class="igs-source-filter-title">情绪组<span class="igs-outfit-muted">聊天与生图共用</span></div>
    <div class="igs-source-filter-note">情绪词按组匹配立绘，缺图时依次回退到相近档位和默认立绘。</div>
    {{moodSection}}
  </div>
</div>
`.trim();

export const SCENE_SUBTAB_DEFS = Object.freeze([
    ['characters', '角色'],
    ['scenes', '场景'],
    ['review', '待确认'],
    ['rules', '规则'],
]);

// 旧页签名：衣柜并进规则，生成素材并进待确认。
const SCENE_SUBTAB_ALIASES = Object.freeze({ wardrobe: 'rules', generated: 'review' });

export const IMAGE_SUBTAB_DEFS = Object.freeze([
    ['source', '图像来源'],
    ['llm', '副LLM'],
    ['auto', '生图内容'],
    ['logs', '日志'],
    ['cg', 'CG库'],
]);

export const READER_SUBTAB_DEFS = Object.freeze([
    ['dialog', '对话框'],
    ['text', '文字'],
    ['performance', '演出'],
    ['interface', '界面'],
]);

export const SETTINGS_TAB_DEFS = Object.freeze([
    ['basic', '基础'],
    ['reader', '阅读器'],
    ['scene', '素材'],
    ['image', '生图'],
]);

export const SETTINGS_TAB_ALIASES = Object.freeze({
    regex: 'basic',
});

export function normalizeSceneSubTab(subTab) {
    const raw = String(subTab || 'characters').trim();
    const normalized = SCENE_SUBTAB_ALIASES[raw] || raw;
    return SCENE_SUBTAB_DEFS.some(([id]) => id === normalized) ? normalized : 'characters';
}

const READER_SUBTAB_ALIASES = Object.freeze({
    display: 'dialog',
    theme: 'text',
    toolbar: 'interface',
    visual: 'interface',
    options: 'interface',
});

export function normalizeReaderSubTab(subTab) {
    const raw = String(subTab || 'dialog').trim();
    const normalized = READER_SUBTAB_ALIASES[raw] || raw;
    return READER_SUBTAB_DEFS.some(([id]) => id === normalized) ? normalized : 'dialog';
}

export function getReaderSubTabTemplate(subTab) {
    switch (normalizeReaderSubTab(subTab)) {
        case 'text':
            return READER_TEXT_TEMPLATE;
        case 'performance':
            return READER_PERFORMANCE_TEMPLATE;
        case 'interface':
            return READER_INTERFACE_TEMPLATE;
        case 'dialog':
        default:
            return READER_DIALOG_TEMPLATE;
    }
}

export function normalizeImageSubTab(subTab) {
    if (subTab === 'other') return 'source';
    return IMAGE_SUBTAB_DEFS.some(([id]) => id === subTab) ? subTab : 'source';
}

export function getImageSubTabTemplate(subTab) {
    const id = normalizeImageSubTab(subTab);
    if (id === 'source') return IMAGE_SOURCE_TEMPLATE;
    if (id === 'llm') return IMAGE_LLM_TEMPLATE;
    if (id === 'logs') return IMAGE_LOGS_TEMPLATE;
    if (id === 'cg') return IMAGE_CG_TEMPLATE;
    return IMAGE_AUTO_TEMPLATE;
}

export function getSettingsTabTemplate(tab) {
    switch (SETTINGS_TAB_ALIASES[tab] || tab) {
        case 'image':
            return IMAGE_TAB_TEMPLATE;
        case 'scene':
            return SCENE_TAB_TEMPLATE;
        case 'reader':
            return READER_TAB_TEMPLATE;
        case 'basic':
        default:
            return BASIC_TAB_TEMPLATE;
    }
}
