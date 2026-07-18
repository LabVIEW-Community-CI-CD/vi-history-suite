export function rewriteLabviewCliArgsForContainerWorkspace(
  args: string[],
  options: {
    containerWorkspaceRoot: string;
    leftFilename: string;
    rightFilename: string;
    reportFilename: string;
    labviewPath?: string;
  }
): string[] | undefined {
  const rewritten: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '-VI1' || current === '-vi1') {
      rewritten.push(current, `${options.containerWorkspaceRoot}\\staging\\${options.leftFilename}`);
      index += 1;
      continue;
    }

    if (current === '-VI2' || current === '-vi2') {
      rewritten.push(current, `${options.containerWorkspaceRoot}\\staging\\${options.rightFilename}`);
      index += 1;
      continue;
    }

    if (current === '-ReportPath' || current === '-reportPath') {
      rewritten.push(current, `${options.containerWorkspaceRoot}\\${options.reportFilename}`);
      index += 1;
      continue;
    }

    if (current === '-LabVIEWPath') {
      index += 1;
      continue;
    }

    if (current === '-Headless') {
      const next = args[index + 1];
      if (next && !next.startsWith('-')) {
        index += 1;
      }
      continue;
    }

    if (current === '-c') {
      continue;
    }

    rewritten.push(current);
  }

  if (options.labviewPath?.trim()) {
    rewritten.push('-LabVIEWPath', options.labviewPath.trim());
  }
  rewritten.push('-Headless');

  return rewritten.length > 0 ? rewritten : undefined;
}

export function rewriteLvcompareArgsForContainerWorkspace(
  args: string[],
  options: {
    containerWorkspaceRoot: string;
    leftFilename: string;
    rightFilename: string;
    labviewPath?: string;
  }
): string[] | undefined {
  if (args.length < 2) {
    return undefined;
  }

  const rewritten = [
    `${options.containerWorkspaceRoot}\\staging\\${options.leftFilename}`,
    `${options.containerWorkspaceRoot}\\staging\\${options.rightFilename}`
  ];

  for (let index = 2; index < args.length; index += 1) {
    const current = args[index];
    if (current === '-lvpath') {
      rewritten.push(current, options.labviewPath ?? args[index + 1] ?? '');
      index += 1;
      continue;
    }

    rewritten.push(current);
  }

  return rewritten;
}

export function rewriteLvcompareArgsForLinuxContainerWorkspace(
  args: string[],
  options: {
    containerWorkspaceRoot: string;
    leftFilename: string;
    rightFilename: string;
    labviewPath?: string;
    containerLabviewPath?: string;
  }
): string[] | undefined {
  if (args.length < 2) {
    return undefined;
  }

  const rewritten = [
    `${options.containerWorkspaceRoot}/staging/${options.leftFilename}`,
    `${options.containerWorkspaceRoot}/staging/${options.rightFilename}`
  ];

  for (let index = 2; index < args.length; index += 1) {
    const current = args[index];
    if (current === '-lvpath') {
      // VHS-REQ-657: image-derived plain `labview` binary; LabVIEW 2026 fallback.
      rewritten.push(
        current,
        options.containerLabviewPath ?? '/usr/local/natinst/LabVIEW-2026-64/labview'
      );
      index += 1;
      continue;
    }

    rewritten.push(current);
  }

  return rewritten;
}
