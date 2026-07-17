import { spawn, type ChildProcess } from 'child_process';
import { GitError, classifyGitError, toUserMessage } from './gitErrors';
import type { CancellationSignal } from '../utils/cancellation';
import { Semaphore } from '../utils/semaphore';

/** GitRunner 需要的最小日志接口(与 LogService 兼容)。 */
export interface GitLogger {
  debug(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface GitRunOptions {
  /** 自动在参数前加 `-C <repositoryRoot>`。 */
  repositoryRoot?: string;
  /** 子进程工作目录。 */
  cwd?: string;
  /** 超时毫秒,默认取 GitRunner 配置。 */
  timeout?: number;
  /** 取消信号。 */
  token?: CancellationSignal;
  /** 输出字节上限,默认取 GitRunner 配置。 */
  maxOutputBytes?: number;
  /** 标准输入。 */
  stdin?: string | Buffer;
  /** 额外环境变量。 */
  env?: Record<string, string>;
}

export interface GitRunResult {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/** GitRunner 接口,用于依赖注入与单元测试。 */
export interface IGitRunner {
  run(args: string[], opts?: GitRunOptions): Promise<GitRunResult>;
  runText(args: string[], opts?: GitRunOptions): Promise<string>;
}

export interface GitRunnerConfig {
  timeout: number;
  maxOutputBytes: number;
  maxConcurrent: number;
  binary?: string;
  /** 环境变量注入(用于测试或隔离)。 */
  envProvider?: () => Record<string, string>;
}

/**
 * 安全、异步、可测试的 Git 执行器。
 *
 * 安全约束:
 * - 仅以参数数组 spawn('git', args),绝不拼接 shell 字符串;
 * - 用户输入的 Revision/路径必须由上层校验后再以独立参数传入;
 * - 输出有字节上限,超限即 SIGKILL,防内存耗尽;
 * - 支持取消与超时;
 * - 并发由信号量节流。
 */
export class GitRunner implements IGitRunner {
  private readonly semaphore: Semaphore;
  private readonly binary: string;

  constructor(
    private readonly config: GitRunnerConfig,
    private readonly logger?: GitLogger,
  ) {
    this.semaphore = new Semaphore(config.maxConcurrent);
    this.binary = config.binary ?? 'git';
  }

  async run(args: string[], opts?: GitRunOptions): Promise<GitRunResult> {
    await this.semaphore.acquire();
    try {
      return await this.runInternal(args, opts);
    } finally {
      this.semaphore.release();
    }
  }

  async runText(args: string[], opts?: GitRunOptions): Promise<string> {
    const result = await this.run(args, opts);
    return result.stdout.toString('utf8');
  }

  private runInternal(args: string[], opts?: GitRunOptions): Promise<GitRunResult> {
    const fullArgs = opts?.repositoryRoot
      ? ['-C', opts.repositoryRoot, ...args]
      : args;
    const cwd = opts?.cwd;
    const env = {
      ...process.env,
      ...(this.config.envProvider?.() ?? {}),
      ...(opts?.env ?? {}),
    };
    const maxBytes = opts?.maxOutputBytes ?? this.config.maxOutputBytes;
    const timeout = opts?.timeout ?? this.config.timeout;
    const start = Date.now();

    return new Promise<GitRunResult>((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(this.binary, fullArgs, { cwd, env, windowsHide: true });
      } catch (e) {
        reject(new GitError('git-not-found', toUserMessage('git-not-found'), e));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      let limited = false;
      let cancelled = false;
      let timedOut = false;
      let stderrText = '';

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err && err.code === 'ENOENT') {
          reject(new GitError('git-not-found', toUserMessage('git-not-found'), err));
        } else {
          reject(new GitError('unknown', err?.message ?? 'spawn error', err));
        }
      });

      child.stdout?.on('data', (b: Buffer) => {
        if (limited) {
          return;
        }
        total += b.length;
        chunks.push(b);
        if (total > maxBytes) {
          limited = true;
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      });

      child.stderr?.on('data', (b: Buffer) => {
        stderrText += b.toString('utf8');
      });

      if (opts?.stdin !== undefined) {
        child.stdin?.end(opts.stdin);
      } else {
        child.stdin?.end();
      }

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
      }, timeout);

      let cancelSub: { dispose(): void } | undefined;
      if (opts?.token) {
        if (opts.token.isCancellationRequested) {
          cancelled = true;
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
        } else if (opts.token.onCancellationRequested) {
          cancelSub = opts.token.onCancellationRequested(() => {
            cancelled = true;
            try {
              child.kill('SIGTERM');
            } catch {
              // ignore
            }
          });
        }
      }

      child.on('close', (code, _signal) => {
        clearTimeout(timer);
        cancelSub?.dispose();
        const stdout = Buffer.concat(chunks);
        const durationMs = Date.now() - start;

        if (limited) {
          this.log('warn', 'git output limit exceeded', args, durationMs, -1, total);
          reject(new GitError('output-limit-exceeded', toUserMessage('output-limit-exceeded')));
          return;
        }
        if (cancelled) {
          this.log('debug', 'git command cancelled', args, durationMs, code ?? -1, total);
          reject(new GitError('command-cancelled', toUserMessage('command-cancelled')));
          return;
        }
        if (timedOut) {
          this.log('warn', 'git command timeout', args, durationMs, code ?? -1, total);
          reject(new GitError('command-timeout', toUserMessage('command-timeout')));
          return;
        }

        const exitCode = code ?? -1;
        this.log('debug', 'git command done', args, durationMs, exitCode, total);

        if (exitCode !== 0) {
          const errorCode = classifyGitError(stderrText, exitCode);
          reject(new GitError(errorCode, toUserMessage(errorCode)));
          return;
        }

        resolve({ stdout, stderr: stderrText, exitCode, durationMs });
      });
    });
  }

  private log(
    level: 'debug' | 'warn' | 'error',
    msg: string,
    args: string[],
    durationMs: number,
    exitCode: number,
    outputBytes: number,
  ): void {
    if (!this.logger) {
      return;
    }
    // 参数脱敏:只记录子命令与参数数量,不打印完整参数与输出。
    const subcommand = args[0] ?? '(none)';
    this.logger[level](
      `[git] ${msg}`,
      { subcommand, argCount: args.length, durationMs, exitCode, outputBytes },
    );
  }
}
