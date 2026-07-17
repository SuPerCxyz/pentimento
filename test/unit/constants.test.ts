import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { Commands, ConfigKeys, ColorIds, ContextKeys } from '../../src/constants';

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

  it('registers exactly 31 commands', () => {
    expect(Object.keys(Commands)).to.have.lengthOf(31);
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

  it('commands match package.json contributes.commands exactly', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const pkgSet = pkg.contributes.commands.map((c: { command: string }) => c.command).sort();
    const codeSet = [...Object.values(Commands)].sort();
    expect(codeSet).to.deep.equal(pkgSet);
  });
});
