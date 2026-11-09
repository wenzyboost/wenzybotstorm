// ═══════════════════════════════════════════════════════════════
//  WENZY BOT v3 — bot.js  (single file, Railway ready)
//  node bot.js
// ═══════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();

const {
  Client, GatewayIntentBits, Collection, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, Events,
} = require('discord.js');
const axios    = require('axios');
const cron     = require('node-cron');
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const REF_SCREEN_PATH = path.join(__dirname, 'ref_screen.jpg');

// ── DATABASE ─────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'wenzy.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY, roblox_id TEXT, roblox_username TEXT,
    roblox_avatar TEXT, verify_code TEXT, verified INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0, vocal_minutes INTEGER DEFAULT 0,
    trade_count INTEGER DEFAULT 0, vouch_count INTEGER DEFAULT 0,
    report_count INTEGER DEFAULT 0, rank TEXT DEFAULT 'new',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL,
    weapon_name TEXT NOT NULL, weapon_value INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0, added_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, poster_id TEXT NOT NULL,
    accepter_id TEXT, offer_weapons TEXT NOT NULL, want_weapons TEXT NOT NULL,
    offer_value INTEGER DEFAULT 0, want_value INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open', thread_id TEXT, message_id TEXT, channel_id TEXT,
    server_link TEXT, middleman_id TEXT, screenshot_url TEXT,
    screenshot_verified INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')), completed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS vouches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, from_id TEXT NOT NULL,
    to_id TEXT NOT NULL, trade_id INTEGER, comment TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS weapon_values (
    name TEXT PRIMARY KEY, value INTEGER NOT NULL,
    tier TEXT DEFAULT 'godly', image_url TEXT,
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS private_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, link TEXT NOT NULL UNIQUE,
    in_use INTEGER DEFAULT 0, trade_id INTEGER, added_by TEXT
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id TEXT NOT NULL,
    reported_id TEXT NOT NULL, trade_id INTEGER, reason TEXT,
    status TEXT DEFAULT 'open', created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS vocal_sessions (
    discord_id TEXT PRIMARY KEY, joined_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS youtube_last (
    id INTEGER PRIMARY KEY CHECK (id=1), video_id TEXT, checked_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS shop_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL,
    item_type TEXT NOT NULL, item_data TEXT, coins_spent INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  INSERT OR IGNORE INTO youtube_last (id,checked_at) VALUES (1,0);
`);

const defaults = [
  ['Chroma Seer',165,'chroma'],['Corrupt',90,'godly'],['Hallowscythe',80,'godly'],
  ['Ancient Seer',200,'ancient'],['Chroma Harvester',150,'chroma'],
  ['Chroma Lightbringer',140,'chroma'],['Elderwood Scythe',85,'godly'],
  ['Batwing',60,'godly'],['Shark',55,'godly'],['Chroma Luger',120,'chroma'],
  ['Icicle',50,'godly'],['Prism',95,'godly'],['Chroma Boneblade',110,'chroma'],
  ['Raygun',45,'godly'],['Snowcannon',40,'godly'],['Spirit',35,'godly'],
  ['Soul',38,'godly'],['Beachy',30,'godly'],['Blue Seer',70,'godly'],
];
const _iw = db.prepare('INSERT OR IGNORE INTO weapon_values (name,value,tier) VALUES (?,?,?)');
for (const [n,v,t] of defaults) _iw.run(n,v,t);

// ── RANKS ────────────────────────────────────────────────────
function getRank(n){ if(n>=50)return'elite'; if(n>=20)return'trusted'; if(n>=5)return'confirmed'; return'new'; }
function getRankLabel(r){ return({new:'🆕 Nouveau',confirmed:'✅ Confirmé',trusted:'⭐ Fiable',elite:'👑 Elite'})[r]??'🆕 Nouveau'; }

// ── COLORS ───────────────────────────────────────────────────
const C={primary:0x7B2FBE,success:0x2ECC71,warning:0xF39C12,danger:0xE74C3C,info:0x3498DB,gold:0xF1C40F};
const TIER_LABELS={common:'Common',uncommon:'Uncommon',rare:'Rare',epic:'Epic',legendary:'Legendary',godly:'🔥 Godly',chroma:'🌈 Chroma',ancient:'⚡ Ancient'};
const TIER_COLORS={common:0x95A5A6,uncommon:0x27AE60,rare:0x3498DB,epic:0x9B59B6,legendary:0xF39C12,godly:0xE74C3C,chroma:0x7B2FBE,ancient:0xF1C40F};

// ── EMBEDS ───────────────────────────────────────────────────
function tradeEmbed(trade, poster) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  const diff = trade.offer_value - trade.want_value, fair = Math.abs(diff) <= 20;
  return new EmbedBuilder().setColor(C.primary)
    .setTitle(`🗡️ TRADE #${String(trade.id).padStart(4,'0')}`)
    .setThumbnail(poster?.roblox_avatar ?? null)
    .addFields(
      {name:'👤 Trader',value:`<@${trade.poster_id}>${poster?.verified?' ✅':' ⚠️'}\n⭐ ${poster?.trade_count??0} trades | ${poster?.vouch_count??0} vouches`,inline:true},
      {name:'📤 OFFRE',value:off.map(w=>`• ${w.name} _(${w.value} val)_`).join('\n')||'—',inline:true},
      {name:'📥 CHERCHE',value:want.map(w=>`• ${w.name}`).join('\n')||'—',inline:true},
      {name:'💎 Valeur',value:`**${trade.offer_value} val**`,inline:true},
      {name:'⚖️ Équité',value:fair?'⚖️ Fair':(trade.offer_value>trade.want_value?'📈 Avantageux trader':'📉 Unfair'),inline:true},
      {name:'🏆 Rang',value:getRankLabel(poster?.rank??'new'),inline:true},
    ).setFooter({text:`Trade #${trade.id} • ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}`}).setTimestamp();
}

function tradeInProgressEmbed(trade, poster, accepter) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  return new EmbedBuilder().setColor(C.warning)
    .setTitle(`⏳ TRADE #${String(trade.id).padStart(4,'0')} — EN COURS`)
    .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
    .addFields(
      {name:'📤 Offre',value:off.map(w=>`• ${w.name} _(${w.value} val)_`).join('\n')||'—',inline:true},
      {name:'📥 Cherche',value:want.map(w=>`• ${w.name}`).join('\n')||'—',inline:true},
      {name:'💎 Valeur',value:`**${trade.offer_value} val**`,inline:true},
    ).setFooter({text:`Trade en cours depuis ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}`}).setTimestamp();
}

function tradeCompletedEmbed(trade) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  return new EmbedBuilder().setColor(C.success)
    .setTitle(`✅ TRADE #${String(trade.id).padStart(4,'0')} — COMPLÉTÉ`)
    .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
    .addFields(
      {name:'📤 Offre',value:off.map(w=>`• ${w.name} _(${w.value} val)_`).join('\n')||'—',inline:true},
      {name:'📥 Cherche',value:want.map(w=>`• ${w.name}`).join('\n')||'—',inline:true},
      {name:'💎 Valeur',value:`**${trade.offer_value} val**`,inline:true},
    ).setFooter({text:`Complété le ${new Date().toLocaleDateString('fr-FR')}`}).setTimestamp();
}

function tradeButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_accept_${id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trade_negotiate_${id}`).setLabel('💬 Négocier').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Middleman').setStyle(ButtonStyle.Primary),
  );
}

function threadSummaryEmbed(trade, poster, accepter) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  const diff = trade.offer_value - trade.want_value, fair = Math.abs(diff) <= 20;
  return new EmbedBuilder().setColor(fair ? C.success : C.warning)
    .setTitle(`🗡️ TRADE EN COURS — #${String(trade.id).padStart(4,'0')}`)
    .setDescription([
      `> <@${trade.poster_id}> × <@${trade.accepter_id}>`,
      '', '**📋 Pour finaliser ce trade :**',
      '1. Rejoins le serveur privé MM2 (lien ci-dessous)',
      '2. Fais le trade en jeu',
      '3. Prends un screenshot de l\'écran **"YOU HAVE ACCEPTED"** (voir exemple)',
      '4. Envoie le screenshot dans CE salon',
      '5. Le bot vérifie et valide automatiquement',
    ].join('\n'))
    .addFields(
      {name:`📤 <@${trade.poster_id}> offre`,value:off.map(w=>`• ${w.name} _(${w.value} val)_`).join('\n'),inline:true},
      {name:`📥 <@${trade.accepter_id}> reçoit`,value:want.map(w=>`• ${w.name}`).join('\n'),inline:true},
      {name:'⚖️ Résultat',value:fair
        ?`✅ Fair — Diff : ${Math.abs(diff)} val`
        :`⚠️ Unfair — Diff : ${Math.abs(diff)} val (avantage ${diff>0?`<@${trade.poster_id}>`:`<@${trade.accepter_id}>`})`,
        inline:false},
    ).setTimestamp();
}

function threadButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Appeler Middleman').setStyle(ButtonStyle.Primary),
  );
}

function profileEmbed(user, inv) {
  const total = inv.reduce((a,w)=>a+w.weapon_value,0);
  return new EmbedBuilder().setColor(C.primary)
    .setTitle(`👤 ${user.roblox_username??'Non lié'}`).setThumbnail(user.roblox_avatar??null)
    .addFields(
      {name:'🎮 Roblox',value:user.verified?`${user.roblox_username} ✅`:'❌ Non lié',inline:true},
      {name:'🏆 Rang',value:getRankLabel(user.rank),inline:true},
      {name:'⭐ Réputation',value:`✅ ${user.trade_count} trades\n💬 ${user.vouch_count} vouches\n🚨 ${user.report_count} reports`,inline:true},
      {name:'📦 Inventory',value:(inv.length?inv.map(w=>`• ${w.weapon_name} ≈ **${w.weapon_value} val** ${w.verified?'✅':'⚠️'}`).join('\n').slice(0,1000):'— Vide'),inline:false},
      {name:'💎 Valeur',value:`~${total} val`,inline:true},{name:'🪙 Pièces',value:`${user.coins}`,inline:true},{name:'⏱️ Vocal',value:`${user.vocal_minutes} min`,inline:true},
    ).setTimestamp();
}

