/**
 * Trigger a blob download in the browser (e.g. zip files).
 */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(name: string, content: string): void {
  downloadBlob(name, new Blob([content], { type: 'text/plain' }));
}
