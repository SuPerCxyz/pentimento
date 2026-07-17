import { expect } from 'chai';
import { parseFileStatus } from '../../src/patch/fileStatusParser';

describe('fileStatusParser', () => {
  it('parses modified file', () => {
    const out = parseFileStatus('M\x00os_brick/x.py\x00');
    expect(out).to.deep.equal([{ status: 'modified', newPath: 'os_brick/x.py' }]);
  });

  it('parses added file', () => {
    const out = parseFileStatus('A\x00new.py\x00');
    expect(out).to.deep.equal([{ status: 'added', newPath: 'new.py' }]);
  });

  it('parses deleted file', () => {
    const out = parseFileStatus('D\x00old.py\x00');
    expect(out).to.deep.equal([{ status: 'deleted', newPath: 'old.py' }]);
  });

  it('parses rename with similarity', () => {
    const out = parseFileStatus('R100\x00old/a.py\x00new/a.py\x00');
    expect(out).to.deep.equal([
      { status: 'renamed', oldPath: 'old/a.py', newPath: 'new/a.py', similarity: 100 },
    ]);
  });

  it('parses copy with similarity', () => {
    const out = parseFileStatus('C50\x00src\x00dst\x00');
    expect(out).to.deep.equal([
      { status: 'copied', oldPath: 'src', newPath: 'dst', similarity: 50 },
    ]);
  });

  it('parses multiple entries', () => {
    const out = parseFileStatus('M\x00a.py\x00A\x00b.py\x00D\x00c.py\x00');
    expect(out).to.have.lengthOf(3);
    expect(out[0]).to.deep.equal({ status: 'modified', newPath: 'a.py' });
    expect(out[1]).to.deep.equal({ status: 'added', newPath: 'b.py' });
    expect(out[2]).to.deep.equal({ status: 'deleted', newPath: 'c.py' });
  });

  it('handles paths with spaces', () => {
    const out = parseFileStatus('M\x00src/test file.py\x00');
    expect(out[0].newPath).to.equal('src/test file.py');
  });

  it('handles paths with non-ASCII', () => {
    const out = parseFileStatus('A\x00中文/文件.py\x00');
    expect(out[0].newPath).to.equal('中文/文件.py');
  });

  it('returns empty for empty input', () => {
    expect(parseFileStatus('')).to.deep.equal([]);
  });
});
