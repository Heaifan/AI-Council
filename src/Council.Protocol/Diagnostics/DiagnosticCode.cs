namespace Council.Protocol.Diagnostics;

/// <summary>
/// D1-R1 阶段的 Protocol 加载失败分类。
/// 语义层错误（可达性、Human Gate、死循环等）属于 D1-R2，不在此枚举内。
/// </summary>
public enum DiagnosticCode
{
    /// <summary>文件存在但无法读取（IO / 权限）。</summary>
    FileReadFailed,

    /// <summary>文件内容不是合法 JSON。</summary>
    JsonParseFailed,

    /// <summary>JSON 合法但不满足 protocol.schema.json。</summary>
    SchemaValidationFailed,

    /// <summary>存在另一个 protocol_id + version 完全相同的 Protocol。</summary>
    DuplicateProtocol,

    /// <summary>声明的 schema_version 不是当前 Runtime 支持的机器合同版本。</summary>
    UnsupportedSchemaVersion
}

/// <summary>
/// <see cref="DiagnosticCode"/> 与对外稳定字符串代码之间的映射。
/// UI / 日志 / 报告一律使用字符串代码，避免枚举序号变化造成外部契约漂移。
/// </summary>
public static class DiagnosticCodeText
{
    /// <summary>转换为稳定的对外代码，例如 <c>SCHEMA_VALIDATION_FAILED</c>。</summary>
    public static string ToWire(this DiagnosticCode code) => code switch
    {
        DiagnosticCode.FileReadFailed => "FILE_READ_FAILED",
        DiagnosticCode.JsonParseFailed => "JSON_PARSE_FAILED",
        DiagnosticCode.SchemaValidationFailed => "SCHEMA_VALIDATION_FAILED",
        DiagnosticCode.DuplicateProtocol => "DUPLICATE_PROTOCOL",
        DiagnosticCode.UnsupportedSchemaVersion => "UNSUPPORTED_SCHEMA_VERSION",
        _ => throw new ArgumentOutOfRangeException(nameof(code), code, "未登记的 DiagnosticCode。")
    };
}
