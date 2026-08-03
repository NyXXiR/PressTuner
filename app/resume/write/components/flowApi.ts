"use client";

import { createResumeWriteFlowApiClient } from "@/lib/resume/resumeWriteFlowApiClient";

export * from "@/lib/resume/resumeWriteFlowApiClient";

export const resumeWriteFlowApi = createResumeWriteFlowApiClient();

export const organizeIntake = resumeWriteFlowApi.organizeIntake;
export const loadUserBricks = resumeWriteFlowApi.loadUserBricks;
export const startWorkspace = resumeWriteFlowApi.startWorkspace;
export const generateDraft = resumeWriteFlowApi.generateDraft;
export const requestRevision = resumeWriteFlowApi.requestRevision;
export const saveQuestionAnswer = resumeWriteFlowApi.saveQuestionAnswer;
export const readGrounding = resumeWriteFlowApi.readGrounding;
export const readVerification = resumeWriteFlowApi.readVerification;
export const runVerification = resumeWriteFlowApi.runVerification;
export const completeQuestion = resumeWriteFlowApi.completeQuestion;
export const retryDeferredCapture = resumeWriteFlowApi.retryDeferredCapture;
export const overrideVerification = resumeWriteFlowApi.overrideVerification;
export const resolveCapture = resumeWriteFlowApi.resolveCapture;
export const completeApplication = resumeWriteFlowApi.completeApplication;
export const fetchProductivity = resumeWriteFlowApi.fetchProductivity;
export const loadExistingApplication = resumeWriteFlowApi.loadExistingApplication;
