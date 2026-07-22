using System.Buffers.Binary;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace ViHistorySuite.ReviewCaptureTransport;

public static class DualPacketTransportSchema
{
    public static readonly TransportSchemaVersion Current = new(2, 0);

    public static void AssertSupported(TransportSchemaVersion schemaVersion)
    {
        if (schemaVersion.Major != Current.Major)
        {
            throw new DualPacketValidationException(
                "unsupported-dual-packet-schema-major",
                $"Unsupported dual-packet schema major version {schemaVersion.Major}; expected {Current.Major}.");
        }

        if (schemaVersion.Minor != Current.Minor)
        {
            throw new DualPacketValidationException(
                "unsupported-dual-packet-schema-minor",
                $"Unsupported dual-packet schema minor version {schemaVersion.Minor}; expected {Current.Minor}.");
        }
    }
}

public static class DualPacketTransportConstants
{
    public const string PacketMagic = "DPKT2000";
    public const string FooterMagic = "DFTR2000";

    public static ReadOnlySpan<byte> PacketMagicBytes => "DPKT2000"u8;
    public static ReadOnlySpan<byte> FooterMagicBytes => "DFTR2000"u8;
}

public enum DualPacketStreamId : byte
{
    ShortPacket = 0x01,
    LongPacket = 0x02
}

public enum DualPacketKind : byte
{
    FrameStart = 0x01,
    FrameEnd = 0x02,
    CursorSample = 0x03,
    Click = 0x04,
    Keyboard = 0x05,
    OperatorAnnotation = 0x06,
    UngovernedTrigger = 0x07,
    GovernedTrigger = 0x08,
    FramePayload = 0x09,
    FramePayloadChunk = 0x0A
}

public static class DualPacketFlags
{
    public const ushort FrameBound = 1 << 0;
    public const ushort GovernedPayloadReference = 1 << 1;
    public const ushort NonAuthoritativeSource = 1 << 2;
    public const ushort Continuation = 1 << 3;
    public const ushort ReservedMask = 0xFFF0;
}

public static class DualPacketBinaryLayout
{
    public const int PacketHeaderByteLength = 64;
    public const int ShortPacketFooterByteLength = 16;
    public const int LongPacketFooterByteLength = 48;
    public const int FrameStartPayloadByteLength = sizeof(int) + sizeof(int) + sizeof(uint) + sizeof(byte) + 3;
    public const int FrameEndPayloadByteLength = sizeof(uint) + sizeof(ushort) + sizeof(ushort) + sizeof(uint) + sizeof(uint);
}

public sealed class DualPacketValidationException : Exception
{
    public DualPacketValidationException(string corruptionClass, string message, string failureStage = "unknown")
        : base(message)
    {
        CorruptionClass = corruptionClass;
        FailureStage = failureStage;
    }

    public string CorruptionClass { get; }
    public string FailureStage { get; }
}

public sealed record DualPacketSpec
{
    public DualPacketStreamId StreamId { get; init; }
    public DualPacketKind PacketKind { get; init; }
    public ushort Flags { get; init; }
    public ulong WriterLocalSequence { get; init; }
    public ulong TimingTicks64 { get; init; }
    public ulong FrameId { get; init; }
    public ulong PayloadDescriptorId { get; init; }
    public byte[] Payload { get; init; } = Array.Empty<byte>();
}

public sealed record DualPacketRecord
{
    public long PacketByteOffset { get; init; }
    public DualPacketStreamId StreamId { get; init; }
    public DualPacketKind PacketKind { get; init; }
    public ushort Flags { get; init; }
    public ushort FooterBytes { get; init; }
    public ulong WriterLocalSequence { get; init; }
    public ulong TimingTicks64 { get; init; }
    public ulong FrameId { get; init; }
    public ulong PayloadDescriptorId { get; init; }
    public uint PayloadBytes { get; init; }
    public uint HeaderCrc32C { get; init; }
    public uint PayloadCrc32C { get; init; }
    public uint PacketSpanBytes { get; init; }
    public byte[]? PayloadSha256 { get; init; }
    public byte[] Payload { get; init; } = Array.Empty<byte>();
}

