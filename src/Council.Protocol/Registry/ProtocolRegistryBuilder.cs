using Council.Protocol.Diagnostics;
using Council.Protocol.Loading;
using Council.Protocol.Validation;

namespace Council.Protocol.Registry;

/// <summary>
/// 应用启动时构建 <see cref="ProtocolRegistry"/>：
/// 扫描 → 读取 → JSON 解析 → Schema 校验 → 身份去重 → 冻结。
/// <para>
/// 制度约束（Council-Constitution §6.4 / F-024）：单个 Protocol 失败只隔离该文件，
/// 不阻止应用启动。只有真正无法维持应用安全状态的系统级故障才允许向上抛。
/// </para>
/// </summary>
public sealed class ProtocolRegistryBuilder
{
    private readonly ProtocolLoader _loader;
    private readonly ProtocolStructureCheck _structure;
    private readonly DuplicateProtocolCheck _duplicates;

    /// <summary>使用默认加载器与内嵌正式机器合同。</summary>
    public ProtocolRegistryBuilder()
        : this(new ProtocolLoader(), new ProtocolStructureCheck(), new DuplicateProtocolCheck())
    {
    }

    /// <summary>注入自定义协作者，主要供测试使用。</summary>
    public ProtocolRegistryBuilder(
        ProtocolLoader loader,
        ProtocolStructureCheck structure,
        DuplicateProtocolCheck duplicates)
    {
        _loader = loader;
        _structure = structure;
        _duplicates = duplicates;
    }

    /// <summary>扫描一次并返回冻结后的注册表。本方法是本轮唯一的加载入口。</summary>
    public ProtocolRegistry Build(string protocolsRoot, IProtocolLoadLog? log = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(protocolsRoot);

        var sink = log ?? SilentProtocolLoadLog.Instance;
        sink.Info($"Protocol registry initializing. Root={protocolsRoot}");

        var quarantined = new List<InvalidProtocol>();
        var candidates = new List<ProtocolFile>();
        Partition(protocolsRoot, quarantined, candidates);

        foreach (var conflict in _duplicates.Inspect(candidates))
        {
            quarantined.Add(Quarantine(conflict));
        }

        var rejected = quarantined.Select(item => item.FilePath).ToHashSet(StringComparer.Ordinal);
        var available = candidates
            .Where(file => !rejected.Contains(file.FilePath))
            .Select(Accept)
            .OrderBy(protocol => protocol.ProtocolId, StringComparer.Ordinal)
            .ThenBy(protocol => protocol.Version, StringComparer.Ordinal)
            .ToArray();
        var invalid = quarantined
            .OrderBy(item => item.FilePath, StringComparer.Ordinal)
            .ToArray();

        Report(sink, available, invalid);
        return new ProtocolRegistry(protocolsRoot, available, invalid);
    }

    private void Partition(
        string protocolsRoot,
        List<InvalidProtocol> quarantined,
        List<ProtocolFile> candidates)
    {
        foreach (var result in _loader.LoadDirectory(protocolsRoot))
        {
            if (result.Diagnostic is { } readFailure)
            {
                quarantined.Add(Quarantine(readFailure));
                continue;
            }

            var file = result.File!;
            var structural = _structure.Inspect(file);
            if (structural is null)
            {
                candidates.Add(file);
            }
            else
            {
                quarantined.Add(Quarantine(structural));
            }
        }
    }

    private static InvalidProtocol Quarantine(ProtocolDiagnostic diagnostic) =>
        new(diagnostic.FilePath, diagnostic.ProtocolId, diagnostic.ProtocolVersion, diagnostic);

    /// <summary>Schema 已判定合格，四个身份字段必然存在。</summary>
    private static LoadedProtocol Accept(ProtocolFile file) => new(
        file.Identity.ProtocolId!,
        file.Identity.Version!,
        file.Identity.SchemaVersion!,
        file.Identity.Name!,
        file.FilePath,
        file.RawJson);

    private static void Report(
        IProtocolLoadLog sink,
        IReadOnlyList<LoadedProtocol> available,
        IReadOnlyList<InvalidProtocol> invalid)
    {
        foreach (var protocol in available)
        {
            sink.Info($"Loaded Protocol: {protocol.Key}");
        }

        foreach (var item in invalid)
        {
            sink.Info($"Protocol quarantined: {item.FilePath} ({item.Diagnostic.CodeText})");
        }

        sink.Info($"Protocol registry ready. Available={available.Count} Invalid={invalid.Count}");
    }
}
