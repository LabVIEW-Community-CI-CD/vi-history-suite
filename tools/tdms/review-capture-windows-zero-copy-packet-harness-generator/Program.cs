using System.Security.Cryptography;
using System.Text;
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
    var receipt = PacketHarnessGenerator.Run(options);
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
    public string OutputDirectory { get; init; } = string.Empty;
    public string AttemptId { get; init; } = string.Empty;
    public string ScenarioId { get; init; } = string.Empty;
    public string? CompatibilityPlanPath { get; init; }
    public int BlockDurationMilliseconds { get; init; } = 45_000;
    public string PayloadCorpusId { get; init; } = "generated-synthetic-v1";
    public string? PayloadCorpusRoot { get; init; }
    public string PayloadSourceMode { get; init; } = "generated-synthetic";
    public string? ProfileConfigPath { get; init; }
    public string RateProfileId { get; init; } = "steady";

    public static string GetUsage()
        => string.Join(
            Environment.NewLine,
            "Usage: dotnet ReviewCaptureWindowsZeroCopyPacketHarnessGenerator.dll --output-dir <path> --attempt-id <id> --scenario <id> [--compatibility-plan-path <path>] [--block-duration-milliseconds <n>] [--payload-source-mode <generated-synthetic|prerecorded-playback>] [--payload-corpus-id <id>] [--payload-corpus-root <path>] [--profile-config-path <path>] [--rate-profile-id <id>] [--help]",
            string.Empty,
            "Retain one governed Windows zero-copy packet-harness generation scenario with source-short.tdms, source-long.tdms, one schedule artifact, and one harness manifest.");

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
                case "--output-dir":
                    parsed = parsed with { OutputDirectory = Path.GetFullPath(RequireValue("--output-dir")) };
                    break;
                case "--attempt-id":
                    parsed = parsed with { AttemptId = RequireValue("--attempt-id") };
                    break;
                case "--scenario":
                    parsed = parsed with { ScenarioId = RequireValue("--scenario") };
                    break;
                case "--compatibility-plan-path":
                    parsed = parsed with { CompatibilityPlanPath = Path.GetFullPath(RequireValue("--compatibility-plan-path")) };
                    break;
                case "--block-duration-milliseconds":
                    parsed = parsed with { BlockDurationMilliseconds = int.Parse(RequireValue("--block-duration-milliseconds")) };
                    break;
                case "--payload-corpus-id":
                    parsed = parsed with { PayloadCorpusId = RequireValue("--payload-corpus-id") };
                    break;
                case "--payload-corpus-root":
                    parsed = parsed with { PayloadCorpusRoot = Path.GetFullPath(RequireValue("--payload-corpus-root")) };
                    break;
                case "--payload-source-mode":
                    parsed = parsed with { PayloadSourceMode = RequireValue("--payload-source-mode") };
                    break;
                case "--profile-config-path":
                    parsed = parsed with { ProfileConfigPath = Path.GetFullPath(RequireValue("--profile-config-path")) };
                    break;
                case "--rate-profile-id":
                    parsed = parsed with { RateProfileId = RequireValue("--rate-profile-id") };
                    break;
                default:
                    throw new ArgumentException($"Unknown argument: {current}{Environment.NewLine}{Environment.NewLine}{GetUsage()}");
            }
        }

        if (parsed.HelpRequested)
        {
            return parsed;
        }

        if (string.IsNullOrWhiteSpace(parsed.OutputDirectory)
            || string.IsNullOrWhiteSpace(parsed.AttemptId)
            || string.IsNullOrWhiteSpace(parsed.ScenarioId))
        {
            throw new ArgumentException($"Missing one or more required arguments.{Environment.NewLine}{Environment.NewLine}{GetUsage()}");
        }

        var minimumBlockDurationMilliseconds = string.IsNullOrWhiteSpace(parsed.CompatibilityPlanPath) ? 1_000 : 10;
        if (parsed.BlockDurationMilliseconds < minimumBlockDurationMilliseconds)
        {
            throw new ArgumentException(
                $"Block duration milliseconds must be >= {minimumBlockDurationMilliseconds}, got {parsed.BlockDurationMilliseconds}.");
        }

        if (!string.Equals(parsed.PayloadSourceMode, "generated-synthetic", StringComparison.Ordinal)
            && !string.Equals(parsed.PayloadSourceMode, "prerecorded-playback", StringComparison.Ordinal))
        {
            throw new ArgumentException(
                $"Unsupported payload source mode '{parsed.PayloadSourceMode}'. Supported modes: generated-synthetic, prerecorded-playback.");
        }

        if (string.Equals(parsed.PayloadSourceMode, "prerecorded-playback", StringComparison.Ordinal)
            && string.IsNullOrWhiteSpace(parsed.PayloadCorpusRoot))
        {
            throw new ArgumentException(
                $"--payload-corpus-root is required for payload source mode '{parsed.PayloadSourceMode}'.");
        }

        if (!string.IsNullOrWhiteSpace(parsed.CompatibilityPlanPath)
            && !File.Exists(parsed.CompatibilityPlanPath))
        {
            throw new ArgumentException(
                $"Compatibility plan path does not exist: {parsed.CompatibilityPlanPath}.");
        }

        return parsed;
    }
}

internal static class PacketHarnessGenerator
{
    private const ulong TicksPerMillisecond = 10_000;
    private const uint PixelFormatRgba8888 = 0x52474241;
    private const byte BytesPerPixel = 4;
    private const int PreviewWidth = 160;
    private const int PreviewHeight = 90;

