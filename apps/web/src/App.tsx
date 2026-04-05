import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";

type TabKey = "dashboard" | "courses" | "export" | "achievements";
type TaskType = "assignment" | "quiz";
type AssignmentStatus = "not_submitted" | "submitted_ungraded" | "submitted_graded" | "draft" | "overdue";
type ThemePresetKey = "calm" | "sunrise" | "ocean" | "graphite";
type PatternType = "dots" | "grid" | "diagonal" | "waves";

interface ConnectResponse {
  sessionId: string;
  siteName: string;
  version: string;
  userFullName: string;
}

interface CourseSummary {
  id: number;
  shortName: string;
  fullName: string;
  pointsEarned: number;
  pointsMax: number;
}

interface LearningItem {
  id: number;
  itemType: TaskType;
  courseId: number;
  courseName: string;
  name: string;
  dueAt: string | null;
  status: AssignmentStatus;
  submittedAt: string | null;
  grade: number | null;
  maxGrade: number | null;
  url: string;
}

interface DashboardSummary {
  total: number;
  done: number;
  submittedNotGraded: number;
  overdue: number;
  progressPercent: number;
}

interface WeeklyProgressDay {
  date: string;
  submittedCount: number;
}

interface WeeklyStreak {
  scopeDays: number;
  currentStreak: number;
  bestStreak: number;
  totalSubmitted: number;
  byDay: WeeklyProgressDay[];
}

interface AchievementViewModel {
  id: string;
  title: string;
  description: string;
  value: number;
  target: number;
  unit: string;
  progressPercent: number;
  unlocked: boolean;
  hint: string;
}

interface ThemePreset {
  label: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  panel: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  accentSoft: string;
  ambientLeft: string;
  ambientRight: string;
  patternInk: string;
}

interface DashboardResponse {
  courses: CourseSummary[];
  items?: LearningItem[];
  assignments?: LearningItem[];
  summary: DashboardSummary;
  weeklyStreak?: WeeklyStreak;
}

interface CourseFeedResponse {
  course: CourseSummary;
  items: LearningItem[];
  summary: DashboardSummary;
}

interface CoursesResponse {
  courses: CourseSummary[];
}

interface ExportStatus {
  id: string;
  state: string;
  progress: number;
  downloadPath: string | null;
  error: string | null;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  not_submitted: "Не сдано",
  submitted_ungraded: "Сдано, не проверено",
  submitted_graded: "Сдано и проверено",
  draft: "Черновик",
  overdue: "Просрочено"
};

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  assignment: "Задание",
  quiz: "Тест"
};

const THEME_STORAGE_KEY = "moodle-tracker-theme-v1";

const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  calm: {
    label: "Calm Sand",
    bgStart: "#f0ece4",
    bgMid: "#f7f8f4",
    bgEnd: "#ecf4f2",
    panel: "rgba(255, 255, 255, 0.82)",
    text: "#132024",
    muted: "#506067",
    line: "rgba(19, 32, 36, 0.12)",
    accent: "#0c7c62",
    accentSoft: "#dff3ec",
    ambientLeft: "#e6b873",
    ambientRight: "#64a5a2",
    patternInk: "rgba(16, 43, 46, 0.16)"
  },
  sunrise: {
    label: "Sunrise Peach",
    bgStart: "#fff0e4",
    bgMid: "#fffaf3",
    bgEnd: "#f3efe8",
    panel: "rgba(255, 255, 255, 0.84)",
    text: "#2b1e19",
    muted: "#726056",
    line: "rgba(43, 30, 25, 0.14)",
    accent: "#c0592a",
    accentSoft: "#ffe5d8",
    ambientLeft: "#f2a766",
    ambientRight: "#f6ce86",
    patternInk: "rgba(82, 41, 20, 0.16)"
  },
  ocean: {
    label: "Ocean Mint",
    bgStart: "#e8f5f4",
    bgMid: "#f3fbfd",
    bgEnd: "#e4f0f6",
    panel: "rgba(255, 255, 255, 0.86)",
    text: "#112b34",
    muted: "#4f6972",
    line: "rgba(17, 43, 52, 0.14)",
    accent: "#176f9b",
    accentSoft: "#dff0fb",
    ambientLeft: "#70b9c2",
    ambientRight: "#79d5b6",
    patternInk: "rgba(16, 74, 90, 0.15)"
  },
  graphite: {
    label: "Graphite Paper",
    bgStart: "#eceff3",
    bgMid: "#f8fafc",
    bgEnd: "#e9edf2",
    panel: "rgba(255, 255, 255, 0.84)",
    text: "#1e2430",
    muted: "#5a6170",
    line: "rgba(30, 36, 48, 0.14)",
    accent: "#3d5a93",
    accentSoft: "#e3ebfb",
    ambientLeft: "#9ea6c8",
    ambientRight: "#b7bac7",
    patternInk: "rgba(26, 34, 53, 0.14)"
  }
};

