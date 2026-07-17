import { ColorIds } from '../constants';

export type HighlightStyle =
  | 'background-and-border'
  | 'background-only'
  | 'border-only'
  | 'overview-ruler-only';

export type ColorKey =
  | 'layer0'
  | 'layer1'
  | 'layer2'
  | 'layer3'
  | 'layer4'
  | 'layer5'
  | 'overlap'
  | 'modified'
  | 'ambiguous';

export interface DecorationConfig {
  style: HighlightStyle;
  wholeLine: boolean;
  overviewRuler: boolean;
  gutterIcon: boolean;
}

/** 某颜色槽(0..5 -> layer1..6)的背景/边框 color id。纯函数。 */
export function colorIdsForSlot(slot: number): { background: string; border: string } {
  const n = (((slot % 6) + 6) % 6) + 1; // 1..6
  const bgKey = `layer${n}Background` as keyof typeof ColorIds;
  const borderKey = `layer${n}Border` as keyof typeof ColorIds;
  return { background: ColorIds[bgKey], border: ColorIds[borderKey] };
}

export function colorIdsForSpecial(
  key: 'overlap' | 'modified' | 'ambiguous',
): { background: string; border: string } {
  const bg = { overlap: ColorIds.overlapBackground, modified: ColorIds.modifiedBackground, ambiguous: ColorIds.ambiguousBackground };
  const border = { overlap: ColorIds.overlapBorder, modified: ColorIds.modifiedBorder, ambiguous: ColorIds.ambiguousBorder };
  return { background: bg[key], border: border[key] };
}

export interface DecorationSpec {
  background: string;
  border: string;
  useBackground: boolean;
  useBorder: boolean;
  useOverviewRuler: boolean;
  borderStyle?: string;
  wholeLine: boolean;
}

/** 纯函数:依据配置决定使用的颜色与边框样式。 */
export function computeDecorationSpec(
  colors: { background: string; border: string },
  config: DecorationConfig,
): DecorationSpec {
  const useBackground =
    config.style === 'background-and-border' || config.style === 'background-only';
  const useBorder =
    config.style === 'background-and-border' || config.style === 'border-only';
  const useOverviewRuler = config.overviewRuler && config.style !== 'background-only';
  return {
    background: colors.background,
    border: colors.border,
    useBackground,
    useBorder,
    useOverviewRuler,
    borderStyle: useBorder ? (config.wholeLine ? 'left solid 2px' : 'solid 1px') : undefined,
    wholeLine: config.wholeLine,
  };
}
