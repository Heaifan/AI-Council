using System.Security;
using System.Text.Json;
using Council.Protocol.Diagnostics;

namespace Council.Protocol.Loading;

/// <summary>
/// Protocol 文件 → 读取 → JSON 解析 → 原始 Protocol / 解析错误。
/// <para>
/// 职责边界（D1-R1 §5.1）：本类型<b>不</b>负责 Schema 校验、语义校验、
/// Meeting Runtime、Agent 调度、UI、Prompt 或 Transport。
/// </para>
/// </summary>
public sealed class ProtocolLoader
{
    private const string SearchPattern = "*.json";

    private static readonly JsonDocumentOptions ParseOptions = new()
    {
        CommentHandling = JsonCommentHandling.Disallow,
        AllowTrailingCommas = false
    };

    /// <summary>
    /// 扫描 protocols 根目录（含子目录）下的全部 <c>*.json</c>。
    /// 结果按完整路径序排列，保证同一磁盘状态下扫描顺序确定。
    /// 目录不存在时返回空集合，而不是抛异常——空规则库不是应用级致命错误。
    /// </summary>
    public IReadOnlyList<ProtocolLoadResult> LoadDirectory(string protocolsRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(protocolsRoot);

        if (!Directory.Exists(protocolsRoot))
        {
            return Array.Empty<ProtocolLoadResult>();
        }

        var paths = Directory
            .EnumerateFiles(protocolsRoot, SearchPattern, SearchOption.AllDirectories)
            .OrderBy(path => path, StringComparer.Ordinal)
            .ToArray();

        var results = new List<ProtocolLoadResult>(paths.Length);
        foreach (var path in paths)
        {
            results.Add(LoadFile(path));
        }

        return results;
    }

    /// <summary>读取并解析单个 Protocol 文件。任何失败都转成 Diagnostic，不向上抛。</summary>
    public ProtocolLoadResult LoadFile(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);

        string raw;
        try
        {
            raw = File.ReadAllText(filePath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SecurityException)
        {
            return ProtocolLoadResult.Failed(new ProtocolDiagnostic
            {
                Code = DiagnosticCode.FileReadFailed,
                Severity = DiagnosticSeverity.Error,
                FilePath = filePath,
                Message = $"无法读取 Protocol 文件：{ex.Message}"
            });
        }

        try
        {
            using var document = JsonDocument.Parse(raw, ParseOptions);
            var identity = ProtocolIdentity.Read(document.RootElement);
            return ProtocolLoadResult.Parsed(
                new ProtocolFile(filePath, Path.GetFileName(filePath), raw, identity));
        }
        catch (JsonException ex)
        {
            return ProtocolLoadResult.Failed(new ProtocolDiagnostic
            {
                Code = DiagnosticCode.JsonParseFailed,
                Severity = DiagnosticSeverity.Error,
                FilePath = filePath,
                JsonPath = ex.Path,
                Message = $"JSON 解析失败（行 {ex.LineNumber}，列 {ex.BytePositionInLine}）：{ex.Message}"
            });
        }
    }
}
