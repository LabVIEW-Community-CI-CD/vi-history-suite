using System.Buffers.Binary;

namespace ViHistorySuite.ReviewCaptureTransport;

public sealed record TransportFrameImagePayloadInfo
{
    public int WidthPixels { get; init; }
    public int HeightPixels { get; init; }
    public uint ImageFormatCode { get; init; }
    public uint PayloadEncodingCode { get; init; }
    public int PayloadBodyByteCount { get; init; }
}

public sealed record TransportCursorSamplePayloadInfo
{
    public int SourceCursorX { get; init; }
    public int SourceCursorY { get; init; }
    public int MappedVmClientX { get; init; }
    public int MappedVmClientY { get; init; }
    public uint PointerStatusFlags { get; init; }
}

public sealed record TransportClickPayloadInfo
{
    public int SourceCursorX { get; init; }
    public int SourceCursorY { get; init; }
    public int MappedVmClientX { get; init; }
    public int MappedVmClientY { get; init; }
    public byte ButtonId { get; init; }
    public byte TransitionId { get; init; }
    public ushort ModifierFlags { get; init; }
    public uint ClickOrdinalWithinFrame { get; init; }
}

public sealed record TransportKeyboardPayloadInfo
{
    public byte KeyTransitionId { get; init; }
    public byte KeyboardDeviceClass { get; init; }
    public ushort ModifierFlags { get; init; }
    public uint KeyCode { get; init; }
    public uint UnicodeScalar { get; init; }
}

public sealed record TransportFrameEndPayloadInfo
{
    public byte FrameFlags { get; init; }
    public byte ClickFlags { get; init; }
    public byte KeyFlags { get; init; }
    public int LatestSourceCursorX { get; init; }
    public int LatestSourceCursorY { get; init; }
    public int LatestMappedVmClientX { get; init; }
    public int LatestMappedVmClientY { get; init; }
    public uint LatestKeyCode { get; init; }
    public uint LatestUnicodeScalar { get; init; }
}

public sealed record TransportReplaySegmentInfo
{
    public uint SegmentIndex { get; init; }
    public string SegmentPath { get; init; } = string.Empty;
    public ulong SegmentStartPacketSequence { get; init; }
    public ulong LogicalReplayBaseTimestamp { get; init; }
    public int PacketCount { get; init; }
    public ulong FirstPacketSequence { get; init; }
    public ulong LastPacketSequence { get; init; }
    public ulong FirstTimestampRelativeToSegment { get; init; }
    public ulong LastTimestampRelativeToSegment { get; init; }
}

