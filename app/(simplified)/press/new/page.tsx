import type { Metadata } from "next";
import { SimplifiedPressFlow } from "@/components/press/SimplifiedPressFlow";

export const metadata: Metadata = {
  title: "새 보도자료",
};

export default function NewPressPage() {
  return <SimplifiedPressFlow />;
}
