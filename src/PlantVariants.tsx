import { useEffect, useState } from "react";
import type { PlantKind } from "./model";
import { PLANT_VARIANTS, plantVariant } from "./landscape";
import { plantThumbnails } from "./plantModels";
import { isHerb } from "./plantSettings";

export function usePlantPreviews() {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true; setError(false);
    plantThumbnails().then(images => { if (current) setPreviews(images); }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [attempt]);
  return { previews, error, retry: () => setAttempt(n => n + 1) };
}
export function PlantVariants({ kind, value, onChoose }: {
  kind: PlantKind;
  value?: string;
  onChoose: (variant: string) => void;
}) {
  const { previews, error, retry } = usePlantPreviews();
  const variants = PLANT_VARIANTS[kind], selected = plantVariant(kind, value).id;
  const subject = isHerb(kind) ? "растения" : "дерева";
  return <section className="plant-variants" aria-label={`Выбор формы ${subject}`}>
    <div className="variant-heading"><strong>Форма {subject}</strong><span>{variants.length} вариантов</span></div>
    {error ? <button className="variant-retry" onClick={retry}>Повторить загрузку моделей</button> : <>
      <div className="variant-grid" role="group" aria-label={`Формы ${subject}`} key={kind}>
        {variants.map(variant => <button
          key={variant.id} className={`variant-card ${variant.id === selected ? "active" : ""}`}
          data-testid={`variant-${variant.id}`} aria-pressed={variant.id === selected}
          disabled={!previews[variant.id]} onClick={() => onChoose(variant.id)}
          title={variant.name}
        >
          {previews[variant.id] ? <img src={previews[variant.id]} alt="" draggable={false} /> : <span className="variant-loading">Загрузка…</span>}
          <span>{variant.name}</span>
        </button>)}
      </div>
      <p className="property-hint">Список форм прокручивается. У посаженного {subject} форма меняется на месте.</p>
    </>}
  </section>;
}