    public static PacketHarnessGeneratorReceipt Run(CliOptions options)
    {
        var scenario = string.IsNullOrWhiteSpace(options.CompatibilityPlanPath)
            ? ScenarioDefinition.Resolve(options.ScenarioId)
            : CompatibilityPlan.Load(options.CompatibilityPlanPath!);
        Directory.CreateDirectory(options.OutputDirectory);
        var rateProfile = RateProfileConfiguration.Load(options.ProfileConfigPath, options.RateProfileId, scenario);

        var scheduleId = $"{scenario.ScenarioId}-schedule-v1";
        var blockDurationTicks = checked((ulong)options.BlockDurationMilliseconds * TicksPerMillisecond);
        var frameBuild = BuildFrames(options, scenario, rateProfile, options.BlockDurationMilliseconds, blockDurationTicks);
        var frames = frameBuild.Frames;
        var shortSpecs = BuildShortPacketSpecs(frames);
        var longSpecs = BuildLongPacketSpecs(frames);

        var writer = new DualPacketStreamWriter();
        var shortPacketPath = Path.Combine(options.OutputDirectory, "source-short.tdms");
        var longPacketPath = Path.Combine(options.OutputDirectory, "source-long.tdms");
        var shortWrite = writer.WritePackets(shortPacketPath, DualPacketStreamId.ShortPacket, shortSpecs);
        var longWrite = writer.WritePackets(longPacketPath, DualPacketStreamId.LongPacket, longSpecs);

        var rateProfileSummary = BuildRateProfileSummary(rateProfile, frameBuild, shortWrite, longWrite);
        var schedule = BuildScheduleArtifact(options, scenario, scheduleId, blockDurationTicks, frames, shortWrite, longWrite, rateProfileSummary);
        var schedulePath = Path.Combine(options.OutputDirectory, "packet-harness-schedule.json");
        WriteJson(schedulePath, schedule);

        var manifest = BuildManifestArtifact(options, scenario, scheduleId, shortWrite, longWrite, frameBuild, rateProfileSummary);
        var manifestPath = Path.Combine(options.OutputDirectory, "packet-harness-manifest.json");
        WriteJson(manifestPath, manifest);

        var receipt = new PacketHarnessGeneratorReceipt
        {
            SchemaVersion = "mprr-windows-zero-copy-packet-harness-generator-receipt-v1",
            GeneratedAtUtc = DateTimeOffset.UtcNow.ToString("o"),
            AttemptId = options.AttemptId,
            ScenarioId = scenario.ScenarioId,
            OutputDirectory = options.OutputDirectory,
            AuthoritativeOutcome = shortWrite.Packets.Length > 0 && longWrite.Packets.Length > 0
                ? "authoritative"
                : "non-authoritative",
            PayloadCorpusId = options.PayloadCorpusId,
            PayloadSourceMode = frameBuild.PayloadSourceMode,
            ProfileConfigPath = options.ProfileConfigPath,
            RateProfileId = options.RateProfileId,
            BlockDurationMilliseconds = options.BlockDurationMilliseconds,
            PacketSchemaId = DualPacketTransportSchema.Current.ToString(),
            ShortPacketSourcePath = "source-short.tdms",
            LongPacketSourcePath = "source-long.tdms",
            SchedulePath = "packet-harness-schedule.json",
            ManifestPath = "packet-harness-manifest.json",
            CorpusManifestPath = frameBuild.PlaybackCorpus?.ManifestPath,
            VerifiedPlaybackFileCount = frameBuild.PlaybackCorpus?.VerifiedFiles.Length ?? 0,
            ExpectedShortPacketCount = shortWrite.Packets.Length,
            ExpectedLongPacketCount = longWrite.Packets.Length,
            ExpectedShortPacketBytes = shortWrite.Packets.Sum(static packet => (long)packet.PacketSpanBytes),
            ExpectedLongPacketBytes = longWrite.Packets.Sum(static packet => (long)packet.PacketSpanBytes),
            RateProfileSummary = rateProfileSummary,
            TriggerPlacements = schedule.TriggerPlacements
        };
        var receiptPath = Path.Combine(options.OutputDirectory, "windows-zero-copy-packet-harness-generator-receipt.json");
        WriteJson(receiptPath, receipt);
        return receipt with
        {
            ReceiptPath = Path.GetRelativePath(options.OutputDirectory, receiptPath).Replace('\\', '/')
        };
    }

    private static FrameBuildResult BuildFrames(
        CliOptions options,
        ScenarioDefinition scenario,
        RateProfileConfiguration rateProfile,
        int blockDurationMilliseconds,
        ulong blockDurationTicks)
        => string.Equals(options.PayloadSourceMode, "prerecorded-playback", StringComparison.Ordinal)
            ? BuildPlaybackFrames(options, scenario, rateProfile, blockDurationMilliseconds, blockDurationTicks)
            : BuildGeneratedFrames(options, scenario, rateProfile, blockDurationMilliseconds, blockDurationTicks);

    private static FrameBuildResult BuildGeneratedFrames(
        CliOptions options,
        ScenarioDefinition scenario,
        RateProfileConfiguration rateProfile,
        int blockDurationMilliseconds,
        ulong blockDurationTicks)
    {
        var frames = new List<HarnessFrame>(scenario.FramePlacements.Length);
        ulong frameId = 1;
        ulong payloadDescriptorId = 10_000;
        for (var index = 0; index < scenario.FramePlacements.Length; index += 1)
        {
            var placement = scenario.FramePlacements[index];
            var adjustedPlacement = ApplyRateProfileToPlacement(placement, index, rateProfile, blockDurationMilliseconds);
            var relativeMilliseconds = checked(placement.BlockId * blockDurationMilliseconds + placement.OffsetMilliseconds);
            var adjustedRelativeMilliseconds = checked(adjustedPlacement.BlockId * blockDurationMilliseconds + adjustedPlacement.OffsetMilliseconds);
            var timingTicks64 = checked((ulong)adjustedPlacement.BlockId * blockDurationTicks)
                + checked((ulong)adjustedPlacement.OffsetMilliseconds * TicksPerMillisecond);
            frames.Add(new HarnessFrame
            {
                FrameId = frameId++,
                PayloadDescriptorId = payloadDescriptorId++,
                LogicalBlockId = adjustedPlacement.BlockId,
                RelativeMilliseconds = adjustedRelativeMilliseconds,
                OffsetMilliseconds = adjustedPlacement.OffsetMilliseconds,
                BaseRelativeMilliseconds = relativeMilliseconds,
                TimingAdjustmentMilliseconds = adjustedPlacement.OffsetMilliseconds - placement.OffsetMilliseconds,
                TimingTicks64 = timingTicks64,
                TriggerEventId = placement.TriggerEventId,
                AnnotationPayloadBytes = placement.AnnotationPayloadBytes,
                TriggerText = placement.TriggerEventId is null
                    ? null
                    : $"{scenario.ScenarioId}-{placement.TriggerEventId}",
                FramePayload = ApplyPayloadPadding(
                    BuildSyntheticFramePayload(scenario.ScenarioId, adjustedPlacement.BlockId, adjustedPlacement.OffsetMilliseconds),
                    rateProfile,
                    $"{scenario.ScenarioId}|{index}")
            });
        }

        ValidateFrameOrdering(frames, scenario, rateProfile);

        return new FrameBuildResult
        {
            PayloadSourceMode = options.PayloadSourceMode,
            Frames = frames.ToArray(),
            PlaybackCorpus = null
        };
    }

