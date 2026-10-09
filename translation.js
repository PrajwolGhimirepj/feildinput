function createNepaliTranslation(panel, source, onChange, getReturnTabId, autoInsert) {
  const find = selector => panel.querySelector(selector);
  const enabled = find('#nepali');
  const output = find('#translation');
  const preview = find('#translation-preview');
  const translateButton = find('#translate');
  const cancelButton = find('#cancel-translation');
  const openButton = find('#open-translation-tab');
  const autoInsertCheckbox = find('#auto-translate');
  const status = find('#translation-status');
  const helper = new GoogleTranslateTab();
  let valid = false;
  let pending = null;

  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? 'help error' : 'help';
  }

  function update() {
    translateButton.disabled = Boolean(pending) || !source.value.trim();
    translateButton.textContent = pending ? 'Translating…' : 'Translate to Nepali';
    cancelButton.hidden = !pending;
    openButton.hidden = helper.tabId === null;
    onChange();
  }

  function invalidate() {
    pending?.abort();
    pending = null;
    valid = false;
    output.value = '';
    preview.hidden = true;
    message('');
  }

  helper.ready.then(update).catch(() => message('Could not restore the translation tab. Reload the extension.', true));
  enabled.addEventListener('change', () => {
    invalidate();
    find('#translation-tools').hidden = !enabled.checked;
    find('#auto').disabled = enabled.checked;
    find('label[for="value"]').textContent = enabled.checked ? 'English text' : 'Text to insert';
    source.placeholder = enabled.checked ? 'Type or paste English text…' : 'Paste your text here…';
    update();
  });
  source.addEventListener('input', () => { invalidate(); update(); });
  output.addEventListener('input', update);
  cancelButton.addEventListener('click', () => {
    invalidate();
    message('Translation canceled. Your English text is unchanged.');
    update();
  });
  openButton.addEventListener('click', () => {
    helper.show().catch(error => message(error.message, true));
  });
  window.addEventListener('pagehide', () => pending?.abort(), { once: true });

  translateButton.addEventListener('click', async () => {
    if (!enabled.checked || pending) return;
    const text = source.value;
    if (!text.trim()) return;
    if (Array.from(text).length > 5000) {
      message('Translate up to 5,000 characters at a time. Shorten the English text and try again.', true);
      return;
    }
    invalidate();
    const request = new AbortController();
    pending = request;
    let shouldAutoInsert = false;
    message('Waiting for the Google Translate tab…');
    update();
    try {
      const translated = await helper.translate(text, request.signal, update, getReturnTabId());
      if (pending !== request || !enabled.checked || source.value !== text) return;
      output.value = translated;
      valid = true;
      preview.hidden = false;
      shouldAutoInsert = autoInsertCheckbox.checked;
      message(shouldAutoInsert ? 'Translation ready. Checking that the selected field is empty…' :
        'Ready to review. Edit the Nepali if needed, then click Insert text.');
    } catch (error) {
      if (pending === request) message(error.message || 'Could not read the Google Translate tab. Please try again.', true);
    } finally {
      if (pending === request) {
        pending = null;
        update();
        if (shouldAutoInsert) await autoInsert();
      }
    }
  });

  return {
    get enabled() { return enabled.checked; },
    get text() { return enabled.checked ? (valid && !pending ? output.value : '') : source.value; },
    isHelperTab(tabId) { return tabId === helper.tabId; }
  };
}
