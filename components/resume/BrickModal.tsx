"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { BrickDraftFields } from "@/components/resume/BrickDraftFields";
import { BrickDraftReviewList } from "@/components/resume/BrickDraftReviewList";
import { BrickModalFooter } from "@/components/resume/BrickModalFooter";
import { BrickModalHeader } from "@/components/resume/BrickModalHeader";
import { BrickRoughInput } from "@/components/resume/BrickRoughInput";
import {
  BrickOrganizerError,
  organizeExperienceBrickDrafts,
} from "@/components/resume/brickOrganizerApi";
import {
  type BrickData,
  type BrickDraftCandidate,
  fromOrganizedDraft,
  toDraftCandidate,
  validateBrickData,
} from "@/components/resume/brickModalTypes";

type DraftMode = "rough" | "details" | "review";

const EMPTY_BRICK: BrickData = {
  title: "",
  content: "",
  originalText: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  tags: [],
};

interface BrickModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly initialData?: BrickData;
  readonly onConfirm: (data: BrickData) => void;
  readonly onConfirmMany?: (items: BrickData[]) => void;
}

export default function BrickModal({
  isOpen,
  onClose,
  initialData,
  onConfirm,
  onConfirmMany,
}: BrickModalProps) {
  const isCreateMode = !initialData;
  const [draftMode, setDraftMode] = useState<DraftMode>("rough");
  const [roughMemo, setRoughMemo] = useState("");
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [formData, setFormData] = useState<BrickData>(EMPTY_BRICK);
  const [candidates, setCandidates] = useState<BrickDraftCandidate[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;

    setDraftMode(initialData ? "details" : "rough");
    setRoughMemo("");
    setFormData(initialData ?? EMPTY_BRICK);
    setCandidates([]);
    setTagInput("");
    setErrors({});
    setOrganizeError(null);
  }, [isOpen, initialData]);

  const clearError = (field: string) => {
    if (!errors[field]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const updateForm = (patch: Partial<BrickData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const addTag = () => {
    const value = tagInput.trim();
    const tags = formData.tags ?? [];
    if (!value || tags.includes(value)) return;
    updateForm({ tags: [...tags, value] });
    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    updateForm({
      tags: (formData.tags ?? []).filter((tag) => tag !== tagToRemove),
    });
  };

  const handleOrganize = async () => {
    setOrganizeError(null);
    setIsOrganizing(true);

    try {
      const drafts = await organizeExperienceBrickDrafts(roughMemo);
      if (drafts.length === 1) {
        const firstDraft = drafts.at(0);
        if (firstDraft) {
          setFormData(fromOrganizedDraft(firstDraft));
          setDraftMode("details");
        }
      } else {
        setCandidates(drafts.map(toDraftCandidate));
        setDraftMode("review");
      }
      setErrors({});
    } catch (error) {
      setOrganizeError(
        error instanceof BrickOrganizerError || error instanceof Error
          ? error.message
          : "경험 메모를 정리하지 못했습니다.",
      );
    } finally {
      setIsOrganizing(false);
    }
  };

  const handleSave = () => {
    const data = {
      ...formData,
      originalText: formData.originalText || formData.content,
      endDate: formData.isCurrent ? "" : formData.endDate,
    };
    const { success, errors: validationErrors } = validateBrickData(data);

    if (!success && validationErrors) {
      setErrors(validationErrors);
      return;
    }

    onConfirm(data);
    onClose();
  };

  const handleSaveMany = () => {
    const selected = candidates
      .filter((candidate) => candidate.selected)
      .map((candidate) => ({
        title: candidate.title,
        content: candidate.content,
        originalText: candidate.originalText || candidate.content,
        startDate: candidate.startDate,
        endDate: candidate.isCurrent ? "" : candidate.endDate,
        isCurrent: candidate.isCurrent,
        tags: candidate.tags,
      }));

    if (selected.length === 0) {
      setOrganizeError("저장할 경험 후보를 하나 이상 선택해주세요.");
      return;
    }

    const hasInvalidItem = selected.some((item) => {
      const { success } = validateBrickData(item);
      return !success;
    });
    if (hasInvalidItem) {
      setOrganizeError("선택한 후보의 제목과 내용을 확인해주세요.");
      return;
    }

    if (onConfirmMany) {
      onConfirmMany(selected);
    } else {
      const firstItem = selected.at(0);
      if (firstItem) onConfirm(firstItem);
    }
    onClose();
  };

  if (!isOpen) return null;

  const isRoughMode = isCreateMode && draftMode === "rough";
  const selectedCount = candidates.filter(
    (candidate) => candidate.selected,
  ).length;

  return createPortal(
    <div className="wongoji wongoji-sharp fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden border border-border bg-card animate-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <BrickModalHeader isCreateMode={isCreateMode} onClose={onClose} />

        <div className="max-h-[70vh] overflow-y-auto p-6">
          {isRoughMode ? (
            <BrickRoughInput
              roughMemo={roughMemo}
              organizeError={organizeError}
              onChange={(value) => {
                setRoughMemo(value);
                if (organizeError) setOrganizeError(null);
              }}
            />
          ) : draftMode === "review" ? (
            <BrickDraftReviewList
              candidates={candidates}
              error={organizeError}
              onChange={setCandidates}
            />
          ) : (
            <BrickDraftFields
              formData={formData}
              errors={errors}
              tagInput={tagInput}
              showAiHint={isCreateMode}
              onChange={updateForm}
              onTagInputChange={setTagInput}
              onAddTag={addTag}
              onRemoveTag={removeTag}
              onClearError={clearError}
            />
          )}
        </div>

        <BrickModalFooter
          draftMode={draftMode}
          isRoughMode={isRoughMode}
          isOrganizing={isOrganizing}
          roughMemo={roughMemo}
          selectedCount={selectedCount}
          isEditMode={Boolean(initialData)}
          onClose={onClose}
          onManualInput={() => setDraftMode("details")}
          onOrganize={() => void handleOrganize()}
          onSave={handleSave}
          onSaveMany={handleSaveMany}
        />
      </div>
    </div>,
    document.body,
  );
}
