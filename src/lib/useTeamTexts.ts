import { useCallback, useEffect, useState } from "react";
import { api, coachError, type MyTeamTexts } from "./api";
import { useAuth } from "./auth";

/**
 * A coach's own team's texts from GridIronVault's number (sign-up link, who signed up, last texts, whether sending
 * is on), for Text the team and its My team card. Signed out there is nothing to ask: `texts` stays null and the
 * page offers the coach's own phone instead.
 */
export function useTeamTexts(teamId: string) {
  const { account } = useAuth();
  const [texts, setTexts] = useState<MyTeamTexts | null>(null);
  const [loading, setLoading] = useState(Boolean(account));
  const [problem, setProblem] = useState("");

  const load = useCallback(() => {
    if (!account) {
      setTexts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .myTeamTexts(teamId)
      .then((t) => {
        setTexts(t);
        setProblem("");
      })
      .catch((e: unknown) => setProblem(coachError(e, "Team texts didn't load. Try again in a minute.")))
      .finally(() => setLoading(false));
  }, [account, teamId]);

  useEffect(load, [load]);

  return { texts, setTexts, loading, problem, reload: load, signedIn: Boolean(account) };
}
