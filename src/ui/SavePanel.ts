import { requireElement } from '../core/dom';
import type { SaveSummary } from '../save/codec';
import { formatClock, formatDistance } from './format';

export interface SavePanelModel {
  /** 当前进度（点了「保存」会写成什么样）。 */
  current: SaveSummary;
  /** 本地槽位里的存档；没有就是 null。 */
  local: SaveSummary | null;
  localAvailable: boolean;
}

export interface SavePanelActions {
  save(): string;
  load(): string;
  export(): string;
  import(text: string): string;
  remove(): string;
  model(): SavePanelModel;
}

const EMPTY = '—';

function formatSavedAt(savedAt: number): string {
  if (savedAt <= 0) return EMPTY;

  const date = new Date(savedAt);
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatPosition(summary: SaveSummary | null): string {
  if (!summary) return EMPTY;
  return `${summary.x.toFixed(1)} , ${summary.z.toFixed(1)}`;
}

/**
 * 存档面板：只做展示与事件转发，真正的读写、导入导出由 SaveService 完成。
 * 打开时游戏不暂停，可以继续走动；面板关闭后由 Game 交还鼠标锁定。
 */
export class SavePanel {
  private readonly overlay = requireElement<HTMLElement>('savePanel');
  private readonly closeButton = requireElement<HTMLButtonElement>('saveClose');
  private readonly fileInput = requireElement<HTMLInputElement>('saveFile');
  private readonly statusText = requireElement<HTMLElement>('saveStatus');

  private readonly currentSeed = requireElement<HTMLElement>('saveCurrentSeed');
  private readonly currentPosition = requireElement<HTMLElement>('saveCurrentPos');
  private readonly currentClock = requireElement<HTMLElement>('saveCurrentClock');
  private readonly currentDistance = requireElement<HTMLElement>('saveCurrentDist');

  private readonly localSeed = requireElement<HTMLElement>('saveLocalSeed');
  private readonly localPosition = requireElement<HTMLElement>('saveLocalPos');
  private readonly localClock = requireElement<HTMLElement>('saveLocalClock');
  private readonly localTime = requireElement<HTMLElement>('saveLocalTime');

  private readonly saveButton = requireElement<HTMLButtonElement>('saveLocal');
  private readonly loadButton = requireElement<HTMLButtonElement>('saveLoad');
  private readonly exportButton = requireElement<HTMLButtonElement>('saveExport');
  private readonly importButton = requireElement<HTMLButtonElement>('saveImport');
  private readonly deleteButton = requireElement<HTMLButtonElement>('saveDelete');

  private readonly handleClose = (): void => this.handlers.onCloseRequest();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.handlers.onCloseRequest();
  };

  private readonly handleSave = (): void => this.run(() => this.actions.save());
  private readonly handleLoad = (): void => this.run(() => this.actions.load());
  private readonly handleExport = (): void => this.run(() => this.actions.export());
  private readonly handleImportClick = (): void => this.fileInput.click();
  private readonly handleDelete = (): void => this.run(() => this.actions.remove());
  private readonly handleFileChange = (): void => {
    const file = this.fileInput.files?.[0];
    if (!file) return;

    // 清空 value，保证再次选择同一个文件也能触发 change。
    this.fileInput.value = '';
    void this.readFile(file);
  };

  constructor(
    private readonly actions: SavePanelActions,
    private readonly handlers: { onCloseRequest: () => void },
  ) {
    this.overlay.hidden = true;
    this.closeButton.addEventListener('click', this.handleClose);
    this.overlay.addEventListener('click', this.handleBackdrop);
    this.saveButton.addEventListener('click', this.handleSave);
    this.loadButton.addEventListener('click', this.handleLoad);
    this.exportButton.addEventListener('click', this.handleExport);
    this.importButton.addEventListener('click', this.handleImportClick);
    this.deleteButton.addEventListener('click', this.handleDelete);
    this.fileInput.addEventListener('change', this.handleFileChange);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(): void {
    if (this.isOpen) return;

    this.overlay.hidden = false;
    this.setStatus('');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.refresh();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  /** 操作完成或存档变化后刷新面板上的数字。 */
  refresh(): void {
    const model = this.actions.model();
    const { current, local } = model;

    this.currentSeed.textContent = String(current.seed);
    this.currentPosition.textContent = formatPosition(current);
    this.currentClock.textContent = formatClock(current.hour);
    this.currentDistance.textContent = `${formatDistance(current.walked)} 米`;

    this.localSeed.textContent = local ? String(local.seed) : EMPTY;
    this.localPosition.textContent = formatPosition(local);
    this.localClock.textContent = local ? formatClock(local.hour) : EMPTY;
    this.localTime.textContent = local ? formatSavedAt(local.savedAt) : EMPTY;

    this.loadButton.disabled = local === null;
    this.deleteButton.disabled = local === null;
    this.saveButton.disabled = !model.localAvailable;
    this.saveButton.title = model.localAvailable ? '' : '当前浏览器不允许使用本地存储，请改用导出文件';
  }

  dispose(): void {
    this.closeButton.removeEventListener('click', this.handleClose);
    this.overlay.removeEventListener('click', this.handleBackdrop);
    this.saveButton.removeEventListener('click', this.handleSave);
    this.loadButton.removeEventListener('click', this.handleLoad);
    this.exportButton.removeEventListener('click', this.handleExport);
    this.importButton.removeEventListener('click', this.handleImportClick);
    this.deleteButton.removeEventListener('click', this.handleDelete);
    this.fileInput.removeEventListener('change', this.handleFileChange);
  }

  private run(action: () => string): void {
    this.setStatus(action());
    this.refresh();
  }

  private async readFile(file: File): Promise<void> {
    try {
      this.setStatus(this.actions.import(await file.text()));
    } catch {
      this.setStatus('读取存档文件失败。');
    }
    this.refresh();
  }

  private setStatus(message: string): void {
    this.statusText.textContent = message;
    this.statusText.dataset.empty = String(message.length === 0);
  }
}
