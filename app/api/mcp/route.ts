import { NextRequest, NextResponse } from "next/server";

// Split protocol and host to prevent URL mangling during push
const _p = "https";
const _h = "api.vercel.com";
const API_BASE = _p + "://" + _h;
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN || "";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "";

function apiHeaders() {
  return {
    Authorization: "Bearer " + VERCEL_TOKEN,
    "Content-Type": "application/json",
  };
}

const TOOLS = [
  {
    name: "create_vercel_project",
    description: "Creates a new Vercel project and connects it to a GitHub repository for automatic deployments on every push.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name in Vercel" },
        repo: { type: "string", description: "GitHub repo in format owner/repo" },
        framework: {
          type: "string",
          description: "Framework (default: nextjs)",
          enum: ["nextjs", "vite", "remix", "astro", "nuxtjs", "svelte", "gatsby", "angular", "create-react-app"],
        },
        buildCommand: { type: "string", description: "Custom build command (optional)" },
        installCommand: { type: "string", description: "Custom install command (optional)" },
        outputDirectory: { type: "string", description: "Custom output directory (optional)" },
        environmentVariables: {
          type: "array",
          description: "Environment variables (optional)",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              value: { type: "string" },
              target: { type: "string", enum: ["production", "preview", "development"] },
            },
            required: ["key", "value"],
          },
        },
      },
      required: ["name", "repo"],
    },
  },
  {
    name: "list_vercel_projects",
    description: "Lists all Vercel projects in the team (max 50)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "delete_vercel_project",
    description: "Deletes a Vercel project by name or ID",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project name or ID to delete" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "create_vercel_deployment",
    description: "Triggers a new deployment for an existing Vercel project from its connected GitHub repo",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Vercel project name" },
        ref: { type: "string", description: "Git branch to deploy (default: main)" },
      },
      required: ["projectName"],
    },
  },
];

// --- Tool implementations ---

async function createProject(args: Record<string, unknown>): Promise<string> {
  const body: Record<string, unknown> = {
    name: args.name,
    framework: args.framework || "nextjs",
    gitRepository: { repo: args.repo, type: "github" },
  };
  if (args.buildCommand) body.buildCommand = args.buildCommand;
  if (args.installCommand) body.installCommand = args.installCommand;
  if (args.outputDirectory) body.outputDirectory = args.outputDirectory;
  if (args.environmentVariables) {
    const envs = args.environmentVariables as Array<{ key: string; value: string; target?: string }>;
    body.environmentVariables = envs.map((e) => ({
      key: e.key, value: e.value, target: e.target || "production", type: "encrypted",
    }));
  }

  const url = API_BASE + "/v11/projects?teamId=" + VERCEL_TEAM_ID;
  const res = await fetch(url, { method: "POST", headers: apiHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) return "Error creating project: " + JSON.stringify(data);
  return "Project created!\nName: " + data.name + "\nID: " + data.id + "\nFramework: " + data.framework + "\nRepo: " + args.repo + "\nAuto-deploy enabled on push.";
}

async function listProjects(): Promise<string> {
  const url = API_BASE + "/v9/projects?teamId=" + VERCEL_TEAM_ID + "&limit=50";
  const res = await fetch(url, { headers: apiHeaders() });
  const data = await res.json();
  if (!res.ok) return "Error: " + JSON.stringify(data);
  const list = data.projects
    ?.map((p: { name: string; id: string; framework: string }) => "- " + p.name + " (" + p.id + ") [" + (p.framework || "unknown") + "]")
    .join("\n") || "No projects found";
  return "Vercel Projects:\n" + list;
}

async function deleteProject(args: Record<string, unknown>): Promise<string> {
  const pid = String(args.projectId);
  const url = API_BASE + "/v9/projects/" + pid + "?teamId=" + VERCEL_TEAM_ID;
  const res = await fetch(url, { method: "DELETE", headers: apiHeaders() });
  if (res.status === 204 || res.ok) return "Project '" + pid + "' deleted successfully.";
  const data = await res.json();
  return "Error deleting project: " + JSON.stringify(data);
}

async function createDeployment(args: Record<string, unknown>): Promise<string> {
  const projName = String(args.projectName);
  const projUrl = API_BASE + "/v9/projects/" + projName + "?teamId=" + VERCEL_TEAM_ID;
  const projRes = await fetch(projUrl, { headers: apiHeaders() });
  if (!projRes.ok) return "Error: Project '" + projName + "' not found.";
  const project = await projRes.json();
  if (!project.link) return "Error: Project '" + projName + "' has no connected Git repository.";

  const deployBody = {
    name: projName,
    target: "production",
    gitSource: { type: "github", ref: args.ref || "main", repoId: project.link.repoId },
  };
  const deployUrl = API_BASE + "/v13/deployments?teamId=" + VERCEL_TEAM_ID;
  const res = await fetch(deployUrl, { method: "POST", headers: apiHeaders(), body: JSON.stringify(deployBody) });
  const data = await res.json();
  if (!res.ok) return "Error creating deployment: " + JSON.stringify(data);
  return "Deployment triggered!\nProject: " + projName + "\nBranch: " + (args.ref || "main") + "\nStatus: " + (data.readyState || "building");
}

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "create_vercel_project": return await createProject(args);
    case "list_vercel_projects": return await listProjects();
    case "delete_vercel_project": return await deleteProject(args);
    case "create_vercel_deployment": return await createDeployment(args);
    default: return "Unknown tool: " + name;
  }
}

// --- JSON-RPC helpers ---

function rpcOk(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

// --- Route handlers (no OAuth, pure JSON-RPC) ---

export async function POST(req: NextRequest) {
  const body = await req.json();
  const method: string = body.method;
  const id = body.id;

  if (method === "initialize") {
    return rpcOk(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "vercel-custom-mcp", version: "1.0.0" },
    });
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return new NextResponse(null, { status: 204 });
  }

  if (method === "ping") {
    return rpcOk(id, {});
  }

  if (method === "tools/list") {
    return rpcOk(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const toolName: string = body.params?.name;
    const toolArgs: Record<string, unknown> = body.params?.arguments || {};
    try {
      const result = await handleToolCall(toolName, toolArgs);
      return rpcOk(id, { content: [{ type: "text", text: result }] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return rpcOk(id, { content: [{ type: "text", text: "Error: " + msg }], isError: true });
    }
  }

  return rpcErr(id, -32601, "Method not found: " + method);
}

export async function GET() {
  return NextResponse.json({
    name: "vercel-custom-mcp",
    version: "1.0.0",
    status: "running",
    tools: TOOLS.map((t) => t.name),
  });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405 });
}
