# RoboBlueCat Radio

Static radio room with a muted Japan walk, the supplied animated RoboBlueCat, DJ Quade’s YouTube playlist, and a public nickname chat.

Serve `docs/` over HTTP for local development. On GitHub Pages, use the `main` branch and `/docs`. The folder also works as a Render static publish directory wherever bandwidth and domain limits fit the budget.

The 720p desktop copy of the licensed footage is a GitHub release asset. iPhone and iPad use a lighter, same-origin H.264 MP4, which also serves as the fallback if the desktop copy stalls. Both versions use fast-start and have no audio track. Visual effects are browser-side CSS, and the original GIF plays over the effects layer.

The YouTube player is shown below the walk and selects a random playlist entry when enough of the player is visible. Browsers that block sound autoplay get a muted retry and an Enable sound button. Playback pauses while the player is hidden or cinema mode covers the page.

The frontend uses only a Supabase publishable key. The migration creates a bounded public chat feed, a validated posting RPC with cooldowns, and a Realtime subscription. The client uses REST to recover missed messages if a connection drops. Apply the migration only in a dedicated project and set the URL and public key in `docs/config.js`.

The custom domain needs an association in the host’s dashboard and a CNAME at the authoritative DNS provider. On GitHub Pages, the CNAME target is the account’s github.io hostname, without a project path.
