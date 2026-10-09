// Keep an extension tab alive as the owner of the always-on-top window.
// A toolbar popup cannot own it: Chrome destroys that popup on blur.
let opening = Promise.resolve();
chrome.action.onClicked.addListener(tab => {
  opening = opening.catch(() => {}).then(() => openForTab(tab))
    .catch(error => console.error('Could not open Field Inject:', error));
});

async function openForTab(tab) {
  if (!Number.isInteger(tab.id)) return;
  const url = chrome.runtime.getURL('popup.html');
  const hosts = await chrome.tabs.query({ url: `${url}*` });
  const host = hosts.find(item => new URL(item.url).searchParams.has('tabId'));
  if (host) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'field-inject-target', tabId: tab.id });
      if (!response?.floating) {
        await chrome.tabs.update(host.id, { active: true });
        await chrome.windows.update(host.windowId, { focused: true });
      }
      return;
    } catch {
      // Reuse a loading owner instead of creating duplicate windows.
      try {
        await chrome.tabs.update(host.id, { active: true });
        await chrome.windows.update(host.windowId, { focused: true });
        return;
      } catch { /* The owner tab closed; create its replacement below. */ }
    }
  }
  await chrome.tabs.create({ url: `${url}?tabId=${tab.id}`, windowId: tab.windowId });
}
