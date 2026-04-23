import { useMemo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

export type TeamFilter = "All" | "DCS" | "NOC";

const VALID_TEAMS = new Set<TeamFilter>(["All", "DCS", "NOC"]);

function readTeam(value: string | null | undefined): TeamFilter {
  if (value === "DCS" || value === "NOC") {
    return value;
  }
  return "All";
}

export function useTeamFilter() {
  const location = useLocation();
  const navigate = useNavigate();

  const team = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return readTeam(params.get("team"));
  }, [location.search]);

  function setTeam(nextTeam: TeamFilter) {
    const params = new URLSearchParams(location.search);
    if (nextTeam === "All") {
      params.delete("team");
    } else {
      params.set("team", nextTeam);
    }

    const search = Object.fromEntries(params.entries()) as Record<string, string>;
    void navigate({
      to: location.pathname as never,
      search: search as never,
      replace: true,
    });
  }

  return {
    team,
    setTeam,
    isTeamEnabled: VALID_TEAMS.has(team),
  };
}
