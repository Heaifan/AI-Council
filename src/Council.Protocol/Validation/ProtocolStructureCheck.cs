using Council.Protocol.Diagnostics;
using Council.Protocol.Loading;

namespace Council.Protocol.Validation;

/// <summary>
/// 单个 Protocol 的结构准入判定：机器合同版本闸门 + 正式 Schema 校验。
/// <para>
/// 版本闸门只回答"该用哪一版机器合同来判它"，不代替 Schema 判断字段是否齐全；
/// 真正的结构结论一律来自 <see cref="ProtocolSchemaValidator"/>。
/// </para>
/// </summary>
public sealed class ProtocolStructureCheck
{
    private readonly ProtocolSchemaValidator _validator;

    /// <summary>使用内嵌的正式机器合同。</summary>
    public ProtocolStructureCheck()
        : this(new ProtocolSchemaValidator())
    {
    }

    /// <summary>注入自定义校验器，主要供测试使用。</summary>
    public ProtocolStructureCheck(ProtocolSchemaValidator validator) => _validator = validator;

    /// <summary>合格返回 null；不合格返回隔离原因。</summary>
    public ProtocolDiagnostic? Inspect(ProtocolFile file)
    {
        ArgumentNullException.ThrowIfNull(file);

        var declared = file.Identity.SchemaVersion;
        if (declared is not null && declared != ProtocolSchemaSource.SupportedSchemaVersion)
        {
            return UnsupportedVersion(file, declared);
        }

        var violations = _validator.Validate(file.RawJson);
        return violations.Count == 0 ? null : SchemaFailure(file, violations);
    }

    private static ProtocolDiagnostic UnsupportedVersion(ProtocolFile file, string declared) => new()
    {
        Code = DiagnosticCode.UnsupportedSchemaVersion,
        Severity = DiagnosticSeverity.Error,
        FilePath = file.FilePath,
        ProtocolId = file.Identity.ProtocolId,
        ProtocolVersion = file.Identity.Version,
        JsonPath = "#/schema_version",
        Message = $"不支持的机器合同版本 '{declared}'，"
            + $"当前 Runtime 只认 '{ProtocolSchemaSource.SupportedSchemaVersion}'。"
    };

    private static ProtocolDiagnostic SchemaFailure(
        ProtocolFile file,
        IReadOnlyList<SchemaViolation> violations) => new()
    {
        Code = DiagnosticCode.SchemaValidationFailed,
        Severity = DiagnosticSeverity.Error,
        FilePath = file.FilePath,
        ProtocolId = file.Identity.ProtocolId,
        ProtocolVersion = file.Identity.Version,
        JsonPath = violations[0].JsonPath,
        Message = $"protocol.schema.json 校验失败，共 {violations.Count} 处错误。",
        Details = violations
    };
}