public sealed record DualPacketFrameStartInfo
{
    public int WidthPixels { get; init; }
    public int HeightPixels { get; init; }
    public uint PixelFormatCode { get; init; }
    public byte BytesPerPixel { get; init; }
}

public sealed record DualPacketFrameEndInfo
{
    public uint EventCount { get; init; }
    public ushort LabelCount { get; init; }
    public ushort TriggerCount { get; init; }
    public uint RenderedCentiseconds { get; init; }
    public uint LatestEventCode { get; init; }
}

public sealed record DualPacketTextPayloadInfo
{
    public uint RecordId { get; init; }
    public uint ClassificationCode { get; init; }
    public ulong RelatedFrameId { get; init; }
    public string Text { get; init; } = string.Empty;
}

public sealed record DualPacketStreamWriteResult
{
    public string StreamPath { get; init; } = string.Empty;
    public TransportSchemaVersion SchemaVersion { get; init; }
    public DualPacketStreamId StreamId { get; init; }
    public DualPacketRecord[] Packets { get; init; } = Array.Empty<DualPacketRecord>();
}

public sealed record DualPacketStreamReadResult
{
    public string StreamPath { get; init; } = string.Empty;
    public TransportSchemaVersion SchemaVersion { get; init; }
    public DualPacketStreamId StreamId { get; init; }
    public DualPacketRecord[] Packets { get; init; } = Array.Empty<DualPacketRecord>();
}

public sealed record DualPacketStreamSequentialReadResult
{
    public string StreamPath { get; init; } = string.Empty;
    public TransportSchemaVersion SchemaVersion { get; init; }
    public DualPacketStreamId StreamId { get; init; }
    public int PacketCount { get; init; }
    public long InputBytes { get; init; }
    public long PeakBufferedPacketBytes { get; init; }
    public uint PeakPayloadBytes { get; init; }
    public ulong? FirstWriterLocalSequence { get; init; }
    public ulong? LastWriterLocalSequence { get; init; }
    public ulong? FirstTimingTicks64 { get; init; }
    public ulong? LastTimingTicks64 { get; init; }
    public long SequentialReadDurationMilliseconds { get; init; }
}

public static class DualPacketNames
{
    public static string GetStreamName(DualPacketStreamId streamId)
        => streamId switch
        {
            DualPacketStreamId.ShortPacket => "short-packet",
            DualPacketStreamId.LongPacket => "long-packet",
            _ => $"unknown-stream-{(byte)streamId:x2}"
        };

    public static string GetPacketKindName(DualPacketKind packetKind)
        => packetKind switch
        {
            DualPacketKind.FrameStart => "frame-start",
            DualPacketKind.FrameEnd => "frame-end",
            DualPacketKind.CursorSample => "cursor-sample",
            DualPacketKind.Click => "click",
            DualPacketKind.Keyboard => "keyboard",
            DualPacketKind.OperatorAnnotation => "operator-annotation",
            DualPacketKind.UngovernedTrigger => "ungoverned-trigger",
            DualPacketKind.GovernedTrigger => "governed-trigger",
            DualPacketKind.FramePayload => "frame-payload",
            DualPacketKind.FramePayloadChunk => "frame-payload-chunk",
            _ => $"unknown-kind-{(byte)packetKind:x2}"
        };
}

