import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SimplifiedPressReviewPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/press/${id}/edit`);
}
