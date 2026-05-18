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

// ===== Komentáre =====
export type FeedbackComment = {
  id: string;
  report_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

const COMMENT_COLS = "id, report_id, user_id, body, created_at";

export async function fetchFeedbackComments(reportId: string): Promise<FeedbackComment[]> {
  const { data, error } = await supabase
    .from("feedback_comments")
    .select(COMMENT_COLS)
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FeedbackComment[];
}

export async function createFeedbackComment(input: {
  report_id: string;
  user_id: string;
  body: string;
}): Promise<FeedbackComment> {
  const { data, error } = await supabase
    .from("feedback_comments")
    .insert(input)
    .select(COMMENT_COLS)
    .single();
  if (error) throw error;
  return data as FeedbackComment;
}

export async function deleteFeedbackComment(id: string) {
  const { error } = await supabase.from("feedback_comments").delete().eq("id", id);
  if (error) throw error;
}
