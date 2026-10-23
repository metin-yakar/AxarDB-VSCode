export interface SplitterOptions {
  container: HTMLElement;
  leftPane: HTMLElement;
  rightPane: HTMLElement;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
}

export function initSplitter(splitterEl: HTMLElement, options: SplitterOptions): () => void {
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;
  const minWidth = options.minWidth || 180;
  const maxWidth = options.maxWidth || 800;

  if (options.initialWidth) {
    options.rightPane.style.width = `${options.initialWidth}px`;
  }

  const onMouseDown = (e: MouseEvent) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = options.rightPane.getBoundingClientRect().width;
    splitterEl.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = startX - e.clientX; // dragging rightPane from left edge
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
    options.rightPane.style.width = `${newWidth}px`;
    options.onResize?.(newWidth);
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    splitterEl.classList.remove('dragging');
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  splitterEl.addEventListener('mousedown', onMouseDown);

  return () => {
    splitterEl.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}
