import { requireElement } from '../core/dom';
import type { AlbumPhoto } from '../album/Album';
import { formatClock } from './format';

export interface AlbumPanelActions {
  model(): readonly AlbumPhoto[];
  remove(id: string): void;
}

/**
 * 旅途相册面板：网格展示拍到的照片，点开看大图，也可以逐张删除。
 * 打开时不暂停游戏，关闭后由 Game 交还鼠标锁定。
 */
export class AlbumPanel {
  private readonly overlay = requireElement<HTMLElement>('albumPanel');
  private readonly closeButton = requireElement<HTMLButtonElement>('albumClose');
  private readonly grid = requireElement<HTMLElement>('albumGrid');
  private readonly empty = requireElement<HTMLElement>('albumEmpty');
  private readonly countText = requireElement<HTMLElement>('albumCount');
  private readonly viewer = requireElement<HTMLElement>('albumViewer');
  private readonly viewerImage = requireElement<HTMLImageElement>('albumViewerImage');
  private readonly viewerMeta = requireElement<HTMLElement>('albumViewerMeta');
  private readonly viewerClose = requireElement<HTMLButtonElement>('albumViewerClose');

  private photos: readonly AlbumPhoto[] = [];
  /** 上一次渲染的签名：照片没变就不重建节点。 */
  private rendered = '';

  private readonly handleClose = (): void => this.handlers.onCloseRequest();
  private readonly handleBackdrop = (event: MouseEvent): void => {
    if (event.target === this.overlay) this.handlers.onCloseRequest();
  };
  private readonly handleGridClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const card = target.closest<HTMLElement>('[data-photo-id]');
    const id = card?.dataset.photoId;
    if (!card || !id) return;

    if (target.closest('[data-action="remove"]')) {
      this.actions.remove(id);
      this.hideViewer();
      this.refresh();
      return;
    }

    const photo = this.photos.find((entry) => entry.id === id);
    if (photo) this.showViewer(photo);
  };
  private readonly handleViewerClose = (): void => this.hideViewer();
  private readonly handleViewerBackdrop = (event: MouseEvent): void => {
    if (event.target === this.viewer) this.hideViewer();
  };

  constructor(
    private readonly actions: AlbumPanelActions,
    private readonly handlers: { onCloseRequest: () => void },
  ) {
    this.overlay.hidden = true;
    this.viewer.hidden = true;
    this.closeButton.addEventListener('click', this.handleClose);
    this.overlay.addEventListener('click', this.handleBackdrop);
    this.grid.addEventListener('click', this.handleGridClick);
    this.viewerClose.addEventListener('click', this.handleViewerClose);
    this.viewer.addEventListener('click', this.handleViewerBackdrop);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(): void {
    if (this.isOpen) return;

    this.overlay.hidden = false;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.refresh();
  }

  close(): void {
    this.hideViewer();
    this.overlay.hidden = true;
  }

  /** 拍到新照片或载入存档后刷新；内容没变时跳过重建。 */
  refresh(): void {
    this.photos = this.actions.model();
    this.countText.textContent = String(this.photos.length);
    this.empty.hidden = this.photos.length > 0;

    const signature = this.photos.map((photo) => photo.id).join('|');
    if (signature === this.rendered) return;
    this.rendered = signature;

    this.grid.replaceChildren(...this.photos.map((photo) => this.card(photo)));
    // 被删掉的那张可能正开着大图。
    if (!this.viewer.hidden && !this.photos.some((photo) => photo.id === this.viewerImage.dataset.photoId)) {
      this.hideViewer();
    }
  }

  dispose(): void {
    this.closeButton.removeEventListener('click', this.handleClose);
    this.overlay.removeEventListener('click', this.handleBackdrop);
    this.grid.removeEventListener('click', this.handleGridClick);
    this.viewerClose.removeEventListener('click', this.handleViewerClose);
    this.viewer.removeEventListener('click', this.handleViewerBackdrop);
  }

  private card(photo: AlbumPhoto): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'album-card-item';
    figure.dataset.photoId = photo.id;

    const image = document.createElement('img');
    image.className = 'album-thumb';
    image.src = photo.thumb;
    image.alt = photo.title;
    image.loading = 'lazy';

    const caption = document.createElement('figcaption');
    const title = document.createElement('span');
    title.className = 'album-title';
    title.textContent = photo.title;

    const meta = document.createElement('span');
    meta.className = 'album-meta';
    meta.textContent = `${Math.round(photo.x)} , ${Math.round(photo.z)} m · 种子 ${photo.seed}`;

    caption.append(title, meta);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'album-remove';
    remove.dataset.action = 'remove';
    remove.textContent = '删除';
    remove.title = '从相册里删掉这张照片';

    figure.append(image, caption, remove);
    return figure;
  }

  private showViewer(photo: AlbumPhoto): void {
    this.viewerImage.src = photo.thumb;
    this.viewerImage.dataset.photoId = photo.id;
    this.viewerMeta.textContent = `${photo.title} · ${formatClock(photo.hour)} · ${Math.round(photo.x)} , ${Math.round(photo.z)} m`;
    this.viewer.hidden = false;
  }

  private hideViewer(): void {
    this.viewer.hidden = true;
    this.viewerImage.removeAttribute('src');
    delete this.viewerImage.dataset.photoId;
  }
}
