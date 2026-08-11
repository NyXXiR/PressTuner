import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";

export const PRESS_AI_SCENARIO_NODES = Object.freeze(
  pressCreationProcess.nodes.map(({ id, label, sequence }) =>
    Object.freeze({ id, label, sequence }),
  ),
);

export type PressAiScenarioNodeId =
  (typeof PRESS_AI_SCENARIO_NODES)[number]["id"];
export type PressAiScenarioNodeState =
  | "waiting"
  | "active"
  | "failed"
  | "completed";

export type PressAiScenarioState = Readonly<{
  currentNodeId: PressAiScenarioNodeId | null;
  completedNodeIds: readonly PressAiScenarioNodeId[];
  failedNodeId: PressAiScenarioNodeId | null;
  failureOpen: boolean;
  launchDate: string;
  draftAttempts: number;
  reviewRuns: number;
  reviewLoopRecorded: boolean;
  isComplete: boolean;
  statusMessage: string;
}>;

export type PressAiScenarioAction =
  | Readonly<{ type: "run_node"; nodeId: PressAiScenarioNodeId }>
  | Readonly<{ type: "open_failure" }>
  | Readonly<{ type: "set_launch_date"; value: string }>
  | Readonly<{ type: "retry_draft" }>
  | Readonly<{ type: "reset" }>;

export const PRESS_AI_SCENARIO_FIXTURE = Object.freeze({
  memo: "모노랩이 팀 협업 서비스 브리지를 출시합니다. 고객 베타 만족도는 92%입니다.",
  normalizedBrief:
    "모노랩은 팀 협업 서비스 브리지를 출시하며, 고객 베타 만족도 92%를 핵심 근거로 소개합니다.",
  draftTitle: "모노랩, 팀 협업 서비스 ‘브리지’ 출시",
  reviewNote: "제목에 출시일을 반영하고 첫 문단의 핵심 수치를 더 선명하게 제시합니다.",
  finalTitle: "모노랩, 9월 18일 팀 협업 서비스 ‘브리지’ 출시",
  failureMessage: "출시일이 비어 있어 초안을 생성할 수 없습니다.",
  launchDateHint: "검증용 날짜는 2026-09-18입니다.",
});

const INITIAL_NODE_ID = PRESS_AI_SCENARIO_NODES[0].id;
const INITIALIZATION_ID = PRESS_AI_SCENARIO_NODES[0].id;
const NORMALIZATION_ID = PRESS_AI_SCENARIO_NODES[1].id;
const DRAFT_ID = PRESS_AI_SCENARIO_NODES[2].id;
const REVIEW_ID = PRESS_AI_SCENARIO_NODES[3].id;
const REWRITE_ID = PRESS_AI_SCENARIO_NODES[4].id;

function freezeState(
  state: Omit<PressAiScenarioState, "completedNodeIds"> & {
    completedNodeIds: readonly PressAiScenarioNodeId[];
  },
): PressAiScenarioState {
  return Object.freeze({
    ...state,
    completedNodeIds: Object.freeze([...state.completedNodeIds]),
  });
}

export function createInitialPressAiScenarioState(): PressAiScenarioState {
  return freezeState({
    currentNodeId: INITIAL_NODE_ID,
    completedNodeIds: [],
    failedNodeId: null,
    failureOpen: false,
    launchDate: "",
    draftAttempts: 0,
    reviewRuns: 0,
    reviewLoopRecorded: false,
    isComplete: false,
    statusMessage: "문서 초기화부터 한 단계씩 실행할 수 있습니다.",
  });
}

export function isValidScenarioLaunchDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getPressAiScenarioNodeState(
  state: PressAiScenarioState,
  nodeId: PressAiScenarioNodeId,
): PressAiScenarioNodeState {
  if (state.completedNodeIds.includes(nodeId)) return "completed";
  if (state.failedNodeId === nodeId) return "failed";
  if (state.currentNodeId === nodeId) return "active";
  return "waiting";
}

