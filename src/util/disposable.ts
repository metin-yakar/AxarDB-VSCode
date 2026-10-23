import * as vscode from 'vscode';

export class DisposableStore implements vscode.Disposable {
  private _isDisposed = false;
  private readonly _disposables = new Set<vscode.Disposable>();

  public add<T extends vscode.Disposable>(disposable: T): T {
    if (this._isDisposed) {
      disposable.dispose();
      return disposable;
    }
    this._disposables.add(disposable);
    return disposable;
  }

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    for (const d of this._disposables) {
      try {
        d.dispose();
      } catch (err) {
        console.error('Error disposing object:', err);
      }
    }
    this._disposables.clear();
  }
}
