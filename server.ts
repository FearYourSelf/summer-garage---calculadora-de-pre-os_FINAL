import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  Partials, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} from 'discord.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Firebase Admin Setup ---
const mockDb = {
  collection: () => ({
    doc: () => ({
      get: () => Promise.reject(new Error('Firebase not initialized')),
      set: () => Promise.reject(new Error('Firebase not initialized')),
      onSnapshot: () => ({ unsubscribe: () => {} })
    }),
    get: () => Promise.reject(new Error('Firebase not initialized')),
    where: () => ({ get: () => Promise.reject(new Error('Firebase not initialized')) })
  })
};

let db: any = mockDb;

try {
  const firebaseConfigBase64 = process.env.FIREBASE_CONFIG_BASE64;
  
  // Try to load client config to get projectId and databaseId
  let clientConfig: any = null;
  try {
    const configPath = path.join(__dirname, 'firebase-applet-config.json');
    const configData = await import('fs/promises').then(fs => fs.readFile(configPath, 'utf8'));
    clientConfig = JSON.parse(configData);
    console.log('Loaded client Firebase config for server initialization.');
  } catch (e) {
    console.warn('Could not load firebase-applet-config.json, falling back to env vars.');
  }

  if (!getApps().length) {
    if (firebaseConfigBase64) {
      const firebaseConfig = JSON.parse(Buffer.from(firebaseConfigBase64, 'base64').toString());
      initializeApp({
        credential: cert(firebaseConfig),
        projectId: clientConfig?.projectId
      });
      console.log('Firebase Admin initialized with FIREBASE_CONFIG_BASE64.');
    } else {
      // Try default initialization (works in many cloud environments)
      initializeApp({
        projectId: clientConfig?.projectId
      });
      console.log('Firebase Admin initialized with default credentials.');
    }
  }
  
  if (getApps().length) {
    // Explicitly use the databaseId from the config if available
    const databaseId = clientConfig?.firestoreDatabaseId || '(default)';
    db = getFirestore(databaseId === '(default)' ? undefined : databaseId);
    console.log(`Firestore instance acquired (Database: ${databaseId}).`);
  } else {
    console.warn('Firebase Admin NOT initialized. Firestore features will be disabled.');
  }
} catch (err) {
  console.error('Error during Firebase Admin initialization:', err);
  db = mockDb;
}

const app = express();
const PORT = 3000;

// Health check
app.get('/health', (req, res) => res.send('OK'));

app.use(express.json());
app.use(cookieParser());

// --- Discord OAuth Config ---
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
let APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Remove trailing slash if present to avoid double slashes in redirect_uri
if (APP_URL.endsWith('/')) {
  APP_URL = APP_URL.slice(0, -1);
}

const REDIRECT_URI = `${APP_URL}/auth/callback`;

// Summer Garage Specific IDs
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1302155819432939600'; // ID do Servidor Summer Garage
const GOALS_CHANNEL_ID = process.env.DISCORD_GOALS_CHANNEL_ID || '1302155820221337603'; // ID do Canal de Metas
const ANNOUNCEMENTS_CHANNEL_ID = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID || '1302155820057886800'; // ID do Canal de Anúncios

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const MASTER_ID = '1357838586501664849';
let globalState = {
  maintenance: false,
  broadcast: '',
  errorLogs: [] as any[],
  staff: {
    [MASTER_ID]: 'admin'
  } as Record<string, 'admin' | 'manager'>
};

const isStaff = (userId: string, level: 'admin' | 'manager' = 'manager') => {
  if (userId === MASTER_ID) return true;
  const userRole = globalState.staff[userId];
  if (!userRole) return false;
  if (level === 'admin') return userRole === 'admin';
  return true;
};

let client: Client | null = null;

const sendDM = async (userId: string, content: any) => {
  if (!client || !BOT_TOKEN) return;
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
  } catch (err) {
    console.error('Error sending DM:', err);
  }
};

// Cache for roles to avoid excessive API calls
let guildRolesCache: Record<string, { name: string, color: string, position: number }> = {};

