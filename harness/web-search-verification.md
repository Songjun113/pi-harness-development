# 无密钥联网验证记录

日期：2026-10-21。方案：Exa 公共远程 MCP；未配置 Tavily/Exa API key。

## 已验证

- Node 原生 fetch 调用固定 Exa 端点成功完成网页搜索及正文读取。
- GPT 主管 `openai/gpt-6.1-sol` 在 SDK 会话中实际调用 web_search 与 web_read，读取 `https://nodejs.org/api/typescript.html`。返回内容包含类型剥离不执行类型检查的说明。
- 主管通过 pi-subagents 原生前台工具启动 `luna-web-researcher`，不是两个平级 SDK 会话。子会话精确模型为 `openai/gpt-6-luna`；从该次工具返回的子会话记录核实 web_search、web_read 各成功一次，并读到 `https://docs.python.org/` 正文。
- 子模型返回了短事实与引用。搜索摘要与抓取正文中的版本号曾不一致，说明检索缓存/版本需要核对；本次只验证联网与读取能力，不以其证明某个 Python 版本结论。

## 实际遇到的限制

- 源码 SDK 的 package.json 指向未构建的 dist，pi-subagents 在动态 import 前调用 realpath，曾导致原生 child 启动失败。验收脚本已统一使用 Pi Web 的已安装 SDK，并显式设置本进程 child 宿主包位置；不预加载源码 resolver，不改 node_modules。此验证不代表源码 CLI 的该兼容问题已全局修复。
- 最新主管+子 Agent 组合验收中，主管两工具成功，但子 Agent 搜索遇到 Exa 免费 MCP 限流，未执行后续读取。完整组合运行应判为未通过，不能用之前单独成功覆盖这次失败。
- 已停止限流重试。扩展将识别已知的免费限流文字响应并报告错误，不静默更换提供者，也不尝试绕过限流。免费入口不能保证持续可用或高并发。
- 子工具证据来自原生工具回传的本次 child session 路径，读取后只汇总模型、工具次数与公开来源；不扫描历史科研会话，不提交测试会话与原始结果。

## 复核入口

离线检查：`npm run harness:check`。

真实请求（使用当前已配置模型凭据，有模型用量）：

```sh
node harness/web-search-smoke.ts --live
```

只验证原生子 Agent：追加 `--child-only`。公共服务限流时应等待恢复，不重复执行制造负载。
