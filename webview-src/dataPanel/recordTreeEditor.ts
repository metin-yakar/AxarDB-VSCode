export interface TreeEditorResult {
  element: HTMLElement;
  getValue: () => unknown;
}

function applyBaseInputStyle(el: HTMLElement): void {
  el.style.backgroundColor = 'var(--vscode-input-background, #1e1e1e)';
  el.style.color = 'var(--vscode-input-foreground, #cccccc)';
  el.style.border = '1px solid var(--vscode-input-border, rgba(255, 255, 255, 0.15))';
  el.style.borderRadius = '3px';
  el.style.padding = '4px 6px';
  el.style.fontSize = '12px';
  el.style.boxSizing = 'border-box';
  el.style.outline = 'none';
}

function inferType(val: unknown): 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object' {
  if (val === null || val === undefined) return 'null';
  if (Array.isArray(val)) return 'array';
  const t = typeof val;
  if (t === 'number' || t === 'boolean' || t === 'string') return t;
  return 'object';
}

export function createComplexFieldEditor(
  initialValue: unknown,
  readOnly: boolean,
  depth = 0
): TreeEditorResult {
  const container = document.createElement('div');
  container.className = 'ax-tree-node';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '4px';
  container.style.width = '100%';
  container.style.boxSizing = 'border-box';

  let currentVal = initialValue;
  let isRawJson = false;

  // Header Bar (Type summary, Expand/Collapse, Raw JSON Switch)
  const headerBar = document.createElement('div');
  headerBar.className = 'ax-tree-header';
  headerBar.style.display = 'flex';
  headerBar.style.alignItems = 'center';
  headerBar.style.justifyContent = 'space-between';
  headerBar.style.padding = '3px 6px';
  headerBar.style.backgroundColor = 'var(--vscode-sideBar-background, rgba(0,0,0,0.2))';
  headerBar.style.border = '1px solid var(--border-color, rgba(255,255,255,0.1))';
  headerBar.style.borderRadius = '3px';
  headerBar.style.fontSize = '11px';

  const leftHeader = document.createElement('div');
  leftHeader.style.display = 'flex';
  leftHeader.style.alignItems = 'center';
  leftHeader.style.gap = '6px';
  leftHeader.style.cursor = 'pointer';

  const toggleArrow = document.createElement('span');
  toggleArrow.textContent = '▼';
  toggleArrow.style.fontSize = '9px';
  toggleArrow.style.transition = 'transform 0.15s ease';
  leftHeader.appendChild(toggleArrow);

  const summaryLabel = document.createElement('span');
  summaryLabel.style.fontWeight = '500';
  summaryLabel.style.color = 'var(--vscode-descriptionForeground)';
  leftHeader.appendChild(summaryLabel);
  headerBar.appendChild(leftHeader);

  const rightActions = document.createElement('div');
  rightActions.style.display = 'flex';
  rightActions.style.alignItems = 'center';
  rightActions.style.gap = '4px';

  // Toggle between Tree and Raw JSON
  const jsonToggleBtn = document.createElement('button');
  jsonToggleBtn.type = 'button';
  jsonToggleBtn.className = 'icon-btn';
  jsonToggleBtn.textContent = '{ }';
  jsonToggleBtn.title = 'Switch between Structured View and Raw JSON';
  jsonToggleBtn.style.fontSize = '10px';
  jsonToggleBtn.style.padding = '1px 5px';
  jsonToggleBtn.style.border = '1px solid var(--border-color, rgba(255,255,255,0.15))';
  jsonToggleBtn.style.borderRadius = '2px';
  jsonToggleBtn.style.background = 'transparent';
  jsonToggleBtn.style.color = 'var(--vscode-foreground)';
  rightActions.appendChild(jsonToggleBtn);

  headerBar.appendChild(rightActions);
  container.appendChild(headerBar);

  // Content Wrapper
  const contentBody = document.createElement('div');
  contentBody.className = 'ax-tree-body';
  contentBody.style.display = 'flex';
  contentBody.style.flexDirection = 'column';
  contentBody.style.gap = '6px';
  contentBody.style.paddingLeft = '8px';
  contentBody.style.marginLeft = '4px';
  contentBody.style.borderLeft = '2px solid var(--vscode-tree-indentGuidesStroke, rgba(128,128,128,0.3))';
  contentBody.style.boxSizing = 'border-box';
  container.appendChild(contentBody);

  let isCollapsed = false;
  leftHeader.onclick = () => {
    isCollapsed = !isCollapsed;
    toggleArrow.textContent = isCollapsed ? '▶' : '▼';
    contentBody.style.display = isCollapsed ? 'none' : 'flex';
  };

  let activeGetter: () => unknown = () => currentVal;

  function renderView(): void {
    contentBody.innerHTML = '';

    if (isRawJson) {
      summaryLabel.textContent = Array.isArray(currentVal)
        ? `[Array] (${currentVal.length} items - Raw JSON)`
        : `{Object} (Raw JSON)`;
      jsonToggleBtn.style.backgroundColor = 'var(--vscode-button-background)';
      jsonToggleBtn.style.color = 'var(--vscode-button-foreground)';

      const textarea = document.createElement('textarea');
      applyBaseInputStyle(textarea);
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '11px';
      textarea.style.width = '100%';
      textarea.style.minHeight = '90px';
      textarea.value = JSON.stringify(currentVal, null, 2);
      textarea.disabled = readOnly;

      contentBody.appendChild(textarea);
      activeGetter = () => {
        try {
          return JSON.parse(textarea.value);
        } catch {
          return textarea.value;
        }
      };
      return;
    }

    jsonToggleBtn.style.backgroundColor = 'transparent';
    jsonToggleBtn.style.color = 'var(--vscode-foreground)';

    // Array Tree / Accordion View
    if (Array.isArray(currentVal)) {
      renderArrayTree(contentBody, currentVal);
    } else if (typeof currentVal === 'object' && currentVal !== null) {
      // Object Tree / Property Group
      renderObjectTree(contentBody, currentVal as Record<string, unknown>);
    } else {
      // Primitive fallback
      summaryLabel.textContent = `${inferType(currentVal)}`;
      const primResult = createPrimitiveControl(currentVal, readOnly);
      contentBody.appendChild(primResult.element);
      activeGetter = primResult.getValue;
    }
  }

  function renderArrayTree(target: HTMLElement, arr: unknown[]): void {
    summaryLabel.textContent = `[${arr.length} item${arr.length === 1 ? '' : 's'}]`;

    const itemGetters: (() => unknown)[] = [];

    if (arr.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.fontSize = '11px';
      emptyMsg.style.color = 'var(--vscode-descriptionForeground)';
      emptyMsg.style.fontStyle = 'italic';
      emptyMsg.style.padding = '4px 0';
      emptyMsg.textContent = '(empty array)';
      target.appendChild(emptyMsg);
    }

    arr.forEach((item, index) => {
      const itemRow = document.createElement('div');
      itemRow.style.display = 'flex';
      itemRow.style.alignItems = 'flex-start';
      itemRow.style.gap = '6px';
      itemRow.style.width = '100%';
      itemRow.style.boxSizing = 'border-box';

      // Index badge [0]
      const indexBadge = document.createElement('span');
      indexBadge.textContent = `[${index}]`;
      indexBadge.style.fontFamily = 'var(--font-mono)';
      indexBadge.style.fontSize = '10px';
      indexBadge.style.color = 'var(--vscode-symbolIcon-numberForeground, #b5cea8)';
      indexBadge.style.padding = '2px 4px';
      indexBadge.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      indexBadge.style.borderRadius = '2px';
      indexBadge.style.marginTop = '4px';
      indexBadge.style.flexShrink = '0';
      itemRow.appendChild(indexBadge);

      const fieldWrap = document.createElement('div');
      fieldWrap.style.flex = '1';
      fieldWrap.style.minWidth = '0';

      const itemType = inferType(item);
      let getItemValue: () => unknown;

      if (itemType === 'object' || itemType === 'array') {
        const nestedEditor = createComplexFieldEditor(item, readOnly, depth + 1);
        fieldWrap.appendChild(nestedEditor.element);
        getItemValue = nestedEditor.getValue;
      } else {
        const prim = createPrimitiveControl(item, readOnly);
        fieldWrap.appendChild(prim.element);
        getItemValue = prim.getValue;
      }

      itemGetters.push(getItemValue);
      itemRow.appendChild(fieldWrap);

      // Delete item button
      if (!readOnly) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'icon-btn';
        delBtn.textContent = '✕';
        delBtn.title = 'Remove Item';
        delBtn.style.fontSize = '10px';
        delBtn.style.color = 'var(--vscode-descriptionForeground)';
        delBtn.style.padding = '2px 5px';
        delBtn.style.marginTop = '3px';
        delBtn.style.flexShrink = '0';

        delBtn.onclick = () => {
          currentVal = activeGetter() as unknown[];
          if (Array.isArray(currentVal)) {
            currentVal.splice(index, 1);
            renderView();
          }
        };

        itemRow.appendChild(delBtn);
      }

      target.appendChild(itemRow);
    });

    // Add Item button
    if (!readOnly) {
      const addBar = document.createElement('div');
      addBar.style.display = 'flex';
      addBar.style.gap = '6px';
      addBar.style.marginTop = '2px';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+ Add Item';
      addBtn.style.fontSize = '11px';
      addBtn.style.padding = '3px 8px';
      addBtn.style.border = '1px dashed var(--border-color, rgba(255,255,255,0.2))';
      addBtn.style.borderRadius = '3px';
      addBtn.style.background = 'transparent';
      addBtn.style.color = 'var(--vscode-foreground)';
      addBtn.style.cursor = 'pointer';

      addBtn.onclick = () => {
        currentVal = activeGetter() as unknown[];
        if (Array.isArray(currentVal)) {
          currentVal.push('');
          renderView();
        }
      };

      addBar.appendChild(addBtn);
      target.appendChild(addBar);
    }

    activeGetter = () => itemGetters.map((g) => g());
  }

  function renderObjectTree(target: HTMLElement, obj: Record<string, unknown>): void {
    const entries = Object.entries(obj);
    summaryLabel.textContent = `{${entries.length} prop${entries.length === 1 ? '' : 's'}}`;

    const propGetters: { key: string; getVal: () => unknown }[] = [];

    if (entries.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.fontSize = '11px';
      emptyMsg.style.color = 'var(--vscode-descriptionForeground)';
      emptyMsg.style.fontStyle = 'italic';
      emptyMsg.style.padding = '4px 0';
      emptyMsg.textContent = '(empty object)';
      target.appendChild(emptyMsg);
    }

    entries.forEach(([key, val]) => {
      const propRow = document.createElement('div');
      propRow.style.display = 'flex';
      propRow.style.flexDirection = 'column';
      propRow.style.gap = '2px';
      propRow.style.width = '100%';
      propRow.style.boxSizing = 'border-box';

      const propHeader = document.createElement('div');
      propHeader.style.display = 'flex';
      propHeader.style.justifyContent = 'space-between';
      propHeader.style.alignItems = 'center';

      const propLabel = document.createElement('span');
      propLabel.textContent = key;
      propLabel.style.fontWeight = '600';
      propLabel.style.fontSize = '11px';
      propLabel.style.color = 'var(--vscode-symbolIcon-propertyForeground, #9cdcfe)';
      propHeader.appendChild(propLabel);

      const propActions = document.createElement('div');
      propActions.style.display = 'flex';
      propActions.style.alignItems = 'center';
      propActions.style.gap = '4px';

      const typeBadge = document.createElement('span');
      typeBadge.textContent = inferType(val);
      typeBadge.style.fontSize = '9px';
      typeBadge.style.color = 'var(--vscode-descriptionForeground)';
      propActions.appendChild(typeBadge);

      if (!readOnly) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'icon-btn';
        delBtn.textContent = '✕';
        delBtn.title = 'Remove Property';
        delBtn.style.fontSize = '10px';
        delBtn.style.color = 'var(--vscode-descriptionForeground)';
        delBtn.style.padding = '1px 4px';

        delBtn.onclick = () => {
          const currentObj = activeGetter() as Record<string, unknown>;
          if (typeof currentObj === 'object' && currentObj !== null) {
            delete currentObj[key];
            currentVal = currentObj;
            renderView();
          }
        };

        propActions.appendChild(delBtn);
      }

      propHeader.appendChild(propActions);
      propRow.appendChild(propHeader);

      const valType = inferType(val);
      let getVal: () => unknown;

      if (valType === 'object' || valType === 'array') {
        const nested = createComplexFieldEditor(val, readOnly, depth + 1);
        propRow.appendChild(nested.element);
        getVal = nested.getValue;
      } else {
        const prim = createPrimitiveControl(val, readOnly);
        propRow.appendChild(prim.element);
        getVal = prim.getValue;
      }

      propGetters.push({ key, getVal });
      target.appendChild(propRow);
    });

    // Add Property Bar
    if (!readOnly) {
      const addBar = document.createElement('div');
      addBar.style.display = 'flex';
      addBar.style.gap = '4px';
      addBar.style.marginTop = '4px';

      const keyInput = document.createElement('input');
      applyBaseInputStyle(keyInput);
      keyInput.placeholder = 'New prop name';
      keyInput.style.flex = '1';
      keyInput.style.fontSize = '11px';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+ Add';
      addBtn.style.fontSize = '11px';
      addBtn.style.padding = '3px 8px';
      addBtn.style.border = '1px solid var(--border-color, rgba(255,255,255,0.2))';
      addBtn.style.borderRadius = '3px';
      addBtn.style.background = 'transparent';
      addBtn.style.color = 'var(--vscode-foreground)';
      addBtn.style.cursor = 'pointer';

      const handleAdd = () => {
        const k = keyInput.value.trim();
        if (!k) return;
        const currentObj = activeGetter() as Record<string, unknown>;
        if (typeof currentObj === 'object' && currentObj !== null) {
          currentObj[k] = '';
          currentVal = currentObj;
          renderView();
        }
      };

      addBtn.onclick = handleAdd;
      keyInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAdd();
        }
      };

      addBar.appendChild(keyInput);
      addBar.appendChild(addBtn);
      target.appendChild(addBar);
    }

    activeGetter = () => {
      const result: Record<string, unknown> = {};
      for (const p of propGetters) {
        result[p.key] = p.getVal();
      }
      return result;
    };
  }

  jsonToggleBtn.onclick = () => {
    currentVal = activeGetter();
    isRawJson = !isRawJson;
    renderView();
  };

  renderView();

  return {
    element: container,
    getValue: () => activeGetter(),
  };
}

