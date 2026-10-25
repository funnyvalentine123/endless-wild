/** 兼容返回 Promise 的新浏览器与返回 void 的旧浏览器。 */
export function requestPointerLock(element: HTMLElement): void {
  if (document.pointerLockElement === element) return;

  try {
    const result = element.requestPointerLock() as unknown as Promise<void> | void;
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => {
        // 用户拒绝或浏览器限制：保持自由鼠标即可。
      });
    }
  } catch {
    // 某些浏览器在非用户手势中调用会抛错，忽略。
  }
}
