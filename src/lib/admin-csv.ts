/** Any table on the dashboard, turned into a file. Pure formatting. */

import { downloadFile } from "@/lib/admin-export";

function cell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return `${[headers.join(","), ...rows.map((row) => row.map(cell).join(","))].join("\n")}\n`;
}

export function exportCsv(name: string, headers: string[], rows: unknown[][]) {
  downloadFile(
    `${name}-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(headers, rows),
    "text/csv",
  );
}
