import { useId } from "react";
import { format, type Opening, type Project } from "./model";
import { measureOpeningClearances } from "./openingClearances";
import { readablePlanAngle } from "./planLabels";

const names={window:"окна",door:"двери",wall:"стены", "wall-end":"конца стены"};
export function OpeningClearanceDimensions({project,opening,unit}:{project:Project;opening:Opening;unit:number}){
  const markerId=`opening-clearance-${useId().replace(/[^a-zA-Z0-9_-]/g,"")}`;
  const wall=project.walls.find(w=>w.id===opening.wallId),values=measureOpeningClearances(project,opening);
  if(!wall||!values.length)return null;
  const name=opening.kind==="door"?"двери":"окна";
  const angle=Math.atan2(wall.b.y-wall.a.y,wall.b.x-wall.a.x)*180/Math.PI;
  const y=wall.thickness/2+46*unit,correction=readablePlanAngle(angle)-angle;
  return <g data-testid="opening-clearances" data-opening-id={opening.id} pointerEvents="none"
    role="img" aria-label={`Расстояния от краёв ${name}. ${values.map(v=>`${v.side==="start"?"От начала":"От конца"} до ${names[v.kind]} ${format(v.distance,3)} м`).join(". ")}`}
    transform={`translate(${wall.a.x},${wall.a.y}) rotate(${angle})`}>
    <defs><marker id={markerId} viewBox="0 0 10 10" refX="5" refY="5" markerWidth={6*unit} markerHeight={6*unit} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
      <path d="M9 5L1 1L1 9Z" fill="#4d7cae" />
    </marker></defs>
    {values.map(value=>{
      const text=`${format(value.distance,3)} м`,width=Math.max(56,text.length*6+16)*unit;
      const middle=(value.from+value.to)/2,short=value.distance<width+12*unit;
      const labelX=short?value.from+(value.side==="start"?-1:1)*(width/2+8*unit):middle;
      const color=value.overlap?"#b06a63":"#4d7cae";
      return <g key={value.side} data-opening-clearance={value.side} data-distance={value.distance}
        data-from={value.from} data-to={value.to} data-obstacle-kind={value.kind} data-obstacle-id={value.obstacleId} data-overlap={value.overlap}>
        <title>От края {name} до {names[value.kind]} {text}</title>
        {[value.from,value.to].map((x,i)=><line key={i} x1={x} x2={x} y1={wall.thickness/2+3*unit} y2={y+5*unit}
          stroke={color} strokeWidth={unit} strokeDasharray={`${3*unit} ${3*unit}`} opacity=".7" />)}
        <line className="opening-clearance-line" x1={value.from} x2={value.to} y1={y} y2={y} stroke={color} strokeWidth={1.3*unit}
          markerStart={`url(#${markerId})`} markerEnd={`url(#${markerId})`}/>
        {short&&<line x1={middle} y1={y} x2={labelX} y2={y} stroke={color} strokeWidth={unit} strokeDasharray={`${2*unit} ${3*unit}`}/>}
        <g transform={`translate(${labelX},${y}) rotate(${correction})`}>
          <rect x={-width/2} y={-11*unit} width={width} height={22*unit} rx={4*unit} fill="#f5f9ff" stroke={color} strokeWidth={unit}/>
          <text className="opening-clearance-label" x="0" y="0" textAnchor="middle" dominantBaseline="central"
            fill={color} fontSize={11*unit}>{text}</text>
        </g>
      </g>;
    })}
  </g>;
}
