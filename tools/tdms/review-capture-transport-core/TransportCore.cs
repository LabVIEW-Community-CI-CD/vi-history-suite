using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace ViHistorySuite.ReviewCaptureTransport;

public static class ReviewCaptureTransportConstants
{
    public const string SegmentMagic = "VHTRSEG1";
    public const string PacketMagic = "VPKT0001";
    public const string FooterMagic = "VHTREND1";
    public const ulong UnboundFrameIndex = ulong.MaxValue;

    public static ReadOnlySpan<byte> SegmentMagicBytes => "VHTRSEG1"u8;
    public static ReadOnlySpan<byte> PacketMagicBytes => "VPKT0001"u8;
    public static ReadOnlySpan<byte> FooterMagicBytes => "VHTREND1"u8;
}

public readonly record struct TransportSchemaVersion(ushort Major, ushort Minor)
{
    public uint EncodedValue => ((uint)Major << 16) | Minor;

    public override string ToString()
    {
        return $"{Major}.{Minor}";
    }

    public static TransportSchemaVersion FromUInt32(uint encodedValue)
    {
        return new TransportSchemaVersion(
            (ushort)(encodedValue >> 16),
            (ushort)(encodedValue & 0xFFFF));
    }
}

public static class ReviewCaptureTransportSchema
{
    public static readonly TransportSchemaVersion Current = new(1, 0);

    public static void AssertSupported(TransportSchemaVersion schemaVersion)
    {
        if (schemaVersion.Major != Current.Major)
        {
            throw new TransportValidationException(
                "unsupported-schema-major",
                $"Unsupported transport schema major version {schemaVersion.Major}; expected {Current.Major}.");
        }

        if (schemaVersion.Minor != Current.Minor)
        {
            throw new TransportValidationException(
                "unsupported-schema-minor",
                $"Unsupported transport schema minor version {schemaVersion.Minor}; expected {Current.Minor}.");
        }
    }
}

public enum TransportWireClass : byte
{
    Short = 0x01,
    Long = 0x02
}

public enum TransportPacketKind : byte
{
    FrameImage = 0x01,
    FrameEnd = 0x02,
    CursorSample = 0x03,
    Click = 0x04,
    Keyboard = 0x05,
    OperatorAnnotation = 0x06,
    UngovernedTrigger = 0x07,
    GovernedTrigger = 0x08
}

public static class TransportPacketFlags
{
    public const ushort FrameBound = 1 << 0;
    public const ushort GovernedPayloadReference = 1 << 1;
    public const ushort NonAuthoritativeSource = 1 << 2;
    public const ushort Continuation = 1 << 3;
    public const ushort ReservedMask = 0xFFF0;
}

public static class FrameEndFrameFlags
{
    public const byte AuthoritativeImage = 1 << 0;
    public const byte ClippedOrIncompleteImage = 1 << 1;
    public const byte CalibrationMatched = 1 << 2;
    public const byte SecondaryPointerVerificationSucceeded = 1 << 3;
}

public static class FrameEndClickFlags
{
    public const byte LeftTransition = 1 << 0;
    public const byte RightTransition = 1 << 1;
    public const byte MiddleTransition = 1 << 2;
}

public static class FrameEndKeyFlags
{
    public const byte KeyDown = 1 << 0;
    public const byte KeyUp = 1 << 1;
    public const byte UnicodeScalarRetained = 1 << 2;
}

public static class TransportBinaryLayout
{
    public const int SegmentHeaderByteLength = 8 + sizeof(uint) + sizeof(uint) + sizeof(ulong);
    public const int PacketHeaderByteLength =
        8
        + sizeof(ulong)
        + sizeof(ulong)
        + sizeof(byte)
        + sizeof(byte)
        + sizeof(ushort)
        + sizeof(ulong)
        + sizeof(uint)
        + SHA256.HashSizeInBytes;
    public const int SegmentFooterByteLength = 8 + sizeof(ulong) + SHA256.HashSizeInBytes;
    public const int FrameImagePayloadPrefixByteLength = sizeof(int) + sizeof(int) + sizeof(uint) + sizeof(uint);
    public const int CursorSamplePayloadByteLength = sizeof(int) + sizeof(int) + sizeof(int) + sizeof(int) + sizeof(uint);
    public const int ClickPayloadByteLength =
        sizeof(int) + sizeof(int) + sizeof(int) + sizeof(int) + sizeof(byte) + sizeof(byte) + sizeof(ushort) + sizeof(uint);
    public const int KeyboardReservedFieldOffset = sizeof(byte) + sizeof(byte) + sizeof(ushort) + sizeof(uint) + sizeof(uint);
    public const int KeyboardPayloadByteLength =
        sizeof(byte) + sizeof(byte) + sizeof(ushort) + sizeof(uint) + sizeof(uint) + sizeof(ulong);
    public const int FrameEndReservedByteOffset = sizeof(byte) + sizeof(byte) + sizeof(byte);
    public const int FrameEndPayloadByteLength =
        sizeof(byte) + sizeof(byte) + sizeof(byte) + sizeof(byte) + sizeof(int) + sizeof(int) + sizeof(int) + sizeof(int) + sizeof(uint) + sizeof(uint);
    public const int TextPayloadPrefixByteLength = sizeof(uint) + sizeof(uint) + sizeof(ulong) + sizeof(uint);
}