public sealed record TransportReplayTimelineEntry
{
    public ulong PacketSequence { get; init; }
    public ulong LogicalReplayTimestamp { get; init; }
    public uint SegmentIndex { get; init; }
    public string SegmentPath { get; init; } = string.Empty;
    public ulong TimestampRelativeToSegment { get; init; }
    public ulong FrameIndex { get; init; }
    public string WireClass { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public ushort Flags { get; init; }
    public TransportFrameImagePayloadInfo? FrameImage { get; init; }
    public TransportCursorSamplePayloadInfo? CursorSample { get; init; }
    public TransportClickPayloadInfo? Click { get; init; }
    public TransportKeyboardPayloadInfo? Keyboard { get; init; }
    public TransportTextPayloadInfo? Text { get; init; }
    public TransportFrameEndPayloadInfo? FrameEnd { get; init; }
}

public sealed record TransportReplayCursorPathEntry
{
    public ulong PacketSequence { get; init; }
    public ulong LogicalReplayTimestamp { get; init; }
    public uint SegmentIndex { get; init; }
    public string SegmentPath { get; init; } = string.Empty;
    public ulong FrameIndex { get; init; }
    public int SourceCursorX { get; init; }
    public int SourceCursorY { get; init; }
    public int MappedVmClientX { get; init; }
    public int MappedVmClientY { get; init; }
    public uint PointerStatusFlags { get; init; }
}

public sealed record TransportReplayClickEntry
{
    public ulong PacketSequence { get; init; }
    public ulong LogicalReplayTimestamp { get; init; }
    public uint SegmentIndex { get; init; }
    public string SegmentPath { get; init; } = string.Empty;
    public ulong FrameIndex { get; init; }
    public int SourceCursorX { get; init; }
    public int SourceCursorY { get; init; }
    public int MappedVmClientX { get; init; }
    public int MappedVmClientY { get; init; }
    public byte ButtonId { get; init; }
    public byte TransitionId { get; init; }
    public ushort ModifierFlags { get; init; }
    public uint ClickOrdinalWithinFrame { get; init; }
}

public sealed record TransportReplayKeyboardPathEntry
{
    public ulong PacketSequence { get; init; }
    public ulong LogicalReplayTimestamp { get; init; }
    public uint SegmentIndex { get; init; }
    public string SegmentPath { get; init; } = string.Empty;
    public ulong FrameIndex { get; init; }
    public byte KeyTransitionId { get; init; }
    public byte KeyboardDeviceClass { get; init; }
    public ushort ModifierFlags { get; init; }
    public uint KeyCode { get; init; }
    public uint UnicodeScalar { get; init; }
}

public sealed record TransportReplayTextEntry
{
    public ulong PacketSequence { get; init; }
    public ulong LogicalReplayTimestamp { get; init; }
    public uint SegmentIndex { get; init; }
    public string SegmentPath { get; init; } = string.Empty;
    public ulong FrameIndex { get; init; }
    public string Kind { get; init; } = string.Empty;
    public uint RecordId { get; init; }
    public uint ClassificationCode { get; init; }
    public ulong RelatedFrameIndex { get; init; }
    public string Text { get; init; } = string.Empty;
}

public sealed record TransportReplayFrameReference
{
    public ulong PacketSequence { get; init; }
    public ulong LogicalReplayTimestamp { get; init; }
    public uint SegmentIndex { get; init; }
    public string SegmentPath { get; init; } = string.Empty;
    public ulong FrameIndex { get; init; }
    public string Kind { get; init; } = string.Empty;
    public TransportFrameImagePayloadInfo? FrameImage { get; init; }
    public TransportFrameEndPayloadInfo? FrameEnd { get; init; }
}

public sealed record TransportReplayPlan
{
    public string TransportSchemaId { get; init; } = string.Empty;
    public string LogicalTimelineKind { get; init; } = "segment-stitched-monotonic";
    public ulong LogicalTimelineSeamTick { get; init; } = 1;
    public int SegmentCount { get; init; }
    public int PacketCount { get; init; }
    public ulong FirstPacketSequence { get; init; }
    public ulong LastPacketSequence { get; init; }
    public TransportReplaySegmentInfo[] Segments { get; init; } = Array.Empty<TransportReplaySegmentInfo>();
    public TransportReplayTimelineEntry[] Timeline { get; init; } = Array.Empty<TransportReplayTimelineEntry>();
    public TransportReplayCursorPathEntry[] CursorPath { get; init; } = Array.Empty<TransportReplayCursorPathEntry>();
    public TransportReplayClickEntry[] Clicks { get; init; } = Array.Empty<TransportReplayClickEntry>();
    public TransportReplayKeyboardPathEntry[] KeyboardPath { get; init; } = Array.Empty<TransportReplayKeyboardPathEntry>();
    public TransportReplayTextEntry[] OperatorAnnotations { get; init; } = Array.Empty<TransportReplayTextEntry>();
    public TransportReplayTextEntry[] UngovernedTriggers { get; init; } = Array.Empty<TransportReplayTextEntry>();
    public TransportReplayTextEntry[] GovernedTriggers { get; init; } = Array.Empty<TransportReplayTextEntry>();
    public TransportReplayFrameReference[] FrameReferences { get; init; } = Array.Empty<TransportReplayFrameReference>();
}

public static class TransportPayloadDecoder
{
    public static TransportFrameImagePayloadInfo DecodeFrameImagePayload(ReadOnlySpan<byte> payload)
    {
        if (payload.Length < TransportBinaryLayout.FrameImagePayloadPrefixByteLength)
        {
            throw new TransportValidationException(
                "malformed-packet-payload",
                $"Frame-image payload length {payload.Length} is shorter than the governed prefix {TransportBinaryLayout.FrameImagePayloadPrefixByteLength}.");
        }

        return new TransportFrameImagePayloadInfo
        {
            WidthPixels = BinaryPrimitives.ReadInt32LittleEndian(payload[..4]),
            HeightPixels = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(4, 4)),
            ImageFormatCode = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(8, 4)),
            PayloadEncodingCode = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(12, 4)),
            PayloadBodyByteCount = payload.Length - TransportBinaryLayout.FrameImagePayloadPrefixByteLength
        };
    }

    public static TransportCursorSamplePayloadInfo DecodeCursorSamplePayload(ReadOnlySpan<byte> payload)
    {
        if (payload.Length != TransportBinaryLayout.CursorSamplePayloadByteLength)
        {
            throw new TransportValidationException(
                "malformed-packet-payload",
                $"Cursor-sample payload length {payload.Length} does not match the governed length {TransportBinaryLayout.CursorSamplePayloadByteLength}.");
        }

        return new TransportCursorSamplePayloadInfo
        {
            SourceCursorX = BinaryPrimitives.ReadInt32LittleEndian(payload[..4]),
            SourceCursorY = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(4, 4)),
            MappedVmClientX = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(8, 4)),
            MappedVmClientY = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(12, 4)),
            PointerStatusFlags = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(16, 4))
        };
    }

    public static TransportClickPayloadInfo DecodeClickPayload(ReadOnlySpan<byte> payload)
    {
        if (payload.Length != TransportBinaryLayout.ClickPayloadByteLength)
        {
            throw new TransportValidationException(
                "malformed-packet-payload",
                $"Click payload length {payload.Length} does not match the governed length {TransportBinaryLayout.ClickPayloadByteLength}.");
        }

        return new TransportClickPayloadInfo
        {
            SourceCursorX = BinaryPrimitives.ReadInt32LittleEndian(payload[..4]),
            SourceCursorY = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(4, 4)),
            MappedVmClientX = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(8, 4)),
            MappedVmClientY = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(12, 4)),
            ButtonId = payload[16],
            TransitionId = payload[17],
            ModifierFlags = BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(18, 2)),
            ClickOrdinalWithinFrame = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(20, 4))
        };
    }

    public static TransportKeyboardPayloadInfo DecodeKeyboardPayload(ReadOnlySpan<byte> payload)
    {
        if (payload.Length != TransportBinaryLayout.KeyboardPayloadByteLength)
        {
            throw new TransportValidationException(
                "malformed-packet-payload",
                $"Keyboard payload length {payload.Length} does not match the governed length {TransportBinaryLayout.KeyboardPayloadByteLength}.");
        }

        if (BinaryPrimitives.ReadUInt64LittleEndian(payload.Slice(TransportBinaryLayout.KeyboardReservedFieldOffset, sizeof(ulong))) != 0)
        {
            throw new TransportValidationException(
                "keyboard-reserved-field-nonzero",
                "Keyboard payload reserved field must remain zero when decoding replay.");
        }

        return new TransportKeyboardPayloadInfo
        {
            KeyTransitionId = payload[0],
            KeyboardDeviceClass = payload[1],
            ModifierFlags = BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(2, 2)),
            KeyCode = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(4, 4)),
            UnicodeScalar = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(8, 4))
        };
    }

    public static TransportFrameEndPayloadInfo DecodeFrameEndPayload(ReadOnlySpan<byte> payload)
    {
        if (payload.Length != TransportBinaryLayout.FrameEndPayloadByteLength)
        {
            throw new TransportValidationException(
                "malformed-packet-payload",
                $"Frame-end payload length {payload.Length} does not match the governed length {TransportBinaryLayout.FrameEndPayloadByteLength}.");
        }

        if (payload[TransportBinaryLayout.FrameEndReservedByteOffset] != 0)
        {
            throw new TransportValidationException(
                "frame-end-reserved-byte-nonzero",
                "Frame-end reserved byte must remain zero when decoding replay.");
        }

        return new TransportFrameEndPayloadInfo
        {
            FrameFlags = payload[0],
            ClickFlags = payload[1],
            KeyFlags = payload[2],
            LatestSourceCursorX = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(4, 4)),
            LatestSourceCursorY = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(8, 4)),
            LatestMappedVmClientX = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(12, 4)),
            LatestMappedVmClientY = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(16, 4)),
            LatestKeyCode = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(20, 4)),
            LatestUnicodeScalar = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(24, 4))
        };
    }
}

