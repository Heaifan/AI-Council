using Council.Protocol.Registry;

namespace Council.Protocol.Tests;

/// <summary>TEST-01 / TEST-02 / TEST-05：Available 与 Invalid 的基本划分。</summary>
public sealed class ProtocolRegistryTests
{
    [Fact(DisplayName = "TEST-01 单个合法 Protocol 进入 Available")]
    public void SingleValidProtocolIsAvailable()
    {
        using var temp = new TempProtocolsRoot();
        ProtocolSamples.Write(temp.Root, "committee-mvp", ProtocolSamples.ValidCommitteeMvp);

        var registry = new ProtocolRegistryBuilder().Build(temp.Root);

        Assert.Single(registry.Available);
        Assert.Empty(registry.Invalid);

        var protocol = registry.Available[0];
        Assert.Equal("committee-mvp", protocol.ProtocolId);
        Assert.Equal("0.1.0", protocol.Version);
        Assert.Equal("0.1.0", protocol.SchemaVersion);
        Assert.Equal("Committee MVP Protocol", protocol.Name);
        Assert.NotNull(registry.Find("committee-mvp", "0.1.0"));
    }

    [Fact(DisplayName = "TEST-02 两个合法 Protocol 全部进入 Available")]
    public void TwoValidProtocolsAreAvailable()
    {
        using var temp = new TempProtocolsRoot();
        ProtocolSamples.Write(temp.Root, "committee-mvp", ProtocolSamples.ValidCommitteeMvp);
        ProtocolSamples.Write(
            temp.Root,
            "committee-alt",
            ProtocolSamples.WithProtocolId(ProtocolSamples.ValidCommitteeMvp, "committee-alt"));

        var registry = new ProtocolRegistryBuilder().Build(temp.Root);

        Assert.Equal(2, registry.Available.Count);
        Assert.Empty(registry.Invalid);
        Assert.Equal(
            new[] { "committee-alt@0.1.0", "committee-mvp@0.1.0" },
            registry.Available.Select(p => p.Key).ToArray());
    }

    [Fact(DisplayName = "TEST-05 好坏共存：坏规则被隔离，应用仍然完成初始化")]
    public void BadProtocolDoesNotBlockStartup()
    {
        using var temp = new TempProtocolsRoot();
        ProtocolSamples.Write(temp.Root, "good-a", ProtocolSamples.ValidCommitteeMvp);
        ProtocolSamples.Write(temp.Root, "broken-b", "{\n  \"protocol_id\":\n");
        ProtocolSamples.Write(
            temp.Root,
            "good-c",
            ProtocolSamples.WithProtocolId(ProtocolSamples.ValidCommitteeMvp, "committee-c"));

        var registry = new ProtocolRegistryBuilder().Build(temp.Root);

        Assert.Equal(2, registry.Available.Count);
        Assert.Single(registry.Invalid);
        Assert.Contains("broken-b", registry.Invalid[0].FilePath, StringComparison.Ordinal);
        Assert.DoesNotContain(registry.Available, p => p.FilePath.Contains("broken-b", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "空规则库不是致命错误")]
    public void MissingProtocolsDirectoryYieldsEmptyRegistry()
    {
        using var temp = new TempProtocolsRoot();
        var registry = new ProtocolRegistryBuilder().Build(Path.Combine(temp.Root, "does-not-exist"));

        Assert.Empty(registry.Available);
        Assert.Empty(registry.Invalid);
    }

    [Fact(DisplayName = "仓库内置 protocols/ 目录可被正常加载")]
    public void RepositoryProtocolsDirectoryLoads()
    {
        var root = Path.Combine(ProtocolSamples.RepositoryRoot, "protocols");
        var registry = new ProtocolRegistryBuilder().Build(root);

        Assert.Empty(registry.Invalid);
        Assert.Contains(registry.Available, p => p.Key == "committee-mvp@0.1.0");
    }
}