public sealed class TransportValidationException : Exception
{
    public TransportValidationException(string corruptionClass, string message)
        : base(message)
    {
        CorruptionClass = corruptionClass;
    }

    public string CorruptionClass { get; }
}

public sealed record TransportPacketSpec
{
    public ulong PacketSequence { get; init; }
    public ulong TimestampRelativeToSegment { get; init; }
    public TransportWireClass WireClass { get; init; }
    public TransportPacketKind PacketKind { get; init; }
    public ushort Flags { get; init; }
    public ulong FrameIndex { get; init; } = ReviewCaptureTransportConstants.UnboundFrameIndex;
    public byte[] Payload { get; init; } = Array.Empty<byte>();
}

public sealed record TransportPacketRecord
{
    public long PacketByteOffset { get; init; }
    public ulong PacketSequence { get; init; }
    public ulong TimestampRelativeToSegment { get; init; }
    public TransportWireClass WireClass { get; init; }
    public TransportPacketKind PacketKind { get; init; }
    public ushort Flags { get; init; }
    public ulong FrameIndex { get; init; }
    public uint PayloadLength { get; init; }
    public byte[] PayloadSha256 { get; init; } = Array.Empty<byte>();
    public byte[] Payload { get; init; } = Array.Empty<byte>();
    public TransportTextPayloadInfo? DecodedTextPayload { get; init; }
}

public sealed record TransportTextPayloadInfo
{
    public uint RecordId { get; init; }
    public uint ClassificationCode { get; init; }
    public ulong RelatedFrameIndex { get; init; }
    public string Text { get; init; } = string.Empty;
}

public sealed record TransportCaptureBusEntry
{
    public uint SegmentIndex { get; init; }
    public ulong PacketSequence { get; init; }
    public long PacketByteOffset { get; init; }
    public byte WireClassCode { get; init; }
    public byte PacketKindCode { get; init; }
    public ulong FrameIndex { get; init; }
    public ulong TimestampRelativeToSegment { get; init; }
    public uint PayloadLength { get; init; }
    public string PayloadSha256 { get; init; } = string.Empty;
    public ushort PacketHeaderFlags { get; init; }
    public string SourceSegmentPath { get; init; } = string.Empty;
}

public sealed record TransportFixtureManifest
{
    public string FixtureId { get; init; } = string.Empty;
    public string TransportSchemaId { get; init; } = ReviewCaptureTransportSchema.Current.ToString();
    public int ExpectedSegmentCount { get; init; }
    public int ExpectedPacketCount { get; init; }
    public ulong ExpectedFirstPacketSequence { get; init; }
    public ulong ExpectedLastPacketSequence { get; init; }
    public string ExpectedAuthoritativeOutcome { get; init; } = "authoritative";
    public string ExpectedCorruptionClass { get; init; } = "none";
    public bool ExpectedRolloverBoundaryPresent { get; init; }
    public string[] SegmentPaths { get; init; } = Array.Empty<string>();
    public TransportFixtureSegmentExpectation[] SegmentExpectations { get; init; } = Array.Empty<TransportFixtureSegmentExpectation>();
}

public sealed record TransportFixtureSegmentExpectation
{
    public string SegmentPath { get; init; } = string.Empty;
    public int ExpectedPacketCount { get; init; }
    public ulong ExpectedFirstPacketSequence { get; init; }
    public ulong ExpectedLastPacketSequence { get; init; }
    public string ExpectedAuthoritativeOutcome { get; init; } = "authoritative";
    public string ExpectedCorruptionClass { get; init; } = "none";
}

public sealed record TransportManifestValidationResult
{
    public bool Passed { get; init; }
    public string[] Errors { get; init; } = Array.Empty<string>();
}

public sealed record TransportSegmentWriteResult
{
    public string SegmentPath { get; init; } = string.Empty;
    public TransportSchemaVersion SchemaVersion { get; init; }
    public uint SegmentIndex { get; init; }
    public ulong SegmentStartPacketSequence { get; init; }
    public TransportPacketRecord[] Packets { get; init; } = Array.Empty<TransportPacketRecord>();
    public TransportCaptureBusEntry[] CaptureBusEntries { get; init; } = Array.Empty<TransportCaptureBusEntry>();
    public string AuthoritativeOutcome { get; init; } = "authoritative";
    public string CorruptionClass { get; init; } = "none";
}

public sealed record TransportSegmentReadResult
{
    public string SegmentPath { get; init; } = string.Empty;
    public TransportSchemaVersion SchemaVersion { get; init; }
    public uint SegmentIndex { get; init; }
    public ulong SegmentStartPacketSequence { get; init; }
    public TransportPacketRecord[] Packets { get; init; } = Array.Empty<TransportPacketRecord>();
    public TransportCaptureBusEntry[] CaptureBusEntries { get; init; } = Array.Empty<TransportCaptureBusEntry>();
    public string AuthoritativeOutcome { get; init; } = "authoritative";
    public string CorruptionClass { get; init; } = "none";
}

