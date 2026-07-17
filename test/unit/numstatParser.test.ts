import { expect } from 'chai';
import { parseNumstat } from '../../src/patch/numstatParser';

describe('numstatParser', () => {
  it('parses a normal record', () => {
    const out = parseNumstat('5\t2\tos_brick/x.py\x00');
    expect(out).to.deep.equal([
      { added: 5, deleted: 2, path: 'os_brick/x.py', isBinary: false },
    ]);
  });

  it('parses a binary record', () => {
    const out = parseNumstat('-\t-\tbin/file\x00');
    expect(out).to.deep.equal([
      { added: -1, deleted: -1, path: 'bin/file', isBinary: true },
    ]);
  });

  it('parses multiple records', () => {
    const out = parseNumstat('5\t2\ta.py\x0010\t0\tb.py\x00-\t-\tc.bin\x00');
    expect(out).to.have.lengthOf(3);
    expect(out[0].added).to.equal(5);
    expect(out[1].added).to.equal(10);
    expect(out[2].isBinary).to.be.true;
  });

  it('handles path with spaces (tab is delimiter)', () => {
    const out = parseNumstat('1\t1\tsrc/test file.py\x00');
    expect(out[0].path).to.equal('src/test file.py');
  });

  it('returns empty for empty input', () => {
    expect(parseNumstat('')).to.deep.equal([]);
  });
});
