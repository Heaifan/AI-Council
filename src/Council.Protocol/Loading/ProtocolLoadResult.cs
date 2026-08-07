using Council.Protocol.Diagnostics;

namespace Council.Protocol.Loading;

/// <summary>
/// 单个文件的加载结果：要么解析成功得到 <see cref="ProtocolFile"/>，
/// 要么失败并携带一条 <see cref="ProtocolDiagnostic"/>。二者必居其一，不存在"两者皆空"的静默失败。
/// </summary>
public sealed record ProtocolLoadResult
{
    private ProtocolLoadResult(ProtocolFile? file, ProtocolDiagnostic? diagnostic)
    {
        File = file;
        Diagnostic = diagnostic;
    }

    /// <summary>解析成功的文件；失败时为 null。</summary>
    public ProtocolFile? File { get; }

    /// <summary>失败诊断；成功时为 null。</summary>
    public ProtocolDiagnostic? Diagnostic { get; }

    /// <summary>是否读取并解析成功。</summary>
    public bool IsParsed => File is not null;

    /// <summary>构造成功结果。</summary>
    public static ProtocolLoadResult Parsed(ProtocolFile file) => new(file, null);

    /// <summary>构造失败结果。</summary>
    public static ProtocolLoadResult Failed(ProtocolDiagnostic diagnostic) => new(null, diagnostic);
}
