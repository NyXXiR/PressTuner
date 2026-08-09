import assert from "node:assert/strict";
import { z } from "zod";
import test from "node:test";
import {
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  layoutPressAiGraph,
} from "./pressAiGraphLayout";
import {
  pressCreationProcess,
  ragQueryProcess,
} from "@/domain/press-ai-debugger/processRegistry";

test("a linear process lays out as one row of columns", () => {
  const layout = layoutPressAiGraph(pressCreationProcess);
  assert.equal(layout.nodes.length, pressCreationProcess.nodes.length);
  assert.equal(layout.edges.length, pressCreationProcess.edges.length);
  const ys = new Set(layout.nodes.map((item) => item.y));
  assert.equal(ys.size, 1, "linear chain should not stack rows");
  const xs = layout.nodes.map((item) => item.x).sort((a, b) => a - b);
  assert.equal(new Set(xs).size, layout.nodes.length, "each node its own column");
  // The registered loop reserves one compact return-connector band.
  assert.ok(layout.height < GRAPH_NODE_HEIGHT * 3);
  assert.match(layout.edges.find((item) => item.edge.id === "rewrite-review")?.path ?? "", / C /);
});

test("a skip edge keeps the merge node past the longer branch", () => {
  const layout = layoutPressAiGraph(ragQueryProcess);
  const byId = new Map(layout.nodes.map((item) => [item.node.id, item]));
  const terminal = byId.get("terminal-evaluation");
  const fallback = byId.get("fallback");
  const verification = byId.get("verification");
  assert.ok(terminal && fallback && verification);
  // verification reaches terminal-evaluation directly and through fallback.
  assert.ok(fallback.x > verification.x, "branch target sits to the right");
  assert.ok(
    terminal.x > fallback.x,
    "the merge node sits past every path that feeds it",
  );
  assert.equal(layout.edges.length, ragQueryProcess.edges.length);
});

test("a same-depth fan-out stacks the siblings in one column", () => {
  const node = (id: string, sequence: number) => ({
    id,
    sequence,
    label: id,
    description: id,
    troubleshooting: id,
    operation: id,
    operationKey: id,
    inputSchema: z.unknown(),
    outputSchema: z.unknown(),
    metricIds: [],
    findingIds: [],
  });
  const edge = (id: string, source: string, target: string, sequence: number) => ({
    id,
    sequence,
    source,
    target,
    payload: [],
    mandatoryGuardrailIds: [],
  });
  const branching = {
    id: "press-creation" as const,
    version: "test",
    label: "분기 테스트",
    description: "a가 b와 c로 갈라지는 그래프",
    nodes: [node("a", 0), node("b", 1), node("c", 2)],
    edges: [edge("a-b", "a", "b", 0), edge("a-c", "a", "c", 1)],
  };
  const layout = layoutPressAiGraph(branching);
  const byId = new Map(layout.nodes.map((item) => [item.node.id, item]));
  const b = byId.get("b");
  const c = byId.get("c");
  assert.ok(b && c);
  assert.equal(b.x, c.x, "siblings share a column");
  assert.notEqual(b.y, c.y, "siblings must not overlap");
  assert.ok(
    Math.abs(b.y - c.y) >= GRAPH_NODE_HEIGHT,
    "stacked siblings need clearance",
  );
  assert.ok(layout.height > GRAPH_NODE_HEIGHT * 2, "fan-out needs vertical room");
});

test("no two nodes occupy the same slot", () => {
  for (const process of [pressCreationProcess, ragQueryProcess]) {
    const layout = layoutPressAiGraph(process);
    const slots = layout.nodes.map((item) => `${item.x}:${item.y}`);
    assert.equal(new Set(slots).size, slots.length, `${process.id} overlaps`);
    for (const item of layout.nodes) {
      assert.ok(item.x + GRAPH_NODE_WIDTH <= layout.width);
      assert.ok(item.y + GRAPH_NODE_HEIGHT <= layout.height);
    }
  }
});
