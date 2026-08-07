namespace Council.Protocol.Registry;

/// <summary>
/// 通过 <c>protocol.schema.json</c> 校验、且身份唯一，因而进入 Available 的 Protocol。
/// <para>
/// <see cref="RawJson"/> 是加载瞬间的冻结快照。会议运行期只应引用本快照，
/// 不得回读磁盘（Procedure-Execution-Protocol §8 / F-023）。
/// </para>
/// </summary>
/// <param name="ProtocolId">Protocol 标识。</param>
/// <param name="Version">Protocol 自身内容版本。</param>
/// <param name="SchemaVersion">该 Protocol 使用的机器合同版本。</param>
/// <param name="Name">显示名。</param>
/// <param name="FilePath">来源文件绝对路径。</param>
/// <param name="RawJson">加载瞬间的原始 JSON 文本快照。</param>
public sealed record LoadedProtocol(
    string ProtocolId,
    string Version,
    string SchemaVersion,
    string Name,
    string FilePath,
    string RawJson)
{
    /// <summary>注册表主键，形如 <c>committee-mvp@0.1.0</c>。</summary>
    public string Key => $"{ProtocolId}@{Version}";
}