function mmPanelEmbed(trade, poster, accepter) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons), diff = trade.offer_value - trade.want_value;
  return new EmbedBuilder().setColor(C.info)
    .setTitle(`🛡️ PANEL MIDDLEMAN — TRADE #${String(trade.id).padStart(4,'0')}`)
    .addFields(
      {name:'👤 Poster',value:`<@${trade.poster_id}> (${poster?.trade_count??0} trades, ${poster?.vouch_count??0} vouches)`,inline:true},
      {name:'👤 Accepter',value:`<@${trade.accepter_id}> (${accepter?.trade_count??0} trades, ${accepter?.vouch_count??0} vouches)`,inline:true},
      {name:'📤 Offre poster',value:off.map(w=>`${w.name} — ${w.value}val`).join('\n'),inline:false},
      {name:'📥 Offre accept',value:want.map(w=>w.name).join('\n'),inline:false},
      {name:'⚖️ Différence',value:`${Math.abs(diff)} val (${diff>0?'avantage poster':diff<0?'avantage accepter':'égal'})`,inline:false},
    ).setTimestamp();
}

function mmButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mm_validate_${id}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`mm_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mm_report_${id}`).setLabel('🚨 Report scam').setStyle(ButtonStyle.Secondary),
  );
}

// ── ROBLOX HELPERS ───────────────────────────────────────────
function genCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s='WENZY-'; for(let i=0;i<5;i++)s+=c[Math.floor(Math.random()*c.length)]; return s; }
async function searchRobloxUser(u){ const r=await axios.post('https://users.roblox.com/v1/usernames/users',{usernames:[u],excludeBannedUsers:true}); return r.data.data?.[0]??null; }
async function getRobloxDescription(id){ const r=await axios.get(`https://users.roblox.com/v1/users/${id}`); return r.data.description??''; }
async function getRobloxAvatar(id){ try{ const r=await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`); return r.data.data?.[0]?.imageUrl??null; }catch{ return null; } }

// ── TRADE HELPERS ────────────────────────────────────────────
function parseWeapons(s){ return s.split(',').map(x=>x.trim()).filter(Boolean); }
function calcValue(names){ let total=0; const details=[]; for(const n of names){ const row=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(n); const val=row?.value??0; total+=val; details.push({name:row?.name??n,value:val}); } return{total,details}; }
function getFreeServer(){ return db.prepare('SELECT * FROM private_servers WHERE in_use=0 LIMIT 1').get(); }

// ── CLAUDE VISION ────────────────────────────────────────────
// Support API key native Anthropic + proxy tier (Elite Keys, etc.)
async function verifyMM2Screenshot(imageUrl) {
  const KEY      = process.env.ANTHROPIC_API_KEY;
  const BASE_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  if (!KEY) { console.warn('[Vision] no key — auto-valid'); return { valid: true, reason: 'Vision non configurée — validé auto' }; }

  // Télécharge l'image
  let b64, mime;
  try {
    const img = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
    b64  = Buffer.from(img.data).toString('base64');
    mime = (img.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
    // Discord renvoie parfois webp — Anthropic l'accepte pas, on force jpeg
    if (!['image/jpeg','image/png','image/gif','image/webp'].includes(mime)) mime = 'image/jpeg';
  } catch (e) {
    console.error('[Vision] download failed:', e.message);
    return { valid: false, reason: `Impossible de télécharger l'image: ${e.message}` };
  }

  // Prompt ultra strict JSON-only
  const SYSTEM = 'You are a JSON-only API. You NEVER write prose. Your entire response is always a single valid JSON object on one line, nothing else. No explanation, no markdown, no code blocks.';
  const USER_TEXT = `Look at this MM2 (Murder Mystery 2 Roblox) trade screenshot. Respond with ONLY this JSON (no text before or after, no backticks):
{"valid":true,"confidence":95,"reason":"short reason"}
valid=true if: "YOU HAVE ACCEPTED" text is visible AND MM2 trade UI with weapons shown.
valid=false if: no trade UI, not MM2, blurry, montage, or screenshot not from MM2.
confidence: 0-100 integer. reason: max 10 words in English.`;

  try {
    const payload = {
      model: 'claude-haiku-5-5',  // haiku = moins cher + plus obéissant pour les tâches simples
      max_tokens: 80,
      system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
        { type: 'text', text: USER_TEXT },
      ] }],
    };
    // Préfill assistant pour forcer le début du JSON
    payload.messages.push({ role: 'assistant', content: '{"valid":' });

    const res = await axios.post(`${BASE_URL}/v1/messages`, payload, {
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 20000,
    });

    // Reconstruit le JSON depuis le préfill + réponse
    let raw = res.data.content?.[0]?.text ?? '';
    raw = '{"valid":' + raw; // préfill + continuation
    console.log('[Vision] raw response:', raw.slice(0, 200));

    // Parse robuste : extraire le premier objet JSON valide
    const jsonMatch = raw.match(/\{[^{}]*"valid"\s*:\s*(true|false)[^{}]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);

    // Fallback : essayer de parser directement après nettoyage
    const cleaned = raw.replace(/```json|```/g, '').replace(/[\r\n]/g, '').trim();
    // Trouver { ... }
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));

    console.warn('[Vision] unparseable response:', raw.slice(0, 300));
    return { valid: false, reason: 'Réponse API non parseable — réessaie' };

  } catch (e) {
    console.error('[Vision] API error:', e.response?.status, e.message);
    if (e.response?.status === 401) {
      console.warn('[Vision] 401 — clé invalide. Vérifie ANTHROPIC_API_KEY dans Railway.');
      return { valid: true, reason: 'Clé API invalide — validé auto (configure ANTHROPIC_API_KEY)' };
    }
    if (e.response?.status === 400) {
      // Modèle pas dispo ou paramètre invalide — fallback haiku ancien
      console.warn('[Vision] 400 — modèle indisponible, essai fallback...');
      try {
        const fallback = await axios.post(`${BASE_URL}/v1/messages`, {
          model: 'claude-haiku-5-5', max_tokens: 80, system: SYSTEM,
          messages: [
            { role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
              { type: 'text', text: USER_TEXT },
            ] },
          ],
        }, { headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 20000 });
        const ft = fallback.data.content?.[0]?.text ?? '{}';
        const fm = ft.match(/\{[^{}]*"valid"\s*:\s*(true|false)[^{}]*\}/);
        if (fm) return JSON.parse(fm[0]);
      } catch {}
      return { valid: false, reason: `API error 400 — ${e.message}` };
    }
    return { valid: false, reason: `Erreur API: ${e.message}` };
  }
}

