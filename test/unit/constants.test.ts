import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { Commands, ConfigKeys, ColorIds, ContextKeys, isValidHexColor, PATCH_COLOR_PRESETS } from '../../src/constants';

const root = path.resolve(__dirname, '..', '..', '..');

describe('constants contract', () => {
  it('all command ids are under the pentimento namespace', () => {
    for (const id of Object.values(Commands)) {
      expect(id, `command id ${id}`).to.match(/^pentimento\./);
    }
  });

  it('all config keys are under the pentimento namespace', () => {
    for (const key of Object.values(ConfigKeys)) {
      expect(key, `config key ${key}`).to.match(/^pentimento\./);
    }
  });

  it('all color ids are under the pentimento namespace', () => {
    for (const id of Object.values(ColorIds)) {
      expect(id, `color id ${id}`).to.match(/^pentimento\./);
    }
  });

  it('all context keys are under the pentimento namespace', () => {
    for (const key of Object.values(ContextKeys)) {
      expect(key, `context key ${key}`).to.match(/^pentimento\./);
    }
  });

  it('registers exactly 34 commands', () => {
    expect(Object.keys(Commands)).to.have.lengthOf(34);
  });

  it('provides 6 patch color layers plus overlap/modified/ambiguous', () => {
    const layerBg = Object.values(ColorIds).filter((id) =>
      /^pentimento\.patchLayer\dBackground$/.test(id),
    );
    const layerBorder = Object.values(ColorIds).filter((id) =>
      /^pentimento\.patchLayer\dBorder$/.test(id),
    );
    expect(layerBg).to.have.lengthOf(6);
    expect(layerBorder).to.have.lengthOf(6);
    expect(ColorIds).to.have.property('overlapBackground');
    expect(ColorIds).to.have.property('modifiedBackground');
    expect(ColorIds).to.have.property('ambiguousBackground');
  });

  it('does not contain any external-patch-file contract', () => {
    const all = [
      ...Object.values(Commands),
      ...Object.values(ConfigKeys),
      ...Object.values(ColorIds),
    ];
    for (const v of all) {
      expect(v).to.not.match(/patch-?file/i);
      expect(v).to.not.match(/import-?patch/i);
      expect(v).to.not.match(/external-?diff/i);
      expect(v).to.not.match(/open-?diff-?file/i);
    }
  });

  it('hex color validator accepts #RGB/#RRGGBB/#RRGGBBAA and rejects others', () => {
    expect(isValidHexColor('#abc')).to.be.true;
    expect(isValidHexColor('#aabbcc')).to.be.true;
    expect(isValidHexColor('#aabbccff')).to.be.true;
    expect(isValidHexColor('#ABCDEF')).to.be.true;
    expect(isValidHexColor('abc')).to.be.false;
    expect(isValidHexColor('#ab')).to.be.false;
    expect(isValidHexColor('#aabbccd')).to.be.false;
    expect(isValidHexColor('')).to.be.false;
  });

  it('patch color presets cover 6 layers with valid hex', () => {
    expect(PATCH_COLOR_PRESETS).to.have.lengthOf(6);
    for (const p of PATCH_COLOR_PRESETS) {
      expect(isValidHexColor(p.background), p.label).to.be.true;
      expect(isValidHexColor(p.border), p.label).to.be.true;
    }
  });

  it('commands match package.json contributes.commands exactly', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const pkgSet = pkg.contributes.commands.map((c: { command: string }) => c.command).sort();
    const codeSet = [...Object.values(Commands)].sort();
    expect(codeSet).to.deep.equal(pkgSet);
  });
});
