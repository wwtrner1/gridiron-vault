/**
 * The app's print styles as plain rules, for showing a page on screen the way
 * it prints (`PagePreview`). Every `@media print` block in the loaded
 * stylesheets is unwrapped, so the preview can never drift from the print CSS.
 * The preview's own print rules (hide its bar, the PDF print layer) stay out.
 */
export function printRules(): string {
  const out: string[] = [];
  const walk = (rules: CSSRuleList, inPrint: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        const media = rule.media.mediaText.toLowerCase();
        if (/\bprint\b/.test(media) && !/\bscreen\b/.test(media)) walk(rule.cssRules, true);
        else if (inPrint) out.push(rule.cssText);
      } else if (inPrint && !(rule instanceof CSSPageRule) && !/\.pp-(pagebar|print)\b/.test(rule.cssText)) out.push(rule.cssText);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, false);
    } catch {
      // A stylesheet from another origin (Google Fonts) can't be read and holds no print rules.
    }
  }
  return out.join("\n");
}
