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
    opts.backgroundColor = { id: spec.background };
  }
  if (spec.useBorder) {
    opts.borderColor = { id: spec.border };
    opts.border = spec.borderStyle;
  }
  if (spec.useOverviewRuler) {
    opts.overviewRulerColor = { id: spec.border };
    opts.overviewRulerLane = vscode.OverviewRulerLane.Left;
  }
  if (spec.wholeLine) {
    opts.isWholeLine = true;
  }
  return opts;
}