public static class TransportReplayPlanProjector
{
    private const ulong LogicalTimelineSeamTick = 1;

    public static TransportReplayPlan Project(IReadOnlyList<TransportSegmentReadResult> segments)
    {
        if (segments.Count == 0)
        {
            throw new ArgumentException("At least one authoritative transport segment is required.", nameof(segments));
        }

        var schemaVersion = segments[0].SchemaVersion;
        var replaySegments = new List<TransportReplaySegmentInfo>(segments.Count);
        var timeline = new List<TransportReplayTimelineEntry>();
        var cursorPath = new List<TransportReplayCursorPathEntry>();
        var clicks = new List<TransportReplayClickEntry>();
        var keyboardPath = new List<TransportReplayKeyboardPathEntry>();
        var operatorAnnotations = new List<TransportReplayTextEntry>();
        var ungovernedTriggers = new List<TransportReplayTextEntry>();
        var governedTriggers = new List<TransportReplayTextEntry>();
        var frameReferences = new List<TransportReplayFrameReference>();

        ulong previousPacketSequence = 0;
        ulong previousLogicalReplayTimestamp = 0;
        uint? previousSegmentIndex = null;
        var firstPacket = true;

        foreach (var segment in segments)
        {
            if (!Equals(segment.SchemaVersion, schemaVersion))
            {
                throw new TransportValidationException(
                    "mixed-schema-replay-plan",
                    $"Replay-plan projection cannot mix transport schema {schemaVersion} with {segment.SchemaVersion}.");
            }

            if (!string.Equals(segment.AuthoritativeOutcome, "authoritative", StringComparison.Ordinal)
                || !string.Equals(segment.CorruptionClass, "none", StringComparison.Ordinal))
            {
                throw new TransportValidationException(
                    "non-authoritative-replay-input",
                    $"Replay-plan projection requires authoritative segments, but segment {segment.SegmentPath} retained outcome {segment.AuthoritativeOutcome} and corruption class {segment.CorruptionClass}.");
            }

            if (segment.Packets.Length == 0)
            {
                throw new TransportValidationException(
                    "empty-segment-replay-input",
                    $"Replay-plan projection requires at least one packet per segment, but segment {segment.SegmentPath} retained zero packets.");
            }

            if (previousSegmentIndex.HasValue && segment.SegmentIndex <= previousSegmentIndex.Value)
            {
                throw new TransportValidationException(
                    "non-monotonic-segment-index",
                    $"Replay-plan projection requires strictly increasing segment indexes, but segment index {segment.SegmentIndex} followed {previousSegmentIndex.Value}.");
            }

            var segmentFirstTimestamp = segment.Packets[0].TimestampRelativeToSegment;
            var logicalReplayBaseTimestamp = firstPacket
                ? 0UL
                : checked(Math.Max(
                    checked(previousLogicalReplayTimestamp + LogicalTimelineSeamTick),
                    segmentFirstTimestamp) - segmentFirstTimestamp);

            replaySegments.Add(new TransportReplaySegmentInfo
            {
                SegmentIndex = segment.SegmentIndex,
                SegmentPath = segment.SegmentPath,
                SegmentStartPacketSequence = segment.SegmentStartPacketSequence,
                LogicalReplayBaseTimestamp = logicalReplayBaseTimestamp,
                PacketCount = segment.Packets.Length,
                FirstPacketSequence = segment.Packets[0].PacketSequence,
                LastPacketSequence = segment.Packets[^1].PacketSequence,
                FirstTimestampRelativeToSegment = segmentFirstTimestamp,
                LastTimestampRelativeToSegment = segment.Packets[^1].TimestampRelativeToSegment
            });

            foreach (var packet in segment.Packets)
            {
                if (!firstPacket && packet.PacketSequence <= previousPacketSequence)
                {
                    throw new TransportValidationException(
                        "non-monotonic-packet-sequence",
                        $"Replay-plan projection requires strictly increasing packet sequence, but packet {packet.PacketSequence} followed {previousPacketSequence}.");
                }

                var logicalReplayTimestamp = checked(logicalReplayBaseTimestamp + packet.TimestampRelativeToSegment);
                var timelineEntry = CreateTimelineEntry(packet, segment, logicalReplayTimestamp);
                timeline.Add(timelineEntry);

                if (timelineEntry.CursorSample is not null)
                {
                    cursorPath.Add(new TransportReplayCursorPathEntry
                    {
                        PacketSequence = packet.PacketSequence,
                        LogicalReplayTimestamp = logicalReplayTimestamp,
                        SegmentIndex = segment.SegmentIndex,
                        SegmentPath = segment.SegmentPath,
                        FrameIndex = packet.FrameIndex,
                        SourceCursorX = timelineEntry.CursorSample.SourceCursorX,
                        SourceCursorY = timelineEntry.CursorSample.SourceCursorY,
                        MappedVmClientX = timelineEntry.CursorSample.MappedVmClientX,
                        MappedVmClientY = timelineEntry.CursorSample.MappedVmClientY,
                        PointerStatusFlags = timelineEntry.CursorSample.PointerStatusFlags
                    });
                }

                if (timelineEntry.Click is not null)
                {
                    clicks.Add(new TransportReplayClickEntry
                    {
                        PacketSequence = packet.PacketSequence,
                        LogicalReplayTimestamp = logicalReplayTimestamp,
                        SegmentIndex = segment.SegmentIndex,
                        SegmentPath = segment.SegmentPath,
                        FrameIndex = packet.FrameIndex,
                        SourceCursorX = timelineEntry.Click.SourceCursorX,
                        SourceCursorY = timelineEntry.Click.SourceCursorY,
                        MappedVmClientX = timelineEntry.Click.MappedVmClientX,
                        MappedVmClientY = timelineEntry.Click.MappedVmClientY,
                        ButtonId = timelineEntry.Click.ButtonId,
                        TransitionId = timelineEntry.Click.TransitionId,
                        ModifierFlags = timelineEntry.Click.ModifierFlags,
                        ClickOrdinalWithinFrame = timelineEntry.Click.ClickOrdinalWithinFrame
                    });
                }

                if (timelineEntry.Keyboard is not null)
                {
                    keyboardPath.Add(new TransportReplayKeyboardPathEntry
                    {
                        PacketSequence = packet.PacketSequence,
                        LogicalReplayTimestamp = logicalReplayTimestamp,
                        SegmentIndex = segment.SegmentIndex,
                        SegmentPath = segment.SegmentPath,
                        FrameIndex = packet.FrameIndex,
                        KeyTransitionId = timelineEntry.Keyboard.KeyTransitionId,
                        KeyboardDeviceClass = timelineEntry.Keyboard.KeyboardDeviceClass,
                        ModifierFlags = timelineEntry.Keyboard.ModifierFlags,
                        KeyCode = timelineEntry.Keyboard.KeyCode,
                        UnicodeScalar = timelineEntry.Keyboard.UnicodeScalar
                    });
                }

                if (timelineEntry.Text is not null)
                {
                    var textEntry = new TransportReplayTextEntry
                    {
                        PacketSequence = packet.PacketSequence,
                        LogicalReplayTimestamp = logicalReplayTimestamp,
                        SegmentIndex = segment.SegmentIndex,
                        SegmentPath = segment.SegmentPath,
                        FrameIndex = packet.FrameIndex,
                        Kind = timelineEntry.Kind,
                        RecordId = timelineEntry.Text.RecordId,
                        ClassificationCode = timelineEntry.Text.ClassificationCode,
                        RelatedFrameIndex = timelineEntry.Text.RelatedFrameIndex,
                        Text = timelineEntry.Text.Text
                    };

                    switch (packet.PacketKind)
                    {
                        case TransportPacketKind.OperatorAnnotation:
                            operatorAnnotations.Add(textEntry);
                            break;
                        case TransportPacketKind.UngovernedTrigger:
                            ungovernedTriggers.Add(textEntry);
                            break;
                        case TransportPacketKind.GovernedTrigger:
                            governedTriggers.Add(textEntry);
                            break;
                    }
                }

                if (timelineEntry.FrameImage is not null || timelineEntry.FrameEnd is not null)
                {
                    frameReferences.Add(new TransportReplayFrameReference
                    {
                        PacketSequence = packet.PacketSequence,
                        LogicalReplayTimestamp = logicalReplayTimestamp,
                        SegmentIndex = segment.SegmentIndex,
                        SegmentPath = segment.SegmentPath,
                        FrameIndex = packet.FrameIndex,
                        Kind = timelineEntry.Kind,
                        FrameImage = timelineEntry.FrameImage,
                        FrameEnd = timelineEntry.FrameEnd
                    });
                }

                previousPacketSequence = packet.PacketSequence;
                previousLogicalReplayTimestamp = logicalReplayTimestamp;
                firstPacket = false;
            }

            previousSegmentIndex = segment.SegmentIndex;
        }

        return new TransportReplayPlan
        {
            TransportSchemaId = schemaVersion.ToString(),
            LogicalTimelineSeamTick = LogicalTimelineSeamTick,
            SegmentCount = replaySegments.Count,
            PacketCount = timeline.Count,
            FirstPacketSequence = timeline[0].PacketSequence,
            LastPacketSequence = timeline[^1].PacketSequence,
            Segments = replaySegments.ToArray(),
            Timeline = timeline.ToArray(),
            CursorPath = cursorPath.ToArray(),
            Clicks = clicks.ToArray(),
            KeyboardPath = keyboardPath.ToArray(),
            OperatorAnnotations = operatorAnnotations.ToArray(),
            UngovernedTriggers = ungovernedTriggers.ToArray(),
            GovernedTriggers = governedTriggers.ToArray(),
            FrameReferences = frameReferences.ToArray()
        };
    }

