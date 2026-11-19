/**
 * Grades the five textbook concepts with the Coverage check model and says
 * whether each still beats the coverage it was built to beat. Run it after
 * touching src/lib/coverage.ts: `npm run coverage:concepts`.
 *
 * The plays are the Concept Library's own (`src/lib/concepts.ts`).
 */
import { checkAll, wins, yards } from "../src/lib/coverage";
import { CONCEPTS, CONCEPT_SETS, conceptScene } from "../src/lib/concepts";

let failed = 0;
for (const set of CONCEPT_SETS) {
  console.log(`\n${set.label} (${set.formation})`);
  for (const concept of CONCEPTS) {
    const report = checkAll(conceptScene(set, concept));
    const cells = report.results.map((r) => `${r.look.name.replace(/ \(.*\)/, "")}: ${wins(r) ? "beats" : "no"}${r.target ? ` (${r.target.label} ${r.target.route} ${yards(r.target.sep)})` : ""}`);
    // 5v5 flag has no Cover 1: its man look plays the same role.
    const named = (name: string, b: string) => name.endsWith(b) || (b === "Cover 1" && name.endsWith("Man"));
    const misses = concept.beats.filter((b) => !report.results.some((r) => named(r.look.name, b) && wins(r)));
    if (misses.length) failed++;
    console.log(`  ${misses.length ? "MISS" : " ok "} ${concept.name.padEnd(10)} ${cells.join(" | ")}${misses.length ? `  ← should beat ${misses.join(", ")}` : ""}`);
  }
}
if (failed) {
  console.log(`\n${failed} concept${failed === 1 ? "" : "s"} no longer beat their coverage.`);
  process.exitCode = 1;
}
