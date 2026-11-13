/**
 * GridIronVault's coaching library (Wes, 2026-11-13): MOJO's flag football games and Coach's
 * Corner articles. Links and credit only; every note is ours. See lib/coachLibrary.ts.
 */
import type { LibraryItem } from "../coachLibrary.ts";

const yt = (id: string) => `https://youtu.be/${id}`;
const mojo = (slug: string) => `https://mojo.sport/coachs-corner/${slug}/`;

const M = (id: string, title: string, topic: string, video: string, note: string, ages?: string): LibraryItem => ({
  id: `mojo-${id}`,
  title,
  source: "mojo",
  url: video,
  kind: "drill",
  topic,
  note,
  ...(ages ? { ages } : {}),
});
const R = (id: string, title: string, slug: string, note: string, topic = "Coaching"): LibraryItem => ({
  id: `read-${id}`,
  title,
  source: "mojo",
  url: mojo(slug),
  kind: "article",
  topic,
  note,
});

export const LIBRARY: LibraryItem[] = [
  /* -------------------------------------------------------------- warm-up games --- */
  M("ready-set-hike", "Ready, Set, Hike", "Warm-up", yt("R2tdb2e4oZA"), "A moving warm-up that gets everyone lined up and listening for the snap count."),
  M("land-air-sea", "Land, Air, Sea", "Warm-up", yt("BS1-d98c7rY"), "A Simon Says for the field: players react to the call, which trains listening before the play.", "Young players"),
  M("captains-coming", "Captain's Coming", "Warm-up", yt("M-T0-oWp3CQ"), "A pirate game of calls and quick moves: running, cutting and listening."),
  M("big-bad-wolf", "What Time Is It, Big Bad Wolf?", "Warm-up", yt("AiJGaqzpPKo"), "The classic tag game with a football twist that teaches dodging and changing direction.", "Young players"),
  M("obstacle-relay", "Obstacle Course Relay", "Warm-up", yt("JWOdk7lwE5o"), "A team relay through cones with a throw at the end. Quick feet, accurate throws, teamwork."),

  /* -------------------------------------------------------------- flag pulling --- */
  M("flag-attack", "Flag Attack", "Flag pulling", yt("LIsoJdV2U8o"), "Everyone wears flags; grab as many as you can while keeping your own. Evasion and pulling in one game."),
  M("mascot-tag", "Mascot Tag", "Flag pulling", yt("T_6fdK76ydw"), "A fast tag game that builds agility and clean flag pulls."),
  M("tollbooth", "The Tollbooth", "Flag pulling", yt("Z5A7XU4w3BM"), "Runners get through a tollbooth of defenders trying to take their flags."),
  M("gauntlet", "The Gauntlet", "Flag pulling", yt("qcvG4wMKT4Y"), "Run a line of defenders that gets harder each round. Build speed and break down to pull."),
  M("cross-the-river", "Cross the River", "Flag pulling", yt("S6QWSKiTxAQ"), "Runners cross the river while defenders practice pulling flags in space."),
  M("level-tackles", "Level Tackles", "Flag pulling", yt("dITpNY7vIkI"), "Two defenders team up on one runner: one turns him, the other pulls."),
  M("defensive-duos", "Defensive Duos", "Flag pulling", yt("CBYCuEFgRlQ"), "Pairs of defenders work together to pull a flag. Teaches talking and pursuit angles."),
  M("rush-hour", "Rush Hour", "Defense", yt("BeGgA3EyzXw"), "A pressure game for rushers: get to the passer from the rush line before the throw."),
  M("crazy-corral", "Crazy Corral", "Defense", yt("aYcjPx0H1ko"), "Defenders swarm and work as a unit to trap the ball carrier."),
  M("down-the-line", "Down the Line", "Defense", yt("YKbuJ6AmpsU"), "Zone defense, speed and agility: defenders cover their area as the ball moves."),

  /* ------------------------------------------------------- ball skills and routes --- */
  M("snap-toss-tuck", "Snap, Toss and Tuck", "Offense", yt("bU7sIWpNUUI"), "Snap, pitch and tuck it away: the basics of a simple play, done clean."),
  M("handoff-relay", "Handoff Relay", "Offense", yt("1mYPdoBHRs4"), "A relay race of handoffs. The runner makes a big pocket and the QB places it in."),
  M("anchor", "The Anchor", "Offense", yt("aRzd4r__61s"), "One on one: the ball carrier learns to beat a defender in a small space."),
  M("the-chase", "The Chase", "Offense", yt("n1Og-F6qQGA"), "Head-to-head race that rewards speed and a good juke."),
  M("one-on-ones", "One on Ones", "Offense", yt("ulhoB9kOALw"), "Receivers get open in a tight space against a defender. Release, stem, break."),
  M("floor-is-lava", "The Floor Is Lava", "Passing", yt("XxlxMQq_S2s"), "Move the ball by passing only, never letting it touch the ground. Catching with the hands."),
  M("spider-web", "Spider Web", "Passing", yt("11SW00E3srA"), "The simplest throw-and-catch game for the youngest players.", "Very young players"),
  M("tick-tock", "Tick Tock", "Passing", yt("JdCUMFNmV4s"), "Get the throw off before time runs out: decisions and passing under pressure."),

  /* --------------------------------------------------------------- for the coach --- */
  R("how-to-coach", "How to coach youth flag football", "how-to-coach-flag-football", "MOJO's start-here guide for a first-time flag coach: rules, positions, practices and game day."),
  R("passing-drills", "10 fun flag football passing drills", "10-fun-flag-football-passing-drills", "Throwing and catching games, from bucket targets to Ultimate Football.", "Passing"),
  R("pulling-drills", "9 fun flag pulling drills", "9-fun-flag-pulling-drills-for-kids", "More games for the most important defensive skill in flag.", "Flag pulling"),
  R("flag-pulling", "The fine art of flag pulling", "the-fine-art-of-flag-pulling", "How to teach eyes on the hip, break down and pull with one hand.", "Flag pulling"),
  R("flag-guarding", "What is flag guarding?", "what-is-flag-guarding", "The rule every new runner breaks, and how to coach it out.", "Offense"),
  R("route", "What is a route?", "what-is-a-route", "Routes explained for kids and parents new to the game.", "Offense"),
  R("snap", "How to snap the football", "how-to-snap-the-football", "Teach a clean snap so the play starts on time.", "Offense"),
  R("handoff", "How to do a handoff", "how-to-do-a-handoff", "The pocket, the exchange and the fake, step by step.", "Offense"),
  R("man-defense", "What is man defense?", "what-is-man-defense", "Each defender takes one player. When it works and how to teach it.", "Defense"),
  R("zone-defense", "What is zone defense?", "what-is-zone-defense", "Each defender takes an area. Why it's easier for young players.", "Defense"),
  R("positions", "Flag football positions explained", "flag-football-positions-explained", "What each player does on offense and defense."),
  R("rules", "The rules of flag football explained", "the-rules-of-flag-football-explained", "The common youth flag rules in plain words."),
  R("los", "What is the line of scrimmage?", "what-is-the-line-of-scrimmage", "The line, the rush line and the no-run zone, for new families."),
  R("flag-belt", "How to put on a flag belt", "how-to-put-on-a-flag-belt", "Fit the belt so flags hang at the hips and nobody flag-guards by accident."),
  R("plays-8u", "Best flag football plays for 8-year-olds", "10-best-flag-football-plays-for-8-year-olds", "Simple plays a young team can run. Draw your version in the Designer.", "Offense"),
  R("popular-plays", "10 popular youth flag football plays", "10-best-youth-flag-football-plays", "Bunch, crossbuck, reverses and more, with what each one does.", "Offense"),
  R("substitutions", "Game-time substitutions", "the-art-and-science-of-game-time-substitutions", "How to plan subs so everyone plays and the game stays close."),
  R("welcome-letter", "Write a welcome letter", "yes-you-need-to-a-write-a-welcome-letter", "Set expectations with families on day one."),
  R("parents", "Manage the sideline parent", "4-ways-to-manage-that-parent-on-the-sideline", "Four ways to handle a parent who coaches from the stands."),
  R("end-of-season", "End the season strong", "its-a-wrap-how-coaches-can-end-the-season-strong", "Ideas for the last practice and the team party."),
];
