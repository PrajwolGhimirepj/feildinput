(() => {
  // This lives in Chrome's isolated extension world, not the site's JavaScript.
  if (globalThis.__fieldInject) return;
  const textTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);
  const ids = new WeakMap();
  let selected = null;
  let selectedAt = 0;
  let savedSelection = null;

  function editable(node) {
    if (!(node instanceof Element)) return null;
    if (node instanceof HTMLInputElement) return textTypes.has(node.type) ? node : null;
    if (node instanceof HTMLTextAreaElement) return node;
    if (!node.isContentEditable) return null;
    while (node.parentElement?.isContentEditable) node = node.parentElement;
    return node;
  }

  function available(node) {
    return node?.isConnected && !node.disabled && !node.readOnly &&
      !node.closest('[inert]') && editable(node) === node && node.getClientRects().length > 0;
  }

  function deepActive() {
    let node = document.activeElement;
    while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
    return node;
  }

  function rememberSelection() {
    if (!selected || editable(deepActive()) !== selected) return;
    if (selected instanceof HTMLInputElement || selected instanceof HTMLTextAreaElement) {
      savedSelection = { start: selected.selectionStart, end: selected.selectionEnd };
    } else {
      const selection = window.getSelection();
      if (selection?.rangeCount && selected.contains(selection.anchorNode) && selected.contains(selection.focusNode)) {
        savedSelection = selection.getRangeAt(0).cloneRange();
      }
    }
  }

  function remember(node) {
    node = editable(node);
    if (!available(node)) return;
    if (selected !== node) savedSelection = null;
    selected = node;
    if (!ids.has(node)) ids.set(node, crypto.randomUUID());
    selectedAt = performance.timeOrigin + performance.now();
    rememberSelection();
  }

  document.addEventListener('focusin', event => remember(event.composedPath()[0]), true);
  document.addEventListener('pointerup', event => remember(event.composedPath()[0]), true);
  document.addEventListener('keyup', rememberSelection, true);
  document.addEventListener('selectionchange', rememberSelection, true);

  function describe() {
    if (!available(selected)) return null;
    const label = selected.labels?.[0]?.textContent || selected.getAttribute('aria-label') ||
      selected.getAttribute('placeholder') || selected.getAttribute('name') || selected.id ||
      (selected.isContentEditable ? 'Editable text' : 'Text field');
    return { id: ids.get(selected), label: label.trim().slice(0, 100),
      type: selected.type || 'editable text', selectedAt };
  }

  function inject({ id, text, mode }) {
    if (!available(selected) || ids.get(selected) !== id) {
      return { ok: false, error: 'That field changed or disappeared. Select it again on your website.' };
    }
    const node = selected;
    const range = savedSelection;
    node.focus({ preventScroll: true });
    const before = new InputEvent('beforeinput', {
      bubbles: true, composed: true, cancelable: true, inputType: 'insertText', data: text
    });
    if (!node.dispatchEvent(before)) return { ok: false, error: 'This website blocked the edit.' };

    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      const hasRange = mode === 'cursor' && Number.isInteger(range?.start) && Number.isInteger(range?.end);
      const start = hasRange ? range.start : 0;
      const end = hasRange ? range.end : node.value.length;
      const value = node.value.slice(0, start) + text + node.value.slice(end);
      if (node.type === 'number' && value !== '') {
        // Validate with Chrome's own number syntax before touching the real field.
        const probe = document.createElement('input');
        probe.type = 'number';
        probe.value = value;
        if (probe.value === '') return { ok: false, error: 'This field only accepts a number.' };
      }
      // Use the browser setter so React and similar frameworks observe the edit.
      const prototype = node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
      if (value !== '' && node.value === '') {
        return { ok: false, error: 'The browser rejected this value for that field type.' };
      }
      try { node.setSelectionRange(start + text.length, start + text.length); } catch { /* Non-text input type. */ }
      node.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    } else {
      const selection = window.getSelection();
      const insertionRange = document.createRange();
      if (mode === 'cursor' && range instanceof Range && node.contains(range.startContainer) && node.contains(range.endContainer)) {
        insertionRange.setStart(range.startContainer, range.startOffset);
        insertionRange.setEnd(range.endContainer, range.endOffset);
      } else {
        insertionRange.selectNodeContents(node);
      }
      selection.removeAllRanges();
      selection.addRange(insertionRange);
      // Native editing preserves undo and works with many rich-text editors.
      if (!document.execCommand('insertText', false, text)) {
        insertionRange.deleteContents();
        const textNode = document.createTextNode(text);
        insertionRange.insertNode(textNode);
        insertionRange.setStartAfter(textNode);
        insertionRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(insertionRange);
        node.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
      }
    }
    node.dispatchEvent(new Event('change', { bubbles: true }));
    rememberSelection();
    return { ok: true };
  }

  globalThis.__fieldInject = { describe, inject };
  remember(deepActive());
})();