// ── MM2 VALUES SYNC ──────────────────────────────────────────
// Sources par ordre de priorité : Murder Mystery 2 Value List (mm2v.com) → Cosmic Values → hardcoded fallback
async function fetchMM2Values() {
  let synced = 0;
  const stmt = db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now'))
    ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`);

  // ── Source 1 : murderr.mystery2.fandom-style JSON / mm2v.com API
  try {
    const r = await axios.get('https://mm2.fandom.com/api/v1/Articles/AsSimpleJson?id=137', { timeout: 8000 });
    // fandom ne donne pas les values directement, skip
  } catch {}

  // ── Source 2 : mm2values.com (scraping JSON non-officiel)
  try {
    const r = await axios.get('https://www.mm2values.com/api/values', { timeout: 8000 });
    const data = r.data;
    // mm2values.com peut retourner soit un tableau, soit {items:[...]}, soit {godlys:{...}, chromas:{...}}
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.name && (item.value ?? item.demand) > 0) {
          stmt.run(item.name, Math.round(item.value ?? item.demand), item.tier ?? 'godly');
          synced++;
        }
      }
    } else if (data?.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.name && item.value > 0) { stmt.run(item.name, Math.round(item.value), item.tier ?? 'godly'); synced++; }
      }
    } else if (typeof data === 'object') {
      // Format { "Corrupt": { value: 90, tier: "godly" }, ... }
      for (const [name, info] of Object.entries(data)) {
        const val = info?.value ?? info?.demand ?? (typeof info === 'number' ? info : 0);
        if (name && val > 0) { stmt.run(name, Math.round(val), info?.tier ?? 'godly'); synced++; }
      }
    }
    if (synced > 0) { console.log(`[Values] mm2values.com: ${synced} armes`); return; }
  } catch (e) { console.warn('[Values] mm2values.com failed:', e.message); }

  // ── Source 3 : cosmic-values-like endpoint
  try {
    const r = await axios.get('https://mm2values.info/api/list', { timeout: 8000, headers: { 'User-Agent': 'WenzyBot/3.0' } });
    const data = r.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.name && item.value > 0) { stmt.run(item.name, Math.round(item.value), item.type ?? item.tier ?? 'godly'); synced++; }
      }
    }
    if (synced > 0) { console.log(`[Values] mm2values.info: ${synced} armes`); return; }
  } catch (e) { console.warn('[Values] mm2values.info failed:', e.message); }

  // ── Source 4 : Hardcoded values à jour (Novembre 2024)
  // Source : communauté MM2 trading, valeurs consensus
  const hardcoded = [
    // Ancient
    ['Ancient Seer', 200, 'ancient'],
    // Chroma
    ['Chroma Seer', 165, 'chroma'],
    ['Chroma Harvester', 150, 'chroma'],
    ['Chroma Lightbringer', 145, 'chroma'],
    ['Chroma Luger', 125, 'chroma'],
    ['Chroma Boneblade', 115, 'chroma'],
    ['Chroma Godly', 100, 'chroma'],
    // Godly - tier 1
    ['Prism', 95, 'godly'],
    ['Corrupt', 90, 'godly'],
    ['Hallowscythe', 82, 'godly'],
    ['Elderwood Scythe', 85, 'godly'],
    ['Blue Seer', 72, 'godly'],
    // Godly - tier 2
    ['Batwing', 62, 'godly'],
    ['Shark', 57, 'godly'],
    ['Icicle', 52, 'godly'],
    ['Laser', 50, 'godly'],
    ['Candy Cane', 48, 'godly'],
    ['Pumpkin', 47, 'godly'],
    ['Eerie', 46, 'godly'],
    ['Sparkle', 45, 'godly'],
    ['Ghostblade', 44, 'godly'],
    ['Silverthorn', 42, 'godly'],
    // Godly - tier 3
    ['Raygun', 45, 'godly'],
    ['Snowcannon', 42, 'godly'],
    ['Linked', 40, 'godly'],
    ['Eternal', 40, 'godly'],
    ['Spirit', 36, 'godly'],
    ['Soul', 38, 'godly'],
    ['Beachy', 32, 'godly'],
    ['Boneblade', 35, 'godly'],
    ['Gingerblade', 30, 'godly'],
    ['Harvester', 55, 'godly'],
    ['Lightbringer', 48, 'godly'],
    ['Luger', 50, 'godly'],
    ['Seer', 60, 'godly'],
    ['Heat', 28, 'godly'],
    ['Handcuff', 25, 'godly'],
    ['Fang', 25, 'godly'],
    ['Clutter', 22, 'godly'],
    ['Brush', 20, 'godly'],
    ['Wood', 15, 'godly'],
    // Vintage / Unique
    ['Chroma Seer I', 170, 'chroma'],
    ['Godly Knife', 10, 'godly'],
  ];
  for (const [name, val, tier] of hardcoded) { stmt.run(name, val, tier); synced++; }
  console.log(`[Values] Hardcoded fallback: ${synced} armes`);
}

// ── WEAPON AUTO-RESOLVE in post ──────────────────────────────
// Quand quelqu'un tape "corrupt" dans son trade, on lookup la valeur et l'arme exacte
function resolveWeaponName(name) {
  const row = db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(name.trim());
  return row ? { name: row.name, value: row.value, tier: row.tier } : { name: name.trim(), value: 0, tier: 'unknown' };
}

// ── LEADERBOARD UPDATE ───────────────────────────────────────
async function updateLeaderboardChannel(guild) {
  const ch = guild.channels.cache.find(c => c.name.includes('leaderboard'));
  if (!ch) return;
  const top = db.prepare('SELECT discord_id,roblox_username,trade_count,vouch_count,coins,rank FROM users ORDER BY trade_count DESC LIMIT 10').all();
  if (!top.length) return;
  const medals = ['🥇', '🥈', '🥉'];
  const msgs = await ch.messages.fetch({ limit: 5 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  await ch.send({ embeds: [new EmbedBuilder().setColor(C.gold).setTitle('🏆 Top Traders MM2 — Classement Live')
    .setDescription(top.map((u, i) => `${medals[i] ?? `**${i+1}.**`} <@${u.discord_id}> — ✅ **${u.trade_count}** trades | 💬 **${u.vouch_count}** vouches | 🪙 ${u.coins} pièces | ${getRankLabel(u.rank)}`).join('\n'))
    .setFooter({ text: 'Mis à jour automatiquement toutes les 24h' }).setTimestamp()] });
}

// ── COIN LEADERBOARD UPDATE ──────────────────────────────────
async function updateShopCoinLeaderboard(guild) {
  const ch = guild.channels.cache.find(c => c.name.includes('boutique'));
  if (!ch) return;
  const top = db.prepare('SELECT discord_id,coins FROM users ORDER BY coins DESC LIMIT 10').all();
  if (!top.length) return;
  const medals = ['🥇', '🥈', '🥉'];
  // Supprimer l'ancien embed classement pièces si existe
  const msgs = await ch.messages.fetch({ limit: 20 });
  for (const m of msgs.values()) {
    if (m.author.bot && m.embeds?.[0]?.title?.includes('Classement Pièces')) await m.delete().catch(() => {});
  }
  await ch.send({ embeds: [new EmbedBuilder().setColor(C.gold).setTitle('🪙 Classement Pièces')
    .setDescription(top.map((u, i) => `${medals[i] ?? `**${i+1}.**`} <@${u.discord_id}> — **${u.coins} 🪙**`).join('\n'))
    .setFooter({ text: 'Mis à jour automatiquement' }).setTimestamp()] });
}

// ── POST WEAPON VALUES ───────────────────────────────────────
async function postWeaponValues(ch) {
  const weapons = db.prepare('SELECT * FROM weapon_values ORDER BY value DESC LIMIT 50').all();
  if (!weapons.length) return;
  const tiers = ['ancient','chroma','godly','legendary','epic','rare','uncommon','common'];
  const grouped = {}; for (const t of tiers) grouped[t] = weapons.filter(w => w.tier === t);
  const lines = [];
  for (const t of tiers) { if (!grouped[t].length) continue; lines.push(`**${TIER_LABELS[t] ?? t}**`); for (const w of grouped[t]) lines.push(`• ${w.name} — **${w.value} val**`); lines.push(''); }
  const msgs = await ch.messages.fetch({ limit: 10 }); for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  await ch.send({ embeds: [new EmbedBuilder().setColor(C.primary).setTitle('📦 Valeurs Armes MM2').setDescription(lines.join('\n').slice(0, 3900)).setFooter({ text: 'Mise à jour automatique toutes les heures' }).setTimestamp()] });
}

// ── SHARED FUNCTIONS ─────────────────────────────────────────
async function doVerify(interaction) {
  const did = interaction.user.id;
  const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if (!user?.verify_code) return interaction.editReply('❌ Lance d\'abord la vérification via le bouton dans le salon **vérification**.');
  if (user.verified) return interaction.editReply(`✅ Déjà vérifié : **${user.roblox_username}** !`);
  let desc; try { desc = await getRobloxDescription(user.roblox_id); } catch { return interaction.editReply('❌ Erreur Roblox API. Réessaie.'); }
  if (!desc.includes(user.verify_code)) return interaction.editReply(`❌ Code \`${user.verify_code}\` introuvable dans ta bio.\nAssure-toi de l'avoir sauvegardé, puis réessaie.`);
  const avatar = await getRobloxAvatar(user.roblox_id);
  db.prepare('UPDATE users SET verified=1,roblox_avatar=?,rank=? WHERE discord_id=?').run(avatar, 'new', did);
  try {
    const g = interaction.guild;
    const nv = g.roles.cache.find(r => r.name === '🆕 Nouveau');
    const nonv = g.roles.cache.find(r => r.name === '🔒 Non Vérifié');
    if (nonv) await interaction.member.roles.remove(nonv).catch(() => {});
    if (nv) await interaction.member.roles.add(nv).catch(() => {});
  } catch {}
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success).setTitle('✅ Compte Roblox vérifié !').setThumbnail(avatar)
    .setDescription([`Discord lié à **${user.roblox_username}** !`, '', 'Tu as maintenant accès à tous les salons.', 'Poste ton premier trade via le bouton dans **poster-un-trade** !'].join('\n'))] });
}

async function postTrade(interaction, did, offreStr, chercheStr) {
  const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if (!user?.verified) return interaction.editReply('❌ Lie ton compte Roblox d\'abord via le salon **vérification**.');
  const { total: ov, details: od } = calcValue(parseWeapons(offreStr));
  const { total: wv, details: wd } = calcValue(parseWeapons(chercheStr));
  if (user.rank === 'new' && ov > 100) return interaction.editReply('⚠️ Nouveaux membres limités à **100 val** max. Fais quelques trades pour débloquer.');
  const res = db.prepare('INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value,want_value) VALUES (?,?,?,?,?)').run(did, JSON.stringify(od), JSON.stringify(wd), ov, wv);
  const tid = res.lastInsertRowid;
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
  const ch = interaction.guild.channels.cache.find(c => c.name.includes('post-trades'));
  if (!ch) return interaction.editReply('❌ Salon post-trades introuvable. Lance `/wenzy-setup`.');
  const msg = await ch.send({ embeds: [tradeEmbed(trade, user)], components: [tradeButtons(tid)] });
  db.prepare('UPDATE trades SET message_id=?,channel_id=? WHERE id=?').run(msg.id, ch.id, tid);
  await interaction.editReply(`✅ Trade **#${tid}** posté dans <#${ch.id}> !`);
}

async function cancelTrade(interaction, did, tradeId) {
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if (!trade) return interaction.editReply('❌ Trade introuvable.');
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (trade.poster_id !== did && !isAdmin) return interaction.editReply('❌ Seul le posteur ou un admin peut annuler.');
  if (!['open','in_progress'].includes(trade.status)) return interaction.editReply('❌ Ce trade ne peut plus être annulé.');
  db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tradeId);
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  if (trade.thread_id) { try { const t = await interaction.guild.channels.fetch(trade.thread_id).catch(() => null); if (t) { await t.send('❌ **Trade annulé.** Ce salon sera supprimé dans 5 secondes.'); setTimeout(() => t.delete('Trade annulé').catch(() => {}), 5000); } } catch {} }
  if (trade.message_id && trade.channel_id) { try { const c = await interaction.guild.channels.fetch(trade.channel_id).catch(() => null); const m = c ? await c.messages.fetch(trade.message_id).catch(() => null) : null; if (m) await m.delete().catch(() => {}); } catch {} }
  await interaction.editReply(`✅ Trade **#${tradeId}** annulé et retiré.`);
}

