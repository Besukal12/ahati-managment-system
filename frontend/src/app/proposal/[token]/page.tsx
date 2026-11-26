import type { Metadata } from "next";
import SharedProposalClient from "./SharedProposalClient";

export const metadata: Metadata = {
  title: "Your Ahati Proposal",
  robots: { index: false, follow: false },
};

export default async function SharedProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedProposalClient token={token} />;
}
