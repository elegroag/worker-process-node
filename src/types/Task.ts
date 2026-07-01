export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ScriptType = 'python' | 'php';

export interface Task {
  id: number;
  script_type: ScriptType;
  script_path: string;
  parameters: string | null;
  status: TaskStatus;
  scheduled_at: string | Date | null;
  cron_expression: string | null;
  timezone: string | null;
  priority: number;
  created_at: string | Date;
  updated_at: string | Date;
  next_run_at?: string | Date | null;
}

export interface ExecuteResult {
  success: boolean;
  output: string;
  error: string | null;
}