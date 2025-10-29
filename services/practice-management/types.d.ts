declare const __dirname: string;

declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

declare const process: {
  exitCode: number | undefined;
  env: Record<string, string | undefined>;
};

declare const require: {
  main?: { filename?: string };
};

declare const module: {
  exports: unknown;
};

declare module 'fs' {
  export const promises: {
    readFile(path: string, encoding: string): Promise<string>;
    writeFile(path: string, data: string, encoding?: string): Promise<void>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  };
}

declare module 'path' {
  export function join(...parts: string[]): string;
}

declare module 'crypto' {
  export function randomUUID(): string;
}

declare module 'node:test' {
  type TestFunction = () => void | Promise<void>;
  export function describe(name: string, fn: TestFunction): void;
  export function it(name: string, fn: TestFunction): void;
  export function beforeEach(fn: TestFunction): void;
}

declare module 'node:assert/strict' {
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  };
  export default assert;
}
