import { expect } from 'chai';
import {
  parseBlamePorcelain,
  findBlameLine,
  isUncommitted,
} from '../../src/git/blameParser';

// 40-hex 测试用 hash
const HASH_A = '3f68c71a1234567890abcdef1234567890abcdef'; // 8 + 16 + 16 = 40
const HASH_BOUNDARY = 'aabbccddeeff00112233445566778899aabbccdd'; // 12+12+8+8 = 40
const HASH_ZERO = '0000000000000000000000000000000000000000'; // 40 zeros

const SAMPLE = [
  `${HASH_A} 1 1 1`,
  'summary Harden multipath detach handling',
  'author Zhang San',
  'author-mail <zhang@example.com>',
  'author-time 1721068800',
  'author-tz +0800',
  'committer Zhang San',
  'committer-mail <zhang@example.com>',
  'committer-time 1721068800',
  'committer-tz +0800',
  'filename os_brick/x.py',
  '',
  '\tclass ExistingConnector:',
  `${HASH_A} 2 2 1`,
  'summary Harden multipath detach handling',
  'author Zhang San',
  'author-mail <zhang@example.com>',
  'author-time 1721068800',
  'filename os_brick/x.py',
  '',
  '\tpass',
  `^${HASH_BOUNDARY} 3 3 1`,
  'summary Initial commit',
  'author A B',
  'author-mail <a@b.com>',
  'author-time 1700000000',
  'filename os_brick/x.py',
  '',
  '\t# boundary line',
  `${HASH_ZERO} 4 4 1`,
  'summary Not Committed Yet',
  'author Not',
  'author-mail <not@example.com>',
  'author-time 1722000000',
  'filename os_brick/x.py',
  '',
  '\t# uncommitted line',
].join('\n');

describe('blameParser', () => {
  it('parses multiple blame lines', () => {
    const blame = parseBlamePorcelain(SAMPLE);
    expect(blame).to.have.lengthOf(4);
  });

  it('extracts commit hash, lines and content', () => {
    const blame = parseBlamePorcelain(SAMPLE);
    const first = blame[0];
    expect(first.commitHash).to.equal(HASH_A);
    expect(first.shortHash).to.equal('3f68c71a');
    expect(first.finalLine).to.equal(1);
    expect(first.originalLine).to.equal(1);
    expect(first.content).to.equal('class ExistingConnector:');
    expect(first.summary).to.equal('Harden multipath detach handling');
  });

  it('strips author mail angle brackets', () => {
    const blame = parseBlamePorcelain(SAMPLE);
    expect(blame[0].authorName).to.equal('Zhang San');
    expect(blame[0].authorEmail).to.equal('zhang@example.com');
  });

  it('parses author/committer timestamps', () => {
    const blame = parseBlamePorcelain(SAMPLE);
    expect(blame[0].authorTimestamp).to.equal(1721068800);
    expect(blame[0].committerTimestamp).to.equal(1721068800);
  });

  it('marks boundary commits', () => {
    const blame = parseBlamePorcelain(SAMPLE);
    const boundary = blame[2];
    expect(boundary.isBoundary).to.be.true;
    expect(boundary.commitHash).to.equal(HASH_BOUNDARY);
  });

  it('marks uncommitted lines', () => {
    const blame = parseBlamePorcelain(SAMPLE);
    const uncommitted = blame[3];
    expect(uncommitted.isUncommitted).to.be.true;
    expect(isUncommitted(uncommitted.commitHash)).to.be.true;
  });

  it('parses summary containing spaces', () => {
    const input = [
      'deadbeefcafe000000000000000000000000abcd 1 1 1',
      'summary Fix: handle the case where x is null',
      'author Dev',
      'author-mail <dev@x.com>',
      'author-time 1',
      'filename a.py',
      '',
      '\tcode()',
    ].join('\n');
    const blame = parseBlamePorcelain(input);
    expect(blame[0].summary).to.equal('Fix: handle the case where x is null');
  });

  it('findBlameLine returns the matching line', () => {
    const blame = parseBlamePorcelain(SAMPLE);
    const l = findBlameLine(blame, 3);
    expect(l?.isBoundary).to.be.true;
    expect(findBlameLine(blame, 999)).to.be.undefined;
  });

  it('returns empty for empty input', () => {
    expect(parseBlamePorcelain('')).to.deep.equal([]);
  });

  it('handles grouped entries (num-lines > 1)', () => {
    const input = [
      `${HASH_A} 2 2 3`,
      'summary Harden multipath detach handling',
      'author Zhang San',
      'author-mail <zhang@example.com>',
      'author-time 1721068800',
      'filename os_brick/x.py',
      '',
      '\tline2',
      '\tline3',
      '\tline4',
    ].join('\n');
    const blame = parseBlamePorcelain(input);
    expect(blame).to.have.lengthOf(3);
    expect(blame[0].finalLine).to.equal(2);
    expect(blame[1].finalLine).to.equal(3);
    expect(blame[2].finalLine).to.equal(4);
    expect(blame[0].content).to.equal('line2');
    expect(blame[2].content).to.equal('line4');
    expect(blame[1].commitHash).to.equal(HASH_A);
  });
});
