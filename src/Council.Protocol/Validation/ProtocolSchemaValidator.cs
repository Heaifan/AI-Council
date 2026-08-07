using System.Text.Json;
using Council.Protocol.Diagnostics;
using Json.Schema;

namespace Council.Protocol.Validation;

/// <summary>
/// 以正式 <c>protocol.schema.json</c> 为唯一依据做结构校验。
/// <para>
/// 约束（D1-R1 §6）：这里不存在任何与 Schema 平行的手工 required 字段判断；
/// 跨字段 / 图结构语义校验（可达性、Human Gate、<c>$end</c>、死循环、数量逻辑）
/// 属于 D1-R2，本轮不实现。
/// </para>
/// </summary>
public sealed class ProtocolSchemaValidator
{
    private static readonly EvaluationOptions Options = new()
    {
        // List 输出保留全部违规项，而不是遇到第一条就短路。
        OutputFormat = OutputFormat.List
    };

    private readonly JsonSchema _schema;

    /// <summary>使用内嵌的正式机器合同。</summary>
    public ProtocolSchemaValidator()
        : this(ProtocolSchemaSource.Load())
    {
    }

    /// <summary>使用指定 Schema，主要供测试注入。</summary>
    public ProtocolSchemaValidator(JsonSchema schema) => _schema = schema;

    /// <summary>
    /// 校验一段 Protocol JSON 文本。
    /// 返回完整违规列表（合法时为空）；调用方必须保证文本已经过 JSON 解析。
    /// </summary>
    public IReadOnlyList<SchemaViolation> Validate(string rawJson)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawJson);

        using var document = JsonDocument.Parse(rawJson);
        var evaluation = _schema.Evaluate(document.RootElement, Options);
        if (evaluation.IsValid)
        {
            return Array.Empty<SchemaViolation>();
        }

        var violations = new List<SchemaViolation>();
        var details = evaluation.Details;
        if (details is not null)
        {
            foreach (var detail in details)
            {
                if (detail.IsValid || detail.Errors is null)
                {
                    continue;
                }

                var instancePath = "#" + detail.InstanceLocation;
                var schemaLocation = detail.SchemaLocation.ToString();
                foreach (var error in detail.Errors)
                {
                    var keyword = string.IsNullOrEmpty(error.Key) ? "schema" : error.Key;
                    violations.Add(new SchemaViolation(instancePath, keyword, error.Value, schemaLocation));
                }
            }
        }

        return violations
            .OrderBy(v => v.JsonPath, StringComparer.Ordinal)
            .ThenBy(v => v.Keyword, StringComparer.Ordinal)
            .ToArray();
    }
}
