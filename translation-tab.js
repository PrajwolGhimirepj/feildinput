// Use only the public Google Translate page, through a tab created by this extension.
class GoogleTranslateTab {
  constructor() {
    this.tabId = null;
    this.navigation = Promise.resolve();
    this.returnTabId = null;
    this.focusGeneration = 0;
    this.focusGeneration = 0;
    this.ready = chrome.storage.session.get('googleTranslateTabId').then(stored => {
      if (Number.isInteger(stored.googleTranslateTabId)) this.tabId = stored.googleTranslateTabId;
    });
  }

  async show() {
    await this.ready;
    if (this.tabId === null) throw new Error('Start a translation to open its Google Translate tab.');
    try {
      const tab = await chrome.tabs.update(this.tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch {
      throw new Error('The Google Translate tab was closed. Click Translate to open another.');
    }
  }

  async translate(text, signal, onOpened, returnTabId) {
    const checkCanceled = () => signal.throwIfAborted();
    if (!Number.isInteger(returnTabId)) {
      throw new Error('Select a field on the website before translating.');
    }
    const focusGeneration = ++this.focusGeneration;
    this.returnTabId = returnTabId;
    // Serialize navigation even when a canceled request is still opening a tab.
    const navigation = this.navigation.catch(() => {}).then(async () => {
      await this.ready;
      checkCanceled();
      let existing = null;
      if (this.tabId !== null) {
        try { existing = await chrome.tabs.get(this.tabId); } catch { /* User closed it. */ }
      }
      checkCanceled();
      const currentUrl = existing?.pendingUrl || existing?.url || '';
      // Never reuse an unrelated tab, including an owned tab navigated away from.
      const reusable = currentUrl.startsWith('https://translate.google.com/');
      const url = new URL('https://translate.google.com/');
      url.search = new URLSearchParams({ sl: 'en', tl: 'ne', hl: 'en', op: 'translate', text }).toString();
      const tab = reusable ? await chrome.tabs.update(existing.id, { url: url.href }) :
        await chrome.tabs.create({ url: url.href, active: false });
      this.tabId = tab.id;
      await chrome.storage.session.set({ googleTranslateTabId: tab.id });
      checkCanceled();
      onOpened();
      return tab.id;
    });
    this.navigation = navigation;
    let tabId;
    try {
      try { tabId = await navigation; } catch {
        checkCanceled();
        throw new Error('Could not open the Google Translate tab. Please try again.');
      }
      const tab = await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });

      let lastResult = '';
      let stableSince = 0;
      const deadline = Date.now() + 35000;
      while (Date.now() < deadline) {
        checkCanceled();
        let currentTab;
        try { currentTab = await chrome.tabs.get(tabId); } catch {
          throw new Error('The Google Translate tab was closed. Click Translate to open another.');
        }
        const address = currentTab.pendingUrl || currentTab.url || '';
        if (address && !address.startsWith('https://translate.google.com/')) {
          throw new Error('The translation tab needs attention or was navigated away. Open it to check, then try again.');
        }
        if (currentTab.status === 'complete' && !currentTab.pendingUrl) {
          let result;
          try {
            const [frame] = await chrome.scripting.executeScript({
              target: { tabId }, func: readGoogleTranslation, args: [text]
            });
            result = frame?.result;
          } catch { /* A navigation may be between documents; retry until the deadline. */ }
          checkCanceled();
          if (result?.error) throw new Error(result.error);
          if (result?.text) {
            if (result.text !== lastResult) {
              lastResult = result.text;
              stableSince = Date.now();
            } else if (Date.now() - stableSince >= 1200) {
              return result.text;
            }
          } else {
            lastResult = '';
            stableSince = 0;
          }
        }
        await new Promise((resolve, reject) => {
          const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, 400);
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
        });
      }
      throw new Error('Google Translate did not return a readable result. Open its tab to finish any prompts or check the page, then try again.');
    } finally {
      if (focusGeneration === this.focusGeneration) await this.returnToSelectedFieldTab(tabId ?? this.tabId);
    }
  }

  async returnToSelectedFieldTab(translateTabId) {
    const returnTabId = this.returnTabId;
    this.returnTabId = null;
    if (!Number.isInteger(returnTabId)) return;
    try {
      if (returnTabId === translateTabId) return;
      const tab = await chrome.tabs.update(returnTabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (error) {
      console.warn('Could not return to the website tab selected for this field:', error);
    }
  }
}

// Serialized into Chrome's isolated content-script world.
function readGoogleTranslation(expectedText) {
  const url = new URL(location.href);
  if (url.origin !== 'https://translate.google.com' || url.searchParams.get('sl') !== 'en' ||
      url.searchParams.get('tl') !== 'ne' || url.searchParams.get('text') !== expectedText) {
    return { error: 'The Google Translate page changed. Click Translate again to use the current English text.' };
  }
  const normalize = text => text.replace(/\r\n?/g, '\n').trim();
  const source = document.querySelector('textarea[aria-label="Source text"], textarea[jsname="BJE2fc"]');
  if (!source) return null;
  if (normalize(source.value) !== normalize(expectedText)) {
    return { error: 'The text in the Google Translate tab changed. Click Translate again to use your extension text.' };
  }
  const result = document.querySelector('[jsname="jqKxS"][lang="ne"], .HwtZe[lang="ne"]');
  if (!result || result.getClientRects().length === 0) return null;
  // Exclude hidden alternatives, transliteration, and dictionary entries.
  const segments = Array.from(result.querySelectorAll('[jsname="W297wb"], .ryNqvb'))
    .filter(node => node.getClientRects().length > 0);
  const text = segments.map(node => node.textContent).join('');
  return text.trim() ? { text } : null;
}
