// background.js

// Listener for when the extension is first installed.
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Privacy Guard extension installed.');
  // In the future, we can set up default settings in chrome.storage here.
});

// This is a placeholder for future logic.
// In a real extension, this script would listen for network requests,
// inject content scripts, and communicate with the popup UI.
console.log('AI Privacy Guard background script loaded.');
