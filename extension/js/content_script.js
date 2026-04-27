/* global Readability */
(() => {
  // Prevent multiple injections
  if (window.hasArgumentChecked) return;
  window.hasArgumentChecked = true;

  // State management
  let currentAnalysis = {
    arguments: [],
    opinions: [],
    chinese_terms: [],
    verified_domain: false,
    domain: ''
  };

  const highlightedElements = {
    arguments: {},
    opinions: {},
    chinese_terms: {}
  };

  // Store highlight data for re-application after DOM re-renders (for React-based sites like Yahoo)
  let highlightDataStore = {
    arguments: [], // [{text: "...", data: {...}}, ...]
    opinions: [],
    chinese_terms: []
  };

  let myTabId = null;
  let isAnalyzing = false; // Track if analysis is in progress
  let tooltipHideTimer = null;
  const HIDE_DELAY = 300; // milliseconds

  // Helper functions for persistent analyzing state using chrome.storage.local
  const currentUrl = window.location.href;

  async function setAnalyzingState(analyzing) {
    isAnalyzing = analyzing;
    try {
      const storageKey = `analyzing_${currentUrl}`;
      if (analyzing) {
        await chrome.storage.local.set({ [storageKey]: Date.now() });
      } else {
        await chrome.storage.local.remove(storageKey);
      }
    } catch (err) {
      console.warn('Failed to persist analyzing state:', err);
    }
  }

  async function getAnalyzingState() {
    try {
      const storageKey = `analyzing_${currentUrl}`;
      const result = await chrome.storage.local.get(storageKey);
      const timestamp = result[storageKey];
      // Consider stale if older than 5 minutes
      if (timestamp && Date.now() - timestamp < 5 * 60 * 1000) {
        return true;
      }
      // Clean up stale entry
      if (timestamp) {
        await chrome.storage.local.remove(storageKey);
      }
      return false;
    } catch (err) {
      console.warn('Failed to get analyzing state:', err);
      return isAnalyzing;
    }
  }

  // MutationObserver for detecting DOM re-renders
  let domObserver = null;
  let reapplyDebounceTimer = null;
  const REAPPLY_DEBOUNCE_MS = 150;

  // Error code to message mapping
  const ERROR_MESSAGES = {
    API_KEY_INVALID:
      'API Key 無效，請至設定頁面重新設定您的 Gemini API Key <a href="#" id="goto-settings-link" style="color: #1976d2; text-decoration: underline; cursor: pointer;">前往設定頁面</a>',
    'API key decryption failed':
      'API Key 解密失敗，請至設定頁面重新設定您的 API Key <a href="#" id="goto-settings-link" style="color: #1976d2; text-decoration: underline; cursor: pointer;">前往設定頁面</a>',
    RESOURCE_EXHAUSTED: 'API 配額已用盡，請稍後再試或檢查您的 API Key 配額',
    RATE_LIMIT: '請求過於頻繁，請稍後再試',
    PERMISSION_DENIED: 'API Key 權限不足，請確認您的 API Key 已啟用 Gemini API',
    NETWORK_ERROR: '網路連線錯誤，請檢查您的網路連線',
    ANALYSIS_FAILED: '分析服務發生錯誤，請稍後再試',
    UNKNOWN_ERROR: '分析服務發生錯誤，請稍後再試'
  };

  // Helper function to get user-friendly error message from error code
  function getErrorMessage(errorCode) {
    return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES['UNKNOWN_ERROR'];
  }

  // Content extraction functions
  function extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      console.error('Error extracting domain:', e);
      return '';
    }
  }

  // Get authentication token from Google OAuth
  async function getAuthToken() {
    try {
      // Send message to background script to get the Google OAuth token
      const response = await chrome.runtime.sendMessage({
        action: 'getGoogleAuthToken'
      });
      return response?.token || null;
    } catch (error) {
      console.warn('Failed to get Google auth token:', error);
      return null;
    }
  }

  function getArticleContent() {
    try {
      const documentClone = document.cloneNode(true);
      console.log('[CONTENT] Document clone:', documentClone);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      return `Title: ${article.title}\n\nAuthor: ${article.byline}\n\nSiteName: ${article.siteName}\n\nContent: ${article.textContent}`;
    } catch (e) {
      console.log('[CONTENT] Readability parse error:', e);

      return '';
    }
  }

  // Highlighting functions
  function generateHighlightId(type, text) {
    const safeText = text.substring(0, 50).replace(/[^a-zA-Z0-9-]/g, '_');
    return `argument-check-highlight-${type}-${safeText}-${Math.random().toString(36).substring(2, 7)}`;
  }

  function highlightText(text, className, type, data = {}) {
    if (!text) return [];

    const highlights = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    const textNodes = [];

    let node;
    while ((node = walker.nextNode())) {
      // Skip script and style nodes
      if (
        node.parentNode &&
        (node.parentNode.tagName === 'SCRIPT' ||
          node.parentNode.tagName === 'STYLE')
      ) {
        continue;
      }
      textNodes.push(node);
    }

    textNodes.forEach((originalNode) => {
      let currentNode = originalNode;
      let idx = currentNode.nodeValue.indexOf(text);
      let firstSpan = null;

      while (idx !== -1) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        span.dataset.type = type;

        if (!firstSpan) {
          const highlightId = generateHighlightId(type, text);
          span.id = highlightId;
          firstSpan = span;
          highlights.push({ id: highlightId, element: span });
        }

        // Add dataset attributes for tooltip
        if (data.tag) span.dataset.tag = data.tag;
        if (data.keyword) span.dataset.keyword = data.keyword;
        if (type === 'opinion' && data.relatedArguments) {
          span.dataset.relatedArguments = JSON.stringify(data.relatedArguments);
        }
        if (type === 'argument' && data.sources) {
          span.dataset.sources = JSON.stringify(data.sources);
        }
        if (type === 'opinion' && data.verification) {
          console.log('Adding verification data:', data.verification);
          span.dataset.verification = data.verification;
        }

        // Add tooltip handlers
        span.addEventListener('mouseover', showTooltip);
        span.addEventListener('mouseout', startHideTooltipTimer);

        // Split text and insert span
        const after = currentNode.splitText(idx);
        after.nodeValue = after.nodeValue.substring(text.length);
        currentNode.parentNode.insertBefore(span, after);

        currentNode = after;
        idx = currentNode.nodeValue.indexOf(text);
      }
    });

    return highlights.map((h) => h.id);
  }

  function removeAllHighlights() {
    let highlightedSpan;

    while (
      (highlightedSpan = document.querySelector(
        '.highlight-argument, .highlight-opinion, .highlight-chinese'
      ))
    ) {
      const parent = highlightedSpan.parentNode;
      if (parent) {
        parent.replaceChild(
          document.createTextNode(highlightedSpan.textContent),
          highlightedSpan
        );
        parent.normalize();
      } else {
        highlightedSpan.remove();
      }
    }

    // Reset highlight tracking
    highlightedElements.arguments = {};
    highlightedElements.opinions = {};
    highlightedElements.chinese_terms = {};
  }

  // ====== MutationObserver for Dynamic Sites (React-based like Yahoo News) ======

  // Setup DOM observer to detect when React re-renders the article content
  function setupDOMObserver() {
    // Disconnect existing observer if any
    if (domObserver) {
      domObserver.disconnect();
    }

    // Find the article container - Yahoo uses caas-content-wrapper or similar
    const articleContainer =
      document.querySelector('.caas-content-wrapper') ||
      document.querySelector('.caas-body') ||
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.body;

    domObserver = new MutationObserver((mutations) => {
      // Only process if we have stored highlights
      const hasStoredHighlights =
        highlightDataStore.arguments.length > 0 ||
        highlightDataStore.opinions.length > 0 ||
        highlightDataStore.chinese_terms.length > 0;

      if (!hasStoredHighlights) return;

      // Check if any mutation affects text content or removes our highlights
      let shouldReapply = false;
      for (const mutation of mutations) {
        // Check if our highlights were removed
        if (mutation.type === 'childList') {
          for (const removedNode of mutation.removedNodes) {
            if (removedNode.nodeType === Node.ELEMENT_NODE) {
              if (
                removedNode.classList?.contains('highlight-argument') ||
                removedNode.classList?.contains('highlight-opinion') ||
                removedNode.classList?.contains('highlight-chinese') ||
                removedNode.querySelector?.(
                  '.highlight-argument, .highlight-opinion, .highlight-chinese'
                )
              ) {
                shouldReapply = true;
                break;
              }
            }
          }
        }
        if (shouldReapply) break;
      }

      if (shouldReapply) {
        // Debounce to avoid excessive re-applies
        if (reapplyDebounceTimer) clearTimeout(reapplyDebounceTimer);
        reapplyDebounceTimer = setTimeout(() => {
          checkAndReapplyHighlights();
        }, REAPPLY_DEBOUNCE_MS);
      }
    });

    domObserver.observe(articleContainer, {
      childList: true,
      subtree: true
    });

    console.log(
      '🔄 [CONTENT] DOM Observer setup for dynamic content re-rendering'
    );
  }

  // Check if highlights are missing and re-apply them
  function checkAndReapplyHighlights() {
    const expectedCount =
      highlightDataStore.arguments.length +
      highlightDataStore.opinions.length +
      highlightDataStore.chinese_terms.length;

    if (expectedCount === 0) return;

    const existingHighlights = document.querySelectorAll(
      '.highlight-argument, .highlight-opinion, .highlight-chinese'
    );

    // If highlights are missing, re-apply them
    if (existingHighlights.length < expectedCount) {
      console.log(
        `🔄 [CONTENT] Highlights missing (${existingHighlights.length}/${expectedCount}), re-applying...`
      );
      reapplyAllHighlights();
    }
  }

  // Re-apply all stored highlights
  function reapplyAllHighlights() {
    // Temporarily disconnect observer to avoid infinite loop
    if (domObserver) {
      domObserver.disconnect();
    }

    // Clear any remaining partial highlights
    const existingHighlights = document.querySelectorAll(
      '.highlight-argument, .highlight-opinion, .highlight-chinese'
    );
    existingHighlights.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      }
    });

    // Reset tracking
    highlightedElements.arguments = {};
    highlightedElements.opinions = {};
    highlightedElements.chinese_terms = {};

    // Re-apply arguments
    highlightDataStore.arguments.forEach((item) => {
      const highlightIds = highlightText(
        item.text,
        'highlight-argument',
        'argument',
        item.data
      );
      if (highlightIds.length > 0) {
        highlightedElements.arguments[item.text] = highlightIds[0];
      }
    });

    // Re-apply opinions
    highlightDataStore.opinions.forEach((item) => {
      const highlightIds = highlightText(
        item.text,
        'highlight-opinion',
        'opinion',
        item.data
      );
      if (highlightIds.length > 0) {
        highlightedElements.opinions[item.text] = highlightIds[0];
      }
    });

    // Re-apply chinese terms
    highlightDataStore.chinese_terms.forEach((item) => {
      const highlightIds = highlightText(
        item.text,
        'highlight-chinese',
        'chinese',
        {}
      );
      if (highlightIds.length > 0) {
        highlightedElements.chinese_terms[item.text] = highlightIds[0];
      }
    });

    console.log('✅ [CONTENT] Highlights re-applied successfully');

    // Re-connect observer
    setupDOMObserver();
  }

  // ====== End MutationObserver Section ======

  // Helper function to detect if background is dark
  function isDarkBackground(element) {
    // Get the computed background color
    let bg = window.getComputedStyle(element).backgroundColor;

    // Parse RGB values
    const rgbMatch = bg.match(/\d+/g);
    if (!rgbMatch || rgbMatch.length < 3) {
      return false; // Default to light background
    }

    const r = parseInt(rgbMatch[0]);
    const g = parseInt(rgbMatch[1]);
    const b = parseInt(rgbMatch[2]);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5; // Dark if luminance < 0.5
  }

  // Tooltip functions
  function showTooltip(event) {
    const el = event.target;
    const type = el.dataset.type;

    // Clear any existing tooltip timer
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;

    // Remove existing tooltip
    const existingTooltip = document.getElementById('argument-check-tooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }

    const isDark = true;

    // Create new tooltip
    const tooltip = document.createElement('div');
    tooltip.id = 'argument-check-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '10000';

    // Set colors based on background brightness
    if (isDark) {
      // Light tooltip for dark backgrounds
      tooltip.style.backgroundColor = 'rgba(250, 250, 250, 0.95)';
      tooltip.style.color = '#1a1a1a';
      tooltip.style.border = '1px solid #888';

      // Add dynamic styles for dark background
      const style = document.createElement('style');
      style.textContent = `
        #argument-check-tooltip a {
          color: #0066cc;
          text-decoration: underline;
        }
        #argument-check-tooltip a:visited {
          color: #6600cc;
        }
        #argument-check-tooltip .correct {
          color: #007c00;
          font-weight: 600;
        }
        #argument-check-tooltip .incorrect {
          color: #cc0000;
          font-weight: 600;
        }
        #argument-check-tooltip .unverified {
          color: #cc8800;
          font-weight: 600;
        }
      `;
      if (!document.getElementById('tooltip-dark-style')) {
        style.id = 'tooltip-dark-style';
        document.head.appendChild(style);
      }
    } else {
      // Dark tooltip for light backgrounds
      tooltip.style.backgroundColor = 'rgba(51, 51, 51, 0.95)';
      tooltip.style.color = '#fff';
      tooltip.style.border = '1px solid #ccc';

      // Remove dark styles if they exist
      const darkStyle = document.getElementById('tooltip-dark-style');
      if (darkStyle) {
        darkStyle.remove();
      }
    }

    tooltip.style.borderRadius = '4px';
    tooltip.style.padding = '8px';
    tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    tooltip.style.maxWidth = '300px';
    tooltip.style.fontSize = '14px';

    // Generate tooltip content
    let content = '';
    if (type === 'argument') {
      content = generateArgumentTooltip(el);
    } else if (type === 'opinion') {
      content = generateOpinionTooltip(el);
    } else if (type === 'chinese') {
      content = '<div><strong>中國用語</strong></div>';
    }

    tooltip.innerHTML = content;

    // Position tooltip
    const rect = el.getBoundingClientRect();
    tooltip.style.left = rect.left + window.scrollX + 'px';
    tooltip.style.top = rect.bottom + window.scrollY + 5 + 'px';

    // Set up tooltip hover behavior
    tooltip.addEventListener('mouseover', () => {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    });
    tooltip.addEventListener('mouseout', startHideTooltipTimer);

    document.body.appendChild(tooltip);
  }

  function generateArgumentTooltip(el) {
    let content = '<div><strong>論據</strong></div>';

    if (el.dataset.tag) {
      const tagClass =
        el.dataset.tag === '正確'
          ? 'correct'
          : el.dataset.tag === '錯誤'
            ? 'incorrect'
            : 'unverified';
      content += `<div>標籤: <span class="${tagClass}">${el.dataset.tag}</span></div>`;
    }

    if (el.dataset.keyword) {
      content += `<div>建議搜尋: <a href="https://www.google.com/search?q=${encodeURIComponent(el.dataset.keyword)}" target="_blank">${el.dataset.keyword}</a></div>`;
    }

    if (el.dataset.sources) {
      const sources = JSON.parse(el.dataset.sources);
      if (sources.length > 0) {
        content += '<div><strong>來源:</strong><ul>';
        sources.forEach((source) => {
          content += `<li>${source}</li>`;
        });
        content += '</ul></div>';
      }
    }

    return content;
  }

  function generateOpinionTooltip(el) {
    let content = '<div><strong>觀點</strong></div>';

    if (el.dataset.tag) {
      content += `<div>類型: ${el.dataset.tag}</div>`;
    }

    if (el.dataset.keyword) {
      content += `<div>建議搜尋: <a href="https://www.google.com/search?q=${encodeURIComponent(el.dataset.keyword)}" target="_blank">${el.dataset.keyword}</a></div>`;
    }

    if (el.dataset.verification) {
      content += `<div><strong>驗證:</strong> <br>${el.dataset.verification}</div>`;
    }

    if (el.dataset.relatedArguments) {
      const relatedArguments = JSON.parse(el.dataset.relatedArguments);
      if (relatedArguments.length > 0) {
        content += '<br><div><strong>相關論據:</strong><ul>';
        relatedArguments.forEach((argument) => {
          content += `<li>${argument}</li>`;
        });
        content += '</ul></div>';
      }
    }

    return content;
  }

  function startHideTooltipTimer() {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(hideTooltip, HIDE_DELAY);
  }

  function hideTooltip() {
    const tooltip = document.getElementById('argument-check-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
    tooltipHideTimer = null;
  }

  // Helper to get user encryption key
  function getUserEncryptionKey() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getUserEncryptionKey' },
        (response) => {
          resolve(response?.encryptionKey);
        }
      );
    });
  }

  // Analysis functions
  async function analyzeCurrentPage() {
    // Mark analysis as in progress (persistent)
    await setAnalyzingState(true);

    // Notify background script that analysis is starting
    if (myTabId) {
      chrome.runtime
        .sendMessage({ action: 'analysisStarted', tabId: myTabId })
        .catch((err) => console.error('Error sending analysisStarted:', err));
    }

    const content = getArticleContent();
    const domain = extractDomain(window.location.href);

    if (!content) {
      const errorMsg = '抱歉，無法擷取網頁文字內容';
      if (myTabId) {
        chrome.runtime
          .sendMessage({
            action: 'analysisFinished',
            tabId: myTabId,
            error: errorMsg
          })
          .catch((err) =>
            console.error('Error sending analysis failure:', err)
          );
      }
      throw new Error(errorMsg);
    }

    // Get authentication token
    const authToken = await getAuthToken();

    // Check if user is authenticated
    if (!authToken) {
      const errorMsg =
        '需要驗證。<a href="#" id="goto-settings-link" style="color: #1976d2; text-decoration: underline; cursor: pointer;">點擊此處前往設定頁面登入</a>';
      console.error('❌ [CONTENT] No auth token available for analysis');
      if (myTabId) {
        chrome.runtime
          .sendMessage({
            action: 'analysisFinished',
            tabId: myTabId,
            error: errorMsg
          })
          .catch((err) => console.error('Error sending analysis error:', err));
      }
      throw new Error(errorMsg);
    }

    // Get user encryption key for API key decryption
    const userEncryptionKey = await getUserEncryptionKey();
    console.log(
      '🔑 [CONTENT] User encryption key status:',
      !!userEncryptionKey
    );

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    };

    const requestBody = {
      content,
      url: window.location.href,
      title: document.title,
      domain: domain,
      userEncryptionKey: userEncryptionKey
    };

    console.log('📤 [CONTENT] Sending analysis request');

    try {
      const apiUrl =
        window.APP_CONFIG?.getApiUrl('/analysis/analyze') ||
        'http://localhost:4999/api/analysis/analyze';
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (res.status === 401) {
        throw new Error(
          '需要驗證。<a href="#" id="goto-settings-link" style="color: #1976d2; text-decoration: underline; cursor: pointer;">點擊此處前往設定頁面登入</a>'
        );
      }

      if (!res.ok) {
        // Try to parse error code from response
        let errorCode = 'UNKNOWN_ERROR';
        try {
          const errorData = await res.json();
          errorCode = errorData.error || 'UNKNOWN_ERROR';
        } catch (parseError) {
          console.log('Could not parse error response:', parseError);
        }

        const errorMessage = getErrorMessage(errorCode);
        throw new Error(errorMessage);
      }

      const data = await res.json();
      console.log('✅ Analysis success:', data.success);

      // Transform data structure for compatibility
      if (data.analysis) {
        data.arguments = data.analysis.arguments || [];
        data.opinions = data.analysis.opinions || [];
        data.chinese_terms = data.analysis.chinese_terms || [];
        data.summary = data.analysis.summary || '';

        // Handle new domain info format
        if (data.analysis.domain_info) {
          data.domain_info = data.analysis.domain_info;
          data.verified_domain = data.analysis.domain_info.isAuthentic;
        } else {
          data.verified_domain = data.analysis.verified_domain ?? false;
          data.domain_info = null;
        }

        console.log(
          '📊 Found:',
          data.arguments.length,
          'arguments,',
          data.opinions.length,
          'opinions,',
          data.chinese_terms.length,
          'chinese terms'
        );
      }

      // Add domain to response data
      data.domain = domain;
      // Stage 1 only - don't mark stage2_completed yet
      data.stage2_completed = false;
      currentAnalysis = data;

      // Clear previous highlights
      removeAllHighlights();

      // Process and highlight arguments
      processArgumentsData(data);

      // Process and highlight opinions
      processOpinionsData(data);

      // Process and highlight Chinese terms
      processChineseTermsData(data);

      // Notify analysis completion
      if (myTabId) {
        chrome.runtime
          .sendMessage({
            action: 'analysisFinished',
            tabId: myTabId,
            data: data
          })
          .catch((err) =>
            console.error('Error sending analysis completion:', err)
          );
      }

      // Mark analysis as complete (persistent)
      await setAnalyzingState(false);
      return data;
    } catch (error) {
      // Mark analysis as complete (even on error, persistent)
      await setAnalyzingState(false);
      console.error('Analysis error:', error);
      if (myTabId) {
        chrome.runtime
          .sendMessage({
            action: 'analysisFinished',
            tabId: myTabId,
            error: error.toString()
          })
          .catch((err) => console.error('Error sending analysis error:', err));
      }
      throw error;
    }
  }

  function processArgumentsData(data) {
    console.log('📊 [CONTENT] Processing arguments data:', {
      hasArguments: !!data.arguments,
      isArray: Array.isArray(data.arguments),
      argumentsCount: data.arguments?.length || 0,
      firstArgument: data.arguments?.[0]
        ? {
            hasText: !!(data.arguments[0].argument || data.arguments[0]),
            hasTag: !!data.arguments[0].tag,
            tag: data.arguments[0].tag,
            hasSources: !!data.arguments[0].sources,
            hasKeyword: !!data.arguments[0].keyword
          }
        : 'N/A'
    });

    if (!Array.isArray(data.arguments)) {
      console.log(
        '❌ [CONTENT] Arguments is not an array:',
        typeof data.arguments
      );
      return;
    }

    // Clear stored arguments for fresh highlighting
    highlightDataStore.arguments = [];

    data.arguments = data.arguments.map((argument) => {
      const argumentText =
        typeof argument === 'string' ? argument : argument.argument;
      const argumentObj =
        typeof argument === 'string'
          ? { argument: argumentText }
          : { ...argument };

      const highlightData = {
        tag: argumentObj.tag,
        sources: argumentObj.sources,
        keyword: argumentObj.keyword
      };

      const highlightIds = highlightText(
        argumentText,
        'highlight-argument',
        'argument',
        highlightData
      );

      if (highlightIds.length > 0) {
        highlightedElements.arguments[argumentText] = highlightIds[0];
        argumentObj.highlightId = highlightIds[0];
        // Store for re-application
        highlightDataStore.arguments.push({
          text: argumentText,
          data: highlightData
        });
      }

      return argumentObj;
    });
  }

  function processOpinionsData(data) {
    console.log('🗣️ [CONTENT] Processing opinions data:', {
      hasOpinions: !!data.opinions,
      isArray: Array.isArray(data.opinions),
      opinionsCount: data.opinions?.length || 0,
      firstOpinion: data.opinions?.[0]
        ? {
            hasText: !!data.opinions[0].opinion,
            hasTag: !!data.opinions[0].tag,
            tag: data.opinions[0].tag,
            hasCategory: !!data.opinions[0].category,
            category: data.opinions[0].category,
            hasVerification: !!data.opinions[0].verification,
            hasKeyword: !!data.opinions[0].keyword
          }
        : 'N/A'
    });

    if (!Array.isArray(data.opinions)) {
      console.log(
        '❌ [CONTENT] Opinions is not an array:',
        typeof data.opinions
      );
      return;
    }

    // Clear stored opinions for fresh highlighting
    highlightDataStore.opinions = [];

    data.opinions = data.opinions.map((opinionObj) => {
      const opinion = { ...opinionObj };

      const highlightData = {
        tag: opinion.tag,
        relatedArguments: opinion.related_arguments,
        keyword: opinion.keyword,
        verification: opinion.verification
      };

      const highlightIds = highlightText(
        opinion.opinion,
        'highlight-opinion',
        'opinion',
        highlightData
      );

      if (highlightIds.length > 0) {
        highlightedElements.opinions[opinion.opinion] = highlightIds[0];
        opinion.highlightId = highlightIds[0];
        // Store for re-application
        highlightDataStore.opinions.push({
          text: opinion.opinion,
          data: highlightData
        });
      }

      return opinion;
    });
  }

  function processChineseTermsData(data) {
    if (!Array.isArray(data.chinese_terms)) return;

    // Clear stored chinese terms for fresh highlighting
    highlightDataStore.chinese_terms = [];

    data.chinese_terms = data.chinese_terms.map((term) => {
      const termText = typeof term === 'string' ? term : term.term;
      const termObj = { term: termText, highlightId: null };

      const highlightIds = highlightText(
        termText,
        'highlight-chinese',
        'chinese'
      );

      if (highlightIds.length > 0) {
        highlightedElements.chinese_terms[termText] = highlightIds[0];
        termObj.highlightId = highlightIds[0];
        // Store for re-application
        highlightDataStore.chinese_terms.push({ text: termText });
      }

      return termObj;
    });

    // Setup DOM observer after all highlights are applied
    setupDOMObserver();
  }

  async function reAnalyzeWithFeedback(feedbackData) {
    // Mark analysis as in progress (persistent)
    await setAnalyzingState(true);

    if (myTabId) {
      chrome.runtime
        .sendMessage({ action: 'analysisStarted', tabId: myTabId })
        .catch((err) =>
          console.error('Error sending analysisStarted for re-analyze:', err)
        );
    }

    // Ensure we have domain info
    feedbackData.domain = extractDomain(window.location.href);

    // Preserve domain_info and verified_domain from Stage 1 (currentAnalysis)
    if (currentAnalysis) {
      feedbackData.domain_info = currentAnalysis.domain_info;
      feedbackData.verified_domain = currentAnalysis.verified_domain;
    }

    // Add URL for caching
    feedbackData.url = window.location.href;

    // Preserve Chinese terms if not in feedback data
    if (!feedbackData.chinese_terms && currentAnalysis.chinese_terms) {
      feedbackData.chinese_terms = currentAnalysis.chinese_terms;
    }

    // Get authentication token
    const authToken = await getAuthToken();

    // Get user encryption key for API key decryption
    const userEncryptionKey = await getUserEncryptionKey();
    console.log(
      '🔑 [CONTENT] Re-analysis user encryption key status:',
      !!userEncryptionKey
    );

    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Add user encryption key to feedback data
    const requestBody = {
      data: feedbackData,
      userEncryptionKey: userEncryptionKey
    };

    console.log('📤 [CONTENT] Sending re-analysis request');

    try {
      const reAnalyzeUrl =
        window.APP_CONFIG?.getApiUrl('/analysis/re-analyze') ||
        'http://localhost:4999/api/analysis/re-analyze';
      const res = await fetch(reAnalyzeUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (res.status === 401) {
        throw new Error(
          '需要驗證。<a href="#" id="goto-settings-link" style="color: #1976d2; text-decoration: underline; cursor: pointer;">點擊此處前往設定頁面登入</a>'
        );
      }

      if (!res.ok) {
        // Try to parse error code from response
        let errorCode = 'UNKNOWN_ERROR';
        try {
          const errorData = await res.json();
          errorCode = errorData.error || 'UNKNOWN_ERROR';
        } catch (parseError) {
          console.log('Could not parse error response:', parseError);
        }

        const errorMessage = getErrorMessage(errorCode);
        throw new Error(errorMessage);
      }

      const data = await res.json();
      console.log('📥 [CONTENT] Stage 2 response received:', {
        success: data.success,
        hasAnalysis: !!data.analysis,
        analysisType: data.analysisType,
        timestamp: data.timestamp
      });

      console.log(
        '📋 [DEBUG] Complete Stage 2 response:',
        JSON.stringify(data, null, 2)
      );

      // Transform data structure for compatibility (same as Stage 1)
      if (data.analysis) {
        console.log(
          '🔄 [CONTENT] Transforming Stage 2 data structure for compatibility'
        );
        data.arguments = data.analysis.arguments || [];
        data.opinions = data.analysis.opinions || [];
        data.chinese_terms = data.analysis.chinese_terms || [];
        data.summary = data.analysis.summary || '';

        // Stage 2 does NOT update domain info - preserve from Stage 1
        // Domain info is only set in Stage 1 and should not be overwritten

        console.log('📊 [CONTENT] Transformed data:', {
          argumentsCount: data.arguments.length,
          opinionsCount: data.opinions.length,
          chineseTermsCount: data.chinese_terms.length
        });
      }

      // Use the root data object (now with transformed structure)
      const analysisData = data;

      console.log('🔍 [CONTENT] Final analysis data structure:', {
        hasArguments: !!analysisData.arguments,
        hasOpinions: !!analysisData.opinions,
        argumentsCount: analysisData.arguments?.length || 0,
        opinionsCount: analysisData.opinions?.length || 0,
        argumentsHaveTags:
          analysisData.arguments?.some((arg) => arg.tag) || false,
        opinionsHaveCategories:
          analysisData.opinions?.some((op) => op.category) || false
      });

      // Preserve domain, domain_info, verified_domain, and Chinese terms from Stage 1
      analysisData.domain = feedbackData.domain;
      analysisData.domain_info = feedbackData.domain_info;
      analysisData.verified_domain = feedbackData.verified_domain;
      analysisData.stage2_completed = true; // Mark Stage 2 as completed after re-analysis
      if (!analysisData.chinese_terms && feedbackData.chinese_terms) {
        analysisData.chinese_terms = feedbackData.chinese_terms;
      }

      currentAnalysis = analysisData;

      console.log('💾 [CONTENT] Updated currentAnalysis:', {
        argumentsCount: currentAnalysis.arguments?.length || 0,
        opinionsCount: currentAnalysis.opinions?.length || 0,
        chineseTermsCount: currentAnalysis.chinese_terms?.length || 0
      });

      // Clear existing highlights
      removeAllHighlights();

      // Process and highlight arguments, opinions, and Chinese terms
      processArgumentsData(currentAnalysis);
      processOpinionsData(currentAnalysis);
      processChineseTermsData(currentAnalysis);

      if (myTabId) {
        chrome.runtime
          .sendMessage({
            action: 'analysisFinished',
            tabId: myTabId,
            data: data
          })
          .catch((err) =>
            console.error('Error sending re-analysis completion:', err)
          );
      }

      // Mark analysis as complete (persistent)
      await setAnalyzingState(false);
      return data;
    } catch (error) {
      // Mark analysis as complete (even on error, persistent)
      await setAnalyzingState(false);
      console.error('Re-analysis error:', error);
      if (myTabId) {
        chrome.runtime
          .sendMessage({
            action: 'analysisFinished',
            tabId: myTabId,
            error: error.toString()
          })
          .catch((err) =>
            console.error('Error sending re-analysis error:', err)
          );
      }
      throw error;
    }
  }

  // Stage 3 Analysis function
  async function analyzeWithStage3() {
    // Notify background script that Stage 3 analysis is starting
    if (myTabId) {
      chrome.runtime
        .sendMessage({ action: 'stage3AnalysisStarted', tabId: myTabId })
        .catch((err) =>
          console.error('Error sending stage3AnalysisStarted:', err)
        );
    }

    if (!currentAnalysis || !currentAnalysis.domain) {
      const errorMsg = '請先完成基本分析才能進行疑美論分析';
      if (myTabId) {
        console.log(
          '📡 [CONTENT] Sending Stage 3 prerequisite error to sidebar'
        );
        chrome.runtime
          .sendMessage({
            action: 'stage3AnalysisError',
            tabId: myTabId,
            error: errorMsg
          })
          .catch((err) =>
            console.error('Error sending stage3 analysis failure:', err)
          );
      }
      throw new Error(errorMsg);
    }

    // Get authentication token
    const stage3AuthToken = await getAuthToken();
    console.log('🔑 [CONTENT] Stage 3 auth token status:', !!stage3AuthToken);

    if (!stage3AuthToken) {
      const errorMsg =
        '請先登入 Google 帳號才能使用疑美論分析功能。<a href="#" id="goto-settings-link" style="color: #1976d2; text-decoration: underline; cursor: pointer;">點擊此處前往設定頁面登入</a>';
      console.error('❌ [CONTENT] No auth token available for Stage 3');
      if (myTabId) {
        console.log('📡 [CONTENT] Sending Stage 3 auth error to sidebar');
        chrome.runtime
          .sendMessage({
            action: 'stage3AnalysisError',
            tabId: myTabId,
            error: errorMsg
          })
          .catch((err) =>
            console.error('Error sending stage3 analysis failure:', err)
          );
      }
      throw new Error(errorMsg);
    }

    // Get user encryption key for API key decryption
    const userEncryptionKey = await getUserEncryptionKey();
    console.log(
      '🔑 [CONTENT] User encryption key status for Stage 3:',
      !!userEncryptionKey
    );

    const headers = { 'Content-Type': 'application/json' };
    headers['Authorization'] = `Bearer ${stage3AuthToken}`;

    const requestBody = {
      data: {
        content: getArticleContent(),
        url: window.location.href,
        title: document.title,
        domain: extractDomain(window.location.href),
        arguments: currentAnalysis.arguments || [],
        opinions: currentAnalysis.opinions || []
      },
      userEncryptionKey: userEncryptionKey
    };

    console.log('📤 [CONTENT] Sending Stage 3 analysis request with data:', {
      contentLength: getArticleContent().length,
      url: window.location.href,
      title: document.title,
      argumentsCount: currentAnalysis.arguments?.length || 0,
      opinionsCount: currentAnalysis.opinions?.length || 0
    });

    try {
      const stage3Url =
        window.APP_CONFIG?.getApiUrl('/analysis/stage3-analyze') ||
        'http://localhost:4999/api/analysis/stage3-analyze';
      const res = await fetch(stage3Url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (res.status === 401) {
        throw new Error(
          '需要驗證。<a href="#" id="goto-settings-link" style="color: #1976d2; text-decoration: underline; cursor: pointer;">點擊此處前往設定頁面登入</a>'
        );
      }

      if (!res.ok) {
        // Try to parse error message from response
        let errorMessage = `Server responded with ${res.status}`;
        try {
          const errorData = await res.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
          // Check if it's an API key related error
          if (
            errorMessage.includes('API key') ||
            errorMessage.includes('encryption key') ||
            errorMessage.includes('options') ||
            errorMessage.includes('設定')
          ) {
            errorMessage +=
              ' <a href="#" id="goto-settings-link" style="color: #1976d2; text-decoration: underline; cursor: pointer;">前往設定頁面</a>';
          }
        } catch (parseError) {
          console.log('Could not parse error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      console.log('✅ [CONTENT] Stage 3 Analysis Response Received');
      console.log('📊 [CONTENT] Full Stage 3 Response Data:', data);
      console.log('📋 [CONTENT] Response Structure Analysis:', {
        success: data.success,
        hasStage3Analysis: !!data.stage3_analysis,
        hasClassification: !!data.classification,
        hasTags: !!data.tags,
        hasAnalysisSteps: !!data.analysis_steps,
        hasReasoning: !!data.reasoning,
        responseKeys: Object.keys(data)
      });

      // Handle both old and new response formats
      let stage3Data = null;

      if (data.stage3_analysis) {
        // Old format - data is wrapped in stage3_analysis
        console.log(
          '📦 [CONTENT] Using old response format (stage3_analysis wrapper)'
        );
        stage3Data = data.stage3_analysis;
      } else if (data.classification || data.tags || data.analysis_steps) {
        // New format - data is at root level
        console.log('📦 [CONTENT] Using new response format (direct data)');
        stage3Data = {
          classification: data.classification,
          tags: data.tags,
          analysis_steps: data.analysis_steps,
          reasoning: data.reasoning,
          meta: data.meta
        };
      } else {
        console.error('❌ [CONTENT] Unknown Stage 3 response format:', data);
      }

      if (stage3Data) {
        console.log('✅ [CONTENT] Stage 3 data processed:', stage3Data);

        // Merge Stage 3 results with current analysis
        currentAnalysis.stage3_analysis = stage3Data;
        currentAnalysis.stage3_completed = true;

        console.log('📊 [CONTENT] Stage 3 Results Summary:', {
          classification: stage3Data.classification,
          tagsCount: stage3Data.tags?.length || 0,
          hasAnalysisSteps: !!stage3Data.analysis_steps,
          hasReasoning: !!stage3Data.reasoning
        });
      } else {
        console.error(
          '❌ [CONTENT] Failed to extract Stage 3 data from response'
        );
      }

      // Notify Stage 3 analysis completion
      if (myTabId) {
        console.log(
          '📡 [CONTENT] Sending Stage 3 completion message to sidebar'
        );
        chrome.runtime
          .sendMessage({
            action: 'stage3AnalysisCompleted',
            tabId: myTabId,
            data: stage3Data // Send just the Stage 3 data, not the entire analysis
          })
          .then((response) => {
            console.log(
              '✅ [CONTENT] Stage 3 completion message sent successfully:',
              response
            );
          })
          .catch((err) => {
            console.error(
              '❌ [CONTENT] Error sending stage3 analysis completion:',
              err
            );
          });
      }

      return currentAnalysis;
    } catch (error) {
      console.error('❌ [CONTENT] Stage 3 Analysis Error:', error);
      console.error('🔍 [CONTENT] Error Details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      if (myTabId) {
        console.log('📡 [CONTENT] Sending Stage 3 analysis error to sidebar');
        chrome.runtime
          .sendMessage({
            action: 'stage3AnalysisError',
            tabId: myTabId,
            error: error.toString()
          })
          .catch((err) =>
            console.error('Error sending stage3 analysis error:', err)
          );
      }
      throw error;
    }
  }

  // Set up message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Get Tab ID
    if (message.action === 'getTabId') {
      chrome.runtime
        .sendMessage({ action: 'getTabId' })
        .then((response) => {
          if (response && response.tabId) {
            myTabId = response.tabId;
          }
        })
        .catch((error) => console.error('Error getting tab ID:', error));
    }
    // Handle analysis request
    else if (
      message.action === 'analyze' ||
      message.action === 'analyzeFromContextMenu'
    ) {
      analyzeCurrentPage()
        .then(() => sendResponse({ success: true, ack: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.toString(), ack: true })
        );
      return true; // Indicates async response
    }
    // Handle re-analysis request
    else if (message.action === 'reAnalyze') {
      reAnalyzeWithFeedback(message.feedbackData)
        .then(() => sendResponse({ success: true, ack: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.toString(), ack: true })
        );
      return true; // Indicates async response
    }
    // Handle Stage 3 analysis request
    else if (message.action === 'stage3Analyze') {
      analyzeWithStage3()
        .then(() => sendResponse({ success: true, ack: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.toString(), ack: true })
        );
      return true; // Indicates async response
    }
    // Get current analysis results
    else if (message.action === 'getAnalysisResults') {
      // Check both memory and persistent state
      getAnalyzingState()
        .then((persistentAnalyzing) => {
          const analyzing = isAnalyzing || persistentAnalyzing;
          if (analyzing) {
            // Analysis in progress - return status so sidepanel can show loading
            sendResponse({ data: null, isAnalyzing: true });
          } else if (currentAnalysis && currentAnalysis.domain) {
            sendResponse({ data: currentAnalysis, isAnalyzing: false });
          } else {
            sendResponse({ data: null, isAnalyzing: false });
          }
        })
        .catch(() => {
          // Fallback to memory state on error
          if (isAnalyzing) {
            sendResponse({ data: null, isAnalyzing: true });
          } else if (currentAnalysis && currentAnalysis.domain) {
            sendResponse({ data: currentAnalysis, isAnalyzing: false });
          } else {
            sendResponse({ data: null, isAnalyzing: false });
          }
        });
      return true; // Async response
    }
    // Get domain
    else if (message.action === 'getDomain') {
      sendResponse({ domain: extractDomain(window.location.href) });
      return false; // Synchronous response
    }
    // Scroll to highlighted element
    else if (message.action === 'scrollToHighlight') {
      const element = document.getElementById(message.highlightId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-focus');
        setTimeout(() => element.classList.remove('highlight-focus'), 1500);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Element not found' });
      }
      return false; // Synchronous response
    }
  });

  // Get initial Tab ID
  chrome.runtime.sendMessage({ action: 'getTabId' }, (response) => {
    if (response && response.tabId) {
      myTabId = response.tabId;
      console.log('Received Tab ID:', myTabId);
    }
  });

  chrome.runtime.sendMessage({ tabId: myTabId, inform: 'permissionGranted' });

  // Inject CSS styles for highlights
  const style = document.createElement('style');
  style.id = 'highlightStyles';
  style.textContent = `
    .highlight-argument, .highlight-opinion, .highlight-chinese {
      cursor: pointer;
      transition: background-color 0.3s ease;
    }
    .highlight-argument {
      background-color: rgba(144, 238, 144, 0.5);
    }
    .highlight-opinion {
      background-color: rgba(135, 206, 250, 0.5);
    }
    .highlight-chinese {
      background-color: rgba(255, 182, 193, 0.5);
    }
    .highlight-focus {
      background-color: rgba(255, 255, 0, 0.7) !important;
      outline: 2px solid orange;
      transition: background-color 0.2s ease-in-out, outline 0.2s ease-in-out;
    }
    .correct {
      color: green;
      font-weight: bold;
    }
    .incorrect {
      color: red;
      font-weight: bold;
    }
    .unverified {
      color: orange;
      font-weight: bold;
    }
    #argument-check-tooltip a {
      color: #0066cc;
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);
})();
