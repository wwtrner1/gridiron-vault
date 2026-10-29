import { checkAll, wins } from "./coverage";
import { starterScene, type StarterSpec } from "./starters";

/**
 * Coaching copy for the starter plays: why each one works, and what it is
 * best against. A pass play's "Best against" comes from the Coverage check
 * (the same model as the Coverage report), so it stays true if a starter's
 * routes change; runs and defenses carry it in words.
 */
export const WHY_IT_WORKS: Record<number, string> = {
  1: "Numbered routes give every player the same language, so a play call is three digits instead of a paragraph.",
  2: "Deep routes only work when the stem looks the same as the short ones. Teaching them together keeps defenders guessing.",
  3: "Clean, separate stems put a defender in conflict on each side, and the quarterback learns to see spacing before anything fancy.",
  4: "The corner route and the hitch stretch one defender high and low. Whatever he chooses, the other route is open.",
  5: "The go route pulls the deep defender out, and the dig settles in the hole he left behind the underneath coverage.",
  6: "Fast rushers run themselves out of the play. A quick throw to the back with two blockers in front turns their aggression into yards.",
  7: "Four receivers spread across the field make the defense cover every inch. The widest gap shows up on the snap.",
  8: "Three receivers at three depths on one side outnumber the two defenders who can cover it.",
  9: "Inside-breaking slants beat outside leverage before the coverage can react. The ball is out in one beat.",
  10: "Crossing receivers run defenders into each other. Man coverage gets picked off, and zone has to pass two men at once.",
  11: "Bunched receivers can't be pressed cleanly, and their releases make man defenders sort out who takes whom.",
  12: "Three levels out of one cluster force one defender to cover two routes. The quarterback throws to whichever he leaves.",
  13: "The inside receiver's release screens the defender trailing the outside man, so he comes free underneath.",
  14: "Defenders who chase the first break get caught moving the wrong way when one receiver comes back to the ball.",
  15: "Trips pulls coverage to the three-man side, which leaves the single receiver alone on the backside.",
  16: "The flat, out and corner put three receivers on two zone defenders. Somebody is always uncovered.",
  17: "The crosser runs away from man coverage and settles in the open middle against zone. The trips side clears the way.",
  18: "The ball gets outside before the defense can flow, with numbers on the edge to block.",
  19: "Stacked receivers can't be jammed at the line, and the defense must declare who covers whom before the snap.",
  20: "Three receivers on the same track at different depths give the quarterback a window at every level of the zone.",
  21: "The outs pull the underneath defenders to the sideline, and the wheel runs up behind them before the deep help arrives.",
  22: "The vertical route carries the safety away, and the dig fills the space he left behind the linebackers.",
  23: "With two receivers on one side and a back on the other, the quarterback has one simple read each way.",
  24: "The slant and the flat stretch the same underneath defender horizontally. He can only take one of them.",
  25: "The post holds the deep defender inside, and the wheel attacks the sideline behind the underneath coverage.",
  26: "The curl sits in the gap of a soft zone, and the flat pulls the defender who would undercut it.",
  27: "The stack protects the outside receiver from press, and the defense has to show its rules before the snap.",
  28: "The front receiver's route is a legal rub. The back receiver crosses under his teammate and loses his defender.",
  29: "Two vertical routes from one spot put one deep defender in conflict. He can't stay on top of both.",
  30: "The corner and post cross at depth, so defenders who pass receivers off lose one in the switch.",
  31: "Two backs give a downhill run with a lead blocker. It's the simplest way to get bodies moving forward.",
  32: "The run goes to the side with the extra blocker, and the receiver's stalk block seals the edge.",
  33: "A hard run fake pulls the safety and linebackers forward, which opens the post behind them.",
  34: "The first step pulls the defense one way. The ball goes back against the flow into the space they left.",
  35: "Backs heading in opposite directions teach the defense to wait, and the quarterback learns clean handoffs.",
  36: "Crossing backs hide the ball. Defenders freeze for a beat, and that beat is the lane.",
  37: "Backs releasing both ways empty the middle, and the verticals stretch the deep defenders.",
  38: "The ball gets outside immediately, with a lead blocker in front before the defense can pursue.",
  39: "An offset back and two receivers look quiet, but each one threatens a different area of the field.",
  40: "The receiver reads his defender and breaks away from his leverage, so the route is open by design.",
  41: "A shallow drag under a dig puts two receivers in one middle window. The underneath defender can't take both.",
  42: "The back-shoulder fade and the out underneath work the sideline where the end zone squeezes the defense.",
  43: "A quick handoff hits the first open lane before the defense can react. It also shows you how they line up inside.",
  44: "Both backs crossing freezes the defense. The second back gets the ball after the first one draws the flow.",
  45: "The receiver gets the ball at full speed going sideways, which beats defenders who are still reading the backfield.",
  46: "The first runner draws everyone to one side, and the handback goes the other way into empty grass.",
  47: "Two direction changes make pursuit overrun the play. It's a big-play call when the defense is fast and aggressive.",
  48: "After two fakes, the defense chases the handoff, so the keeper has the edge they just left.",
  49: "Three fakes pull defenders in three directions, and the keeper takes the side nobody stayed home on.",
  50: "The corner must choose between stopping the run and covering the receiver. The back reads him and takes the other.",
  51: "The edge defender has to take the quarterback or the space outside him. The read makes him wrong either way.",
  52: "Everyone takes a man, and the free safety erases anything deep. It is simple to teach and tough to throw on.",
  53: "Tight man underneath with one deep helper takes away quick throws, as long as the rusher gets home.",
  54: "Two deep halves and corners in the flats take away the sideline and anything deep outside.",
  55: "Three deep and two underneath keep everything in front. It's the safest way to stop the big play.",
  56: "Four deep defenders take away every vertical route. You give up the short throws to stop the long one.",
};

