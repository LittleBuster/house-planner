import { useMemo } from "react";
import { Icon } from "./icons";
import { bounds, findRooms, pointOnWall, type Project } from "./model";
import type { WalkState } from "./WalkControls";
import { siteBounds } from "./landscape";
import {wallBodies} from "./wallBodies";
import {sceneDisplay} from "./sceneDisplay";

export function WalkHUD({
  project,
  state,
  onStart,
  onReset,
}: {
  project: Project;
  state: WalkState;
  onStart: (capture: boolean) => void;
  onReset: () => void;
}) {
  const rooms = useMemo(() => findRooms(project.walls), [project.walls]);
  const b = siteBounds(project);
  const bodies=wallBodies(project.walls);
  const visible=sceneDisplay(project);
  const minX = Math.min(b.minX, state.position.x) - 0.6,
    minY = Math.min(b.minY, state.position.y) - 0.6;
  const width = Math.max(b.maxX, state.position.x) + 0.6 - minX,
    height = Math.max(b.maxY, state.position.y) + 0.6 - minY;
  const unit = Math.max(width / 176, height / 125);
  return (
    <>
      <div className="walk-crosshair" aria-hidden="true" />
      {!state.active && (
        <div className="walk-start-overlay">
          <section className="walk-start-card">
            <span className="walk-emblem">
              <Icon name="walk" size={25} />
            </span>
            <span className="eyebrow">ПЕРВЫЙ ЭТАЖ · ВИД ОТ ПЕРВОГО ЛИЦА</span>
            <h2>Почувствуйте пространство.</h2>
            <p>
              Посмотрите на свой дом с высоты человеческого роста.
              <br />
              Стены останавливают, открытые двери пропускают.
            </p>
            <div className="walk-measure">
              <span>
                Рост<strong>1,75 м</strong>
              </span>
              <i />
              <span>
                Высота глаз<strong>1,65 м</strong>
              </span>
            </div>
            <div className="walk-keys">
              <span>
                <kbd>W</kbd>
                <span>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd>
                </span>
              </span>
              <p>
                Движение по дому
                <small>Shift — бег · Пробел — прыжок · мышь — взгляд · клик по двери или форточке — открыть/закрыть · Esc — пауза</small>
              </p>
            </div>
            <button
              className="button primary full"
              data-testid="walk-start"
              onClick={(event) => onStart(event.isTrusted)}
            >
              Начать прогулку
              <Icon name="arrow" size={17} />
            </button>
          </section>
        </div>
      )}
      <div className="walk-status" role="status">
        <span className={state.blocked ? "blocked" : ""} />
        {!state.active
          ? "Готовы к прогулке"
          : state.blocked
            ? "Препятствие"
            : state.jumping
              ? "Прыжок"
            : state.running
              ? "Бег · 3,2 м/с"
              : "Шаг · 1,5 м/с"}
        <i />
        {state.input === "drag"
          ? "Обзор — перетаскивание мышью"
          : "Esc — освободить курсор"}
      </div>
      <div className="walk-minimap">
        <div>
          <span>ВЫ ЗДЕСЬ</span>
          <button
            title="Вернуться на старт"
            aria-label="Вернуться на старт"
            onClick={onReset}
          >
            <Icon name="fit" size={14} />
          </button>
        </div>
        <svg
          width="176"
          height="125"
          viewBox={`${minX} ${minY} ${width} ${height}`}
          aria-label="Ваше положение на плане дома"
        >
          {(visible.landscape?project.plants??[]:[]).map((p) => (
            <circle
              key={p.id}
              cx={p.position.x}
              cy={p.position.y}
              r={Math.max(unit * 3, p.height * 0.15)}
              fill="#869b72"
              opacity=".65"
            />
          ))}
          {(visible.house?rooms:[]).map((room, i) => (
            <polygon
              key={i}
              points={room.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="#e8eef7"
            />
          ))}
          {(visible.house?project.walls:[]).map((w) => (
            <polygon
              key={w.id}
              points={bodies.get(w.id)!.polygon.map(p=>`${p.x},${p.y}`).join(" ")}
              fill="#7a8ea7"
              stroke="#7a8ea7"
              strokeWidth={Math.max(0, unit * 1.6-w.thickness)}
            />
          ))}
          {(visible.house?project.openings:[])
            .filter((o) => o.kind === "door")
            .map((o) => {
              const w = project.walls.find((w) => w.id === o.wallId)!;
              const a = pointOnWall(w, o.offset - o.width / 2 + 0.045),
                c = pointOnWall(w, o.offset + o.width / 2 - 0.045);
              return (
                <line
                  key={o.id}
                  x1={a.x}
                  y1={a.y}
                  x2={c.x}
                  y2={c.y}
                  stroke="#f8fafd"
                  strokeWidth={w.thickness + 0.05}
                />
              );
            })}
          <g
            transform={`translate(${state.position.x},${state.position.y}) rotate(${(-state.yaw * 180) / Math.PI})`}
          >
            <path
              d={`M0 0 L${-unit * 10} ${-unit * 23} Q0 ${-unit * 30} ${unit * 10} ${-unit * 23} Z`}
              fill="#4b83c0"
              opacity=".2"
            />
            <circle
              r={unit * 4}
              fill="#2864a8"
              stroke="white"
              strokeWidth={unit * 1.7}
            />
          </g>
        </svg>
        <span className="minimap-note">Глаза стоя 1,65 м · масштаб 1:1</span>
      </div>
    </>
  );
}
