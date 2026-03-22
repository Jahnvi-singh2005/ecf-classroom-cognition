import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import type {
  ExperimentConfig,
  ExperimentPhase,
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
import { buildParticipantKey, getProjectSettings, saveExperimentSession, saveProjectSettings } from './services/ExperimentDataService';
import { hasFirebaseConfig } from './services/firebase';
import Registration from './components/Registration';
import ExperimentSettings from './components/ExperimentSettings';
import Instructions from './components/Instructions';
import CalibrationScreen from './components/CalibrationScreen';
import ReadingSlide from './components/ReadingSlide';
import PostAssessment from './components/PostAssessment';
import Completion from './components/Completion';
import HistoryPage from './components/HistoryPage';

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
  const [sessionSyncStatus, setSessionSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sessionSyncMessage, setSessionSyncMessage] = useState<string | null>(null);
  const [hasPersistedSession, setHasPersistedSession] = useState(false);

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
          return remoteConfig || localConfig;
        } catch {
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
      setHasPersistedSession(true);
      setSessionSyncStatus('saved');
      setSessionSyncMessage('Session saved to Firebase.');
    } catch (persistError) {
      setSessionSyncStatus('error');
      setSessionSyncMessage(persistError instanceof Error ? persistError.message : 'Failed to save session to Firebase.');
    }
  }, [assignedCondition, config, hasPersistedSession, participant, sessionId, sessionStartedAt]);

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

  const handleRegistration = useCallback((data: { name: string; age: number; email?: string; notes?: string }) => {
    setParticipant(data as Participant);
    setSessionId(makeSessionId());
    setSessionStartedAt(null);
    setHasPersistedSession(false);
    setSessionSyncStatus('idle');
    setSessionSyncMessage(null);
    allAnswersRef.current = {};
    setPhase('instructions');
  }, [makeSessionId]);

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
      // No calibration — go straight to reading
      setPhase('reading');
      setCurrentTextIndex(0);
      setCurrentSlideIndex(0);
    }
  }, [config, participant, sessionStartedAt]);

  // Pre-calibration done → start reading
  const handlePreCalibrationComplete = useCallback(() => {
    setCurrentTextIndex(0);
    setCurrentSlideIndex(0);
    setPhase('reading');
  }, []);

  const handleNextSlide = useCallback(() => {
    if (currentSlideIndex < currentSlides.length - 1) {
      setCurrentSlideIndex((prev) => prev + 1);
    } else {
      // Reading done for this text, move to assessment
      setPhase('assessment');
    }
  }, [currentSlideIndex, currentSlides.length]);

  const handleAssessmentSubmit = useCallback((result: TextAssessmentResult) => {
    if (!currentText) return;

    const nextAnswers = {
      ...allAnswersRef.current,
      [currentText.id]: result,
    };

    allAnswersRef.current = nextAnswers;

    // Check if there are more texts
    if (config && currentTextIndex < config.texts.length - 1) {
      setCurrentTextIndex((prev) => prev + 1);
      setCurrentSlideIndex(0);
      setPhase('reading');
    } else {
      // All texts done — go to post-calibration or completed
      if (config?.calibrationSettings?.enabled) {
        setPhase('post-calibration');
      } else {
        void persistSession(nextAnswers);
        setPhase('completed');
      }

      // Log collected data to console
      console.log('=== EXPERIMENT DATA ===');
      console.log('Participant:', participant);
      console.log('Condition:', assignedCondition);
      console.log('Assessments:', {
        ...allAnswersRef.current,
        [currentText.id]: result,
      });
    }
  }, [currentText, config, currentTextIndex, participant, assignedCondition, persistSession]);

  // Post-calibration done → stop recordings, move to completed
  const handlePostCalibrationComplete = useCallback(() => {
    setPhase('completed');

    void (async () => {
      try {
        await recorderRef.current.stopAll();
      } catch (e) {
        console.error('Error stopping recordings:', e);
      }

      await persistSession(allAnswersRef.current);
    })();
  }, [persistSession]);

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
    setPhase(config?.calibrationSettings.enabled ? 'pre-calibration' : 'reading');
    setCurrentTextIndex(0);
    setCurrentSlideIndex(0);
  }, [config]);

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
    <div className="min-h-screen flex flex-col">
      {/* Experiment top bar */}
      <header className="px-6 py-3 flex items-center justify-between border-b border-surface-100/60 bg-white/60 backdrop-blur-md">
        <h1 className="text-sm font-semibold text-surface-700 tracking-wide">{config.experimentTitle}</h1>

        {!experimentStarted && pathname === '/' && (
          <div className="flex items-center gap-2">
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
      </header>

      {settingsSyncMessage && !experimentStarted && pathname === '/' && (
        <div className={`mx-6 mt-3 px-3 py-2 text-xs rounded-lg border ${settingsSyncStatus === 'error'
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-surface-50 border-surface-200 text-surface-600'
          }`}>
          {settingsSyncMessage}
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-hidden">
        {/* Phase Content */}
        {pathname === '/settings' && !experimentStarted && (
          <ExperimentSettings
            initialConfig={config}
            onContinue={handleSettingsContinue}
            onBack={() => navigate('/')}
          />
        )}

        {pathname === '/history' && !experimentStarted && (
          <HistoryPage onBack={() => navigate('/')} />
        )}

        {pathname === '/' && phase === 'registration' && (
          <Registration onSubmit={handleRegistration} />
        )}

        {pathname === '/' && phase === 'instructions' && (
          <Instructions instructions={config.instructions} onBegin={handleBeginExperiment} />
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
          <PostAssessment
            textId={currentText.id}
            textTitle={currentText.title}
            questions={currentAssessmentQuestions}
            feedbackQuestions={currentFeedbackQuestions}
            settings={postAssessmentSettings}
            onSubmit={handleAssessmentSubmit}
          />
        )}

        {pathname === '/' && phase === 'post-calibration' && (
          <CalibrationScreen
            durationSeconds={config.calibrationSettings.durationSeconds}
            onComplete={handlePostCalibrationComplete}
            label="Post-Calibration"
          />
        )}

        {pathname === '/' && phase === 'completed' && participant && (
          <Completion
            participantName={participant.name}
            syncStatus={sessionSyncStatus}
            syncMessage={sessionSyncMessage}
          />
        )}
      </main>
    </div>
  );
}

export default App;
