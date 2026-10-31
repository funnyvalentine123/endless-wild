import { Color, Fog, type Scene, type Vector3 } from 'three';
import { FOG_FAR, FOG_NEAR } from '../../config/render';
import {
  SKY_VIEW_FOG_FAR,
  SKY_VIEW_FOG_NEAR,
} from '../../config/ui';
import {
  RAIN_FOG_COLOR,
  SNOW_FOG_COLOR,
  WEATHER_FOG_FAR,
  WEATHER_FOG_NEAR,
  type WeatherSnapshot,
} from '../../config/weather';
import { lerp } from '../../math/scalar';
import type { PlayerState } from '../../player/Player';
import type { DaylightSnapshot } from './Daylight';
import { Clouds } from './Clouds';
import { Flashlight } from './Flashlight';
import { Lighting } from './Lighting';
import { Precipitation } from './Precipitation';
import { SkyDome } from './SkyDome';
import { Stars } from './Stars';
import { Water } from './Water';

const SNOW_FOG_TINT = new Color(SNOW_FOG_COLOR);

/**
 * 场景级环境组合：光照、天空、星空、水、云、降水。
 * 把“时间系统算出的快照”应用到具体对象，并负责它们随玩家/相机的更新。
 */
export class SceneEnvironment {
  private readonly lighting: Lighting;
  private readonly sky: SkyDome;
  private readonly stars: Stars;
  private readonly water: Water;
  private readonly clouds: Clouds;
  private readonly precipitation: Precipitation;
  private readonly flashlight: Flashlight;
  private readonly fogTint = new Color();
  private starOpacity = 0;
  private savedFogNear = FOG_NEAR;
  private savedFogFar = FOG_FAR;

  constructor(private readonly scene: Scene) {
    this.lighting = new Lighting(scene);
    this.sky = new SkyDome(scene);
    this.stars = new Stars(scene);
    this.water = new Water(scene);
    this.clouds = new Clouds(scene);
    this.precipitation = new Precipitation(scene);
    this.flashlight = new Flashlight(scene);
  }

  applyDaylight(daylight: DaylightSnapshot, x: number, y: number, z: number): void {
    this.lighting.apply(daylight, x, y, z);
    this.sky.apply(daylight);
    this.starOpacity = daylight.starOpacity;
    this.stars.setOpacity(daylight.starOpacity);
    this.water.setBrightness(daylight.waterBrightness);
    this.clouds.setEmissive(daylight.cloudEmissive);

    if (this.scene.fog instanceof Fog) this.scene.fog.color.copy(daylight.fogColor);
  }

  /** 在昼夜结果之上叠加天气：雾、光照、太阳、云、降水与水位。 */
  applyWeather(weather: WeatherSnapshot, waterLevelOffset: number): void {
    const precipitation = weather.precipitation;
    const total = weather.rain + weather.snow;
    const snowRatio = total > 0.001 ? weather.snow / total : 0;

    if (this.scene.fog instanceof Fog) {
      this.scene.fog.near = lerp(FOG_NEAR, WEATHER_FOG_NEAR, precipitation);
      this.scene.fog.far = lerp(FOG_FAR, WEATHER_FOG_FAR, precipitation);
      this.fogTint.setHex(RAIN_FOG_COLOR).lerp(SNOW_FOG_TINT, snowRatio);
      this.scene.fog.color.lerp(this.fogTint, precipitation * 0.8);
    }

    this.sky.applyWeather(precipitation, snowRatio);
    this.stars.setOpacity(this.starOpacity * (1 - precipitation * 0.95));
    this.lighting.setWeatherDim(1 - precipitation * 0.32);
    this.water.setWeatherDim(1 - precipitation * 0.25);
    this.water.setLevelOffset(waterLevelOffset);
    this.clouds.setWeather(precipitation);
    this.precipitation.applyWeather(weather);
  }

  /** 夜间手电筒跟随主角的朝向与俯仰。 */
  applyFlashlight(daylight: DaylightSnapshot, state: PlayerState): void {
    this.flashlight.update(daylight, state);
  }

  /**
   * 天穹俯瞰渲染前的临时调整：
   * 相机离地约 760m，按正常雾距会整片糊成雾，因此换成远雾；
   * 云层位于相机与地面之间，也一并隐藏，避免遮住地形。
   */
  beginSkyView(): void {
    const fog = this.scene.fog;
    if (fog instanceof Fog) {
      this.savedFogNear = fog.near;
      this.savedFogFar = fog.far;
      fog.near = SKY_VIEW_FOG_NEAR;
      fog.far = SKY_VIEW_FOG_FAR;
    }
    this.clouds.setVisible(false);
  }

  /** 天穹俯瞰渲染后恢复主视角的雾与云层。 */
  endSkyView(): void {
    const fog = this.scene.fog;
    if (fog instanceof Fog) {
      fog.near = this.savedFogNear;
      fog.far = this.savedFogFar;
    }
    this.clouds.setVisible(true);
  }

  update(
    dt: number,
    elapsed: number,
    playerX: number,
    playerZ: number,
    cameraPosition: Vector3,
  ): void {
    this.sky.follow(cameraPosition);
    this.stars.follow(cameraPosition);
    this.water.update(elapsed, playerX, playerZ);
    this.clouds.update(dt, playerX, playerZ);
    this.precipitation.update(elapsed, cameraPosition);
  }

  dispose(): void {
    this.flashlight.dispose();
    this.precipitation.dispose();
    this.clouds.dispose();
    this.water.dispose();
    this.stars.dispose();
    this.sky.dispose();
    this.lighting.dispose();
  }
}
