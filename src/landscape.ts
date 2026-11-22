import {
  bounds,
  distance,
  findRooms,
  projectToWall,
  type Plant,
  type PlantKind,
  type Point,
  type Project,
} from "./model";
import { PLANT_VARIANTS } from "./plantManifest";
import { coverBounds } from "./groundSettings";
import { isHerb, plantHeightLimits } from "./plantSettings";
export { PLANT_VARIANTS } from "./plantManifest";
export const plantVariant = (kind: PlantKind, variant?: string) =>
  PLANT_VARIANTS[kind].find(v => v.id === variant) ?? PLANT_VARIANTS[kind][0];

export const PLANT_CATALOGUE: Record<
  PlantKind,
  {
    name: string;
    detail: string;
    height: number;
  }
> = {
  birch: {
    name: "Берёза",
    detail: "Светлая ажурная крона",
    height: 7.5,
  },
  pine: {
    name: "Сосна",
    detail: "Высокий ствол, хвойная крона",
    height: 8,
  },
  fir: {
    name: "Пихта",
    detail: "Густая хвоя, коническая крона",
    height: 7,
  },
  maple: {
    name: "Клён",
    detail: "Широкая раскидистая крона",
    height: 7.5,
  },
  groundcover: { name: "Трава и цветы", detail: "Клевер, цветы и зелёные ковры", height: 0.35 },
  grass: { name: "Пучок травы", detail: "Декоративная луговая трава", height: 0.45 },
};
export const plantTrunkRadius = (plant: Pick<Plant, "kind" | "height" | "variant">) =>
  plantVariant(plant.kind, plant.variant).trunkRatio * plant.height;
export function insidePolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function plantingError(
  project: Project,
  plant: Plant,
  ignoreId?: string,
): string | null {
  if (
    !Number.isFinite(plant.position.x) ||
    !Number.isFinite(plant.position.y) ||
    Math.abs(plant.position.x) > 500 ||
    Math.abs(plant.position.y) > 500
  )
    return "Растение выходит за границы участка (±500 м).";
  const limits = plantHeightLimits(plant.kind);
  if (!Number.isFinite(plant.height) || plant.height < limits.min || plant.height > limits.max)
    return `Высота растения должна быть от ${String(limits.min).replace(".", ",")} до ${limits.max} м.`;
  const radius = isHerb(plant.kind) ? 0.03 : Math.max(0.2, plantTrunkRadius(plant));
  if (
    project.walls.some(
      (w) =>
        projectToWall(plant.position, w).distance <
        w.thickness / 2 + radius + 0.15,
    ) ||
    findRooms(project.walls).some((room) =>
      insidePolygon(plant.position, room.points),
    )
  )
    return "Выберите место на участке, за пределами дома и стен.";
  if (!isHerb(plant.kind) &&
    (project.plants ?? []).some(
      (p) =>
        p.id !== ignoreId && !isHerb(p.kind) &&
        distance(p.position, plant.position) <
          plantTrunkRadius(p) + plantTrunkRadius(plant) + 0.2,
    )
  )
    return "Стволы слишком близко. Отодвиньте растение.";
  if (!ignoreId && (project.plants?.length ?? 0) >= 100)
    return "В базовой версии можно посадить до 100 растений.";
  return null;
}
export function siteBounds(project: Project) {
  const b = bounds(project.walls);
  for (const p of project.plants ?? []) {
    const r = p.height * plantVariant(p.kind, p.variant).crownRatio;
    b.minX = Math.min(b.minX, p.position.x - r);
    b.maxX = Math.max(b.maxX, p.position.x + r);
    b.minY = Math.min(b.minY, p.position.y - r);
    b.maxY = Math.max(b.maxY, p.position.y + r);
  }
  for (const tile of project.lawn ?? []) {
    const tileBounds = coverBounds(tile);
    b.minX = Math.min(b.minX, tileBounds.minX);
    b.maxX = Math.max(b.maxX, tileBounds.maxX);
    b.minY = Math.min(b.minY, tileBounds.minY);
    b.maxY = Math.max(b.maxY, tileBounds.maxY);
  }
  for (const fence of project.fences ?? []) for (const point of [fence.a,fence.b]) {
    b.minX=Math.min(b.minX,point.x);b.minY=Math.min(b.minY,point.y);
    b.maxX=Math.max(b.maxX,point.x);b.maxY=Math.max(b.maxY,point.y);
  }
  return b;
}
