import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 5178),
  projectEndpoint: process.env.PROJECT_ENDPOINT?.trim() ?? "",
  modelDeploymentName: process.env.MODEL_DEPLOYMENT_NAME?.trim() || "gpt-4o-mini",
  agentIds: {
    employee: process.env.EMPLOYEE_AGENT_ID?.trim() || "",
    hr: process.env.HR_AGENT_ID?.trim() || "",
    finance: process.env.FINANCE_AGENT_ID?.trim() || "",
    manager: process.env.MANAGER_AGENT_ID?.trim() || "",
  },
};

/** Azure is used only when a project endpoint is configured. */
export const useAzure = config.projectEndpoint.length > 0;
