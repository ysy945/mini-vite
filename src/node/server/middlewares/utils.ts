import path from "path";
import { hashRE, queryRE, knownJsSrcRE } from "../../constants";
export const cleanUrl = (url: string) =>
  url.replace(hashRE, "").replace(queryRE, "");

export function isJSRequest(url: string) {
  url = cleanUrl(url);
  if (knownJsSrcRE.test(url)) {
    return true;
  }
  if (!path.extname(url) && !url.endsWith("/")) {
    return true;
  }
  return false;
}