public static class TransportNames
{
    public static string GetWireClassName(TransportWireClass wireClass)
    {
        return wireClass switch
        {
            TransportWireClass.Short => "short",
            TransportWireClass.Long => "long",
            _ => $"unknown-{(byte)wireClass:x2}"
        };
    }

    public static string GetPacketKindName(TransportPacketKind packetKind)
    {
        return packetKind switch
        {
            TransportPacketKind.FrameImage => "frame-image",
            TransportPacketKind.FrameEnd => "frame-end",
            TransportPacketKind.CursorSample => "cursor-sample",
            TransportPacketKind.Click => "click",
            TransportPacketKind.Keyboard => "keyboard",
            TransportPacketKind.OperatorAnnotation => "operator-annotation",
            TransportPacketKind.UngovernedTrigger => "ungoverned-trigger",
            TransportPacketKind.GovernedTrigger => "governed-trigger",
            _ => $"unknown-{(byte)packetKind:x2}"
        };
    }
}

public static class TransportPayloadCodec
{
    public static byte[] EncodeFrameImagePayload(
        int widthPixels,
        int heightPixels,
        uint imageFormatCode,
        uint payloadEncodingCode,
        byte[] payloadBody)
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);
        writer.Write(widthPixels);
        writer.Write(heightPixels);
        writer.Write(imageFormatCode);
        writer.Write(payloadEncodingCode);
        writer.Write(payloadBody);
        writer.Flush();
        return stream.ToArray();
    }

    public static byte[] EncodeCursorSamplePayload(
        int sourceCursorX,
        int sourceCursorY,
        int mappedVmClientX,
        int mappedVmClientY,
        uint pointerStatusFlags)
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);
        writer.Write(sourceCursorX);
        writer.Write(sourceCursorY);
        writer.Write(mappedVmClientX);
        writer.Write(mappedVmClientY);
        writer.Write(pointerStatusFlags);
        writer.Flush();
        return stream.ToArray();
    }

    public static byte[] EncodeClickPayload(
        int sourceCursorX,
        int sourceCursorY,
        int mappedVmClientX,
        int mappedVmClientY,
        byte buttonId,
        byte transitionId,
        ushort modifierFlags,
        uint clickOrdinalWithinFrame)
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);
        writer.Write(sourceCursorX);
        writer.Write(sourceCursorY);
        writer.Write(mappedVmClientX);
        writer.Write(mappedVmClientY);
        writer.Write(buttonId);
        writer.Write(transitionId);
        writer.Write(modifierFlags);
        writer.Write(clickOrdinalWithinFrame);
        writer.Flush();
        return stream.ToArray();
    }

    public static byte[] EncodeKeyboardPayload(
        byte keyTransitionId,
        byte keyboardDeviceClass,
        ushort modifierFlags,
        uint keyCode,
        uint unicodeScalar,
        ulong reservedField = 0)
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);
        writer.Write(keyTransitionId);
        writer.Write(keyboardDeviceClass);
        writer.Write(modifierFlags);
        writer.Write(keyCode);
        writer.Write(unicodeScalar);
        writer.Write(reservedField);
        writer.Flush();
        return stream.ToArray();
    }

    public static byte[] EncodeFrameEndPayload(
        byte frameFlags,
        byte clickFlags,
        byte keyFlags,
        int latestSourceCursorX,
        int latestSourceCursorY,
        int latestMappedVmClientX,
        int latestMappedVmClientY,
        uint latestKeyCode,
        uint latestUnicodeScalar)
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);
        writer.Write(frameFlags);
        writer.Write(clickFlags);
        writer.Write(keyFlags);
        writer.Write((byte)0);
        writer.Write(latestSourceCursorX);
        writer.Write(latestSourceCursorY);
        writer.Write(latestMappedVmClientX);
        writer.Write(latestMappedVmClientY);
        writer.Write(latestKeyCode);
        writer.Write(latestUnicodeScalar);
        writer.Flush();
        return stream.ToArray();
    }

    public static byte[] EncodeTextPayload(
        uint recordId,
        uint classificationCode,
        ulong relatedFrameIndex,
        string text)
    {
        var normalized = (text ?? string.Empty).Normalize(NormalizationForm.FormC);
        var utf8Bytes = Encoding.UTF8.GetBytes(normalized);
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);
        writer.Write(recordId);
        writer.Write(classificationCode);
        writer.Write(relatedFrameIndex);
        writer.Write(utf8Bytes.Length);
        writer.Write(utf8Bytes);
        writer.Flush();
        return stream.ToArray();
    }

    public static TransportTextPayloadInfo DecodeTextPayload(ReadOnlySpan<byte> payload)
    {
        if (payload.Length < TransportBinaryLayout.TextPayloadPrefixByteLength)
        {
            throw new TransportValidationException(
                "malformed-text-payload",
                $"Text-bearing payload is shorter than the governed fixed-width prefix ({TransportBinaryLayout.TextPayloadPrefixByteLength} bytes).");
        }

        var recordId = BinaryPrimitives.ReadUInt32LittleEndian(payload[..4]);
        var classificationCode = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(4, 4));
        var relatedFrameIndex = BinaryPrimitives.ReadUInt64LittleEndian(payload.Slice(8, 8));
        var textByteLength = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(16, 4));
        if (payload.Length != TransportBinaryLayout.TextPayloadPrefixByteLength + textByteLength)
        {
            throw new TransportValidationException(
                "malformed-text-payload",
                $"Text-bearing payload declared {textByteLength} UTF-8 bytes but retained {payload.Length - TransportBinaryLayout.TextPayloadPrefixByteLength}.");
        }

        var text = Encoding.UTF8.GetString(payload.Slice(TransportBinaryLayout.TextPayloadPrefixByteLength, checked((int)textByteLength)));
        return new TransportTextPayloadInfo
        {
            RecordId = recordId,
            ClassificationCode = classificationCode,
            RelatedFrameIndex = relatedFrameIndex,
            Text = text
        };
    }

    public static void ValidatePayloadLayout(
        TransportPacketKind packetKind,
        ReadOnlySpan<byte> payload,
        ulong packetSequence)
    {
        switch (packetKind)
        {
            case TransportPacketKind.FrameImage:
                if (payload.Length < TransportBinaryLayout.FrameImagePayloadPrefixByteLength)
                {
                    throw new TransportValidationException(
                        "malformed-packet-payload",
                        $"Packet {packetSequence} retained frame-image payload length {payload.Length} but the governed minimum is {TransportBinaryLayout.FrameImagePayloadPrefixByteLength}.");
                }

                break;
            case TransportPacketKind.CursorSample:
                if (payload.Length != TransportBinaryLayout.CursorSamplePayloadByteLength)
                {
                    throw new TransportValidationException(
                        "malformed-packet-payload",
                        $"Packet {packetSequence} retained cursor-sample payload length {payload.Length} but the governed length is {TransportBinaryLayout.CursorSamplePayloadByteLength}.");
                }

                break;
            case TransportPacketKind.Click:
                if (payload.Length != TransportBinaryLayout.ClickPayloadByteLength)
                {
                    throw new TransportValidationException(
                        "malformed-packet-payload",
                        $"Packet {packetSequence} retained click payload length {payload.Length} but the governed length is {TransportBinaryLayout.ClickPayloadByteLength}.");
                }

                break;
            case TransportPacketKind.Keyboard:
                if (payload.Length != TransportBinaryLayout.KeyboardPayloadByteLength)
                {
                    throw new TransportValidationException(
                        "malformed-packet-payload",
                        $"Packet {packetSequence} retained keyboard payload length {payload.Length} but the governed length is {TransportBinaryLayout.KeyboardPayloadByteLength}.");
                }

                if (BinaryPrimitives.ReadUInt64LittleEndian(payload.Slice(TransportBinaryLayout.KeyboardReservedFieldOffset, sizeof(ulong))) != 0)
                {
                    throw new TransportValidationException(
                        "keyboard-reserved-field-nonzero",
                        $"Packet {packetSequence} retained a non-zero reserved field in the keyboard payload.");
                }

                break;
            case TransportPacketKind.FrameEnd:
                if (payload.Length != TransportBinaryLayout.FrameEndPayloadByteLength)
                {
                    throw new TransportValidationException(
                        "malformed-packet-payload",
                        $"Packet {packetSequence} retained frame-end payload length {payload.Length} but the governed length is {TransportBinaryLayout.FrameEndPayloadByteLength}.");
                }

                if (payload[TransportBinaryLayout.FrameEndReservedByteOffset] != 0)
                {
                    throw new TransportValidationException(
                        "frame-end-reserved-byte-nonzero",
                        $"Packet {packetSequence} retained a non-zero reserved byte in the frame-end payload.");
                }

                break;
            case TransportPacketKind.OperatorAnnotation:
            case TransportPacketKind.UngovernedTrigger:
            case TransportPacketKind.GovernedTrigger:
                _ = DecodeTextPayload(payload);
                break;
        }
    }
}

