// Comment system using Google OAuth instead of Firebase
// Integrates with the backend API for comment storage and retrieval

const _TAGS = [
  '疑美論',
  '國防安全',
  '公共衛生',
  '經濟貿易',
  '無論據佐證',
  '中國用語'
];
const CACHE_TTL_MS = 3000 * 60; // 3 minutes

/* ---------- backend API ---------- */
// 使用全局配置（從 config.js 注入）
const apiEndpoint =
  typeof window !== 'undefined' && window.APP_CONFIG
    ? window.APP_CONFIG.API_ENDPOINT
    : 'http://localhost:4999/api';

/* ---------- dom refs ---------- */
let _container, msgList, formEl, textarea, sendBtn, tagSelector;
let loginBtn, logoutBtn, userDisplay;
let commentFilters;

let articleId = null;
let allComments = [];
let activeFilters = ['全部']; // Default to showing all comments
let currentUser = null;

/* ------------------------- PUBLIC ENTRY ------------------------- */
export function initCommentArea(wrapper, initialUrl = null) {
  console.log(
    '🚀 Chat system initializing...',
    initialUrl ? `with URL: ${initialUrl}` : ''
  );

  _container = wrapper;
  msgList = wrapper.querySelector('#chat-list');
  formEl = wrapper.querySelector('#chat-form');
  textarea = wrapper.querySelector('#chat-input');
  sendBtn = formEl.querySelector('button');
  tagSelector = wrapper.querySelector('#comment-tag');
  loginBtn = wrapper.querySelector('#login-btn');
  logoutBtn = wrapper.querySelector('#logout-btn');
  userDisplay = wrapper.querySelector('#user-display');
  commentFilters = wrapper.querySelector('#comment-filters');

  if (!msgList || !formEl || !textarea) {
    console.log('❌ Required chat elements not found');
    return;
  }

  articleId = initialUrl || null;
  allComments = [];
  activeFilters = ['全部'];
  currentUser = null;

  /* UI events */
  formEl.addEventListener('submit', handleSubmit);
  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);

  /* Filter events */
  if (commentFilters) {
    commentFilters.addEventListener('click', handleFilterClick);
  }

  /* Listen for auth state changes from other parts of extension (e.g., settings page) */
  chrome.storage.onChanged.addListener(handleStorageChange);

  console.log('🔐 Loading auth and comments...');
  /* Load auth state and comments */
  loadAuthState();
}

/**
 * Handle storage changes to sync login state across extension components
 * This ensures that when user logs in/out from settings page,
 * the comment area will update accordingly
 */
function handleStorageChange(changes, areaName) {
  if (areaName !== 'local') return;

  // Check if auth-related keys changed
  if (changes.authToken || changes.userInfo) {
    console.log('🔄 [CHAT] Auth state changed externally, reloading...');
    loadAuthState();
  }
}

/* ------------------------- ENCRYPTION KEY ------------------------- */
/**
 * Setup encryption key for API calls
 * This is required for the analysis API to work
 */
async function setupEncryptionKey(googleId) {
  const storageKey = `encryptionKey_${googleId}`;
  const existingKeyData = await chrome.storage.local.get([storageKey]);

  if (existingKeyData[storageKey]) {
    console.log('🔑 [CHAT] Encryption key already exists for user');
    return existingKeyData[storageKey];
  }

  // Generate a cryptographically secure random key
  const key = await crypto.subtle.generateKey(
    {
      name: 'AES-CBC',
      length: 256
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  // Export the key to base64 for storage
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  const keyArray = new Uint8Array(exportedKey);
  const keyBase64 = btoa(String.fromCharCode(...keyArray));

  // Store the key securely
  await chrome.storage.local.set({ [storageKey]: keyBase64 });
  console.log('🔑 [CHAT] New encryption key generated and stored');

  return keyBase64;
}

// Remove the Firebase email link handler
export async function handlePossibleEmailLink() {
  // No longer needed with Google OAuth
  return false;
}

/* ------------------------- AUTH ------------------------- */

/**
 * Silently refresh the OAuth token without user interaction
 * Returns true if refresh succeeded, false otherwise
 */
async function silentTokenRefresh() {
  try {
    console.log('🔄 Attempting silent token refresh...');

    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2.client_id;
    const scopes = manifest.oauth2.scopes.join(' ');
    const redirectUri = chrome.identity.getRedirectURL();

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('prompt', 'none'); // Silent refresh - no UI

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: false // Non-interactive
    });

    const url = new URL(responseUrl);
    const hashParams = new URLSearchParams(url.hash.substring(1));
    const token = hashParams.get('access_token');

    if (token) {
      console.log('✅ Silent token refresh succeeded');
      await handleAuthSuccess(token);
      return true;
    }
    return false;
  } catch (error) {
    console.log('❌ Silent token refresh failed:', error.message);
    return false;
  }
}

