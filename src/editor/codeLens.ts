import * as vscode from 'vscode';

export class AxarCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const text = document.getText();
    const isAxarDoc =
      text.includes('@axardb') ||
      document.isUntitled ||
      /\b(db|memory|bulk|view|trigger)\.[a-zA-Z0-9_]+\b/.test(text);

    if (!isAxarDoc || document.lineCount === 0) {
      return [];
    }

    // Place CodeLens on the first non-comment query line if available, plus top header
    let targetLineIndex = 0;
    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text.trim();
      if (lineText.length > 0 && !lineText.startsWith('//')) {
        targetLineIndex = i;
        break;
      }
    }

    const targetLine = document.lineAt(targetLineIndex);
    const range = new vscode.Range(targetLine.range.start, targetLine.range.end);

    const runCommand: vscode.Command = {
      title: '▶ Run AxarDB Query (Ctrl+Enter)',
      tooltip: 'Execute this AxarDB JavaScript query against the connected server',
      command: 'axardb.query.run',
    };

    return [new vscode.CodeLens(range, runCommand)];
  }
}