const PATTERN_LABELS: Record<PatternType, string> = {
  dots: "Dots",
  grid: "Grid",
  diagonal: "Diagonal",
  waves: "Waves"
};

const DONE_STATUSES = new Set<AssignmentStatus>(["submitted_ungraded", "submitted_graded"]);

function isThemePresetKey(value: string): value is ThemePresetKey {
  return value in THEME_PRESETS;
}

function isPatternType(value: string): value is PatternType {
  return value in PATTERN_LABELS;
}

function pickEmoji(value: string): string {
  const trimmed = value.trim();
  return trimmed.slice(0, 2) || "✨";
}

function createPatternBackground(pattern: PatternType, color: string): { image: string; size: string } {
  if (pattern === "grid") {
    return {
      image: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
      size: "30px 30px"
    };
  }

  if (pattern === "diagonal") {
    return {
      image: `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 18px)`,
      size: "28px 28px"
    };
  }

  if (pattern === "waves") {
    return {
      image: `radial-gradient(circle at 0% 50%, transparent 24px, ${color} 25px, transparent 26px), radial-gradient(circle at 100% 50%, transparent 24px, ${color} 25px, transparent 26px)`,
      size: "58px 34px"
    };
  }

  return {
    image: `radial-gradient(circle, ${color} 1.4px, transparent 1.4px)`,
    size: "24px 24px"
  };
}

function createEmojiPatternDataUrl(emoji: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' font-size='24'>${emoji}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Без дедлайна";
  }
  return new Date(value).toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusClass(status: AssignmentStatus): string {
  if (status === "submitted_graded") {
    return "chip chip-success";
  }
  if (status === "submitted_ungraded") {
    return "chip chip-warning";
  }
  if (status === "overdue") {
    return "chip chip-danger";
  }
  if (status === "draft") {
    return "chip chip-muted";
  }
  return "chip chip-default";
}

function taskTypeClass(itemType: TaskType): string {
  return itemType === "quiz" ? "chip chip-info" : "chip chip-muted";
}

function isDoneStatus(status: AssignmentStatus): boolean {
  return DONE_STATUSES.has(status);
}

function toPercent(done: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((done / total) * 100);
}

