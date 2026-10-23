// Mock implementation of 'vscode' for vitest unit tests

export class EventEmitter<T> {
  private listeners: Array<(e: T) => unknown> = [];

  public event = (listener: (e: T) => unknown) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx !== -1) this.listeners.splice(idx, 1);
      }
    };
  };

  public fire(data: T): void {
    for (const listener of [...this.listeners]) {
      listener(data);
    }
  }

  public dispose(): void {
    this.listeners = [];
  }
}

export class Disposable {
  constructor(private callOnDispose: () => void) {}
  static from(...disposables: { dispose(): unknown }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        d.dispose();
      }
    });
  }
  dispose() {
    this.callOnDispose?.();
  }
}

export class Uri {
  constructor(public scheme: string, public authority: string, public path: string, public query = '', public fragment = '') {}

  get fsPath(): string {
    return this.path.replace(/\//g, '\\');
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }

  static file(path: string): Uri {
    return new Uri('file', '', path.replace(/\\/g, '/'));
  }

  static parse(val: string): Uri {
    const u = new URL(val);
    return new Uri(u.protocol.replace(':', ''), u.host, u.pathname, u.search, u.hash);
  }
}

export const window = {
  createOutputChannel: (name: string) => ({
    name,
    append: (text: string) => {},
    appendLine: (text: string) => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  showInformationMessage: async (msg: string, ...items: string[]) => items[0],
  showWarningMessage: async (msg: string, ...items: string[]) => items[0],
  showErrorMessage: async (msg: string, ...items: string[]) => items[0],
  showSaveDialog: async (options: any) => Uri.file('C:/export-output.json'),
  withProgress: async (options: any, task: (progress: any, token: any) => Promise<any>) => {
    return task({ report: () => {} }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) });
  },
};

export const commands = {
  registerCommand: (command: string, callback: (...args: any[]) => any) => ({
    dispose: () => {},
  }),
  executeCommand: async (command: string, ...args: any[]) => {},
};

export const l10n = {
  t: (str: string, ...args: any[]) => str,
};

export const ProgressLocation = {
  Notification: 15,
  Window: 10,
};

export default {
  EventEmitter,
  Disposable,
  Uri,
  window,
  commands,
  l10n,
  ProgressLocation,
};
