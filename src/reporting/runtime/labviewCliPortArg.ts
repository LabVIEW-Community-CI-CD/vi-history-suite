/**
 * Append (or replace an existing) `-PortNumber <port>` argument on a LabVIEW CLI
 * argv. A non-integer or non-positive port leaves the argv unchanged. When a
 * `-PortNumber` flag is already present (case-insensitive), its value is
 * replaced in place; otherwise the flag and value are appended.
 */
export function appendLabviewCliPortNumberArg(
  args: string[],
  labviewTcpPort: number | undefined
): string[] {
  if (!Number.isInteger(labviewTcpPort) || (labviewTcpPort ?? 0) <= 0) {
    return [...args];
  }

  const existingPortIndex = args.findIndex((argument) => argument.toLowerCase() === '-portnumber');
  if (existingPortIndex >= 0) {
    const updated = [...args];
    updated[existingPortIndex + 1] = String(labviewTcpPort);
    return updated;
  }

  return [...args, '-PortNumber', String(labviewTcpPort)];
}
