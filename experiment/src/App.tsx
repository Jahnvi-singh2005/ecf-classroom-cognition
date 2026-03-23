import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import type {
  AssessmentDraftState,
  ExperimentConfig,
  ExperimentPhase,
  ExperimentSessionDraft,
  ExperimentSessionRecord,
  FeedbackQuestion,
  GroupCondition,
  Participant,
  PostAssessmentSettings,
  Question,
  SubjectiveQuestion,
  TextAssessmentResult,
} from './types';
import { RecordingService } from './services/RecordingService';
import {
  buildParticipantKey,
  getProjectSettings,
  getStoredSettingsPassword,
  markSessionDraftCompleted,
  saveExperimentSession,
  saveProjectSettings,
  upsertSessionDraft,
} from './services/ExperimentDataService';
import { hasFirebaseConfig } from './services/firebase';
import Registration from './components/Registration';
import Instructions from './components/Instructions';
import CalibrationScreen from './components/CalibrationScreen';
import ReadingSlide from './components/ReadingSlide';
import Completion from './components/Completion';

const ExperimentSettings = lazy(() => import('./components/ExperimentSettings'));
const HistoryPage = lazy(() => import('./components/HistoryPage'));
const PostAssessment = lazy(() => import('./components/PostAssessment'));

const DEFAULT_POST_ASSESSMENT_SETTINGS: PostAssessmentSettings = {
  thinkingMinSeconds: 8,
  questionMinSeconds: 20,
  questionMaxSeconds: 180,
  wordLimit: 120,
  feedbackScaleMin: 1,
  feedbackScaleMax: 7,
};

const DEFAULT_SUBJECTIVE_QUESTIONS: SubjectiveQuestion[] = [
  { id: 'q1-main-idea', prompt: 'In 2–4 lines, what is the main claim or core idea of this text?' },
  { id: 'q2-evidence', prompt: 'Which specific evidence, example, or mechanism best supports that claim?' },
  { id: 'q3-causal', prompt: 'Explain one cause-and-effect relationship described in the text.' },
  { id: 'q4-contrast', prompt: 'Identify one competing viewpoint or key contrast from the text.' },
  { id: 'q5-application', prompt: 'Apply one concept from the text to a new real-world scenario.' },
  { id: 'q6-reflection', prompt: 'What part of this text was most difficult to process, and why?' },
];

const DEFAULT_FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  { id: 'difficulty', prompt: 'Perceived difficulty' },
  { id: 'engagement', prompt: 'Perceived engagement' },
  { id: 'confusion', prompt: 'Perceived confusion' },
  { id: 'effort', prompt: 'Perceived effort' },
];

const DRAFT_WRITE_MIN_INTERVAL_MS = 10000;
const DRAFT_LOCAL_KEY_PREFIX = 'exp-draft-unsynced';
const DRAFT_RETRY_BASE_MS = 1500;
const DRAFT_RETRY_MAX_MS = 30000;

