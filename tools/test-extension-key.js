// Test script to check if extension can get encryption key
// Run this in browser console to test the getUserEncryptionKey functionality

console.log('🔧 Testing getUserEncryptionKey...');

chrome.runtime.sendMessage({ action: 'getUserEncryptionKey' }, (response) => {
  console.log('📋 getUserEncryptionKey response:', response);
  console.log('🔑 Encryption key status:', !!response?.encryptionKey);
  console.log(
    '📏 Encryption key length:',
    response?.encryptionKey?.length || 0
  );

  if (response?.encryptionKey) {
    console.log('✅ Encryption key successfully retrieved');
    console.log(
      '🔑 Key preview:',
      response.encryptionKey.substring(0, 20) + '...'
    );
  } else {
    console.log('❌ No encryption key found');
    console.log('🔍 Check extension options to ensure API key is configured');
  }
});
