import {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';
import { STAR_COUNT, STAR_RADIUS, STAR_SIZE } from '../../config/render';
import { createRandom } from '../../math/random';

/** 半球状星空；夜间由 DayNightCycle 的 starOpacity 淡入。 */
export class Stars {
  private readonly points: Points<BufferGeometry, PointsMaterial>;

  constructor(private readonly scene: Scene) {
    const geometry = new BufferGeometry();
    const positions: number[] = [];
    const random = createRandom(7);

    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(random() * 0.95);
      positions.push(
        Math.sin(phi) * Math.cos(theta) * STAR_RADIUS,
        Math.cos(phi) * STAR_RADIUS,
        Math.sin(phi) * Math.sin(theta) * STAR_RADIUS,
      );
    }

    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.points = new Points(
      geometry,
      new PointsMaterial({
        color: 0xffffff,
        size: STAR_SIZE,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
      }),
    );

    scene.add(this.points);
  }

  setOpacity(opacity: number): void {
    this.points.material.opacity = opacity;
  }

  follow(cameraPosition: { x: number; y: number; z: number }): void {
    this.points.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
