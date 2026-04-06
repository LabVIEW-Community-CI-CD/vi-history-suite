import { execFile } from 'node:child_process';

export interface WindowsHostRuntimeProcessRecord {
  processName: string;
  pid: number;
  path?: string;
}

export interface WindowsHostRuntimeSurfaceSnapshot {
  capturedAt: string;
  processes: WindowsHostRuntimeProcessRecord[];
  processNames: string[];
}

export interface WindowsHostRuntimeSurfaceDeps {
  execFileImpl?: typeof execFile;
  nowIso?: () => string;
}

export async function inspectWindowsHostRuntimeSurface(
  deps: WindowsHostRuntimeSurfaceDeps = {}
): Promise<WindowsHostRuntimeSurfaceSnapshot> {
  const execFileImpl = deps.execFileImpl ?? execFile;
  const stdout = await execWindowsPowershellCommand(
    [
      '$names = @("LabVIEW","LabVIEWCLI","LVCompare")',
      '$procs = @(Get-Process -Name $names -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,Path)',
      'if ($procs.Count -eq 0) { "[]" } else { $procs | ConvertTo-Json -Compress }'
    ].join('; '),
    execFileImpl
  );

  const processes = parseWindowsHostRuntimeProcesses(stdout);
  return {
    capturedAt: (deps.nowIso ?? defaultNowIso)(),
    processes,
    processNames: processes.map((record) => record.processName)
  };
}

export async function cleanupWindowsHostRuntimeSurface(
  deps: WindowsHostRuntimeSurfaceDeps = {}
): Promise<void> {
  const execFileImpl = deps.execFileImpl ?? execFile;
  await execWindowsPowershellCommand(
    [
      '$names = @("LabVIEW","LabVIEWCLI","LVCompare")',
      'Stop-Process -Name $names -Force -ErrorAction SilentlyContinue',
      'Start-Sleep -Milliseconds 250',
      '$remaining = @(Get-Process -Name $names -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName)',
      'if ($remaining.Count -gt 0) {',
      "  Write-Error ('Windows host runtime cleanup failed; remaining processes: ' + ($remaining -join ', '))",
      '  exit 1',
      '}',
      'exit 0'
    ].join('; '),
    execFileImpl
  );
}

export async function launchWindowsHeadlessLabview(
  labviewExePath: string,
  deps: WindowsHostRuntimeSurfaceDeps = {}
): Promise<number> {
  const execFileImpl = deps.execFileImpl ?? execFile;
  const stdout = await execWindowsPowershellCommand(
    [
      `$labviewExePath = '${escapePowershellSingleQuotedString(labviewExePath)}'`,
      `$proc = Start-Process -FilePath $labviewExePath -ArgumentList @('--headless') -PassThru -WindowStyle Hidden`,
      '[ordered]@{ Id = $proc.Id } | ConvertTo-Json -Compress'
    ].join('; '),
    execFileImpl
  );

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Windows headless LabVIEW launch did not retain a process id.');
  }

  const parsed = JSON.parse(trimmed) as { Id?: number };
  if (typeof parsed.Id !== 'number' || parsed.Id <= 0) {
    throw new Error('Windows headless LabVIEW launch retained an invalid process id.');
  }

  return parsed.Id;
}

async function execWindowsPowershellCommand(
  command: string,
  execFileImpl: typeof execFile
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFileImpl(
      'powershell.exe',
      ['-NoProfile', '-Command', command],
      (error, stdout = '', stderr = '') => {
        if (error) {
          reject(
            new Error(
              stderr.trim() || stdout.trim() || error.message || 'Windows PowerShell command failed.'
            )
          );
          return;
        }

        resolve(stdout);
      }
    );
  });
}

function parseWindowsHostRuntimeProcesses(stdout: string): WindowsHostRuntimeProcessRecord[] {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed === '[]') {
    return [];
  }

  const parsed = JSON.parse(trimmed) as
    | Array<{ ProcessName?: string; Id?: number; Path?: string }>
    | { ProcessName?: string; Id?: number; Path?: string };
  const rawRecords = Array.isArray(parsed) ? parsed : [parsed];
  const records = rawRecords
    .map((record) => ({
      processName: record.ProcessName?.trim() ?? '',
      pid: record.Id ?? 0,
      path: record.Path?.trim() || undefined
    }))
    .filter((record) => record.processName && record.pid > 0)
    .sort((left, right) => left.processName.localeCompare(right.processName) || left.pid - right.pid);

  return records.map((record) => ({
    ...record,
    processName: record.processName,
    pid: record.pid,
    path: record.path
  }));
}

function escapePowershellSingleQuotedString(value: string): string {
  return value.replaceAll("'", "''");
}

function defaultNowIso(): string {
  return new Date().toISOString();
}
