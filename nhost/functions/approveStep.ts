
import { GraphQLClient } from 'graphql-request';
import { runWorkflowFrom } from './_shared/engine';

const NHOST_GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'https://nqbrkvsevwhgqrswlojz.hasura.eu-central-1.nhost.run/v1/graphql';
const NHOST_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'v@1sr#nvw%ywzq88w1),7NpoAM;rcH68';

const client = new GraphQLClient(NHOST_GRAPHQL_URL, {
  headers: { 'x-hasura-admin-secret': NHOST_ADMIN_SECRET }
});

export default async function handler(req: any, res: any) {
  try {
    const { input, session_variables } = req.body;
    const stepRunId = input.stepRunId;
    const userId = session_variables['x-hasura-user-id'];

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // 1. Fetch step_run, workflow_run, and org members
    const stepRunData: any = await client.request(`
      query GetStepRunForApproval($stepRunId: uuid!, $userId: uuid!) {
        step_runs_by_pk(id: $stepRunId) {
          id
          approved_at
          workflow_run {
            id
            status
            workflow {
              id
              organization {
                id
                members(where: { user_id: { _eq: $userId }, role: { _in: ["owner", "editor"] } }) {
                  id
                  role
                }
              }
            }
          }
          step {
            order_index
          }
        }
      }
    `, { stepRunId, userId });

    const stepRun = stepRunData.step_runs_by_pk;
    if (!stepRun) {
      return res.status(404).json({ message: 'Step run not found' });
    }

    const workflowRun = stepRun.workflow_run;
    const org = workflowRun.workflow.organization;

    // 2. Auth: Approval-gate resume check (is this approver allowed to clear this gate?)
    if (org.members.length === 0) {
      return res.status(403).json({ message: 'Forbidden: You must be an owner or editor to approve steps in this organization.' });
    }

    // 3. Idempotency Guard: guard against double-clicks
    if (stepRun.approved_at !== null) {
      return res.status(400).json({ message: 'Step is already approved' });
    }
    if (workflowRun.status !== 'paused') {
      return res.status(400).json({ message: 'Workflow run is not paused' });
    }

    // 4. Update step_run with approved_by and approved_at
    await client.request(`
      mutation ApproveStepRun($stepRunId: uuid!, $userId: uuid!, $runId: uuid!) {
        update_step_runs_by_pk(pk_columns: {id: $stepRunId}, _set: {
          approved_by: $userId,
          approved_at: "now()",
          status: "completed"
        }) { id }
        
        update_workflow_runs_by_pk(pk_columns: {id: $runId}, _set: {
          status: "running"
        }) { id }
      }
    `, { stepRunId, userId, runId: workflowRun.id });

    // 5. Resume execution: invoke runWorkflowFrom(runId, gatedStep.order_index + 1)
    const nextStepIndex = stepRun.step.order_index + 1;
    await runWorkflowFrom(workflowRun.id, nextStepIndex);

    return res.status(200).json({ 
      id: stepRunId,
      status: 'approved_and_resumed'
    });

  } catch (error: any) {
    console.error('approveStep error:', error);
    return res.status(400).json({ message: error.message });
  }
}
