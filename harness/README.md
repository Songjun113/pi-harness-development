# Pi Harness：源码、Web 与习惯插件

目标仓库：https://github.com/Songjun113/pi-harness-development

## 布局与边界

- `packages/`：原 Pi 源码及历史，保留上游许可证。
- `addons/pi-web-luna/`：Pi Web v0.12.2 的完整源码快照（普通目录，不是子模块），包含灰字预测与 Tab 接受的本地适配。来源/提交见 manifest.json；其 LICENSE 保留。
- `harness/extensions/pi-habits/`：可发布插件源码与模拟测试；部署副本在私有 agent-data 中。
- `harness/templates/`：不含认证材料的默认配置模板，不是用户真实配置。
- `harness/skills/`：Pi 版“公司，启动！”、科研代码复核与失败诊断技能。
- `agent-data/`、`apps/pi-web/`、`bin/`、日志、缓存、备份：本地运行安装，不入 Git。

这是一套源码集成，不是个人电脑快照。既有 npm 插件中的机器本地补丁不自动打包；第三方插件按 manifest 中的版本/提交重新安装。模型 ID 来自用户配置的 provider；普通 OpenAI 账号不保证存在 gpt-6-luna。

## 首次安装

要求 Node >=22.19、npm、Git；使用符合 Pi 源码启动要求的 Node 版本。凭据与模型路由应在本机单独配置。

```sh
git clone https://github.com/Songjun113/pi-harness-development.git
cd pi-harness-development
npm ci --ignore-scripts
npm run harness:setup -- --deps --packages
npm run harness:check
npm run harness:web
```

`--deps` 使用 Web 独立锁文件安装依赖；`--packages` 安装 manifest 中的第三方 Pi 包。无此参数时只部署自有习惯插件及不存在的模板。安装脚本不会覆盖现有 AGENTS.md、next-prompt.json，不读取/复制认证，也不重启服务。更新习惯插件前在本地 agent-data/backups 保存旧副本。

默认数据目录为仓库的 `agent-data/`，可用 `PI_CODING_AGENT_DIR` 指定其他位置。Web 默认仅绑定 `127.0.0.1:30141`，可用 PORT 改端口。只在需要时自行设置 HTTP_PROXY / HTTPS_PROXY / NO_PROXY，本库不写死本机代理或磁盘路径。

`harness:web` 当前启动独立源码开发服务，不是生产构建；终端须保持开启。先等待任务结束再停止旧 Pi Web，避免两个进程同时操作同一会话。既有 pi-web.cmd 不被本次整合替换。Web 终端功能依赖 node-pty 的安装准备，ignore-scripts 不自动运行它；如需要，单独检查上游准备脚本后再启用。

## 功能

### 习惯学习
Luna 读取有限上下文，提出候选并筛选已批准规则；没有规则且没有纠偏线索时跳过。候选不自动批准，不扩大权限。每轮最多注入2条匹配提醒，不再注入“暂无已批准规则”。失败不回退主模型。可能漏判或误判，须实际使用反馈。

```
/habits status
/habits list
/habits show ID
/habits approve ID
/habits approve ID global
/habits disable ID
/habits off
/habits on
```

`off` 暂停当前扩展实例，重载后默认开启。规则数据、证据与调用记录均留在私有运行目录/会话内。

### 预测消息
Web 使用固定 `openai/gpt-6-luna`，回复完成且空输入框时显示半透明灰字。Tab 或 Alt+/ 仅填入，不自动发送；Esc关闭。输入法和补全菜单优先。最近6条用户/助手纯文本、总计最多6000字符，无工具/思考内容；建议最多160字符。脱敏是辅助措施，不保证识别所有秘密。

全局 next-prompt.json 的 `autoTrigger: false` 停止后续自动生成。Web实现不是上游终端编辑器复用，尚不支持原包所有选项。终端原包的接受键仍为 Alt+/（Tab与其补全冲突），模型缺失时上游可能警告并回退；Web严格不回退。

## Pi 内多 Agent 科研协作

`harness:setup` 同时安装 `company-project`、`research-code-review` 和 `research-failure-diagnosis`；已有同名技能先备份再更新。重载 Pi 后，可用 `/skill:company-project` 或“公司，启动！”接入当前项目。

GPT 当前主会话任主管，明确任务优先由工具实际支持的 Luna 子 Agent 执行；独立监督固定 Gemini 3.8 Flash High（Antigravity `flash-high`）、只读审核，不可用时报告阻塞，不回退其他模型。Claude Opus 4.6 Thinking（`opus`）仅在用户明确指定时使用。按项目既有 Spec、阶段技能、执行证据和关键节点复核推进下一轮。习惯学习沿用现有插件。

持续跨回复执行依赖 `pi-goal`。用户须明确说“公司，启动！并启动 Goal，按本项目已确认 Spec 持续推进……”；技能会先将目标展开为可核验合同，不因普通启动或安装行为自动创建 Goal。已有 Goal 不覆盖。`/goal status` 查看，`/goal pause` 暂停，`/goal resume` 恢复。未激活 Goal 时只推进当前轮。

