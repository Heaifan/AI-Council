using System.Text.Json;

namespace Council.Protocol.Loading;

/// <summary>
/// 从 Protocol JSON 中尽力提取的身份信息，仅用于诊断展示与去重。
/// <para>
/// 注意：这里刻意<b>不是</b>与 Schema 平行的 required 字段判断。
/// 缺字段 / 类型不符一律返回 null，由 protocol.schema.json 去下正式结论。
/// </para>
/// </summary>
/// <param name="SchemaVersion">机器合同版本，决定用哪一版 Schema 来判它。</param>
/// <param name="ProtocolId">Protocol 标识。</param>
/// <param name="Version">Protocol 自身内容版本，与 <paramref name="SchemaVersion"/> 含义不同。</param>
/// <param name="Name">显示名。</param>
public sealed record ProtocolIdentity(
    string? SchemaVersion,
    string? ProtocolId,
    string? Version,
    string? Name)
{
    /// <summary>连 JSON 都无法解析时使用的空身份。</summary>
    public static ProtocolIdentity Unknown { get; } = new(null, null, null, null);

    /// <summary>去重键；任一部分缺失时仍可构造，但只有 Schema 合格的 Protocol 才会参与去重。</summary>
    public string Key => $"{ProtocolId ?? "?"}@{Version ?? "?"}";

    /// <summary>尽力读取根对象上的四个身份字段。</summary>
    public static ProtocolIdentity Read(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            return Unknown;
        }

        return new ProtocolIdentity(
            ReadString(root, "schema_version"),
            ReadString(root, "protocol_id"),
            ReadString(root, "version"),
            ReadString(root, "name"));
    }

    private static string? ReadString(JsonElement root, string propertyName) =>
        root.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