public static class DualPacketPayloadCodec
{
    public static byte[] EncodeFrameStartPayload(
        int widthPixels,
        int heightPixels,
        uint pixelFormatCode,
        byte bytesPerPixel)
    {
        var payload = new byte[DualPacketBinaryLayout.FrameStartPayloadByteLength];
        BinaryPrimitives.WriteInt32LittleEndian(payload.AsSpan(0, 4), widthPixels);
        BinaryPrimitives.WriteInt32LittleEndian(payload.AsSpan(4, 4), heightPixels);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(8, 4), pixelFormatCode);
        payload[12] = bytesPerPixel;
        return payload;
    }

    public static DualPacketFrameStartInfo DecodeFrameStartPayload(ReadOnlySpan<byte> payload)
    {
        if (payload.Length != DualPacketBinaryLayout.FrameStartPayloadByteLength)
        {
            throw new DualPacketValidationException(
                "malformed-frame-start-payload",
                $"Frame-start payload must be {DualPacketBinaryLayout.FrameStartPayloadByteLength} bytes; got {payload.Length}.",
                "validate-payload-layout");
        }

        if (payload[13] != 0 || payload[14] != 0 || payload[15] != 0)
        {
            throw new DualPacketValidationException(
                "frame-start-reserved-bytes-nonzero",
                "Frame-start payload reserved bytes must be zero.",
                "validate-payload-layout");
        }

        return new DualPacketFrameStartInfo
        {
            WidthPixels = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(0, 4)),
            HeightPixels = BinaryPrimitives.ReadInt32LittleEndian(payload.Slice(4, 4)),
            PixelFormatCode = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(8, 4)),
            BytesPerPixel = payload[12]
        };
    }

    public static byte[] EncodeFrameEndPayload(
        uint eventCount,
        ushort labelCount,
        ushort triggerCount,
        uint renderedCentiseconds,
        uint latestEventCode)
    {
        var payload = new byte[DualPacketBinaryLayout.FrameEndPayloadByteLength];
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(0, 4), eventCount);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(4, 2), labelCount);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(6, 2), triggerCount);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(8, 4), renderedCentiseconds);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(12, 4), latestEventCode);
        return payload;
    }

    public static DualPacketFrameEndInfo DecodeFrameEndPayload(ReadOnlySpan<byte> payload)
    {
        if (payload.Length != DualPacketBinaryLayout.FrameEndPayloadByteLength)
        {
            throw new DualPacketValidationException(
                "malformed-frame-end-payload",
                $"Frame-end payload must be {DualPacketBinaryLayout.FrameEndPayloadByteLength} bytes; got {payload.Length}.",
                "validate-payload-layout");
        }

        return new DualPacketFrameEndInfo
        {
            EventCount = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(0, 4)),
            LabelCount = BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(4, 2)),
            TriggerCount = BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(6, 2)),
            RenderedCentiseconds = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(8, 4)),
            LatestEventCode = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(12, 4))
        };
    }

    public static byte[] EncodeTextPayload(
        uint recordId,
        uint classificationCode,
        ulong relatedFrameId,
        string text)
        => TransportPayloadCodec.EncodeTextPayload(recordId, classificationCode, relatedFrameId, text);

    public static DualPacketTextPayloadInfo DecodeTextPayload(ReadOnlySpan<byte> payload)
    {
        var decoded = TransportPayloadCodec.DecodeTextPayload(payload);
        return new DualPacketTextPayloadInfo
        {
            RecordId = decoded.RecordId,
            ClassificationCode = decoded.ClassificationCode,
            RelatedFrameId = decoded.RelatedFrameIndex,
            Text = decoded.Text
        };
    }

    public static void ValidatePayloadLayout(DualPacketStreamId streamId, DualPacketKind packetKind, ReadOnlySpan<byte> payload, ulong writerLocalSequence)
    {
        if ((DualPacketFlags.ReservedMask & 0) != 0)
        {
            throw new InvalidOperationException("Reserved flag mask invariant violated.");
        }

        if (streamId == DualPacketStreamId.ShortPacket
            && (packetKind == DualPacketKind.FramePayload || packetKind == DualPacketKind.FramePayloadChunk))
        {
            throw new DualPacketValidationException(
                "short-stream-payload-kind-mismatch",
                $"Short-packet stream packet {writerLocalSequence} cannot carry {DualPacketNames.GetPacketKindName(packetKind)}.",
                "validate-payload-layout");
        }

        if (streamId == DualPacketStreamId.LongPacket
            && packetKind != DualPacketKind.FramePayload
            && packetKind != DualPacketKind.FramePayloadChunk)
        {
            throw new DualPacketValidationException(
                "long-stream-payload-kind-mismatch",
                $"Long-packet stream packet {writerLocalSequence} cannot carry {DualPacketNames.GetPacketKindName(packetKind)}.",
                "validate-payload-layout");
        }

        switch (packetKind)
        {
            case DualPacketKind.FrameStart:
                _ = DecodeFrameStartPayload(payload);
                return;
            case DualPacketKind.FrameEnd:
                _ = DecodeFrameEndPayload(payload);
                return;
            case DualPacketKind.CursorSample:
                if (payload.Length != TransportBinaryLayout.CursorSamplePayloadByteLength)
                {
                    throw new DualPacketValidationException(
                        "malformed-cursor-sample-payload",
                        $"Cursor-sample payload for packet {writerLocalSequence} must be {TransportBinaryLayout.CursorSamplePayloadByteLength} bytes; got {payload.Length}.",
                        "validate-payload-layout");
                }

                return;
            case DualPacketKind.Click:
                if (payload.Length != TransportBinaryLayout.ClickPayloadByteLength)
                {
                    throw new DualPacketValidationException(
                        "malformed-click-payload",
                        $"Click payload for packet {writerLocalSequence} must be {TransportBinaryLayout.ClickPayloadByteLength} bytes; got {payload.Length}.",
                        "validate-payload-layout");
                }

                return;
            case DualPacketKind.Keyboard:
                TransportPayloadCodec.ValidatePayloadLayout(TransportPacketKind.Keyboard, payload.ToArray(), writerLocalSequence);
                return;
            case DualPacketKind.OperatorAnnotation:
            case DualPacketKind.UngovernedTrigger:
            case DualPacketKind.GovernedTrigger:
                _ = DecodeTextPayload(payload);
                return;
            case DualPacketKind.FramePayload:
            case DualPacketKind.FramePayloadChunk:
                if (payload.Length == 0)
                {
                    throw new DualPacketValidationException(
                        "empty-frame-payload",
                        $"Frame-payload packet {writerLocalSequence} must not be empty.",
                        "validate-payload-layout");
                }

                return;
            default:
                throw new DualPacketValidationException(
                    "unsupported-dual-packet-kind",
                    $"Unsupported dual-packet kind {(byte)packetKind:x2}.",
                    "validate-payload-layout");
        }
    }
}

