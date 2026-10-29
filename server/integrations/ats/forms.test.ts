import { describe, expect, it } from "vitest";
import { fetchApplicationForm, parseAshbyForm, parseGreenhouseForm } from "./forms";

const greenhouseJob = {
  content: "<p>Build things</p>",
  questions: [
    { label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text", values: [] }] },
    {
      label: "Resume/CV",
      required: true,
      fields: [{ name: "resume", type: "input_file", values: [] }, { name: "resume_text", type: "textarea", values: [] }],
    },
    {
      label: "Do you require sponsorship? ",
      description: "<p>Now or later</p>",
      required: true,
      fields: [{ name: "question_1", type: "multi_value_single_select", values: [{ label: "Yes", value: 1 }, { label: "No", value: 0 }] }],
    },
  ],
  demographic_questions: {
    questions: [
      {
        id: 7,
        label: "Gender",
        required: false,
        type: "multi_value_single_select",
        answer_options: [{ id: 70, label: "Female", decline_to_answer: false }, { id: 71, label: "I don't wish to answer", decline_to_answer: true }],
      },
    ],
  },
};

const ashbyField = (path: string, title: string, type: string, extra: Record<string, unknown> = {}) => ({
  isRequired: true,
  descriptionHtml: null,
  field: { path, title, type, ...extra },
});

const ashbyBody = {
  data: {
    jobPosting: {
      descriptionHtml: "<p>Role</p>",
      applicationForm: {
        sections: [
          {
            fieldEntries: [
              ashbyField("_systemfield_resume", "Resume", "File"),
              ashbyField("q1", "Eligible to work in the US?", "Boolean"),
              ashbyField("q2", "Why us?", "LongText"),
              ashbyField("old", "Old question", "String", { isDeactivated: true }),
              ashbyField("q3", "State", "ValueSelect", { selectableValues: [{ label: "Texas", value: "TX" }] }),
            ],
          },
        ],
      },
      surveyForms: [
        { sections: [{ fieldEntries: [ashbyField("g", "Gender", "ValueSelect", { selectableValues: [{ label: "Decline to self-identify", value: "d" }] })] }] },
      ],
    },
  },
};

describe("parseGreenhouseForm", () => {
  it("maps fields, keeps option values as strings and adds EEO questions", () => {
    const form = parseGreenhouseForm(greenhouseJob);
    expect(form.descriptionHtml).toBe("<p>Build things</p>");
    expect(form.questions.map((q) => [q.fieldName, q.fieldType, q.group])).toEqual([
      ["first_name", "text", "application"],
      ["resume", "file", "application"],
      ["question_1", "select", "application"],
      ["demographic_7", "select", "eeo"],
    ]);
    expect(form.questions[2]).toMatchObject({ label: "Do you require sponsorship?", required: true, options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] });
    expect(form.questions[3].options[1]).toEqual({ label: "I don't wish to answer", value: "71", decline: true });
  });
});

describe("parseAshbyForm", () => {
  it("maps fields, skips deactivated ones and treats survey forms as EEO", () => {
    const form = parseAshbyForm(ashbyBody)!;
    expect(form.questions.map((q) => [q.fieldName, q.fieldType, q.group])).toEqual([
      ["_systemfield_resume", "file", "application"],
      ["q1", "boolean", "application"],
      ["q2", "textarea", "application"],
      ["q3", "select", "application"],
      ["g", "select", "eeo"],
    ]);
    expect(form.questions[4].options[0].decline).toBe(true);
  });

  it("returns null when the posting is gone", () => {
    expect(parseAshbyForm({ data: { jobPosting: null } })).toBeNull();
  });
});

describe("fetchApplicationForm", () => {
  it("POSTs the Ashby query and has no form API for Lever", async () => {
    let request: RequestInit | undefined;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      request = init;
      return new Response(JSON.stringify(ashbyBody), { status: 200 });
    }) as unknown as typeof fetch;
    const form = await fetchApplicationForm("ashby", "acme", "abc", { fetchFn });
    expect(form?.questions).toHaveLength(5);
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body)).variables).toEqual({ organizationHostedJobsPageName: "acme", jobPostingId: "abc" });
    expect(await fetchApplicationForm("lever", "acme", "abc", { fetchFn })).toBeNull();
  });
});
