using Council.Protocol.Diagnostics;

namespace Council.Protocol.Registry;

/// <summary>
/// 应用启动时构建一次即冻结的 Protocol 注册表。
/// <para>
/// 制度约束（Council-Constitution §6.3 / F-022）：<b>Protocol 不支持热加载。</b>
/// 因此本类型刻意<b>不</b>提供 Reload / Refresh / Watch / 轮询 等任何刷新入口，
/// 也不持有 FileSystemWatcher。识别磁盘上新增或改动的 Protocol，只能重启应用。
/// </para>
/// <para>
/// 制度约束（Council-Constitution §6.4 / F-024、F-025）：
/// <see cref="Available"/> 与 <see cref="Invalid"/> 严格分离，坏规则既不污染可用集合，也不被静默丢弃。
/// </para>
/// </summary>
public sealed class ProtocolRegistry
{
    internal ProtocolRegistry(
        string protocolsRoot,
        IReadOnlyList<LoadedProtocol> available,
        IReadOnlyList<InvalidProtocol> invalid)
    {
        ProtocolsRoot = protocolsRoot;
        Available = available;
        Invalid = invalid;
        Diagnostics = invalid.Select(item => item.Diagnostic).ToArray();
        LoadedAt = DateTimeOffset.Now;
    }

    /// <summary>本次扫描使用的规则库根目录。</summary>
    public string ProtocolsRoot { get; }

    /// <summary>注册表冻结时刻。</summary>
    public DateTimeOffset LoadedAt { get; }

    /// <summary>可用 Protocol。</summary>
    public IReadOnlyList<LoadedProtocol> Available { get; }

    /// <summary>被隔离的 Protocol。</summary>
    public IReadOnlyList<InvalidProtocol> Invalid { get; }

    /// <summary>全部隔离原因，供 UI 直接展示。</summary>
    public IReadOnlyList<ProtocolDiagnostic> Diagnostics { get; }

    /// <summary>按 <c>protocol_id + version</c> 精确查找可用 Protocol。</summary>
    public LoadedProtocol? Find(string protocolId, string version) =>
        Available.FirstOrDefault(p =>
            string.Equals(p.ProtocolId, protocolId, StringComparison.Ordinal)
            && string.Equals(p.Version, version, StringComparison.Ordinal));
}
