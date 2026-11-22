import { format, type Opening } from "./model";
import { windowSectionWidths, windowDividers, type WindowSectionCount } from "./windowSections";
import { windowFrameFinish, WINDOW_FRAME_FINISHES } from "./windowFinishes";

export function WindowSectionPicker({ opening, onChange, onVentChange, onVentMirror }: {
  opening: Opening;
  onChange: (count: WindowSectionCount) => void;
  onVentChange: (index: number) => void;
  onVentMirror: (index: number) => void;
}) {
  const widths = windowSectionWidths(opening), dividers = windowDividers(opening);
  const frameColor = WINDOW_FRAME_FINISHES.find(f => f.id === windowFrameFinish(opening))!.color;
  let start = 0;
  return <div className="window-section-picker">
    <span id="window-section-label">Количество секций</span>
    <div className="window-section-options" role="group" aria-labelledby="window-section-label">
      {([1, 2, 3] as const).map(count => <button key={count} type="button"
        aria-label={count === 1 ? "1 секция" : `${count} секции`}
        aria-pressed={count === widths.length}
        onClick={() => { if (count !== widths.length) onChange(count); }}>
        <svg viewBox="0 0 42 30" aria-hidden="true">
          <rect x="2" y="2" width="38" height="26" rx="1" />
          {Array.from({length: count - 1}, (_, i) => <line key={i} x1={2 + 38 * (i + 1) / count} x2={2 + 38 * (i + 1) / count} y1="2" y2="28" />)}
        </svg>
        <span>{count === 1 ? "1 секция" : `${count} секции`}</span>
      </button>)}
    </div>
    <div className="window-section-preview">
      <svg viewBox="0 0 220 76" role="img" aria-label={`Схема окна: ${widths.length === 1 ? "1 секция" : `${widths.length} секции`}, общая ширина ${format(opening.width, 3)} м`}>
        <rect x="10" y="8" width="200" height="50" rx="1" style={{stroke: frameColor, strokeWidth: 6}} />
        <rect x="7" y="5" width="206" height="56" rx="1" style={{fill:"none",stroke:"#8495a9",strokeWidth:1}} />
        {dividers.map((x, i) => <line key={i} x1={10 + x / opening.width * 200} x2={10 + x / opening.width * 200} y1="8" y2="58" style={{stroke:frameColor,strokeWidth:6}} />)}
        {widths.map((width, i) => {
          const x = 10 + (start + width / 2) / opening.width * 200;
          start += width;
          return width / opening.width * 200 >= 18 ? <text key={i} x={x} y="37" textAnchor="middle">{i + 1}</text> : null;
        })}
        <text className="window-preview-direction" x="10" y="73">Начало стены →</text>
      </svg>
    </div>
    <span id="window-vent-label">{opening.french ? "Открывающиеся створки" : "Форточки"}</span>
    <div className="window-section-options" role="group" aria-labelledby="window-vent-label">
      {widths.map((_,i)=><button key={i} type="button" data-testid={`window-vent-${i+1}`}
        aria-label={`${opening.french?"Створка":"Форточка"} в секции ${i+1}`} aria-pressed={!!opening.ventSections?.[i]} onClick={()=>onVentChange(i)}>
        Секция {i+1}
      </button>)}
    </div>
    <p className="property-hint">Выбранные секции открываются внутрь по щелчку в 3D и прогулке.</p>
    {opening.ventSections?.some(Boolean)&&<>
      <span id="window-vent-mirror-label">Зеркалить петли</span>
      <div className="window-section-options" role="group" aria-labelledby="window-vent-mirror-label">
        {opening.ventSections.map((state,i)=>state&&<button key={i} type="button" data-testid={`window-vent-mirror-${i+1}`}
          aria-label={`Зеркалить петли форточки в секции ${i+1}`} aria-pressed={opening.mirroredVents?.includes(i)??false}
          onClick={()=>onVentMirror(i)}>Секция {i+1}</button>)}
      </div>
    </>}
  </div>;
}
