/**
 * Writes docs/build-receipt.json — authoritative proof that TODAY's content was
 * built. send-only.yml HOLDs unless this receipt is dated today (America/New_York)
 * and reports success, so a failed, cancelled or never-started build can never
 * deliver yesterday's feed to the department.
 */
import * as fs from 'fs';

const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
const pad = (n) => String(n).padStart(2, '0');
const receipt = {
  buildDate: `${ny.getFullYear()}-${pad(ny.getMonth() + 1)}-${pad(ny.getDate())}`,
  completedAt: new Date().toISOString(),
  trigger: process.env.TRIGGER || 'unknown',
  runId: process.env.RUN_ID || 'unknown',
  success: true,
};
fs.writeFileSync('docs/build-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
console.log('Build receipt: ' + JSON.stringify(receipt));
