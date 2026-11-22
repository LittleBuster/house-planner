import {BRICK_COLORS,STUCCO_COLORS,type FacadeSettings} from "./facadeSettings";
import {facadePreview} from "./facadeMaterials";

export function FacadePicker({value,onChange}:{value:FacadeSettings;onChange:(value:FacadeSettings)=>void}){
  const colors=value.kind==="stucco"?STUCCO_COLORS:BRICK_COLORS;
  return <section className="inspector-section facade-editor" data-testid="facade-editor">
    <div className="section-label">ФАСАД</div>
    <div className="facade-types" role="group" aria-label="Покрытие внешних стен">
      {(["stucco","brick"] as const).map(kind=>{
        const settings:FacadeSettings=value.kind===kind?value:kind==="stucco"?{kind,color:"white"}:{kind,color:"red"};
        return <button key={kind} data-testid={`facade-${kind}`} aria-pressed={value.kind===kind} onClick={()=>onChange(settings)}>
          <img src={facadePreview(settings)} alt=""/><span>{kind==="stucco"?"Декоративная штукатурка":"Облицовочный кирпич"}</span>
        </button>;
      })}
    </div>
    <div className={`facade-colors ${value.kind}`} role="group" aria-label="Цвет фасада">
      {colors.map(color=>{
        const settings={kind:value.kind,color:color.id} as FacadeSettings;
        return <button key={color.id} data-testid={`facade-color-${color.id}`} title={color.name} aria-label={color.name} aria-pressed={value.color===color.id} onClick={()=>onChange(settings)}>
          <img src={facadePreview(settings)} alt=""/><span>{color.name}</span>
        </button>;
      })}
    </div>
    <p className="property-hint">На всех наружных стенах и фронтонах. Цвет и фактура внутренних стен задаются отдельно.</p>
  </section>;
}
