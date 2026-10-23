import * as vscode from 'vscode';

export class Logger {
  private static _channel: vscode.OutputChannel | undefined;

  public static initialize(): vscode.OutputChannel {
    if (!this._channel) {
      this._channel = vscode.window.createOutputChannel('AxarDB');
    }
    return this._channel;
  }

  public static get channel(): vscode.OutputChannel {
    return this.initialize();
  }

  public static log(message: string): void {
    const ts = new Date().toISOString();
    const safeMsg = this.sanitize(message);
    this.channel.appendLine(`[${ts}] [INFO] ${safeMsg}`);
  }

  public static info(message: string): void {
    this.log(message);
  }

  public static warn(message: string): void {
    const ts = new Date().toISOString();
    const safeMsg = this.sanitize(message);
    this.channel.appendLine(`[${ts}] [WARN] ${safeMsg}`);
  }

  public static error(message: string, error?: unknown): void {
    const ts = new Date().toISOString();
    const safeMsg = this.sanitize(message);
    const errDetail = error instanceof Error ? ` | ${error.stack || error.message}` : error ? ` | ${String(error)}` : '';
    this.channel.appendLine(`[${ts}] [ERROR] ${safeMsg}${errDetail}`);
  }

  private static sanitize(text: string): string {
    return text.replace(/([Pp]assword|[Ss]ecret|[Tt]oken)=[^&\s]+/g, '$1=***');
  }
}
