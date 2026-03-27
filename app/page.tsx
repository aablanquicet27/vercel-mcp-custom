const pageStyle = { padding: "2rem", fontFamily: "system-ui" };

export default function Home() {
  return (
    <main style={pageStyle}>
      <h1>Vercel MCP Custom Server</h1>
      <p>This is an MCP server for managing Vercel projects.</p>
      <h2>Available Tools:</h2>
      <ul>
        <li><strong>create_vercel_project</strong> - Create a Vercel project and connect it to a GitHub repo</li>
        <li><strong>list_vercel_projects</strong> - List all Vercel projects</li>
        <li><strong>delete_vercel_project</strong> - Delete a Vercel project</li>
        <li><strong>create_vercel_deployment</strong> - Trigger a deployment</li>
      </ul>
      <h2>MCP Endpoint:</h2>
      <code>/api/mcp</code>
    </main>
  );
}
