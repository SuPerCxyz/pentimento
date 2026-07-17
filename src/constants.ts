/**
 * Pentimento 全局常量。
 *
 * 命令、配置、颜色、context key、视图等契约 ID 集中于此,
 * 与 package.json 的 contributes 保持一致。
 */

export const EXTENSION_ID = 'pentimento';
export const OUTPUT_CHANNEL_NAME = 'Pentimento';

/** VSCode 视图容器与视图 ID。 */
export const VIEW_CONTAINER_ID = 'pentimento';
export const VIEW_ID = 'pentimento.patches';

/** 最低支持的 Git 版本(主.次.补丁)。 */
export const MIN_GIT_VERSION: readonly [number, number, number] = [2, 20, 0];

/** 默认同时启用 Patch 上限。 */
export const DEFAULT_MAX_ACTIVE_PATCHES = 6;

/** pentimento.* context key。 */
export const ContextKeys = {
  enabled: 'pentimento.enabled',
  hasActivePatches: 'pentimento.hasActivePatches',
  multiPatch: 'pentimento.multiPatch',
  exactWorkspace: 'pentimento.exactWorkspace',
  hasPrimaryPatch: 'pentimento.hasPrimaryPatch',
  hasVisiblePatch: 'pentimento.hasVisiblePatch',
  currentRepositoryAvailable: 'pentimento.currentRepositoryAvailable',
} as const;

/** 全部 pentimento.* 命令 ID。 */
export const Commands = {
  addCommitFromLine: 'pentimento.addCommitFromLine',
  highlightOnlyCommitFromLine: 'pentimento.highlightOnlyCommitFromLine',
  toggleCommitFromLine: 'pentimento.toggleCommitFromLine',
  addRef: 'pentimento.addRef',
  highlightWorkingTree: 'pentimento.highlightWorkingTree',
  highlightStaged: 'pentimento.highlightStaged',
  highlightSurvivingLines: 'pentimento.highlightSurvivingLines',
  openExactPatchRevision: 'pentimento.openExactPatchRevision',
  projectOntoCurrentRevision: 'pentimento.projectOntoCurrentRevision',
  setPrimaryPatch: 'pentimento.setPrimaryPatch',
  togglePatchVisibility: 'pentimento.togglePatchVisibility',
  removePatch: 'pentimento.removePatch',
  managePatches: 'pentimento.managePatches',
  highlightCurrentFile: 'pentimento.highlightCurrentFile',
  highlightAllFiles: 'pentimento.highlightAllFiles',
  showFiles: 'pentimento.showFiles',
  nextHunk: 'pentimento.nextHunk',
  previousHunk: 'pentimento.previousHunk',
  showOnlyPrimary: 'pentimento.showOnlyPrimary',
  showAll: 'pentimento.showAll',
  hideAll: 'pentimento.hideAll',
  toggle: 'pentimento.toggle',
  refresh: 'pentimento.refresh',
  clearAll: 'pentimento.clearAll',
  switchHistoricalViewMode: 'pentimento.switchHistoricalViewMode',
  showEvolutionSummary: 'pentimento.showEvolutionSummary',
  closeExactWorkspace: 'pentimento.closeExactWorkspace',
  removeTemporaryWorktree: 'pentimento.removeTemporaryWorktree',
  cleanStaleWorktrees: 'pentimento.cleanStaleWorktrees',
  openOutputLog: 'pentimento.openOutputLog',
  showDiagnostics: 'pentimento.showDiagnostics',
} as const;

/** 全部 pentimento.* 配置键。 */
export const ConfigKeys = {
  hoverEnabled: 'pentimento.hover.enabled',
  hoverDelay: 'pentimento.hover.delay',
  hoverMode: 'pentimento.hover.mode',
  compatibilityMode: 'pentimento.compatibility.mode',
  highlightStyle: 'pentimento.highlight.style',
  highlightWholeLine: 'pentimento.highlight.wholeLine',
  highlightGutterIcon: 'pentimento.highlight.gutterIcon',
  highlightInlineLabel: 'pentimento.highlight.inlineLabel',
  highlightOverviewRuler: 'pentimento.highlight.overviewRuler',
  highlightCurrentFileOnlyByDefault: 'pentimento.highlight.currentFileOnlyByDefault',
  blameIgnoreWhitespace: 'pentimento.blame.ignoreWhitespace',
  blameDetectMovedLines: 'pentimento.blame.detectMovedLines',
  blameDetectCopiedLines: 'pentimento.blame.detectCopiedLines',
  multiPatchEnabled: 'pentimento.multiPatch.enabled',
  multiPatchMaxActivePatches: 'pentimento.multiPatch.maxActivePatches',
  multiPatchHoverDefaultAction: 'pentimento.multiPatch.hoverDefaultAction',
  multiPatchOverlapStyle: 'pentimento.multiPatch.overlapStyle',
  historicalDefaultMode: 'pentimento.historical.defaultMode',
  historicalPreferExactWorktreeForNonAncestor: 'pentimento.historical.preferExactWorktreeForNonAncestor',
  exactPatchReuseWorktree: 'pentimento.exactPatch.reuseWorktree',
  exactPatchCleanupOnExit: 'pentimento.exactPatch.cleanupOnExit',
  largePatchMaxFiles: 'pentimento.largePatch.maxFiles',
  largePatchMaxAddedLines: 'pentimento.largePatch.maxAddedLines',
  gitTimeout: 'pentimento.git.timeout',
  gitMaxConcurrentCommands: 'pentimento.git.maxConcurrentCommands',
  gitMaxOutputBytes: 'pentimento.git.maxOutputBytes',
  loggingLevel: 'pentimento.logging.level',
} as const;

/** 全部 pentimento.* 颜色 ID。 */
export const ColorIds = {
  layer1Background: 'pentimento.patchLayer1Background',
  layer1Border: 'pentimento.patchLayer1Border',
  layer2Background: 'pentimento.patchLayer2Background',
  layer2Border: 'pentimento.patchLayer2Border',
  layer3Background: 'pentimento.patchLayer3Background',
  layer3Border: 'pentimento.patchLayer3Border',
  layer4Background: 'pentimento.patchLayer4Background',
  layer4Border: 'pentimento.patchLayer4Border',
  layer5Background: 'pentimento.patchLayer5Background',
  layer5Border: 'pentimento.patchLayer5Border',
  layer6Background: 'pentimento.patchLayer6Background',
  layer6Border: 'pentimento.patchLayer6Border',
  overlapBackground: 'pentimento.overlapBackground',
  overlapBorder: 'pentimento.overlapBorder',
  modifiedBackground: 'pentimento.modifiedBackground',
  modifiedBorder: 'pentimento.modifiedBorder',
  ambiguousBackground: 'pentimento.ambiguousBackground',
  ambiguousBorder: 'pentimento.ambiguousBorder',
} as const;
