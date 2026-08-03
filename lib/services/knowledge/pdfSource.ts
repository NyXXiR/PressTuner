export function buildPdfContentDisposition(originalName: string) {
  const cleaned =
    originalName.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "document.pdf";
  const fallback = cleaned
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
