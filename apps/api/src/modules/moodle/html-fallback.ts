import axios from "axios";
import * as cheerio from "cheerio";

export async function detectMoodlePublic(baseUrl: string): Promise<boolean> {
  try {
    const response = await axios.get(`${baseUrl}/login/index.php`, { timeout: 10000 });
    const html = String(response.data ?? "");
    const $ = cheerio.load(html);

    const hasLoginForm = $("form#login, form[action*='login']").length > 0;
    const hasMoodleHint = /moodle|система управления обучением/i.test(html);

    return hasLoginForm || hasMoodleHint;
  } catch {
    return false;
  }
}
