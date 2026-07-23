// Requirement coverage: VHS-REQ-710 (NI LabVIEW setup diagnostics family) — the
// deterministic packet-derived agent-feedback cross-check (VHS-REQ-710.8),
// mirroring mprr ADR-0041. Pure/deterministic: packet-derived primary with a
// screenshot cross-check, bounded sealed-feedback budget, advisory otherwise.
import { describe, expect, it } from 'vitest';

import {
  MPRR_CALIBRATION_MARKERS,
  type CalibrationMarkerObservation
} from '../../src/reporting/syncDiagnostics/mprrCalibrationSurface';
import {
  MPRR_AGENT_FEEDBACK_CROSS_CHECK_SCHEMA,
  MPRR_SEALED_FEEDBACK_BUDGET_MS,
  crossCheckMprrAgentFeedback
} from '../../src/reporting/syncDiagnostics/mprrAgentFeedbackCrossCheck';

function markers(): CalibrationMarkerObservation[] {
  return MPRR_CALIBRATION_MARKERS.map((m) => ({
    id: m.id,
    detectedColorRgb: { ...m.expectedColorRgb },
    withinExpectedBounds: true
  }));
}

describe('crossCheckMprrAgentFeedback (VHS-REQ-710.8)', () => {
  it('is authoritative when the screenshot cross-check agrees within the feedback budget', () => {
    const result = crossCheckMprrAgentFeedback({
      packetTimestampMs: 1_000,
      segmentId: 'seg-1',
      screenshot: { borderVisible: true, markers: markers() },
      feedbackLatencyMs: 2_500
    });
    expect(result.schema).toBe(MPRR_AGENT_FEEDBACK_CROSS_CHECK_SCHEMA);
    expect(result.primarySurface).toBe('packet-derived');
    expect(result.crossCheckPass).toBe(true);
    expect(result.withinFeedbackBudget).toBe(true);
    expect(result.feedbackBudgetMs).toBe(MPRR_SEALED_FEEDBACK_BUDGET_MS);
    expect(result.classification).toBe('authoritative');
    expect(result.summary).toContain('screenshot cross-check agrees');
  });

  it('is advisory when the screenshot cross-check disagrees but is within budget', () => {
    const result = crossCheckMprrAgentFeedback({
      packetTimestampMs: 1_000,
      segmentId: 'seg-2',
      screenshot: { borderVisible: false, markers: markers() }, // border missing -> not calibrated
      feedbackLatencyMs: 1_000
    });
    expect(result.crossCheckPass).toBe(false);
    expect(result.classification).toBe('advisory');
    expect(result.summary).toContain('disagrees (border-missing)');
  });

  it('fails closed above the sealed-feedback budget regardless of cross-check', () => {
    const result = crossCheckMprrAgentFeedback({
      packetTimestampMs: 1_000,
      segmentId: 'seg-3',
      screenshot: { borderVisible: true, markers: markers() },
      feedbackLatencyMs: 12_000 // over the 10s budget
    });
    expect(result.withinFeedbackBudget).toBe(false);
    expect(result.classification).toBe('fail-closed');
  });

  it('honors an explicit feedback budget override', () => {
    const result = crossCheckMprrAgentFeedback({
      packetTimestampMs: 1_000,
      segmentId: 'seg-4',
      screenshot: { borderVisible: true, markers: markers() },
      feedbackLatencyMs: 3_000,
      feedbackBudgetMs: 2_000
    });
    expect(result.classification).toBe('fail-closed');
  });

  it('fails closed on a bad packet timestamp, empty segment id, and negative latency', () => {
    expect(() =>
      crossCheckMprrAgentFeedback({ packetTimestampMs: Number.NaN, segmentId: 's', screenshot: { borderVisible: true, markers: markers() }, feedbackLatencyMs: 0 })
    ).toThrow(/packetTimestampMs/);
    expect(() =>
      crossCheckMprrAgentFeedback({ packetTimestampMs: 0, segmentId: '  ', screenshot: { borderVisible: true, markers: markers() }, feedbackLatencyMs: 0 })
    ).toThrow(/segmentId/);
    expect(() =>
      crossCheckMprrAgentFeedback({ packetTimestampMs: 0, segmentId: 's', screenshot: { borderVisible: true, markers: markers() }, feedbackLatencyMs: -1 })
    ).toThrow(/feedbackLatencyMs/);
  });
});
