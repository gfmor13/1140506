import CircuitDiagramView from "./CircuitDiagramView.jsx";
import EmptyResultState from "./EmptyResultState.jsx";
import EquationView from "./EquationView.jsx";
import KMapView from "./KMapView.jsx";
import ResultTabs from "./ResultTabs.jsx";
import StateDiagramView from "./StateDiagramView.jsx";
import TimingDiagramView from "./TimingDiagramView.jsx";

export default function Workbench({ result, activeTab, onActiveTabChange, inputConfig }) {
  function renderActiveTab() {
    if (!result) return <EmptyResultState />;
    if (activeTab === "FF Equations") return <EquationView inputConfig={inputConfig} result={result} />;
    if (activeTab === "K-Map") return <KMapView inputConfig={inputConfig} result={result} />;
    if (activeTab === "State Diagram") {
      return <StateDiagramView fsmModel={inputConfig?.fsm_model} result={result} />;
    }
    if (activeTab === "Circuit Diagram") return <CircuitDiagramView inputConfig={inputConfig} result={result} />;
    return <TimingDiagramView result={result} />;
  }

  return (
    <section
      className="eda-dot-grid flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-[0_18px_42px_rgba(15,23,42,0.10)]"
      data-testid="workbench"
    >
      <ResultTabs activeTab={activeTab} onActiveTabChange={onActiveTabChange} />
      <div className="eda-scrollbar min-h-0 flex-1 overflow-auto p-3">{renderActiveTab()}</div>
    </section>
  );
}
