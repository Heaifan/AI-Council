namespace Council.Protocol.Tests;

/// <summary>
/// 测试样例一律取自仓库中的冻结基线 <c>schema/examples/</c>，
/// 不另造一套"测试专用 MVP Protocol"，避免测试与正式机器合同脱节。
/// </summary>
public static class ProtocolSamples
{
    /// <summary>仓库根目录（含 <c>schema/schemas/protocol.schema.json</c>）。</summary>
    public static string RepositoryRoot { get; } = FindRepositoryRoot();

    /// <summary>合法基线：committee-mvp。</summary>
    public static string ValidCommitteeMvp => ReadExample("valid-protocol-committee-mvp.json");

    /// <summary>非法基线：缺少正式 <c>version</c> 字段。</summary>
    public static string MissingVersion => ReadExample("invalid-protocol-schema.json");

    /// <summary>另一份非法样例：<c>lifecycle_status</c> 越出 enum，但身份字段仍可提取。</summary>
    public static string BadLifecycleStatus => ValidCommitteeMvp
        .Replace("\"lifecycle_status\": \"formal\"", "\"lifecycle_status\": \"draft\"", StringComparison.Ordinal);

    /// <summary>改写 protocol_id，用于构造第二个合法 Protocol。</summary>
    public static string WithProtocolId(string json, string protocolId) => json
        .Replace("\"protocol_id\": \"committee-mvp\"", $"\"protocol_id\": \"{protocolId}\"", StringComparison.Ordinal);

    /// <summary>写入 <c>&lt;root&gt;/&lt;folder&gt;/protocol.json</c>，返回文件路径。</summary>
    public static string Write(string root, string folder, string json)
    {
        var directory = Directory.CreateDirectory(Path.Combine(root, folder));
        var path = Path.Combine(directory.FullName, "protocol.json");
        File.WriteAllText(path, json);
        return path;
    }

    private static string ReadExample(string fileName) =>
        File.ReadAllText(Path.Combine(RepositoryRoot, "schema", "examples", fileName));

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "schema", "schemas", "protocol.schema.json")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new InvalidOperationException("未找到仓库根目录（schema/schemas/protocol.schema.json）。");
    }
}

/// <summary>一次性 protocols 根目录，测试结束后删除。</summary>
public sealed class TempProtocolsRoot : IDisposable
{
    /// <summary>创建临时目录。</summary>
    public TempProtocolsRoot() => Root = Directory.CreateTempSubdirectory("ai-council-").FullName;

    /// <summary>目录绝对路径。</summary>
    public string Root { get; }

    /// <inheritdoc />
    public void Dispose() => Directory.Delete(Root, recursive: true);
}
