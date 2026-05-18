import { supabase } from "./supabase";

export type MonthlyWorkComment = {
  id: string;
  project_id: string;
  month_key: string;
  work_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

const COLS = "id, project_id, month_key, work_id, user_id, body, created_at";

export async function fetchMonthlyWorkComments(
  projectId: string,
  monthKey: string
): Promise<MonthlyWorkComment[]> {
  const { data, error } = await supabase
    .from("monthly_work_comments")
    .select(COLS)
    .eq("project_id", projectId)
    .eq("month_key", monthKey)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MonthlyWorkComment[];
}

export async function createMonthlyWorkComment(input: {
  project_id: string;
  month_key: string;
  work_id: string;
  user_id: string;
  body: string;
}): Promise<MonthlyWorkComment> {
  const { data, error } = await supabase
    .from("monthly_work_comments")
    .insert(input)
    .select(COLS)
    .single();
  if (error) throw error;
  return data as MonthlyWorkComment;
}

export async function deleteMonthlyWorkComment(id: string) {
  const { error } = await supabase.from("monthly_work_comments").delete().eq("id", id);
  if (error) throw error;
}

// ===== Prečítané komentáre =====
export type MonthlyWorkCommentRead = {
  user_id: string;
  work_id: string;
  last_read_at: string;
};

export async function fetchMyCommentReads(
  userId: string,
  workIds: string[]
): Promise<MonthlyWorkCommentRead[]> {
  if (workIds.length === 0) return [];
  const { data, error } = await supabase
    .from("monthly_work_comment_reads")
    .select("user_id, work_id, last_read_at")
    .eq("user_id", userId)
    .in("work_id", workIds);
  if (error) throw error;
  return (data ?? []) as MonthlyWorkCommentRead[];
}

export async function markCommentsRead(input: {
  user_id: string;
  work_id: string;
}): Promise<void> {
  const { error } = await supabase
    .from("monthly_work_comment_reads")
    .upsert(
      { ...input, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,work_id" }
    );
  if (error) throw error;
}