public sealed class TransportSegmentWriter
{
    public TransportSegmentWriteResult WriteSegment(
        string segmentPath,
        TransportSchemaVersion schemaVersion,
        uint segmentIndex,
        ulong segmentStartPacketSequence,
        IReadOnlyList<TransportPacketSpec> packets)
    {
        if (packets.Count == 0)
        {
            throw new ArgumentException("At least one packet is required to write a segment.", nameof(packets));
        }

        if (packets[0].PacketSequence != segmentStartPacketSequence)
        {
            throw new ArgumentException(
                $"Segment start packet sequence {segmentStartPacketSequence} does not match the first packet sequence {packets[0].PacketSequence}.",
                nameof(segmentStartPacketSequence));
        }

        Directory.CreateDirectory(Path.GetDirectoryName(segmentPath) ?? ".");

        var packetRecords = new List<TransportPacketRecord>(packets.Count);
        var captureBusEntries = new List<TransportCaptureBusEntry>(packets.Count);
        using var segmentPayloadHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

        var absoluteSegmentPath = Path.GetFullPath(segmentPath);
        using var fileStream = File.Create(absoluteSegmentPath);
        using var writer = new BinaryWriter(fileStream, Encoding.UTF8, leaveOpen: true);

        writer.Write(Encoding.ASCII.GetBytes(ReviewCaptureTransportConstants.SegmentMagic));
        writer.Write(schemaVersion.EncodedValue);
        writer.Write(segmentIndex);
        writer.Write(segmentStartPacketSequence);

        ulong previousSequence = 0;
        for (var index = 0; index < packets.Count; index += 1)
        {
            var packet = packets[index];
            if (index > 0 && packet.PacketSequence <= previousSequence)
            {
                throw new ArgumentException("Packet sequences must be strictly increasing.", nameof(packets));
            }

            if ((packet.Flags & TransportPacketFlags.ReservedMask) != 0)
            {
                throw new ArgumentException("Reserved packet flag bits must remain zero.", nameof(packets));
            }

            previousSequence = packet.PacketSequence;

            var payload = packet.Payload ?? Array.Empty<byte>();
            TransportPayloadCodec.ValidatePayloadLayout(packet.PacketKind, payload, packet.PacketSequence);
            var payloadSha256 = SHA256.HashData(payload);
            var packetOffset = fileStream.Position;

            writer.Write(Encoding.ASCII.GetBytes(ReviewCaptureTransportConstants.PacketMagic));
            writer.Write(packet.PacketSequence);
            writer.Write(packet.TimestampRelativeToSegment);
            writer.Write((byte)packet.WireClass);
            writer.Write((byte)packet.PacketKind);
            writer.Write(packet.Flags);
            writer.Write(packet.FrameIndex);
            writer.Write((uint)payload.Length);
            writer.Write(payloadSha256);
            writer.Write(payload);

            segmentPayloadHash.AppendData(payload);

            var packetRecord = new TransportPacketRecord
            {
                PacketByteOffset = packetOffset,
                PacketSequence = packet.PacketSequence,
                TimestampRelativeToSegment = packet.TimestampRelativeToSegment,
                WireClass = packet.WireClass,
                PacketKind = packet.PacketKind,
                Flags = packet.Flags,
                FrameIndex = packet.FrameIndex,
                PayloadLength = (uint)payload.Length,
                PayloadSha256 = payloadSha256,
                Payload = payload,
                DecodedTextPayload = DecodeTextPayloadIfApplicable(packet.PacketKind, payload)
            };

            packetRecords.Add(packetRecord);
            captureBusEntries.Add(new TransportCaptureBusEntry
            {
                SegmentIndex = segmentIndex,
                PacketSequence = packet.PacketSequence,
                PacketByteOffset = packetOffset,
                WireClassCode = (byte)packet.WireClass,
                PacketKindCode = (byte)packet.PacketKind,
                FrameIndex = packet.FrameIndex,
                TimestampRelativeToSegment = packet.TimestampRelativeToSegment,
                PayloadLength = (uint)payload.Length,
                PayloadSha256 = Convert.ToHexString(payloadSha256).ToLowerInvariant(),
                PacketHeaderFlags = packet.Flags,
                SourceSegmentPath = absoluteSegmentPath
            });
        }

        writer.Write(Encoding.ASCII.GetBytes(ReviewCaptureTransportConstants.FooterMagic));
        writer.Write((ulong)packetRecords.Count);
        writer.Write(segmentPayloadHash.GetHashAndReset());
        writer.Flush();

        return new TransportSegmentWriteResult
        {
            SegmentPath = absoluteSegmentPath,
            SchemaVersion = schemaVersion,
            SegmentIndex = segmentIndex,
            SegmentStartPacketSequence = segmentStartPacketSequence,
            Packets = packetRecords.ToArray(),
            CaptureBusEntries = captureBusEntries.ToArray()
        };
    }

