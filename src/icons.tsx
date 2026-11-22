import type { CSSProperties } from "react";
const paths: Record<string, React.ReactNode> = {
  lawn: <><path d="m3 14 9-5 9 5-9 6-9-6Z"/><path d="M7 14v-4m4 6V8m4 6V9m4 5v-4M10 10 8 8m7 4 2-3"/></>,
  tree: (
    <>
      <path d="M12 3c-3-2-7 1-6 4-4 1-4 7 0 8 1 3 5 3 6 1 2 2 6 2 7-1 4-1 4-7 0-8 0-4-4-6-7-4Z" />
      <path d="M12 9v12m0-7-4-3m4 5 4-4M8 21h8" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4" r="2" />
      <path d="m10 21 2-6-3-3 2-5 4 2 3 1M6 12l3-3m3 6 4 6M9 12l-3 8" />
    </>
  ),
  logo: (
    <>
      <path d="m3 11 9-8 9 8v10H3Z" />
      <path d="M9 21V11h6v10M3 11h18" />
    </>
  ),
  cursor: <path d="m5 3 14 9-7 1-3 7Z" />,
  wall: (
    <>
      <path d="M3 5h18v14H3zM3 12h18M9 5v7m6 0v7" />
    </>
  ),
  door: (
    <>
      <path d="M5 21V3h14v18M5 21h14M8 21V6l8 3v12M13 14v1" />
    </>
  ),
  window: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M12 4v16M4 12h16" />
    </>
  ),
  hand: (
    <>
      <path d="M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6h-2c-3 0-4-2-6-5l-3-4a2 2 0 0 1 3-2l2 2" />
    </>
  ),
  undo: (
    <>
      <path
        d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"
        transform="translate(0 -2)"
      />
    </>
  ),
  redo: (
    <>
      <path
        d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0 0 14"
        transform="translate(0 -2)"
      />
    </>
  ),
  cube: (
    <>
      <path d="m12 2 10 5.5v9L12 22 2 16.5v-9Z M2 7.5 12 13l10-5.5M12 13v9M7 4.8l10 5.5" />
    </>
  ),
  plan: (
    <>
      <path d="M3 3h18v18H3zM3 12h8V3m0 9v9m0-6h10" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h12l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7V4h7l2 3h9v13H3Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: (
    <>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8Z" />
    </>
  ),
  "fullscreen-exit": <path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5" />,
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
    </>
  ),
  arrow: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  grid: (
    <>
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  magnet: (
    <>
      <path d="M5 4v9a7 7 0 0 0 14 0V4h-5v9a2 2 0 0 1-4 0V4ZM5 8h5m4 0h5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-11v1" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  layers: (
    <>
      <path d="m12 3 10 5-10 5L2 8ZM2 12l10 5 10-5M2 16l10 5 10-5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
    </>
  ),
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name] || paths.plan}
    </svg>
  );
}
