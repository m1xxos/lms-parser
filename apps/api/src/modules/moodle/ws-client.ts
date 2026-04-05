import axios from "axios";
import iconv from "iconv-lite";

type Primitive = string | number | boolean;
type Params = Record<string, Primitive | Primitive[] | undefined>;

function appendParam(params: URLSearchParams, key: string, value: Primitive | Primitive[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      params.append(`${key}[${index}]`, String(item));
    });
    return;
  }

  params.append(key, String(value));
}

export interface MoodleSiteInfo {
  userid: number;
  fullname: string;
  sitename: string;
  release?: string;
  version?: string;
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
}

export interface MoodleAssignment {
  id: number;
  cmid?: number;
  course: number;
  name: string;
  duedate?: number;
  grade?: number;
  timemodified?: number;
}

export interface MoodleSubmission {
  userid: number;
  status?: string;
  timemodified?: number;
  gradingstatus?: string;
  grade?: {
    grade?: number;
  };
}

export interface MoodleQuiz {
  id: number;
  course: number;
  coursemodule?: number;
  name: string;
  timeopen?: number;
  timeclose?: number;
  grade?: number;
  sumgrades?: number;
}

export interface MoodleQuizAttempt {
  id: number;
  userid?: number;
  state?: string;
  attempt?: number;
  sumgrades?: number;
  timefinish?: number;
  timemodified?: number;
}

export interface MoodleModuleContent {
  type?: string;
  filename?: string;
  filepath?: string;
  fileurl?: string;
  mimetype?: string;
  content?: string;
}

export interface MoodleSectionModule {
  id: number;
  name: string;
  modname: string;
  url?: string;
  description?: string;
  contents?: MoodleModuleContent[];
}

export interface MoodleSection {
  id: number;
  name: string;
  section: number;
  summary?: string;
  modules: MoodleSectionModule[];
}

export interface MoodlePage {
  id: number;
  coursemodule: number;
  name: string;
  intro?: string;
  content?: string;
}

