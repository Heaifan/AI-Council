using System.Reflection;
using Council.Protocol.Registry;
using Xunit;

namespace Council.Protocol.Tests;

/// <summary>TEST-07：注册表在构建后冻结，磁盘新增 Protocol 不会被热加载。</summary>
public sealed class ProtocolNoHotReloadTests
{
    [Fact(DisplayName = "TEST-07 构建后新增文件不被热加载")]
    public void NoHotReloadAfterBuild()
    {
        using var temp = new TempProtocolsRoot();
        ProtocolSamples.Write(temp.Root, "initial", ProtocolSamples.ValidCommitteeMvp);

        var registry = new ProtocolRegistryBuilder().Build(temp.Root);
        Assert.Single(registry.Available);

        // 构建之后再往磁盘写入第二个合法 Protocol。
        ProtocolSamples.Write(
            temp.Root,
            "late",
            ProtocolSamples.WithProtocolId(ProtocolSamples.ValidCommitteeMvp, "committee-late"));

        // 注册表是冻结快照：数量与查找结果都不变。
        Assert.Single(registry.Available);
        Assert.Null(registry.Find("committee-late", "0.1.0"));
    }

    [Fact(DisplayName = "TEST-07b 注册表不暴露任何刷新入口")]
    public void NoReloadApiIsExposed()
    {
        var methods = typeof(ProtocolRegistry)
            .GetMethods()
            .Where(m => !m.Name.StartsWith("get_", System.StringComparison.Ordinal))
            .Select(m => m.Name)
            .ToHashSet(System.StringComparer.Ordinal);

        Assert.DoesNotContain("Reload", methods);
        Assert.DoesNotContain("Refresh", methods);
        Assert.DoesNotContain("Watch", methods);
    }
}
