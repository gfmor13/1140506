import { formatBooleanEquationForDisplay, formatTeacherLogicLabel } from "../lib/displayLabels.js";
import MetricBadge from "./MetricBadge.jsx";
import Panel from "./Panel.jsx";

function cellKey(cell) {
  return cell.id ?? cell.minterm ?? `${cell.row}:${cell.col}`;
}

function groupHasZeroCell(group, cells) {
  const byId = new Map(cells.map((cell) => [cellKey(cell), cell]));
  return (group.cells ?? []).some((cellId) => String(byId.get(cellId)?.value) === "0");
}

function classForCell(cell, groupedCellIds) {
  const value = String(cell.value);
  const base =
    value === "1"
      ? "border-[rgba(45,212,191,0.45)] bg-[var(--primary-soft)] text-[var(--primary)]"
      : value.toUpperCase() === "X"
        ? "border-[rgba(139,92,246,0.45)] bg-[var(--accent-soft)] text-[var(--accent)]"
        : "border-[var(--border-subtle)] bg-[rgba(241,245,249,0.88)] text-[var(--text-dim)]";
  return groupedCellIds.has(cellKey(cell))
    ? `${base} ring-2 ring-[rgba(139,92,246,0.76)] ring-offset-1 ring-offset-[var(--bg-panel)]`
    : base;
}

function inferRows(cells) {
  const rows = Array.from(new Set(cells.map((cell) => cell.row).filter((value) => value !== undefined)));
  return rows.length ? rows : [""];
}

function inferCols(cells) {
  const cols = Array.from(new Set(cells.map((cell) => cell.col).filter((value) => value !== undefined)));
  return cols.length ? cols : cells.map((cell) => cellKey(cell));
}

export default function KMapView({ result }) {
  const maps = result?.kMaps ?? [];

  if (maps.length === 0) {
    return (
      <Panel title="K-Map">
        <div className="p-4 text-xs text-[var(--text-muted)]">No K-Map data returned.</div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {maps.map((map, mapIndex) => {
        const cells = map.cells ?? [];
        const rows = map.rows?.length ? map.rows : inferRows(cells);
        const cols = map.cols?.length ? map.cols : inferCols(cells);
        const validGroups = (map.groups ?? []).filter((group) => !groupHasZeroCell(group, cells));
        const groupedCellIds = new Set(validGroups.flatMap((group) => group.cells ?? []));
        const byPosition = new Map(cells.map((cell) => [`${cell.row ?? ""}|${cell.col ?? cellKey(cell)}`, cell]));
        const byId = new Map(cells.map((cell) => [cellKey(cell), cell]));
        const dontCareCount = cells.filter((cell) => String(cell.value).toUpperCase() === "X").length;

        return (
          <Panel
            eyebrow={`${(map.variables ?? []).map((variable) => formatTeacherLogicLabel(variable, result)).join(" / ") || "variables"}`}
            key={map.id ?? map.name ?? mapIndex}
            title={formatTeacherLogicLabel(map.target || map.name || map.id, result)}
            actions={
              <div className="flex flex-wrap gap-2">
                <MetricBadge label="Groups" value={validGroups.length} tone="violet" />
                <MetricBadge label="Don't-care" value={dontCareCount} tone="amber" />
              </div>
            }
          >
            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[var(--text-dim)]">Expression</span>
                <span className="rounded border border-[var(--border-subtle)] bg-[rgba(248,250,252,0.92)] px-2 py-1 font-mono text-[var(--primary)]">
                  {formatBooleanEquationForDisplay(map.expression ?? "0", result)}
                </span>
                <span className="text-[var(--text-dim)]">
                  Variables: {(map.variables ?? []).map((variable) => formatTeacherLogicLabel(variable, result)).join(", ") || "-"}
                </span>
              </div>
              <div
                className="mb-2 grid gap-1 text-center font-mono text-[11px] text-[var(--text-muted)]"
                style={{ gridTemplateColumns: `36px repeat(${Math.max(cols.length, 1)}, minmax(54px, 1fr))` }}
              >
                <span />
                {cols.map((col) => (
                  <span key={`col-${col}`}>{col || "-"}</span>
                ))}
                {rows.map((row) => (
                  <div className="contents" key={`row-${row}`}>
                    <span className="grid place-items-center text-[var(--text-dim)]">{row || "-"}</span>
                    {cols.map((col) => {
                      const cell = byPosition.get(`${row}|${col}`) ?? byId.get(col) ?? {
                        id: `${row}${col}`,
                        row,
                        col,
                        minterm: `${row}${col}`,
                        value: "X",
                      };
                      return (
                        <div
                          className={`relative min-h-16 rounded border p-2 ${classForCell(cell, groupedCellIds)}`}
                          key={`${row}-${col}`}
                        >
                          <span className="absolute left-1 top-1 text-[10px] text-[var(--text-dim)]">
                            {cell.minterm ?? cellKey(cell)}
                          </span>
                          <span className="grid h-full place-items-center text-lg">{String(cell.value)}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {validGroups.map((group, index) => (
                  <span
                    className="rounded border border-[rgba(139,92,246,0.58)] bg-[var(--accent-soft)] px-2 py-1 font-mono text-[var(--accent)]"
                    key={group.id ?? `${group.term}-${index}`}
                  >
                    {formatBooleanEquationForDisplay(group.term, result)} : {(group.cells ?? []).join(", ")}
                  </span>
                ))}
                {validGroups.length === 0 && (
                  <span className="text-[var(--text-muted)]">No valid groups to display.</span>
                )}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
