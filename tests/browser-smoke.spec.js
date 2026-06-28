import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const solverResultFixture = fs.readFileSync(
  path.join(rootDir, "test-fixtures", "solver-results", "minimal-result-y-xqb.json"),
  "utf8",
);
const constantOutputFixture = fs.readFileSync(
  path.join(rootDir, "test-fixtures", "input-configs", "state-table-d-constant-0.json"),
  "utf8",
);
const simplifyXInputFixture = fs.readFileSync(
  path.join(rootDir, "test-fixtures", "input-configs", "state-table-d-simplify-x.json"),
  "utf8",
);
const dThreeStateFixture = fs.readFileSync(
  path.join(rootDir, "test-fixtures", "input-configs", "state-table-d-3state.json"),
  "utf8",
);
const jkAlwaysToggleFixture = fs.readFileSync(
  path.join(rootDir, "test-fixtures", "input-configs", "state-table-jk-always-toggle.json"),
  "utf8",
);

test("EDA workbench browser smoke", async ({ page }) => {
  let generateCircuitCalls = 0;
  await page.route("**/api/generate-circuit", async (route) => {
    generateCircuitCalls += 1;
    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("1140506 EDA")).toBeVisible();
  await expect(page.getByText(/FSM digital logic design tool/)).toBeVisible();
  await expect(page.getByText(/1140506林稚婷/)).toBeVisible();
  await expect(page.getByText(/1140547林承緯/)).toHaveCount(0);
  await expect(page.getByText("Tuna's EDA Website")).toHaveCount(0);
  await expect(page.getByTestId("top-command-bar")).toBeVisible();
  await expect(page.getByTestId("input-builder")).toBeVisible();
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("inspector-panel")).toBeVisible();
  await expect(page.getByTestId("status-bar")).toBeVisible();
  const lightThemeApplied = await page.evaluate(() => {
    const bodyColor = getComputedStyle(document.body).backgroundColor;
    const workbenchColor = getComputedStyle(document.querySelector('[data-testid="workbench"]')).backgroundColor;
    const parseRgb = (value) => (value.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    const [bodyR, bodyG, bodyB] = parseRgb(bodyColor);
    const [panelR, panelG, panelB] = parseRgb(workbenchColor);
    return bodyR > 220 && bodyG > 220 && bodyB > 220 && panelR > 240 && panelG > 240 && panelB > 240;
  });
  expect(lightThemeApplied).toBe(true);

  for (const tab of [
    "tab-ff-equations",
    "tab-k-map",
    "tab-state-diagram",
    "tab-circuit-diagram",
    "tab-timing-diagram",
  ]) {
    await expect(page.getByTestId(tab)).toBeVisible();
  }

  for (const tab of [
    "tab-k-map",
    "tab-state-diagram",
    "tab-circuit-diagram",
    "tab-timing-diagram",
    "tab-ff-equations",
  ]) {
    await page.getByTestId(tab).click();
  }

  await page.getByTestId("mode-state-table").click();
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText("D0");
  await expect(page.getByTestId("workbench")).toContainText("X");
  await expect(page.getByTestId("workbench")).toContainText("Z");
  await expect(page.getByTestId("workbench")).not.toContainText("D_A");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_B#");
  expect(generateCircuitCalls).toBeGreaterThan(0);

  await page.getByTestId("tab-k-map").click();
  await expect(page.getByTestId("workbench")).toContainText(/D0|Z/);
  await expect(page.getByTestId("workbench")).toContainText(/0|1|X/);
  await expect(page.getByTestId("workbench")).toContainText(/:/);
  await expect(page.getByTestId("inspector-panel")).not.toContainText(/contains a 0 cell/i);

  await page.getByTestId("tab-state-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText("S0");
  await expect(page.getByTestId("workbench")).toContainText("S1");

  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText(/D FF|D_FF/);
  await expect(page.getByTestId("workbench")).toContainText(/OUTPUT|Z/);
  await expect(page.getByTestId("circuit-view-topology")).toHaveCount(0);
  await expect(page.getByTestId("circuit-view-schematic")).toHaveCount(0);
  await expect(page.getByTestId("circuit-fit-button")).toHaveCount(0);
  await expect(page.getByTestId("standard-circuit-diagram")).toBeVisible();
  await expect(page.getByTestId("schematic-view")).toBeVisible();
  await expect(page.getByTestId("schematic-view")).toContainText("D FF Q0");
  await expect(page.getByTestId("schematic-view")).toContainText("D");
  await expect(page.getByTestId("schematic-view")).toContainText("Q");
  await expect(page.getByTestId("schematic-view")).toContainText("Q0'");
  await expect(page.getByTestId("schematic-view")).toContainText("CLK");
  await expect(page.getByTestId("schematic-view")).toContainText("Z");
  await expect(page.getByTestId("schematic-clk-arrow-ff_A")).toBeVisible();
  await expect(page.getByTestId("standard-circuit-diagram")).toContainText("X");
  await expect(page.getByTestId("standard-circuit-diagram")).toContainText("D FF Q0");
  await expect(page.getByTestId("standard-circuit-diagram")).toContainText("Z");

  await page.getByTestId("tab-timing-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText("CLK");
  await expect(page.getByTestId("workbench")).toContainText("X");
  await expect(page.getByTestId("workbench")).toContainText(/Q/);
  await expect(page.getByTestId("workbench")).toContainText("Z");

  await page.getByLabel("FF Type").selectOption("T");
  await page.getByTestId("mode-state-table").click();
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText("T0");
  await expect(page.getByTestId("workbench")).toContainText("X");
  await expect(page.getByTestId("workbench")).not.toContainText("T_A");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_A#");
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText(/T FF|T_FF/);
  await expect(page.getByTestId("schematic-ff-T-Q0")).toBeVisible();
  await expect(page.getByTestId("schematic-clk-arrow-ff_A")).toBeVisible();
  await page.getByTestId("tab-timing-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText("Q0");
  await expect(page.getByTestId("workbench")).not.toContainText(/Qa|Q_A/);

  await page.getByLabel("FF Type").selectOption("JK");
  await page.getByTestId("mode-state-table").click();
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText("J0");
  await expect(page.getByTestId("workbench")).toContainText("K0");
  await expect(page.getByTestId("workbench")).toContainText("X");
  await expect(page.getByTestId("workbench")).not.toContainText("J_A");
  await expect(page.getByTestId("workbench")).not.toContainText("K_A");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_A#");
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText(/JK FF|JK_FF/);
  await expect(page.getByTestId("schematic-view")).toContainText("JK FF Q0");
  await expect(page.getByTestId("schematic-view")).toContainText("J");
  await expect(page.getByTestId("schematic-view")).toContainText("K");
  await expect(page.getByTestId("schematic-view")).toContainText("Q");
  await expect(page.getByTestId("schematic-view")).toContainText("Q0'");
  await page.getByTestId("tab-timing-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText("Q0");
  await expect(page.getByTestId("workbench")).not.toContainText(/Qa|Q_A/);

  await page.getByTestId("teacher-standard-mode").click();
  await expect(page.getByLabel("FSM Model")).toHaveValue("Mealy");
  await expect(page.getByLabel("FF Type")).toHaveValue("JK");
  await expect(page.getByLabel("States")).toHaveValue("3");
  await expect(page.getByLabel("Inputs")).toHaveValue("1");
  await expect(page.getByLabel("Outputs")).toHaveValue("1");
  await expect(page.getByLabel("present-state-0")).toHaveValue("A");
  await expect(page.getByLabel("next-state-0-0")).toHaveValue("A");
  await expect(page.getByLabel("output-0-0")).toHaveValue("0");
  await expect(page.getByLabel("next-state-1-0")).toHaveValue("B");
  await expect(page.getByLabel("output-1-0")).toHaveValue("0");
  await expect(page.getByLabel("present-state-1")).toHaveValue("B");
  await expect(page.getByLabel("next-state-0-1")).toHaveValue("C");
  await expect(page.getByLabel("output-0-1")).toHaveValue("1");
  await expect(page.getByLabel("next-state-1-1")).toHaveValue("A");
  await expect(page.getByLabel("output-1-1")).toHaveValue("0");
  await expect(page.getByLabel("present-state-2")).toHaveValue("C");
  await expect(page.getByLabel("next-state-0-2")).toHaveValue("A");
  await expect(page.getByLabel("output-0-2")).toHaveValue("1");
  await expect(page.getByLabel("next-state-1-2")).toHaveValue("C");
  await expect(page.getByLabel("output-1-2")).toHaveValue("1");
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText("OUTPUT 1: FLIP-FLOP INPUT EQUATIONS");
  await expect(page.getByTestId("workbench")).toContainText("Flip-Flop Input Equations (Simplified)");
  await expect(page.getByTestId("workbench")).toContainText("State Variables: Q1 Q0");
  await expect(page.getByTestId("workbench")).toContainText("Flip-Flop");
  await expect(page.getByTestId("workbench")).toContainText("Input");
  await expect(page.getByTestId("workbench")).toContainText("Equation");
  await expect(page.getByTestId("workbench")).toContainText("FF for Q1");
  await expect(page.getByTestId("workbench")).toContainText("FF for Q0");
  await expect(page.getByTestId("teacher-equation-J1")).toContainText("J1 = Q0·X'");
  await expect(page.getByTestId("teacher-equation-K1")).toContainText("K1 = X'");
  await expect(page.getByTestId("teacher-equation-J0")).toContainText("J0 = Q1'·X");
  await expect(page.getByTestId("teacher-equation-K0")).toContainText("K0 = 1");
  await expect(page.getByTestId("teacher-equation-Z")).toContainText("Z = Q1 + Q0·X'");
  await expect(page.getByTestId("workbench")).not.toContainText("Standard Equations");
  await expect(page.getByTestId("workbench")).not.toContainText("FF input equations");
  await expect(page.getByTestId("internal-solver-equations")).toContainText("Internal Solver Equations");
  await expect(page.getByTestId("workbench")).not.toContainText("J_A");
  await expect(page.getByTestId("workbench")).not.toContainText("K_A");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_A#");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_B#");
  await page.getByTestId("tab-k-map").click();
  await expect(page.getByTestId("workbench")).not.toContainText(/Teacher Standard|course reference|Example K-Map/i);
  await expect(page.getByTestId("workbench")).toContainText("Expression");
  await expect(page.getByTestId("workbench")).toContainText("Q1");
  await expect(page.getByTestId("workbench")).toContainText("Q0");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_A");
  await page.getByTestId("tab-state-diagram").click();
  for (const edgeId of [
    "state-edge-S0-S0-X0-Z0",
    "state-edge-S0-S1-X1-Z0",
    "state-edge-S1-S2-X0-Z1",
    "state-edge-S1-S0-X1-Z0",
    "state-edge-S2-S0-X0-Z1",
    "state-edge-S2-S2-X1-Z1",
  ]) {
    await expect(page.getByTestId(edgeId)).toBeVisible();
  }
  await expect(page.getByTestId("state-edge-label-S0-S0-X0-Z0")).toHaveText("0/0");
  await expect(page.getByTestId("state-edge-label-S0-S1-X1-Z0")).toHaveText("1/0");
  await expect(page.getByTestId("state-edge-label-S1-S2-X0-Z1")).toHaveText("0/1");
  await expect(page.getByTestId("state-edge-label-S1-S0-X1-Z0")).toHaveText("1/0");
  await expect(page.getByTestId("state-edge-label-S2-S0-X0-Z1")).toHaveText("0/1");
  await expect(page.getByTestId("state-edge-label-S2-S2-X1-Z1")).toHaveText("1/1");
  const stateDiagramLabelsOk = await page.evaluate(() => {
    const box = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    const overlaps = (a, b, gap = 0) =>
      Boolean(a && b && a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top);
    const svg = document.querySelector('[data-testid="state-diagram-svg"]')?.getBoundingClientRect();
    const s0Loop = box("state-edge-label-S0-S0-X0-Z0");
    const forwardPath = document.querySelector('[data-testid="state-edge-S0-S1-X1-Z0"] path')?.getAttribute("d");
    const reversePath = document.querySelector('[data-testid="state-edge-S1-S0-X1-Z0"] path')?.getAttribute("d");
    const forwardArrow = document.querySelector('[data-testid="state-edge-S0-S1-X1-Z0"] path')?.getAttribute("marker-end");
    const reverseArrow = document.querySelector('[data-testid="state-edge-S1-S0-X1-Z0"] path')?.getAttribute("marker-end");
    const forwardLabel = box("state-edge-label-S0-S1-X1-Z0");
    const reverseLabel = box("state-edge-label-S1-S0-X1-Z0");
    if (!svg || !s0Loop || !forwardPath || !reversePath || !forwardLabel || !reverseLabel) return false;
    const selfLoopLabelInside =
      s0Loop.left > svg.left + 4 &&
      s0Loop.right < svg.right - 4 &&
      s0Loop.top > svg.top + 4 &&
      s0Loop.bottom < svg.bottom - 4;
    return (
      selfLoopLabelInside &&
      forwardPath !== reversePath &&
      forwardArrow?.includes("arrow-cyan") &&
      reverseArrow?.includes("arrow-cyan") &&
      !overlaps(forwardLabel, reverseLabel, 4)
    );
  });
  expect(stateDiagramLabelsOk).toBe(true);
  await expect(page.getByTestId("workbench")).toContainText("Q1Q0 = 00");
  await expect(page.getByTestId("workbench")).toContainText("Q1Q0 = 01");
  await expect(page.getByTestId("workbench")).toContainText("Q1Q0 = 10");
  await expect(page.getByTestId("workbench")).not.toContainText(/Q_A|Q_B/);
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("circuit-view-topology")).toHaveCount(0);
  await expect(page.getByTestId("circuit-view-schematic")).toHaveCount(0);
  await expect(page.getByTestId("circuit-fit-button")).toHaveCount(0);
  await expect(page.getByTestId("circuit-view-teacher")).toHaveCount(0);
  await expect(page.getByTestId("standard-circuit-diagram")).toBeVisible();
  await expect(page.getByTestId("teacher-schematic-root")).toBeVisible();
  for (const id of [
    "teacher-rail-X",
    "teacher-rail-X-not",
    "teacher-x-source",
    "teacher-rail-x-main",
    "teacher-x-main-arrow",
    "teacher-rail-x-branch-to-not",
    "teacher-x-to-not-input",
    "teacher-not-gate",
    "teacher-not-input-X",
    "teacher-not-output-Xnot",
    "teacher-rail-x-not",
    "teacher-xnot-rail",
    "teacher-xnot-label",
    "teacher-x-not-from-not-output",
    "teacher-not-X",
    "teacher-gate-AND-J1",
    "teacher-gate-AND-J0",
    "teacher-gate-AND-ZTERM",
    "teacher-gate-OR-Z",
    "teacher-const-1",
    "teacher-ff-Q1",
    "teacher-ff-Q0",
    "teacher-output-Z",
    "teacher-clk-bus",
    "teacher-clk-tap-Q1",
    "teacher-clk-tap-Q0",
    "teacher-clk-dot-Q1",
    "teacher-clk-dot-Q0",
    "jk-clk-bus",
    "jk-clk-tap-q1",
    "jk-clk-tap-q0",
    "jk-clk-entry-q1",
    "jk-clk-entry-q0",
    "jk-z-term-and",
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId("teacher-x-main-bus-q1")).toHaveCount(0);
  await expect(page.getByTestId("teacher-x-main-bus-q0")).toHaveCount(0);
  await expect(page.getByTestId("teacher-x-main-arrow-q1")).toHaveCount(0);
  await expect(page.getByTestId("teacher-x-main-arrow-q0")).toHaveCount(0);
  await expect(page.getByTestId("schematic-standard-equations-panel")).toBeVisible();
  await expect(page.getByTestId("schematic-standard-equations-panel")).toContainText("Reference Equations");
  await expect(page.getByTestId("schematic-standard-equations-panel")).toContainText("J1 = Q0·X'");
  await expect(page.getByTestId("schematic-standard-equations-panel")).toContainText("K1 = X'");
  await expect(page.getByTestId("schematic-standard-equations-panel")).toContainText("J0 = Q1'·X");
  await expect(page.getByTestId("schematic-standard-equations-panel")).toContainText("K0 = 1");
  await expect(page.getByTestId("schematic-standard-equations-panel")).toContainText("Z = Q1 + Q0·X'");
  await expect(page.getByTestId("schematic-standard-equations-panel")).not.toContainText("J1 = X·Q0");
  await expect(page.getByTestId("schematic-standard-equations-panel")).not.toContainText("K1 = X' + Q0");
  await expect(page.getByTestId("schematic-standard-equations-panel")).not.toContainText("J0 = Q1·X");
  await expect(page.locator('[data-testid^="teacher-gate-OR-"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="teacher-gate-AND-"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="teacher-not-X"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="teacher-const-1"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="wire-jump"]')).not.toHaveCount(0);
  await expect(page.locator('[data-testid="junction-dot"]')).not.toHaveCount(0);
  await expect(page.getByTestId("wire-jump-x-feedback")).toBeVisible();
  await expect(page.getByTestId("wire-jump-xnot-q0")).toBeVisible();
  for (const id of [
    "teacher-wire-J0",
    "teacher-wire-CONST1-K0",
    "teacher-wire-Q1-Z",
    "teacher-wire-Q1n-feedback",
    "teacher-wire-Q0-feedback",
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId(id)).toHaveAttribute("data-collision", "false");
  }
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("X");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("X'");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("NOT");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("AND");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("OR");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("JK FF Q1");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("JK FF Q0");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("J1");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("K1");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("J0");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("K0");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("Q1");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("Q0");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("Z");
  await expect(page.getByTestId("teacher-schematic-root")).toContainText("CLK");
  await expect(page.getByTestId("teacher-schematic-root")).not.toContainText("Q_A#");
  await expect(page.getByTestId("teacher-schematic-root")).not.toContainText("Q_B#");
  await expect(page.getByTestId("teacher-schematic-root")).not.toContainText("J_A");
  await expect(page.getByTestId("teacher-schematic-root")).not.toContainText("K_A");
  await expect(page.getByTestId("teacher-schematic-root")).not.toContainText("J_B");
  await expect(page.getByTestId("teacher-schematic-root")).not.toContainText("K_B");
  await expect(page.getByTestId("teacher-schematic-root")).not.toContainText("Y");
  const teacherReferenceLayoutOk = await page.evaluate(() => {
    const box = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    const pathD = (id) => document.querySelector(`[data-testid="${id}"]`)?.getAttribute("d");
    const overlaps = (a, b, gap = 0) =>
      Boolean(a && b && a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top);
    const svg = box("teacher-schematic-root");
    const svgElement = document.querySelector('[data-testid="teacher-schematic-root"]');
    const andJ1 = box("teacher-gate-AND-J1");
    const andJ0 = box("teacher-gate-AND-J0");
    const andZTerm = box("teacher-gate-AND-ZTERM");
    const orZ = box("teacher-gate-OR-Z");
    const constOne = box("teacher-const-1");
    const gates = [andJ1, andJ0, andZTerm, orZ, constOne];
    const q1 = box("teacher-ff-Q1");
    const q0 = box("teacher-ff-Q0");
    const output = box("teacher-output-Z");
    const clk = box("teacher-clk-bus");
    const jkClkBus = box("jk-clk-bus");
    const jkClkTapQ1 = box("jk-clk-tap-q1");
    const jkClkTapQ0 = box("jk-clk-tap-q0");
    const jkZTermAnd = box("jk-z-term-and");
    const equationsPanel = box("schematic-standard-equations-panel");
    const collisionGuard = document.querySelector('[data-testid="teacher-collision-guard"]');
    if (
      !svg ||
      !svgElement ||
      !q1 ||
      !q0 ||
      !output ||
      !clk ||
      !jkClkBus ||
      !jkClkTapQ1 ||
      !jkClkTapQ0 ||
      !jkZTermAnd ||
      !equationsPanel ||
      gates.some((gate) => !gate)
    )
      return false;
    const expectedPaths = {
      "teacher-wire-X-NOT": "M 120 100 V 152 H 110",
      "teacher-wire-NOT-Xn": "M 180 152 H 230",
      "teacher-wire-Xn-J1": "M 230 208 H 340",
      "teacher-wire-Q0-to-J1": "M 300 232 H 340",
      "teacher-wire-J1": "M 444 222 H 585 V 210 H 620",
      "teacher-wire-Xn-K1": "M 230 270 H 585 V 250 H 620",
      "teacher-wire-X-J0": "M 200 100 V 432 H 340",
      "teacher-wire-Q1n-feedback": "M 770 250 H 785 V 140 H 1110 V 635 H 320 V 408 H 340",
      "teacher-wire-J0": "M 444 422 H 810 V 210 H 850",
      "teacher-wire-Q0-feedback": "M 1000 210 H 1090 V 600 H 300 V 232",
      "teacher-wire-Q0-to-ZTERM": "M 300 518 H 680",
      "teacher-wire-Xn-ZTERM": "M 230 542 H 680",
      "teacher-wire-ZTERM-OR": "M 784 532 H 900 V 548 H 950",
      "teacher-wire-CONST1-K0": "M 724 351 H 830 V 250 H 850",
      "teacher-wire-Q1-Z": "M 770 210 H 790 V 522 H 950",
      "teacher-wire-ORZ-Z": "M 1060 532 H 1120 V 520 H 1160",
      "jk-clk-entry-q1": "M 695 290 V 312 H 608 V 690",
      "jk-clk-entry-q0": "M 925 290 V 615 H 1000 V 690",
    };
    const lanesMatch = Object.entries(expectedPaths).every(([id, d]) => pathD(id) === d);
    const viewBox = svgElement.getAttribute("viewBox");
    const inputGatesBeforeFfs = andJ1.right < q1.left - 12 && andJ0.right < q1.left - 12;
    const gatesClear = gates.every((gate) => !overlaps(gate, q1, 8) && !overlaps(gate, q0, 8));
    const outputInside = output.right < svg.right - 12 && output.left > svg.left + 12;
    const or2BeforeOutput = orZ.right < output.left - 8;
    const equationsClear = equationsPanel.top > svg.bottom + 4 || equationsPanel.left > svg.right + 4;
    const noInitialOverflow = svgElement.parentElement.scrollWidth <= svgElement.parentElement.clientWidth + 1;
    return (
      viewBox === "0 0 1320 820" &&
      lanesMatch &&
      inputGatesBeforeFfs &&
      gatesClear &&
      outputInside &&
      or2BeforeOutput &&
      equationsClear &&
      noInitialOverflow &&
      collisionGuard?.getAttribute("data-collisions") === "0" &&
      collisionGuard?.getAttribute("data-clk-collisions") === "0"
    );
  });
  expect(teacherReferenceLayoutOk).toBe(true);
  await expect(page.getByTestId("teacher-schematic-root")).toBeVisible();
  await page.getByTestId("tab-timing-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText("Q1");
  await expect(page.getByTestId("workbench")).toContainText("Q0");
  await expect(page.getByTestId("workbench")).toContainText("Z");

  await page.getByLabel("States").fill("2");
  await page.getByTestId("mode-import-json").click();
  await page.getByLabel("import-json").fill(jkAlwaysToggleFixture);
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("schematic-ff-JK-A")).toBeVisible();
  await expect(page.getByTestId("schematic-output-Y")).toBeVisible();
  await expect(page.getByTestId("schematic-constant-rail-1")).toBeVisible();
  await expect(page.getByTestId("schematic-constant-rail-1")).toContainText("CONST 1");
  await expect(page.getByTestId("schematic-wire-CONST1-ff_A-J")).toHaveCount(1);
  await expect(page.getByTestId("schematic-wire-CONST1-ff_A-K")).toHaveCount(1);
  await expect(page.getByTestId("schematic-clk-bus")).toContainText("CLK");
  await expect(page.getByTestId("schematic-clk-bus")).toContainText("display-only");
  const jkSchematicLayoutIsInsidePanel = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="schematic-view"]');
    const output = document.querySelector('[data-testid="schematic-output-Y"]');
    const constantRail = document.querySelector('[data-testid="schematic-constant-rail-1"]');
    const ff = document.querySelector('[data-testid="schematic-ff-JK-A"]');
    if (!svg || !output || !constantRail || !ff) return false;
    const svgBox = svg.getBoundingClientRect();
    const outputBox = output.getBoundingClientRect();
    const constantBox = constantRail.getBoundingClientRect();
    const ffBox = ff.getBoundingClientRect();
    const outputInside = outputBox.right < svgBox.right - 18 && outputBox.left > svgBox.left + 18;
    const constantSeparate = constantBox.right < ffBox.left - 24;
    return outputInside && constantSeparate;
  });
  expect(jkSchematicLayoutIsInsidePanel).toBe(true);

  await page.getByLabel("FF Type").selectOption("SR");
  await page.getByTestId("mode-state-table").click();
  await page.getByLabel("present-state-0").fill("A");
  await page.getByLabel("next-state-0-0").fill("A");
  await page.getByLabel("output-0-0").fill("0");
  await page.getByLabel("next-state-1-0").fill("B");
  await page.getByLabel("output-1-0").fill("1");
  await page.getByLabel("present-state-1").fill("B");
  await page.getByLabel("next-state-0-1").fill("A");
  await page.getByLabel("output-0-1").fill("0");
  await page.getByLabel("next-state-1-1").fill("B");
  await page.getByLabel("output-1-1").fill("0");
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await expect(page.getByTestId("inspector-panel")).not.toContainText(/SR illegal overlap/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText("S0");
  await expect(page.getByTestId("workbench")).toContainText("R0");
  await expect(page.getByTestId("workbench")).not.toContainText("S_A");
  await expect(page.getByTestId("workbench")).not.toContainText("R_A");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_A#");
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText(/SR FF|SR_FF/);
  await expect(page.getByTestId("schematic-ff-SR-Q0")).toBeVisible();
  await expect(page.getByTestId("schematic-clk-arrow-ff_A")).toBeVisible();
  await page.getByTestId("tab-timing-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText("Q0");
  await expect(page.getByTestId("workbench")).not.toContainText(/Qa|Q_A/);

  await page.getByLabel("FF Type").selectOption("D");
  await page.getByTestId("mode-timing-trace").click();
  await expect(page.getByText("X input")).toBeVisible();
  await expect(page.getByText("Z output")).toBeVisible();
  await expect(page.getByText("CLK input")).toHaveCount(0);
  await page.getByLabel("X input").fill("0110");
  await page.getByLabel("Z output").fill("0101");
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await expect(page.getByTestId("inspector-panel")).toContainText(/TIMING_TRACE/i);
  await expect(page.getByTestId("inspector-panel")).toContainText(/Trace Length/i);
  await expect(page.getByTestId("inspector-panel")).toContainText(/Inferred States/i);
  await expect(page.getByTestId("inspector-panel")).toContainText(/Deterministic/i);
  await expect(page.getByTestId("inspector-panel")).toContainText(/phase4a_observed_trace_baseline/i);
  await page.getByTestId("tab-timing-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText("CLK");
  await expect(page.getByTestId("workbench")).toContainText("X");
  await expect(page.getByTestId("workbench")).toContainText("Z");
  await expect(page.getByTestId("workbench")).toContainText("Q0");
  await expect(page.getByTestId("workbench")).not.toContainText(/Qa|Q_A/);
  await expect(page.getByTestId("workbench")).toContainText(/Step|Trace length/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText(/D0|Z/);
  await expect(page.getByTestId("workbench")).toContainText(/Flip-Flop Input Equations|Output Equation/i);
  await page.getByTestId("tab-state-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText(/S0|S1/);
  await expect(page.getByTestId("workbench")).toContainText(/steps|Inferred from Timing Trace/i);
  await page.getByTestId("tab-k-map").click();
  await expect(page.getByTestId("workbench")).toContainText(/Expression|Groups|Don't-care/i);
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText(/D FF|D_FF/);
  await expect(page.getByTestId("workbench")).toContainText(/OUTPUT|Z/);
  await expect(page.getByTestId("circuit-fit-button")).toHaveCount(0);
  await expect(page.getByTestId("standard-circuit-diagram")).toBeVisible();
  await expect(page.getByTestId("schematic-view")).toBeVisible();
  const circuitFitsWorkbench = await page.evaluate(() => {
    const workbench = document.querySelector('[data-testid="workbench"]');
    const svg = document.querySelector('[data-testid="schematic-view"]');
    if (!workbench || !svg) return false;
    const workbenchBox = workbench.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    return svgBox.left >= workbenchBox.left - 1 && svgBox.right <= workbenchBox.right + 1;
  });
  expect(circuitFitsWorkbench).toBe(true);
  await expect(page.getByTestId("standard-circuit-diagram")).toContainText("D FF Q0");
  await expect(page.getByTestId("standard-circuit-diagram")).toContainText("Z");
  await expect(page.getByTestId("unused-input-rail")).toContainText("Unused Inputs");
  await expect(page.getByTestId("unused-input-rail")).toContainText("X");
  await expect(page.getByTestId("unused-input-rail")).toContainText("optimized out");
  await expect(page.getByTestId("circuit-footer")).toContainText("Unused inputs: X");
  await expect(page.getByTestId("schematic-view")).toContainText("D FF Q0");
  await expect(page.getByTestId("schematic-view")).toContainText("Z");
  await expect(page.getByTestId("schematic-view")).toContainText("Unused Inputs");
  await expect(page.getByTestId("schematic-view")).toContainText("X");
  await expect(page.getByTestId("schematic-view")).toContainText("optimized out");
  await expect(page.getByTestId("schematic-view")).not.toContainText("Q_A#");
  await expect(page.getByTestId("schematic-view")).toContainText(/Q0'|Q'/);
  await expect(page.getByTestId("workbench")).not.toContainText(/"nodes"|"edges"/);
  await expect(page.getByTestId("workbench")).not.toContainText("Q_A#");

  await page.getByTestId("mode-import-json").click();
  await page.getByLabel("import-json").fill(simplifyXInputFixture);
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("standard-circuit-diagram")).toContainText("X");
  await expect(page.getByTestId("standard-circuit-diagram")).toContainText("D FF Q0");
  await expect(page.getByTestId("unused-input-rail")).toHaveCount(0);
  await expect(page.getByTestId("circuit-footer")).not.toContainText("Unused inputs: X");
  await expect(page.getByTestId("schematic-view")).toContainText("X");
  await expect(page.getByTestId("schematic-view")).toContainText("D FF Q0");
  await expect(page.getByTestId("schematic-view")).toContainText("D0");
  await expect(page.getByTestId("schematic-view").locator('[data-testid="schematic-wire-X-ff_A-D"]')).toHaveCount(1);
  await expect(page.getByTestId("schematic-view").locator('[data-testid="unused-input-rail"]')).toHaveCount(0);

  await page.getByTestId("mode-import-json").click();
  await page.getByLabel("import-json").fill(dThreeStateFixture);
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText("D1 = Q1·X + Q0·X'");
  await expect(page.getByTestId("workbench")).toContainText("D0 = Q1'·Q0'·X");
  await expect(page.getByTestId("workbench")).toContainText("Z = Q1 + Q0·X'");
  await expect(page.getByTestId("workbench")).not.toContainText("D_A");
  await expect(page.getByTestId("workbench")).not.toContainText("D_B");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_A#");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_B#");
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("d-schematic-root")).toBeVisible();
  await expect(page.getByTestId("schematic-gate-d-input-not")).toBeVisible();
  await expect(page.getByTestId("d-x-to-not-input")).toBeVisible();
  await expect(page.getByTestId("d-xnot-from-not-output")).toBeVisible();
  await expect(page.getByTestId("schematic-rail-X-not")).toBeVisible();
  await expect(page.getByTestId("d-and-d1-q1-x")).toBeVisible();
  await expect(page.getByTestId("d-and-d1-q0-xnot")).toBeVisible();
  await expect(page.getByTestId("d-or-d1")).toBeVisible();
  await expect(page.getByTestId("d-or-d1-to-d1-pin")).toHaveCount(1);
  await expect(page.getByTestId("d-ff-q1-d1-pin")).toBeVisible();
  await expect(page.getByTestId("d-and-d0")).toBeVisible();
  await expect(page.getByTestId("d-and-d0-to-d0-pin")).toBeVisible();
  await expect(page.getByTestId("d-z-or-gate")).toBeVisible();
  await expect(page.getByTestId("d-z-or-input-q1")).toHaveCount(1);
  await expect(page.getByTestId("d-z-or-input-q0-xnot")).toHaveCount(1);
  await expect(page.getByTestId("d-z-or-output")).toHaveCount(1);
  await expect(page.getByTestId("d-z-term-q0-xnot")).toBeVisible();
  await expect(page.getByTestId("d-q1-to-z-or")).toBeVisible();
  await expect(page.getByTestId("d-q0-xnot-to-z-or")).toBeVisible();
  await expect(page.getByTestId("d-q1-feedback")).toBeVisible();
  await expect(page.getByTestId("d-q1not-feedback")).toBeVisible();
  await expect(page.getByTestId("d-q0-feedback")).toBeVisible();
  await expect(page.getByTestId("d-q0not-feedback")).toBeVisible();
  await expect(page.getByTestId("d-ff-q1")).toBeVisible();
  await expect(page.getByTestId("d-ff-q0")).toBeVisible();
  await expect(page.getByTestId("schematic-gate-D1-OR")).toBeVisible();
  await expect(page.getByTestId("schematic-gate-D0-AND")).toBeVisible();
  await expect(page.getByTestId("schematic-gate-OUT-OR")).toBeVisible();
  await expect(page.getByTestId("d-right-or-gate")).toBeVisible();
  await expect(page.locator('[data-testid="d-xnot-downstream-wire"]')).not.toHaveCount(0);
  const dOutputInputLaneCount = await page.locator('[data-testid="d-output-or-input-lane"]').count();
  expect(dOutputInputLaneCount).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("d-right-or-input-lane-1")).toHaveCount(1);
  await expect(page.getByTestId("d-right-or-input-lane-2")).toHaveCount(1);
  await expect(page.locator('[data-testid="d-right-feedback-bus"]')).toHaveCount(0);
  await expect(page.getByTestId("d-output-or-to-z")).toHaveCount(1);
  await expect(page.getByTestId("d-right-or-to-z")).toHaveCount(1);
  await expect(page.getByTestId("schematic-ff-D-Q1")).toBeVisible();
  await expect(page.getByTestId("schematic-ff-D-Q0")).toBeVisible();
  await expect(page.getByTestId("schematic-view")).toContainText("D1");
  await expect(page.getByTestId("schematic-view")).toContainText("D0");
  await expect(page.getByTestId("schematic-clk-bus")).toContainText("CLK");
  await expect(page.getByTestId("d-clk-bus")).toBeVisible();
  await expect(page.getByTestId("d-clk-tap-q1")).toBeVisible();
  await expect(page.getByTestId("d-clk-tap-q0")).toBeVisible();
  await expect(page.getByTestId("d-ff-q1-clock-pin")).toBeVisible();
  await expect(page.getByTestId("d-ff-q0-clock-pin")).toBeVisible();
  await expect(page.getByTestId("d-wire-D1-to-pin")).toHaveCount(1);
  await expect(page.getByTestId("d-wire-D0-to-pin")).toBeVisible();
  await expect(page.getByTestId("d-wire-output-Z")).toHaveCount(1);
  await expect(page.getByTestId("d-wire-D1-to-pin")).toHaveAttribute("data-collision", "false");
  await expect(page.getByTestId("d-wire-D0-to-pin")).toHaveAttribute("data-collision", "false");
  await expect(page.getByTestId("d-wire-output-Z")).toHaveAttribute("data-collision", "false");
  const dOutputWireWidth = await page.getByTestId("d-wire-output-Z").evaluate((element) => {
    const box = element instanceof SVGGraphicsElement ? element.getBBox() : null;
    return box?.width ?? 0;
  });
  expect(dOutputWireWidth).toBeGreaterThan(40);
  await expect(page.locator('[data-testid="d-wire-jump"]')).toHaveCount(0);
  await expect(page.getByTestId("schematic-clk-arrow-ff_A")).toBeVisible();
  await expect(page.getByTestId("schematic-clk-arrow-ff_B")).toBeVisible();
  await expect(page.getByTestId("schematic-view").locator('[data-testid$="ff_A-D"]')).not.toHaveCount(0);
  await expect(page.getByTestId("schematic-view").locator('[data-testid$="ff_B-D"]')).not.toHaveCount(0);
  const dFinalRoutingQuality = await page.evaluate(() => {
    const bbox = (selector) => {
      const element = document.querySelector(selector);
      return element instanceof SVGGraphicsElement ? element.getBBox() : null;
    };
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const outputWire = bbox('[data-testid="d-output-or-to-z"]');
    const rightOutputWire = bbox('[data-testid="d-right-or-to-z"]');
    const output = bbox('[data-testid="schematic-output-Z"]');
    const outputOr = bbox('[data-testid="d-right-or-gate"]');
    const feedbackBuses = Array.from(document.querySelectorAll('[data-testid="d-right-feedback-bus"]'))
      .map((element) => (element instanceof SVGGraphicsElement ? element.getBBox() : null))
      .filter(Boolean);
    const outputLanes = Array.from(document.querySelectorAll('[data-testid="d-output-or-input-lane"]'))
      .map((element) => (element instanceof SVGGraphicsElement ? element.getBBox() : null))
      .filter(Boolean);
    const zLaneQ1 = bbox('[data-testid="d-z-or-input-q1"]');
    const zLaneQ0Xn = bbox('[data-testid="d-z-or-input-q0-xnot"]');
    const d1ToPin = bbox('[data-testid="d-or-d1-to-d1-pin"]');
    const d1Pin = bbox('[data-testid="d-ff-q1-d1-pin"]');
    const d1Q1Feedback = bbox('[data-testid="d-q1-feedback"]');
    const d1Q0Feedback = bbox('[data-testid="d-q0-feedback"]');
    const q1NotFeedback = bbox('[data-testid="d-q1not-feedback"]');
    const q0NotFeedback = bbox('[data-testid="d-q0not-feedback"]');
    const xNotRail = bbox('[data-testid="d-xnot-from-not-output"]');
    const xNotDownstream = Array.from(document.querySelectorAll('[data-testid="d-xnot-downstream-wire"]'))
      .some((element) => {
        if (!(element instanceof SVGGraphicsElement)) return false;
        const box = element.getBBox();
        return xNotRail && box.width > 40 && box.x >= xNotRail.x - 2;
      });
    const q1 = document.querySelector('[data-testid="schematic-ff-D-Q1"]')?.getBoundingClientRect();
    const q0 = document.querySelector('[data-testid="schematic-ff-D-Q0"]')?.getBoundingClientRect();
    const tapQ1 = document.querySelector('[data-testid="d-clk-tap-q1"]')?.getBoundingClientRect();
    const tapQ0 = document.querySelector('[data-testid="d-clk-tap-q0"]')?.getBoundingClientRect();
    const clkStaysOutsideFfs =
      q1 && q0 && tapQ1 && tapQ0 && tapQ1.top >= q1.bottom - 6 && tapQ0.top >= q0.bottom - 6;
    const outputAligned =
      outputWire && rightOutputWire && output && outputOr &&
      outputWire.width > 60 && rightOutputWire.width > 60 &&
      Math.abs(outputWire.y + outputWire.height / 2 - (output.y + output.height / 2)) < 6 &&
      output.x > outputWire.x + outputWire.width - 3;
    const sortedOutputLanes = outputLanes.sort((a, b) => a.y - b.y);
    const inputLanesSeparated =
      sortedOutputLanes.length >= 2 &&
      sortedOutputLanes.every((lane, index) => index === 0 || Math.abs(lane.y - sortedOutputLanes[index - 1].y) >= 8);
    const zInputLanesSeparated = zLaneQ1 && zLaneQ0Xn && Math.abs(zLaneQ1.y - zLaneQ0Xn.y) >= 18;
    const inputApproachGap =
      outputOr && sortedOutputLanes.every((lane) => lane.x + lane.width >= outputOr.x - 2 && lane.x <= outputOr.x - 24);
    const feedbackBusAway =
      outputOr && feedbackBuses.length === 0;
    const invertedFeedbackKeptAway =
      outputOr && q1NotFeedback && q0NotFeedback &&
      q1NotFeedback.x + q1NotFeedback.width < outputOr.x - 80 &&
      q0NotFeedback.x + q0NotFeedback.width < outputOr.x - 80;
    const d1OutputHorizontalToPin =
      d1ToPin && d1Pin &&
      Math.abs((d1ToPin.y + d1ToPin.height / 2) - (d1Pin.y + d1Pin.height / 2)) < 4 &&
      d1ToPin.x + d1ToPin.width >= d1Pin.x - 2;
    const d1FeedbackKeptAwayFromZOr =
      outputOr && d1Q1Feedback && d1Q0Feedback &&
      d1Q1Feedback.x + d1Q1Feedback.width < outputOr.x - 70 &&
      d1Q0Feedback.x + d1Q0Feedback.width < outputOr.x - 70;
    return Boolean(xNotDownstream && clkStaysOutsideFfs && outputAligned && inputLanesSeparated && zInputLanesSeparated && inputApproachGap && feedbackBusAway && invertedFeedbackKeptAway && d1OutputHorizontalToPin && d1FeedbackKeptAwayFromZOr);
  });
  expect(dFinalRoutingQuality).toBe(true);
  const dSchematicQuality = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="schematic-view"]');
    const collisionGuard = document.querySelector('[data-testid="d-collision-guard"]');
    const q1 = document.querySelector('[data-testid="schematic-ff-D-Q1"]')?.getBoundingClientRect();
    const q0 = document.querySelector('[data-testid="schematic-ff-D-Q0"]')?.getBoundingClientRect();
    const q1ClockPin = document.querySelector('[data-testid="d-ff-q1-clock-pin"]') instanceof SVGGraphicsElement
      ? document.querySelector('[data-testid="d-ff-q1-clock-pin"]').getBBox()
      : null;
    const q0ClockPin = document.querySelector('[data-testid="d-ff-q0-clock-pin"]') instanceof SVGGraphicsElement
      ? document.querySelector('[data-testid="d-ff-q0-clock-pin"]').getBBox()
      : null;
    const q1Tap = document.querySelector('[data-testid="d-clk-tap-q1"]') instanceof SVGGraphicsElement
      ? document.querySelector('[data-testid="d-clk-tap-q1"]').getBBox()
      : null;
    const q0Tap = document.querySelector('[data-testid="d-clk-tap-q0"]') instanceof SVGGraphicsElement
      ? document.querySelector('[data-testid="d-clk-tap-q0"]').getBBox()
      : null;
    const d1 = document.querySelector('[data-testid="d-wire-D1-to-pin"]')?.getBoundingClientRect();
    const d0 = document.querySelector('[data-testid="d-wire-D0-to-pin"]')?.getBoundingClientRect();
    if (!svg || !q1 || !q0 || !q1ClockPin || !q0ClockPin || !q1Tap || !q0Tap || !d1 || !d0) return false;
    const noOverflow = Boolean(svg.parentElement && svg.parentElement.scrollWidth <= svg.parentElement.clientWidth + 1);
    const ffSeparated = q1.bottom < q0.top - 20;
    const dWireLanesSeparated = Math.abs(d1.top - d0.top) > 40;
    const clkQ1StopsAtPin = Math.abs(q1Tap.y - q1ClockPin.y) < 4;
    const clkQ0StopsAtPin = Math.abs(q0Tap.y - q0ClockPin.y) < 4;
    const noOrphanJump = document.querySelectorAll('[data-testid="d-wire-jump"]').length === 0;
    return noOverflow && ffSeparated && dWireLanesSeparated && clkQ1StopsAtPin && clkQ0StopsAtPin && noOrphanJump && collisionGuard?.getAttribute("data-collisions") === "0";
  });
  expect(dSchematicQuality).toBe(true);

  await page.getByTestId("mode-timing-trace").click();
  await page.getByLabel("X input").fill("0110");
  await page.getByLabel("Z output").fill("01");
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/length mismatch/i);

  await page.getByLabel("X input").fill("0951224");
  await expect(page.getByTestId("inspector-panel")).toContainText(/Debug Mode/i);
  await expect(page.getByTestId("debug-panel")).toBeVisible();
  await expect(page.getByTestId("debug-panel")).toContainText(/Inference Report/i);
  await expect(page.getByTestId("debug-panel")).toContainText(/Raw Topology View/i);
  await expect(page.getByTestId("circuit-layout-diagnostic")).toContainText("used layout mode: auto-layout");
  await expect(page.getByTestId("circuit-layout-diagnostic")).toContainText("respectRawCoordinates: false");
  await expect(page.getByTestId("circuit-layout-diagnostic")).toContainText("collision count: 0");
  await expect(page.getByTestId("circuit-layout-diagnostic")).toContainText("Show node bounding boxes");
  await expect(page.getByTestId("circuit-layout-diagnostic")).toContainText("Show pin anchors");
  await expect(page.getByTestId("circuit-layout-diagnostic")).toContainText("Show routing lanes");

  await page.getByTestId("mode-import-json").click();
  await page.getByLabel("import-json").fill(constantOutputFixture);
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/success|OK/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText("0");
  await page.getByTestId("tab-circuit-diagram").click();
  await expect(page.getByTestId("workbench")).toContainText(/CONSTANT|0/);

  const callsBeforeImport = generateCircuitCalls;
  await page.getByTestId("mode-import-json").click();
  await page.getByLabel("import-json").fill(solverResultFixture);
  await page.getByTestId("compile-button").click();
  await expect(page.getByTestId("inspector-panel")).toContainText(/Imported FSM_Result normalized|success|OK/i);
  await page.getByTestId("tab-ff-equations").click();
  await expect(page.getByTestId("workbench")).toContainText("Q0'");
  await expect(page.getByTestId("workbench")).toContainText("X·Q0'");
  await expect(page.getByTestId("workbench")).not.toContainText("XQ0'");
  await expect(page.getByTestId("workbench")).not.toContainText("Q_B#");
  await expect(page.getByTestId("debug-panel")).toContainText("Q_B#");
  expect(generateCircuitCalls).toBe(callsBeforeImport);
});