async function loadAuthState() {
  console.log('🔐 Loading auth state...');

  try {
    const { userInfo, authToken, tokenExpiresAt } =
      await chrome.storage.local.get([
        'userInfo',
        'authToken',
        'tokenExpiresAt'
      ]);

    if (userInfo && userInfo.email && authToken) {
      // Check if token is about to expire (within 5 minutes)
      const now = Date.now();
      const isExpiringSoon =
        tokenExpiresAt && tokenExpiresAt - now < 5 * 60 * 1000;

      if (isExpiringSoon) {
        console.log('⏰ Token expiring soon, attempting silent refresh...');
        const refreshed = await silentTokenRefresh();
        if (refreshed) {
          return; // Auth state updated by handleAuthSuccess
        }
        // If silent refresh failed, try to use existing token anyway
      }

      // Verify the token is still valid
      try {
        const response = await fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              Accept: 'application/json'
            }
          }
        );

        if (response.ok) {
          console.log('✅ User loaded:', userInfo.email);
          currentUser = userInfo;
          updateAuthUI(currentUser);
          updateComments(true);
          return;
        } else if (response.status === 401) {
          // Token expired, try silent refresh
          console.log('🔄 Token expired (401), attempting silent refresh...');
          const refreshed = await silentTokenRefresh();
          if (refreshed) {
            return;
          }
          // Silent refresh failed, clear storage
          console.log('❌ Silent refresh failed, clearing auth...');
          await chrome.storage.local.remove([
            'userInfo',
            'authToken',
            'tokenExpiresAt'
          ]);
        } else {
          console.log('❌ Token invalid, clearing...');
          await chrome.storage.local.remove([
            'userInfo',
            'authToken',
            'tokenExpiresAt'
          ]);
        }
      } catch (verifyError) {
        console.log('❌ Token verification failed:', verifyError);
        // Network error - keep the token, might work later
      }
    }

    console.log('❌ No valid auth found');
    currentUser = null;
    updateAuthUI(null);
    renderFilteredComments();
  } catch (error) {
    console.error('Auth state loading error:', error);
  }
}

async function handleLogin() {
  try {
    console.log('Starting Google OAuth login...');

    // Use launchWebAuthFlow for account picker
    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2.client_id;
    const scopes = manifest.oauth2.scopes.join(' ');
    const redirectUri = chrome.identity.getRedirectURL();

    console.log('Redirect URI:', redirectUri);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('prompt', 'select_account');

    console.log('Launching OAuth flow...');
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

    // Extract token from response URL
    const url = new URL(responseUrl);
    const hashParams = new URLSearchParams(url.hash.substring(1));
    const token = hashParams.get('access_token');

    if (!token) {
      throw new Error('No access token in response');
    }

    await handleAuthSuccess(token);
  } catch (error) {
    console.error('Login failed:', error);
    if (
      error.message.includes('canceled') ||
      error.message.includes('closed') ||
      error.message.includes('user')
    ) {
      return;
    }
    alert('登入失敗: ' + error.message);
  }
}

async function handleAuthSuccess(token) {
  try {
    // Convert token to string if needed
    let tokenStr = token;
    if (typeof token !== 'string') {
      if (token && token.token) {
        tokenStr = token.token;
      } else {
        throw new Error('Invalid token format');
      }
    }

    // Get user info from Google
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokenStr}`,
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Google API failed: ${response.status}`);
    }

    const userInfo = await response.json();
    console.log('User info received:', {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name
    });

    // Cache user info and token with expiry time (55 minutes from now, token lasts 60 min)
    const tokenExpiresAt = Date.now() + 55 * 60 * 1000;
    await chrome.storage.local.set({
      userInfo,
      authToken: tokenStr,
      tokenExpiresAt
    });

    // Generate and store encryption key for this user (required for API calls)
    await setupEncryptionKey(userInfo.id);

    currentUser = userInfo;
    updateAuthUI(userInfo);
    updateComments(true); // Force refresh after login to get updated user-specific data
  } catch (error) {
    console.error('Auth success handler failed:', error);
    throw error;
  }
}

