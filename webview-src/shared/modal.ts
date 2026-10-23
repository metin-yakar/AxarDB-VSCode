export interface ModalOptions {
  title: string;
  body: HTMLElement | string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => Promise<boolean | void> | boolean | void;
  onCancel?: () => void;
}

export function openModal(options: ModalOptions): { close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const content = document.createElement('div');
  content.className = 'modal-content';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('span');
  title.textContent = options.title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => close();
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof options.body === 'string') {
    body.innerHTML = options.body;
  } else {
    body.appendChild(options.body);
  }

  // Footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = options.cancelText || 'Cancel';
  cancelBtn.onclick = () => {
    options.onCancel?.();
    close();
  };

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = options.confirmText || 'Save';
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    try {
      const res = await options.onConfirm?.();
      if (res !== false) {
        close();
      }
    } finally {
      confirmBtn.disabled = false;
    }
  };

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);

  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  overlay.appendChild(content);

  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
  };

  return { close };
}
