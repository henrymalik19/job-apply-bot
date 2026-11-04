import { findMovedBoard } from "@/server/modules/companies/companies.service";
import { SwitchBoard } from "./switch-board";

const ATS_NAME: Record<string, string> = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" };

/**
 * Under a board that's gone (404): where the company's jobs are now, if it moved to another
 * ATS, with a button to switch. Streams in after the page, since it asks each ATS.
 */
export async function MovedBoard({ company }: { company: { id: string; name: string; ats: string; board_token: string } }) {
  const moved = await findMovedBoard(company);
  if (!moved) return <span className="mt-1 block text-xs text-muted-foreground">No other board found for {company.name}; turn it off on Companies if they stopped hiring.</span>;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span title={moved.sampleTitles.join("\n")}>
        Moved to {ATS_NAME[moved.ats] ?? moved.ats} ({moved.ats}:{moved.board_token}): {moved.count} open {moved.count === 1 ? "job" : "jobs"}.
      </span>
      <SwitchBoard companyId={company.id} ats={moved.ats} boardToken={moved.board_token} label={ATS_NAME[moved.ats] ?? moved.ats} />
    </span>
  );
}
