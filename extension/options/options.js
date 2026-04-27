class OptionsManager {
  constructor() {
    this.userEncryptionKey = null;
    this.user = null;
    this.apiEndpoint =
      typeof window !== 'undefined' && window.APP_CONFIG
        ? window.APP_CONFIG.API_ENDPOINT
        : 'http://localhost:4999/api';
    this.init();
  }

  async init() {
    console.log('Initializing Options Manager...');
    await this.loadUserState();
    this.bindEvents();
    this.loadAdvancedSettings();
  }

  // Event binding
  bindEvents() {
    // Authentication events
    document
      .getElementById('login-btn')
      .addEventListener('click', () => this.login());
    document
      .getElementById('logout-btn')
      .addEventListener('click', () => this.logout());

    // API Key events
    document
      .getElementById('save-api-key')
      .addEventListener('click', () => this.saveApiKey());
    document
      .getElementById('test-api-key')
      .addEventListener('click', () => this.testApiKey());
    document
      .getElementById('toggle-visibility')
      .addEventListener('click', () => this.togglePasswordVisibility());
    document
      .getElementById('api-key')
      .addEventListener('input', () => this.validateApiKey());

    // Advanced settings events
    document
      .getElementById('auto-analyze')
      .addEventListener('change', () => this.saveAdvancedSettings());
    document
      .getElementById('cache-results')
      .addEventListener('change', () => this.saveAdvancedSettings());
    document
      .getElementById('show-notifications')
      .addEventListener('change', () => this.saveAdvancedSettings());

    // Status message close
    document
      .getElementById('status-close')
      .addEventListener('click', () => this.hideStatus());

    // Footer links removed
  }

  // Authentication methods
  async loadUserState() {
    try {
      // Only check for cached user info in local storage
      // Do NOT auto-fetch token - let user explicitly login
      const { userInfo, authToken } = await chrome.storage.local.get([
        'userInfo',
        'authToken'
      ]);

      if (userInfo && userInfo.email && authToken) {
        // Verify the token is still valid by checking with Google
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
            this.user = userInfo;
            await this.setupEncryptionKey(userInfo.id);
            this.updateAuthUI(userInfo);
            console.log('User loaded from local storage:', userInfo.email);
            return;
          } else {
            // Token is invalid, clear storage and show logged out
            console.log('Stored token is invalid, clearing...');
            await chrome.storage.local.clear();
          }
        } catch (verifyError) {
          console.log('Token verification failed:', verifyError);
          await chrome.storage.local.clear();
        }
      }

      this.showLoggedOutState();
    } catch (error) {
      console.log('Error loading user state:', error);
      this.showLoggedOutState();
    }
  }

  async login() {
    try {
      this.showStatus('正在開啟 Google 登入視窗……', 'info');

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

      console.log('OAuth token received: Success');
      await this.handleAuthSuccess(token);
      this.hideStatus();
    } catch (error) {
      console.error('Login failed:', error);
      if (error.message.includes('OAuth')) {
        this.showStatus('OAuth 設定錯誤，請檢查擴充套件配置', 'error');
      } else if (error.message.includes('User did not approve')) {
        this.showStatus('使用者取消登入', 'warning');
      } else {
        this.showStatus(`登入失敗：${error.message}`, 'error');
      }
    }
  }

  async handleAuthSuccess(token) {
    try {
      console.log(
        'Handling auth success with token:',
        token ? 'Present' : 'Missing'
      );
      console.log('Token details:', {
        token: token,
        length: token && typeof token === 'string' ? token.length : 'N/A',
        prefix:
          token && typeof token === 'string'
            ? token.substring(0, 20) + '...'
            : 'Not a string',
        type: typeof token,
        isString: typeof token === 'string',
        constructor:
          token && token.constructor ? token.constructor.name : 'None'
      });

      // Convert token to string if it's not already
      let tokenStr = token;
      if (typeof token !== 'string') {
        if (token && typeof token === 'object') {
          // If it's an object, check if it has a token property
          if (token.token) {
            tokenStr = token.token;
            console.log('Extracted token from object:', typeof tokenStr);
          } else {
            console.log('Token object structure:', Object.keys(token));
            throw new Error('Token is an object but has no token property');
          }
        } else {
          throw new Error(`Invalid token type: ${typeof token}`);
        }
      }

      // Validate token format
      if (!tokenStr || typeof tokenStr !== 'string' || tokenStr.length < 50) {
        throw new Error(
          `Invalid token received: ${tokenStr ? (typeof tokenStr === 'string' ? tokenStr.substring(0, 50) : String(tokenStr)) : 'null/undefined'}`
        );
      }

      console.log('Making request to Google API with Authorization header...');

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

      console.log('Google API response status:', response.status);
      console.log(
        'Google API response headers:',
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google API error response:', errorText);

        // Try alternative endpoint if the first fails
        console.log('Trying alternative Google API endpoint...');
        const altResponse = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: {
              Authorization: `Bearer ${tokenStr}`,
              Accept: 'application/json'
            }
          }
        );

        console.log('Alternative API response status:', altResponse.status);
        if (altResponse.ok) {
          const altUserInfo = await altResponse.json();
          console.log('Alternative API success, using v3 endpoint');
          return this.processUserInfo(altUserInfo, tokenStr);
        }

        throw new Error(`Google API failed: ${response.status} - ${errorText}`);
      }

      const userInfo = await response.json();
      console.log('User info received:', {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name
      });

      return this.processUserInfo(userInfo, tokenStr);
    } catch (error) {
      console.error('Handle auth success failed:', error);
      throw error;
    }
  }

  async processUserInfo(userInfo, token) {
    try {
      // Generate or retrieve encryption key
      await this.setupEncryptionKey(userInfo.id);

      // Verify with backend (optional - don't let this fail the login)
      try {
        await this.verifyWithBackend(token);
      } catch (backendError) {
        console.warn(
          'Backend verification failed, continuing with local auth:',
          backendError
        );
      }

      // Cache user info and token with expiry time (55 minutes from now)
      const tokenExpiresAt = Date.now() + 55 * 60 * 1000;
      await chrome.storage.local.set({
        userInfo,
        authToken: token,
        googleId: userInfo.id,
        tokenExpiresAt
      });

      // Update UI
      this.user = userInfo;
      this.updateAuthUI(userInfo);
      this.showStatus('登入成功！', 'success');
    } catch (error) {
      console.error('Process user info failed:', error);
      throw error;
    }
  }

  async verifyWithBackend(token) {
    try {
      const response = await fetch(`${this.apiEndpoint}/auth/verify-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Backend verification failed');
      }

      const data = await response.json();
      if (data.success) {
        this.updateApiKeyStatus(data.user.hasApiKey);
      }
    } catch (error) {
      console.error('Backend verification failed:', error);
      // Don't throw - allow offline usage
    }
  }

  async logout() {
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

      // Clear local storage
      await chrome.storage.local.clear();

      // Reset state
      this.user = null;
      this.userEncryptionKey = null;

      // Update UI
      this.showLoggedOutState();
      this.showStatus('已成功登出', 'success');
    } catch (error) {
      console.error('Logout failed:', error);
      this.showStatus('登出時發生錯誤', 'error');
    }
  }

  // Encryption key management
  async setupEncryptionKey(googleId) {
    // Generate or retrieve user-specific encryption key
    this.userEncryptionKey = await this.generateEncryptionKey(googleId);

    // Migrate from old storage format if needed
    const { userEncryptionKey: oldKey } = await chrome.storage.local.get([
      'userEncryptionKey'
    ]);
    if (oldKey && oldKey !== this.userEncryptionKey) {
      console.log('🔄 Migrating from old encryption key format');
      // Keep the old key for backward compatibility, but use new key for new operations
      await chrome.storage.local.remove(['userEncryptionKey']);
    }
  }

  async generateEncryptionKey(googleId) {
    // Check if we already have a key for this user
    const storageKey = `encryptionKey_${googleId}`;
    const { [storageKey]: existingKey } = await chrome.storage.local.get([
      storageKey
    ]);

    if (existingKey) {
      return existingKey;
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

    return keyBase64;
  }

  // API Key management
  async encryptApiKey(apiKey) {
    if (!this.userEncryptionKey) {
      throw new Error('Encryption key not available');
    }

    // Use AES-CBC + HMAC to match backend format
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(apiKey);

      // Convert base64 key to array buffer (32 bytes for 256-bit key)
      const keyData = atob(this.userEncryptionKey);
      const keyBuffer = new Uint8Array(keyData.length);
      for (let i = 0; i < keyData.length; i++) {
        keyBuffer[i] = keyData.charCodeAt(i);
      }

      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-CBC' },
        false,
        ['encrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(16));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: iv },
        keyMaterial,
        data
      );

      // Convert encrypted data to base64
      const encryptedBase64 = btoa(
        String.fromCharCode(...new Uint8Array(encrypted))
      );
      const ivBase64 = btoa(String.fromCharCode(...iv));

      // Generate HMAC for integrity check (to match backend)
      const hmacKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const tagData = encoder.encode(encryptedBase64 + ivBase64);
      const tagBuffer = await crypto.subtle.sign('HMAC', hmacKey, tagData);
      const tagBase64 = btoa(String.fromCharCode(...new Uint8Array(tagBuffer)));

      return {
        encrypted: encryptedBase64,
        iv: ivBase64,
        tag: tagBase64
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt API key');
    }
  }

  validateApiKey() {
    const apiKeyInput = document.getElementById('api-key');
    const saveBtn = document.getElementById('save-api-key');
    const testBtn = document.getElementById('test-api-key');

    const apiKey = apiKeyInput.value.trim();
    const isValid = apiKey.length > 10 && apiKey.startsWith('AI');

    saveBtn.disabled = !isValid || !this.user;
    testBtn.disabled = !isValid || !this.user;

    // Update input styling
    if (apiKey.length > 0) {
      apiKeyInput.style.borderColor = isValid ? '#28a745' : '#dc3545';
    } else {
      apiKeyInput.style.borderColor = '#e9ecef';
    }
  }

  async saveApiKey() {
    if (!this.user || !this.userEncryptionKey) {
      this.showStatus('請先登入帳號', 'error');
      return;
    }

    // Debug: Log user information
    console.log('Current user:', this.user);
    console.log('User ID:', this.user.id);
    console.log('Encryption key exists:', !!this.userEncryptionKey);

    if (!this.user.id) {
      this.showStatus('用戶 ID 無效，請重新登入', 'error');
      return;
    }

    const apiKeyInput = document.getElementById('api-key');
    const saveBtn = document.getElementById('save-api-key');
    const saveSpinner = document.getElementById('save-spinner');
    const saveBtnText = document.getElementById('save-btn-text');

    const apiKey = apiKeyInput.value.trim();

    if (!apiKey || !apiKey.startsWith('AI')) {
      this.showStatus('請輸入有效的 Gemini API Key', 'error');
      return;
    }

    try {
      // Show loading state
      saveBtn.disabled = true;
      saveSpinner.classList.remove('hidden');
      saveBtnText.textContent = '儲存中……';

      // Encrypt the API key locally before sending
      const encryptedApiKey = await this.encryptApiKey(apiKey);

      // Send to backend using new endpoint
      const response = await fetch(
        `${this.apiEndpoint}/auth/store-encrypted-key`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            encryptedApiKey: encryptedApiKey,
            encryptionKey: this.userEncryptionKey,
            userId: this.user.id,
            userEmail: this.user.email,
            userName: this.user.name
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save API key');
      }

      // Clear input and update status
      apiKeyInput.value = '';
      this.updateApiKeyStatus(true);
      this.showStatus('API Key 已安全儲存！', 'success');
    } catch (error) {
      console.error('Save API key error:', error);
      if (
        error.message.includes('Failed to fetch') ||
        error.name === 'TypeError'
      ) {
        this.showStatus('無法連線到後端服務器，請確認服務器正在運行', 'error');
      } else {
        this.showStatus(`儲存失敗：${error.message}`, 'error');
      }
    } finally {
      // Reset button state
      saveBtn.disabled = false;
      saveSpinner.classList.add('hidden');
      saveBtnText.textContent = '儲存 API Key';
      this.validateApiKey();
    }
  }

  async testApiKey() {
    if (!this.user) {
      this.showStatus('請先登入帳號', 'error');
      return;
    }

    const testBtn = document.getElementById('test-api-key');
    const originalText = testBtn.textContent;

    try {
      testBtn.disabled = true;
      testBtn.textContent = '測試中……';

      // Test by calling verify-encrypted-user endpoint
      const response = await fetch(
        `${this.apiEndpoint}/auth/verify-encrypted-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: this.user.id
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.user && data.user.hasApiKey) {
          this.showStatus('API Key 連線測試成功！', 'success');
          this.updateApiKeyStatus(true);
        } else {
          this.showStatus('尚未設定 API Key', 'warning');
          this.updateApiKeyStatus(false);
        }
      } else {
        throw new Error('連線測試失敗');
      }
    } catch (error) {
      console.error('Test API key error:', error);
      if (
        error.message.includes('Failed to fetch') ||
        error.name === 'TypeError'
      ) {
        this.showStatus('無法連線到後端服務器，請確認服務器正在運行', 'error');
      } else {
        this.showStatus(`測試失敗：${error.message}`, 'error');
      }
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = originalText;
    }
  }

  togglePasswordVisibility() {
    const apiKeyInput = document.getElementById('api-key');
    const visibilityIcon = document.getElementById('visibility-icon');

    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      visibilityIcon.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      visibilityIcon.textContent = '👁️';
    }
  }

  // Advanced Settings
  async loadAdvancedSettings() {
    const { advancedSettings } = await chrome.storage.local.get([
      'advancedSettings'
    ]);

    const defaults = {
      autoAnalyze: false,
      cacheResults: true,
      showNotifications: true
    };

    const settings = { ...defaults, ...advancedSettings };

    document.getElementById('auto-analyze').checked = settings.autoAnalyze;
    document.getElementById('cache-results').checked = settings.cacheResults;
    document.getElementById('show-notifications').checked =
      settings.showNotifications;
  }

  async saveAdvancedSettings() {
    const settings = {
      autoAnalyze: document.getElementById('auto-analyze').checked,
      cacheResults: document.getElementById('cache-results').checked,
      showNotifications: document.getElementById('show-notifications').checked
    };

    await chrome.storage.local.set({ advancedSettings: settings });
    this.showStatus('設定已儲存', 'success');
  }

  // UI Update methods
  updateAuthUI(userInfo) {
    document.getElementById('logged-out-state').classList.add('hidden');
    document.getElementById('logged-in-state').classList.remove('hidden');

    document.getElementById('user-name').textContent =
      userInfo.name || '未提供姓名';
    document.getElementById('user-email').textContent = userInfo.email || '';

    if (userInfo.picture) {
      document.getElementById('user-avatar').src = userInfo.picture;
    }

    // Enable API key section
    this.validateApiKey();
  }

  showLoggedOutState() {
    document.getElementById('logged-in-state').classList.add('hidden');
    document.getElementById('logged-out-state').classList.remove('hidden');

    // Disable API key section
    document.getElementById('save-api-key').disabled = true;
    document.getElementById('test-api-key').disabled = true;

    this.updateApiKeyStatus(false);
  }

  updateApiKeyStatus(hasApiKey) {
    const statusElement = document.getElementById('api-key-status');
    const statusText = document.getElementById('api-status-text');

    if (!this.user) {
      statusElement.className = 'status-indicator';
      statusText.textContent = '請先登入並設定 API Key';
    } else if (hasApiKey) {
      statusElement.className = 'status-indicator success';
      statusText.textContent = '✅ API Key 已設定並可正常使用';
    } else {
      statusElement.className = 'status-indicator error';
      statusText.textContent = '❌ 尚未設定 API Key';
    }
  }

  // Status messages
  showStatus(message, type = 'info') {
    const statusMessage = document.getElementById('status-message');
    const statusText = document.getElementById('status-text');

    statusMessage.className = `status-message ${type}`;
    statusText.textContent = message;
    statusMessage.classList.remove('hidden');

    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
      setTimeout(() => {
        this.hideStatus();
      }, 5000);
    }
  }

  hideStatus() {
    document.getElementById('status-message').classList.add('hidden');
  }

  // Helper methods removed (privacy and help links removed)
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});
