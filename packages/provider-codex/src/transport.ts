// crypto.randomUUID() is a Web API available natively in Bun (no import needed)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type IncomingMessage =
  | { kind: "response"; value: JsonRpcResponse }
  | { kind: "notification"; value: JsonRpcNotification }
  | { kind: "request"; value: JsonRpcRequest };

function classify(raw: Record<string, unknown>): IncomingMessage {
  if ("id" in raw && ("result" in raw || "error" in raw)) {
    return { kind: "response", value: raw as unknown as JsonRpcResponse };
  }
  if ("id" in raw && "method" in raw) {
    return { kind: "request", value: raw as unknown as JsonRpcRequest };
  }
  return { kind: "notification", value: raw as unknown as JsonRpcNotification };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportError";
  }
}

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "RpcError";
  }
}

// ---------------------------------------------------------------------------
// Pending request tracking
// ---------------------------------------------------------------------------

interface PendingRequest {
  timer: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Transport options
// ---------------------------------------------------------------------------

export interface TransportOptions {
  executablePath: string;
  userAgent?: string;
  cwd?: string;
  env?: Record<string, string>;
  requestTimeoutMs?: number;
  onStderr?: (line: string) => void;
  experimentalApi?: boolean;
}

// ---------------------------------------------------------------------------
// JSON-brace-depth frame parser
// Same algorithm as farfield to handle multi-chunk stdout correctly.
// ---------------------------------------------------------------------------

function escapeControlChar(char: string): string {
  switch (char) {
    case "\b": return "\\b";
    case "\f": return "\\f";
    case "\n": return "\\n";
    case "\r": return "\\r";
    case "\t": return "\\t";
  }
  const code = char.charCodeAt(0);
  if (code <= 0x1f) {
    return `\\u${code.toString(16).padStart(4, "0")}`;
  }
  return char;
}

// ---------------------------------------------------------------------------
// AppServerTransport — Bun-native reimplementation
// ---------------------------------------------------------------------------

export class AppServerTransport {
  private readonly opts: Required<Omit<TransportOptions, "cwd" | "env" | "onStderr">> &
    Pick<TransportOptions, "cwd" | "env" | "onStderr">;

  private process: ReturnType<typeof Bun.spawn> | null = null;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationListeners = new Set<(n: JsonRpcNotification) => void>();
  private readonly serverRequestListeners = new Set<(r: JsonRpcRequest) => void>();

  private requestId = 0;
  private initialized = false;
  private initInFlight: Promise<void> | null = null;

  // Frame parser state
  private frameBuffer = "";
  private frameDepth = 0;
  private frameInString = false;
  private frameEscaped = false;
  private stdoutBuffer = "";

  constructor(opts: TransportOptions) {
    this.opts = {
      executablePath: opts.executablePath,
      userAgent: opts.userAgent ?? "ctx-migrate/0.1.0",
      cwd: opts.cwd,
      env: opts.env,
      requestTimeoutMs: opts.requestTimeoutMs ?? 30_000,
      onStderr: opts.onStderr,
      experimentalApi: opts.experimentalApi ?? false,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private ensureStarted(): void {
    if (this.process) return;

    this.resetFrame();

    const execPath = this.opts.executablePath;
    // On Windows, non-.exe paths need shell wrapping (matches farfield logic)
    const needsShell =
      process.platform === "win32" && !execPath.toLowerCase().endsWith(".exe");

    const proc = Bun.spawn(
      needsShell ? ["cmd", "/c", execPath, "app-server"] : [execPath, "app-server"],
      {
        cwd: this.opts.cwd,
        env: {
          ...process.env,
          ...(this.opts.env ?? {}),
          CODEX_USER_AGENT: this.opts.userAgent,
          CODEX_CLIENT_ID: `ctx-migrate-${crypto.randomUUID()}`,
        } as Record<string, string>,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
      }
    );

    this.process = proc;

    // Read stdout line-by-line (Bun ReadableStream)
    void this.consumeStdout(proc.stdout);
    void this.consumeStderr(proc.stderr);

    void proc.exited.then((code) => {
      this.resetFrame();
      this.rejectAll(
        new TransportError(`codex app-server exited (code=${String(code)})`)
      );
      this.process = null;
      this.initialized = false;
      this.initInFlight = null;
    });
  }

  private async consumeStdout(stream: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        this.stdoutBuffer += text;
        // Process complete JSON objects from the buffer
        this.processStdoutBuffer();
      }
    } catch (err) {
      this.rejectAll(
        new TransportError(`stdout read error: ${String(err)}`)
      );
    }
  }

