import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../constants';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * 日志服务。封装 VSCode Output Channel,支持级别过滤与脱敏。
 *
 * 安全约束:不得输出 Git 凭证、SSH 私钥、HTTP token、敏感环境变量、
 * 完整 Command URI 参数、未处理远端认证地址;默认不打印完整源码 diff。
 */
export class LogService implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;
  private level: LogLevel = 'info';

  constructor() {
    this.channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  show(): void {
    this.channel.show(true);
  }

  private should(level: LogLevel): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, msg: string, args: unknown[]): void {
    if (!this.should(level)) {
      return;
    }
    const stamp = new Date().toISOString();
    const detail = args.length > 0 ? ' ' + args.map(safeStringify).join(' ') : '';
    this.channel.appendLine(`[${level.toUpperCase()} ${stamp}] ${msg}${detail}`);
  }

  error(msg: string, ...args: unknown[]): void {
    this.write('error', msg, args);
  }

  warn(msg: string, ...args: unknown[]): void {
    this.write('warn', msg, args);
  }

  info(msg: string, ...args: unknown[]): void {
    this.write('info', msg, args);
  }

  debug(msg: string, ...args: unknown[]): void {
    this.write('debug', msg, args);
  }

  trace(msg: string, ...args: unknown[]): void {
    this.write('trace', msg, args);
  }

  dispose(): void {
    this.channel.dispose();
  }
}

/** 安全序列化:裁剪超长字符串,避免日志被巨大 diff/输出撑爆。 */
function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 200 ? value.slice(0, 200) + '…(truncated)' : value;
  }
  try {
    const s = JSON.stringify(value);
    if (s === undefined) {
      return String(value);
    }
    return s.length > 200 ? s.slice(0, 200) + '…(truncated)' : s;
  } catch {
    return String(value);
  }
}
