# Model Transport Specification v0.1

> 状态：Phase 0 制度冻结版  
> 目标：让会议系统不依赖某一个模型供应商或接入方式。

## 1. Transport 与 Agent 解耦

Agent 是逻辑参会者。

Transport 是“如何把 InstructionPacket 送到模型并把结果带回来”。

Protocol、Role、Runtime 不得依赖某个供应商专有 API 才能成立。

## 2. Transport 类型

正式规划四类 Transport：

```text
API
LOCAL
WEB_RELAY
WEB_AUTOMATION
```

## 3. v0.1 首选：WEB_RELAY

D3 先实现最简单、最透明的真实模型闭环：

```text
Instruction Compiler
→ 生成 Prompt
→ 用户复制到网页 AI
→ 用户粘贴回答
→ Validator
→ Runtime 接受并推进
```

这一步的价值是先验证：

> “真实模型输出能否遵守 Protocol 并进入确定性的会议 Runtime”

而不是先解决自动登录、浏览器控制或多供应商 API。

## 4. API

API Transport 后续负责直接调用模型服务。

API 密钥、供应商适配、流式输出、费用统计等属于 Transport 模块内部问题，不得反向污染 Protocol。

## 5. LOCAL

LOCAL Transport 用于本地模型/本地推理服务。

其调用接口应映射到与其他 Transport 相同的逻辑输入输出合同。

## 6. WEB_AUTOMATION

WEB_AUTOMATION 是后续扩展接口。

v0.1 不把浏览器自动化作为核心地基，避免在 Protocol Kernel 尚未稳定时引入网页变化、登录状态、DOM 差异等不确定因素。

## 7. Model Registry

Model Registry 记录可用模型资源及其 Transport 能力。

Role Card 不直接等同于 Registry Entry。

在半匿名/完全匿名会议中，UI 与其他 Agent 必须服从 Visibility Mode，不泄露被隐藏的底层模型身份。

## 8. 统一输入输出

Transport 接收的核心逻辑输入是 `InstructionPacket`。

Transport 返回的原始结果必须经过 Validator 后，才可成为正式会议事件。

## 9. 失败处理

Transport 失败必须与“Agent 观点本身”分离。

系统需要能够区分：

- 没有得到模型响应；
- 得到响应但格式不合规；
- 得到合法响应并被 Runtime 接受。

超时与重试次数在模块开发时冻结。

## 10. 开发顺序

```text
D1 Mock Agent
D2 Instruction Compiler
D3 WEB_RELAY
D4 多 Agent
D6 API / LOCAL / WEB_AUTOMATION
```

不要在 D1 同时接多个真实模型。
