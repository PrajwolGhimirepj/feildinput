const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ context, page, worker, extension, root, pass }) => {
  const endpoint = 'https://translation.googleapis.com/language/translate/v2';
  const requests = [];
  let reply = { status: 200, body: { data: { translations: [{ translatedText: 'नमस्ते &amp; स्वागत छ।' }] } } };
  let hold = null;
  let release;
  await context.route(`${endpoint}*`, async route => {
    requests.push({ url: route.request().url(), headers: route.request().headers(), body: route.request().postDataJSON() });
    const next = reply;
    if (hold) await hold;
    if (next.abort) await route.abort('failed');
    else await route.fulfill({ status: next.status, contentType: 'application/json', body: JSON.stringify(next.body) });
  });
  await page.locator('#notes').click();
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, page.url());
  const ui = await context.newPage();
  await ui.goto(`chrome-extension://${extension.id}/popup.html?tabId=${tabId}`);
  await ui.waitForFunction(() => document.querySelector('#field').textContent === 'Notes');
  await ui.locator('#nepali').check();
  await ui.locator('#value').fill('Hello and welcome.');
  await ui.locator('#translate').click();
  assert.match(await ui.locator('#translation-status').textContent(), /API key/);
  assert.equal(requests.length, 0);
  assert.equal(await ui.locator('#insert').isDisabled(), true);
  pass('Translation requires a key and never inserts untranslated English');

  await ui.locator('#google-key').fill('test-key-not-a-real-credential');
  await ui.locator('#save-key').click();
  await ui.waitForFunction(() => document.querySelector('#key-status').textContent === 'API key saved on this device.');
  assert.equal(await ui.locator('#google-key').inputValue(), '');
  await ui.reload();
  await ui.locator('#nepali').check();
  await ui.waitForFunction(() => document.querySelector('#key-status').textContent === 'API key saved on this device.');
  const storedFromContent = await worker.evaluate(async tabId => {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: async () => {
      try { return await chrome.storage.local.get('googleTranslationKey'); } catch { return null; }
    } });
    return result.result;
  }, tabId);
  assert.ok(!storedFromContent?.googleTranslationKey);
  pass('Key persists locally, is masked, and is inaccessible to content scripts');

  await ui.locator('#value').evaluate(node => {
    node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }));
    node.value = 'Hello and welcome.';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await ui.waitForTimeout(100);
  assert.equal(requests.length, 0);
  assert.equal(await page.locator('#notes').inputValue(), 'Hello world');
  assert.equal(await ui.locator('#auto').isDisabled(), true);
  await ui.locator('#translate').click();
  await ui.locator('#translation-preview').waitFor({ state: 'visible' });
  assert.equal(await ui.locator('#translation').inputValue(), 'नमस्ते & स्वागत छ।');
  assert.equal(await page.locator('#notes').inputValue(), 'Hello world');
  assert.equal(requests[0].url, endpoint);
  assert.equal(requests[0].headers['x-goog-api-key'], 'test-key-not-a-real-credential');
  assert.deepEqual(requests[0].body, { q: 'Hello and welcome.', source: 'en', target: 'ne', format: 'text', model: 'nmt' });
  pass('Only Translate sends English to the official API and creates a decoded preview without insertion');

  await ui.locator('#translation').fill('नमस्कार।');
  await ui.locator('#translation').press('Control+Enter');
  await ui.waitForFunction(() => document.querySelector('#status').className === 'success');
  assert.equal(await page.locator('#notes').inputValue(), 'नमस्कार।');
  pass('Edited Nepali is inserted with the keyboard shortcut');

  await ui.locator('#value').fill('Changed English');
  assert.equal(await ui.locator('#translation-preview').isVisible(), false);
  assert.equal(await ui.locator('#insert').isDisabled(), true);
  hold = new Promise(resolve => { release = resolve; });
  await ui.locator('#translate').click();
  await ui.waitForFunction(() => !document.querySelector('#cancel-translation').hidden);
  await ui.locator('#value').fill('Newest English');
  release(); hold = null;
  await ui.waitForTimeout(100);
  assert.equal(await ui.locator('#translation').inputValue(), '');
  assert.equal(await ui.locator('#insert').isDisabled(), true);
  pass('Editing English invalidates old results and cancels an in-flight translation');

  hold = new Promise(resolve => { release = resolve; });
  await ui.locator('#translate').click();
  await ui.locator('#cancel-translation').click();
  release(); hold = null;
  assert.match(await ui.locator('#translation-status').textContent(), /canceled/);
  assert.equal(await ui.locator('#value').inputValue(), 'Newest English');
  pass('Cancel preserves source text and restores translation controls');

  for (const [status, pattern] of [[403, /billing/], [429, /quota/], [500, /unavailable/]]) {
    reply = { status, body: { error: { message: 'DO NOT DISPLAY RAW SERVER DETAILS' } } };
    await ui.locator('#translate').click();
    await ui.waitForFunction(() => document.querySelector('#translation-status').classList.contains('error'));
    assert.match(await ui.locator('#translation-status').textContent(), pattern);
    assert.equal(await ui.locator('#insert').isDisabled(), true);
    assert.equal(await ui.locator('#value').inputValue(), 'Newest English');
  }
  pass('API authorization, quota, and service errors preserve the source and block insertion');

  reply = { status: 200, body: { data: { translations: [] } } };
  await ui.locator('#translate').click();
  await ui.waitForFunction(() => document.querySelector('#translation-status').textContent.includes('no translation'));
  reply = { abort: true };
  await ui.locator('#translate').click();
  await ui.waitForFunction(() => document.querySelector('#translation-status').textContent.includes('internet connection'));
  pass('Empty responses and network failures display actionable errors');

  const count = requests.length;
  await ui.locator('#value').fill('a'.repeat(5001));
  await ui.locator('#translate').click();
  assert.match(await ui.locator('#translation-status').textContent(), /5,000/);
  assert.equal(requests.length, count);
  pass('Oversized text is rejected without a paid API request');

  await ui.locator('#value').fill('Hello');
  reply = { status: 200, body: { data: { translations: [{ translatedText: 'नमस्ते <img src=x onerror=alert(1)>' }] } } };
  await ui.locator('#translate').click();
  await ui.locator('#translation-preview').waitFor({ state: 'visible' });
  assert.equal(await ui.locator('#translation').inputValue(), 'नमस्ते <img src=x onerror=alert(1)>');
  assert.equal(await ui.locator('#translation-preview img[src="x"]').count(), 0);
  pass('Translated markup stays plain text');

  await ui.locator('#translation').fill('नमस्ते');
  const opened = context.waitForEvent('page');
  await ui.locator('#float').click();
  const floating = await opened;
  await floating.locator('#translation').waitFor();
  assert.equal(await floating.locator('h1').evaluate(node => getComputedStyle(node).fontSize), '20px');
  await floating.waitForFunction(() => document.querySelector('.attribution img').naturalWidth > 0);
  assert.equal(await floating.locator('#translation').inputValue(), 'नमस्ते');
  await floating.locator('#value').fill('Good morning');
  reply = { status: 200, body: { data: { translations: [{ translatedText: 'शुभ प्रभात।' }] } } };
  await floating.locator('#translate').click();
  await floating.waitForFunction(() => document.querySelector('#translation').value === 'शुभ प्रभात।');
  await floating.locator('#insert').click();
  await floating.waitForFunction(() => document.querySelector('#status').className === 'success');
  assert.equal(await page.locator('#notes').inputValue(), 'शुभ प्रभात।');
  await floating.setViewportSize({ width: 400, height: 850 });
  await floating.screenshot({ path: path.join(root, 'test-results', 'nepali-translation.png'), fullPage: true });
  await floating.close();
  assert.equal(await ui.locator('#translation').inputValue(), 'शुभ प्रभात।');
  pass('Translation works in the floating window and survives returning to the owner tab');

  await ui.locator('#google-settings').evaluate(node => { node.open = true; });
  await ui.locator('#remove-key').click();
  await ui.waitForFunction(() => document.querySelector('#key-status').textContent === 'API key removed.');
  assert.equal(await ui.evaluate(async () => (await chrome.storage.local.get('googleTranslationKey')).googleTranslationKey), undefined);
  assert.equal(await ui.locator('#insert').isDisabled(), true);
  await ui.locator('#nepali').uncheck();
  assert.equal(await ui.locator('#auto').isEnabled(), true);
  await ui.locator('#insert').click();
  await ui.waitForFunction(() => document.querySelector('#status').className === 'success');
  assert.equal(await page.locator('#notes').inputValue(), 'Good morning');
  pass('Removing the key clears storage and switching translation off restores normal insertion');
  await ui.close();
  await context.unroute(`${endpoint}*`);
};