async function completeTrade(guild, tradeId, screenshotUrl) {
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if (!trade) return false;
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  db.prepare(`UPDATE trades SET status='completed',completed_at=strftime('%s','now'),screenshot_url=?,screenshot_verified=1 WHERE id=?`).run(screenshotUrl, tradeId);
  for (const uid of [trade.poster_id, trade.accepter_id]) {
    if (!uid) continue;
    db.prepare('UPDATE users SET coins=coins+50,trade_count=trade_count+1 WHERE discord_id=?').run(uid);
    const u = db.prepare('SELECT trade_count FROM users WHERE discord_id=?').get(uid);
    db.prepare('UPDATE users SET rank=? WHERE discord_id=?').run(getRank(u.trade_count), uid);
    db.prepare('INSERT INTO vouches (from_id,to_id,trade_id) VALUES (?,?,?)').run(
      uid === trade.poster_id ? trade.accepter_id : trade.poster_id, uid, tradeId
    );
    db.prepare('UPDATE users SET vouch_count=vouch_count+1 WHERE discord_id=?').run(uid);
    // Upgrade rank role
    try {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (member) {
        const freshUser = db.prepare('SELECT * FROM users WHERE discord_id=?').get(uid);
        const rankRoleMap = { new: '🆕 Nouveau', confirmed: '✅ Confirmé', trusted: '⭐ Fiable', elite: '👑 Elite' };
        const targetRoleName = rankRoleMap[freshUser.rank];
        const allRankRoles = Object.values(rankRoleMap);
        for (const rn of allRankRoles) {
          const r = guild.roles.cache.find(x => x.name === rn);
          if (r && rn !== targetRoleName) await member.roles.remove(r).catch(() => {});
        }
        const targetRole = guild.roles.cache.find(x => x.name === targetRoleName);
        if (targetRole) await member.roles.add(targetRole).catch(() => {});
      }
    } catch {}
  }

  // Update l'embed dans post-trades → "COMPLÉTÉ"
  if (trade.message_id && trade.channel_id) {
    try {
      const ch = await guild.channels.fetch(trade.channel_id).catch(() => null);
      if (ch) {
        const msg = await ch.messages.fetch(trade.message_id).catch(() => null);
        if (msg) await msg.edit({ embeds: [tradeCompletedEmbed(trade)], components: [] }).catch(() => {});
      }
    } catch {}
  }

  // Vouch channel — UN seul salon vouches
  const vCh = guild.channels.cache.find(c => c.name.includes('vouches') && !c.name.includes('category'));
  if (vCh) {
    const poster = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.accepter_id);
    const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
    const embed = new EmbedBuilder().setColor(C.success)
      .setTitle(`✅ TRADE #${String(tradeId).padStart(4,'0')} — COMPLÉTÉ`)
      .addFields(
        { name: `📤 ${poster?.roblox_username ?? 'Trader'} (${getRankLabel(poster?.rank ?? 'new')})`, value: `Offrait : ${off.map(w => w.name).join(', ')}`, inline: false },
        { name: `📥 ${accepter?.roblox_username ?? 'Accepter'} (${getRankLabel(accepter?.rank ?? 'new')})`, value: `Cherchait : ${want.map(w => w.name).join(', ')}`, inline: false },
        { name: '💎 Valeur', value: `**${trade.offer_value} val** | +50 🪙 chacun | +1 vouch mutuel`, inline: false },
      ).setTimestamp();
    await vCh.send({ embeds: [embed] });
    if (screenshotUrl) await vCh.send(screenshotUrl);
  }

  // Fermer thread
  if (trade.thread_id) {
    try {
      const t = await guild.channels.fetch(trade.thread_id).catch(() => null);
      if (t) {
        await t.send(['🎉 **Trade finalisé !**', '', `✅ <@${trade.poster_id}> × <@${trade.accepter_id}>`, `💎 **${trade.offer_value} val** | +50 🪙 chacun | +1 vouch mutuel`, '', '_Ce salon sera archivé dans 10 secondes._'].join('\n'));
        setTimeout(async () => { try { await t.setArchived(true, 'Trade terminé'); } catch {} }, 10000);
      }
    } catch {}
  }

  // Mise à jour leaderboard
  await updateLeaderboardChannel(guild);
  await updateShopCoinLeaderboard(guild);
  return true;
}

