namespace Council.Protocol.Diagnostics;

/// <summary>
/// Protocol 加载 / 校验失败的结构化描述。
/// 制度约束（Council-Constitution §6.4 / F-025）：坏规则禁止静默忽略，
/// 因此每一次隔离都必须留下一条本记录，且信息量足以让 UI 直接显示
/// 文件、Protocol ID、版本、错误代码、JSON Path 与具体错误。
/// </summary>
public sealed record ProtocolDiagnostic
{
    /// <summary>失败分类。</summary>
    public required DiagnosticCode Code { get; init; }

    /// <summary>严重级别。</summary>
    public required DiagnosticSeverity Severity { get; init; }

    /// <summary>出问题的 Protocol 文件绝对路径。任何情况下都不为空。</summary>
    public required string FilePath { get; init; }

    /// <summary>尽力提取的 protocol_id；JSON 都无法解析时为 null。</summary>
    public string? ProtocolId { get; init; }

    /// <summary>尽力提取的 version；JSON 都无法解析或该字段缺失时为 null。</summary>
    public string? ProtocolVersion { get; init; }

    /// <summary>主要出错位置。Schema 校验失败时取首条违规位置。</summary>
    public string? JsonPath { get; init; }

    /// <summary>面向人的摘要说明。</summary>
    public required string Message { get; init; }

    /// <summary>完整的 Schema 违规列表；非 Schema 类错误为空。</summary>
    public IReadOnlyList<SchemaViolation> Details { get; init; } = Array.Empty<SchemaViolation>();

    /// <summary>对外稳定字符串代码。</summary>
    public string CodeText => Code.ToWire();

    /// <inheritdoc />
    public override string ToString() =>
        $"[{CodeText}] {FilePath} ({ProtocolId ?? "?"}@{ProtocolVersion ?? "?"}): {Message}";
}
