import type { Opening } from "./model";

export const MIN_WINDOW_SECTION = 0.1;
export const WINDOW_FRAME_WIDTH = 0.045;
export const windowBottomRail = (opening: Opening) => opening.french ? .015 : WINDOW_FRAME_WIDTH;
export const openingBottom = (opening: Opening) => opening.french ? 0 : opening.sill;
export type WindowSectionCount = 1 | 2 | 3;
export type WindowVentState = "closed" | "open" | null;
const precise = (value: number) => Math.round(value * 1e9) / 1e9;

// Missing section data belongs to older projects, whose windows had two panes.
export function windowSectionWidths(window: Pick<Opening, "width" | "sectionWidths">): number[] {
  return window.sectionWidths ? [...window.sectionWidths] : [window.width / 2, window.width / 2];
}

export function windowDividers(window: Pick<Opening, "width" | "sectionWidths">): number[] {
  let end = 0;
  return windowSectionWidths(window).slice(0, -1).map(width => (end = precise(end + width)));
}

export function validWindowSections(opening: Opening): boolean {
  const widths = opening.sectionWidths;
  if (widths !== undefined && !(opening.kind === "window" && Array.isArray(widths) && widths.length >= 1 && widths.length <= 3 &&
    widths.every(width => typeof width === "number" && Number.isFinite(width) && width >= MIN_WINDOW_SECTION && width <= 10) &&
    Math.abs(widths.reduce((sum, width) => sum + width, 0) - opening.width) < 1e-6)) return false;
  const vents = opening.ventSections;
  if(vents!==undefined&&!(opening.kind==="window"&&Array.isArray(vents)&&
    vents.length===(widths?.length??2)&&vents.every(state=>state===null||state==="closed"||state==="open")))return false;
  const mirrored=opening.mirroredVents;
  return mirrored===undefined||(opening.kind==="window"&&Array.isArray(mirrored)&&
    new Set(mirrored).size===mirrored.length&&mirrored.every(index=>Number.isInteger(index)&&!!vents?.[index]));
}

export function windowPaneBounds(opening: Opening) {
  const fw=WINDOW_FRAME_WIDTH,edges=[0,...windowDividers(opening),opening.width];
  return edges.slice(0,-1).map((edge,i)=>({
    left:edge+(i===0?fw:fw/2),
    right:edges[i+1]-(i===edges.length-2?fw:fw/2),
  }));
}

export function setWindowVent(window: Opening, index: number, state: WindowVentState): Opening {
  const count=windowSectionWidths(window).length;
  if(window.kind!=="window"||!Number.isInteger(index)||index<0||index>=count)return window;
  const vents=Array.from({length:count},(_,i)=>i===index?state:window.ventSections?.[i]??null);
  return {...window,ventSections:vents.some(Boolean)?vents:undefined,...remainingMirrors(window,vents)};
}

function remainingMirrors(window: Opening, vents?: WindowVentState[]) {
  if(!window.mirroredVents)return {};
  const mirrored=window.mirroredVents.filter(index=>vents?.[index]);
  return {mirroredVents:mirrored.length?mirrored:undefined};
}

export function mirrorWindowVent(window: Opening, index: number): Opening {
  if(window.kind!=="window"||!window.ventSections?.[index])return window;
  const current=window.mirroredVents??[];
  const mirrored=current.includes(index)?current.filter(i=>i!==index):[...current,index];
  return {...window,mirroredVents:mirrored.length?mirrored:undefined};
}

// Scale in millimetres, keeping narrow sections usable when the total shrinks.
// The final section absorbs rounding so the widths always add up exactly.
function fitSections(weights: number[], total: number): number[] {
  const widths = Array<number>(weights.length).fill(0);
  let free = weights.map((_, i) => i), remaining = total;
  while (free.length) {
    const sum = free.reduce((s, i) => s + weights[i], 0);
    const narrow = free.filter(i => remaining * weights[i] / sum < MIN_WINDOW_SECTION);
    if (!narrow.length) {
      free.forEach((i, order) => {
        widths[i] = order === free.length - 1
          ? precise(total - widths.reduce((s, width) => s + width, 0))
          : Math.max(MIN_WINDOW_SECTION, Math.floor(remaining * weights[i] / sum * 1000 + 1e-7) / 1000);
      });
      break;
    }
    narrow.forEach(i => { widths[i] = MIN_WINDOW_SECTION; remaining = precise(remaining - MIN_WINDOW_SECTION); });
    free = free.filter(i => !narrow.includes(i));
  }
  return widths;
}

export function setWindowSectionCount(window: Opening, count: WindowSectionCount): Opening {
  const vents=window.ventSections&&Array.from({length:count},(_,i)=>window.ventSections![i]??null);
  return { ...window, sectionWidths: fitSections(Array(count).fill(1), window.width),
    ...(window.ventSections ? {ventSections:vents?.some(Boolean)?vents:undefined} : {}),...remainingMirrors(window,vents) };
}

export function resizeWindow(window: Opening, width: number): Opening {
  return { ...window, width, sectionWidths: fitSections(windowSectionWidths(window), width) };
}

export function resizeWindowSection(window: Opening, index: number, width: number): Opening {
  const sectionWidths = windowSectionWidths(window);
  sectionWidths[index] = width;
  return { ...window, sectionWidths, width: precise(sectionWidths.reduce((sum, value) => sum + value, 0)) };
}