// ── COMMANDS ─────────────────────────────────────────────────
const commands = [

  // /wenzy-setup — nuke tout puis recréer
  { data: new SlashCommandBuilder().setName('wenzy-setup').setDescription('🏗️ Configure (ou reset) le serveur complet').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild, log = [];

      // ── NUKE: supprimer tous les channels + rôles bot existants ──
      log.push('🧹 Nettoyage en cours...');
      const channelNamesToDelete = [
        '🔑┃verification','📌┃règles-et-info','📊┃leaderboard','📋┃logs',
        '🔗┃link-roblox','🗡️┃post-trades','📬┃poster-un-trade','💰┃price-check',
        '🏆┃vouches','🛡️┃middleman-panel','📦┃weapon-values','💬┃général',
        '📺┃vidéos-wenzy','🎙️┃vocal-général','🛒┃boutique',
        '🔒 VÉRIFICATION','📌 WENZY SYSTEM','🗡️ MM2 TRADING','💬 COMMUNAUTÉ','🛒 ECONOMY',
      ];
      for (const ch of guild.channels.cache.values()) {
        if (channelNamesToDelete.includes(ch.name)) {
          await ch.delete('wenzy-setup reset').catch(() => {});
          log.push(`🗑️ Supprimé: ${ch.name}`);
        }
      }

      // ── RÔLES ──
      const roleDefs = [
        { name: '👑 Owner', color: 0xE74C3C, hoist: true },
        { name: '⚡ Admin', color: 0xE67E22, hoist: true },
        { name: '🛡️ Modérateur', color: 0x3498DB, hoist: true },
        { name: '🤝 Middleman', color: 0x2ECC71, hoist: true },
        { name: '💎 Elite Trader', color: 0x9B59B6, hoist: true },
        { name: '👑 Elite', color: 0xF1C40F, hoist: false },
        { name: '⭐ Fiable', color: 0xF1C40F, hoist: false },
        { name: '✅ Confirmé', color: 0x27AE60, hoist: false },
        { name: '🆕 Nouveau', color: 0x95A5A6, hoist: false },
        { name: '🔒 Non Vérifié', color: 0x2C2F33, hoist: false },
      ];
      const cr = {};
      for (const rd of roleDefs) {
        const ex = guild.roles.cache.find(r => r.name === rd.name);
        if (ex) { cr[rd.name] = ex; log.push(`♻️ Rôle: ${rd.name}`); }
        else { cr[rd.name] = await guild.roles.create({ name: rd.name, color: rd.color, hoist: rd.hoist }); log.push(`✅ Rôle: ${rd.name}`); }
      }
      const admins = ['👑 Owner','⚡ Admin','🛡️ Modérateur'].map(n => cr[n]).filter(Boolean);
      const nonv = cr['🔒 Non Vérifié'];

      // ── CHANNELS ──
      const catDefs = [
        { name: '🔒 VÉRIFICATION', chs: [{ name: '🔑┃verification', verif: true }] },
        { name: '📌 WENZY SYSTEM', chs: [{ name: '📌┃règles-et-info' }, { name: '📊┃leaderboard' }, { name: '📋┃logs', staff: true }, { name: '🔗┃link-roblox' }] },
        { name: '🗡️ MM2 TRADING', chs: [{ name: '🗡️┃post-trades' }, { name: '📬┃poster-un-trade' }, { name: '💰┃price-check' }, { name: '🏆┃vouches' }, { name: '🛡️┃middleman-panel', staff: true }, { name: '📦┃weapon-values' }] },
        { name: '💬 COMMUNAUTÉ', chs: [{ name: '💬┃général' }, { name: '📺┃vidéos-wenzy' }, { name: '🎙️┃vocal-général', voice: true }] },
        { name: '🛒 ECONOMY', chs: [{ name: '🛒┃boutique' }] },
      ];
      const cm = {};
      for (const cd of catDefs) {
        const cat = await guild.channels.create({ name: cd.name, type: ChannelType.GuildCategory, permissionOverwrites: [{ id: guild.id, allow: [PermissionFlagsBits.ViewChannel] }, nonv ? { id: nonv.id, deny: [PermissionFlagsBits.ViewChannel] } : null].filter(Boolean) });
        log.push(`📁 ${cd.name}`);
        for (const ch of cd.chs) {
          const pows = [];
          if (ch.verif) {
            pows.push({ id: guild.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
            if (nonv) pows.push({ id: nonv.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
          } else if (ch.staff) {
            pows.push({ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] });
            for (const r of admins) pows.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
          } else {
            pows.push({ id: guild.id, allow: [PermissionFlagsBits.ViewChannel] });
            if (nonv) pows.push({ id: nonv.id, deny: [PermissionFlagsBits.ViewChannel] });
          }
          cm[ch.name] = await guild.channels.create({ name: ch.name, type: ch.voice ? ChannelType.GuildVoice : ChannelType.GuildText, parent: cat.id, permissionOverwrites: pows });
          log.push(`✅ Salon: ${ch.name}`);
        }
      }

      // ── EMBEDS DANS SALONS ──
      const verifCh = cm['🔑┃verification'];
      if (verifCh) {
        await verifCh.send({ embeds: [new EmbedBuilder().setColor(C.primary).setTitle('🔑 Vérification Roblox')
          .setDescription(['**Bienvenue sur le serveur !** 👋', '', 'Pour accéder à tous les salons, tu dois lier ton compte Roblox.', '', '**Étape 1** — Clique sur le bouton ci-dessous', '**Étape 2** — Entre ton pseudo Roblox dans le formulaire', '**Étape 3** — Colle le code généré dans ta bio Roblox', '**Étape 4** — Reviens ici et clique Confirmer', '', '> ✅ Une fois vérifié, tu obtiens le rôle **🆕 Nouveau** et accès à tous les salons.'].join('\n'))
          .setFooter({ text: 'Wenzy Bot v3 — Vérification via API Roblox officielle' })],
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte Roblox').setStyle(ButtonStyle.Primary))] });
        log.push('✅ Embed vérification');
      }

      const ptCh = cm['📬┃poster-un-trade'];
      if (ptCh) {
        await ptCh.send({ embeds: [new EmbedBuilder().setColor(C.primary).setTitle('📬 Poster un Trade MM2')
          .setDescription(['Clique sur le bouton pour créer un trade.', '', '• Indique ce que tu offres (séparés par virgules)', '• Indique ce que tu cherches en échange', '', '_Le trade sera publié dans **post-trades** automatiquement avec les valeurs récupérées._'].join('\n'))],
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_post_trade').setLabel('🗡️ Poster un Trade').setStyle(ButtonStyle.Success))] });
        log.push('✅ Embed poster-un-trade');
      }

      const priceCh = cm['💰┃price-check'];
      if (priceCh) {
        await priceCh.send({ embeds: [new EmbedBuilder().setColor(C.info).setTitle('💰 Price Check MM2')
          .setDescription(['**Comment utiliser le Price Check ?**', '', '`/trade check offre:<armes> recois:<armes>`', '', '**Exemple :**', '`/trade check offre:Corrupt,Elderwood Scythe recois:Chroma Seer`', '', '**Ce que tu obtiens :**', '• Valeur de chaque arme', '• Total des deux côtés', '• Indication si le trade est **Fair**, **Avantageux** ou **Unfair**', '', '> 💡 Les valeurs sont synchronisées automatiquement depuis MM2Values.'].join('\n'))
          .setFooter({ text: '0 = valeur inconnue dans la base | /updatevalue pour ajouter' })],
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_price_check_help').setLabel('📖 Guide complet').setStyle(ButtonStyle.Secondary))] });
        log.push('✅ Embed price-check');
      }

      const valCh = cm['📦┃weapon-values'];
      if (valCh) { await postWeaponValues(valCh); log.push('✅ Valeurs armes'); }

      const boutiqueCh = cm['🛒┃boutique'];
      if (boutiqueCh) { await postShopEmbed(boutiqueCh); log.push('✅ Boutique embed'); }

      await updateLeaderboardChannel(guild);
      log.push('✅ Leaderboard initialisé');

      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success).setTitle('🏗️ Setup v3 terminé !')
        .setDescription(log.map(l => `\`${l}\``).join('\n').slice(0, 3900))
        .addFields({ name: '📋 Prochaines étapes', value: ['1. Donne-toi le rôle **👑 Owner**', '2. Configure `ANTHROPIC_API_KEY` + optionnel `ANTHROPIC_BASE_URL` dans Railway', '3. `/addserver <lien>` pour les serveurs privés MM2', '4. `/configjeux <salon>` pour configurer les jeux (optionnel)'].join('\n') }).setTimestamp()] });
    }
  },

  // /link
  { data: new SlashCommandBuilder().setName('link').setDescription('🔗 Lie ton compte Roblox').addStringOption(o => o.setName('username').setDescription('Ton pseudo Roblox exact').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const username = interaction.options.getString('username'), did = interaction.user.id;
      let rb; try { rb = await searchRobloxUser(username); } catch { return interaction.editReply('❌ API Roblox indisponible. Réessaie.'); }
      if (!rb) return interaction.editReply(`❌ Pseudo Roblox **${username}** introuvable.`);
      const code = genCode();
      const ex = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      if (ex) db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id), rb.name, code, did);
      else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did, String(rb.id), rb.name, code);
      try { const nv = interaction.guild.roles.cache.find(r => r.name === '🔒 Non Vérifié'); if (nv && !interaction.member.roles.cache.has(nv.id)) await interaction.member.roles.add(nv); } catch {}
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info).setTitle('🔗 Vérification — Étape 1/2')
        .setDescription([`Compte : **${rb.name}** (ID: ${rb.id})`, '', '**Code à coller dans ta bio Roblox :**', `\`\`\`${code}\`\`\``, '→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)', '', 'Reviens ici et clique Vérifier.'].join('\n')).setFooter({ text: 'Code valable 15 min' })],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))] });
    }
  },

  // /verify
  { data: new SlashCommandBuilder().setName('verify').setDescription('✅ Confirme la vérification Roblox'),
    async execute(interaction) { await interaction.deferReply({ ephemeral: true }); await doVerify(interaction); }
  },

  // /trade
  { data: new SlashCommandBuilder().setName('trade').setDescription('🗡️ Système de trades MM2')
      .addSubcommand(s => s.setName('post').setDescription('📤 Poster un trade').addStringOption(o => o.setName('offre').setDescription('Armes offertes (virgules)').setRequired(true)).addStringOption(o => o.setName('cherche').setDescription('Ce que tu cherches').setRequired(true)))
      .addSubcommand(s => s.setName('cancel').setDescription('❌ Annuler ton trade').addIntegerOption(o => o.setName('id').setDescription('ID du trade').setRequired(true)))
      .addSubcommand(s => s.setName('check').setDescription('⚖️ Price check').addStringOption(o => o.setName('offre').setDescription('Armes offertes').setRequired(true)).addStringOption(o => o.setName('recois').setDescription('Armes reçues').setRequired(true))),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand(), did = interaction.user.id;
      if (sub === 'post') { await interaction.deferReply({ ephemeral: true }); await postTrade(interaction, did, interaction.options.getString('offre'), interaction.options.getString('cherche')); }
      else if (sub === 'cancel') { await interaction.deferReply({ ephemeral: true }); await cancelTrade(interaction, did, interaction.options.getInteger('id')); }
      else if (sub === 'check') {
        await interaction.deferReply({ ephemeral: true });
        const { total: ov, details: od } = calcValue(parseWeapons(interaction.options.getString('offre')));
        const { total: rv, details: rd } = calcValue(parseWeapons(interaction.options.getString('recois')));
        const diff = ov - rv, fair = Math.abs(diff) <= 20;
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(fair ? C.success : (diff > 0 ? C.danger : C.gold)).setTitle('⚖️ Price Check MM2')
          .addFields(
            { name: '📤 Tu offres', value: od.map(w => `${w.name} → **${w.value} val**`).join('\n') + `\n**Total : ${ov} val**`, inline: true },
            { name: '📥 Tu reçois', value: rd.map(w => `${w.name} → **${w.value} val**`).join('\n') + `\n**Total : ${rv} val**`, inline: true },
            { name: '⚖️ Résultat', value: (fair ? '⚖️ Fair' : (diff > 0 ? '📉 Unfair — tu perds' : '📈 Avantageux pour toi')) + `\nDiff : ${Math.abs(diff)} val`, inline: false },
          ).setTimestamp()] });
      }
    }
  },

  // /profil
  { data: new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche un profil').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const target = interaction.options.getUser('membre') ?? interaction.user;
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
      if (!user) return interaction.editReply(`❌ <@${target.id}> n'a pas encore de profil.`);
      const inv = db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(target.id);
      await interaction.editReply({ embeds: [profileEmbed(user, inv).setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })] });
    }
  },

  // /inventory
  { data: new SlashCommandBuilder().setName('inventory').setDescription('📦 Gère ton inventory MM2')
      .addSubcommand(s => s.setName('add').setDescription('➕ Ajouter une arme').addStringOption(o => o.setName('arme').setDescription('Nom').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('➖ Retirer une arme').addStringOption(o => o.setName('arme').setDescription('Nom exact').setRequired(true)))
      .addSubcommand(s => s.setName('view').setDescription('👀 Voir')),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true }); const sub = interaction.options.getSubcommand(), did = interaction.user.id;
      if (sub === 'add') { const name = interaction.options.getString('arme'); const row = db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(name); const val = row?.value ?? 0; db.prepare('INSERT INTO inventory (discord_id,weapon_name,weapon_value,verified) VALUES (?,?,?,?)').run(did, row?.name ?? name, val, val > 0 ? 1 : 0); await interaction.editReply(`✅ **${row?.name ?? name}** ajouté — **${val} val** ${val > 0 ? '✅' : '⚠️ valeur inconnue'}`); }
      else if (sub === 'remove') { const name = interaction.options.getString('arme'); const r = db.prepare('DELETE FROM inventory WHERE discord_id=? AND LOWER(weapon_name)=LOWER(?)').run(did, name); if (!r.changes) return interaction.editReply('❌ Introuvable.'); await interaction.editReply(`✅ **${name}** retiré.`); }
      else { const inv = db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(did); if (!inv.length) return interaction.editReply('📦 Inventory vide. Ajoute avec `/inventory add <arme>`.'); const total = inv.reduce((a, w) => a + w.weapon_value, 0); await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.primary).setTitle('📦 Ton Inventory MM2').setDescription(inv.map(w => `• **${w.weapon_name}** — ${w.weapon_value} val ${w.verified ? '✅' : '⚠️'}`).join('\n').slice(0, 2000)).setFooter({ text: `Valeur totale : ~${total} val` })] }); }
    }
  },

  // /updatevalue
  { data: new SlashCommandBuilder().setName('updatevalue').setDescription('💰 (Admin) Mettre à jour une arme').addStringOption(o => o.setName('arme').setDescription('Nom').setRequired(true)).addIntegerOption(o => o.setName('valeur').setDescription('Valeur').setRequired(true)).addStringOption(o => o.setName('tier').setDescription('Tier').addChoices({ name: 'Godly', value: 'godly' }, { name: 'Chroma', value: 'chroma' }, { name: 'Ancient', value: 'ancient' }, { name: 'Legendary', value: 'legendary' }, { name: 'Epic', value: 'epic' }, { name: 'Rare', value: 'rare' })).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const name = interaction.options.getString('arme'), value = interaction.options.getInteger('valeur'), tier = interaction.options.getString('tier') ?? 'godly';
      db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now')) ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`).run(name, value, tier);
      await interaction.editReply(`✅ **${name}** → **${value} val** (${tier})`);
    }
  },

  // /updatevalues
  { data: new SlashCommandBuilder().setName('updatevalues').setDescription('🔄 (Admin) Sync valeurs MM2 live').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true }); await fetchMM2Values();
      const count = db.prepare('SELECT COUNT(*) as c FROM weapon_values').get().c;
      await interaction.editReply(`✅ Sync terminée. **${count}** armes dans la base.`);
    }
  },

  // /values
  { data: new SlashCommandBuilder().setName('values').setDescription('📦 Voir les valeurs MM2').addStringOption(o => o.setName('tier').setDescription('Filtrer').addChoices({ name: '🌈 Chroma', value: 'chroma' }, { name: '⚡ Ancient', value: 'ancient' }, { name: '🔥 Godly', value: 'godly' }, { name: 'Toutes', value: 'all' })).addStringOption(o => o.setName('arme').setDescription('Chercher une arme')),
    async execute(interaction) {
      await interaction.deferReply();
      const tier = interaction.options.getString('tier') ?? 'all', arme = interaction.options.getString('arme');
      let w;
      if (arme) w = db.prepare('SELECT * FROM weapon_values WHERE LOWER(name) LIKE LOWER(?) ORDER BY value DESC').all(`%${arme}%`);
      else if (tier === 'all') w = db.prepare('SELECT * FROM weapon_values ORDER BY value DESC LIMIT 30').all();
      else w = db.prepare('SELECT * FROM weapon_values WHERE tier=? ORDER BY value DESC').all(tier);
      if (!w.length) return interaction.editReply('❌ Aucune arme trouvée.');
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(tier !== 'all' ? (TIER_COLORS[tier] ?? C.primary) : C.primary).setTitle(`📦 Valeurs MM2${tier !== 'all' ? ` — ${TIER_LABELS[tier] ?? tier}` : ''}`).setDescription(w.map(x => `• **${x.name}** — ${x.value} val _(${TIER_LABELS[x.tier] ?? x.tier})_`).join('\n').slice(0, 2000)).setFooter({ text: `${w.length} arme(s) • Sync auto toutes les heures` }).setTimestamp()] });
    }
  },

  // /leaderboard
  { data: new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement traders'),
    async execute(interaction) {
      await interaction.deferReply();
      const top = db.prepare('SELECT discord_id,roblox_username,trade_count,vouch_count,coins,rank FROM users ORDER BY trade_count DESC LIMIT 10').all();
      if (!top.length) return interaction.editReply('Aucun trader enregistré.');
      const medals = ['🥇', '🥈', '🥉'];
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold).setTitle('🏆 Top Traders MM2')
        .setDescription(top.map((u, i) => `${medals[i] ?? `**${i+1}.**`} <@${u.discord_id}> — ✅ **${u.trade_count}** trades | 💬 **${u.vouch_count}** vouches | 🪙 ${u.coins} | ${getRankLabel(u.rank)}`).join('\n'))
        .setTimestamp()] });
    }
  },

  // /addserver
  { data: new SlashCommandBuilder().setName('addserver').setDescription('🎮 (Admin) Ajouter serveur privé MM2').addStringOption(o => o.setName('lien').setDescription('Lien Roblox').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const link = interaction.options.getString('lien');
      try { db.prepare('INSERT INTO private_servers (link,added_by) VALUES (?,?)').run(link, interaction.user.id); } catch { return interaction.editReply('⚠️ Ce lien est déjà dans le pool.'); }
      const count = db.prepare('SELECT COUNT(*) as c FROM private_servers WHERE in_use=0').get().c;
      await interaction.editReply(`✅ Serveur ajouté ! **${count}** disponibles.`);
    }
  },

  // /listservers
  { data: new SlashCommandBuilder().setName('listservers').setDescription('📋 (Admin) Voir pool serveurs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const servers = db.prepare('SELECT * FROM private_servers ORDER BY in_use ASC').all();
      if (!servers.length) return interaction.editReply('📋 Pool vide. Ajoute avec `/addserver`.');
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info).setTitle('🎮 Pool Serveurs MM2').setDescription(servers.map(s => `**#${s.id}** ${s.in_use ? '🔴 En cours' : '🟢 Libre'} \`${s.link.slice(0, 50)}\``).join('\n').slice(0, 2000)).setFooter({ text: `Total : ${servers.length} | Libres : ${servers.filter(s => !s.in_use).length}` })] });
    }
  },

  // /report
  { data: new SlashCommandBuilder().setName('report').setDescription('🚨 Reporter un scam').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)).addIntegerOption(o => o.setName('trade').setDescription('ID trade (optionnel)')),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const reported = interaction.options.getUser('membre'), reason = interaction.options.getString('raison'), tradeId = interaction.options.getInteger('trade');
      db.prepare('INSERT INTO reports (reporter_id,reported_id,trade_id,reason) VALUES (?,?,?,?)').run(interaction.user.id, reported.id, tradeId ?? null, reason);
      db.prepare('UPDATE users SET report_count=report_count+1 WHERE discord_id=?').run(reported.id);
      const logsCh = interaction.guild.channels.cache.find(c => c.name.includes('logs'));
      if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(C.danger).setTitle('🚨 Nouveau Report').addFields({ name: '🕵️ Reporter', value: `<@${interaction.user.id}>`, inline: true }, { name: '⚠️ Reporté', value: `<@${reported.id}>`, inline: true }, { name: '🗡️ Trade', value: tradeId ? `#${tradeId}` : 'Non précisé', inline: true }, { name: '📝 Raison', value: reason }).setTimestamp()] });
      await interaction.editReply(`✅ Report envoyé contre <@${reported.id}>.`);
    }
  },

  // /configjeux — salon jeux configurable
  { data: new SlashCommandBuilder().setName('configjeux').setDescription('🎮 (Admin) Configurer le salon jeux').addChannelOption(o => o.setName('salon').setDescription('Salon pour les jeux').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const ch = interaction.options.getChannel('salon');
      await ch.send({ embeds: [new EmbedBuilder().setColor(C.primary).setTitle('🎮 Salon Jeux')
        .setDescription(['Bienvenue dans le salon jeux !', '', '**Jeux disponibles :**', '• 🎯 Devinette armes MM2', '• 🃏 Duel de values', '• 🏆 Tournoi trades', '', '_Plus de jeux arrivent prochainement..._'].join('\n'))] });
      await interaction.editReply(`✅ Salon jeux configuré dans <#${ch.id}> !`);
    }
  },

  // /configvideo — salon vidéo configurable
  { data: new SlashCommandBuilder().setName('configvideo').setDescription('📺 (Admin) Configurer le salon vidéo Wenzy').addChannelOption(o => o.setName('salon').setDescription('Salon pour les vidéos').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const ch = interaction.options.getChannel('salon');
      process.env.VIDEO_CHANNEL_OVERRIDE = ch.id;
      await interaction.editReply(`✅ Salon vidéo Wenzy configuré sur <#${ch.id}> ! Les nouvelles vidéos y seront postées.`);
    }
  },

  // /hotrades — les plus gros trades
  { data: new SlashCommandBuilder().setName('hotrades').setDescription('🔥 Voir les trades les plus gros en valeur'),
    async execute(interaction) {
      await interaction.deferReply();
      const hot = db.prepare('SELECT * FROM trades WHERE status=? ORDER BY offer_value DESC LIMIT 5').all('open');
      if (!hot.length) return interaction.editReply('📭 Aucun hot trade en ce moment.');
      const embeds = hot.map(t => {
        const poster = db.prepare('SELECT * FROM users WHERE discord_id=?').get(t.poster_id);
        return tradeEmbed(t, poster);
      });
      await interaction.editReply({ content: '🔥 **Les 5 plus gros trades ouverts en ce moment :**', embeds: embeds.slice(0, 5) });
    }
  },

  // /shop
  { data: new SlashCommandBuilder().setName('shop').setDescription('🛒 Boutique — acheter un rôle custom'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold).setTitle('🛒 Boutique Wenzy')
        .setDescription(['**Articles disponibles :**', '', '🎨 **Rôle couleur custom** — 500 🪙', '> Choisis un nom + couleur (hex) pour ton rôle', '', '👑 **Rôle VIP** — 1000 🪙', '> Rôle VIP permanent avec accès à des avantages', '', '🏆 **Badge Elite** — 10 000 🪙', '> Badge de prestige visible sur ton profil'].join('\n'))
        .addFields({ name: '🪙 Tes pièces', value: `**${user?.coins ?? 0}**`, inline: true }, { name: '📊 Comment gagner des pièces ?', value: '+5 🪙 par message (1 min cooldown)\n+1 🪙 par minute en vocal\n+50 🪙 par trade complété', inline: false })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('shop_role_custom').setLabel('🎨 Rôle Custom (500 🪙)').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('shop_vip').setLabel('👑 VIP (1000 🪙)').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('shop_elite_badge').setLabel('🏆 Elite (10 000 🪙)').setStyle(ButtonStyle.Secondary),
        )] });
    }
  },
];

