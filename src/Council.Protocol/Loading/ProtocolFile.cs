namespace Council.Protocol.Loading;

/// <summary>
/// 已成功读取并完成 JSON 解析的 Protocol 文件。
/// <para>
/// <see cref="RawJson"/> 是加载瞬间的冻结文本快照。
/// 之后磁盘上的同名文件即使被改写，本对象也不会变化——这是"不热加载"的物理基础。
/// </para>
/// </summary>
/// <param name="FilePath">文件绝对路径。</param>
/// <param name="FileName">文件名，便于日志与 UI 展示。</param>
/// <param name="RawJson">加载瞬间的原始 JSON 文本快照。</param>
/// <param name="Identity">尽力提取的身份信息。</param>
public sealed record ProtocolFile(
    string FilePath,
    string FileName,
    string RawJson,
    ProtocolIdentity Identity);
