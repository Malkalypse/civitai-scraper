<?php
/** Site configuration shim.
 *
 * All site-specific constants (domains, API paths, CDN URLs, UI strings) are
 * defined in the project's central preferences file.  This file exists only
 * so that any code which require_once's it directly still works; it simply
 * delegates to prefs.php.
 *
 * To change site settings, edit web/prefs.php — not this file.
 */
require_once __DIR__ . '/../prefs.php';