// ── SHOP EMBED dans salon boutique ───────────────────────────
async function postShopEmbed(ch) {
  const msgs = await ch.messages.fetch({ limit: 10 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  await ch.send({ embeds: [new EmbedBuilder().setColor(C.gold).setTitle('🛒 Boutique Wenzy — Achète des rôles customs')
    .setDescription(['Utilise tes 🪙 pour acheter des rôles et avantages !', '', '🎨 **Rôle couleur custom** — 500 🪙', '👑 **Rôle VIP** — 1 000 🪙', '🏆 **Badge Elite** — 10 000 🪙', '', '**Comment gagner des pièces ?**', '• +5 🪙 par message (cooldown 1 min)', '• +1 🪙 par minute en vocal', '• +50 🪙 par trade complété', '', '_Clique sur le bouton "Boutique" ou tape `/shop` pour acheter._'].join('\n'))
    .setFooter({ text: 'Classement pièces mis à jour automatiquement' })] });
}

// ── BUTTON HANDLER ───────────────────────────────────────────
async function handleButton(interaction) {
  const { customId, guild, user } = interaction;

  if (customId === 'btn_link_start') {
    const modal = new ModalBuilder().setCustomId('modal_link_roblox').setTitle('🔗 Lier ton compte Roblox');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roblox_username').setLabel('Ton pseudo Roblox exact').setStyle(TextInputStyle.Short).setPlaceholder('ex: WenzyFR').setRequired(true).setMinLength(3).setMaxLength(20)));
    return interaction.showModal(modal);
  }

  if (customId === 'btn_verify_now') { await interaction.deferReply({ ephemeral: true }); return doVerify(interaction); }

  if (customId === 'btn_post_trade') {
    const modal = new ModalBuilder().setCustomId('modal_post_trade').setTitle('🗡️ Poster un Trade MM2');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_offre').setLabel('Armes que tu offres (virgules)').setStyle(TextInputStyle.Short).setPlaceholder('ex: Chroma Seer, Corrupt').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_cherche').setLabel('Ce que tu cherches').setStyle(TextInputStyle.Short).setPlaceholder('ex: Ancient Seer').setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (customId === 'btn_price_check_help') {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info).setTitle('💰 Guide Price Check MM2')
      .setDescription(['**Commande :** `/trade check offre:<armes> recois:<armes>`', '', '**Exemple :**', '`/trade check offre:Corrupt,Elderwood Scythe recois:Chroma Seer`', '', '**Résultat :**', '• Valeur précise de chaque arme', '• Comparaison des deux côtés du trade', '• ⚖️ Fair = différence ≤ 20 val', '• 📉 Unfair = tu perds de la valeur', '• 📈 Avantageux = tu gagnes de la valeur', '', '**Note :** Les valeurs viennent de MM2Values et se sync toutes les heures.'].join('\n'))] });
  }

  // Shop buttons
  if (customId === 'shop_role_custom') {
    const user2 = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!user2 || user2.coins < 500) { await interaction.deferReply({ ephemeral: true }); return interaction.editReply(`❌ Tu n'as pas assez de pièces. Il te faut **500 🪙** (tu en as **${user2?.coins ?? 0}**).`); }
    const modal = new ModalBuilder().setCustomId('modal_shop_role_custom').setTitle('🎨 Acheter un rôle custom');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_name').setLabel('Nom du rôle').setStyle(TextInputStyle.Short).setPlaceholder('ex: 🌙 LunarTrader').setRequired(true).setMaxLength(30)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_color').setLabel('Couleur hex (ex: #FF5733) ou "dégradé"').setStyle(TextInputStyle.Short).setPlaceholder('#FF5733').setRequired(true).setMaxLength(20)),
    );
    return interaction.showModal(modal);
  }

  if (customId === 'shop_vip') {
    await interaction.deferReply({ ephemeral: true });
    const user2 = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!user2 || user2.coins < 1000) return interaction.editReply(`❌ Il te faut **1 000 🪙** (tu en as **${user2?.coins ?? 0}**).`);
    db.prepare('UPDATE users SET coins=coins-1000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id, 'vip_role', 1000);
    const vipRole = guild.roles.cache.find(r => r.name === '👑 VIP') || await guild.roles.create({ name: '👑 VIP', color: 0xF1C40F, hoist: true });
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member) await member.roles.add(vipRole).catch(() => {});
    await updateShopCoinLeaderboard(guild);
    return interaction.editReply('✅ **Rôle VIP** acheté et attribué ! Profite bien.');
  }

  if (customId === 'shop_elite_badge') {
    await interaction.deferReply({ ephemeral: true });
    const user2 = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!user2 || user2.coins < 10000) return interaction.editReply(`❌ Il te faut **10 000 🪙** (tu en as **${user2?.coins ?? 0}**).`);
    db.prepare('UPDATE users SET coins=coins-10000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id, 'elite_badge', 10000);
    const eliteRole = guild.roles.cache.find(r => r.name === '💎 Elite Trader');
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member && eliteRole) await member.roles.add(eliteRole).catch(() => {});
    await updateShopCoinLeaderboard(guild);
    return interaction.editReply('✅ **Badge Elite** acheté ! Tu es maintenant **💎 Elite Trader**.');
  }

  if (customId.startsWith('trade_accept_')) {
    await interaction.deferReply({ ephemeral: true });
    const tid = parseInt(customId.replace('trade_accept_', ''));
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (!trade) return interaction.editReply('❌ Trade introuvable.');
    if (trade.poster_id === user.id) return interaction.editReply('❌ Tu ne peux pas accepter ton propre trade.');
    if (trade.status !== 'open') return interaction.editReply('❌ Ce trade n\'est plus disponible.');
    const accUser = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!accUser?.verified) return interaction.editReply('❌ Lie ton compte Roblox d\'abord via le salon **vérification**.');
    db.prepare('UPDATE trades SET accepter_id=?,status=? WHERE id=?').run(user.id, 'in_progress', tid);
    const updated = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    const poster = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);

    // Modifier l'embed dans post-trades → EN COURS
    if (trade.message_id && trade.channel_id) {
      try {
        const tCh2 = await guild.channels.fetch(trade.channel_id).catch(() => null);
        if (tCh2) {
          const msg = await tCh2.messages.fetch(trade.message_id).catch(() => null);
          if (msg) await msg.edit({ embeds: [tradeInProgressEmbed(updated, poster, accepter)], components: [] }).catch(() => {});
        }
      } catch {}
    }

    let thread;
    try {
      const tCh = guild.channels.cache.find(c => c.name.includes('post-trades'));
      thread = await tCh.threads.create({ name: `🗡️ Trade #${tid} — ${poster?.roblox_username ?? 'Trader'} × ${accepter?.roblox_username ?? 'Accepter'}`, type: ChannelType.PrivateThread, reason: `Trade #${tid}`, invitable: false });
      await thread.members.add(trade.poster_id);
      await thread.members.add(user.id);
    } catch (e) { console.error('Thread:', e.message); }

    if (thread) {
      db.prepare('UPDATE trades SET thread_id=? WHERE id=?').run(thread.id, tid);
      const server = getFreeServer();
      if (server) { db.prepare('UPDATE private_servers SET in_use=1,trade_id=? WHERE id=?').run(tid, server.id); db.prepare('UPDATE trades SET server_link=? WHERE id=?').run(server.link, tid); }
      await thread.send({ embeds: [threadSummaryEmbed(updated, poster, accepter)], components: [threadButtons(tid)] });
      if (server) await thread.send(`🎮 **Serveur Privé MM2 — Rejoins maintenant :**\n${server.link}`);
      await thread.send('📸 **Exemple de screenshot attendu — envoie un screenshot identique après le trade :**');
      if (fs.existsSync(REF_SCREEN_PATH)) await thread.send({ files: [REF_SCREEN_PATH] });
      const mmPanel = guild.channels.cache.find(c => c.name.includes('middleman-panel'));
      if (mmPanel) { const mmRole = guild.roles.cache.find(r => r.name.includes('Middleman')); await mmPanel.send({ content: mmRole ? `<@&${mmRole.id}>` : '🛡️ Middlemen', embeds: [mmPanelEmbed(updated, poster, accepter)], components: [mmButtons(tid)] }); }
    }
    return interaction.editReply(`✅ Trade **#${tid}** accepté ! Regarde le thread privé créé.`);
  }

  if (customId.startsWith('trade_cancel_')) { await interaction.deferReply({ ephemeral: true }); return cancelTrade(interaction, user.id, parseInt(customId.replace('trade_cancel_', ''))); }

  if (customId.startsWith('trade_middleman_') || customId.startsWith('trade_negotiate_')) {
    await interaction.deferReply({ ephemeral: true });
    const tid = parseInt(customId.split('_').pop());
    const mmRole = guild.roles.cache.find(r => r.name.includes('Middleman'));
    const mmPanel = guild.channels.cache.find(c => c.name.includes('middleman-panel'));
    if (mmPanel && mmRole) await mmPanel.send(`🛡️ <@&${mmRole.id}> — Middleman demandé pour Trade **#${tid}** par <@${user.id}>`);
    return interaction.editReply('✅ Un middleman a été appelé !');
  }

  if (customId.startsWith('mm_validate_')) {
    await interaction.deferReply({ ephemeral: true });
    const tid = parseInt(customId.replace('mm_validate_', ''));
    const mmRole = guild.roles.cache.find(r => r.name.includes('Middleman') || r.name.includes('Modérateur'));
    if (mmRole && !interaction.member.roles.cache.has(mmRole.id)) return interaction.editReply('❌ Réservé aux middlemen.');
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    await completeTrade(guild, tid, trade?.screenshot_url ?? null);
    return interaction.editReply(`✅ Trade **#${tid}** validé.`);
  }

  if (customId.startsWith('mm_cancel_')) {
    await interaction.deferReply({ ephemeral: true });
    const tid = parseInt(customId.replace('mm_cancel_', ''));
    db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tid);
    db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tid);
    return interaction.editReply(`❌ Trade **#${tid}** annulé.`);
  }

  if (customId.startsWith('mm_report_')) {
    await interaction.deferReply({ ephemeral: true });
    const tid = parseInt(customId.replace('mm_report_', ''));
    db.prepare('UPDATE trades SET status=? WHERE id=?').run('disputed', tid);
    const logsCh = guild.channels.cache.find(c => c.name.includes('logs'));
    if (logsCh) await logsCh.send(`🚨 **SCAM REPORT** — Trade **#${tid}** signalé par <@${user.id}>.`);
    return interaction.editReply('🚨 Scam reporté. Enquête ouverte.');
  }
}