    private static FrameBuildResult BuildPlaybackFrames(
        CliOptions options,
        ScenarioDefinition scenario,
        RateProfileConfiguration rateProfile,
        int blockDurationMilliseconds,
        ulong blockDurationTicks)
    {
        var selection = LoadPlaybackCorpusSelection(options, scenario);
        var frames = new List<HarnessFrame>(selection.Frames.Length);
        ulong frameId = 1;
        ulong payloadDescriptorId = 10_000;
        for (var index = 0; index < selection.Frames.Length; index += 1)
        {
            var frameDefinition = selection.Frames[index];
            var adjustedPlacement = ApplyRateProfileToPlacement(
                new FramePlacement(
                    frameDefinition.ExpectedLogicalBlockId,
                    frameDefinition.ExpectedOffsetMilliseconds,
                    frameDefinition.ExpectedTriggerEventId),
                index,
                rateProfile,
                blockDurationMilliseconds);
            var relativeMilliseconds = checked(frameDefinition.ExpectedLogicalBlockId * blockDurationMilliseconds + frameDefinition.ExpectedOffsetMilliseconds);
            var adjustedRelativeMilliseconds = checked(adjustedPlacement.BlockId * blockDurationMilliseconds + adjustedPlacement.OffsetMilliseconds);
            var timingTicks64 = checked((ulong)adjustedPlacement.BlockId * blockDurationTicks)
                + checked((ulong)adjustedPlacement.OffsetMilliseconds * TicksPerMillisecond);
            frames.Add(new HarnessFrame
            {
                FrameId = frameId++,
                PayloadDescriptorId = payloadDescriptorId++,
                LogicalBlockId = adjustedPlacement.BlockId,
                RelativeMilliseconds = adjustedRelativeMilliseconds,
                OffsetMilliseconds = adjustedPlacement.OffsetMilliseconds,
                BaseRelativeMilliseconds = relativeMilliseconds,
                TimingAdjustmentMilliseconds = adjustedPlacement.OffsetMilliseconds - frameDefinition.ExpectedOffsetMilliseconds,
                TimingTicks64 = timingTicks64,
                TriggerEventId = frameDefinition.ExpectedTriggerEventId,
                AnnotationPayloadBytes = 0,
                TriggerText = frameDefinition.TriggerText,
                FramePayload = ApplyPayloadPadding(
                    frameDefinition.PayloadData,
                    rateProfile,
                    $"{selection.CorpusId}|{scenario.ScenarioId}|{frameDefinition.FrameOrdinal}")
            });
        }

        ValidateFrameOrdering(frames, scenario, rateProfile);

        return new FrameBuildResult
        {
            PayloadSourceMode = options.PayloadSourceMode,
            Frames = frames.ToArray(),
            PlaybackCorpus = new PlaybackCorpusSummary
            {
                SchemaVersion = selection.SchemaVersion,
                CorpusId = selection.CorpusId,
                HashAlgorithm = selection.HashAlgorithm,
                CorpusRootPath = selection.CorpusRootPath,
                ManifestPath = selection.ManifestPath,
                ManifestSha256 = selection.ManifestSha256,
                VerifiedScenarioId = selection.VerifiedScenarioId,
                VerifiedFiles = selection.VerifiedFiles
            }
        };
    }

