import { FormEvent, useEffect, useMemo, useState } from "react";

type TabKey = "dashboard" | "courses" | "export";
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

interface AssignmentItem {
  id: number;
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

interface DashboardResponse {
  courses: CourseSummary[];
  assignments: AssignmentItem[];
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
  const [sectionNumber, setSectionNumber] = useState<number>(0);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);

  const progress = dashboard?.summary.progressPercent ?? 0;

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

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

    if (!selectedCourseId && coursesPayload.courses.length > 0) {
      setSelectedCourseId(coursesPayload.courses[0].id);
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
                    <p className="kpi-label">Всего заданий</p>
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

                <div className="assignment-list">
                  {dashboard.assignments.map((item) => (
                    <article key={item.id} className="assignment-card">
                      <div className="assignment-head">
                        <div>
                          <p className="course-name">{item.courseName}</p>
                          <h3>{item.name}</h3>
                        </div>
                        <span className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</span>
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
                        Открыть задание в Moodle
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {tab === "courses" && (
              <section className="panel course-grid">
                {courses.map((course) => {
                  const percent = course.pointsMax > 0 ? Math.round((course.pointsEarned / course.pointsMax) * 100) : 0;
                  return (
                    <article key={course.id} className="course-card">
                      <p className="course-short">{course.shortName}</p>
                      <h3>{course.fullName}</h3>
                      <p>
                        {course.pointsEarned} / {course.pointsMax} баллов ({percent}%)
                      </p>
                    </article>
                  );
                })}
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
                  <p>MVP экспортирует материалы типов: file resource и page.</p>
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
