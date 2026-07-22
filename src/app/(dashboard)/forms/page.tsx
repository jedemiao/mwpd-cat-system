import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PlusIcon, FileIcon } from "@/components/icons";

// Server component: the shared template library, not office-scoped —
// every office sees and can manage the same list of standard DMW forms.
export default async function FormsPage() {
  const templates = await prisma.formTemplate.findMany({
    orderBy: { number: "asc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return (
    <main className="space-y-4 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Forms library</h1>
        <Link href="/forms/new" className="btn-primary">
          <PlusIcon className="h-4 w-4" />
          New
        </Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Title / document</th>
              <th>Template / form</th>
              <th>Uploaded by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td className="whitespace-nowrap font-mono text-xs">{template.number}</td>
                <td>{template.title}</td>
                <td>
                  <a
                    href={`/api/files/${template.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-info hover:underline"
                  >
                    <FileIcon className="h-4 w-4" />
                    {template.fileName}
                  </a>
                </td>
                <td>{template.uploadedBy.name}</td>
                <td>
                  <Link href={`/forms/${template.id}`} className="font-medium text-primary hover:text-primary-600">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
