export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const RESUME_PAGE_MARGIN_TOP_MM = 16;
export const RESUME_PAGE_MARGIN_BOTTOM_MM = 16;

export function estimateResumePrintPageCount(
  contentHeightPx: number,
  paperWidthPx: number,
) {
  if (
    !Number.isFinite(contentHeightPx) ||
    !Number.isFinite(paperWidthPx) ||
    contentHeightPx <= 0 ||
    paperWidthPx <= 0
  ) return 1;

  const pixelsPerMillimeter = paperWidthPx / A4_WIDTH_MM;
  const printablePageHeight = (
    A4_HEIGHT_MM - RESUME_PAGE_MARGIN_TOP_MM - RESUME_PAGE_MARGIN_BOTTOM_MM
  ) * pixelsPerMillimeter;

  return Math.max(1, Math.ceil(contentHeightPx / printablePageHeight));
}
