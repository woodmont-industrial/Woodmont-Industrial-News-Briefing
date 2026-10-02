import fs from 'node:fs';
import path from 'node:path';

const workflowDir = path.resolve('.github/workflows');
const workflowFiles = fs.readdirSync(workflowDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort();

const failures = [];
let pushWorkflowCount = 0;

for (const name of workflowFiles) {
  const file = path.join(workflowDir, name);
  const source = fs.readFileSync(file, 'utf8');

  if (!/\bgit push\b/.test(source)) continue;
  pushWorkflowCount += 1;

  const required = [
    ['current GitHub App token action', 'actions/create-github-app-token@v3'],
    ['repository-scoped client ID variable', 'vars.NEWSLETTER_AUTOMATION_CLIENT_ID'],
    ['private key secret', 'secrets.NEWSLETTER_AUTOMATION_PRIVATE_KEY'],
    ['contents-only token permission', 'permission-contents: write'],
    ['checkout using the App token', 'token: ${{ steps.newsletter-app-token.outputs.token }}'],
  ];

  for (const [description, needle] of required) {
    if (!source.includes(needle)) failures.push(`${name}: missing ${description}`);
  }

  if (!/^permissions:\s*\n\s+contents:\s+read(?:\s+#.*)?$/m.test(source)) {
    failures.push(`${name}: default GITHUB_TOKEN must be read-only`);
  }

  if (source.includes('token: ${{ secrets.GITHUB_TOKEN }}')) {
    failures.push(`${name}: checkout still persists GITHUB_TOKEN`);
  }
}

if (pushWorkflowCount === 0) {
  failures.push('No push-capable workflow was discovered; validator is not exercising anything');
}

if (failures.length > 0) {
  console.error('Newsletter automation authentication validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validated ${pushWorkflowCount} push-capable workflows: GitHub App authentication is required.`);
