/**
 * DeepSeek 余额展示扩展（作者：fang）
 *
 * - 在 footer 状态栏显示 DeepSeek 账户余额
 * - 会话开始、每轮对话结束（节流 60s）自动刷新
 * - 命令 `/balance` 手动刷新，并输出本会话 token 与累计花费
 *
 * 余额接口：GET https://api.deepseek.com/user/balance
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "deepseek-balance";
const AUTO_REFRESH_MS = 60_000;
const BALANCE_URL = "https://api.deepseek.com/user/balance";

interface BalanceInfo {
	currency: string;
	total_balance: string;
	granted_balance: string;
	topped_up_balance: string;
}

interface BalanceResponse {
	is_available: boolean;
	balance_infos: BalanceInfo[];
}

let lastRefreshAt = 0;
let refreshing: Promise<void> | undefined;

function currencySymbol(currency: string): string {
	switch (currency.toUpperCase()) {
		case "CNY":
			return "¥";
		case "USD":
			return "$";
		default:
			return `${currency} `;
	}
}

function formatBalanceText(data: BalanceResponse): string {
	if (!data.balance_infos || data.balance_infos.length === 0) return "💰 无余额信息";
	const text = data.balance_infos
		.map((info) => `${currencySymbol(info.currency)}${info.total_balance}`)
		.join(" / ");
	return data.is_available ? `💰 ${text}` : `💰 ${text} (不可用)`;
}

function formatBalanceDetail(data: BalanceResponse): string {
	if (!data.balance_infos || data.balance_infos.length === 0) return "无余额信息";
	return data.balance_infos
		.map((info) => {
			const symbol = currencySymbol(info.currency);
			return [
				`${info.currency}: 总额 ${symbol}${info.total_balance}`,
				`赠送 ${symbol}${info.granted_balance}`,
				`充值 ${symbol}${info.topped_up_balance}`,
			].join(" / ");
		})
		.join("\n");
}

async function fetchBalance(ctx: ExtensionContext): Promise<BalanceResponse> {
	const apiKey = await ctx.modelRegistry.getApiKeyForProvider("deepseek");
	if (!apiKey) throw new Error("未找到 DeepSeek API Key（DEEPSEEK_API_KEY）");

	const response = await fetch(BALANCE_URL, {
		headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) throw new Error(`余额接口返回 HTTP ${response.status}`);
	return (await response.json()) as BalanceResponse;
}

/** 刷新 footer 状态；force=false 时受 60s 节流限制 */
async function refreshStatus(ctx: ExtensionContext, force = false): Promise<void> {
	if (!force && Date.now() - lastRefreshAt < AUTO_REFRESH_MS) return;
	if (refreshing) return refreshing;

	refreshing = (async () => {
		try {
			const data = await fetchBalance(ctx);
			ctx.ui.setStatus(STATUS_KEY, formatBalanceText(data));
		} catch (error) {
			ctx.ui.setStatus(STATUS_KEY, "💰 余额获取失败");
			console.error("[deepseek-balance]", error);
		} finally {
			lastRefreshAt = Date.now();
			refreshing = undefined;
		}
	})();

	return refreshing;
}

function summarizeSession(ctx: ExtensionContext): string {
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cost = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			const usage = (entry.message as AssistantMessage).usage;
			if (!usage) continue;
			input += usage.input ?? 0;
			output += usage.output ?? 0;
			cacheRead += usage.cacheRead ?? 0;
			cost += usage.cost?.total ?? 0;
		}
	}
	const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);
	return `本会话：输入 ${fmt(input)} / 输出 ${fmt(output)} / 缓存读 ${fmt(cacheRead)} tokens，累计 $${cost.toFixed(3)}`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("balance", {
		description: "查看 DeepSeek 余额与本会话用量",
		handler: async (_args, ctx) => {
			try {
				const data = await fetchBalance(ctx);
				ctx.ui.setStatus(STATUS_KEY, formatBalanceText(data));
				lastRefreshAt = Date.now();
				ctx.ui.notify(`${formatBalanceDetail(data)}\n${summarizeSession(ctx)}`, "info");
			} catch (error) {
				console.error("[deepseek-balance]", error);
				ctx.ui.notify(`余额获取失败：${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		await refreshStatus(ctx, true);
	});

	pi.on("agent_end", async (_event, ctx) => {
		await refreshStatus(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
