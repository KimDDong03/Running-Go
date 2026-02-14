export const LOCATION_FAB_BASE_CLASS =
  'rg-touch-icon rg-press absolute right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-white/95 text-slate-700 shadow-md';

export const LOCATION_FAB_TRANSITION_CLASS = 'transition-[bottom] duration-200 ease-out';

export const getLocationFabBottom = (bottomPx: number) => {
  return `calc(${bottomPx}px + env(safe-area-inset-bottom))`;
};