    private static PlaybackCorpusSelection LoadPlaybackCorpusSelection(
        CliOptions options,
        ScenarioDefinition scenario)
    {
        if (string.IsNullOrWhiteSpace(options.PayloadCorpusRoot))
        {
            throw new InvalidOperationException("Playback corpus root is required for prerecorded playback mode.");
        }

        var corpusRootPath = Path.GetFullPath(Path.Combine(options.PayloadCorpusRoot, options.PayloadCorpusId));
        if (!Directory.Exists(corpusRootPath))
        {
            throw new InvalidOperationException(
                $"Missing prerecorded playback corpus directory: {corpusRootPath}");
        }

        var manifestPath = Path.Combine(corpusRootPath, "corpus-manifest.json");
        if (!File.Exists(manifestPath))
        {
            throw new InvalidOperationException(
                $"Missing prerecorded playback corpus manifest: {manifestPath}");
        }

        var manifestBytes = File.ReadAllBytes(manifestPath);
        var manifest = JsonSerializer.Deserialize<PlaybackCorpusManifest>(manifestBytes, JsonOptions.Value)
            ?? throw new InvalidOperationException($"Failed to deserialize prerecorded playback corpus manifest: {manifestPath}");

        if (!string.Equals(manifest.SchemaVersion, "mprr-windows-zero-copy-packet-harness-playback-corpus-v1", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Unsupported prerecorded playback corpus schema '{manifest.SchemaVersion}' in {manifestPath}.");
        }

        if (!string.Equals(manifest.CorpusId, options.PayloadCorpusId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Playback corpus id '{manifest.CorpusId}' does not match requested corpus id '{options.PayloadCorpusId}'.");
        }

        var scenarioManifest = manifest.Scenarios.SingleOrDefault(candidate =>
            string.Equals(candidate.ScenarioId, scenario.ScenarioId, StringComparison.Ordinal))
            ?? throw new InvalidOperationException(
                $"Playback corpus '{manifest.CorpusId}' does not describe scenario '{scenario.ScenarioId}'.");

        if (scenarioManifest.Frames.Length != scenario.FramePlacements.Length)
        {
            throw new InvalidOperationException(
                $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' frame count {scenarioManifest.Frames.Length} does not match governed frame count {scenario.FramePlacements.Length}.");
        }

        var verifiedFrames = new List<VerifiedPlaybackFrame>(scenarioManifest.Frames.Length);
        var verifiedFiles = new Dictionary<string, VerifiedPlaybackFile>(StringComparer.Ordinal);
        for (var index = 0; index < scenario.FramePlacements.Length; index += 1)
        {
            var placement = scenario.FramePlacements[index];
            var frame = scenarioManifest.Frames[index];
            var expectedFrameOrdinal = index + 1;
            if (frame.FrameOrdinal != expectedFrameOrdinal)
            {
                throw new InvalidOperationException(
                    $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' frame ordinal {frame.FrameOrdinal} does not match expected ordinal {expectedFrameOrdinal}.");
            }

            if (frame.ExpectedLogicalBlockId != placement.BlockId
                || frame.ExpectedOffsetMilliseconds != placement.OffsetMilliseconds
                || !string.Equals(frame.ExpectedTriggerEventId, placement.TriggerEventId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' frame {frame.FrameOrdinal} does not match the governed placement definition.");
            }

            if (placement.TriggerEventId is null && frame.TriggerText is not null)
            {
                throw new InvalidOperationException(
                    $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' frame {frame.FrameOrdinal} unexpectedly retained trigger text for a non-trigger frame.");
            }

            if (placement.TriggerEventId is not null && string.IsNullOrWhiteSpace(frame.TriggerText))
            {
                throw new InvalidOperationException(
                    $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' frame {frame.FrameOrdinal} is missing trigger text for governed trigger '{placement.TriggerEventId}'.");
            }

            if (string.IsNullOrWhiteSpace(frame.PayloadPath)
                || string.IsNullOrWhiteSpace(frame.PayloadSha256)
                || frame.PayloadBytes <= 0)
            {
                throw new InvalidOperationException(
                    $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' frame {frame.FrameOrdinal} is not fully described by the retained corpus manifest.");
            }

            var payloadPath = ResolvePathWithinRoot(corpusRootPath, frame.PayloadPath);
            if (!File.Exists(payloadPath))
            {
                throw new InvalidOperationException(
                    $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' referenced missing payload file '{frame.PayloadPath}'.");
            }

            var payloadData = File.ReadAllBytes(payloadPath);
            if (payloadData.Length != frame.PayloadBytes)
            {
                throw new InvalidOperationException(
                    $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' payload '{frame.PayloadPath}' bytes {payloadData.Length} do not match retained bytes {frame.PayloadBytes}.");
            }

            var payloadSha256 = ComputeSha256(payloadData);
            if (!string.Equals(payloadSha256, frame.PayloadSha256, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Playback corpus '{manifest.CorpusId}' scenario '{scenario.ScenarioId}' payload '{frame.PayloadPath}' hash drifted from the retained manifest.");
            }

            verifiedFrames.Add(new VerifiedPlaybackFrame
            {
                FrameOrdinal = frame.FrameOrdinal,
                ExpectedLogicalBlockId = frame.ExpectedLogicalBlockId,
                ExpectedOffsetMilliseconds = frame.ExpectedOffsetMilliseconds,
                ExpectedTriggerEventId = frame.ExpectedTriggerEventId,
                TriggerText = frame.TriggerText,
                PayloadPath = frame.PayloadPath,
                PayloadSha256 = frame.PayloadSha256,
                PayloadBytes = frame.PayloadBytes,
                PayloadData = payloadData
            });

            verifiedFiles.TryAdd(frame.PayloadPath, new VerifiedPlaybackFile
            {
                RelativePath = frame.PayloadPath,
                PayloadBytes = frame.PayloadBytes,
                PayloadSha256 = frame.PayloadSha256
            });
        }

        return new PlaybackCorpusSelection
        {
            SchemaVersion = manifest.SchemaVersion,
            CorpusId = manifest.CorpusId,
            HashAlgorithm = manifest.HashAlgorithm,
            CorpusRootPath = corpusRootPath,
            ManifestPath = manifestPath,
            ManifestSha256 = ComputeSha256(manifestBytes),
            VerifiedScenarioId = scenario.ScenarioId,
            Frames = verifiedFrames.ToArray(),
            VerifiedFiles = verifiedFiles.Values.OrderBy(static file => file.RelativePath, StringComparer.Ordinal).ToArray()
        };
    }

    private static string ResolvePathWithinRoot(string rootPath, string relativePath)
    {
        var fullRootPath = Path.GetFullPath(rootPath);
        var candidatePath = Path.GetFullPath(Path.Combine(fullRootPath, relativePath));
        var rootPrefix = fullRootPath.EndsWith(Path.DirectorySeparatorChar)
            ? fullRootPath
            : fullRootPath + Path.DirectorySeparatorChar;
        if (!candidatePath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Playback corpus file path '{relativePath}' escapes the governed corpus root '{fullRootPath}'.");
        }

        return candidatePath;
    }

    private static string ComputeSha256(byte[] data)
        => Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();

    private static FramePlacement ApplyRateProfileToPlacement(
        FramePlacement placement,
        int frameIndex,
        RateProfileConfiguration rateProfile,
        int blockDurationMilliseconds)
    {
        var timingAdjustment = rateProfile.GetTimingAdjustment(frameIndex);
        var adjustedOffset = checked(placement.OffsetMilliseconds + timingAdjustment);
        if (adjustedOffset < 0 || adjustedOffset >= blockDurationMilliseconds)
        {
            throw new InvalidOperationException(
                $"Rate profile '{rateProfile.ProfileName}' adjusted frame {frameIndex + 1} outside the governed block duration.");
        }

        return placement with { OffsetMilliseconds = adjustedOffset };
    }

    private static byte[] ApplyPayloadPadding(
        byte[] payload,
        RateProfileConfiguration rateProfile,
        string fillerSeed)
    {
        if (rateProfile.PayloadPaddingBytes <= payload.Length)
        {
            return payload;
        }

        var padded = new byte[rateProfile.PayloadPaddingBytes];
        Buffer.BlockCopy(payload, 0, padded, 0, payload.Length);
        var filler = Encoding.UTF8.GetBytes($"|rate-profile={rateProfile.ProfileName}|{fillerSeed}|");
        for (var cursor = payload.Length; cursor < padded.Length; cursor += filler.Length)
        {
            var copyLength = Math.Min(filler.Length, padded.Length - cursor);
            Buffer.BlockCopy(filler, 0, padded, cursor, copyLength);
        }

        return padded;
    }

    private static void ValidateFrameOrdering(
        IReadOnlyList<HarnessFrame> frames,
        ScenarioDefinition scenario,
        RateProfileConfiguration rateProfile)
    {
        for (var index = 1; index < frames.Count; index += 1)
        {
            if (frames[index].TimingTicks64 <= frames[index - 1].TimingTicks64)
            {
                throw new InvalidOperationException(
                    $"Rate profile '{rateProfile.ProfileName}' broke chronological frame ordering for scenario '{scenario.ScenarioId}'.");
            }
        }
    }

    private static RateProfileSummary BuildRateProfileSummary(
        RateProfileConfiguration rateProfile,
        FrameBuildResult frameBuild,
        DualPacketStreamWriteResult shortWrite,
        DualPacketStreamWriteResult longWrite)
    {
        var firstTick = shortWrite.Packets.Concat(longWrite.Packets).Min(static packet => packet.TimingTicks64);
        var lastTick = shortWrite.Packets.Concat(longWrite.Packets).Max(static packet => packet.TimingTicks64);
        var realizedWindowMilliseconds = Math.Max(1.0d, (lastTick - firstTick) / (double)TicksPerMillisecond);
        var shortPacketBytes = shortWrite.Packets.Sum(static packet => (double)packet.PacketSpanBytes);
        var longPacketBytes = longWrite.Packets.Sum(static packet => (double)packet.PacketSpanBytes);
        return new RateProfileSummary
        {
            ProfileName = rateProfile.ProfileName,
            ProfileClass = rateProfile.ProfileClass,
            Description = rateProfile.Description,
            ProfileConfigPath = rateProfile.ProfileConfigPath,
            PayloadPaddingBytes = rateProfile.PayloadPaddingBytes,
            TimingAdjustmentsMilliseconds = frameBuild.Frames.Select(static frame => frame.TimingAdjustmentMilliseconds).ToArray(),
            AppliedFrameCount = frameBuild.Frames.Length,
            MinimumTimingAdjustmentMilliseconds = frameBuild.Frames.Min(static frame => frame.TimingAdjustmentMilliseconds),
            MaximumTimingAdjustmentMilliseconds = frameBuild.Frames.Max(static frame => frame.TimingAdjustmentMilliseconds),
            MaxAbsoluteTimingAdjustmentMilliseconds = frameBuild.Frames.Max(static frame => Math.Abs(frame.TimingAdjustmentMilliseconds)),
            RealizedWindowMilliseconds = realizedWindowMilliseconds,
            RealizedShortPacketByteRateBytesPerSecond = shortPacketBytes * 1_000.0d / realizedWindowMilliseconds,
            RealizedLongPacketByteRateBytesPerSecond = longPacketBytes * 1_000.0d / realizedWindowMilliseconds
        };
    }

    private static DualPacketSpec[] BuildShortPacketSpecs(IReadOnlyList<HarnessFrame> frames)
    {
        var packets = new List<DualPacketSpec>(frames.Count * 4);
        ulong sequence = 1;
        foreach (var frame in frames)
        {
            packets.Add(new DualPacketSpec
            {
                StreamId = DualPacketStreamId.ShortPacket,
                PacketKind = DualPacketKind.FrameStart,
                Flags = DualPacketFlags.FrameBound,
                WriterLocalSequence = sequence++,
                TimingTicks64 = frame.TimingTicks64,
                FrameId = frame.FrameId,
                PayloadDescriptorId = frame.PayloadDescriptorId,
                Payload = DualPacketPayloadCodec.EncodeFrameStartPayload(
                    PreviewWidth,
                    PreviewHeight,
                    PixelFormatRgba8888,
                    BytesPerPixel)
            });

            if (frame.AnnotationPayloadBytes > 0)
            {
                var filler = new string('A', frame.AnnotationPayloadBytes);
                packets.Add(new DualPacketSpec
                {
                    StreamId = DualPacketStreamId.ShortPacket,
                    PacketKind = DualPacketKind.OperatorAnnotation,
                    Flags = 0,
                    WriterLocalSequence = sequence++,
                    TimingTicks64 = frame.TimingTicks64,
                    FrameId = frame.FrameId,
                    PayloadDescriptorId = frame.PayloadDescriptorId,
                    Payload = DualPacketPayloadCodec.EncodeTextPayload(
                        checked((uint)frame.FrameId),
                        0x41u,
                        frame.FrameId,
                        $"compat-annotation|frame={frame.FrameId}|{filler}")
                });
            }

            if (frame.TriggerEventId is not null && frame.TriggerText is not null)
            {
                packets.Add(new DualPacketSpec
                {
                    StreamId = DualPacketStreamId.ShortPacket,
                    PacketKind = DualPacketKind.GovernedTrigger,
                    Flags = 0,
                    WriterLocalSequence = sequence++,
                    TimingTicks64 = frame.TimingTicks64,
                    FrameId = frame.FrameId,
                    PayloadDescriptorId = frame.PayloadDescriptorId,
                    Payload = DualPacketPayloadCodec.EncodeTextPayload(
                        checked((uint)frame.FrameId),
                        0x47u,
                        frame.FrameId,
                        frame.TriggerText)
                });
            }

            packets.Add(new DualPacketSpec
            {
                StreamId = DualPacketStreamId.ShortPacket,
                PacketKind = DualPacketKind.FrameEnd,
                Flags = DualPacketFlags.FrameBound,
                WriterLocalSequence = sequence++,
                TimingTicks64 = frame.TimingTicks64,
                FrameId = frame.FrameId,
                PayloadDescriptorId = frame.PayloadDescriptorId,
                Payload = DualPacketPayloadCodec.EncodeFrameEndPayload(
                    frame.TriggerEventId is null ? 0u : 1u,
                    frame.TriggerEventId is null ? (ushort)0 : (ushort)1,
                    frame.TriggerEventId is null ? (ushort)0 : (ushort)1,
                    checked((uint)(frame.RelativeMilliseconds / 10)),
                    frame.TriggerEventId is null ? 0u : 1u)
            });
        }

        return packets.ToArray();
    }

    private static DualPacketSpec[] BuildLongPacketSpecs(IReadOnlyList<HarnessFrame> frames)
    {
        var packets = new List<DualPacketSpec>(frames.Count);
        ulong sequence = 1;
        foreach (var frame in frames)
        {
            packets.Add(new DualPacketSpec
            {
                StreamId = DualPacketStreamId.LongPacket,
                PacketKind = DualPacketKind.FramePayload,
                Flags = 0,
                WriterLocalSequence = sequence++,
                TimingTicks64 = frame.TimingTicks64,
                FrameId = frame.FrameId,
                PayloadDescriptorId = frame.PayloadDescriptorId,
                Payload = frame.FramePayload
            });
        }

        return packets.ToArray();
    }

    private static byte[] BuildSyntheticFramePayload(string scenarioId, long blockId, int offsetMilliseconds)
    {
        var text = $"{scenarioId}|block={blockId}|offset-ms={offsetMilliseconds}";
        return Encoding.UTF8.GetBytes(text.PadRight(512, '#'));
    }

    private static PacketHarnessScheduleArtifact BuildScheduleArtifact(
        CliOptions options,
        ScenarioDefinition scenario,
        string scheduleId,
        ulong blockDurationTicks,
        IReadOnlyList<HarnessFrame> frames,
        DualPacketStreamWriteResult shortWrite,
        DualPacketStreamWriteResult longWrite,
        RateProfileSummary rateProfileSummary)
    {
        var triggerPlacements = shortWrite.Packets
            .Where(packet => packet.PacketKind == DualPacketKind.GovernedTrigger)
            .Join(
                frames.Where(frame => frame.TriggerEventId is not null),
                packet => packet.FrameId,
                frame => frame.FrameId,
                (packet, frame) => new TriggerPlacement
                {
                    EventId = frame.TriggerEventId!,
                    FrameId = frame.FrameId,
                    LogicalBlockId = frame.LogicalBlockId,
                    RelativeMilliseconds = frame.RelativeMilliseconds,
                    TimingTicks64 = packet.TimingTicks64,
                    ShortWriterLocalSequence = packet.WriterLocalSequence
                })
            .ToArray();

        var packetPlacementPlan = shortWrite.Packets
            .Select(packet => BuildPacketPlacement(packet, frames))
            .Concat(longWrite.Packets.Select(packet => BuildPacketPlacement(packet, frames)))
            .OrderBy(entry => entry.TimingTicks64)
            .ThenBy(entry => entry.StreamId)
            .ThenBy(entry => entry.WriterLocalSequence)
            .ToArray();

        return new PacketHarnessScheduleArtifact
        {
            SchemaVersion = "mprr-windows-zero-copy-packet-harness-schedule-v1",
            ScheduleId = scheduleId,
            ScenarioId = scenario.ScenarioId,
            ScenarioDescription = scenario.Description,
            BlockDurationMilliseconds = options.BlockDurationMilliseconds,
            TimingBase = new TimingBase
            {
                ClockClass = "synthetic-monotonic-100ns",
                RetainedTickField = "timingTicks64",
                TicksPerMillisecond = TicksPerMillisecond
            },
            PacketPlacementPlan = packetPlacementPlan,
            TriggerPlacements = triggerPlacements,
            ExpectedShortPacketCount = shortWrite.Packets.Length,
            ExpectedLongPacketCount = longWrite.Packets.Length,
            ExpectedShortPacketBytes = shortWrite.Packets.Sum(static packet => (long)packet.PacketSpanBytes),
            ExpectedLongPacketBytes = longWrite.Packets.Sum(static packet => (long)packet.PacketSpanBytes),
            SourceArtifactHints = new SourceArtifactHints
            {
                ShortPacketSourcePath = "source-short.tdms",
                LongPacketSourcePath = "source-long.tdms"
            },
            GoverningRequirement = "MPRR-REQ-116",
            GoverningAdr = "ADR-0032",
            TriggerWindowClass = scenario.TriggerWindowClass,
            SyntheticFrameCount = frames.Count,
            RateProfileSummary = rateProfileSummary
        };
    }

    private static PacketPlacement BuildPacketPlacement(
        DualPacketRecord packet,
        IReadOnlyList<HarnessFrame> frames)
    {
        var frame = frames.FirstOrDefault(candidate => candidate.FrameId == packet.FrameId);
        return new PacketPlacement
        {
            StreamId = DualPacketNames.GetStreamName(packet.StreamId),
            PacketKind = DualPacketNames.GetPacketKindName(packet.PacketKind),
            WriterLocalSequence = packet.WriterLocalSequence,
            TimingTicks64 = packet.TimingTicks64,
            FrameId = packet.FrameId,
            PayloadDescriptorId = packet.PayloadDescriptorId,
            PayloadBytes = packet.PayloadBytes,
            LogicalBlockId = frame?.LogicalBlockId ?? -1,
            RelativeMilliseconds = frame?.RelativeMilliseconds ?? -1
        };
    }

    private static PacketHarnessManifestArtifact BuildManifestArtifact(
        CliOptions options,
        ScenarioDefinition scenario,
        string scheduleId,
        DualPacketStreamWriteResult shortWrite,
        DualPacketStreamWriteResult longWrite,
        FrameBuildResult frameBuild,
        RateProfileSummary rateProfileSummary)
        => new()
        {
            SchemaVersion = "mprr-windows-zero-copy-packet-harness-manifest-v1",
            AttemptId = options.AttemptId,
            ScenarioId = scenario.ScenarioId,
            ScheduleId = scheduleId,
            PayloadCorpusId = options.PayloadCorpusId,
            RateProfileId = options.RateProfileId,
            PayloadSourceMode = frameBuild.PayloadSourceMode,
            ExpectedShortPacketCount = shortWrite.Packets.Length,
            ExpectedLongPacketCount = longWrite.Packets.Length,
            ExpectedShortPacketBytes = shortWrite.Packets.Sum(static packet => (long)packet.PacketSpanBytes),
            ExpectedLongPacketBytes = longWrite.Packets.Sum(static packet => (long)packet.PacketSpanBytes),
            PlannedArtifacts = new PlannedArtifacts
            {
                ShortPacketSourcePath = "source-short.tdms",
                LongPacketSourcePath = "source-long.tdms",
                SchedulePath = "packet-harness-schedule.json"
            },
            PlaybackCorpus = frameBuild.PlaybackCorpus,
            RateProfileSummary = rateProfileSummary
        };

    private static void WriteJson<TValue>(string filePath, TValue value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(filePath))!);
        File.WriteAllText(filePath, JsonSerializer.Serialize(value, JsonOptions.Value) + Environment.NewLine);
    }
}

internal sealed record ScenarioDefinition
{
    public required string ScenarioId { get; init; }
    public required string Description { get; init; }
    public required string TriggerWindowClass { get; init; }
    public required FramePlacement[] FramePlacements { get; init; }

    public static readonly IReadOnlyDictionary<string, ScenarioDefinition> All =
        new Dictionary<string, ScenarioDefinition>(StringComparer.Ordinal)
        {
            ["warmup-current-plus-next"] = new ScenarioDefinition
            {
                ScenarioId = "warmup-current-plus-next",
                Description = "Warm-up window with only current and next logical blocks materialized before the trigger.",
                TriggerWindowClass = "warmup",
                FramePlacements = new[]
                {
                    new FramePlacement(0, 5_000, null),
                    new FramePlacement(0, 22_000, "warmup-trigger"),
                    new FramePlacement(1, 8_000, null),
                    new FramePlacement(1, 28_000, null)
                }
            },
            ["steady-state-current-plus-next"] = new ScenarioDefinition
            {
                ScenarioId = "steady-state-current-plus-next",
                Description = "Steady-state trigger in the middle of one already-established active block.",
                TriggerWindowClass = "steady-state",
                FramePlacements = new[]
                {
                    new FramePlacement(1, 5_000, null),
                    new FramePlacement(2, 6_000, null),
                    new FramePlacement(2, 22_500, "steady-state-trigger"),
                    new FramePlacement(2, 33_000, null),
                    new FramePlacement(3, 10_000, null)
                }
            },
            ["late-steady-state-current-plus-next"] = new ScenarioDefinition
            {
                ScenarioId = "late-steady-state-current-plus-next",
                Description = "Late trigger near the tail of one steady-state active block while the next block is still mandatory persistence.",
                TriggerWindowClass = "late-steady-state",
                FramePlacements = new[]
                {
                    new FramePlacement(4, 4_000, null),
                    new FramePlacement(5, 6_000, null),
                    new FramePlacement(5, 43_000, "late-steady-state-trigger"),
                    new FramePlacement(5, 44_200, null),
                    new FramePlacement(6, 9_000, null)
                }
            },
            ["boundary-crossing-current-plus-next"] = new ScenarioDefinition
            {
                ScenarioId = "boundary-crossing-current-plus-next",
                Description = "Boundary-crossing trigger just before the next logical block begins.",
                TriggerWindowClass = "boundary-crossing",
                FramePlacements = new[]
                {
                    new FramePlacement(6, 4_000, null),
                    new FramePlacement(7, 44_900, "boundary-crossing-trigger"),
                    new FramePlacement(8, 200, null),
                    new FramePlacement(8, 7_500, null)
                }
            }
        };

    public static ScenarioDefinition Resolve(string scenarioId)
        => All.TryGetValue(scenarioId, out var scenario)
            ? scenario
            : throw new ArgumentException(
                $"Unsupported scenario '{scenarioId}'. Supported scenarios: {string.Join(", ", All.Keys.OrderBy(static key => key, StringComparer.Ordinal))}.");
}

internal sealed record FramePlacement(long BlockId, int OffsetMilliseconds, string? TriggerEventId, int AnnotationPayloadBytes = 0);

internal sealed record CompatibilityPlan
{
    public const string ExpectedSchemaVersion = "mprr-windows-zero-copy-packet-harness-compatibility-plan-v1";

    public static ScenarioDefinition Load(string planPath)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(planPath));
        var root = document.RootElement;
        var schemaVersion = root.GetProperty("schemaVersion").GetString() ?? string.Empty;
        if (!string.Equals(schemaVersion, ExpectedSchemaVersion, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Unsupported compatibility plan schema '{schemaVersion}'. Expected '{ExpectedSchemaVersion}'.");
        }

        var framePlacements = root
            .GetProperty("framePlacements")
            .EnumerateArray()
            .Select(
                element => new FramePlacement(
                    element.GetProperty("blockId").GetInt64(),
                    element.GetProperty("offsetMilliseconds").GetInt32(),
                    element.TryGetProperty("triggerEventId", out var triggerProperty) && triggerProperty.ValueKind != JsonValueKind.Null
                        ? triggerProperty.GetString()
                        : null,
                    element.TryGetProperty("annotationPayloadBytes", out var annotationProperty)
                        ? annotationProperty.GetInt32()
                        : 0))
            .ToArray();

        if (framePlacements.Length == 0)
        {
            throw new InvalidOperationException("Compatibility plan must retain at least one frame placement.");
        }

        return new ScenarioDefinition
        {
            ScenarioId = root.GetProperty("scenarioId").GetString() ?? string.Empty,
            Description = root.GetProperty("description").GetString() ?? string.Empty,
            TriggerWindowClass = root.GetProperty("triggerWindowClass").GetString() ?? string.Empty,
            FramePlacements = framePlacements
        };
    }
}

internal sealed record HarnessFrame
{
    public required ulong FrameId { get; init; }
    public required ulong PayloadDescriptorId { get; init; }
    public required long LogicalBlockId { get; init; }
    public required long RelativeMilliseconds { get; init; }
    public required int OffsetMilliseconds { get; init; }
    public required long BaseRelativeMilliseconds { get; init; }
    public required int TimingAdjustmentMilliseconds { get; init; }
    public required ulong TimingTicks64 { get; init; }
    public string? TriggerEventId { get; init; }
    public required int AnnotationPayloadBytes { get; init; }
    public string? TriggerText { get; init; }
    public required byte[] FramePayload { get; init; }
}

internal sealed record RateProfileConfiguration
{
    public required string ProfileName { get; init; }
    public required string ProfileClass { get; init; }
    public required string Description { get; init; }
    public string? ProfileConfigPath { get; init; }
    public required int PayloadPaddingBytes { get; init; }
    public required int[] TimingAdjustmentsMilliseconds { get; init; }

    public int GetTimingAdjustment(int frameIndex)
        => frameIndex < TimingAdjustmentsMilliseconds.Length
            ? TimingAdjustmentsMilliseconds[frameIndex]
            : 0;

    public static RateProfileConfiguration Load(
        string? profileConfigPath,
        string rateProfileId,
        ScenarioDefinition scenario)
    {
        if (string.IsNullOrWhiteSpace(profileConfigPath))
        {
            return new RateProfileConfiguration
            {
                ProfileName = rateProfileId,
                ProfileClass = "packet-rate",
                Description = "Default governed steady packet-harness profile.",
                ProfileConfigPath = null,
                PayloadPaddingBytes = 0,
                TimingAdjustmentsMilliseconds = Enumerable.Repeat(0, scenario.FramePlacements.Length).ToArray()
            };
        }

        if (!File.Exists(profileConfigPath))
        {
            throw new InvalidOperationException(
                $"Missing rate profile config path: {profileConfigPath}");
        }

        var config = JsonSerializer.Deserialize<RateProfileConfigurationFile>(
            File.ReadAllText(profileConfigPath),
            JsonOptions.Value)
            ?? throw new InvalidOperationException(
                $"Failed to deserialize rate profile config at {profileConfigPath}.");

        if (!string.Equals(config.SchemaVersion, "mprr-windows-zero-copy-packet-harness-rate-profile-v1", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Unsupported rate profile config schema '{config.SchemaVersion}' at {profileConfigPath}.");
        }

        if (!string.Equals(config.ProfileName, rateProfileId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Rate profile config '{config.ProfileName}' does not match requested rate profile '{rateProfileId}'.");
        }

        if (config.PayloadPaddingBytes < 0)
        {
            throw new InvalidOperationException(
                $"Rate profile '{config.ProfileName}' payload padding must be >= 0.");
        }

        if (config.TimingAdjustmentsMilliseconds.Length != scenario.FramePlacements.Length)
        {
            throw new InvalidOperationException(
                $"Rate profile '{config.ProfileName}' timing adjustments length {config.TimingAdjustmentsMilliseconds.Length} does not match governed frame count {scenario.FramePlacements.Length}.");
        }

        return new RateProfileConfiguration
        {
            ProfileName = config.ProfileName,
            ProfileClass = config.ProfileClass,
            Description = config.Description,
            ProfileConfigPath = profileConfigPath,
            PayloadPaddingBytes = config.PayloadPaddingBytes,
            TimingAdjustmentsMilliseconds = config.TimingAdjustmentsMilliseconds
        };
    }
}

internal sealed record RateProfileConfigurationFile
{
    public required string SchemaVersion { get; init; }
    public required string ProfileName { get; init; }
    public required string ProfileClass { get; init; }
    public required string Description { get; init; }
    public required int PayloadPaddingBytes { get; init; }
    public required int[] TimingAdjustmentsMilliseconds { get; init; }
}

internal sealed record RateProfileSummary
{
    public required string ProfileName { get; init; }
    public required string ProfileClass { get; init; }
    public required string Description { get; init; }
    public string? ProfileConfigPath { get; init; }
    public required int PayloadPaddingBytes { get; init; }
    public required int[] TimingAdjustmentsMilliseconds { get; init; }
    public required int AppliedFrameCount { get; init; }
    public required int MinimumTimingAdjustmentMilliseconds { get; init; }
    public required int MaximumTimingAdjustmentMilliseconds { get; init; }
    public required int MaxAbsoluteTimingAdjustmentMilliseconds { get; init; }
    public required double RealizedWindowMilliseconds { get; init; }
    public required double RealizedShortPacketByteRateBytesPerSecond { get; init; }
    public required double RealizedLongPacketByteRateBytesPerSecond { get; init; }
}

internal sealed record FrameBuildResult
{
    public required string PayloadSourceMode { get; init; }
    public required HarnessFrame[] Frames { get; init; }
    public PlaybackCorpusSummary? PlaybackCorpus { get; init; }
}

internal sealed record PlaybackCorpusSelection
{
    public required string SchemaVersion { get; init; }
    public required string CorpusId { get; init; }
    public required string HashAlgorithm { get; init; }
    public required string CorpusRootPath { get; init; }
    public required string ManifestPath { get; init; }
    public required string ManifestSha256 { get; init; }
    public required string VerifiedScenarioId { get; init; }
    public required VerifiedPlaybackFrame[] Frames { get; init; }
    public required VerifiedPlaybackFile[] VerifiedFiles { get; init; }
}

internal sealed record PlaybackCorpusSummary
{
    public required string SchemaVersion { get; init; }
    public required string CorpusId { get; init; }
    public required string HashAlgorithm { get; init; }
    public required string CorpusRootPath { get; init; }
    public required string ManifestPath { get; init; }
    public required string ManifestSha256 { get; init; }
    public required string VerifiedScenarioId { get; init; }
    public required VerifiedPlaybackFile[] VerifiedFiles { get; init; }
}

internal sealed record VerifiedPlaybackFrame
{
    public required int FrameOrdinal { get; init; }
    public required long ExpectedLogicalBlockId { get; init; }
    public required int ExpectedOffsetMilliseconds { get; init; }
    public string? ExpectedTriggerEventId { get; init; }
    public string? TriggerText { get; init; }
    public required string PayloadPath { get; init; }
    public required int PayloadBytes { get; init; }
    public required string PayloadSha256 { get; init; }
    public required byte[] PayloadData { get; init; }
}

internal sealed record VerifiedPlaybackFile
{
    public required string RelativePath { get; init; }
    public required int PayloadBytes { get; init; }
    public required string PayloadSha256 { get; init; }
}

internal sealed record PlaybackCorpusManifest
{
    public required string SchemaVersion { get; init; }
    public required string CorpusId { get; init; }
    public required string Description { get; init; }
    public required string PayloadEncoding { get; init; }
    public required string HashAlgorithm { get; init; }
    public required string GoverningRequirement { get; init; }
    public required string GoverningAdr { get; init; }
    public required PlaybackCorpusScenario[] Scenarios { get; init; }
}

internal sealed record PlaybackCorpusScenario
{
    public required string ScenarioId { get; init; }
    public required PlaybackCorpusFrame[] Frames { get; init; }
}

internal sealed record PlaybackCorpusFrame
{
    public required int FrameOrdinal { get; init; }
    public required long ExpectedLogicalBlockId { get; init; }
    public required int ExpectedOffsetMilliseconds { get; init; }
    public string? ExpectedTriggerEventId { get; init; }
    public string? TriggerText { get; init; }
    public required string PayloadPath { get; init; }
    public required int PayloadBytes { get; init; }
    public required string PayloadSha256 { get; init; }
}

internal sealed record PacketHarnessGeneratorReceipt
{
    public required string SchemaVersion { get; init; }
    public required string GeneratedAtUtc { get; init; }
    public required string AttemptId { get; init; }
    public required string ScenarioId { get; init; }
    public required string OutputDirectory { get; init; }
    public required string AuthoritativeOutcome { get; init; }
    public required string PayloadCorpusId { get; init; }
    public required string PayloadSourceMode { get; init; }
    public string? ProfileConfigPath { get; init; }
    public required string RateProfileId { get; init; }
    public required int BlockDurationMilliseconds { get; init; }
    public required string PacketSchemaId { get; init; }
    public required string ShortPacketSourcePath { get; init; }
    public required string LongPacketSourcePath { get; init; }
    public required string SchedulePath { get; init; }
    public required string ManifestPath { get; init; }
    public string? CorpusManifestPath { get; init; }
    public required int VerifiedPlaybackFileCount { get; init; }
    public required int ExpectedShortPacketCount { get; init; }
    public required int ExpectedLongPacketCount { get; init; }
    public required long ExpectedShortPacketBytes { get; init; }
    public required long ExpectedLongPacketBytes { get; init; }
    public required RateProfileSummary RateProfileSummary { get; init; }
    public required TriggerPlacement[] TriggerPlacements { get; init; }
    public string? ReceiptPath { get; init; }

    public object ConsoleSummary => new
    {
        schemaVersion = SchemaVersion,
        generatedAtUtc = GeneratedAtUtc,
        attemptId = AttemptId,
        scenarioId = ScenarioId,
        outputDirectory = OutputDirectory,
        authoritativeOutcome = AuthoritativeOutcome,
        payloadCorpusId = PayloadCorpusId,
        payloadSourceMode = PayloadSourceMode,
        profileConfigPath = ProfileConfigPath,
        rateProfileId = RateProfileId,
        blockDurationMilliseconds = BlockDurationMilliseconds,
        packetSchemaId = PacketSchemaId,
        shortPacketSourcePath = ShortPacketSourcePath,
        longPacketSourcePath = LongPacketSourcePath,
        schedulePath = SchedulePath,
        manifestPath = ManifestPath,
        corpusManifestPath = CorpusManifestPath,
        verifiedPlaybackFileCount = VerifiedPlaybackFileCount,
        expectedShortPacketCount = ExpectedShortPacketCount,
        expectedLongPacketCount = ExpectedLongPacketCount,
        expectedShortPacketBytes = ExpectedShortPacketBytes,
        expectedLongPacketBytes = ExpectedLongPacketBytes,
        rateProfileSummary = RateProfileSummary,
        triggerPlacementCount = TriggerPlacements.Length,
        receiptPath = ReceiptPath
    };
}

internal sealed record PacketHarnessScheduleArtifact
{
    public required string SchemaVersion { get; init; }
    public required string ScheduleId { get; init; }
    public required string ScenarioId { get; init; }
    public required string ScenarioDescription { get; init; }
    public required int BlockDurationMilliseconds { get; init; }
    public required TimingBase TimingBase { get; init; }
    public required PacketPlacement[] PacketPlacementPlan { get; init; }
    public required TriggerPlacement[] TriggerPlacements { get; init; }
    public required int ExpectedShortPacketCount { get; init; }
    public required int ExpectedLongPacketCount { get; init; }
    public required long ExpectedShortPacketBytes { get; init; }
    public required long ExpectedLongPacketBytes { get; init; }
    public required SourceArtifactHints SourceArtifactHints { get; init; }
    public required string GoverningRequirement { get; init; }
    public required string GoverningAdr { get; init; }
    public required string TriggerWindowClass { get; init; }
    public required int SyntheticFrameCount { get; init; }
    public required RateProfileSummary RateProfileSummary { get; init; }
}

internal sealed record PacketHarnessManifestArtifact
{
    public required string SchemaVersion { get; init; }
    public required string AttemptId { get; init; }
    public required string ScenarioId { get; init; }
    public required string ScheduleId { get; init; }
    public required string PayloadCorpusId { get; init; }
    public required string RateProfileId { get; init; }
    public required string PayloadSourceMode { get; init; }
    public required int ExpectedShortPacketCount { get; init; }
    public required int ExpectedLongPacketCount { get; init; }
    public required long ExpectedShortPacketBytes { get; init; }
    public required long ExpectedLongPacketBytes { get; init; }
    public required PlannedArtifacts PlannedArtifacts { get; init; }
    public PlaybackCorpusSummary? PlaybackCorpus { get; init; }
    public required RateProfileSummary RateProfileSummary { get; init; }
}

internal sealed record TimingBase
{
    public required string ClockClass { get; init; }
    public required string RetainedTickField { get; init; }
    public required ulong TicksPerMillisecond { get; init; }
}

internal sealed record PacketPlacement
{
    public required string StreamId { get; init; }
    public required string PacketKind { get; init; }
    public required ulong WriterLocalSequence { get; init; }
    public required ulong TimingTicks64 { get; init; }
    public required ulong FrameId { get; init; }
    public required ulong PayloadDescriptorId { get; init; }
    public required uint PayloadBytes { get; init; }
    public required long LogicalBlockId { get; init; }
    public required long RelativeMilliseconds { get; init; }
}

internal sealed record TriggerPlacement
{
    public required string EventId { get; init; }
    public required ulong FrameId { get; init; }
    public required long LogicalBlockId { get; init; }
    public required long RelativeMilliseconds { get; init; }
    public required ulong TimingTicks64 { get; init; }
    public required ulong ShortWriterLocalSequence { get; init; }
}

internal sealed record SourceArtifactHints
{
    public required string ShortPacketSourcePath { get; init; }
    public required string LongPacketSourcePath { get; init; }
}

internal sealed record PlannedArtifacts
{
    public required string ShortPacketSourcePath { get; init; }
    public required string LongPacketSourcePath { get; init; }
    public required string SchedulePath { get; init; }
}

internal static class JsonOptions
{
    public static readonly JsonSerializerOptions Value = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
}
