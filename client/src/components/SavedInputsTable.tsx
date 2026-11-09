import { groupSavedInputs } from "@/lib/savedAssessment";

export function SavedInputsTable({
  inputs,
  definitions = [],
}: {
  inputs: Record<string, unknown>;
  definitions?: unknown[];
}) {
  const groups = groupSavedInputs(inputs, definitions);
  if (!groups.length)
    return (
      <p className="text-sm text-muted-foreground">
        保存された評価項目はありません。
      </p>
    );
  return (
    <div className="space-y-3">
      {groups.map(group => (
        <section
          key={group.title}
          className="overflow-hidden rounded-lg border"
        >
          <h4 className="bg-muted/50 px-3 py-2 text-xs font-semibold">
            {group.title}
          </h4>
          <table className="w-full text-left text-sm">
            <thead className="sr-only">
              <tr>
                <th>評価項目</th>
                <th>保存値</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {group.rows.map(row => (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className="w-3/5 px-3 py-2 font-normal text-muted-foreground break-words"
                  >
                    {row.label}
                  </th>
                  <td className="px-3 py-2 font-medium break-words">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
