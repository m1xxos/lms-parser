import axios from "axios";

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

export interface MoodleSectionModule {
  id: number;
  name: string;
  modname: string;
  url?: string;
}

export interface MoodleSection {
  id: number;
  name: string;
  section: number;
  modules: MoodleSectionModule[];
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
}