// ── MODAL HANDLER ────────────────────────────────────────────
async function handleModal(interaction) {
  const { customId } = interaction;

  if (customId === 'modal_link_roblox') {
    await interaction.deferReply({ ephemeral: true });
    const username = interaction.fields.getTextInputValue('roblox_username'), did = interaction.user.id;
    let rb; try { rb = await searchRobloxUser(username); } catch { return interaction.editReply('❌ API Roblox indisponible.'); }
    if (!rb) return interaction.editReply(`❌ Pseudo Roblox **${username}** introuvable.`);
    const code = genCode();
    const ex = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
    if (ex) db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id), rb.name, code, did);
    else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did, String(rb.id), rb.name, code);
    try { const nv = interaction.guild.roles.cache.find(r => r.name === '🔒 Non Vérifié'); if (nv && !interaction.member.roles.cache.has(nv.id)) await interaction.member.roles.add(nv); } catch {}
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info).setTitle('🔗 Code généré !')
      .setDescription([`Compte : **${rb.name}**`, '', '**Code à coller dans ta bio Roblox :**', `\`\`\`${code}\`\`\``, '→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)', '', 'Reviens et clique Vérifier.'].join('\n'))],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))] });
  }

  if (customId === 'modal_post_trade') {
    await interaction.deferReply({ ephemeral: true });
    return postTrade(interaction, interaction.user.id, interaction.fields.getTextInputValue('trade_offre'), interaction.fields.getTextInputValue('trade_cherche'));
  }

  // Acheter rôle custom via modal
  if (customId === 'modal_shop_role_custom') {
    await interaction.deferReply({ ephemeral: true });
    const roleName = interaction.fields.getTextInputValue('role_name');
    const roleColorInput = interaction.fields.getTextInputValue('role_color').trim();
    const user2 = db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
    if (!user2 || user2.coins < 500) return interaction.editReply('❌ Pas assez de pièces.');
    // Parse couleur
    let colorHex = 0x7B2FBE; // default purple
    const isDeg = roleColorInput.toLowerCase().includes('dégradé') || roleColorInput.toLowerCase().includes('degrade');
    if (!isDeg) {
      const match = roleColorInput.match(/#?([0-9a-fA-F]{6})/);
      if (match) colorHex = parseInt(match[1], 16);
    }
    try {
      const newRole = await interaction.guild.roles.create({ name: roleName, color: colorHex, hoist: false });
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (member) await member.roles.add(newRole).catch(() => {});
      db.prepare('UPDATE users SET coins=coins-500 WHERE discord_id=?').run(interaction.user.id);
      db.prepare('INSERT INTO shop_purchases (discord_id,item_type,item_data,coins_spent) VALUES (?,?,?,?)').run(interaction.user.id, 'custom_role', JSON.stringify({ name: roleName, color: roleColorInput }), 500);
      await updateShopCoinLeaderboard(interaction.guild);
      await interaction.editReply(`✅ Rôle **${roleName}** créé et attribué ! ${isDeg ? '(Dégradé non supporté nativement par Discord, couleur violet utilisée)' : ''}`);
    } catch (e) {
      await interaction.editReply(`❌ Erreur lors de la création du rôle : ${e.message}`);
    }
  }
}

