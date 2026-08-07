using Council.Protocol.Diagnostics;

namespace Council.Protocol.Registry;

/// <summary>
/// 被隔离（Quarantined）的 Protocol。
/// <para>
/// 两条硬约束：坏 Protocol 绝不进入 Available；坏 Protocol 也绝不被静默丢弃。
/// 它必须在这里留下完整可展示的证据。
/// </para>
/// </summary>
/// <param name="FilePath">来源文件绝对路径。</param>
/// <param name="ProtocolId">尽力提取的 protocol_id，可能为 null。</param>
/// <param name="Version">尽力提取的 version，可能为 null。</param>
/// <param name="Diagnostic">隔离原因。</param>
public sealed record InvalidProtocol(
    string FilePath,
    string? ProtocolId,
    string? Version,
    ProtocolDiagnostic Diagnostic);
