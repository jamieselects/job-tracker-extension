// Background service worker: handles OpenAI parsing, experience fetching,
// bullet generation, and Airtable record creation/update.

// ─── Airtable config ──────────────────────────────────────────────────────────

const EXPERIENCE_TABLE_ID = 'tblhYKTjqmNsrXN1E';
const BULLETS_FIELD_ID    = 'fldmJz9OTX7CH9nD7'; // "Tailored Bullets" on Jobs table
const SUMMARY_FIELD       = 'Summary';            // "Summary" column on Jobs table
const SKILLS_FIELD        = 'Skills';             // "Skills" column on Jobs table

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveJob') {
    handleSaveJob(message.data)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

// ─── Status broadcast (popup listens for these) ───────────────────────────────

function broadcast(status) {
  chrome.runtime.sendMessage({ action: 'statusUpdate', status }).catch(() => {
    // Popup may be closed — that's fine, ignore
  });
}

// ─── Main flow ────────────────────────────────────────────────────────────────

async function handleSaveJob({ text, url, openaiKey, airtableKey, baseId, tableId }) {
  // Step 1: Extract structured fields from the job posting
  broadcast('Extracting job details with AI…');
  const extracted = await extractWithOpenAI(text, url, openaiKey);

  // Step 2: Create the initial Airtable record
  broadcast('Saving to Airtable…');
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

  // Step 3: Fetch your experience records
  broadcast('Loading your experience…');
  const experienceRecords = await fetchExperienceRecords(airtableKey, baseId);

  // Step 4: Generate tailored bullets, summary, and skills in parallel
  broadcast('Generating tailored content…');
  const [bullets, summary, skills] = await Promise.all([
    generateTailoredBullets(text, experienceRecords, openaiKey),
    generateTailoredSummary(text, experienceRecords, openaiKey),
    generateRelevantSkills(text, experienceRecords, openaiKey)
  ]);

  // Step 5: Write bullets, summary, and skills back to the job record in one call
  broadcast('Saving generated content…');
  await updateAirtableRecord({
    recordId:    record.id,
    fields:      {
      [BULLETS_FIELD_ID]: bullets,
      [SUMMARY_FIELD]:    summary,
      [SKILLS_FIELD]:     skills
    },
    airtableKey,
    baseId,
    tableId
  });

  return { success: true, record, extracted, bullets, summary, skills };
}

// ─── OpenAI: job field extraction ─────────────────────────────────────────────

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

  return callOpenAI(apiKey, prompt, 300, 0);
}

// ─── OpenAI: tailored bullet generation ──────────────────────────────────────

