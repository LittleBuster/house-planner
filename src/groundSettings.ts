export const GROUND_COVERS = [
  { id: "lawn", name: "Газон", detail: "Трава высотой 12 см" },
  { id: "soil", name: "Чернозём", detail: "Тёмная зернистая земля" },
  { id: "sand", name: "Песок", detail: "Светлый мелкий песок" },
  { id: "concrete", name: "Бетон", detail: "Для отмостки и дорожек" },
  { id: "gravel", name: "Щебень 0–20", detail: "Колотый камень и отсев до 20 мм" },
  { id: "asphalt", name: "Асфальт", detail: "Тёмное мелкозернистое покрытие" },
] as const;

export type GroundCover = typeof GROUND_COVERS[number]["id"];
export const groundCover = (tile: { material?: GroundCover }): GroundCover => tile.material ?? "lawn";
export const groundCoverName = (material: GroundCover) => GROUND_COVERS.find(item => item.id === material)!.name;
export const validGroundCover = (value: unknown): value is GroundCover => GROUND_COVERS.some(item => item.id === value);

export const COVER_MIN_SIZE = .1;
export const COVER_MAX_SIZE = 20;
export const COVER_SITE_LIMIT = 500;
export const GRASS_BLOCK_SIZE = 2;
export type CoverDimensions = { size: number; depth?: number };
export const coverDepth = (cover: CoverDimensions) => cover.depth ?? cover.size;
export function coverBounds(cover: CoverDimensions & {position: {x:number; y:number}}) {
  const {x,y} = cover.position;
  const halfWidth = cover.size/2, halfDepth = coverDepth(cover)/2;
  return {minX:x-halfWidth, maxX:x+halfWidth, minY:y-halfDepth, maxY:y+halfDepth};
}