async function fetchGuildRoles() {
  if (!BOT_TOKEN || !GUILD_ID) return;
  try {
    console.log(`Fetching roles for guild: ${GUILD_ID}`);
    const response = await axios.get(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      timeout: 5000 // 5 second timeout
    });
    const roles = response.data;
    const mapping: Record<string, { name: string, color: string, position: number }> = {};
    roles.forEach((role: any) => {
      // Convert decimal color to hex
      const hexColor = role.color === 0 ? '#94a3b8' : `#${role.color.toString(16).padStart(6, '0')}`;
      mapping[role.id] = { 
        name: role.name, 
        color: hexColor,
        position: role.position
      };
    });
    guildRolesCache = mapping;
    console.log(`Successfully cached ${roles.length} roles for guild ${GUILD_ID}`);
  } catch (error: any) {
    if (error.response) {
      console.error(`Error fetching guild roles (Status ${error.response.status}):`, error.response.data);
    } else {
      console.error('Error fetching guild roles:', error.message);
    }
  }
}

// Initial fetch
// fetchGuildRoles(); // Moved to startServer

// Function to fetch latest goals from Discord channel
async function fetchLatestGoals() {
  if (!BOT_TOKEN || !GOALS_CHANNEL_ID) return null;
  try {
    console.log('Fetching latest goals from Discord...');
    const response = await axios.get(`https://discord.com/api/v10/channels/${GOALS_CHANNEL_ID}/messages?limit=1`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      timeout: 5000 // 5 second timeout
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
      dailyItems: 600,
      weeklyItems: 3600,
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
    
    console.log('--- Auth Request ---');
    console.log('Using Redirect URI:', REDIRECT_URI);
    
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
      console.log('Exchanging code for token...');
      const tokenResponse = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: CLIENT_ID!,
          client_secret: CLIENT_SECRET!,
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: REDIRECT_URI,
        }),
        { 
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000 
        }
      );

      const { access_token } = tokenResponse.data;

      // 2. Get user info
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const userData = userResponse.data;

      // 3. Get guild member info (to get roles and nickname)
      let roles: { name: string, color: string, position: number }[] = [];
      let displayName = userData.global_name || userData.username;
      let roleColor = '#ffffff';

      if (GUILD_ID) {
        try {
          const memberResponse = await axios.get(`https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`, {
            headers: { Authorization: `Bearer ${access_token}` },
          });
          
          if (memberResponse.data.nick) {
            displayName = memberResponse.data.nick;
          }
          
          const roleIds = memberResponse.data.roles;
          
          if (BOT_TOKEN) {
            if (Object.keys(guildRolesCache).length === 0) {
              await fetchGuildRoles();
            }
            
            const memberRoles = roleIds
              .map((id: string) => guildRolesCache[id])
              .filter(Boolean)
              .sort((a: any, b: any) => b.position - a.position);

            roles = memberRoles;
            if (memberRoles.length > 0) {
              roleColor = memberRoles[0].color;
            }
          } else {
            roles = roleIds.map((id: string) => ({ name: id, color: '#94a3b8', position: 0 }));
          }
        } catch (e: any) {
          console.log('Error fetching member info:', e.response?.data || e.message);
        }
      }

      const sessionData = {
        ...userData,
        displayName,
        roles: roles,
        roleColor: roleColor
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
          <body style="background-color: #09090b;">
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
  app.get('/api/auth/logout', async (req, res) => {
    // Try to log logout if session exists
    const sessionToken = req.cookies.user_session;
    if (sessionToken && BOT_TOKEN) {
      try {
        const [userId, username] = Buffer.from(sessionToken, 'base64').toString().split(':');
        const embed = new EmbedBuilder()
          .setTitle('🚪 Logout Efetuado')
          .setColor(0xef4444)
          .addFields(
            { name: 'Mecânico', value: `${username} (${userId})`, inline: true }
          )
          .setTimestamp();
        await sendDM(MASTER_ID, { embeds: [embed] });
      } catch (e) {}
    }

    res.clearCookie('user_session', {
      secure: true,
      sameSite: 'none',
    });
    res.json({ success: true });
  });

  app.post('/api/debug/close', async (req, res) => {
    const { user, id, platform } = req.body;
    const embed = new EmbedBuilder()
      .setTitle('⏹️ App Fechado')
      .setColor(0x64748b)
      .addFields(
        { name: 'Usuário', value: `${user} (${id})`, inline: true },
        { name: 'Plataforma', value: platform, inline: true }
      )
      .setTimestamp();
    await sendDM(MASTER_ID, { embeds: [embed] });
    res.json({ success: true });
  });

  // --- Debug / Error Reporting ---
  // Sync globalState with Firestore
  const syncGlobalState = async () => {
    try {
      const docRef = db.collection('settings').doc('global');
      const doc = await docRef.get();
      if (doc.exists) {
        const data = doc.data() as any;
        globalState.maintenance = data.maintenance ?? false;
        globalState.broadcast = data.broadcast ?? '';
        globalState.staff = { ...(data.staff || {}), [MASTER_ID]: 'admin' };
      } else {
        await docRef.set({
          maintenance: false,
          broadcast: '',
          staff: { [MASTER_ID]: 'admin' }
        });
      }
    } catch (e) {
      console.error('Error syncing global state:', e);
    }
  };

// syncGlobalState(); // Moved to startServer

  // Watch for changes in Firestore to update local globalState
  db.collection('settings').doc('global').onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data() as any;
      globalState.maintenance = data.maintenance ?? false;
      globalState.broadcast = data.broadcast ?? '';
      globalState.staff = { ...(data.staff || {}), [MASTER_ID]: 'admin' };
    }
  }, err => {
    console.error('Error watching global state:', err);
  });

  const updateGlobalStateInFirestore = async () => {
    try {
      await db.collection('settings').doc('global').set({
        maintenance: globalState.maintenance,
        broadcast: globalState.broadcast,
        staff: globalState.staff
      }, { merge: true });
    } catch (e) {
      console.error('Error updating global state in Firestore:', e);
    }
  };

  // Discord Bot Client for Commands
  if (BOT_TOKEN) {
    client = new Client({ 
      intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.Guilds
      ],
      partials: [Partials.Channel, Partials.GuildMember, Partials.User]
    });

    const isStaffLocal = (userId: string, level: 'admin' | 'manager' = 'manager') => {
      return isStaff(userId, level);
    };

    const logToStaff = async (embed: any) => {
      const staffIds = Object.keys(globalState.staff);
      for (const id of staffIds) {
        try {
          const user = await client.users.fetch(id);
          await user.send({ embeds: [embed] });
        } catch (e) {
          console.error(`Failed to log to staff member ${id}:`, e);
        }
      }
    };

    client.on('ready', () => {
      console.log(`Logged in as ${client.user?.tag}!`);
    });

    // Interaction Handler (Buttons, Menus, Modals)
    client.on(Events.InteractionCreate, async (interaction) => {
      // Log all interactions to Master DM
      if (interaction.user.id !== MASTER_ID) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🔍 Monitoramento: Interação')
          .setColor(0x94a3b8)
          .addFields(
            { name: 'Usuário', value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: true },
            { name: 'Tipo', value: interaction.type.toString(), inline: true },
            { name: 'ID Custom', value: (interaction as any).customId || 'N/A' }
          )
          .setTimestamp();
        await sendDM(MASTER_ID, { embeds: [logEmbed] });
      }

      if (!isStaff(interaction.user.id)) return;

      // Handle Dropdown Selection
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'staff_panel_menu') {
          const selection = interaction.values[0];
          
          switch (selection) {
            case 'warn_member':
              const warnModal = new ModalBuilder()
                .setCustomId('modal_warn')
                .setTitle('⚠️ Aplicar Advertência');

              const warnUserId = new TextInputBuilder()
                .setCustomId('warn_user_id')
                .setLabel('ID do Usuário')
                .setPlaceholder('Ex: 123456789012345678')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

              const warnStrike = new TextInputBuilder()
                .setCustomId('warn_strike')
                .setLabel('Strike (1, 2 ou 3)')
                .setPlaceholder('Digite apenas o número')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

              const warnReason = new TextInputBuilder()
                .setCustomId('warn_reason')
                .setLabel('Motivo da Punição')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

              warnModal.addComponents(
                new ActionRowBuilder<any>().addComponents(warnUserId),
                new ActionRowBuilder<any>().addComponents(warnStrike),
                new ActionRowBuilder<any>().addComponents(warnReason)
              );

              await interaction.showModal(warnModal);
              break;

            case 'send_announcement':
              const announceModal = new ModalBuilder()
                .setCustomId('modal_announce')
                .setTitle('📢 Novo Anúncio Oficial');

              const announceTitle = new TextInputBuilder()
                .setCustomId('announce_title')
                .setLabel('Título do Anúncio')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

              const announceMsg = new TextInputBuilder()
                .setCustomId('announce_msg')
                .setLabel('Mensagem')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

              announceModal.addComponents(
                new ActionRowBuilder<any>().addComponents(announceTitle),
                new ActionRowBuilder<any>().addComponents(announceMsg)
              );

              await interaction.showModal(announceModal);
              break;

            case 'send_pm':
              const pmModal = new ModalBuilder()
                .setCustomId('modal_pm')
                .setTitle('📩 Enviar Mensagem Privada');

              const pmUserId = new TextInputBuilder()
                .setCustomId('pm_user_id')
                .setLabel('ID do Usuário')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

              const pmTitle = new TextInputBuilder()
                .setCustomId('pm_title')
                .setLabel('Título')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

              const pmMsg = new TextInputBuilder()
                .setCustomId('pm_msg')
                .setLabel('Mensagem')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

              pmModal.addComponents(
                new ActionRowBuilder<any>().addComponents(pmUserId),
                new ActionRowBuilder<any>().addComponents(pmTitle),
                new ActionRowBuilder<any>().addComponents(pmMsg)
              );

              await interaction.showModal(pmModal);
              break;

            case 'app_stats':
              const statsEmbed = new EmbedBuilder()
                .setTitle('📊 Estatísticas do Sistema')
                .setColor(0x5865F2)
                .addFields(
                  { name: 'Manutenção', value: globalState.maintenance ? '🔴 Ativada' : '🟢 Desativada', inline: true },
                  { name: 'Aviso Ativo', value: globalState.broadcast || 'Nenhum', inline: true },
                  { name: 'Logs de Erro', value: `${globalState.errorLogs.length}`, inline: true },
                  { name: 'Staff Ativa', value: `${Object.keys(globalState.staff).length} membros`, inline: true }
                );
              await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
              break;
          }
        }
      }

      // Handle Modal Submissions
      if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true });

        try {
          if (interaction.customId === 'modal_warn') {
            const userId = interaction.fields.getTextInputValue('warn_user_id');
            const strike = interaction.fields.getTextInputValue('warn_strike');
            const reason = interaction.fields.getTextInputValue('warn_reason');

            const strikeEmoji = strike === '1' ? '⚠️' : strike === '2' ? '‼️' : '🚫';
            const warnTitle = `${strikeEmoji} ADVERTÊNCIA STRIKE ${strike} - Summer Garage`;
            
            const pmEmbed = new EmbedBuilder()
              .setTitle(warnTitle)
              .setDescription(`**Motivo:** ${reason}\n\n*Este é o seu strike ${strike}/3. O descumprimento das regras poderá resultar em desligamento imediato.*`)
              .setColor(0xef4444)
              .setTimestamp()
              .setFooter({ text: 'Summer Garage • Sistema de Disciplina' });

            const targetUser = await client.users.fetch(userId);
            await targetUser.send({ embeds: [pmEmbed] });

            // Try to assign role if in guild
            if (GUILD_ID) {
              try {
                const guild = await client.guilds.fetch(GUILD_ID);
                const member = await guild.members.fetch(userId);
                const warnRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('warn'));
                if (warnRole) {
                  await member.roles.add(warnRole);
                }
              } catch (e) {
                console.log('Could not assign role (user not in guild or role not found)');
              }
            }

            const logEmbed = new EmbedBuilder()
              .setTitle('🚨 Log de Punição')
              .setColor(0xef4444)
              .addFields(
                { name: 'Infrator', value: `<@${userId}> (${userId})`, inline: true },
                { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Strike', value: `${strike}/3`, inline: true },
                { name: 'Motivo', value: reason }
              )
              .setTimestamp();

            await logToStaff(logEmbed);
            await interaction.editReply(`✅ Advertência Strike ${strike} aplicada com sucesso!`);
          }

          if (interaction.customId === 'modal_announce') {
            const title = interaction.fields.getTextInputValue('announce_title');
            const msg = interaction.fields.getTextInputValue('announce_msg');

            const embed = new EmbedBuilder()
              .setTitle(title)
              .setDescription(msg)
              .setColor(0xef4444)
              .setTimestamp()
              .setFooter({ text: 'Summer Garage • Informativo Oficial' });

            const channel = await client.channels.fetch(ANNOUNCEMENTS_CHANNEL_ID) as any;
            await channel.send({ embeds: [embed] });
            await interaction.editReply(`✅ Anúncio enviado para <#${ANNOUNCEMENTS_CHANNEL_ID}>!`);
          }

          if (interaction.customId === 'modal_pm') {
            const userId = interaction.fields.getTextInputValue('pm_user_id');
            const title = interaction.fields.getTextInputValue('pm_title');
            const msg = interaction.fields.getTextInputValue('pm_msg');

            const embed = new EmbedBuilder()
              .setTitle(title)
              .setDescription(msg)
              .setColor(0x5865F2)
              .setTimestamp()
              .setFooter({ text: 'Mensagem Privada • Summer Garage' });

            const targetUser = await client.users.fetch(userId);
            await targetUser.send({ embeds: [embed] });
            await interaction.editReply(`✅ Mensagem enviada para <@${userId}>!`);
          }
        } catch (e) {
          await interaction.editReply(`❌ Erro ao processar: ${e}`);
        }
      }
    });

    client.on('messageCreate', async (message) => {
      // Monitor all messages to the bot or mentions
      if (message.author.bot) return;
      
      if (!message.guild || message.mentions.has(client.user!.id)) {
        if (message.author.id !== MASTER_ID) {
          const monitorEmbed = new EmbedBuilder()
            .setTitle('📩 Monitoramento: Mensagem/DM')
            .setColor(0x5865F2)
            .addFields(
              { name: 'De', value: `<@${message.author.id}> (${message.author.id})`, inline: true },
              { name: 'Conteúdo', value: message.content || '[Sem texto/Mídia]' }
            )
            .setTimestamp();
          await sendDM(MASTER_ID, { embeds: [monitorEmbed] });
        }
      }

      if (!message.content.startsWith('/')) return;
      
      const args = message.content.slice(1).split(' ');
      const command = args[0].toLowerCase();

      if (!isStaff(message.author.id)) return;

      try {
        switch (command) {
          case 'panel':
            const panelEmbed = new EmbedBuilder()
              .setTitle('⚙️ Painel de Controle Summer Garage')
              .setDescription('Selecione uma ação abaixo para gerenciar a oficina.')
              .setColor(0xef4444)
              .setImage('https://picsum.photos/seed/garage/600/200?blur=2');

            const menu = new StringSelectMenuBuilder()
              .setCustomId('staff_panel_menu')
              .setPlaceholder('Escolha uma ferramenta...')
              .addOptions(
                {
                  label: 'Aplicar Advertência',
                  description: 'Registrar strike e notificar membro',
                  value: 'warn_member',
                  emoji: '⚠️',
                },
                {
                  label: 'Enviar Anúncio',
                  description: 'Mandar mensagem no canal oficial',
                  value: 'send_announcement',
                  emoji: '📢',
                },
                {
                  label: 'Mensagem Privada',
                  description: 'Enviar DM anônima via Bot',
                  value: 'send_pm',
                  emoji: '📩',
                },
                {
                  label: 'Status do Sistema',
                  description: 'Ver estatísticas e logs',
                  value: 'app_stats',
                  emoji: '📊',
                }
              );

            const row = new ActionRowBuilder<any>().addComponents(menu);

            await message.reply({ 
              embeds: [panelEmbed], 
              components: [row],
              // Ephemeral only works for interactions, so for a message command we just send it.
              // If you want it private, use it in DM with the bot.
            });
            break;

          case 'unwarn':
            const unUserId = args[1];
            if (!unUserId) return message.reply('Uso: `/unwarn <user_id>`');
            
            if (GUILD_ID) {
              try {
                const guild = await client.guilds.fetch(GUILD_ID);
                const member = await guild.members.fetch(unUserId);
                const warnRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('warn'));
                if (warnRole) {
                  await member.roles.remove(warnRole);
                }
              } catch (e) {}
            }

            const unEmbed = new EmbedBuilder()
              .setTitle('✅ Punição Removida')
              .setDescription('Sua advertência foi removida pela liderança da Summer Garage. Mantenha o bom trabalho!')
              .setColor(0x22c55e)
              .setTimestamp();

            const unTarget = await client.users.fetch(unUserId);
            await unTarget.send({ embeds: [unEmbed] });
            
            const unLog = new EmbedBuilder()
              .setTitle('🟢 Log de Unwarn')
              .setColor(0x22c55e)
              .addFields(
                { name: 'Membro', value: `<@${unUserId}>`, inline: true },
                { name: 'Staff', value: `<@${message.author.id}>`, inline: true }
              )
              .setTimestamp();
            
            await logToStaff(unLog);
            message.reply(`✅ Advertência removida de <@${unUserId}>.`);
            break;

          case 'help':
            const helpEmbed = new EmbedBuilder()
              .setTitle('📚 Guia de Comandos - Summer Garage')
              .setColor(0xef4444)
              .addFields(
                { name: '`/panel`', value: 'Abre o menu visual de ferramentas da Staff.' },
                { name: '`/broadcast <msg>`', value: 'Define a mensagem de aviso no topo do site.' },
                { name: '`/unwarn <id>`', value: 'Remove a advertência de um membro.' },
                { name: '`/add_staff <id> <role>`', value: 'Adiciona um novo membro à equipe Staff.' }
              );
            message.reply({ embeds: [helpEmbed] });
            break;

          case 'help_dev':
            if (message.author.id !== MASTER_ID) return;
            const devHelpEmbed = new EmbedBuilder()
              .setTitle('🛠️ Painel de Controle Master')
              .setDescription('Comandos exclusivos de desenvolvedor (Apenas via DM ou Master ID).')
              .setColor(0x000000)
              .addFields(
                { name: '`/override stats`', value: 'Ver estado do servidor e logs de erro.' },
                { name: '`/override broadcast <msg>`', value: 'Enviar mensagem para o topo do site.' },
                { name: '`/override maintenance <on/off>`', value: 'Ligar/Desligar site.' },
                { name: '`/override staff_list`', value: 'Ver todos os IDs com acesso staff.' },
                { name: '`/override guild_info`', value: 'Ver detalhes do servidor e permissões do bot.' }
              )
              .setFooter({ text: 'Acesso Total • Summer Garage Backdoor' });
            message.reply({ embeds: [devHelpEmbed] });
            break;

          case 'add_staff':
            if (!isStaff(message.author.id, 'admin')) return message.reply('❌ Apenas Admins podem gerenciar a Staff.');
            const targetId = args[1];
            const role = args[2]?.toLowerCase() as 'admin' | 'manager';
            if (!targetId || !['admin', 'manager'].includes(role)) return message.reply('Uso: `/add_staff <id> <admin/manager>`');
            globalState.staff[targetId] = role;
            await updateGlobalStateInFirestore();
            message.reply(`✅ Usuário <@${targetId}> adicionado como **${role}**.`);
            break;

          case 'staff':
            const staffList = Object.entries(globalState.staff)
              .map(([id, r]) => `• <@${id}> - **${r}**`)
              .join('\n');
            message.reply(`**Membros da Staff:**\n${staffList || 'Nenhum'}`);
            break;

          case 'ping':
            message.reply(`Pong! 🏓 Latência: ${client.ws.ping}ms`);
            break;

          case 'broadcast':
            const broadcastMsg = args.slice(1).join(' ');
            globalState.broadcast = broadcastMsg;
            await updateGlobalStateInFirestore();
            message.reply(`✅ Mensagem de broadcast atualizada para: ${broadcastMsg || 'Nenhum'}`);
            break;

          case 'override':
            if (message.author.id !== MASTER_ID) return;
            const action = args[1];
            if (!action) return message.reply('Ações: `stats`, `reset_staff`, `broadcast <msg>`, `maintenance <on/off>`');
            
            if (action === 'stats') {
              message.reply(`**Estado Global:**\n• Manutenção: ${globalState.maintenance}\n• Broadcast: ${globalState.broadcast}\n• Staff: ${Object.keys(globalState.staff).length} membros`);
            } else if (action === 'broadcast') {
              globalState.broadcast = args.slice(2).join(' ');
              await updateGlobalStateInFirestore();
              message.reply(`✅ Broadcast atualizado para: ${globalState.broadcast || 'Nenhum'}`);
            } else if (action === 'maintenance') {
              globalState.maintenance = args[2] === 'on';
              await updateGlobalStateInFirestore();
              message.reply(`✅ Manutenção: ${globalState.maintenance ? 'LIGADA' : 'DESLIGADA'}`);
            } else if (action === 'staff_list') {
              const list = Object.entries(globalState.staff).map(([id, r]) => `<@${id}>: ${r}`).join('\n');
              message.reply(`**Staff Cadastrada:**\n${list || 'Vazio'}`);
            } else if (action === 'guild_info') {
              if (!GUILD_ID) return message.reply('GUILD_ID não configurado.');
              try {
                const guild = await client.guilds.fetch(GUILD_ID);
                message.reply(`**Servidor:** ${guild.name}\n**Membros:** ${guild.memberCount}\n**Bot Perms:** ${guild.members.me?.permissions.toArray().join(', ').slice(0, 1000)}`);
              } catch (e) {
                message.reply(`Erro ao buscar servidor: ${e}`);
              }
            }
            break;
        }
      } catch (err) {
        message.reply(`Erro: ${err}`);
      }
    });

    // client.login(BOT_TOKEN).catch(err => console.error('Failed to login to Discord:', err)); // Moved to startServer

    app.post('/api/debug/anonymous', async (req, res) => {
      const { platform } = req.body;
      const embed = new EmbedBuilder()
        .setTitle('🕵️ Acesso Anônimo')
        .setColor(0xf59e0b)
        .setDescription('Um usuário iniciou uma sessão em modo anônimo.')
        .addFields(
          { name: 'Plataforma', value: platform, inline: true }
        )
        .setTimestamp();
      await sendDM(MASTER_ID, { embeds: [embed] });
      res.json({ success: true });
    });

    app.post('/api/debug/login', async (req, res) => {
      const { user, id, platform } = req.body;
      const embed = new EmbedBuilder()
        .setTitle('🔑 Novo Vínculo de Discord')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Usuário', value: `${user} (${id})`, inline: true },
          { name: 'Plataforma', value: platform, inline: true }
        )
        .setTimestamp();
      await sendDM(MASTER_ID, { embeds: [embed] });
      res.json({ success: true });
    });

    app.post('/api/debug/open', async (req, res) => {
      const { user, id, platform } = req.body;
      const embed = new EmbedBuilder()
        .setTitle('📱 App Aberto')
        .setColor(0x94a3b8)
        .addFields(
          { name: 'Usuário', value: `${user} (${id})`, inline: true },
          { name: 'Plataforma', value: platform, inline: true }
        )
        .setTimestamp();
      await sendDM(MASTER_ID, { embeds: [embed] });
      res.json({ success: true });
    });

    app.post('/api/debug/report', async (req, res) => {
      const { error, stack, user, id, url, platform } = req.body;
      globalState.errorLogs.push({ time: new Date().toISOString(), error, user, id });
      
      const embed = new EmbedBuilder()
        .setTitle('🚨 Alerta de Erro - Summer Garage')
        .setColor(0xef4444)
        .addFields(
          { name: 'Erro', value: `\`\`\`${error}\`\`\`` },
          { name: 'Usuário', value: `${user} (${id})`, inline: true },
          { name: 'Plataforma', value: platform, inline: true },
          { name: 'URL', value: url },
          { name: 'Stack Trace', value: `\`\`\`${stack?.slice(0, 1000) || 'N/A'}\`\`\`` }
        )
        .setTimestamp();

      await sendDM(MASTER_ID, { embeds: [embed] });
      res.json({ success: true });
    });

    app.post('/api/debug/sale', async (req, res) => {
      const { user, id, total, items, platform, userAgent, monthlyFarm } = req.body;
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const os = /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS' : /Android/i.test(userAgent) ? 'Android' : 'Desktop';

      const embed = new EmbedBuilder()
        .setTitle('💰 Nova Venda Finalizada!')
        .setColor(0x22c55e)
        .addFields(
          { name: 'Mecânico', value: `${user} (${id})`, inline: true },
          { name: 'Valor Total', value: `R$ ${total.toLocaleString('pt-BR')}`, inline: true },
          { name: 'Dispositivo', value: `${os} (${isMobile ? 'Mobile' : 'Desktop'})`, inline: true },
          { name: 'Itens Vendidos', value: items.length > 0 ? items.join('\n').slice(0, 1024) : 'Nenhum item' },
          { name: 'Farm Mensal Total', value: `${monthlyFarm} itens`, inline: true }
        )
        .setTimestamp();

      await sendDM(MASTER_ID, { embeds: [embed] });
      res.json({ success: true });
    });

    app.post('/api/debug/farm', async (req, res) => {
      const { user, id, amount, monthlyFarm } = req.body;
      
      const embed = new EmbedBuilder()
        .setTitle('🚜 Farm Adicionado')
        .setColor(0x3b82f6)
        .addFields(
          { name: 'Mecânico', value: `${user} (${id})`, inline: true },
          { name: 'Quantidade', value: `+${amount} itens`, inline: true },
          { name: 'Farm Mensal Total', value: `${monthlyFarm} itens`, inline: true }
        )
        .setTimestamp();

      await sendDM(MASTER_ID, { embeds: [embed] });
      res.json({ success: true });
    });
  }

  // API to get global state (for maintenance/broadcast)
  app.get('/api/global/state', (req, res) => {
    res.json({
      maintenance: globalState.maintenance,
      broadcast: globalState.broadcast,
      staff: globalState.staff
    });
  });

  app.get('/api/mechanics', async (req, res) => {
    const session = req.cookies.user_session;
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const userData = JSON.parse(session);
      if (!isStaff(userData.id)) return res.status(403).json({ error: 'Forbidden' });

      const snapshot = await db.collection('mechanics').get();
      const mechanics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(mechanics);
    } catch (e) {
      console.error('Error fetching mechanics:', e);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

async function startServer() {
  console.log('--- SERVER STARTUP ---');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', PORT);
  
  // Listen immediately to signal readiness to the proxy
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SUCCESS: Server listening on http://localhost:${PORT}`);
  });

  // Run initializations in background
  (async () => {
    try {
      console.log('Running background initializations...');
      await fetchGuildRoles();
      await syncGlobalState();
      if (BOT_TOKEN && client) {
        console.log('Logging in to Discord...');
        await client.login(BOT_TOKEN);
        console.log('Discord login successful.');
      }
      console.log('Background initializations complete.');
    } catch (e) {
      console.error('Error during background initializations:', e);
    }
  })();

  // --- Vite / Static Files ---
  try {
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      console.log('Initializing Vite middleware...');
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware initialized.');
    } else {
      console.log('Serving static files from dist...');
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      console.log('Static files setup complete.');
    }
  } catch (err) {
    console.error('CRITICAL: Error during Vite/Static initialization:', err);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

startServer();

export default app;
