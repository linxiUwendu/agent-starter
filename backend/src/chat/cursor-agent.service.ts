import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { AGENT_NAME, ChatMessage, SYSTEM_PROMPT } from "../agent/agent.constants";
import { streamTextCharByChar } from "../common/sse.util";
import { mockAgentToolStep, parseAgentToolStep } from "../travel/travel-tools.util";
import {
  buildCursorAgentShellCommand,
  computeStreamDelta,
  enrichCursorAgentErrorMessage,
  generateMockAnswer,
  isRetryableCursorAgentError,
} from "./cursor-agent.util";

export type DeltaHandler = (text: string) => void;

@Injectable()
export class CursorAgentService {
  private readonly logger = new Logger(CursorAgentService.name);
  private agentLock: Promise<void> = Promise.resolve();

  constructor(private readonly config: ConfigService) {}

  /**
   * @description 读取 cursor-agent CLI 可执行命令名，默认 `cursor-agent`。
   * @returns 环境变量 CURSOR_AGENT_COMMAND 或默认值
   */
  private get command() {
    return this.config.get<string>("CURSOR_AGENT_COMMAND") ?? "cursor-agent";
  }

  /**
   * @description 单次 agent 调用的总超时毫秒数，超时则 SIGTERM 并 reject。
   * @returns 毫秒数，默认 300000（5 分钟）
   */
  private get timeoutMs() {
    return Number(this.config.get<string>("CURSOR_TIMEOUT_MS") ?? 300000);
  }

  /**
   * @description stdout/stderr 无输出的停滞检测阈值，用于识别未登录或挂起。
   * @returns 毫秒数，默认 45000
   */
  private get stallMs() {
    return Number(this.config.get<string>("CURSOR_STALL_MS") ?? 45000);
  }

  /** 网络类失败时的额外重试次数（默认 1 → 最多共 2 次调用） */
  private get agentRetries() {
    return Math.max(0, Number(this.config.get<string>("CURSOR_AGENT_RETRIES") ?? 1));
  }

  /**
   * @description 组装 prompt 时保留的最近对话条数上限，0 表示不截断。
   * @returns 消息条数，默认 20
   */
  private get maxHistoryMessages() {
    return Number(this.config.get<string>("MAX_HISTORY_MESSAGES") ?? 20);
  }

  /**
   * @description 是否通过 CURSOR_API_KEY 环境变量认证（而非 CLI login）。
   * @returns CURSOR_USE_API_KEY === "true"
   */
  private get useApiKey() {
    return this.config.get<string>("CURSOR_USE_API_KEY") === "true";
  }

  /**
   * @description 是否启用 Mock 模式，跳过真实 CLI 调用。
   * @returns MOCK_AGENT === "true"
   */
  private get mockAgent() {
    return this.config.get<string>("MOCK_AGENT") === "true";
  }

  /**
   * @description 解析 monorepo 项目根目录，作为 cursor-agent 子进程的 cwd。
   * @returns 绝对路径（backend 上两级）
   */
  private get projectRoot() {
    return path.resolve(__dirname, "../../..");
  }

  /**
   * @description 根据认证模式生成用户可读的错误提示，引导配置 API Key 或 CLI 登录。
   * @returns 中文提示字符串
   */
  private authHint() {
    if (this.useApiKey) {
      return "请检查 .env 中的 CURSOR_API_KEY 是否有效（无效 key 会导致 cursor-agent 长时间无响应）。";
    }
    return "请在终端运行 cursor-agent login 完成登录，或在 .env 中设置有效的 CURSOR_API_KEY 并设置 CURSOR_USE_API_KEY=true。";
  }

  /**
   * @description 构造子进程环境变量；非 API Key 模式时移除 CURSOR_API_KEY 避免冲突。
   * @returns 继承 process.env 的副本
   */
  private getAgentEnv() {
    const env = { ...process.env };
    if (!this.useApiKey) delete env.CURSOR_API_KEY;
    // 与交互式终端一致：保留代理与身份路径，避免 IDE 子进程读不到 CLI 登录态（macOS 钥匙串）
    for (const key of [
      "HOME",
      "USER",
      "LOGNAME",
      "TMPDIR",
      "PATH",
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "NO_PROXY",
      "no_proxy",
    ]) {
      const value = process.env[key];
      if (value) env[key] = value;
    }
    return env;
  }

  /**
   * 经 zsh/bash login shell（-il -c）启动会破坏 cursor-agent 云端连接（约 12s ETIMEDOUT）；
   * 仅当显式 CURSOR_AGENT_SPAWN_SHELL=login 时启用。
   */
  private get spawnViaLoginShell() {
    return this.config.get<string>("CURSOR_AGENT_SPAWN_SHELL") === "login";
  }

