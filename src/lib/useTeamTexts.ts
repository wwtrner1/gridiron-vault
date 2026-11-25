import { useCallback, useEffect, useState } from "react";
import { api, ApiError, coachError, type MyTeamTexts } from "./api";
import { useAuth } from "./auth";
import { teamTextsOn } from "./textTeam";
import { useTier } from "./tier";

/**
 * A coach's own team's texts from GridIronVault's number (sign-up link, who signed up, last texts, whether sending
 * is on), for Text the team and its My team card. Signed out there is nothing to ask: `texts` stays null and the
 * page offers the coach's own phone instead.
 */
export function useTeamTexts(teamId: string) {
  const { account } = useAuth();
  const tier = useTier().id;
  // Sideline doesn't text from GridIronVault (Wes 2026-11-25); the server says so too, with 403 plan_required.
  const [refused, setRefused] = useState(false);
  const locked = Boolean(account) && (!teamTextsOn(tier) || refused);
  const [texts, setTexts] = useState<MyTeamTexts | null>(null);
  const [loading, setLoading] = useState(Boolean(account) && teamTextsOn(tier));
  const [problem, setProblem] = useState("");

  const load = useCallback(() => {
    if (!account || !teamTextsOn(tier)) {
      setTexts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .myTeamTexts(teamId)
      .then((t) => {
        setTexts(t);
        setRefused(false);
        setProblem("");
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) {
          setTexts(null);
          setRefused(true);
          return;
        }
        setProblem(coachError(e, "Team texts didn't load. Try again in a minute."));
      })
      .finally(() => setLoading(false));
  }, [account, teamId, tier]);

  useEffect(load, [load]);

  return { texts: locked ? null : texts, setTexts, loading, problem, reload: load, signedIn: Boolean(account), locked };
}
