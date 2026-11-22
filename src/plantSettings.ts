import type { PlantKind } from "./model";

export const isHerb = (kind: string) => kind === "groundcover" || kind === "grass";
export const plantHeightLimits = (kind: PlantKind | string) =>
  isHerb(kind) ? { min: 0.05, max: 2 } : { min: 0.5, max: 20 };
