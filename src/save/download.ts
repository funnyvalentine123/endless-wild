/** 把文本另存为本地文件；存档导出不经过服务器。 */
export function downloadTextFile(name: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  // 不要在点击后立刻 revoke：部分浏览器会把尚未完成的 blob 下载标记成 canceled。
  // 导出很少发生，延后一分钟释放即可，对象 URL 会随页面关闭自动回收。
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
