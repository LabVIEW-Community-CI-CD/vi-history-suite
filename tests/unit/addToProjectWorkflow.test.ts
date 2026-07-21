import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(name: string): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', name), 'utf8')
    .replace(/\r\n/g, '\n');
}

const read = (): string => readWorkflow('add-to-project.yml');

// VHS-REQ-704: auto-add new issues/PRs to the authoritative org Project #4
// ("vihs"). The board write is gated on the maintainer-provisioned
// Projects-scoped secret so it is a safe no-op without it, and the workflow runs
// no PR code even under pull_request_target.
describe('Add To Project Board workflow (VHS-REQ-704)', () => {
  it('triggers on opened issues and PRs plus manual backfill dispatch (VHS-REQ-704.1)', () => {
    const workflow = read();

    expect(workflow).toMatch(/^\s{2}issues:\n\s{4}types:\s*\[opened\]/m);
    // pull_request_target (not pull_request) so a fork PR run gets the base
    // repo's secret; safe because no PR code is executed.
    expect(workflow).toMatch(/^\s{2}pull_request_target:\n\s{4}types:\s*\[opened\]/m);
    expect(workflow).not.toMatch(/^\s{2}pull_request:/m);
    expect(workflow).toContain('workflow_dispatch:');
  });

  it('keeps least-privilege permissions and never grants project write to the ambient token (VHS-REQ-704.2)', () => {
    const workflow = read();

    expect(workflow).toContain('permissions:\n  contents: read');
    // The only board-writing token is the injected Projects secret.
    expect(workflow).not.toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).not.toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });

  it('gates the add on the provisioned Projects secret so it is a no-op without it (VHS-REQ-704.2)', () => {
    const workflow = read();

    expect(workflow).toContain('CONTROL_PLANE_PROJECT_TOKEN: ${{ secrets.CONTROL_PLANE_PROJECT_TOKEN }}');
    expect(workflow).toContain("if: ${{ env.CONTROL_PLANE_PROJECT_TOKEN != '' }}");
    expect(workflow).toContain('GH_TOKEN: ${{ env.CONTROL_PLANE_PROJECT_TOKEN }}');
  });

  it('adds the event or backfill content URL to Project #4 idempotently (VHS-REQ-704.3)', () => {
    const workflow = read();

    expect(workflow).toContain(
      'CONTENT_URL: ${{ github.event.issue.html_url || github.event.pull_request.html_url || github.event.inputs.content_url }}'
    );
    expect(workflow).toContain('gh project item-add 4 --owner LabVIEW-Community-CI-CD --url "$CONTENT_URL"');
  });

  it('never references vagrant (packaging contract)', () => {
    expect(read().toLowerCase()).not.toContain('vagrant');
  });
});
