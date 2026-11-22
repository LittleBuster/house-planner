import type {SceneDisplay} from "./sceneDisplay";
export function SceneLayers({display,hasRoof,onChange}:{display:SceneDisplay;hasRoof:boolean;onChange:(layer:keyof SceneDisplay,visible:boolean)=>void}){
  return <div className="scene-layers" role="group" aria-label="Отображение объектов">
    {([['house','Дом'],['roof','Крыша'],['landscape','Ландшафт']] as const).map(([id,name])=><label key={id} title={id==="house"?"Стены, окна, двери и пол":id==="landscape"?"Деревья, газон и земля":"Показать или скрыть крышу"}>
      <input type="checkbox" data-testid={`layer-${id}`} checked={display[id]&&(id!=="roof"||hasRoof)} onChange={e=>onChange(id,e.target.checked)}/><span>{name}</span>
    </label>)}
  </div>;
}
