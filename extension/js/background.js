import { ensureScriptInjected } from '../js/utils.js';

// Track sidebar open state per window
const sidebarOpenState = {};

// Initialize context menu on extension installation
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'analyze-news',
    title: '真假 Meow 一下',
    contexts: ['page']
  });
  // updateIconBasedOnTheme();

  // Open options page on first install
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// chrome.runtime.onStartup.addListener(() => {
//   updateIconBasedOnTheme();
// });

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'analyze-news') {
    analyzeNews(tab);
  }
});

async function analyzeNews(tab) {
  if (tab.id === -1) {
    console.log(`[Background] Tab ID is -1, unable to analyze the page.`);
    return;
  }
  const injected = await ensureScriptInjected(tab.id);
  if (injected) {
    chrome.tabs.sendMessage(tab.id, { action: 'analyzeFromContextMenu' });
  } else {
    console.warn(
      `[Background] Could not analyze tab ${tab.id} via context menu due to injection failure.`
    );
  }
}

// Handle messages from content script, popup, and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Provide tab ID to content script
  if (message.action === 'getTabId' && sender.tab) {
    sendResponse({ tabId: sender.tab.id });
    return false; // Synchronous response
  }

  // Get Google OAuth token from storage (set by launchWebAuthFlow login)
  if (message.action === 'getGoogleAuthToken') {
    chrome.storage.local.get(['authToken'], (data) => {
      if (data.authToken) {
        console.log('✅ [BACKGROUND] Auth token found in storage');
        sendResponse({ token: data.authToken });
      } else {
        console.warn('❌ [BACKGROUND] No auth token in storage');
        sendResponse({ token: null, error: 'Not logged in' });
      }
    });
    return true; // Async response
  }

  // Get user encryption key from storage
  if (message.action === 'getUserEncryptionKey') {
    chrome.storage.local.get(['userInfo'], (data) => {
      if (data.userInfo && data.userInfo.id) {
        const googleId = data.userInfo.id;
        const storageKey = `encryptionKey_${googleId}`;

        chrome.storage.local.get([storageKey], (keyData) => {
          if (keyData[storageKey]) {
            console.log(
              '🔑 [BACKGROUND] User encryption key found for Google ID:',
              googleId
            );
            sendResponse({ encryptionKey: keyData[storageKey] });
          } else {
            console.warn(
              '❌ [BACKGROUND] No user encryption key found for Google ID:',
              googleId
            );
            sendResponse({ encryptionKey: null });
          }
        });
      } else {
        console.warn(
          '❌ [BACKGROUND] No user info found, cannot retrieve encryption key'
        );
        sendResponse({ encryptionKey: null });
      }
    });
    return true; // Async response
  }

  // Check API key configuration status
  if (message.action === 'checkApiKeyStatus') {
    chrome.storage.local.get(['userInfo'], (data) => {
      const hasApiKey = !!(data.userInfo && data.userInfo.encryptionKey);
      console.log('🔍 [BACKGROUND] API key status check:', {
        hasUserInfo: !!data.userInfo,
        hasEncryptionKey: !!data.userInfo?.encryptionKey,
        userEmail: data.userInfo?.email || 'None'
      });
      sendResponse({
        hasApiKey,
        isConfigured: hasApiKey,
        userEmail: data.userInfo?.email || null
      });
    });
    return true; // Async response
  }

  // Provide analysis data to report page
  if (message.action === 'getAnalysisForReport') {
    chrome.storage.local.get('analysisData', (data) => {
      sendResponse({ data: data.analysisData });
    });
    return true; // Async response
  }

  // Provide tab info to report page
  if (message.action === 'getCurrentTabInfo') {
    chrome.storage.local.get(['currentURL', 'currentTitle'], (data) => {
      sendResponse({
        url: data.currentURL || '',
        title: data.currentTitle || ''
      });
    });
    return true; // Async response
  }

  return true; // Keep message channel open for other potential handlers
});

chrome.commands.onCommand.addListener((command, tab) => {
  console.log(`[Background] Command received: ${command}`);
  if (command === 'analyze-news') {
    analyzeNews(tab);
  }
  if (command === 'toggle-sidebar') {
    const windowId = tab.windowId;
    if (sidebarOpenState[windowId]) {
      // Sidebar is open, close it by disabling and re-enabling
      chrome.sidePanel.setOptions({ enabled: false }, () => {
        chrome.sidePanel.setOptions({ enabled: true });
        sidebarOpenState[windowId] = false;
        console.log('[Background] Sidebar closed for window:', windowId);
      });
    } else {
      // Sidebar is closed, open it and authorize the tab
      // First inject the content script to get activeTab permission
      if (tab.id && tab.id !== -1) {
        ensureScriptInjected(tab.id).then((injected) => {
          if (injected) {
            console.log(
              '[Background] Content script injected for tab:',
              tab.id
            );
            // Store current URL for sidepanel to use
            chrome.storage.local.set({
              currentURL: tab.url,
              currentTitle: tab.title
            });
          }
        });
      }

      chrome.sidePanel
        .open({ windowId })
        .then(() => {
          sidebarOpenState[windowId] = true;
          console.log('[Background] Sidebar opened for window:', windowId);
        })
        .catch((err) => {
          console.error('[Background] Failed to open sidebar:', err);
        });
    }
  }
});

// async function updateIconBasedOnTheme() {
//   // await ensureOffscreenDocument();
//   const response = await chrome.runtime.sendMessage({ type: "get-theme" });
//   // const response = {
//   //   theme: 'dark'
//   // };

//   chrome.action.setIcon({
//     path: {
//       "16": `../assets/icon-${response.theme}/${response.theme}_icon_16.png`,
//       "48": `../assets/icon-${response.theme}/${response.theme}_icon_48.png`,
//       "128": `../assets/icon-${response.theme}/${response.theme}_icon_128.png`,
//     }
//   });
// }

// async function ensureOffscreenDocument() {
//   const exists = await chrome.offscreen.hasDocument();
//   if (!exists) {
//     await chrome.offscreen.createDocument({
//       "url": 'ui/offscreen.html',
//       "reasons": ["BLOBS"],
//       "justification": "Detect color scheme and update the extension icon"
//     });
//   }
// }
