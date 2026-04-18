import Dexie, { Table } from "dexie";

export interface RoadmapRecord {
  id?: number;
  title: string;
  sourceType: "pdf" | "youtube" | "mixed";
  materialNames: string[];   // filenames or video titles
  constraints: {
    mode: "daily_hours" | "target_date";
    daily_hours?: number;
    target_date?: string;
  };
  roadmap: {
    title: string;
    total_estimated_hours: number;
    recommended_daily_hours: number;
    estimated_finish_date: string;
    modules: Array<{
      module_name: string;
      estimated_hours: number;
      topics: string[];
      suggested_schedule: string;
      youtube_url?: string;  // if sourced from a video
    }>;
  };
  // progress: map of "moduleIdx-topicIdx" -> boolean
  progress: Record<string, boolean>;
  createdAt: Date;
}

class AIplannerDB extends Dexie {
  roadmaps!: Table<RoadmapRecord, number>;

  constructor() {
    super("AIplannerDB");
    this.version(1).stores({
      roadmaps: "++id, createdAt, title",
    });
  }
}

export const db = new AIplannerDB();
