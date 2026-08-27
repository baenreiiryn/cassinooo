export function setupScaledBoard(app, {
  viewportSelector = ".cassinooo-board",
  boardSelector,
  designWidth,
  designHeight,
  minScale = 0.34,
  maxScale = 1.6
}) {
  app._cassinoooScaleObserver?.disconnect?.();
  const viewport = app.element?.querySelector(viewportSelector);
  const board = app.element?.querySelector(boardSelector);
  if (!viewport || !board) return;

  viewport.classList.add("cassinooo-scaled-viewport");
  board.classList.add("cassinooo-scaled-board");

  const applyScale = () => {
    const availableWidth = Math.max(280, viewport.clientWidth - 8);
    const availableHeight = Math.max(220, viewport.clientHeight - 8);
    const natural = Math.min(availableWidth / designWidth, availableHeight / designHeight);
    const scale = Math.max(minScale, Math.min(maxScale, natural));
    board.style.setProperty("--cassinooo-table-scale", String(scale));
    viewport.style.setProperty("--cassinooo-design-width", `${designWidth}px`);
    viewport.style.setProperty("--cassinooo-design-height", `${designHeight}px`);
    viewport.style.setProperty("--cassinooo-table-scale", String(scale));
    viewport.style.setProperty("--cassinooo-scaled-width", `${designWidth * scale}px`);
    viewport.style.setProperty("--cassinooo-scaled-height", `${designHeight * scale}px`);
  };

  applyScale();
  app._cassinoooScaleObserver = new ResizeObserver(applyScale);
  app._cassinoooScaleObserver.observe(viewport);
}
