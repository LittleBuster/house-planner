import type { Opening, Project } from "./model";
import { STUCCO_COLORS, type StuccoColor } from "./facadeSettings";

export type InteriorSettings = { kind: "paint" | "stucco"; color: StuccoColor };
export type PlinthSettings = { color: StuccoColor; height: number; recess: number };
export type DoorFinish = StuccoColor | "wood" | "brown" | "black";
export const DEFAULT_INTERIOR: InteriorSettings = { kind: "paint", color: "white" };
export const DEFAULT_PLINTH: PlinthSettings = { color: "ral7024", height: .35, recess: .04 };
export const DOOR_FINISHES: { id: DoorFinish; name: string; color: string }[] = [
  ...STUCCO_COLORS,
  { id: "wood", name: "Под дерево", color: "#9b683d" },
  { id: "brown", name: "Коричневый", color: "#654737" },
  { id: "black", name: "Чёрный", color: "#26282c" },
];
export const interiorSettings = (p: Pick<Project, "interior">) => p.interior ?? DEFAULT_INTERIOR;
export const plinthSettings = (p: Pick<Project, "plinth">) => p.plinth ?? DEFAULT_PLINTH;
export const houseFloorLevel = (p: Pick<Project, "plinth">) => plinthSettings(p).height;
export const doorFinish = (o: Pick<Opening, "doorFinish">, p: Pick<Project, "doorFinish"> = {}): DoorFinish => o.doorFinish ?? p.doorFinish ?? "wood";
export const doorOpen = (o: Pick<Opening, "open">) => o.open ?? true;
export const validDoorFinish = (value: unknown): value is DoorFinish => DOOR_FINISHES.some(c => c.id === value);
export function validInterior(value: unknown): value is InteriorSettings {
  const p=value as InteriorSettings;
  return !!p && typeof p === "object" && ["paint", "stucco"].includes(p.kind) && STUCCO_COLORS.some(c=>c.id===p.color);
}
export function validPlinth(value: unknown): value is PlinthSettings {
  const p=value as PlinthSettings;
  return !!p && typeof p === "object" && STUCCO_COLORS.some(c=>c.id===p.color) && Number.isFinite(p.height) && p.height>=.05 && p.height<=.8 && Number.isFinite(p.recess) && p.recess>=0 && p.recess<=.15;
}
