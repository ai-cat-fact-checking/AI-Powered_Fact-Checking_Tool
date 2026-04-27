window.argumentCheckLogic = (() => {
  // Escape HTML special characters to prevent XSS when interpolating
  // LLM output or user content into innerHTML.
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // State management
  let currentAnalysis = null;
  let currentURL = null;
  let currentTitle = null;
  let hasAnalysis = false;
  let activeTabId = null;
  let elements = {};
  let tagFilters = ['全部'];

  // Core state management functions
  function setElements(elemRefs) {
    elements = elemRefs;
  }

  function setCurrentAnalysisData(data) {
    currentAnalysis = data;
    hasAnalysis = !!(data && data.domain && data.domain.length > 0);
  }

  function getCurrentAnalysisData() {
    return currentAnalysis;
  }

  function setTabData(url, title, id) {
    currentURL = url;
    currentTitle = title;
    if (id) activeTabId = id;
  }

  function setTabTagFilters(newFilters) {
    tagFilters = newFilters;
  }

  function getTabData() {
    return { url: currentURL, title: currentTitle, id: activeTabId };
  }

  function getHasAnalysis() {
    return hasAnalysis;
  }

  // UI state management functions
  function showPermissionPrompt() {
    if (!elements.permissionPromptEl) return;
    elements.permissionPromptEl.classList.remove('hidden');
    elements.loadingEl?.classList.add('hidden');
    elements.analysisResultsEl?.classList.add('hidden');
    elements.editFormEl?.classList.add('hidden');
    elements.errorMessageEl?.classList.add('hidden');
    // Disable analysis buttons when permission not granted
    if (elements.analyzeBtn) {
      elements.analyzeBtn.disabled = true;
      elements.analyzeBtn.title = '請先授權分析此頁面';
    }
    if (elements.stage3AnalyzeBtn) {
      elements.stage3AnalyzeBtn.disabled = true;
      elements.stage3AnalyzeBtn.title = '請先授權分析此頁面';
    }
  }

  function hidePermissionPrompt() {
    if (!elements.permissionPromptEl) return;
    elements.permissionPromptEl.classList.add('hidden');
    // Enable analysis buttons when permission granted
    if (elements.analyzeBtn) {
      elements.analyzeBtn.disabled = false;
      elements.analyzeBtn.title = '';
    }
    if (elements.stage3AnalyzeBtn) {
      elements.stage3AnalyzeBtn.disabled = false;
      elements.stage3AnalyzeBtn.title = '';
    }
  }

  function showError(message) {
    if (!elements.errorMessageEl) return;
    elements.errorMessageEl.innerHTML = message;
    elements.errorMessageEl.classList.remove('hidden');
    elements.loadingEl?.classList.add('hidden');
    elements.analysisResultsEl?.classList.add('hidden');
    elements.editFormEl?.classList.add('hidden');
    hidePermissionPrompt();

    // Add event listener for settings link
    const settingsLink = elements.errorMessageEl.querySelector(
      '#goto-settings-link'
    );
    if (settingsLink) {
      settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
    }
  }

  function hideError() {
    if (!elements.errorMessageEl) return;
    elements.errorMessageEl.classList.add('hidden');
  }

  function showLoading() {
    if (!elements.loadingEl) return;
    elements.loadingEl.classList.remove('hidden');
    elements.analysisResultsEl?.classList.add('hidden');
    elements.editFormEl?.classList.add('hidden');
    hideError();
    hidePermissionPrompt();
  }

  function hideLoading() {
    if (!elements.loadingEl) return;
    elements.loadingEl.classList.add('hidden');
  }

  function showAnalysisResults(context = 'popup') {
    if (!elements.analysisResultsEl) return;
    hideLoading();
    elements.editFormEl?.classList.add('hidden');
    elements.analysisResultsEl.classList.remove('hidden');
    hidePermissionPrompt();

    const showButtons = hasAnalysis;
    if (elements.reAnalyzeBtn)
      elements.reAnalyzeBtn.style.display = showButtons
        ? 'inline-block'
        : 'none';
    if (elements.modifyBtn)
      elements.modifyBtn.style.display = showButtons ? 'inline-block' : 'none';
    if (elements.openReportBtn)
      elements.openReportBtn.style.display = showButtons
        ? 'inline-block'
        : 'none';

    // Display Stage 1 summary if available
    if (elements.analysisSummaryStage1El) {
      if (currentAnalysis && currentAnalysis.summary) {
        elements.analysisSummaryStage1El.textContent = currentAnalysis.summary;
        elements.analysisSummaryStage1El.classList.remove('hidden');
      } else {
        elements.analysisSummaryStage1El.classList.add('hidden');
        elements.analysisSummaryStage1El.textContent = '';
      }
    }

    // Show Stage 3 button always when analysis-results is shown
    // Stage 3 can be run independently after any stage completes
    if (elements.stage3AnalyzeBtn) {
      const showStage3 = showButtons; // Always show when buttons should be shown
      elements.stage3AnalyzeBtn.style.display = showStage3
        ? 'inline-block'
        : 'none';
      if (showStage3) {
        elements.stage3AnalyzeBtn.classList.remove('hidden');
      } else {
        elements.stage3AnalyzeBtn.classList.add('hidden');
      }
    }

    // For popup-specific UI adjustments
    if (context !== 'sidepanel') {
      const buttonVisibilityClass = hasAnalysis ? 'remove' : 'add';
      elements.reAnalyzeBtn?.classList[buttonVisibilityClass]('hidden');
      elements.modifyBtn?.classList[buttonVisibilityClass]('hidden');
      elements.openReportBtn?.classList[buttonVisibilityClass]('hidden');
      elements.stage3AnalyzeBtn?.classList[buttonVisibilityClass]('hidden');
    }

    // Hide opinion filters by default - they are shown only when Stage 2 is completed
    // This is controlled in updateAnalysisUI based on stage2_completed flag
    if (
      elements.opinionFilterEl &&
      (!currentAnalysis || !currentAnalysis.stage2_completed)
    ) {
      elements.opinionFilterEl.classList.add('hidden');
    }
  }

  function showEditForm() {
    if (!elements.editFormEl) return;
    elements.editFormEl.classList.remove('hidden');
    elements.analysisResultsEl?.classList.add('hidden');
    hidePermissionPrompt();
    populateEditForm();
  }

  // Data processing and analysis logic
  function determineCredibilityLevel(data) {
    if (
      !data ||
      !Array.isArray(data.arguments) ||
      data.arguments.length === 0
    ) {
      return { level: 'none', levelText: '尚未評估' };
    }
    const argumentStats = calculateArgumentStats(data.arguments);
    const incorrectPercentage =
      argumentStats.total > 0
        ? (argumentStats.incorrect / argumentStats.total) * 100
        : 0;
    const unverifiedPercentage =
      argumentStats.total > 0
        ? (argumentStats.unverified / argumentStats.total) * 100
        : 0;

    if (incorrectPercentage >= 10) {
      return { level: 'danger', levelText: '可能有問題' };
    } else if (unverifiedPercentage >= 50) {
      return { level: 'warning', levelText: '很多未認證論據須小心' };
    } else {
      return { level: 'ok', levelText: '應該沒問題' };
    }
  }

  function calculateArgumentStats(args) {
    const stats = {
      total: 0,
      correct: 0,
      incorrect: 0,
      unverified: 0,
      sourcesCount: 0
    };
    if (!Array.isArray(args)) return stats;

    stats.total = args.length;
    args.forEach((argument) => {
      const argumentData =
        typeof argument === 'string' ? { tag: null, sources: [] } : argument;
      if (argumentData.tag === '正確') stats.correct++;
      else if (argumentData.tag === '錯誤') stats.incorrect++;
      else stats.unverified++;

      if (Array.isArray(argumentData.sources)) {
        stats.sourcesCount += argumentData.sources.length;
      }
    });
    return stats;
  }

  // UI rendering functions
  function updateCredibilityLevel(levelData) {
    if (!elements.popupAssessmentEl || !elements.assessmentLevelTextEl) return;
    elements.popupAssessmentEl.classList.remove(
      'assessment-level-ok',
      'assessment-level-warning',
      'assessment-level-danger',
      'not-analyzed'
    );
    elements.assessmentLevelTextEl.textContent = levelData.levelText;

    if (levelData.level === 'none') {
      elements.popupAssessmentEl.classList.add('not-analyzed');
    } else {
      elements.popupAssessmentEl.classList.add(
        `assessment-level-${levelData.level}`
      );
    }
  }

  function renderDomainStatus(domain, isVerified, domainInfo = null) {
    if (!elements.domainValueEl) return;

    if (!hasAnalysis) {
      elements.domainValueEl.textContent = '尚未分析';
      elements.domainVerifiedEl?.classList.add('hidden');
      elements.domainUnverifiedEl?.classList.add('hidden');
      elements.domainUnknownEl?.classList.add('hidden');
      return;
    }

    elements.domainValueEl.textContent = domain || 'N/A';

    // Determine domain type label based on category and isAuthentic
    const domainVerifiedEl = elements.domainVerifiedEl;
    const domainUnverifiedEl = elements.domainUnverifiedEl;
    const domainUnknownEl =
      elements.domainUnknownEl || document.getElementById('domain-unknown');

    // Hide all first
    domainVerifiedEl?.classList.add('hidden');
    domainUnverifiedEl?.classList.add('hidden');
    domainUnknownEl?.classList.add('hidden');

    if (domainInfo && domainInfo.category) {
      // Use category to show appropriate label
      const category = domainInfo.category.toLowerCase();
      const label = getDomainTypeLabel(category, isVerified);

      if (isVerified === false) {
        // Suspicious/phishing
        if (domainUnverifiedEl) {
          domainUnverifiedEl.textContent = label;
          domainUnverifiedEl.classList.remove('hidden');
        }
      } else if (isVerified === true) {
        // Verified/official
        if (domainVerifiedEl) {
          domainVerifiedEl.textContent = label;
          domainVerifiedEl.classList.remove('hidden');
        }
      } else {
        // Unknown
        if (domainUnknownEl) {
          domainUnknownEl.textContent = '未知';
          domainUnknownEl.classList.remove('hidden');
        }
      }
    } else {
      // Fallback to basic verified/unverified
      if (isVerified === true) {
        if (domainVerifiedEl) {
          domainVerifiedEl.textContent = '已驗證';
          domainVerifiedEl.classList.remove('hidden');
        }
      } else if (isVerified === false) {
        if (domainUnverifiedEl) {
          domainUnverifiedEl.textContent = '未驗證';
          domainUnverifiedEl.classList.remove('hidden');
        }
      } else {
        if (domainUnknownEl) {
          domainUnknownEl.textContent = '未知';
          domainUnknownEl.classList.remove('hidden');
        }
      }
    }

    // Render additional domain info if available, or clear previous info
    if (domainInfo) {
      renderDomainDetails(domainInfo);
    } else {
      clearDomainDetails();
    }
  }

  function clearDomainDetails() {
    // Clear organization name
    const orgNameEl =
      elements.domainOrgNameEl || document.getElementById('domain-org-name');
    if (orgNameEl) {
      orgNameEl.textContent = '';
      orgNameEl.classList.add('hidden');
    }

    // Clear summary
    const summaryEl =
      elements.domainSummaryEl || document.getElementById('domain-summary');
    if (summaryEl) {
      summaryEl.textContent = '';
      summaryEl.classList.add('hidden');
    }

    // Clear and hide details section
    const detailsEl =
      elements.domainDetailsEl || document.getElementById('domain-details');
    if (detailsEl) {
      detailsEl.classList.add('hidden');
      detailsEl.open = false; // Close if open
    }

    const descEl =
      elements.domainDescriptionEl ||
      document.getElementById('domain-description');
    if (descEl) {
      descEl.textContent = '';
      descEl.classList.add('hidden');
    }

    const metaEl =
      elements.domainMetaEl || document.getElementById('domain-meta');
    if (metaEl) {
      metaEl.classList.add('hidden');
    }

    const categoryEl =
      elements.domainCategoryEl || document.getElementById('domain-category');
    if (categoryEl) {
      categoryEl.textContent = '';
      categoryEl.classList.add('hidden');
    }

    const countryEl =
      elements.domainCountryEl || document.getElementById('domain-country');
    if (countryEl) {
      countryEl.textContent = '';
      countryEl.classList.add('hidden');
    }

    const stanceEl =
      elements.domainStanceEl || document.getElementById('domain-stance');
    if (stanceEl) {
      stanceEl.textContent = '';
      stanceEl.classList.add('hidden');
    }

    const notesEl =
      elements.domainCredibilityNotesEl ||
      document.getElementById('domain-credibility-notes');
    if (notesEl) {
      notesEl.textContent = '';
      notesEl.classList.add('hidden');
    }
  }

  function getDomainTypeLabel(category, isAuthentic) {
    // Map category to user-friendly labels
    if (isAuthentic === false) {
      return '⚠️ 可疑網站';
    }

    const labels = {
      government: '🏛️ 政府機關',
      education: '🎓 教育機構',
      news: '📰 新聞媒體',
      media: '📺 媒體',
      official: '✓ 官方網站',
      business: '🏢 企業網站',
      social: '💬 社群平台',
      personal: '👤 個人網站',
      other: '🌐 一般網站'
    };

    return labels[category] || '🌐 一般網站';
  }

  function renderDomainDetails(domainInfo) {
    // Organization name
    const orgNameEl =
      elements.domainOrgNameEl || document.getElementById('domain-org-name');
    if (orgNameEl) {
      const orgName =
        domainInfo.organizationNameZh || domainInfo.organizationName;
      if (orgName) {
        orgNameEl.textContent = orgName;
        orgNameEl.classList.remove('hidden');
      } else {
        orgNameEl.classList.add('hidden');
      }
    }

    // Summary - show important info directly as text (max 60 chars)
    const summaryEl =
      elements.domainSummaryEl || document.getElementById('domain-summary');
    if (summaryEl) {
      const summaryParts = [];
      const MAX_SUMMARY_LEN = 60;

      // Add country (short)
      if (domainInfo.country) {
        const country =
          domainInfo.country.length > 10
            ? domainInfo.country.substring(0, 10)
            : domainInfo.country;
        summaryParts.push(`📍${country}`);
      }

      // Add political stance if notable (truncate)
      if (domainInfo.politicalStance && domainInfo.politicalStance !== 'N/A') {
        const stance =
          domainInfo.politicalStance.length > 15
            ? domainInfo.politicalStance.substring(0, 15) + '…'
            : domainInfo.politicalStance;
        summaryParts.push(stance);
      }

      if (summaryParts.length > 0) {
        let summaryText = summaryParts.join(' · ');
        if (summaryText.length > MAX_SUMMARY_LEN) {
          summaryText = summaryText.substring(0, MAX_SUMMARY_LEN - 1) + '…';
        }
        summaryEl.textContent = summaryText;
        summaryEl.classList.remove('hidden');
      } else {
        summaryEl.classList.add('hidden');
      }
    }

    // Details section (collapsible)
    const detailsEl =
      elements.domainDetailsEl || document.getElementById('domain-details');
    const descEl =
      elements.domainDescriptionEl ||
      document.getElementById('domain-description');
    const metaEl =
      elements.domainMetaEl || document.getElementById('domain-meta');
    const categoryEl =
      elements.domainCategoryEl || document.getElementById('domain-category');
    const countryEl =
      elements.domainCountryEl || document.getElementById('domain-country');
    const stanceEl =
      elements.domainStanceEl || document.getElementById('domain-stance');
    const notesEl =
      elements.domainCredibilityNotesEl ||
      document.getElementById('domain-credibility-notes');

    let hasDetails = false;

    // Description (in details)
    if (descEl) {
      const desc = domainInfo.descriptionZh || domainInfo.description;
      if (desc) {
        descEl.textContent = desc;
        descEl.classList.remove('hidden');
        hasDetails = true;
      } else {
        descEl.classList.add('hidden');
      }
    }

    // Meta info (in details)
    if (metaEl) {
      let hasAnyMeta = false;

      if (categoryEl && domainInfo.category) {
        categoryEl.textContent = getCategoryLabel(domainInfo.category);
        categoryEl.classList.remove('hidden');
        hasAnyMeta = true;
      } else if (categoryEl) {
        categoryEl.classList.add('hidden');
      }

      if (countryEl && domainInfo.country) {
        countryEl.textContent = domainInfo.country;
        countryEl.classList.remove('hidden');
        hasAnyMeta = true;
      } else if (countryEl) {
        countryEl.classList.add('hidden');
      }

      if (
        stanceEl &&
        domainInfo.politicalStance &&
        domainInfo.politicalStance !== 'N/A'
      ) {
        stanceEl.textContent = domainInfo.politicalStance;
        stanceEl.classList.remove('hidden');
        hasAnyMeta = true;
      } else if (stanceEl) {
        stanceEl.classList.add('hidden');
      }

      metaEl.classList.toggle('hidden', !hasAnyMeta);
      if (hasAnyMeta) hasDetails = true;
    }

    // Credibility notes (in details)
    if (notesEl) {
      if (domainInfo.credibilityNotes) {
        notesEl.textContent = '⚠️ ' + domainInfo.credibilityNotes;
        notesEl.classList.remove('hidden');
        hasDetails = true;
      } else {
        notesEl.classList.add('hidden');
      }
    }

    // Show/hide the details collapsible section
    if (detailsEl) {
      detailsEl.classList.toggle('hidden', !hasDetails);

      // Setup toggle listener to change summary text
      if (hasDetails && !detailsEl._toggleListenerAdded) {
        const summaryToggle = detailsEl.querySelector('summary');
        if (summaryToggle) {
          detailsEl.addEventListener('toggle', () => {
            summaryToggle.textContent = detailsEl.open
              ? '隱藏更多資訊'
              : '顯示更多資訊';
          });
          detailsEl._toggleListenerAdded = true;
        }
      }
    }
  }

  function getCategoryLabel(category) {
    const labels = {
      news: '📰 新聞媒體',
      media: '📺 媒體',
      government: '🏛️ 政府機關',
      education: '🎓 教育機構',
      business: '🏢 企業',
      social: '💬 社群平台',
      official: '✓ 官方',
      other: '其他'
    };
    return labels[category] || category;
  }

  function renderOpinionsTree(opinions, showTags = false) {
    if (!elements.opinionsContainerEl) return;
    elements.opinionsContainerEl.innerHTML = '';

    if (!hasAnalysis) {
      elements.opinionsContainerEl.innerHTML =
        '<p class="not-analyzed">尚未分析</p>';
      return;
    }

    if (!Array.isArray(opinions) || opinions.length === 0) {
      elements.opinionsContainerEl.innerHTML = '<p>沒有找到觀點。</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'tree';

    opinions.forEach((opinionObj) => {
      // Only filter by tag when showTags is true (Stage 2 completed)
      if (
        showTags &&
        !tagFilters.includes('全部') &&
        (!opinionObj.tag ||
          !opinionObj.tag.some((tag) => tagFilters.includes(tag)))
      ) {
        return;
      }
      const li = document.createElement('li');
      li.classList.add('clickable-list-item');

      const highlightId = opinionObj.highlightId;
      if (highlightId) {
        li.dataset.highlightId = highlightId;
        li.addEventListener('click', createScrollToHighlightHandler());
      }

      const opinionDiv = document.createElement('div');
      opinionDiv.className = 'tree-item';

      const opinionBadge = document.createElement('span');
      opinionBadge.className = 'tree-badge badge-opinion';
      opinionBadge.textContent = '觀點';

      const opinionContent = document.createElement('span');
      opinionContent.className = 'tree-content';

      const tagBadge = document.createElement('span');
      let tagList = [];

      // Only process and show tags when showTags is true (Stage 2 completed)
      if (showTags && opinionObj.tag) {
        opinionObj.tag.forEach((tag) => {
          if (tag === '有論據佐證') {
            tag = '有論據';
            tagBadge.className = 'tree-badge badge-correct';
          } else if (tag === '無論據佐證') {
            tag = '無論據';
            tagBadge.className = 'tree-badge badge-incorrect';
          } else {
            tagList.push(tag);
            return;
          }
          tagBadge.textContent = tag;
        });
      }

      let opinionHTML = escapeHtml(opinionObj.opinion);
      // Only show keyword when showTags is true (Stage 2 completed)
      if (showTags && opinionObj.keyword) {
        const safeKeyword = escapeHtml(opinionObj.keyword);
        opinionHTML += `<br><span class="tree-keyword">建議搜尋: <a href="https://www.google.com/search?q=${encodeURIComponent(opinionObj.keyword)}" target="_blank">${safeKeyword}</a></span>`;
      }
      // Show tags at the end of opinion (after keyword)
      if (showTags && tagList.length > 0) {
        const safeTags = tagList.map(escapeHtml).join(', ');
        opinionHTML += `<br><span class="tree-keyword">觀點類別:</span> <span style="text-decoration: underline;">${safeTags}</span>`;
      }
      opinionContent.innerHTML = opinionHTML;

      opinionDiv.appendChild(opinionBadge);
      opinionDiv.appendChild(opinionContent);
      opinionDiv.appendChild(tagBadge);
      li.appendChild(opinionDiv);

      const branchUl = createOpinioinBranch(
        opinionObj.related_arguments,
        opinionObj.verification
      );
      li.appendChild(branchUl);

      ul.appendChild(li);
    });

    elements.opinionsContainerEl.appendChild(ul);
  }

  function createOpinionsBranchEle(badgeName, content) {
    const Li = document.createElement('li');
    const Div = document.createElement('div');
    Div.className = 'tree-item';

    const Badge = document.createElement('span');
    if (badgeName === '驗證') {
      Badge.className = 'tree-badge badge-verification';
    } else {
      Badge.className = 'tree-badge badge-argument';
    }
    Badge.textContent = badgeName;

    const Content = document.createElement('span');
    Content.className = 'tree-content';
    Content.textContent = content;

    Div.appendChild(Badge);
    Div.appendChild(Content);
    Li.appendChild(Div);
    return Li;
  }

  function createOpinioinBranch(args, verification = null) {
    const branchUl = document.createElement('ul');
    branchUl.className = 'tree';

    if (verification) {
      const verificationLi = createOpinionsBranchEle('驗證', verification);
      branchUl.appendChild(verificationLi);
    }

    if (Array.isArray(args) || args.length !== 0) {
      args.forEach((argument) => {
        const argumentLi = createOpinionsBranchEle('論據', argument);
        branchUl.appendChild(argumentLi);
      });
    }

    return branchUl;
  }

  function renderArgumentsTree(args) {
    if (!elements.argumentsContainerEl) return;
    elements.argumentsContainerEl.innerHTML = '';

    if (!hasAnalysis) {
      elements.argumentsContainerEl.innerHTML =
        '<p class="not-analyzed">尚未分析</p>';
      return;
    }

    const safeArguments = Array.isArray(args) ? args : [];
    if (safeArguments.length === 0) {
      elements.argumentsContainerEl.innerHTML = '<p>沒有找到論據。</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'tree';

    safeArguments.forEach((argumentInput) => {
      const argumentObj =
        typeof argumentInput === 'string'
          ? {
              argument: argumentInput,
              tag: null,
              sources: [],
              keyword: null,
              highlightId: null
            }
          : argumentInput;

      const li = document.createElement('li');
      li.classList.add('clickable-list-item');

      const highlightId = argumentObj.highlightId;
      if (highlightId) {
        li.dataset.highlightId = highlightId;
        li.addEventListener('click', createScrollToHighlightHandler());
      }

      const argumentDiv = document.createElement('div');
      argumentDiv.className = 'tree-item';

      const argumentBadge = document.createElement('span');
      argumentBadge.className = 'tree-badge badge-argument';
      argumentBadge.textContent = '論據';

      const argumentContent = document.createElement('span');
      argumentContent.className = 'tree-content';

      if (!argumentObj.keyword) {
        argumentContent.textContent = argumentObj.argument;
      } else {
        const safeArgument = escapeHtml(argumentObj.argument);
        const safeKeyword = escapeHtml(argumentObj.keyword);
        argumentContent.innerHTML = `${safeArgument} <br><span class="tree-keyword">建議搜尋: <a href="https://www.google.com/search?q=${encodeURIComponent(argumentObj.keyword)}" target="_blank">${safeKeyword}</a></span>`;
      }

      argumentDiv.appendChild(argumentBadge);
      argumentDiv.appendChild(argumentContent);

      if (argumentObj.tag) {
        const tagClass =
          argumentObj.tag === '正確'
            ? 'badge-correct'
            : argumentObj.tag === '錯誤'
              ? 'badge-incorrect'
              : 'badge-unverified';

        const tagBadge = document.createElement('span');
        tagBadge.className = `tree-badge ${tagClass}`;
        tagBadge.textContent = argumentObj.tag;
        argumentDiv.appendChild(tagBadge);
      }

      li.appendChild(argumentDiv);

      if (argumentObj.sources && argumentObj.sources.length > 0) {
        const sourcesUl = createSourcesList(argumentObj.sources);
        li.appendChild(sourcesUl);
      }

      ul.appendChild(li);
    });

    elements.argumentsContainerEl.appendChild(ul);
  }

  function createSourcesList(sources) {
    const sourcesUl = document.createElement('ul');
    sourcesUl.className = 'tree';

    sources.forEach((source) => {
      const sourceLi = document.createElement('li');
      const sourceDiv = document.createElement('div');
      sourceDiv.className = 'tree-item';

      const sourceBadge = document.createElement('span');
      sourceBadge.className = 'tree-badge badge-source';
      sourceBadge.textContent = '來源';

      const sourceContent = document.createElement('span');
      sourceContent.className = 'tree-content';
      sourceContent.textContent = source;

      sourceDiv.appendChild(sourceBadge);
      sourceDiv.appendChild(sourceContent);
      sourceLi.appendChild(sourceDiv);
      sourcesUl.appendChild(sourceLi);
    });

    return sourcesUl;
  }

  function createScrollToHighlightHandler() {
    return (event) => {
      const idToScroll = event.currentTarget.dataset.highlightId;
      const tabData = getTabData();

      if (idToScroll && tabData.id) {
        chrome.tabs
          .sendMessage(tabData.id, {
            action: 'scrollToHighlight',
            highlightId: idToScroll
          })
          .then((response) => {
            if (!response || !response.success) {
              console.warn(
                `[Shared Logic] Element not found for ID: ${idToScroll}`
              );
            }
          })
          .catch((err) =>
            console.error(
              `[Shared Logic] Error scrolling to highlight ${idToScroll}:`,
              err
            )
          );
      }
    };
  }

  function renderChineseTerms(terms) {
    if (!elements.chineseTermsContainerEl) return;
    elements.chineseTermsContainerEl.innerHTML = '';

    if (!hasAnalysis) {
      elements.chineseTermsContainerEl.innerHTML =
        '<p class="not-analyzed">尚未分析</p>';
      return;
    }

    const safeTerms = Array.isArray(terms) ? terms : [];
    if (safeTerms.length === 0) {
      elements.chineseTermsContainerEl.innerHTML = '<p>沒有找到中國用語。</p>';
      return;
    }

    safeTerms.forEach((termObj) => {
      const span = document.createElement('span');
      span.className = 'chinese-term-item';
      span.textContent = termObj.term;

      const highlightId = termObj.highlightId;
      if (highlightId) {
        span.classList.add('clickable-list-item');
        span.dataset.highlightId = highlightId;
        span.addEventListener('click', createScrollToHighlightHandler());
      }

      elements.chineseTermsContainerEl.appendChild(span);
    });
  }

  function updateAnalysisUI(data, context = 'popup') {
    console.log('🔄 [SHARED] updateAnalysisUI called with context:', context);
    console.log('📊 [SHARED] Data received:', data ? 'Has data' : 'No data');

    // Check if Stage 3 results are currently displayed
    const stage3ResultsVisible =
      elements.stage3ResultsEl &&
      !elements.stage3ResultsEl.classList.contains('hidden') &&
      elements.stage3ResultsEl.style.display !== 'none';

    console.log('🎭 [SHARED] Stage 3 state check:', {
      stage3ElementExists: !!elements.stage3ResultsEl,
      hasHiddenClass: elements.stage3ResultsEl?.classList.contains('hidden'),
      displayStyle: elements.stage3ResultsEl?.style.display,
      stage3ResultsVisible
    });

    setCurrentAnalysisData(data);

    if (!data) {
      updateCredibilityLevel({ level: 'none', levelText: '尚未評估' });
      renderDomainStatus(null, false);
      if (elements.opinionsContainerEl)
        elements.opinionsContainerEl.innerHTML =
          '<p class="not-analyzed">尚未分析</p>';
      if (elements.argumentsContainerEl)
        elements.argumentsContainerEl.innerHTML =
          '<p class="not-analyzed">尚未分析</p>';
      if (elements.chineseTermsContainerEl)
        elements.chineseTermsContainerEl.innerHTML =
          '<p class="not-analyzed">尚未分析</p>';
      showAnalysisResults(context);

      // Hide Stage 3 results if no data
      if (stage3ResultsVisible) {
        console.log('🎭 [SHARED] Hiding Stage 3 results due to no data');
        elements.stage3ResultsEl.classList.add('hidden');
      }
      return;
    }

    const levelData = determineCredibilityLevel(data);
    updateCredibilityLevel(levelData);
    renderDomainStatus(data.domain, data.verified_domain, data.domain_info);

    // Only show opinion filters when Stage 2 is completed
    const showTags = data.stage2_completed === true;
    if (elements.opinionFilterEl) {
      elements.opinionFilterEl.classList.toggle('hidden', !showTags);
    }

    renderOpinionsTree(data.opinions, showTags);
    renderArgumentsTree(data.arguments);
    renderChineseTerms(data.chinese_terms);

    showAnalysisResults(context);

    // Preserve Stage 3 results visibility if they were shown
    if (stage3ResultsVisible) {
      console.log('✅ [SHARED] Preserving Stage 3 results visibility');
      elements.stage3ResultsEl.classList.remove('hidden');
      elements.stage3ResultsEl.style.display = 'block';
    }
  }

  // Edit form functionality
  function populateEditForm() {
    if (!elements.editOpinionsEl || !elements.editArgumentsEl) return;
    elements.editOpinionsEl.innerHTML = '';
    elements.editArgumentsEl.innerHTML = '';

    if (!currentAnalysis) return;

    if (
      Array.isArray(currentAnalysis.opinions) &&
      currentAnalysis.opinions.length > 0
    ) {
      currentAnalysis.opinions.forEach((opinion, index) => {
        elements.editOpinionsEl.appendChild(
          createOpinionEditItem(opinion, index)
        );
      });
    }

    const args = Array.isArray(currentAnalysis.arguments)
      ? currentAnalysis.arguments.map((argument) =>
          typeof argument === 'string' ? { argument, sources: [] } : argument
        )
      : [];

    args.forEach((argument, index) => {
      elements.editArgumentsEl.appendChild(
        createArgumentEditItem(argument, index)
      );
    });
  }

  function createOpinionEditItem(opinion, index) {
    const opinionObj =
      typeof opinion === 'string'
        ? { opinion, related_arguments: [] }
        : opinion;

    const container = document.createElement('div');
    container.className = 'edit-item';
    container.dataset.index = index;

    const textarea = document.createElement('textarea');
    textarea.className = 'edit-text';
    textarea.rows = 2;
    textarea.placeholder = '輸入觀點';
    textarea.value = opinionObj.opinion;
    container.appendChild(textarea);

    const relatedArgumentsDiv = document.createElement('div');
    relatedArgumentsDiv.className = 'related-arguments';

    const relatedArgumentsLabel = document.createElement('div');
    relatedArgumentsLabel.textContent = '相關論據：';
    relatedArgumentsDiv.appendChild(relatedArgumentsLabel);

    const relatedArgumentsContainer = document.createElement('div');
    relatedArgumentsContainer.className = 'related-arguments-container';

    if (
      opinionObj.related_arguments &&
      opinionObj.related_arguments.length > 0
    ) {
      opinionObj.related_arguments.forEach((argumentText, argumentIndex) => {
        relatedArgumentsContainer.appendChild(
          createRelatedArgumentRow(argumentText, argumentIndex)
        );
      });
    } else {
      relatedArgumentsContainer.appendChild(createRelatedArgumentRow('', 0));
    }

    relatedArgumentsDiv.appendChild(relatedArgumentsContainer);

    const addRelatedArgumentBtn = document.createElement('button');
    addRelatedArgumentBtn.className = 'edit-action-btn';
    addRelatedArgumentBtn.textContent = '+ 新增相關論據';
    addRelatedArgumentBtn.onclick = (e) => {
      e.preventDefault();
      relatedArgumentsContainer.appendChild(
        createRelatedArgumentRow('', relatedArgumentsContainer.children.length)
      );
    };

    relatedArgumentsDiv.appendChild(addRelatedArgumentBtn);
    container.appendChild(relatedArgumentsDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'edit-actions';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'edit-action-btn';
    removeBtn.textContent = '移除';
    removeBtn.onclick = (e) => {
      e.preventDefault();
      container.remove();
    };

    actionsDiv.appendChild(removeBtn);
    container.appendChild(actionsDiv);

    return container;
  }

  function createRelatedArgumentRow(argumentText, index) {
    const row = document.createElement('div');
    row.className = 'related-argument-row';
    row.dataset.index = index;

    const select = document.createElement('select');
    select.className = 'related-argument-select';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- 選擇一個論據 --';
    select.appendChild(emptyOption);

    if (currentAnalysis && Array.isArray(currentAnalysis.arguments)) {
      const args = currentAnalysis.arguments.map((argument) =>
        typeof argument === 'string' ? argument : argument.argument
      );

      args.forEach((argument) => {
        const option = document.createElement('option');
        option.value = argument;
        option.textContent =
          argument.length > 40 ? argument.substring(0, 40) + '...' : argument;
        option.selected = argument === argumentText;
        select.appendChild(option);
      });
    }

    row.appendChild(select);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'edit-action-btn';
    removeBtn.textContent = 'x';
    removeBtn.onclick = (e) => {
      e.preventDefault();
      row.remove();
    };

    row.appendChild(removeBtn);
    return row;
  }

  function createArgumentEditItem(argument, index) {
    const container = document.createElement('div');
    container.className = 'edit-item';
    container.dataset.index = index;

    const textarea = document.createElement('textarea');
    textarea.className = 'edit-text';
    textarea.rows = 2;
    textarea.placeholder = '輸入論據';
    textarea.value = argument.argument;
    container.appendChild(textarea);

    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'argument-sources';

    const sourcesLabel = document.createElement('div');
    sourcesLabel.textContent = '來源：';
    sourcesDiv.appendChild(sourcesLabel);

    const sourcesContainer = document.createElement('div');
    sourcesContainer.className = 'sources-container';

    if (argument.sources && argument.sources.length > 0) {
      argument.sources.forEach((source, sourceIndex) => {
        sourcesContainer.appendChild(createSourceRow(source, sourceIndex));
      });
    } else {
      sourcesContainer.appendChild(createSourceRow('', 0));
    }

    sourcesDiv.appendChild(sourcesContainer);

    const addSourceBtn = document.createElement('button');
    addSourceBtn.className = 'edit-action-btn';
    addSourceBtn.textContent = '+ 新增來源';
    addSourceBtn.onclick = (e) => {
      e.preventDefault();
      sourcesContainer.appendChild(
        createSourceRow('', sourcesContainer.children.length)
      );
    };

    sourcesDiv.appendChild(addSourceBtn);
    container.appendChild(sourcesDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'edit-actions';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'edit-action-btn';
    removeBtn.textContent = '移除';
    removeBtn.onclick = (e) => {
      e.preventDefault();
      container.remove();
    };

    actionsDiv.appendChild(removeBtn);
    container.appendChild(actionsDiv);

    return container;
  }

  function createSourceRow(sourceText, index) {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.dataset.index = index;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'source-input';
    input.placeholder = '來源連結或描述';
    input.value = sourceText;
    row.appendChild(input);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'edit-action-btn';
    removeBtn.textContent = 'x';
    removeBtn.onclick = (e) => {
      e.preventDefault();
      row.remove();
    };

    row.appendChild(removeBtn);
    return row;
  }

  function collectEditedData() {
    const args = [];
    const opinions = [];

    if (elements.editArgumentsEl) {
      elements.editArgumentsEl
        .querySelectorAll('.edit-item')
        .forEach((argumentItem) => {
          const argumentText = argumentItem
            .querySelector('textarea')
            .value.trim();
          if (!argumentText) return;

          const sources = [];
          argumentItem
            .querySelectorAll('.source-input')
            .forEach((sourceInput) => {
              const sourceText = sourceInput.value.trim();
              if (sourceText) sources.push(sourceText);
            });

          args.push({ argument: argumentText, sources });
        });
    }

    if (elements.editOpinionsEl) {
      elements.editOpinionsEl
        .querySelectorAll('.edit-item')
        .forEach((opinionItem) => {
          const opinionText = opinionItem
            .querySelector('textarea')
            .value.trim();
          if (!opinionText) return;

          const relatedArguments = [];
          opinionItem
            .querySelectorAll('.related-argument-select')
            .forEach((select) => {
              const argumentText = select.value;
              if (argumentText) relatedArguments.push(argumentText);
            });

          opinions.push({
            opinion: opinionText,
            related_arguments: relatedArguments
          });
        });
    }

    return { arguments: args, opinions };
  }

  // Chrome API interaction
  function getCurrentTabInfo(callback) {
    // For sidepanel, we can't directly query tabs without activeTab permission
    // So we rely on the currentActiveTabUrl passed during initialization
    // If needed, user must grant activeTab permission via the extension UI

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (
        !tabs ||
        !tabs[0] ||
        !tabs[0].id ||
        !tabs[0].url ||
        tabs[0].url.startsWith('chrome://') ||
        tabs[0].url.startsWith('https://chromewebstore.google.com/')
      ) {
        console.log('❌ [SHARED] No valid active tab found');
        callback(null);
        return;
      }

      const tab = tabs[0];
      console.log('✅ [SHARED] Got tab info:', {
        id: tab.id,
        url: tab.url?.substring(0, 50)
      });
      setTabData(tab.url, tab.title, tab.id);
      callback({ url: tab.url, title: tab.title, id: tab.id });
    });
  }

  async function fetchAnalysisForTab(tabId, context = 'sidepanel') {
    if (!tabId) {
      showPermissionPrompt();
      updateAnalysisUI(null, context);
      return;
    }

    activeTabId = tabId;

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'getAnalysisResults'
      });

      // Check if analysis is in progress
      if (response && response.isAnalyzing) {
        console.log('⏳ [SHARED] Analysis in progress for tab', tabId);
        showLoading();
        return;
      }

      if (response && response.data) {
        let tabInfo = getTabData();
        if (tabInfo.id !== tabId) {
          try {
            const queriedTab = await chrome.tabs.get(tabId);
            setTabData(queriedTab.url, queriedTab.title, tabId);
          } catch (tabGetError) {
            console.warn(
              `Could not get tab info for ${tabId}: ${tabGetError.message}. Using existing data.`
            );
          }
        }
        // Always update UI when we have response data (fix: was only updating when tabInfo.id === tabId)
        updateAnalysisUI(response.data, context);
      } else {
        updateAnalysisUI(null, context);
        showAnalysisResults(context);
      }
    } catch (error) {
      console.log(
        `Could not message tab ${tabId} (haven't get content access): ${error.message}`
      );
      updateAnalysisUI(null, context);
      showPermissionPrompt();
    }
  }

  // Public API
  return {
    setElements,
    setCurrentAnalysisData,
    getCurrentAnalysisData,
    setTabData,
    getTabData,
    getHasAnalysis,
    showError,
    hideError,
    showLoading,
    hideLoading,
    showAnalysisResults,
    showEditForm,
    showPermissionPrompt,
    hidePermissionPrompt,
    updateAnalysisUI,
    createOpinionEditItem,
    createArgumentEditItem,
    collectEditedData,
    getCurrentTabInfo,
    fetchAnalysisForTab,
    renderOpinionsTree,
    setTabTagFilters
  };
})();
