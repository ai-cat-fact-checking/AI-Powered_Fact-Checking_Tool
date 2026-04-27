/**
 * 中央配置文件 - 所有環境變數和配置都在這裡
 * 修改這個文件即可同步更新所有 API 端點
 *
 * Fork 部署提示：請把 production.apiUrl / wsUrl 改成你自己的 API 域名。
 */

// ============================================================
// 🔧 配置管理 - 在這裡修改您的 API 域名
// ============================================================

// 環境檢測：
// - 從 Chrome Web Store 安裝會有 update_url
// - Unpacked / 開發模式不會有
const isProduction = () => {
  try {
    return (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      'update_url' in chrome.runtime.getManifest()
    );
  } catch (_e) {
    return false;
  }
};

// 域名配置
const DOMAINS = {
  development: {
    apiUrl: 'http://localhost:4999/api',
    wsUrl: 'ws://localhost:4999'
  },
  production: {
    // TODO: 部署後改成你自己的 API 域名
    apiUrl: 'https://your-api-domain.example.com/api',
    wsUrl: 'wss://your-api-domain.example.com'
  }
};

// 根據環境選擇配置
const currentEnvironment = isProduction() ? 'production' : 'development';
const CONFIG = DOMAINS[currentEnvironment];

// ============================================================
// 導出配置
// ============================================================

// 全局導出（用於 HTML 頁面的 <script> 標籤）
window.APP_CONFIG = {
  API_ENDPOINT: CONFIG.apiUrl,
  WS_ENDPOINT: CONFIG.wsUrl,
  ENVIRONMENT: currentEnvironment,
  isProduction,
  // 便利的 API 方法
  getApiUrl: (endpoint) => `${CONFIG.apiUrl}${endpoint}`,
  getWsUrl: (endpoint) => `${CONFIG.wsUrl}${endpoint}`
};

console.log(`✅ [CONFIG] Loaded for ${currentEnvironment} environment`);
console.log(`📡 API Endpoint: ${CONFIG.apiUrl}`);
