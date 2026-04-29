// Content script: injected into supported job posting pages.
// Listens for messages from the popup and returns the page text + URL.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getJobText') {
    const metaDescription = document
      .querySelector('meta[name="description"], meta[property="og:description"]')
      ?.getAttribute('content');

    // Put page metadata first so title/company details survive the text cap.
    const rawText = [
      document.title,
      metaDescription,
      document.body.innerText
    ]
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')  // collapse triple+ newlines
      .trim();

    // Cap at 4000 chars to keep OpenAI token usage low — job essentials
    // (title, company, location, salary) are almost always in the first chunk
    const text = rawText.slice(0, 4000);

    sendResponse({
      text,
      url: window.location.href,
      title: document.title
    });
  }

  // Return true to keep the message channel open for async sendResponse
  return true;
});
