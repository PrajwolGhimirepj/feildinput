const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ context, page, worker, extension, root, pass }) => {
  const visits = [];
  let delay = 50;
  let resultText = 'नमस्ते & स्वागत छ।\nकस्तो छ ?';
  const googlePattern = 'https://translate.google.com/**';
  await context.route(googlePattern, async route => {
    const url = new URL(route.request().url());
    visits.push(url);
    const payload = JSON.stringify({ source: url.searchParams.get('text') || '', result: resultText, delay }).replace(/</g, '\\u003c');
    await route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Google Translate fixture</title>
      <textarea aria-label="Source text" jsname="BJE2fc"></textarea>
      <span class="HwtZe" jsname="jqKxS" lang="ne"></span>
      <script>
        const data = ${payload};
        document.querySelector('textarea').value = data.source;
        setTimeout(() => {
          const root = document.querySelector('.HwtZe');
          for (const [index, line] of data.result.split('\\n').entries()) {
            const segment = document.createElement('span');
            segment.className = 'ryNqvb'; segment.setAttribute('jsname', 'W297wb');
            segment.textContent = (index ? '\\n' : '') + line; root.append(segment);
          }
          const alternative = document.createElement('div');
          alternative.textContent = 'Do not include dictionary alternatives'; root.append(alternative);
          const hidden = document.createElement('span');
          hidden.className = 'ryNqvb'; hidden.hidden = true; hidden.textContent = 'Hidden translation'; root.append(hidden);
        }, data.delay);
      </script>` });
  });
  await page.locator('#notes').click();
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({ url }))[0].id, page.url());
  // An existing user-owned Translate tab must not be overwritten.
  const personalTab = await context.newPage();
  await personalTab.goto('https://translate.google.com/?sl=en&tl=ne&text=Personal');
  const initialVisits = visits.length;
  const ui = await context.newPage();
  await ui.goto(`chrome-extension://${extension.id}/popup.html?tabId=${tabId}`);
  await ui.waitForFunction(() => document.querySelector('#field').textContent === 'Notes');
  await ui.locator('#nepali').check();
  await ui.locator('#value').evaluate(node => {
    node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }));
    node.value = 'Hello & welcome.\nHow are you?';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await ui.waitForTimeout(100);
  assert.equal(visits.length, initialVisits);
  assert.equal(await ui.locator('#insert').isDisabled(), true);
  assert.equal(await ui.locator('#google-key').count(), 0);
  assert.equal(await page.locator('#notes').inputValue(), 'Hello world');
  pass('Translation needs no API settings and paste neither translates nor inserts English');

  const opened = context.waitForEvent('page');
  await ui.locator('#translate').click();
  let helper = await opened;
  await ui.waitForFunction(() => !document.querySelector('#translation-preview').hidden ||
    document.querySelector('#translation-status').classList.contains('error'), null, { timeout: 40000 });
  assert.equal(await ui.locator('#translation-preview').isVisible(), true, await ui.locator('#translation-status').textContent());
  assert.equal(await ui.locator('#translation').inputValue(), resultText);
  assert.equal(await ui.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url), page.url());
  const address = new URL(helper.url());
  assert.equal(address.searchParams.get('sl'), 'en');
  assert.equal(address.searchParams.get('tl'), 'ne');
  assert.equal(address.searchParams.get('text'), 'Hello & welcome.\nHow are you?');
  assert.equal(new URL(personalTab.url()).searchParams.get('text'), 'Personal');
  assert.equal(await page.locator('#notes').inputValue(), 'Hello world');
  pass('Dedicated tab returns multiline Nepali only, without changing user-owned tabs or destination fields');

  await ui.locator('#translation').fill('नमस्कार।');
  await ui.locator('#translation').press('Control+Enter');
  await ui.waitForFunction(() => document.querySelector('#status').className === 'success');
  assert.equal(await page.locator('#notes').inputValue(), 'नमस्कार।');
  pass('Edited Nepali inserts into the original destination with the keyboard shortcut');

  await ui.locator('#auto-translate').check();
  await ui.locator('#value').fill('Do not overwrite existing content');
  resultText = 'अवस्थित पाठ जोगाउनुहोस्';
  await ui.locator('#translate').click();
  await ui.waitForFunction(() => document.querySelector('#status').textContent.includes('Select an empty field'));
  assert.equal(await page.locator('#notes').inputValue(), 'नमस्कार।');
  await page.locator('#notes').fill('');
  await ui.locator('#value').fill('Automatically insert this');
  resultText = 'स्वतः राखियो';
  await ui.locator('#translate').click();
  await ui.waitForFunction(() => document.querySelector('#status').className === 'success');
  assert.equal(await page.locator('#notes').inputValue(), resultText);
  pass('Optional automatic translation insert rejects populated fields and fills empty fields');

  const pageCount = context.pages().length;
  await ui.locator('#value').fill('Second request');
  assert.equal(await ui.locator('#insert').isDisabled(), true);
  resultText = 'दोस्रो अनुरोध';
  await ui.locator('#translate').click();
  await ui.waitForFunction(text => document.querySelector('#translation').value === text, resultText);
  assert.equal(context.pages().length, pageCount);
  await ui.reload();
  await ui.locator('#nepali').check();
  await ui.locator('#value').fill('After reload');
  await ui.locator('#translate').click();
  await ui.locator('#translation-preview').waitFor({ state: 'visible' });
  assert.equal(context.pages().length, pageCount);
  pass('The extension reuses its own Translate tab across requests and owner reloads');

  delay = 10000;
  await ui.locator('#value').fill('Slow request');
  await ui.locator('#translate').click();
  await helper.waitForURL(url => url.searchParams.get('text') === 'Slow request');
  assert.equal(await ui.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url), helper.url());
  await ui.locator('#value').fill('New request');
  delay = 50; resultText = 'नयाँ अनुरोध';
  await ui.locator('#translate').click();
  await ui.waitForFunction(text => document.querySelector('#translation').value === text, resultText);
  assert.equal(await ui.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url), page.url());
  assert.equal(context.pages().length, pageCount);
  pass('Source edits cancel old requests and prevent stale results from replacing newer translations');

  delay = 10000;
  await ui.locator('#value').fill('Cancel this');
  await ui.locator('#translate').click();
  await helper.waitForURL(url => url.searchParams.get('text') === 'Cancel this');
  await ui.locator('#cancel-translation').click();
  assert.match(await ui.locator('#translation-status').textContent(), /canceled/);
  assert.equal(await ui.locator('#insert').isDisabled(), true);
  await ui.locator('#translate').click();
  await ui.locator('#open-translation-tab').click();
  assert.equal(await ui.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url), helper.url());
  await helper.close();
  await ui.waitForFunction(() => document.querySelector('#translation-status').textContent.includes('was closed'));
  assert.equal(await ui.locator('#insert').isDisabled(), true);
  pass('Cancel, opening the helper tab, and closing it during translation fail safely');

  delay = 50; resultText = 'फेरि नमस्ते';
  const replacement = context.waitForEvent('page');
  await ui.locator('#translate').click();
  helper = await replacement;
  await ui.locator('#translation-preview').waitFor({ state: 'visible' });
  pass('A closed Translate tab is recreated on the next request');

  delay = 10000;
  await ui.locator('#value').fill('Do not change source');
  await ui.locator('#translate').click();
  await helper.waitForURL(url => url.searchParams.get('text') === 'Do not change source');
  await helper.locator('textarea').fill('User changed this');
  await ui.waitForFunction(() => document.querySelector('#translation-status').textContent.includes('tab changed'));
  assert.equal(await ui.locator('#translation-preview').isVisible(), false);
  pass('Manual edits in the Translate tab cannot return a mismatched result');

  await helper.goto(page.url() + '?repurposed');
  delay = 50; resultText = 'शुभ प्रभात।';
  const another = context.waitForEvent('page');
  await ui.locator('#value').fill('Good morning');
  await ui.locator('#translate').click();
  const repurposed = helper;
  helper = await another;
  await ui.locator('#translation-preview').waitFor({ state: 'visible' });
  assert.ok(repurposed.url().endsWith('?repurposed'));
  pass('A helper tab navigated elsewhere is left untouched');

  const beforeLimit = visits.length;
  await ui.locator('#value').fill('a'.repeat(5001));
  await ui.locator('#translate').click();
  assert.match(await ui.locator('#translation-status').textContent(), /5,000/);
  assert.equal(visits.length, beforeLimit);
  pass('Oversized text is rejected before any Google navigation');

  await ui.locator('#value').fill('Good morning');
  await ui.locator('#translate').click();
  await ui.locator('#translation-preview').waitFor({ state: 'visible' });
  const pipOpened = context.waitForEvent('page');
  await ui.locator('#float').click();
  const floating = await pipOpened;
  await floating.locator('#translation').waitFor();
  assert.equal(await floating.locator('#translation').inputValue(), resultText);
  await floating.locator('#value').fill('From the floating window');
  resultText = 'नमस्ते <b>साथी</b>';
  await floating.locator('#translate').click();
  await floating.waitForFunction(text => document.querySelector('#translation').value === text, resultText);
  assert.equal(await ui.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url), page.url());
  await floating.locator('#insert').click();
  await floating.waitForFunction(() => document.querySelector('#status').className === 'success');
  assert.equal(await page.locator('#notes').inputValue(), resultText);
  assert.equal(await floating.locator('#translation-preview b').count(), 0);
  await floating.setViewportSize({ width: 400, height: 850 });
  await floating.screenshot({ path: path.join(root, 'test-results', 'nepali-translation.png'), fullPage: true });
  await floating.close();
  assert.equal(await ui.locator('#translation').inputValue(), resultText);
  pass('Tab-based translation works inside PiP, preserves its preview, and treats results as plain text');

  await ui.locator('#nepali').uncheck();
  assert.equal(await ui.locator('#auto').isEnabled(), true);
  await ui.locator('#insert').click();
  await ui.waitForFunction(() => document.querySelector('#status').className === 'success');
  assert.equal(await page.locator('#notes').inputValue(), 'From the floating window');
  pass('Switching translation off restores normal insertion');
  await ui.close();
  await helper.close();
  await repurposed.close();
  await personalTab.close();
  await context.unroute(googlePattern);
};