public sealed class DualPacketStreamWriter
{
    public DualPacketStreamWriteResult WritePackets(
        string streamPath,
        DualPacketStreamId streamId,
        IReadOnlyList<DualPacketSpec> packets)
    {
        if (packets.Count == 0)
        {
            throw new ArgumentException("Dual-packet stream must retain at least one packet.", nameof(packets));
        }

        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(streamPath))!);
        var packetRecords = new List<DualPacketRecord>(packets.Count);

        using var fileStream = File.Create(streamPath);
        ulong previousWriterLocalSequence = 0;
        for (var index = 0; index < packets.Count; index += 1)
        {
            var packet = packets[index];
            if (packet.StreamId != streamId)
            {
                throw new ArgumentException(
                    $"Packet {packet.WriterLocalSequence} declares stream {DualPacketNames.GetStreamName(packet.StreamId)} but writer is retaining {DualPacketNames.GetStreamName(streamId)}.");
            }

            if (index > 0 && packet.WriterLocalSequence <= previousWriterLocalSequence)
            {
                throw new ArgumentException(
                    $"Writer local sequence must increase monotonically. Packet {packet.WriterLocalSequence} is not greater than {previousWriterLocalSequence}.");
            }

            previousWriterLocalSequence = packet.WriterLocalSequence;
            if ((packet.Flags & DualPacketFlags.ReservedMask) != 0)
            {
                throw new ArgumentException(
                    $"Packet {packet.WriterLocalSequence} sets reserved flag bits 0x{(packet.Flags & DualPacketFlags.ReservedMask):x4}.");
            }

            DualPacketPayloadCodec.ValidatePayloadLayout(packet.StreamId, packet.PacketKind, packet.Payload, packet.WriterLocalSequence);
            var footerBytes = streamId == DualPacketStreamId.ShortPacket
                ? DualPacketBinaryLayout.ShortPacketFooterByteLength
                : DualPacketBinaryLayout.LongPacketFooterByteLength;
            var packetOffset = fileStream.Position;
            var header = BuildHeader(packet, footerBytes);
            var payloadCrc32C = Crc32C.Compute(packet.Payload);
            var packetSpanBytes = (uint)(DualPacketBinaryLayout.PacketHeaderByteLength + packet.Payload.Length + footerBytes);
            var payloadSha256 = streamId == DualPacketStreamId.LongPacket
                ? SHA256.HashData(packet.Payload)
                : null;
            var footer = BuildFooter(streamId, payloadCrc32C, packetSpanBytes, payloadSha256);

            fileStream.Write(header);
            fileStream.Write(packet.Payload);
            fileStream.Write(footer);

            packetRecords.Add(new DualPacketRecord
            {
                PacketByteOffset = packetOffset,
                StreamId = packet.StreamId,
                PacketKind = packet.PacketKind,
                Flags = packet.Flags,
                FooterBytes = (ushort)footerBytes,
                WriterLocalSequence = packet.WriterLocalSequence,
                TimingTicks64 = packet.TimingTicks64,
                FrameId = packet.FrameId,
                PayloadDescriptorId = packet.PayloadDescriptorId,
                PayloadBytes = (uint)packet.Payload.Length,
                HeaderCrc32C = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(20, 4)),
                PayloadCrc32C = payloadCrc32C,
                PacketSpanBytes = packetSpanBytes,
                PayloadSha256 = payloadSha256,
                Payload = packet.Payload
            });
        }

        fileStream.Flush(true);
        return new DualPacketStreamWriteResult
        {
            StreamPath = Path.GetFullPath(streamPath),
            SchemaVersion = DualPacketTransportSchema.Current,
            StreamId = streamId,
            Packets = packetRecords.ToArray()
        };
    }

    private static byte[] BuildHeader(DualPacketSpec packet, int footerBytes)
    {
        var header = new byte[DualPacketBinaryLayout.PacketHeaderByteLength];
        DualPacketTransportConstants.PacketMagicBytes.CopyTo(header.AsSpan(0, 8));
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(8, 4), DualPacketTransportSchema.Current.EncodedValue);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(12, 2), DualPacketBinaryLayout.PacketHeaderByteLength);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(14, 2), (ushort)footerBytes);
        header[16] = (byte)packet.StreamId;
        header[17] = (byte)packet.PacketKind;
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(18, 2), packet.Flags);
        BinaryPrimitives.WriteUInt64LittleEndian(header.AsSpan(24, 8), packet.WriterLocalSequence);
        BinaryPrimitives.WriteUInt64LittleEndian(header.AsSpan(32, 8), packet.TimingTicks64);
        BinaryPrimitives.WriteUInt64LittleEndian(header.AsSpan(40, 8), packet.FrameId);
        BinaryPrimitives.WriteUInt64LittleEndian(header.AsSpan(48, 8), packet.PayloadDescriptorId);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(56, 4), (uint)packet.Payload.Length);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(60, 4), 0U);
        var headerCrc32C = Crc32C.Compute(header.AsSpan(8, DualPacketBinaryLayout.PacketHeaderByteLength - 8));
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(20, 4), headerCrc32C);
        return header;
    }

    private static byte[] BuildFooter(DualPacketStreamId streamId, uint payloadCrc32C, uint packetSpanBytes, byte[]? payloadSha256)
    {
        var footerBytes = streamId == DualPacketStreamId.ShortPacket
            ? DualPacketBinaryLayout.ShortPacketFooterByteLength
            : DualPacketBinaryLayout.LongPacketFooterByteLength;
        var footer = new byte[footerBytes];
        DualPacketTransportConstants.FooterMagicBytes.CopyTo(footer.AsSpan(0, 8));
        BinaryPrimitives.WriteUInt32LittleEndian(footer.AsSpan(8, 4), payloadCrc32C);
        BinaryPrimitives.WriteUInt32LittleEndian(footer.AsSpan(12, 4), packetSpanBytes);
        if (streamId == DualPacketStreamId.LongPacket)
        {
            if (payloadSha256 is null || payloadSha256.Length != SHA256.HashSizeInBytes)
            {
                throw new ArgumentException("Long-packet footer requires one SHA-256 digest.");
            }

            payloadSha256.CopyTo(footer.AsSpan(16, SHA256.HashSizeInBytes));
        }

        return footer;
    }
}

