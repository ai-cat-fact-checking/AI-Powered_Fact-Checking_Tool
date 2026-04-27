import { ensureScriptInjected } from '../js/utils.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const elements = {
    loadingEl: document.getElementById('loading'),
    errorMessageEl: document.getElementById('error-message'),
    analysisResultsEl: document.getElementById('analysis-results'),
    domainValueEl: document.getElementById('domain-value'),
    domainVerifiedEl: document.getElementById('domain-verified'),
    domainUnverifiedEl: document.getElementById('domain-unverified'),
    domainUnknownEl: document.getElementById('domain-unknown'),
    domainOrgNameEl: document.getElementById('domain-org-name'),
    domainSummaryEl: document.getElementById('domain-summary'),
    opinionsContainerEl: document.getElementById('opinions-container'),
    argumentsContainerEl: document.getElementById('arguments-container'),
    chineseTermsContainerEl: document.getElementById('chinese-terms-container'),
    popupAssessmentEl: document.getElementById('popup-assessment'),
    assessmentLevelTextEl: document.getElementById('assessment-level-text'),
    editFormEl: document.getElementById('edit-form'),
    editOpinionsEl: document.getElementById('edit-opinions'),
    editArgumentsEl: document.getElementById('edit-arguments'),
    analyzeBtn: document.getElementById('analyze-btn'),
    modifyBtn: document.getElementById('modify-btn'),
    reAnalyzeBtn: document.getElementById('re-analyze-btn'),
    openReportBtn: document.getElementById('open-report-btn'),
    addOpinionBtn: document.getElementById('add-opinion-btn'),
    addArgumentBtn: document.getElementById('add-argument-btn'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    saveEditBtn: document.getElementById('save-edit-btn'),
    openSidebarBtn: document.getElementById('open-sidebar-btn'),
    openSettingsBtn: document.getElementById('open-settings-btn')
  };

  // Pass elements to shared logic
  window.argumentCheckLogic.setElements(elements);

  // Open settings page button
  if (elements.openSettingsBtn) {
    elements.openSettingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Info tooltip for "中國用語"
  const infoBtn = document.getElementById('chinese-terms-info-btn');
  const infoTooltip = document.getElementById('chinese-terms-tooltip');
  if (infoBtn && infoTooltip) {
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      infoTooltip.classList.toggle('hidden');
    });
    infoTooltip.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => {
      if (!infoTooltip.classList.contains('hidden'))
        infoTooltip.classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') infoTooltip.classList.add('hidden');
    });
  }

  let currentTabId = null;

  // --- Event Listeners ---
  elements.analyzeBtn.addEventListener('click', async () => {
    window.argumentCheckLogic.getCurrentTabInfo(async (tab) => {
      if (!tab || !tab.id) {
        window.argumentCheckLogic.showError('無法取得目前頁面');
        return;
      }

      currentTabId = tab.id;
      const injected = await ensureScriptInjected(currentTabId);
      if (!injected) return;

      window.argumentCheckLogic.showLoading();

      try {
        await chrome.tabs.sendMessage(currentTabId, { action: 'analyze' });
      } catch (err) {
        console.error('Error sending analyze message:', err);
        window.argumentCheckLogic.showError('無法發送分析請求: ' + err.message);
        window.argumentCheckLogic.updateAnalysisUI(null, 'popup');
      }
    });
  });

  elements.modifyBtn.addEventListener('click', () => {
    if (window.argumentCheckLogic.getHasAnalysis()) {
      window.argumentCheckLogic.showEditForm();
    } else {
      window.argumentCheckLogic.showError('請先執行分析才能修改');
    }
  });

  elements.reAnalyzeBtn.addEventListener('click', async () => {
    const currentData = window.argumentCheckLogic.getCurrentAnalysisData();
    if (!currentData) {
      window.argumentCheckLogic.showError('請先執行基本分析才能進行進階分析');
      return;
    }

    if (!currentTabId) {
      window.argumentCheckLogic.showError('無法確定目前分頁以進行進階分析');
      return;
    }

    const injected = await ensureScriptInjected(currentTabId);
    if (!injected) return;

    const feedbackData = {
      arguments: (currentData.arguments || []).map((f) =>
        typeof f === 'string' ? { argument: f, sources: [] } : f
      ),
      opinions: currentData.opinions || []
    };

    window.argumentCheckLogic.showLoading();

    try {
      await chrome.tabs.sendMessage(currentTabId, {
        action: 'reAnalyze',
        feedbackData
      });
    } catch (err) {
      console.error('Error sending reAnalyze message:', err);
      window.argumentCheckLogic.showError(
        '無法發送重新分析請求: ' + err.message
      );
      window.argumentCheckLogic.showAnalysisResults('popup');
    }
  });

  elements.addOpinionBtn.addEventListener('click', () => {
    const index = elements.editOpinionsEl.children.length;
    const opinionEl = window.argumentCheckLogic.createOpinionEditItem(
      { opinion: '', related_arguments: [] },
      index
    );
    elements.editOpinionsEl.appendChild(opinionEl);
  });

  elements.addArgumentBtn.addEventListener('click', () => {
    const index = elements.editArgumentsEl.children.length;
    const argumentEl = window.argumentCheckLogic.createArgumentEditItem(
      { argument: '', sources: [] },
      index
    );
    elements.editArgumentsEl.appendChild(argumentEl);
  });

  elements.cancelEditBtn.addEventListener('click', () => {
    window.argumentCheckLogic.showAnalysisResults('popup');
  });

  elements.saveEditBtn.addEventListener('click', async () => {
    if (!currentTabId) {
      window.argumentCheckLogic.showError('無法確定目前分頁以儲存並分析');
      return;
    }

    const injected = await ensureScriptInjected(currentTabId);
    if (!injected) return;

    const editedData = window.argumentCheckLogic.collectEditedData();
    window.argumentCheckLogic.showLoading();

    try {
      await chrome.tabs.sendMessage(currentTabId, {
        action: 'reAnalyze',
        feedbackData: editedData
      });
    } catch (err) {
      console.error('Error sending save/reAnalyze message:', err);
      window.argumentCheckLogic.showError('無法發送儲存請求: ' + err.message);
      window.argumentCheckLogic.showEditForm();
    }
  });

  elements.openReportBtn.addEventListener('click', () => {
    const analysisData = window.argumentCheckLogic.getCurrentAnalysisData();
    const tabData = window.argumentCheckLogic.getTabData();
    if (!analysisData || !tabData.url) {
      window.argumentCheckLogic.showError('沒有分析資料可供報告');
      return;
    }

    chrome.storage.local.set(
      {
        analysisData: analysisData,
        currentURL: tabData.url,
        currentTitle: tabData.title
      },
      () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('../ui/report.html') });
        window.close();
      }
    );
  });

  elements.openSidebarBtn.addEventListener('click', async () => {
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    window.close();
  });

  // Message listener for analysis updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.tabId !== currentTabId) return;

    if (message.action === 'analysisStarted') {
      window.argumentCheckLogic.showLoading();
    } else if (message.action === 'analysisFinished') {
      if (message.error) {
        window.argumentCheckLogic.showError('分析失敗: ' + message.error);
        window.argumentCheckLogic.updateAnalysisUI(null, 'popup');
      } else if (message.data) {
        window.argumentCheckLogic.getCurrentTabInfo((tab) => {
          if (tab && tab.id === currentTabId) {
            window.argumentCheckLogic.setTabData(tab.url, tab.title, tab.id);
          }
          window.argumentCheckLogic.updateAnalysisUI(message.data, 'popup');
        });
      } else {
        window.argumentCheckLogic.showError('未收到有效的分析結果');
        window.argumentCheckLogic.updateAnalysisUI(null, 'popup');
      }
    }
  });

  // Initial load
  async function initializePopup() {
    window.argumentCheckLogic.getCurrentTabInfo(async (tab) => {
      if (
        !tab ||
        !tab.id ||
        !tab.url ||
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('https://chromewebstore.google.com/')
      ) {
        window.argumentCheckLogic.showError(
          '無法在此頁面使用，請嘗試一般網頁。'
        );
        elements.analyzeBtn.disabled = true;
        window.argumentCheckLogic.updateAnalysisUI(null, 'popup');
        return;
      }

      currentTabId = tab.id;
      elements.analyzeBtn.disabled = false;

      try {
        window.argumentCheckLogic.showLoading();
        const injected = await ensureScriptInjected(currentTabId);
        if (!injected) {
          window.argumentCheckLogic.updateAnalysisUI(null, 'popup');
          return;
        }

        const response = await chrome.tabs.sendMessage(currentTabId, {
          action: 'getAnalysisResults'
        });
        if (response && response.data) {
          console.log('Found existing analysis for tab', currentTabId);
          window.argumentCheckLogic.setTabData(tab.url, tab.title, tab.id);
          window.argumentCheckLogic.updateAnalysisUI(response.data, 'popup');
        } else {
          console.log('No existing analysis found for tab', currentTabId);
          window.argumentCheckLogic.updateAnalysisUI(null, 'popup');
        }
      } catch (error) {
        console.log('Error during initial load:', error.message);
        window.argumentCheckLogic.updateAnalysisUI(null, 'popup');
      }
    });
  }

  // Start initialization
  initializePopup();
});
