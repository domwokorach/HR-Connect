/** Floating dock geometry — Screen() reads this so scrolling content never ends up under the dock. */
export const DOCK_HEIGHT = 68;
export const dockClearance = (bottomInset: number) => DOCK_HEIGHT + Math.max(bottomInset - 6, 12) + 20;