public sealed class DualPacketStreamReader
{
    public DualPacketStreamReadResult ReadPackets(string streamPath)
    {
        var records = new List<DualPacketRecord>();
        var sequentialResult = ReadPacketsSequentially(streamPath, records.Add);

        return new DualPacketStreamReadResult
        {
            StreamPath = sequentialResult.StreamPath,
            SchemaVersion = sequentialResult.SchemaVersion,
            StreamId = sequentialResult.StreamId,
            Packets = records.ToArray()
        };
    }

    public DualPacketStreamSequentialReadResult ReadPacketsSequentially(
        string streamPath,
        Action<DualPacketRecord>? onPacket = null)
    {
        using var stream = File.OpenRead(streamPath);
        TransportSchemaVersion? schemaVersion = null;
        DualPacketStreamId? streamId = null;
        var packetCount = 0;
        var peakBufferedPacketBytes = 0L;
        uint peakPayloadBytes = 0;
        ulong? firstWriterLocalSequence = null;
        ulong? lastWriterLocalSequence = null;
        ulong? firstTimingTicks64 = null;
        ulong? lastTimingTicks64 = null;
        var stopwatch = Stopwatch.StartNew();

        while (stream.Position < stream.Length)
        {
            var packet = ReadNextPacket(stream, ref schemaVersion, ref streamId);
            peakBufferedPacketBytes = Math.Max(peakBufferedPacketBytes, packet.PacketSpanBytes);
            peakPayloadBytes = Math.Max(peakPayloadBytes, packet.PayloadBytes);
            firstWriterLocalSequence ??= packet.WriterLocalSequence;
            lastWriterLocalSequence = packet.WriterLocalSequence;
            firstTimingTicks64 ??= packet.TimingTicks64;
            lastTimingTicks64 = packet.TimingTicks64;
            packetCount += 1;
            onPacket?.Invoke(packet);
        }

        stopwatch.Stop();

        if (packetCount == 0 || schemaVersion is null || streamId is null)
        {
            throw new DualPacketValidationException(
                "empty-dual-packet-stream",
                $"Dual-packet stream {streamPath} does not contain any packets.",
                "stream-empty");
        }

        return new DualPacketStreamSequentialReadResult
        {
            StreamPath = Path.GetFullPath(streamPath),
            SchemaVersion = schemaVersion.Value,
            StreamId = streamId.Value,
            PacketCount = packetCount,
            InputBytes = stream.Length,
            PeakBufferedPacketBytes = peakBufferedPacketBytes,
            PeakPayloadBytes = peakPayloadBytes,
            FirstWriterLocalSequence = firstWriterLocalSequence,
            LastWriterLocalSequence = lastWriterLocalSequence,
            FirstTimingTicks64 = firstTimingTicks64,
            LastTimingTicks64 = lastTimingTicks64,
            SequentialReadDurationMilliseconds = stopwatch.ElapsedMilliseconds
        };
    }