    private static TransportTextPayloadInfo? DecodeTextPayloadIfApplicable(TransportPacketKind packetKind, byte[] payload)
    {
        return packetKind switch
        {
            TransportPacketKind.OperatorAnnotation or TransportPacketKind.UngovernedTrigger or TransportPacketKind.GovernedTrigger
                => TransportPayloadCodec.DecodeTextPayload(payload),
            _ => null
        };
    }
}

public sealed class TransportSegmentReader
{
    public TransportSegmentReadResult ReadSegment(string segmentPath)
    {
        var absoluteSegmentPath = Path.GetFullPath(segmentPath);
        using var fileStream = File.OpenRead(absoluteSegmentPath);
        using var reader = new BinaryReader(fileStream, Encoding.UTF8, leaveOpen: true);
        using var segmentPayloadHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

        var segmentMagic = ReadRequiredBytes(reader, ReviewCaptureTransportConstants.SegmentMagicBytes.Length, "segment magic");
        if (!segmentMagic.SequenceEqual(ReviewCaptureTransportConstants.SegmentMagicBytes.ToArray()))
        {
            throw new TransportValidationException("malformed-segment-header", $"Segment {absoluteSegmentPath} is missing magic {ReviewCaptureTransportConstants.SegmentMagic}.");
        }

        var schemaVersion = TransportSchemaVersion.FromUInt32(reader.ReadUInt32());
        ReviewCaptureTransportSchema.AssertSupported(schemaVersion);

        var segmentIndex = reader.ReadUInt32();
        var segmentStartPacketSequence = reader.ReadUInt64();
        var packetRecords = new List<TransportPacketRecord>();
        var captureBusEntries = new List<TransportCaptureBusEntry>();

        while (fileStream.Position < fileStream.Length)
        {
            var recordOffset = fileStream.Position;
            var recordMagic = ReadRequiredBytes(reader, ReviewCaptureTransportConstants.PacketMagicBytes.Length, "record magic");

            if (recordMagic.SequenceEqual(ReviewCaptureTransportConstants.FooterMagicBytes.ToArray()))
            {
                var sealedPacketCount = reader.ReadUInt64();
                var retainedDigest = ReadRequiredBytes(reader, SHA256.HashSizeInBytes, "segment payload digest");
                if (sealedPacketCount != (ulong)packetRecords.Count)
                {
                    throw new TransportValidationException(
                        "sealed-packet-count-mismatch",
                        $"Segment {absoluteSegmentPath} retained sealed-packet count {sealedPacketCount} but read {packetRecords.Count} packet records.");
                }

                var computedDigest = segmentPayloadHash.GetHashAndReset();
                if (!retainedDigest.SequenceEqual(computedDigest))
                {
                    throw new TransportValidationException(
                        "segment-payload-digest-mismatch",
                        $"Segment {absoluteSegmentPath} retained a footer payload digest that does not match the packet payload bytes.");
                }

                if (fileStream.Position != fileStream.Length)
                {
                    throw new TransportValidationException(
                        "trailing-bytes-after-footer",
                        $"Segment {absoluteSegmentPath} retained trailing bytes after the governed footer.");
                }

                return new TransportSegmentReadResult
                {
                    SegmentPath = absoluteSegmentPath,
                    SchemaVersion = schemaVersion,
                    SegmentIndex = segmentIndex,
                    SegmentStartPacketSequence = segmentStartPacketSequence,
                    Packets = packetRecords.ToArray(),
                    CaptureBusEntries = captureBusEntries.ToArray()
                };
            }

            if (!recordMagic.SequenceEqual(ReviewCaptureTransportConstants.PacketMagicBytes.ToArray()))
            {
                throw new TransportValidationException(
                    "malformed-packet-magic",
                    $"Segment {absoluteSegmentPath} retained an unknown packet magic at byte offset {recordOffset}.");
            }

            var packetSequence = reader.ReadUInt64();
            var timestampRelativeToSegment = reader.ReadUInt64();
            var wireClass = DecodeWireClass(reader.ReadByte());
            var packetKind = DecodePacketKind(reader.ReadByte());
            var flags = reader.ReadUInt16();
            if ((flags & TransportPacketFlags.ReservedMask) != 0)
            {
                throw new TransportValidationException(
                    "reserved-flag-bits-nonzero",
                    $"Packet {packetSequence} retained reserved packet-flag bits that are not zero.");
            }

            var frameIndex = reader.ReadUInt64();
            var payloadLength = reader.ReadUInt32();
            var retainedPayloadSha256 = ReadRequiredBytes(reader, SHA256.HashSizeInBytes, "payload SHA-256");
            var payload = ReadRequiredBytes(reader, checked((int)payloadLength), "payload body");
            var computedPayloadSha256 = SHA256.HashData(payload);
            if (!retainedPayloadSha256.SequenceEqual(computedPayloadSha256))
            {
                throw new TransportValidationException(
                    "payload-sha256-mismatch",
                    $"Packet {packetSequence} retained a payload SHA-256 that does not match the packet payload bytes.");
            }

            TransportPayloadCodec.ValidatePayloadLayout(packetKind, payload, packetSequence);
            segmentPayloadHash.AppendData(payload);

            var packetRecord = new TransportPacketRecord
            {
                PacketByteOffset = recordOffset,
                PacketSequence = packetSequence,
                TimestampRelativeToSegment = timestampRelativeToSegment,
                WireClass = wireClass,
                PacketKind = packetKind,
                Flags = flags,
                FrameIndex = frameIndex,
                PayloadLength = payloadLength,
                PayloadSha256 = retainedPayloadSha256,
                Payload = payload,
                DecodedTextPayload = DecodeTextPayloadIfApplicable(packetKind, payload)
            };

            packetRecords.Add(packetRecord);
            captureBusEntries.Add(new TransportCaptureBusEntry
            {
                SegmentIndex = segmentIndex,
                PacketSequence = packetSequence,
                PacketByteOffset = recordOffset,
                WireClassCode = (byte)wireClass,
                PacketKindCode = (byte)packetKind,
                FrameIndex = frameIndex,
                TimestampRelativeToSegment = timestampRelativeToSegment,
                PayloadLength = payloadLength,
                PayloadSha256 = Convert.ToHexString(retainedPayloadSha256).ToLowerInvariant(),
                PacketHeaderFlags = flags,
                SourceSegmentPath = absoluteSegmentPath
            });
        }

        throw new TransportValidationException(
            "missing-footer",
            $"Segment {absoluteSegmentPath} ended before retaining the governed footer {ReviewCaptureTransportConstants.FooterMagic}.");
    }

