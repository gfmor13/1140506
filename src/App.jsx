import { useEffect, useMemo, useState } from "react";
import { generateCircuit, getHealth } from "./lib/api.js";
import { normalizeFsmResult } from "./lib/normalizeFsmResult.js";
import {
  buildDefaultStateRows,
  buildStateTableInputConfig,
  buildTimingTraceInputConfig,
  classifyImportJson,
  inputModeFromLabel,
  normalizeImportedInputConfig,
  reconcileStateRows,
  validateInputConfigLocal,
} from "./lib/inputConfigBuilder.js";
import { TEACHER_STANDARD_ROWS } from "./lib/teacherStandard.js";
import TopCommandBar from "./components/TopCommandBar.jsx";
import InputBuilder from "./components/InputBuilder.jsx";
import Workbench from "./components/Workbench.jsx";
import InspectorPanel from "./components/InspectorPanel.jsx";
import StatusBar from "./components/StatusBar.jsx";

const DEFAULT_CONFIG = {
  fsmModel: "Mealy",
  ffType: "D",
  stateCount: 2,
  inputCount: 1,
  outputCount: 1,
};

function nowLabel() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [builderMode, setBuilderMode] = useState("State Table");
  const [stateRows, setStateRows] = useState(() =>
    buildDefaultStateRows({ stateCount: DEFAULT_CONFIG.stateCount, fsmModel: DEFAULT_CONFIG.fsmModel }),
  );
  const [timingTrace, setTimingTrace] = useState({ xTrace: "0 1 1 0", zTrace: "0 1 0 1" });
  const [importJsonText, setImportJsonText] = useState("");
  const [activeResultTab, setActiveResultTab] = useState("FF Equations");
  const [result, setResult] = useState(null);
  const [rawResult, setRawResult] = useState(null);
  const [apiMeta, setApiMeta] = useState(null);
  const [latestInputConfig, setLatestInputConfig] = useState(null);
  const [compileState, setCompileState] = useState("idle");
  const [statusText, setStatusText] = useState("Ready for synthesis");
  const [validationErrors, setValidationErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [debugBuffer, setDebugBuffer] = useState({});
  const [detectedJsonType, setDetectedJsonType] = useState("-");
  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const [backendStatus, setBackendStatus] = useState("checking");
  const [lastCompileTime, setLastCompileTime] = useState(null);

  const currentInputMode = inputModeFromLabel(builderMode);
  const debugModeActive =
    builderMode === "Timing Trace" &&
    (timingTrace.xTrace.trim() === "0951224" || timingTrace.zTrace.trim() === "0951224");
  const debugPanelActive = debugModeActive || debugUnlocked;

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((health) => {
        if (!cancelled) {
          setBackendStatus(health.httpStatus === 200 && health.json?.status === "OK" ? "OK" : "ERROR");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBackendStatus("offline");
          setDebugBuffer((current) => ({ ...current, health_error: error.message }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (debugModeActive) {
      setDebugUnlocked(true);
    }
  }, [debugModeActive]);

  useEffect(() => {
    setStateRows((rows) =>
      reconcileStateRows({
        rows,
        stateCount: config.stateCount,
        fsmModel: config.fsmModel,
      }),
    );
  }, [config.stateCount, config.fsmModel]);

  const inspectorInputConfig = useMemo(() => {
    if (latestInputConfig) return latestInputConfig;
    return {
      input_mode: currentInputMode,
      fsm_model: config.fsmModel,
      ff_type: config.ffType,
      state_count: Number(config.stateCount),
      input_count: Number(config.inputCount),
      output_count: Number(config.outputCount),
    };
  }, [config, currentInputMode, latestInputConfig]);

  function recordValidationFailure(errors, debug = {}) {
    setValidationErrors(errors);
    setCompileState("error");
    setStatusText("Validation failed");
    setDebugBuffer(debug);
  }

  function normalizeAndStore(raw, debug = {}) {
    try {
      const normalized = normalizeFsmResult(raw);
      setRawResult(raw);
      setResult(normalized);
      setWarnings(normalized.warnings);
      setDebugBuffer({
        ...debug,
        raw_status: raw?.status ?? "UNKNOWN",
        normalized_debug: normalized.debug,
      });
      return normalized;
    } catch (error) {
      setRawResult(raw);
      setResult(null);
      setWarnings([]);
      setCompileState("error");
      setStatusText("Normalize failure");
      setDebugBuffer({ ...debug, normalize_error: error.message, raw });
      throw error;
    }
  }

  function buildCurrentInputConfig() {
    if (builderMode === "State Table") {
      setDetectedJsonType("N/A");
      return buildStateTableInputConfig({
        fsmModel: config.fsmModel,
        ffType: config.ffType,
        stateCount: config.stateCount,
        inputCount: config.inputCount,
        outputCount: config.outputCount,
        rows: stateRows,
      });
    }

    if (builderMode === "Timing Trace") {
      setDetectedJsonType("N/A");
      return buildTimingTraceInputConfig({
        fsmModel: config.fsmModel,
        ffType: config.ffType,
        stateCount: config.stateCount,
        inputCount: config.inputCount,
        outputCount: config.outputCount,
        xTrace: timingTrace.xTrace,
        zTrace: timingTrace.zTrace,
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(importJsonText);
    } catch (error) {
      setDetectedJsonType("PARSE_ERROR");
      const parseError = new Error(`JSON parse failed: ${error.message}`);
      parseError.validationErrors = [parseError.message];
      throw parseError;
    }

    const jsonType = classifyImportJson(parsed);
    setDetectedJsonType(jsonType);
    if (jsonType === "FSM_RESULT") {
      return { kind: "FSM_RESULT", raw: parsed };
    }
    if (jsonType === "INPUT_CONFIG") {
      return normalizeImportedInputConfig(parsed);
    }

    const unknownError = new Error("Unknown JSON type");
    setDetectedJsonType("UNKNOWN");
    unknownError.validationErrors = ["Unknown JSON type"];
    throw unknownError;
  }

  function handleLoadTeacherExample() {
    setConfig({
      fsmModel: "Mealy",
      ffType: "JK",
      stateCount: 3,
      inputCount: 1,
      outputCount: 1,
    });
    setBuilderMode("State Table");
    setStateRows(TEACHER_STANDARD_ROWS);
    setStatusText("Teacher standard example loaded");
    setValidationErrors([]);
    setWarnings([]);
  }

  async function runApiCompile(inputConfig) {
    setCompileState("compiling");
    setStatusText("Compiling FSM through C++ solver");

    const response = await generateCircuit(inputConfig);
    setApiMeta({
      requestId: response.requestId,
      engineTimeMs: response.engineTimeMs,
      engineLatencyMs: response.engineLatencyMs,
      httpStatus: response.httpStatus,
    });

    if (response.httpStatus >= 400) {
      setRawResult(response.json);
      setDebugBuffer({ http_error: response.json });
      throw new Error(`HTTP ${response.httpStatus}: ${response.json?.message ?? "generate-circuit failed"}`);
    }

    const normalized = normalizeAndStore(response.json, { request_id: response.requestId });
    if (normalized.status !== "OK") {
      throw new Error(`Solver returned ${normalized.status}${response.json?.message ? `: ${response.json.message}` : ""}`);
    }

    return normalized;
  }

  async function handleCompile() {
    setCompileState("validating");
    setStatusText("Validating InputConfig");
    setValidationErrors([]);
    setWarnings([]);
    setDetectedJsonType(builderMode === "Import JSON" ? "PENDING" : "N/A");

    try {
      const buildResult = buildCurrentInputConfig();

      if (buildResult.kind === "FSM_RESULT") {
        setLatestInputConfig({ input_mode: "IMPORT_JSON", imported_type: "FSM_RESULT" });
        setApiMeta(null);
        const normalized = normalizeAndStore(buildResult.raw, { import_type: "FSM_RESULT" });
        setCompileState(normalized.status === "OK" ? "success" : "error");
        setStatusText(
          normalized.status === "OK" ? "Imported FSM_Result normalized" : `Imported result ${normalized.status}`,
        );
        setLastCompileTime(nowLabel());
        return;
      }

      const validation = validateInputConfigLocal(buildResult);
      if (!validation.ok) {
        recordValidationFailure(validation.errors, { input_config: buildResult });
        return;
      }

      setLatestInputConfig(validation.config);
      const normalized = await runApiCompile(validation.config);
      setCompileState("success");
      setStatusText("Synthesis complete");
      setLastCompileTime(nowLabel());
      setWarnings(normalized.warnings);
    } catch (error) {
      const errors = error.validationErrors ?? [error.message];
      setCompileState("error");
      setStatusText(errors[0] ?? "Compile failed");
      setValidationErrors(errors);
      setLastCompileTime(nowLabel());
      setDebugBuffer((current) => ({ ...current, compile_error: error.message }));
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-root)] text-[var(--text-main)]">
      <TopCommandBar
        compileState={compileState}
        config={config}
        onCompile={handleCompile}
        onConfigChange={setConfig}
      />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 xl:grid-cols-[420px_minmax(0,1fr)_360px]">
        <InputBuilder
          config={config}
          mode={builderMode}
          onModeChange={setBuilderMode}
          stateRows={stateRows}
          onStateRowsChange={setStateRows}
          timingTrace={timingTrace}
          onTimingTraceChange={setTimingTrace}
          importJsonText={importJsonText}
          onImportJsonTextChange={setImportJsonText}
          onLoadTeacherExample={handleLoadTeacherExample}
        />
        <Workbench
          inputConfig={inspectorInputConfig}
          result={result}
          activeTab={activeResultTab}
          onActiveTabChange={setActiveResultTab}
        />
        <InspectorPanel
          result={result}
          apiMeta={apiMeta}
          inputConfig={inspectorInputConfig}
          compileState={compileState}
          currentInputMode={currentInputMode}
          validationErrors={validationErrors}
          warnings={warnings}
          rawResult={rawResult}
          debugBuffer={debugBuffer}
          debugModeActive={debugModeActive}
          debugPanelActive={debugPanelActive}
          detectedJsonType={detectedJsonType}
          normalizedResult={result}
          statusText={statusText}
        />
      </main>
      <StatusBar
        compileState={compileState}
        statusText={statusText}
        backendStatus={backendStatus}
        solverStatus={result?.status}
        currentInputMode={currentInputMode}
        activeResultTab={activeResultTab}
        lastCompileTime={lastCompileTime}
      />
    </div>
  );
}
