import { admin } from "./admin";
import { auth } from "./auth";
import { common } from "./common";
import { staffConsole } from "./console";
import { errors } from "./errors";
import { info } from "./info";
import { lotto } from "./lotto";
import { meta } from "./meta";
import { money } from "./money";
import { play } from "./play";
import { site } from "./site";

/** Thai is the source language: every other language is checked against this shape. */
const th = { common, lotto, site, info, play, money, auth, errors, admin, meta, console: staffConsole };
export default th;
