const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'field-inject-test-'));
  const fixture = `<!doctype html><title>Field Inject test</title>
    <label>Full name<input id="name" value="Old value"></label>
    <textarea id="notes" placeholder="Notes">Hello world</textarea>
    <input id="numeric" type="number" value="12">
    <input id="locked" readonly value="Locked">
    <div id="editor" contenteditable="true">Rich <b>text</b></div>
    <div id="shadow"></div>
    <iframe src="http://127.0.0.1:PORT/frame"></iframe>
    <script>
      document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<input placeholder="Shadow field">';
      window.edits=[];
      document.addEventListener('input',e=>edits.push(e.target.id));
      document.addEventListener('change',e=>edits.push('change:'+e.target.id));
      const controlled=document.querySelector('#name');
      Object.defineProperty(controlled,'value',{get(){return HTMLInputElement.prototype.__lookupGetter__('value').call(this)},set(){throw Error('Must use native setter')}});
    </script>`;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(req.url === '/frame' ? '<input placeholder="Frame field">' : fixture.replace('PORT', server.address().port));
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  let context;
  let passed = 0;
  const pass = name => { passed++; console.log(`PASS ${name}`); };
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
    });
    const manager = await context.newPage();
    await manager.goto('chrome://extensions');
    const extensions = await manager.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, resolve)));
    const extension = extensions.find(item => item.name === 'Field Inject');
    assert.ok(extension, 'Extension must load');
    assert.equal(extension.manifestErrors?.length || 0, 0);
    pass('Manifest loads in Chromium');
    const page = await context.newPage();
    const address = `http://localhost:${server.address().port}/`;
    await page.goto(address);
    const popup = await context.newPage();
    // A tab stands in for the toolbar popup. Pin its active-tab query to the fixture.
    await popup.addInitScript(() => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = () => query({ url: 'http://localhost/*' });
    });
    const open = async () => {
      await popup.goto(`chrome-extension://${extension.id}/popup.html`);
      await popup.waitForFunction(() => document.querySelector('#field').textContent !== 'Finding your field…');
    };
    const fill = async (text, mode = 'replace') => {
      await popup.locator('#auto').uncheck();
      await popup.locator('#mode').selectOption(mode);
      await popup.locator('#value').fill(text);
      await popup.locator('#insert').click();
      await popup.waitForFunction(() => document.querySelector('#status').className.length > 0);
      assert.equal(await popup.locator('#status').getAttribute('class'), 'success', await popup.locator('#status').textContent());
    };
    await open();
    assert.equal(await popup.locator('#field').textContent(), 'No field selected');
    pass('Empty selection gives useful guidance');
    await page.locator('#name').click();
    await open();
    assert.equal(await popup.locator('#field').textContent(), 'Full name');
    await fill('Ada Lovelace');
    assert.equal(await page.locator('#name').inputValue(), 'Ada Lovelace');
    assert.deepEqual(await page.evaluate(() => edits.slice(-2)), ['name', 'change:name']);
    pass('Text input, native setter, and input/change events');
    await page.locator('#notes').focus();
    await page.locator('#notes').evaluate(node => node.setSelectionRange(6, 11));
    await page.waitForTimeout(50);
    await open();
    await fill('friend', 'cursor');
    assert.equal(await page.locator('#notes').inputValue(), 'Hello friend');
    pass('Remembered selection replaced at cursor');
    await page.locator('#notes').focus();
    await open();
    await popup.locator('#value').evaluate(node => {
      node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }));
      node.value = 'Pasted automatically\nSecond line';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await popup.waitForFunction(() => document.querySelector('#status').className === 'success');
    assert.equal(await page.locator('#notes').inputValue(), 'Pasted automatically\nSecond line');
    pass('Paste automatically injects multiline text');
    await page.locator('#editor').click();
    await open();
    await fill('<b>Plain text</b>');
    assert.equal(await page.locator('#editor').innerText(), '<b>Plain text</b>');
    assert.equal(await page.locator('#editor b').count(), 0);
    pass('Contenteditable inserts plain text, not HTML');
    await page.getByPlaceholder('Shadow field').click();
    await open();
    await fill('Inside a shadow root');
    assert.equal(await page.getByPlaceholder('Shadow field').inputValue(), 'Inside a shadow root');
    pass('Open shadow-root field tracking');
    await page.frameLocator('iframe').getByPlaceholder('Frame field').click();
    await open();
    assert.equal(await popup.locator('#field').textContent(), 'Frame field');
    await fill('Inside the frame');
    assert.equal(await page.frameLocator('iframe').getByPlaceholder('Frame field').inputValue(), 'Inside the frame');
    pass('Cross-origin frame routing selects the most recent field');
    await page.locator('#numeric').click();
    await open();
    await fill('42.5');
    assert.equal(await page.locator('#numeric').inputValue(), '42.5');
    await popup.locator('#value').fill('not a number');
    await popup.locator('#insert').click();
    await popup.waitForFunction(() => document.querySelector('#status').className === 'error');
    assert.equal(await page.locator('#numeric').inputValue(), '42.5');
    pass('Invalid number leaves existing value intact');
    await popup.locator('#value').fill('0x10');
    await popup.locator('#insert').click();
    await popup.waitForFunction(() => !document.querySelector('#insert').disabled);
    assert.equal(await page.locator('#numeric').inputValue(), '42.5');
    pass('Browser-invalid numeric syntax preserves existing value');
    await page.locator('#name').click();
    await page.locator('#name').evaluate(node => node.addEventListener('beforeinput', event => event.preventDefault(), { once: true }));
    await open();
    await popup.locator('#value').fill('Blocked edit');
    await popup.locator('#insert').click();
    await popup.waitForFunction(() => document.querySelector('#status').className === 'error');
    assert.equal(await page.locator('#name').inputValue(), 'Ada Lovelace');
    pass('Canceled beforeinput preserves the field');
    await page.locator('#notes').click();
    await open();
    await page.locator('#notes').evaluate(node => { node.readOnly = true; });
    await popup.locator('#value').fill('Read-only edit');
    await popup.locator('#insert').click();
    await popup.waitForFunction(() => document.querySelector('#status').className === 'error');
    assert.equal(await page.locator('#notes').inputValue(), 'Pasted automatically\nSecond line');
    await page.locator('#notes').evaluate(node => { node.readOnly = false; });
    pass('Field becoming read-only is rejected');
    await page.locator('#notes').click();
    await open();
    await page.locator('#notes').evaluate(node => node.remove());
    await popup.locator('#value').fill('Stale');
    await popup.locator('#insert').click();
    await popup.waitForFunction(() => document.querySelector('#status').className === 'error');
    pass('Removed target is rejected safely');
    await page.locator('#name').click();
    await open();
    await page.reload();
    await popup.locator('#value').fill('Stale document edit');
    await popup.locator('#insert').click();
    await popup.waitForFunction(() => document.querySelector('#status').className === 'error');
    assert.equal(await page.locator('#name').inputValue(), 'Old value');
    pass('Navigation invalidates the old target document');
    await page.locator('#name').click();
    await open();
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
    await popup.locator('body').screenshot({ path: path.join(root, 'test-results', 'popup.png') });

    const worker = context.serviceWorkers().find(item => item.url().endsWith('/background.js')) ||
      await context.waitForEvent('serviceworker');
    const ownerCreated = context.waitForEvent('page');
    await worker.evaluate(async address => {
      const [tab] = await chrome.tabs.query({ url: address });
      await openForTab(tab);
    }, address);
    const owner = await ownerCreated;
    await owner.waitForFunction(() => document.querySelector('#field')?.textContent === 'Full name');
    await owner.locator('#value').fill('Draft survives floating');
    await owner.locator('#auto').uncheck();
    const floatingCreated = context.waitForEvent('page');
    await owner.locator('#float').click();
    const floating = await floatingCreated;
    await floating.locator('#value').waitFor();
    assert.equal(await floating.locator('#value').inputValue(), 'Draft survives floating');
    assert.equal(await floating.locator('#auto').isChecked(), false);
    assert.equal(await owner.evaluate(() => Boolean(documentPictureInPicture.window)), true);
    await floating.locator('#value').screenshot({ path: path.join(root, 'test-results', 'floating-input.png') });
    await floating.screenshot({ path: path.join(root, 'test-results', 'floating-window.png') });
    pass('Real Picture-in-Picture window opens and preserves draft and options');

    await page.locator('#notes').click();
    await floating.waitForFunction(() => document.querySelector('#field').textContent === 'Notes');
    await floating.locator('#insert').click();
    await floating.waitForFunction(() => document.querySelector('#status').className === 'success');
    assert.equal(await page.locator('#notes').inputValue(), 'Draft survives floating');
    assert.equal(await page.locator('#name').inputValue(), 'Old value');
    pass('Floating window stays open while focus changes and follows the selected field');

    await page.frameLocator('iframe').getByPlaceholder('Frame field').click();
    await floating.waitForFunction(() => document.querySelector('#field').textContent === 'Frame field');
    await floating.locator('#value').fill('Floating frame edit');
    await floating.locator('#insert').click();
    await floating.waitForFunction(() => document.querySelector('#status').className === 'success');
    assert.equal(await page.frameLocator('iframe').getByPlaceholder('Frame field').inputValue(), 'Floating frame edit');
    pass('Floating window follows field selection into a cross-origin frame');

    await page.reload();
    await floating.waitForFunction(() => document.querySelector('#field').textContent === 'No field selected');
    assert.equal(await floating.locator('#insert').isDisabled(), true);
    await page.locator('#name').click();
    await floating.waitForFunction(() => document.querySelector('#field').textContent === 'Full name');
    pass('Floating window survives website navigation and refreshes its target');

    const second = await context.newPage();
    await second.goto(`${address}?second`);
    await second.locator('#notes').click();
    const pageCount = context.pages().length;
    await worker.evaluate(async address => {
      const [tab] = await chrome.tabs.query({ url: `${address}?second` });
      await openForTab(tab);
    }, address);
    await floating.waitForFunction(() => document.querySelector('#field').textContent === 'Notes');
    assert.equal(context.pages().length, pageCount);
    assert.equal(await floating.locator('#value').inputValue(), 'Floating frame edit');
    await floating.locator('#insert').click();
    await floating.waitForFunction(() => document.querySelector('#status').className === 'success');
    assert.equal(await second.locator('#notes').inputValue(), 'Floating frame edit');
    assert.equal(await page.locator('#notes').inputValue(), 'Hello world');
    pass('Toolbar action reuses the floating window and retargets another tab without losing text');

    await second.close();
    await floating.waitForFunction(() => document.querySelector('#field').textContent === 'This page is unavailable');
    assert.equal(await floating.locator('#insert').isDisabled(), true);
    pass('Closing the target tab safely disables insertion');

    await floating.close();
    await owner.locator('#float').waitFor({ state: 'visible' });
    assert.equal(await owner.locator('#value').inputValue(), 'Floating frame edit');
    assert.equal(await owner.locator('#float').isEnabled(), true);
    pass('Closing the floating window returns controls and draft to the owner tab');
    const reopened = context.waitForEvent('page');
    await owner.locator('#float').click();
    const floatingAgain = await reopened;
    await floatingAgain.locator('#value').waitFor();
    const closed = floatingAgain.waitForEvent('close');
    await owner.close();
    await closed;
    pass('Floating window can reopen and closes when its owner tab closes');
    await require('./translation.cjs')({ context, page, worker, extension, root, pass });
    console.log(`${passed} browser checks passed.`);
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    // Only remove the unique test profile created by mkdtemp above.
    assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
