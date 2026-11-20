import assert from "node:assert/strict";
import { test } from "node:test";
import { sentences, spokenText } from "../../src/lib/readAloud";

/**
 * How the Film Room voice says what a coach writes (`lib/voiceWords.json`).
 * Each case is a word the stock voice said wrong before the list fixed it.
 */
test("the voice says football words the way a coach does", () => {
  const cases: [string, string][] = [
    ["5v5 and 7v7", "5 on 5 and 7 on 7"],
    ["A 4-3 front against a 3-4", "A 4 3 front against a 3 4"],
    ["Trips is a 3x1 set, Doubles a 2x2", "Trips is a 3 by 1 set, Doubles a 2 by 2"],
    ["Deep 1/3, Deep 1/4, Deep 1/2", "Deep third, Deep quarter, Deep half"],
    ["He fits the A gap, then the B gap", "He fits the A-gap, then the B-gap"],
    ["The Will linebacker and the Will backer", "The Wil linebacker and the Wil backer"],
    ["The curl/flat defender", "The curl flat defender"],
    ["QB reads it 5 yds past the LOS vs. Cover 2", "quarterback reads it 5 yards past the line of scrimmage versus Cover 2"],
    ["The {first read} · a “hot” route → the flat", "The first read, a hot route to the flat"],
  ];
  for (const [written, said] of cases) assert.equal(spokenText(written), said, written);
});

test("words the list leaves alone stay as written", () => {
  for (const s of ["Will you run it again?", "Cover 3 beats 21-14 leads", "Smash, Flood, Mesh"]) assert.equal(spokenText(s), s);
});

test("a caption is still read sentence by sentence", () => {
  assert.deepEqual(sentences("Here is the look: Cover 3. Read the curl/flat defender! Go."), ["Here is the look: Cover 3.", "Read the curl flat defender!", "Go."]);
});
