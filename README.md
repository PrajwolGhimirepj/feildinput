# Field Inject

A Chrome extension: click a field on a website and paste your text into a movable, always-on-top window. The text is immediately inserted into the selected field.

English-to-Nepali translation uses a separate [Google Translate tab](https://translate.google.com/?sl=en&tl=ne&op=translate). No API key or Google Cloud setup is needed. The previous API integration has been removed; any saved key is deleted when the updated extension's background worker starts.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** at the top right.
3. Click **Load unpacked** and select `D:\Projects\FeildInject` (the folder containing `manifest.json`).
4. Pin **Field Inject** using Chrome's Extensions menu.
5. Refresh website tabs that were already open, so field tracking starts before you click a field.

## Use

1. Click a text field, textarea, or editable text area on a website.
2. Click the Field Inject toolbar icon. An extension tab opens and shows the selected field.
3. Click **Open always-on-top window**. Chrome returns to your website and opens the floating window above other windows. Drag its native title bar to move it, or drag its edges to resize it.
4. Paste into **Text to insert**. **Insert when I paste** is enabled by default.

Keep the extension tab open: Chrome needs it to own the floating window. You can switch tabs and apps while the floating window stays on top. Clicking a different field on the source website updates the target automatically, including fields inside frames. To target another website tab, click the Field Inject toolbar icon there; the existing window is reused and your draft is preserved. Reloading the source website keeps the floating window open, but you must select a field again.

Closing the floating window returns its controls and draft to the extension tab. Closing the extension tab closes the floating window and clears the draft. You can also use the form directly in the extension tab without floating it.

You can also type text and click **Insert text**, or press Ctrl+Enter (Command+Enter on macOS). Turn off **Insert when I paste** to review text before inserting. **Replace field** replaces the entire value. **At cursor** replaces the selected text or inserts at the remembered cursor; input types without a text-selection API fall back to replacing the entire field. Pasting inserts the full contents of the extension text area. Empty text is not inserted. No forms are automatically submitted.

## English to Nepali

1. Turn on **English → Nepali** and type or paste English text.
2. Optionally turn on **Auto-insert translation into an empty field**. This inserts a successful translation without waiting for you to click Insert; it refuses to change a field that already contains any text and asks you to select an empty field instead.
3. Click **Translate to Nepali**. The extension briefly switches to a separate Google Translate tab, with English and Nepali selected and your text supplied in the page URL. When the result is ready, it returns to the website tab where you selected the field and shows the Nepali preview.
4. If auto-insert is off, review or edit the Nepali preview, then click **Insert text** or press Ctrl+Enter (Command+Enter on macOS) in either text area.

The extension reuses the tab it created, including after reloading the extension's owner tab. It does not overwrite an existing Google Translate tab you opened yourself. If you close its tab, the next request creates another. If you navigate its tab to a different website, it leaves that tab alone and creates another. When translation finishes, it returns to the website tab associated with the selected field, even if you launched translation from the floating window. The destination field stays attached to your original website.

Translation mode disables automatic insertion on paste. Typing or pasting alone does not send text to Google. Editing the English or turning translation off cancels any pending request and clears the old preview. Failed translation never falls back to inserting English. **Cancel** stops waiting for a result, but cannot retract text already sent to Google. Both the owner tab and always-on-top window support translation.

The extension accepts up to 5,000 Unicode characters per request. It waits up to 35 seconds after opening the tab and checks that the displayed source text and selected languages match your request before returning a stable result. Only translated segments are read; dictionary entries and pronunciation text are excluded.

If Google shows a consent page, CAPTCHA, connection error, or a changed page layout, use **Open Google Translate tab** to inspect it and complete any prompts yourself, then retry. The extension does not bypass prompts. The integration depends on Google's website layout and may need maintenance if it changes. Translation quality varies; review the result before inserting.

## Compatibility and privacy

- Always-on-top mode uses Chrome's [Document Picture-in-Picture API](https://developer.chrome.com/docs/web-platform/document-picture-in-picture). Use a current desktop Chrome or Edge version. Chrome requires clicking the floating-window button to open it. The window's native title bar provides movement; current browser versions also support resizing.
- Supports text, search, email, URL, telephone, password, and number inputs; textareas; and standard contenteditable elements. Tracks fields in frames and open shadow roots.
- Browser pages such as `chrome://settings`, the Chrome Web Store, and built-in viewers do not allow normal extension injection. Custom canvas editors and closed shadow roots are not supported; some rich-text editors or sites requiring trusted keyboard events may reject programmatic edits.
- Read-only, disabled, hidden, and removed fields cannot be filled. Number fields require numeric text; websites may apply their own validation or formatting.
- To use local HTML files, enable **Allow access to file URLs** on the extension's details page. Incognito requires Chrome's separate **Allow in Incognito** setting.
- Website access is needed to remember the selected field across page frames. `scripting` inserts text into that field; `activeTab` identifies the current page when you click the toolbar icon. Content scripts run in Chrome's isolated extension world. See [Chrome's content script documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
- No extension backend, analytics, remote scripts, or clipboard-read permission. Normal field insertion does not send text to Google. Translation opens the Google Translate website with your English text in its URL, so that text may appear in browser history, history sync, and Google's website/account activity according to your settings. Canceling or closing the extension does not erase that history or close the Google tab. Only the helper tab ID is kept in session storage; drafts and results are not stored by the extension. The `storage` permission also allows removal of credentials from the retired integration. The floating form belongs to the extension, so destination websites cannot read its draft. Inserted text becomes part of the destination website and is subject to its behavior.

## Development

The extension is plain JavaScript, HTML, and CSS. No build step or runtime dependencies are required. After edits, click **Reload** on `chrome://extensions` and refresh the destination page.

Run `npm install`, `npx playwright install chromium`, then `npm test`. Tests load the actual extension in a temporary Chromium profile, exercise insertion and Picture-in-Picture, and use simulated Google Translate pages to check tab reuse, source matching, multiline extraction, cancellation, stale results, closing tabs, and preview editing. No real text is sent to Google by this suite.

Run `npm run test:live` for an optional online smoke test. It sends only two synthetic English examples to the real Google Translate website and checks preview, insertion, tab reuse, and the floating window. It needs network access and may fail if Google shows a prompt or changes its layout. These checks verify integration behavior, not translation accuracy. Screenshots are saved in `test-results/`.
#   f e i l d i n p u t  
 
