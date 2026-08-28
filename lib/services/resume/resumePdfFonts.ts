import path from "node:path";
import { RESUME_DOCUMENT_FONT_FAMILY } from "@/domain/resume-documents/identityLayout";

export const RESUME_PDF_FONT_FAMILY = RESUME_DOCUMENT_FONT_FAMILY;

let registered = false;

export function registerResumePdfFonts(Font: typeof import("@react-pdf/renderer")["Font"]) {
  if (registered) return;
  const fontDirectory = path.resolve(process.cwd(), "public", "fonts", "resume");
  Font.register({
    family: RESUME_PDF_FONT_FAMILY,
    fonts: [
      { src: path.join(fontDirectory, "NanumGothic-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontDirectory, "NanumGothic-Bold.ttf"), fontWeight: 700 },
      { src: path.join(fontDirectory, "NanumGothic-ExtraBold.ttf"), fontWeight: 800 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
