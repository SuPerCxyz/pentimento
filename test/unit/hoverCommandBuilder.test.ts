import { expect } from 'chai';
import {
  isAllowedCommand,
  formatCommandLink,
  escapeInline,
  buildHoverContent,
} from '../../src/hover/hoverCommandBuilder';
import { Commands } from '../../src/constants';

describe('hoverCommandBuilder', () => {
  it('allows pentimento commands only', () => {
    expect(isAllowedCommand(Commands.addCommitFromLine)).to.be.true;
    expect(isAllowedCommand(Commands.openOutputLog)).to.be.true;
    expect(isAllowedCommand('vscode.openFolder')).to.be.false;
    expect(isAllowedCommand('evil;rm -rf')).to.be.false;
    expect(isAllowedCommand('pentimento.importPatch')).to.be.false; // 不存在的命令
  });

  it('encodes args as URI-encoded JSON', () => {
    const link = formatCommandLink({
      command: Commands.addCommitFromLine,
      args: [{ hash: 'abc def' }],
      label: 'Add',
    });
    expect(link.startsWith(`command:${Commands.addCommitFromLine}?`)).to.be.true;
    expect(link.endsWith(' [Add]')).to.be.true;
    const prefix = `command:${Commands.addCommitFromLine}?`;
    const suffix = ' [Add]';
    const encoded = link.slice(prefix.length, link.length - suffix.length);
    const decoded = JSON.parse(decodeURIComponent(encoded));
    expect(decoded).to.deep.equal([{ hash: 'abc def' }]);
  });

  it('returns plain label for disallowed command', () => {
    expect(formatCommandLink({ command: 'rm -rf', args: [], label: 'X' })).to.equal('X');
  });

  it('escapes markdown-breaking characters', () => {
    expect(escapeInline('a`b[c]d\\e')).to.equal('a\\`b\\[c\\]d\\\\e');
  });

  it('builds committed hover content with info and actions', () => {
    const content = buildHoverContent({
      shortHash: 'abc12345',
      authorName: 'Zhang San',
      timeText: '2 days ago',
      summary: 'Harden multipath detach handling',
      isUncommitted: false,
      alreadyHighlighted: false,
      mode: 'full',
    });
    expect(content).to.contain('**Pentimento**');
    expect(content).to.contain('abc12345');
    expect(content).to.contain('Zhang San');
    expect(content).to.contain('Harden multipath detach handling');
    expect(content).to.contain(`command:${Commands.addCommitFromLine}`);
    expect(content).to.contain(`command:${Commands.openExactPatchRevision}`);
  });

  it('builds uncommitted hover content with working-tree actions', () => {
    const content = buildHoverContent({
      shortHash: '00000000',
      authorName: '',
      timeText: '',
      summary: '',
      isUncommitted: true,
      alreadyHighlighted: false,
      mode: 'compact',
    });
    expect(content).to.contain('Uncommitted Changes');
    expect(content).to.contain(`command:${Commands.highlightWorkingTree}`);
    expect(content).to.contain(`command:${Commands.highlightStaged}`);
  });

  it('compact mode omits exact-patch and view-files actions', () => {
    const content = buildHoverContent({
      shortHash: 'abc12345',
      authorName: 'A',
      timeText: 't',
      summary: 's',
      isUncommitted: false,
      alreadyHighlighted: false,
      mode: 'compact',
    });
    expect(content).to.contain(`command:${Commands.addCommitFromLine}`);
    expect(content).to.not.contain(`command:${Commands.openExactPatchRevision}`);
  });

  it('already-highlighted state shows remove/primary actions', () => {
    const content = buildHoverContent({
      shortHash: 'abc12345',
      authorName: 'A',
      timeText: 't',
      summary: 's',
      isUncommitted: false,
      alreadyHighlighted: true,
      mode: 'compact',
    });
    expect(content).to.contain(`command:${Commands.toggleCommitFromLine}`);
    expect(content).to.contain(`command:${Commands.setPrimaryPatch}`);
    expect(content).to.not.contain(`command:${Commands.addCommitFromLine}`);
  });
});
