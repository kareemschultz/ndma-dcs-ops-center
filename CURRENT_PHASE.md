# Current Phase
**Active phase:** none
**Status:** ⏳ Awaiting Phase 1 kickoff
**Last completed:** Phase 0 — Stabilise & delete (324f3f6, 2026-04-23)
**Next:** Phase 1 — People & Access Registry
**Kickoff prompt:** docs/session-prompts/phase-1-kickoff.md
**Notes for Phase 1 agent:**
- Fix PPE duplicate sidebar entry FIRST (remove "PPE & Tools" / hr/ppe,
  keep "PPE Compliance" / compliance/ppe, add redirect)
- Fix dev environment before schema work: verify bun run dev starts
  cleanly, VITE_SERVER_URL correct, e2e green
- Branch: phase/1-access-registry from main
- Use db:migrate (not db:push) for any staging/prod DB operations
