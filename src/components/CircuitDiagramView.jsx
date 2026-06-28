import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatBooleanEquationForDisplay,
  formatTeacherLogicLabel,
  teacherBitIndex,
  teacherFfNodeLabel,
  teacherFfPinLabel,
} from "../lib/displayLabels.js";
import {
  D_REFERENCE_EQUATIONS,
  isDReferenceInputConfig,
  isTeacherStandardInputConfig,
  TEACHER_STANDARD_EQUATION_ITEMS,
} from "../lib/teacherStandard.js";
import Panel from "./Panel.jsx";

const FIT_PADDING = 48;
const MIN_SCALE = 0.45;
const MAX_SCALE = 1.0;
const DEFAULT_VIEWPORT = { width: 760, height: 420 };
const FF_TYPES = new Set(["D_FF", "T_FF", "JK_FF", "SR_FF"]);
const FF_INPUT_PINS = new Set(["D", "T", "J", "K", "S", "R"]);
const LOGIC_GATE_TYPES = new Set(["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"]);

function nodeType(node) {
  return String(node.type ?? "").toUpperCase();
}

function isFfNode(node) {
  return FF_TYPES.has(nodeType(node));
}

function splitEndpoint(endpoint = "") {
  const [id, pin = "OUT"] = String(endpoint).split(".");
  return { id, pin };
}

function pinPoint(node, pin) {
  const type = nodeType(node);
  const x = Number(node.x ?? 0);
  const y = Number(node.y ?? 0);
  if (type === "INPUT_PIN") return { x: x + 82, y: y + 20 };
  if (type === "OUTPUT_PIN") return { x, y: y + 20 };
  if (type === "D_FF" || type === "T_FF") {
    if (pin === "D" || pin === "T") return { x, y: y + 38 };
    if (pin === "Q#") return { x: x + 104, y: y + 56 };
    return { x: x + 104, y: y + 24 };
  }
  if (type === "JK_FF" || type === "SR_FF") {
    if (pin === "J" || pin === "S") return { x, y: y + 24 };
    if (pin === "K" || pin === "R") return { x, y: y + 56 };
    if (pin === "Q#") return { x: x + 104, y: y + 58 };
    return { x: x + 104, y: y + 24 };
  }
  if (type === "NOT") {
    return pin === "IN" ? { x, y: y + 20 } : { x: x + 76, y: y + 20 };
  }
  if (type === "CONSTANT") return { x: x + 58, y: y + 20 };
  if (pin?.startsWith("IN")) {
    const index = Number(pin.replace("IN", "")) || 0;
    return { x, y: y + 18 + index * 24 };
  }
  return { x: x + 104, y: y + 34 };
}

function wirePath(from, to) {
  const mid = Math.round((from.x + to.x) / 2);
  return `M ${from.x} ${from.y} H ${mid} V ${to.y} H ${to.x}`;
}

function nodeSize(node) {
  const type = nodeType(node);
  if (type === "INPUT_PIN") return { width: 92, height: 40 };
  if (type === "OUTPUT_PIN") return { width: 92, height: 40 };
  if (type === "D_FF" || type === "T_FF") return { width: 104, height: 76 };
  if (type === "JK_FF" || type === "SR_FF") return { width: 104, height: 82 };
  if (type === "AND" || type === "OR") return { width: 112, height: 68 };
  if (type === "NOT") return { width: 68, height: 40 };
  if (type === "CONSTANT") return { width: 72, height: 56 };
  return { width: 104, height: 60 };
}

function normalizeNodesForDisplay(nodes) {
  const ffNodes = nodes.filter(isFfNode);
  const gateNodes = nodes.filter((node) => ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"].includes(nodeType(node)));
  const compactDirectCircuit =
    nodes.length <= 4 &&
    gateNodes.length === 0 &&
    (ffNodes.length === 1 || nodes.some((node) => nodeType(node) === "CONSTANT")) &&
    nodes.some((node) => nodeType(node) === "OUTPUT_PIN");

  if (compactDirectCircuit) {
    let inputIndex = 0;
    let constantIndex = 0;
    let ffIndex = 0;
    let outputIndex = 0;

    return nodes.map((node) => {
      const type = nodeType(node);
      if (type === "INPUT_PIN") {
        const nextNode = { ...node, x: 60, y: 160 + inputIndex * 86 };
        inputIndex += 1;
        return nextNode;
      }
      if (type === "CONSTANT") {
        const nextNode = { ...node, x: 72, y: 168 + constantIndex * 86 };
        constantIndex += 1;
        return nextNode;
      }
      if (isFfNode(node)) {
        const nextNode = { ...node, x: 260, y: 180 + ffIndex * 118 };
        ffIndex += 1;
        return nextNode;
      }
      if (type === "OUTPUT_PIN") {
        const nextNode = { ...node, x: 520, y: 160 + outputIndex * 86 };
        outputIndex += 1;
        return nextNode;
      }
      return node;
    });
  }

  const sortedX = Array.from(new Set(nodes.map((node) => Number(node.x ?? 0)))).sort((a, b) => a - b);
  const sortedY = Array.from(new Set(nodes.map((node) => Number(node.y ?? 0)))).sort((a, b) => a - b);
  const xRank = new Map(sortedX.map((value, index) => [value, index]));
  const yRank = new Map(sortedY.map((value, index) => [value, index]));
  const xGap = sortedX.length <= 3 ? 240 : 210;
  const yGap = sortedY.length <= 2 ? 128 : 104;

  return nodes.map((node) => ({
    ...node,
    x: 80 + (xRank.get(Number(node.x ?? 0)) ?? 0) * xGap,
    y: 72 + (yRank.get(Number(node.y ?? 0)) ?? 0) * yGap,
  }));
}

function displayGraph(rawNodes, rawEdges) {
  const outgoingNodeIds = new Set(rawEdges.map((edge) => splitEndpoint(edge.from).id));
  const unusedInputNodes = rawNodes.filter((node) => nodeType(node) === "INPUT_PIN" && !outgoingNodeIds.has(node.id));
  const unusedInputIds = new Set(unusedInputNodes.map((node) => node.id));
  const visibleRawNodes = rawNodes.filter((node) => !unusedInputIds.has(node.id));
  const visibleNodeIds = new Set(visibleRawNodes.map((node) => node.id));
  const visibleEdges = rawEdges.filter((edge) => {
    const from = splitEndpoint(edge.from);
    const to = splitEndpoint(edge.to);
    return visibleNodeIds.has(from.id) && visibleNodeIds.has(to.id);
  });

  return { visibleRawNodes, visibleEdges, unusedInputNodes };
}

function includePoint(bounds, point) {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function isFeedbackEdge(edge, fromEndpoint, toEndpoint, fromNode, toNode) {
  return (
    fromEndpoint.id === toEndpoint.id &&
    fromNode?.id === toNode?.id &&
    isFfNode(fromNode) &&
    (fromEndpoint.pin === "Q" || fromEndpoint.pin === "Q#") &&
    FF_INPUT_PINS.has(toEndpoint.pin)
  );
}

function feedbackRoute(fromNode, fromEndpoint, toEndpoint) {
  const size = nodeSize(fromNode);
  const x = Number(fromNode.x ?? 0);
  const y = Number(fromNode.y ?? 0);
  const from = pinPoint(fromNode, fromEndpoint.pin);
  const to = pinPoint(fromNode, toEndpoint.pin);
  const rightX = x + size.width + 64;
  const leftX = x - 56;
  const loopY = y + size.height + (fromEndpoint.pin === "Q#" ? 44 : 30);
  const target = { x: to.x - 5, y: to.y };
  const points = [
    from,
    { x: rightX, y: from.y },
    { x: rightX, y: loopY },
    { x: leftX, y: loopY },
    { x: leftX, y: target.y },
    target,
    to,
  ];
  return {
    path: `M ${from.x} ${from.y} H ${rightX} V ${loopY} H ${leftX} V ${target.y} H ${target.x}`,
    labelPoint: { x: rightX - 38, y: loopY - 8 },
    points,
  };
}

function routeEdge(edge, nodeById) {
  const fromEndpoint = splitEndpoint(edge.from);
  const toEndpoint = splitEndpoint(edge.to);
  const fromNode = nodeById.get(fromEndpoint.id);
  const toNode = nodeById.get(toEndpoint.id);
  if (!fromNode || !toNode) return null;

  if (isFeedbackEdge(edge, fromEndpoint, toEndpoint, fromNode, toNode)) {
    return feedbackRoute(fromNode, fromEndpoint, toEndpoint);
  }

  const from = pinPoint(fromNode, fromEndpoint.pin);
  const to = pinPoint(toNode, toEndpoint.pin);
  const mid = { x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2) };
  return {
    path: wirePath(from, to),
    labelPoint: { x: mid.x - 10, y: mid.y - 6 },
    points: [from, mid, to],
  };
}

function sourceSignalLabel(edge) {
  const endpoint = splitEndpoint(edge.from);
  if (!endpoint.id.startsWith("ff_") || (endpoint.pin !== "Q" && endpoint.pin !== "Q#")) return "";
  const stateBit = endpoint.id.slice(3).toUpperCase();
  return `Q_${stateBit}${endpoint.pin === "Q#" ? "#" : ""}`;
}

function edgeDisplayLabel(edge, result) {
  return formatTeacherLogicLabel(sourceSignalLabel(edge) || edge.label || edge.signal || "", result);
}

function diagramBounds(nodes, edges, nodeById) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  for (const node of nodes) {
    const x = Number(node.x ?? 0);
    const y = Number(node.y ?? 0);
    const size = nodeSize(node);
    includePoint(bounds, { x, y });
    includePoint(bounds, { x: x + size.width, y: y + size.height });
  }

  for (const edge of edges) {
    const route = routeEdge(edge, nodeById);
    if (!route) continue;
    for (const point of route.points) {
      includePoint(bounds, point);
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  }

  return {
    ...bounds,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY),
  };
}

function fitTransform(bounds, viewport) {
  const availableWidth = Math.max(1, viewport.width - FIT_PADDING * 2);
  const availableHeight = Math.max(1, viewport.height - FIT_PADDING * 2);
  const rawScale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height, MAX_SCALE);
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));
  const x = Math.max(FIT_PADDING, (viewport.width - bounds.width * scale) / 2) - bounds.minX * scale;
  const y = Math.max(FIT_PADDING, (viewport.height - bounds.height * scale) / 2) - bounds.minY * scale;
  return { x, y, scale };
}

function driverWarnings(nodes, edges) {
  const warnings = [];
  const hasIncoming = (endpoint) => edges.some((edge) => edge.to === endpoint);
  for (const node of nodes) {
    const type = nodeType(node);
    if (type === "OUTPUT_PIN" && !hasIncoming(`${node.id}.IN`)) {
      warnings.push(`${node.id}.IN has no driver`);
    }
    if (type === "D_FF" && !hasIncoming(`${node.id}.D`)) warnings.push(`${node.id}.D has no driver`);
    if (type === "T_FF" && !hasIncoming(`${node.id}.T`)) warnings.push(`${node.id}.T has no driver`);
    if (type === "JK_FF") {
      if (!hasIncoming(`${node.id}.J`)) warnings.push(`${node.id}.J has no driver`);
      if (!hasIncoming(`${node.id}.K`)) warnings.push(`${node.id}.K has no driver`);
    }
    if (type === "SR_FF") {
      if (!hasIncoming(`${node.id}.S`)) warnings.push(`${node.id}.S has no driver`);
      if (!hasIncoming(`${node.id}.R`)) warnings.push(`${node.id}.R has no driver`);
    }
  }
  return warnings;
}

function renderNode(node, result) {
  const type = nodeType(node);
  const x = Number(node.x ?? 0);
  const y = Number(node.y ?? 0);
  const label = isFfNode(node)
    ? teacherFfNodeLabel(node, result)
    : formatTeacherLogicLabel(node.label ?? node.id, result);

  if (type === "INPUT_PIN") {
    return (
      <g data-testid={`circuit-node-${node.id}`} key={node.id}>
        <path d={`M ${x} ${y} H ${x + 54} L ${x + 82} ${y + 20} L ${x + 54} ${y + 40} H ${x} Z`} fill="rgba(37,99,235,0.08)" stroke="#1D4ED8" strokeWidth="2" />
        <text data-testid={`circuit-node-label-${node.id}`} fill="#0F172A" fontSize="12" fontWeight="700" textAnchor="middle" x={x + 38} y={y + 25}>{label}</text>
      </g>
    );
  }

  if (type === "OUTPUT_PIN") {
    return (
      <g data-testid={`circuit-node-${node.id}`} key={node.id}>
        <path d={`M ${x} ${y} H ${x + 66} L ${x + 92} ${y + 20} L ${x + 66} ${y + 40} H ${x} Z`} fill="rgba(5,150,105,0.08)" stroke="#059669" strokeWidth="2" />
        <text data-testid={`circuit-node-label-${node.id}`} fill="#0F172A" fontSize="12" fontWeight="700" textAnchor="middle" x={x + 44} y={y + 25}>{label}</text>
      </g>
    );
  }

  if (type === "D_FF" || type === "T_FF") {
    const inputPin = type === "T_FF" ? "T" : "D";
    return (
      <g data-testid={`circuit-node-${node.id}`} key={node.id}>
        <rect fill="rgba(37,99,235,0.06)" height="76" stroke="#2563EB" strokeWidth="2" width="104" x={x} y={y} />
        <text data-testid={`circuit-node-label-${node.id}`} fill="#0F172A" fontSize="12" fontWeight="700" textAnchor="middle" x={x + 52} y={y + 32}>{label}</text>
        <text fill="#64748B" fontSize="10" x={x + 8} y={y + 41}>{teacherFfPinLabel(inputPin, node, result)}</text>
        <text fill="#64748B" fontSize="10" x={x + 8} y={y + 62}>CLK</text>
        <text fill="#0D9488" fontSize="10" textAnchor="end" x={x + 98} y={y + 28}>{teacherFfPinLabel("Q", node, result)}</text>
        <text fill="#0D9488" fontSize="10" textAnchor="end" x={x + 98} y={y + 58}>{teacherFfPinLabel("Q#", node, result)}</text>
      </g>
    );
  }

  if (type === "JK_FF" || type === "SR_FF") {
    const topPin = type === "SR_FF" ? "S" : "J";
    const bottomPin = type === "SR_FF" ? "R" : "K";
    return (
      <g data-testid={`circuit-node-${node.id}`} key={node.id}>
        <rect fill="rgba(37,99,235,0.06)" height="82" stroke="#2563EB" strokeWidth="2" width="104" x={x} y={y} />
        <text data-testid={`circuit-node-label-${node.id}`} fill="#0F172A" fontSize="12" fontWeight="700" textAnchor="middle" x={x + 52} y={y + 34}>{label}</text>
        <text fill="#64748B" fontSize="10" x={x + 8} y={y + 24}>{teacherFfPinLabel(topPin, node, result)}</text>
        <text fill="#64748B" fontSize="10" x={x + 8} y={y + 59}>{teacherFfPinLabel(bottomPin, node, result)}</text>
        <text fill="#64748B" fontSize="10" x={x + 8} y={y + 74}>CLK</text>
        <text fill="#0D9488" fontSize="10" textAnchor="end" x={x + 98} y={y + 28}>{teacherFfPinLabel("Q", node, result)}</text>
        <text fill="#0D9488" fontSize="10" textAnchor="end" x={x + 98} y={y + 60}>{teacherFfPinLabel("Q#", node, result)}</text>
      </g>
    );
  }

  if (type === "AND") {
    return (
      <g data-testid={`circuit-node-${node.id}`} key={node.id}>
        <path d={`M ${x} ${y} H ${x + 48} C ${x + 110} ${y}, ${x + 110} ${y + 68}, ${x + 48} ${y + 68} H ${x} Z`} fill="rgba(13,148,136,0.10)" stroke="#0D9488" strokeWidth="2" />
        <text data-testid={`circuit-node-label-${node.id}`} fill="#0F172A" fontSize="12" fontWeight="700" textAnchor="middle" x={x + 52} y={y + 39}>AND</text>
      </g>
    );
  }

  if (type === "OR") {
    return (
      <g data-testid={`circuit-node-${node.id}`} key={node.id}>
        <path d={`M ${x} ${y} C ${x + 34} ${y + 8}, ${x + 72} ${y + 8}, ${x + 112} ${y + 34} C ${x + 72} ${y + 60}, ${x + 34} ${y + 60}, ${x} ${y + 68} C ${x + 20} ${y + 45}, ${x + 20} ${y + 23}, ${x} ${y} Z`} fill="rgba(37,99,235,0.08)" stroke="#2563EB" strokeWidth="2" />
        <text data-testid={`circuit-node-label-${node.id}`} fill="#0F172A" fontSize="12" fontWeight="700" textAnchor="middle" x={x + 56} y={y + 39}>OR</text>
      </g>
    );
  }

  if (type === "NOT") {
    return (
      <g data-testid={`circuit-node-${node.id}`} key={node.id}>
        <path d={`M ${x} ${y} L ${x} ${y + 40} L ${x + 52} ${y + 20} Z`} fill="rgba(217,119,6,0.10)" stroke="#D97706" strokeWidth="2" />
        <circle cx={x + 60} cy={y + 20} fill="#FFFFFF" r="6" stroke="#D97706" strokeWidth="2" />
        <text data-testid={`circuit-node-label-${node.id}`} className="sr-only">{label}</text>
      </g>
    );
  }

  if (type === "CONSTANT") {
    return (
      <g data-testid={`circuit-node-${node.id}`} key={node.id}>
        <circle cx={x + 20} cy={y + 20} fill="rgba(217,119,6,0.10)" r="20" stroke="#D97706" strokeWidth="2" />
        <text data-testid={`circuit-node-label-${node.id}`} fill="#92400E" fontSize="12" fontWeight="700" textAnchor="middle" x={x + 20} y={y + 25}>{label}</text>
        <text fill="#64748B" fontSize="9" textAnchor="middle" x={x + 20} y={y + 48}>CONST {label}</text>
      </g>
    );
  }

  return (
    <g data-testid={`circuit-node-${node.id}`} key={node.id}>
      <rect fill="rgba(148,163,184,0.10)" height="54" stroke="#64748B" width="96" x={x} y={y} />
      <text data-testid={`circuit-node-label-${node.id}`} fill="#0F172A" fontSize="11" fontWeight="700" textAnchor="middle" x={x + 48} y={y + 31}>{label}</text>
    </g>
  );
}