    private static TransportTextPayloadInfo? DecodeTextPayloadIfApplicable(TransportPacketKind packetKind, byte[] payload)
    {
        return packetKind switch
        {
            TransportPacketKind.OperatorAnnotation or TransportPacketKind.UngovernedTrigger or TransportPacketKind.GovernedTrigger
                => TransportPayloadCodec.DecodeTextPayload(payload),
            _ => null
        };
    }

    private static TransportWireClass DecodeWireClass(byte retainedCode)
    {
        return retainedCode switch
        {
            (byte)TransportWireClass.Short => TransportWireClass.Short,
            (byte)TransportWireClass.Long => TransportWireClass.Long,
            _ => throw new TransportValidationException(
                "unknown-wire-class",
                $"Retained packet used unsupported wire-class code 0x{retainedCode:x2}.")
        };
    }

    private static TransportPacketKind DecodePacketKind(byte retainedCode)
    {
        return retainedCode switch
        {
            (byte)TransportPacketKind.FrameImage => TransportPacketKind.FrameImage,
            (byte)TransportPacketKind.FrameEnd => TransportPacketKind.FrameEnd,
            (byte)TransportPacketKind.CursorSample => TransportPacketKind.CursorSample,
            (byte)TransportPacketKind.Click => TransportPacketKind.Click,
            (byte)TransportPacketKind.Keyboard => TransportPacketKind.Keyboard,
            (byte)TransportPacketKind.OperatorAnnotation => TransportPacketKind.OperatorAnnotation,
            (byte)TransportPacketKind.UngovernedTrigger => TransportPacketKind.UngovernedTrigger,
            (byte)TransportPacketKind.GovernedTrigger => TransportPacketKind.GovernedTrigger,
            _ => throw new TransportValidationException(
                "unknown-packet-kind",
                $"Retained packet used unsupported packet-kind code 0x{retainedCode:x2}.")
        };
    }

