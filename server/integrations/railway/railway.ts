// Railway's public GraphQL API, used only to start a cron service now (what `railway cron run` does).
// The token is a project token for the production environment, sent as Project-Access-Token.

const ENDPOINT = "https://backboard.railway.com/graphql/v2";

type Fetch = typeof fetch;

/** A cron service as Railway lists it. */
export type CronService = { serviceInstanceId: string; name: string; cronSchedule: string | null; nextRunAt: string | null };

/** Railway refused or failed; the message is safe to show (it never contains the token). */
export class RailwayError extends Error {}

async function gql<T>(token: string, query: string, variables: Record<string, unknown>, fetchFn: Fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Project-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
  } catch {
    throw new RailwayError("Couldn't reach Railway.");
  }
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
  if (body?.errors?.length) throw new RailwayError(`Railway: ${body.errors.map((e) => e.message).join("; ")}`);
  if (!res.ok || !body?.data) throw new RailwayError(`Railway answered ${res.status}.`);
  return body.data;
}

/** The services in the token's environment, by name. */
export async function listCronServices(token: string, fetchFn: Fetch = fetch): Promise<CronService[]> {
  const { projectToken } = await gql<{ projectToken: { projectId: string; environmentId: string } }>(
    token,
    "query { projectToken { projectId environmentId } }",
    {},
    fetchFn,
  );
  const { environment } = await gql<{
    environment: { serviceInstances: { edges: { node: { id: string; serviceName: string; cronSchedule: string | null; nextCronRunAt: string | null } }[] } };
  }>(
    token,
    `query ($environmentId: String!, $projectId: String!) {
      environment(id: $environmentId, projectId: $projectId) {
        serviceInstances { edges { node { id serviceName cronSchedule nextCronRunAt } } }
      }
    }`,
    { environmentId: projectToken.environmentId, projectId: projectToken.projectId },
    fetchFn,
  );
  return environment.serviceInstances.edges.map(({ node }) => ({
    serviceInstanceId: node.id,
    name: node.serviceName,
    cronSchedule: node.cronSchedule,
    nextRunAt: node.nextCronRunAt,
  }));
}

/**
 * Starts the cron service named `service` now, off its schedule. Railway skips it
 * if the previous run is still going.
 */
export async function runCronNow(token: string, service: string, fetchFn: Fetch = fetch): Promise<void> {
  const found = (await listCronServices(token, fetchFn)).find((s) => s.name === service);
  if (!found) throw new RailwayError(`No Railway service named ${service} in this environment.`);
  if (!found.cronSchedule) throw new RailwayError(`The ${service} service has no cron schedule on Railway.`);
  const { deploymentInstanceExecutionCreate: ok } = await gql<{ deploymentInstanceExecutionCreate: boolean }>(
    token,
    "mutation ($input: DeploymentInstanceExecutionCreateInput!) { deploymentInstanceExecutionCreate(input: $input) }",
    { input: { serviceInstanceId: found.serviceInstanceId } },
    fetchFn,
  );
  if (!ok) throw new RailwayError(`Railway didn't start ${service}.`);
}
