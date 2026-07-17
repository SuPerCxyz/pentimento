import { expect } from 'chai';
import {
  colorIdsForSlot,
  colorIdsForSpecial,
  computeDecorationSpec,
  type DecorationConfig,
} from '../../src/highlight/decorationSpec';
import { ColorIds } from '../../src/constants';

const CFG: DecorationConfig = {
  style: 'background-and-border',
  wholeLine: true,
  overviewRuler: true,
  gutterIcon: false,
};

describe('decorationSpec', () => {
  it('colorIdsForSlot maps 0 -> layer1', () => {
    expect(colorIdsForSlot(0)).to.deep.equal({
      background: ColorIds.layer1Background,
      border: ColorIds.layer1Border,
    });
  });

  it('colorIdsForSlot maps 5 -> layer6', () => {
    expect(colorIdsForSlot(5)).to.deep.equal({
      background: ColorIds.layer6Background,
      border: ColorIds.layer6Border,
    });
  });

  it('colorIdsForSlot wraps 6 -> layer1', () => {
    expect(colorIdsForSlot(6)).to.deep.equal({
      background: ColorIds.layer1Background,
      border: ColorIds.layer1Border,
    });
  });

  it('colorIdsForSpecial returns overlap colors', () => {
    expect(colorIdsForSpecial('overlap')).to.deep.equal({
      background: ColorIds.overlapBackground,
      border: ColorIds.overlapBorder,
    });
  });

  it('background-and-border uses bg, border and overview', () => {
    const spec = computeDecorationSpec(colorIdsForSlot(0), CFG);
    expect(spec.useBackground).to.be.true;
    expect(spec.useBorder).to.be.true;
    expect(spec.useOverviewRuler).to.be.true;
    expect(spec.borderStyle).to.equal('left solid 2px');
  });

  it('border-only disables background and overview', () => {
    const spec = computeDecorationSpec(colorIdsForSlot(0), { ...CFG, style: 'border-only' });
    expect(spec.useBackground).to.be.false;
    expect(spec.useBorder).to.be.true;
    expect(spec.useOverviewRuler).to.be.true; // overview allowed when not background-only
  });

  it('background-only disables border and overview', () => {
    const spec = computeDecorationSpec(colorIdsForSlot(0), { ...CFG, style: 'background-only' });
    expect(spec.useBackground).to.be.true;
    expect(spec.useBorder).to.be.false;
    expect(spec.useOverviewRuler).to.be.false;
  });

  it('overview-ruler-only disables bg and border', () => {
    const spec = computeDecorationSpec(colorIdsForSlot(0), { ...CFG, style: 'overview-ruler-only' });
    expect(spec.useBackground).to.be.false;
    expect(spec.useBorder).to.be.false;
    expect(spec.useOverviewRuler).to.be.true;
  });

  it('non-whole-line uses solid 1px border', () => {
    const spec = computeDecorationSpec(colorIdsForSlot(0), { ...CFG, wholeLine: false });
    expect(spec.borderStyle).to.equal('solid 1px');
  });
});
