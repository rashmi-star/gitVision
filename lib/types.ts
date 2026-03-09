export type AnalyzeResponse = {
  repository: string;
  previewUrl?: string;
  previewUrlSource?: string;
  repositoryRef?: string;
  readmeSummary?: string;
  techStack: string[];
  projectType: string;
  frontend: string;
  backend: string;
  hasUi: boolean;
  previewStrategy: {
    mode: "real-ui-with-mocks" | "generated-demo-ui";
    reason: string;
  };
  frameworkSignals: string[];
  folders: string[];
  uiComponents: string[];
  apiEndpoints: string[];
  assetSources: string[];
  assetHints: string[];
  missingAssetsDetected: boolean;
  mockResponses: Array<{ endpoint: string; method: string; response: string }>;
  architectureSummary: string;
  architectureDiagram: string[];
  flowChartMermaid?: string;
  detectedScreens: string[];
  screenPreviews: Array<{
    route: string;
    file: string;
    headings: string[];
    actions: string[];
    snippet: string;
  }>;
  repoVisualAssets: Array<{
    file: string;
    url: string;
  }>;
  userFlows: string[];
  aiNotes: string;
};
