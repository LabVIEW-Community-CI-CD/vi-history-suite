import * as fs from 'node:fs/promises';

import { isValidArchivedComparisonReportSourceRecord } from './comparisonReportArchiveRecordValidation';
import type {
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection
} from '../dashboard/comparisonReportArchive';

/**
 * Pure archived comparison-report source-record reader/validator extracted verbatim from
 * comparisonReportAction. `readValidatedArchivedComparisonReportSourceRecord` reads and
 * JSON-parses the retained source-record file, returning `undefined` when it is missing,
 * unparseable, fails structural/identity validation against the expected archive plan and
 * revision pair, or when its referenced packet file no longer exists on disk. Isolated
 * from action orchestration and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-641.
 */
export async function readValidatedArchivedComparisonReportSourceRecord(options: {
  storageRoot: string;
  expectedArchivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>;
  selectedHash: string;
  baseHash: string;
  pathExists: (targetPath: string) => Promise<boolean>;
  readFile: typeof fs.readFile;
}): Promise<ArchivedComparisonReportSourceRecord | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await options.readFile(options.expectedArchivePlan.sourceRecordFilePath, 'utf8')
    );
  } catch {
    return undefined;
  }

  if (
    !isValidArchivedComparisonReportSourceRecord(
      parsed,
      options.storageRoot,
      options.expectedArchivePlan,
      options.selectedHash,
      options.baseHash
    )
  ) {
    return undefined;
  }

  if (!(await options.pathExists(parsed.archivePlan.packetFilePath))) {
    return undefined;
  }

  return parsed;
}
