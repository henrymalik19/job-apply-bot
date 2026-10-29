import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerContext } from "@/server/auth/require-owner";
import { getTitleFilter } from "@/server/modules/criteria/criteria.service";
import { TitleFilterForm } from "./title-filter-form";

async function SearchCriteria() {
  const { db } = await ownerContext();
  const filter = await getTitleFilter(db);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job titles</CardTitle>
        <CardDescription>
          Applied by discovery before jobs are saved. Whole words, case-insensitive, comma-separated. Skipped jobs are
          counted on the Health page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TitleFilterForm include={filter.include} exclude={filter.exclude} />
      </CardContent>
    </Card>
  );
}

/** Search: what you're looking for. Title filter today; roles, location, salary and dealbreakers arrive with matching (M4). */
export default function SearchPage() {
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          What you&apos;re looking for. Roles, location, salary and dealbreakers for matching are added here in M4.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SearchCriteria />
      </Suspense>
    </main>
  );
}
