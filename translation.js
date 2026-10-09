// Official Cloud Translation Basic API. No website content is sent automatically.
function createNepaliTranslation(panel, source, onChange) {
  const find = selector => panel.querySelector(selector);
  const enabled = find('#nepali');
  const output = find('#translation');
  const preview = find('#translation-preview');
  const translateButton = find('#translate');
  const cancelButton = find('#cancel-translation');
  const status = find('#translation-status');
  const settings = find('#google-settings');
  const keyInput = find('#google-key');
  const keyStatus = find('#key-status');
  const saveButton = find('#save-key');
  const removeButton = find('#remove-key');
  let apiKey = '';
  let valid = false;
  let pending = null;
  let settingsBusy = true;

  function message(text, error = false) {
    status.textContent = text;
    status.className = error ? 'help error' : 'help';
  }

  function update() {
    translateButton.disabled = settingsBusy || Boolean(pending) || !source.value.trim();
    translateButton.textContent = pending ? 'Translating…' : 'Translate with Google';
    cancelButton.hidden = !pending;
    saveButton.disabled = settingsBusy;
    removeButton.disabled = settingsBusy || !apiKey;
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

  // Keep credentials out of content scripts and browser sync.
  const settingsReady = (async () => {
    try {
      await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      const stored = await chrome.storage.local.get('googleTranslationKey');
      apiKey = typeof stored.googleTranslationKey === 'string' ? stored.googleTranslationKey : '';
      keyStatus.textContent = apiKey ? 'API key saved on this device.' : 'Add your API key to enable Google translation.';
    } catch {
      keyStatus.textContent = 'Could not load settings. Reload the extension and try again.';
    } finally {
      settingsBusy = false;
      update();
    }
  })();

  async function changeKey(remove = false) {
    await settingsReady;
    const next = remove ? '' : keyInput.value.trim();
    if (!remove && !next) {
      keyStatus.textContent = 'Paste your Google Cloud Translation API key first.';
      keyInput.focus();
      return;
    }
    invalidate();
    settingsBusy = true;
    update();
    try {
      await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      if (remove) await chrome.storage.local.remove('googleTranslationKey');
      else await chrome.storage.local.set({ googleTranslationKey: next });
      apiKey = next;
      keyInput.value = '';
      keyStatus.textContent = remove ? 'API key removed.' : 'API key saved on this device.';
    } catch {
      keyStatus.textContent = 'Could not save settings. Please try again.';
    } finally {
      settingsBusy = false;
      update();
    }
  }

  saveButton.addEventListener('click', () => void changeKey());
  removeButton.addEventListener('click', () => void changeKey(true));
  keyInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); saveButton.click(); }
  });
  enabled.addEventListener('change', () => {
    invalidate();
    find('#translation-tools').hidden = !enabled.checked;
    find('#auto').disabled = enabled.checked;
    find('label[for="value"]').textContent = enabled.checked ? 'English text' : 'Text to insert';
    source.placeholder = enabled.checked ? 'Type or paste English text…' : 'Paste your text here…';
    if (enabled.checked && !apiKey) settings.open = true;
    update();
  });
  source.addEventListener('input', () => { invalidate(); update(); });
  output.addEventListener('input', update);
  cancelButton.addEventListener('click', () => {
    invalidate();
    message('Translation canceled. Your English text is unchanged.');
    update();
  });
  window.addEventListener('pagehide', () => pending?.abort(), { once: true });

  translateButton.addEventListener('click', async () => {
    if (!enabled.checked || pending || settingsBusy) return;
    const text = source.value;
    if (!text.trim()) return;
    if (!apiKey) {
      settings.open = true;
      keyInput.focus();
      message('Add and save your Google Cloud Translation API key first.', true);
      return;
    }
    if (Array.from(text).length > 5000) {
      message('Translate up to 5,000 characters at a time. Shorten the English text and try again.', true);
      return;
    }
    invalidate();
    const request = new AbortController();
    pending = request;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; request.abort(); }, 20000);
    message('Translating English to Nepali…');
    update();
    try {
      const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify({ q: text, source: 'en', target: 'ne', format: 'text', model: 'nmt' }),
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        signal: request.signal
      });
      if (!response.ok) {
        const errors = {
          400: 'Google rejected the request. Check your API key and text.',
          401: 'Google could not authenticate your API key. Update it in settings.',
          403: 'Google denied access. Check that Cloud Translation API and billing are enabled, and that your key permits this API.',
          429: 'Google translation quota or rate limit reached. Check your Google Cloud quotas before trying again.'
        };
        throw new Error(errors[response.status] || 'Google translation is unavailable. Please try again later.');
      }
      const data = await response.json();
      const translated = data?.data?.translations?.[0]?.translatedText;
      if (typeof translated !== 'string' || !translated.trim()) throw new Error('Google returned no translation. Please try again.');
      if (pending !== request || !enabled.checked || source.value !== text) return;
      // Decode entities individually; never render the response as HTML.
      const decoder = document.createElement('textarea');
      output.value = translated.replace(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/gi, entity => {
        decoder.innerHTML = entity;
        return decoder.value;
      });
      valid = true;
      preview.hidden = false;
      message('Ready to review. You can edit the Nepali, then click Insert text.');
    } catch (error) {
      if (pending !== request) return;
      message(timedOut ? 'Google took too long to respond. Please try again.' :
        error instanceof TypeError ? 'Could not reach Google. Check your internet connection and try again.' :
          error instanceof SyntaxError ? 'Google returned an unreadable response. Please try again.' : error.message, true);
    } finally {
      clearTimeout(timeout);
      if (pending === request) { pending = null; update(); }
    }
  });

  return {
    get enabled() { return enabled.checked; },
    get text() { return enabled.checked ? (valid && !pending ? output.value : '') : source.value; }
  };
}
