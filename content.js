// Content script: injected into LinkedIn and Built In job pages.
// Listens for messages from the popup and returns the page text + URL.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getJobText') {
    // Grab the visible text from the page, trimmed of excess whitespace
    const rawText = document.body.innerText
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
