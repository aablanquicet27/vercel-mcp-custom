export const metadata = {
  title: 'Vercel MCP Custom Server',
  description: 'MCP server for Vercel project management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
