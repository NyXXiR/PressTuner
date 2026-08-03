"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useResumeWriteStore } from "@/stores/useResumeWriteStore";
import { tutorialRawInputText } from "@/lib/resumeTutorialSample";
import { IntakeInputPanel } from "@/app/resume/write/legacy/components/IntakeInputPanel";
import { NoBrickStartPanel } from "@/app/resume/write/legacy/components/NoBrickStartPanel";
import { SetupNavigationHeader } from "@/app/resume/write/legacy/components/SetupNavigationHeader";
import {
  ExperienceMemoSaveError,
  saveExperienceMemoBrick,
} from "@/app/resume/write/legacy/components/experienceMemoApi";
import {
  parseExperiencePdf,
  parseResumeIntake,
  saveParsedBricks,
} from "@/app/resume/write/legacy/components/resumeSetupApi";
import type { ParsedBrick } from "@/app/resume/write/legacy/components/resumeStartTypes";

export default function SetupStep({
  isTutorial = false,
  onBack,
  onForward,
}: {
  isTutorial?: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const store = useResumeWriteStore();
  const [rawText, setRawText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [isParsingIntake, setIsParsingIntake] = useState(false);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [isSavingBricks, setIsSavingBricks] = useState(false);
  const [parsedBricks, setParsedBricks] = useState<ParsedBrick[]>([]);
  const [selectedBrickIndexes, setSelectedBrickIndexes] = useState<number[]>([]);
  const [pdfName, setPdfName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [entrySnapshot] = useState(() =>
    JSON.stringify({
      company: store.targetInfo.company,
      job: store.targetInfo.job,
      brief: store.targetInfo.brief,
      questions: store.questions.map((question) => ({
        id: question.id,
        questionText: question.questionText,
        charLimit: question.charLimit,
      })),
      userBricks: store.userBricks.length,
    }),
  );
  const [showPostingFirstInput, setShowPostingFirstInput] = useState(false);
  const [memoBrickTitle, setMemoBrickTitle] = useState("");
  const [memoBrickContent, setMemoBrickContent] = useState("");
  const [memoBrickError, setMemoBrickError] = useState<string | null>(null);
  const [isSavingMemoBrick, setIsSavingMemoBrick] = useState(false);

  const questionCount = store.questions.filter((question) => question.questionText.trim()).length;
  const hasExistingBricks = store.userBricks.length > 0;
  const canShowIntakeForm = hasExistingBricks || showPostingFirstInput;
  const hasIntakeResult =
    !!store.targetInfo.company ||
    !!store.targetInfo.job ||
    !!store.targetInfo.brief.summary ||
    questionCount > 0;

  const selectedBricksPreview = useMemo(
    () => selectedBrickIndexes.map((index) => parsedBricks[index]).filter(Boolean),
    [parsedBricks, selectedBrickIndexes],
  );
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        company: store.targetInfo.company,
        job: store.targetInfo.job,
        brief: store.targetInfo.brief,
        questions: store.questions.map((question) => ({
          id: question.id,
          questionText: question.questionText,
          charLimit: question.charLimit,
        })),
        userBricks: store.userBricks.length,
      }),
    [store.questions, store.targetInfo, store.userBricks.length],
  );
  const isDirty = entrySnapshot.length > 0 && entrySnapshot !== currentSnapshot;

  useEffect(() => {
    if (isTutorial) {
      setRawText(tutorialRawInputText);
    }
  }, [isTutorial]);

  const handleTutorialParse = async () => {
    setIsParsingIntake(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setIsParsingIntake(false);
    onForward();
  };

  const handleParseIntake = async () => {
    setError(null);
    setIsParsingIntake(true);

    try {
      const parsed = await parseResumeIntake({ rawText, urlInput });

      store.setTargetInfo(parsed.targetInfo);
      store.setQuestions(parsed.questions);
      const saved = await store.saveDraftApplication();
      if (!saved) {
        throw new Error(store.error ?? "지원서 저장에 실패했습니다.");
      }
      store.setStep("PLAN");
    } catch (parseError: any) {
      setError(parseError?.message ?? "채용정보 정리에 실패했습니다.");
    } finally {
      setIsParsingIntake(false);
    }
  };

  const handlePdfChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setPdfName(file.name);
    setIsParsingPdf(true);

    try {
      const items = await parseExperiencePdf(file);
      setParsedBricks(items);
      setSelectedBrickIndexes(items.map((_, index) => index));
    } catch (parseError: any) {
      setUploadError(parseError?.message ?? "PDF 분석에 실패했습니다.");
    } finally {
      setIsParsingPdf(false);
      event.target.value = "";
    }
  };

  const toggleBrickSelection = (index: number) => {
    setSelectedBrickIndexes((prev) =>
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index].sort((a, b) => a - b),
    );
  };

  const handleSaveBricks = async () => {
    if (selectedBricksPreview.length === 0) return;

    setUploadError(null);
    setIsSavingBricks(true);

    try {
      await saveParsedBricks(selectedBricksPreview);
      await store.fetchUserBricks();
      setParsedBricks([]);
      setSelectedBrickIndexes([]);
      setPdfName("");
    } catch (saveError: any) {
      setUploadError(saveError?.message ?? "브릭 저장에 실패했습니다.");
    } finally {
      setIsSavingBricks(false);
    }
  };

  const handleSaveMemoBrick = async () => {
    setMemoBrickError(null);
    setIsSavingMemoBrick(true);

    try {
      await saveExperienceMemoBrick({
        title: memoBrickTitle,
        content: memoBrickContent,
      });
      await store.fetchUserBricks();
      setMemoBrickTitle("");
      setMemoBrickContent("");
      setShowPostingFirstInput(true);
    } catch (memoError) {
      if (memoError instanceof ExperienceMemoSaveError) {
        setMemoBrickError(memoError.message);
        return;
      }
      setMemoBrickError("경험 메모 저장에 실패했습니다.");
    } finally {
      setIsSavingMemoBrick(false);
    }
  };

  return (
    <div className="px-4 py-7 md:px-6 md:py-9">
      <div className="mx-auto max-w-4xl">
        <SetupNavigationHeader
          isTutorial={isTutorial}
          canShowIntakeForm={canShowIntakeForm}
          hasIntakeResult={hasIntakeResult}
          isDirty={isDirty}
          onBack={onBack}
          onForward={onForward}
        />

        {isTutorial ? (
          <IntakeInputPanel
            isTutorial
            rawText={rawText}
            urlInput={urlInput}
            isParsingIntake={isParsingIntake}
            hasIntakeResult={hasIntakeResult}
            error={error}
            onRawTextChange={setRawText}
            onUrlInputChange={setUrlInput}
            onParse={handleTutorialParse}
            onUseExistingResult={() => store.setStep("PLAN")}
          />
        ) : !canShowIntakeForm ? (
          <NoBrickStartPanel
            fileInputRef={fileInputRef}
            pdfName={pdfName}
            isParsingPdf={isParsingPdf}
            isSavingBricks={isSavingBricks}
            uploadError={uploadError}
            parsedBricks={parsedBricks}
            selectedBrickIndexes={selectedBrickIndexes}
            memoTitle={memoBrickTitle}
            memoContent={memoBrickContent}
            memoError={memoBrickError}
            isSavingMemo={isSavingMemoBrick}
            onPdfChange={handlePdfChange}
            onPickPdf={() => fileInputRef.current?.click()}
            onToggleBrickSelection={toggleBrickSelection}
            onSaveSelectedBricks={() => void handleSaveBricks()}
            onMemoTitleChange={setMemoBrickTitle}
            onMemoContentChange={setMemoBrickContent}
            onSaveMemo={() => void handleSaveMemoBrick()}
            onStartFromPosting={() => setShowPostingFirstInput(true)}
          />
        ) : (
          <IntakeInputPanel
            rawText={rawText}
            urlInput={urlInput}
            isParsingIntake={isParsingIntake}
            hasIntakeResult={hasIntakeResult}
            error={error}
            onRawTextChange={setRawText}
            onUrlInputChange={setUrlInput}
            onParse={handleParseIntake}
            onUseExistingResult={() => store.setStep("PLAN")}
          />
        )}
      </div>
    </div>
  );
}
