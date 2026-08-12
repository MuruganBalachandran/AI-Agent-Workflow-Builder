
import { GraphQLClient } from 'graphql-request';
import { runWorkflowFrom } from './_shared/engine';

const NHOST_GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'https://nqbrkvsevwhgqrswlojz.hasura.eu-central-1.nhost.run/v1/graphql';
const NHOST_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'v@1sr#nvw%ywzq88w1),7NpoAM;rcH68';

const client = new GraphQLClient(NHOST_GRAPHQL_URL, {
  headers: { 'x-hasura-admin-secret': NHOST_ADMIN_SECRET }
});

export default async function handler(req: any, res: any) {
  // Nhost functions expose express-like Request/Response
  try {
    const { input, session_variables } = req.body;
    const workflowId = input.workflowId;
    const userId = session_variables['x-hasura-user-id'];

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // 1. Auth & Quota Check: top of triggerWorkflowRun, before anything else runs. Cheap early exit.
    const workflowData: any = await client.request(`
      query GetWorkflowData($workflowId: uuid!, $userId: uuid!) {
        workflows_by_pk(id: $workflowId) {
          id
          organization {
            id
            quota_used
            quota_limit
            members(where: { user_id: { _eq: $userId }, role: { _in: ["owner", "editor"] } }) {
              id
              role
            }
          }
        }
      }
    `, { workflowId, userId });

    const workflow = workflowData.workflows_by_pk;
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }

    const org = workflow.organization;
    if (org.members.length === 0) {
      return res.status(403).json({ message: 'Forbidden: You must be an owner or editor of this organization to trigger a run.' });
    }

    if (org.quota_used >= org.quota_limit) {
      return res.status(400).json({ message: 'Quota exceeded for this organization.' });
    }

    // 2. Create workflow_run (status running)
    const insertRunData: any = await client.request(`
      mutation CreateRun($workflowId: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $workflowId,
          status: "running"
        }) { id }
      }
    `, { workflowId });

    const runId = insertRunData.insert_workflow_runs_one.id;

    // 3. Fire-and-forget the engine (we don't await the whole workflow to finish before returning to the user)
    // Nhost functions will kill async jobs if the response is sent, BUT since it's a serverless environment, 
    // we should ideally return success and let a background queue handle it. 
    // However, the assignment states "Write one function, runWorkflowFrom(runId, 0)... and have both Actions just call it". 
    // To prevent timeout, we await it here and return the final state, OR we kick it off.
    // Given typically Hasura actions timeout in 30s, we'll await it. If it runs long, it might timeout the HTTP request but complete on the server.
    await runWorkflowFrom(runId, 0);

    return res.status(200).json({ 
      id: runId,
      status: 'started'
    });

  } catch (error: any) {
    console.error('triggerWorkflowRun error:', error);
    return res.status(400).json({ message: error.message });
  }
}