  private spawnAgentProcess(spawnArgs: string[]) {
    const env = this.getAgentEnv();
    const cwd = this.projectRoot;

    if (this.spawnViaLoginShell) {
      const shell = env.SHELL?.trim() || "/bin/zsh";
      const cmd = buildCursorAgentShellCommand(this.command, spawnArgs);
      this.logger.warn(
        `cursor-agent spawn mode=login-shell (may ETIMEDOUT if .zshrc sets proxy); shell=${shell}`,
      );
      return spawn(shell, ["-il", "-c", cmd], {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    this.logger.log("cursor-agent spawn mode=direct");
    return spawn(this.command, spawnArgs, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  /**
   * @description 串行化 cursor-agent 调用：同一时刻仅允许一个 CLI 子进程，避免并发争用。
   * @param fn 在锁内执行的异步函数
   * @returns fn 的返回值
   */
  private async withAgentLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.agentLock;
    let release!: () => void;
    this.agentLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * @description 将系统提示与截断后的对话历史 transcript 拼接为通用聊天 prompt。
   * @param messages 完整对话历史
   * @returns 供 cursor-agent 推理的单段 prompt 文本
   */
  buildPrompt(messages: ChatMessage[]) {
    const recent =
      this.maxHistoryMessages > 0 ? messages.slice(-this.maxHistoryMessages) : messages;
    const transcript = recent
      .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
      .join("\n\n");

    return [SYSTEM_PROMPT, "", "下面是当前对话历史。请只回复最后一个用户问题。", "", transcript].join(
      "\n",
    );
  }

  /**
   * @description MOCK_AGENT 模式下不调 CLI，基于 prompt 内嵌上下文生成并流式推送演示答案。
   * @param prompt 完整 prompt 文本
   * @param onDelta 增量文本回调
   * @returns 完整 Mock 答案字符串
   */
  private async runMock(prompt: string, onDelta: DeltaHandler): Promise<string> {
    const answer = generateMockAnswer(prompt);
    this.logger.log(`mock agent answerLen=${answer.length}`);
    await streamTextCharByChar(onDelta, answer, { charDelayMs: 22, maxDurationMs: 12_000 });
    return answer;
  }

  /**
   * @description 非流式收集 cursor-agent 完整输出，供 Tool Loop 规划轮使用。
   */
  async runCollect(prompt: string): Promise<string> {
    if (this.mockAgent && prompt.includes("工具调度器")) {
      const userMessage = prompt.match(/用户问题:\s*(.+)/)?.[1]?.trim() ?? "";
      const city = prompt.match(/city_id=([a-z0-9_]+)/i)?.[1] ?? "chengdu";
      const raw = mockAgentToolStep(userMessage, city, 0, []);
      const step = parseAgentToolStep(raw);
      if (step.action === "tool_calls") return raw;
    }
    if (this.mockAgent) {
      return generateMockAnswer(prompt);
    }
    return this.run(prompt, () => {});
  }

  /**
   * @description spawn cursor-agent 子进程，解析 stdout 的 stream-json 行并流式回调 onDelta，返回最终答案。
   * @param prompt 传给 CLI 的完整 prompt（作为最后一个参数）
   * @param onDelta 每段新增 assistant 文本的回调
   * @returns Promise  resolve 为 trim 后的完整答案
   */
  async run(prompt: string, onDelta: DeltaHandler): Promise<string> {
    if (this.mockAgent) {
      return this.runMock(prompt, onDelta);
    }

    return this.withAgentLock(async () => {
      const maxAttempts = 1 + this.agentRetries;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await this.runCliOnce(prompt, onDelta);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const retryable = isRetryableCursorAgentError(lastError.message);
          if (!retryable || attempt >= maxAttempts) {
            throw new Error(enrichCursorAgentErrorMessage(lastError.message, this.authHint()));
          }
          this.logger.warn(
            `cursor-agent attempt ${attempt}/${maxAttempts} failed (${lastError.message}); retrying in 2s…`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      throw new Error(enrichCursorAgentErrorMessage(lastError?.message ?? "unknown", this.authHint()));
    });
  }

  /** 单次 CLI 调用；流式增量在成功前仅缓冲，避免失败重试时前端出现半条回复 */
  private runCliOnce(prompt: string, onDelta: DeltaHandler): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const startedAt = Date.now();
      let child: ChildProcess | null = null;
      let settled = false;
      let stdoutBuffer = "";
      let streamedText = "";
      let finalResult = "";
      let stderrText = "";
      let lastActivityAt = Date.now();
      const pendingDeltas: string[] = [];

      const spawnArgs = [
        "-p",
        "--trust",
        "--force",
        "--mode",
        "ask",
        "--output-format",
        "stream-json",
        "--stream-partial-output",
        prompt,
      ];

      let timeoutId: ReturnType<typeof setTimeout>;
      let stallTimer: ReturnType<typeof setInterval>;

      const cleanup = () => {
        settled = true;
        clearTimeout(timeoutId);
        clearInterval(stallTimer);
        child?.kill("SIGTERM");
      };

      const fail = (error: Error) => {
        if (settled) return;
        cleanup();
        if (stderrText.trim()) {
          this.logger.warn(`cursor-agent stderr: ${stderrText.trim().slice(0, 600)}`);
        }
        this.logger.error(`error ${Date.now() - startedAt}ms ${error.message}`);
        reject(error);
      };

      const flushDeltas = () => {
        for (const delta of pendingDeltas) onDelta(delta);
      };

      const succeed = (answer: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        clearInterval(stallTimer);
        flushDeltas();
        this.logger.log(`done ${Date.now() - startedAt}ms answerLen=${answer.length}`);
        resolve(answer);
      };

      const processLine = (line: string) => {
        if (!line.trim()) return;
        lastActivityAt = Date.now();

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        const delta = computeStreamDelta(event, streamedText);
        if (delta) {
          streamedText += delta;
          pendingDeltas.push(delta);
          return;
        }

        if (event.type === "result" && event.subtype === "success") {
          finalResult = typeof event.result === "string" ? event.result : streamedText;
          const remaining = finalResult.slice(streamedText.length);
          if (remaining) {
            streamedText += remaining;
            pendingDeltas.push(remaining);
          }
        }
      };

      this.logger.log(
        `cursor-agent spawn promptChars=${prompt.length} cwd=${this.projectRoot}`,
      );
      if (prompt.length > 60_000) {
        this.logger.warn(
          `cursor-agent prompt very large (${prompt.length} chars); may increase timeout risk`,
        );
      }

      child = this.spawnAgentProcess(spawnArgs);

      if (!child.stdout || !child.stderr) {
        fail(new Error("Failed to start cursor-agent process."));
        return;
      }

      timeoutId = setTimeout(() => {
        fail(new Error(`cursor-agent timed out after ${Math.round(this.timeoutMs / 1000)} seconds.`));
      }, this.timeoutMs);

      stallTimer = setInterval(() => {
        if (Date.now() - lastActivityAt > this.stallMs) {
          fail(
            new Error(
              `cursor-agent 在 ${Math.round(this.stallMs / 1000)} 秒内无任何输出。${this.authHint()}`,
            ),
          );
        }
      }, 5000);

      child.stdout.on("data", (chunk: Buffer) => {
        lastActivityAt = Date.now();
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line.replace(/\r$/, ""));
      });

      child.stderr.on("data", (chunk: Buffer) => {
        lastActivityAt = Date.now();
        stderrText += chunk.toString("utf8");
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        const message =
          error.code === "ENOENT"
            ? `Cannot find '${this.command}'. Install Cursor CLI or set CURSOR_AGENT_COMMAND.`
            : error.message;
        fail(new Error(message));
      });

      child.on("close", (code) => {
        if (settled) return;

        if (stdoutBuffer.trim()) {
          processLine(stdoutBuffer);
          stdoutBuffer = "";
        }

        const answer = (finalResult || streamedText).trim();
        if (code === 0 && answer) {
          succeed(answer);
          return;
        }

        const stderr = stderrText.trim();
        const combined = [stderr, `exit ${code ?? "unknown"}`].filter(Boolean).join(" ");
        if (stderr.includes("Authentication required")) {
          fail(new Error(`cursor-agent 未登录。${this.authHint()}`));
          return;
        }
        fail(new Error(combined || `cursor-agent exited with code ${code ?? "unknown"}.`));
      });
    });
  }

  /**
   * @description 返回 agent 健康检查与配置快照，供 /health 或运维排查使用。
   * @returns 含命令、超时、Mock/API Key 状态等的对象
   */
  getHealthInfo() {
    return {
      ok: true,
      agent: AGENT_NAME,
      command: this.command,
      mockAgent: this.mockAgent,
      useApiKey: this.useApiKey,
      hasCursorApiKey: Boolean(this.config.get<string>("CURSOR_API_KEY")),
      timeoutMs: this.timeoutMs,
      stallMs: this.stallMs,
      spawnShell: this.spawnViaLoginShell ? "login" : "direct",
      streaming: true,
      mode: "ask",
    };
  }
}
