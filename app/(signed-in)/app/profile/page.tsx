import { Suspense, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ownerContext } from "@/server/auth/require-owner";
import {
  EMPLOYMENT_TYPES,
  PROFICIENCIES,
  employmentRange,
  getProfile,
  skillYears,
  type Employment,
} from "@/server/modules/profile/profile.service";
import { ActionForm } from "../../_components/action-form";
import {
  addCertificationAction,
  addEducationAction,
  addSkillsAction,
  removeItemAction,
  removeSkillAction,
  saveAuthorizationAction,
  saveEmploymentAction,
  saveProfileAction,
  updateSkillAction,
} from "./actions";

/** A labelled input. */
function Field({ label, name, children, className }: { label: string; name: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      {children}
    </div>
  );
}

const yesNo = (v: boolean | null | undefined) => (v == null ? "" : v ? "yes" : "no");

function YesNoSelect({ name, value, allowBlank = true }: { name: string; value: boolean | null | undefined; allowBlank?: boolean }) {
  return (
    <NativeSelect id={name} name={name} defaultValue={yesNo(value)}>
      {allowBlank && <NativeSelectOption value="">Not set</NativeSelectOption>}
      <NativeSelectOption value="yes">Yes</NativeSelectOption>
      <NativeSelectOption value="no">No</NativeSelectOption>
    </NativeSelect>
  );
}

