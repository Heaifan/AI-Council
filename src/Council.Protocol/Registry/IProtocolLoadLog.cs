namespace Council.Protocol.Registry;

/// <summary>
/// Protocol 加载日志出口。
/// <para>
/// 纪律（D1-R1 §19）：保持低噪声。允许记录注册表状态、加载成功的
/// <c>protocol_id@version</c>、被隔离的文件与代码；
/// 禁止打印整个 Protocol JSON，禁止逐字段输出。
/// </para>
/// </summary>
public interface IProtocolLoadLog
{
    /// <summary>记录一条加载信息。</summary>
    void Info(string message);
}

/// <summary>不输出任何内容的默认实现。</summary>
public sealed class SilentProtocolLoadLog : IProtocolLoadLog
{
    /// <summary>共享实例。</summary>
    public static SilentProtocolLoadLog Instance { get; } = new();

    private SilentProtocolLoadLog()
    {
    }

    /// <inheritdoc />
    public void Info(string message)
    {
    }
}
