export interface SlideConfig {
    minTimeSeconds: number;
    maxTimeSeconds: number;
}

export interface PostAssessmentSettings {
    thinkingMinSeconds: number;
    questionMinSeconds: number;
    questionMaxSeconds: number;
    wordLimit: number;
    feedbackScaleMin: number;
    feedbackScaleMax: number;
}

export interface QuestionOption {
    id: string;
    text: string;
}

export interface Question {
    id: string;
    question: string;
    type: 'mcq' | 'short-answer';
    options?: QuestionOption[];
    correctAnswer?: string;
}

export interface SubjectiveQuestion {
    id: string;
    prompt: string;
}

export interface FeedbackQuestion {
    id: string;
    prompt: string;
}

export interface TextVariant {
    type: 'passive' | 'active' | 'control';
    slides: string[];
}

export interface TextConfig {
    id: string;
    title: string;
    variants: TextVariant[];
    questions: Question[];
    subjectiveQuestions?: SubjectiveQuestion[];
}

export interface CalibrationSettings {
    durationSeconds: number;
    enabled: boolean;
}

export interface ExperimentConfig {
    experimentTitle: string;
    instructions: string;
    slideSettings: SlideConfig;
    calibrationSettings: CalibrationSettings;
    postAssessmentSettings?: PostAssessmentSettings;
    feedbackQuestions?: FeedbackQuestion[];
    condition: 'passive' | 'active' | 'control' | 'random';
    texts: TextConfig[];
}

export interface Participant {
    name: string;
    age: number;
    email?: string;
    notes?: string;
}

export type ExperimentPhase =
    | 'registration'
    | 'instructions'
    | 'requesting-permissions'
    | 'pre-calibration'
    | 'reading'
    | 'assessment'
    | 'post-calibration'
    | 'completed';

export interface QuestionTimestamps {
    t1QuestionShown: number;
    t2TypingStarted: number | null;
    t3FirstKeypress: number | null;
    t4Submitted: number;
}

export interface QuestionMetrics {
    thinkingTimeMs: number | null;
    firstKeypressLatencyMs: number | null;
    totalResponseTimeMs: number | null;
    totalQuestionTimeMs: number;
}

export interface SubjectiveResponse {
    questionId: string;
    prompt: string;
    response: string;
    wordCount: number;
    autoSubmitted: boolean;
    timestamps: QuestionTimestamps;
    metrics: QuestionMetrics;
}

export interface TextAssessmentResult {
    textId: string;
    textTitle: string;
    subjectiveResponses: SubjectiveResponse[];
    feedbackRatings: Record<string, number>;
    submittedAt: number;
}

export interface ExperimentState {
    phase: ExperimentPhase;
    participant: Participant | null;
    currentTextIndex: number;
    currentSlideIndex: number;
    assignedCondition: 'passive' | 'active' | 'control';
    answers: Record<string, TextAssessmentResult>;
    startTime: number | null;
    slideStartTimes: number[];
}
