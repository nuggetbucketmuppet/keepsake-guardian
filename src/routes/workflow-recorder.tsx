import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { WorkflowForm } from "@/components/WorkflowForm";

export const Route = createFileRoute("/workflow-recorder")({
  head: () => ({ meta: [{ title: "Upload a Workflow — Streamline" }] }),
  component: WorkflowUpload,
});

function WorkflowUpload() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Upload a Workflow"
        subtitle="Map every tool your business depends on — AI or not. Each platform, service, and person becomes a node in your dependency map."
      />
      <WorkflowForm onSaved={() => navigate({ to: "/dependency-map" })} />
    </div>
  );
}
