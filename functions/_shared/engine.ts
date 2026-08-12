import { GraphQLClient } from 'graphql-request';

// We initialize the client with env variables provided by Nhost in production
const NHOST_GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL || 'https://nqbrkvsevwhgqrswlojz.hasura.eu-central-1.nhost.run/v1/graphql';
const NHOST_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'v@1sr#nvw%ywzq88w1),7NpoAM;rcH68';

const client = new GraphQLClient(NHOST_GRAPHQL_URL, {
  headers: {
    'x-hasura-admin-secret': NHOST_ADMIN_SECRET
  }
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function handleLlmCall(config: any, input: any) {
  // Mock LLM call or simple echo
  return { status: 'completed', output: { response: `Mock LLM response for: ${JSON.stringify(input)}` }, error: null };
}

async function handleHttpRequest(config: any, input: any) {
  // HTTP Request Handler
  try {
    const res = await fetch(config.url || 'https://jsonplaceholder.typicode.com/posts/1');
    const data = await res.json();
    return { status: 'completed', output: data, error: null };
  } catch (err: any) {
    throw new Error(err.message);
  }
}

async function handleDbWrite(config: any, input: any) {
  return { status: 'completed', output: { db_write: 'success' }, error: null };
}

async function handleNotify(config: any, input: any) {
  return { status: 'completed', output: { notify: 'sent' }, error: null };
}

const handlers: Record<string, Function> = {
  llm_call: handleLlmCall,
  http_request: handleHttpRequest,
  db_write: handleDbWrite,
  notify: handleNotify
};

export async function runWorkflowFrom(workflowRunId: string, fromStepIndex: number) {
  // 1. Fetch the workflow run and its workflow to get the org_id and steps
  const runData: any = await client.request(`
    query GetRun($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        id
        status
        workflow {
          id
          org_id
          steps(order_by: { order_index: asc }) {
            id
            type
            config
            order_index
          }
        }
      }
    }
  `, { id: workflowRunId });

  const run = runData.workflow_runs_by_pk;
  if (!run || run.status === 'failed') return;

  const orgId = run.workflow.org_id;
  const allSteps = run.workflow.steps;
  
  // We need to keep track of the previous step's output to pass as input
  let previousOutput = {};

  // Find the actual steps we need to execute based on fromStepIndex
  let currentSteps = allSteps.filter((s: any) => s.order_index >= fromStepIndex);

  for (let i = 0; i < currentSteps.length; i++) {
    const step = currentSteps[i];

    // If step is approval_gate, we pause the run and EXIT the loop
    if (step.type === 'approval_gate') {
      await client.request(`
        mutation PauseRun($id: uuid!) {
          update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {status: "paused"}) { id }
        }
      `, { id: workflowRunId });
      
      // Note: We still create a step_run for the approval gate so it can be approved later
      await client.request(`
        mutation CreateApprovalStepRun($runId: uuid!, $stepId: uuid!) {
          insert_step_runs_one(object: {
            workflow_run_id: $runId,
            step_id: $stepId,
            status: "paused",
            input: {}
          }) { id }
        }
      `, { runId: workflowRunId, stepId: step.id });
      
      return; // Stop execution
    }

    // 1. Insert step_run (status: running). This triggers subscriptions.
    const stepRunData: any = await client.request(`
      mutation InsertStepRun($runId: uuid!, $stepId: uuid!, $input: jsonb!) {
        insert_step_runs_one(object: {
          workflow_run_id: $runId,
          step_id: $stepId,
          status: "running",
          input: $input
        }) { id }
      }
    `, { runId: workflowRunId, stepId: step.id, input: previousOutput });

    const stepRunId = stepRunData.insert_step_runs_one.id;

    // 2. Dispatch execution
    let result = { status: 'failed', output: null, error: null };
    
    if (step.type === 'conditional_branch') {
      // Conditional Branch Logic
      const config = step.config || {};
      const conditionField = config.condition_field || '';
      
      // Determine value (very basic implementation for eval)
      const val = (previousOutput as any)[conditionField] || Object.values(previousOutput)[0];
      const branches = config.branches || {};
      
      let branchToTake = null;
      if (val && branches[val]) {
        branchToTake = branches[val]; // array of step IDs
      } else if (branches['default']) {
        branchToTake = branches['default'];
      }

      if (branchToTake && Array.isArray(branchToTake)) {
        // Replace the remaining currentSteps with the branch steps!
        // We filter the original allSteps to match the IDs in the branch, ordered by their original index
        const branchSteps = allSteps.filter((s: any) => branchToTake.includes(s.id));
        currentSteps = currentSteps.slice(0, i + 1).concat(branchSteps);
      }
      
      result = { status: 'completed', output: { branch_taken: val }, error: null };
    } else {
      const handler = handlers[step.type];
      if (!handler) {
        result = { status: 'failed', output: null, error: `Unknown step type: ${step.type}` };
      } else {
        // 3. Retry Logic - 1 attempt, synchronous backoff
        try {
          result = await handler(step.config, previousOutput);
        } catch (err: any) {
          // Retry once
          await sleep(1000);
          try {
            result = await handler(step.config, previousOutput);
          } catch (retryErr: any) {
            result = { status: 'failed', output: null, error: retryErr.message };
          }
        }
      }
    }

    // Update previousOutput for next step
    if (result.output) {
      previousOutput = result.output;
    }

    // 4. Update the step_run row
    await client.request(`
      mutation UpdateStepRun($id: uuid!, $status: String!, $output: jsonb, $error: String) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {
          status: $status,
          output: $output,
          error: $error
        }) { id }
      }
    `, { id: stepRunId, status: result.status, output: result.output || {}, error: result.error });

    // 5. On unrecoverable failure
    if (result.status === 'failed') {
      await client.request(`
        mutation FailWorkflowRun($id: uuid!) {
          update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {status: "failed", ended_at: "now()"}) { id }
        }
      `, { id: workflowRunId });
      return; // Exit loop completely
    }
  }

  // 6. Loop falls off the end -> mark workflow completed and increment quota
  await client.request(`
    mutation CompleteWorkflow($runId: uuid!, $orgId: uuid!) {
      update_workflow_runs_by_pk(pk_columns: {id: $runId}, _set: {status: "completed", ended_at: "now()"}) { id }
      update_organizations_by_pk(pk_columns: {id: $orgId}, _inc: {quota_used: 1}) { id }
    }
  `, { runId: workflowRunId, orgId });
}
