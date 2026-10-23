import * as vscode from 'vscode';

export class AxarCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const text = document.getText();
    if (!text.includes('@axardb')) {
      return [];
    }

    const firstLine = document.lineAt(0);
    const range = new vscode.Range(firstLine.range.start, firstLine.range.end);

    const runCommand: vscode.Command = {
      title: '▶ Run AxarDB Query (Ctrl+Enter)',
      command: 'axardb.query.run',
    };

    return [new vscode.CodeLens(range, runCommand)];
  }
}