    private static TransportReplayTimelineEntry CreateTimelineEntry(
        TransportPacketRecord packet,
        TransportSegmentReadResult segment,
        ulong logicalReplayTimestamp)
    {
        return new TransportReplayTimelineEntry
        {
            PacketSequence = packet.PacketSequence,
            LogicalReplayTimestamp = logicalReplayTimestamp,
            SegmentIndex = segment.SegmentIndex,
            SegmentPath = segment.SegmentPath,
            TimestampRelativeToSegment = packet.TimestampRelativeToSegment,
            FrameIndex = packet.FrameIndex,
            WireClass = TransportNames.GetWireClassName(packet.WireClass),
            Kind = TransportNames.GetPacketKindName(packet.PacketKind),
            Flags = packet.Flags,
            FrameImage = packet.PacketKind == TransportPacketKind.FrameImage
                ? TransportPayloadDecoder.DecodeFrameImagePayload(packet.Payload)
                : null,
            CursorSample = packet.PacketKind == TransportPacketKind.CursorSample
                ? TransportPayloadDecoder.DecodeCursorSamplePayload(packet.Payload)
                : null,
            Click = packet.PacketKind == TransportPacketKind.Click
                ? TransportPayloadDecoder.DecodeClickPayload(packet.Payload)
                : null,
            Keyboard = packet.PacketKind == TransportPacketKind.Keyboard
                ? TransportPayloadDecoder.DecodeKeyboardPayload(packet.Payload)
                : null,
            Text = packet.PacketKind is TransportPacketKind.OperatorAnnotation or TransportPacketKind.UngovernedTrigger or TransportPacketKind.GovernedTrigger
                ? TransportPayloadCodec.DecodeTextPayload(packet.Payload)
                : null,
            FrameEnd = packet.PacketKind == TransportPacketKind.FrameEnd
                ? TransportPayloadDecoder.DecodeFrameEndPayload(packet.Payload)
                : null
        };
    }
}