export class MoodleWsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  private async call<T>(wsfunction: string, params: Params = {}): Promise<T> {
    const query = new URLSearchParams();
    query.set("wstoken", this.token);
    query.set("wsfunction", wsfunction);
    query.set("moodlewsrestformat", "json");

    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === "undefined") {
        return;
      }
      appendParam(query, key, value);
    });

    const response = await axios.get(`${this.baseUrl}/webservice/rest/server.php`, {
      params: query,
      timeout: 20000
    });

    if (response.data?.exception) {
      const message = response.data?.message ?? "Unknown Moodle WS exception";
      throw new Error(message);
    }

    return response.data as T;
  }

  private buildAuthenticatedFileUrl(fileUrl: string): string {
    if (fileUrl.includes("token=")) {
      return fileUrl;
    }

    const separator = fileUrl.includes("?") ? "&" : "?";
    return `${fileUrl}${separator}token=${encodeURIComponent(this.token)}`;
  }

  private isProbablyTextContent(mimeType: string | undefined, fileUrl: string): boolean {
    if (!mimeType) {
      return /\.(txt|md|markdown|csv|json|xml|html|htm)$/i.test(fileUrl);
    }

    if (mimeType.startsWith("text/")) {
      return true;
    }

    return ["application/json", "application/xml", "application/xhtml+xml"].includes(mimeType);
  }

  private scoreDecodedText(value: string): number {
    if (!value) {
      return -100;
    }

    const replacement = (value.match(/\uFFFD/g) ?? []).length;
    const control = (value.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) ?? []).length;
    const printable = (value.match(/[\p{L}\p{N}\p{P}\p{Zs}\n\r\t]/gu) ?? []).length;
    const cyrillic = (value.match(/[\u0400-\u04FF]/g) ?? []).length;

    return printable + cyrillic * 3 - replacement * 10 - control * 8;
  }

  private decodeTextBuffer(buffer: Buffer): string {
    const candidates = ["utf8", "utf16le", "win1251", "koi8-r"] as const;
    let best = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const encoding of candidates) {
      let decoded = "";

      try {
        if (encoding === "utf8") {
          decoded = buffer.toString("utf8");
        } else {
          decoded = iconv.decode(buffer, encoding);
        }
      } catch {
        continue;
      }

      const normalized = decoded.replace(/\u0000/g, "").trim();
      const score = this.scoreDecodedText(normalized);

      if (score > bestScore) {
        best = normalized;
        bestScore = score;
      }
    }

    return best;
  }

  getSiteInfo(): Promise<MoodleSiteInfo> {
    return this.call<MoodleSiteInfo>("core_webservice_get_site_info");
  }

  getCourses(userId: number): Promise<MoodleCourse[]> {
    return this.call<MoodleCourse[]>("core_enrol_get_users_courses", { userid: userId });
  }

  async getAssignments(courseIds: number[]): Promise<MoodleAssignment[]> {
    if (courseIds.length === 0) {
      return [];
    }

    const data = await this.call<{ courses: Array<{ assignments: MoodleAssignment[] }> }>(
      "mod_assign_get_assignments",
      { courseids: courseIds }
    );

    return data.courses.flatMap((course) => course.assignments ?? []);
  }

  async getSubmissions(assignmentIds: number[]): Promise<Map<number, MoodleSubmission[]>> {
    const result = new Map<number, MoodleSubmission[]>();
    if (assignmentIds.length === 0) {
      return result;
    }

    const data = await this.call<{ assignments: Array<{ assignmentid: number; submissions: MoodleSubmission[] }> }>(
      "mod_assign_get_submissions",
      { assignmentids: assignmentIds }
    );

    for (const row of data.assignments ?? []) {
      result.set(row.assignmentid, row.submissions ?? []);
    }

    return result;
  }

  async getQuizzes(courseIds: number[]): Promise<MoodleQuiz[]> {
    if (courseIds.length === 0) {
      return [];
    }

    const data = await this.call<{ quizzes: MoodleQuiz[] }>("mod_quiz_get_quizzes_by_courses", {
      courseids: courseIds
    });

    return data.quizzes ?? [];
  }

  async getPagesByCourses(courseIds: number[]): Promise<MoodlePage[]> {
    if (courseIds.length === 0) {
      return [];
    }

    const data = await this.call<{ pages: MoodlePage[] }>("mod_page_get_pages_by_courses", {
      courseids: courseIds
    });

    return data.pages ?? [];
  }

  async getQuizAttempts(quizId: number, userId: number): Promise<MoodleQuizAttempt[]> {
    const data = await this.call<{ attempts: MoodleQuizAttempt[] }>("mod_quiz_get_user_attempts", {
      quizid: quizId,
      userid: userId,
      status: "all"
    });

    return data.attempts ?? [];
  }

  getCourseContents(courseId: number): Promise<MoodleSection[]> {
    return this.call<MoodleSection[]>("core_course_get_contents", { courseid: courseId });
  }

  async getCourseGradeItems(courseId: number, userId: number): Promise<Array<{ graderaw?: number; grademax?: number }>> {
    const data = await this.call<{
      usergrades?: Array<{
        gradeitems?: Array<{ graderaw?: number; grademax?: number }>;
      }>;
    }>("gradereport_user_get_grade_items", {
      courseid: courseId,
      userid: userId
    });

    return data.usergrades?.[0]?.gradeitems ?? [];
  }

  async downloadTextFromFile(fileUrl: string, mimeType?: string): Promise<string | null> {
    if (!this.isProbablyTextContent(mimeType, fileUrl)) {
      return null;
    }

    const response = await axios.get<ArrayBuffer>(this.buildAuthenticatedFileUrl(fileUrl), {
      responseType: "arraybuffer",
      timeout: 30000
    });

    const buffer = Buffer.from(response.data);
    const sample = buffer.subarray(0, Math.min(buffer.length, 4000));
    let nullBytes = 0;
    for (const value of sample) {
      if (value === 0) {
        nullBytes += 1;
      }
    }

    if (sample.length > 0 && nullBytes / sample.length > 0.01) {
      return null;
    }

    const text = this.decodeTextBuffer(buffer);
    if (!text) {
      return null;
    }

    return text;
  }

  async downloadFileBuffer(fileUrl: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(this.buildAuthenticatedFileUrl(fileUrl), {
      responseType: "arraybuffer",
      timeout: 45000
    });

    return Buffer.from(response.data);
  }

  async downloadHtmlFromUrl(url: string): Promise<string | null> {
    const response = await axios.get<string>(this.buildAuthenticatedFileUrl(url), {
      responseType: "text",
      timeout: 30000,
      headers: {
        Accept: "text/html,application/xhtml+xml"
      }
    });

    if (typeof response.data !== "string") {
      return null;
    }

    const html = response.data.trim();
    if (!html) {
      return null;
    }

    return html;
  }
}