  private processStdoutBuffer(): void {
    for (const char of this.stdoutBuffer) {
      if (this.frameDepth === 0) {
        if (/\s/.test(char)) continue;
        if (char !== "{") {
          throw new TransportError(
            `unexpected character on stdout: ${JSON.stringify(char)}`
          );
        }
        this.resetFrame();
        this.frameDepth = 1;
        this.frameBuffer = "{";
        continue;
      }

      if (this.frameInString) {
        if (this.frameEscaped) {
          this.frameBuffer += escapeControlChar(char);
          this.frameEscaped = false;
          continue;
        }
        if (char === "\\") {
          this.frameBuffer += char;
          this.frameEscaped = true;
          continue;
        }
        if (char === '"') {
          this.frameBuffer += char;
          this.frameInString = false;
          continue;
        }
        this.frameBuffer += escapeControlChar(char);
        continue;
      }

      this.frameBuffer += char;

      if (char === '"') { this.frameInString = true; continue; }
      if (char === "{") { this.frameDepth += 1; continue; }
      if (char === "}") {
        this.frameDepth -= 1;
        if (this.frameDepth === 0) {
          const raw = JSON.parse(this.frameBuffer) as Record<string, unknown>;
          this.resetFrame();
          this.handleMessage(classify(raw));
        }
      }
    }
    this.stdoutBuffer = "";
  }

  private async consumeStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let lineBuffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) this.opts.onStderr?.(trimmed);
        }
      }
    } catch {
      // stderr errors are non-fatal
    }
  }

  private resetFrame(): void {
    this.frameBuffer = "";
    this.frameDepth = 0;
    this.frameInString = false;
    this.frameEscaped = false;
  }

  // ---------------------------------------------------------------------------
  // Message dispatch
  // ---------------------------------------------------------------------------

  private handleMessage(msg: IncomingMessage): void {
    if (msg.kind === "response") {
      const pending = this.pending.get(msg.value.id);
      if (!pending) return;

      this.pending.delete(msg.value.id);
      clearTimeout(pending.timer);

      if (msg.value.error) {
        pending.reject(
          new RpcError(
            msg.value.error.code,
            msg.value.error.message,
            msg.value.error.data
          )
        );
        return;
      }
      pending.resolve(msg.value.result);
      return;
    }

    if (msg.kind === "request") {
      // Auto-respond with -32601 to server-initiated requests we don't handle
      void this.writeRaw({
        id: msg.value.id,
        error: { code: -32601, message: "Method not supported by client" },
      }).catch(() => {});

      for (const listener of this.serverRequestListeners) {
        listener(msg.value);
      }
      return;
    }

    // notification
    for (const listener of this.notificationListeners) {
      listener(msg.value);
    }
  }

  // ---------------------------------------------------------------------------
  // Wire writing
  // ---------------------------------------------------------------------------

  private async writeRaw(payload: unknown): Promise<void> {
    const proc = this.process;
    const stdin = proc?.stdin;
    if (!proc || !stdin || typeof stdin === "number") {
      throw new TransportError("transport is not connected");
    }
    const encoded = `${JSON.stringify(payload)}\n`;
    stdin.write(encoded);
    await stdin.flush();
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    await this.writeRaw({ jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) });
  }

  private sendRequest(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    const id = ++this.requestId;
    const timeout = timeoutMs ?? this.opts.requestTimeoutMs;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new TransportError(`RPC timeout: ${method}`));
      }, timeout);

      this.pending.set(id, { timer, resolve, reject });

      void this.writeRaw({
        jsonrpc: "2.0",
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      }).catch((err: Error) => {
        const p = this.pending.get(id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(id);
        reject(err);
      });
    });
  }

  private rejectAll(error: Error): void {
    for (const { timer, reject } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  // ---------------------------------------------------------------------------
  // Initialization handshake
  // ---------------------------------------------------------------------------

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initInFlight) return this.initInFlight;

    this.initInFlight = (async () => {
      const capabilities = this.opts.experimentalApi ? { experimentalApi: true } : {};

      await this.sendRequest(
        "initialize",
        {
          clientInfo: { name: "ctx-migrate", version: "0.1.0" },
          ...(Object.keys(capabilities).length > 0 ? { capabilities } : {}),
        },
        this.opts.requestTimeoutMs
      );

      await this.sendNotification("initialized");
      this.initialized = true;
    })().finally(() => {
      this.initInFlight = null;
    });

    return this.initInFlight;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    this.ensureStarted();
    if (method !== "initialize") {
      await this.ensureInitialized();
    }
    return this.sendRequest(method, params, timeoutMs);
  }

  onNotification(listener: (n: JsonRpcNotification) => void): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onServerRequest(listener: (r: JsonRpcRequest) => void): () => void {
    this.serverRequestListeners.add(listener);
    return () => this.serverRequestListeners.delete(listener);
  }

  async close(): Promise<void> {
    const proc = this.process;
    if (!proc) return;

    this.resetFrame();
    this.process = null;
    this.initialized = false;
    this.initInFlight = null;
    this.rejectAll(new TransportError("transport closed"));

    proc.kill();
  }
}
