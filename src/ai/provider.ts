import { DiffInsights } from "../analyzer/diffAnalyzer";

export interface AiRequest {
  diff: string;
  insights: DiffInsights;
  language: string;
  style: string;
}

export interface AiResponse {
  subject: string;
  bullets: string[];
  rationale?: string[];
}

export interface AiProvider {
  name: string;
  generate(request: AiRequest): Promise<AiResponse>;
}
