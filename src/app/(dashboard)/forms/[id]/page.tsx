import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/DeleteButton";
import { FormTemplateForm } from "../FormTemplateForm";

export default async function EditFormTemplatePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  const template = await prisma.formTemplate.findUnique({ where: { id: params.id } });

  if (!template) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit form template — {template.title}</h1>
      <FormTemplateForm
        mode="edit"
        id={template.id}
        initialData={{
          number: template.number,
          title: template.title,
          fileUrl: template.fileUrl,
          fileName: template.fileName,
        }}
      />
      {/* Not canDelete-gated — any authenticated user can manage the shared library. */}
      <DeleteButton endpoint={`/api/forms/${template.id}`} redirectTo="/forms" />
    </main>
  );
}
