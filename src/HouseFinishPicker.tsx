import { STUCCO_COLORS } from "./facadeSettings";
import { DOOR_FINISHES, type InteriorSettings, type DoorFinish, type PlinthSettings } from "./houseFinishes";
import { facadePreview } from "./facadeMaterials";

export function FinishColors<T extends string>({colors,value,prefix,label,onChange}:{colors:{id:T;name:string;color:string}[];value:T;prefix:string;label:string;onChange:(value:T)=>void}){
  return <div className="finish-colors" role="group" aria-label={label}>
    {colors.map(c=><button key={c.id} type="button" data-testid={`${prefix}-${c.id}`} aria-pressed={c.id===value} aria-label={c.name} title={c.name} onClick={()=>onChange(c.id)}>
      <i className={c.id==="wood"?"wood-swatch":""} style={{backgroundColor:c.color}}/><span>{c.name}</span>
    </button>)}
  </div>;
}
export function InteriorPicker({value,onChange}:{value:InteriorSettings;onChange:(v:InteriorSettings)=>void}){
  return <section className="inspector-section" data-testid="interior-editor">
    <div className="section-label">ВНУТРЕННИЕ СТЕНЫ</div>
    <div className="facade-types" role="group" aria-label="Покрытие внутренних стен">
      {(["paint","stucco"] as const).map(kind=><button key={kind} data-testid={`interior-${kind}`} aria-pressed={value.kind===kind} onClick={()=>onChange({...value,kind})}>
        {kind==="stucco"?<img src={facadePreview({kind:"stucco",color:value.color})} alt=""/>:<i className="paint-preview" style={{backgroundColor:STUCCO_COLORS.find(c=>c.id===value.color)!.color}}/>}
        <span>{kind==="paint"?"Под покраску":"Декоративная штукатурка"}</span>
      </button>)}
    </div>
    <FinishColors colors={STUCCO_COLORS} value={value.color} prefix="interior-color" label="Цвет внутренних стен" onChange={color=>onChange({...value,color})}/>
    <p className="property-hint">Для внутренних сторон стен и перегородок. Под покраску — гладкая поверхность, штукатурка — мелкозернистая.</p>
  </section>;
}
export function PlinthPicker({value,onChange}:{value:PlinthSettings;onChange:(v:PlinthSettings)=>void}){
  return <div data-testid="plinth-editor"><div className="section-label">ЦОКОЛЬ</div>
    <FinishColors colors={STUCCO_COLORS} value={value.color} prefix="plinth-color" label="Цвет цоколя" onChange={color=>onChange({...value,color})}/>
  </div>;
}
export function DoorFinishPicker({value,onChange,prefix="door-color"}:{value:DoorFinish;onChange:(v:DoorFinish)=>void;prefix?:string}){
  return <FinishColors colors={DOOR_FINISHES} value={value} prefix={prefix} label="Цвет дверей" onChange={onChange}/>;
}
