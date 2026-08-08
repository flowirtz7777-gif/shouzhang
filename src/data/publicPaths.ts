export const BASE_URL = import.meta.env.BASE_URL;

/** 把以 / 开头的静态资源路径转成当前部署基础路径下的地址（GitHub Pages 子路径兼容）。 */
export function publicUrl(path: string): string {
  return `${BASE_URL}${path.replace(/^\/+/, "")}`;
}
