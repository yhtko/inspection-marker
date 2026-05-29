import { useCallback, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  type ReactFlowJsonObject
} from "@xyflow/react";
import { toPng } from "html-to-image";
import "@xyflow/react/dist/style.css";

type Shape = "process" | "terminator" | "decision";

type Lane = {
  id: string;
  name: string;
  y: number;
  height: number;
  color: string;
};

type FlowNodeData = {
  label: string;
  shape: Shape;
  laneId?: string;
};

type LaneNodeData = {
  name: string;
  color: string;
  width: number;
  height: number;
};

type AppNode = Node<FlowNodeData> | Node<LaneNodeData>;
type AppEdge = Edge<{ label?: string }>;

type ProjectFile = {
  version: 1;
  lanes: Lane[];
  nodes: Node<FlowNodeData>[];
  edges: AppEdge[];
  viewport?: ReactFlowJsonObject["viewport"];
};

const laneWidth = 3600;
const laneX = -260;
const laneGap = 14;
const defaultLaneHeight = 150;
const nodeWidth = 156;
const nodeHeight = 58;
const laneColors = ["#eef6ff", "#f0fdf4", "#fff7ed", "#fdf2f8", "#f8fafc", "#fefce8"];

const initialLanes: Lane[] = [
  { id: "lane-1", name: "Sales", y: 0, height: defaultLaneHeight, color: laneColors[0] },
  { id: "lane-2", name: "Engineering", y: defaultLaneHeight + laneGap, height: defaultLaneHeight, color: laneColors[1] },
  { id: "lane-3", name: "Quality", y: (defaultLaneHeight + laneGap) * 2, height: defaultLaneHeight, color: laneColors[2] }
];

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function laneToNode(lane: Lane): Node<LaneNodeData> {
  return {
    id: lane.id,
    type: "lane",
    position: { x: laneX, y: lane.y },
    data: { name: lane.name, color: lane.color, width: laneWidth, height: lane.height },
    draggable: false,
    selectable: false,
    connectable: false,
    deletable: false,
    zIndex: -10
  };
}

function getLaneAtY(lanes: Lane[], y: number) {
  return lanes.find((lane) => y >= lane.y && y <= lane.y + lane.height) ?? lanes[lanes.length - 1] ?? null;
}

function buildLaneNodes(lanes: Lane[]) {
  return lanes.map(laneToNode);
}

function normalizeLanes(lanes: Lane[], flowNodes: Node<FlowNodeData>[]) {
  const heights = new Map(lanes.map((lane) => [lane.id, defaultLaneHeight]));
  for (const node of flowNodes) {
    const lane = lanes.find((entry) => entry.id === node.data.laneId) ?? getLaneAtY(lanes, node.position.y + nodeHeight / 2);
    if (!lane) continue;
    const bottomInLane = node.position.y - lane.y + nodeHeight + 44;
    heights.set(lane.id, Math.max(heights.get(lane.id) ?? defaultLaneHeight, bottomInLane));
  }

  let y = 0;
  return lanes.map((lane) => {
    const height = Math.max(defaultLaneHeight, Math.ceil(heights.get(lane.id) ?? lane.height));
    const nextLane = { ...lane, y, height };
    y += height + laneGap;
    return nextLane;
  });
}

function applyLaneShifts(oldLanes: Lane[], nextLanes: Lane[], flowNodes: Node<FlowNodeData>[]) {
  const oldMap = new Map(oldLanes.map((lane) => [lane.id, lane]));
  const nextMap = new Map(nextLanes.map((lane) => [lane.id, lane]));
  return flowNodes.map((node) => {
    const laneId = node.data.laneId;
    if (!laneId) return node;
    const oldLane = oldMap.get(laneId);
    const nextLane = nextMap.get(laneId);
    if (!oldLane || !nextLane) return node;
    return { ...node, position: { ...node.position, y: node.position.y + nextLane.y - oldLane.y } };
  });
}

function assignLaneIds(lanes: Lane[], flowNodes: Node<FlowNodeData>[]) {
  return flowNodes.map((node) => {
    const lane = getLaneAtY(lanes, node.position.y + nodeHeight / 2);
    return lane ? { ...node, data: { ...node.data, laneId: lane.id } } : node;
  });
}

function FlowShapeNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`flow-node flow-node-${data.shape} ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {data.shape === "decision" ? (
        <div className="decision-content">{data.label}</div>
      ) : (
        <div className="node-content">{data.label}</div>
      )}
    </div>
  );
}

function LaneNode({ data }: NodeProps<Node<LaneNodeData>>) {
  return (
    <div className="lane-node" style={{ width: data.width, height: data.height, background: data.color }}>
      <div className="lane-title">{data.name}</div>
    </div>
  );
}

const nodeTypes = {
  flow: FlowShapeNode,
  lane: LaneNode
};

function App() {
  const [lanes, setLanes] = useState<Lane[]>(initialLanes);
  const [flowNodes, setFlowNodes] = useState<Node<FlowNodeData>[]>([]);
  const [edges, setEdges] = useState<AppEdge[]>([]);
  const [selectedShape, setSelectedShape] = useState<Shape>("process");
  const [selectedLaneId, setSelectedLaneId] = useState(initialLanes[0].id);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance<AppNode, AppEdge> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const loadInputRef = useRef<HTMLInputElement | null>(null);

  const nodes = useMemo<AppNode[]>(() => [...buildLaneNodes(lanes), ...flowNodes], [lanes, flowNodes]);

  const updateLayout = useCallback((nextLanes: Lane[], nextNodes: Node<FlowNodeData>[]) => {
    const assignedNodes = assignLaneIds(nextLanes, nextNodes);
    const normalizedLanes = normalizeLanes(nextLanes, assignedNodes);
    const shiftedNodes = applyLaneShifts(nextLanes, normalizedLanes, assignedNodes);
    setLanes(normalizedLanes);
    setFlowNodes(shiftedNodes);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    const flowChanges = changes.filter((change) => !("id" in change) || !lanes.some((lane) => lane.id === change.id)) as NodeChange<Node<FlowNodeData>>[];
    setFlowNodes((current) => {
      const changed = applyNodeChanges(flowChanges, current);
      const assigned = assignLaneIds(lanes, changed);
      const normalized = normalizeLanes(lanes, assigned);
      const shifted = applyLaneShifts(lanes, normalized, assigned);
      setLanes(normalized);
      return shifted;
    });
  }, [lanes]);

  const onEdgesChange = useCallback((changes: EdgeChange<AppEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({
      ...connection,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {},
      label: ""
    }, current));
  }, []);

  const addLane = () => {
    const last = lanes[lanes.length - 1];
    const lane: Lane = {
      id: makeId("lane"),
      name: `Lane ${lanes.length + 1}`,
      y: last ? last.y + last.height + laneGap : 0,
      height: defaultLaneHeight,
      color: laneColors[lanes.length % laneColors.length]
    };
    setLanes((current) => [...current, lane]);
    setSelectedLaneId(lane.id);
  };

  const updateLane = (id: string, patch: Partial<Lane>) => {
    setLanes((current) => current.map((lane) => lane.id === id ? { ...lane, ...patch } : lane));
  };

  const deleteLane = (id: string) => {
    if (lanes.length <= 1) return;
    const nextLanes = lanes.filter((lane) => lane.id !== id);
    const nextNodes = flowNodes.filter((node) => node.data.laneId !== id);
    const normalized = normalizeLanes(nextLanes, nextNodes);
    setLanes(normalized);
    setFlowNodes(assignLaneIds(normalized, nextNodes));
    setEdges((current) => current.filter((edge) => nextNodes.some((node) => node.id === edge.source) && nextNodes.some((node) => node.id === edge.target)));
    setSelectedLaneId(normalized[0].id);
  };

  const moveLane = (id: string, direction: -1 | 1) => {
    const index = lanes.findIndex((lane) => lane.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= lanes.length) return;
    const reordered = [...lanes];
    const [lane] = reordered.splice(index, 1);
    reordered.splice(target, 0, lane);
    const normalized = normalizeLanes(reordered, flowNodes);
    setLanes(normalized);
    setFlowNodes(applyLaneShifts(lanes, normalized, flowNodes));
  };

  const addNodeAt = (x: number, y: number) => {
    const lane = getLaneAtY(lanes, y);
    if (!lane) return;
    const node: Node<FlowNodeData> = {
      id: makeId("node"),
      type: "flow",
      position: { x: x - nodeWidth / 2, y: y - nodeHeight / 2 },
      data: {
        label: selectedShape === "decision" ? "Decision?" : selectedShape === "terminator" ? "Start / End" : "Process",
        shape: selectedShape,
        laneId: lane.id
      },
      zIndex: 1
    };
    updateLayout(lanes, [...flowNodes, node]);
  };

  const onPaneClick = (event: React.MouseEvent) => {
    if (!reactFlow) return;
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNodeAt(position.x, position.y);
  };

  const editNodeLabel = (node: Node) => {
    if (node.type !== "flow") return;
    const label = window.prompt("工程名を入力してください", String(node.data.label ?? ""));
    if (label === null) return;
    setFlowNodes((current) => current.map((entry) => entry.id === node.id ? { ...entry, data: { ...entry.data, label } } : entry));
  };

  const editEdgeLabel = (edge: AppEdge) => {
    const label = window.prompt("接続線ラベルを入力してください", edge.label ? String(edge.label) : "");
    if (label === null) return;
    setEdges((current) => current.map((entry) => entry.id === edge.id ? { ...entry, label, data: { ...entry.data, label } } : entry));
  };

  const deleteSelection = () => {
    if (selectedNodeId) {
      setFlowNodes((current) => current.filter((node) => node.id !== selectedNodeId));
      setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
      setSelectedNodeId(null);
    }
    if (selectedEdgeId) {
      setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  };

  const saveJson = () => {
    const project: ProjectFile = {
      version: 1,
      lanes,
      nodes: flowNodes,
      edges,
      viewport: reactFlow?.toObject().viewport
    };
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), "swimlane-flowchart.json");
  };

  const loadJson = async (file: File) => {
    const text = await file.text();
    const project = JSON.parse(text) as ProjectFile;
    if (!Array.isArray(project.lanes) || !Array.isArray(project.nodes) || !Array.isArray(project.edges)) {
      window.alert("JSON形式が正しくありません。");
      return;
    }
    const normalized = normalizeLanes(project.lanes, project.nodes);
    setLanes(normalized);
    setFlowNodes(assignLaneIds(normalized, project.nodes));
    setEdges(project.edges);
    setSelectedLaneId(normalized[0]?.id ?? "");
    window.requestAnimationFrame(() => {
      if (project.viewport) reactFlow?.setViewport(project.viewport);
    });
  };

  const exportPng = async () => {
    if (!wrapperRef.current) return;
    const dataUrl = await toPng(wrapperRef.current, {
      backgroundColor: "#f8fafc",
      pixelRatio: 2,
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains("react-flow__controls"))
    });
    const response = await fetch(dataUrl);
    downloadBlob(await response.blob(), "swimlane-flowchart.png");
  };

  const exportSvg = () => {
    const width = Math.max(1200, Math.max(...flowNodes.map((node) => node.position.x + 260), 1000));
    const height = Math.max(800, Math.max(...lanes.map((lane) => lane.y + lane.height), 600));
    const nodeMarkup = flowNodes.map((node) => {
      const x = node.position.x;
      const y = node.position.y;
      const label = escapeXml(node.data.label);
      if (node.data.shape === "decision") {
        const cx = x + nodeWidth / 2;
        const cy = y + nodeHeight / 2;
        const points = `${cx},${y} ${x + nodeWidth},${cy} ${cx},${y + nodeHeight} ${x},${cy}`;
        return `<polygon points="${points}" fill="#fff" stroke="#334155" stroke-width="1.5"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13">${label}</text>`;
      }
      const radius = node.data.shape === "terminator" ? 18 : 4;
      return `<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${radius}" fill="#fff" stroke="#334155" stroke-width="1.5"/><text x="${x + nodeWidth / 2}" y="${y + nodeHeight / 2 + 4}" text-anchor="middle" font-size="13">${label}</text>`;
    }).join("");
    const laneMarkup = lanes.map((lane) => `<rect x="0" y="${lane.y}" width="${width}" height="${lane.height}" fill="${lane.color}" stroke="#cbd5e1"/><text x="16" y="${lane.y + 28}" font-size="14" font-weight="700">${escapeXml(lane.name)}</text>`).join("");
    const edgeMarkup = edges.map((edge) => {
      const source = flowNodes.find((node) => node.id === edge.source);
      const target = flowNodes.find((node) => node.id === edge.target);
      if (!source || !target) return "";
      const x1 = source.position.x + nodeWidth;
      const y1 = source.position.y + nodeHeight / 2;
      const x2 = target.position.x;
      const y2 = target.position.y + nodeHeight / 2;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const label = edge.label ? `<text x="${midX}" y="${midY - 8}" text-anchor="middle" font-size="12">${escapeXml(String(edge.label))}</text>` : "";
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#334155" stroke-width="1.5" marker-end="url(#arrow)"/>${label}`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#334155"/></marker></defs><rect width="100%" height="100%" fill="#fff"/>${laneMarkup}${edgeMarkup}${nodeMarkup}</svg>`;
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "swimlane-flowchart.svg");
  };

  return (
    <div className="h-screen w-screen bg-slate-100 text-slate-900">
      <div className="grid h-full grid-cols-[280px_minmax(0,1fr)]">
        <aside className="overflow-auto border-r border-slate-300 bg-white p-3">
          <div className="mb-3 text-lg font-bold">Swimlane Flow</div>
          <button className="mb-3 w-full rounded border border-blue-600 bg-blue-600 px-3 py-2 font-semibold text-white" onClick={addLane}>レーン追加</button>

          <div className="space-y-2">
            {lanes.map((lane, index) => (
              <div key={lane.id} className={`rounded border p-2 ${lane.id === selectedLaneId ? "border-blue-500 bg-blue-50" : "border-slate-200"}`} onClick={() => setSelectedLaneId(lane.id)}>
                <input
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm font-semibold"
                  value={lane.name}
                  onChange={(event) => updateLane(lane.id, { name: event.target.value })}
                  onDoubleClick={(event) => event.currentTarget.select()}
                />
                <div className="mb-2 grid grid-cols-6 gap-1">
                  {laneColors.map((color) => (
                    <button key={color} className="h-6 rounded border border-slate-300" style={{ background: color }} onClick={() => updateLane(lane.id, { color })} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button className="rounded border px-2 py-1 text-sm" disabled={index === 0} onClick={() => moveLane(lane.id, -1)}>上</button>
                  <button className="rounded border px-2 py-1 text-sm" disabled={index === lanes.length - 1} onClick={() => moveLane(lane.id, 1)}>下</button>
                  <button className="rounded border border-red-300 px-2 py-1 text-sm text-red-700" disabled={lanes.length <= 1} onClick={() => deleteLane(lane.id)}>削除</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-2 text-sm font-bold text-slate-600">図形</div>
            <div className="grid grid-cols-1 gap-2">
              {([
                ["process", "長方形 / 通常工程"],
                ["terminator", "角丸 / 開始・終了"],
                ["decision", "ひし形 / 判断"]
              ] as const).map(([shape, label]) => (
                <button key={shape} className={`rounded border px-3 py-2 text-left text-sm ${selectedShape === shape ? "border-blue-600 bg-blue-50 font-bold text-blue-700" : "border-slate-300 bg-white"}`} onClick={() => setSelectedShape(shape)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            レーン内クリックでノード追加。ノードや線はダブルクリックで文字編集。Deleteキーで選択削除。
          </div>
        </aside>

        <main className="grid min-w-0 grid-rows-[48px_minmax(0,1fr)]">
          <div className="flex items-center justify-end gap-2 border-b border-slate-300 bg-white px-3">
            <button className="rounded border px-3 py-1.5 text-sm" onClick={saveJson}>JSON保存</button>
            <button className="rounded border px-3 py-1.5 text-sm" onClick={() => loadInputRef.current?.click()}>JSONロード</button>
            <button className="rounded border px-3 py-1.5 text-sm" onClick={exportPng}>PNG出力</button>
            <button className="rounded border px-3 py-1.5 text-sm" onClick={exportSvg}>SVG出力</button>
            <input ref={loadInputRef} hidden type="file" accept="application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadJson(file);
            }} />
          </div>

          <div ref={wrapperRef} className="relative min-h-0 bg-slate-50">
            <ReactFlow<AppNode, AppEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onInit={setReactFlow}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onPaneClick={onPaneClick}
              onNodeDoubleClick={(_, node) => editNodeLabel(node)}
              onEdgeDoubleClick={(_, edge) => editEdgeLabel(edge)}
              onNodeClick={(_, node) => {
                if (node.type === "flow") {
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId(null);
                }
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Delete") deleteSelection();
              }}
              onNodeContextMenu={(event, node) => {
                event.preventDefault();
                if (node.type === "flow" && window.confirm("このノードを削除しますか？")) {
                  setFlowNodes((current) => current.filter((entry) => entry.id !== node.id));
                  setEdges((current) => current.filter((edge) => edge.source !== node.id && edge.target !== node.id));
                }
              }}
              onEdgeContextMenu={(event, edge) => {
                event.preventDefault();
                if (window.confirm("この接続線を削除しますか？")) {
                  setEdges((current) => current.filter((entry) => entry.id !== edge.id));
                }
              }}
              fitView
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
            >
              <Background gap={24} size={1} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          </div>
        </main>
      </div>
    </div>
  );
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function SwimlaneFlowchartApp() {
  return (
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  );
}

export default SwimlaneFlowchartApp;
