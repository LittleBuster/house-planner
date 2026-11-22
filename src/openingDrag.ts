import { canPlaceOpening, wallLength, OPENING_END_MARGIN, OPENING_GAP, MIN_OPENING_WIDTH, MAX_OPENING_WIDTH, type Opening, type Point, type Project, type Wall } from "./model";
import { resizeWindow, windowSectionWidths, MIN_WINDOW_SECTION } from "./windowSections";
import { measureOpeningClearances } from "./openingClearances";
import {wallBody} from "./wallBodies";
import {snapSiteValue} from "./siteGrid";

export type OpeningDragMode = "move" | "start" | "end";
const precise = (value: number) => Math.round(value * 1e9) / 1e9;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function offsetAlongWall(point: Point, wall: Wall) {
  return ((point.x - wall.a.x) * (wall.b.x - wall.a.x) + (point.y - wall.a.y) * (wall.b.y - wall.a.y)) / wallLength(wall);
}
export function openingSlot(project: Project, opening: Opening) {
  const wall = project.walls.find(w => w.id === opening.wallId);
  if (!wall) return null;
  const body=wallBody(wall,project.walls);
  let start = Math.max(0,body.start)+OPENING_END_MARGIN, end = Math.min(wallLength(wall),body.end)-OPENING_END_MARGIN;
  for (const other of project.openings) {
    if (other.wallId !== opening.wallId || other.id === opening.id) continue;
    if (other.offset < opening.offset) start = Math.max(start, other.offset + other.width / 2 + OPENING_GAP);
    else end = Math.min(end, other.offset - other.width / 2 - OPENING_GAP);
  }
  // Use the same physical wall faces as the displayed clearances. Resolving
  // the slot before a drag also prevents a large pointer jump across a wall.
  for (const clearance of measureOpeningClearances(project, opening)) {
    if (clearance.kind !== "wall") continue;
    if (clearance.side === "start") start = Math.max(start, clearance.to);
    else end = Math.min(end, clearance.to);
  }
  return { start, end };
}
export function fitsOpeningSlot(project: Project, opening: Opening, next: Opening) {
  const slot = openingSlot(project, opening);
  return !!slot && next.offset - next.width / 2 >= slot.start - 1e-8 &&
    next.offset + next.width / 2 <= slot.end + 1e-8;
}
// Work from the press-time project: one gesture is one history entry, and a
// large pointer jump cannot teleport an opening through a neighbouring one.
export function dragOpening(project: Project, id: string, mode: OpeningDragMode, delta: number, snap: boolean): Opening | null {
  const opening = project.openings.find(o => o.id === id);
  if (!opening || !Number.isFinite(delta)) return null;
  const slot = openingSlot(project, opening);
  if (!slot) return null;
  const snapped = snap ? snapSiteValue : precise;
  let next: Opening;
  if (mode === "move") {
    const offset = precise(clamp(opening.offset + snapped(delta), slot.start + opening.width / 2, slot.end - opening.width / 2));
    next = { ...opening, offset };
  } else {
    const left = opening.offset - opening.width / 2, right = opening.offset + opening.width / 2;
    const available = mode === "start" ? right - slot.start : slot.end - left;
    const desired = snapped(opening.width + (mode === "start" ? -delta : delta));
    const width = precise(clamp(desired, MIN_OPENING_WIDTH, Math.min(MAX_OPENING_WIDTH, available)));
    next = opening.kind === "window" ? resizeWindow(opening, width) : { ...opening, width };
    next.offset = precise(mode === "start" ? right - width / 2 : left + width / 2);
  }
  return canPlaceOpening(project, next, opening.id) ? next : null;
}

// An interior divider redistributes only its two adjacent sections. The
// opening, its other dividers, and every unrelated section stay in place.
export function dragWindowDivider(project: Project, id: string, index: number, delta: number, snap: boolean): Opening | null {
  const opening = project.openings.find(o => o.id === id);
  if (!opening || opening.kind !== "window" || !Number.isFinite(delta) || !Number.isInteger(index)) return null;
  const widths = windowSectionWidths(opening);
  if (index < 0 || index >= widths.length - 1) return null;
  const total = widths[index] + widths[index+1];
  const desired = widths[index] + delta;
  const width = clamp(snap ? snapSiteValue(desired) : desired, MIN_WINDOW_SECTION, total - MIN_WINDOW_SECTION);
  widths[index] = precise(width);
  widths[index+1] = precise(total-width);
  const next = {...opening,sectionWidths:widths};
  return canPlaceOpening(project,next,id) ? next : null;
}
