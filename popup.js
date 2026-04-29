const saveBtn        = document.getElementById('saveBtn');
const spinner        = document.getElementById('spinner');
const btnText        = document.getElementById('btnText');
const statusEl       = document.getElementById('status');
const previewEl      = document.getElementById('preview');
const summarySection = document.getElementById('summarySection');
const summaryText    = document.getElementById('summaryText');
const skillsSection  = document.getElementById('skillsSection');
const skillsTags     = document.getElementById('skillsTags');
const bulletsSection = document.getElementById('bulletsSection');
const bulletsList    = document.getElementById('bulletsList');
const settingsLink   = document.getElementById('settingsLink');

// ─── Settings link ────────────────────────────────────────────────────────────

settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ─── Listen for live status updates from the background worker ────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'statusUpdate') {
    btnText.textContent = message.status;
  }
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

    // Ask the content script for the page text + URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let pageData;

    try {
      pageData = await chrome.tabs.sendMessage(tab.id, { action: 'getJobText' });
    } catch {
      showStatus('error', "Couldn't read this page. Make sure you're on a LinkedIn or Built In job posting, then refresh and try again.");
      return;
    }

    if (!pageData?.text) {
      showStatus('error', 'No text found on this page.');
      return;
    }

    setLoading(true, 'Extracting job details with AI…');

    // Hand off to the background service worker (it will broadcast step updates)
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

    // Show extracted fields
    showPreview(result.extracted);

    // Show tailored summary
    if (result.summary) {
      showSummary(result.summary);
    }

    // Show relevant skills
    if (result.skills) {
      showSkills(result.skills);
    }

    // Show tailored bullets
    if (result.bullets) {
      showBullets(result.bullets);
    }

    showStatus('success', `✓ Saved! <a href="https://airtable.com/${config.baseId}/${config.tableId}" target="_blank">View in Airtable ↗</a>`);
    btnText.textContent = 'Saved ✓';
    saveBtn.disabled = true;

  } catch (err) {
    showStatus('error', err.message || 'Unexpected error.');
  } finally {
    spinner.style.display = 'none';
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setLoading(on, label = 'Save This Job') {
  spinner.style.display = on ? 'block' : 'none';
  btnText.textContent   = label;
  saveBtn.disabled      = on;
}

function showStatus(type, html) {
  statusEl.className = `visible ${type}`;
  statusEl.innerHTML = html;
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

function showSummary(text) {
  summaryText.textContent = text;
  summarySection.classList.add('visible');
}

function showSkills(skillsText) {
  const skills = skillsText
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  skillsTags.innerHTML = skills
    .map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`)
    .join('');

  skillsSection.classList.add('visible');
}

function showBullets(bulletsText) {
  const lines = bulletsText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  bulletsList.innerHTML = lines.map(line => {
    // Bold role headers: **Founder**, **Senior Technical Program Manager**, etc.
    if (line.startsWith('**') && line.endsWith('**')) {
      const label = escapeHtml(line.slice(2, -2));
      return `<div class="bullet-role-header">${label}</div>`;
    }
    return `<div class="bullet-item">${escapeHtml(line)}</div>`;
  }).join('');

  bulletsSection.classList.add('visible');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
