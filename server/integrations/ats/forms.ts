// Application forms from public ATS endpoints (no auth), for the prepare worker.
//   Greenhouse: job endpoint with ?questions=true (https://developers.greenhouse.io/job-board.html)
//   Ashby: the public jobs-page GraphQL that its hosted application page uses
// Lever has no public form API; its jobs are prepared as manual.
import { z } from "zod";
import { fetchJson, type FetchOptions } from "./http";
import type { BoardAts } from "./boards";

/** How a question is answered on the form. */
export type FieldType = "text" | "textarea" | "select" | "multiselect" | "boolean" | "file" | "location" | "hidden";

/** One choice of a select question. `decline` marks "I don't wish to answer". */
export type FormOption = { label: string; value: string; decline?: boolean };

/** One question on an application form. */
export type FormQuestion = {
  /** The form's own field id, needed to fill it in later. */
  fieldName: string;
  label: string;
  description: string | null;
  required: boolean;
  fieldType: FieldType;
  options: FormOption[];
  /** "eeo" for voluntary demographic questions. */
  group: "application" | "eeo";
};

/** A posting's application form plus the raw posting HTML (checked for AI rules and hidden text). */
export type ApplicationForm = { questions: FormQuestion[]; descriptionHtml: string | null };

/** ATSs whose forms we can read. */
export const FORM_ATS = ["greenhouse", "ashby"] as const satisfies readonly BoardAts[];

const greenhouseJob = z.object({
  content: z.string().nullish(),
  questions: z
    .array(
      z.object({
        label: z.string(),
        description: z.string().nullish(),
        required: z.boolean().nullish(),
        fields: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            values: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number()]) })).nullish(),
          }),
        ),
      }),
    )
    .nullish(),
  demographic_questions: z
    .object({
      questions: z
        .array(
          z.object({
            id: z.number(),
            label: z.string(),
            required: z.boolean().nullish(),
            type: z.string(),
            answer_options: z.array(z.object({ id: z.number(), label: z.string(), decline_to_answer: z.boolean().nullish() })),
          }),
        )
        .nullish(),
    })
    .nullish(),
});

const GREENHOUSE_TYPES: Record<string, FieldType> = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  input_hidden: "hidden",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
};

/** Parses a Greenhouse job (fetched with `?questions=true`) into its form. */
export function parseGreenhouseForm(body: unknown): ApplicationForm {
  const job = greenhouseJob.parse(body);
  const questions: FormQuestion[] = (job.questions ?? []).map((q) => {
    // Resume and cover letter offer a file and a paste box; the file is the main field.
    const field = q.fields[0];
    return {
      fieldName: field.name,
      label: q.label.trim(),
      description: q.description ?? null,
      required: q.required ?? false,
      fieldType: GREENHOUSE_TYPES[field.type] ?? "text",
      options: (field.values ?? []).map((v) => ({ label: v.label, value: String(v.value) })),
      group: "application",
    };
  });
  for (const q of job.demographic_questions?.questions ?? []) {
    questions.push({
      fieldName: `demographic_${q.id}`,
      label: q.label.trim(),
      description: null,
      required: q.required ?? false,
      fieldType: GREENHOUSE_TYPES[q.type] ?? "select",
      options: q.answer_options.map((o) => ({ label: o.label, value: String(o.id), decline: o.decline_to_answer ?? false })),
      group: "eeo",
    });
  }
  return { questions, descriptionHtml: job.content ?? null };
}

const ashbyEntry = z.object({
  isRequired: z.boolean().nullish(),
  descriptionHtml: z.string().nullish(),
  field: z.object({
    path: z.string(),
    title: z.string(),
    type: z.string(),
    isDeactivated: z.boolean().nullish(),
    selectableValues: z.array(z.object({ label: z.string(), value: z.string() })).nullish(),
  }),
});

const ashbyResponse = z.object({
  data: z.object({
    jobPosting: z
      .object({
        descriptionHtml: z.string().nullish(),
        applicationForm: z.object({ sections: z.array(z.object({ fieldEntries: z.array(ashbyEntry) })) }).nullish(),
        surveyForms: z.array(z.object({ sections: z.array(z.object({ fieldEntries: z.array(ashbyEntry) })) })).nullish(),
      })
      .nullable(),
  }),
});

const ASHBY_TYPES: Record<string, FieldType> = {
  String: "text",
  Email: "text",
  Phone: "text",
  Url: "text",
  Number: "text",
  Date: "text",
  LongText: "textarea",
  File: "file",
  Boolean: "boolean",
  ValueSelect: "select",
  MultiValueSelect: "multiselect",
  Location: "location",
};

const DECLINE = /\b(decline|prefer not|don'?t wish|do not wish|choose not)\b/i;

/** Parses Ashby's `ApiJobPosting` GraphQL response into a form; null when the posting is gone. */
export function parseAshbyForm(body: unknown): ApplicationForm | null {
  const posting = ashbyResponse.parse(body).data.jobPosting;
  if (!posting) return null;
  const toQuestion = (group: FormQuestion["group"]) => (e: z.infer<typeof ashbyEntry>): FormQuestion => ({
    fieldName: e.field.path,
    label: e.field.title.trim(),
    description: e.descriptionHtml ?? null,
    required: e.isRequired ?? false,
    fieldType: ASHBY_TYPES[e.field.type] ?? "text",
    options: (e.field.selectableValues ?? []).map((v) => ({ label: v.label, value: v.value, decline: DECLINE.test(v.label) })),
    group,
  });
  const active = (e: z.infer<typeof ashbyEntry>) => !e.field.isDeactivated;
  const questions = [
    ...(posting.applicationForm?.sections ?? []).flatMap((s) => s.fieldEntries.filter(active).map(toQuestion("application"))),
    // Ashby's survey forms are the voluntary EEO questions.
    ...(posting.surveyForms ?? []).flatMap((f) => f.sections.flatMap((s) => s.fieldEntries.filter(active).map(toQuestion("eeo")))),
  ];
  return { questions, descriptionHtml: posting.descriptionHtml ?? null };
}

const ASHBY_QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    descriptionHtml
    applicationForm { sections { fieldEntries { isRequired descriptionHtml field } } }
    surveyForms { sections { fieldEntries { isRequired descriptionHtml field } } }
  }
}`;

/**
 * Fetches a posting's application form.
 *
 * @param ats - The job's source ATS.
 * @param boardToken - The company's board token.
 * @param externalId - The posting id on that board.
 * @returns The form, or null when the ATS has no form API (Lever) or the posting is gone.
 */
export async function fetchApplicationForm(
  ats: string,
  boardToken: string,
  externalId: string,
  opts: FetchOptions = {},
): Promise<ApplicationForm | null> {
  switch (ats) {
    case "greenhouse": {
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(externalId)}?questions=true`;
      return parseGreenhouseForm(await fetchJson(url, opts));
    }
    case "ashby": {
      const body = {
        operationName: "ApiJobPosting",
        variables: { organizationHostedJobsPageName: boardToken, jobPostingId: externalId },
        query: ASHBY_QUERY,
      };
      return parseAshbyForm(await fetchJson("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", { ...opts, body }));
    }
    default:
      return null;
  }
}
