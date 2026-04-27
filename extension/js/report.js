document.addEventListener('DOMContentLoaded', () => {
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // DOM elements
  const loadingEl = document.getElementById('loading');
  const errorMessageEl = document.getElementById('error-message');
  const reportContentEl = document.getElementById('report-content');

  const reportDateEl = document.querySelector('#report-date span');
  const reportUrlEl = document.querySelector('#report-url a');
  const reportTitleEl = document.querySelector('#report-title span');

  const domainValueEl = document.getElementById('domain-value');
  const domainVerifiedEl = document.getElementById('domain-verified');
  const domainUnverifiedEl = document.getElementById('domain-unverified');
  const domainUnknownEl = document.getElementById('domain-unknown');
  const domainOrgNameEl = document.getElementById('domain-org-name');
  const domainSummaryEl = document.getElementById('domain-summary');
  const domainDetailsEl = document.getElementById('domain-details');
  const domainDescriptionEl = document.getElementById('domain-description');
  const domainMetaEl = document.getElementById('domain-meta');
  const domainCategoryEl = document.getElementById('domain-category');
  const domainCountryEl = document.getElementById('domain-country');
  const domainStanceEl = document.getElementById('domain-stance');
  const domainCredibilityNotesEl = document.getElementById(
    'domain-credibility-notes'
  );

  const opinionsSummaryEl = document.getElementById('opinions-summary');
  const opinionsContainerEl = document.getElementById('opinions-container');

  const argumentsSummaryEl = document.getElementById('arguments-summary');
  const argumentsContainerEl = document.getElementById('arguments-container');
  const argumentStatsCorrectEl = document.querySelector(
    '.stat-item.correct span'
  );
  const argumentStatsIncorrectEl = document.querySelector(
    '.stat-item.incorrect span'
  );
  const argumentStatsUnverifiedEl = document.querySelector(
    '.stat-item.unverified span'
  );

  const chineseTermsSummaryEl = document.getElementById(
    'chinese-terms-summary'
  );
  const chineseTermsContainerEl = document.getElementById(
    'chinese-terms-container'
  );

  const assessmentLevelIndicatorEl = document.getElementById(
    'assessment-level-indicator'
  );
  const assessmentCommentEl = document.getElementById('assessment-comment');

  const printReportBtn = document.getElementById('print-report');
  const exportPdfBtn = document.getElementById('export-pdf');
  const closeReportBtn = document.getElementById('close-report');

  // Set current date in the report
  const now = new Date();
  reportDateEl.textContent = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // UI state management
  function showError(message) {
    errorMessageEl.textContent = message;
    errorMessageEl.classList.remove('hidden');
    loadingEl.classList.add('hidden');
  }

  function showContent() {
    loadingEl.classList.add('hidden');
    reportContentEl.classList.remove('hidden');
  }

  // Data loading
  function loadReportData() {
    chrome.storage.local.get(
      ['currentURL', 'currentTitle', 'analysisData'],
      (data) => {
        if (data.currentURL) {
          reportUrlEl.textContent = data.currentURL;
          reportUrlEl.href = data.currentURL;
          reportTitleEl.textContent = data.currentTitle || '未知標題';
        }

        if (data.analysisData) {
          renderReport(data.analysisData);
        } else {
          showError('無法載入分析資料');
        }
      }
    );
  }

  // Domain status rendering
  function renderDomainStatus(domain, isVerified, domainInfo = null) {
    domainValueEl.textContent = domain || '未分析';

    // Hide all status badges first
    domainVerifiedEl.classList.add('hidden');
    domainUnverifiedEl.classList.add('hidden');
    domainUnknownEl?.classList.add('hidden');

    if (domainInfo && domainInfo.category) {
      // Use category to show appropriate label
      const category = domainInfo.category.toLowerCase();
      const label = getDomainTypeLabel(category, isVerified);

      if (isVerified === false) {
        domainUnverifiedEl.textContent = label;
        domainUnverifiedEl.classList.remove('hidden');
      } else if (isVerified === true) {
        domainVerifiedEl.textContent = label;
        domainVerifiedEl.classList.remove('hidden');
      } else {
        domainUnknownEl?.classList.remove('hidden');
      }
    } else {
      // Fallback to basic verified/unverified
      if (isVerified === true) {
        domainVerifiedEl.textContent = '已驗證';
        domainVerifiedEl.classList.remove('hidden');
      } else if (isVerified === false) {
        domainUnverifiedEl.textContent = '未驗證';
        domainUnverifiedEl.classList.remove('hidden');
      } else {
        domainUnknownEl?.classList.remove('hidden');
      }
    }

    // Render additional domain info if available
    if (domainInfo) {
      renderDomainDetails(domainInfo);
    } else {
      clearDomainDetails();
    }
  }

  function getDomainTypeLabel(category, isAuthentic) {
    const categoryLabels = {
      official_gov: '政府官方',
      official_org: '官方組織',
      news_mainstream: '主流媒體',
      news_local: '地方媒體',
      news_international: '國際媒體',
      social_media: '社群平台',
      content_farm: '內容農場',
      suspicious: '可疑來源',
      phishing: '釣魚網站',
      educational: '教育機構',
      commercial: '商業網站',
      personal_blog: '個人部落格',
      unknown: '未知來源'
    };
    return categoryLabels[category] || (isAuthentic ? '已驗證' : '未驗證');
  }

  function renderDomainDetails(domainInfo) {
    // Organization name
    if (domainInfo.organizationName && domainOrgNameEl) {
      domainOrgNameEl.textContent = domainInfo.organizationName;
      domainOrgNameEl.classList.remove('hidden');
    } else {
      domainOrgNameEl?.classList.add('hidden');
    }

    // Summary
    if (domainInfo.summary && domainSummaryEl) {
      domainSummaryEl.textContent = domainInfo.summary;
      domainSummaryEl.classList.remove('hidden');
    } else {
      domainSummaryEl?.classList.add('hidden');
    }

    // Description
    if (domainInfo.description && domainDescriptionEl) {
      domainDescriptionEl.textContent = domainInfo.description;
      domainDescriptionEl.classList.remove('hidden');
    } else {
      domainDescriptionEl?.classList.add('hidden');
    }

    // Category tag
    if (domainInfo.category && domainCategoryEl) {
      const categoryLabels = {
        official_gov: '政府官方',
        official_org: '官方組織',
        news_mainstream: '主流媒體',
        news_local: '地方媒體',
        news_international: '國際媒體',
        social_media: '社群平台',
        content_farm: '內容農場',
        suspicious: '可疑來源',
        phishing: '釣魚網站',
        educational: '教育機構',
        commercial: '商業網站',
        personal_blog: '個人部落格'
      };
      domainCategoryEl.textContent =
        categoryLabels[domainInfo.category] || domainInfo.category;
      domainMetaEl?.classList.remove('hidden');
    }

    // Country tag
    if (domainInfo.country && domainCountryEl) {
      domainCountryEl.textContent = domainInfo.country;
      domainMetaEl?.classList.remove('hidden');
    }

    // Political stance
    if (domainInfo.politicalStance && domainStanceEl) {
      domainStanceEl.textContent = domainInfo.politicalStance;
      domainStanceEl.classList.remove('hidden');
      domainMetaEl?.classList.remove('hidden');
    } else {
      domainStanceEl?.classList.add('hidden');
    }

    // Credibility notes
    if (domainInfo.credibilityNotes && domainCredibilityNotesEl) {
      domainCredibilityNotesEl.textContent = domainInfo.credibilityNotes;
      domainCredibilityNotesEl.classList.remove('hidden');
    } else {
      domainCredibilityNotesEl?.classList.add('hidden');
    }

    // Show details section if there's content
    const hasDetails =
      domainInfo.description ||
      domainInfo.category ||
      domainInfo.country ||
      domainInfo.credibilityNotes;
    if (hasDetails && domainDetailsEl) {
      domainDetailsEl.classList.remove('hidden');

      // Setup toggle listener to change summary text
      if (!domainDetailsEl._toggleListenerAdded) {
        const summaryToggle = domainDetailsEl.querySelector('summary');
        if (summaryToggle) {
          domainDetailsEl.addEventListener('toggle', () => {
            summaryToggle.textContent = domainDetailsEl.open
              ? '隱藏更多資訊'
              : '顯示更多資訊';
          });
          domainDetailsEl._toggleListenerAdded = true;
        }
      }
    } else {
      domainDetailsEl?.classList.add('hidden');
    }
  }

  function clearDomainDetails() {
    domainOrgNameEl?.classList.add('hidden');
    domainSummaryEl?.classList.add('hidden');
    domainDetailsEl?.classList.add('hidden');
    domainDescriptionEl?.classList.add('hidden');
    domainMetaEl?.classList.add('hidden');
    domainCredibilityNotesEl?.classList.add('hidden');
  }

  // Opinions rendering
  function renderOpinionsTree(opinions) {
    opinionsContainerEl.innerHTML = '';

    if (!Array.isArray(opinions) || opinions.length === 0) {
      opinionsContainerEl.innerHTML = '<p>沒有找到觀點。</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'tree';

    opinions.forEach((opinionObj) => {
      const li = document.createElement('li');
      const opinionDiv = document.createElement('div');
      opinionDiv.className = 'tree-item';

      const opinionBadge = document.createElement('span');
      opinionBadge.className = 'tree-badge badge-opinion';
      opinionBadge.textContent = '觀點';

      const opinionContent = document.createElement('span');
      opinionContent.className = 'tree-content';

      if (!opinionObj.keyword) {
        opinionContent.textContent = opinionObj.opinion;
      } else {
        opinionContent.innerHTML = `${escapeHtml(opinionObj.opinion)} <br><span class="tree-keyword">建議搜尋: <a href="https://www.google.com/search?q=${encodeURIComponent(opinionObj.keyword)}" target="_blank">${escapeHtml(opinionObj.keyword)}</a></span>`;
      }

      if (opinionObj.tag) {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'tree-badge';
        tagBadge.textContent = opinionObj.tag;
        opinionDiv.appendChild(tagBadge);
      }

      opinionDiv.appendChild(opinionBadge);
      opinionDiv.appendChild(opinionContent);
      li.appendChild(opinionDiv);

      const branchUl = createOpinioinBranch(
        opinionObj.related_arguments,
        opinionObj.verification
      );
      li.appendChild(branchUl);

      ul.appendChild(li);
    });

    opinionsContainerEl.appendChild(ul);
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

  // Arguments rendering
  function renderArgumentsTree(args) {
    argumentsContainerEl.innerHTML = '';

    if (!Array.isArray(args) || args.length === 0) {
      argumentsContainerEl.innerHTML = '<p>沒有找到論據。</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'tree';

    args.forEach((argumentInput) => {
      const argumentObj =
        typeof argumentInput === 'string'
          ? { argument: argumentInput, tag: null, sources: [], keyword: null }
          : argumentInput;

      const li = document.createElement('li');
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
        argumentContent.innerHTML = `${escapeHtml(argumentObj.argument)} <br><span class="tree-keyword">建議搜尋: <a href="https://www.google.com/search?q=${encodeURIComponent(argumentObj.keyword)}" target="_blank">${escapeHtml(argumentObj.keyword)}</a></span>`;
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

      // Sources rendering
      if (argumentObj.sources && argumentObj.sources.length > 0) {
        const sourcesUl = document.createElement('ul');
        sourcesUl.className = 'tree';

        argumentObj.sources.forEach((source) => {
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

        li.appendChild(sourcesUl);
      }

      ul.appendChild(li);
    });

    argumentsContainerEl.appendChild(ul);
  }

  // Chinese terms rendering
  function renderChineseTerms(terms) {
    chineseTermsContainerEl.innerHTML = '';

    if (!Array.isArray(terms) || terms.length === 0) {
      chineseTermsContainerEl.innerHTML = '<p>沒有找到中國用語。</p>';
      return;
    }

    terms.forEach((term) => {
      const span = document.createElement('span');
      span.className = 'chinese-term-item';
      span.textContent = typeof term === 'string' ? term : term.term;
      chineseTermsContainerEl.appendChild(span);
    });
  }

  // Argument statistics calculation
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

  // Opinion with arguments count calculation
  function calculateOpinionsWithArguments(opinions) {
    if (!Array.isArray(opinions)) return 0;

    return opinions.filter(
      (opinion) =>
        opinion.related_arguments && opinion.related_arguments.length > 0
    ).length;
  }

  // Credibility level determination
  function determineCredibilityLevel(data) {
    if (
      !data ||
      !Array.isArray(data.arguments) ||
      data.arguments.length === 0
    ) {
      return {
        level: 'none',
        levelText: '尚未分析',
        comment: '尚未分析此新聞內容'
      };
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
      return {
        level: 'danger',
        levelText: '可能有問題',
        comment:
          '超過10%的論據被標記為錯誤，內容可信度存疑。請謹慎評估此新聞資訊。'
      };
    } else if (unverifiedPercentage >= 50) {
      return {
        level: 'warning',
        levelText: '很多未認證論據須小心',
        comment: '超過50%的論據陳述未經驗證，建議尋找其他來源進行交叉確認。'
      };
    } else {
      return {
        level: 'ok',
        levelText: '應該沒問題',
        comment:
          '大部分論據已經過驗證，且錯誤資訊比例較低。此新聞內容大致可信。'
      };
    }
  }

  // Credibility level UI update
  function renderCredibilityLevel(levelData) {
    assessmentLevelIndicatorEl.classList.remove(
      'level-ok',
      'level-warning',
      'level-danger',
      'not-analyzed'
    );
    assessmentCommentEl.classList.remove('not-analyzed');

    if (levelData.level === 'none') {
      assessmentLevelIndicatorEl.classList.add('not-analyzed');
      assessmentCommentEl.classList.add('not-analyzed');
    } else {
      assessmentLevelIndicatorEl.classList.add(`level-${levelData.level}`);
    }

    assessmentLevelIndicatorEl.querySelector('.level-text').textContent =
      levelData.levelText;
    assessmentCommentEl.textContent = levelData.comment;
  }

  // Main report rendering function
  function renderReport(data) {
    if (!data) {
      showError('無法載入分析資料');
      return;
    }

    // 1. Determine and render credibility level
    const credibilityLevel = determineCredibilityLevel(data);
    renderCredibilityLevel(credibilityLevel);

    // 2. Render domain status
    renderDomainStatus(data.domain, data.verified_domain, data.domain_info);

    // 3. Render opinions
    const opinionCount = Array.isArray(data.opinions)
      ? data.opinions.length
      : 0;
    const opinionsWithArguments = calculateOpinionsWithArguments(data.opinions);
    opinionsSummaryEl.innerHTML = `本文包含 <span class="highlight-count">${opinionCount}</span> 個觀點，其中有 <span class="highlight-count">${opinionsWithArguments}</span> 個有論據佐證。`;
    renderOpinionsTree(data.opinions);

    // 4. Render arguments
    const argumentStats = calculateArgumentStats(data.arguments);
    argumentsSummaryEl.innerHTML = `本文包含 <span class="highlight-count">${argumentStats.total}</span> 個論據陳述，共有 <span class="highlight-count">${argumentStats.sourcesCount}</span> 個來源佐證。`;
    argumentStatsCorrectEl.textContent = argumentStats.correct;
    argumentStatsIncorrectEl.textContent = argumentStats.incorrect;
    argumentStatsUnverifiedEl.textContent = argumentStats.unverified;
    renderArgumentsTree(data.arguments);

    // 5. Render Chinese terms
    const chineseTermsCount = Array.isArray(data.chinese_terms)
      ? data.chinese_terms.length
      : 0;
    chineseTermsSummaryEl.innerHTML = `本文包含 <span class="highlight-count">${chineseTermsCount}</span> 個疑似中國用語。`;
    renderChineseTerms(data.chinese_terms);

    // Show report content
    showContent();
  }

  // Event listeners
  printReportBtn.addEventListener('click', () => window.print());
  exportPdfBtn.addEventListener('click', () => window.print()); // Uses browser's print-to-PDF
  closeReportBtn.addEventListener('click', () => window.close());

  // Load report data on page load
  loadReportData();
});
