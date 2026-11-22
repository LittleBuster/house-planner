import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { format, type PlantKind } from "./model";
import { PLANT_CATALOGUE, PLANT_VARIANTS, plantVariant } from "./landscape";
import { usePlantPreviews } from "./PlantVariants";
import { lawnThumbnail } from "./lawnModels";
import { isHerb } from "./plantSettings";
import { GROUND_COVERS, type GroundCover } from "./groundSettings";
import { groundPreview } from "./groundMaterials";
import { FENCE_TYPES, type FenceKind } from "./fenceSettings";
import type { GateToolKind } from "./gateSettings";

type LawnPanelOptions = { active:GroundCover|null; selected:boolean; size:number; depth:number; count:number; area:number; onChoose:(cover:GroundCover)=>void; onCancel:()=>void };
export function LandscapePanel({ active, onChoose, onCancel, count, variants, selectedKind, lawn, steps, fence, gate }: {
  active: PlantKind | null;
  onChoose: (kind: PlantKind) => void;
  onCancel: () => void;
  count: number;
  variants: Record<PlantKind,string>;
  selectedKind: PlantKind | null;
  lawn: LawnPanelOptions;
  steps: {active:boolean;onChoose:()=>void;onCancel:()=>void};
  fence: {active:FenceKind|null;selected:boolean;count:number;onChoose:(kind:FenceKind)=>void;onCancel:()=>void};
  gate: {active:GateToolKind|null;selected:boolean;onChoose:(kind:GateToolKind)=>void};
}) {
  const { previews: thumbnails, error, retry }=usePlantPreviews();
  const [section,setSection]=useState<"trees"|"plants"|"lawn"|"steps"|"fence">("trees");
  const [grassImage,setGrassImage]=useState("");
  const [grassError,setGrassError]=useState(false);
  const loadGrass=()=>{setGrassError(false);lawnThumbnail().then(setGrassImage).catch(()=>setGrassError(true));};
  useEffect(loadGrass,[]);
  useEffect(()=>{if(lawn.active||lawn.selected)setSection("lawn");},[lawn.active,lawn.selected]);
  useEffect(()=>{const kind=active??selectedKind;if(kind)setSection(isHerb(kind)?"plants":"trees");},[active,selectedKind]);
  useEffect(()=>{if(fence.active||fence.selected||gate.active||gate.selected)setSection("fence");},
    [fence.active,fence.selected,gate.active,gate.selected]);
  return <div className="landscape-panel">
    <div className="sidebar-title">ЛАНДШАФТНЫЙ ДИЗАЙН<span>05</span></div>
    <p className="landscape-intro">Растения и покрытия для участка</p>
    <div className="landscape-tabs" aria-label="Категории ландшафта">
      <button data-testid="landscape-trees-tab" className={section==="trees"?"active":""} onClick={()=>{setSection("trees");lawn.onCancel();steps.onCancel();fence.onCancel();onCancel();}}>Деревья</button>
      <button data-testid="landscape-plants-tab" className={section==="plants"?"active":""} onClick={()=>{setSection("plants");lawn.onCancel();steps.onCancel();fence.onCancel();onCancel();}}>Растения</button>
      <button data-testid="landscape-lawn-tab" className={section==="lawn"?"active":""} onClick={()=>{setSection("lawn");steps.onCancel();fence.onCancel();onCancel();}}>Покрытия</button>
      <button data-testid="landscape-steps-tab" className={section==="steps"?"active":""} onClick={()=>{setSection("steps");lawn.onCancel();fence.onCancel();onCancel();}}>Ступеньки</button>
      <button data-testid="landscape-fences-tab" className={section==="fence"?"active":""} onClick={()=>{setSection("fence");lawn.onCancel();steps.onCancel();onCancel();}}>Заборы</button>
    </div>
    {section==="fence" ? <>
      <div className="ground-catalogue fence-catalogue" aria-label="Виды забора">
        {FENCE_TYPES.map(type=><button key={type.id} type="button" data-testid={type.id+"-fence-tool"}
          className={`plant-card ground-card ${fence.active===type.id?"active":""}`} aria-pressed={fence.active===type.id}
          onClick={()=>fence.onChoose(type.id)}>
          <span className="ground-preview">
            <svg width="54" height="35" viewBox="0 0 54 35" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M4 32V3M50 32V3" strokeWidth="3"/>
              {type.id==="mesh" ? <path d="M5 8H49M5 15H49M5 22H49M5 29H49M11 6V29M17 6V29M23 6V29M29 6V29M35 6V29M41 6V29M47 6V29"/> :
                <path d="M5 11H49M5 23H49M10 28V7M17 28V7M24 28V7M31 28V7M38 28V7M45 28V7" strokeWidth="3" strokeLinecap="round"/>}
            </svg>
          </span>
          <strong>{type.name}</strong>
        </button>)}
      </div>
      <p className="property-hint">После первой секции забор продолжится по прямой от общего столба. Shift позволяет повернуть.</p>
      <div className="section-label">РАСПАШНЫЕ ВОРОТА</div>
      <div className="ground-catalogue fence-catalogue" aria-label="Виды ворот">
        {FENCE_TYPES.map(type=><button key={type.id} type="button" data-testid={type.id+"-gate-tool"}
          className={`plant-card ground-card ${gate.active===type.id?"active":""}`} aria-pressed={gate.active===type.id}
          onClick={()=>gate.onChoose(type.id)}>
          <Icon name="grid" size={22}/>
          <strong>{type.id==="mesh"?"Ворота из 3D-сетки":"Ворота из штакетника"}</strong>
        </button>)}
      </div>
      <div className="section-label">КАЛИТКА</div>
      <div className="ground-catalogue fence-catalogue">
        <button type="button" data-testid="wicket-tool"
          className={`plant-card ground-card ${gate.active==="wicket"?"active":""}`} aria-pressed={gate.active==="wicket"}
          onClick={()=>gate.onChoose("wicket")}>
          <Icon name="door" size={22}/>
          <strong>Распашная калитка</strong>
        </button>
      </div>
      {(fence.active||gate.active)&&<button type="button" className="cancel-planting" onClick={fence.onCancel}><Icon name="close" size={13}/>Завершить</button>}
      <div className="landscape-count"><Icon name="grid" size={15}/>Секций<strong>{fence.count}</strong></div>
    </> : section==="steps" ? <>
      <button className="door-state-button" type="button" aria-pressed={steps.active}
        onClick={steps.active ? steps.onCancel : steps.onChoose}>
        {steps.active ? "Завершить размещение" : "Разместить ступеньки"}
      </button>
      <p className="property-hint">Нажмите на наружную дверь или французское окно в 3D. Повторный щелчок уберёт ступеньки.</p>
    </> : section!=="lawn" ? <>
      <div className="plant-catalogue" aria-label="Каталог растений">
        {(Object.keys(PLANT_CATALOGUE) as PlantKind[]).filter(kind=>isHerb(kind)===(section==="plants")).map(kind=>{
          const p=PLANT_CATALOGUE[kind],variant=plantVariant(kind,variants[kind]).id;
          return <button key={kind} className={`plant-card ${active===kind?"active":""}`} data-testid={`plant-${kind}`} aria-pressed={active===kind} disabled={!thumbnails[variant]} draggable
            onDragStart={event=>{event.dataTransfer.setData("application/x-domplan-plant",kind);event.dataTransfer.effectAllowed="copy";onChoose(kind);}}
            onDragEnd={onCancel} onClick={()=>onChoose(kind)} title={`${p.name} — выбрать или перетащить на участок`}>
            <span className="plant-preview">{thumbnails[variant]?<img src={thumbnails[variant]} alt="" draggable={false}/>:<Icon name="tree" size={33}/>}</span>
            <span className="plant-card-copy"><strong>{p.name}</strong><small>{p.detail}</small><em>{thumbnails[variant]?`${PLANT_VARIANTS[kind].length} форм · выбрать`:"Загрузка моделей…"}<Icon name="plus" size={12}/></em></span>
          </button>;
        })}
      </div>
      {error&&<button className="variant-retry" onClick={retry}>Не удалось загрузить модели. Повторить</button>}
      <div className="landscape-guidance"><Icon name={active?"cursor":"hand"} size={16}/><p>{active?"Выберите форму справа и нажмите на участок.":section==="plants"?"Выберите растение или перетащите его на участок.":"Выберите дерево или перетащите его на участок."}<small>{active?"Shift — несколько · Esc — закончить":section==="plants"?"Высота от 5 см до 2 м · можно ходить сквозь траву":"Высоту можно изменить до и после посадки"}</small></p></div>
      {active&&<button className="cancel-planting" onClick={onCancel}><Icon name="close" size={13}/>Завершить посадку</button>}
      <div className="landscape-count"><Icon name="tree" size={15}/>На участке<strong data-testid="plant-count">{count}</strong></div>
    </> : <>
      <div className="ground-catalogue" aria-label="Покрытия участка">
        {GROUND_COVERS.map(cover => {
          const src = cover.id === "lawn" ? grassImage : groundPreview(cover.id);
          return <button key={cover.id} className={`plant-card ground-card ${lawn.active===cover.id?"active":""}`}
            data-testid={`${cover.id}-tool`} aria-pressed={lawn.active===cover.id} title={cover.detail}
            disabled={!src} onClick={()=>lawn.onChoose(cover.id)}>
            <span className={`ground-preview ${cover.id === "lawn" ? "grass" : "solid"}`}>
              {src?<img src={src} alt="" draggable={false}/>:<Icon name="lawn" size={30}/>}
            </span>
            <strong>{cover.name}</strong>
            <small>{src?`${format(lawn.size)} × ${format(lawn.depth)} м`:"Загрузка…"}</small>
          </button>;
        })}
      </div>
      {grassError&&<button className="variant-retry" onClick={loadGrass}>Повторить загрузку газона</button>}
      <div className="landscape-guidance"><Icon name={lawn.active?"cursor":"grid"} size={16}/><p>{lawn.active?"Нажимайте на землю. У дома покрытие подрежется по контуру.":"Выберите покрытие и задайте ширину и длину справа."}<small>{lawn.active?"Esc — закончить укладку":"Бетон подходит для отмостки и дорожек"}</small></p></div>
      {lawn.active&&<button className="cancel-planting" onClick={lawn.onCancel}><Icon name="close" size={13}/>Завершить укладку</button>}
      <div className="landscape-count"><Icon name="lawn" size={15}/>Участков<strong data-testid="lawn-count">{lawn.count}</strong></div>
      <div className="lawn-sidebar-area">Площадь покрытий<strong>{format(lawn.area)} м²</strong></div>
    </>}
  </div>;
}
