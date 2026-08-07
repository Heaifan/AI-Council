using Council.Protocol.Diagnostics;
using Council.Protocol.Loading;

namespace Council.Protocol.Validation;

/// <summary>
/// <c>protocol_id + version</c> 唯一性检查。
/// <para>
/// 制度约束（D1-R1 §12）：两个文件声明相同 Protocol 身份时，
/// 不得由扫描顺序决定谁覆盖谁——冲突各方<b>全部</b>隔离，各自产生一条
/// <see cref="DiagnosticCode.DuplicateProtocol"/>。
/// </para>
/// </summary>
public sealed class DuplicateProtocolCheck
{
    /// <summary>
    /// 输入已通过 Schema 校验的文件集合，输出所有冲突方的诊断。
    /// 无冲突时返回空集合。
    /// </summary>
    public IReadOnlyList<ProtocolDiagnostic> Inspect(IReadOnlyList<ProtocolFile> files)
    {
        ArgumentNullException.ThrowIfNull(files);

        var diagnostics = new List<ProtocolDiagnostic>();
        var groups = files.GroupBy(file => file.Identity.Key, StringComparer.Ordinal);

        foreach (var group in groups)
        {
            var members = group.OrderBy(file => file.FilePath, StringComparer.Ordinal).ToArray();
            if (members.Length < 2)
            {
                continue;
            }

            foreach (var member in members)
            {
                diagnostics.Add(Conflict(member, members));
            }
        }

        return diagnostics;
    }

    private static ProtocolDiagnostic Conflict(ProtocolFile member, IReadOnlyList<ProtocolFile> members)
    {
        var others = members
            .Where(other => !ReferenceEquals(other, member))
            .Select(other => other.FilePath)
            .ToArray();

        return new ProtocolDiagnostic
        {
            Code = DiagnosticCode.DuplicateProtocol,
            Severity = DiagnosticSeverity.Error,
            FilePath = member.FilePath,
            ProtocolId = member.Identity.ProtocolId,
            ProtocolVersion = member.Identity.Version,
            JsonPath = "#/protocol_id",
            Message =
                $"Protocol 身份 '{member.Identity.Key}' 被 {members.Count} 个文件同时声明，"
                + $"全部隔离。冲突文件：{string.Join(", ", others)}"
        };
    }
}
