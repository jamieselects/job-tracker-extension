// Background service worker: handles OpenAI parsing and Airtable record creation.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveJob') {
    handleSaveJob(message.data)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep message channel open for async response
  }
});

// ─── Main handler ────────────────────────────────────────────────────────────

async function handleSaveJob({ text, url, openaiKey, airtableKey, baseId, tableId }) {
  // Step 1: Ask OpenAI to extract structured job data from the page text
  const extracted = await extractWithOpenAI(text, url, openaiKey);

  // Step 2: Create a record in Airtable
  const record = await createAirtableRecord({
    fields: {
      Company:  extracted.company  || '',
      Job:      extracted.jobTitle || '',
      Link:     url,
      Salary:   extracted.salary   || '',
      Location: extracted.location || ''
    },
    airtableKey,
    baseId,
    tableId
  });

  return { success: true, record, extracted };
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function extractWithOpenAI(text, url, apiKey) {
  const prompt = `You are parsing a job posting page. Extract the following fields and return ONLY valid JSON — no markdown, no explanation.

Fields to extract:
- company: The hiring company's name
- jobTitle: The job title / position name
- salary: Salary or compensation range as a string (e.g. "$120,000 - $150,000" or "$80/hr"). Return null if not mentioned.
- location: City and state, or "Remote", or "Hybrid – [City, State]". Return null if not found.

Job posting text:
"""
${text}
"""

Return JSON like: {"company": "...", "jobTitle": "...", "salary": "...", "location": "..."}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 300
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI error: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Could not parse OpenAI response: ${content}`);
  }
}

// ─── Airtable ─────────────────────────────────────────────────────────────────

async function createAirtableRecord({ fields, airtableKey, baseId, tableId }) {
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${airtableKey}`
    },
    body: JSON.stringify({ fields })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Airtable error: ${err?.error?.message || response.statusText}`);
  }

  return await response.json();
}
