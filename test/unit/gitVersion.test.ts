import { expect } from 'chai';
import {
  parseGitVersion,
  compareVersions,
  isSupported,
  formatVersion,
} from '../../src/git/gitVersion';

describe('gitVersion', () => {
  it('parses a plain version string', () => {
    expect(parseGitVersion('git version 2.53.0')).to.deep.equal([2, 53, 0]);
  });
  it('parses a windows-suffixed version string', () => {
    expect(parseGitVersion('git version 2.53.0.windows.1')).to.deep.equal([2, 53, 0]);
  });
  it('returns undefined for non-version output', () => {
    expect(parseGitVersion('not git')).to.be.undefined;
    expect(parseGitVersion('')).to.be.undefined;
  });
  it('compareVersions orders correctly', () => {
    expect(compareVersions([2, 53, 0], [2, 20, 0])).to.be.greaterThan(0);
    expect(compareVersions([2, 20, 0], [2, 20, 0])).to.equal(0);
    expect(compareVersions([2, 19, 0], [2, 20, 0])).to.be.lessThan(0);
    expect(compareVersions([2, 20, 1], [2, 20, 0])).to.be.greaterThan(0);
  });
  it('isSupported against minimum 2.20.0', () => {
    expect(isSupported([2, 53, 0])).to.be.true;
    expect(isSupported([2, 20, 0])).to.be.true;
    expect(isSupported([2, 19, 5])).to.be.false;
    expect(isSupported([1, 99, 99])).to.be.false;
  });
  it('formatVersion produces x.y.z', () => {
    expect(formatVersion([2, 53, 0])).to.equal('2.53.0');
  });
});
