import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // --- Discord OAuth Config ---
  const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
  const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
  const REDIRECT_URI = `${APP_URL}/auth/callback`;
  
  // Summer Garage Specific IDs
  const GUILD_ID = '1302155819432939600'; // ID do Servidor Summer Garage
  const GOALS_CHANNEL_ID = '1302155820221337603'; // ID do Canal de Metas
  const ANNOUNCEMENTS_CHANNEL_ID = '1302155820057886800'; // ID do Canal de Anúncios

  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

  // Cache for roles to avoid excessive API calls
  let guildRolesCache: Record<string, string> = {};

  async function fetchGuildRoles() {
    if (!BOT_TOKEN || !GUILD_ID) return;
    try {
      console.log(`Fetching roles for guild: ${GUILD_ID}`);
      const response = await axios.get(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      });
      const roles = response.data;
      const mapping: Record<string, string> = {};
      roles.forEach((role: any) => {
        mapping[role.id] = role.name;
      });
      guildRolesCache = mapping;
      console.log(`Successfully cached ${roles.length} roles for guild ${GUILD_ID}`);
    } catch (error: any) {
      if (error.response) {
        console.error(`Error fetching guild roles (Status ${error.response.status}):`, error.response.data);
        if (error.response.status === 404) {
          console.error('TIP: Check if GUILD_ID is correct and if the Bot is actually in the server.');
        }
      } else {
        console.error('Error fetching guild roles:', error.message);
      }
    }
  }

  // Initial fetch
  fetchGuildRoles();

  // Function to fetch latest goals from Discord channel
  async function fetchLatestGoals() {
    if (!BOT_TOKEN || !GOALS_CHANNEL_ID) return null;
    try {
      const response = await axios.get(`https://discord.com/api/v10/channels/${GOALS_CHANNEL_ID}/messages?limit=1`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      });
      const messages = response.data;
      if (messages.length > 0) {
        return messages[0].content;
      }
    } catch (error: any) {
      console.error('Error fetching latest goals:', error.response?.data || error.message);
    }
    return null;
  }

  // --- API Routes ---

  // Get goals from Discord
  app.get('/api/goals', async (req, res) => {
    const content = await fetchLatestGoals();
    // Default values based on user prints
    const goals = {
      money: 15000,
      dailyItems: 100,
      weeklyItems: 600,
      rawContent: content
    };
    
    if (content) {
      // Basic parsing for money (e.g., "15.000")
      const moneyMatch = content.match(/(\d{1,3}(?:\.\d{3})*)/);
      if (moneyMatch) {
        goals.money = parseInt(moneyMatch[1].replace(/\./g, ''));
      }
      
      // Improved parsing for items
      // Look for daily (diario/dia/daily) and weekly (semanal/semana/weekly/2eekly)
      // This regex looks for a number followed by or preceded by the keyword
      const getNumberNear = (text: string, keyword: string) => {
        const regexes = [
          new RegExp(`(\\d+)\\s*(?:itens|farm|units)?\\s*${keyword}`, 'i'), // "100 daily"
          new RegExp(`${keyword}\\s*(?:itens|farm|units|mais|:)?\\s*(\\d+)`, 'i'), // "daily: 100" or "daily mais 100"
        ];
        for (const r of regexes) {
          const m = text.match(r);
          if (m) return parseInt(m[1]);
        }
        return null;
      };

      const dailyVal = getNumberNear(content, 'diario') || getNumberNear(content, 'dia') || getNumberNear(content, 'daily');
      const weeklyVal = getNumberNear(content, 'semanal') || getNumberNear(content, 'semana') || getNumberNear(content, 'weekly') || getNumberNear(content, '2eekly');

      if (dailyVal !== null) goals.dailyItems = dailyVal;
      if (weeklyVal !== null) goals.weeklyItems = weeklyVal;
      else if (dailyVal !== null) goals.weeklyItems = dailyVal * 6;
    }
    
    res.json(goals);
  });

  // Get Auth URL
  app.get('/api/auth/url', (req, res) => {
    if (!CLIENT_ID) {
      return res.status(500).json({ error: 'DISCORD_CLIENT_ID not configured' });
    }
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'identify guilds.members.read',
    });
    const authUrl = `https://discord.com/api/oauth2/authorize?${params}`;
    res.json({ url: authUrl });
  });

  // Callback Handler
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('No code provided');
    }

    try {
      // 1. Exchange code for token
      const tokenResponse = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: CLIENT_ID!,
          client_secret: CLIENT_SECRET!,
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: REDIRECT_URI,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token } = tokenResponse.data;

      // 2. Get user info
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const userData = userResponse.data;

      // 3. Get guild member info (to get roles and nickname)
      let roles: string[] = [];
      let displayName = userData.global_name || userData.username;

      if (GUILD_ID) {
        try {
          const memberResponse = await axios.get(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`, {
            headers: { Authorization: `Bearer ${access_token}` },
          });
          
          // Se o usuário tiver um apelido no servidor, usamos ele
          if (memberResponse.data.nick) {
            displayName = memberResponse.data.nick;
          }
          
          // Pegamos os IDs dos cargos e traduzimos para nomes se possível
          const roleIds = memberResponse.data.roles;
          
          if (BOT_TOKEN) {
            if (Object.keys(guildRolesCache).length === 0) {
              await fetchGuildRoles();
            }
            roles = roleIds.map((id: string) => guildRolesCache[id] || id);
          } else {
            roles = roleIds;
          }
        } catch (e: any) {
          console.log('Error fetching member info:', e.response?.data || e.message);
        }
      }

      const sessionData = {
        ...userData,
        displayName,
        roles: roles
      };

      // 4. Set cookie
      const isLocalhost = req.get('host')?.includes('localhost');
      res.cookie('user_session', JSON.stringify(sessionData), {
        httpOnly: true,
        secure: !isLocalhost, // Secure only if not localhost (requires HTTPS)
        sameSite: isLocalhost ? 'lax' : 'none', // Lax for localhost, None for cross-origin iframe
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // 4. Send success message and close popup
      res.send(`
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
              
              body { 
                background: #09090b; 
                color: white; 
                font-family: 'Inter', -apple-system, sans-serif; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0;
                overflow: hidden;
              }
              .container {
                text-align: center;
                animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                padding: 2rem;
                max-width: 90%;
              }
              .icon-wrapper {
                position: relative;
                width: 80px;
                height: 80px;
                margin: 0 auto 1.5rem;
              }
              .spinner {
                position: absolute;
                inset: 0;
                border: 3px solid rgba(239, 68, 68, 0.1);
                border-top: 3px solid #ef4444;
                border-radius: 50%;
                animation: spin 1s linear infinite;
              }
              .check {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ef4444;
                font-size: 2rem;
              }
              h2 { 
                color: #ffffff; 
                margin: 0 0 0.5rem;
                font-size: 1.5rem;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: -0.025em;
              }
              p {
                color: #a1a1aa;
                margin: 0;
                font-size: 0.875rem;
                animation: pulse 2s ease-in-out infinite;
              }
              .brand {
                margin-top: 2rem;
                font-size: 0.75rem;
                font-weight: 900;
                color: #3f3f46;
                text-transform: uppercase;
                letter-spacing: 0.2em;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon-wrapper">
                <div class="spinner"></div>
                <div class="check">✓</div>
              </div>
              <h2>Acesso Liberado!</h2>
              <p>Sincronizando sua oficina...</p>
              <div class="brand">Summer Garage</div>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 1500);
                } else {
                  setTimeout(() => window.location.href = '/', 1500);
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error('OAuth Error Details:', errorData || error.message);
      
      let userFriendlyMessage = 'Falha na autenticação';
      if (errorData?.error === 'invalid_client') {
        userFriendlyMessage = 'Erro: Client Secret inválido. Verifique suas chaves no menu Secrets.';
      } else if (errorData?.error === 'redirect_uri_mismatch') {
        userFriendlyMessage = `Erro: Redirect URI incorreto. Certifique-se de que "${REDIRECT_URI}" está cadastrado no portal do Discord.`;
      } else if (errorData?.error_description) {
        userFriendlyMessage = `Erro: ${errorData.error_description}`;
      }

      res.status(500).send(`
        <html>
          <body style="background: #09090b; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center; max-width: 500px; padding: 20px;">
              <h2 style="color: #ef4444;">Ops! Algo deu errado</h2>
              <p style="color: #a1a1aa;">${userFriendlyMessage}</p>
              <p style="font-size: 12px; color: #52525b; margin-top: 20px;">Detalhes técnicos: ${JSON.stringify(errorData || error.message)}</p>
              <button onclick="window.close()" style="margin-top: 20px; background: #ef4444; color: white; border: none; padding: 10px 20px; rounded: 8px; cursor: pointer; font-weight: bold;">Fechar Janela</button>
            </div>
          </body>
        </html>
      `);
    }
  });

  // Get current user
  app.get('/api/auth/me', (req, res) => {
    const session = req.cookies.user_session;
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      res.json(JSON.parse(session));
    } catch (e) {
      res.status(401).json({ error: 'Invalid session' });
    }
  });

  // Logout
  app.get('/api/auth/logout', (req, res) => {
    res.clearCookie('user_session', {
      secure: true,
      sameSite: 'none',
    });
    res.json({ success: true });
  });

  // --- Vite / Static Files ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
