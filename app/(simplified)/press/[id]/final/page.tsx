import type { Metadata } from "next";
import { SimplifiedPressComplete } from "@/components/press/SimplifiedPressComplete";

export const metadata: Metadata = {
  title: "보도자료 완료",
};

export default function PressFinalPage() {
  return <SimplifiedPressComplete />;
}
