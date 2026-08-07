using System.Reflection;
using Json.Schema;

namespace Council.Protocol.Validation;

/// <summary>
/// 正式机器合同 <c>protocol.schema.json</c> 的唯一来源。
/// <para>
/// 该 Schema 以 EmbeddedResource 直接引用仓库中的冻结基线
/// <c>schema/schemas/protocol.schema.json</c>，不复制、不改写，
/// 因此代码里不可能出现第二份与基线不一致的机器合同。
/// </para>
/// </summary>
public static class ProtocolSchemaSource
{
    /// <summary>当前 Runtime 支持的机器合同版本（对应 Protocol 的 <c>schema_version</c>）。</summary>
    public const string SupportedSchemaVersion = "0.1.0";

    private const string ResourceName = "Council.Protocol.protocol.schema.json";

    private static readonly Lazy<JsonSchema> EmbeddedSchema = new(ReadEmbedded, isThreadSafe: true);

    /// <summary>加载内嵌的正式 Protocol 机器合同。</summary>
    public static JsonSchema Load() => EmbeddedSchema.Value;

    /// <summary>从磁盘加载指定 Schema 文件，主要供测试与诊断工具使用。</summary>
    public static JsonSchema LoadFrom(string schemaFilePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(schemaFilePath);
        return JsonSchema.FromText(File.ReadAllText(schemaFilePath));
    }

    private static JsonSchema ReadEmbedded()
    {
        var assembly = typeof(ProtocolSchemaSource).GetTypeInfo().Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"未找到内嵌的机器合同资源：{ResourceName}");
        using var reader = new StreamReader(stream);
        return JsonSchema.FromText(reader.ReadToEnd());
    }
}