function App() {
  const [config, setConfig] = useState<ExperimentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pathname, setPathname] = useState<'/' | '/settings' | '/history'>(
    window.location.pathname === '/settings'
      ? '/settings'
      : window.location.pathname === '/history'
        ? '/history'
        : '/',
  );

  const [phase, setPhase] = useState<ExperimentPhase>('registration');
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [assignedCondition, setAssignedCondition] = useState<GroupCondition>('group-1');
  const allAnswersRef = useRef<Record<string, TextAssessmentResult>>({});

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionSyncStatus, setSessionSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'retrying' | 'offline' | 'error'>('idle');
  const [sessionSyncMessage, setSessionSyncMessage] = useState<string | null>(null);
  const [hasPersistedSession, setHasPersistedSession] = useState(false);
  const [activeAssessmentDraft, setActiveAssessmentDraft] = useState<AssessmentDraftState | null>(null);
  const [resumeFromHistoryDraft, setResumeFromHistoryDraft] = useState<ExperimentSessionDraft | null>(null);
  const [exitAfterPostCalibration, setExitAfterPostCalibration] = useState(false);

  const draftInFlightRef = useRef(false);
  const pendingDraftRef = useRef<ExperimentSessionDraft | null>(null);
  const lastDraftHashRef = useRef<string | null>(null);
  const lastDraftWriteAtRef = useRef(0);
  const draftRetryAttemptRef = useRef(0);
  const draftRetryTimeoutRef = useRef<number | null>(null);
  const lastKnownDraftRef = useRef<ExperimentSessionDraft | null>(null);
  const flushDraftCheckpointRef = useRef<(draft: ExperimentSessionDraft, force?: boolean) => Promise<void>>(async () => undefined);

  const [settingsSyncStatus, setSettingsSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [settingsSyncMessage, setSettingsSyncMessage] = useState<string | null>(null);

  // Permission / recording state
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'requesting' | 'granted' | 'error'>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [experimentStarted, setExperimentStarted] = useState(false);
  const recorderRef = useRef<RecordingService>(new RecordingService());

  const resolveCondition = useCallback((condition: unknown): GroupCondition => {
    switch (condition) {
      case 'group-1':
      case 'group-2':
      case 'group-3':
      case 'group-4':
        return condition;
      case 'passive':
        return 'group-1';
      case 'active':
        return 'group-2';
      case 'constructive':
        return 'group-3';
      case 'control':
        return 'group-4';
      default:
        return 'group-1';
    }
  }, []);

  const variantByGroup: Record<GroupCondition, Array<'passive' | 'active' | 'constructive' | 'control'>> = {
    'group-1': ['passive', 'active', 'constructive', 'control'],
    'group-2': ['active', 'control', 'passive', 'constructive'],
    'group-3': ['constructive', 'passive', 'control', 'active'],
    'group-4': ['control', 'constructive', 'active', 'passive'],
  };

  const navigate = useCallback((nextPath: '/' | '/settings' | '/history') => {
    window.history.pushState({}, '', nextPath);
    setPathname(nextPath);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPathname(
        window.location.pathname === '/settings'
          ? '/settings'
          : window.location.pathname === '/history'
            ? '/history'
            : '/',
      );
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Load config
  useEffect(() => {
    fetch('/config.json')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load configuration');
        const localConfig = await res.json() as ExperimentConfig;

        if (!hasFirebaseConfig) {
          return localConfig;
        }

        try {
          const remoteConfig = await getProjectSettings();

          if (remoteConfig) {
            const localVersion = localConfig.version || 0;
            const remoteVersion = remoteConfig.version || 0;

            if (localVersion > remoteVersion) {
              console.log(`[Config Migration] Local version (${localVersion}) > Remote version (${remoteVersion}). Migrating Firebase database.`);
              const password = await getStoredSettingsPassword();
              await saveProjectSettings(localConfig, password || 'pass123');
              return localConfig;
            }

            return remoteConfig;
          }

          return localConfig;
        } catch (e) {
          console.error('[Config Error] Failed to fetch or migrate remote config:', e);
          return localConfig;
        }
      })
      .then((data: ExperimentConfig) => {
        setConfig(data);
        setAssignedCondition(resolveCondition(data.condition));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [resolveCondition]);

  const makeSessionId = useCallback(() => {
    const random = Math.random().toString(36).slice(2, 8);
    return `sess-${Date.now()}-${random}`;
  }, []);

  const localDraftStorageKey = useCallback((id: string) => `${DRAFT_LOCAL_KEY_PREFIX}:${id}`, []);

  const saveLocalDraftFallback = useCallback((draft: ExperimentSessionDraft) => {
    try {
      localStorage.setItem(localDraftStorageKey(draft.sessionId), JSON.stringify(draft));
    } catch {
      // Ignore quota/storage errors; runtime checkpoint retries still continue.
    }
  }, [localDraftStorageKey]);

  const clearLocalDraftFallback = useCallback((id: string) => {
    try {
      localStorage.removeItem(localDraftStorageKey(id));
    } catch {
      // Ignore storage errors.
    }
  }, [localDraftStorageKey]);

  const buildDraftFromState = useCallback((params: {
    phaseValue?: ExperimentPhase;
    textIndex?: number;
    slideIndex?: number;
    answers?: Record<string, TextAssessmentResult>;
    assessmentDraft?: AssessmentDraftState | null;
  }): ExperimentSessionDraft | null => {
    if (!participant || !config || !sessionId) return null;

    const participantPayload: Participant = {
      name: participant.name,
      age: participant.age,
      ...(participant.email ? { email: participant.email } : {}),
      ...(participant.notes ? { notes: participant.notes } : {}),
    };

    const now = Date.now();
    const previousDraft = lastKnownDraftRef.current;

    return {
      sessionId,
      participantKey: buildParticipantKey(participantPayload),
      participant: participantPayload,
      experimentTitle: config.experimentTitle,
      assignedCondition,
      startedAt: sessionStartedAt || previousDraft?.startedAt || now,
      lastUpdatedAt: now,
      lastSyncedAt: now,
      status: hasPersistedSession ? 'completed' : 'in-progress',
      calibrationEnabled: config.calibrationSettings.enabled,
      totalTexts: config.texts.length,
      phase: params.phaseValue || phase,
      currentTextIndex: params.textIndex ?? currentTextIndex,
      currentSlideIndex: params.slideIndex ?? currentSlideIndex,
      assessments: params.answers || allAnswersRef.current,
      ...(params.assessmentDraft ? { activeAssessment: params.assessmentDraft } : {}),
    };
  }, [assignedCondition, config, currentSlideIndex, currentTextIndex, hasPersistedSession, participant, phase, sessionId, sessionStartedAt]);

  const scheduleDraftRetry = useCallback(() => {
    if (draftRetryTimeoutRef.current !== null) return;
    draftRetryAttemptRef.current += 1;
    const baseDelay = Math.min(DRAFT_RETRY_BASE_MS * (2 ** (draftRetryAttemptRef.current - 1)), DRAFT_RETRY_MAX_MS);
    const jitter = Math.floor(Math.random() * 500);
    const delay = baseDelay + jitter;

    draftRetryTimeoutRef.current = window.setTimeout(() => {
      draftRetryTimeoutRef.current = null;
      const queued = pendingDraftRef.current;
      if (queued) {
        void flushDraftCheckpointRef.current(queued, true);
      }
    }, delay);
  }, []);

  const flushDraftCheckpoint = useCallback(async (draft: ExperimentSessionDraft, force = false) => {
    if (!hasFirebaseConfig) {
      saveLocalDraftFallback(draft);
      setSessionSyncStatus('offline');
      setSessionSyncMessage('Offline draft saved locally.');
      return;
    }

    if (!force && Date.now() - lastDraftWriteAtRef.current < DRAFT_WRITE_MIN_INTERVAL_MS) {
      pendingDraftRef.current = draft;
      return;
    }

    if (draftInFlightRef.current) {
      pendingDraftRef.current = draft;
      return;
    }

    draftInFlightRef.current = true;

    try {
      setSessionSyncStatus('saving');
      await upsertSessionDraft(draft);
      if (draftRetryTimeoutRef.current !== null) {
        window.clearTimeout(draftRetryTimeoutRef.current);
        draftRetryTimeoutRef.current = null;
      }
      lastKnownDraftRef.current = draft;
      lastDraftWriteAtRef.current = Date.now();
      draftRetryAttemptRef.current = 0;
      clearLocalDraftFallback(draft.sessionId);
      if (!hasPersistedSession) {
        setSessionSyncStatus('saved');
        setSessionSyncMessage('Progress saved.');
      }
    } catch (draftError) {
      saveLocalDraftFallback(draft);
      setSessionSyncStatus(navigator.onLine ? 'retrying' : 'offline');
      setSessionSyncMessage(draftError instanceof Error ? draftError.message : 'Could not sync draft. Retrying...');
      pendingDraftRef.current = draft;
      scheduleDraftRetry();
    } finally {
      draftInFlightRef.current = false;

      const queued = pendingDraftRef.current;
      if (queued) {
        const nextHash = JSON.stringify(queued);
        const currentHash = JSON.stringify(draft);
        if (nextHash !== currentHash) {
          pendingDraftRef.current = null;
          void flushDraftCheckpoint(queued, true);
        }
      }
    }
  }, [clearLocalDraftFallback, hasPersistedSession, saveLocalDraftFallback, scheduleDraftRetry]);

  flushDraftCheckpointRef.current = flushDraftCheckpoint;

  const checkpointDraft = useCallback((params: {
    force?: boolean;
    phaseValue?: ExperimentPhase;
    textIndex?: number;
    slideIndex?: number;
    answers?: Record<string, TextAssessmentResult>;
    assessmentDraft?: AssessmentDraftState | null;
  } = {}) => {
    if (hasPersistedSession) return;
    const draft = buildDraftFromState(params);
    if (!draft) return;

    const hash = JSON.stringify(draft);
    if (!params.force && hash === lastDraftHashRef.current) return;
    lastDraftHashRef.current = hash;
    pendingDraftRef.current = draft;
    void flushDraftCheckpoint(draft, params.force);
  }, [buildDraftFromState, flushDraftCheckpoint, hasPersistedSession]);

  useEffect(() => () => {
    if (draftRetryTimeoutRef.current !== null) {
      window.clearTimeout(draftRetryTimeoutRef.current);
      draftRetryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      const queued = pendingDraftRef.current;
      if (queued) {
        void flushDraftCheckpointRef.current(queued, true);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    const handleForcedCheckpoint = () => {
      checkpointDraft({
        force: true,
        phaseValue: phase,
        textIndex: currentTextIndex,
        slideIndex: currentSlideIndex,
        answers: allAnswersRef.current,
        assessmentDraft: activeAssessmentDraft,
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleForcedCheckpoint();
      }
    };

    const onPageHide = () => {
      handleForcedCheckpoint();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [activeAssessmentDraft, checkpointDraft, currentSlideIndex, currentTextIndex, phase]);

  useEffect(() => {
    if (!experimentStarted || phase === 'completed' || !participant || !config || !sessionId) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      checkpointDraft({
        force: false,
        phaseValue: phase,
        textIndex: currentTextIndex,
        slideIndex: currentSlideIndex,
        answers: allAnswersRef.current,
        assessmentDraft: activeAssessmentDraft,
      });
    }, DRAFT_WRITE_MIN_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeAssessmentDraft, checkpointDraft, config, currentSlideIndex, currentTextIndex, experimentStarted, participant, phase, sessionId]);

  const persistSession = useCallback(async (answersSnapshot: Record<string, TextAssessmentResult>) => {
    if (!participant || !config || !sessionId || hasPersistedSession) return;

    if (!hasFirebaseConfig) {
      setSessionSyncStatus('idle');
      setSessionSyncMessage('Firebase not configured yet. Session stayed local.');
      return;
    }

    try {
      setSessionSyncStatus('saving');
      setSessionSyncMessage(null);

      const participantPayload: Participant = {
        name: participant.name,
        age: participant.age,
        ...(participant.email ? { email: participant.email } : {}),
        ...(participant.notes ? { notes: participant.notes } : {}),
      };

      const startedAt = sessionStartedAt || Date.now();
      const payload: ExperimentSessionRecord = {
        sessionId,
        participantKey: buildParticipantKey(participantPayload),
        participant: participantPayload,
        experimentTitle: config.experimentTitle,
        assignedCondition,
        startedAt,
        completedAt: Date.now(),
        calibrationEnabled: config.calibrationSettings.enabled,
        totalTexts: config.texts.length,
        assessments: answersSnapshot,
      };

      await saveExperimentSession(payload);
      await markSessionDraftCompleted(sessionId);
      pendingDraftRef.current = null;
      clearLocalDraftFallback(sessionId);
      setHasPersistedSession(true);
      setSessionSyncStatus('saved');
      setSessionSyncMessage('Session saved to Firebase.');
    } catch (persistError) {
      setSessionSyncStatus('error');
      setSessionSyncMessage(persistError instanceof Error ? persistError.message : 'Failed to save session to Firebase.');
    }
  }, [assignedCondition, clearLocalDraftFallback, config, hasPersistedSession, participant, sessionId, sessionStartedAt]);

  // Get current text and variant
  const currentText = config?.texts[currentTextIndex];
  const variantOrder = variantByGroup[assignedCondition] || variantByGroup['group-1'];
  const targetVariantType = currentText
    ? (variantOrder[currentTextIndex % variantOrder.length] || 'active')
    : 'active';
  const currentVariant = currentText?.variants.find((v) => v.type === targetVariantType)
    || currentText?.variants.find((v) => v.type === 'active')
    || currentText?.variants.find((v) => v.type === 'passive')
    || currentText?.variants.find((v) => v.type === 'constructive')
    || currentText?.variants.find((v) => v.type === 'control');
  const currentSlides = currentVariant?.slides || [];
  const currentSubjectiveQuestions = currentText?.subjectiveQuestions?.length
    ? currentText.subjectiveQuestions
    : DEFAULT_SUBJECTIVE_QUESTIONS;
  const currentAssessmentQuestions: Question[] = currentText?.questions?.length
    ? currentText.questions
    : currentSubjectiveQuestions.map((item, idx) => ({
      id: item.id,
      heading: `QUESTION - ${idx + 1}`,
      question: item.prompt,
      type: 'short-answer',
    }));
  const currentFeedbackQuestions = config?.feedbackQuestions?.length
    ? config.feedbackQuestions
    : DEFAULT_FEEDBACK_QUESTIONS;
  const postAssessmentSettings = config?.postAssessmentSettings || DEFAULT_POST_ASSESSMENT_SETTINGS;
  const syncIndicatorMessage = (() => {
    switch (sessionSyncStatus) {
      case 'saving':
        return 'Saving progress...';
      case 'saved':
        return 'Progress saved';
      case 'retrying':
        return 'Connection unstable. Retrying save...';
      case 'offline':
        return 'Offline. Progress kept locally and will sync when online.';
      case 'error':
        return sessionSyncMessage || 'Could not save progress.';
      default:
        return null;
    }
  })();
  const completionSyncStatus: 'idle' | 'saving' | 'saved' | 'error' =
    sessionSyncStatus === 'offline' || sessionSyncStatus === 'retrying'
      ? 'saving'
      : sessionSyncStatus;

  const findFirstUnansweredTextIndex = useCallback((assessments: Record<string, TextAssessmentResult>): number => {
    if (!config?.texts?.length) return 0;

    const answered = new Set(Object.keys(assessments || {}));
    const firstUnanswered = config.texts.findIndex((text) => !answered.has(text.id));
    return firstUnanswered >= 0 ? firstUnanswered : config.texts.length - 1;
  }, [config?.texts]);

  const deriveResumeTarget = useCallback((draft: ExperimentSessionDraft): {
    phase: ExperimentPhase;
    textIndex: number;
    slideIndex: number;
  } => {
    const totalTexts = config?.texts?.length || draft.totalTexts || 0;
    const maxTextIndex = Math.max(totalTexts - 1, 0);
    const answeredCount = Object.keys(draft.assessments || {}).length;

    if (draft.activeAssessment?.textId && config?.texts?.length) {
      const assessmentTextIndex = config.texts.findIndex((text) => text.id === draft.activeAssessment?.textId);
      if (assessmentTextIndex >= 0) {
        return {
          phase: 'assessment',
          textIndex: assessmentTextIndex,
          slideIndex: 0,
        };
      }
    }

    if (answeredCount < totalTexts) {
      return {
        phase: 'reading',
        textIndex: findFirstUnansweredTextIndex(draft.assessments || {}),
        slideIndex: 0,
      };
    }

    return {
      phase: config?.calibrationSettings?.enabled ? 'post-calibration' : 'completed',
      textIndex: Math.min(Math.max(draft.currentTextIndex, 0), maxTextIndex),
      slideIndex: 0,
    };
  }, [config?.calibrationSettings?.enabled, config?.texts, findFirstUnansweredTextIndex]);

  const normalizeResumePhase = useCallback((phaseValue: ExperimentPhase): ExperimentPhase => {
    if (
      phaseValue === 'registration'
      || phaseValue === 'instructions'
      || phaseValue === 'requesting-permissions'
      || phaseValue === 'pre-calibration'
      || phaseValue === 'post-calibration'
      || phaseValue === 'completed'
    ) {
      return 'reading';
    }

    return phaseValue;
  }, []);

  const resetToRegistrationState = useCallback(() => {
    setExperimentStarted(false);
    setParticipant(null);
    setPhase('registration');
    setCurrentTextIndex(0);
    setCurrentSlideIndex(0);
    setSessionId(null);
    setSessionStartedAt(null);
    setHasPersistedSession(false);
    setActiveAssessmentDraft(null);
    setResumeFromHistoryDraft(null);
    setExitAfterPostCalibration(false);
    setPermissionStatus('idle');
    setPermissionError(null);
    setSessionSyncStatus('idle');
    setSessionSyncMessage(null);
    allAnswersRef.current = {};
    lastKnownDraftRef.current = null;
    pendingDraftRef.current = null;
    lastDraftHashRef.current = null;
    navigate('/');
  }, [navigate]);

  const startFreshSession = useCallback((participantPayload: Participant) => {
    setParticipant(participantPayload);
    setSessionId(makeSessionId());
    setSessionStartedAt(null);
    setHasPersistedSession(false);
    setSessionSyncStatus('idle');
    setSessionSyncMessage(null);
    setActiveAssessmentDraft(null);
    allAnswersRef.current = {};
    setPhase('instructions');
    setResumeFromHistoryDraft(null);
    setExitAfterPostCalibration(false);
    checkpointDraft({
      force: true,
      phaseValue: 'instructions',
      textIndex: 0,
      slideIndex: 0,
      answers: {},
    });
  }, [checkpointDraft, makeSessionId]);

  const handleRegistration = useCallback(async (data: { name: string; age: number; email?: string; notes?: string }) => {
    const participantPayload = data as Participant;
    startFreshSession(participantPayload);
  }, [startFreshSession]);

  const handleResumeDraftFromHistory = useCallback((draft: ExperimentSessionDraft) => {
    const maxTextIndex = Math.max((config?.texts.length || 1) - 1, 0);
    const resumedTextIndex = Math.min(Math.max(draft.currentTextIndex, 0), maxTextIndex);
    const resumedSlideIndex = Math.max(draft.currentSlideIndex, 0);

    setParticipant(draft.participant);
    setSessionId(draft.sessionId);
    setSessionStartedAt(draft.startedAt);
    setAssignedCondition(draft.assignedCondition);
    setCurrentTextIndex(resumedTextIndex);
    setCurrentSlideIndex(resumedSlideIndex);
    allAnswersRef.current = draft.assessments || {};
    setActiveAssessmentDraft(draft.activeAssessment || null);
    setHasPersistedSession(false);
    setResumeFromHistoryDraft(draft);
    setExitAfterPostCalibration(false);
    setExperimentStarted(false);
    setPhase('instructions');
    setSessionSyncStatus('saved');
    setSessionSyncMessage('Resuming session. Complete entry steps to continue.');
    lastKnownDraftRef.current = draft;
    navigate('/');
  }, [config?.texts.length, navigate]);

  const handleSettingsContinue = useCallback(async (nextConfig: ExperimentConfig, password: string) => {
    setSettingsSyncStatus('saving');
    setSettingsSyncMessage(null);

    if (hasFirebaseConfig) {
      try {
        await saveProjectSettings(nextConfig, password);
        setSettingsSyncStatus('saved');
        setSettingsSyncMessage('Settings synced to Firebase.');
      } catch (syncError) {
        setSettingsSyncStatus('error');
        setSettingsSyncMessage(syncError instanceof Error ? syncError.message : 'Could not sync settings to Firebase.');
      }
    } else {
      setSettingsSyncStatus('idle');
      setSettingsSyncMessage('Firebase not configured yet. Saved only for this browser session.');
    }

    setConfig(nextConfig);
    setAssignedCondition(resolveCondition(nextConfig.condition));
    setCurrentTextIndex(0);
    setCurrentSlideIndex(0);
    allAnswersRef.current = {};
    setParticipant(null);
    setResumeFromHistoryDraft(null);
    setExitAfterPostCalibration(false);
    setPhase('registration');
    navigate('/');
  }, [resolveCondition, navigate]);

  useEffect(() => {
    const recorder = recorderRef.current;
    return () => {
      recorder.stopAll().catch(() => undefined);
    };
  }, []);

  // After instructions → request permissions (if calibration enabled), otherwise go directly to reading
  const handleBeginExperiment = useCallback(() => {
    setExperimentStarted(true);
    if (!sessionStartedAt) {
      setSessionStartedAt(Date.now());
    }

    if (config?.calibrationSettings?.enabled) {
      setPhase('requesting-permissions');
      setPermissionStatus('requesting');
      checkpointDraft({
        force: true,
        phaseValue: 'requesting-permissions',
      });

      recorderRef.current
        .requestPermissions()
        .then(() => {
          try {
            setPermissionStatus('granted');
            // Start recordings
            recorderRef.current.startAll(participant?.name || 'unknown');
            // Proceed to pre-calibration
            setPhase('pre-calibration');
          } catch (err) {
            setPermissionStatus('error');
            setPermissionError(err instanceof Error ? err.message : 'Could not start recordings');
          }
        })
        .catch((err: Error) => {
          setPermissionStatus('error');
          setPermissionError(err.message || 'Permission denied');
        });
    } else {
      if (resumeFromHistoryDraft) {
        const resumedTarget = deriveResumeTarget(resumeFromHistoryDraft);
        const resumedPhase = normalizeResumePhase(resumedTarget.phase);
        const resumedTextIndex = resumedTarget.textIndex;
        const resumedSlideIndex = resumedTarget.slideIndex;

        setCurrentTextIndex(resumedTextIndex);
        setCurrentSlideIndex(resumedSlideIndex);
        setPhase(resumedPhase);
        setResumeFromHistoryDraft(null);
        checkpointDraft({
          force: true,
          phaseValue: resumedPhase,
          textIndex: resumedTextIndex,
          slideIndex: resumedSlideIndex,
          answers: allAnswersRef.current,
          assessmentDraft: activeAssessmentDraft,
        });
        return;
      }

      // No calibration — go straight to reading
      setPhase('reading');
      setCurrentTextIndex(0);
      setCurrentSlideIndex(0);
      checkpointDraft({
        force: true,
        phaseValue: 'reading',
        textIndex: 0,
        slideIndex: 0,
      });
    }
  }, [activeAssessmentDraft, checkpointDraft, config, deriveResumeTarget, normalizeResumePhase, participant, resumeFromHistoryDraft, sessionStartedAt]);

  // Pre-calibration done → start reading
  const handlePreCalibrationComplete = useCallback(() => {
    if (resumeFromHistoryDraft) {
      const resumedTarget = deriveResumeTarget(resumeFromHistoryDraft);
      const resumedPhase = normalizeResumePhase(resumedTarget.phase);
      const resumedTextIndex = resumedTarget.textIndex;
      const resumedSlideIndex = resumedTarget.slideIndex;

      setCurrentTextIndex(resumedTextIndex);
      setCurrentSlideIndex(resumedSlideIndex);
      setPhase(resumedPhase);
      setResumeFromHistoryDraft(null);
      checkpointDraft({
        force: true,
        phaseValue: resumedPhase,
        textIndex: resumedTextIndex,
        slideIndex: resumedSlideIndex,
        answers: allAnswersRef.current,
        assessmentDraft: activeAssessmentDraft,
      });
      return;
    }

    setCurrentTextIndex(0);
    setCurrentSlideIndex(0);
    setPhase('reading');
    checkpointDraft({
      force: true,
      phaseValue: 'reading',
      textIndex: 0,
      slideIndex: 0,
    });
  }, [activeAssessmentDraft, checkpointDraft, deriveResumeTarget, normalizeResumePhase, resumeFromHistoryDraft]);

  const handleNextSlide = useCallback(() => {
    if (currentSlideIndex < currentSlides.length - 1) {
      const nextSlideIndex = currentSlideIndex + 1;
      setCurrentSlideIndex(nextSlideIndex);
      checkpointDraft({
        force: true,
        phaseValue: 'reading',
        textIndex: currentTextIndex,
        slideIndex: nextSlideIndex,
      });
    } else {
      // Reading done for this text, move to assessment
      setPhase('assessment');
      checkpointDraft({
        force: true,
        phaseValue: 'assessment',
        textIndex: currentTextIndex,
        slideIndex: currentSlideIndex,
      });
    }
  }, [checkpointDraft, currentSlideIndex, currentSlides.length, currentTextIndex]);

  const handleAssessmentSubmit = useCallback((result: TextAssessmentResult) => {
    if (!currentText) return;

    const nextAnswers = {
      ...allAnswersRef.current,
      [currentText.id]: result,
    };

    allAnswersRef.current = nextAnswers;
    setActiveAssessmentDraft(null);

    // Check if there are more texts
    if (config && currentTextIndex < config.texts.length - 1) {
      const nextTextIndex = currentTextIndex + 1;
      setCurrentTextIndex((prev) => prev + 1);
      setCurrentSlideIndex(0);
      setPhase('reading');
      checkpointDraft({
        force: true,
        phaseValue: 'reading',
        textIndex: nextTextIndex,
        slideIndex: 0,
        answers: nextAnswers,
        assessmentDraft: null,
      });
    } else {
      // All texts done — go to post-calibration or completed
      if (config?.calibrationSettings?.enabled) {
        setPhase('post-calibration');
        checkpointDraft({
          force: true,
          phaseValue: 'post-calibration',
          textIndex: currentTextIndex,
          slideIndex: currentSlideIndex,
          answers: nextAnswers,
          assessmentDraft: null,
        });
      } else {
        checkpointDraft({
          force: true,
          phaseValue: 'completed',
          textIndex: currentTextIndex,
          slideIndex: currentSlideIndex,
          answers: nextAnswers,
          assessmentDraft: null,
        });
        void persistSession(nextAnswers);
        setPhase('completed');
      }

    }
  }, [checkpointDraft, config, currentSlideIndex, currentText, currentTextIndex, persistSession]);

  const handleAssessmentProgress = useCallback((draft: AssessmentDraftState | null) => {
    setActiveAssessmentDraft(draft);
    checkpointDraft({ assessmentDraft: draft, force: false });
  }, [checkpointDraft]);

  // Post-calibration done → stop recordings, move to completed
  const handlePostCalibrationComplete = useCallback(() => {
    if (exitAfterPostCalibration) {
      void (async () => {
        try {
          await recorderRef.current.stopAll();
        } catch (e) {
          console.error('Error stopping recordings:', e);
        }

        checkpointDraft({
          force: true,
          phaseValue: 'post-calibration',
          textIndex: currentTextIndex,
          slideIndex: currentSlideIndex,
          answers: allAnswersRef.current,
          assessmentDraft: activeAssessmentDraft,
        });

        resetToRegistrationState();
        setExitAfterPostCalibration(false);
      })();
      return;
    }

    const totalTexts = config?.texts.length || 0;
    const answeredCount = Object.keys(allAnswersRef.current).length;

    if (answeredCount < totalTexts) {
      const resumeTextIndex = findFirstUnansweredTextIndex(allAnswersRef.current);
      setCurrentTextIndex(resumeTextIndex);
      setCurrentSlideIndex(0);
      setPhase('reading');
      checkpointDraft({
        force: true,
        phaseValue: 'reading',
        textIndex: resumeTextIndex,
        slideIndex: 0,
        answers: allAnswersRef.current,
        assessmentDraft: activeAssessmentDraft,
      });
      return;
    }

    setPhase('completed');
    checkpointDraft({
      force: true,
      phaseValue: 'completed',
      textIndex: currentTextIndex,
      slideIndex: currentSlideIndex,
      answers: allAnswersRef.current,
      assessmentDraft: null,
    });

    void (async () => {
      try {
        await recorderRef.current.stopAll();
      } catch (e) {
        console.error('Error stopping recordings:', e);
      }

      checkpointDraft({
        force: true,
        phaseValue: 'completed',
        textIndex: currentTextIndex,
        slideIndex: currentSlideIndex,
        answers: allAnswersRef.current,
        assessmentDraft: null,
      });

      await persistSession(allAnswersRef.current);
    })();
  }, [activeAssessmentDraft, checkpointDraft, config?.texts.length, currentSlideIndex, currentTextIndex, exitAfterPostCalibration, findFirstUnansweredTextIndex, persistSession, resetToRegistrationState]);

  // Retry permissions
  const handleRetryPermissions = useCallback(() => {
    setPermissionStatus('requesting');
    setPermissionError(null);
    recorderRef.current
      .requestPermissions()
      .then(() => {
        try {
          setPermissionStatus('granted');
          recorderRef.current.startAll(participant?.name || 'unknown');
          setPhase('pre-calibration');
        } catch (err) {
          setPermissionStatus('error');
          setPermissionError(err instanceof Error ? err.message : 'Could not start recordings');
        }
      })
      .catch((err: Error) => {
        setPermissionStatus('error');
        setPermissionError(err.message || 'Permission denied');
      });
  }, [participant]);

  // Skip recordings if permission denied
  const handleSkipRecording = useCallback(() => {
    const nextPhase: ExperimentPhase = config?.calibrationSettings.enabled ? 'pre-calibration' : 'reading';

    const resumedTarget = resumeFromHistoryDraft
      ? deriveResumeTarget(resumeFromHistoryDraft)
      : null;
    const nextTextIndex = resumedTarget ? resumedTarget.textIndex : 0;
    const nextSlideIndex = resumedTarget ? resumedTarget.slideIndex : 0;

    setPhase(nextPhase);
    setCurrentTextIndex(nextTextIndex);
    setCurrentSlideIndex(nextSlideIndex);
    checkpointDraft({
      force: true,
      phaseValue: nextPhase,
      textIndex: nextTextIndex,
      slideIndex: nextSlideIndex,
      answers: allAnswersRef.current,
      assessmentDraft: activeAssessmentDraft,
    });
  }, [activeAssessmentDraft, checkpointDraft, config, deriveResumeTarget, resumeFromHistoryDraft]);

  const handleExitExperiment = useCallback(() => {
    const shouldExit = window.confirm('End this session and return to registration? Current progress will stay saved and can be resumed later.');
    if (!shouldExit) return;

    if (
      config?.calibrationSettings?.enabled
      && phase !== 'completed'
      && phase !== 'post-calibration'
      && !exitAfterPostCalibration
    ) {
      setExitAfterPostCalibration(true);
      setPhase('post-calibration');
      checkpointDraft({
        force: true,
        phaseValue: 'post-calibration',
        textIndex: currentTextIndex,
        slideIndex: currentSlideIndex,
        answers: allAnswersRef.current,
        assessmentDraft: activeAssessmentDraft,
      });
      return;
    }

    checkpointDraft({
      force: true,
      phaseValue: phase,
      textIndex: currentTextIndex,
      slideIndex: currentSlideIndex,
      answers: allAnswersRef.current,
      assessmentDraft: activeAssessmentDraft,
    });

    void recorderRef.current.stopAll().catch(() => undefined);

    resetToRegistrationState();
  }, [activeAssessmentDraft, checkpointDraft, config?.calibrationSettings?.enabled, currentSlideIndex, currentTextIndex, exitAfterPostCalibration, phase, resetToRegistrationState]);

  const handleStartNewParticipant = useCallback(() => {
    void recorderRef.current.stopAll().catch(() => undefined);
    setResumeFromHistoryDraft(null);
    setExitAfterPostCalibration(false);
    resetToRegistrationState();
  }, [resetToRegistrationState]);

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-100 mb-4">
            <div className="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-surface-500 text-sm">Loading experiment configuration...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !config) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-lg font-bold text-red-800 mb-2">Configuration Error</h2>
          <p className="text-red-600 text-sm">{error || 'Failed to load experiment configuration.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${experimentStarted ? 'h-screen overflow-hidden' : 'min-h-screen'} flex flex-col`}>
      {/* Experiment top bar */}
      <header className="px-3 sm:px-6 py-3 flex items-center justify-between gap-3 border-b border-surface-100/60 bg-white/60 backdrop-blur-md">
        <h1 className="text-xs sm:text-sm font-semibold text-surface-700 tracking-wide truncate">{config.experimentTitle}</h1>

        {!experimentStarted && pathname === '/' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-100 text-surface-600 hover:bg-surface-200 transition-all cursor-pointer"
            >
              History
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-100 text-surface-600 hover:bg-surface-200 transition-all cursor-pointer"
            >
              Settings
            </button>
          </div>
        )}

        {experimentStarted && pathname === '/' && (
          <div className="flex items-center gap-2 shrink-0">
            {phase !== 'completed' && (
              <button
                type="button"
                onClick={handleExitExperiment}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-100 text-surface-600 hover:bg-surface-200 transition-all cursor-pointer"
              >
                Exit session
              </button>
            )}
          </div>
        )}
      </header>

      {settingsSyncMessage && !experimentStarted && pathname === '/' && (
        <div className={`mx-3 sm:mx-6 mt-3 px-3 py-2 text-xs rounded-lg border ${settingsSyncStatus === 'error'
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-surface-50 border-surface-200 text-surface-600'
          }`}>
          {settingsSyncMessage}
        </div>
      )}

      {pathname === '/' && experimentStarted && phase !== 'completed' && sessionSyncStatus !== 'idle' && syncIndicatorMessage && (
        <div className={`mx-3 sm:mx-6 mt-3 px-3 py-2 text-xs rounded-lg border ${sessionSyncStatus === 'error'
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-surface-50 border-surface-200 text-surface-600'
          }`}>
          {syncIndicatorMessage}
        </div>
      )}

      <main className={`flex-1 min-h-0 ${experimentStarted ? 'overflow-hidden' : 'overflow-auto'}`}>
        {/* Phase Content */}
        {pathname === '/settings' && !experimentStarted && (
          <Suspense
            fallback={(
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-surface-500">Loading settings…</p>
              </div>
            )}
          >
            <ExperimentSettings
              initialConfig={config}
              onContinue={handleSettingsContinue}
              onBack={() => navigate('/')}
            />
          </Suspense>
        )}

        {pathname === '/history' && !experimentStarted && (
          <Suspense
            fallback={(
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-surface-500">Loading history…</p>
              </div>
            )}
          >
            <HistoryPage
              onBack={() => navigate('/')}
              onResumeDraft={handleResumeDraftFromHistory}
            />
          </Suspense>
        )}

        {pathname === '/' && phase === 'registration' && (
          <Registration
            onSubmit={handleRegistration}
          />
        )}

        {pathname === '/' && phase === 'instructions' && (
          <Instructions
            instructions={config.instructions}
            onBegin={handleBeginExperiment}
            onBack={handleStartNewParticipant}
          />
        )}

        {pathname === '/' && phase === 'requesting-permissions' && (
          <div className="permission-screen">
            <div className="permission-card">
              {permissionStatus === 'requesting' && (
                <>
                  <div className="permission-icon" style={{ background: 'linear-gradient(135deg, #818cf8, #6366f1)' }}>
                    <div className="permission-spinner" style={{ color: '#fff' }} />
                  </div>
                  <h2 className="text-xl font-bold text-surface-900 mb-2">Requesting Permissions</h2>
                  <p className="text-surface-500 text-sm">
                    Please allow screen sharing and camera access in the browser prompts to enable experiment tracking.
                  </p>
                  <button
                    onClick={handleExitExperiment}
                    className="mt-6 px-5 py-2.5 rounded-xl bg-surface-100 text-surface-600 font-semibold text-sm hover:bg-surface-200 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Cancel session
                  </button>
                </>
              )}

              {permissionStatus === 'error' && (
                <>
                  <div className="permission-icon" style={{ background: 'linear-gradient(135deg, #f87171, #ef4444)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-surface-900 mb-2">Permission Denied</h2>
                  <p className="text-surface-500 text-sm">
                    Screen and camera permissions are needed to record the experiment session.
                  </p>
                  {permissionError && (
                    <div className="permission-error">{permissionError}</div>
                  )}
                  <div className="flex gap-3 mt-6 justify-center">
                    <button
                      onClick={handleRetryPermissions}
                      className="px-5 py-2.5 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold text-sm shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={handleSkipRecording}
                      className="px-5 py-2.5 rounded-xl bg-surface-100 text-surface-600 font-semibold text-sm hover:bg-surface-200 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      Skip Recording
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {pathname === '/' && phase === 'pre-calibration' && (
          <CalibrationScreen
            durationSeconds={config.calibrationSettings.durationSeconds}
            onComplete={handlePreCalibrationComplete}
            label="Pre-Calibration"
            onSkip={handlePreCalibrationComplete}
          />
        )}

        {pathname === '/' && phase === 'reading' && currentText && (
          <ReadingSlide
            key={`${currentTextIndex}-${currentSlideIndex}`}
            text={currentSlides[currentSlideIndex]}
            slideIndex={currentSlideIndex}
            totalSlides={currentSlides.length}
            textTitle={currentText.title}
            textIndex={currentTextIndex}
            totalTexts={config.texts.length}
            minTimeSeconds={config.slideSettings.minTimeSeconds}
            maxTimeSeconds={config.slideSettings.maxTimeSeconds}
            onNext={handleNextSlide}
          />
        )}

        {pathname === '/' && phase === 'assessment' && currentText && (
          <Suspense
            fallback={(
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-surface-500">Loading assessment…</p>
              </div>
            )}
          >
            <PostAssessment
              textId={currentText.id}
              textTitle={currentText.title}
              questions={currentAssessmentQuestions}
              feedbackQuestions={currentFeedbackQuestions}
              settings={postAssessmentSettings}
              initialDraftState={activeAssessmentDraft}
              onProgress={handleAssessmentProgress}
              onSubmit={handleAssessmentSubmit}
            />
          </Suspense>
        )}

        {pathname === '/' && phase === 'post-calibration' && (
          <CalibrationScreen
            durationSeconds={config.calibrationSettings.durationSeconds}
            onComplete={handlePostCalibrationComplete}
            label="Post-Calibration"
            onSkip={handlePostCalibrationComplete}
          />
        )}

        {pathname === '/' && phase === 'completed' && participant && (
          <Completion
            participantName={participant.name}
            syncStatus={completionSyncStatus}
            syncMessage={sessionSyncMessage}
            onStartNew={handleStartNewParticipant}
          />
        )}
      </main>
    </div>
  );
}

export default App;
