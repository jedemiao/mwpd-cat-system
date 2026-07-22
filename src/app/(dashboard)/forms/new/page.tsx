import { FormTemplateForm } from "../FormTemplateForm";

export default function NewFormTemplatePage() {
  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New form template</h1>
      <FormTemplateForm mode="create" />
    </main>
  );
}
