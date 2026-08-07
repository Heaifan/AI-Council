namespace Council.Protocol.Diagnostics;

/// <summary>
/// 单条 JSON Schema 校验错误。
/// 一个 Protocol 可能同时违反多条规则；这些错误必须完整保留，不得只留第一条。
/// </summary>
/// <param name="JsonPath">出错实例位置，RFC 6901 指针的片段形式，根为 <c>#</c>。</param>
/// <param name="Keyword">触发错误的 Schema 关键字，例如 <c>required</c> / <c>enum</c> / <c>pattern</c>。</param>
/// <param name="Message">校验器给出的原始错误描述。</param>
/// <param name="SchemaLocation">对应的 Schema 位置，便于回溯到机器合同的哪一条约束。</param>
public sealed record SchemaViolation(
    string JsonPath,
    string Keyword,
    string Message,
    string? SchemaLocation)
{
    /// <inheritdoc />
    public override string ToString() => $"{JsonPath} [{Keyword}] {Message}";
}