    private static byte[] ReadRequiredBytes(BinaryReader reader, int byteCount, string label)
    {
        var bytes = reader.ReadBytes(byteCount);
        if (bytes.Length != byteCount)
        {
            throw new TransportValidationException(
                "truncated-binary-field",
                $"Binary stream ended while reading {label}; expected {byteCount} bytes and retained {bytes.Length}.");
        }

        return bytes;
    }
}

public static class TransportManifestValidator
{
    public static TransportManifestValidationResult Validate(
        TransportSegmentReadResult readResult,
        TransportFixtureManifest fixtureManifest)
    {
        var errors = new List<string>();
        if (!string.Equals(fixtureManifest.TransportSchemaId, readResult.SchemaVersion.ToString(), StringComparison.Ordinal))
        {
            errors.Add(
                $"Manifest transportSchemaId {fixtureManifest.TransportSchemaId} does not match retained schema {readResult.SchemaVersion}.");
        }

        if (fixtureManifest.SegmentPaths.Length != fixtureManifest.ExpectedSegmentCount)
        {
            errors.Add(
                $"Manifest segmentPaths count {fixtureManifest.SegmentPaths.Length} does not match expectedSegmentCount {fixtureManifest.ExpectedSegmentCount}.");
        }

        if (fixtureManifest.SegmentExpectations.Length > 0)
        {
            if (fixtureManifest.ExpectedRolloverBoundaryPresent && fixtureManifest.ExpectedSegmentCount < 2)
            {
                errors.Add(
                    "Manifest expectedRolloverBoundaryPresent is true, but expectedSegmentCount is less than 2.");
            }

            ValidateSegmentExpectationSet(readResult, fixtureManifest, errors);
            return new TransportManifestValidationResult
            {
                Passed = errors.Count == 0,
                Errors = errors.ToArray()
            };
        }

        if (fixtureManifest.ExpectedSegmentCount != 1)
        {
            errors.Add(
                $"Manifest expectedSegmentCount {fixtureManifest.ExpectedSegmentCount} does not match the current single-segment reader surface.");
        }

        if (fixtureManifest.SegmentPaths.Length > 0)
        {
            var expectedSegmentPath = fixtureManifest.SegmentPaths[0];
            var retainedSegmentFileName = Path.GetFileName(readResult.SegmentPath);
            if (!string.Equals(Path.GetFileName(expectedSegmentPath), retainedSegmentFileName, StringComparison.Ordinal))
            {
                errors.Add(
                    $"Manifest segment path {expectedSegmentPath} does not match retained segment file {retainedSegmentFileName}.");
            }
        }

        if (fixtureManifest.ExpectedPacketCount != readResult.Packets.Length)
        {
            errors.Add(
                $"Manifest expectedPacketCount {fixtureManifest.ExpectedPacketCount} does not match retained packet count {readResult.Packets.Length}.");
        }

        var firstPacketSequence = readResult.Packets.Length == 0 ? 0UL : readResult.Packets[0].PacketSequence;
        var lastPacketSequence = readResult.Packets.Length == 0 ? 0UL : readResult.Packets[^1].PacketSequence;
        if (fixtureManifest.ExpectedFirstPacketSequence != firstPacketSequence)
        {
            errors.Add(
                $"Manifest expectedFirstPacketSequence {fixtureManifest.ExpectedFirstPacketSequence} does not match retained first sequence {firstPacketSequence}.");
        }

        if (fixtureManifest.ExpectedLastPacketSequence != lastPacketSequence)
        {
            errors.Add(
                $"Manifest expectedLastPacketSequence {fixtureManifest.ExpectedLastPacketSequence} does not match retained last sequence {lastPacketSequence}.");
        }

        if (!string.Equals(fixtureManifest.ExpectedAuthoritativeOutcome, readResult.AuthoritativeOutcome, StringComparison.Ordinal))
        {
            errors.Add(
                $"Manifest expectedAuthoritativeOutcome {fixtureManifest.ExpectedAuthoritativeOutcome} does not match retained outcome {readResult.AuthoritativeOutcome}.");
        }

        if (!string.Equals(fixtureManifest.ExpectedCorruptionClass, readResult.CorruptionClass, StringComparison.Ordinal))
        {
            errors.Add(
                $"Manifest expectedCorruptionClass {fixtureManifest.ExpectedCorruptionClass} does not match retained corruption class {readResult.CorruptionClass}.");
        }

        if (fixtureManifest.ExpectedRolloverBoundaryPresent)
        {
            errors.Add("Manifest expected a rollover boundary, but the current reader surface only validates one single segment.");
        }

        return new TransportManifestValidationResult
        {
            Passed = errors.Count == 0,
            Errors = errors.ToArray()
        };
    }

