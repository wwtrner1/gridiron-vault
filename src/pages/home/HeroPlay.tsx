import { PlayThumb } from "../../components/PlayThumb";
import { STARTERS, starterScene } from "../../lib/starters";

const HERO_PLAY = STARTERS.find((s) => s.n === 16)!;

/** The home page's example play, split out so the starter plays aren't in the first download. */
export function HeroPlay() {
  return <PlayThumb scene={starterScene(HERO_PLAY)} label={`${HERO_PLAY.name} — ${HERO_PLAY.description}`} />;
}
