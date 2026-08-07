using System.Text;
using Council.Cli;
using Council.Protocol.Registry;

// D1-R1 调试出口：证明 Available / Invalid 与完整 Diagnostic 数据确实存在。
// 这不是产品 UI，本轮刻意不做规则管理界面。
Console.OutputEncoding = Encoding.UTF8;

var root = args.Length > 0 ? args[0] : ResolveDefaultRoot();
if (root is null)
{
    Console.Error.WriteLine("未找到 protocols 目录。用法：Council.Cli <protocols-dir>");
    return 2;
}

var registry = new ProtocolRegistryBuilder().Build(root, new ConsoleProtocolLoadLog());

Console.WriteLine();
Console.WriteLine($"Available ({registry.Available.Count}):");
foreach (var protocol in registry.Available)
{
    Console.WriteLine($"  {protocol.Key}  \"{protocol.Name}\"  schema={protocol.SchemaVersion}");
    Console.WriteLine($"      <- {Relative(root, protocol.FilePath)}");
}

Console.WriteLine();
Console.WriteLine($"Invalid ({registry.Invalid.Count}):");
foreach (var item in registry.Invalid)
{
    var diagnostic = item.Diagnostic;
    Console.WriteLine($"  file        : {Relative(root, diagnostic.FilePath)}");
    Console.WriteLine($"  protocol_id : {diagnostic.ProtocolId ?? "(unknown)"}");
    Console.WriteLine($"  version     : {diagnostic.ProtocolVersion ?? "(unknown)"}");
    Console.WriteLine($"  code        : {diagnostic.CodeText}");
    Console.WriteLine($"  json_path   : {diagnostic.JsonPath ?? "(n/a)"}");
    Console.WriteLine($"  message     : {diagnostic.Message}");
    foreach (var violation in diagnostic.Details)
    {
        Console.WriteLine($"      - {violation}");
    }

    Console.WriteLine();
}

return 0;

static string Relative(string root, string path) =>
    Path.GetRelativePath(root, path).Replace('\\', '/');

static string? ResolveDefaultRoot()
{
    var directory = new DirectoryInfo(AppContext.BaseDirectory);
    while (directory is not null)
    {
        var candidate = Path.Combine(directory.FullName, "protocols");
        if (Directory.Exists(candidate))
        {
            return candidate;
        }

        directory = directory.Parent;
    }

    return null;
}