function RemoveButton({ kind, id, label = "Remove" }: { kind: string; id: string; label?: string }) {
  return (
    <form action={removeItemAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="xs">{label}</Button>
    </form>
  );
}

const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

function EmploymentForm({ job }: { job?: Employment }) {
  return (
    <ActionForm action={saveEmploymentAction} submitLabel={job ? "Save job" : "Add job"}>
      {job && <input type="hidden" name="id" value={job.id} />}
      <div className={grid}>
        <Field label="Employer" name="employer"><Input id="employer" name="employer" defaultValue={job?.employer} required /></Field>
        <Field label="Title" name="title"><Input id="title" name="title" defaultValue={job?.title} required /></Field>
        <Field label="Location" name="location"><Input id="location" name="location" defaultValue={job?.location ?? ""} placeholder="Remote, or Austin, TX" /></Field>
        <Field label="Start month" name="start_date"><Input id="start_date" name="start_date" type="month" defaultValue={job?.start_date.slice(0, 7)} required /></Field>
        <Field label="End month" name="end_date"><Input id="end_date" name="end_date" type="month" defaultValue={job?.end_date?.slice(0, 7) ?? ""} /></Field>
        <Field label="Type" name="employment_type">
          <NativeSelect id="employment_type" name="employment_type" defaultValue={job?.employment_type ?? ""}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {EMPLOYMENT_TYPES.map((t) => <NativeSelectOption key={t} value={t}>{t.replace("_", " ")}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_current" defaultChecked={job?.is_current} /> I work here now
      </label>
      <Field label="One-line scope (optional)" name="description">
        <Input id="description" name="description" defaultValue={job?.description ?? ""} placeholder="Led the platform team of 6" />
      </Field>
      <Field label="Responsibilities and results (one per line)" name="responsibilities">
        <Textarea id="responsibilities" name="responsibilities" rows={Math.max(3, (job?.responsibilities.length ?? 0) + 1)} defaultValue={job?.responsibilities.map((r) => r.text).join("\n")} />
      </Field>
      <Field label="Skills used here (comma-separated)" name="skills">
        <Input id="skills" name="skills" defaultValue={job?.skills.join(", ")} placeholder="TypeScript, AWS, Postgres" />
      </Field>
    </ActionForm>
  );
}

async function Profile() {
  const { db, owner } = await ownerContext();
  const data = await getProfile(db, owner.id);
  const { profile: p } = data;
  const years = skillYears(data, new Date());
  const missingEnd = data.employment.filter((j) => !j.is_current && !j.end_date);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Contact and summary</CardTitle>
          <CardDescription>Used to fill in application forms and at the top of your resume.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveProfileAction} submitLabel="Save">
            <div className={grid}>
              <Field label="First name" name="first_name"><Input id="first_name" name="first_name" defaultValue={p.first_name ?? ""} /></Field>
              <Field label="Last name" name="last_name"><Input id="last_name" name="last_name" defaultValue={p.last_name ?? ""} /></Field>
              <Field label="Preferred name" name="preferred_name"><Input id="preferred_name" name="preferred_name" defaultValue={p.preferred_name ?? ""} /></Field>
              <Field label="Email" name="email"><Input id="email" name="email" type="email" defaultValue={p.email ?? ""} /></Field>
              <Field label="Phone" name="phone"><Input id="phone" name="phone" defaultValue={p.phone ?? ""} /></Field>
              <Field label="City" name="city"><Input id="city" name="city" defaultValue={p.city ?? ""} /></Field>
              <Field label="State (code)" name="state"><Input id="state" name="state" defaultValue={p.state ?? ""} maxLength={2} placeholder="TX" /></Field>
              <Field label="Country (code)" name="country"><Input id="country" name="country" defaultValue={p.country} maxLength={2} /></Field>
              <Field label="Postal code" name="postal_code"><Input id="postal_code" name="postal_code" defaultValue={p.postal_code ?? ""} /></Field>
              <Field label="LinkedIn URL" name="linkedin_url"><Input id="linkedin_url" name="linkedin_url" defaultValue={p.linkedin_url ?? ""} /></Field>
              <Field label="GitHub URL" name="github_url"><Input id="github_url" name="github_url" defaultValue={p.github_url ?? ""} /></Field>
              <Field label="Website URL" name="website_url"><Input id="website_url" name="website_url" defaultValue={p.website_url ?? ""} /></Field>
              <Field label="Notice period" name="notice_period"><Input id="notice_period" name="notice_period" defaultValue={p.notice_period ?? ""} placeholder="2 weeks" /></Field>
              <Field label="Headline" name="headline"><Input id="headline" name="headline" defaultValue={p.headline ?? ""} placeholder="Staff Software Engineer" /></Field>
            </div>
            <Field label="Summary" name="summary"><Textarea id="summary" name="summary" rows={4} defaultValue={p.summary ?? ""} /></Field>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Work authorization</CardTitle>
          <CardDescription>One row per country. Questions are answered for the posting&apos;s country; a country without a row goes to Needs you.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.workAuthorizations.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Country</TableHead><TableHead>Can work there</TableHead><TableHead>Needs sponsorship</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {data.workAuthorizations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.country}</TableCell>
                    <TableCell>{a.authorized ? "Yes" : "No"}</TableCell>
                    <TableCell>{a.requires_sponsorship ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.status ?? "—"}</TableCell>
                    <TableCell className="text-right"><RemoveButton kind="work_authorizations" id={a.id} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <ActionForm action={saveAuthorizationAction} submitLabel="Add or replace">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Country (code)" name="country"><Input id="country" name="country" maxLength={2} placeholder="US" required /></Field>
              <Field label="Can work there" name="authorized"><YesNoSelect name="authorized" value={true} allowBlank={false} /></Field>
              <Field label="Needs sponsorship" name="requires_sponsorship"><YesNoSelect name="requires_sponsorship" value={false} allowBlank={false} /></Field>
              <Field label="Status (optional)" name="status"><Input id="status" name="status" placeholder="US citizen" /></Field>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
          <CardDescription>
            Newest first. Tailored resumes may reorder and reword these, never add to them. Years with a skill come from the
            dates of the jobs that used it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {missingEnd.length > 0 && (
            <p className="text-sm text-destructive">
              Set the end month for: {missingEnd.map((j) => j.employer).join(", ")}.
            </p>
          )}
          {data.employment.map((job) => (
            <details key={job.id} className="rounded-lg border p-4">
              <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{job.title}</span>
                <span>{job.employer}</span>
                <span className="text-sm text-muted-foreground">{employmentRange(job)}</span>
                <span className="text-sm text-muted-foreground">{job.responsibilities.length} responsibilities · {job.skills.length} skills</span>
              </summary>
              <div className="mt-4 flex flex-col gap-3">
                <EmploymentForm job={job} />
                <div><RemoveButton kind="employments" id={job.id} label="Delete this job" /></div>
              </div>
            </details>
          ))}
          <details className="rounded-lg border border-dashed p-4">
            <summary className="cursor-pointer font-medium">Add a job</summary>
            <div className="mt-4"><EmploymentForm /></div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Education</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.education.map((e) => (
            <div key={e.id} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-medium">{[e.degree, e.field_of_study].filter(Boolean).join(" in ") || "Studied"}</span>
              <span>{e.institution}</span>
              <span className="text-sm text-muted-foreground">
                {e.start_year ?? "?"}–{e.completed ? (e.end_year ?? "?") : "in progress"}
              </span>
              <RemoveButton kind="educations" id={e.id} />
            </div>
          ))}
          <ActionForm action={addEducationAction} submitLabel="Add education">
            <div className={grid}>
              <Field label="School" name="institution"><Input id="institution" name="institution" required /></Field>
              <Field label="Degree" name="degree"><Input id="degree" name="degree" placeholder="B.S." /></Field>
              <Field label="Field of study" name="field_of_study"><Input id="field_of_study" name="field_of_study" /></Field>
              <Field label="Start year" name="start_year"><Input id="start_year" name="start_year" type="number" /></Field>
              <Field label="End year" name="end_year"><Input id="end_year" name="end_year" type="number" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="completed" defaultChecked /> Completed</label>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
          <CardDescription>Years are computed from your jobs; set an override only when that&apos;s wrong.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ActionForm action={addSkillsAction} submitLabel="Add skills" className="max-w-xl">
            <Input name="names" placeholder="Go, Kubernetes, GraphQL" aria-label="Skills to add" />
          </ActionForm>
          {data.skills.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Skill</TableHead><TableHead className="text-right">Years</TableHead><TableHead>Override and proficiency</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {data.skills.map((s) => (
                  <TableRow key={s.skill_id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{years.get(s.normalized) ?? "—"}</TableCell>
                    <TableCell>
                      <ActionForm action={updateSkillAction} submitLabel="Save" className="flex-row items-center">
                        <input type="hidden" name="skill_id" value={s.skill_id} />
                        <Input name="years_override" type="number" step="0.5" min={0} className="w-24" defaultValue={s.years_override ?? ""} placeholder="years" aria-label="Years override" />
                        <NativeSelect name="proficiency" defaultValue={s.proficiency ?? ""} aria-label="Proficiency">
                          <NativeSelectOption value="">Proficiency</NativeSelectOption>
                          {PROFICIENCIES.map((x) => <NativeSelectOption key={x} value={x}>{x}</NativeSelectOption>)}
                        </NativeSelect>
                      </ActionForm>
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={removeSkillAction}>
                        <input type="hidden" name="skill_id" value={s.skill_id} />
                        <Button type="submit" variant="ghost" size="xs">Remove</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Certifications</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.certifications.map((c) => (
            <div key={c.id} className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-medium">{c.name}</span>
              {c.issuer && <span>{c.issuer}</span>}
              {c.issued_on && <span className="text-sm text-muted-foreground">{c.issued_on.slice(0, 7)}</span>}
              <RemoveButton kind="certifications" id={c.id} />
            </div>
          ))}
          <ActionForm action={addCertificationAction} submitLabel="Add certification">
            <div className={grid}>
              <Field label="Name" name="name"><Input id="name" name="name" required /></Field>
              <Field label="Issuer" name="issuer"><Input id="issuer" name="issuer" /></Field>
              <Field label="Issued" name="issued_on"><Input id="issued_on" name="issued_on" type="month" /></Field>
              <Field label="Expires" name="expires_on"><Input id="expires_on" name="expires_on" type="month" /></Field>
              <Field label="Credential URL" name="credential_url"><Input id="credential_url" name="credential_url" /></Field>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

    </>
  );
}

/** Profile: everything the system knows about you, which is all Claude may use. */
export default function ProfilePage() {
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Everything here counts as true. Claude only uses what&apos;s here, and never invents anything beyond it.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Profile />
      </Suspense>
    </main>
  );
}
