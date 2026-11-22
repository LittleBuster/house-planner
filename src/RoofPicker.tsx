import {ROOF_TYPES,ROOF_COLORS,ROOF_SURFACES,type RoofSettings,type RoofType,type RoofColor,type RoofSurface} from "./roofSettings";
export function RoofColorPicker({color,onChoose}:{color:RoofColor;onChoose:(color:RoofColor)=>void}){
  return <div className="roof-color-picker"><span>Цвет крыши</span><div className="roof-color-options" role="group" aria-label="Цвет крыши">
    {ROOF_COLORS.map(c=><button type="button" key={c.id} data-testid={`roof-color-${c.id}`} aria-label={c.name} aria-pressed={color===c.id} title={c.name} onClick={()=>onChoose(c.id)}>
      <i style={{backgroundColor:c.color}}/><span>{c.name}</span>
    </button>)}
  </div></div>;
}
export function RoofSurfacePicker({surface,color,onChoose}:{surface:RoofSurface;color:RoofColor;onChoose:(surface:RoofSurface)=>void}){
  const tint=ROOF_COLORS.find(c=>c.id===color)!.color;
  return <div className="roof-color-picker"><span>Фактура крыши</span><div className="roof-color-options roof-surface-options" role="group" aria-label="Фактура крыши">
    {ROOF_SURFACES.map(option=><button key={option.id} type="button" data-testid={`roof-surface-${option.id}`}
      aria-pressed={surface===option.id} onClick={()=>onChoose(option.id)}>
      <i className={`roof-swatch-${option.id}`} style={{backgroundColor:tint}}/><span>{option.name}</span>
    </button>)}
  </div></div>;
}
export function RoofPicker({roof,onChoose}:{roof?:RoofSettings;onChoose:(type:RoofType)=>void}){
  return <div className="roof-type-options" role="group" aria-label="Тип крыши">
    {ROOF_TYPES.map(type=><button key={type.id} type="button" data-testid={`roof-${type.id}`} aria-label={`${type.name} крыша`} aria-pressed={roof?.type===type.id} onClick={()=>onChoose(type.id)}>
      <svg viewBox="0 0 60 38" aria-hidden="true">
        {type.id==="flat"?<><path d="M7 13h46v8H7Z"/><path d="M12 21v11h36V21"/></>:type.id==="gable"?<><path d="m5 22 25-17 25 17-4 4L30 12 9 26Z"/><path d="M12 24v9h36v-9M30 12v19"/></>:<><path d="m4 25 14-19h24l14 19-9 8H13Z"/><path d="m4 25 26-12 26 12M18 6l12 7L42 6M13 33l17-20 17 20"/></>}
      </svg><span>{type.name}</span>
    </button>)}
  </div>;
}
