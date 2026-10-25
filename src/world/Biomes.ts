export const BIOMES = ['桥上', '河流', '湖泊', '河畔', '雪山', '山坡', '森林', '草原'] as const;

export type Biome = (typeof BIOMES)[number];
