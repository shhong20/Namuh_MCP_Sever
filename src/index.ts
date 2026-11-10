#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerTools } from "./tools.js";
import { registerPortfolioTools } from "./portfolio.js";
import { registerTaxSafetyTools } from "./tax-safety-tools.js";
import { registerHistoryTools } from "./history-tools.js";
import { registerPerformanceTools } from "./performance-tools.js";
import { registerReconciliationTools } from "./reconciliation-tools.js";
import { registerCommonLedgerTools } from "./common-ledger-tools.js";
import { registerNavCandidateTools } from "./nav-candidate-tools.js";

async function main() {
  const config = loadConfig();

  const server = new McpServer({
    name: "nhplug-mcp",
    version: "0.1.0",
  });

  registerTools(server, config);
  registerPortfolioTools(server, config);
  registerTaxSafetyTools(server, config);
  registerHistoryTools(server, config);
  registerPerformanceTools(server, config);
  registerReconciliationTools(server, config);
  registerCommonLedgerTools(server, config);
  registerNavCandidateTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout 은 MCP 프로토콜 전용이므로 로그는 stderr 로만 출력
  console.error(
    `[nhplug-mcp] 시작됨 · baseUrl=${config.baseUrl} · trading=${config.enableTrading ? "ON" : "OFF"}`
  );
}

main().catch((err) => {
  console.error("[nhplug-mcp] 치명적 오류:", err);
  process.exit(1);
});
