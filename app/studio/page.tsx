import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";

export const metadata: Metadata = {
  title: "Studio — Avatar App Kit",
};

export default function StudioPage() {
  return <StudioShell />;
}
