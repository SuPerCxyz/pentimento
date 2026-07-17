import { Commands } from '../constants';

/** 受信命令白名单:只允许 pentimento.* 命令。 */
const ALLOWED_COMMANDS = new Set<string>(Object.values(Commands));

export function isAllowedCommand(command: string): boolean {
  return ALLOWED_COMMANDS.has(command);
}

export interface HoverCommandLink {
  command: string;
  args: unknown[];
  label: string;
}

/**
 * 构建可点击的 command URI:`command:<id>?<encoded-args> [label]`。
 * 参数 JSON 序列化后 encodeURIComponent,防止注入。非白名单命令退化为纯文本。
 */
export function formatCommandLink(link: HoverCommandLink): string {
  if (!isAllowedCommand(link.command)) {
    return link.label;
  }
  const encoded = encodeURIComponent(JSON.stringify(link.args));
  return `command:${link.command}?${encoded} [${link.label}]`;
}

/** 转义行内文本中可能破坏 markdown 的字符。 */
export function escapeInline(text: string): string {
  return text
    .replace(/[`\\\]]/g, '\\$&')
    .replace(/\[/g, '\\$&');
}

export interface HoverCommitData {
  shortHash: string;
  authorName: string;
  timeText: string;
  summary: string;
  isUncommitted: boolean;
  alreadyHighlighted: boolean;
  mode: 'compact' | 'full';
}

/**
 * 构建 Hover 的 markdown 内容(纯字符串,不依赖 vscode)。
 * MarkdownString 包装在 hoverProvider 完成。
 */
export function buildHoverContent(data: HoverCommitData): string {
  const out: string[] = [];
  out.push('**Pentimento**');
  out.push('');

  if (data.isUncommitted) {
    out.push('Uncommitted Changes');
    out.push('');
    out.push(formatCommandLink({ command: Commands.highlightWorkingTree, args: [], label: '添加工作区修改到高亮' }) + '  ');
    out.push(formatCommandLink({ command: Commands.highlightStaged, args: [], label: '添加暂存区修改到高亮' }) + '  ');
    out.push(formatCommandLink({ command: Commands.clearAll, args: [], label: '清除高亮' }));
  } else {
    out.push(`\`${data.shortHash}\` · ${escapeInline(data.authorName)} · ${data.timeText}`);
    out.push('');
    out.push(escapeInline(data.summary));
    out.push('');

    if (data.alreadyHighlighted) {
      out.push(formatCommandLink({ command: Commands.toggleCommitFromLine, args: [data.shortHash], label: '取消此提交高亮' }) + '  ');
      out.push(formatCommandLink({ command: Commands.setPrimaryPatch, args: [data.shortHash], label: '设为主要 Patch' }) + '  ');
      out.push(formatCommandLink({ command: Commands.managePatches, args: [], label: '管理全部 Patch' }));
    } else {
      out.push(formatCommandLink({ command: Commands.addCommitFromLine, args: [data.shortHash], label: '添加此提交到高亮' }) + '  ');
      out.push(formatCommandLink({ command: Commands.highlightOnlyCommitFromLine, args: [data.shortHash], label: '仅高亮此提交' }) + '  ');
      if (data.mode === 'full') {
        out.push(formatCommandLink({ command: Commands.openExactPatchRevision, args: [data.shortHash], label: '打开精确 Patch 版本' }) + '  ');
        out.push(formatCommandLink({ command: Commands.showFiles, args: [], label: '查看提交文件' }) + '  ');
      }
      out.push(formatCommandLink({ command: Commands.managePatches, args: [], label: '管理已高亮 Patch' }));
    }
  }

  return out.join('\n');
}
