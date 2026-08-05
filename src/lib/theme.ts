export const ACCENT_PRESETS: Record<
  string,
  { label: string; swatch: string; colors: Record<string, string> }
> = {
  indigo: {
    label: "Indigo",
    swatch: "#6366f1",
    colors: {
      "50": "#eef2ff",
      "100": "#e0e7ff",
      "200": "#c7d2fe",
      "300": "#a5b4fc",
      "400": "#818cf8",
      "500": "#6366f1",
      "600": "#4f46e5",
      "700": "#4338ca",
    },
  },
  blue: {
    label: "Blue",
    swatch: "#3b82f6",
    colors: {
      "50": "#eff6ff",
      "100": "#dbeafe",
      "200": "#bfdbfe",
      "300": "#93c5fd",
      "400": "#60a5fa",
      "500": "#3b82f6",
      "600": "#2563eb",
      "700": "#1d4ed8",
    },
  },
  sky: {
    label: "Sky",
    swatch: "#0ea5e9",
    colors: {
      "50": "#f0f9ff",
      "100": "#e0f2fe",
      "200": "#bae6fd",
      "300": "#7dd3fc",
      "400": "#38bdf8",
      "500": "#0ea5e9",
      "600": "#0284c7",
      "700": "#0369a1",
    },
  },
  violet: {
    label: "Violet",
    swatch: "#8b5cf6",
    colors: {
      "50": "#f5f3ff",
      "100": "#ede9fe",
      "200": "#ddd6fe",
      "300": "#c4b5fd",
      "400": "#a78bfa",
      "500": "#8b5cf6",
      "600": "#7c3aed",
      "700": "#6d28d9",
    },
  },
  emerald: {
    label: "Emerald",
    swatch: "#10b981",
    colors: {
      "50": "#ecfdf5",
      "100": "#d1fae5",
      "200": "#a7f3d0",
      "300": "#6ee7b7",
      "400": "#34d399",
      "500": "#10b981",
      "600": "#059669",
      "700": "#047857",
    },
  },
  teal: {
    label: "Teal",
    swatch: "#14b8a6",
    colors: {
      "50": "#f0fdfa",
      "100": "#ccfbf1",
      "200": "#99f6e4",
      "300": "#5eead4",
      "400": "#2dd4bf",
      "500": "#14b8a6",
      "600": "#0d9488",
      "700": "#0f766e",
    },
  },
  rose: {
    label: "Rose",
    swatch: "#f43f5e",
    colors: {
      "50": "#fff1f2",
      "100": "#ffe4e6",
      "200": "#fecdd3",
      "300": "#fda4af",
      "400": "#fb7185",
      "500": "#f43f5e",
      "600": "#e11d48",
      "700": "#be123c",
    },
  },
  amber: {
    label: "Amber",
    swatch: "#f59e0b",
    colors: {
      "50": "#fffbeb",
      "100": "#fef3c7",
      "200": "#fde68a",
      "300": "#fcd34d",
      "400": "#fbbf24",
      "500": "#f59e0b",
      "600": "#d97706",
      "700": "#b45309",
    },
  },
};

const INDIGO_STEPS = ["50", "100", "200", "300", "400", "500", "600", "700"];

export function applyAccent(name: string) {
  const preset = ACCENT_PRESETS[name] ?? ACCENT_PRESETS.indigo;
  const root = document.documentElement;
  for (const step of INDIGO_STEPS) {
    root.style.setProperty(`--color-indigo-${step}`, preset.colors[step]);
  }
}
