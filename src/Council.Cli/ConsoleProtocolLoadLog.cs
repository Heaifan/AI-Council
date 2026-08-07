using Council.Protocol.Registry;

namespace Council.Cli;

/// <summary>把加载日志写到标准输出。保持低噪声，不打印 Protocol JSON。</summary>
public sealed class ConsoleProtocolLoadLog : IProtocolLoadLog
{
    /// <inheritdoc />
    public void Info(string message) => Console.WriteLine($"[protocol] {message}");
}
