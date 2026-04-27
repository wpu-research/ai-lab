/**
 * Octogent trigger: creates a tentacle + terminal for a GitHub issue,
 * then polls until the Claude Code agent finishes.
 */

const OCTOGENT_API = process.env.OCTOGENT_API ?? 'http://127.0.0.1:8787';
const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 30 * 60 * 1000; // 30 min

const issueNumber = process.env.ISSUE_NUMBER;
const issueTitle = process.env.ISSUE_TITLE;
const issueBody = process.env.ISSUE_BODY ?? '';
const repoPath = process.env.REPO_PATH ?? process.cwd();

async function api(path, method = 'GET', body) {
  const res = await fetch(`${OCTOGENT_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Octogent API ${method} ${path} failed: ${err.error ?? res.status}`);
  }
  return res.json();
}

async function createTentacle(name) {
  const data = await api('/api/deck/tentacles', 'POST', { name });
  console.log(`[octogent] Tentacle created: ${data.tentacleId}`);
  return data.tentacleId;
}

async function createTerminal(tentacleId, prompt) {
  const data = await api('/api/terminals', 'POST', {
    name: `issue-${issueNumber}`,
    tentacleId,
    workspaceMode: 'worktree',
    initialPrompt: prompt,
  });
  console.log(`[octogent] Terminal created: ${data.terminalId}`);
  return data.terminalId;
}

async function pollUntilDone(terminalId) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const snapshots = await api('/api/terminal-snapshots');
    const terminal = snapshots.find(t => t.terminalId === terminalId);
    if (!terminal) throw new Error(`Terminal ${terminalId} not found`);
    console.log(`[octogent] Terminal state: ${terminal.lifecycleState}`);
    if (terminal.lifecycleState === 'exited' || terminal.lifecycleState === 'stopped') {
      return terminal.lifecycleState;
    }
  }
  throw new Error('Timed out waiting for terminal to finish');
}

async function main() {
  console.log(`[octogent] Handling issue #${issueNumber}: ${issueTitle}`);

  const tentacleId = await createTentacle(`issue-${issueNumber}`);

  const prompt = `You are an autonomous fix agent working in the ai-lab repo at ${repoPath}.

GitHub Issue #${issueNumber}: ${issueTitle}

${issueBody}

Instructions:
1. Analyze the issue and understand what needs to be fixed.
2. Make the minimal correct changes to fix it.
3. Log your work to knowledge/logs/issues/issue-${issueNumber}.md (create this file with: issue summary, your analysis, files changed).
4. Commit all changes on branch fix/issue-${issueNumber}.
5. Open a PR to main with: gh pr create --title "fix: ${issueTitle}" --body-file /tmp/pr-body-${issueNumber}.md --head fix/issue-${issueNumber} --base main
6. When done, type "exit" to end the session.

Start now.`;

  const terminalId = await createTerminal(tentacleId, prompt);
  const finalState = await pollUntilDone(terminalId);

  console.log(`[octogent] Terminal finished with state: ${finalState}`);
  if (finalState === 'exited') {
    console.log(`[octogent] Issue #${issueNumber} handled successfully.`);
  } else {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
