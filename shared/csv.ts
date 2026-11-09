export function serializeCsv(rows: unknown[][]): string {
  return (
    "\uFEFF" +
    rows
      .map(row =>
        row
          .map(cell => {
            const raw = String(cell ?? "");
            const safe =
              typeof cell === "string" && /^[\s]*[=+\-@]/.test(raw)
                ? `'${raw}`
                : raw;
            return /[,"\r\n]/.test(safe)
              ? `"${safe.replace(/"/g, '""')}"`
              : safe;
          })
          .join(",")
      )
      .join("\n")
  );
}
