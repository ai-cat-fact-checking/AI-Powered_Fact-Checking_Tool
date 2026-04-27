import { ensureScriptInjected } from '../js/utils.js';
import { initCommentArea } from '../js/chat.js';

document.addEventListener('DOMContentLoaded', () => {
  // Debounce helper to prevent rapid repeated calls
  let updateTimeout = null;
  let isUpdating = false;

  function debounceUpdate(fn, delay = 300) {
    return function (...args) {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      updateTimeout = setTimeout(() => {
        fn.apply(this, args);
      }, delay);
    };
  }

  // DOM elements
  const elements = {
    loadingEl: document.getElementById('loading'),
    errorMessageEl: document.getElementById('error-message'),
    permissionPromptEl: document.getElementById('permission-prompt'),
    analysisResultsEl: document.getElementById('analysis-results'),
    domainValueEl: document.getElementById('domain-value'),
    domainVerifiedEl: document.getElementById('domain-verified'),
    domainUnverifiedEl: document.getElementById('domain-unverified'),
    domainUnknownEl: document.getElementById('domain-unknown'),
    domainOrgNameEl: document.getElementById('domain-org-name'),
    domainSummaryEl: document.getElementById('domain-summary'),
    domainDetailsEl: document.getElementById('domain-details'),
    domainDescriptionEl: document.getElementById('domain-description'),
    domainMetaEl: document.getElementById('domain-meta'),
    domainCategoryEl: document.getElementById('domain-category'),
    domainCountryEl: document.getElementById('domain-country'),
    domainStanceEl: document.getElementById('domain-stance'),
    domainCredibilityNotesEl: document.getElementById(
      'domain-credibility-notes'
    ),
    opinionsContainerEl: document.getElementById('opinions-container'),
    opinionFilterEl: document.getElementById('opinion-filters'),
    argumentsContainerEl: document.getElementById('arguments-container'),
    chineseTermsContainerEl: document.getElementById('chinese-terms-container'),
    popupAssessmentEl: document.getElementById('popup-assessment'),
    assessmentLevelTextEl: document.getElementById('assessment-level-text'),
    analysisSummaryStage1El: document.getElementById('analysis-summary-stage1'),
    editFormEl: document.getElementById('edit-form'),
    editOpinionsEl: document.getElementById('edit-opinions'),
    editArgumentsEl: document.getElementById('edit-arguments'),
    analyzeBtn: document.getElementById('analyze-btn'),
    modifyBtn: document.getElementById('modify-btn'),
    reAnalyzeBtn: document.getElementById('re-analyze-btn'),
    stage3AnalyzeBtn: document.getElementById('stage3-analyze-btn'),
    openReportBtn: document.getElementById('open-report-btn'),
    addOpinionBtn: document.getElementById('add-opinion-btn'),
    addArgumentBtn: document.getElementById('add-argument-btn'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    saveEditBtn: document.getElementById('save-edit-btn'),
    commentArea: document.getElementById('comment'),
    commentSection: document.getElementById('comment-section'),
    stage3ResultsEl: document.getElementById('stage3-results'),
    stage3SuspicionTagsContainer: document.getElementById(
      'stage3-suspicion-tags-container'
    ),
    analysisStepsEl: document.getElementById('analysis-steps'),
    finalClassificationEl: document.getElementById('final-classification'),
    detectedTagsContainer: document.getElementById('detected-tags-container'),
    analysisExplanationEl: document.getElementById('analysis-explanation'),
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
    // Function to position tooltip intelligently
    function positionTooltip() {
      const btnRect = infoBtn.getBoundingClientRect();
      const tooltipRect = infoTooltip.getBoundingClientRect();
      const containerRect = document
        .querySelector('.container')
        .getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Reset any previous positioning classes
      infoTooltip.classList.remove(
        'tooltip-left',
        'tooltip-bottom',
        'tooltip-top',
        'tooltip-fixed'
      );

      // Check if tooltip would be clipped by container
      const tooltipWouldBeClipped =
        btnRect.right + tooltipRect.width > containerRect.right ||
        btnRect.left - tooltipRect.width < containerRect.left ||
        btnRect.bottom + tooltipRect.height > containerRect.bottom ||
        btnRect.top - tooltipRect.height < containerRect.top;

      // If tooltip would be clipped by container, use fixed positioning
      if (tooltipWouldBeClipped) {
        infoTooltip.classList.add('tooltip-fixed');

        // Calculate optimal fixed position
        let left = btnRect.right + 10; // Default: right side
        let top = btnRect.top;

        // Adjust horizontal position if needed
        if (left + tooltipRect.width > viewportWidth) {
          left = btnRect.left - tooltipRect.width - 10; // Try left side
          if (left < 0) {
            left = Math.max(10, viewportWidth - tooltipRect.width - 10); // Center if both sides don't work
          }
        }

        // Adjust vertical position if needed
        if (top + tooltipRect.height > viewportHeight) {
          top = viewportHeight - tooltipRect.height - 10; // Move up
        }
        if (top < 0) {
          top = 10; // Move down
        }

        infoTooltip.style.left = left + 'px';
        infoTooltip.style.top = top + 'px';
        infoTooltip.style.right = 'auto';
        infoTooltip.style.bottom = 'auto';
        infoTooltip.style.transform = 'none';

        return;
      }

      // Check horizontal space for relative positioning
      const spaceOnRight = containerRect.right - btnRect.right;
      const spaceOnLeft = btnRect.left - containerRect.left;

      // Check vertical space
      const spaceOnBottom = containerRect.bottom - btnRect.bottom;
      const spaceOnTop = btnRect.top - containerRect.top;

      // Default positioning (right side)
      let positionClass = '';

      // If not enough space on right, try left
      if (spaceOnRight < tooltipRect.width + 10) {
        if (spaceOnLeft >= tooltipRect.width + 10) {
          positionClass = 'tooltip-left';
        }
      }

      // If not enough space on bottom, try top
      if (spaceOnBottom < tooltipRect.height + 10) {
        if (spaceOnTop >= tooltipRect.height + 10) {
          positionClass = positionClass
            ? positionClass + ' tooltip-top'
            : 'tooltip-top';
        } else {
          // If no vertical space, try centering horizontally
          positionClass = positionClass
            ? positionClass + ' tooltip-bottom'
            : 'tooltip-bottom';
        }
      }

      if (positionClass) {
        infoTooltip.classList.add(positionClass);
      }

      // Reset any fixed positioning styles
      infoTooltip.style.left = '';
      infoTooltip.style.top = '';
      infoTooltip.style.right = '';
      infoTooltip.style.bottom = '';
      infoTooltip.style.transform = '';
    }

    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasHidden = infoTooltip.classList.contains('hidden');

      // First toggle visibility
      infoTooltip.classList.toggle('hidden');

      // If showing tooltip, position it intelligently
      if (wasHidden) {
        // Use setTimeout to ensure tooltip is visible before calculating position
        setTimeout(positionTooltip, 1);
      }
    });

    infoTooltip.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => {
      if (!infoTooltip.classList.contains('hidden'))
        infoTooltip.classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') infoTooltip.classList.add('hidden');
    });

    // Reposition tooltip on window resize
    window.addEventListener('resize', () => {
      if (!infoTooltip.classList.contains('hidden')) {
        setTimeout(positionTooltip, 1);
      }
    });
  }

  let currentActiveTabId = null;
  let currentActiveTabUrl = null;
  let permissionGranted = false;

  let activeFilters = ['全部'];

  // Event listeners
  elements.analyzeBtn.addEventListener('click', async () => {
    let targetTabId = currentActiveTabId;

    if (!targetTabId) {
      await new Promise((resolve) => {
        window.argumentCheckLogic.getCurrentTabInfo((tab) => {
          if (tab && tab.id) {
            currentActiveTabId = tab.id;
            targetTabId = tab.id;
          }
          resolve();
        });
      });
    }

    if (!targetTabId) {
      alert(`請點擊瀏覽器工具列中的擴充功能圖示 icon 以授權分析此頁面。

或者，在頁面上按右鍵，點擊「真假 Meow 一下」。`);
      return;
    }

    const injected = await ensureScriptInjected(targetTabId);
    if (!injected) return;

    window.argumentCheckLogic.showLoading();
    try {
      await chrome.tabs.sendMessage(targetTabId, { action: 'analyze' });
    } catch (err) {
      console.error('Error sending analyze message:', err);
      window.argumentCheckLogic.showError('無法發送分析請求: ' + err.message);
      window.argumentCheckLogic.showPermissionPrompt();
    }
  });

  elements.modifyBtn.addEventListener('click', () => {
    if (window.argumentCheckLogic.getHasAnalysis()) {
      window.argumentCheckLogic.showEditForm();
    } else {
      window.argumentCheckLogic.showPermissionPrompt();
    }
  });

  elements.reAnalyzeBtn.addEventListener('click', async () => {
    const currentData = window.argumentCheckLogic.getCurrentAnalysisData();
    if (!currentData) {
      window.argumentCheckLogic.showError('請先執行基本分析才能進行進階分析');
      window.argumentCheckLogic.showPermissionPrompt();
      return;
    }

    if (!currentActiveTabId) {
      window.argumentCheckLogic.showError('無法確定目前分頁以進行進階分析');
      window.argumentCheckLogic.showPermissionPrompt();
      return;
    }

    const injected = await ensureScriptInjected(currentActiveTabId);
    if (!injected) return;

    const feedbackData = {
      arguments: (currentData.arguments || []).map((f) =>
        typeof f === 'string' ? { argument: f, sources: [] } : f
      ),
      opinions: currentData.opinions || []
    };

    window.argumentCheckLogic.showLoading();
    try {
      await chrome.tabs.sendMessage(currentActiveTabId, {
        action: 'reAnalyze',
        feedbackData
      });
    } catch (err) {
      console.error('Error sending reAnalyze message:', err);
      window.argumentCheckLogic.showError(
        '無法發送重新分析請求: ' + err.message
      );
      window.argumentCheckLogic.showAnalysisResults('sidepanel');
    }
  });

  // Stage 3 Analysis Event Handler
  elements.stage3AnalyzeBtn.addEventListener('click', async () => {
    const currentData = window.argumentCheckLogic.getCurrentAnalysisData();
    if (!currentData) {
      window.argumentCheckLogic.showError('請先執行基本分析才能進行疑美論分析');
      return;
    }

    if (!currentActiveTabId) {
      window.argumentCheckLogic.showError('無法確定目前分頁以進行疑美論分析');
      return;
    }

    // Stage 3 analysis only requires initial analysis results (arguments and opinions)
    if (!currentData || !currentData.domain) {
      window.argumentCheckLogic.showError('請先完成基本分析才能進行疑美論分析');
      return;
    }

    const injected = await ensureScriptInjected(currentActiveTabId);
    if (!injected) return;

    // Show loading state for stage 3
    showStage3Loading();

    try {
      await chrome.tabs.sendMessage(currentActiveTabId, {
        action: 'stage3Analyze',
        data: currentData
      });
    } catch (err) {
      console.error('Error sending stage3Analyze message:', err);
      window.argumentCheckLogic.showError(
        '無法發送疑美論分析請求: ' + err.message
      );
      hideStage3Loading();
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
    if (window.argumentCheckLogic.getHasAnalysis()) {
      window.argumentCheckLogic.showAnalysisResults('sidepanel');
    } else {
      window.argumentCheckLogic.showPermissionPrompt();
    }
  });

  elements.saveEditBtn.addEventListener('click', async () => {
    if (!currentActiveTabId) {
      window.argumentCheckLogic.showError('無法確定目前分頁以儲存並分析');
      window.argumentCheckLogic.showPermissionPrompt();
      return;
    }

    const injected = await ensureScriptInjected(currentActiveTabId);
    if (!injected) return;

    const editedData = window.argumentCheckLogic.collectEditedData();
    window.argumentCheckLogic.showLoading();

    try {
      await chrome.tabs.sendMessage(currentActiveTabId, {
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
      if (!window.argumentCheckLogic.getHasAnalysis()) {
        window.argumentCheckLogic.showPermissionPrompt();
      }
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
      }
    );
  });

  elements.opinionFilterEl.addEventListener('click', (e) => {
    const target = e.target;
    if (target.tagName !== 'BUTTON' || !target.hasAttribute('data-tag')) {
      return;
    }
    const selectedTag = target.getAttribute('data-tag');

    if (selectedTag === '全部') {
      // If "全部" is clicked, deactivate all others and show all opinions
      activeFilters = ['全部'];
      document
        .querySelectorAll('.filter-btn.opinion-options')
        .forEach((btn) => {
          btn.classList.toggle(
            'active',
            btn.getAttribute('data-tag') === '全部'
          );
        });
    } else {
      // Remove "全部" from active filters when a specific tag is selected
      const allIndex = activeFilters.indexOf('全部');
      if (allIndex > -1) {
        activeFilters.splice(allIndex, 1);
        document
          .querySelector('.filter-btn.opinion-options[data-tag="全部"]')
          .classList.remove('active');
      }

      // Toggle the selected tag
      const tagIndex = activeFilters.indexOf(selectedTag);
      if (tagIndex > -1) {
        activeFilters.splice(tagIndex, 1);
        target.classList.remove('active');
      } else {
        activeFilters.push(selectedTag);
        target.classList.add('active');
      }

      // If no filters are active, activate "全部"
      if (activeFilters.length === 0) {
        activeFilters = ['全部'];
        document
          .querySelector('.filter-btn.opinion-options[data-tag="全部"]')
          .classList.add('active');
      }
    }

    window.argumentCheckLogic.setTabTagFilters(activeFilters);

    chrome.tabs.sendMessage(
      currentActiveTabId,
      { action: 'getAnalysisResults' },
      (response) => {
        if (response && response.data) {
          // Pass showTags=true since filters are only shown after Stage 2
          window.argumentCheckLogic.renderOpinionsTree(
            response.data.opinions,
            true
          );
        }
      }
    );
  });

  // Message listener for analysis updates
  chrome.runtime.onMessage.addListener((message) => {
    if (currentActiveTabId === null) {
      window.argumentCheckLogic.getCurrentTabInfo(async (tab) => {
        if (tab && tab.id) {
          currentActiveTabId = tab.id;
          currentActiveTabUrl = tab.url;
        }
      });
    }
    // when we haven't granted the permission, tabId and currentActiveTabId
    // both are null, so it can pass the following check, and update the
    // permissionGranted state.
    if (message.tabId !== currentActiveTabId) return;

    if (message.action === 'analysisStarted') {
      window.argumentCheckLogic.showLoading();
    } else if (message.action === 'analysisFinished') {
      if (message.error) {
        window.argumentCheckLogic.showError('分析失敗: ' + message.error);
        // Check if this is an auth-related error (contains settings link or auth keywords)
        const isAuthError =
          message.error.includes('goto-settings-link') ||
          message.error.includes('驗證') ||
          message.error.includes('登入') ||
          message.error.includes('401');
        // Only show permission prompt for non-auth errors
        if (!isAuthError) {
          handleNoContentDisplay();
        }
      } else if (message.data) {
        window.argumentCheckLogic.getCurrentTabInfo((tab) => {
          if (tab && tab.id === currentActiveTabId) {
            window.argumentCheckLogic.setTabData(tab.url, tab.title, tab.id);
          }
          window.argumentCheckLogic.updateAnalysisUI(message.data, 'sidepanel');
        });
      } else {
        window.argumentCheckLogic.showError('未收到有效的分析結果');
        handleNoContentDisplay();
      }
    } else if (message.inform === 'permissionGranted') {
      permissionGranted = true;
      handleNoContentDisplay();
    }
  });

  function handleNoContentDisplay() {
    if (permissionGranted) {
      window.argumentCheckLogic.showAnalysisResults('sidepanel');
      initCommentArea(elements.commentArea);
    } else {
      window.argumentCheckLogic.showPermissionPrompt();
    }
  }

  // Tab management for the sidebar
  async function updateSidebarForCurrentTab() {
    if (isUpdating) {
      console.log('⏭️ [SIDEPANEL] Update already in progress, skipping...');
      return;
    }

    isUpdating = true;
    console.log('🔄 [SIDEPANEL] updateSidebarForCurrentTab called');

    window.argumentCheckLogic.getCurrentTabInfo(async (tab) => {
      console.log(
        '📋 [SIDEPANEL] Current tab info:',
        tab ? { id: tab.id, url: tab.url } : 'None'
      );

      if (tab && tab.id) {
        const previousTabId = currentActiveTabId;
        const previousTabUrl = currentActiveTabUrl;
        currentActiveTabId = tab.id;
        currentActiveTabUrl = tab.url;

        console.log('📋 [SIDEPANEL] Tab change check:', {
          previousTabId,
          currentTabId: currentActiveTabId,
          previousUrl: previousTabUrl,
          currentUrl: currentActiveTabUrl,
          isTabChange: previousTabId !== currentActiveTabId,
          isUrlChange: previousTabUrl !== currentActiveTabUrl
        });

        // Hide permission prompt and show comment section when authorized
        window.argumentCheckLogic.hidePermissionPrompt();
        if (elements.commentSection) {
          elements.commentSection.classList.remove('hidden');
        }

        if (
          previousTabId !== currentActiveTabId ||
          previousTabUrl !== currentActiveTabUrl
        ) {
          console.log('🔄 [SIDEPANEL] Tab/URL changed, fetching analysis...');
          await window.argumentCheckLogic.fetchAnalysisForTab(
            currentActiveTabId,
            'sidepanel'
          );
        } else {
          console.log('📋 [SIDEPANEL] Same tab, checking existing analysis...');
          const analysisData =
            window.argumentCheckLogic.getCurrentAnalysisData();
          if (analysisData) {
            console.log('✅ [SIDEPANEL] Using existing analysis data');
            window.argumentCheckLogic.showAnalysisResults('sidepanel');
          } else if (
            !document.getElementById('loading').classList.contains('hidden')
          ) {
            console.log(
              '⏳ [SIDEPANEL] Still loading, showing permission prompt'
            );
            window.argumentCheckLogic.showPermissionPrompt();
          }
        }
        // Always reinitialize comment area when tab changes to ensure fresh data
        console.log(
          '🔄 [SIDEPANEL] Reinitializing comment area for tab change with URL:',
          currentActiveTabUrl
        );
        initCommentArea(elements.commentArea, currentActiveTabUrl);
      } else {
        // No valid tab found - show permission prompt and hide comment section
        console.log('❌ [SIDEPANEL] No suitable active tab found.');
        currentActiveTabId = null;
        // Show a specific message about needing to authorize the page
        elements.loadingEl?.classList.add('hidden');
        elements.analysisResultsEl?.classList.add('hidden');
        elements.editFormEl?.classList.add('hidden');
        elements.stage3ResultsEl?.classList.add('hidden');

        // Hide comment section when not authorized
        if (elements.commentSection) {
          elements.commentSection.classList.add('hidden');
        }

        window.argumentCheckLogic.showPermissionPrompt();
      }

      isUpdating = false;
    });
  }

  // Initialize sidebar
  updateSidebarForCurrentTab();

  // Accordion initialization
  initAccordions();

  // Comment it because it would trigger `updateSidebarForCurrentTab` whenever
  // the window is focused or changed, and it would be redundant, we only need
  // to update when the tab is activated or updated.
  // Event listeners for tab/window changes
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      chrome.windows.get(windowId, { populate: true }, (windowInfo) => {
        if (windowInfo && windowInfo.type === 'normal') {
          updateSidebarForCurrentTab();
        }
      });
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.windows.getCurrent(async (windowInfo) => {
      if (windowInfo && windowInfo.id === activeInfo.windowId) {
        debouncedUpdate();
      }
    });
  });

  // Debounced version of updateSidebarForCurrentTab
  const debouncedUpdate = debounceUpdate(updateSidebarForCurrentTab, 500);

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only react to complete status to avoid duplicate updates
    if (
      tabId === currentActiveTabId &&
      tab.url &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('https://chromewebstore.google.com/') &&
      changeInfo.status === 'complete'
    ) {
      console.log('🔄 [SIDEPANEL] Tab updated:', {
        tabId,
        status: changeInfo.status,
        url: tab.url
      });
      debouncedUpdate();
    }
  });

  // Stage 3 Analysis UI Functions
  function initAccordions() {
    const sections = document.querySelectorAll('.accordion-section');
    chrome.storage.local.get(['accordionStates'], (res) => {
      const saved = res.accordionStates || {};
      sections.forEach((sec) => {
        const key = sec.getAttribute('data-section');
        const headerBtn = sec.querySelector(
          '.accordion-header .accordion-toggle'
        );
        if (!headerBtn) return;
        const isCollapsed =
          saved[key] === false ? false : saved[key] === true ? true : false; // default expanded
        if (isCollapsed) {
          sec.classList.add('collapsed');
          headerBtn.setAttribute('aria-expanded', 'false');
        } else {
          headerBtn.setAttribute('aria-expanded', 'true');
        }
        headerBtn.addEventListener('click', () => toggleAccordion(sec, key));
      });
    });
  }

  function toggleAccordion(sectionEl, key) {
    const headerBtn = sectionEl.querySelector(
      '.accordion-header .accordion-toggle'
    );
    const willCollapse = !sectionEl.classList.contains('collapsed');
    sectionEl.classList.toggle('collapsed', willCollapse);
    headerBtn.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
    chrome.storage.local.get(['accordionStates'], (res) => {
      const next = { ...(res.accordionStates || {}), [key]: willCollapse };
      chrome.storage.local.set({ accordionStates: next });
    });
  }
  function showStage3Loading() {
    if (!elements.stage3ResultsEl) return;
    elements.stage3ResultsEl.classList.remove('hidden');
    elements.stage3ResultsEl.style.display = 'block';
    // Ensure section expanded when loading
    elements.stage3ResultsEl.classList.remove('collapsed');
    const toggleBtn = elements.stage3ResultsEl.querySelector(
      '.accordion-header .accordion-toggle'
    );
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    const content =
      elements.stage3ResultsEl.querySelector('.accordion-content');
    if (content) {
      // If already has dynamic children, don't wipe them—insert or replace a loading placeholder at top
      let loading = content.querySelector('.stage3-loading');
      if (!loading) {
        loading = document.createElement('div');
        loading.className = 'stage3-loading';
        content.prepend(loading);
      }
      loading.innerHTML = `
        <div class="spinner" style="margin-right:8px;"></div>
        <span>正在進行疑美論分析...</span>
      `;

      // Keep late blocks hidden during loading
      content
        .querySelectorAll('.stage3-late-block')
        .forEach((b) => b.classList.add('hidden'));
    }
  }

  function hideStage3Loading() {
    console.log(
      '🔄 [SIDEPANEL] hideStage3Loading called - should only hide loading, not results'
    );
    // Don't hide the entire stage3ResultsEl here!
    // Only clear the loading content if it exists
    if (!elements.stage3ResultsEl) return;
    const loadingContent =
      elements.stage3ResultsEl.querySelector('.stage3-loading');
    if (loadingContent) {
      loadingContent.remove();
      console.log(
        '✅ [SIDEPANEL] Removed loading content from Stage 3 results'
      );
    }
  }

  // Tag descriptions mapping for tooltips
  function getTagDescription(tag) {
    const tagDescriptions = {
      // 疑美論標籤
      棄子論: '美國把台灣當作棋子，最終會拋棄台灣',
      衰弱論: '美國實力衰弱，無法保護台灣',
      亂源論: '美國是世界戰亂的根源',
      假朋友: '美國宣稱支持台灣卻無實質幫助，反而讓台灣受害',
      共謀論: '美國和台灣菁英共謀，剝削台灣人民',
      假民主: '美國內部腐敗、美國的民主是假民主',
      反世界: '美國霸權遭受世界各國與美國人民反對',
      毀台論: '美國把台灣變成戰場，導致毀滅',

      // 資訊操作相關標籤
      資訊操作: '可能包含不實或誤導性資訊，意圖影響民眾對特定議題的認知',
      '來源:中國': '資訊來源來自中國，需要特別留意其立場與動機',
      事實有誤: '文章中包含與事實不符的內容或錯誤資訊',
      事實不完整: '文章只呈現部分事實，缺乏完整脈絡',

      // 謬誤類型
      '謬誤:滑坡': '錯誤推論某事會導致一連串負面後果，缺乏足夠證據支持',
      '謬誤:假兩難': '將複雜問題簡化為只有兩種選擇，忽略其他可能性',
      '謬誤:偷換概念': '故意混淆不同概念或改變討論焦點',
      '謬誤:不當類比': '用不適當的類比來支持論點，兩者間缺乏足夠相似性',

      // 其他標籤
      情緒化: '包含強烈個人情緒字眼，可能影響理性判斷',
      非判斷對象: '不符合疑美論分析的判斷條件'
    };

    return tagDescriptions[tag] || '相關標籤說明';
  }

  function renderStage3Results(stage3Data) {
    console.log('🎨 [SIDEPANEL] Starting Stage 3 results rendering');
    console.log('📊 [SIDEPANEL] Stage 3 data received:', stage3Data);

    // First, clear any loading content
    hideStage3Loading();

    console.log('🔍 [SIDEPANEL] Data structure analysis:', {
      hasData: !!stage3Data,
      dataKeys: stage3Data ? Object.keys(stage3Data) : [],
      hasClassification: !!stage3Data?.classification,
      hasTags: !!stage3Data?.tags,
      hasAnalysisSteps: !!stage3Data?.analysis_steps,
      hasReasoning: !!stage3Data?.reasoning,
      // Old format checks
      hasAnalysisPath: !!stage3Data?.analysis_path,
      hasFinalTags: !!stage3Data?.final_tags
    });

    // Check if elements exist
    console.log('🔍 [SIDEPANEL] Element check:', {
      stage3ResultsEl: !!elements.stage3ResultsEl,
      stage3SuspicionTagsContainer: !!elements.stage3SuspicionTagsContainer,
      analysisStepsEl: !!elements.analysisStepsEl,
      finalClassificationEl: !!elements.finalClassificationEl,
      detectedTagsContainer: !!elements.detectedTagsContainer,
      analysisExplanationEl: !!elements.analysisExplanationEl,
      analysisResultsEl: !!elements.analysisResultsEl
    });

    // Check if the main analysis results container is visible
    if (
      elements.analysisResultsEl &&
      elements.analysisResultsEl.classList.contains('hidden')
    ) {
      console.log(
        '⚠️ [SIDEPANEL] Main analysis results container is hidden, showing it first'
      );
      elements.analysisResultsEl.classList.remove('hidden');
      elements.analysisResultsEl.style.display = 'block';
    }

    console.log('👁️ [SIDEPANEL] Main analysis container visibility:', {
      hasHiddenClass: elements.analysisResultsEl?.classList.contains('hidden'),
      displayStyle: elements.analysisResultsEl?.style.display,
      computedDisplay: elements.analysisResultsEl
        ? window.getComputedStyle(elements.analysisResultsEl).display
        : 'N/A'
    });

    if (!elements.stage3ResultsEl || !stage3Data) {
      console.error('❌ [SIDEPANEL] Missing stage3ResultsEl or stage3Data');
      console.error('stage3ResultsEl:', elements.stage3ResultsEl);
      console.error('stage3Data:', stage3Data);
      return;
    }

    console.log(
      '👁️ [SIDEPANEL] Before showing stage3ResultsEl - current classList:',
      elements.stage3ResultsEl.classList.toString()
    );
    elements.stage3ResultsEl.classList.remove('hidden');
    // Force display with style attribute to override any CSS issues
    elements.stage3ResultsEl.style.display = 'block';
    console.log(
      '👁️ [SIDEPANEL] After showing stage3ResultsEl - current classList:',
      elements.stage3ResultsEl.classList.toString()
    );

    // Use existing accordion content structure; just query needed nodes
    const stage3SuspicionTagsContainer = elements.stage3ResultsEl.querySelector(
      '#stage3-suspicion-tags-container'
    );
    const analysisStepsEl =
      elements.stage3ResultsEl.querySelector('#analysis-steps');
    const finalClassificationEl = elements.stage3ResultsEl.querySelector(
      '#final-classification'
    );
    const detectedTagsContainer = elements.stage3ResultsEl.querySelector(
      '#detected-tags-container'
    );
    const analysisExplanationEl = elements.stage3ResultsEl.querySelector(
      '#analysis-explanation'
    );
    console.log('🔄 [SIDEPANEL] Using existing Stage 3 accordion content');

    // Stage 3 results are now near the top, no need to scroll far
    // Just ensure it's visible if needed
    setTimeout(() => {
      if (elements.stage3ResultsEl.getBoundingClientRect().top < 0) {
        elements.stage3ResultsEl.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        console.log('📍 [SIDEPANEL] Scrolled to Stage 3 results section');
      }
    }, 100);

    // Update suspicion tags - show the 8 types of anti-US sentiment tags
    if (stage3SuspicionTagsContainer) {
      console.log('🏷️ [SIDEPANEL] Rendering suspicion tags');

      // Define the 8 types of anti-US sentiment tags
      const suspicionTagTypes = [
        {
          key: '棄子論',
          name: '棄子論',
          description: '美國把台灣當作棋子，最終會拋棄台灣'
        },
        {
          key: '衰弱論',
          name: '衰弱論',
          description: '美國實力衰弱，無法保護台灣'
        },
        { key: '亂源論', name: '亂源論', description: '美國是世界戰亂的根源' },
        {
          key: '假朋友',
          name: '假朋友',
          description: '美國宣稱支持台灣卻無實質幫助，反而讓台灣受害'
        },
        {
          key: '共謀論',
          name: '共謀論',
          description: '美國和台灣菁英共謀，剝削台灣人民'
        },
        {
          key: '假民主',
          name: '假民主',
          description: '美國內部腐敗、美國的民主是假民主'
        },
        {
          key: '反世界',
          name: '反世界',
          description: '美國霸權遭受世界各國與美國人民反對'
        },
        {
          key: '毀台論',
          name: '毀台論',
          description: '美國把台灣變成戰場，導致毀滅'
        }
      ];

      // Check which tags are detected in the analysis
      const detectedSuspicionTags = [];
      if (stage3Data.tags && Array.isArray(stage3Data.tags)) {
        suspicionTagTypes.forEach((tagType) => {
          const isDetected = stage3Data.tags.some(
            (tag) => tag.includes(tagType.key) || tag === tagType.key
          );
          if (isDetected) {
            detectedSuspicionTags.push(tagType);
          }
        });
      }

      // Render suspicion tags
      if (detectedSuspicionTags.length > 0) {
        const tagsHtml = detectedSuspicionTags
          .map(
            (tag) => `
          <div class="suspicion-tag detected" data-tooltip="${tag.description}">
            <span class="tag-name">${tag.name}</span>
            <span class="tag-status">✓</span>
          </div>
        `
          )
          .join('');

        stage3SuspicionTagsContainer.innerHTML = `
          <div class="suspicion-tags-header">偵測到的疑美論標籤：</div>
          <div class="suspicion-tags-list">${tagsHtml}</div>
        `;
      } else {
        stage3SuspicionTagsContainer.innerHTML = `
          <div class="suspicion-tags-header">未偵測到疑美論標籤</div>
          <div class="no-suspicion-tags">此文章未符合已知的疑美論論述模式</div>
        `;
      }
    }

    // Render analysis steps - adapt to new format
    if (analysisStepsEl) {
      console.log('🔄 [SIDEPANEL] Rendering analysis steps');

      let stepsHtml = '';

      if (stage3Data.analysis_steps) {
        // New format - convert to display format
        console.log('📋 [SIDEPANEL] Using new analysis_steps format');

        const steps = [];
        if (stage3Data.analysis_steps.step1_taiwan_relation) {
          steps.push({
            question: '檢查台美關係相關內容',
            result: stage3Data.analysis_steps.step1_taiwan_relation.detected,
            evidence: stage3Data.analysis_steps.step1_taiwan_relation.evidence
          });
        }

        if (stage3Data.analysis_steps.step2_sentiment) {
          steps.push({
            question: '檢查負面情緒傾向',
            result: stage3Data.analysis_steps.step2_sentiment.negative_detected,
            evidence: stage3Data.analysis_steps.step2_sentiment.evidence
          });
        }

        stepsHtml = steps
          .map(
            (step) => `
          <div class="analysis-step ${step.result ? 'completed' : 'failed'}">
            <span class="step-icon">${step.result ? '✓' : '✗'}</span>
            <span class="step-text">${step.question}</span>
            <span class="step-result">${step.result ? '是' : '否'}</span>
            ${
              step.evidence && step.evidence.length > 0
                ? `<div class="step-evidence">
                 <div class="evidence-label">證據:</div>
                 <ul class="evidence-list">
                   ${step.evidence.map((item) => `<li>${item}</li>`).join('')}
                 </ul>
               </div>`
                : ''
            }
          </div>
        `
          )
          .join('');
      } else if (stage3Data.analysis_path) {
        // Old format
        console.log('📋 [SIDEPANEL] Using old analysis_path format');
        stepsHtml = stage3Data.analysis_path
          .map(
            (step) => `
          <div class="analysis-step ${step.result ? 'completed' : 'failed'}">
            <span class="step-icon">${step.result ? '✓' : '✗'}</span>
            <span class="step-text">${escapeHtml(step.question)}</span>
            <span class="step-result">${step.result ? '是' : '否'}</span>
          </div>
        `
          )
          .join('');
      }

      analysisStepsEl.innerHTML = stepsHtml;
      console.log('✅ [SIDEPANEL] Analysis steps rendered');
    }

    // Render final classification - adapt to new format
    if (finalClassificationEl) {
      console.log('🏷️ [SIDEPANEL] Rendering final classification');

      let classificationHtml = '';

      if (stage3Data.classification) {
        // New format
        console.log(
          '🆕 [SIDEPANEL] Using new classification format:',
          stage3Data.classification
        );
        const riskLevel = getRiskLevel(stage3Data.classification);
        classificationHtml = `
          <div class="classification-tag ${riskLevel}">
            ${escapeHtml(stage3Data.classification)}
          </div>
        `;

        if (stage3Data.tags && stage3Data.tags.length > 0) {
          classificationHtml += `
            <div class="additional-tags">
              ${stage3Data.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          `;
        }
      } else if (stage3Data.final_tags) {
        // Old format
        console.log('📜 [SIDEPANEL] Using old final_tags format');
        const mainTag = stage3Data.final_tags.find(
          (tag) => tag.category === 'main_classification'
        );
        if (mainTag) {
          const riskLevel = getRiskLevel(mainTag.tag);
          classificationHtml = `
            <div class="classification-tag ${riskLevel}">
              ${escapeHtml(mainTag.tag)}
            </div>
          `;

          // Add additional tags for old format
          const additionalTags = stage3Data.final_tags.filter(
            (tag) => tag.category !== 'main_classification'
          );
          if (additionalTags.length > 0) {
            classificationHtml += `
              <div class="additional-tags">
                ${additionalTags.map((tag) => `<span class="tag">${escapeHtml(tag.tag)}</span>`).join('')}
              </div>
            `;
          }
        }
      }

      finalClassificationEl.innerHTML = classificationHtml;
      console.log('✅ [SIDEPANEL] Final classification rendered');
    }

    // Render detected tags - adapt to new format
    if (detectedTagsContainer) {
      console.log('🏷️ [SIDEPANEL] Rendering detected tags');

      let tagsHtml = '';

      if (stage3Data.tags) {
        // New format - just display tags with tooltips
        tagsHtml = stage3Data.tags
          .map(
            (tag) => `
          <div class="detected-tag ${getTagCategory(tag)}" data-tooltip="${getTagDescription(tag)}">
            ${tag}
          </div>
        `
          )
          .join('');
      } else if (stage3Data.final_tags) {
        // Old format with tooltips
        tagsHtml = stage3Data.final_tags
          .filter((tag) => tag.category !== 'main_classification')
          .map(
            (tag) => `
            <div class="detected-tag ${getTagCategory(tag.tag)}" 
                 data-tooltip="${getTagDescription(tag.tag)}" 
                 title="${tag.matched_keywords?.join(', ') || ''}">
              ${tag.tag}
            </div>
          `
          )
          .join('');
      }

      detectedTagsContainer.innerHTML = tagsHtml;
      console.log('✅ [SIDEPANEL] Detected tags rendered');
    }

    // Render explanation - adapt to new format and convert markdown to HTML
    if (analysisExplanationEl) {
      console.log(
        '💬 [SIDEPANEL] Rendering explanation with markdown conversion'
      );

      let explanation = '分析完成。';

      if (stage3Data.reasoning) {
        // New format
        explanation = stage3Data.reasoning;
      } else if (stage3Data.summary && stage3Data.summary.explanation) {
        // Old format
        explanation = stage3Data.summary.explanation;
      }

      // Convert markdown to HTML
      const htmlExplanation = convertMarkdownToHTML(explanation);
      analysisExplanationEl.innerHTML = htmlExplanation;
      console.log(
        '✅ [SIDEPANEL] Explanation rendered with markdown conversion'
      );
    }

    // Unhide late blocks now that data rendered
    elements.stage3ResultsEl
      .querySelectorAll('.stage3-late-block')
      .forEach((b) => b.classList.remove('hidden'));

    console.log(
      '🎉 [SIDEPANEL] Stage 3 results rendering completed successfully'
    );
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function convertMarkdownToHTML(text) {
    if (!text) return '';

    // Escape first so LLM output can't inject raw HTML/script tags,
    // then apply allow-listed markdown transforms.
    return (
      escapeHtml(text)
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        // Code
        .replace(/`(.*?)`/g, '<code>$1</code>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        // Wrap in paragraph
        .replace(/^(.*)$/, '<p>$1</p>')
        // Clean up empty paragraphs
        .replace(/<p><\/p>/g, '')
    );
  }

  function getRiskLevel(classification) {
    if (
      classification.includes('資訊操作') ||
      classification.includes('高風險')
    ) {
      return 'high-risk';
    } else if (
      classification.includes('疑慮') ||
      classification.includes('中風險')
    ) {
      return 'medium-risk';
    } else if (classification.includes('非判斷對象')) {
      return 'not-applicable';
    } else {
      return 'low-risk';
    }
  }

  function getTagCategory(tag) {
    if (tag.includes('來源')) return 'source';
    if (tag.includes('事實')) return 'fact';
    if (tag.includes('謬誤')) return 'fallacy';
    if (tag.includes('論') || tag.includes('分類')) return 'category';
    if (tag.includes('情緒')) return 'emotional';
    return 'category';
  }

  // Listen for stage 3 analysis results
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📡 [SIDEPANEL] Received message:', {
      action: message.action,
      tabId: message.tabId,
      currentActiveTabId: currentActiveTabId,
      hasData: !!message.data,
      hasError: !!message.error
    });

    // Check if this message is for the current active tab
    if (
      message.tabId &&
      currentActiveTabId &&
      message.tabId !== currentActiveTabId
    ) {
      console.log('⏭️ [SIDEPANEL] Ignoring message for different tab');
      return;
    }

    if (message.action === 'stage3AnalysisCompleted') {
      console.log(
        '✅ [SIDEPANEL] Received Stage 3 completion with data:',
        message.data
      );
      renderStage3Results(message.data);
      sendResponse({ received: true });
    } else if (message.action === 'stage3AnalysisError') {
      console.log('❌ [SIDEPANEL] Received Stage 3 error:', message.error);
      hideStage3Loading();
      window.argumentCheckLogic.showError(message.error || '疑美論分析失敗');
      sendResponse({ received: true });
    }
  });
});
