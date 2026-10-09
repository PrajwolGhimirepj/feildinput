// Move the same controls into PiP so text, selection, and listeners survive.
const panel = document.createElement('main');
panel.className = 'panel';
panel.append(...document.body.childNodes);
document.body.append(panel);
const field = panel.querySelector('#field');
const site = panel.querySelector('#site');
const value = panel.querySelector('#value');
const insert = panel.querySelector('#insert');
const status = panel.querySelector('#status');
const floatButton = panel.querySelector('#float');
const hint = panel.querySelector('#window-hint');
const sourceId = new URLSearchParams(location.search).get('tabId');
const persistent = sourceId !== null && /^\d+$/.test(sourceId);
let target = null;
let tabId = persistent ? Number(sourceId) : null;
let busy = false;
let scanning = null;
let generation = 0;
let floatingWindow = null;
const translator = createNepaliTranslation(panel, value, update, () => tabId, () => fill({ requireEmpty: true }));

const owner = document.createElement('section');
owner.className = 'owner';
owner.hidden = true;
const ownerTitle = document.createElement('h1');
ownerTitle.textContent = 'Field Inject is floating';
const ownerHint = document.createElement('p');
ownerHint.textContent = 'Keep this tab open. Drag the floating window by its title bar to move it. Close that window to bring your text back here.';
const showWindow = document.createElement('button');
showWindow.textContent = 'Show floating window';
showWindow.addEventListener('click', () => floatingWindow?.focus());
owner.append(ownerTitle, ownerHint, showWindow);
document.body.append(owner);

function message(text, kind = '') {
  status.textContent = text;
  status.className = kind;
}

function update() {
  panel.querySelector('#count').textContent = `${value.value.length.toLocaleString()} characters`;
  insert.disabled = !target || busy || translator.text.length === 0;
}

function detect() {
  if (!scanning) scanning = scan().finally(() => { scanning = null; });
  return scanning;
}

async function scan() {
  const revision = generation;
  try {
    const tab = persistent ? await chrome.tabs.get(tabId) :
      (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (revision !== generation) return;
    tabId = tab?.id;
    if (!tabId) throw new Error('No active tab');
    site.textContent = tab.url ? new URL(tab.url).hostname || 'Local page' : 'Current page';
    // Also bootstraps tabs that were already open when the extension was installed.
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
    if (revision !== generation) return;
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => globalThis.__fieldInject?.describe() ?? null
    });
    const found = frames.filter(frame => frame.result).sort((a, b) => b.result.selectedAt - a.result.selectedAt)[0];
    if (revision !== generation) return;
    if (!found) {
      target = null;
      panel.querySelector('#dot').classList.remove('ready');
      field.textContent = 'No field selected';
      message('Click an editable field on your website, then paste here.');
      return;
    }
    const changed = target?.documentId !== found.documentId || target?.result.id !== found.result.id;
    target = found;
    field.textContent = found.result.label;
    panel.querySelector('#dot').classList.add('ready');
    if (changed) message('Ready. Paste below to fill the selected field.');
  } catch {
    if (revision !== generation) return;
    target = null;
    panel.querySelector('#dot').classList.remove('ready');
    field.textContent = 'This page is unavailable';
    site.textContent = 'Open a regular website to use Field Inject.';
    message('Chrome blocks extensions on browser pages and the Chrome Web Store. For local files, enable “Allow access to file URLs” in extension settings.', 'error');
  } finally {
    update();
  }
}

async function fill({ requireEmpty = false } = {}) {
  await ready;
  if (busy || translator.text.length === 0) return;
  busy = true;
  update();
  try {
    if (persistent) {
      await scanning;
      await detect();
    }
    if (!target || translator.text.length === 0) return;
    const [result] = await chrome.scripting.executeScript({
      target: { tabId, documentIds: [target.documentId] },
      func: payload => globalThis.__fieldInject?.inject(payload),
      args: [{ id: target.result.id, text: translator.text, mode: panel.querySelector('#mode').value, requireEmpty }]
    });
    if (!result?.result?.ok) throw new Error(result?.result?.error || 'The field is no longer available. Select it again on your website.');
    message('Inserted into the selected field.', 'success');
  } catch (error) {
    message(error.message || 'Could not insert. Select the field again on your website.', 'error');
  } finally {
    busy = false;
    update();
  }
}

const ready = detect();
if (persistent) {
  const poll = setInterval(() => { if (!busy) void detect(); }, 700);
  window.addEventListener('pagehide', () => clearInterval(poll), { once: true });
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (sender.id !== chrome.runtime.id || request.type !== 'field-inject-target') return;
    if (!Number.isInteger(request.tabId)) return;
    // Clicking our own owner tab must not replace the website target.
    chrome.tabs.getCurrent().then(async current => {
      if (request.tabId !== current?.id && !translator.isHelperTab(request.tabId)) {
        generation++;
        tabId = request.tabId;
        history.replaceState(null, '', `?tabId=${tabId}`);
        target = null;
        update();
        await scanning;
        await detect();
      }
      floatingWindow?.focus();
      respond({ floating: Boolean(floatingWindow && !floatingWindow.closed) });
    }).catch(() => respond({ floating: false }));
    return true;
  });
}

floatButton.addEventListener('click', async () => {
  if (!window.documentPictureInPicture) {
    message('Always-on-top windows require a desktop browser with Document Picture-in-Picture support, such as Chrome or Edge.', 'error');
    return;
  }
  floatButton.disabled = true;
  try {
    const pip = await documentPictureInPicture.requestWindow({ width: 400, height: 650, disallowReturnToOpener: true });
    floatingWindow = pip;
    pip.document.title = 'Field Inject';
    // Copy loaded rules: extension resource loading in about:blank PiP can fail.
    const stylesheet = pip.document.createElement('style');
    stylesheet.textContent = Array.from(document.styleSheets, sheet =>
      Array.from(sheet.cssRules, rule => rule.cssText).join('\n')).join('\n');
    pip.document.head.append(stylesheet);
    floatButton.hidden = true;
    hint.textContent = 'Always on top · Drag the title bar to move. Click another field on your website to select it.';
    pip.document.body.append(panel);
    owner.hidden = false;
    pip.addEventListener('pagehide', () => {
      document.body.prepend(panel);
      owner.hidden = true;
      floatButton.hidden = false;
      floatButton.disabled = false;
      hint.textContent = 'Drag the floating window by its title bar. Keep this tab open.';
      floatingWindow = null;
    }, { once: true });
    // Return to the selected website while the PiP window stays above it.
    if (persistent) {
      try {
        const tab = await chrome.tabs.update(tabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch { /* A closed source tab will be reported by field detection. */ }
    }
    pip.focus();
    value.focus();
  } catch (error) {
    floatButton.disabled = false;
    message(`Could not open the floating window. ${error.message}`, 'error');
  }
});

value.addEventListener('input', update);
value.addEventListener('paste', () => {
  // Let the browser finish placing plain clipboard text into the textarea first.
  if (!translator.enabled && panel.querySelector('#auto').checked) setTimeout(() => {
    if (!translator.enabled) void fill();
  }, 0);
});
panel.querySelector('#form').addEventListener('submit', event => { event.preventDefault(); fill(); });
panel.querySelector('#form').addEventListener('keydown', event => {
  if (event.target !== value && event.target !== panel.querySelector('#translation')) return;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); fill(); }
});