async function handleLogout() {
  try {
    // Get token from storage for revocation
    const { authToken } = await chrome.storage.local.get(['authToken']);

    if (authToken) {
      // Revoke the token with Google to force re-authentication
      try {
        await fetch(
          `https://accounts.google.com/o/oauth2/revoke?token=${authToken}`
        );
        console.log('Token revoked with Google');
      } catch (revokeError) {
        console.log(
          'Token revoke failed (may already be invalid):',
          revokeError
        );
      }
    }

    // Also try to clear Chrome identity cache (for legacy sessions)
    try {
      await chrome.identity.clearAllCachedAuthTokens();
    } catch (identityError) {
      console.log('Identity cache clear failed:', identityError);
    }

    // Clear all local storage
    await chrome.storage.local.clear();

    // Reset state
    currentUser = null;
    allComments = [];
    updateAuthUI(null);
    renderFilteredComments();

    console.log('User logged out successfully');
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

function updateAuthUI(user) {
  const loggedIn = !!user;
  textarea.disabled = tagSelector.disabled = sendBtn.disabled = !loggedIn;
  textarea.placeholder = loggedIn ? '輸入留言…' : '登入後才能留言';
  loginBtn.classList.toggle('hidden', loggedIn);
  logoutBtn.classList.toggle('hidden', !loggedIn);
  userDisplay.textContent = loggedIn
    ? `${user.name || user.email || '訪客'}`
    : '尚未登入';
}

/* ------------------------- FILTER HANDLING ------------------------- */
function handleFilterClick(e) {
  const target = e.target;
  if (target.tagName !== 'BUTTON' || !target.hasAttribute('data-tag')) {
    return;
  }

  const selectedTag = target.getAttribute('data-tag');

  if (selectedTag === '全部') {
    // If "全部" is clicked, deactivate all others and show all comments
    activeFilters = ['全部'];
    document.querySelectorAll('.filter-btn.comment-options').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tag') === '全部');
    });
  } else {
    // Remove "全部" from active filters when a specific tag is selected
    const allIndex = activeFilters.indexOf('全部');
    if (allIndex > -1) {
      activeFilters.splice(allIndex, 1);
      document
        .querySelector('.filter-btn.comment-options[data-tag="全部"]')
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
        .querySelector('.filter-btn.comment-options[data-tag="全部"]')
        .classList.add('active');
    }
  }

  // Re-render comments with active filters
  renderFilteredComments();
}

/* ------------------------- DATA FETCHING / RENDERING ------------------------- */
async function updateComments(forceRefresh = false) {
  console.log(
    '🔄 Updating comments...',
    'Current articleId:',
    articleId,
    'forceRefresh:',
    forceRefresh
  );

  articleId = articleId || (await calcArticleId());

  console.log('📍 [CHAT] Final articleId for comments:', articleId);

  if (!articleId) {
    console.log('❌ No article ID available');
    return;
  }

  const cacheKey = `chatCache_${articleId}`;
  const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');

  console.log('💾 [CHAT] Cache check:', {
    hasCached: !!cached,
    cacheAge: cached ? Date.now() - cached.stamp : 'N/A',
    ttl: CACHE_TTL_MS,
    isExpired: cached ? Date.now() - cached.stamp >= CACHE_TTL_MS : 'N/A',
    forceRefresh
  });

  // Use cache if available and not expired and not forcing refresh
  if (!forceRefresh && cached && Date.now() - cached.stamp < CACHE_TTL_MS) {
    console.log('✅ [CHAT] Using cached comments:', cached.data.length);
    allComments = cached.data;
    renderFilteredComments();
    return;
  }

  console.log('🌐 Fetching from API...');

  try {
    // Fetch comments from backend API
    const url = `${apiEndpoint}/comments/${encodeURIComponent(articleId)}`;

    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Received:', data?.comments?.length || 0, 'comments');
      allComments = data.comments || [];

      // Cache the data
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ stamp: Date.now(), data: allComments })
      );

      console.log('💬 Comments loaded:', allComments.length);
      console.log('💬 [CHAT] Comments details:', allComments);
    } else {
      const errorText = await response.text();
      console.error(
        '❌ [CHAT] Failed to fetch comments:',
        response.status,
        errorText
      );
      allComments = [];
    }
  } catch (error) {
    console.error('❌ [CHAT] Error fetching comments:', error);
    allComments = [];
  }

  console.log('🎨 [CHAT] Rendering comments...');
  renderFilteredComments();
}

