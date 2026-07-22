using System.Text.Json;
using ViHistorySuite.ReviewCaptureTransport;

var options = CliOptions.Parse(args);
if (options.HelpRequested)
{
    Console.WriteLine(CliOptions.GetUsage());
    return;
}

try
{
    var receipt = DualPacketSelfTestWriter.Run(options);
    Console.WriteLine(JsonSerializer.Serialize(receipt.ConsoleSummary, JsonOptions.Value));
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    Environment.ExitCode = 1;
}

internal sealed record CliOptions
{
    public bool HelpRequested { get; init; }
    public string SurfaceMetadataPath { get; init; } = string.Empty;
    public string GroundTruthLedgerPath { get; init; } = string.Empty;
    public string OutputDirectory { get; init; } = string.Empty;
    public string AttemptId { get; init; } = string.Empty;
    public int FrameCount { get; init; } = 4;
    public int FrameIntervalMilliseconds { get; init; } = 100;

    public static string GetUsage()
        => string.Join(
            Environment.NewLine,
            "Usage: dotnet ReviewCaptureDualPacketSelfTestWriter.dll --surface-metadata-path <path> --ground-truth-ledger-path <path> --output-dir <path> --attempt-id <id> [--frame-count <n>] [--frame-interval-milliseconds <n>] [--help]",
            string.Empty,
            "Retain one governed self-test dual-packet live-capture proof with short.tdms, long.tdms, one shared manifest, one correlation receipt, and one short-packet analysis summary.");

    public static CliOptions Parse(string[] args)
    {
        var parsed = new CliOptions();
        for (var index = 0; index < args.Length; index += 1)
        {
            var current = args[index];

            string RequireValue(string flag)
            {
                if (index + 1 >= args.Length)
                {
                    throw new ArgumentException($"Missing value for {flag}.{Environment.NewLine}{Environment.NewLine}{GetUsage()}");
                }

                index += 1;
                return args[index];
            }

            switch (current)
            {
                case "--help":
                case "-h":
                    parsed = parsed with { HelpRequested = true };
                    break;
                case "--surface-metadata-path":
                    parsed = parsed with { SurfaceMetadataPath = Path.GetFullPath(RequireValue("--surface-metadata-path")) };
                    break;
                case "--ground-truth-ledger-path":
                    parsed = parsed with { GroundTruthLedgerPath = Path.GetFullPath(RequireValue("--ground-truth-ledger-path")) };
                    break;
                case "--output-dir":
                    parsed = parsed with { OutputDirectory = Path.GetFullPath(RequireValue("--output-dir")) };
                    break;
                case "--attempt-id":
                    parsed = parsed with { AttemptId = RequireValue("--attempt-id") };
                    break;
                case "--frame-count":
                    parsed = parsed with { FrameCount = int.Parse(RequireValue("--frame-count")) };
                    break;
                case "--frame-interval-milliseconds":
                    parsed = parsed with { FrameIntervalMilliseconds = int.Parse(RequireValue("--frame-interval-milliseconds")) };
                    break;
                default:
                    throw new ArgumentException($"Unknown argument: {current}{Environment.NewLine}{Environment.NewLine}{GetUsage()}");
            }
        }

        if (parsed.HelpRequested)
        {
            return parsed;
        }

        if (string.IsNullOrWhiteSpace(parsed.SurfaceMetadataPath)
            || string.IsNullOrWhiteSpace(parsed.GroundTruthLedgerPath)
            || string.IsNullOrWhiteSpace(parsed.OutputDirectory)
            || string.IsNullOrWhiteSpace(parsed.AttemptId))
        {
            throw new ArgumentException($"Missing one or more required arguments.{Environment.NewLine}{Environment.NewLine}{GetUsage()}");
        }

        if (!File.Exists(parsed.SurfaceMetadataPath))
        {
            throw new ArgumentException($"Surface metadata path does not exist: {parsed.SurfaceMetadataPath}.");
        }

        if (!File.Exists(parsed.GroundTruthLedgerPath))
        {
            throw new ArgumentException($"Ground-truth ledger path does not exist: {parsed.GroundTruthLedgerPath}.");
        }

        if (parsed.FrameCount < 2)
        {
            throw new ArgumentException($"Frame count must be >= 2, got {parsed.FrameCount}.");
        }

        if (parsed.FrameIntervalMilliseconds < 10)
        {
            throw new ArgumentException(
                $"Frame interval milliseconds must be >= 10, got {parsed.FrameIntervalMilliseconds}.");
        }

        return parsed;
    }
}

internal static class DualPacketSelfTestWriter
{
    private const uint PixelFormatRgba8888 = 0x52474241;
    private const byte BytesPerPixel = 4;
    private const int PreviewWidth = 160;
    private const int PreviewHeight = 90;
    private const string ExpectedSurfaceSchema = "mprr-self-test-surface-v1";
    private const string ExpectedLedgerSchema = "mprr-self-test-ground-truth-ledger-v1";

