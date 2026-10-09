# Field Inject

A Chrome extension: click a field on a website and paste your text into a movable, always-on-top window. The text is immediately inserted into the selected field.

English-to-Nepali translation is temporarily hidden and disabled. Its controls, key settings, and Google branding are not shown. Normal text insertion and the floating window remain available. Any previously saved API key is retained but is not read or used while translation is disabled.

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

## English to Nepali (currently disabled)

The implementation is retained for later restoration. Developers can restore it by changing `data-translation-enabled="false"` to `"true"` in `popup.html`, then reloading the extension. The instructions below apply only when it is enabled. Translation is powered by [Google Translate through the Cloud Translation API](https://cloud.google.com/translate).

1. Follow [Google's setup guide](https://cloud.google.com/translate/docs/setup): create/select a Google Cloud project, enable billing, and enable the **Cloud Translation API**.
2. Create an API key in Google Cloud **APIs & Services → Credentials**. Restrict the key to **Cloud Translation API**. This extension uses the Basic v2 API with the standard NMT model.
3. Reload Field Inject in `chrome://extensions` after installing this update. Open it and turn on **English → Nepali**.
4. Open **Google API key settings**, paste your key, and click **Save key**. Enter the key only in the extension; do not include it in source files or shared ZIPs.
5. Type or paste English text and click **Translate with Google**. Review or edit the Nepali preview, then click **Insert text** or press Ctrl+Enter (Command+Enter on macOS) in either text area.

Translation mode disables automatic insertion on paste. Only clicking **Translate with Google** sends the English text to Google. The original English stays available; editing it clears any old translation. Translation requires a valid preview before insertion, so an API error never falls back to inserting English. Switch **English → Nepali** off to return to normal text insertion. Translation works in both the extension tab and the always-on-top window.

The extension accepts up to 5,000 Unicode characters per translation request. You can cancel a pending request; requests time out after 20 seconds. Cancellation cannot undo processing or charges if Google already received the request. API, billing, quota, and network errors appear beside the translation controls.

Google's standard NMT tier currently includes the first **500,000 characters per month** free through a monthly credit; additional usage is billable. Billing setup is still required. The extension does **not** enforce a monthly free-tier cap or track usage from other applications. Review [Google's pricing](https://cloud.google.com/translate/pricing) and configure appropriate [Google Cloud quotas](https://cloud.google.com/translate/quotas). Translation quality varies; this feature makes no 95% accuracy guarantee.

The API key is stored in this browser profile's local extension storage, with access restricted to trusted extension contexts. It is not synced, embedded in the package, exposed to content scripts, or sent in request URLs. It is not an encrypted credential vault. **Remove key** deletes the saved key. For a public product with a shared developer credential, use a backend instead of shipping a shared key in an extension.

The Google attribution badge in `icons/google-translate.png` comes unmodified from [Google's official attribution assets](https://cloud.google.com/translate/attribution). See Google's [translation disclaimer](https://cloud.google.com/translate/attribution#disclaimer).

## Compatibility and privacy

- Always-on-top mode uses Chrome's [Document Picture-in-Picture API](https://developer.chrome.com/docs/web-platform/document-picture-in-picture). Use a current desktop Chrome or Edge version. Chrome requires clicking the floating-window button to open it. The window's native title bar provides movement; current browser versions also support resizing.
- Supports text, search, email, URL, telephone, password, and number inputs; textareas; and standard contenteditable elements. Tracks fields in frames and open shadow roots.
- Browser pages such as `chrome://settings`, the Chrome Web Store, and built-in viewers do not allow normal extension injection. Custom canvas editors and closed shadow roots are not supported; some rich-text editors or sites requiring trusted keyboard events may reject programmatic edits.
- Read-only, disabled, hidden, and removed fields cannot be filled. Number fields require numeric text; websites may apply their own validation or formatting.
- To use local HTML files, enable **Allow access to file URLs** on the extension's details page. Incognito requires Chrome's separate **Allow in Incognito** setting.
- Website access is needed to remember the selected field across page frames. `scripting` inserts text into that field; `activeTab` identifies the current page when you click the toolbar icon. Content scripts run in Chrome's isolated extension world. See [Chrome's content script documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
- No extension backend, analytics, remote scripts, or clipboard-read permission. Normal field insertion makes no translation requests. When you click **Translate with Google**, the English draft and API key are sent over HTTPS directly to Google's Cloud Translation API; see [Google's data usage FAQ](https://cloud.google.com/translate/data-usage). Drafts and translation results remain in extension memory until the extension tab is closed or reloaded; only the API key is saved locally using the `storage` permission. The floating form belongs to the extension, so websites cannot read its draft. Field references and cursor positions stay in page memory until the page unloads. Inserted text becomes part of the destination website's field and is subject to that website's behavior.

## Development

The extension is plain JavaScript, HTML, and CSS. No build step or runtime dependencies are required. After edits, click **Reload** on `chrome://extensions` and refresh the destination page.

Translation checks run only when `data-translation-enabled` is `true`; the current disabled version runs the 22 core insertion and floating-window checks.

To run the browser checks: `npm install`, `npx playwright install chromium`, then `npm test`. Tests load the actual extension in a temporary Chromium profile and exercise field insertion against local pages, including a cross-origin frame. They also open a real Picture-in-Picture window, check live target changes and navigation, reuse the window for another tab, and verify draft preservation and window cleanup. Translation tests intercept the Google endpoint with simulated responses and a fake key: they exercise request format, key storage, preview editing, cancellation, stale results, API errors, and translation in the floating window without paid calls. They do not measure translation accuracy or validate a real Google account. Screenshots are saved in `test-results/`, including `nepali-translation.png`.
#   f e i l d i n p u t  
 