function createPrimitiveControl(
  val: unknown,
  readOnly: boolean
): { element: HTMLElement; getValue: () => unknown } {
  if (typeof val === 'boolean') {
    const select = document.createElement('select');
    applyBaseInputStyle(select);
    select.style.width = '100%';
    select.disabled = readOnly;

    const optTrue = document.createElement('option');
    optTrue.value = 'true';
    optTrue.textContent = 'true';
    if (val === true) optTrue.selected = true;

    const optFalse = document.createElement('option');
    optFalse.value = 'false';
    optFalse.textContent = 'false';
    if (val === false) optFalse.selected = true;

    select.appendChild(optTrue);
    select.appendChild(optFalse);

    return {
      element: select,
      getValue: () => select.value === 'true',
    };
  }

  if (typeof val === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    applyBaseInputStyle(input);
    input.style.width = '100%';
    input.value = String(val);
    input.disabled = readOnly;

    return {
      element: input,
      getValue: () => (input.value === '' ? null : Number(input.value)),
    };
  }

  // String or Null
  const input = document.createElement('input');
  input.type = 'text';
  applyBaseInputStyle(input);
  input.style.width = '100%';
  input.value = val === null || val === undefined ? '' : String(val);
  input.placeholder = val === null ? '(null)' : '';
  input.disabled = readOnly;

  return {
    element: input,
    getValue: () => (val === null && input.value === '' ? null : input.value),
  };
}
