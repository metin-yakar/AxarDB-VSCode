export function showToast(message: string, type: 'info' | 'error' | 'success' = 'info', durationMs = 3000): void {
  const existing = document.getElementById('axardb-toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'axardb-toast';
  toast.className = `axardb-toast toast-${type}`;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.padding = '8px 14px';
  toast.style.borderRadius = '4px';
  toast.style.fontSize = '12px';
  toast.style.zIndex = '9999';
  toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';

  if (type === 'error') {
    toast.style.backgroundColor = 'var(--vscode-inputValidation-errorBackground, #5a1d1d)';
    toast.style.color = 'var(--vscode-inputValidation-errorForeground, #ffffff)';
    toast.style.border = '1px solid var(--vscode-inputValidation-errorBorder, #be1100)';
  } else if (type === 'success') {
    toast.style.backgroundColor = 'var(--vscode-button-background, #0e639c)';
    toast.style.color = 'var(--vscode-button-foreground, #ffffff)';
  } else {
    toast.style.backgroundColor = 'var(--vscode-editorWidget-background, #252526)';
    toast.style.color = 'var(--vscode-foreground, #cccccc)';
    toast.style.border = '1px solid var(--vscode-widget-border, #454545)';
  }

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}