function renderFilteredComments() {
  console.log(
    '🎨 [CHAT] Rendering comments. Total:',
    allComments.length,
    'Active filters:',
    activeFilters
  );
  msgList.innerHTML = '';

  // If "全部" is active, show all comments
  const showAll = activeFilters.includes('全部');
  console.log('🔍 [CHAT] Show all comments:', showAll);

  let renderedCount = 0;
  allComments.forEach((comment, index) => {
    console.log(`💬 [CHAT] Comment ${index}:`, comment);
    if (showAll || activeFilters.includes(comment.tag)) {
      console.log(`✅ [CHAT] Rendering comment ${index} (tag: ${comment.tag})`);
      const li = document.createElement('li');
      li.className = 'comment-card';
      li.innerHTML = `
        <div class="comment-card-header">
          <div class="comment-author-section">
            <span class="comment-card-author">${escapeHtml(comment.author?.name || comment.user_name || '匿名')}</span>
            <span class="comment-tag tag-${comment.tag}">${comment.tag}</span>
          </div>
          <span class="comment-card-time">${formatTime(comment.createdAt || comment.created_at)}</span>
        </div>
        <div class="comment-card-body">${escapeHtml(comment.content)}</div>`;
      msgList.appendChild(li);
      renderedCount++;
    } else {
      console.log(
        `⏭️ [CHAT] Skipping comment ${index} (tag: ${comment.tag} not in filters)`
      );
    }
  });

  console.log(
    `🎨 [CHAT] Rendered ${renderedCount} out of ${allComments.length} comments`
  );
  msgList.scrollTop = msgList.scrollHeight;
  console.log('🎨 [CHAT] Final DOM element count:', msgList.children.length);
}

/* ------------------------- SUBMIT ------------------------- */
async function handleSubmit(e) {
  console.log('📝 [CHAT] handleSubmit called');
  e.preventDefault();

  if (!currentUser) {
    console.log('❌ [CHAT] No current user');
    if (confirm('請先登入才能留言。是否前往設定頁面登入？')) {
      chrome.runtime.openOptionsPage();
    }
    return;
  }

  const text = textarea.value.trim();
  if (!text) {
    console.log('❌ [CHAT] Empty text');
    return;
  }

  const selectedTag = tagSelector.value;
  console.log('📝 [CHAT] Comment data:', {
    text,
    selectedTag,
    currentUser: currentUser.email
  });

  if (!articleId) articleId = await calcArticleId();
  console.log('📰 [CHAT] Article ID for comment:', articleId);

  try {
    // Get auth token
    const { authToken } = await chrome.storage.local.get(['authToken']);
    console.log('🎫 [CHAT] Auth token check:', authToken ? 'Found' : 'None');

    if (!authToken) {
      console.log('❌ [CHAT] No auth token');
      if (confirm('請先登入才能留言。是否前往設定頁面登入？')) {
        chrome.runtime.openOptionsPage();
      }
      return;
    }

    console.log('📝 [CHAT] Submitting comment:', {
      articleUrl: articleId,
      content: text.substring(0, 50) + '...',
      tag: selectedTag,
      hasToken: !!authToken
    });

    // Send comment to backend API
    const requestBody = {
      articleUrl: articleId,
      content: text,
      tag: selectedTag
    };
    console.log('📤 [CHAT] Request body:', requestBody);

    const response = await fetch(`${apiEndpoint}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📥 [CHAT] Submit response status:', response.status);
    console.log(
      '📥 [CHAT] Submit response headers:',
      Object.fromEntries(response.headers.entries())
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      console.error(
        '❌ [CHAT] Comment submission failed:',
        response.status,
        errorData
      );
      throw new Error(
        `HTTP ${response.status}: ${errorData.message || errorData.error || 'Unknown error'}`
      );
    }

    const result = await response.json();
    console.log('✅ [CHAT] Comment submitted successfully:', result);

    // Clear the form
    textarea.value = '';
    console.log('📝 [CHAT] Form cleared');

    // Clear cache and refresh comments to show new comment immediately
    if (articleId) {
      const cacheKey = `chatCache_${articleId}`;
      localStorage.removeItem(cacheKey);
      console.log('🗑️ [CHAT] Comment cache cleared');
    }

    console.log('🔄 [CHAT] Refreshing comments after submission...');
    await updateComments(true); // Force refresh to show new comment immediately
  } catch (error) {
    console.error('❌ [CHAT] Submit comment error:', error);
    alert('提交評論失敗: ' + error.message);
  }
}

/* ------------------------- HELPERS ------------------------- */
function calcArticleId() {
  return new Promise((res) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const url = tabs && tabs[0] ? tabs[0].url : '';
      if (!url) {
        res(null);
        return;
      }
      res(url);
    });
  });
}

function formatTime(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleString('zh-TW', { hour12: false });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(
    /[&<>"']/g,
    (s) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        s
      ]
  );
}
