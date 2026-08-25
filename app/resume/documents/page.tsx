import type { Metadata } from "next";
import { ResumeDocumentBuilder } from "@/components/resume/ResumeDocumentBuilder";

export const metadata: Metadata = { title: "이력서 문서 편집 | brieFFlow", description: "공통 내용을 관리하고 지원처별 이력서 문서를 구성합니다." };
export default function ResumeDocumentsPage() { return <ResumeDocumentBuilder />; }