    private static DualPacketRecord ReadNextPacket(
        Stream stream,
        ref TransportSchemaVersion? schemaVersion,
        ref DualPacketStreamId? streamId)
    {
        var packetOffset = stream.Position;
        var header = ReadExactly(
            stream,
            DualPacketBinaryLayout.PacketHeaderByteLength,
            "packet-header-truncated",
            "read-header");
        ValidateHeaderMagic(header);
        var packetSchemaVersion = TransportSchemaVersion.FromUInt32(BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(8, 4)));
        DualPacketTransportSchema.AssertSupported(packetSchemaVersion);
        schemaVersion ??= packetSchemaVersion;
        var headerBytes = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(12, 2));
        if (headerBytes != DualPacketBinaryLayout.PacketHeaderByteLength)
        {
            throw new DualPacketValidationException(
                "unexpected-dual-packet-header-bytes",
                $"Expected dual-packet header length {DualPacketBinaryLayout.PacketHeaderByteLength}, got {headerBytes}.",
                "validate-header-layout");
        }

        ValidateHeaderCrc(header);
        var footerBytes = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(14, 2));
        if (footerBytes != DualPacketBinaryLayout.ShortPacketFooterByteLength
            && footerBytes != DualPacketBinaryLayout.LongPacketFooterByteLength)
        {
            throw new DualPacketValidationException(
                "unexpected-dual-packet-footer-bytes",
                $"Unexpected dual-packet footer length {footerBytes}.",
                "validate-header-layout");
        }

        var packetStreamId = (DualPacketStreamId)header[16];
        streamId ??= packetStreamId;
        if (streamId != packetStreamId)
        {
            throw new DualPacketValidationException(
                "mixed-stream-id-in-single-stream",
                $"Single dual-packet stream file contains both {DualPacketNames.GetStreamName(streamId.Value)} and {DualPacketNames.GetStreamName(packetStreamId)} packets.",
                "validate-stream-identity");
        }

        var packetKind = (DualPacketKind)header[17];
        var flags = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(18, 2));
        var writerLocalSequence = BinaryPrimitives.ReadUInt64LittleEndian(header.AsSpan(24, 8));
        if ((flags & DualPacketFlags.ReservedMask) != 0)
        {
            throw new DualPacketValidationException(
                "dual-packet-reserved-flag-bits-set",
                $"Reserved flag bits are set for writer local sequence {writerLocalSequence}.",
                "validate-header-flags");
        }

        var timingTicks64 = BinaryPrimitives.ReadUInt64LittleEndian(header.AsSpan(32, 8));
        var frameId = BinaryPrimitives.ReadUInt64LittleEndian(header.AsSpan(40, 8));
        var payloadDescriptorId = BinaryPrimitives.ReadUInt64LittleEndian(header.AsSpan(48, 8));
        var payloadBytes = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(56, 4));
        var reserved32 = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(60, 4));
        if (reserved32 != 0)
        {
            throw new DualPacketValidationException(
                "dual-packet-header-reserved-nonzero",
                $"Reserved dual-packet header field must be zero for writer local sequence {writerLocalSequence}.",
                "validate-header-layout");
        }

        var payload = ReadExactly(stream, checked((int)payloadBytes), "dual-packet-payload-truncated", "read-payload");
        DualPacketPayloadCodec.ValidatePayloadLayout(packetStreamId, packetKind, payload, writerLocalSequence);
        var footer = ReadExactly(stream, footerBytes, "dual-packet-footer-truncated", "read-footer");
        ValidateFooterMagic(footer);
        var payloadCrc32C = BinaryPrimitives.ReadUInt32LittleEndian(footer.AsSpan(8, 4));
        var expectedPayloadCrc32C = Crc32C.Compute(payload);
        if (payloadCrc32C != expectedPayloadCrc32C)
        {
            throw new DualPacketValidationException(
                "dual-packet-payload-crc-mismatch",
                $"Payload CRC32C mismatch for writer local sequence {writerLocalSequence}.",
                "validate-payload-crc32c");
        }

        var packetSpanBytes = BinaryPrimitives.ReadUInt32LittleEndian(footer.AsSpan(12, 4));
        var expectedPacketSpanBytes = (uint)(DualPacketBinaryLayout.PacketHeaderByteLength + payload.Length + footerBytes);
        if (packetSpanBytes != expectedPacketSpanBytes)
        {
            throw new DualPacketValidationException(
                "dual-packet-packet-span-mismatch",
                $"Dual-packet packet span mismatch for writer local sequence {writerLocalSequence}; expected {expectedPacketSpanBytes}, got {packetSpanBytes}.",
                "validate-packet-span");
        }

        byte[]? payloadSha256 = null;
        if (footerBytes == DualPacketBinaryLayout.LongPacketFooterByteLength)
        {
            payloadSha256 = footer.AsSpan(16, SHA256.HashSizeInBytes).ToArray();
            var expectedPayloadSha256 = SHA256.HashData(payload);
            if (!payloadSha256.AsSpan().SequenceEqual(expectedPayloadSha256))
            {
                throw new DualPacketValidationException(
                    "dual-packet-payload-sha256-mismatch",
                    $"Payload SHA-256 mismatch for writer local sequence {writerLocalSequence}.",
                    "validate-payload-sha256");
            }
        }

        return new DualPacketRecord
        {
            PacketByteOffset = packetOffset,
            StreamId = packetStreamId,
            PacketKind = packetKind,
            Flags = flags,
            FooterBytes = footerBytes,
            WriterLocalSequence = writerLocalSequence,
            TimingTicks64 = timingTicks64,
            FrameId = frameId,
            PayloadDescriptorId = payloadDescriptorId,
            PayloadBytes = payloadBytes,
            HeaderCrc32C = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(20, 4)),
            PayloadCrc32C = payloadCrc32C,
            PacketSpanBytes = packetSpanBytes,
            PayloadSha256 = payloadSha256,
            Payload = payload
        };
    }

    private static void ValidateHeaderMagic(ReadOnlySpan<byte> header)
    {
        if (!header.Slice(0, 8).SequenceEqual(DualPacketTransportConstants.PacketMagicBytes))
        {
            throw new DualPacketValidationException(
                "dual-packet-header-magic-mismatch",
                "Dual-packet header magic is invalid.",
                "validate-header-magic");
        }
    }

    private static void ValidateFooterMagic(ReadOnlySpan<byte> footer)
    {
        if (!footer.Slice(0, 8).SequenceEqual(DualPacketTransportConstants.FooterMagicBytes))
        {
            throw new DualPacketValidationException(
                "dual-packet-footer-magic-mismatch",
                "Dual-packet footer magic is invalid.",
                "validate-footer-magic");
        }
    }

    private static void ValidateHeaderCrc(ReadOnlySpan<byte> header)
    {
        var actualCrc = BinaryPrimitives.ReadUInt32LittleEndian(header.Slice(20, 4));
        var headerCopy = header.ToArray();
        headerCopy[20] = 0;
        headerCopy[21] = 0;
        headerCopy[22] = 0;
        headerCopy[23] = 0;
        var expectedCrc = Crc32C.Compute(headerCopy.AsSpan(8, DualPacketBinaryLayout.PacketHeaderByteLength - 8));
        if (actualCrc != expectedCrc)
        {
            throw new DualPacketValidationException(
                "dual-packet-header-crc-mismatch",
                "Dual-packet header CRC32C is invalid.",
                "validate-header-crc32c");
        }
    }

    private static byte[] ReadExactly(Stream stream, int byteCount, string corruptionClass, string failureStage)
    {
        var buffer = new byte[byteCount];
        var totalRead = 0;
        while (totalRead < byteCount)
        {
            var read = stream.Read(buffer, totalRead, byteCount - totalRead);
            if (read <= 0)
            {
                throw new DualPacketValidationException(
                    corruptionClass,
                    $"Expected {byteCount} bytes but stream ended after {totalRead} bytes.",
                    failureStage);
            }

            totalRead += read;
        }

        return buffer;
    }
}

internal static class Crc32C
{
    private const uint Polynomial = 0x82F63B78;
    private static readonly uint[] Table = BuildTable();

    public static uint Compute(ReadOnlySpan<byte> data)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var value in data)
        {
            var tableIndex = (crc ^ value) & 0xFF;
            crc = Table[tableIndex] ^ (crc >> 8);
        }

        return ~crc;
    }

    private static uint[] BuildTable()
    {
        var table = new uint[256];
        for (uint index = 0; index < table.Length; index += 1)
        {
            var value = index;
            for (var bit = 0; bit < 8; bit += 1)
            {
                value = (value & 1) != 0
                    ? (value >> 1) ^ Polynomial
                    : value >> 1;
            }

            table[index] = value;
        }

        return table;
    }
}
