import { content } from "./content";
import { dashboard } from "./dashboard";
import { ops } from "./ops";
import { people } from "./people";
import { reports } from "./reports";
import { shell } from "./shell";

/** Back office. Sent to the browser only on /admin pages. */
export const admin = { shell, dashboard, reports, ops, people, content };