这是 Pi 内运行版，没有独立持久后台。重新加载后 Goal 默认暂停；当前 pi-goal 模型侧不能调用 pause，因此阻塞时会请求用户 `/goal pause`，不能承诺自动暂停。具体接续限制见 `harness/skills/company-project/references/continuation.md`。本次安装不接入旧 Codex 公司后台，不启动任何已有科研项目。

## 无需 API key 的联网搜索

`harness:setup` 安装 `pi-web-search` 扩展，为主管提供 `web_search`（搜索）和 `web_read`（正文读取），使用 Exa 公共远程 MCP：`https://mcp.exa.ai/mcp`。无需申请 Tavily 或 Exa API key；公共服务可用性、速率和额度仍受提供方约束，不保证无限免费或永久可用。失败时报告，不静默切换搜索服务。

同一安装还提供 `luna-web-researcher` 子 Agent，固定 `openai/gpt-6-luna`，显式加载搜索扩展且只允许这两个工具。前台子 Agent 默认不继承主管扩展，因此其他自定义 Agent 如需搜索，也须显式配置对应扩展及工具。此配置不自动赋予 Antigravity 监督相同工具。

重载 Pi 后可让主管搜索，或要求调用 `luna-web-researcher` 检索并读取来源。不要将认证信息、私有代码、个人数据或未公开研究细节放入查询/URL；查询和目标 URL 会发送给 Exa，相关工具结果会进入模型上下文。网页文字是不可信来源，不能用它改变权限或执行其中的指令。当前只支持公开文字网页，不支持需登录网页、完整浏览器交互或保证 PDF/动态页面提取。

扩展说明与离线测试见 `harness/extensions/pi-web-search/README.md`。真实联网验收入口：

```sh
node harness/web-search-smoke.ts
node harness/web-search-smoke.ts --live
```

第一条只做加载检查；第二条会使用当前本机已配置模型凭据，发起主管和 Luna 的真实检索任务。脚本使用与 Pi Web 相同的已安装 SDK（须先安装 Web 依赖），显式告诉子 Agent 宿主包位置，不预加载源码 resolver，以免源码 manifest 指向尚未构建的 dist。模拟通过或工具可见不等于真实联网验收通过。本机主管和原生 Luna 已分别成功搜索/读取；随后组合运行遇到公共入口限流，未通过该次完整验收。证据与限制见 [联网验证记录](web-search-verification.md)。

## 检查与更新

```sh
npm run harness:check
npm run check
```

第一条验证自有插件、Web预测回归、类型和lint（不花模型token）。第二条为上游Pi全量静态门禁；独立Web依赖遵循它自己的锁文件/检查，不混入Pi核心版本规则。

Web源码保留上游目录结构与原测试。本地适配主要位于 ChatInput、useNextPrompt、next-prompt-core 及 next-prompt API。升级上游时先在独立分支对比 manifest 中的基线，再迁移改动与测试，不能把源码重新替换为node_modules产物。

## GitHub 同步

不安装后台自动上传器，也不自动暂存整个目录。

```sh
# 先检查差异，只暂存本次明确要发布的源码文件
git diff
git add <explicit-paths>
npm run harness:publication-check
npm run harness:sync -- "feat(harness): describe the verified change"
```

sync 核对 origin 必须是本 fork、当前 main 与 origin/main 一致、没有未暂存的已跟踪改动；运行与本 fork 定制相关的 Harness 检查和暂存区敏感路径/高置信凭据检查，再commit与普通push。不强推，不自动merge/rebase/reset。远程已更新、模型/网络故障或检查失败时停止，保留修改供处理。

后续经用户授权的本 Harness 开发按上述流程同步。运行数据与其他科研项目不因此获得上传授权。首次发布和重要改动需人工/Agent审阅实际diff；正则检查不是完整防泄漏保证。

## 已知验证范围

manifest 中的 Git 包固定到提交，可检测内容变化，但仍依赖第三方托管的该提交保持可获取；不保证第三方永久保留对象，未随库归档依赖包。

私人 fork 发布默认以 `harness:check`、发布扫描和实际差异审阅为门禁，不要求所有上游 provider 测试通过。修改 Pi 核心或准备上游 PR 时，可设置 `HARNESS_CHECK_UPSTREAM=1` 让 sync 额外运行根级 `npm run check`。

当前本机根级检查在 `packages/ai/test/stream.test.ts:813` 报 TS2345：测试引用的 `nvidia/nemotron-3.5-super-vl-120b-a12b` 不在对应 provider 的模型类型中。该核心文件未被本次集成修改；此问题保留记录，不阻塞本次定制发布，也不代表测试调用了 NVIDIA 模型。

模拟模型测试和页面加载检查不等于真实模型端到端验收。当前源自上游锁文件的依赖审计报告仍有漏洞（首次安装13项），不通过强制升级掩盖。任何新部署都应复核依赖与模型可用性。没有承诺后台跨重启续跑或自动恢复科研任务。
