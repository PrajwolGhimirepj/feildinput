// Optional online smoke test: sends only these synthetic examples to Google Translate.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => res.end('<!doctype html><label>Destination<textarea>Unchanged</textarea></label>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let context;
  try {
    context = await chromium.launchPersistentContext('', {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
    });
    const manager = await context.newPage();
    await manager.goto('chrome://extensions');
    const extension = await manager.evaluate(async () =>
      (await chrome.developerPrivate.getExtensionsInfo({})).find(item => item.name === 'Field Inject'));
    assert.ok(extension);
    const destination = await context.newPage();
    const address = `http://127.0.0.1:${server.address().port}/`;
    await destination.goto(address);
    await destination.locator('textarea').click();
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const tabId = await worker.evaluate(async address => (await chrome.tabs.query({ url: address }))[0].id, address);
    const owner = await context.newPage();
    await owner.goto(`chrome-extension://${extension.id}/popup.html?tabId=${tabId}`);
    await owner.locator('#nepali').check();
    await owner.locator('#value').fill('Good morning');
    await owner.locator('#translate').click();
    await owner.waitForFunction(() => !document.querySelector('#translation-preview').hidden ||
      document.querySelector('#translation-status').classList.contains('error'), null, { timeout: 50000 });
    assert.equal(await owner.locator('#translation-preview').isVisible(), true, await owner.locator('#translation-status').textContent());
    const first = await owner.locator('#translation').inputValue();
    assert.match(first, /[\u0900-\u097F]/);
    assert.equal(await destination.locator('textarea').inputValue(), 'Unchanged');
    await owner.locator('#insert').click();
    await owner.waitForFunction(() => document.querySelector('#status').className === 'success');
    assert.equal(await destination.locator('textarea').inputValue(), first);
    console.log(`PASS live tab translation and insertion: Good morning → ${first}`);

    const pipOpened = context.waitForEvent('page');
    await owner.locator('#float').click();
    const floating = await pipOpened;
    const pages = context.pages().length;
    await floating.locator('#value').fill('Good morning.\nHow are you?');
    await floating.locator('#translate').click();
    await floating.waitForFunction(() => !document.querySelector('#translation-preview').hidden ||
      document.querySelector('#translation-status').classList.contains('error'), null, { timeout: 50000 });
    assert.equal(await floating.locator('#translation-preview').isVisible(), true, await floating.locator('#translation-status').textContent());
    const second = await floating.locator('#translation').inputValue();
    assert.match(second, /[\u0900-\u097F]/);
    assert.ok(second.includes('\n'));
    assert.equal(context.pages().length, pages);
    await floating.locator('#insert').click();
    await floating.waitForFunction(() => document.querySelector('#status').className === 'success');
    assert.equal(await destination.locator('textarea').inputValue(), second);
    await floating.setViewportSize({ width: 400, height: 850 });
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
    await floating.screenshot({ path: path.join(root, 'test-results', 'live-nepali-translation.png'), fullPage: true });
    console.log(`PASS live multiline translation from floating window, reusing Google tab: ${JSON.stringify(second)}`);
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
