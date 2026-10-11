export type Category =
  | 'nlp'
  | 'retrieval'
  | 'rag'
  | 'ml'
  | 'recommendation'
  | 'cv'
  | 'speech'
  | 'video';
export type Page =
  | 'dashboard'
  | 'roadmap'
  | 'questions'
  | 'projects'
  | 'practice'
  | 'reports'
  | 'profile'
  | 'settings';
export type Mode = 'read' | 'keywords' | 'independent';
export interface Question {
  id: string;
  category: Category;
  title: string;
  question: string;
  translation: string;
  difficulty: '基础' | '进阶' | '挑战';
  minutes: number;
  tags: string[];
  answer: string;
  points: string[];
  followups: string[];
  sourceUrl: string;
  reviewed: boolean;
}
export interface Fact {
  id: string;
  text: string;
  confirmed: boolean;
}
export interface Project {
  id: string;
  name: string;
  background: string;
  role: string;
  decision: string;
  result: string;
  reflection: string;
  tags: string[];
}
export interface Profile {
  name: string;
  title: string;
  experience: string;
  summary: string;
  facts: Fact[];
  resumeVersion: number;
  resumeName?: string;
  resumeText?: string;
  projects: Project[];
}
export interface Plan {
  company: string;
  role: string;
  date: string;
  minutes: number;
  track: Category;
  jd?: string;
}
export interface Feedback {
  summary: string;
  strengths: string[];
  improvements: { title: string; detail: string; quote?: string }[];
  referenceAnswer: string;
  followUp: string;
  contentLevel: 'strong' | 'developing' | 'needs-work';
  model: string;
}
export interface PracticeSnapshot {
  kind: 'intro' | 'technical' | 'project' | 'reverse' | 'clarify' | 'followup';
  question: string;
  title: string;
  category: string;
  translation?: string;
  points: string[];
  reference?: string;
  sourceUrl?: string;
  project?: Project;
  job?: { role: string; jd: string };
}
export interface AudioAttachment {
  key: string;
  bytes: number;
  mimeType: string;
  fileName: string;
}
export interface Attempt {
  id: string;
  questionId: string;
  question?: string;
  snapshot?: PracticeSnapshot;
  audio?: AudioAttachment;
  title: string;
  category: string;
  date: string;
  answer: string;
  mode: Mode;
  feedback?: Feedback;
  duration: number;
  assisted: boolean;
  selfReview?: boolean;
  reviewDue: string;
}
export interface Session {
  id: string;
  date: string;
  attemptIds: string[];
  completed: boolean;
}
export interface AppState {
  version: 1;
  sample: boolean;
  profile: Profile;
  plan: Plan;
  intro: string;
  introConfirmed: boolean;
  introStale: boolean;
  bookmarks: string[];
  attempts: Attempt[];
  completedTasks: string[];
  sessions: Session[];
}
export interface Health {
  configured: boolean;
  provider: string;
  model: string;
  asrConfigured: boolean;
  limitations?: string[];
}
export interface PageProps {
  state: AppState;
  update: import('react').Dispatch<import('react').SetStateAction<AppState>>;
  navigate: (page: Page) => void;
  notify: (message: string) => void;
  startPractice: (id: string, mode?: Mode, simulation?: boolean) => void;
  health: Health | null;
  repeatAttempt?: (attempt: Attempt) => void;
}