// ── YOUTUBE WATCHER ──────────────────────────────────────────
function startYoutubeWatcher(client) {
  const { YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID } = process.env;
  if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) { console.log('[YouTube] Désactivé — clé manquante'); return; }
  cron.schedule('*/5 * * * *', async () => {
    try {
      const res = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&order=date&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`);
      const video = res.data.items?.[0]; if (!video) return;
      const videoId = video.id.videoId;
      const lastRow = db.prepare('SELECT * FROM youtube_last WHERE id=1').get();
      if (lastRow.video_id === videoId) return;
      db.prepare(`UPDATE youtube_last SET video_id=?,checked_at=strftime('%s','now') WHERE id=1`).run(videoId);
      const { snippet } = video, url = `https://www.youtube.com/watch?v=${videoId}`;
      for (const [, guild] of client.guilds.cache) {
        // Utiliser le salon configuré via /configvideo ou fallback sur vidéos-wenzy
        const overrideCh = process.env.VIDEO_CHANNEL_OVERRIDE ? guild.channels.cache.get(process.env.VIDEO_CHANNEL_OVERRIDE) : null;
        const ch = overrideCh || guild.channels.cache.find(c => c.name.includes('vidéos-wenzy') || c.name.includes('videos-wenzy'));
        if (!ch) continue;
        await ch.send({ content: `📺 @everyone **Wenzy vient de poster une nouvelle vidéo !**\n${url}`, embeds: [new EmbedBuilder().setColor(C.danger).setTitle('🔴 NOUVELLE VIDÉO').setDescription(`**${snippet.title}**`).setImage(snippet.thumbnails.high?.url ?? snippet.thumbnails.default?.url).setFooter({ text: `Publiée le ${new Date(snippet.publishedAt).toLocaleDateString('fr-FR')}` }).setTimestamp()] });
      }
      console.log('[YouTube] Nouvelle vidéo:', snippet.title);
    } catch (e) { console.error('[YouTube]', e.message); }
  });
  console.log('[YouTube] Watcher actif (5min)');
}

// ── CLIENT ───────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
client.commands = new Collection();
for (const cmd of commands) client.commands.set(cmd.data.name, cmd);

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName); if (!cmd) return;
    try { await cmd.execute(interaction); } catch (err) { console.error(`[CMD] ${interaction.commandName}:`, err); const r = { content: '❌ Erreur.', ephemeral: true }; if (interaction.deferred || interaction.replied) await interaction.editReply(r).catch(() => {}); else await interaction.reply(r).catch(() => {}); }
    return;
  }
  if (interaction.isButton()) { try { await handleButton(interaction); } catch (e) { console.error('[BTN]', e.message); } return; }
  if (interaction.isModalSubmit()) { try { await handleModal(interaction); } catch (e) { console.error('[MODAL]', e.message); } }
});

// ── Screenshot listener ─────────────────────────────────────
const msgCooldowns = new Map();
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const uid = message.author.id, now = Date.now();
  if (!msgCooldowns.has(uid) || now - msgCooldowns.get(uid) >= 60_000) {
    msgCooldowns.set(uid, now);
    db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
    db.prepare('UPDATE users SET coins=coins+5 WHERE discord_id=?').run(uid);
  }
  if (!message.channel.isThread()) return;
  const trade = db.prepare('SELECT * FROM trades WHERE thread_id=? AND status=?').get(message.channel.id, 'in_progress');
  if (!trade) return;
  const attachment = message.attachments.find(a => a.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(a.name ?? ''));
  if (!attachment) return;
  if (![trade.poster_id, trade.accepter_id].includes(uid)) return;
  if (trade.screenshot_verified === 1) return;
  const loading = await message.channel.send('🔍 **Vérification du screenshot...** Analyse de l\'image.');
  try {
    const result = await verifyMM2Screenshot(attachment.url);
    await loading.delete().catch(() => {});
    if (result.valid && (result.confidence ?? 100) >= 60) {
      db.prepare('UPDATE trades SET screenshot_url=?,screenshot_verified=1 WHERE id=?').run(attachment.url, trade.id);
      await completeTrade(message.guild, trade.id, attachment.url);
    } else {
      await message.channel.send([`❌ **Screenshot invalide** — <@${uid}>`, '', `Raison : _${result.reason ?? 'Non conforme'}_`, '', '**Ce qu\'on attend :**', '• Écran **"YOU HAVE ACCEPTED"** visible', '• Armes échangées visibles dans l\'interface', '• Vrai screenshot du jeu (pas montage)', '', 'Renvoie un screenshot correct.'].join('\n'));
    }
  } catch (e) { await loading.delete().catch(() => {}); console.error('[Vision]', e.message); await message.channel.send('⚠️ Erreur vérification. Contacte un modérateur.'); }
});

client.on(Events.VoiceStateUpdate, (old, neu) => {
  const uid = neu.id;
  if (!old.channelId && neu.channelId) db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
  if (old.channelId && !neu.channelId) {
    const s = db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);
    if (!s) return;
    const min = Math.floor((Math.floor(Date.now() / 1000) - s.joined_at) / 60);
    if (min > 0) db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min, min, uid);
    db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);
  }
});

// Nouveau membre → uniquement rôle Non Vérifié → voit seulement #vérification
client.on(Events.GuildMemberAdd, async member => {
  try {
    const nonv = member.guild.roles.cache.find(r => r.name === '🔒 Non Vérifié');
    if (nonv) await member.roles.add(nonv);
    console.log(`[MemberAdd] ${member.user.tag} → 🔒 Non Vérifié`);
  } catch (e) { console.error('[MemberAdd]', e.message); }
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Wenzy Bot v3 : ${client.user.tag}`);
  client.user.setActivity('MM2 Trades 🗡️', { type: 3 });
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const body = commands.map(c => c.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body });
    console.log(`✅ ${body.length} commandes déployées`);
  } catch (e) { console.error('❌ Deploy:', e); }
  startYoutubeWatcher(client);
  await fetchMM2Values();

  // Crons
  cron.schedule('0 * * * *', fetchMM2Values); // values toutes les heures
  cron.schedule('0 0 * * *', async () => { // leaderboard toutes les 24h
    for (const [, guild] of client.guilds.cache) {
      await updateLeaderboardChannel(guild);
      await updateShopCoinLeaderboard(guild);
    }
    console.log('[Cron] Leaderboard mis à jour');
  });
  console.log('[Crons] Values 1h + Leaderboard 24h actifs');
});

client.login(process.env.DISCORD_TOKEN);
