import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PaletteName } from '@/theme/colors';

type Storage = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
const Ctx = createContext<{ palette: PaletteName; setPalette: (p: PaletteName) => void }>({ palette: 'navy', setPalette: () => {} });

/** Which colour family is active: Navy (corporate default) or Grey (neutral). Light/dark is handled by ModeProvider. */
export function PaletteProvider({ children, storage, storageKey = 'hrc.palette', fixed }: { children: ReactNode; storage?: Storage; storageKey?: string; fixed?: PaletteName }) {
  const [palette, setState] = useState<PaletteName>(() => {
    try { const v = storage?.getItem(storageKey); if (v === 'navy' || v === 'grey') return v; } catch { /* default */ }
    return 'navy';
  });
  const setPalette = useCallback((p: PaletteName) => { setState(p); try { storage?.setItem(storageKey, p); } catch { /* preference only */ } }, [storage, storageKey]);
  const value = useMemo(() => ({ palette: fixed ?? palette, setPalette: fixed ? () => {} : setPalette }), [fixed, palette, setPalette]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const usePalette = () => useContext(Ctx);
