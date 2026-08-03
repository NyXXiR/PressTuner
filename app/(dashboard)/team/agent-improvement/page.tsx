export default function AgentImprovementAdminPage() {
  return (
    <main className="space-y-4 p-8">
      <p className="text-sm font-semibold uppercase text-slate-500">Team-only review</p>
      <h1 className="text-3xl font-bold">Agent improvement candidates</h1>
      <p className="max-w-2xl text-slate-600">
        Review redacted regression candidates and create immutable dataset versions.
        Dataset promotion does not authorize or trigger a production deployment.
      </p>
    </main>
  );
}
