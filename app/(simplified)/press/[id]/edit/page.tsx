import type { Metadata } from "next";
import { SimplifiedPressReviewFlow } from "@/components/press/SimplifiedPressReviewFlow";

export const metadata: Metadata = {
  title: "보도자료 첨삭",
};

export default function PressEditPage() {
  return <SimplifiedPressReviewFlow />;
}
