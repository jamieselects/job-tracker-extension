# Job Tracker Chrome Extension

A Chrome extension that saves job postings from LinkedIn, Built In, Greenhouse, and Ashby to an Airtable tracker — with one click. Uses OpenAI to automatically extract the company name, job title, location, and salary from the posting.

## Features

- **One-click saving** — click the extension icon on any job page and hit "Save This Job"
- **AI-powered parsing** — GPT-4o-mini extracts structured fields from unstructured job posting text
- **Works on LinkedIn, Built In, Greenhouse, and Ashby** — handles these job boards out of the box
- **Airtable integration** — creates a new record in your tracker with Company, Job, Link, Salary, and Location pre-filled
- **Preview before saving** — shows extracted fields in the popup so you can verify before committing

## Setup

### 1. Load the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select this project folder

The Job Tracker icon (💼) will appear in your Chrome toolbar.

### 2. Configure API keys

Click the extension icon, then click **⚙ Settings** (or right-click the icon → Options).

You'll need:

- **OpenAI API key** — get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). The extension uses `gpt-4o-mini`, which costs fractions of a cent per save.
- **Airtable personal access token** — create one at [airtable.com/create/tokens](https://airtable.com/create/tokens). Grant it `data.records:write` scope for your base.
- **Base ID** and **Table ID** — found in your Airtable URL: `airtable.com/{baseId}/{tableId}/...`

Keys are stored locally in your browser via `chrome.storage.local` — they never leave your machine.

### 3. Use it

1. Navigate to a job posting on LinkedIn, Built In, Greenhouse, or Ashby
2. Click the Job Tracker icon in your toolbar
3. Click **Save This Job**
4. The extension reads the page, sends it to OpenAI, and creates an Airtable record

That's it. The popup shows you a preview of the extracted fields and a link to the new record.

## Airtable schema

The extension maps to these fields in your Airtable table:

| Field    | Type             | Description                         |
|----------|------------------|-------------------------------------|
| Company  | Single line text | Company name                        |
| Job      | Long text        | Job title / position                |
| Link     | Long text        | URL of the job posting              |
| Salary   | Long text        | Salary or comp range (if listed)    |
| Location | Long text        | City/state, Remote, or Hybrid       |

Fields like Status, Contact, Resume, and Cover Letter are left for you to fill in manually as your application progresses.

## Tech stack

- **Manifest V3** Chrome extension
- **OpenAI API** (`gpt-4o-mini`) for field extraction
- **Airtable REST API** for record creation
- Vanilla HTML/CSS/JS — no build step, no dependencies

## Contributing

PRs welcome! Some ideas for future improvements:

- Support for more job boards (Lever, Workday, Indeed)
- Duplicate detection (warn if the job URL already exists in Airtable)
- Status dropdown in the popup to set application status on save
- Export to CSV

## License

MIT
