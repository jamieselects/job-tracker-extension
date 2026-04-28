const saveBtn    = document.getElementById('saveBtn');
const spinner    = document.getElementById('spinner');
const btnText    = document.getElementById('btnText');
const statusEl   = document.getElementById('status');
const previewEl  = document.getElementById('preview');
const settingsLink = document.getElementById('settingsLink');

// ─── Settings link ────────────────────────────────────────────────────────────

settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ─── On load: check config ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const config = await getConfig();

  if (!config.openaiKey || !config.airtableKey) {
    showStatus('info', '⚙ Please <a href="#" id="configLink">configure your API keys</a> before saving jobs.');
    document.getElementById('configLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    saveBtn.disabled = true;
  }
});

// ─── Save button ──────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
  setLoading(true, 'Reading page…');
  clearStatus();

  try {
    const config = await getConfig();

    if (!config.openaiKey || !config.airtableKey) {
      showStatus('error', 'API keys not configured. Open Settings to add them.');
      return;
    }

    // Ask the content script for the page text
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let pageData;

    try {
      pageData = await chrome.tabs.sendMessage(tab.id, { action: 'getJobText' });
    } catch {
      showStatus('error', 'Could not read this page. Make sure you\'re on a LinkedIn or Built In job posting, then refresh and try again.');
      return;
    }

    if (!pageData?.text) {
      showStatus('error', 'No text found on this page.');
      return;
    }

    setLoading(true, 'Extracting with AI…');

    // Send to background to call OpenAI + Airtable
    const result = await chrome.runtime.sendMessage({
      action: 'saveJob',
      data: {
        text:         pageData.text,
        url:          pageData.url,
        openaiKey:    config.openaiKey,
        airtableKey:  config.airtableKey,
        baseId:       config.baseId,
        tableId:      config.tableId
      }
    });

    if (!result.success) {
      showStatus('error', result.error || 'Something went wrong.');
      return;
    }

    // Show extracted fields preview
    showPreview(result.extracted);

    showStatus('success', `✓ Saved! <a href="https://airtable.com/${config.baseId}/${config.tableId}" target="_blank">View in Airtable ↗</a>`);
    btnText.textContent = 'Saved ✓';
    saveBtn.disabled = true;

  } catch (err) {
    showStatus('error', err.message || 'Unexpected error.');
  } finally {
    setLoading(false);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setLoading(on, label = 'Save This Job') {
  spinner.style.display = on ? 'block' : 'none';
  btnText.textContent   = on ? label : 'Save This Job';
  saveBtn.disabled      = on;
}

function showStatus(type, html) {
  statusEl.className   = `visible ${type}`;
  statusEl.innerHTML   = html;
}

function clearStatus() {
  statusEl.className = '';
  statusEl.innerHTML = '';
}

function showPreview(extracted) {
  if (!extracted) return;
  document.getElementById('prev-company').textContent  = extracted.company  || '—';
  document.getElementById('prev-title').textContent    = extracted.jobTitle || '—';
  document.getElementById('prev-location').textContent = extracted.location || '—';
  document.getElementById('prev-salary').textContent   = extracted.salary   || '—';
  previewEl.classList.add('visible');
}

async function getConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['openaiKey', 'airtableKey', 'baseId', 'tableId'],
      (result) => {
        resolve({
          openaiKey:   result.openaiKey   || '',
          airtableKey: result.airtableKey || '',
          baseId:      result.baseId      || 'appwY5sGbYJeVXAjc',
          tableId:     result.tableId     || 'tblLOrQdaqX0MpS0z'
        });
      }
    );
  });
}
