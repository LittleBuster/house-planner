import type {Project} from "./model";

export type SceneDisplay={house:boolean;roof:boolean;landscape:boolean};
export const DEFAULT_DISPLAY:SceneDisplay={house:true,roof:true,landscape:true};
export const sceneDisplay=(project:Pick<Project,"display">):SceneDisplay=>project.display??DEFAULT_DISPLAY;
export function validSceneDisplay(value:unknown):value is SceneDisplay{
  return !!value&&typeof value==="object"&&["house","roof","landscape"].every(key=>typeof (value as Record<string,unknown>)[key]==="boolean");
}
