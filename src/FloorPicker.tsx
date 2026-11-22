import { FinishColors } from "./HouseFinishPicker";
import { format, type Room } from "./model";
import { floorPreview } from "./floorMaterials";
import { defaultFloor, FLOOR_ANGLES, FLOOR_KINDS, FLOOR_OPTIONS, type FloorFinish } from "./floorSettings";

export function FloorPicker({rooms,roomId,finish,canReset,onRoomChange,onChange,onReset}: {
  rooms: Room[];
  roomId: string;
  finish?: FloorFinish;
  canReset: boolean;
  onRoomChange?: (id: string) => void;
  onChange: (finish: FloorFinish) => void;
  onReset: () => void;
}) {
  const options=finish && FLOOR_OPTIONS[finish.kind];
  return <section className="inspector-section floor-editor" data-testid="floor-editor">
    <div className="section-label">ПОКРЫТИЕ ПОЛА</div>
    {onRoomChange && <label className="floor-field">
      <span>Где применить</span>
      <select value={roomId} onChange={event=>onRoomChange(event.currentTarget.value)}>
        <option value="">Общее для дома</option>
        {rooms.map((room,i)=><option key={room.id} value={room.id}>
          Комната {String(i+1).padStart(2,"0")} · {format(room.area)} м²
        </option>)}
      </select>
    </label>}
    <label className="floor-field">
      <span>Материал пола</span>
      <select value={finish?.kind ?? ""} onChange={event=>{
        const kind=FLOOR_KINDS.find(item=>item.id===event.currentTarget.value)?.id;
        if (kind) onChange({...defaultFloor(kind),angle:finish?.angle ?? 0});
      }}>
        <option value="" disabled>Выберите покрытие</option>
        {FLOOR_KINDS.map(kind=><option key={kind.id} value={kind.id}>{kind.name}</option>)}
      </select>
    </label>
    {finish && options && <>
      <div className="facade-types floor-textures" role="group" aria-label="Фактура пола">
        {options.textures.map(texture=><button key={texture.id} type="button"
          aria-pressed={finish.texture===texture.id} onClick={()=>onChange({...finish,texture:texture.id})}>
          <img src={floorPreview({...finish,texture:texture.id})} alt="" />
          <span>{texture.name}</span>
        </button>)}
      </div>
      <FinishColors colors={options.colors} value={finish.color} prefix="floor-color" label="Цвет пола"
        onChange={color=>onChange({...finish,color})}/>
      <label className="floor-field">
        <span>Направление укладки</span>
        <select value={finish.angle} onChange={event=>{
          const angle=FLOOR_ANGLES.find(item=>item===Number(event.currentTarget.value));
          if (angle!==undefined) onChange({...finish,angle});
        }}>
          {FLOOR_ANGLES.map(angle=><option key={angle} value={angle}>
            {angle}° · {angle===0 ? "по горизонтали" : angle===90 ? "по вертикали" : "по диагонали"}
          </option>)}
        </select>
      </label>
    </>}
    {canReset && <button type="button" className="door-state-button" onClick={onReset}>
      {roomId ? "Использовать общее покрытие" : "Убрать общее покрытие"}
    </button>}
    {!roomId && <p className="property-hint">Общее покрытие применяется в комнатах без своей настройки.</p>}
  </section>;
}
