---
description: 在浏览器打开当前计划的可视化视图（非阻塞，使用浏览器刷新）
---

# 打开计划视图（/plan-open）

在浏览器打开当前计划的可视化 html。**本命令不阻塞会话**，用户可一边看计划一边继续对话。

1. 读 `./.planning/active.json` 确定当前需求目录；未开启计划模式则提示先 `/plan-start`，并退出。
2. 执行构建（等价于 `/plan-build`）：`node ~/.agents/skills/plan-start/scripts/plan-build.mjs ./.planning/<需求>`，生成 `build/plan.html`。
3. 打开方式按当前会话环境选择：
   - 当前会话在 Orca 工作区（存在 `ORCA_TERMINAL_HANDLE`、`ORCA_WORKTREE_ID`，且 `~/.pi/agent/bin/orca-cli-safe status --json` 显示 `app.running=true`、`runtime.state=ready`）时，**默认用 Orca 内嵌浏览器打开**，不使用系统默认浏览器：
     1. `~/.pi/agent/bin/orca-cli-safe tab list --json` 查现有标签；已有本需求的计划标签时用 `tab switch` 切到该标签并让用户原生刷新；
     2. 没有可用标签时 `~/.pi/agent/bin/orca-cli-safe tab create --json` 新建标签；
     3. `~/.pi/agent/bin/orca-cli-safe goto --url file://<plan.html 绝对路径> --json`，路径含中文等非 ASCII 字符时先做 URL 编码；
     4. `~/.pi/agent/bin/orca-cli-safe snapshot --json` 确认标题为「<需求> · 计划视图」。
   - 非 Orca 环境用系统默认浏览器打开（macOS 用 `open`，Linux 用 `xdg-open`），命令立即返回。
   - Orca 链路失败时保留真实错误，不回退到禁用的 `orca-ide`，也不在用户不知情时改用系统浏览器。
4. 告知用户：
   - 页面不再提供自定义刷新按钮，也不保存滚动位置或折叠状态；需要更新时使用浏览器原生刷新，避免自定义刷新造成阅读位置跳转；
   - AI 每次写回计划后会重新执行构建，浏览器刷新后最近变更的讨论点会黄色高亮；
   - 顶部有待讨论点聚合表（未决在前），点击左侧目录可跳转到任意步骤。
