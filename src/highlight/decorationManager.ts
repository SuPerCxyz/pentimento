import * as vscode from 'vscode';
import {
  type DecorationConfig,
  type ColorKey,
  type DecorationSpec,
  colorIdsForSlot,
  colorIdsForSpecial,
  computeDecorationSpec,
} from './decorationSpec';
import { buildDecorationRenderOptions } from './decorationFactory';

/**
 * DecorationType 生命周期管理。
 *
 * 按 (colorKey + config 签名) 复用 DecorationType,统一 dispose,
 * 只管理 Pentimento 自身创建的类型(见 docs 第 29 节)。
 */
export class DecorationManager implements vscode.Disposable {
  private readonly types = new Map<string, vscode.TextEditorDecorationType>();
  private readonly config: DecorationConfig;

  constructor(config: DecorationConfig) {
    this.config = config;
  }

  setConfig(config: DecorationConfig): void {
    if (JSON.stringify(config) === JSON.stringify(this.config)) {
      return;
    }
    // 配置变化:重建所有 DecorationType
    for (const t of this.types.values()) {
      t.dispose();
    }
    this.types.clear();
    Object.assign(this.config, config);
  }

  /** 获取某颜色槽对应的 DecorationType(惰性创建并缓存)。 */
  getLayerType(slot: number): vscode.TextEditorDecorationType {
    return this.getOrCreate(`layer:${slot}`, colorIdsForSlot(slot));
  }

  getSpecialType(key: 'overlap' | 'modified' | 'ambiguous'): vscode.TextEditorDecorationType {
    return this.getOrCreate(`special:${key}`, colorIdsForSpecial(key));
  }

  private getOrCreate(
    cacheKey: string,
    colors: { background: string; border: string },
  ): vscode.TextEditorDecorationType {
    const key = `${cacheKey}:${configSignature(this.config)}`;
    let type = this.types.get(key);
    if (!type) {
      const spec: DecorationSpec = computeDecorationSpec(colors, this.config);
      type = vscode.window.createTextEditorDecorationType(buildDecorationRenderOptions(spec));
      this.types.set(key, type);
    }
    return type;
  }

  /** 向编辑器下发某类型的 Decoration 范围。 */
  apply(editor: vscode.TextEditor, type: vscode.TextEditorDecorationType, ranges: vscode.Range[]): void {
    editor.setDecorations(type, ranges);
  }

  /** 清空某编辑器上所有 Pentimento Decoration。 */
  clearEditor(editor: vscode.TextEditor): void {
    for (const type of this.types.values()) {
      editor.setDecorations(type, []);
    }
  }

  dispose(): void {
    for (const t of this.types.values()) {
      t.dispose();
    }
    this.types.clear();
  }
}

function configSignature(config: DecorationConfig): string {
  return `${config.style}|${config.wholeLine}|${config.overviewRuler}|${config.gutterIcon}`;
}

/** 从配置键构造 DecorationConfig。 */
export function decorationConfigFromSettings(cfg: vscode.WorkspaceConfiguration): DecorationConfig {
  return {
    style: cfg.get<'background-and-border' | 'background-only' | 'border-only' | 'overview-ruler-only'>('highlight.style', 'background-and-border'),
    wholeLine: cfg.get<boolean>('highlight.wholeLine', true),
    overviewRuler: cfg.get<boolean>('highlight.overviewRuler', true),
    gutterIcon: cfg.get<boolean>('highlight.gutterIcon', false),
  };
}

export type { ColorKey };
