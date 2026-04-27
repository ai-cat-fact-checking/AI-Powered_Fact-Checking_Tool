chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-theme') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    sendResponse({ theme: isDark ? 'light' : 'dark' });
  }
});
