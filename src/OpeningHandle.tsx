export function OpeningHandle({x,unit,thickness,hitWidth,active,cursor,edge,divider}: {
  x:number;
  unit:number;
  thickness:number;
  hitWidth:number;
  active:boolean;
  cursor:string;
  edge?:"start"|"end";
  divider?:number;
}) {
  const height=Math.max(thickness+10*unit,24*unit);
  return <g data-opening-edge={edge} data-window-divider-handle={divider===undefined?undefined:divider+1}
    className={`opening-edge${active?" active":""}`} style={{cursor}}>
    <title>{divider===undefined?"Потяните край для изменения ширины проёма":`Потяните границу секций ${divider+1} и ${divider+2}`}</title>
    <rect x={x-hitWidth/2} y={-height/2} width={hitWidth} height={height} fill="transparent" />
    <line className="opening-edge-visual" pointerEvents="none" x1={x} x2={x}
      y1={-thickness/2-3*unit} y2={thickness/2+3*unit} stroke="#405e82" strokeWidth={2*unit}/>
    <rect className="opening-edge-visual" pointerEvents="none" x={x-2.5*unit} y={-6*unit}
      width={5*unit} height={12*unit} rx={1.5*unit} fill="#f8fbff" stroke="#405e82" strokeWidth={1.3*unit}/>
  </g>;
}