function formatMetric(value: number, unit: string): string {
  const rounded = Math.round(value);
  if (unit === "%") {
    return `${rounded}%`;
  }
  return `${rounded} ${unit}`;
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDayKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatWeekday(day: string): string {
  return parseDayKey(day).toLocaleDateString("ru-RU", { weekday: "short" });
}

function fallbackWeeklyStreak(items: LearningItem[], scopeDays = 7): WeeklyStreak {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - (scopeDays - 1));

  const byDay: WeeklyProgressDay[] = [];
  for (let i = 0; i < scopeDays; i += 1) {
    const cursor = new Date(start);
    cursor.setDate(start.getDate() + i);
    byDay.push({ date: dayKey(cursor), submittedCount: 0 });
  }

  const indexByDate = new Map(byDay.map((day, index) => [day.date, index]));
  for (const item of items) {
    if (!item.submittedAt) {
      continue;
    }

    const submitted = new Date(item.submittedAt);
    if (Number.isNaN(submitted.getTime())) {
      continue;
    }

    const normalized = new Date(submitted.getFullYear(), submitted.getMonth(), submitted.getDate());
    if (normalized < start || normalized > end) {
      continue;
    }

    const index = indexByDate.get(dayKey(normalized));
    if (typeof index === "number") {
      byDay[index].submittedCount += 1;
    }
  }

  let currentStreak = 0;
  for (let i = byDay.length - 1; i >= 0; i -= 1) {
    if (byDay[i].submittedCount > 0) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  let bestStreak = 0;
  let running = 0;
  for (const day of byDay) {
    if (day.submittedCount > 0) {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
  }

  const totalSubmitted = byDay.reduce((sum, day) => sum + day.submittedCount, 0);

  return {
    scopeDays,
    currentStreak,
    bestStreak,
    totalSubmitted,
    byDay
  };
}

export default function App(): JSX.Element {
  const [themePreset, setThemePreset] = useState<ThemePresetKey>("calm");
  const [backgroundPattern, setBackgroundPattern] = useState<PatternType>("dots");
  const [backgroundEmoji, setBackgroundEmoji] = useState("✨");

  const [tab, setTab] = useState<TabKey>("dashboard");
  const [connectForm, setConnectForm] = useState({ baseUrl: "https://sdo.sut.ru", username: "", password: "" });
  const [session, setSession] = useState<ConnectResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exportScope, setExportScope] = useState<"all" | "course" | "section">("all");
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [courseItems, setCourseItems] = useState<LearningItem[]>([]);
  const [courseSummary, setCourseSummary] = useState<DashboardSummary | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [sectionNumber, setSectionNumber] = useState<number>(0);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        preset?: string;
        pattern?: string;
        emoji?: string;
      };

      if (parsed.preset && isThemePresetKey(parsed.preset)) {
        setThemePreset(parsed.preset);
      }
      if (parsed.pattern && isPatternType(parsed.pattern)) {
        setBackgroundPattern(parsed.pattern);
      }
      if (typeof parsed.emoji === "string") {
        setBackgroundEmoji(pickEmoji(parsed.emoji));
      }
    } catch {
      // ignore invalid storage payload
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({
        preset: themePreset,
        pattern: backgroundPattern,
        emoji: pickEmoji(backgroundEmoji)
      })
    );
  }, [backgroundEmoji, backgroundPattern, themePreset]);

  const activeTheme = THEME_PRESETS[themePreset];
  const patternStyle = useMemo<CSSProperties>(() => {
    const pattern = createPatternBackground(backgroundPattern, activeTheme.patternInk);
    return {
      backgroundImage: pattern.image,
      backgroundSize: pattern.size
    };
  }, [activeTheme.patternInk, backgroundPattern]);

  const emojiStyle = useMemo<CSSProperties>(
    () => ({
      backgroundImage: createEmojiPatternDataUrl(pickEmoji(backgroundEmoji)),
      backgroundSize: "88px 88px"
    }),
    [backgroundEmoji]
  );

  const appThemeStyle = useMemo(
    () =>
      ({
        "--bg-grad-start": activeTheme.bgStart,
        "--bg-grad-mid": activeTheme.bgMid,
        "--bg-grad-end": activeTheme.bgEnd,
        "--panel": activeTheme.panel,
        "--text": activeTheme.text,
        "--muted": activeTheme.muted,
        "--line": activeTheme.line,
        "--accent": activeTheme.accent,
        "--accent-soft": activeTheme.accentSoft,
        "--ambient-left": activeTheme.ambientLeft,
        "--ambient-right": activeTheme.ambientRight
      }) as CSSProperties,
    [activeTheme]
  );

  const progress = dashboard?.summary.progressPercent ?? 0;
  const dashboardItems = useMemo(() => dashboard?.items ?? dashboard?.assignments ?? [], [dashboard]);
  const weeklyStreak = useMemo(
    () => dashboard?.weeklyStreak ?? fallbackWeeklyStreak(dashboardItems),
    [dashboard?.weeklyStreak, dashboardItems]
  );
  const doneCount = dashboard?.summary.done ?? dashboardItems.filter((item) => isDoneStatus(item.status)).length;
  const overallCompletionPercent = toPercent(doneCount, dashboard?.summary.total ?? dashboardItems.length);

  const assignmentCompletion = useMemo(() => {
    const assignmentItems = dashboardItems.filter((item) => item.itemType === "assignment");
    const doneAssignments = assignmentItems.filter((item) => isDoneStatus(item.status)).length;
    return {
      total: assignmentItems.length,
      done: doneAssignments,
      percent: toPercent(doneAssignments, assignmentItems.length)
    };
  }, [dashboardItems]);

  const assignmentProgressForAchievement =
    assignmentCompletion.total > 0 ? assignmentCompletion.percent : overallCompletionPercent;
  const assignmentAchievementDescription =
    assignmentCompletion.total > 0
      ? "Закрой 30% именно заданий."
      : "Закрой 30% задач (в текущих курсах считаем общий прогресс).";

  const bestCourseCompletionPercent = useMemo(() => {
    const statsByCourse = new Map<number, { total: number; done: number }>();

    for (const item of dashboardItems) {
      const stats = statsByCourse.get(item.courseId) ?? { total: 0, done: 0 };
      stats.total += 1;
      if (isDoneStatus(item.status)) {
        stats.done += 1;
      }
      statsByCourse.set(item.courseId, stats);
    }

    let best = 0;
    for (const stats of statsByCourse.values()) {
      best = Math.max(best, toPercent(stats.done, stats.total));
    }

    return best;
  }, [dashboardItems]);

  const activeWeekDays = weeklyStreak.byDay.filter((day) => day.submittedCount > 0).length;
  const gradedCount = dashboardItems.filter((item) => item.status === "submitted_graded").length;

  const achievements = useMemo<AchievementViewModel[]>(() => {
    const raw = [
      {
        id: "first-task",
        title: "Первый шаг",
        description: "Сдай хотя бы 1 задачу или тест.",
        value: doneCount,
        target: 1,
        unit: "шт."
      },
      {
        id: "streak-2",
        title: "Мини-стрик",
        description: "Держи стрик 2 дня подряд.",
        value: weeklyStreak.currentStreak,
        target: 2,
        unit: "дн."
      },
      {
        id: "streak-4",
        title: "Ритм недели",
        description: "Сделай стрик 4 дня подряд.",
        value: weeklyStreak.currentStreak,
        target: 4,
        unit: "дн."
      },
      {
        id: "week-submits-5",
        title: "Пять закрытий",
        description: "Сдай 5 задач за последние 7 дней.",
        value: weeklyStreak.totalSubmitted,
        target: 5,
        unit: "шт."
      },
      {
        id: "week-active-3",
        title: "Три активных дня",
        description: "Сдавай минимум 3 дня в неделю.",
        value: activeWeekDays,
        target: 3,
        unit: "дн."
      },
      {
        id: "overall-20",
        title: "Разогрев",
        description: "Достигни 20% общего прогресса.",
        value: overallCompletionPercent,
        target: 20,
        unit: "%"
      },
      {
        id: "assignment-30",
        title: "Сильные задания",
        description: assignmentAchievementDescription,
        value: assignmentProgressForAchievement,
        target: 30,
        unit: "%"
      },
      {
        id: "course-25",
        title: "Курс в движении",
        description: "Доведите любой курс до 25% выполнения.",
        value: bestCourseCompletionPercent,
        target: 25,
        unit: "%"
      },
      {
        id: "course-50",
        title: "Половина курса",
        description: "Доведите любой курс до 50% выполнения.",
        value: bestCourseCompletionPercent,
        target: 50,
        unit: "%"
      },
      {
        id: "graded-3",
        title: "Первые оценки",
        description: "Получи 3 проверенные сдачи.",
        value: gradedCount,
        target: 3,
        unit: "шт."
      }
    ];

    return raw
      .map((item) => {
        const progressPercent = Math.max(0, Math.min(100, Math.round((item.value / item.target) * 100)));
        const unlocked = item.value >= item.target;
        const remaining = Math.max(0, Math.ceil(item.target - item.value));

        return {
          ...item,
          progressPercent,
          unlocked,
          hint: unlocked ? "Получено. Так держать." : `Осталось: ${formatMetric(remaining, item.unit)}`
        };
      })
      .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progressPercent - a.progressPercent);
  }, [
    activeWeekDays,
    assignmentAchievementDescription,
    assignmentProgressForAchievement,
    bestCourseCompletionPercent,
    doneCount,
    gradedCount,
    overallCompletionPercent,
    weeklyStreak.currentStreak,
    weeklyStreak.totalSubmitted
  ]);

  const unlockedAchievements = achievements.filter((item) => item.unlocked).length;
  const nextAchievement = achievements.find((item) => !item.unlocked) ?? null;

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  const loadCourseItems = async (sessionId: string, courseId: number): Promise<void> => {
    setCourseLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/courses/${courseId}/items?sessionId=${sessionId}`);
      const payload = (await response.json()) as CourseFeedResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось загрузить курс.");
      }

      setCourseItems(payload.items);
      setCourseSummary(payload.summary);
    } finally {
      setCourseLoading(false);
    }
  };

  const refreshData = async (sessionId: string): Promise<void> => {
    const [dashboardResp, coursesResp] = await Promise.all([
      fetch(`${API_URL}/api/dashboard?sessionId=${sessionId}`),
      fetch(`${API_URL}/api/courses?sessionId=${sessionId}`)
    ]);

    if (!dashboardResp.ok) {
      const payload = (await dashboardResp.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Не удалось загрузить задания.");
    }

    if (!coursesResp.ok) {
      const payload = (await coursesResp.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Не удалось загрузить курсы.");
    }

    const dashboardPayload = (await dashboardResp.json()) as DashboardResponse;
    const coursesPayload = (await coursesResp.json()) as CoursesResponse;

    setDashboard(dashboardPayload);
    setCourses(coursesPayload.courses);

    const nextCourseId = selectedCourseId ?? coursesPayload.courses[0]?.id ?? null;
    if (nextCourseId) {
      setSelectedCourseId(nextCourseId);
      await loadCourseItems(sessionId, nextCourseId);
    }
  };

  const handleConnect = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectForm)
      });

      const payload = (await response.json()) as ConnectResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Ошибка подключения к Moodle.");
      }

      setSession({
        sessionId: payload.sessionId,
        siteName: payload.siteName,
        version: payload.version,
        userFullName: payload.userFullName
      });

      await refreshData(payload.sessionId);
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : "Ошибка подключения";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartExport = async (): Promise<void> => {
    if (!session) {
      return;
    }

    setError(null);

    const payload: {
      sessionId: string;
      scope: "all" | "course" | "section";
      courseId?: number;
      sectionNumber?: number;
    } = {
      sessionId: session.sessionId,
      scope: exportScope
    };

    if ((exportScope === "course" || exportScope === "section") && selectedCourseId) {
      payload.courseId = selectedCourseId;
    }

    if (exportScope === "section") {
      payload.sectionNumber = sectionNumber;
    }

    const response = await fetch(`${API_URL}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const responsePayload = (await response.json()) as { jobId?: string; error?: string };
    if (!response.ok || !responsePayload.jobId) {
      throw new Error(responsePayload.error ?? "Не удалось запустить экспорт.");
    }

    setExportStatus({
      id: responsePayload.jobId,
      state: "waiting",
      progress: 0,
      downloadPath: null,
      error: null
    });
  };

  useEffect(() => {
    if (!exportStatus?.id) {
      return;
    }

    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/export/${exportStatus.id}`);
        const payload = (await response.json()) as ExportStatus & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Не удалось получить статус экспорта.");
        }

        if (!cancelled) {
          setExportStatus(payload);
        }
      } catch (pollError) {
        if (!cancelled) {
          const message = pollError instanceof Error ? pollError.message : "Ошибка опроса статуса";
          setError(message);
        }
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [exportStatus?.id]);

  return (
    <div className="app-shell" style={appThemeStyle}>
      <div className="pattern-layer" style={patternStyle} />
      <div className="emoji-layer" style={emojiStyle} />
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <main className="container">
        <header className="hero">
          <h1>Moodle Task Tracker</h1>
          <p>Единый экран задач, прогресса, статусов проверки и экспорта материалов курса в PDF.</p>
        </header>

        <section className="panel theme-panel">
          <div className="theme-row">
            <label>
              Тема
              <select value={themePreset} onChange={(event) => setThemePreset(event.target.value as ThemePresetKey)}>
                {Object.entries(THEME_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Pattern
              <select
                value={backgroundPattern}
                onChange={(event) => setBackgroundPattern(event.target.value as PatternType)}
              >
                {Object.entries(PATTERN_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Emoji
              <input
                type="text"
                value={backgroundEmoji}
                onChange={(event) => setBackgroundEmoji(pickEmoji(event.target.value))}
                maxLength={2}
              />
            </label>

            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setThemePreset("calm");
                setBackgroundPattern("dots");
                setBackgroundEmoji("✨");
              }}
            >
              Сбросить тему
            </button>
          </div>
          <p className="theme-hint">Выбери emoji и pattern для фона. Настройки сохраняются автоматически.</p>
        </section>

        <section className="panel">
          <form className="connect-grid" onSubmit={handleConnect}>
            <label>
              LMS URL
              <input
                type="url"
                value={connectForm.baseUrl}
                onChange={(event) => setConnectForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                required
              />
            </label>
            <label>
              Логин
              <input
                type="text"
                value={connectForm.username}
                onChange={(event) => setConnectForm((prev) => ({ ...prev, username: event.target.value }))}
                required
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={connectForm.password}
                onChange={(event) => setConnectForm((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
            </label>
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Подключение..." : "Подключиться"}
            </button>
          </form>

          {session && (
            <div className="session-meta">
              <span>{session.siteName}</span>
              <span>{session.userFullName}</span>
              <span>{session.version}</span>
              <button
                type="button"
                onClick={() => {
                  refreshData(session.sessionId).catch((refreshError) => {
                    const message =
                      refreshError instanceof Error ? refreshError.message : "Не удалось обновить данные.";
                    setError(message);
                  });
                }}
              >
                Обновить
              </button>
            </div>
          )}
        </section>

        {error && <div className="error-box">{error}</div>}

        {session && dashboard && (
          <>
            <nav className="tabs">
              <button className={tab === "dashboard" ? "tab active" : "tab"} onClick={() => setTab("dashboard")}>Дашборд</button>
              <button className={tab === "courses" ? "tab active" : "tab"} onClick={() => setTab("courses")}>Курсы</button>
              <button className={tab === "achievements" ? "tab active" : "tab"} onClick={() => setTab("achievements")}>Ачивки</button>
              <button className={tab === "export" ? "tab active" : "tab"} onClick={() => setTab("export")}>Экспорт PDF</button>
            </nav>

            {tab === "dashboard" && (
              <section className="panel">
                <div className="stats-row">
                  <div>
                    <p className="kpi-label">Прогресс</p>
                    <p className="kpi-value">{progress}%</p>
                  </div>
                  <div>
                    <p className="kpi-label">Всего задач и тестов</p>
                    <p className="kpi-value">{dashboard.summary.total}</p>
                  </div>
                  <div>
                    <p className="kpi-label">Сдано, не проверено</p>
                    <p className="kpi-value">{dashboard.summary.submittedNotGraded}</p>
                  </div>
                  <div>
                    <p className="kpi-label">Просрочено</p>
                    <p className="kpi-value">{dashboard.summary.overdue}</p>
                  </div>
                </div>

                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>

                <div className="streak-panel">
                  <div className="streak-head">
                    <div>
                      <p className="kpi-label">Стрик активности (неделя)</p>
                      <p className="kpi-value">{weeklyStreak.currentStreak} дн.</p>
                    </div>
                    <div className="streak-metrics">
                      <span>Сдано за 7 дней: {weeklyStreak.totalSubmitted}</span>
                      <span>Лучший стрик: {weeklyStreak.bestStreak} дн.</span>
                    </div>
                  </div>

                  <div className="streak-week-grid">
                    {weeklyStreak.byDay.map((day) => (
                      <div key={day.date} className="streak-day-cell">
                        <span>{formatWeekday(day.date)}</span>
                        <strong>{day.submittedCount}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="assignment-list">
                  {dashboardItems.map((item) => (
                    <article key={`${item.itemType}-${item.id}`} className="assignment-card">
                      <div className="assignment-head">
                        <div>
                          <p className="course-name">{item.courseName}</p>
                          <h3>{item.name}</h3>
                        </div>
                        <div className="chips-inline">
                          <span className={taskTypeClass(item.itemType)}>{TASK_TYPE_LABELS[item.itemType]}</span>
                          <span className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</span>
                        </div>
                      </div>

                      <div className="assignment-meta">
                        <span>Дедлайн: {formatDate(item.dueAt)}</span>
                        <span>Сдано: {formatDate(item.submittedAt)}</span>
                        <span>
                          Балл: {item.grade !== null ? item.grade : "-"}
                          {item.maxGrade !== null ? ` / ${item.maxGrade}` : ""}
                        </span>
                      </div>

                      <div className="action-row">
                        <a href={item.url} target="_blank" rel="noreferrer" className="link-btn">
                          Открыть в Moodle
                        </a>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => {
                            if (!session) {
                              return;
                            }
                            setTab("courses");
                            setSelectedCourseId(item.courseId);
                            loadCourseItems(session.sessionId, item.courseId).catch((courseError) => {
                              const message =
                                courseError instanceof Error ? courseError.message : "Не удалось открыть курс.";
                              setError(message);
                            });
                          }}
                        >
                          Перейти в курс
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {tab === "courses" && (
              <section className="panel">
                <div className="course-grid">
                  {courses.map((course) => {
                    const percent = course.pointsMax > 0 ? Math.round((course.pointsEarned / course.pointsMax) * 100) : 0;
                    return (
                      <article key={course.id} className="course-card">
                        <p className="course-short">{course.shortName}</p>
                        <h3>{course.fullName}</h3>
                        <p>
                          {course.pointsEarned} / {course.pointsMax} баллов ({percent}%)
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (!session) {
                              return;
                            }
                            setSelectedCourseId(course.id);
                            loadCourseItems(session.sessionId, course.id).catch((courseError) => {
                              const message =
                                courseError instanceof Error ? courseError.message : "Не удалось открыть курс.";
                              setError(message);
                            });
                          }}
                        >
                          Открыть задания и тесты
                        </button>
                      </article>
                    );
                  })}
                </div>

                {selectedCourse && (
                  <div className="course-detail">
                    <div className="course-detail-head">
                      <div>
                        <p className="course-short">{selectedCourse.shortName}</p>
                        <h3>{selectedCourse.fullName}</h3>
                      </div>
                      {courseSummary && (
                        <div className="course-detail-summary">
                          <span>Задач: {courseSummary.total}</span>
                          <span>Сдано: {courseSummary.done}</span>
                          <span>Не проверено: {courseSummary.submittedNotGraded}</span>
                          <span>Прогресс: {courseSummary.progressPercent}%</span>
                        </div>
                      )}
                    </div>

                    {courseLoading && <p className="course-empty">Загрузка курса...</p>}

                    {!courseLoading && courseItems.length === 0 && (
                      <p className="course-empty">В этом курсе пока нет заданий и тестов.</p>
                    )}

                    {!courseLoading && courseItems.length > 0 && (
                      <div className="assignment-list">
                        {courseItems.map((item) => (
                          <article key={`${item.itemType}-${item.id}`} className="assignment-card">
                            <div className="assignment-head">
                              <h3>{item.name}</h3>
                              <div className="chips-inline">
                                <span className={taskTypeClass(item.itemType)}>{TASK_TYPE_LABELS[item.itemType]}</span>
                                <span className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</span>
                              </div>
                            </div>

                            <div className="assignment-meta">
                              <span>Дедлайн: {formatDate(item.dueAt)}</span>
                              <span>Сдано: {formatDate(item.submittedAt)}</span>
                              <span>
                                Балл: {item.grade !== null ? item.grade : "-"}
                                {item.maxGrade !== null ? ` / ${item.maxGrade}` : ""}
                              </span>
                            </div>

                            <a href={item.url} target="_blank" rel="noreferrer" className="link-btn">
                              Открыть в Moodle
                            </a>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {tab === "achievements" && (
              <section className="panel">
                <div className="achievement-summary-grid">
                  <article className="achievement-summary-card">
                    <p className="kpi-label">Открыто ачивок</p>
                    <p className="kpi-value">{unlockedAchievements} / {achievements.length}</p>
                  </article>
                  <article className="achievement-summary-card">
                    <p className="kpi-label">Стрик сейчас</p>
                    <p className="kpi-value">{weeklyStreak.currentStreak} дн.</p>
                  </article>
                  <article className="achievement-summary-card">
                    <p className="kpi-label">Сдано за неделю</p>
                    <p className="kpi-value">{weeklyStreak.totalSubmitted}</p>
                  </article>
                </div>

                {nextAchievement && (
                  <p className="achievement-next">
                    Ближайшая цель: <strong>{nextAchievement.title}</strong> • {nextAchievement.hint}
                  </p>
                )}

                <div className="achievements-grid">
                  {achievements.map((achievement) => (
                    <article
                      key={achievement.id}
                      className={achievement.unlocked ? "achievement-card achievement-card-unlocked" : "achievement-card"}
                    >
                      <div className="achievement-head">
                        <h3>{achievement.title}</h3>
                        <span className={achievement.unlocked ? "chip chip-success" : "chip chip-muted"}>
                          {achievement.unlocked ? "Получена" : "В процессе"}
                        </span>
                      </div>

                      <p className="achievement-description">{achievement.description}</p>

                      <div className="achievement-progress-track">
                        <div className="achievement-progress-fill" style={{ width: `${achievement.progressPercent}%` }} />
                      </div>

                      <p className="achievement-meta">
                        {formatMetric(achievement.value, achievement.unit)} / {formatMetric(achievement.target, achievement.unit)}
                      </p>
                      <p className="achievement-hint">{achievement.hint}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {tab === "export" && (
              <section className="panel export-grid">
                <div className="scope-buttons">
                  <button
                    className={exportScope === "all" ? "tab active" : "tab"}
                    onClick={() => setExportScope("all")}
                  >
                    Весь курс(ы)
                  </button>
                  <button
                    className={exportScope === "course" ? "tab active" : "tab"}
                    onClick={() => setExportScope("course")}
                  >
                    По курсу
                  </button>
                  <button
                    className={exportScope === "section" ? "tab active" : "tab"}
                    onClick={() => setExportScope("section")}
                  >
                    По разделу
                  </button>
                </div>

                {(exportScope === "course" || exportScope === "section") && (
                  <label>
                    Курс
                    <select
                      value={selectedCourseId ?? ""}
                      onChange={(event) => setSelectedCourseId(Number(event.target.value))}
                    >
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {exportScope === "section" && (
                  <label>
                    Номер раздела
                    <input
                      type="number"
                      min={0}
                      value={sectionNumber}
                      onChange={(event) => setSectionNumber(Number(event.target.value))}
                    />
                  </label>
                )}

                <button
                  className="export-button"
                  onClick={() => {
                    handleStartExport().catch((exportError) => {
                      const message =
                        exportError instanceof Error ? exportError.message : "Не удалось запустить экспорт";
                      setError(message);
                    });
                  }}
                >
                  Сформировать PDF
                </button>

                <div className="export-note">
                  <p>PDF включает текстовые материалы курса (resource/page/label/book, если текст доступен).</p>
                  <p>Выбранный курс: {selectedCourse ? selectedCourse.fullName : "-"}</p>
                </div>

                {exportStatus && (
                  <div className="export-status">
                    <p>Job: {exportStatus.id}</p>
                    <p>Состояние: {exportStatus.state}</p>
                    <p>Прогресс: {exportStatus.progress}%</p>
                    {exportStatus.downloadPath && (
                      <a href={`${API_URL}${exportStatus.downloadPath}`} target="_blank" rel="noreferrer" className="link-btn">
                        Скачать PDF
                      </a>
                    )}
                    {exportStatus.error && <p className="error-inline">{exportStatus.error}</p>}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
