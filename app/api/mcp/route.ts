import { z } from "zod";
import { createMcpHandler } from "mcp-handler";

const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN!;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID!;

const handler = createMcpHandler(
  (server) => {
    // Tool 1: Create a Vercel project connected to a GitHub repo
    server.tool(
      "create_vercel_project",
      "Creates a new Vercel project and connects it to a GitHub repository. This triggers automatic deployments on every push.",
      {
        name: z.string().describe("Project name in Vercel (e.g. my-app)"),
        repo: z.string().describe("GitHub repo in format owner/repo (e.g. aablanquicet27/my-app)"),
        framework: z
          .enum([
            "nextjs",
            "vite",
            "remix",
            "astro",
            "nuxtjs",
            "svelte",
            "gatsby",
            "angular",
            "create-react-app",
            "hugo",
            "eleventy",
            "docusaurus",
          ])
          .optional()
          .describe("Framework used in the project. Defaults to nextjs."),
        buildCommand: z.string().optional().describe("Custom build command (optional)"),
        installCommand: z.string().optional().describe("Custom install command (optional)"),
        outputDirectory: z.string().optional().describe("Custom output directory (optional)"),
        rootDirectory: z.string().optional().describe("Root directory if monorepo (optional)"),
        environmentVariables: z
          .array(
            z.object({
              key: z.string(),
              value: z.string(),
              target: z
                .enum(["production", "preview", "development"])
                .optional()
                .default("production"),
            })
          )
          .optional()
          .describe("Environment variables to set on the project (optional)"),
      },
      async ({ name, repo, framework, buildCommand, installCommand, outputDirectory, rootDirectory, environmentVariables }) => {
        const body: Record<string, unknown> = {
          name,
          framework: framework || "nextjs",
          gitRepository: {
            repo,
            type: "github",
          },
        };

        if (buildCommand) body.buildCommand = buildCommand;
        if (installCommand) body.installCommand = installCommand;
        if (outputDirectory) body.outputDirectory = outputDirectory;
        if (rootDirectory) body.rootDirectory = rootDirectory;
        if (environmentVariables && environmentVariables.length > 0) {
          body.environmentVariables = environmentVariables.map((env) => ({
            key: env.key,
            value: env.value,
            target: env.target || "production",
            type: "encrypted",
          }));
        }

        const response = await fetch(
          `https://api.vercel.com/v11/projects?teamId=${VERCEL_TEAM_ID}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${VERCEL_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error creating project: ${JSON.stringify(data)}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Project created successfully!\n\nName: ${data.name}\nID: ${data.id}\nFramework: ${data.framework}\nGit Repo: ${repo}\nURL: https://vercel.com/${VERCEL_TEAM_ID}/${data.name}\n\nVercel will now auto-deploy on every push to the connected GitHub repo.`,
            },
          ],
        };
      }
    );

    // Tool 2: List projects (backup)
    server.tool(
      "list_vercel_projects",
      "Lists all Vercel projects in the team",
      {},
      async () => {
        const response = await fetch(
          `https://api.vercel.com/v9/projects?teamId=${VERCEL_TEAM_ID}&limit=50`,
          {
            headers: {
              Authorization: `Bearer ${VERCEL_TOKEN}`,
            },
          }
        );

        const data = await response.json();
        const projects = data.projects?.map((p: { name: string; id: string; framework: string }) => `- ${p.name} (${p.id}) [${p.framework || "unknown"}]`).join("\n") || "No projects found";

        return {
          content: [
            {
              type: "text" as const,
              text: `Vercel Projects:\n${projects}`,
            },
          ],
        };
      }
    );

    // Tool 3: Delete a project
    server.tool(
      "delete_vercel_project",
      "Deletes a Vercel project by name or ID",
      {
        projectId: z.string().describe("Project name or ID to delete"),
      },
      async ({ projectId }) => {
        const response = await fetch(
          `https://api.vercel.com/v9/projects/${projectId}?teamId=${VERCEL_TEAM_ID}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${VERCEL_TOKEN}`,
            },
          }
        );

        if (response.status === 204 || response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Project '${projectId}' deleted successfully.`,
              },
            ],
          };
        }

        const data = await response.json();
        return {
          content: [
            {
              type: "text" as const,
              text: `Error deleting project: ${JSON.stringify(data)}`,
            },
          ],
        };
      }
    );

    // Tool 4: Trigger a deployment
    server.tool(
      "create_vercel_deployment",
      "Triggers a new deployment for an existing Vercel project from its connected GitHub repo",
      {
        projectName: z.string().describe("Vercel project name"),
        ref: z.string().optional().describe("Git branch or tag to deploy (defaults to main)"),
      },
      async ({ projectName, ref }) => {
        // First get the project to find the repo info
        const projResponse = await fetch(
          `https://api.vercel.com/v9/projects/${projectName}?teamId=${VERCEL_TEAM_ID}`,
          {
            headers: {
              Authorization: `Bearer ${VERCEL_TOKEN}`,
            },
          }
        );

        if (!projResponse.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Project '${projectName}' not found.`,
              },
            ],
          };
        }

        const project = await projResponse.json();
        const gitRepo = project.link;

        if (!gitRepo) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Project '${projectName}' has no connected Git repository.`,
              },
            ],
          };
        }

        const deployBody: Record<string, unknown> = {
          name: projectName,
          target: "production",
          gitSource: {
            type: "github",
            ref: ref || "main",
            repoId: gitRepo.repoId,
          },
        };

        const deployResponse = await fetch(
          `https://api.vercel.com/v13/deployments?teamId=${VERCEL_TEAM_ID}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${VERCEL_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(deployBody),
          }
        );

        const deployData = await deployResponse.json();

        if (!deployResponse.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error creating deployment: ${JSON.stringify(deployData)}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Deployment triggered!\n\nProject: ${projectName}\nBranch: ${ref || "main"}\nURL: ${deployData.url ? `https://${deployData.url}` : "pending..."}\nStatus: ${deployData.readyState || "building"}`,
            },
          ],
        };
      }
    );
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };
