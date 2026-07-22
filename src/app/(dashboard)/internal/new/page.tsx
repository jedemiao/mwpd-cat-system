import { InternalForm } from "../InternalForm";

export default function NewInternalPage() {
  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New internal memorandum</h1>
      <InternalForm mode="create" />
    </main>
  );
}
