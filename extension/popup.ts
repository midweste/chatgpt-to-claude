document.getElementById('openDashboard')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dist/dashboard/index.html') });
  window.close();
});