    public static DualPacketLiveCaptureReceipt Run(CliOptions options)
    {
        var metadata = SelfTestSurfaceMetadata.Load(options.SurfaceMetadataPath);
        var ledger = SelfTestGroundTruthLedger.Load(options.GroundTruthLedgerPath);
        if (!string.Equals(metadata.SchemaVersion, ExpectedSurfaceSchema, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Unsupported surface metadata schema {metadata.SchemaVersion}; expected {ExpectedSurfaceSchema}.");
        }

        if (!string.Equals(ledger.SchemaVersion, ExpectedLedgerSchema, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Unsupported ground-truth ledger schema {ledger.SchemaVersion}; expected {ExpectedLedgerSchema}.");
        }

        Directory.CreateDirectory(options.OutputDirectory);
        var runId = $"{options.AttemptId}-{DateTimeOffset.UtcNow:yyyyMMddTHHmmssfffZ}";
        var timingAuthorityId = "mprr-self-test-synthetic-monotonic-100ns";
        var triggerSessionId = $"{runId}-autostart";
        var frames = BuildFrames(metadata, ledger, options.FrameCount, options.FrameIntervalMilliseconds);

        var shortPackets = BuildShortPacketSpecs(options.AttemptId, frames);
        var longPackets = BuildLongPacketSpecs(frames);
        var writer = new DualPacketStreamWriter();
        var shortPath = Path.Combine(options.OutputDirectory, "short.tdms");
        var longPath = Path.Combine(options.OutputDirectory, "long.tdms");
        var shortWrite = writer.WritePackets(shortPath, DualPacketStreamId.ShortPacket, shortPackets);
        var longWrite = writer.WritePackets(longPath, DualPacketStreamId.LongPacket, longPackets);

        var reader = new DualPacketStreamReader();
        var shortRead = reader.ReadPackets(shortPath);
        var longRead = reader.ReadPackets(longPath);
        var analysisSummary = BuildShortPacketAnalysisSummary(shortRead, frames);

        var manifest = BuildManifest(runId, options.AttemptId, timingAuthorityId, triggerSessionId, shortRead, longRead);
        var manifestPath = Path.Combine(options.OutputDirectory, "dual-packet-manifest.json");
        WriteJson(manifestPath, manifest);

        var correlationReceipt = BuildCorrelationReceipt(runId, options.AttemptId, timingAuthorityId, triggerSessionId, shortRead, longRead, frames);
        var correlationReceiptPath = Path.Combine(options.OutputDirectory, "dual-packet-correlation-receipt.json");
        WriteJson(correlationReceiptPath, correlationReceipt);

        var analysisSummaryPath = Path.Combine(options.OutputDirectory, "short-packet-analysis-summary.json");
        WriteJson(analysisSummaryPath, analysisSummary);

        var authoritativeOutcome =
            shortRead.Packets.Length > 0
            && longRead.Packets.Length == frames.Count
            && correlationReceipt.FrameCorrelations.All(entry => entry.CorrelationOutcome == "authoritative")
            && string.Equals(analysisSummary.AnalysisSource, "short-packet", StringComparison.Ordinal)
                ? "authoritative"
                : "non-authoritative";

        var receipt = new DualPacketLiveCaptureReceipt
        {
            SchemaVersion = "mprr-self-test-dual-packet-live-capture-v1",
            GeneratedAtUtc = DateTimeOffset.UtcNow.ToString("o"),
            AttemptId = options.AttemptId,
            RunId = runId,
            OutputDirectory = Path.GetFullPath(options.OutputDirectory),
            SurfaceId = metadata.SurfaceId,
            SurfaceMetadataPath = options.SurfaceMetadataPath,
            GroundTruthLedgerPath = options.GroundTruthLedgerPath,
            TransportSchemaId = "mprr-dual-packet-self-test-live-v1",
            PacketSchemaId = DualPacketTransportSchema.Current.ToString(),
            TimingAuthorityId = timingAuthorityId,
            TriggerSessionId = triggerSessionId,
            PrimaryAnalysisSurface = "short-packet",
            ShortPacketAnalysisSummaryPath = "short-packet-analysis-summary.json",
            ManifestPath = "dual-packet-manifest.json",
            CorrelationReceiptPath = "dual-packet-correlation-receipt.json",
            ReaderFriendlyShortPacketStream = true,
            AuthoritativeOutcome = authoritativeOutcome,
            StreamSummaries = new[]
            {
                BuildStreamSummary(shortRead),
                BuildStreamSummary(longRead)
            },
            RenderedFrames = frames.Select(frame => new DualPacketRenderedFrame
            {
                FrameId = frame.FrameId,
                PayloadDescriptorId = frame.PayloadDescriptorId,
                RelativeMilliseconds = frame.RelativeMilliseconds,
                RenderedCentiseconds = frame.RenderedCentiseconds,
                ActiveLabelElementId = frame.ActiveLabelElementId,
                ActiveEventId = frame.ActiveEventId
            }).ToArray()
        };

        var receiptPath = Path.Combine(options.OutputDirectory, "dual-packet-live-capture-receipt.json");
        WriteJson(receiptPath, receipt);
        return receipt;
    }

    private static IReadOnlyList<SyntheticFrame> BuildFrames(
        SelfTestSurfaceMetadata metadata,
        SelfTestGroundTruthLedger ledger,
        int frameCount,
        int frameIntervalMilliseconds)
    {
        var labels = metadata.Labels;
        var clickTargetBeta = metadata.ClickTargets.FirstOrDefault(entry => entry.ElementId == "click-target-beta")
            ?? throw new InvalidOperationException("Surface metadata is missing click-target-beta.");
        var triggerStart = metadata.Triggers.FirstOrDefault(entry => entry.ElementId == "trigger-start")
            ?? throw new InvalidOperationException("Surface metadata is missing trigger-start.");
        var triggerMark = metadata.Triggers.FirstOrDefault(entry => entry.ElementId == "trigger-mark")
            ?? throw new InvalidOperationException("Surface metadata is missing trigger-mark.");

        EnsureLedgerEvent(ledger, "trigger-start-fire");
        EnsureLedgerEvent(ledger, "click-target-beta-press");
        EnsureLedgerEvent(ledger, "trigger-mark-fire");

        var frames = new List<SyntheticFrame>(frameCount);
        for (var index = 0; index < frameCount; index += 1)
        {
            var pattern = index % 4;
            var label = labels[index % labels.Length];
            var relativeMilliseconds = index * frameIntervalMilliseconds;
            var renderedCentiseconds = relativeMilliseconds / 10;
            var frameId = (ulong)(index + 1);
            var payloadDescriptorId = (ulong)(1000 + index + 1);
            var frame = pattern switch
            {
                1 => new SyntheticFrame
                {
                    FrameId = frameId,
                    PayloadDescriptorId = payloadDescriptorId,
                    RelativeMilliseconds = (ulong)relativeMilliseconds,
                    RenderedCentiseconds = (uint)renderedCentiseconds,
                    ActiveLabelElementId = label.ElementId,
                    HighlightedTriggerId = triggerStart.ElementId,
                    ActiveEventId = "trigger-start-fire",
                    TriggerText = "trigger-start fired",
                    TriggerKeyCode = 112,
                    LatestEventCode = 1
                },
                2 => new SyntheticFrame
                {
                    FrameId = frameId,
                    PayloadDescriptorId = payloadDescriptorId,
                    RelativeMilliseconds = (ulong)relativeMilliseconds,
                    RenderedCentiseconds = (uint)renderedCentiseconds,
                    ActiveLabelElementId = label.ElementId,
                    HighlightedClickTargetId = clickTargetBeta.ElementId,
                    ActiveEventId = "click-target-beta-press",
                    CursorX = clickTargetBeta.Rect.CenterX,
                    CursorY = clickTargetBeta.Rect.CenterY,
                    ClickButtonId = 1,
                    ClickTransitionId = 1,
                    LatestEventCode = 2
                },
                3 => new SyntheticFrame
                {
                    FrameId = frameId,
                    PayloadDescriptorId = payloadDescriptorId,
                    RelativeMilliseconds = (ulong)relativeMilliseconds,
                    RenderedCentiseconds = (uint)renderedCentiseconds,
                    ActiveLabelElementId = label.ElementId,
                    HighlightedTriggerId = triggerMark.ElementId,
                    ActiveEventId = "trigger-mark-fire",
                    TriggerText = "trigger-mark fired",
                    TriggerKeyCode = 113,
                    LatestEventCode = 3
                },
                _ => new SyntheticFrame
                {
                    FrameId = frameId,
                    PayloadDescriptorId = payloadDescriptorId,
                    RelativeMilliseconds = (ulong)relativeMilliseconds,
                    RenderedCentiseconds = (uint)renderedCentiseconds,
                    ActiveLabelElementId = label.ElementId,
                    ActiveEventId = "steady-frame",
                    LatestEventCode = 0
                }
            };

            frame.FramePayload = RenderFramePayload(metadata, ledger, frame);
            frames.Add(frame);
        }

        return frames;
    }

    private static void EnsureLedgerEvent(SelfTestGroundTruthLedger ledger, string eventId)
    {
        if (!ledger.EventIds.Contains(eventId, StringComparer.Ordinal))
        {
            throw new InvalidOperationException($"Ground-truth ledger is missing required input-driven event {eventId}.");
        }
    }

    private static IReadOnlyList<DualPacketSpec> BuildShortPacketSpecs(string attemptId, IReadOnlyList<SyntheticFrame> frames)
    {
        var packets = new List<DualPacketSpec>();
        ulong sequence = 1;
        uint recordId = 1;
        packets.Add(new DualPacketSpec
        {
            StreamId = DualPacketStreamId.ShortPacket,
            PacketKind = DualPacketKind.GovernedTrigger,
            Flags = DualPacketFlags.FrameBound,
            WriterLocalSequence = sequence++,
            TimingTicks64 = 0,
            FrameId = 0,
            PayloadDescriptorId = 0,
            Payload = DualPacketPayloadCodec.EncodeTextPayload(recordId++, 100, 0, $"{attemptId}-capture-live")
        });

        foreach (var frame in frames)
        {
            var descriptorId = frame.PayloadDescriptorId;
            var tickBase = frame.RelativeMilliseconds * 10_000UL;
            var eventCount = 1U;
            ushort triggerCount = 0;
            var latestEventCode = frame.LatestEventCode;

            packets.Add(new DualPacketSpec
            {
                StreamId = DualPacketStreamId.ShortPacket,
                PacketKind = DualPacketKind.FrameStart,
                Flags = DualPacketFlags.FrameBound | DualPacketFlags.GovernedPayloadReference,
                WriterLocalSequence = sequence++,
                TimingTicks64 = tickBase,
                FrameId = frame.FrameId,
                PayloadDescriptorId = descriptorId,
                Payload = DualPacketPayloadCodec.EncodeFrameStartPayload(PreviewWidth, PreviewHeight, PixelFormatRgba8888, BytesPerPixel)
            });

            packets.Add(new DualPacketSpec
            {
                StreamId = DualPacketStreamId.ShortPacket,
                PacketKind = DualPacketKind.OperatorAnnotation,
                Flags = DualPacketFlags.FrameBound,
                WriterLocalSequence = sequence++,
                TimingTicks64 = tickBase + 1,
                FrameId = frame.FrameId,
                PayloadDescriptorId = descriptorId,
                Payload = DualPacketPayloadCodec.EncodeTextPayload(
                    recordId++,
                    300,
                    frame.FrameId,
                    $"{frame.ActiveLabelElementId}-visible")
            });

            if (frame.HighlightedClickTargetId is not null)
            {
                eventCount += 2;
                packets.Add(new DualPacketSpec
                {
                    StreamId = DualPacketStreamId.ShortPacket,
                    PacketKind = DualPacketKind.CursorSample,
                    Flags = DualPacketFlags.FrameBound,
                    WriterLocalSequence = sequence++,
                    TimingTicks64 = tickBase + 2,
                    FrameId = frame.FrameId,
                    PayloadDescriptorId = descriptorId,
                    Payload = TransportPayloadCodec.EncodeCursorSamplePayload(
                        frame.CursorX,
                        frame.CursorY,
                        frame.CursorX,
                        frame.CursorY,
                        1)
                });

                packets.Add(new DualPacketSpec
                {
                    StreamId = DualPacketStreamId.ShortPacket,
                    PacketKind = DualPacketKind.Click,
                    Flags = DualPacketFlags.FrameBound,
                    WriterLocalSequence = sequence++,
                    TimingTicks64 = tickBase + 3,
                    FrameId = frame.FrameId,
                    PayloadDescriptorId = descriptorId,
                    Payload = TransportPayloadCodec.EncodeClickPayload(
                        frame.CursorX,
                        frame.CursorY,
                        frame.CursorX,
                        frame.CursorY,
                        frame.ClickButtonId,
                        frame.ClickTransitionId,
                        0,
                        1)
                });
            }

            if (frame.HighlightedTriggerId is not null)
            {
                triggerCount += 1;
                eventCount += 1;
                if (frame.TriggerKeyCode is not null)
                {
                    eventCount += 1;
                    packets.Add(new DualPacketSpec
                    {
                        StreamId = DualPacketStreamId.ShortPacket,
                        PacketKind = DualPacketKind.Keyboard,
                        Flags = DualPacketFlags.FrameBound,
                        WriterLocalSequence = sequence++,
                        TimingTicks64 = tickBase + 2,
                        FrameId = frame.FrameId,
                        PayloadDescriptorId = descriptorId,
                        Payload = TransportPayloadCodec.EncodeKeyboardPayload(
                            1,
                            1,
                            0,
                            (uint)frame.TriggerKeyCode.Value,
                            0)
                    });
                }

                packets.Add(new DualPacketSpec
                {
                    StreamId = DualPacketStreamId.ShortPacket,
                    PacketKind = DualPacketKind.UngovernedTrigger,
                    Flags = DualPacketFlags.FrameBound,
                    WriterLocalSequence = sequence++,
                    TimingTicks64 = tickBase + 4,
                    FrameId = frame.FrameId,
                    PayloadDescriptorId = descriptorId,
                    Payload = DualPacketPayloadCodec.EncodeTextPayload(
                        recordId++,
                        400,
                        frame.FrameId,
                        frame.TriggerText ?? frame.ActiveEventId ?? "trigger-fired")
                });
            }

            packets.Add(new DualPacketSpec
            {
                StreamId = DualPacketStreamId.ShortPacket,
                PacketKind = DualPacketKind.FrameEnd,
                Flags = DualPacketFlags.FrameBound,
                WriterLocalSequence = sequence++,
                TimingTicks64 = tickBase + 5,
                FrameId = frame.FrameId,
                PayloadDescriptorId = descriptorId,
                Payload = DualPacketPayloadCodec.EncodeFrameEndPayload(
                    eventCount,
                    1,
                    triggerCount,
                    frame.RenderedCentiseconds,
                    latestEventCode)
            });
        }

        var lastTick = frames[^1].RelativeMilliseconds * 10_000UL + 10;
        packets.Add(new DualPacketSpec
        {
            StreamId = DualPacketStreamId.ShortPacket,
            PacketKind = DualPacketKind.GovernedTrigger,
            Flags = DualPacketFlags.FrameBound,
            WriterLocalSequence = sequence++,
            TimingTicks64 = lastTick,
            FrameId = 0,
            PayloadDescriptorId = 0,
            Payload = DualPacketPayloadCodec.EncodeTextPayload(recordId++, 101, 0, $"{attemptId}-capture-stop")
        });

        return packets;
    }

    private static IReadOnlyList<DualPacketSpec> BuildLongPacketSpecs(IReadOnlyList<SyntheticFrame> frames)
    {
        var packets = new List<DualPacketSpec>(frames.Count);
        ulong sequence = 1;
        foreach (var frame in frames)
        {
            packets.Add(new DualPacketSpec
            {
                StreamId = DualPacketStreamId.LongPacket,
                PacketKind = DualPacketKind.FramePayload,
                Flags = DualPacketFlags.FrameBound | DualPacketFlags.GovernedPayloadReference,
                WriterLocalSequence = sequence++,
                TimingTicks64 = frame.RelativeMilliseconds * 10_000UL + 2,
                FrameId = frame.FrameId,
                PayloadDescriptorId = frame.PayloadDescriptorId,
                Payload = frame.FramePayload
            });
        }

        return packets;
    }

    private static byte[] RenderFramePayload(SelfTestSurfaceMetadata metadata, SelfTestGroundTruthLedger ledger, SyntheticFrame frame)
    {
        var pixels = new byte[PreviewWidth * PreviewHeight * 4];
        FillBuffer(pixels, new Rgba(250, 250, 248, 255));

        foreach (var marker in metadata.CornerMarkers)
        {
            var outer = ScaleRect(marker.Rect, metadata.LogicalSurface.Width, metadata.LogicalSurface.Height);
            DrawFilledRect(pixels, PreviewWidth, PreviewHeight, outer, new Rgba(0, 0, 0, 255));
            DrawFilledRect(
                pixels,
                PreviewWidth,
                PreviewHeight,
                InflateRect(outer, -Math.Max(1, marker.InsetPixels * PreviewWidth / metadata.LogicalSurface.Width)),
                new Rgba(255, 255, 255, 255));
        }

        var stripRect = ScaleRect(metadata.BinaryStripRect, metadata.LogicalSurface.Width, metadata.LogicalSurface.Height);
        DrawFilledRect(pixels, PreviewWidth, PreviewHeight, stripRect, new Rgba(240, 241, 243, 255));
        var bitStream = BuildBinaryStripBits((int)frame.RenderedCentiseconds, ledger.BinaryStripPrefix);
        var cellWidth = stripRect.Width / (double)bitStream.Length;
        for (var index = 0; index < bitStream.Length; index += 1)
        {
            var left = stripRect.X + (int)Math.Floor(index * cellWidth);
            var right = stripRect.X + (int)Math.Ceiling((index + 1) * cellWidth);
            var bitRect = new Rect
            {
                X = left,
                Y = stripRect.Y,
                Width = Math.Max(1, right - left),
                Height = stripRect.Height
            };
            DrawFilledRect(
                pixels,
                PreviewWidth,
                PreviewHeight,
                bitRect,
                bitStream[index] == '1' ? new Rgba(0, 0, 0, 255) : new Rgba(255, 255, 255, 255));
        }

        foreach (var label in metadata.Labels)
        {
            var rect = ScaleRect(label.Rect, metadata.LogicalSurface.Width, metadata.LogicalSurface.Height);
            var color = ParseColor(label.Color);
            DrawFilledRect(pixels, PreviewWidth, PreviewHeight, rect, color);
            DrawBorderRect(
                pixels,
                PreviewWidth,
                PreviewHeight,
                rect,
                label.ElementId == frame.ActiveLabelElementId ? new Rgba(30, 30, 30, 255) : new Rgba(255, 255, 255, 255),
                label.ElementId == frame.ActiveLabelElementId ? 2 : 1);
        }

        foreach (var target in metadata.ClickTargets)
        {
            var rect = ScaleRect(target.Rect, metadata.LogicalSurface.Width, metadata.LogicalSurface.Height);
            var color = ParseColor(target.Color);
            DrawFilledRect(pixels, PreviewWidth, PreviewHeight, rect, color);
            DrawBorderRect(
                pixels,
                PreviewWidth,
                PreviewHeight,
                rect,
                target.ElementId == frame.HighlightedClickTargetId ? new Rgba(255, 255, 255, 255) : new Rgba(15, 15, 15, 255),
                target.ElementId == frame.HighlightedClickTargetId ? 3 : 1);
        }

        foreach (var trigger in metadata.Triggers)
        {
            var rect = ScaleRect(trigger.Rect, metadata.LogicalSurface.Width, metadata.LogicalSurface.Height);
            var color = ParseColor(trigger.Color);
            DrawFilledRect(pixels, PreviewWidth, PreviewHeight, rect, color);
            DrawBorderRect(
                pixels,
                PreviewWidth,
                PreviewHeight,
                rect,
                trigger.ElementId == frame.HighlightedTriggerId ? new Rgba(255, 255, 255, 255) : new Rgba(40, 40, 40, 255),
                trigger.ElementId == frame.HighlightedTriggerId ? 3 : 1);
        }

        var statusRect = new Rect
        {
            X = 0,
            Y = PreviewHeight - 12,
            Width = PreviewWidth,
            Height = 12
        };
        var statusColor = frame.LatestEventCode switch
        {
            1 => new Rgba(246, 231, 161, 255),
            2 => new Rgba(209, 227, 255, 255),
            3 => new Rgba(250, 215, 160, 255),
            _ => new Rgba(252, 245, 219, 255)
        };
        DrawFilledRect(pixels, PreviewWidth, PreviewHeight, statusRect, statusColor);
        return pixels;
    }

    private static string BuildBinaryStripBits(int centiseconds, string prefixBits)
    {
        var boundedCentiseconds = Math.Max(0, Math.Min(16_777_215, centiseconds));
        var payloadBits = Convert.ToString(boundedCentiseconds, 2).PadLeft(24, '0');
        var highByte = (boundedCentiseconds >> 16) & 0xFF;
        var middleByte = (boundedCentiseconds >> 8) & 0xFF;
        var lowByte = boundedCentiseconds & 0xFF;
        var checksum = highByte ^ middleByte ^ lowByte;
        var checksumBits = Convert.ToString(checksum, 2).PadLeft(8, '0');
        return $"{prefixBits}{payloadBits}{checksumBits}";
    }

    private static DualPacketManifest BuildManifest(
        string runId,
        string attemptId,
        string timingAuthorityId,
        string triggerSessionId,
        DualPacketStreamReadResult shortRead,
        DualPacketStreamReadResult longRead)
    {
        return new DualPacketManifest
        {
            SchemaVersion = "mprr-dual-packet-manifest-v1",
            RunId = runId,
            AttemptId = attemptId,
            TransportSchemaId = "mprr-dual-packet-self-test-live-v1",
            PacketSchemaId = DualPacketTransportSchema.Current.ToString(),
            TimingAuthorityId = timingAuthorityId,
            TriggerSessionId = triggerSessionId,
            PrimaryAnalysisSurface = "short-packet",
            StreamArtifacts = new[]
            {
                BuildManifestArtifact(shortRead, "short.tdms", "primary-analysis-surface"),
                BuildManifestArtifact(longRead, "long.tdms", "payload-surface")
            }
        };
    }

    private static DualPacketStreamArtifact BuildManifestArtifact(
        DualPacketStreamReadResult readResult,
        string relativePath,
        string role)
    {
        return new DualPacketStreamArtifact
        {
            StreamId = DualPacketNames.GetStreamName(readResult.StreamId),
            RelativePath = relativePath,
            Role = role,
            PacketSchemaId = readResult.SchemaVersion.ToString(),
            WireClass = DualPacketNames.GetStreamName(readResult.StreamId),
            AuthoritativeOutcome = "authoritative",
            PacketCount = readResult.Packets.Length,
            FirstWriterLocalSequence = readResult.Packets[0].WriterLocalSequence,
            LastWriterLocalSequence = readResult.Packets[^1].WriterLocalSequence,
            FirstTimingTicks64 = readResult.Packets[0].TimingTicks64,
            LastTimingTicks64 = readResult.Packets[^1].TimingTicks64,
            PacketKindsRetained = readResult.Packets
                .Select(entry => DualPacketNames.GetPacketKindName(entry.PacketKind))
                .Distinct(StringComparer.Ordinal)
                .ToArray(),
            FrameRangeStart = readResult.Packets
                .Where(entry => entry.FrameId != 0)
                .Select(entry => entry.FrameId)
                .DefaultIfEmpty(0UL)
                .Min(),
            FrameRangeEnd = readResult.Packets
                .Where(entry => entry.FrameId != 0)
                .Select(entry => entry.FrameId)
                .DefaultIfEmpty(0UL)
                .Max()
        };
    }

    private static DualPacketCorrelationReceipt BuildCorrelationReceipt(
        string runId,
        string attemptId,
        string timingAuthorityId,
        string triggerSessionId,
        DualPacketStreamReadResult shortRead,
        DualPacketStreamReadResult longRead,
        IReadOnlyList<SyntheticFrame> frames)
    {
        var shortStart = shortRead.Packets.First().TimingTicks64;
        var longStart = longRead.Packets.First().TimingTicks64;
        return new DualPacketCorrelationReceipt
        {
            SchemaVersion = "mprr-dual-packet-correlation-receipt-v1",
            RunId = runId,
            AttemptId = attemptId,
            TimingAuthorityId = timingAuthorityId,
            TriggerSessionId = triggerSessionId,
            TriggerIssuedTick = 0,
            ShortWriterAcknowledgedTick = shortStart,
            LongWriterAcknowledgedTick = longStart,
            ShortWriterStartObservedTick = shortStart,
            LongWriterStartObservedTick = longStart,
            StartSkewTicks = (long)longStart - (long)shortStart,
            FrameCorrelations = frames.Select(frame =>
            {
                var shortFrameStart = shortRead.Packets.First(entry => entry.PacketKind == DualPacketKind.FrameStart && entry.FrameId == frame.FrameId);
                var shortFrameEnd = shortRead.Packets.First(entry => entry.PacketKind == DualPacketKind.FrameEnd && entry.FrameId == frame.FrameId);
                var longPayloads = longRead.Packets.Where(entry => entry.FrameId == frame.FrameId).ToArray();
                return new DualPacketFrameCorrelation
                {
                    FrameId = frame.FrameId,
                    PayloadDescriptorId = frame.PayloadDescriptorId,
                    ShortFrameStartPacketSequence = shortFrameStart.WriterLocalSequence,
                    LongPayloadPacketSequences = longPayloads.Select(entry => entry.WriterLocalSequence).ToArray(),
                    ShortFrameEndPacketSequence = shortFrameEnd.WriterLocalSequence,
                    CorrelationOutcome = longPayloads.Length > 0 ? "authoritative" : "failed",
                    DriftClass = longPayloads.Length > 0 ? "none" : "missing-long-payload"
                };
            }).ToArray()
        };
    }

    private static DualPacketAnalysisSummary BuildShortPacketAnalysisSummary(
        DualPacketStreamReadResult shortRead,
        IReadOnlyList<SyntheticFrame> frames)
    {
        return new DualPacketAnalysisSummary
        {
            SchemaVersion = "mprr-dual-packet-short-analysis-summary-v1",
            AnalysisSource = "short-packet",
            PacketCount = shortRead.Packets.Length,
            FrameCount = frames.Count,
            Timeline = shortRead.Packets.Select(entry => new DualPacketTimelineEntry
            {
                WriterLocalSequence = entry.WriterLocalSequence,
                PacketKind = DualPacketNames.GetPacketKindName(entry.PacketKind),
                FrameId = entry.FrameId,
                TimingTicks64 = entry.TimingTicks64,
                PayloadDescriptorId = entry.PayloadDescriptorId,
                Text = entry.PacketKind is DualPacketKind.OperatorAnnotation or DualPacketKind.UngovernedTrigger or DualPacketKind.GovernedTrigger
                    ? DualPacketPayloadCodec.DecodeTextPayload(entry.Payload).Text
                    : null
            }).ToArray(),
            CountsByPacketKind = shortRead.Packets
                .GroupBy(entry => DualPacketNames.GetPacketKindName(entry.PacketKind), StringComparer.Ordinal)
                .OrderBy(group => group.Key, StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal)
        };
    }

    private static DualPacketStreamSummary BuildStreamSummary(DualPacketStreamReadResult readResult)
    {
        return new DualPacketStreamSummary
        {
            StreamId = DualPacketNames.GetStreamName(readResult.StreamId),
            RelativePath = readResult.StreamId == DualPacketStreamId.ShortPacket ? "short.tdms" : "long.tdms",
            PacketCount = readResult.Packets.Length,
            FirstWriterLocalSequence = readResult.Packets[0].WriterLocalSequence,
            LastWriterLocalSequence = readResult.Packets[^1].WriterLocalSequence,
            FirstTimingTicks64 = readResult.Packets[0].TimingTicks64,
            LastTimingTicks64 = readResult.Packets[^1].TimingTicks64,
            PacketKindsRetained = readResult.Packets
                .Select(entry => DualPacketNames.GetPacketKindName(entry.PacketKind))
                .Distinct(StringComparer.Ordinal)
                .ToArray()
        };
    }

    private static void WriteJson<T>(string filePath, T value)
    {
        File.WriteAllText(filePath, $"{JsonSerializer.Serialize(value, JsonOptions.Value)}{Environment.NewLine}");
    }

    private static void FillBuffer(byte[] pixels, Rgba color)
    {
        for (var index = 0; index < pixels.Length; index += 4)
        {
            pixels[index] = color.R;
            pixels[index + 1] = color.G;
            pixels[index + 2] = color.B;
            pixels[index + 3] = color.A;
        }
    }

    private static void DrawFilledRect(byte[] pixels, int width, int height, Rect rect, Rgba color)
    {
        var clippedLeft = Math.Max(0, rect.X);
        var clippedTop = Math.Max(0, rect.Y);
        var clippedRight = Math.Min(width, rect.X + rect.Width);
        var clippedBottom = Math.Min(height, rect.Y + rect.Height);
        for (var y = clippedTop; y < clippedBottom; y += 1)
        {
            for (var x = clippedLeft; x < clippedRight; x += 1)
            {
                var offset = ((y * width) + x) * 4;
                pixels[offset] = color.R;
                pixels[offset + 1] = color.G;
                pixels[offset + 2] = color.B;
                pixels[offset + 3] = color.A;
            }
        }
    }

    private static void DrawBorderRect(byte[] pixels, int width, int height, Rect rect, Rgba color, int thickness)
    {
        DrawFilledRect(
            pixels,
            width,
            height,
            new Rect { X = rect.X, Y = rect.Y, Width = rect.Width, Height = thickness },
            color);
        DrawFilledRect(
            pixels,
            width,
            height,
            new Rect
            {
                X = rect.X,
                Y = rect.Y + rect.Height - thickness,
                Width = rect.Width,
                Height = thickness
            },
            color);
        DrawFilledRect(
            pixels,
            width,
            height,
            new Rect { X = rect.X, Y = rect.Y, Width = thickness, Height = rect.Height },
            color);
        DrawFilledRect(
            pixels,
            width,
            height,
            new Rect
            {
                X = rect.X + rect.Width - thickness,
                Y = rect.Y,
                Width = thickness,
                Height = rect.Height
            },
            color);
    }

    private static Rect ScaleRect(Rect rect, int logicalWidth, int logicalHeight)
    {
        var scaledX = (int)Math.Round(rect.X * (PreviewWidth / (double)logicalWidth), MidpointRounding.AwayFromZero);
        var scaledY = (int)Math.Round(rect.Y * (PreviewHeight / (double)logicalHeight), MidpointRounding.AwayFromZero);
        var scaledWidth = Math.Max(1, (int)Math.Round(rect.Width * (PreviewWidth / (double)logicalWidth), MidpointRounding.AwayFromZero));
        var scaledHeight = Math.Max(1, (int)Math.Round(rect.Height * (PreviewHeight / (double)logicalHeight), MidpointRounding.AwayFromZero));
        return new Rect
        {
            X = scaledX,
            Y = scaledY,
            Width = scaledWidth,
            Height = scaledHeight
        };
    }

    private static Rect InflateRect(Rect rect, int delta)
        => new()
        {
            X = rect.X - delta,
            Y = rect.Y - delta,
            Width = Math.Max(1, rect.Width + (delta * 2)),
            Height = Math.Max(1, rect.Height + (delta * 2))
        };

    private static Rgba ParseColor(string colorHex)
    {
        var normalized = colorHex.Trim().TrimStart('#');
        if (normalized.Length != 6)
        {
            return new Rgba(200, 200, 200, 255);
        }

        return new Rgba(
            Convert.ToByte(normalized.Substring(0, 2), 16),
            Convert.ToByte(normalized.Substring(2, 2), 16),
            Convert.ToByte(normalized.Substring(4, 2), 16),
            255);
    }
}

internal static class JsonOptions
{
    public static readonly JsonSerializerOptions Value = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
}

internal sealed record SelfTestSurfaceMetadata
{
    public string SchemaVersion { get; init; } = string.Empty;
    public string SurfaceId { get; init; } = string.Empty;
    public LogicalSurface LogicalSurface { get; init; } = new();
    public Fiducials Fiducials { get; init; } = new();
    public SurfaceElement[] Labels { get; init; } = Array.Empty<SurfaceElement>();
    public SurfaceElement[] ClickTargets { get; init; } = Array.Empty<SurfaceElement>();
    public SurfaceElement[] Triggers { get; init; } = Array.Empty<SurfaceElement>();

    public Rect BinaryStripRect => Fiducials.BinaryStripRect;
    public CornerMarker[] CornerMarkers => Fiducials.CornerMarkers;

    public static SelfTestSurfaceMetadata Load(string filePath)
    {
        var payload = JsonSerializer.Deserialize<SelfTestSurfaceMetadata>(
            File.ReadAllText(filePath),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        return payload ?? throw new InvalidOperationException($"Failed to deserialize {filePath}.");
    }
}

internal sealed record SelfTestGroundTruthLedger
{
    public string SchemaVersion { get; init; } = string.Empty;
    public TimingAuthority TimingAuthority { get; init; } = new();
    public BinaryStripEncoding BinaryStripEncoding { get; init; } = new();
    public EventSchedule EventSchedule { get; init; } = new();

    public string BinaryStripPrefix => BinaryStripEncoding.PrefixBits;
    public string[] EventIds => EventSchedule.InputDriven.Select(entry => entry.EventId).ToArray();

    public static SelfTestGroundTruthLedger Load(string filePath)
    {
        var payload = JsonSerializer.Deserialize<SelfTestGroundTruthLedger>(
            File.ReadAllText(filePath),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        return payload ?? throw new InvalidOperationException($"Failed to deserialize {filePath}.");
    }
}

internal sealed record LogicalSurface
{
    public int Width { get; init; }
    public int Height { get; init; }
}

internal sealed record Fiducials
{
    public Rect BinaryStripRect { get; init; } = new();
    public CornerMarker[] CornerMarkers { get; init; } = Array.Empty<CornerMarker>();
}

internal sealed record CornerMarker
{
    public string MarkerId { get; init; } = string.Empty;
    public Rect Rect { get; init; } = new();
    public int InsetPixels { get; init; }
}

internal sealed record SurfaceElement
{
    public string ElementId { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public string Color { get; init; } = "#CCCCCC";
    public string? KeyBinding { get; init; }
    public Rect Rect { get; init; } = new();
}

internal sealed record Rect
{
    public int X { get; init; }
    public int Y { get; init; }
    public int Width { get; init; }
    public int Height { get; init; }

    public int CenterX => X + (Width / 2);
    public int CenterY => Y + (Height / 2);
}

internal sealed record TimingAuthority
{
    public int TickIntervalMilliseconds { get; init; } = 10;
}

internal sealed record BinaryStripEncoding
{
    public string PrefixBits { get; init; } = "10100101";
}

internal sealed record EventSchedule
{
    public InputDrivenEvent[] InputDriven { get; init; } = Array.Empty<InputDrivenEvent>();
}

internal sealed record InputDrivenEvent
{
    public string EventId { get; init; } = string.Empty;
}

internal sealed record SyntheticFrame
{
    public ulong FrameId { get; init; }
    public ulong PayloadDescriptorId { get; init; }
    public ulong RelativeMilliseconds { get; init; }
    public uint RenderedCentiseconds { get; init; }
    public string ActiveLabelElementId { get; init; } = string.Empty;
    public string? HighlightedClickTargetId { get; init; }
    public string? HighlightedTriggerId { get; init; }
    public string? ActiveEventId { get; init; }
    public string? TriggerText { get; init; }
    public int? TriggerKeyCode { get; init; }
    public int CursorX { get; init; }
    public int CursorY { get; init; }
    public byte ClickButtonId { get; init; }
    public byte ClickTransitionId { get; init; }
    public uint LatestEventCode { get; init; }
    public byte[] FramePayload { get; set; } = Array.Empty<byte>();
}

internal readonly record struct Rgba(byte R, byte G, byte B, byte A);

internal sealed record DualPacketManifest
{
    public string SchemaVersion { get; init; } = string.Empty;
    public string RunId { get; init; } = string.Empty;
    public string AttemptId { get; init; } = string.Empty;
    public string TransportSchemaId { get; init; } = string.Empty;
    public string PacketSchemaId { get; init; } = string.Empty;
    public string TimingAuthorityId { get; init; } = string.Empty;
    public string TriggerSessionId { get; init; } = string.Empty;
    public string PrimaryAnalysisSurface { get; init; } = string.Empty;
    public DualPacketStreamArtifact[] StreamArtifacts { get; init; } = Array.Empty<DualPacketStreamArtifact>();
}

internal sealed record DualPacketStreamArtifact
{
    public string StreamId { get; init; } = string.Empty;
    public string RelativePath { get; init; } = string.Empty;
    public string Role { get; init; } = string.Empty;
    public string PacketSchemaId { get; init; } = string.Empty;
    public string WireClass { get; init; } = string.Empty;
    public string AuthoritativeOutcome { get; init; } = "authoritative";
    public int PacketCount { get; init; }
    public ulong FirstWriterLocalSequence { get; init; }
    public ulong LastWriterLocalSequence { get; init; }
    public ulong FirstTimingTicks64 { get; init; }
    public ulong LastTimingTicks64 { get; init; }
    public string[] PacketKindsRetained { get; init; } = Array.Empty<string>();
    public ulong FrameRangeStart { get; init; }
    public ulong FrameRangeEnd { get; init; }
}

internal sealed record DualPacketCorrelationReceipt
{
    public string SchemaVersion { get; init; } = string.Empty;
    public string RunId { get; init; } = string.Empty;
    public string AttemptId { get; init; } = string.Empty;
    public string TimingAuthorityId { get; init; } = string.Empty;
    public string TriggerSessionId { get; init; } = string.Empty;
    public ulong TriggerIssuedTick { get; init; }
    public ulong ShortWriterAcknowledgedTick { get; init; }
    public ulong LongWriterAcknowledgedTick { get; init; }
    public ulong ShortWriterStartObservedTick { get; init; }
    public ulong LongWriterStartObservedTick { get; init; }
    public long StartSkewTicks { get; init; }
    public DualPacketFrameCorrelation[] FrameCorrelations { get; init; } = Array.Empty<DualPacketFrameCorrelation>();
}

internal sealed record DualPacketFrameCorrelation
{
    public ulong FrameId { get; init; }
    public ulong PayloadDescriptorId { get; init; }
    public ulong ShortFrameStartPacketSequence { get; init; }
    public ulong[] LongPayloadPacketSequences { get; init; } = Array.Empty<ulong>();
    public ulong ShortFrameEndPacketSequence { get; init; }
    public string CorrelationOutcome { get; init; } = string.Empty;
    public string DriftClass { get; init; } = string.Empty;
}

internal sealed record DualPacketAnalysisSummary
{
    public string SchemaVersion { get; init; } = string.Empty;
    public string AnalysisSource { get; init; } = string.Empty;
    public int PacketCount { get; init; }
    public int FrameCount { get; init; }
    public Dictionary<string, int> CountsByPacketKind { get; init; } = new(StringComparer.Ordinal);
    public DualPacketTimelineEntry[] Timeline { get; init; } = Array.Empty<DualPacketTimelineEntry>();
}

internal sealed record DualPacketTimelineEntry
{
    public ulong WriterLocalSequence { get; init; }
    public string PacketKind { get; init; } = string.Empty;
    public ulong FrameId { get; init; }
    public ulong TimingTicks64 { get; init; }
    public ulong PayloadDescriptorId { get; init; }
    public string? Text { get; init; }
}

internal sealed record DualPacketLiveCaptureReceipt
{
    public string SchemaVersion { get; init; } = string.Empty;
    public string GeneratedAtUtc { get; init; } = string.Empty;
    public string AttemptId { get; init; } = string.Empty;
    public string RunId { get; init; } = string.Empty;
    public string OutputDirectory { get; init; } = string.Empty;
    public string SurfaceId { get; init; } = string.Empty;
    public string SurfaceMetadataPath { get; init; } = string.Empty;
    public string GroundTruthLedgerPath { get; init; } = string.Empty;
    public string TransportSchemaId { get; init; } = string.Empty;
    public string PacketSchemaId { get; init; } = string.Empty;
    public string TimingAuthorityId { get; init; } = string.Empty;
    public string TriggerSessionId { get; init; } = string.Empty;
    public string PrimaryAnalysisSurface { get; init; } = string.Empty;
    public string ManifestPath { get; init; } = string.Empty;
    public string CorrelationReceiptPath { get; init; } = string.Empty;
    public string ShortPacketAnalysisSummaryPath { get; init; } = string.Empty;
    public bool ReaderFriendlyShortPacketStream { get; init; }
    public string AuthoritativeOutcome { get; init; } = string.Empty;
    public DualPacketStreamSummary[] StreamSummaries { get; init; } = Array.Empty<DualPacketStreamSummary>();
    public DualPacketRenderedFrame[] RenderedFrames { get; init; } = Array.Empty<DualPacketRenderedFrame>();

    public object ConsoleSummary => new
    {
        attemptId = AttemptId,
        runId = RunId,
        outputDirectory = OutputDirectory,
        authoritativeOutcome = AuthoritativeOutcome,
        packetSchemaId = PacketSchemaId,
        primaryAnalysisSurface = PrimaryAnalysisSurface,
        shortPacketPath = "short.tdms",
        longPacketPath = "long.tdms",
        manifestPath = ManifestPath,
        correlationReceiptPath = CorrelationReceiptPath,
        shortPacketAnalysisSummaryPath = ShortPacketAnalysisSummaryPath,
        shortPacketCount = StreamSummaries.First(entry => entry.StreamId == "short-packet").PacketCount,
        longPacketCount = StreamSummaries.First(entry => entry.StreamId == "long-packet").PacketCount
    };
}

internal sealed record DualPacketStreamSummary
{
    public string StreamId { get; init; } = string.Empty;
    public string RelativePath { get; init; } = string.Empty;
    public int PacketCount { get; init; }
    public ulong FirstWriterLocalSequence { get; init; }
    public ulong LastWriterLocalSequence { get; init; }
    public ulong FirstTimingTicks64 { get; init; }
    public ulong LastTimingTicks64 { get; init; }
    public string[] PacketKindsRetained { get; init; } = Array.Empty<string>();
}

internal sealed record DualPacketRenderedFrame
{
    public ulong FrameId { get; init; }
    public ulong PayloadDescriptorId { get; init; }
    public ulong RelativeMilliseconds { get; init; }
    public uint RenderedCentiseconds { get; init; }
    public string ActiveLabelElementId { get; init; } = string.Empty;
    public string? ActiveEventId { get; init; }
}