    private static void ValidateSegmentExpectationSet(
        TransportSegmentReadResult readResult,
        TransportFixtureManifest fixtureManifest,
        List<string> errors)
    {
        if (fixtureManifest.SegmentExpectations.Length != fixtureManifest.ExpectedSegmentCount)
        {
            errors.Add(
                $"Manifest segmentExpectations count {fixtureManifest.SegmentExpectations.Length} does not match expectedSegmentCount {fixtureManifest.ExpectedSegmentCount}.");
        }

        var retainedSegmentFileName = Path.GetFileName(readResult.SegmentPath);
        var matchedExpectation = fixtureManifest.SegmentExpectations.FirstOrDefault(
            expectation => string.Equals(
                Path.GetFileName(expectation.SegmentPath),
                retainedSegmentFileName,
                StringComparison.Ordinal));
        if (matchedExpectation is null)
        {
            errors.Add(
                $"Manifest segmentExpectations do not include retained segment file {retainedSegmentFileName}.");
            return;
        }

        if (fixtureManifest.SegmentPaths.Length > 0
            && !fixtureManifest.SegmentPaths.Any(
                segmentPath => string.Equals(
                    Path.GetFileName(segmentPath),
                    retainedSegmentFileName,
                    StringComparison.Ordinal)))
        {
            errors.Add(
                $"Manifest segmentPaths do not include retained segment file {retainedSegmentFileName}.");
        }

        if (matchedExpectation.ExpectedPacketCount != readResult.Packets.Length)
        {
            errors.Add(
                $"Manifest segment expectation expectedPacketCount {matchedExpectation.ExpectedPacketCount} does not match retained packet count {readResult.Packets.Length}.");
        }

        var firstPacketSequence = readResult.Packets.Length == 0 ? 0UL : readResult.Packets[0].PacketSequence;
        var lastPacketSequence = readResult.Packets.Length == 0 ? 0UL : readResult.Packets[^1].PacketSequence;
        if (matchedExpectation.ExpectedFirstPacketSequence != firstPacketSequence)
        {
            errors.Add(
                $"Manifest segment expectation expectedFirstPacketSequence {matchedExpectation.ExpectedFirstPacketSequence} does not match retained first sequence {firstPacketSequence}.");
        }

        if (matchedExpectation.ExpectedLastPacketSequence != lastPacketSequence)
        {
            errors.Add(
                $"Manifest segment expectation expectedLastPacketSequence {matchedExpectation.ExpectedLastPacketSequence} does not match retained last sequence {lastPacketSequence}.");
        }

        if (!string.Equals(
                matchedExpectation.ExpectedAuthoritativeOutcome,
                readResult.AuthoritativeOutcome,
                StringComparison.Ordinal))
        {
            errors.Add(
                $"Manifest segment expectation expectedAuthoritativeOutcome {matchedExpectation.ExpectedAuthoritativeOutcome} does not match retained outcome {readResult.AuthoritativeOutcome}.");
        }

        if (!string.Equals(
                matchedExpectation.ExpectedCorruptionClass,
                readResult.CorruptionClass,
                StringComparison.Ordinal))
        {
            errors.Add(
                $"Manifest segment expectation expectedCorruptionClass {matchedExpectation.ExpectedCorruptionClass} does not match retained corruption class {readResult.CorruptionClass}.");
        }
    }
}
