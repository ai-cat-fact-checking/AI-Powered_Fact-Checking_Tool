// Helper function to inject content script
export async function ensureScriptInjected(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (
      !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('https://chromewebstore.google.com/')
    ) {
      throw new Error('Cannot inject script into this page type.');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['lib/Readability.min.js', 'js/content_script.js']
    });
    console.log(
      `Injected Readability.min.js and content_script.js into tab ${tabId}`
    );
    return true;
  } catch (err) {
    console.error(`Failed to inject scripts into tab ${tabId}:`, err);
    if (window.factCheckLogic) {
      alert(`請點擊瀏覽器工具列中的擴充功能圖示 icon 以授權分析此頁面。

或者，在頁面上按右鍵，選擇「真假 Meow 一下」。`);
      console.log(`Failed to inject scripts into tab ${tabId}:`, err);
      window.factCheckLogic.showPermissionPrompt();
    }
    return false;
  }
}

export function getCurrentTabInfo(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (
      !tabs ||
      !tabs[0] ||
      !tabs[0].id ||
      !tabs[0].url ||
      tabs[0].url.startsWith('chrome://') ||
      tabs[0].url.startsWith('https://chromewebstore.google.com/')
    ) {
      callback(null);
      return;
    }

    const tab = tabs[0];
    callback({ tab });
  });
}
