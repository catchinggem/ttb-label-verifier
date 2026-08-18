"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Alert,
  AlertHeading,
  AlertText,
  Button,
  FileInput,
  Fieldset,
  GridContainer,
  Label,
  Table,
} from "@trussworks/react-uswds";
import { StatusTag } from "@/components/StatusTag";
import { DEFAULT_CONCURRENCY, runBounded } from "@/lib/concurrency";
import { verifyImage } from "@/lib/client";
import { parseApplicationCsv, resultsToCsv, type ApplicationRecord } from "@/lib/csv";
import {
  clearProgress,
  getProgressSnapshot,
  getServerProgressSnapshot,
  saveProgress,
  subscribeToProgress,
  type BatchRow,
} from "@/lib/batch-store";

/** Stable identity for the empty case, so `rows` is referentially steady. */
const EMPTY_ROWS: BatchRow[] = [];

export default function BatchPage() {
  const formId = useId();

  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [images, setImages] = useState<Map<string, File>>(new Map());
  const [running, setRunning] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  // A previous run's outcomes, read straight from storage rather than copied in
  // by an effect — no cascading render, and no hydration mismatch, because the
  // server snapshot is null. Images are never persisted (too large, and they are
  // on the agent's disk already), so a restored run is read-only until the files
  // are re-attached.
  const persisted = useSyncExternalStore(
    subscribeToProgress,
    getProgressSnapshot,
    getServerProgressSnapshot,
  );

  // Null until this session touches the run; the restored view shows through
  // until then.
  const [liveRows, setLiveRows] = useState<BatchRow[] | null>(null);
  // Memoized so the fallback doesn't produce a fresh array identity each render
  // and invalidate every hook downstream.
  const rows = useMemo(
    () => liveRows ?? persisted?.rows ?? EMPTY_ROWS,
    [liveRows, persisted],
  );
  const restored = liveRows === null && (persisted?.rows.length ?? 0) > 0;

  const abortRef = useRef<AbortController | null>(null);

  // Writing to an external system is what effects are for.
  useEffect(() => {
    if (liveRows && liveRows.length > 0) saveProgress(liveRows);
  }, [liveRows]);

  const counts = useMemo(() => {
    const tally = { pass: 0, fail: 0, needs_review: 0, error: 0, remaining: 0 };
    for (const row of rows) {
      if (row.status === "error") tally.error++;
      else if (row.status === "done" && row.result) tally[row.result.verdict]++;
      else tally.remaining++;
    }
    return tally;
  }, [rows]);

  async function handleCsv(file: File) {
    setCsvError(null);
    try {
      const { records: parsed, unknownColumns: unknown } = parseApplicationCsv(
        await file.text(),
      );
      if (parsed.length === 0) {
        setCsvError(
          "No rows with an image filename were found. The CSV needs an 'image' column naming each label file.",
        );
        return;
      }
      setRecords(parsed);
      setUnknownColumns(unknown);
      setLiveRows(
        parsed.map((record) => ({
          imageName: record.imageName,
          status: "pending" as const,
          result: null,
          error: null,
        })),
      );
    } catch {
      setCsvError("That file could not be read as CSV.");
    }
  }

  function handleImages(fileList: FileList | null) {
    const next = new Map<string, File>();
    for (const file of Array.from(fileList ?? [])) next.set(file.name, file);
    setImages(next);
  }

  const start = useCallback(async () => {
    if (running || records.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setLiveRows(
      rows.map((row) => (row.status === "done" ? row : { ...row, status: "pending" as const })),
    );

    const update = (index: number, patch: Partial<BatchRow>) =>
      setLiveRows((previous) =>
        (previous ?? rows).map((row, i) => (i === index ? { ...row, ...patch } : row)),
      );

    await runBounded({
      items: records,
      limit: DEFAULT_CONCURRENCY,
      signal: controller.signal,
      worker: async (record, index) => {
        update(index, { status: "running" });
        const image = images.get(record.imageName);
        if (!image) {
          // A missing file is this row's problem, not the run's.
          throw new Error(
            `No uploaded image named "${record.imageName}". Check the filename in the CSV.`,
          );
        }
        const { result } = await verifyImage(image, record, controller.signal);
        update(index, { status: "done", result, error: null });
        return result;
      },
      onSettled: (settled) => {
        if (settled.status === "rejected") {
          update(settled.index, {
            status: "error",
            error: settled.reason.message,
            result: null,
          });
        }
      },
    });

    setRunning(false);
    abortRef.current = null;
  }, [images, records, rows, running]);

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  function downloadCsv() {
    const csv = resultsToCsv(
      rows.map((row) => ({
        imageName: row.imageName,
        result: row.result,
        error: row.error,
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `label-verification-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    clearProgress();
    setLiveRows([]);
    setRecords([]);
    setImages(new Map());
  }

  const missingImages = records.filter((r) => !images.has(r.imageName)).length;
  const done = rows.length > 0 && counts.remaining === 0;

  return (
    <GridContainer className="padding-y-4">
      <h1>Verify a batch</h1>
      <p className="usa-intro measure-4">
        Upload one CSV of application records and the label images they name. Labels are
        checked {DEFAULT_CONCURRENCY} at a time, and results fill in as they finish.
      </p>

      {restored && (
        <Alert type="info">
          <AlertHeading level="h2">Earlier run restored</AlertHeading>
          <AlertText>
            Results from a previous session were recovered. Re-attach the CSV and image
            files to continue any rows that did not finish, or export what you have.
          </AlertText>
        </Alert>
      )}

      <Fieldset legend="Files" legendStyle="large">
        <Label htmlFor={`${formId}-csv`}>Application records (CSV)</Label>
        <span className="usa-hint" id={`${formId}-csv-hint`}>
          One row per label. Needs an <code>image</code> column matching each filename;
          <code> beverage_type</code>, <code>brand_name</code>, <code>class_type</code>,
          <code> abv</code>, <code>net_contents</code>, and <code>bottler</code> are
          optional.
        </span>
        <FileInput
          id={`${formId}-csv`}
          name="csv"
          accept=".csv,text/csv"
          aria-describedby={`${formId}-csv-hint`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleCsv(file);
          }}
        />

        <Label htmlFor={`${formId}-images`}>Label images</Label>
        <span className="usa-hint" id={`${formId}-images-hint`}>
          Select every label file named in the CSV. Large photos are resized before
          upload.
        </span>
        <FileInput
          id={`${formId}-images`}
          name="images"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          aria-describedby={`${formId}-images-hint`}
          onChange={(event) => handleImages(event.target.files)}
        />
      </Fieldset>

      {csvError && (
        <Alert type="error">
          <AlertHeading level="h2">Could not read that CSV</AlertHeading>
          <AlertText>{csvError}</AlertText>
        </Alert>
      )}

      {unknownColumns.length > 0 && (
        <Alert type="warning" slim>
          <AlertText>
            Ignored unrecognized {unknownColumns.length === 1 ? "column" : "columns"}:{" "}
            {unknownColumns.join(", ")}.
          </AlertText>
        </Alert>
      )}

      {records.length > 0 && (
        <p role="status">
          {records.length} record{records.length === 1 ? "" : "s"} loaded,{" "}
          {images.size} image{images.size === 1 ? "" : "s"} attached
          {missingImages > 0 && `, ${missingImages} image${missingImages === 1 ? "" : "s"} still missing`}
          .
        </p>
      )}

      <div className="batch-actions">
        <Button type="button" size="big" onClick={start} disabled={running || records.length === 0}>
          {running ? "Checking…" : `Check ${records.length || ""} label${records.length === 1 ? "" : "s"}`.trim()}
        </Button>
        {running && (
          <Button type="button" secondary onClick={stop}>
            Stop
          </Button>
        )}
        <Button type="button" outline onClick={downloadCsv} disabled={rows.length === 0}>
          Export results (CSV)
        </Button>
        <Button type="button" unstyled onClick={reset} disabled={running || rows.length === 0}>
          Clear this run
        </Button>
      </div>

      {rows.length > 0 && (
        <>
          {/* Live counts, announced as they change. */}
          <p aria-live="polite" role="status" className="batch-progress">
            {done ? "Finished. " : `${rows.length - counts.remaining} of ${rows.length} checked. `}
            {counts.pass} passed, {counts.fail} failed, {counts.needs_review} need review,{" "}
            {counts.error} could not be checked.
          </p>

          <Table bordered fullWidth scrollable caption="Batch verification results">
            <thead>
              <tr>
                <th scope="col">Label image</th>
                <th scope="col">Status</th>
                <th scope="col">Fields needing attention</th>
                <th scope="col">Model</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.imageName}>
                  <th scope="row">{row.imageName}</th>
                  <td>
                    {row.status === "done" && row.result ? (
                      <StatusTag verdict={row.result.verdict} />
                    ) : row.status === "error" ? (
                      <span className="status-tag status-tag--fail">
                        <span aria-hidden="true" className="status-tag__glyph">
                          ✕
                        </span>
                        Could not check
                      </span>
                    ) : (
                      <span className="status-tag status-tag--pending">
                        {row.status === "running" ? "Checking…" : "Waiting"}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.error ??
                      (row.result
                        ? row.result.fields
                            .filter((field) => field.verdict !== "pass")
                            .map((field) => field.title)
                            .join(", ") || "None"
                        : "")}
                  </td>
                  <td>{row.result ? row.result.model.replace(/^claude-/, "") : ""}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </GridContainer>
  );
}
