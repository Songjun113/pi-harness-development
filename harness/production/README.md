# Windows 长期运行部署

本工具不修改 Tailscale，不停止旧服务，不自动接管活跃会话。源目录继续用于开发；生产目录在私有 `agent-data/web-production`，不会发布密码、构建日志或会话。

## 已有边界

- 需要 PowerShell 7，以当前 Windows 用户运行。登录后自启动，不保证未登录可用。
- `configure` 隐藏输入独立的至少 16 字符密码；Export-Clixml 使用 Windows 当前用户 DPAPI 加密，不是明文。相同用户权限下的软件仍能解密，不防已取得该用户权限的攻击者。
- 切换必须在任务空闲时操作。旧服务停止后才能 select/run；不会自动迁移内存任务，也不承诺重启自动续跑。
- 服务只监听回环地址；密码和精确 Tailscale 主机校验都必须有效。不要启用公网 Funnel。
- 默认不持久化应用标准输出，避免日志包含项目内容。计划任务有状态/退出码及 3 次、间隔 1 分钟的失败重试。需要排错时可手动 run 看终端；持久内容日志/轮转尚未实现。
- Windows Job Object 确保 supervisor 退出时终止它拥有的 Node 树；不会杀其他 Node 进程。

## 准备候选版（不影响正在运行的开发版）

在仓库根目录：

```powershell
pwsh -NoProfile -File .\harness\production\prepare.ps1 -CopyDependencies -Build
```

只复制 Git 跟踪源文件（读取当前工作区内容，记录内容 SHA256，可能包含尚未提交的修改），不复制 .next、运行数据、环境文件。生产版本独立复制依赖，后续开发安装不会改变候选版；依赖不会在此自动更新。未跟踪代码若成为依赖应先单独审核纳入 Git，否则类型/构建应失败。

构建独立 HOME/USERPROFILE/agent 目录，避免 Next 文件追踪扫描真实用户目录。只有构建成功才生成 ready。失败版本不可 select。

```powershell
node .\harness\production\smoke.mjs '<候选目录绝对路径>'
pwsh -NoProfile -File .\harness\production\test.ps1
```

smoke 使用 30142 回环端口、随机临时密码和空 agent 目录，测试登录/资源/会话列表，无真实会话、模型调用或凭据。

## 安全保存配置

在自己本机交互式 PowerShell 7 中执行，不要向聊天发送密码：

```powershell
.\harness\production\manage.ps1 -Action configure -AllowedHost '<本机精确名称>.ts.net'
```

修改密码重复 configure；**正在运行的实例须重启才生效**。不要把 password.xml 和 Windows 用户密钥一起交给他人。此工具不尝试读取另一终端的临时密码。

## 约定空闲时切换

1. 确认没有运行中任务；保留当前会话链接。原服务窗口 Ctrl+C 停止。
2. `manage.ps1 -Action select -Release '<已测试候选版>'`，端口被占用将拒绝。
3. `manage.ps1 -Action run`。另一终端 `manage.ps1 -Action status` 应输出密码启用、匿名会话接口 401。
4. 手机通过现有 Tailscale HTTPS 登录，检查会话列表、切换、消息和重连。生产功能实测完成前不要删除旧环境。
5. 手动 run 测试后先停止；安装登录任务（只注册，不立即启动）：

```powershell
.\harness\production\manage.ps1 -Action install-task -ConfirmInstall
Start-ScheduledTask -TaskName 'PiHarness-Web-Production'
.\harness\production\manage.ps1 -Action status
```

更新或改密码时，空闲后先 `Disable-ScheduledTask -TaskName 'PiHarness-Web-Production'`、再 `Stop-ScheduledTask`，确认退出后 select 新候选，最后 `Enable-ScheduledTask`、Start-ScheduledTask。不要同时手动 run 与启动任务。DPAPI 配置必须由任务同一用户创建。任务无管理员权限、不保存 Windows 登录密码。

## 回退与撤销

先空闲禁用并停任务，再 `manage.ps1 -Action rollback`，再启用并 Start-ScheduledTask；需要先前已选择过的生产版本。首次迁移没有旧生产版本时，停止候选版并按旧流程在带 PI_WEB_PASSWORD 与 PI_WEB_ALLOWED_HOSTS 的终端启动 `harness/start-web.mjs`。不要同时运行两个会话执行器。

撤销自启动：先停止任务，再 `manage.ps1 -Action remove-task`。仅关闭远程入口可手动运行 `tailscale serve --https=443 off`。

## 备份与未完成检查

此工具不自动备份真实用户资料、不自动修改休眠/路由/ACL。请使用现有受保护备份方案备份 agent-data 的会话和配置；凭据不得进入 Git 或未经加密的云同步。不要为验证恢复而覆盖真实会话。重启后登录任务、手机实际性能、Tailscale ACL、真实会话恢复和备份恢复须另行验收；生产 smoke 的本机耗时不是手机提速结论。