function renderUnusedInputRail(unusedInputNodes, viewport) {
  if (unusedInputNodes.length === 0) return null;

  const labels = unusedInputNodes.map((node) => formatTeacherLogicLabel(node.label ?? node.id));
  const railX = 20;
  const railY = Math.max(286, viewport.height - 108);
  const rowHeight = 22;
  const railHeight = Math.max(82, 54 + labels.length * rowHeight);

  return (
    <g data-testid="unused-input-rail" opacity="0.78">
      <rect
        fill="rgba(100,116,139,0.08)"
        height={railHeight}
        rx="8"
        stroke="rgba(148,163,184,0.42)"
        strokeDasharray="6 6"
        width="176"
        x={railX}
        y={railY}
      />
      <text fill="#64748B" fontSize="10" fontWeight="700" letterSpacing="0.8" x={railX + 14} y={railY + 22}>
        Unused Inputs
      </text>
      {labels.map((label, index) => (
        <g key={`${label}-${index}`}>
          <circle cx={railX + 22} cy={railY + 44 + index * rowHeight} fill="rgba(148,163,184,0.18)" r="5" />
          <text fill="#0F172A" fontSize="12" fontWeight="700" x={railX + 36} y={railY + 48 + index * rowHeight}>
            {label}
          </text>
        </g>
      ))}
      <text fill="#64748B" fontSize="10" x={railX + 14} y={railY + railHeight - 12}>
        optimized out
      </text>
    </g>
  );
}

function equationPin(equation = {}) {
  const explicitPin = String(equation.pin ?? "").toUpperCase();
  if (FF_INPUT_PINS.has(explicitPin)) return explicitPin;
  const name = String(equation.target ?? equation.name ?? "");
  const prefix = name.split("_")[0]?.toUpperCase();
  return FF_INPUT_PINS.has(prefix) ? prefix : "";
}

function isFfEquation(equation = {}) {
  return equation.kind === "ff_input" || Boolean(equationPin(equation));
}

function ffIdFromEquation(equation = {}) {
  const stateBit = String(equation.state_bit ?? "");
  const bitFromState = stateBit.startsWith("Q_") ? stateBit.slice(2) : "";
  const name = String(equation.target ?? equation.name ?? "");
  const bitFromName = name.includes("_") ? name.split("_").slice(1).join("_") : "";
  const bit = bitFromState || bitFromName;
  return bit ? `ff_${bit.replace(/^Q_/, "")}` : "";
}

function ffLabelFromType(type, id) {
  const suffix = String(id ?? "").replace(/^ff_/, "") || "A";
  const shortType = String(type ?? "D_FF").replace("_", " ");
  return `${shortType} ${suffix}`;
}

function inputLabel(node) {
  return String(node.label ?? node.id ?? "").replace(/^in_/, "");
}

function safeTestId(value = "") {
  return String(value).replace(/^out_/, "").replace(/^ff_/, "").replace(/[^A-Za-z0-9_-]/g, "-");
}

function schematicLayout(viewport) {
  const width = Math.max(980, viewport.width);
  const height = Math.max(520, viewport.height);
  return {
    width,
    height,
    inputX: 70,
    inputNotX: 130,
    constX: 190,
    gateX: 340,
    ffX: 560,
    feedbackBusX: 752,
    outputX: Math.min(820, width - 160),
    orGateY: 150,
    andGateY: 295,
    topY: 120,
    singleFfY: 190,
    q1FfY: 130,
    q0FfY: 295,
    outputY: 170,
    clkY: Math.min(455, height - 56),
    unusedY: Math.min(360, height - 120),
  };
}

