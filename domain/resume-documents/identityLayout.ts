import type { IdentityContent } from "@/domain/resume-documents/model";
import { RESUME_PDF_CONTENT_WIDTH_MM } from "@/domain/resume-documents/pdfLayout";

export const RESUME_DOCUMENT_FONT_FAMILY = "Nanum Gothic";

export const RESUME_IDENTITY_LAYOUT = Object.freeze({
  columnGapMm: 7,
  photoWidthMm: 25,
  photoHeightMm: 33,
  nameFontSizePt: 23,
  nameLineHeight: 1.2,
  nameLetterSpacingPt: -0.8,
  nameToContactsGapMm: 6,
  contactRowGapMm: 1.5,
  contactLabelWidthMm: 18,
  contactColumnGapMm: 3,
  contactLabelFontSizePt: 6.5,
  contactLabelLetterSpacingPt: 0.7,
  contactValueFontSizePt: 8.5,
  contactValueLineHeight: 1.4,
  factsTopGapMm: 3,
  factsTopPaddingMm: 2,
  factsFontSizePt: 8,
});

export function identityContactValueWidthMm(hasPhoto: boolean) {
  const identityWidth = RESUME_PDF_CONTENT_WIDTH_MM
    - (hasPhoto ? RESUME_IDENTITY_LAYOUT.photoWidthMm + RESUME_IDENTITY_LAYOUT.columnGapMm : 0);
  return identityWidth
    - RESUME_IDENTITY_LAYOUT.contactLabelWidthMm
    - RESUME_IDENTITY_LAYOUT.contactColumnGapMm;
}

const LONG_UNBROKEN_CONTACT = /\S{24,}/gu;
const POINTS_PER_MM = 72 / 25.4;

function estimatedContactGlyphWidth(character: string) {
  const fontSize = RESUME_IDENTITY_LAYOUT.contactValueFontSizePt;
  if (/^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]$/u.test(character)) {
    return fontSize * 0.94;
  }
  if (/^[A-Z]$/u.test(character)) return fontSize * 0.68;
  if (/^[a-z0-9]$/u.test(character)) return fontSize * 0.55;
  return fontSize * 0.45;
}

export function wrapIdentityContact(value: string, hasPhoto: boolean) {
  const availableWidth = identityContactValueWidthMm(hasPhoto) * POINTS_PER_MM;
  return value.replace(LONG_UNBROKEN_CONTACT, (run) => {
    let lineWidth = 0;
    let wrapped = "";
    for (const character of Array.from(run)) {
      const characterWidth = estimatedContactGlyphWidth(character);
      if (lineWidth > 0 && lineWidth + characterWidth > availableWidth) {
        wrapped += "\n";
        lineWidth = 0;
      }
      wrapped += character;
      lineWidth += characterWidth;
    }
    return wrapped;
  });
}

export function identityContactItems(content: IdentityContent) {
  return [
    content.email && { label: "EMAIL", value: content.email },
    content.phone && { label: "PHONE", value: content.phone },
    content.location && { label: "LOCATION", value: content.location },
    ...content.links.filter(Boolean).map((value) => ({ label: "LINK", value })),
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

export function identityFactItems(content: IdentityContent) {
  return [
    content.birthDate && `생년월일 ${content.birthDate}`,
    content.gender && `성별 ${content.gender}`,
  ].filter(Boolean) as string[];
}
