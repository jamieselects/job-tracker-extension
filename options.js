const fields = ['openaiKey', 'airtableKey', 'baseId', 'tableId'];

// Default Airtable IDs — users can override with their own
const DEFAULTS = {
  baseId:  'appwY5sGbYJeVXAjc',
  tableId: 'tblLOrQdaqX0MpS0z'
};

// ─── Load saved values on open ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(fields, (stored) => {
    document.getElementById('openaiKey').value   = stored.openaiKey   || '';
    document.getElementById('airtableKey').value = stored.airtableKey || '';
    document.getElementById('baseId').value      = stored.baseId      || DEFAULTS.baseId;
    document.getElementById('tableId').value     = stored.tableId     || DEFAULTS.tableId;
  });
});

// ─── Save ─────────────────────────────────────────────────────────────────────

document.getElementById('saveBtn').addEventListener('click', () => {
  const values = {
    openaiKey:   document.getElementById('openaiKey').value.trim(),
    airtableKey: document.getElementById('airtableKey').value.trim(),
    baseId:      document.getElementById('baseId').value.trim() || DEFAULTS.baseId,
    tableId:     document.getElementById('tableId').value.trim() || DEFAULTS.tableId
  };

  if (!values.openaiKey) {
    showStatus('OpenAI API key is required.', true);
    return;
  }

  if (!values.airtableKey) {
    showStatus('Airtable API key is required.', true);
    return;
  }

  chrome.storage.local.set(values, () => {
    showStatus('✓ Settings saved!', false);
  });
});

function showStatus(message, isError) {
  const el = document.getElementById('statusMsg');
  el.textContent = message;
  el.className   = isError ? 'visible error' : 'visible';
  setTimeout(() => { el.className = ''; }, 3000);
}
