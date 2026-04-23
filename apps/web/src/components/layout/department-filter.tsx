import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ndma-dcs-staff-portal/ui/components/select";

import { useTeamFilter } from "@/lib/team-filter";

export function DepartmentFilter() {
  const { team, setTeam } = useTeamFilter();

  return (
    <div className="ml-2 min-w-36">
      <Select value={team} onValueChange={(value) => setTeam((value as "All" | "DCS" | "NOC") ?? "All")}>
        <SelectTrigger className="h-9 rounded-full bg-background text-xs">
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="All">All</SelectItem>
          <SelectItem value="DCS">DCS</SelectItem>
          <SelectItem value="NOC">NOC</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
