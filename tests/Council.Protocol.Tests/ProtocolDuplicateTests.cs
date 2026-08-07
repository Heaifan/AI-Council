using Council.Protocol.Registry;
using Xunit;

namespace Council.Protocol.Tests;

/// <summary>TEST-06：相同 protocol_id + version 的多个文件全部隔离，不由扫描顺序决定覆盖。</summary>
public sealed class ProtocolDuplicateTests
{
    [Fact(DisplayName = "TEST-06 重复 protocol_id@version 全部隔离")]
    public void DuplicateProtocolsAreAllQuarantined()
    {
        using var temp = new TempProtocolsRoot();
        // 两个不同文件夹写入内容完全一致的合法 Protocol（同 protocol_id、同 version）。
        var first = ProtocolSamples.Write(temp.Root, "z-first", ProtocolSamples.ValidCommitteeMvp);
        var second = ProtocolSamples.Write(temp.Root, "a-second", ProtocolSamples.ValidCommitteeMvp);

        var registry = new ProtocolRegistryBuilder().Build(temp.Root);

        // 冲突双方都进 Invalid，没有一个能进入 Available。
        Assert.Empty(registry.Available);
        Assert.Equal(2, registry.Invalid.Count);
        foreach (var item in registry.Invalid)
        {
            Assert.Equal("DUPLICATE_PROTOCOL", item.Diagnostic.CodeText);
            Assert.Equal("committee-mvp", item.Diagnostic.ProtocolId);
            Assert.Equal("0.1.0", item.Diagnostic.ProtocolVersion);
        }

        var quarantined = registry.Invalid.Select(i => i.FilePath).ToHashSet(System.StringComparer.Ordinal);
        Assert.Contains(first, quarantined);
        Assert.Contains(second, quarantined);
    }
}
