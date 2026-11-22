import type {Project} from "./model";
import {RAL_GREYS} from "./ralColors";

export type StuccoColor="white"|"ral7047"|"ral7042"|"ral7024";
export type BrickColor="red"|"terracotta"|"sand"|"brown"|"graphite";
export type FacadeSettings={kind:"stucco";color:StuccoColor}|{kind:"brick";color:BrickColor};
export const DEFAULT_FACADE:FacadeSettings={kind:"stucco",color:"white"};
// Screen approximations; RAL source swatches: ral-farben.de/en/colour/ral-classic/ral-7047/9261 and ral-7042/9256.
export const STUCCO_COLORS:{id:StuccoColor;name:string;color:string}[]=[
  {id:"white",name:"Белый",color:"#f5f5f2"},{id:"ral7047",name:"RAL 7047",color:RAL_GREYS.ral7047},{id:"ral7042",name:"RAL 7042",color:RAL_GREYS.ral7042},{id:"ral7024",name:"RAL 7024",color:RAL_GREYS.ral7024},
];
export const BRICK_COLORS:{id:BrickColor;name:string;color:string}[]=[
  {id:"red",name:"Красный",color:"#a4513d"},{id:"terracotta",name:"Терракота",color:"#bd7653"},
  {id:"sand",name:"Песочный",color:"#c5ab80"},{id:"brown",name:"Коричневый",color:"#75503b"},{id:"graphite",name:"Графит",color:"#565853"},
];
export const facadeSettings=(project:Pick<Project,"facade">):FacadeSettings=>project.facade??DEFAULT_FACADE;
export function validFacadeSettings(value:unknown):value is FacadeSettings{
  if(!value||typeof value!=="object")return false;
  const p=value as FacadeSettings;
  return p.kind==="stucco"&&STUCCO_COLORS.some(c=>c.id===p.color)||p.kind==="brick"&&BRICK_COLORS.some(c=>c.id===p.color);
}
