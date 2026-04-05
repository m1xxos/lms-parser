import { FormEvent, useEffect, useMemo, useState } from "react";

type TabKey = "dashboard" | "courses" | "export";
type TaskType = "assignment" | "quiz";
type AssignmentStatus = "not_submitted" | "submitted_ungraded" | "submitted_graded" | "draft" | "overdue";

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

  const progress = dashboard?.summary.progressPercent ?? 0;
  const dashboardItems = useMemo(() => dashboard?.items ?? dashboard?.assignments ?? [], [dashboard]);
  const weeklyStreak = useMemo(
    () => dashboard?.weeklyStreak ?? fallbackWeeklyStreak(dashboardItems),
    [dashboard?.weeklyStreak, dashboardItems]
  );

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
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <main className="container">
        <header className="hero">
          <h1>Moodle Task Tracker</h1>
          <p>Единый экран задач, прогресса, статусов проверки и экспорта материалов курса в PDF.</p>
        </header>

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
