import {RAL_GREYS} from "./ralColors";
export type RoofType="flat"|"gable"|"hip";
export type RoofColor="slate"|"ral7042"|"ral7024"|"brown"|"terracotta"|"black";
export type RoofSurface="smooth"|"metal-tile"|"profiled";
export type RoofSettings={type:RoofType;height:number;overhang:number;direction:"x"|"y";color?:RoofColor;surface?:RoofSurface};
export const ROOF_SURFACES:{id:RoofSurface;name:string}[]=[
  {id:"smooth",name:"Гладкая"},
  {id:"metal-tile",name:"Металлочерепица"},
  {id:"profiled",name:"Профлист"},
];
export const roofSurface=(roof?:Pick<RoofSettings,"surface">):RoofSurface=>roof?.surface??"smooth";
export const ROOF_COLORS:{id:RoofColor;name:string;color:string}[]=[
  {id:"slate",name:"Серо-синий",color:"#526176"},
  {id:"ral7042",name:"RAL 7042",color:RAL_GREYS.ral7042},
  {id:"ral7024",name:"RAL 7024",color:RAL_GREYS.ral7024},
  {id:"brown",name:"Коричневый",color:"#513a2e"},
  {id:"terracotta",name:"Терракота",color:"#95452f"},
  {id:"black",name:"Чёрный",color:"#232529"},
];
export const roofColor=(roof?:Pick<RoofSettings,"color">):RoofColor=>roof?.color??"slate";
export const DEFAULT_ROOF:RoofSettings={type:"gable",height:1.8,overhang:.35,direction:"x"};
export const ROOF_TYPES:{id:RoofType;name:string;description:string}[]=[
  {id:"flat",name:"Плоская",description:"Горизонтальное покрытие"},
  {id:"gable",name:"Двускатная",description:"Два ската и конёк"},
  {id:"hip",name:"Многоскатная",description:"Скаты по всему контуру"},
];
export function validRoofSettings(value:unknown):value is RoofSettings{
  if(!value||typeof value!=="object")return false;
  const roof=value as Record<string,unknown>;
  return ROOF_TYPES.some(t=>t.id===roof.type)&&typeof roof.height==="number"&&Number.isFinite(roof.height)&&roof.height>=.3&&roof.height<=8&&
    typeof roof.overhang==="number"&&Number.isFinite(roof.overhang)&&roof.overhang>=0&&roof.overhang<=1.5&&(roof.direction==="x"||roof.direction==="y")&&
    (roof.color===undefined||ROOF_COLORS.some(c=>c.id===roof.color))&&
    (roof.surface===undefined||ROOF_SURFACES.some(s=>s.id===roof.surface));
}
