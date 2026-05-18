import { supabase } from "./supabase";

export type FeedbackKind = "bug" | "improvement";
export type FeedbackStatus = "new" | "resolved";

export type FeedbackReport = {
  id: string;
  user_id: string;
  kind: FeedbackKind;
  title: string;
  description: string | null;
  status: FeedbackStatus;
  created_at: string;
  resolved_at: string | null;
};

const COLS = "id, user_id, kind, title, description, status, created_at, resolved_at";

export async function fetchFeedbackReports(): Promise<FeedbackReport[]> {
  const { data, error } = await supabase
    .from("feedback_reports")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeedbackReport[];
}

export async function createFeedbackReport(input: {
  user_id: string;
  kind: FeedbackKind;
  title: string;
  description: string | null;
}): Promise<FeedbackReport> {
  const { data, error } = await supabase
    .from("feedback_reports")
    .insert({ ...input, status: "new" })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as FeedbackReport;
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus) {
  const { data, error } = await supabase
    .from("feedback_reports")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw error;
  return data as FeedbackReport;
}

export async function deleteFeedbackReport(id: string) {
  const { error } = await supabase.from("feedback_reports").delete().eq("id", id);
  if (error) throw error;
}
