// Stub dos tipos `claude-code` para o editor (Cursor/tsc) quando a pasta gerada
// `*/.claude-plugin/types/` ainda não existe. O Claude Code grava os tipos reais ao
// carregar o mod com `--plugin-dir`; aí o tsconfig gerado passa a apontar para eles.
declare module 'claude-code' {
  export interface HttpResponse {
    readonly status: number;
    readonly ok: boolean;
    readonly headers: Readonly<Record<string, string>>;
    readonly text: string;
  }

  export interface SessionRateLimit {
    readonly kind?: string;
    readonly type?: string;
    readonly percentUsed?: number;
    readonly resetsAt?: number | string;
  }

  export interface EngineInterface {
    readonly env: {
      get(name: string): Promise<string | undefined>;
    };
    readonly clock: {
      after(ms: number, cb: () => void): { cancel(): void };
      every(ms: number, cb: () => void): { cancel(): void };
      now(): Promise<number>;
    };
    readonly http: {
      fetch(
        url: string,
        init?: { method?: string; headers?: Readonly<Record<string, string>>; body?: string },
      ): Promise<HttpResponse>;
    };
    readonly prompt: {
      submit(input: { text: string; asUser?: boolean }): Promise<{ drop?: string } | void>;
    };
    readonly session: {
      id(): Promise<string>;
      surfaces(): Promise<ReadonlyArray<'terminal' | 'desktop'>>;
      usage(): Promise<{ rateLimits: readonly SessionRateLimit[] }>;
    };
    readonly ui: {
      status(text: string | undefined): void;
    };
    readonly fs: {
      write(path: string, data: string): Promise<void>;
    };
    readonly command: {
      register(input: { name: string; description: string }): Promise<void>;
    };
  }

  type Next<E> = (event: E) => unknown | Promise<unknown>;
  type HookHandler<E = unknown> = (engine: EngineInterface, event: E, next: Next<E>) => unknown | Promise<unknown>;

  export interface RegisterOn {
    (event: 'session.start', handler: HookHandler): void;
    (event: 'session.measure', handler: HookHandler<{ rateLimits: readonly SessionRateLimit[] }>): void;
    (event: 'command.run', opts: { command: string }, handler: (engine: EngineInterface) => unknown | Promise<unknown>): void;
    (event: string, handler: HookHandler): void;
  }

  export type Register = (on: RegisterOn) => void;
}
