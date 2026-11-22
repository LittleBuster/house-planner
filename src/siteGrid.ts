import type {Point,Project} from "./model";
import {coverBounds} from "./groundSettings";

export const SITE_SNAP_STEP=.01;
export const DEFAULT_LAWN_GRID_SIZE=2;
export type SiteGridSettings={lawnSize:number};
export const lawnGridSize=(project:Pick<Project,"siteGrid">)=>project.siteGrid?.lawnSize??DEFAULT_LAWN_GRID_SIZE;
export function validSiteGrid(value:unknown):value is SiteGridSettings{
  return !!value&&typeof value==="object"&&Number.isFinite((value as SiteGridSettings).lawnSize)&&(value as SiteGridSettings).lawnSize>=.5&&(value as SiteGridSettings).lawnSize<=5;
}
const precise=(value:number)=>Math.round(value*1e6)/1e6;
export const snapSiteValue=(value:number)=>precise(Math.round(value/SITE_SNAP_STEP)*SITE_SNAP_STEP);
export const snapSitePoint=(point:Point):Point=>({x:snapSiteValue(point.x),y:snapSiteValue(point.y)});
export function siteGridLines(project:Pick<Project,"walls"|"lawn"|"siteGrid">):number[]{
  const step=lawnGridSize(project),points=[...project.walls.flatMap(w=>[w.a,w.b]),...(project.lawn??[]).flatMap(tile=>{
    const bounds = coverBounds(tile);
    return [{x:bounds.minX,y:bounds.minY},{x:bounds.maxX,y:bounds.maxY}];
  })];
  const xs=points.length?points.map(p=>p.x):[-5,5],ys=points.length?points.map(p=>p.y):[-5,5];
  const house=project.walls.flatMap(w=>[w.a,w.b]);
  const range=(values:number[],axis:"x"|"y")=>{
    const low=Math.floor(Math.min(...values)/step)-4,high=Math.ceil(Math.max(...values)/step)+4;
    const focus=house.length?house.map(p=>p[axis]):values,mid=Math.floor((Math.min(...focus)+Math.max(...focus))/2/step);
    return[Math.max(low,mid-40),Math.min(high,mid+40)];
  };
  const[a,b]=range(xs,"x"),[c,d]=range(ys,"y"),result:number[]=[];
  for(let x=a;x<=b;x++)result.push(precise(x*step),precise(c*step),precise(x*step),precise(d*step));
  for(let y=c;y<=d;y++)result.push(precise(a*step),precise(y*step),precise(b*step),precise(y*step));
  return result;
}
