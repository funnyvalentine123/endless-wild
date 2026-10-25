import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { require2DContext } from '../../core/dom';
import { createRandom } from '../../math/random';

/** 运行时程序化绘制的土路贴图：碎石底、浅色路肩与虚线车辙。 */
export function createRoadTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;

  const context = require2DContext(canvas);
  const random = createRandom(3);

  context.fillStyle = '#8a7a63';
  context.fillRect(0, 0, 64, 256);

  for (let i = 0; i < 1400; i++) {
    const tone = random();
    context.fillStyle = `rgba(${tone > 0.5 ? '255,245,220' : '60,45,30'},${0.08 + random() * 0.15})`;
    context.fillRect(random() * 64, random() * 256, 1 + random() * 2.5, 1 + random() * 2.5);
  }

  context.fillStyle = '#c9b48d';
  context.fillRect(0, 0, 5, 256);
  context.fillRect(59, 0, 5, 256);

  context.fillStyle = 'rgba(255,250,235,0.55)';
  for (let y = 0; y < 256; y += 64) context.fillRect(30, y + 8, 4, 34);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
