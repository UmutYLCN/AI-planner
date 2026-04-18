import Dexie, { Table } from "dexie";

export interface DayResource {
  type: "pdf" | "video";
  title: string;
  pdf_name?: string;
  page_range?: string;
  youtube_url?: string;
  topics: string[];
  estimated_minutes: number;
}

export interface RoadmapDay {
  day: number;
  total_hours: number;
  resources: DayResource[];
}

export interface RoadmapRecord {
  id?: number;
  title: string;
  sourceType: "pdf" | "youtube" | "mixed";
  materialNames: string[];
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
    days: RoadmapDay[];
  };
  progress: Record<string, boolean>; // key: "dayIdx-resIdx"
  attachedFiles?: Array<{ name: string; data: Blob }>;
  createdAt: Date;
}

class AIplannerDB extends Dexie {
  roadmaps!: Table<RoadmapRecord, number>;

  constructor() {
    super("AIplannerDB");
    this.version(2).stores({
      roadmaps: "++id, createdAt, title",
    });
  }
}

export const db = new AIplannerDB();
