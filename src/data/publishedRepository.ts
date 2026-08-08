import { publishedProjectSchema } from "../domain/practiceSchema";
import type { ContentRepository } from "./contentRepository";

export class PublishedRepository implements ContentRepository {
  constructor(private readonly url = "/content/practice.json") {}

  async load() {
    const response = await fetch(this.url, { cache: "no-cache" });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Unable to load published content: ${response.status}`);
    return publishedProjectSchema.parse(await response.json());
  }

  save(): Promise<void> {
    return Promise.reject(new Error("Published content is read-only in the browser"));
  }
}
