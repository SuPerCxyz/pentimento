import * as vscode from 'vscode';
import type { DecorationSpec } from './decorationSpec';

export {
  type HighlightStyle,
  type ColorKey,
  type DecorationConfig,
  type DecorationSpec,
  colorIdsForSlot,
  colorIdsForSpecial,
  computeDecorationSpec,
} from './decorationSpec';

/** 将纯 DecorationSpec 包装为 VSCode DecorationRenderOptions。 */
export function buildDecorationRenderOptions(spec: DecorationSpec): vscode.DecorationRenderOptions {
  const opts: vscode.DecorationRenderOptions = {};
  if (spec.useBackground) {
    opts.backgroundColor = isThemeColorId(spec.background) ? { id: spec.background } : spec.background;
  }
  if (spec.useBorder) {
    opts.borderColor = isThemeColorId(spec.border) ? { id: spec.border } : spec.border;
    opts.border = spec.borderStyle;
  }
  if (spec.useOverviewRuler) {
    opts.overviewRulerColor = isThemeColorId(spec.border) ? { id: spec.border } : spec.border;
    opts.overviewRulerLane = vscode.OverviewRulerLane.Left;
  }
  if (spec.wholeLine) {
    opts.isWholeLine = true;
  }
  return opts;
}

/** 以 # 开头视为自定义 hex 颜色,否则视为主题颜色 id。 */
function isThemeColorId(c: string): boolean {
  return !c.startsWith('#');
}