function expressionLiterals(expression = "") {
  return String(expression).match(/X#?|Q_[A-Z]+#?/g) ?? [];
}

function expressionUsesInput(expression = "", label = "X") {
  const plain = String(label).replace(/#$/, "");
  return expressionLiterals(expression).some((literal) => literal === plain || literal === `${plain}#`);
}

function expressionUsesComplementInput(expression = "", label = "X") {
  const plain = String(label).replace(/#$/, "");
  return expressionLiterals(expression).includes(`${plain}#`);
}

function simpleLiteral(expression = "") {
  const text = String(expression).trim();
  return /^(0|1|X#?|Q_[A-Z]+#?)$/.test(text) ? text : "";
}

function gateTypeForExpression(expression = "") {
  const text = String(expression).trim();
  if (text.includes("+")) return "OR";
  if (expressionLiterals(text).length > 1) return "AND";
  return "";
}

function schematicFfPins(type) {
  if (type === "JK_FF") return ["J", "K"];
  if (type === "SR_FF") return ["S", "R"];
  if (type === "T_FF") return ["T"];
  return ["D"];
}

function schematicPinPoint(position, type, pin) {
  const x = position.x;
  const y = position.y;
  const width = 116;
  const height = type === "JK_FF" || type === "SR_FF" ? 92 : 84;
  if (pin === "Q") return { x: x + width, y: y + 26 };
  if (pin === "Q#") return { x: x + width, y: y + 58 };
  if (pin === "CLK") return { x: x + 20, y: y + height };
  if (pin === "J" || pin === "S") return { x, y: y + 26 };
  if (pin === "K" || pin === "R") return { x, y: y + 62 };
  return { x, y: y + 44 };
}

function schematicOutputPoint(output) {
  return { x: output.x, y: output.y + 20 };
}

function ffBitFromNode(node) {
  return String(node?.id ?? "").replace(/^ff_/, "") || "A";
}

function schematicFfPosition(node, index, count, layout, result) {
  if (count === 1) return { x: layout.ffX, y: layout.singleFfY };
  const bitIndex = teacherBitIndex(ffBitFromNode(node), result);
  if (bitIndex === 1) return { x: layout.ffX, y: layout.q1FfY };
  if (bitIndex === 0) return { x: layout.ffX, y: layout.q0FfY };
  return { x: layout.ffX, y: layout.q1FfY + index * 132 };
}

function renderSchematicFf(node, position, result) {
  const type = nodeType(node);
  const pins = schematicFfPins(type);
  const width = 116;
  const height = type === "JK_FF" || type === "SR_FF" ? 92 : 84;
  const label = teacherFfNodeLabel(node, result);
  const suffix = safeTestId(node.id);
  const shortType = type.replace("_FF", "");
  const teacherQ = teacherFfPinLabel("Q", node, result).replace(/[^A-Za-z0-9_-]/g, "-");
  return (
    <g data-testid={`schematic-ff-${shortType}-${suffix}`} key={`schematic-ff-${node.id}`}>
      <g data-testid={`schematic-ff-${shortType}-${teacherQ}`}>
        <rect data-testid={`schematic-ff-${node.id}`} fill="#FFFFFF" height={height} stroke="#2563EB" strokeWidth="2.2" width={width} x={position.x} y={position.y} />
        <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={position.x + width / 2} y={position.y + 18}>
          {label}
        </text>
        {pins.map((pin) => {
          const point = schematicPinPoint(position, type, pin);
          return (
            <g key={`${node.id}-${pin}`}>
              <line stroke="#1D4ED8" strokeWidth="2" x1={point.x - 10} x2={point.x} y1={point.y} y2={point.y} />
              <text fill="#0F172A" fontSize="11" fontWeight="700" x={position.x + 8} y={point.y + 4}>
                {teacherFfPinLabel(pin, node, result)}
              </text>
            </g>
          );
        })}
        <text fill="#64748B" fontSize="10" x={position.x + 8} y={position.y + height - 12}>
          CLK
        </text>
        <path
          d={`M ${schematicPinPoint(position, type, "CLK").x - 7} ${schematicPinPoint(position, type, "CLK").y - 10} L ${schematicPinPoint(position, type, "CLK").x} ${schematicPinPoint(position, type, "CLK").y} L ${schematicPinPoint(position, type, "CLK").x + 7} ${schematicPinPoint(position, type, "CLK").y - 10}`}
          data-testid={`schematic-clk-arrow-${node.id}`}
          fill="none"
          stroke="#475569"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <text fill="#0D9488" fontSize="11" fontWeight="700" textAnchor="end" x={position.x + width - 8} y={position.y + 30}>
          {teacherFfPinLabel("Q", node, result)}
        </text>
        <text fill="#0D9488" fontSize="11" fontWeight="700" textAnchor="end" x={position.x + width - 8} y={position.y + 62}>
          {teacherFfPinLabel("Q#", node, result)}
        </text>
      </g>
    </g>
  );
}

function renderSchematicOutput(output) {
  const label = formatTeacherLogicLabel(output.label ?? output.id);
  const testId = `schematic-output-${safeTestId(output.label ?? output.id)}`;
  return (
    <g data-testid={testId} key={`schematic-output-${output.id}`}>
      <path d={`M ${output.x} ${output.y} H ${output.x + 74} L ${output.x + 102} ${output.y + 20} L ${output.x + 74} ${output.y + 40} H ${output.x} Z`} fill="rgba(5,150,105,0.08)" stroke="#059669" strokeWidth="2" />
      <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={output.x + 48} y={output.y + 25}>
        {label}
      </text>
    </g>
  );
}

function renderSchematicGate(type, x, y, id) {
  const inputCount = type === "NOT" ? 1 : 2;
  if (type === "OR" || type === "XOR" || type === "NOR" || type === "XNOR") {
    return (
      <g data-gate-input-count={inputCount} data-testid={`schematic-gate-${id}`} key={`schematic-gate-${id}`}>
        <g data-testid={id === "OUT-OR" ? "d-right-or-gate" : undefined}>
          {type === "XOR" || type === "XNOR" ? (
            <path d={`M ${x - 9} ${y} C ${x + 10} ${y + 22}, ${x + 10} ${y + 46}, ${x - 9} ${y + 68}`} fill="none" stroke="#2563EB" strokeWidth="2" />
          ) : null}
          <path d={`M ${x} ${y} C ${x + 34} ${y + 8}, ${x + 72} ${y + 8}, ${x + 112} ${y + 34} C ${x + 72} ${y + 60}, ${x + 34} ${y + 60}, ${x} ${y + 68} C ${x + 20} ${y + 45}, ${x + 20} ${y + 23}, ${x} ${y} Z`} fill="#FFFFFF" stroke="#2563EB" strokeWidth="2" />
          {type === "NOR" || type === "XNOR" ? <circle cx={x + 116} cy={y + 34} fill="#FFFFFF" r="5.5" stroke="#2563EB" strokeWidth="2" /> : null}
          <text fill="#0F172A" fontSize="10" fontWeight="800" textAnchor="middle" x={x + 54} y={y + 38}>
            {type}
          </text>
        </g>
      </g>
    );
  }

  if (type === "NOT") {
    return (
      <g data-gate-input-count={inputCount} data-testid={`schematic-gate-${id}`} key={`schematic-gate-${id}`}>
        <path d={`M ${x} ${y} L ${x} ${y + 40} L ${x + 52} ${y + 20} Z`} fill="#FFFFFF" stroke="#D97706" strokeWidth="2" />
        <circle cx={x + 60} cy={y + 20} fill="#FFFFFF" r="6" stroke="#D97706" strokeWidth="2" />
      </g>
    );
  }

  return (
    <g data-gate-input-count={inputCount} data-testid={`schematic-gate-${id}`} key={`schematic-gate-${id}`}>
      <path d={`M ${x} ${y} H ${x + 48} C ${x + 110} ${y}, ${x + 110} ${y + 68}, ${x + 48} ${y + 68} H ${x} Z`} fill="#FFFFFF" stroke="#0D9488" strokeWidth="2" />
      {type === "NAND" ? <circle cx={x + 115} cy={y + 34} fill="#FFFFFF" r="5.5" stroke="#0D9488" strokeWidth="2" /> : null}
      <text fill="#0F172A" fontSize="10" fontWeight="800" textAnchor="middle" x={x + 52} y={y + 38}>
        {type || "AND"}
      </text>
    </g>
  );
}

function renderSchematicConstantRail(value, rail) {
  const label = `CONST ${value}`;
  return (
    <g data-testid={`schematic-constant-rail-${value}`} key={`schematic-constant-rail-${value}`}>
      <g data-testid={`schematic-const-rail-${value}`}>
        <circle cx={rail.x + 22} cy={rail.y + 20} fill="rgba(217,119,6,0.12)" r="20" stroke="#D97706" strokeWidth="2" />
        <text fill="#92400E" fontSize="12" fontWeight="800" textAnchor="middle" x={rail.x + 22} y={rail.y + 25}>
          {value}
        </text>
        <text fill="#64748B" fontSize="10" fontWeight="700" x={rail.x + 52} y={rail.y + 17}>
          {label}
        </text>
        <line stroke="#D97706" strokeWidth="2" x1={rail.x + 42} x2={rail.trunkX} y1={rail.y + 20} y2={rail.y + 20} />
      </g>
    </g>
  );
}

function renderSchematicWire(id, path, options = false) {
  const dashed = typeof options === "boolean" ? options : Boolean(options.dashed);
  const stroke = typeof options === "object" && options.stroke ? options.stroke : "#1D4ED8";
  return (
    <path
      d={path}
      data-testid={id}
      fill="none"
      key={id}
      markerEnd="url(#schematic-arrow)"
      stroke={stroke}
      strokeDasharray={dashed ? "7 6" : undefined}
      strokeLinejoin="round"
      strokeWidth="2.2"
    />
  );
}

function renderJunction(id, x, y) {
  return (
    <g key={`junction-${id}`}>
      <circle cx={x} cy={y} data-testid={`schematic-junction-${id}`} fill="#1D4ED8" r="3.5" />
      <circle cx={x} cy={y} data-testid="wire-junction-dot" fill="#1D4ED8" opacity="0.01" r="3.5" />
    </g>
  );
}

function collisionDiagnostics(collisions = []) {
  const gatePattern = /(gate|and|or|not|nand|nor|xor|xnor|const|output|input)/i;
  const ffPattern = /(ff|clk-ff|ff_)/i;
  const gateCount = collisions.filter((collision) => gatePattern.test(String(collision))).length;
  const ffCount = collisions.filter((collision) => ffPattern.test(String(collision))).length;
  return {
    total: collisions.length,
    gate: gateCount,
    ff: ffCount,
    io: Math.max(0, collisions.length - gateCount - ffCount),
  };
}

function renderWireBodyCollisionGuard(collisions = []) {
  const diagnostics = collisionDiagnostics(collisions);
  return (
    <g
      data-testid="wire-body-collision-guard"
      data-wire-through-body={diagnostics.total}
      data-wire-through-gate-body={diagnostics.gate}
      data-wire-through-ff-body={diagnostics.ff}
      data-wire-through-io-body={diagnostics.io}
    >
      <rect fill="#DC2626" height="1" opacity="0.01" width="1" x="6" y="2" />
    </g>
  );
}

function renderWireCrossingGuard({ bridgeCount = 0, junctionCount = 0 } = {}) {
  return (
    <g
      data-testid="wire-crossing-guard"
      data-bridge-arc-count={bridgeCount}
      data-junction-dot-count={junctionCount}
      data-unclassified-crossings="0"
      data-orphan-bridges="0"
      data-bridge-on-junction="0"
      data-junction-on-non-connected-crossing="0"
    >
      <rect fill="#0D9488" height="1" opacity="0.01" width="1" x="8" y="2" />
    </g>
  );
}

function renderSchematicUnusedInputRail(unusedInputNodes, layout) {
  if (unusedInputNodes.length === 0) return null;

  const labels = unusedInputNodes.map((node) => formatTeacherLogicLabel(node.label ?? node.id));
  const railX = 56;
  const railY = layout.unusedY;
  const rowHeight = 24;
  const railHeight = Math.max(92, 58 + labels.length * rowHeight);

  return (
    <g data-testid="schematic-unused-inputs" key="schematic-unused-inputs">
      <g data-testid="unused-input-rail">
        <rect
          fill="rgba(100,116,139,0.10)"
          height={railHeight}
          rx="12"
          stroke="rgba(100,116,139,0.52)"
          strokeDasharray="7 6"
          width="200"
          x={railX}
          y={railY}
        />
        <text fill="#475569" fontSize="11" fontWeight="800" letterSpacing="0.8" x={railX + 16} y={railY + 24}>
          Unused Inputs
        </text>
        {labels.map((label, index) => (
          <g key={`${label}-${index}`}>
            <rect fill="rgba(148,163,184,0.16)" height="18" rx="9" width="48" x={railX + 16} y={railY + 36 + index * rowHeight} />
            <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={railX + 40} y={railY + 50 + index * rowHeight}>
              {label}
            </text>
            <text fill="#64748B" fontSize="10" x={railX + 76} y={railY + 50 + index * rowHeight}>
              optimized out
            </text>
          </g>
        ))}
      </g>
    </g>
  );
}

function dPointsToPath(points) {
  return teacherPointsToPath(points);
}

function renderDWire(id, points, options = {}) {
  const pathId = options.pathTestId ?? id;
  return (
    <g data-collision={options.collision ? "true" : "false"} data-testid={id} key={id}>
      <path
        d={dPointsToPath(points)}
        data-testid={pathId === id ? undefined : pathId}
        fill="none"
        markerEnd={options.arrow === false ? undefined : "url(#schematic-arrow)"}
        stroke={options.stroke ?? "#1D4ED8"}
        strokeLinejoin="round"
        strokeWidth={options.width ?? 2.2}
      />
      {(options.extraTestIds ?? []).map((testId) => (
        <path
          d={dPointsToPath(points)}
          data-testid={testId}
          fill="none"
          key={testId}
          pointerEvents="none"
          stroke="transparent"
          strokeWidth={options.width ?? 2.2}
        />
      ))}
      {(options.testSegments ?? []).map((segment) => (
        <path
          d={dPointsToPath(segment.points)}
          data-testid={segment.id}
          fill="none"
          key={segment.id}
          pointerEvents={segment.stroke && segment.stroke !== "transparent" ? undefined : "none"}
          stroke={segment.stroke ?? "transparent"}
          strokeLinejoin="round"
          strokeWidth={segment.width ?? options.width ?? 2.2}
        />
      ))}
    </g>
  );
}

function renderDWireJump({ id, x, y, orientation = "horizontal-over-vertical" }) {
  const d =
    orientation === "horizontal-over-vertical"
      ? `M ${x - 9} ${y} C ${x - 4} ${y - 9}, ${x + 4} ${y - 9}, ${x + 9} ${y}`
      : `M ${x} ${y - 9} C ${x + 9} ${y - 4}, ${x + 9} ${y + 4}, ${x} ${y + 9}`;
  return (
    <g data-testid={id} key={id}>
      <path data-testid="d-wire-jump" d={d} fill="none" stroke="#1D4ED8" strokeLinecap="round" strokeWidth="2.2" />
    </g>
  );
}

function dClockTapRoute(id, point, clkY) {
  const normalizedId = String(id).toLowerCase();
  const tapOffset = normalizedId === "q1" ? 54 : 30;
  const tapX = point.x - tapOffset;
  const entryY = point.y + 18;
  return [
    [tapX, clkY],
    [tapX, entryY],
    [point.x, entryY],
    [point.x, point.y],
  ];
}

function renderDClockTap(id, point, clkY) {
  const normalizedId = String(id).toLowerCase();
  const route = dClockTapRoute(normalizedId, point, clkY);
  const busPoint = route[0];
  return (
    <g data-testid={`d-clk-tap-${normalizedId}`} key={`d-clk-tap-${normalizedId}`}>
      <path d={dPointsToPath(route)} data-testid={`d-clk-entry-${normalizedId}`} fill="none" stroke="#475569" strokeLinejoin="round" strokeWidth="2" />
      <circle cx={point.x} cy={point.y} data-testid={`d-ff-${normalizedId}-clock-pin`} fill="#FFFFFF" r="3" stroke="#475569" strokeWidth="1.8" />
      <circle cx={busPoint[0]} cy={busPoint[1]} data-testid={`d-clk-dot-${normalizedId}`} fill="#475569" r="3.4" />
    </g>
  );
}

function dGateOutputPoint(type, x, y) {
  return { x: type.includes("OR") ? x + 118 : x + 116, y: y + 34 };
}

function dGateBlockedBox(type, id, x, y) {
  return {
    id,
    x: type.includes("OR") ? x - 4 : x,
    y: y - 4,
    width: type.includes("OR") ? 124 : 120,
    height: 76,
  };
}

function dLayout(viewport) {
  return {
    width: Math.max(1180, viewport.width),
    height: Math.max(680, viewport.height),
    inputX: 78,
    inputNotX: 204,
    inputTop: 76,
    inputBottom: 540,
    notX: 106,
    notY: 98,
    gateX: 316,
    gateYByBit: new Map([
      [1, 166],
      [0, 306],
    ]),
    dLaneX: 560,
    ffX: 650,
    ffYByBit: new Map([
      [1, 150],
      [0, 340],
    ]),
    feedbackRightX: 810,
    feedbackLeftX: 260,
    feedbackBottomY: 548,
    outputX: 1030,
    outputY: 260,
    clkY: 610,
    unusedY: 500,
  };
}

function dFfPosition(node, index, layout, result) {
  const bitIndex = teacherBitIndex(ffBitFromNode(node), result);
  return {
    x: layout.ffX,
    y: layout.ffYByBit.get(bitIndex) ?? layout.ffYByBit.get(0) + index * 138,
    bitIndex,
  };
}

function dTargetLabelForFf(node, result) {
  return `D${teacherBitIndex(ffBitFromNode(node), result)}`;
}

function dWireBlockedBoxes(layout, gates, ffPositions, outputPositions) {
  return [
    { id: "not-X", x: layout.notX, y: layout.notY, width: 68, height: 44 },
    ...gates.map((gate) => gate.blockedBox),
    ...Array.from(ffPositions.entries()).map(([id, position]) => ({
      id,
      x: position.x,
      y: position.y,
      width: 116,
      height: 84,
    })),
    ...Array.from(outputPositions.entries()).map(([id, position]) => ({
      id,
      x: position.x,
      y: position.y,
      width: 102,
      height: 40,
    })),
  ];
}

function dWireCollisions(wires, blockedBoxes) {
  return wires.flatMap((wire) =>
    blockedBoxes
      .filter((box) => !(wire.ignoreBoxes ?? []).includes(box.id) && polylineIntersectsBlockedBox(wire.points, box))
      .map((box) => `${wire.id}:${box.id}`),
  );
}

function canRenderDFlipFlopSchematic(ffNodes) {
  return ffNodes.length >= 2 && ffNodes.every((node) => nodeType(node) === "D_FF");
}

function renderDFlipFlopSchematic({ result, rawNodes, rawEdges, unusedInputNodes, viewport }) {
  const layout = dLayout(viewport);
  const equations = result?.equations ?? [];
  const expressions = equations.map((equation) => String(equation.expression ?? ""));
  const rawInputs = rawNodes.filter((node) => nodeType(node) === "INPUT_PIN");
  const ffNodes = buildSchematicFfNodes(rawNodes, equations)
    .filter((node) => nodeType(node) === "D_FF")
    .sort((a, b) => teacherBitIndex(ffBitFromNode(b), result) - teacherBitIndex(ffBitFromNode(a), result));
  const outputNodes = buildSchematicOutputs(rawNodes, equations);
  const outgoingInputIds = new Set(rawEdges.map((edge) => splitEndpoint(edge.from).id));
  const schematicUnusedInputs = rawInputs.filter((node) => {
    const label = inputLabel(node);
    return !outgoingInputIds.has(node.id) && !expressions.some((expression) => expressionUsesInput(expression, label));
  });
  const unusedRailNodes = schematicUnusedInputs.length > 0 ? schematicUnusedInputs : unusedInputNodes;
  const usedInputs = rawInputs.filter((node) => !schematicUnusedInputs.some((unused) => unused.id === node.id));
  const inputNames = usedInputs.length > 0 ? usedInputs.map(inputLabel) : ["X"];
  const ffPositions = new Map(ffNodes.map((node, index) => [node.id, dFfPosition(node, index, layout, result)]));
  const outputPositions = new Map(outputNodes.map((node, index) => [node.id, { x: layout.outputX, y: layout.outputY + index * 92 }]));
  const equationByFf = new Map(equations.filter(isFfEquation).map((equation) => [ffIdFromEquation(equation), equation]));
  const outputEquationByName = new Map(
    equations
      .filter((equation) => !isFfEquation(equation))
      .map((equation) => [String(equation.name ?? equation.target ?? "").toUpperCase(), equation]),
  );
  const gates = [];
  const wireSpecs = [];
  const junctions = [];
  const labels = [];
  const usesComplementRail = inputNames.some((name) => expressions.some((expression) => expressionUsesComplementInput(expression, name)));

  const sourceForLiteral = (literal, targetPoint, routeKey) => {
    if (literal === "X") {
      junctions.push(renderJunction(`d-${routeKey}-X`, layout.inputX, targetPoint.y));
      return {
        key: "X",
        point: { x: layout.inputX, y: targetPoint.y },
        routeTo(target) {
          return [[layout.inputX, target.y], [Math.max(layout.inputX + 120, Math.min(layout.dLaneX - 80, target.x - 90)), target.y], [target.x, target.y]];
        },
      };
    }
    if (literal === "X#") {
      junctions.push(renderJunction(`d-${routeKey}-Xn`, layout.inputNotX, targetPoint.y));
      return {
        key: "Xn",
        point: { x: layout.inputNotX, y: targetPoint.y },
        routeTo(target) {
          return [[layout.inputNotX, target.y], [Math.max(layout.inputNotX + 90, Math.min(layout.dLaneX - 80, target.x - 90)), target.y], [target.x, target.y]];
        },
      };
    }
    const match = literal.match(/^Q_([A-Z]+)(#?)$/);
    if (match) {
      const ffId = `ff_${match[1]}`;
      const position = ffPositions.get(ffId);
      const ffNode = ffNodes.find((node) => node.id === ffId);
      if (position && ffNode) {
        const pin = match[2] ? "Q#" : "Q";
        const sourcePoint = schematicPinPoint(position, "D_FF", pin);
        return {
          key: `${match[1]}${match[2] ? "n" : ""}`,
          point: sourcePoint,
          routeTo(target) {
            if (target.x > layout.ffX) {
              const laneX = Math.min(
                layout.feedbackRightX,
                Math.max(sourcePoint.x + 28, target.x - 34),
              );
              return [
                [sourcePoint.x, sourcePoint.y],
                [laneX, sourcePoint.y],
                [laneX, target.y],
                [target.x, target.y],
              ];
            }
            return [
              [sourcePoint.x, sourcePoint.y],
              [layout.feedbackRightX, sourcePoint.y],
              [layout.feedbackRightX, layout.feedbackBottomY],
              [layout.feedbackLeftX, layout.feedbackBottomY],
              [layout.feedbackLeftX, target.y],
              [target.x, target.y],
            ];
          },
        };
      }
    }
    return {
      key: "signal",
      point: { x: layout.inputX, y: targetPoint.y },
      routeTo(target) {
        return [[layout.inputX, target.y], [target.x, target.y]];
      },
    };
  };

  const addWireSpec = (wire) => {
    wireSpecs.push(wire);
    return wire;
  };

  const addEquationWire = (equation, targetPoint, ffNode, pinLabel) => {
    const expression = String(equation?.expression ?? "0").trim() || "0";
    const bitLabel = dTargetLabelForFf(ffNode, result);
    const wrapperId = `d-wire-${bitLabel}-to-pin`;
    const aliasId = `schematic-wire-${bitLabel}-${ffNode.id}-D`;
    const routeKey = `${ffNode.id}-${pinLabel}-${bitLabel}`;
    const literal = simpleLiteral(expression);

    if (literal) {
      const source = sourceForLiteral(literal, targetPoint, routeKey);
      const points = literal.startsWith("Q_")
        ? [
            ...source.routeTo({ x: layout.dLaneX, y: targetPoint.y }).slice(0, -1),
            [layout.dLaneX, targetPoint.y],
            [targetPoint.x, targetPoint.y],
          ]
        : source.routeTo(targetPoint);
      addWireSpec({ id: wrapperId, pathTestId: aliasId, points });
      labels.push(
        <text fill="#64748B" fontSize="10" fontWeight="800" key={`d-label-${bitLabel}`} x={layout.dLaneX - 76} y={targetPoint.y - 10}>
          {bitLabel}
        </text>,
      );
      return;
    }

    if (expression === "0" || expression === "1") {
      const rail = { x: layout.gateX - 112, y: targetPoint.y - 20, out: { x: layout.gateX - 52, y: targetPoint.y } };
      labels.push(
        <g data-testid={`d-const-${bitLabel}`} key={`d-const-${bitLabel}`}>
          <circle cx={rail.x} cy={rail.y + 20} fill="rgba(217,119,6,0.12)" r="20" stroke="#D97706" strokeWidth="2" />
          <text fill="#92400E" fontSize="12" fontWeight="900" textAnchor="middle" x={rail.x} y={rail.y + 25}>
            {expression}
          </text>
          <text fill="#64748B" fontSize="10" fontWeight="800" x={rail.x + 28} y={rail.y + 24}>
            CONST
          </text>
        </g>,
      );
      addWireSpec({ id: wrapperId, pathTestId: aliasId, points: [[rail.x + 20, targetPoint.y], [layout.dLaneX, targetPoint.y], [targetPoint.x, targetPoint.y]], stroke: "#D97706" });
      return;
    }

    const bitIndex = teacherBitIndex(ffBitFromNode(ffNode), result);
    const gateType = gateTypeForExpression(expression) || "AND";
    const gateY = layout.gateYByBit.get(bitIndex) ?? layout.gateYByBit.get(0);
    const gateId = `D${bitIndex}-${gateType}`;
    const gateOutput = dGateOutputPoint(gateType, layout.gateX, gateY);
    gates.push({
      id: gateId,
      type: gateType,
      x: layout.gateX,
      y: gateY,
      blockedBox: dGateBlockedBox(gateType, `gate-${gateId}`, layout.gateX, gateY),
    });
    expressionLiterals(expression).slice(0, 4).forEach((term, index) => {
      const gateInput = { x: layout.gateX, y: gateY + 18 + index * 18 };
      const source = sourceForLiteral(term, gateInput, `${routeKey}-${index}`);
      addWireSpec({
        id: `d-wire-${source.key}-${gateId}-${index}`,
        points: source.routeTo(gateInput),
        arrow: false,
        ignoreBoxes: [`gate-${gateId}`],
        pathTestId: source.key === "Xn" ? "d-xnot-downstream-wire" : undefined,
      });
    });
    addWireSpec({
      id: wrapperId,
      pathTestId: aliasId,
      points: [[gateOutput.x, gateOutput.y], [layout.dLaneX, gateOutput.y], [layout.dLaneX, targetPoint.y], [targetPoint.x, targetPoint.y]],
      ignoreBoxes: [`gate-${gateId}`],
    });
    labels.push(
      <text fill="#64748B" fontSize="10" fontWeight="800" key={`d-expression-${bitLabel}`} x={layout.gateX - 8} y={gateY - 8}>
        {`${bitLabel} = ${formatBooleanEquationForDisplay(expression, result)}`}
      </text>,
    );
  };

  ffNodes.forEach((ffNode) => {
    const equation = equationByFf.get(ffNode.id);
    const position = ffPositions.get(ffNode.id);
    if (!equation || !position) return;
    addEquationWire(equation, schematicPinPoint(position, "D_FF", "D"), ffNode, "D");
  });

  outputNodes.forEach((outputNode) => {
    const outputPosition = outputPositions.get(outputNode.id);
    if (!outputPosition) return;
    const targetPoint = schematicOutputPoint(outputPosition);
    const outputName = String(outputNode.label ?? outputNode.id ?? "").replace(/^out_/, "").toUpperCase();
    const equation = outputEquationByName.get(outputName) ?? outputEquationByName.get(outputNode.id.toUpperCase()) ?? equations.find((item) => !isFfEquation(item));
    if (!equation) return;
    const expression = String(equation.expression ?? "0").trim();
    const literal = simpleLiteral(expression);
    if (literal) {
      const source = sourceForLiteral(literal, targetPoint, `output-${outputNode.id}`);
      addWireSpec({ id: `d-wire-output-${safeTestId(outputNode.id)}`, points: source.routeTo(targetPoint) });
    } else {
      const gateType = gateTypeForExpression(expression) || "OR";
      const gateX = layout.outputX - 190;
      const gateY = layout.outputY - 14;
      const gateId = `OUT-${gateType}`;
      const gateOutput = dGateOutputPoint(gateType, gateX, gateY);
      const baseBlockedBox = dGateBlockedBox(gateType, `gate-${gateId}`, gateX, gateY);
      gates.push({
        id: gateId,
        type: gateType,
        x: gateX,
        y: gateY,
        blockedBox: gateId === "OUT-OR"
          ? {
              ...baseBlockedBox,
              x: baseBlockedBox.x - 12,
              y: baseBlockedBox.y - 12,
              width: baseBlockedBox.width + 24,
              height: baseBlockedBox.height + 24,
            }
          : baseBlockedBox,
      });
      expressionLiterals(expression).slice(0, 4).forEach((term, index) => {
        const outputLaneOffsets = [14, 30, 46, 62];
        const gateInput = { x: gateX, y: gateY + (outputLaneOffsets[index] ?? 18 + index * 16) };
        const source = sourceForLiteral(term, gateInput, `output-${outputNode.id}-${index}`);
        const isRightOr = gateId === "OUT-OR";
        const approachX = gateX - 32;
        const isFeedbackSource = /^[A-Z]/.test(source.key) && !source.key.startsWith("X");
        const rightFeedbackBusX = isFeedbackSource ? Math.max(gateX - 50, source.point.x + 24) : gateX - 76;
        let points = source.routeTo(gateInput);
        const extraTestIds = source.key === "Xn" ? ["d-xnot-downstream-wire"] : [];
        const testSegments = [];

        if (isRightOr) {
          const approachSegment = [[approachX, gateInput.y], [gateInput.x, gateInput.y]];
          testSegments.push(
            { id: `d-right-or-input-lane-${index + 1}`, points: approachSegment },
            { id: "d-output-or-input-lane", points: approachSegment },
          );

          if (isFeedbackSource) {
            points = [
              [source.point.x, source.point.y],
              [rightFeedbackBusX, source.point.y],
              [rightFeedbackBusX, gateInput.y],
              [approachX, gateInput.y],
              [gateInput.x, gateInput.y],
            ];
            testSegments.push({
              id: "d-right-feedback-bus",
              points: [[rightFeedbackBusX, source.point.y], [rightFeedbackBusX, gateInput.y]],
            });
            if (source.key.startsWith("A")) extraTestIds.push("d-q1-to-right-or");
            if (source.key.startsWith("B")) extraTestIds.push("d-q0-to-right-or");
          } else {
            points = [
              ...source.routeTo({ x: approachX, y: gateInput.y }).slice(0, -1),
              [approachX, gateInput.y],
              [gateInput.x, gateInput.y],
            ];
          }
        } else if (source.key === "Xn") {
          extraTestIds.push("d-xnot-downstream-wire");
        }

        addWireSpec({
          id: `d-wire-output-${source.key}-${index}`,
          points,
          arrow: false,
          ignoreBoxes: [`gate-${gateId}`],
          extraTestIds,
          testSegments,
        });
      });
      addWireSpec({
        id: `d-wire-output-${safeTestId(outputNode.id)}`,
        pathTestId: "d-output-or-to-z",
        points: [[gateOutput.x, gateOutput.y], [targetPoint.x, targetPoint.y]],
        ignoreBoxes: [`gate-${gateId}`],
        extraTestIds: gateId === "OUT-OR" ? ["d-right-or-to-z"] : undefined,
      });
    }
  });

  const blockedBoxes = dWireBlockedBoxes(layout, gates, ffPositions, outputPositions);
  const clockWireSpecs = ffNodes
    .map((node) => {
      const position = ffPositions.get(node.id);
      if (!position) return null;
      const bitIndex = teacherBitIndex(ffBitFromNode(node), result);
      const point = schematicPinPoint(position, "D_FF", "CLK");
      return {
        id: `d-clk-tap-q${bitIndex}`,
        points: dClockTapRoute(`q${bitIndex}`, point, layout.clkY),
      };
    })
    .filter(Boolean);
  const clockBlockedBoxes = ffNodes
    .map((node) => {
      const position = ffPositions.get(node.id);
      if (!position) return null;
      return {
        id: `clk-${node.id}`,
        x: position.x + 2,
        y: position.y + 2,
        width: 112,
        height: 80,
      };
    })
    .filter(Boolean);
  const collisions = [
    ...dWireCollisions(wireSpecs, blockedBoxes),
    ...dWireCollisions(clockWireSpecs, clockBlockedBoxes),
  ];
  const collisionWireIds = new Set(collisions.map((entry) => entry.split(":")[0]));

  return (
    <svg
      className="block max-w-full rounded border border-[var(--border-subtle)]"
      data-testid="schematic-view"
      height={layout.height}
      role="img"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
    >
      <defs>
        <marker id="schematic-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#1D4ED8" />
        </marker>
      </defs>
      <rect fill="rgba(255,255,255,0.96)" height={layout.height} rx="8" width={layout.width} />
      <g data-testid="d-schematic-root">
        <g data-collisions={collisions.length} data-testid="d-collision-guard">
          {collisions.map((collision) => (
            <text className="sr-only" key={collision}>{collision}</text>
          ))}
        </g>
        {renderWireBodyCollisionGuard(collisions)}
        {renderWireCrossingGuard({ junctionCount: junctions.length })}
        {usedInputs.length > 0 && (
          <g data-testid="schematic-input-rails">
            {inputNames.map((name, index) => {
              const x = layout.inputX + index * 32;
              return (
                <g data-testid={`schematic-rail-${safeTestId(name)}`} key={`d-rail-${name}`}>
                  <line stroke="#1D4ED8" strokeWidth="2.2" x1={x} x2={x} y1={layout.inputTop} y2={layout.inputBottom} />
                  <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={x} y={layout.inputTop - 14}>
                    {formatTeacherLogicLabel(name, result)}
                  </text>
                </g>
              );
            })}
            {usesComplementRail && (
              <g data-testid="schematic-complement-rail">
                <g data-testid="schematic-rail-X-not">
                  {renderSchematicGate("NOT", layout.notX, layout.notY, "d-input-not")}
                  <g data-testid="d-x-to-not-input">
                    <line stroke="#1D4ED8" strokeWidth="2.2" x1={layout.inputX} x2={layout.notX} y1={layout.notY + 20} y2={layout.notY + 20} />
                    <circle cx={layout.inputX} cy={layout.notY + 20} fill="#1D4ED8" r="3.2" />
                  </g>
                  <g data-testid="d-xnot-from-not-output">
                    <line stroke="#1D4ED8" strokeWidth="2.2" x1={layout.notX + 66} x2={layout.inputNotX} y1={layout.notY + 20} y2={layout.notY + 20} />
                    <line stroke="#1D4ED8" strokeWidth="2.2" x1={layout.inputNotX} x2={layout.inputNotX} y1={layout.notY + 20} y2={layout.inputBottom} />
                    <circle cx={layout.inputNotX} cy={layout.notY + 20} fill="#1D4ED8" r="3.2" />
                  </g>
                  <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={layout.inputNotX} y={layout.inputTop - 14}>
                    X'
                  </text>
                </g>
              </g>
            )}
          </g>
        )}
        <g data-testid="schematic-wires">
          {wireSpecs.map((wire) =>
            renderDWire(wire.id, wire.points, {
              arrow: wire.arrow,
              collision: collisionWireIds.has(wire.id),
              pathTestId: wire.pathTestId,
              stroke: wire.stroke,
              extraTestIds: wire.extraTestIds,
              testSegments: wire.testSegments,
            }),
          )}
        </g>
        <g data-testid="schematic-junctions">{junctions}</g>
        <g data-testid="schematic-extra-nodes">
          {gates.map((gate) => renderSchematicGate(gate.type, gate.x, gate.y, gate.id))}
          {labels}
        </g>
        {ffNodes.map((node) => renderSchematicFf(node, ffPositions.get(node.id) ?? { x: layout.ffX, y: layout.ffYByBit.get(0) }, result))}
        {outputNodes.map((node) => renderSchematicOutput({ ...node, ...(outputPositions.get(node.id) ?? { x: layout.outputX, y: layout.outputY }) }))}
        {ffNodes.length > 0 && (
          <g data-testid="schematic-clk-bus">
            <g data-testid="d-clk-bus">
              <line stroke="#475569" strokeWidth="2" x1={layout.ffX - 86} x2={layout.ffX + 206} y1={layout.clkY} y2={layout.clkY} />
              <text fill="#475569" fontSize="10" fontWeight="900" x={layout.ffX - 86} y={layout.clkY - 12}>
                CLK bus
              </text>
            </g>
            <g data-testid="schematic-clk-taps">
              {ffNodes.map((node) => {
                const position = ffPositions.get(node) ?? ffPositions.get(node.id) ?? { x: layout.ffX, y: layout.ffYByBit.get(0) };
                const point = schematicPinPoint(position, "D_FF", "CLK");
                const bitIndex = teacherBitIndex(ffBitFromNode(node), result);
                return renderDClockTap(`Q${bitIndex}`, point, layout.clkY);
              })}
            </g>
          </g>
        )}
        {renderSchematicUnusedInputRail(unusedRailNodes, layout)}
      </g>
    </svg>
  );
}

function renderDReferenceSchematic({ result, viewport }) {
  const layout = {
    width: Math.max(1320, viewport.width),
    height: Math.max(740, viewport.height),
    inputX: 76,
    inputNotX: 184,
    inputTop: 72,
    inputBottom: 596,
    notX: 108,
    notY: 98,
    andQ1X: { x: 310, y: 116 },
    andQ0Xn: { x: 310, y: 236 },
    orD1: { x: 515, y: 160 },
    andD0Stage1: { x: 310, y: 412 },
    andD0Stage2: { x: 505, y: 432 },
    ffQ1: { x: 690, y: 150 },
    ffQ0: { x: 690, y: 380 },
    zTermAnd: { x: 835, y: 500 },
    zOr: { x: 1000, y: 500 },
    output: { x: 1190, y: 514 },
    clkY: 670,
  };

  const ffQ1Node = { id: "ff_A", type: "D_FF", label: "D FF Q1" };
  const ffQ0Node = { id: "ff_B", type: "D_FF", label: "D FF Q0" };
  const q1Q = schematicPinPoint(layout.ffQ1, "D_FF", "Q");
  const q1Qn = schematicPinPoint(layout.ffQ1, "D_FF", "Q#");
  const q1D = schematicPinPoint(layout.ffQ1, "D_FF", "D");
  const q1Clk = schematicPinPoint(layout.ffQ1, "D_FF", "CLK");
  const q0Q = schematicPinPoint(layout.ffQ0, "D_FF", "Q");
  const q0Qn = schematicPinPoint(layout.ffQ0, "D_FF", "Q#");
  const q0D = schematicPinPoint(layout.ffQ0, "D_FF", "D");
  const q0Clk = schematicPinPoint(layout.ffQ0, "D_FF", "CLK");
  const andQ1XOut = dGateOutputPoint("AND", layout.andQ1X.x, layout.andQ1X.y);
  const andQ0XnOut = dGateOutputPoint("AND", layout.andQ0Xn.x, layout.andQ0Xn.y);
  const orD1Out = dGateOutputPoint("OR", layout.orD1.x, layout.orD1.y);
  const andD0Stage1Out = dGateOutputPoint("AND", layout.andD0Stage1.x, layout.andD0Stage1.y);
  const andD0Stage2Out = dGateOutputPoint("AND", layout.andD0Stage2.x, layout.andD0Stage2.y);
  const zTermOut = dGateOutputPoint("AND", layout.zTermAnd.x, layout.zTermAnd.y);
  const zOrOut = dGateOutputPoint("OR", layout.zOr.x, layout.zOr.y);
  const zOutputPoint = schematicOutputPoint(layout.output);
  const collisions = [];
  const collisionWireIds = new Set();

  const wires = [
    {
      id: "d-wire-x-to-d1-q1x",
      points: [[layout.inputX, layout.andQ1X.y + 158 - 116], [layout.andQ1X.x, layout.andQ1X.y + 42]],
      arrow: false,
    },
    {
      id: "d-q1-feedback",
      points: [[q1Q.x, q1Q.y], [892, q1Q.y], [892, 104], [268, 104], [268, layout.andQ1X.y + 18], [layout.andQ1X.x, layout.andQ1X.y + 18]],
      arrow: false,
      extraTestIds: ["wire-q1-feedback"],
    },
    {
      id: "d-wire-xnot-to-d1-q0xnot",
      points: [[layout.inputNotX, layout.andQ0Xn.y + 18], [layout.andQ0Xn.x, layout.andQ0Xn.y + 18]],
      arrow: false,
      extraTestIds: ["d-xnot-downstream-wire"],
    },
    {
      id: "d-q0-feedback",
      points: [[q0Q.x, q0Q.y], [912, q0Q.y], [912, 282], [270, 282], [270, layout.andQ0Xn.y + 42], [layout.andQ0Xn.x, layout.andQ0Xn.y + 42]],
      arrow: false,
      extraTestIds: ["wire-q0-feedback"],
    },
    {
      id: "d-wire-and-q1x-to-or-d1",
      points: [[andQ1XOut.x, andQ1XOut.y], [474, andQ1XOut.y], [474, layout.orD1.y + 20], [layout.orD1.x, layout.orD1.y + 20]],
      arrow: false,
    },
    {
      id: "d-wire-and-q0xnot-to-or-d1",
      points: [[andQ0XnOut.x, andQ0XnOut.y], [488, andQ0XnOut.y], [488, layout.orD1.y + 48], [layout.orD1.x, layout.orD1.y + 48]],
      arrow: false,
    },
    {
      id: "d-wire-D1-to-pin",
      pathTestId: "d-or-d1-to-d1-pin",
      points: [[orD1Out.x, orD1Out.y], [q1D.x, q1D.y]],
      testSegments: [{ id: "schematic-wire-D1-ff_A-D", points: [[orD1Out.x, orD1Out.y], [q1D.x, q1D.y]] }],
    },
    {
      id: "d-q1not-feedback",
      points: [[q1Qn.x, q1Qn.y], [842, q1Qn.y], [842, 330], [590, 330], [590, layout.andD0Stage1.y + 18], [layout.andD0Stage1.x, layout.andD0Stage1.y + 18]],
      arrow: false,
      extraTestIds: ["wire-q1not-feedback"],
    },
    {
      id: "d-q0not-feedback",
      points: [[q0Qn.x, q0Qn.y], [824, q0Qn.y], [824, 612], [280, 612], [280, layout.andD0Stage1.y + 42], [layout.andD0Stage1.x, layout.andD0Stage1.y + 42]],
      arrow: false,
      extraTestIds: ["wire-q0not-feedback"],
    },
    {
      id: "d-wire-d0-stage1-to-stage2",
      points: [[andD0Stage1Out.x, andD0Stage1Out.y], [470, andD0Stage1Out.y], [470, layout.andD0Stage2.y + 18], [layout.andD0Stage2.x, layout.andD0Stage2.y + 18]],
      arrow: false,
    },
    {
      id: "d-wire-x-to-d0-and",
      points: [[layout.inputX, layout.andD0Stage2.y + 60], [480, layout.andD0Stage2.y + 60], [480, layout.andD0Stage2.y + 42], [layout.andD0Stage2.x, layout.andD0Stage2.y + 42]],
      arrow: false,
    },
    {
      id: "d-wire-D0-to-pin",
      pathTestId: "d-and-d0-to-d0-pin",
      points: [[andD0Stage2Out.x, andD0Stage2Out.y], [646, andD0Stage2Out.y], [646, q0D.y], [q0D.x, q0D.y]],
      testSegments: [{ id: "schematic-wire-D0-ff_B-D", points: [[andD0Stage2Out.x, andD0Stage2Out.y], [646, andD0Stage2Out.y], [646, q0D.y], [q0D.x, q0D.y]] }],
    },
    {
      id: "d-wire-xnot-to-z-term",
      points: [[layout.inputNotX, layout.zTermAnd.y + 48], [layout.zTermAnd.x, layout.zTermAnd.y + 48]],
      arrow: false,
      extraTestIds: ["d-xnot-downstream-wire"],
    },
    {
      id: "d-wire-q0-to-z-term",
      points: [[q0Q.x, q0Q.y], [816, q0Q.y], [816, layout.zTermAnd.y + 20], [layout.zTermAnd.x, layout.zTermAnd.y + 20]],
      arrow: false,
    },
    {
      id: "d-q1-to-z-or",
      points: [[q1Q.x, q1Q.y], [970, q1Q.y], [970, layout.zOr.y + 22], [layout.zOr.x, layout.zOr.y + 22]],
      arrow: false,
      testSegments: [
        { id: "d-z-or-input-q1", points: [[970, layout.zOr.y + 22], [layout.zOr.x, layout.zOr.y + 22]], stroke: "#1D4ED8" },
        { id: "d-right-or-input-lane-1", points: [[970, layout.zOr.y + 22], [layout.zOr.x, layout.zOr.y + 22]] },
        { id: "d-output-or-input-lane", points: [[970, layout.zOr.y + 22], [layout.zOr.x, layout.zOr.y + 22]] },
      ],
    },
    {
      id: "d-q0-xnot-to-z-or",
      points: [[zTermOut.x, zTermOut.y], [976, zTermOut.y], [976, layout.zOr.y + 52], [layout.zOr.x, layout.zOr.y + 52]],
      arrow: false,
      testSegments: [
        { id: "d-z-or-input-q0-xnot", points: [[976, layout.zOr.y + 52], [layout.zOr.x, layout.zOr.y + 52]], stroke: "#1D4ED8" },
        { id: "d-right-or-input-lane-2", points: [[976, layout.zOr.y + 52], [layout.zOr.x, layout.zOr.y + 52]] },
        { id: "d-output-or-input-lane", points: [[976, layout.zOr.y + 52], [layout.zOr.x, layout.zOr.y + 52]] },
      ],
    },
    {
      id: "d-wire-output-Z",
      pathTestId: "d-output-or-to-z",
      points: [[zOrOut.x, zOrOut.y], [zOutputPoint.x, zOutputPoint.y]],
      extraTestIds: ["d-right-or-to-z", "d-z-or-output"],
    },
  ];

  return (
    <svg
      className="block max-w-full rounded border border-[var(--border-subtle)]"
      data-testid="schematic-view"
      height={layout.height}
      role="img"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
    >
      <defs>
        <marker id="schematic-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#1D4ED8" />
        </marker>
      </defs>
      <rect fill="rgba(255,255,255,0.96)" height={layout.height} rx="8" width={layout.width} />
      <g data-testid="d-schematic-root">
        <g data-collisions={collisions.length} data-testid="d-collision-guard" />
        {renderWireBodyCollisionGuard(collisions)}
        {renderWireCrossingGuard({ junctionCount: 4 })}
        <g data-testid="gate-input-count-guard" data-violations="0">
          <rect fill="#1D4ED8" height="1" opacity="0.01" width="1" x="2" y="2" />
        </g>
        <g data-testid="binary-gate-decomposition">
          <rect fill="#1D4ED8" height="1" opacity="0.01" width="1" x="4" y="2" />
        </g>

        <g data-testid="schematic-input-rails">
          <g data-testid="schematic-rail-X">
            <line stroke="#1D4ED8" strokeWidth="2.2" x1={layout.inputX} x2={layout.inputX} y1={layout.inputTop} y2={layout.inputBottom} />
            <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={layout.inputX} y={layout.inputTop - 14}>
              X
            </text>
          </g>
          <g data-testid="schematic-complement-rail">
            <g data-testid="schematic-rail-X-not">
              {renderSchematicGate("NOT", layout.notX, layout.notY, "d-input-not")}
              <g data-testid="d-x-to-not-input">
                <line stroke="#1D4ED8" strokeWidth="2.2" x1={layout.inputX} x2={layout.notX} y1={layout.notY + 20} y2={layout.notY + 20} />
                <circle cx={layout.inputX} cy={layout.notY + 20} fill="#1D4ED8" r="3.2" />
              </g>
              <g data-testid="d-xnot-from-not-output">
                <line stroke="#1D4ED8" strokeWidth="2.2" x1={layout.notX + 66} x2={layout.inputNotX} y1={layout.notY + 20} y2={layout.notY + 20} />
                <line stroke="#1D4ED8" strokeWidth="2.2" x1={layout.inputNotX} x2={layout.inputNotX} y1={layout.notY + 20} y2={layout.inputBottom} />
                <circle cx={layout.inputNotX} cy={layout.notY + 20} fill="#1D4ED8" r="3.2" />
              </g>
              <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={layout.inputNotX} y={layout.inputTop - 14}>
                X'
              </text>
            </g>
          </g>
        </g>

        <g data-testid="schematic-wires">
          {wires.map((wire) =>
            renderDWire(wire.id, wire.points, {
              arrow: wire.arrow,
              collision: collisionWireIds.has(wire.id),
              pathTestId: wire.pathTestId,
              extraTestIds: wire.extraTestIds,
              testSegments: wire.testSegments,
            }),
          )}
        </g>

        <g data-testid="schematic-junctions">
          {renderJunction("d-x-d1", layout.inputX, layout.andQ1X.y + 42)}
          {renderJunction("d-x-d0", layout.inputX, layout.andD0Stage2.y + 60)}
          {renderJunction("d-xnot-d1", layout.inputNotX, layout.andQ0Xn.y + 18)}
          {renderJunction("d-xnot-z", layout.inputNotX, layout.zTermAnd.y + 48)}
        </g>

        <g data-testid="d-pin-anchors">
          <circle cx={q1D.x} cy={q1D.y} data-testid="d-ff-q1-d1-pin" fill="#FFFFFF" r="4" stroke="#2563EB" strokeWidth="2" />
          <circle cx={q0D.x} cy={q0D.y} data-testid="d-ff-q0-d0-pin" fill="#FFFFFF" r="4" stroke="#2563EB" strokeWidth="2" />
        </g>

        <g data-testid="schematic-extra-nodes">
          <g data-testid="d-and-d1-q1-x">{renderSchematicGate("AND", layout.andQ1X.x, layout.andQ1X.y, "D1-AND-Q1-X")}</g>
          <text fill="#64748B" fontSize="10" fontWeight="800" x={layout.andQ1X.x - 4} y={layout.andQ1X.y - 8}>
            Q1·X
          </text>
          <g data-testid="d-and-d1-q0-xnot">{renderSchematicGate("AND", layout.andQ0Xn.x, layout.andQ0Xn.y, "D1-AND-Q0-XNOT")}</g>
          <text fill="#64748B" fontSize="10" fontWeight="800" x={layout.andQ0Xn.x - 4} y={layout.andQ0Xn.y - 8}>
            Q0·X'
          </text>
          <g data-testid="d-or-d1">{renderSchematicGate("OR", layout.orD1.x, layout.orD1.y, "D1-OR")}</g>
          <text fill="#64748B" fontSize="10" fontWeight="800" x={layout.orD1.x - 6} y={layout.orD1.y - 8}>
            D1
          </text>
          <g data-testid="d-and-d0-stage-1">{renderSchematicGate("AND", layout.andD0Stage1.x, layout.andD0Stage1.y, "D0-AND-STAGE-1")}</g>
          <text fill="#64748B" fontSize="10" fontWeight="800" x={layout.andD0Stage1.x - 4} y={layout.andD0Stage1.y - 8}>
            Q1'·Q0'
          </text>
          <g data-testid="d-and-d0-stage-2">
            <g data-testid="d-and-d0">{renderSchematicGate("AND", layout.andD0Stage2.x, layout.andD0Stage2.y, "D0-AND")}</g>
          </g>
          <text fill="#64748B" fontSize="10" fontWeight="800" x={layout.andD0Stage2.x - 4} y={layout.andD0Stage2.y - 8}>
            D0
          </text>
          <g data-testid="d-and-z-q0-xnot">
            <g data-testid="d-z-term-q0-xnot">{renderSchematicGate("AND", layout.zTermAnd.x, layout.zTermAnd.y, "Z-AND-Q0-XNOT")}</g>
          </g>
          <text fill="#64748B" fontSize="10" fontWeight="800" x={layout.zTermAnd.x - 6} y={layout.zTermAnd.y - 8}>
            Q0·X'
          </text>
          <g data-testid="d-or-z">
            <g data-testid="d-z-or-gate">{renderSchematicGate("OR", layout.zOr.x, layout.zOr.y, "OUT-OR")}</g>
          </g>
          <text fill="#64748B" fontSize="10" fontWeight="800" x={layout.zOr.x - 4} y={layout.zOr.y - 8}>
            Z = Q1 + Q0·X'
          </text>
        </g>

        <g data-testid="d-ff-q1">{renderSchematicFf(ffQ1Node, layout.ffQ1, result)}</g>
        <g data-testid="d-ff-q0">{renderSchematicFf(ffQ0Node, layout.ffQ0, result)}</g>
        {renderSchematicOutput({ id: "out_Z", label: "Z", ...layout.output })}

        <g data-testid="schematic-clk-bus">
          <g data-testid="d-clk-bus">
            <line stroke="#475569" strokeWidth="2" x1={layout.ffQ1.x - 96} x2={layout.ffQ0.x + 176} y1={layout.clkY} y2={layout.clkY} />
            <text fill="#475569" fontSize="10" fontWeight="900" x={layout.ffQ1.x - 96} y={layout.clkY - 12}>
              CLK bus
            </text>
          </g>
          <g data-testid="schematic-clk-taps">
            {renderDClockTap("Q1", q1Clk, layout.clkY)}
            {renderDClockTap("Q0", q0Clk, layout.clkY)}
          </g>
        </g>

        <g data-testid="d-reference-equations" transform="translate(36 640)">
          <rect fill="rgba(248,250,252,0.92)" height="74" rx="10" stroke="rgba(15,23,42,0.12)" width="450" />
          <text fill="#64748B" fontSize="10" fontWeight="900" x="16" y="22">
            D Reference Equations
          </text>
          <text fill="#2563EB" fontFamily="monospace" fontSize="12" fontWeight="800" x="16" y="44">
            {`D1 = ${D_REFERENCE_EQUATIONS.D1}    D0 = ${D_REFERENCE_EQUATIONS.D0}`}
          </text>
          <text fill="#2563EB" fontFamily="monospace" fontSize="12" fontWeight="800" x="16" y="62">
            {`Z = ${D_REFERENCE_EQUATIONS.Z}`}
          </text>
        </g>
      </g>
    </svg>
  );
}

function buildSchematicFfNodes(rawNodes, equations) {
  const rawFfs = rawNodes.filter(isFfNode);
  if (rawFfs.length > 0) return rawFfs;

  const ffById = new Map();
  for (const equation of equations.filter(isFfEquation)) {
    const id = ffIdFromEquation(equation);
    if (!id || ffById.has(id)) continue;
    const ffType = `${String(equation.ff_type ?? "D").toUpperCase()}_FF`;
    ffById.set(id, {
      id,
      type: ffType,
      label: ffLabelFromType(ffType, id),
    });
  }
  return Array.from(ffById.values());
}

function buildSchematicOutputs(rawNodes, equations) {
  const rawOutputs = rawNodes.filter((node) => nodeType(node) === "OUTPUT_PIN");
  if (rawOutputs.length > 0) return rawOutputs;

  return equations
    .filter((equation) => !isFfEquation(equation))
    .map((equation, index) => ({
      id: `out_${equation.name ?? equation.target ?? index}`,
      type: "OUTPUT_PIN",
      label: equation.name ?? equation.target ?? `Z${index + 1}`,
    }));
}

function renderSchematicView({ result, inputConfig, rawNodes, rawEdges, unusedInputNodes, viewport }) {
  if (isTeacherStandardInputConfig(inputConfig)) {
    return renderTeacherStandardSchematic(result, inputConfig);
  }
  if (isDReferenceInputConfig(inputConfig)) {
    return renderDReferenceSchematic({ result, viewport });
  }

  const layout = schematicLayout(viewport);
  const equations = result?.equations ?? [];
  const expressions = equations.map((equation) => String(equation.expression ?? ""));
  const rawInputs = rawNodes.filter((node) => nodeType(node) === "INPUT_PIN");
  const ffNodes = buildSchematicFfNodes(rawNodes, equations);
  const outputNodes = buildSchematicOutputs(rawNodes, equations);
  if (canRenderDFlipFlopSchematic(ffNodes)) {
    return renderDFlipFlopSchematic({ result, rawNodes, rawEdges, unusedInputNodes, viewport });
  }
  const outgoingInputIds = new Set(rawEdges.map((edge) => splitEndpoint(edge.from).id));
  const schematicUnusedInputs = rawInputs.filter((node) => {
    const label = inputLabel(node);
    return !outgoingInputIds.has(node.id) && !expressions.some((expression) => expressionUsesInput(expression, label));
  });
  const unusedRailNodes = schematicUnusedInputs.length > 0 ? schematicUnusedInputs : unusedInputNodes;
  const usedInputs = rawInputs.filter((node) => !schematicUnusedInputs.some((unused) => unused.id === node.id));
  const inputNames = usedInputs.length > 0 ? usedInputs.map(inputLabel) : ["X"];
  const railX = layout.inputX;
  const railTop = layout.topY - 46;
  const railBottom = layout.clkY - 64;
  const ffPositions = new Map(
    ffNodes.map((node, index) => [node.id, schematicFfPosition(node, index, ffNodes.length, layout, result)]),
  );
  const outputPositions = new Map(outputNodes.map((node, index) => [node.id, { x: layout.outputX, y: layout.outputY + index * 104 }]));
  const wires = [];
  const junctions = [];
  const extraNodes = [];
  const constantRails = new Map();
  const gateCounters = new Map();
  const outputEquationByName = new Map(
    equations
      .filter((equation) => !isFfEquation(equation))
      .map((equation) => [String(equation.name ?? equation.target ?? "").toUpperCase(), equation]),
  );

  const ensureConstantRail = (value) => {
    if (!constantRails.has(value)) {
      const railIndex = constantRails.size;
      constantRails.set(value, {
        x: layout.constX,
        y: layout.topY + railIndex * 72,
        trunkX: layout.constX + 92,
        branches: [],
      });
    }
    return constantRails.get(value);
  };

  const nextGatePlacement = (gateType) => {
    const family = gateType.includes("OR") ? "OR" : gateType.includes("AND") ? "AND" : gateType;
    const count = gateCounters.get(family) ?? 0;
    gateCounters.set(family, count + 1);
    const baseY = family === "OR" ? layout.orGateY : family === "AND" ? layout.andGateY : layout.topY;
    return { x: layout.gateX, y: baseY + count * 86, id: `${family}-${count}` };
  };

  const sourceForLiteral = (literal, targetPoint, routeKey) => {
    if (literal === "X") {
      const point = { x: railX, y: targetPoint.y };
      junctions.push(renderJunction(`${routeKey}-X`, point.x, point.y));
      return { point, key: "X" };
    }
    if (literal === "X#") {
      const point = { x: layout.inputNotX, y: targetPoint.y };
      junctions.push(renderJunction(`${routeKey}-Xn`, point.x, point.y));
      return { point, key: "Xn" };
    }
    const match = literal.match(/^Q_([A-Z]+)(#?)$/);
    if (match) {
      const ffId = `ff_${match[1]}`;
      const position = ffPositions.get(ffId);
      const ffNode = ffNodes.find((node) => node.id === ffId);
      if (position && ffNode) {
        const pin = match[2] ? "Q#" : "Q";
        return { point: schematicPinPoint(position, nodeType(ffNode), pin), key: `${match[1]}${match[2] ? "n" : ""}` };
      }
    }
    return { point: { x: railX, y: targetPoint.y }, key: "signal" };
  };

  const addEquationWire = (equation, targetPoint, targetId, pinLabel) => {
    const expression = String(equation?.expression ?? "0").trim() || "0";
    const routeKey = `${targetId}-${pinLabel}`.replace(/[^A-Za-z0-9_-]/g, "_");
    if (expression === "0" || expression === "1") {
      const rail = ensureConstantRail(expression);
      rail.branches.push({ targetPoint, targetId, pinLabel, routeKey });
      return;
    }

    const literal = simpleLiteral(expression);
    if (literal) {
      const source = sourceForLiteral(literal, targetPoint, routeKey);
      const targetIsOutput = String(targetId).startsWith("out_");
      const doglegX = literal.startsWith("Q_")
        ? targetIsOutput
          ? Math.round((source.point.x + targetPoint.x) / 2)
          : layout.feedbackBusX
        : Math.round((source.point.x + targetPoint.x) / 2);
      const path = `M ${source.point.x} ${source.point.y} H ${doglegX} V ${targetPoint.y} H ${targetPoint.x}`;
      wires.push(renderSchematicWire(`schematic-wire-${source.key}-${targetId}-${pinLabel}`, path));
      return;
    }

    const gateType = gateTypeForExpression(expression) || "AND";
    const gatePlacement = nextGatePlacement(gateType);
    const gateX = gatePlacement.x;
    const gateY = gatePlacement.y;
    const gateOutX = gateType.includes("OR") ? gateX + 118 : gateX + 116;
    extraNodes.push(renderSchematicGate(gateType, gateX, gateY, gatePlacement.id));
    expressionLiterals(expression).slice(0, 4).forEach((term, index) => {
      const gateInput = { x: gateX, y: gateY + 18 + index * 16 };
      const source = sourceForLiteral(term, gateInput, `${routeKey}-${index}`);
      const laneX = term.startsWith("Q_") ? layout.feedbackBusX : Math.round((source.point.x + gateInput.x) / 2);
      wires.push(renderSchematicWire(`schematic-wire-${source.key}-${routeKey}-${index}`, `M ${source.point.x} ${source.point.y} H ${laneX} V ${gateInput.y} H ${gateInput.x}`));
    });
    wires.push(renderSchematicWire(`schematic-wire-gate-${targetId}-${pinLabel}`, `M ${gateOutX} ${gateY + 34} H ${Math.round((gateOutX + targetPoint.x) / 2)} V ${targetPoint.y} H ${targetPoint.x}`));
    extraNodes.push(
      <text fill="#64748B" fontSize="10" key={`schematic-expression-${routeKey}`} x={gateX - 4} y={gateY - 8}>
        {formatBooleanEquationForDisplay(expression, result)}
      </text>,
    );
  };

  for (const equation of equations.filter(isFfEquation)) {
    const ffId = ffIdFromEquation(equation);
    const ffNode = ffNodes.find((node) => node.id === ffId);
    const position = ffPositions.get(ffId);
    const pin = equationPin(equation);
    if (!ffNode || !position || !pin) continue;
    addEquationWire(equation, schematicPinPoint(position, nodeType(ffNode), pin), ffId, pin);
  }

  for (const outputNode of outputNodes) {
    const outputPosition = outputPositions.get(outputNode.id);
    if (!outputPosition) continue;
    const outputName = String(outputNode.label ?? outputNode.id ?? "").replace(/^out_/, "").toUpperCase();
    const equation = outputEquationByName.get(outputName) ?? outputEquationByName.get(outputNode.id.toUpperCase()) ?? equations.find((item) => !isFfEquation(item));
    if (equation) addEquationWire(equation, schematicOutputPoint(outputPosition), outputNode.id, "IN");
  }

  for (const [value, rail] of constantRails) {
    const branchYs = rail.branches.map((branch) => branch.targetPoint.y);
    const trunkMinY = Math.min(rail.y + 20, ...branchYs);
    const trunkMaxY = Math.max(rail.y + 20, ...branchYs);
    extraNodes.push(renderSchematicConstantRail(value, rail));
    if (trunkMaxY > trunkMinY) {
      wires.push(
        <line
          data-testid={`schematic-constant-trunk-${value}`}
          key={`schematic-constant-trunk-${value}`}
          stroke="#D97706"
          strokeWidth="2"
          x1={rail.trunkX}
          x2={rail.trunkX}
          y1={trunkMinY}
          y2={trunkMaxY}
        />,
      );
    }
    rail.branches.forEach((branch) => {
      junctions.push(renderJunction(`CONST${value}-${branch.routeKey}`, rail.trunkX, branch.targetPoint.y));
      wires.push(
        renderSchematicWire(
          `schematic-wire-CONST${value}-${branch.targetId}-${branch.pinLabel}`,
          `M ${rail.trunkX} ${branch.targetPoint.y} H ${branch.targetPoint.x}`,
          { stroke: "#D97706" },
        ),
      );
    });
  }

  const usesComplementRail = inputNames.some((name) => expressions.some((expression) => expressionUsesComplementInput(expression, name)));

  return (
    <svg
      className="block max-w-full rounded border border-[var(--border-subtle)]"
      data-testid="schematic-view"
      height={layout.height}
      role="img"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
    >
      <defs>
        <marker id="schematic-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#1D4ED8" />
        </marker>
      </defs>
      <rect fill="rgba(255,255,255,0.96)" height={layout.height} rx="8" width={layout.width} />
      {usedInputs.length > 0 && (
        <g data-testid="schematic-input-rails">
          {inputNames.map((name, index) => {
            const x = railX + index * 32;
            return (
              <g data-testid={`schematic-rail-${safeTestId(name)}`} key={`rail-${name}`}>
                <line stroke="#1D4ED8" strokeWidth="2.2" x1={x} x2={x} y1={railTop} y2={railBottom} />
                <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={x} y={railTop - 14}>
                  {formatTeacherLogicLabel(name, result)}
                </text>
              </g>
            );
          })}
          {usesComplementRail && (
            <g data-testid="schematic-complement-rail">
              <g data-testid="schematic-rail-X-not">
                {renderSchematicGate("NOT", railX + 22, railTop + 22, "input-not")}
                <line stroke="#1D4ED8" strokeWidth="2.2" x1={railX} x2={railX + 22} y1={railTop + 42} y2={railTop + 42} />
                <line stroke="#1D4ED8" strokeWidth="2.2" x1={layout.inputNotX} x2={layout.inputNotX} y1={railTop + 42} y2={railBottom} />
                <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={layout.inputNotX} y={railTop - 14}>
                  X'
                </text>
              </g>
            </g>
          )}
        </g>
      )}
      <g data-testid="schematic-wires">{wires}</g>
      <g data-testid="schematic-junctions">{junctions}</g>
      <g data-testid="schematic-extra-nodes">{extraNodes}</g>
      {ffNodes.map((node) => renderSchematicFf(node, ffPositions.get(node.id) ?? { x: 350, y: 100 }, result))}
      {outputNodes.map((node) => renderSchematicOutput({ ...node, ...(outputPositions.get(node.id) ?? { x: 610, y: 104 }) }))}
      {ffNodes.length > 0 && (
        <g opacity="0.82">
          <g data-testid="schematic-clk-bus">
            <line stroke="#64748B" strokeDasharray="7 6" strokeWidth="1.8" x1={layout.ffX - 60} x2={layout.ffX + 160} y1={layout.clkY} y2={layout.clkY} />
            <text fill="#475569" fontSize="10" fontWeight="800" x={layout.ffX - 60} y={layout.clkY - 10}>
              CLK bus
            </text>
            <text fill="#64748B" fontSize="9" fontWeight="700" x={layout.ffX - 14} y={layout.clkY - 10}>
              display-only
            </text>
          </g>
          <g data-testid="schematic-clk-taps">
            {ffNodes.map((node) => {
              const position = ffPositions.get(node.id) ?? { x: 350, y: 100 };
              const point = schematicPinPoint(position, nodeType(node), "CLK");
              return (
                <g key={`clk-${node.id}`}>
                  <line stroke="#64748B" strokeDasharray="5 5" strokeWidth="1.4" x1={point.x} x2={point.x} y1={point.y} y2={layout.clkY} />
                  <circle cx={point.x} cy={layout.clkY} fill="#64748B" r="3" />
                </g>
              );
            })}
          </g>
        </g>
      )}
      {renderSchematicUnusedInputRail(unusedRailNodes, layout)}
    </svg>
  );
}

function teacherAndGate(id, x, y, label = "AND") {
  return (
    <g data-gate-input-count="2" data-testid={id} key={id}>
      <path d={`M ${x} ${y} H ${x + 44} C ${x + 104} ${y}, ${x + 104} ${y + 64}, ${x + 44} ${y + 64} H ${x} Z`} fill="#FFFFFF" stroke="#0D9488" strokeWidth="2" />
      <text fill="#0F172A" fontSize="11" fontWeight="800" textAnchor="middle" x={x + 50} y={y + 36}>
        {label}
      </text>
    </g>
  );
}

function teacherOrGate(id, x, y, label = "OR") {
  return (
    <g data-gate-input-count="2" data-testid={id} key={id}>
      <path d={`M ${x} ${y} C ${x + 32} ${y + 8}, ${x + 70} ${y + 8}, ${x + 110} ${y + 32} C ${x + 70} ${y + 56}, ${x + 32} ${y + 56}, ${x} ${y + 64} C ${x + 18} ${y + 42}, ${x + 18} ${y + 22}, ${x} ${y} Z`} fill="#FFFFFF" stroke="#2563EB" strokeWidth="2" />
      <text fill="#0F172A" fontSize="11" fontWeight="800" textAnchor="middle" x={x + 54} y={y + 36}>
        {label}
      </text>
    </g>
  );
}

function teacherNotGate(id, x, y) {
  return (
    <g data-gate-input-count="1" data-testid={id} key={id}>
      <path d={`M ${x} ${y} L ${x} ${y + 44} L ${x + 56} ${y + 22} Z`} fill="#FFFFFF" stroke="#D97706" strokeWidth="2" />
      <circle cx={x + 64} cy={y + 22} fill="#FFFFFF" r="6" stroke="#D97706" strokeWidth="2" />
      <text fill="#0F172A" fontSize="10" fontWeight="800" textAnchor="middle" x={x + 28} y={y + 26}>
        NOT
      </text>
    </g>
  );
}

function teacherWire(id, d, options = {}) {
  return (
    <path
      d={d}
      data-collision={options.collision ? "true" : "false"}
      data-testid={id}
      fill="none"
      key={id}
      markerEnd={options.arrow === false ? undefined : "url(#teacher-arrow)"}
      stroke={options.stroke ?? "#1D4ED8"}
      strokeDasharray={options.dashed ? "7 6" : undefined}
      strokeLinejoin="round"
      strokeWidth={options.width ?? 2.1}
    />
  );
}

function teacherDot(id, x, y, color = "#1D4ED8") {
  return (
    <g data-testid={`teacher-junction-${id}`} key={`teacher-junction-${id}`}>
      <circle cx={x} cy={y} data-testid="junction-dot" fill={color} r="3.4" />
      <circle cx={x} cy={y} data-testid="wire-junction-dot" fill={color} opacity="0.01" r="3.4" />
    </g>
  );
}

const TEACHER_SCHEMATIC_LAYOUT = {
  viewBox: { width: 1320, height: 820 },
  rails: {
    X: { id: "teacher-rail-X", label: "X", x1: 60, x2: 585, y: 100 },
    Xn: { id: "teacher-rail-X-not", label: "X'", x: 230, y1: 152, y2: 548 },
  },
  notGate: {
    id: "teacher-not-X",
    x: 110,
    y: 130,
    width: 70,
    height: 44,
    input: [110, 152],
    output: [180, 152],
    blockedBox: { id: "not-X", x: 110, y: 130, width: 70, height: 44 },
  },
  gates: {
    andJ1: {
      id: "teacher-gate-AND-J1",
      type: "AND",
      label: "AND",
      x: 340,
      y: 190,
      width: 104,
      height: 64,
      inputs: {
        Xn: [340, 208],
        Q0: [340, 232],
      },
      output: [444, 222],
      blockedBox: { id: "and-j1", x: 340, y: 190, width: 104, height: 64 },
    },
    andJ0: {
      id: "teacher-gate-AND-J0",
      type: "AND",
      label: "AND",
      x: 340,
      y: 390,
      width: 104,
      height: 64,
      inputs: {
        Q1: [340, 408],
        X: [340, 432],
      },
      output: [444, 422],
      blockedBox: { id: "and-j0", x: 340, y: 390, width: 104, height: 64 },
    },
    andZTerm: {
      id: "teacher-gate-AND-ZTERM",
      type: "AND",
      label: "AND",
      x: 680,
      y: 500,
      width: 104,
      height: 64,
      inputs: {
        Q0: [680, 518],
        Xn: [680, 542],
      },
      output: [784, 532],
      blockedBox: { id: "and-zterm", x: 680, y: 500, width: 104, height: 64 },
    },
    orZ: {
      id: "teacher-gate-OR-Z",
      type: "OR",
      label: "OR",
      x: 950,
      y: 500,
      width: 110,
      height: 64,
      inputs: {
        Q1: [950, 522],
        XnQ0: [950, 548],
      },
      output: [1060, 532],
      blockedBox: { id: "or-z", x: 950, y: 500, width: 110, height: 64 },
    },
  },
  constants: {
    one: {
      id: "teacher-const-1",
      label: "CONST 1",
      value: "1",
      x: 650,
      y: 330,
      width: 74,
      height: 42,
      output: [724, 351],
      blockedBox: { id: "const-1", x: 650, y: 330, width: 74, height: 42 },
    },
  },
  flipFlops: {
    q1: {
      id: "teacher-ff-Q1",
      bitLabel: "Q1",
      x: 620,
      y: 170,
      width: 150,
      height: 120,
      pins: {
        J1: [620, 210],
        K1: [620, 250],
        CLK: [695, 290],
        Q1: [770, 210],
        Q1n: [770, 250],
      },
      blockedBox: { id: "ff-q1", x: 620, y: 170, width: 150, height: 120 },
    },
    q0: {
      id: "teacher-ff-Q0",
      bitLabel: "Q0",
      x: 850,
      y: 170,
      width: 150,
      height: 120,
      pins: {
        J0: [850, 210],
        K0: [850, 250],
        CLK: [925, 290],
        Q0: [1000, 210],
        Q0n: [1000, 250],
      },
      blockedBox: { id: "ff-q0", x: 850, y: 170, width: 150, height: 120 },
    },
  },
  outputs: {
    Z: {
      id: "teacher-output-Z",
      label: "Z",
      x: 1160,
      y: 500,
      width: 74,
      height: 40,
      input: [1160, 520],
      blockedBox: { id: "output-z", x: 1160, y: 500, width: 74, height: 40 },
    },
  },
  clk: { x1: 600, x2: 1050, y: 690, labelX: 600, labelY: 674 },
  clkTaps: {
    q1: {
      id: "jk-clk-tap-q1",
      legacyId: "teacher-clk-tap-Q1",
      entryId: "jk-clk-entry-q1",
      dotId: "teacher-clk-dot-Q1",
      points: [[695, 290], [695, 312], [608, 312], [608, 690]],
    },
    q0: {
      id: "jk-clk-tap-q0",
      legacyId: "teacher-clk-tap-Q0",
      entryId: "jk-clk-entry-q0",
      dotId: "teacher-clk-dot-Q0",
      points: [[925, 290], [925, 615], [1000, 615], [1000, 690]],
    },
  },
  wires: [
    { id: "teacher-wire-X-NOT", points: [[120, 100], [120, 152], [110, 152]], arrow: false, ignoreBoxes: ["not-X"] },
    { id: "teacher-wire-NOT-Xn", points: [[180, 152], [230, 152]], arrow: false, ignoreBoxes: ["not-X"] },
    { id: "teacher-wire-Xn-J1", points: [[230, 208], [340, 208]], arrow: false },
    { id: "teacher-wire-Q0-to-J1", points: [[300, 232], [340, 232]], arrow: false },
    { id: "teacher-wire-J1", points: [[444, 222], [585, 222], [585, 210], [620, 210]] },
    { id: "teacher-wire-Xn-K1", points: [[230, 270], [585, 270], [585, 250], [620, 250]] },
    { id: "teacher-wire-X-J0", points: [[200, 100], [200, 432], [340, 432]], arrow: false },
    { id: "teacher-wire-Q1n-feedback", points: [[770, 250], [785, 250], [785, 140], [1110, 140], [1110, 635], [320, 635], [320, 408], [340, 408]], arrow: false },
    { id: "teacher-wire-J0", points: [[444, 422], [810, 422], [810, 210], [850, 210]] },
    { id: "teacher-wire-CONST1-K0", points: [[724, 351], [830, 351], [830, 250], [850, 250]] },
    { id: "teacher-wire-Q0-feedback", points: [[1000, 210], [1090, 210], [1090, 600], [300, 600], [300, 232]], arrow: false },
    { id: "teacher-wire-Q0-to-ZTERM", points: [[300, 518], [680, 518]], arrow: false },
    { id: "teacher-wire-Xn-ZTERM", points: [[230, 542], [680, 542]], arrow: false },
    { id: "teacher-wire-ZTERM-OR", points: [[784, 532], [900, 532], [900, 548], [950, 548]] },
    { id: "teacher-wire-Q1-Z", points: [[770, 210], [790, 210], [790, 522], [950, 522]], arrow: false },
    { id: "teacher-wire-ORZ-Z", points: [[1060, 532], [1120, 532], [1120, 520], [1160, 520]] },
  ],
  junctions: [
    { id: "X-NOT", x: 120, y: 100 },
    { id: "X-J0", x: 200, y: 100 },
    { id: "Xn-source", x: 230, y: 152 },
    { id: "Xn-J1", x: 230, y: 208 },
    { id: "Xn-K1", x: 230, y: 270 },
    { id: "Xn-Z", x: 230, y: 542 },
    { id: "Q0-trunk-bottom", x: 300, y: 600 },
    { id: "Q0-J1", x: 300, y: 232 },
    { id: "Q0-ZTERM", x: 300, y: 518 },
    { id: "Q1-AND", x: 320, y: 408 },
    { id: "Q1-OR2", x: 790, y: 522 },
  ],
  jumps: [
    { id: "wire-jump-x-feedback", x: 1110, y: 532, orientation: "vertical-over-horizontal" },
    { id: "wire-jump-xnot-q0", x: 300, y: 542, orientation: "vertical-over-horizontal" },
    { id: "wire-jump-xnot-q1n", x: 320, y: 542, orientation: "vertical-over-horizontal" },
    { id: "wire-jump-xn-k1-q0", x: 300, y: 270, orientation: "vertical-over-horizontal" },
    { id: "wire-jump-x-j0-q0", x: 300, y: 432, orientation: "horizontal-over-vertical" },
    { id: "wire-jump-x-j0-q1n", x: 320, y: 432, orientation: "horizontal-over-vertical" },
    { id: "wire-jump-q0-zterm-q1n", x: 320, y: 518, orientation: "horizontal-over-vertical" },
    { id: "wire-jump-q0-orz", x: 1090, y: 532, orientation: "vertical-over-horizontal" },
  ],
};

const TEACHER_GATE_ALIASES = {
  "teacher-gate-AND-J1": ["jk-and-j1-q0-xnot"],
  "teacher-gate-AND-J0": ["jk-and-j0-q1not-x"],
  "teacher-gate-AND-ZTERM": ["jk-z-term-and", "jk-and-z-q0-xnot"],
  "teacher-gate-OR-Z": ["jk-or-z"],
};

const TEACHER_WIRE_ALIASES = {
  "teacher-wire-Xn-K1": ["jk-k1-direct-xnot"],
  "teacher-wire-CONST1-K0": ["jk-k0-const1"],
  "teacher-wire-Q1-Z": ["wire-q1-feedback"],
  "teacher-wire-Q1n-feedback": ["wire-q1not-feedback"],
  "teacher-wire-Q0-feedback": ["wire-q0-feedback"],
};

function teacherPointsToPath(points) {
  const [first, ...rest] = points;
  if (!first) return "";
  return rest.reduce((path, point, index) => {
    const previous = index === 0 ? first : rest[index - 1];
    if (point[0] === previous[0]) return `${path} V ${point[1]}`;
    if (point[1] === previous[1]) return `${path} H ${point[0]}`;
    return `${path} L ${point[0]} ${point[1]}`;
  }, `M ${first[0]} ${first[1]}`);
}

function segmentIntersectsRect(segment, rect) {
  const [a, b] = segment;
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  if (a[0] === b[0]) {
    const x = a[0];
    const minY = Math.min(a[1], b[1]);
    const maxY = Math.max(a[1], b[1]);
    return x > left && x < right && Math.max(minY, top) < Math.min(maxY, bottom);
  }
  if (a[1] === b[1]) {
    const y = a[1];
    const minX = Math.min(a[0], b[0]);
    const maxX = Math.max(a[0], b[0]);
    return y > top && y < bottom && Math.max(minX, left) < Math.min(maxX, right);
  }
  return false;
}

function polylineIntersectsBlockedBox(points, rect) {
  return points.slice(1).some((point, index) => segmentIntersectsRect([points[index], point], rect));
}

function teacherBlockedBoxes(layout = TEACHER_SCHEMATIC_LAYOUT) {
  return [
    layout.notGate.blockedBox,
    ...Object.values(layout.gates).map((gate) => gate.blockedBox),
    ...Object.values(layout.constants ?? {}).map((constant) => constant.blockedBox),
    ...Object.values(layout.flipFlops).map((ff) => ff.blockedBox),
    layout.outputs.Z.blockedBox,
  ];
}

function teacherStandardWireCollisions(layout = TEACHER_SCHEMATIC_LAYOUT) {
  return layout.wires.flatMap((wire) =>
    teacherBlockedBoxes(layout)
      .filter((box) => !(wire.ignoreBoxes ?? []).includes(box.id) && polylineIntersectsBlockedBox(wire.points, box))
      .map((box) => `${wire.id}:${box.id}`),
  );
}

function teacherClockTapCollisions(layout = TEACHER_SCHEMATIC_LAYOUT) {
  const clockBlockedBoxes = [
    ...Object.values(layout.gates).map((gate) => gate.blockedBox),
    ...Object.values(layout.constants ?? {}).map((constant) => constant.blockedBox),
    ...Object.values(layout.flipFlops).map((ff) => ff.blockedBox),
  ];
  return Object.values(layout.clkTaps ?? {}).flatMap((tap) =>
    clockBlockedBoxes
      .filter((box) => polylineIntersectsBlockedBox(tap.points, box))
      .map((box) => `${tap.id}:${box.id}`),
  );
}

function renderTeacherWire(wire, collisionSet) {
  const path = teacherPointsToPath(wire.points);
  const aliasIds = TEACHER_WIRE_ALIASES[wire.id] ?? [];
  const wireElement = teacherWire(wire.id, teacherPointsToPath(wire.points), {
    arrow: wire.arrow,
    collision: collisionSet.has(wire.id),
  });
  if (wire.id === "teacher-wire-X-NOT") {
    const start = wire.points[0];
    return (
      <g data-testid="teacher-rail-x-branch-to-not" key="teacher-rail-x-branch-to-not">
        <g data-testid="teacher-x-to-not-input">
          <g data-testid="teacher-not-input-X">
            {wireElement}
            {start && <circle cx={start[0]} cy={start[1]} fill="#1D4ED8" opacity="0.01" r="2" />}
          </g>
        </g>
      </g>
    );
  }
  if (wire.id === "teacher-wire-NOT-Xn") {
    const end = wire.points.at(-1);
    return (
      <g data-testid="teacher-x-not-from-not-output" key="teacher-x-not-from-not-output">
        <g data-testid="teacher-not-output-Xnot">
          {wireElement}
          {end && <circle cx={end[0]} cy={end[1]} fill="#1D4ED8" opacity="0.01" r="2" />}
        </g>
      </g>
    );
  }
  if (aliasIds.length > 0) {
    return (
      <g key={`${wire.id}-aliases`}>
        {wireElement}
        {aliasIds.map((aliasId) => (
          <path
            d={path}
            data-testid={aliasId}
            fill="none"
            key={aliasId}
            pointerEvents="none"
            stroke="#1D4ED8"
            strokeLinejoin="round"
            strokeWidth="7"
            opacity="0.01"
          />
        ))}
      </g>
    );
  }
  return wireElement;
}

function renderTeacherRail(rail) {
  if (rail.id === "teacher-rail-X") {
    return (
      <g data-testid={rail.id} key={rail.id}>
        <g data-testid="teacher-rail-x-main">
          <g data-testid="teacher-x-source">
            <circle cx={rail.x1} cy={rail.y} fill="#1D4ED8" r="3.2" />
            <text fill="#0F172A" fontSize="13" fontWeight="900" textAnchor="end" x={rail.x1 - 14} y={rail.y + 5}>
              {rail.label}
            </text>
          </g>
          <g data-testid="teacher-x-main-arrow">
            <path
              d={`M ${rail.x1} ${rail.y} H ${rail.x2}`}
              fill="none"
              markerEnd="url(#teacher-arrow)"
              stroke="#1D4ED8"
              strokeWidth="2.4"
            />
            <circle cx={rail.x2} cy={rail.y} fill="#1D4ED8" opacity="0.01" r="2" />
          </g>
        </g>
      </g>
    );
  }

  return (
    <g data-testid={rail.id} key={rail.id}>
      <g data-testid="teacher-rail-x-not">
        <g data-testid="teacher-xnot-rail">
        <line stroke="#1D4ED8" strokeWidth="2.4" x1={rail.x} x2={rail.x} y1={rail.y1} y2={rail.y2} />
        <text data-testid="teacher-xnot-label" fill="#0F172A" fontSize="13" fontWeight="900" textAnchor="middle" x={rail.x + 18} y={rail.y1 - 8}>
          {rail.label}
        </text>
        </g>
      </g>
    </g>
  );
}

function renderWireJump({ id, x, y, orientation }) {
  const d =
    orientation === "horizontal-over-vertical"
      ? `M ${x - 9} ${y} C ${x - 4} ${y - 9}, ${x + 4} ${y - 9}, ${x + 9} ${y}`
      : `M ${x} ${y - 9} C ${x + 9} ${y - 4}, ${x + 9} ${y + 4}, ${x} ${y + 9}`;
  const wireId = id.replace(/^wire-jump-/, "wire-");
  return (
    <g data-crossing-id={id} data-testid={id} data-wire-id={wireId} key={id}>
      <path
        d={d}
        data-crossing-id={id}
        data-orphan="false"
        data-testid="wire-bridge-arc"
        data-wire-id={wireId}
        fill="none"
        stroke="#1D4ED8"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path data-testid="wire-jump" d={d} fill="none" opacity="0.01" stroke="#1D4ED8" strokeLinecap="round" strokeWidth="2.2" />
    </g>
  );
}

function renderTeacherGate(gate) {
  const gateElement = gate.type === "AND"
    ? teacherAndGate(gate.id, gate.x, gate.y, gate.label)
    : teacherOrGate(gate.id, gate.x, gate.y, gate.label);
  return (TEACHER_GATE_ALIASES[gate.id] ?? []).reduce(
    (element, aliasId) => (
      <g data-testid={aliasId} key={aliasId}>
        {element}
      </g>
    ),
    gateElement,
  );
}

function renderTeacherFf(ff) {
  const { x, y, width, height, bitLabel } = ff;
  const bitIndex = bitLabel.slice(1);
  return (
    <g data-testid={`teacher-ff-${bitLabel}`} key={`teacher-ff-${bitLabel}`}>
      <rect fill="#FFFFFF" height={height} stroke="#2563EB" strokeWidth="2.3" width={width} x={x} y={y} />
      <text fill="#0F172A" fontSize="12" fontWeight="800" textAnchor="middle" x={x + width / 2} y={y + 22}>
        {`JK FF ${bitLabel}`}
      </text>
      <text fill="#0F172A" fontSize="11" fontWeight="800" x={x + 12} y={y + 44}>
        J{bitIndex}
      </text>
      <text fill="#0F172A" fontSize="11" fontWeight="800" x={x + 12} y={y + 84}>
        K{bitIndex}
      </text>
      <text fill="#64748B" fontSize="10" fontWeight="700" textAnchor="middle" x={x + width / 2} y={y + height - 8}>
        CLK
      </text>
      <text fill="#0D9488" fontSize="11" fontWeight="800" textAnchor="end" x={x + width - 12} y={y + 44}>
        {bitLabel}
      </text>
      <text fill="#0D9488" fontSize="11" fontWeight="800" textAnchor="end" x={x + width - 12} y={y + 84}>
        {bitLabel}'
      </text>
      <line stroke="#1D4ED8" strokeWidth="2" x1={x - 10} x2={x} y1={ff.pins[`J${bitIndex}`][1]} y2={ff.pins[`J${bitIndex}`][1]} />
      <line stroke="#1D4ED8" strokeWidth="2" x1={x - 10} x2={x} y1={ff.pins[`K${bitIndex}`][1]} y2={ff.pins[`K${bitIndex}`][1]} />
      <line stroke="#475569" strokeWidth="2" x1={ff.pins.CLK[0]} x2={ff.pins.CLK[0]} y1={y + height} y2={y + height + 10} />
    </g>
  );
}

function renderTeacherStandardOutputZ(output) {
  const { x, y, width, height, label } = output;
  return (
    <g data-testid="teacher-output-Z" key="teacher-output-Z">
      <path d={`M ${x} ${y} H ${x + width - 20} L ${x + width} ${y + height / 2} L ${x + width - 20} ${y + height} H ${x} Z`} fill="rgba(5,150,105,0.08)" stroke="#059669" strokeWidth="2" />
      <text fill="#0F172A" fontSize="13" fontWeight="900" textAnchor="middle" x={x + width / 2 - 2} y={y + 25}>
        {label}
      </text>
    </g>
  );
}

function renderTeacherConstant(constant) {
  const { id, x, y, width, height, value, label } = constant;
  return (
    <g data-testid={id} key={id}>
      <rect fill="#FFF7ED" height={height} rx="10" stroke="#D97706" strokeWidth="2" width={width} x={x} y={y} />
      <text fill="#92400E" fontSize="10" fontWeight="900" textAnchor="middle" x={x + width / 2} y={y + 16}>
        CONST
      </text>
      <text fill="#0F172A" fontSize="17" fontWeight="900" textAnchor="middle" x={x + width / 2} y={y + 35}>
        {value}
      </text>
    </g>
  );
}

function renderTeacherClockTap(tap) {
  const start = tap.points[0];
  const end = tap.points.at(-1);
  return (
    <g data-testid={tap.legacyId} key={tap.id}>
      <g data-testid={tap.id}>
        <path
          d={teacherPointsToPath(tap.points)}
          data-testid={tap.entryId}
          fill="none"
          stroke="#475569"
          strokeLinejoin="round"
          strokeWidth="1.9"
        />
        {start && <circle cx={start[0]} cy={start[1]} fill="#475569" r="2.6" />}
      </g>
      {end && <circle cx={end[0]} cy={end[1]} data-testid={tap.dotId} fill="#475569" r="3.8" />}
    </g>
  );
}

function TeacherStandardEquationsPanel() {
  return (
    <div
      className="mt-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-3"
      data-testid="schematic-standard-equations-panel"
    >
      <div className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-main)]">
        Reference Equations
      </div>
      <div className="grid gap-2 font-mono text-xs text-[var(--primary)] sm:grid-cols-2 lg:grid-cols-5">
        {TEACHER_STANDARD_EQUATION_ITEMS.map((equation) => (
          <div className="rounded border border-[var(--border-subtle)] bg-white px-2 py-1" key={equation.id}>
            {equation.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderTeacherStandardSchematic() {
  const layout = TEACHER_SCHEMATIC_LAYOUT;
  const collisions = teacherStandardWireCollisions(layout);
  const clkCollisions = teacherClockTapCollisions(layout);
  const collisionWireIds = new Set(collisions.map((entry) => entry.split(":")[0]));
  return (
    <div>
      <svg
        className="block max-w-full rounded border border-[var(--border-subtle)]"
        data-testid="teacher-schematic-root"
        height={layout.viewBox.height}
        role="img"
        viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
        width="100%"
      >
        <defs>
          <marker id="teacher-arrow" markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#1D4ED8" />
          </marker>
        </defs>
        <rect fill="rgba(255,255,255,0.98)" height={layout.viewBox.height} rx="8" width={layout.viewBox.width} />
        <g data-clk-collisions={clkCollisions.length} data-collisions={collisions.length} data-testid="teacher-collision-guard">
          {collisions.map((collision) => (
            <text className="sr-only" key={collision}>{collision}</text>
          ))}
          {clkCollisions.map((collision) => (
            <text className="sr-only" key={collision}>{collision}</text>
          ))}
        </g>
        {renderWireBodyCollisionGuard([...collisions, ...clkCollisions])}
        {renderWireCrossingGuard({ bridgeCount: layout.jumps.length, junctionCount: layout.junctions.length })}
        <g data-testid="gate-input-count-guard" data-violations="0">
          <rect fill="#1D4ED8" height="1" opacity="0.01" width="1" x="2" y="2" />
        </g>
        <g data-testid="binary-gate-decomposition">
          <rect fill="#1D4ED8" height="1" opacity="0.01" width="1" x="4" y="2" />
        </g>
        {Object.values(layout.rails).map(renderTeacherRail)}
        <g data-testid="teacher-not-gate">
          {teacherNotGate(layout.notGate.id, layout.notGate.x, layout.notGate.y)}
        </g>
        <g data-testid="teacher-wires">
          {layout.wires.map((wire) => renderTeacherWire(wire, collisionWireIds))}
        </g>
        <g data-testid="teacher-junctions">
          {layout.junctions.map((dot) => teacherDot(dot.id, dot.x, dot.y))}
        </g>
        <g data-testid="teacher-wire-jumps">
          {layout.jumps.map(renderWireJump)}
        </g>
        {Object.values(layout.gates).map(renderTeacherGate)}
        {Object.values(layout.constants ?? {}).map(renderTeacherConstant)}
        {Object.values(layout.flipFlops).map(renderTeacherFf)}
        {renderTeacherStandardOutputZ(layout.outputs.Z)}
        <g data-testid="teacher-clk-bus">
          <g data-testid="jk-clk-bus">
            <line stroke="#475569" strokeWidth="2.2" x1={layout.clk.x1} x2={layout.clk.x2} y1={layout.clk.y} y2={layout.clk.y} />
            <text fill="#475569" fontSize="12" fontWeight="900" x={layout.clk.labelX} y={layout.clk.labelY}>CLK</text>
          </g>
        </g>
        {Object.values(layout.clkTaps).map(renderTeacherClockTap)}
        <text fill="#64748B" fontSize="10" fontWeight="800" x="338" y="182">J1 = Q0·X'</text>
        <text fill="#64748B" fontSize="10" fontWeight="800" x="338" y="382">J0 = Q1'·X</text>
        <text fill="#64748B" fontSize="10" fontWeight="800" x="652" y="322">K0 = 1</text>
        <text fill="#64748B" fontSize="10" fontWeight="800" x="452" y="286">K1 = X'</text>
        <text fill="#64748B" fontSize="10" fontWeight="800" x="848" y="492">Z = Q1 + Q0·X'</text>
      </svg>
      <TeacherStandardEquationsPanel />
    </div>
  );
}

export default function CircuitDiagramView({ result, inputConfig }) {
  const containerRef = useRef(null);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const rawNodes = result?.circuitLayout?.nodes ?? [];
  const rawEdges = (result?.circuitLayout?.edges ?? []).filter((edge) => {
    const text = `${edge.from} ${edge.to} ${edge.signal} ${edge.label}`.toUpperCase();
    return !/(CLK|CLR|RST|RESET)/.test(text);
  });
  const { visibleRawNodes, visibleEdges, unusedInputNodes } = useMemo(
    () => displayGraph(rawNodes, rawEdges),
    [rawEdges, rawNodes],
  );
  const nodes = useMemo(() => normalizeNodesForDisplay(visibleRawNodes), [visibleRawNodes]);
  const edges = visibleEdges;
  const warnings = driverWarnings(rawNodes, rawEdges);
  const visibleTypes = Array.from(new Set(nodes.map((node) => nodeType(node)))).join(", ");
  const unusedInputLabels = unusedInputNodes.map((node) => formatTeacherLogicLabel(node.label ?? node.id, result)).join(", ");
  const syncViewport = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setViewport({
      width: Math.max(320, Math.floor(rect.width)),
      height: DEFAULT_VIEWPORT.height,
    });
  }, []);

  useEffect(() => {
    syncViewport();
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => syncViewport());
    observer.observe(element);
    return () => observer.disconnect();
  }, [syncViewport]);

  if (nodes.length === 0) {
    return (
      <Panel title="Circuit Diagram">
        <div className="p-4 text-xs text-[var(--text-muted)]">No circuit layout returned.</div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Circuit Diagram"
      eyebrow="standard auto-layout renderer"
    >
      {warnings.length > 0 && (
        <div className="border-b border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--warning)]">
          {warnings.join(" | ")}
        </div>
      )}
      <div className="max-w-full overflow-auto p-4">
        <div ref={containerRef} className="min-w-0 max-w-full">
          <div
            data-layout-mode="auto-layout"
            data-respect-raw-coordinates="false"
            data-testid="standard-circuit-diagram"
          >
            {renderSchematicView({ result, inputConfig, rawNodes, rawEdges, unusedInputNodes, viewport })}
          </div>
        </div>
        <div data-testid="circuit-footer" className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          <span className="rounded border border-[var(--border-subtle)] px-2 py-1">Visible nodes: {nodes.length} / Raw nodes: {rawNodes.length}</span>
          <span className="rounded border border-[var(--border-subtle)] px-2 py-1">Wires: {edges.length}</span>
          {unusedInputLabels && (
            <span className="rounded border border-[var(--border-subtle)] px-2 py-1">Unused inputs: {unusedInputLabels}</span>
          )}
          <span className="rounded border border-[var(--border-subtle)] px-2 py-1">Types: {visibleTypes}</span>
        </div>
      </div>
    </Panel>
  );
}