function completeAndAdvance(
  state: PressAiScenarioState,
  completedNodeId: PressAiScenarioNodeId,
  nextNodeId: PressAiScenarioNodeId,
  statusMessage: string,
): PressAiScenarioState {
  return freezeState({
    ...state,
    completedNodeIds: [...state.completedNodeIds, completedNodeId],
    currentNodeId: nextNodeId,
    statusMessage,
  });
}

export function pressAiScenarioReducer(
  state: PressAiScenarioState,
  action: PressAiScenarioAction,
): PressAiScenarioState {
  if (action.type === "reset") return createInitialPressAiScenarioState();

  if (action.type === "open_failure") {
    if (state.failedNodeId !== DRAFT_ID || state.failureOpen) return state;
    return freezeState({
      ...state,
      failureOpen: true,
      statusMessage: "실패 내용을 열었습니다. 출시일을 입력한 뒤 명시적으로 다시 시도하세요.",
    });
  }

  if (action.type === "set_launch_date") {
    if (state.failedNodeId !== DRAFT_ID) return state;
    return freezeState({
      ...state,
      launchDate: action.value,
      statusMessage: isValidScenarioLaunchDate(action.value)
        ? "출시일 입력이 유효합니다. 다시 시도할 준비가 되었습니다."
        : "유효한 출시일을 입력해야 다시 시도할 수 있습니다.",
    });
  }

  if (action.type === "retry_draft") {
    if (
      state.failedNodeId !== DRAFT_ID ||
      state.draftAttempts !== 1 ||
      !isValidScenarioLaunchDate(state.launchDate)
    ) {
      return state;
    }
    return freezeState({
      ...state,
      currentNodeId: REVIEW_ID,
      completedNodeIds: [...state.completedNodeIds, DRAFT_ID],
      failedNodeId: null,
      failureOpen: false,
      draftAttempts: 2,
      statusMessage: "수정한 메모로 초안 생성에 성공했습니다. 초안 리뷰를 실행하세요.",
    });
  }

  if (action.type !== "run_node" || action.nodeId !== state.currentNodeId) {
    return state;
  }

  if (action.nodeId === INITIALIZATION_ID) {
    return completeAndAdvance(
      state,
      INITIALIZATION_ID,
      NORMALIZATION_ID,
      "문서 초기화를 완료했습니다. 메모 정규화를 실행하세요.",
    );
  }

  if (action.nodeId === NORMALIZATION_ID) {
    return completeAndAdvance(
      state,
      NORMALIZATION_ID,
      DRAFT_ID,
      "메모 정규화를 완료했습니다. 초안 생성을 실행하세요.",
    );
  }

  if (action.nodeId === DRAFT_ID && state.draftAttempts === 0) {
    return freezeState({
      ...state,
      failedNodeId: DRAFT_ID,
      failureOpen: false,
      draftAttempts: 1,
      statusMessage: PRESS_AI_SCENARIO_FIXTURE.failureMessage,
    });
  }

  if (action.nodeId === REVIEW_ID && state.reviewRuns === 0) {
    return freezeState({
      ...state,
      reviewRuns: 1,
      statusMessage: "초안 리뷰를 1회 실행했습니다. 리뷰 노트를 확인하고 한 번 더 실행하세요.",
    });
  }

  if (action.nodeId === REVIEW_ID && state.reviewRuns === 1) {
    return freezeState({
      ...state,
      currentNodeId: REWRITE_ID,
      completedNodeIds: [...state.completedNodeIds, REVIEW_ID],
      reviewRuns: 2,
      reviewLoopRecorded: true,
      statusMessage: "초안 리뷰를 2회 실행했습니다. 반복 이력을 기록하고 선택 수정을 활성화했습니다.",
    });
  }

  if (action.nodeId === REWRITE_ID) {
    return freezeState({
      ...state,
      currentNodeId: null,
      completedNodeIds: [...state.completedNodeIds, REWRITE_ID],
      isComplete: true,
      statusMessage: "선택 수정을 완료했습니다. 전체 시나리오가 완료되었습니다.",
    });
  }

  return state;
}