/** What a run, trick or defense is best against, in words. Pass plays use the Coverage check instead. */
const BEST_WORDS: Record<number, string> = {
  1: "Install and practice: every route in one picture.",
  2: "Install and practice: every route in one picture.",
  6: "A heavy rush or blitz.",
  18: "Defenders playing deep off the line.",
  31: "Light fronts and teams that play the pass first.",
  32: "A defense short on the edge.",
  34: "Fast, flowing linebackers.",
  35: "Learning the defense's run fits early in a game.",
  36: "Defenses that key the backfield.",
  38: "Defenses crowding the middle.",
  43: "Two-deep shells with light boxes.",
  44: "Defenses that key the backfield.",
  45: "Defenses that crash inside on the snap.",
  46: "Fast, over-pursuing defenses.",
  47: "Fast, over-pursuing defenses.",
  48: "Defenses that have seen your reverse.",
  49: "A defense that has been chasing all game.",
  51: "An edge defender who crashes inside.",
  52: "Quick-passing teams with one great receiver.",
  53: "Short passing teams and long yardage.",
  54: "Outside throws, out routes and fades.",
  55: "Deep shots and two-minute drills.",
  56: "Four verticals and obvious passing downs.",
};

/** The looks a starter beats in the Coverage check, or words for runs and defenses. */
export function bestAgainst(spec: StarterSpec): { looks: string[]; words: string | null; format: string | null } {
  if (spec.playType !== "pass") return { looks: [], words: BEST_WORDS[spec.n] ?? null, format: null };
  const report = checkAll(starterScene(spec), { rushYards: 7 });
  if (!report.results.some((r) => r.rows.length)) return { looks: [], words: BEST_WORDS[spec.n] ?? null, format: null };
  return { looks: report.results.filter(wins).map((r) => r.look.name), words: BEST_WORDS[spec.n] ?? null, format: report.format };
}
