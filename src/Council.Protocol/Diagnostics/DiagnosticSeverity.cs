namespace Council.Protocol.Diagnostics;

/// <summary>
/// Protocol 加载诊断的严重级别。
/// </summary>
public enum DiagnosticSeverity
{
    /// <summary>提示信息，不影响 Protocol 可用性。</summary>
    Info,

    /// <summary>警告，Protocol 仍可进入 Available。</summary>
    Warning,

    /// <summary>错误，Protocol 必须被隔离，禁止进入 Available。</summary>
    Error
}
