import type { Opening } from "./model";
import {RAL_GREYS} from "./ralColors";

export type WindowFrameFinish = "white" | "ral7042" | "ral7024" | "wood";
export const WINDOW_FRAME_FINISHES: { id: WindowFrameFinish; name: string; color: string }[] = [
  { id: "white", name: "Белый", color: "#f5f5f2" },
  // Screen swatch used by RAL: https://www.ral-farben.de/en/colour/ral-classic/ral-7042/9256
  { id: "ral7042", name: "RAL 7042", color: "#8c9190" },
  { id: "ral7024", name: "RAL 7024", color: RAL_GREYS.ral7024 },
  { id: "wood", name: "Под дерево", color: "#9b683d" },
];
// Older saved projects used RAL 7047 for the grey option.
export const windowFrameFinish = (opening: {frameFinish?: WindowFrameFinish | "ral7047"}): WindowFrameFinish =>
  opening.frameFinish === "ral7047" ? "ral7042" : opening.frameFinish ?? "white";
export function validWindowFrameFinish(opening: Opening): boolean {
  return opening.frameFinish === undefined || opening.kind === "window" && typeof opening.frameFinish === "string" &&
    WINDOW_FRAME_FINISHES.some(finish => finish.id === windowFrameFinish(opening));
}