async function generateTailoredBullets(jobText, experienceRecords, apiKey) {
  // Define the four roles we always want bullets for, in display order
  const ROLE_ORDER = [
    'Founder',
    'Senior Technical Program Manager',
    'Product Operations Lead',
    'Release Manager'
  ];

  // Build a context block per role in the desired order
  const experienceContext = ROLE_ORDER.map(roleName => {
    const record = experienceRecords.find(r =>
      (r.fields['Role'] || '').toLowerCase().includes(roleName.toLowerCase())
    );
    if (!record) return null;
    const f = record.fields;
    return [
      `ROLE: ${f['Role'] || ''} | COMPANY: ${f['Company'] || ''} | DATES: ${f['Dates'] || ''}`,
      f['Accomplishments'] ? `Accomplishments:\n${f['Accomplishments']}` : '',
      f['Peer Feedback']   ? `Peer Feedback highlights:\n${f['Peer Feedback']}` : ''
    ].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n---\n\n');

  const prompt = `You are helping a job applicant write tailored resume bullet points for a specific job posting.

RULES:
- Only use accomplishments explicitly stated in the candidate's experience below — do not invent or embellish
- Mirror the keywords, terminology, and priorities from the job posting
- Use strong action verbs (Led, Built, Drove, Launched, Scaled, Designed, etc.)
- Include specific metrics and outcomes where they appear in the experience data
- Generate a bullet for EVERY accomplishment listed in the candidate's experience below — do not skip or summarize any of them
- Rewrite each accomplishment as a strong resume bullet tailored to the keywords and priorities of this specific job posting
- Output bullets grouped by role in this exact order: Founder, Senior Technical Program Manager, Product Operations Lead, Release Manager
- Format exactly like this (use the role name as a bold header with ** on each side, then bullets starting with •):

**Founder**
• bullet
• bullet

**Senior Technical Program Manager**
• bullet
• bullet
• bullet

**Product Operations Lead**
• bullet
• bullet

**Release Manager**
• bullet
• bullet

- No extra text, no explanations, no deviations from this format

JOB POSTING:
"""
${jobText.slice(0, 3000)}
"""

CANDIDATE'S EXPERIENCE:
"""
${experienceContext}
"""`;

  return callOpenAI(apiKey, prompt, 2500, 0.3, true);
}

// ─── OpenAI: tailored summary generation ─────────────────────────────────────

async function generateTailoredSummary(jobText, experienceRecords, apiKey) {
  const ROLE_ORDER = [
    'Founder',
    'Senior Technical Program Manager',
    'Product Operations Lead',
    'Release Manager'
  ];

  const experienceContext = ROLE_ORDER.map(roleName => {
    const record = experienceRecords.find(r =>
      (r.fields['Role'] || '').toLowerCase().includes(roleName.toLowerCase())
    );
    if (!record) return null;
    const f = record.fields;
    return `${f['Role'] || ''} at ${f['Company'] || ''} (${f['Dates'] || ''})`;
  }).filter(Boolean).join(', ');

  const prompt = `You are writing a tailored professional resume summary for a job applicant.

RULES:
- Write 2–4 sentences in first person (without using "I" — start with a noun or adjective instead, e.g. "Experienced program manager…")
- Directly mirror the keywords, priorities, and tone from the job posting
- Reference the candidate's most relevant experience and seniority level
- Highlight what makes them a strong fit for THIS specific role
- Output ONLY the summary text — no labels, no explanations, no quotes

CANDIDATE'S EXPERIENCE OVERVIEW:
${experienceContext}

JOB POSTING:
"""
${jobText.slice(0, 3000)}
"""`;

  return callOpenAI(apiKey, prompt, 300, 0.3, true);
}

// ─── OpenAI: relevant skills generation ──────────────────────────────────────

async function generateRelevantSkills(jobText, experienceRecords, apiKey) {
  // Gather all accomplishment text to inform which skills the candidate actually has
  const accomplishments = experienceRecords
    .map(r => r.fields['Accomplishments'] || '')
    .filter(Boolean)
    .join('\n');

  const prompt = `You are identifying relevant skills for a job applicant's resume.

RULES:
- Return a comma-separated list of skills (e.g. "Technical Program Management, Roadmap Planning, Cross-functional Leadership")
- Only include skills the candidate has demonstrated based on their experience below AND that are relevant to the job posting
- Prioritize skills that appear in the job posting requirements or preferred qualifications
- Include both hard skills (tools, methodologies) and soft skills (leadership, communication) where appropriate
- Return 8–15 skills maximum
- Output ONLY the comma-separated list — no labels, no explanations, no bullets

CANDIDATE'S ACCOMPLISHMENTS:
"""
${accomplishments.slice(0, 2000)}
"""

JOB POSTING:
"""
${jobText.slice(0, 2000)}
"""`;

  return callOpenAI(apiKey, prompt, 200, 0.2, true);
}

// ─── OpenAI: shared fetch ─────────────────────────────────────────────────────

async function callOpenAI(apiKey, prompt, maxTokens, temperature, rawText = false) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      messages:    [{ role: 'user', content: prompt }],
      temperature,
      max_tokens:  maxTokens
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI error: ${err?.error?.message || response.statusText}`);
  }

  const data    = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (rawText) return content;

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Could not parse OpenAI response: ${content}`);
  }
}

// ─── Airtable: fetch experience records ──────────────────────────────────────

async function fetchExperienceRecords(airtableKey, baseId) {
  const fields = ['Role', 'Company', 'Dates', 'Accomplishments', 'Peer Feedback'];
  const params = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  const url    = `https://api.airtable.com/v0/${baseId}/${EXPERIENCE_TABLE_ID}?${params}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${airtableKey}` }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Airtable error fetching experience: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.records || [];
}

// ─── Airtable: create job record ──────────────────────────────────────────────

async function createAirtableRecord({ fields, airtableKey, baseId, tableId }) {
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
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

// ─── Airtable: update record with bullets ─────────────────────────────────────

async function updateAirtableRecord({ recordId, fields, airtableKey, baseId, tableId }) {
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${airtableKey}`
    },
    body: JSON.stringify({ fields })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Airtable update error: ${err?.error?.message || response.statusText}`);
  }

  return await response.json();
}
