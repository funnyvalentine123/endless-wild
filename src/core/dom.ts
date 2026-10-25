/** 查询页面中必须存在的元素；缺失时尽早失败，而不是在运行中报 null。 */
export function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少必要的页面元素：#${id}`);
  return element as T;
}

export function require2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法创建 2D 绘图上下文');
  return context;
}
