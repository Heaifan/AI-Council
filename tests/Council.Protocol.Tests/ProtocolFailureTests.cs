using Council.Protocol.Registry;
using Xunit;

namespace Council.Protocol.Tests;

/// <summary>TEST-03 / TEST-04 / TEST-08：解析失败、Schema 缺失字段、诊断完整性。</summary>
public sealed class ProtocolFailureTests
{
    [Fact(DisplayName = "TEST-03 损坏 JSON 被隔离为 JSON_PARSE_FAILED")]
    public void CorruptedJsonIsQuarantined()
    {
        using var temp = new TempProtocolsRoot();
        ProtocolSamples.Write(temp.Root, "broken", "{\n  \"protocol_id\":\n");

        var registry = new ProtocolRegistryBuilder().Build(temp.Root);

        Assert.Empty(registry.Available);
        var item = Assert.Single(registry.Invalid);
        Assert.Equal("JSON_PARSE_FAILED", item.Diagnostic.CodeText);
        Assert.False(string.IsNullOrEmpty(item.FilePath));
    }

    [Fact(DisplayName = "TEST-04 缺 version 字段被 Schema 校验捕获")]
    public void MissingVersionFieldIsCaughtBySchema()
    {
        using var temp = new TempProtocolsRoot();
        // invalid-protocol-schema.json 顶层有 protocol_id 但无 version。
        ProtocolSamples.Write(temp.Root, "no-version", ProtocolSamples.MissingVersion);

        var registry = new ProtocolRegistryBuilder().Build(temp.Root);

        Assert.Empty(registry.Available);
        var item = Assert.Single(registry.Invalid);
        Assert.Equal("SCHEMA_VALIDATION_FAILED", item.Diagnostic.CodeText);
        Assert.Equal("committee-mvp", item.Diagnostic.ProtocolId);
        Assert.True(item.Diagnostic.Details.Count > 0);
        Assert.Contains(
            item.Diagnostic.Details,
            d => d.Message.Contains("version", System.StringComparison.OrdinalIgnoreCase));
    }

    [Fact(DisplayName = "TEST-08 隔离诊断暴露完整定位信息")]
    public void QuarantineDiagnosticIsComplete()
    {
        using var temp = new TempProtocolsRoot();
        // lifecycle_status 越出 enum，但身份字段（含 version）仍可提取。
        ProtocolSamples.Write(temp.Root, "bad-status", ProtocolSamples.BadLifecycleStatus);

        var registry = new ProtocolRegistryBuilder().Build(temp.Root);
        var item = Assert.Single(registry.Invalid);
        var d = item.Diagnostic;

        Assert.False(string.IsNullOrEmpty(d.FilePath));
        Assert.Equal("committee-mvp", d.ProtocolId);
        Assert.Equal("0.1.0", d.ProtocolVersion);
        Assert.Equal("SCHEMA_VALIDATION_FAILED", d.CodeText);
        Assert.False(string.IsNullOrEmpty(d.JsonPath));
        Assert.False(string.IsNullOrEmpty(d.Message));
        Assert.True(d.Details.Count > 0);
        Assert.Contains(
            d.Details, x => x.JsonPath.Contains("lifecycle_status", System.StringComparison.Ordinal));
    }
}
