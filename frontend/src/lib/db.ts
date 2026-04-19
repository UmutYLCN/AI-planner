import Dexie, { Table } from "dexie";

export interface RoadmapResource {
  order: number;
  type: "pdf" | "video";
  title: string;
  pdf_name?: string;
  youtube_url?: string;
  topics: string[];
  estimated_minutes: number;
}

export interface RoadmapRecord {
  id?: number;
  title: string;
  sourceType: "pdf" | "youtube" | "mixed";
  materialNames: string[];
  target_date?: string;                    // stored for future use
  roadmap: {
    title: string;
    total_estimated_hours: number;
    resources: RoadmapResource[];
  };
  progress: Record<string, boolean>;       // key: resource order index (string)
  attachedFiles?: Array<{ name: string; data: Blob }>;
  createdAt: Date;
}

class AIplannerDB extends Dexie {
  roadmaps!: Table<RoadmapRecord, number>;

  constructor() {
    super("AIplannerDB");
    this.version(3).stores({
      roadmaps: "++id, createdAt, title",
    });
  }
}

export const db = new AIplannerDB();
