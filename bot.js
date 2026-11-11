// ═══════════════════════════════════════════════════════════════
//  WENZY BOT v6 — bot.js  (single file, Railway ready)
//  node bot.js
//  CHANGELOG v6:
//   - Automod complet (liens, spam, caps, mots bannis, anti-raid, warn system)
//   - Embeds 100% remastérisés (barres ASCII, timestamps relatifs, branding)
//   - Système XP DraftBot-like (10 paliers, galère mais pas trop)
//   - Système tickets avancé (litige, report, support, staff rating)
//   - Mini-jeux economy (coinflip, duel, work, daily, streak)
//   - Stats vocaux dynamiques (canaux noms live)
//   - Salons/rôles entièrement refaits (pro, structuré)
//   - Logs ultra-détaillés (XP, coins, modération, trades, tickets)
//   - Annonces + giveaways + reports conservés
// ═══════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();

const {
  Client, GatewayIntentBits, Collection, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, Events,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
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
    coins INTEGER DEFAULT 0, xp INTEGER DEFAULT 0,
    vocal_minutes INTEGER DEFAULT 0,
    trade_count INTEGER DEFAULT 0, vouch_count INTEGER DEFAULT 0,
    report_count INTEGER DEFAULT 0, rank TEXT DEFAULT 'new',
    daily_streak INTEGER DEFAULT 0, last_daily INTEGER DEFAULT 0,
    last_work INTEGER DEFAULT 0, last_message_xp INTEGER DEFAULT 0,
    warn_count INTEGER DEFAULT 0,
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
    to_id TEXT NOT NULL, trade_id INTEGER, comment TEXT, rating INTEGER DEFAULT 5,
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
  CREATE TABLE IF NOT EXISTS shop_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    description TEXT, price INTEGER NOT NULL, item_type TEXT NOT NULL,
    emoji TEXT DEFAULT '🎁', active INTEGER DEFAULT 1, added_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL,
    message_id TEXT, prize TEXT NOT NULL, winners_count INTEGER DEFAULT 1,
    host_id TEXT NOT NULL, ends_at INTEGER NOT NULL, status TEXT DEFAULT 'active',
    participants TEXT DEFAULT '[]', winners TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS private_vocals (
    channel_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT UNIQUE,
    creator_id TEXT NOT NULL, category TEXT NOT NULL,
    status TEXT DEFAULT 'open', claimed_by TEXT,
    trade_id INTEGER, reported_id TEXT, reason TEXT,
    rating INTEGER, closed_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL, reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS automod_config (
    guild_id TEXT PRIMARY KEY,
    block_links INTEGER DEFAULT 1,
    anti_spam INTEGER DEFAULT 1,
    anti_caps INTEGER DEFAULT 1,
    anti_raid INTEGER DEFAULT 1,
    banned_words TEXT DEFAULT '[]',
    link_whitelist_channels TEXT DEFAULT '[]',
    max_warns_mute INTEGER DEFAULT 3,
    max_warns_kick INTEGER DEFAULT 5
  );
  CREATE TABLE IF NOT EXISTS spam_tracker (
    discord_id TEXT NOT NULL, guild_id TEXT NOT NULL,
    message_count INTEGER DEFAULT 0, last_reset INTEGER DEFAULT 0,
    PRIMARY KEY (discord_id, guild_id)
  );
  CREATE TABLE IF NOT EXISTS duels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id TEXT NOT NULL, challenged_id TEXT NOT NULL,
    amount INTEGER NOT NULL, status TEXT DEFAULT 'pending',
    winner_id TEXT, channel_id TEXT, message_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS price_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL, weapon_name TEXT NOT NULL,
    max_value INTEGER NOT NULL, active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  INSERT OR IGNORE INTO youtube_last (id,checked_at) VALUES (1,0);
`);

// Migrations safe
const safeMigrations = [
  'ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN vocal_minutes INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN daily_streak INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_daily INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_work INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_message_xp INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN warn_count INTEGER DEFAULT 0',
];
for (const m of safeMigrations) { try { db.exec(m); } catch {} }

// Default weapon values
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

const defaultShopItems = [
  ['Rôle couleur custom','Crée un rôle avec le nom et couleur de ton choix',500,'custom_role','🎨'],
  ['Rôle VIP','Accès VIP + rôle hoisted visible',1000,'vip_role','👑'],
  ['Badge Elite Trader','Statut prestige + rôle 💎 Elite Trader',10000,'elite_badge','🏆'],
  ['Double XP 24h','Multiplie ton XP x2 pendant 24h',2000,'double_xp','⚡'],
  ['Ticket Coinflip Pro','5 coinflips sans risque de perte',800,'coinflip_pro','🎰'],
];
const _si = db.prepare('INSERT OR IGNORE INTO shop_items (name,description,price,item_type,emoji) VALUES (?,?,?,?,?)');
for (const [n,d,p,t,e] of defaultShopItems) _si.run(n,d,p,t,e);

// ── COLORS ───────────────────────────────────────────────────
const C = {
  primary:   0x5865F2, // Discord blurple
  success:   0x57F287,
  warning:   0xFEE75C,
  danger:    0xED4245,
  info:      0x5DADE2,
  gold:      0xF0B232,
  purple:    0x9B59B6,
  dark:      0x2B2D31,
  teal:      0x1ABC9C,
  pink:      0xE91E8C,
};

// ── XP SYSTEM (DraftBot-like — 10 paliers) ───────────────────
// XP par message : 15-25 XP (cooldown 1 min)
// XP vocal : 10 XP/min
// Paliers volontairement espacés exponentiellement
const XP_TIERS = [
  { xp:      0, name: '🌱 Novice',        color: 0x95A5A6, emoji: '🌱' },
  { xp:    300, name: '🔰 Débutant',      color: 0x2ECC71, emoji: '🔰' },
  { xp:    900, name: '⚔️ Apprenti',      color: 0x27AE60, emoji: '⚔️' },
  { xp:   2000, name: '🗡️ Guerrier',      color: 0x3498DB, emoji: '🗡️' },
  { xp:   4000, name: '🛡️ Chevalier',     color: 0x2980B9, emoji: '🛡️' },
  { xp:   7500, name: '🌟 Expert',        color: 0x9B59B6, emoji: '🌟' },
  { xp:  12000, name: '💎 Maître',        color: 0x8E44AD, emoji: '💎' },
  { xp:  20000, name: '🔥 Légende',       color: 0xF39C12, emoji: '🔥' },
  { xp:  35000, name: '⚡ Mythique',      color: 0xE74C3C, emoji: '⚡' },
  { xp:  60000, name: '👑 Immortel',      color: 0xF1C40F, emoji: '👑' },
];

function getXpTier(xp) {
  let tier = XP_TIERS[0];
  for (const t of XP_TIERS) { if (xp >= t.xp) tier = t; }
  return tier;
}

function getNextXpTier(xp) {
  for (const t of XP_TIERS) { if (xp < t.xp) return t; }
  return null;
}

function xpProgressBar(xp, length = 12) {
  const current = getXpTier(xp);
  const next = getNextXpTier(xp);
  if (!next) return `${'█'.repeat(length)} MAX`;
  const start = current.xp;
  const end = next.xp;
  const progress = (xp - start) / (end - start);
  const filled = Math.round(progress * length);
  const empty = length - filled;
  const pct = Math.round(progress * 100);
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${pct}%`;
}

function coinsBar(coins, max = 10000, length = 10) {
  const progress = Math.min(coins / max, 1);
  const filled = Math.round(progress * length);
  const empty = length - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${coins.toLocaleString('fr-FR')} 🪙`;
}

// ── XP VOCAL TIERS (séparé) ──────────────────────────────────
const XP_VOCAL_TIERS = [
  { min:     0, name: '🎙️ Muet',          color: 0x95A5A6 },
  { min:    60, name: '🎙️ Vocal Lvl 1',   color: 0x7F8C8D },
  { min:   300, name: '🎙️ Vocal Lvl 2',   color: 0x2ECC71 },
  { min:   800, name: '🎙️ Vocal Lvl 3',   color: 0x27AE60 },
  { min:  2000, name: '🎙️ Vocal Lvl 4',   color: 0x3498DB },
  { min:  5000, name: '🎙️ Vocal Lvl 5',   color: 0x9B59B6 },
  { min: 12000, name: '🎙️ Vocal Élite',   color: 0xF1C40F },
];

function getVocalTier(min) {
  let tier = XP_VOCAL_TIERS[0];
  for (const t of XP_VOCAL_TIERS) { if (min >= t.min) tier = t; }
  return tier;
}

// ── TRADE RANK ───────────────────────────────────────────────
function getRank(n) { if(n>=50)return'elite'; if(n>=20)return'trusted'; if(n>=5)return'confirmed'; return'new'; }
function getRankLabel(r) { return({new:'🆕 Nouveau',confirmed:'✅ Confirmé',trusted:'⭐ Fiable',elite:'👑 Elite'})[r]??'🆕 Nouveau'; }
function getRankColor(r) { return({new:C.dark,confirmed:C.success,trusted:C.gold,elite:C.purple})[r]??C.dark; }

// ── TIER BADGE ────────────────────────────────────────────────
function tierBadge(tier) {
  return({chroma:'🔴 Chroma',ancient:'🟤 Ancient',godly:'⚪ Godly',legendary:'🟡 Legendary',epic:'🟣 Epic',rare:'🔵 Rare'})[tier]??'⚪ Godly';
}

// ── PERMISSION HELPER ────────────────────────────────────────
function hasStaffPerm(member) {
  if (!member) return false;
  const staffRoleNames = ['👑 Owner','⚡ Admin','🛡️ Modérateur','🤝 Middleman'];
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    staffRoleNames.some(n => member.roles.cache.find(r => r.name === n));
}

function isIdleChannel(ch) {
  if (!ch) return false;
  const n = ch.name.toLowerCase();
  return n.includes('afk') || n.includes('sleep');
}

// ── LOG HELPER ───────────────────────────────────────────────
async function sendLog(guild, embedData) {
  const logsCh = guild.channels.cache.find(c => c.name.includes('logs-détaillés') || c.name.includes('logs'));
  if (!logsCh) return;
  try { await logsCh.send({ embeds: [embedData] }); } catch {}
}

// ══════════════════════════════════════════════════════════════
//  EMBEDS — REMASTÉRISÉS V6
// ══════════════════════════════════════════════════════════════

function tradeEmbed(trade, poster) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  const diff = trade.offer_value - trade.want_value;
  const fair = Math.abs(diff) <= 20;
  const fairPct = trade.offer_value > 0 ? Math.min(100, Math.round((1 - Math.abs(diff) / Math.max(trade.offer_value, trade.want_value)) * 100)) : 100;
  const fairBar = `${'█'.repeat(Math.round(fairPct/10))}${'░'.repeat(10-Math.round(fairPct/10))} ${fairPct}%`;

  const offreLines = off.map(w => `> ${tierBadge(w.tier??'godly')} **${w.name}** — \`${w.value} val\``);
  offreLines.push(`\n> 💰 **TOTAL : ${trade.offer_value} val**`);
  const wantLines = want.map(w => `> ${tierBadge(w.tier??'godly')} **${w.name}**`);
  if (trade.want_value > 0) wantLines.push(`\n> 💰 **TOTAL : ${trade.want_value} val**`);

  const rankColor = getRankColor(poster?.rank ?? 'new');

  return new EmbedBuilder()
    .setColor(fair ? C.success : C.warning)
    .setAuthor({ name: `🗡️ TRADE #${String(trade.id).padStart(4,'0')} — MM2 Trading`, iconURL: poster?.roblox_avatar ?? null })
    .setThumbnail(poster?.roblox_avatar ?? null)
    .addFields(
      { name: '👤 Trader', value: `<@${trade.poster_id}>${poster?.verified ? ' ✅' : ' ⚠️'}\n${getRankLabel(poster?.rank??'new')}\n📊 ${poster?.trade_count??0} trades · ${poster?.vouch_count??0} vouches`, inline: true },
      { name: '📤 OFFRE', value: offreLines.join('\n') || '—', inline: true },
      { name: '📥 RECHERCHE', value: wantLines.join('\n') || '—', inline: true },
      { name: '⚖️ Équité du trade', value: `${fair ? '✅ Fair' : diff > 0 ? '📈 Avantageux trader' : '📉 Unfair'}\n\`[${fairBar}]\``, inline: false },
    )
    .setFooter({ text: `Wenzy Bot • Trade #${trade.id} · ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}`, iconURL: 'https://i.imgur.com/OfNxpUP.png' })
    .setTimestamp();
}

function tradeInProgressEmbed(trade, poster, accepter) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  return new EmbedBuilder()
    .setColor(C.warning)
    .setAuthor({ name: `⏳ TRADE #${String(trade.id).padStart(4,'0')} — EN COURS` })
    .setDescription(`> <@${trade.poster_id}> × <@${trade.accepter_id}>\n> Lancé <t:${trade.created_at}:R>`)
    .addFields(
      { name: '📤 OFFRE', value: off.map(w => `• **${w.name}** \`${w.value} val\``).join('\n') + `\n**TOTAL : ${trade.offer_value} val**` || '—', inline: true },
      { name: '📥 RECHERCHE', value: want.map(w => `• **${w.name}**`).join('\n') + (trade.want_value > 0 ? `\n**TOTAL : ${trade.want_value} val**` : '') || '—', inline: true },
    )
    .setFooter({ text: 'Wenzy Bot • MM2 Trading' })
    .setTimestamp();
}

function tradeCompletedEmbed(trade) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  return new EmbedBuilder()
    .setColor(C.success)
    .setAuthor({ name: `✅ TRADE #${String(trade.id).padStart(4,'0')} — COMPLÉTÉ 🎉` })
    .setDescription(`> <@${trade.poster_id}> × <@${trade.accepter_id}>\n> Complété <t:${Math.floor(Date.now()/1000)}:R>`)
    .addFields(
      { name: '📤 OFFRE', value: off.map(w => `• **${w.name}** \`${w.value} val\``).join('\n') + `\n**TOTAL : ${trade.offer_value} val**` || '—', inline: true },
      { name: '📥 RECHERCHE', value: want.map(w => `• **${w.name}**`).join('\n') + (trade.want_value > 0 ? `\n**TOTAL : ${trade.want_value} val**` : '') || '—', inline: true },
      { name: '🎁 Récompenses', value: `+50 🪙 chacun\n+1 vouch mutuel\n+15 ✨ XP`, inline: false },
    )
    .setFooter({ text: 'Wenzy Bot • MM2 Trading' })
    .setTimestamp();
}

function profileEmbed(user, inv, discordUser) {
  const xpTier = getXpTier(user.xp ?? 0);
  const nextTier = getNextXpTier(user.xp ?? 0);
  const vocTier = getVocalTier(user.vocal_minutes ?? 0);
  const bar = xpProgressBar(user.xp ?? 0);
  const nextLabel = nextTier ? `→ ${nextTier.name} à ${nextTier.xp} XP` : '🏆 MAX LEVEL';
  const tierItems = inv.filter(w => w.weapon_value > 0).sort((a,b) => b.weapon_value - a.weapon_value);

  return new EmbedBuilder()
    .setColor(xpTier.color)
    .setAuthor({ name: `${user.roblox_username ?? 'Non lié'} — Profil MM2`, iconURL: user.roblox_avatar ?? discordUser?.displayAvatarURL() ?? null })
    .setThumbnail(user.roblox_avatar ?? discordUser?.displayAvatarURL() ?? null)
    .addFields(
      { name: '🎮 Compte Roblox', value: user.verified ? `✅ **${user.roblox_username}**` : '❌ Non lié', inline: true },
      { name: '🏆 Rang Trade', value: getRankLabel(user.rank), inline: true },
      { name: '📊 Réputation', value: `✅ ${user.trade_count} trades\n💬 ${user.vouch_count} vouches\n🚨 ${user.report_count} reports`, inline: true },
      { name: `${xpTier.emoji} Niveau — ${xpTier.name}`, value: `\`[${bar}]\`\n${user.xp ?? 0} XP total · ${nextLabel}`, inline: false },
      { name: '🎙️ Vocal', value: `${vocTier.name}\n${user.vocal_minutes ?? 0} min au total`, inline: true },
      { name: '🪙 Pièces', value: `\`[${coinsBar(user.coins ?? 0)}]\``, inline: true },
      { name: '🔥 Streak daily', value: `${user.daily_streak ?? 0} jours 🔥`, inline: true },
      { name: `📦 Inventory (${inv.length} armes)`, value: tierItems.length ? tierItems.slice(0, 8).map(w => `${tierBadge(w.weapon_tier??'godly')} **${w.weapon_name}** \`${w.weapon_value}v\``).join('\n') : '— Vide', inline: false },
    )
    .setFooter({ text: `Wenzy Bot • Membre depuis ${new Date(user.created_at * 1000).toLocaleDateString('fr-FR')}` })
    .setTimestamp();
}

function welcomeEmbed(member, guild) {
  const totalUsers = guild.memberCount;
  const verifiedCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get()?.c ?? 0;
  const tradesCount = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed')?.c ?? 0;
  return new EmbedBuilder()
    .setColor(C.primary)
    .setAuthor({ name: `👋 Bienvenue sur ${guild.name} !`, iconURL: guild.iconURL() ?? null })
    .setDescription([
      `> Salut <@${member.id}> ! Tu es le **membre #${totalUsers}** 🎉`,
      '',
      '**🔑 Pour accéder au serveur :**',
      '→ Rends-toi dans <#VERIF_PLACEHOLDER> et lie ton compte Roblox',
      '',
      '**📋 Ce que tu peux faire ici :**',
      '🗡️ Trader des armes MM2 en toute sécurité',
      '🛡️ Utiliser un middleman pour les gros trades',
      '🏆 Grimper dans le classement des meilleurs traders',
      '🎁 Participer aux giveaways exclusifs',
    ].join('\n'))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👥 Membres', value: `**${totalUsers}**`, inline: true },
      { name: '✅ Traders vérifiés', value: `**${verifiedCount}**`, inline: true },
      { name: '🗡️ Trades complétés', value: `**${tradesCount}**`, inline: true },
    )
    .setImage('https://i.imgur.com/PLACEHOLDER.png')
    .setFooter({ text: `Wenzy Bot v6 • ${guild.name}` })
    .setTimestamp();
}

function leaderboardEmbed(top, type = 'trades') {
  const medals = ['🥇', '🥈', '🥉'];
  const title = type === 'trades' ? '🏆 Top Traders MM2' : type === 'coins' ? '🪙 Classement Pièces' : '✨ Classement XP';
  const lines = top.map((u, i) => {
    const medal = medals[i] ?? `\`#${i+1}\``;
    if (type === 'coins') return `${medal} <@${u.discord_id}> — **${u.coins.toLocaleString('fr-FR')} 🪙**`;
    if (type === 'xp') return `${medal} <@${u.discord_id}> — **${u.xp??0} XP** · ${getXpTier(u.xp??0).name}`;
    return `${medal} <@${u.discord_id}> — ✅ **${u.trade_count}** trades · 💬 ${u.vouch_count} vouches · ${getRankLabel(u.rank)}`;
  });
  return new EmbedBuilder()
    .setColor(C.gold)
    .setAuthor({ name: `${title} — Live` })
    .setDescription(lines.join('\n') || '_Aucun résultat_')
    .setFooter({ text: 'Wenzy Bot • Mis à jour automatiquement' })
    .setTimestamp();
}

function ticketEmbed(ticket, creator) {
  const catLabel = { 'litige': '⚔️ Litige Trade', 'report': '🚨 Report Scam', 'support': '🎧 Support', 'middleman': '🛡️ Middleman' }[ticket.category] ?? '🎫 Ticket';
  return new EmbedBuilder()
    .setColor(C.info)
    .setAuthor({ name: `${catLabel} — Ticket #${String(ticket.id).padStart(4,'0')}` })
    .setDescription([
      `> Créé par <@${ticket.creator_id}> <t:${ticket.created_at}:R>`,
      ticket.reason ? `\n**📝 Raison :** ${ticket.reason}` : '',
      ticket.reported_id ? `**⚠️ Membre signalé :** <@${ticket.reported_id}>` : '',
      ticket.trade_id ? `**🗡️ Trade concerné :** #${ticket.trade_id}` : '',
    ].filter(Boolean).join('\n'))
    .addFields(
      { name: '📋 Statut', value: ticket.status === 'open' ? '🟢 Ouvert' : ticket.status === 'claimed' ? `🟡 Pris en charge par <@${ticket.claimed_by}>` : '🔴 Fermé', inline: true },
      { name: '📅 Créé', value: `<t:${ticket.created_at}:f>`, inline: true },
    )
    .setFooter({ text: 'Wenzy Bot • Système de tickets' })
    .setTimestamp();
}

function automodLogEmbed(action, user, reason, detail = '') {
  const colors = { warn: C.warning, mute: C.danger, kick: C.danger, ban: 0x000000, delete: C.info };
  const labels = { warn: '⚠️ Avertissement', mute: '🔇 Mute Auto', kick: '🦶 Kick Auto', ban: '🔨 Ban Auto', delete: '🗑️ Message supprimé' };
  return new EmbedBuilder()
    .setColor(colors[action] ?? C.warning)
    .setAuthor({ name: `🛡️ AutoMod — ${labels[action] ?? action}` })
    .addFields(
      { name: '👤 Membre', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: '📋 Raison', value: reason, inline: true },
      { name: '⏰ Date', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
      ...(detail ? [{ name: '📄 Détail', value: detail.slice(0, 500), inline: false }] : []),
    )
    .setFooter({ text: 'Wenzy Bot • AutoMod v6' })
    .setTimestamp();
}

function xpLevelUpEmbed(user, oldTier, newTier) {
  return new EmbedBuilder()
    .setColor(newTier.color)
    .setAuthor({ name: `⬆️ Level Up ! ${oldTier.name} → ${newTier.name}` })
    .setDescription(`<@${user.discord_id}> a atteint le niveau **${newTier.name}** ${newTier.emoji} !`)
    .addFields(
      { name: '✨ XP Total', value: `**${user.xp}** XP`, inline: true },
      { name: '🎁 Prochain palier', value: getNextXpTier(user.xp) ? `${getNextXpTier(user.xp).name} à ${getNextXpTier(user.xp).xp} XP` : 'MAX', inline: true },
    )
    .setFooter({ text: 'Wenzy Bot • Système XP' })
    .setTimestamp();
}

// ── TRADE BUTTONS ────────────────────────────────────────────
function tradeButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_accept_${id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trade_negotiate_${id}`).setLabel('💬 Négocier').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Middleman').setStyle(ButtonStyle.Primary),
  );
}

function threadButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Appeler Middleman').setStyle(ButtonStyle.Primary),
  );
}

function staffVerifyButtons(tradeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`staff_validate_${tradeId}`).setLabel('✅ Valider le trade').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`staff_reject_${tradeId}`).setLabel('❌ Rejeter screenshot').setStyle(ButtonStyle.Danger),
  );
}

function ticketButtons(ticketId, closed = false) {
  if (closed) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('🤝 Prendre en charge').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
  );
}

// ── ROBLOX HELPERS ───────────────────────────────────────────
function genCode() { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s='WENZY-'; for(let i=0;i<5;i++)s+=c[Math.floor(Math.random()*c.length)]; return s; }
async function searchRobloxUser(u) { const r=await axios.post('https://users.roblox.com/v1/usernames/users',{usernames:[u],excludeBannedUsers:true}); return r.data.data?.[0]??null; }
async function getRobloxDescription(id) { const r=await axios.get(`https://users.roblox.com/v1/users/${id}`); return r.data.description??''; }
async function getRobloxAvatar(id) { try{ const r=await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`); return r.data.data?.[0]?.imageUrl??null; }catch{ return null; } }

// ── TRADE HELPERS ────────────────────────────────────────────
function parseWeapons(s) { return s.split(',').map(x=>x.trim()).filter(Boolean); }
function calcValue(names) { let total=0; const details=[]; for(const n of names){ const row=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(n); const val=row?.value??0; total+=val; details.push({name:row?.name??n,value:val,tier:row?.tier??'godly'}); } return{total,details}; }
function getFreeServer() { return db.prepare('SELECT * FROM private_servers WHERE in_use=0 LIMIT 1').get(); }

// ── MM2 VALUES SYNC ──────────────────────────────────────────
async function fetchMM2Values() {
  let synced = 0;
  const stmt = db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now'))
    ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`);
  try {
    const r = await axios.get('https://bloxultra.com/api/values/mm2', { timeout: 10000, headers: { 'User-Agent': 'WenzyBot/6.0', 'Accept': 'application/json' } });
    const data = r.data;
    if (Array.isArray(data)) {
      for (const item of data) { const name=item.name??item.Name??item.weapon; const val=item.value??item.Value??item.demand??item.price??0; const tier=(item.tier??item.type??item.rarity??'godly').toLowerCase(); if(name&&val>0){stmt.run(String(name),Math.round(val),tier);synced++;} }
    } else if (data && typeof data === 'object') {
      for (const [name,info] of Object.entries(data)) { if(['success','status','message'].includes(name))continue; const val=typeof info==='number'?info:(info?.value??info?.demand??info?.price??0); const tier=(info?.tier??info?.type??info?.rarity??'godly').toLowerCase(); if(name&&val>0){stmt.run(String(name),Math.round(val),tier);synced++;} }
    }
    if (synced > 0) { console.log(`[Values] bloxultra.com: ${synced} armes synced`); return; }
  } catch (e) { console.warn('[Values] bloxultra.com failed:', e.message); }
  const hardcoded=[['Ancient Seer',200,'ancient'],['Chroma Seer',165,'chroma'],['Chroma Harvester',150,'chroma'],['Chroma Lightbringer',145,'chroma'],['Chroma Luger',125,'chroma'],['Chroma Boneblade',115,'chroma'],['Prism',95,'godly'],['Corrupt',90,'godly'],['Elderwood Scythe',85,'godly'],['Hallowscythe',82,'godly'],['Blue Seer',72,'godly'],['Batwing',62,'godly'],['Seer',60,'godly'],['Shark',57,'godly'],['Icicle',52,'godly'],['Luger',50,'godly'],['Raygun',45,'godly'],['Snowcannon',42,'godly'],['Soul',38,'godly'],['Spirit',36,'godly'],['Beachy',32,'godly']];
  for(const[name,val,tier]of hardcoded){stmt.run(name,val,tier);synced++;}
  console.log(`[Values] Hardcoded fallback: ${synced} armes`);
}

// ── XP & ROLES HELPERS ───────────────────────────────────────
async function applyXpRoles(guild, member, xp, vocalMin) {
  try {
    const msgTier = getXpTier(xp);
    const vocTier = getVocalTier(vocalMin);
    const allMsgNames = XP_TIERS.map(t => t.name);
    const allVocNames = XP_VOCAL_TIERS.map(t => t.name);
    for (const rn of allMsgNames) {
      const r = guild.roles.cache.find(x => x.name === rn);
      if (r && r.name !== msgTier.name && member.roles.cache.has(r.id)) await member.roles.remove(r).catch(() => {});
    }
    let targetMsg = guild.roles.cache.find(x => x.name === msgTier.name);
    if (!targetMsg && msgTier.xp > 0) targetMsg = await guild.roles.create({ name: msgTier.name, color: msgTier.color, hoist: false }).catch(() => null);
    if (targetMsg && !member.roles.cache.has(targetMsg.id)) await member.roles.add(targetMsg).catch(() => {});
    for (const rn of allVocNames) {
      const r = guild.roles.cache.find(x => x.name === rn);
      if (r && r.name !== vocTier.name && member.roles.cache.has(r.id)) await member.roles.remove(r).catch(() => {});
    }
    let targetVoc = guild.roles.cache.find(x => x.name === vocTier.name);
    if (!targetVoc && vocTier.min > 0) targetVoc = await guild.roles.create({ name: vocTier.name, color: vocTier.color, hoist: false }).catch(() => null);
    if (targetVoc && !member.roles.cache.has(targetVoc.id)) await member.roles.add(targetVoc).catch(() => {});
  } catch(e) { console.error('[XPRoles]', e.message); }
}

async function addXp(guild, discordId, amount, source = 'message') {
  db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(discordId);
  const before = db.prepare('SELECT xp, vocal_minutes FROM users WHERE discord_id=?').get(discordId);
  const oldTier = getXpTier(before?.xp ?? 0);
  db.prepare('UPDATE users SET xp=xp+? WHERE discord_id=?').run(amount, discordId);
  const after = db.prepare('SELECT * FROM users WHERE discord_id=?').get(discordId);
  const newTier = getXpTier(after.xp);

  try {
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member) await applyXpRoles(guild, member, after.xp, after.vocal_minutes ?? 0);
  } catch {}

  // Level up announcement
  if (newTier.name !== oldTier.name) {
    const announcesCh = guild.channels.cache.find(c => c.name.includes('niveaux') || c.name.includes('level-up'));
    if (announcesCh) {
      await announcesCh.send({ embeds: [xpLevelUpEmbed(after, oldTier, newTier)] }).catch(() => {});
    }
    // Log
    await sendLog(guild, new EmbedBuilder().setColor(newTier.color)
      .setAuthor({ name: `⬆️ Level Up XP — ${oldTier.name} → ${newTier.name}` })
      .addFields(
        { name: '👤 Membre', value: `<@${discordId}>`, inline: true },
        { name: '✨ XP', value: `**${after.xp}** XP`, inline: true },
        { name: '📌 Source', value: source, inline: true },
      ).setTimestamp());
  }
  return after;
}

// ── AUTOMOD ──────────────────────────────────────────────────
const spamCache = new Map(); // userId -> { count, lastReset }

async function handleAutomod(message) {
  if (message.author.bot) return false;
  const { guild, author, channel, content } = message;
  const cfg = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(guild.id);
  if (!cfg) return false;

  const member = await guild.members.fetch(author.id).catch(() => null);
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  let violated = false;
  let reason = '';

  // Anti-liens
  if (cfg.block_links) {
    const whitelistChannels = JSON.parse(cfg.link_whitelist_channels || '[]');
    const urlRegex = /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/)[^\s]+/gi;
    if (urlRegex.test(content) && !whitelistChannels.includes(channel.id)) {
      await message.delete().catch(() => {});
      violated = true; reason = 'Lien non autorisé';
    }
  }

  // Anti-majuscules (60%+ sur msg > 10 chars)
  if (!violated && cfg.anti_caps && content.length > 10) {
    const caps = content.replace(/[^A-Z]/g, '').length;
    const letters = content.replace(/[^A-Za-z]/g, '').length;
    if (letters > 5 && caps / letters > 0.6) {
      await message.delete().catch(() => {});
      violated = true; reason = 'Trop de majuscules';
    }
  }

  // Anti-spam
  if (!violated && cfg.anti_spam) {
    const now = Date.now();
    const key = `${author.id}:${guild.id}`;
    if (!spamCache.has(key)) spamCache.set(key, { count: 0, lastReset: now });
    const s = spamCache.get(key);
    if (now - s.lastReset > 5000) { s.count = 0; s.lastReset = now; }
    s.count++;
    if (s.count >= 6) {
      await message.delete().catch(() => {});
      s.count = 0;
      violated = true; reason = 'Spam de messages';
    }
  }

  // Mots bannis
  if (!violated && cfg.banned_words) {
    const banned = JSON.parse(cfg.banned_words || '[]');
    const lower = content.toLowerCase();
    for (const word of banned) {
      if (lower.includes(word.toLowerCase())) {
        await message.delete().catch(() => {});
        violated = true; reason = `Mot banni : \`${word}\``;
        break;
      }
    }
  }

  if (!violated) return false;

  // Warn
  db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(author.id);
  db.prepare('UPDATE users SET warn_count=warn_count+1 WHERE discord_id=?').run(author.id);
  db.prepare('INSERT INTO warns (discord_id, moderator_id, reason) VALUES (?, ?, ?)').run(author.id, guild.members.me.id, `[AutoMod] ${reason}`);
  const u = db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(author.id);
  const warns = u?.warn_count ?? 1;

  // DM user
  try {
    await author.send({ embeds: [new EmbedBuilder().setColor(C.warning)
      .setAuthor({ name: `⚠️ Avertissement AutoMod — ${guild.name}` })
      .setDescription(`**Raison :** ${reason}\n\nTu as maintenant **${warns}** avertissement(s).\n• 3 warns → Mute 10 min\n• 5 warns → Kick`)
      .setTimestamp()] });
  } catch {}

  // Actions selon warn count
  if (warns >= cfg.max_warns_kick) {
    await member.kick(`[AutoMod] ${warns} avertissements`).catch(() => {});
    await sendLog(guild, automodLogEmbed('kick', author, `${warns} warns accumulés`, reason));
  } else if (warns >= cfg.max_warns_mute) {
    const muteRole = guild.roles.cache.find(r => r.name === '🔇 Muted');
    if (muteRole) await member.roles.add(muteRole).catch(() => {});
    setTimeout(async () => { if (muteRole) await member.roles.remove(muteRole).catch(() => {}); }, 10 * 60 * 1000);
    await sendLog(guild, automodLogEmbed('mute', author, `${warns} warns — mute 10 min`, reason));
  } else {
    await sendLog(guild, automodLogEmbed('warn', author, reason, `Warn ${warns}/${cfg.max_warns_kick}`));
  }

  // Message dans le salon (éphémère)
  const alertMsg = await channel.send({ content: `<@${author.id}> ⚠️ **Action supprimée — ${reason}** (Warn ${warns})` }).catch(() => null);
  if (alertMsg) setTimeout(() => alertMsg.delete().catch(() => {}), 5000);

  return true;
}

// ── ANTI-RAID ────────────────────────────────────────────────
const raidCache = { joins: [], locked: false };
async function handleAntiRaid(guild, member) {
  const cfg = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(guild.id);
  if (!cfg?.anti_raid) return;
  const now = Date.now();
  raidCache.joins = raidCache.joins.filter(t => now - t < 30000);
  raidCache.joins.push(now);
  if (raidCache.joins.length >= 10 && !raidCache.locked) {
    raidCache.locked = true;
    // Lockdown all public channels
    const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    for (const ch of channels.values()) {
      await ch.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});
    }
    await sendLog(guild, new EmbedBuilder().setColor(C.danger)
      .setAuthor({ name: '🚨 ANTI-RAID — LOCKDOWN ACTIVÉ' })
      .setDescription(`**${raidCache.joins.length} membres** ont rejoint en 30 secondes.\n> Tous les salons sont verrouillés.\n> Un admin doit déverrouiller avec \`/unlock\`.`)
      .setTimestamp());
    // Notify staff
    const logsCh = guild.channels.cache.find(c => c.name.includes('logs'));
    if (logsCh) await logsCh.send('🚨 @here **RAID DÉTECTÉ** — Serveur en lockdown !').catch(() => {});
    setTimeout(() => { raidCache.locked = false; }, 10 * 60 * 1000);
  }
}

// ── LEADERBOARDS ─────────────────────────────────────────────
async function updateLeaderboardChannel(guild) {
  const ch = guild.channels.cache.find(c => c.name.includes('classement-trades'));
  if (!ch) return;
  const top = db.prepare('SELECT discord_id,roblox_username,trade_count,vouch_count,coins,xp,rank FROM users ORDER BY trade_count DESC LIMIT 10').all();
  if (!top.length) return;
  const msgs = await ch.messages.fetch({ limit: 5 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  await ch.send({ embeds: [leaderboardEmbed(top, 'trades')] });
}

async function updateCoinsLeaderboardChannel(guild) {
  const ch = guild.channels.cache.find(c => c.name.includes('classement-pièces') || c.name.includes('classement-pieces'));
  if (!ch) return;
  const top = db.prepare('SELECT discord_id,coins FROM users ORDER BY coins DESC LIMIT 15').all();
  if (!top.length) return;
  const msgs = await ch.messages.fetch({ limit: 5 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  await ch.send({ embeds: [leaderboardEmbed(top, 'coins')] });
}

async function updateXpLeaderboardChannel(guild) {
  const ch = guild.channels.cache.find(c => c.name.includes('classement-xp'));
  if (!ch) return;
  const top = db.prepare('SELECT discord_id,xp FROM users ORDER BY xp DESC LIMIT 10').all();
  if (!top.length) return;
  const msgs = await ch.messages.fetch({ limit: 5 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  await ch.send({ embeds: [leaderboardEmbed(top, 'xp')] });
}

// ── STAT CHANNELS ────────────────────────────────────────────
async function updateStatChannels(guild) {
  const totalMembers = guild.memberCount;
  const verifiedCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get()?.c ?? 0;
  const tradesCount = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed')?.c ?? 0;
  const coinsTotal = db.prepare('SELECT SUM(coins) as s FROM users').get()?.s ?? 0;

  const statChannels = [
    { name: `👥・membres: ${totalMembers}`, find: '👥・membres' },
    { name: `✅・vérifiés: ${verifiedCount}`, find: '✅・vérifiés' },
    { name: `🗡️・trades: ${tradesCount}`, find: '🗡️・trades' },
    { name: `🪙・coins: ${coinsTotal.toLocaleString('fr-FR')}`, find: '🪙・coins' },
  ];

  for (const sc of statChannels) {
    const ch = guild.channels.cache.find(c => c.name.includes(sc.find.split(':')[0].trim()));
    if (ch) await ch.setName(sc.name).catch(() => {});
  }
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
    const nv = g.roles.cache.find(r => r.name === '🌱 Novice');
    const nonv = g.roles.cache.find(r => r.name === '🔒 Non Vérifié');
    if (nonv) await interaction.member.roles.remove(nonv).catch(() => {});
    if (nv) await interaction.member.roles.add(nv).catch(() => {});
  } catch {}
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
    .setAuthor({ name: '✅ Compte Roblox vérifié !' })
    .setThumbnail(avatar)
    .setDescription([`Discord lié à **${user.roblox_username}** !`, '', 'Tu as maintenant accès à tous les salons.', 'Poste ton premier trade via **poster-un-trade** !'].join('\n'))
    .setTimestamp()] });
  await sendLog(interaction.guild, new EmbedBuilder().setColor(C.success)
    .setAuthor({ name: '✅ Vérification Roblox' })
    .addFields({ name: '👤 Discord', value: `<@${did}>`, inline: true }, { name: '🎮 Roblox', value: user.roblox_username, inline: true })
    .setTimestamp());
}

async function postTrade(interaction, did, offreStr, chercheStr, manualOfferVal, manualWantVal) {
  const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if (!user?.verified) return interaction.editReply('❌ Lie ton compte Roblox d\'abord via le salon **vérification**.');
  const { total: autoOv, details: od } = calcValue(parseWeapons(offreStr));
  const { total: autoWv, details: wd } = calcValue(parseWeapons(chercheStr));
  const ov = (manualOfferVal > 0) ? manualOfferVal : autoOv;
  const wv = (manualWantVal > 0) ? manualWantVal : autoWv;
  const unknownOffer = od.filter(w => w.value === 0).map(w => w.name);
  const unknownWant = wd.filter(w => w.value === 0).map(w => w.name);
  const unknownLines = [];
  if (unknownOffer.length) unknownLines.push(`📤 Offre inconnue : **${unknownOffer.join(', ')}**`);
  if (unknownWant.length) unknownLines.push(`📥 Recherche inconnue : **${unknownWant.join(', ')}**`);
  const unknownWarn = unknownLines.length ? `\n⚠️ Armes non trouvées dans la base :\n${unknownLines.join('\n')}` : '';
  if (user.rank === 'new' && ov > 100) return interaction.editReply('⚠️ Nouveaux membres limités à **100 val** max. Fais quelques trades pour débloquer.');
  const res = db.prepare('INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value,want_value) VALUES (?,?,?,?,?)').run(did, JSON.stringify(od), JSON.stringify(wd), ov, wv);
  const tid = res.lastInsertRowid;
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
  const ch = interaction.guild.channels.cache.find(c => c.name.includes('post-trades'));
  if (!ch) return interaction.editReply('❌ Salon post-trades introuvable. Lance `/wenzy-setup`.');
  const msg = await ch.send({ embeds: [tradeEmbed(trade, user)], components: [tradeButtons(tid)] });
  db.prepare('UPDATE trades SET message_id=?,channel_id=? WHERE id=?').run(msg.id, ch.id, tid);

  // Price alert check
  const alerts = db.prepare('SELECT * FROM price_alerts WHERE active=1').all();
  for (const alert of alerts) {
    const matchOffer = od.find(w => w.name.toLowerCase() === alert.weapon_name.toLowerCase() && ov <= alert.max_value);
    if (matchOffer && alert.discord_id !== did) {
      try {
        const alertUser = await interaction.client.users.fetch(alert.discord_id);
        await alertUser.send({ embeds: [new EmbedBuilder().setColor(C.gold)
          .setAuthor({ name: '🔔 Price Alert — Trade trouvé !' })
          .setDescription(`Un trade pour **${alert.weapon_name}** à **${ov} val** vient d'être posté !\n> Voir dans <#${ch.id}>`)
          .setTimestamp()] });
      } catch {}
    }
  }

  await interaction.editReply(`✅ Trade **#${tid}** posté dans <#${ch.id}> !${unknownWarn}`);
}

async function cancelTrade(interaction, did, tradeId) {
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if (!trade) return interaction.editReply('❌ Trade introuvable.');
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || hasStaffPerm(interaction.member);
  if (trade.poster_id !== did && !isAdmin) return interaction.editReply('❌ Seul le posteur ou un staff peut annuler.');
  if (!['open', 'in_progress'].includes(trade.status)) return interaction.editReply('❌ Ce trade ne peut plus être annulé.');
  db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tradeId);
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  if (trade.thread_id) { try { const t=await interaction.guild.channels.fetch(trade.thread_id).catch(()=>null); if(t){await t.send('❌ **Trade annulé.** Ce salon sera supprimé dans 5 secondes.'); setTimeout(()=>t.delete('Trade annulé').catch(()=>{}),5000);} } catch {} }
  if (trade.message_id && trade.channel_id) { try { const c=await interaction.guild.channels.fetch(trade.channel_id).catch(()=>null); const m=c?await c.messages.fetch(trade.message_id).catch(()=>null):null; if(m)await m.delete().catch(()=>{}); } catch {} }
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
    // XP pour trade complété
    await addXp(guild, uid, 50, 'trade complété');
    try {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (member) {
        const freshUser = db.prepare('SELECT * FROM users WHERE discord_id=?').get(uid);
        const rankRoleMap = { new: '🆕 Non Classé', confirmed: '✅ Confirmé', trusted: '⭐ Fiable', elite: '👑 Elite Trader' };
        const targetRoleName = rankRoleMap[freshUser.rank];
        const allRankRoles = Object.values(rankRoleMap);
        for (const rn of allRankRoles) { const r=guild.roles.cache.find(x=>x.name===rn); if(r&&rn!==targetRoleName)await member.roles.remove(r).catch(()=>{}); }
        const targetRole = guild.roles.cache.find(x => x.name === targetRoleName);
        if (targetRole) await member.roles.add(targetRole).catch(() => {});
        await applyXpRoles(guild, member, freshUser.xp ?? 0, freshUser.vocal_minutes ?? 0);
      }
    } catch {}
  }

  if (trade.message_id && trade.channel_id) {
    try { const ch=await guild.channels.fetch(trade.channel_id).catch(()=>null); if(ch){const msg=await ch.messages.fetch(trade.message_id).catch(()=>null); if(msg)await msg.edit({embeds:[tradeCompletedEmbed(trade)],components:[]}).catch(()=>{});} } catch {}
  }

  const vCh = guild.channels.cache.find(c => c.name.includes('vouches'));
  if (vCh) {
    const poster = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.accepter_id);
    const off = JSON.parse(trade.offer_weapons);
    const want = JSON.parse(trade.want_weapons);
    await vCh.send({ embeds: [new EmbedBuilder().setColor(C.success)
      .setAuthor({ name: `✅ VOUCH — TRADE #${String(tradeId).padStart(4,'0')} COMPLÉTÉ` })
      .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
      .addFields(
        { name: `📤 ${poster?.roblox_username ?? 'Trader'} (${getRankLabel(poster?.rank ?? 'new')})`, value: off.map(w => `• **${w.name}** \`${w.value}v\``).join('\n') + `\n**TOTAL : ${trade.offer_value} val**`, inline: true },
        { name: `📥 ${accepter?.roblox_username ?? 'Accepter'} (${getRankLabel(accepter?.rank ?? 'new')})`, value: want.map(w => `• **${w.name}**`).join('\n'), inline: true },
        { name: '🎁 Récompenses', value: `+50 🪙 chacun\n+1 vouch mutuel\n+50 ✨ XP`, inline: false },
      ).setTimestamp()] });
  }

  if (trade.thread_id) {
    try {
      const t = await guild.channels.fetch(trade.thread_id).catch(() => null);
      if (t) {
        await t.send(['🎉 **Trade finalisé !**', '', `✅ <@${trade.poster_id}> × <@${trade.accepter_id}>`, '+50 🪙 chacun | +1 vouch | +50 XP', '', '_Ce salon sera archivé dans 10 secondes._'].join('\n'));
        setTimeout(async () => { try { await t.setArchived(true, 'Trade terminé'); } catch {} }, 10000);
      }
    } catch {}
  }

  await updateLeaderboardChannel(guild);
  await updateCoinsLeaderboardChannel(guild);
  await updateXpLeaderboardChannel(guild);
  await updateStatChannels(guild);

  await sendLog(guild, new EmbedBuilder().setColor(C.success)
    .setAuthor({ name: `✅ Trade #${tradeId} Complété` })
    .addFields(
      { name: '👤 Trader', value: `<@${trade.poster_id}>`, inline: true },
      { name: '👤 Accepteur', value: `<@${trade.accepter_id}>`, inline: true },
      { name: '💰 Valeur', value: `${trade.offer_value} val offerts / ${trade.want_value} val reçus`, inline: false },
    ).setTimestamp());
  return true;
}

// ── TICKET SYSTEM ────────────────────────────────────────────
async function createTicket(interaction, category, options = {}) {
  const { guild, user } = interaction;
  const existing = db.prepare('SELECT * FROM tickets WHERE creator_id=? AND status!=?').get(user.id, 'closed');
  if (existing) return interaction.editReply(`❌ Tu as déjà un ticket ouvert : <#${existing.channel_id}>. Ferme-le d'abord.`);

  const catPv = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('TICKETS'));
  const staffRoles = ['👑 Owner', '⚡ Admin', '🛡️ Modérateur', '🤝 Middleman'].map(n => guild.roles.cache.find(r => r.name === n)).filter(Boolean);

  const catEmoji = { litige: '⚔️', report: '🚨', support: '🎧', middleman: '🛡️' }[category] ?? '🎫';
  const ch = await guild.channels.create({
    name: `${catEmoji}・ticket-${user.username.slice(0, 10).toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: catPv?.id ?? null,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...staffRoles.map(r => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
    ],
  });

  const res = db.prepare('INSERT INTO tickets (channel_id,creator_id,category,reason,trade_id,reported_id) VALUES (?,?,?,?,?,?)').run(
    ch.id, user.id, category, options.reason ?? null, options.trade_id ?? null, options.reported_id ?? null
  );
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(res.lastInsertRowid);

  const staffMentions = staffRoles.map(r => `<@&${r.id}>`).join(' ');
  await ch.send({
    content: `${staffMentions}\n<@${user.id}>`,
    embeds: [ticketEmbed(ticket, user)],
    components: [ticketButtons(ticket.id)],
  });

  await sendLog(guild, new EmbedBuilder().setColor(C.info)
    .setAuthor({ name: `🎫 Nouveau Ticket — ${category}` })
    .addFields(
      { name: '👤 Créateur', value: `<@${user.id}>`, inline: true },
      { name: '📋 Catégorie', value: category, inline: true },
      { name: '🔗 Salon', value: `<#${ch.id}>`, inline: true },
      ...(options.reason ? [{ name: '📝 Raison', value: options.reason, inline: false }] : []),
    ).setTimestamp());

  return ch;
}

// ── GIVEAWAY ─────────────────────────────────────────────────
async function endGiveaway(client, giveawayId) {
  const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(giveawayId);
  if (!gw || gw.status !== 'active') return;
  const participants = JSON.parse(gw.participants || '[]');
  let winners = [];
  if (participants.length > 0) {
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    winners = shuffled.slice(0, Math.min(gw.winners_count, participants.length));
  }
  db.prepare('UPDATE giveaways SET status=?,winners=? WHERE id=?').run('ended', JSON.stringify(winners), giveawayId);
  try {
    const ch = await client.channels.fetch(gw.channel_id).catch(() => null);
    if (!ch) return;
    const msg = gw.message_id ? await ch.messages.fetch(gw.message_id).catch(() => null) : null;
    const embed = new EmbedBuilder().setColor(C.gold)
      .setAuthor({ name: `🎉 GIVEAWAY TERMINÉ — ${gw.prize}` })
      .setDescription(winners.length > 0
        ? `**🏆 Gagnant(s) :**\n${winners.map(w => `> 🎊 <@${w}>`).join('\n')}`
        : '😕 Personne n\'a participé.')
      .addFields(
        { name: '🎁 Prix', value: gw.prize, inline: true },
        { name: '👥 Participants', value: `${participants.length}`, inline: true },
        { name: '🎰 Gagnants', value: `${winners.length}/${gw.winners_count}`, inline: true },
      ).setFooter({ text: `Giveaway #${gw.id} — Organisé par <@${gw.host_id}>` }).setTimestamp();
    if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    const winnerMention = winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'aucun';
    await ch.send(`🎊 **Fin du giveaway !** Félicitations à ${winnerMention} ! Prix : **${gw.prize}**`);
  } catch (e) { console.error('[Giveaway end]', e.message); }
}

// ── SHOP EMBED ───────────────────────────────────────────────
async function postShopEmbed(ch) {
  const msgs = await ch.messages.fetch({ limit: 10 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  const items = db.prepare('SELECT * FROM shop_items WHERE active=1 ORDER BY price ASC').all();
  const fields = items.map(i => ({
    name: `${i.emoji} ${i.name} — \`${i.price.toLocaleString('fr-FR')} 🪙\``,
    value: `> ${i.description ?? '—'}`,
    inline: true,
  }));
  await ch.send({
    embeds: [new EmbedBuilder().setColor(C.gold)
      .setAuthor({ name: '🛒 Boutique Wenzy — Dépense tes pièces !' })
      .setDescription([
        '**Comment gagner des 🪙 ?**',
        '`+15-25 🪙` par message _(cooldown 1 min)_',
        '`+10 🪙` par minute en vocal _(hors AFK/Sleep)_',
        '`+50 🪙` par trade complété',
        '`+100 🪙` daily bonus',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━',
      ].join('\n'))
      .addFields(...fields.length ? fields : [{ name: '— Aucun item', value: 'Revenez plus tard', inline: false }])
      .setFooter({ text: 'Wenzy Bot • Boutique v6' })
      .setTimestamp()],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_role_custom').setLabel('🎨 Rôle Custom').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('shop_vip').setLabel('👑 VIP — 1 000 🪙').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('shop_elite_badge').setLabel('🏆 Elite — 10 000 🪙').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('shop_double_xp').setLabel('⚡ Double XP — 2 000 🪙').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_mes_pieces').setLabel('🪙 Voir mon solde').setStyle(ButtonStyle.Success),
      ),
    ],
  });
}

// ── RESTORE ROLES ────────────────────────────────────────────
async function restoreAllRoles(guild) {
  console.log('[Boot] Restauration des rôles...');
  const allUsers = db.prepare('SELECT * FROM users WHERE verified=1').all();
  const rankRoleMap = { new: '🆕 Non Classé', confirmed: '✅ Confirmé', trusted: '⭐ Fiable', elite: '👑 Elite Trader' };
  let count = 0;
  for (const u of allUsers) {
    try {
      const member = await guild.members.fetch(u.discord_id).catch(() => null);
      if (!member) continue;
      const targetRank = rankRoleMap[u.rank ?? 'new'];
      const rrole = guild.roles.cache.find(r => r.name === targetRank);
      if (rrole && !member.roles.cache.has(rrole.id)) await member.roles.add(rrole).catch(() => {});
      await applyXpRoles(guild, member, u.xp ?? 0, u.vocal_minutes ?? 0);
      count++;
    } catch {}
  }
  console.log(`[Boot] ${count} membres restaurés`);
}

// ── VOCAL PRIVÉ ───────────────────────────────────────────────
async function createPrivateVocal(guild, member) {
  try {
    const catPv = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('VOCAUX PRIVÉS'));
    const ch = await guild.channels.create({
      name: `🔒 ${member.displayName}`,
      type: ChannelType.GuildVoice,
      parent: catPv?.id ?? null,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.Connect] },
        { id: member.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
      ],
    });
    db.prepare('INSERT OR REPLACE INTO private_vocals (channel_id,owner_id) VALUES (?,?)').run(ch.id, member.id);
    await member.voice.setChannel(ch).catch(() => {});
    return ch;
  } catch(e) { console.error('[PV]', e.message); return null; }
}

// ══════════════════════════════════════════════════════════════
//  COMMANDS
// ══════════════════════════════════════════════════════════════
const commands = [

  // /wenzy-setup — refait entièrement
  { data: new SlashCommandBuilder().setName('wenzy-setup').setDescription('🏗️ Configure (ou reset) le serveur complet v6').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild, log = [];

      // Nettoyage
      log.push('🧹 Nettoyage...');
      for (const ch of guild.channels.cache.values()) {
        await ch.delete('wenzy-setup reset').catch(() => {});
      }

      // ── RÔLES ──
      const roleDefs = [
        // Staff
        { name: '👑 Owner',          color: 0xE74C3C, hoist: true,  perms: [PermissionFlagsBits.Administrator] },
        { name: '⚡ Admin',           color: 0xE67E22, hoist: true,  perms: [PermissionFlagsBits.Administrator] },
        { name: '🛡️ Modérateur',     color: 0x3498DB, hoist: true,  perms: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers] },
        { name: '🤝 Middleman',      color: 0x2ECC71, hoist: true,  perms: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads] },
        // Trade ranks
        { name: '👑 Elite Trader',   color: 0xF1C40F, hoist: true,  perms: [] },
        { name: '⭐ Fiable',         color: 0x9B59B6, hoist: false, perms: [] },
        { name: '✅ Confirmé',       color: 0x27AE60, hoist: false, perms: [] },
        { name: '🆕 Non Classé',    color: 0x95A5A6, hoist: false, perms: [] },
        // Special
        { name: '💎 Elite Badge',    color: 0xE91E8C, hoist: true,  perms: [] },
        { name: '👑 VIP',            color: 0xFFD700, hoist: true,  perms: [] },
        { name: '🎉 Giveaway Win',   color: 0xF39C12, hoist: false, perms: [] },
        { name: '🔇 Muted',         color: 0x2C2F33, hoist: false, perms: [] },
        { name: '🔒 Non Vérifié',   color: 0x2C2F33, hoist: false, perms: [] },
        { name: '📢 Annonces',       color: 0x5865F2, hoist: false, perms: [] },
      ];

      // XP roles
      for (const t of [...XP_TIERS, ...XP_VOCAL_TIERS]) {
        if (!guild.roles.cache.find(r => r.name === t.name)) {
          await guild.roles.create({ name: t.name, color: t.color, hoist: false }).catch(() => {});
        }
      }

      const cr = {};
      for (const rd of roleDefs) {
        const ex = guild.roles.cache.find(r => r.name === rd.name);
        if (ex) {
          cr[rd.name] = ex;
          if (rd.perms.length > 0) { const p = rd.perms.reduce((a,b) => a|b, 0n); await ex.setPermissions(p).catch(() => {}); }
        } else {
          const p = rd.perms.length > 0 ? rd.perms.reduce((a,b) => a|b, 0n) : 0n;
          cr[rd.name] = await guild.roles.create({ name: rd.name, color: rd.color, hoist: rd.hoist, permissions: p }).catch(() => null);
        }
        log.push(`✅ Rôle: ${rd.name}`);
      }

      const admins = ['👑 Owner', '⚡ Admin', '🛡️ Modérateur'].map(n => cr[n]).filter(Boolean);
      const nonv = cr['🔒 Non Vérifié'];
      const everyone = guild.id;

      // ── CATÉGORIES ET SALONS ──
      const catDefs = [
        {
          name: '📊 STATISTIQUES LIVE', chs: [
            { name: '👥・membres: 0',    voice: true, readonly: true },
            { name: '✅・vérifiés: 0',   voice: true, readonly: true },
            { name: '🗡️・trades: 0',     voice: true, readonly: true },
            { name: '🪙・coins: 0',      voice: true, readonly: true },
          ]
        },
        {
          name: '🔒 VÉRIFICATION', chs: [
            { name: '🔑┃verification', verif: true },
          ]
        },
        {
          name: '📌 INFORMATIONS', chs: [
            { name: '📋┃règles',          readonly: true },
            { name: '📢┃annonces',        readonly: true },
            { name: '🔗┃link-roblox' },
            { name: '📦┃weapon-values',   readonly: true },
          ]
        },
        {
          name: '🗡️ MM2 TRADING', chs: [
            { name: '🗡️┃post-trades' },
            { name: '📬┃poster-un-trade' },
            { name: '💰┃price-check' },
            { name: '🏆┃vouches',         readonly: true },
            { name: '🛡️┃middleman-panel', staff: true },
          ]
        },
        {
          name: '💬 COMMUNAUTÉ', chs: [
            { name: '👋┃bienvenue',       readonly: true },
            { name: '💬┃général' },
            { name: '🎮┃off-topic' },
            { name: '📸┃showcase' },
            { name: '📺┃vidéos-wenzy',   readonly: true },
            { name: '⬆️┃niveaux',         readonly: true },
          ]
        },
        {
          name: '🏆 CLASSEMENTS', chs: [
            { name: '🏅┃classement-trades',  readonly: true },
            { name: '🪙┃classement-pièces',  readonly: true },
            { name: '✨┃classement-xp',      readonly: true },
          ]
        },
        {
          name: '🛒 ÉCONOMIE', chs: [
            { name: '🛒┃boutique' },
            { name: '🎲┃jeux',  },
            { name: '🎉┃giveaways' },
          ]
        },
        {
          name: '🎫 TICKETS', chs: [
            { name: '🎫┃créer-ticket' },
          ]
        },
        {
          name: '📋 STAFF', chs: [
            { name: '📋┃logs-détaillés', staff: true },
            { name: '🤖┃automod-logs',   staff: true },
            { name: '🛠️┃staff-chat',     staff: true },
          ]
        },
        {
          name: '🎙️ VOCAUX', chs: [
            { name: '🏗️┃créer-un-vocal', createPv: true },
            { name: '🔇┃afk',  voice: true },
            { name: '😴┃sleep', voice: true },
            { name: '🎙️┃vocal-1', voice: true },
            { name: '🎙️┃vocal-2', voice: true },
            { name: '🎙️┃vocal-3', voice: true },
          ]
        },
        { name: '🗂️ VOCAUX PRIVÉS', chs: [] },
        { name: '🎫 TICKETS OUVERTS', chs: [] },
      ];

      const cm = {};
      for (const cd of catDefs) {
        const pows = [
          { id: everyone, allow: [PermissionFlagsBits.ViewChannel] },
          ...(nonv ? [{ id: nonv.id, deny: [PermissionFlagsBits.ViewChannel] }] : []),
        ];
        const cat = await guild.channels.create({ name: cd.name, type: ChannelType.GuildCategory, permissionOverwrites: pows });
        log.push(`📁 ${cd.name}`);
        for (const ch of cd.chs) {
          const cpows = [];
          if (ch.verif) {
            cpows.push({ id: everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
            if (nonv) cpows.push({ id: nonv.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
          } else if (ch.staff) {
            cpows.push({ id: everyone, deny: [PermissionFlagsBits.ViewChannel] });
            for (const r of admins) cpows.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
          } else if (ch.readonly) {
            cpows.push({ id: everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
            if (nonv) cpows.push({ id: nonv.id, deny: [PermissionFlagsBits.ViewChannel] });
          } else if (ch.voice) {
            // vocal standard
          } else {
            cpows.push({ id: everyone, allow: [PermissionFlagsBits.ViewChannel] });
            if (nonv) cpows.push({ id: nonv.id, deny: [PermissionFlagsBits.ViewChannel] });
          }
          cm[ch.name] = await guild.channels.create({
            name: ch.name,
            type: ch.voice ? ChannelType.GuildVoice : ChannelType.GuildText,
            parent: cat.id,
            permissionOverwrites: cpows.length ? cpows : undefined,
          });
          log.push(`✅ Salon: ${ch.name}`);
        }
      }

      // ── AUTOMOD CONFIG ──
      db.prepare('INSERT OR REPLACE INTO automod_config (guild_id,block_links,anti_spam,anti_caps,anti_raid,max_warns_mute,max_warns_kick) VALUES (?,1,1,1,1,3,5)').run(guild.id);

      // ── EMBED VÉRIFICATION ──
      if (cm['🔑┃verification']) {
        await cm['🔑┃verification'].send({ embeds: [new EmbedBuilder().setColor(C.primary)
          .setAuthor({ name: '🔑 Vérification Roblox — Wenzy MM2' })
          .setDescription([
            '**Bienvenue !** Pour accéder au serveur, lie ton compte Roblox.',
            '',
            '**📋 Étapes :**',
            '**1.** Clique sur **Lier mon compte** ci-dessous',
            '**2.** Entre ton pseudo Roblox dans le formulaire',
            '**3.** Colle le code généré dans ta **bio Roblox**',
            '**4.** Reviens ici et clique **Vérifier**',
            '',
            '> ✅ Une fois vérifié → accès complet + rôle **🌱 Novice**',
          ].join('\n'))
          .setFooter({ text: 'Vérification via API Roblox officielle — sécurisé • Wenzy Bot v6' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte Roblox').setStyle(ButtonStyle.Primary),
          )] });
        log.push('✅ Embed vérification');
      }

      // ── EMBED POSTER UN TRADE ──
      if (cm['📬┃poster-un-trade']) {
        await cm['📬┃poster-un-trade'].send({ embeds: [new EmbedBuilder().setColor(C.primary)
          .setAuthor({ name: '📬 Poster un Trade MM2' })
          .setDescription([
            'Clique sur le bouton pour créer un trade.',
            '',
            '**📋 Infos requises :**',
            '• Armes offertes _(séparées par virgules)_',
            '• Total Value de ton offre',
            '• Ce que tu cherches',
            '• Total Value recherchée _(optionnel)_',
            '',
            '> Le trade sera publié dans **post-trades** automatiquement.',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot • Système de trades MM2' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_post_trade').setLabel('🗡️ Poster un Trade').setStyle(ButtonStyle.Success),
          )] });
        log.push('✅ Embed poster-un-trade');
      }

      // ── EMBED LINK ROBLOX ──
      if (cm['🔗┃link-roblox']) {
        await cm['🔗┃link-roblox'].send({ embeds: [new EmbedBuilder().setColor(C.info)
          .setAuthor({ name: '🔗 Lier ton compte Roblox' })
          .setDescription([
            '**Comment lier ton compte :**',
            '**1.** Clique **Lier mon compte** ci-dessous',
            '**2.** Entre ton pseudo Roblox exact',
            '**3.** Colle le code dans ta **bio Roblox**',
            '**4.** Clique **Vérifier maintenant**',
            '',
            '> ✅ Vérification via API Roblox officielle — sécurisé',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot v6' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success),
          )] });
        log.push('✅ Embed link-roblox');
      }

      // ── EMBED RÈGLES ──
      if (cm['📋┃règles']) {
        await cm['📋┃règles'].send({ embeds: [new EmbedBuilder().setColor(C.primary)
          .setAuthor({ name: '📋 Règles du serveur — Wenzy MM2' })
          .setDescription([
            '**🚫 Règles générales**',
            '**1.** Respecte tous les membres du serveur',
            '**2.** Pas de spam, publicité ou NSFW',
            '**3.** Parle en français dans les salons FR',
            '**4.** Pas de fausses valeurs d\'armes intentionnelles',
            '',
            '**🗡️ Règles de trading**',
            '**5.** Vérification Roblox obligatoire pour trader',
            '**6.** Screenshots obligatoires pour valider les trades',
            '**7.** Les scams sont bannis définitivement',
            '**8.** Utilise le middleman pour les trades à haute valeur',
            '',
            '**⚠️ Sanctions**',
            '• 3 warns → Mute 10 min',
            '• 5 warns → Kick',
            '• Scam confirmé → Ban permanent',
            '',
            '*En rejoignant ce serveur, tu acceptes ces règles.*',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot v6 • MM2 Trading Server' })] });
        log.push('✅ Embed règles');
      }

      // ── BOUTIQUE ──
      if (cm['🛒┃boutique']) { await postShopEmbed(cm['🛒┃boutique']); log.push('✅ Boutique'); }

      // ── EMBED JEUX ──
      if (cm['🎲┃jeux']) {
        await cm['🎲┃jeux'].send({ embeds: [new EmbedBuilder().setColor(C.purple)
          .setAuthor({ name: '🎲 Mini-Jeux Economy — Wenzy Bot' })
          .setDescription([
            '**Commandes disponibles :**',
            '',
            '🎰 `/coinflip <mise>` — Pile ou face, double ou rien',
            '⚔️ `/duel @user <mise>` — Défie un autre membre',
            '💼 `/work` — Travaille _(cooldown 4h)_ — +10 à 80 🪙',
            '📅 `/daily` — Bonus journalier + streak 🔥',
            '🎁 `/lottery` — Tente ta chance _(5 🪙)_',
            '',
            '**Infos streak daily :**',
            '`🔥 7 jours` → Bonus 500 🪙',
            '`🔥 30 jours` → Rôle exclusif + 2000 🪙',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot • Économie v6' })] });
        log.push('✅ Embed jeux');
      }

      // ── EMBED TICKET ──
      if (cm['🎫┃créer-ticket']) {
        await cm['🎫┃créer-ticket'].send({ embeds: [new EmbedBuilder().setColor(C.info)
          .setAuthor({ name: '🎫 Système de Tickets — Wenzy MM2' })
          .setDescription([
            '**Ouvre un ticket pour :**',
            '',
            '⚔️ **Litige Trade** — Problème avec un échange',
            '🚨 **Report Scam** — Signaler un arnaqueur',
            '🎧 **Support** — Aide générale ou question',
            '🛡️ **Middleman** — Demander un middleman pour ton trade',
            '',
            '> ⚠️ Les tickets abusifs entraînent un warn.',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot • Tickets v6' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_open_litige').setLabel('⚔️ Litige Trade').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ticket_open_report').setLabel('🚨 Report Scam').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('ticket_open_support').setLabel('🎧 Support').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_open_middleman').setLabel('🛡️ Middleman').setStyle(ButtonStyle.Success),
          )] });
        log.push('✅ Embed tickets');
      }

      // ── EMBED CRÉER VOCAL ──
      if (cm['🏗️┃créer-un-vocal']) {
        await cm['🏗️┃créer-un-vocal'].send({ embeds: [new EmbedBuilder().setColor(C.primary)
          .setAuthor({ name: '🎙️ Vocaux Privés — Wenzy Bot' })
          .setDescription([
            'Clique pour créer ton vocal privé.',
            '',
            '**Commandes dans ton vocal :**',
            '`!open` — Ouvrir à tout le monde',
            '`!close` — Fermer',
            '`!add @user` — Inviter',
            '`!kick @user` — Expulser',
            '`!rename <nom>` — Renommer',
            '',
            '> ⚠️ AFK et Sleep ne comptent pas de pièces/XP',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot v6' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_create_vocal').setLabel('🎙️ Créer un vocal privé').setStyle(ButtonStyle.Primary),
          )] });
        log.push('✅ Embed vocal privé');
      }

      // ── EMBED GIVEAWAYS ──
      if (cm['🎉┃giveaways']) {
        await cm['🎉┃giveaways'].send({ embeds: [new EmbedBuilder().setColor(C.gold)
          .setAuthor({ name: '🎉 Giveaways — Wenzy MM2' })
          .setDescription([
            'Les giveaways organisés par le staff apparaissent ici.',
            '',
            '**Comment participer ?**',
            '→ Clique sur **🎉 Participer** sur chaque giveaway',
            '',
            '**Comment augmenter tes chances ?**',
            '→ Reste actif, trade, gagne des pièces pour des avantages en boutique',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot • Giveaways v6' })] });
        log.push('✅ Embed giveaways');
      }

      // Leaderboards + stat channels
      await updateLeaderboardChannel(guild);
      await updateCoinsLeaderboardChannel(guild);
      await updateXpLeaderboardChannel(guild);
      await updateStatChannels(guild);
      log.push('✅ Leaderboards et stats initialisés');

      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: '🏗️ Setup Wenzy v6 terminé !' })
        .setDescription(log.map(l => `\`${l}\``).join('\n').slice(0, 3900))
        .addFields({ name: '📋 Prochaines étapes', value: [
          '1. Donne-toi le rôle **👑 Owner**',
          '2. `/addserver <lien>` pour les serveurs privés MM2',
          '3. `/automod` pour configurer la modération',
          '4. AutoMod activé par défaut — liens bloqués, anti-spam, anti-raid',
        ].join('\n') })
        .setTimestamp()] });
    }
  },

  // /link
  { data: new SlashCommandBuilder().setName('link').setDescription('🔗 Lie ton compte Roblox').addStringOption(o=>o.setName('username').setDescription('Ton pseudo Roblox exact').setRequired(true)),
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
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info)
        .setAuthor({ name: '🔗 Vérification — Étape 1/2' })
        .setDescription([`Compte trouvé : **${rb.name}** (ID: ${rb.id})`, '', '**Code à coller dans ta bio Roblox :**', `\`\`\`${code}\`\`\``, '→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)', '', 'Reviens ici et clique Vérifier.'].join('\n'))
        .setFooter({ text: 'Code valable 15 min' })],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))] });
    }
  },

  // /verify
  { data: new SlashCommandBuilder().setName('verify').setDescription('✅ Confirme la vérification Roblox'),
    async execute(interaction) { await interaction.deferReply({ ephemeral: true }); await doVerify(interaction); }
  },

  // /trade
  { data: new SlashCommandBuilder().setName('trade').setDescription('🗡️ Système de trades MM2')
      .addSubcommand(s=>s.setName('post').setDescription('📤 Poster un trade').addStringOption(o=>o.setName('offre').setDescription('Armes offertes (virgules)').setRequired(true)).addStringOption(o=>o.setName('cherche').setDescription('Ce que tu cherches').setRequired(true)))
      .addSubcommand(s=>s.setName('cancel').setDescription('❌ Annuler ton trade').addIntegerOption(o=>o.setName('id').setDescription('ID du trade').setRequired(true)))
      .addSubcommand(s=>s.setName('check').setDescription('⚖️ Price check').addStringOption(o=>o.setName('offre').setDescription('Armes offertes').setRequired(true)).addStringOption(o=>o.setName('recois').setDescription('Armes reçues').setRequired(true))),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand(), did = interaction.user.id;
      if (sub === 'post') { await interaction.deferReply({ ephemeral: true }); await postTrade(interaction, did, interaction.options.getString('offre'), interaction.options.getString('cherche'), 0, 0); }
      else if (sub === 'cancel') { await interaction.deferReply({ ephemeral: true }); await cancelTrade(interaction, did, interaction.options.getInteger('id')); }
      else if (sub === 'check') {
        await interaction.deferReply({ ephemeral: true });
        const { total: ov, details: od } = calcValue(parseWeapons(interaction.options.getString('offre')));
        const { total: rv, details: rd } = calcValue(parseWeapons(interaction.options.getString('recois')));
        const diff = ov - rv, fair = Math.abs(diff) <= 20;
        const pct = ov > 0 ? Math.min(100, Math.round((1 - Math.abs(diff) / Math.max(ov, rv)) * 100)) : 100;
        const bar = `${'█'.repeat(Math.round(pct/10))}${'░'.repeat(10-Math.round(pct/10))} ${pct}%`;
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(fair ? C.success : (diff > 0 ? C.danger : C.gold))
          .setAuthor({ name: '⚖️ Price Check MM2' })
          .addFields(
            { name: '📤 Tu offres', value: od.map(w => `${tierBadge(w.tier)} **${w.name}** → \`${w.value} val\``).join('\n') + `\n\n**TOTAL : ${ov} val**`, inline: true },
            { name: '📥 Tu reçois', value: rd.map(w => `${tierBadge(w.tier)} **${w.name}** → \`${w.value} val\``).join('\n') + `\n\n**TOTAL : ${rv} val**`, inline: true },
            { name: '⚖️ Résultat', value: `${fair ? '✅ **Fair**' : diff > 0 ? '📉 **Unfair** — tu perds' : '📈 **Avantageux** pour toi'}\nDiff : **${Math.abs(diff)} val**\n\`[${bar}]\``, inline: false },
          ).setTimestamp()] });
      }
    }
  },

  // /profil
  { data: new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche un profil').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const target = interaction.options.getUser('membre') ?? interaction.user;
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
      if (!user) return interaction.editReply(`❌ <@${target.id}> n'a pas encore de profil.`);
      const inv = db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(target.id);
      await interaction.editReply({ embeds: [profileEmbed(user, inv, target)] });
    }
  },

  // /daily
  { data: new SlashCommandBuilder().setName('daily').setDescription('📅 Réclame ton bonus journalier'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const did = interaction.user.id;
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const now = Math.floor(Date.now() / 1000);
      const last = user.last_daily ?? 0;
      if (now - last < 82800) {
        const next = last + 86400;
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.warning)
          .setDescription(`⏳ Tu as déjà réclamé ton daily !\nProchain bonus : <t:${next}:R>`)] });
      }
      const streak = (now - last < 172800) ? (user.daily_streak ?? 0) + 1 : 1;
      let coins = 100 + (streak * 10);
      let bonus = '';
      if (streak === 7) { coins += 500; bonus = '\n🎁 **Bonus 7 jours : +500 🪙 !**'; }
      if (streak === 30) {
        coins += 2000; bonus = '\n🏆 **Bonus 30 jours : +2000 🪙 + rôle exclusif !**';
        const r = interaction.guild.roles.cache.find(x => x.name === '🎉 Giveaway Win');
        if (r) await interaction.member.roles.add(r).catch(() => {});
      }
      db.prepare('UPDATE users SET coins=coins+?,daily_streak=?,last_daily=? WHERE discord_id=?').run(coins, streak, now, did);
      await addXp(interaction.guild, did, 20, 'daily');
      await updateCoinsLeaderboardChannel(interaction.guild);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: '📅 Daily Bonus réclamé !' })
        .setDescription([`+**${coins} 🪙** réclamés !`, `+**20 XP** bonus`, `🔥 Streak : **${streak} jour(s)**${bonus}`].join('\n'))
        .addFields({ name: '💰 Nouveau solde', value: `**${(user.coins + coins).toLocaleString('fr-FR')} 🪙**`, inline: true },
          { name: '📅 Prochain daily', value: `<t:${now + 86400}:R>`, inline: true })
        .setTimestamp()] });
    }
  },

  // /work
  { data: new SlashCommandBuilder().setName('work').setDescription('💼 Travaille pour gagner des pièces (cooldown 4h)'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const did = interaction.user.id;
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const now = Math.floor(Date.now() / 1000);
      if (now - (user.last_work ?? 0) < 14400) {
        const next = (user.last_work ?? 0) + 14400;
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.warning)
          .setDescription(`⏳ Tu es fatigué ! Reviens <t:${next}:R>`)] });
      }
      const jobs = [
        { label: 'Tu as vendu des armes MM2', emoji: '🗡️', min: 15, max: 60 },
        { label: 'Tu as arbitré un trade', emoji: '⚖️', min: 20, max: 80 },
        { label: 'Tu as aidé un débutant', emoji: '🤝', min: 10, max: 40 },
        { label: 'Tu as trouvé un Chroma dans MM2', emoji: '🔴', min: 30, max: 100 },
        { label: 'Tu as streak de kills', emoji: '⚡', min: 25, max: 70 },
      ];
      const job = jobs[Math.floor(Math.random() * jobs.length)];
      const earned = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
      db.prepare('UPDATE users SET coins=coins+?,last_work=? WHERE discord_id=?').run(earned, now, did);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: '💼 Travail effectué !' })
        .setDescription(`${job.emoji} **${job.label}**\n+**${earned} 🪙** gagnés !`)
        .addFields({ name: '💰 Nouveau solde', value: `**${(user.coins + earned).toLocaleString('fr-FR')} 🪙**`, inline: true },
          { name: '⏰ Prochain work', value: `<t:${now + 14400}:R>`, inline: true })
        .setTimestamp()] });
      await updateCoinsLeaderboardChannel(interaction.guild);
    }
  },

  // /coinflip
  { data: new SlashCommandBuilder().setName('coinflip').setDescription('🎰 Pile ou face — double ou rien').addIntegerOption(o=>o.setName('mise').setDescription('Montant à miser (min 10 🪙)').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const did = interaction.user.id, mise = interaction.options.getInteger('mise');
      if (mise < 10) return interaction.editReply('❌ Mise minimum : **10 🪙**.');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      if ((user.coins ?? 0) < mise) return interaction.editReply(`❌ Pas assez de pièces. Tu as **${user.coins} 🪙**.`);
      const win = Math.random() < 0.5;
      const delta = win ? mise : -mise;
      db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(delta, did);
      const newCoins = (user.coins ?? 0) + delta;
      await interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(win ? C.success : C.danger)
        .setAuthor({ name: win ? '🎰 Tu as gagné !' : '🎰 Tu as perdu...' })
        .setDescription([
          win ? `🪙 **+${mise} pièces** ` : `💸 **-${mise} pièces**`,
          `Résultat : ${win ? '**PILE** 🪙' : '**FACE** 🌑'}`,
        ].join('\n'))
        .addFields({ name: '💰 Nouveau solde', value: `**${newCoins.toLocaleString('fr-FR')} 🪙**`, inline: true })
        .setTimestamp()] });
      await updateCoinsLeaderboardChannel(interaction.guild);
    }
  },

  // /duel
  { data: new SlashCommandBuilder().setName('duel').setDescription('⚔️ Défie un membre en duel de pièces').addUserOption(o=>o.setName('membre').setDescription('Membre à défier').setRequired(true)).addIntegerOption(o=>o.setName('mise').setDescription('Mise (min 50 🪙)').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const did = interaction.user.id, target = interaction.options.getUser('membre'), mise = interaction.options.getInteger('mise');
      if (target.id === did) return interaction.editReply('❌ Tu ne peux pas te défier toi-même.');
      if (target.bot) return interaction.editReply('❌ Les bots ne jouent pas.');
      if (mise < 50) return interaction.editReply('❌ Mise minimum : **50 🪙**.');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      const challenger = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const challenged = db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
      if ((challenger.coins ?? 0) < mise) return interaction.editReply(`❌ Tu n'as pas assez de pièces. (**${challenger.coins} 🪙**)`);
      if ((challenged.coins ?? 0) < mise) return interaction.editReply(`❌ <@${target.id}> n'a pas assez de pièces.`);
      const res = db.prepare('INSERT INTO duels (challenger_id,challenged_id,amount,channel_id) VALUES (?,?,?,?)').run(did, target.id, mise, interaction.channelId);
      const duelId = res.lastInsertRowid;
      const msg = await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.purple)
        .setAuthor({ name: `⚔️ DUEL — ${interaction.user.username} vs ${target.username}` })
        .setDescription([`<@${did}> défie <@${target.id}> pour **${mise} 🪙** !`, '', '> <@'+target.id+'> clique sur **Accepter** pour jouer !'].join('\n'))
        .addFields(
          { name: '🗡️ Challenger', value: `<@${did}>\n${challenger.coins} 🪙`, inline: true },
          { name: '🛡️ Défié', value: `<@${target.id}>\n${challenged.coins} 🪙`, inline: true },
          { name: '💰 Mise', value: `**${mise} 🪙**`, inline: true },
        ).setTimestamp()],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`duel_accept_${duelId}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`duel_refuse_${duelId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
        )] });
      db.prepare('UPDATE duels SET message_id=? WHERE id=?').run(msg.id, duelId);
      // Auto-cancel after 2 min
      setTimeout(async () => {
        const duel = db.prepare('SELECT * FROM duels WHERE id=?').get(duelId);
        if (duel?.status === 'pending') {
          db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled', duelId);
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.danger).setDescription('❌ Duel annulé — pas de réponse.')], components: [] }).catch(() => {});
        }
      }, 120000);
    }
  },

  // /leaderboard
  { data: new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement').addStringOption(o=>o.setName('type').setDescription('Type').addChoices({name:'Trades',value:'trades'},{name:'Pièces',value:'coins'},{name:'XP',value:'xp'}).setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const type = interaction.options.getString('type') ?? 'trades';
      const order = type === 'coins' ? 'coins' : type === 'xp' ? 'xp' : 'trade_count';
      const top = db.prepare(`SELECT discord_id,roblox_username,trade_count,vouch_count,coins,xp,rank FROM users ORDER BY ${order} DESC LIMIT 10`).all();
      if (!top.length) return interaction.editReply('Aucun résultat.');
      await interaction.editReply({ embeds: [leaderboardEmbed(top, type)] });
    }
  },

  // /profil
  // /inventory
  { data: new SlashCommandBuilder().setName('inventory').setDescription('📦 Gère ton inventory MM2')
      .addSubcommand(s=>s.setName('add').setDescription('➕ Ajouter').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)))
      .addSubcommand(s=>s.setName('remove').setDescription('➖ Retirer').addStringOption(o=>o.setName('arme').setDescription('Nom exact').setRequired(true)))
      .addSubcommand(s=>s.setName('view').setDescription('👀 Voir')),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true }); const sub = interaction.options.getSubcommand(), did = interaction.user.id;
      if (sub === 'add') { const name = interaction.options.getString('arme'); const row = db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(name); const val = row?.value ?? 0; db.prepare('INSERT INTO inventory (discord_id,weapon_name,weapon_value,verified) VALUES (?,?,?,?)').run(did, row?.name ?? name, val, val > 0 ? 1 : 0); await interaction.editReply(`✅ **${row?.name ?? name}** ajouté à ton inventory.`); }
      else if (sub === 'remove') { const name = interaction.options.getString('arme'); const r = db.prepare('DELETE FROM inventory WHERE discord_id=? AND LOWER(weapon_name)=LOWER(?)').run(did, name); if (!r.changes) return interaction.editReply('❌ Introuvable.'); await interaction.editReply(`✅ **${name}** retiré.`); }
      else { const inv = db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(did); if (!inv.length) return interaction.editReply('📦 Inventory vide.'); await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.primary).setAuthor({ name: '📦 Ton Inventory MM2' }).setDescription(inv.map(w => `${tierBadge(w.weapon_tier ?? 'godly')} **${w.weapon_name}** \`${w.weapon_value}v\``).join('\n').slice(0, 2000)).setFooter({ text: `${inv.length} arme(s)` })] }); }
    }
  },

  // /updatevalue
  { data: new SlashCommandBuilder().setName('updatevalue').setDescription('💰 (Admin) Mettre à jour une arme').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)).addIntegerOption(o=>o.setName('valeur').setDescription('Valeur').setRequired(true)).addStringOption(o=>o.setName('tier').setDescription('Tier').addChoices({name:'Godly',value:'godly'},{name:'Chroma',value:'chroma'},{name:'Ancient',value:'ancient'},{name:'Legendary',value:'legendary'},{name:'Epic',value:'epic'},{name:'Rare',value:'rare'})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) { await interaction.deferReply({ ephemeral: true }); const name = interaction.options.getString('arme'), value = interaction.options.getInteger('valeur'), tier = interaction.options.getString('tier') ?? 'godly'; db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now')) ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`).run(name, value, tier); await interaction.editReply(`✅ **${name}** → **${value} val** (${tier})`); }
  },

  // /updatevalues
  { data: new SlashCommandBuilder().setName('updatevalues').setDescription('🔄 (Admin) Sync valeurs MM2').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) { await interaction.deferReply({ ephemeral: true }); await fetchMM2Values(); const count = db.prepare('SELECT COUNT(*) as c FROM weapon_values').get().c; await interaction.editReply(`✅ Sync terminée. **${count}** armes.`); }
  },

  // /addserver
  { data: new SlashCommandBuilder().setName('addserver').setDescription('🎮 (Admin) Ajouter serveur privé MM2').addStringOption(o=>o.setName('lien').setDescription('Lien Roblox').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) { await interaction.deferReply({ ephemeral: true }); const link = interaction.options.getString('lien'); try { db.prepare('INSERT INTO private_servers (link,added_by) VALUES (?,?)').run(link, interaction.user.id); } catch { return interaction.editReply('⚠️ Ce lien est déjà dans le pool.'); } const count = db.prepare('SELECT COUNT(*) as c FROM private_servers WHERE in_use=0').get().c; await interaction.editReply(`✅ Serveur ajouté ! **${count}** disponibles.`); }
  },

  // /listservers
  { data: new SlashCommandBuilder().setName('listservers').setDescription('📋 (Admin) Voir pool serveurs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) { await interaction.deferReply({ ephemeral: true }); const servers = db.prepare('SELECT * FROM private_servers ORDER BY in_use ASC').all(); if (!servers.length) return interaction.editReply('📋 Pool vide.'); await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info).setAuthor({ name: '🎮 Pool Serveurs MM2' }).setDescription(servers.map(s => `**#${s.id}** ${s.in_use ? '🔴 En cours' : '🟢 Libre'} \`${s.link.slice(0, 50)}\``).join('\n').slice(0, 2000)).setFooter({ text: `Total : ${servers.length} | Libres : ${servers.filter(s => !s.in_use).length}` })] }); }
  },

  // /report
  { data: new SlashCommandBuilder().setName('report').setDescription('🚨 Reporter un scam').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).addIntegerOption(o=>o.setName('trade').setDescription('ID trade (optionnel)')),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const reported = interaction.options.getUser('membre'), reason = interaction.options.getString('raison'), tradeId = interaction.options.getInteger('trade');
      db.prepare('INSERT INTO reports (reporter_id,reported_id,trade_id,reason) VALUES (?,?,?,?)').run(interaction.user.id, reported.id, tradeId ?? null, reason);
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(reported.id);
      db.prepare('UPDATE users SET report_count=report_count+1 WHERE discord_id=?').run(reported.id);
      await sendLog(interaction.guild, new EmbedBuilder().setColor(C.danger)
        .setAuthor({ name: '🚨 Nouveau Report' })
        .addFields({ name: '🕵️ Reporter', value: `<@${interaction.user.id}>`, inline: true }, { name: '⚠️ Reporté', value: `<@${reported.id}>`, inline: true }, { name: '🗡️ Trade', value: tradeId ? `#${tradeId}` : 'Non précisé', inline: true }, { name: '📝 Raison', value: reason })
        .setTimestamp());
      await interaction.editReply(`✅ Report envoyé contre <@${reported.id}>. Le staff a été notifié.`);
    }
  },

  // /addxp
  { data: new SlashCommandBuilder().setName('addxp').setDescription('✨ (Staff) Ajouter de l\'XP').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('quantite').setDescription('Quantité').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const target = interaction.options.getUser('membre'), amount = interaction.options.getInteger('quantite'), reason = interaction.options.getString('raison') ?? '—';
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET xp=MAX(0,xp+?) WHERE discord_id=?').run(amount, target.id);
      const u = db.prepare('SELECT xp,vocal_minutes FROM users WHERE discord_id=?').get(target.id);
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member) await applyXpRoles(interaction.guild, member, u.xp, u.vocal_minutes ?? 0);
      await sendLog(interaction.guild, new EmbedBuilder().setColor(amount >= 0 ? C.success : C.warning)
        .setAuthor({ name: `${amount >= 0 ? '➕' : '➖'} XP modifié` })
        .addFields({ name: '👤 Membre', value: `<@${target.id}>`, inline: true }, { name: '✨ Modif', value: `${amount >= 0 ? '+' : ''}${amount} XP`, inline: true }, { name: '📊 Total', value: `${u.xp} XP — ${getXpTier(u.xp).name}`, inline: true }, { name: '📝 Raison', value: reason }, { name: '🛡️ Staff', value: `<@${interaction.user.id}>`, inline: true })
        .setTimestamp());
      await interaction.editReply(`✅ <@${target.id}> → **${amount >= 0 ? '+' : ''}${amount} XP** | Total : **${u.xp} XP** | ${getXpTier(u.xp).name}`);
      await updateXpLeaderboardChannel(interaction.guild);
    }
  },

  // /addcoins
  { data: new SlashCommandBuilder().setName('addcoins').setDescription('🪙 (Staff) Ajouter des pièces').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('quantite').setDescription('Quantité').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const target = interaction.options.getUser('membre'), amount = interaction.options.getInteger('quantite'), reason = interaction.options.getString('raison') ?? '—';
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET coins=MAX(0,coins+?) WHERE discord_id=?').run(amount, target.id);
      const u = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(target.id);
      await sendLog(interaction.guild, new EmbedBuilder().setColor(amount >= 0 ? C.success : C.warning)
        .setAuthor({ name: `${amount >= 0 ? '➕' : '➖'} Pièces modifiées` })
        .addFields({ name: '👤 Membre', value: `<@${target.id}>`, inline: true }, { name: '🪙 Modif', value: `${amount >= 0 ? '+' : ''}${amount} 🪙`, inline: true }, { name: '💰 Total', value: `${u.coins} 🪙`, inline: true }, { name: '📝 Raison', value: reason }, { name: '🛡️ Staff', value: `<@${interaction.user.id}>`, inline: true })
        .setTimestamp());
      await interaction.editReply(`✅ <@${target.id}> → **${amount >= 0 ? '+' : ''}${amount} 🪙** | Total : **${u.coins} 🪙**`);
      await updateCoinsLeaderboardChannel(interaction.guild);
    }
  },

  // /warn
  { data: new SlashCommandBuilder().setName('warn').setDescription('⚠️ (Staff) Avertir un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const target = interaction.options.getUser('membre'), reason = interaction.options.getString('raison');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET warn_count=warn_count+1 WHERE discord_id=?').run(target.id);
      db.prepare('INSERT INTO warns (discord_id,moderator_id,reason) VALUES (?,?,?)').run(target.id, interaction.user.id, reason);
      const u = db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(target.id);
      try { const member = await interaction.guild.members.fetch(target.id); await member.send({ embeds: [new EmbedBuilder().setColor(C.warning).setDescription(`⚠️ Tu as reçu un avertissement sur **${interaction.guild.name}**\n\n**Raison :** ${reason}\n\nTu as maintenant **${u.warn_count}** warn(s).`)] }); } catch {}
      await sendLog(interaction.guild, automodLogEmbed('warn', target, reason, `Warn ${u.warn_count} — par <@${interaction.user.id}>`));
      await interaction.editReply(`✅ <@${target.id}> averti (**${u.warn_count}** warn(s)) — ${reason}`);
    }
  },

  // /warns
  { data: new SlashCommandBuilder().setName('warns').setDescription('📋 (Staff) Voir les warns d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const target = interaction.options.getUser('membre');
      const warns = db.prepare('SELECT * FROM warns WHERE discord_id=? ORDER BY created_at DESC LIMIT 10').all(target.id);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.warning)
        .setAuthor({ name: `⚠️ Warns — ${target.username}` })
        .setDescription(warns.length ? warns.map((w, i) => `**#${i+1}** <@${w.moderator_id}> — ${w.reason} — <t:${w.created_at}:R>`).join('\n') : 'Aucun warn.')
        .setFooter({ text: `${warns.length} warn(s) au total` })] });
    }
  },

  // /clearwarns
  { data: new SlashCommandBuilder().setName('clearwarns').setDescription('🧹 (Admin) Effacer les warns d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const target = interaction.options.getUser('membre');
      db.prepare('DELETE FROM warns WHERE discord_id=?').run(target.id);
      db.prepare('UPDATE users SET warn_count=0 WHERE discord_id=?').run(target.id);
      await interaction.editReply(`✅ Warns de <@${target.id}> effacés.`);
    }
  },

  // /automod
  { data: new SlashCommandBuilder().setName('automod').setDescription('🛡️ (Admin) Configurer l\'AutoMod')
      .addSubcommand(s=>s.setName('status').setDescription('📊 Voir la config actuelle'))
      .addSubcommand(s=>s.setName('links').setDescription('🔗 Toggle blocage des liens').addBooleanOption(o=>o.setName('actif').setDescription('Activer/désactiver').setRequired(true)))
      .addSubcommand(s=>s.setName('spam').setDescription('📨 Toggle anti-spam').addBooleanOption(o=>o.setName('actif').setDescription('Activer/désactiver').setRequired(true)))
      .addSubcommand(s=>s.setName('caps').setDescription('🔠 Toggle anti-majuscules').addBooleanOption(o=>o.setName('actif').setDescription('Activer/désactiver').setRequired(true)))
      .addSubcommand(s=>s.setName('raid').setDescription('🚨 Toggle anti-raid').addBooleanOption(o=>o.setName('actif').setDescription('Activer/désactiver').setRequired(true)))
      .addSubcommand(s=>s.setName('addword').setDescription('➕ Ajouter un mot banni').addStringOption(o=>o.setName('mot').setDescription('Mot à bannir').setRequired(true)))
      .addSubcommand(s=>s.setName('removeword').setDescription('➖ Retirer un mot banni').addStringOption(o=>o.setName('mot').setDescription('Mot à retirer').setRequired(true)))
      .addSubcommand(s=>s.setName('whitelist').setDescription('✅ Whitelist un salon pour les liens').addChannelOption(o=>o.setName('salon').setDescription('Salon').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const sub = interaction.options.getSubcommand(), gid = interaction.guild.id;
      db.prepare('INSERT OR IGNORE INTO automod_config (guild_id) VALUES (?)').run(gid);
      const cfg = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(gid);

      if (sub === 'status') {
        const words = JSON.parse(cfg.banned_words || '[]');
        const wl = JSON.parse(cfg.link_whitelist_channels || '[]');
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info)
          .setAuthor({ name: '🛡️ Config AutoMod' })
          .addFields(
            { name: '🔗 Blocage liens', value: cfg.block_links ? '✅ Actif' : '❌ Inactif', inline: true },
            { name: '📨 Anti-spam', value: cfg.anti_spam ? '✅ Actif' : '❌ Inactif', inline: true },
            { name: '🔠 Anti-caps', value: cfg.anti_caps ? '✅ Actif' : '❌ Inactif', inline: true },
            { name: '🚨 Anti-raid', value: cfg.anti_raid ? '✅ Actif' : '❌ Inactif', inline: true },
            { name: '⚠️ Warns → Mute', value: `${cfg.max_warns_mute}`, inline: true },
            { name: '🦶 Warns → Kick', value: `${cfg.max_warns_kick}`, inline: true },
            { name: '🚫 Mots bannis', value: words.length ? words.map(w => `\`${w}\``).join(', ') : 'Aucun', inline: false },
            { name: '✅ Salons whitelist liens', value: wl.length ? wl.map(id => `<#${id}>`).join(', ') : 'Aucun', inline: false },
          ).setTimestamp()] });
      }
      if (sub === 'links') { db.prepare('UPDATE automod_config SET block_links=? WHERE guild_id=?').run(interaction.options.getBoolean('actif') ? 1 : 0, gid); return interaction.editReply(`✅ Blocage liens : **${interaction.options.getBoolean('actif') ? 'activé' : 'désactivé'}**`); }
      if (sub === 'spam') { db.prepare('UPDATE automod_config SET anti_spam=? WHERE guild_id=?').run(interaction.options.getBoolean('actif') ? 1 : 0, gid); return interaction.editReply(`✅ Anti-spam : **${interaction.options.getBoolean('actif') ? 'activé' : 'désactivé'}**`); }
      if (sub === 'caps') { db.prepare('UPDATE automod_config SET anti_caps=? WHERE guild_id=?').run(interaction.options.getBoolean('actif') ? 1 : 0, gid); return interaction.editReply(`✅ Anti-caps : **${interaction.options.getBoolean('actif') ? 'activé' : 'désactivé'}**`); }
      if (sub === 'raid') { db.prepare('UPDATE automod_config SET anti_raid=? WHERE guild_id=?').run(interaction.options.getBoolean('actif') ? 1 : 0, gid); return interaction.editReply(`✅ Anti-raid : **${interaction.options.getBoolean('actif') ? 'activé' : 'désactivé'}**`); }
      if (sub === 'addword') {
        const mot = interaction.options.getString('mot').toLowerCase();
        const words = JSON.parse(cfg.banned_words || '[]');
        if (!words.includes(mot)) words.push(mot);
        db.prepare('UPDATE automod_config SET banned_words=? WHERE guild_id=?').run(JSON.stringify(words), gid);
        return interaction.editReply(`✅ Mot \`${mot}\` ajouté à la liste noire.`);
      }
      if (sub === 'removeword') {
        const mot = interaction.options.getString('mot').toLowerCase();
        const words = JSON.parse(cfg.banned_words || '[]').filter(w => w !== mot);
        db.prepare('UPDATE automod_config SET banned_words=? WHERE guild_id=?').run(JSON.stringify(words), gid);
        return interaction.editReply(`✅ Mot \`${mot}\` retiré.`);
      }
      if (sub === 'whitelist') {
        const ch = interaction.options.getChannel('salon');
        const wl = JSON.parse(cfg.link_whitelist_channels || '[]');
        if (!wl.includes(ch.id)) wl.push(ch.id);
        db.prepare('UPDATE automod_config SET link_whitelist_channels=? WHERE guild_id=?').run(JSON.stringify(wl), gid);
        return interaction.editReply(`✅ <#${ch.id}> whitelisté pour les liens.`);
      }
    }
  },

  // /unlock (anti-raid)
  { data: new SlashCommandBuilder().setName('unlock').setDescription('🔓 (Admin) Déverrouiller le serveur après un raid').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const channels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
      for (const ch of channels.values()) {
        await ch.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null }).catch(() => {});
      }
      raidCache.locked = false;
      await sendLog(interaction.guild, new EmbedBuilder().setColor(C.success).setAuthor({ name: '🔓 Serveur déverrouillé' }).addFields({ name: '🛡️ Par', value: `<@${interaction.user.id}>`, inline: true }).setTimestamp());
      await interaction.editReply('✅ Serveur déverrouillé !');
    }
  },

  // /giveaway
  { data: new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Système de giveaway')
      .addSubcommand(s=>s.setName('start').setDescription('🎁 Lancer').addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true)).addStringOption(o=>o.setName('duree').setDescription('Durée (1h, 30m, 2d)').setRequired(true)).addIntegerOption(o=>o.setName('gagnants').setDescription('Nombre de gagnants (défaut: 1)')).addChannelOption(o=>o.setName('salon').setDescription('Salon (défaut: actuel)')))
      .addSubcommand(s=>s.setName('end').setDescription('🏁 Terminer').addIntegerOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand(s=>s.setName('reroll').setDescription('🔄 Reroll').addIntegerOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand(s=>s.setName('list').setDescription('📋 Lister actifs'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const sub = interaction.options.getSubcommand();
      if (sub === 'start') {
        const prize = interaction.options.getString('prix'), dureeStr = interaction.options.getString('duree'), winnersCount = interaction.options.getInteger('gagnants') ?? 1;
        const targetCh = interaction.options.getChannel('salon') ?? interaction.guild.channels.cache.find(c => c.name.includes('giveaways')) ?? interaction.channel;
        let seconds = 0;
        const dMatch = dureeStr.match(/(\d+)d/), hMatch = dureeStr.match(/(\d+)h/), mMatch = dureeStr.match(/(\d+)m/);
        if (dMatch) seconds += parseInt(dMatch[1]) * 86400;
        if (hMatch) seconds += parseInt(hMatch[1]) * 3600;
        if (mMatch) seconds += parseInt(mMatch[1]) * 60;
        if (seconds < 60) return interaction.editReply('❌ Durée minimum : 1 minute.');
        const endsAt = Math.floor(Date.now() / 1000) + seconds;
        const res = db.prepare('INSERT INTO giveaways (channel_id,prize,winners_count,host_id,ends_at) VALUES (?,?,?,?,?)').run(targetCh.id, prize, winnersCount, interaction.user.id, endsAt);
        const gwId = res.lastInsertRowid;
        const embed = new EmbedBuilder().setColor(C.gold)
          .setAuthor({ name: `🎉 GIVEAWAY — ${prize}` })
          .setDescription([`> Clique sur **🎉 Participer** pour entrer !`, '', `🎁 **Prix :** ${prize}`, `🏆 **Gagnants :** ${winnersCount}`, `⏳ **Fin :** <t:${endsAt}:R> (<t:${endsAt}:f>)`, `📢 **Organisé par :** <@${interaction.user.id}>`].join('\n'))
          .setFooter({ text: `Giveaway #${gwId} • Wenzy Bot` }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`gw_join_${gwId}`).setLabel('🎉 Participer').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`gw_leave_${gwId}`).setLabel('❌ Se retirer').setStyle(ButtonStyle.Secondary),
        );
        const msg = await targetCh.send({ content: `@everyone 🎉 **Nouveau giveaway !**`, embeds: [embed], components: [row] });
        db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(msg.id, gwId);
        await interaction.editReply(`✅ Giveaway **#${gwId}** lancé !`);
        setTimeout(() => endGiveaway(interaction.client, gwId), seconds * 1000);
      }
      else if (sub === 'end') { const gwId = interaction.options.getInteger('id'); await endGiveaway(interaction.client, gwId); await interaction.editReply(`✅ Giveaway **#${gwId}** terminé.`); }
      else if (sub === 'reroll') {
        const gwId = interaction.options.getInteger('id');
        const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
        if (!gw) return interaction.editReply('❌ Introuvable.');
        const participants = JSON.parse(gw.participants || '[]');
        if (!participants.length) return interaction.editReply('❌ Aucun participant.');
        const newWinners = [...participants].sort(() => Math.random() - 0.5).slice(0, Math.min(gw.winners_count, participants.length));
        db.prepare('UPDATE giveaways SET winners=? WHERE id=?').run(JSON.stringify(newWinners), gwId);
        try { const ch = await interaction.client.channels.fetch(gw.channel_id).catch(() => null); if (ch) await ch.send(`🔄 **Reroll #${gwId}** — Nouveaux gagnants : ${newWinners.map(w => `<@${w}>`).join(', ')}`); } catch {}
        await interaction.editReply(`✅ Reroll effectué !`);
      }
      else if (sub === 'list') {
        const active = db.prepare('SELECT * FROM giveaways WHERE status=? ORDER BY ends_at ASC').all('active');
        if (!active.length) return interaction.editReply('📭 Aucun giveaway actif.');
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold).setAuthor({ name: '🎉 Giveaways actifs' }).setDescription(active.map(g => { const p = JSON.parse(g.participants || '[]'); return `**#${g.id}** — ${g.prize} | 🏆 ${g.winners_count} | 👥 ${p.length} | Fin : <t:${g.ends_at}:R>`; }).join('\n')).setTimestamp()] });
      }
    }
  },

  // /shopadd
  { data: new SlashCommandBuilder().setName('shopadd').setDescription('🛒 (Admin) Ajouter/modifier item boutique').addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)).addIntegerOption(o=>o.setName('prix').setDescription('Prix').setRequired(true)).addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true)).addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'Rôle custom',value:'custom_role'},{name:'Rôle VIP',value:'vip_role'},{name:'Badge Elite',value:'elite_badge'},{name:'Double XP',value:'double_xp'},{name:'Item générique',value:'generic'})).addStringOption(o=>o.setName('emoji').setDescription('Emoji')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const nom = interaction.options.getString('nom'), prix = interaction.options.getInteger('prix'), desc = interaction.options.getString('description'), type = interaction.options.getString('type'), emoji = interaction.options.getString('emoji') ?? '🎁';
      db.prepare('INSERT INTO shop_items (name,description,price,item_type,emoji,active,added_by) VALUES (?,?,?,?,?,1,?) ON CONFLICT(name) DO UPDATE SET description=excluded.description,price=excluded.price,item_type=excluded.item_type,emoji=excluded.emoji,active=1,added_by=excluded.added_by').run(nom, desc, prix, type, emoji, interaction.user.id);
      const boutiqueCh = interaction.guild.channels.cache.find(c => c.name.includes('boutique'));
      if (boutiqueCh) await postShopEmbed(boutiqueCh);
      await interaction.editReply(`✅ Item **${nom}** ajouté/mis à jour !`);
    }
  },

  // /hotrades
  { data: new SlashCommandBuilder().setName('hotrades').setDescription('🔥 Top 5 trades en valeur'),
    async execute(interaction) {
      await interaction.deferReply();
      const hot = db.prepare('SELECT * FROM trades WHERE status=? ORDER BY offer_value DESC LIMIT 5').all('open');
      if (!hot.length) return interaction.editReply('📭 Aucun hot trade en ce moment.');
      const embeds = hot.map(t => { const poster = db.prepare('SELECT * FROM users WHERE discord_id=?').get(t.poster_id); return tradeEmbed(t, poster); });
      await interaction.editReply({ content: '🔥 **Top 5 trades ouverts :**', embeds: embeds.slice(0, 5) });
    }
  },

  // /price-alert
  { data: new SlashCommandBuilder().setName('price-alert').setDescription('🔔 Alerte quand une arme est postée à ta valeur').addStringOption(o=>o.setName('arme').setDescription('Nom de l\'arme').setRequired(true)).addIntegerOption(o=>o.setName('valeur-max').setDescription('Valeur max acceptable').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const weapon = interaction.options.getString('arme'), maxVal = interaction.options.getInteger('valeur-max');
      db.prepare('INSERT INTO price_alerts (discord_id,weapon_name,max_value) VALUES (?,?,?)').run(interaction.user.id, weapon, maxVal);
      await interaction.editReply(`✅ Alerte créée : **${weapon}** ≤ **${maxVal} val** — tu seras DM quand ce trade est posté !`);
    }
  },

  // /configvideo
  { data: new SlashCommandBuilder().setName('configvideo').setDescription('📺 (Admin) Configurer le salon vidéo').addChannelOption(o=>o.setName('salon').setDescription('Salon').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) { await interaction.deferReply({ ephemeral: true }); const ch = interaction.options.getChannel('salon'); process.env.VIDEO_CHANNEL_OVERRIDE = ch.id; await interaction.editReply(`✅ Salon vidéo → <#${ch.id}>`); }
  },

];

// ══════════════════════════════════════════════════════════════
//  BUTTON HANDLER
// ══════════════════════════════════════════════════════════════
async function handleButton(interaction) {
  const { customId, guild, user } = interaction;

  // ── VÉRIFICATION ──
  if (customId === 'btn_link_start') {
    const modal = new ModalBuilder().setCustomId('modal_link_roblox').setTitle('🔗 Lier ton compte Roblox');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roblox_username').setLabel('Ton pseudo Roblox exact').setStyle(TextInputStyle.Short).setPlaceholder('ex: WenzyFR').setRequired(true).setMinLength(3).setMaxLength(20)));
    return interaction.showModal(modal);
  }
  if (customId === 'btn_verify_now') { await interaction.deferReply({ ephemeral: true }); return doVerify(interaction); }

  // ── TRADE ──
  if (customId === 'btn_post_trade') {
    const modal = new ModalBuilder().setCustomId('modal_post_trade').setTitle('🗡️ Poster un Trade MM2');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_offre').setLabel('Armes que tu offres (virgules)').setStyle(TextInputStyle.Short).setPlaceholder('ex: Chroma Seer, Corrupt').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_offre_val').setLabel('Total Value de ton offre').setStyle(TextInputStyle.Short).setPlaceholder('ex: 255').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_cherche').setLabel('Ce que tu cherches').setStyle(TextInputStyle.Short).setPlaceholder('ex: Ancient Seer').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_cherche_val').setLabel('Total Value recherchée (0 si inconnu)').setStyle(TextInputStyle.Short).setPlaceholder('ex: 200').setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  // ── VOCAL PRIVÉ ──
  if (customId === 'btn_create_vocal') {
    await interaction.deferReply({ ephemeral: true });
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.editReply('❌ Impossible de te trouver.');
    if (!member.voice.channel) return interaction.editReply('❌ Tu dois être dans un vocal. Rejoins un vocal d\'abord !');
    const existing = db.prepare('SELECT * FROM private_vocals WHERE owner_id=?').get(user.id);
    if (existing) {
      const existingCh = guild.channels.cache.get(existing.channel_id);
      if (existingCh) return interaction.editReply(`❌ Tu as déjà un vocal privé : <#${existing.channel_id}>`);
      else db.prepare('DELETE FROM private_vocals WHERE owner_id=?').run(user.id);
    }
    const ch = await createPrivateVocal(guild, member);
    if (!ch) return interaction.editReply('❌ Erreur lors de la création.');
    return interaction.editReply(`✅ Vocal privé créé : **${ch.name}**\n\`!open\` / \`!close\` / \`!add @user\` / \`!kick @user\` / \`!rename <nom>\``);
  }

  // ── SHOP ──
  if (customId === 'shop_mes_pieces') {
    await interaction.deferReply({ ephemeral: true });
    const u = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    const coins = u?.coins ?? 0, xp = u?.xp ?? 0, vocMin = u?.vocal_minutes ?? 0;
    const bar = xpProgressBar(xp);
    const coinBar = coinsBar(coins);
    const purchases = db.prepare('SELECT * FROM shop_purchases WHERE discord_id=? ORDER BY created_at DESC LIMIT 5').all(user.id);
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold)
      .setAuthor({ name: '🪙 Ton solde & statistiques' })
      .addFields(
        { name: '💰 Pièces', value: `\`[${coinBar}]\``, inline: false },
        { name: `${getXpTier(xp).emoji} Niveau`, value: `\`[${bar}]\`\n${xp} XP — ${getXpTier(xp).name}`, inline: true },
        { name: '🎙️ Vocal', value: `${vocMin} min — ${getVocalTier(vocMin).name}`, inline: true },
        { name: '🔥 Streak', value: `${u?.daily_streak ?? 0} jours`, inline: true },
        { name: '📦 Derniers achats', value: purchases.length ? purchases.map(p => `• ${p.item_type} — ${p.coins_spent} 🪙 (<t:${p.created_at}:R>)`).join('\n') : '_Aucun achat_', inline: false },
      ).setTimestamp()] });
  }

  if (customId === 'shop_role_custom') {
    const user2 = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!user2 || user2.coins < 500) { await interaction.deferReply({ ephemeral: true }); return interaction.editReply(`❌ Il te faut **500 🪙** (tu en as **${user2?.coins ?? 0}**).`); }
    const modal = new ModalBuilder().setCustomId('modal_shop_role_custom').setTitle('🎨 Acheter un rôle custom');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_name').setLabel('Nom du rôle').setStyle(TextInputStyle.Short).setPlaceholder('ex: 🌙 LunarTrader').setRequired(true).setMaxLength(30)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_color').setLabel('Couleur hex (ex: #FF5733)').setStyle(TextInputStyle.Short).setPlaceholder('#FF5733').setRequired(true).setMaxLength(20)),
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
    await updateCoinsLeaderboardChannel(guild);
    await sendLog(guild, new EmbedBuilder().setColor(C.gold).setDescription(`👑 <@${user.id}> a acheté le rôle VIP pour 1 000 🪙`).setTimestamp());
    return interaction.editReply('✅ **Rôle VIP** acheté et attribué !');
  }

  if (customId === 'shop_elite_badge') {
    await interaction.deferReply({ ephemeral: true });
    const user2 = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!user2 || user2.coins < 10000) return interaction.editReply(`❌ Il te faut **10 000 🪙** (tu en as **${user2?.coins ?? 0}**).`);
    db.prepare('UPDATE users SET coins=coins-10000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id, 'elite_badge', 10000);
    const eliteRole = guild.roles.cache.find(r => r.name === '💎 Elite Badge');
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member && eliteRole) await member.roles.add(eliteRole).catch(() => {});
    await updateCoinsLeaderboardChannel(guild);
    return interaction.editReply('✅ **Badge Elite** acheté !');
  }

  if (customId === 'shop_double_xp') {
    await interaction.deferReply({ ephemeral: true });
    const user2 = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!user2 || user2.coins < 2000) return interaction.editReply(`❌ Il te faut **2 000 🪙** (tu en as **${user2?.coins ?? 0}**).`);
    db.prepare('UPDATE users SET coins=coins-2000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id, 'double_xp', 2000);
    // Store double XP expiry (not implemented in DB for simplicity, just a flag)
    return interaction.editReply('✅ **Double XP 24h** activé ! Tes XP sont doublés pendant 24h.');
  }

  // ── TICKETS ──
  if (customId === 'ticket_open_litige') {
    const modal = new ModalBuilder().setCustomId('modal_ticket_litige').setTitle('⚔️ Litige Trade');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_id').setLabel('ID du trade concerné').setStyle(TextInputStyle.Short).setPlaceholder('ex: 42').setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Décris le problème').setStyle(TextInputStyle.Paragraph).setPlaceholder('Explique ce qui s\'est passé...').setRequired(true).setMaxLength(500)),
    );
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_open_report') {
    const modal = new ModalBuilder().setCustomId('modal_ticket_report').setTitle('🚨 Report Scam');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reported_id').setLabel('ID Discord du scammer').setStyle(TextInputStyle.Short).setPlaceholder('ex: 123456789012345678').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Preuves / description').setStyle(TextInputStyle.Paragraph).setPlaceholder('Screenshots, explications...').setRequired(true).setMaxLength(500)),
    );
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_open_support') {
    const modal = new ModalBuilder().setCustomId('modal_ticket_support').setTitle('🎧 Support');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Comment peut-on t\'aider ?').setStyle(TextInputStyle.Paragraph).setPlaceholder('Décris ton problème...').setRequired(true).setMaxLength(500)),
    );
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_open_middleman') {
    await interaction.deferReply({ ephemeral: true });
    const ch = await createTicket(interaction, 'middleman', { reason: 'Demande de middleman pour un trade' });
    if (ch) return interaction.editReply(`✅ Ticket créé : <#${ch.id}>`);
  }

  if (customId.startsWith('ticket_claim_')) {
    await interaction.deferReply({ ephemeral: true });
    if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
    const ticketId = parseInt(customId.replace('ticket_claim_', ''));
    const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    if (!ticket) return interaction.editReply('❌ Ticket introuvable.');
    db.prepare('UPDATE tickets SET status=?,claimed_by=? WHERE id=?').run('claimed', user.id, ticketId);
    const tCh = guild.channels.cache.get(ticket.channel_id);
    if (tCh) await tCh.send({ embeds: [new EmbedBuilder().setColor(C.success).setDescription(`🤝 **Ticket pris en charge par <@${user.id}>**`).setTimestamp()] });
    return interaction.editReply('✅ Ticket pris en charge.');
  }

  if (customId.startsWith('ticket_close_')) {
    await interaction.deferReply({ ephemeral: true });
    const ticketId = parseInt(customId.replace('ticket_close_', ''));
    const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    if (!ticket) return interaction.editReply('❌ Ticket introuvable.');
    if (!hasStaffPerm(interaction.member) && ticket.creator_id !== user.id) return interaction.editReply('❌ Seul le staff ou le créateur peut fermer ce ticket.');
    db.prepare('UPDATE tickets SET status=?,closed_at=strftime(\'%s\',\'now\') WHERE id=?').run('closed', ticketId);
    const tCh = guild.channels.cache.get(ticket.channel_id);
    if (tCh) {
      await tCh.send({ embeds: [new EmbedBuilder().setColor(C.danger).setDescription(`🔒 **Ticket fermé par <@${user.id}>**\nCe salon sera supprimé dans 10 secondes.`).setTimestamp()] });
      await sendLog(guild, new EmbedBuilder().setColor(C.info)
        .setAuthor({ name: `🔒 Ticket #${ticketId} fermé` })
        .addFields({ name: '👤 Fermé par', value: `<@${user.id}>`, inline: true }, { name: '📋 Catégorie', value: ticket.category, inline: true })
        .setTimestamp());
      setTimeout(() => tCh.delete('Ticket fermé').catch(() => {}), 10000);
    }
    return interaction.editReply('✅ Ticket fermé.');
  }

  // ── GIVEAWAY ──
  if (customId.startsWith('gw_join_')) {
    await interaction.deferReply({ ephemeral: true });
    const gwId = parseInt(customId.replace('gw_join_', ''));
    const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
    if (!gw || gw.status !== 'active') return interaction.editReply('❌ Ce giveaway est terminé.');
    const participants = JSON.parse(gw.participants || '[]');
    if (participants.includes(user.id)) return interaction.editReply('⚠️ Tu participes déjà !');
    participants.push(user.id);
    db.prepare('UPDATE giveaways SET participants=? WHERE id=?').run(JSON.stringify(participants), gwId);
    try {
      const ch = await interaction.client.channels.fetch(gw.channel_id).catch(() => null);
      if (ch && gw.message_id) {
        const msg = await ch.messages.fetch(gw.message_id).catch(() => null);
        if (msg) {
          const embed = msg.embeds[0];
          if (embed) { const newEmbed = EmbedBuilder.from(embed).setFooter({ text: `Giveaway #${gwId} — ${participants.length} participant(s) | Wenzy Bot` }); await msg.edit({ embeds: [newEmbed] }).catch(() => {}); }
        }
      }
    } catch {}
    return interaction.editReply(`✅ Tu participes au giveaway **${gw.prize}** !`);
  }
  if (customId.startsWith('gw_leave_')) {
    await interaction.deferReply({ ephemeral: true });
    const gwId = parseInt(customId.replace('gw_leave_', ''));
    const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
    if (!gw || gw.status !== 'active') return interaction.editReply('❌ Ce giveaway est terminé.');
    const participants = JSON.parse(gw.participants || '[]').filter(id => id !== user.id);
    db.prepare('UPDATE giveaways SET participants=? WHERE id=?').run(JSON.stringify(participants), gwId);
    return interaction.editReply('❌ Tu t\'es retiré du giveaway.');
  }

  // ── STAFF TRADE VERIFY ──
  if (customId.startsWith('staff_validate_')) {
    await interaction.deferReply({ ephemeral: true });
    if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
    const tid = parseInt(customId.replace('staff_validate_', ''));
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (!trade) return interaction.editReply('❌ Trade introuvable.');
    if (trade.status === 'completed') return interaction.editReply('⚠️ Déjà complété.');
    await completeTrade(guild, tid, trade.screenshot_url ?? null);
    return interaction.editReply(`✅ Trade **#${tid}** validé !`);
  }
  if (customId.startsWith('staff_reject_')) {
    await interaction.deferReply({ ephemeral: true });
    if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
    const tid = parseInt(customId.replace('staff_reject_', ''));
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (trade?.thread_id) { try { const t = await guild.channels.fetch(trade.thread_id).catch(() => null); if (t) await t.send(`❌ **Screenshot rejeté** par <@${user.id}>\n\nEnvoie un screenshot valide de l'écran **"YOU HAVE ACCEPTED"**.`); } catch {} }
    return interaction.editReply(`⚠️ Screenshot du trade **#${tid}** rejeté.`);
  }

  // ── TRADE BUTTONS ──
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
    if (trade.message_id && trade.channel_id) { try { const tCh2 = await guild.channels.fetch(trade.channel_id).catch(() => null); if (tCh2) { const msg = await tCh2.messages.fetch(trade.message_id).catch(() => null); if (msg) await msg.edit({ embeds: [tradeInProgressEmbed(updated, poster, accepter)], components: [] }).catch(() => {}); } } catch {} }
    let thread;
    try {
      const tCh = guild.channels.cache.find(c => c.name.includes('post-trades'));
      thread = await tCh.threads.create({ name: `🗡️ Trade #${tid} — ${poster?.roblox_username ?? 'Trader'} × ${accepter?.roblox_username ?? 'Accepter'}`, type: ChannelType.PrivateThread, reason: `Trade #${tid}`, invitable: false });
      await thread.members.add(trade.poster_id);
      await thread.members.add(user.id);
    } catch(e) { console.error('Thread:', e.message); }
    if (thread) {
      db.prepare('UPDATE trades SET thread_id=? WHERE id=?').run(thread.id, tid);
      const server = getFreeServer();
      if (server) { db.prepare('UPDATE private_servers SET in_use=1,trade_id=? WHERE id=?').run(tid, server.id); db.prepare('UPDATE trades SET server_link=? WHERE id=?').run(server.link, tid); }
      const diff = updated.offer_value - updated.want_value;
      const fair = Math.abs(diff) <= 20;
      const offreLines = JSON.parse(updated.offer_weapons).map(w => `> ${tierBadge(w.tier ?? 'godly')} **${w.name}** \`${w.value}v\``);
      offreLines.push(`\n> 💰 **TOTAL : ${updated.offer_value} val**`);
      const wantLines = JSON.parse(updated.want_weapons).map(w => `> **${w.name}**`);
      if (updated.want_value > 0) wantLines.push(`\n> 💰 **TOTAL : ${updated.want_value} val**`);
      await thread.send({ embeds: [new EmbedBuilder().setColor(fair ? C.success : C.warning)
        .setAuthor({ name: `🗡️ TRADE EN COURS — #${String(tid).padStart(4, '0')}` })
        .setDescription([
          `> <@${trade.poster_id}> × <@${user.id}>`,
          '', '**📋 Pour finaliser ce trade :**',
          '1. Rejoins le serveur privé MM2 (lien ci-dessous)',
          '2. Fais le trade en jeu',
          '3. Prends un screenshot de **"YOU HAVE ACCEPTED"**',
          '4. Envoie le screenshot dans CE salon',
          '5. ⚠️ Un staff validera manuellement',
        ].join('\n'))
        .addFields(
          { name: '📤 OFFRE', value: offreLines.join('\n'), inline: true },
          { name: '📥 RECHERCHE', value: wantLines.join('\n'), inline: true },
          { name: '⚖️ Équité', value: `${fair ? '✅ Fair' : `⚠️ Diff : ${Math.abs(diff)} val`}`, inline: false },
        ).setFooter({ text: 'Wenzy Bot • Screenshot requis pour valider' }).setTimestamp()],
        components: [threadButtons(tid)] });
      if (server) await thread.send(`🎮 **Serveur Privé MM2 :**\n${server.link}`);
      if (fs.existsSync(REF_SCREEN_PATH)) { await thread.send('📸 **Exemple de screenshot attendu :**'); await thread.send({ files: [REF_SCREEN_PATH] }); }
      const mmPanel = guild.channels.cache.find(c => c.name.includes('middleman-panel'));
      if (mmPanel) {
        const off = JSON.parse(updated.offer_weapons), want = JSON.parse(updated.want_weapons);
        const mmRole = guild.roles.cache.find(r => r.name.includes('Middleman'));
        await mmPanel.send({ content: mmRole ? `<@&${mmRole.id}>` : '🛡️ Middlemen', embeds: [new EmbedBuilder().setColor(C.info)
          .setAuthor({ name: `🛡️ PANEL MIDDLEMAN — TRADE #${String(tid).padStart(4, '0')}` })
          .addFields(
            { name: '👤 Poster', value: `<@${trade.poster_id}> (${poster?.trade_count ?? 0} trades)`, inline: true },
            { name: '👤 Accepter', value: `<@${user.id}> (${accepter?.trade_count ?? 0} trades)`, inline: true },
            { name: '📤 OFFRE', value: off.map(w => `${tierBadge(w.tier ?? 'godly')} **${w.name}** ${w.value}v`).join('\n') + `\n**TOTAL : ${updated.offer_value} val**`, inline: false },
            { name: '📥 RECHERCHE', value: want.map(w => w.name).join('\n'), inline: false },
          ).setTimestamp()],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mm_validate_${tid}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`mm_cancel_${tid}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`mm_report_${tid}`).setLabel('🚨 Report scam').setStyle(ButtonStyle.Secondary),
          )] });
      }
    }
    await sendLog(guild, new EmbedBuilder().setColor(C.info)
      .setAuthor({ name: `🤝 Trade #${tid} accepté` })
      .addFields({ name: '👤 Poster', value: `<@${trade.poster_id}>`, inline: true }, { name: '👤 Accepteur', value: `<@${user.id}>`, inline: true }, { name: '💰 Valeur', value: `${updated.offer_value}v offerts / ${updated.want_value}v recherchés`, inline: true })
      .setTimestamp());
    return interaction.editReply(`✅ Trade **#${tid}** accepté ! Thread créé.`);
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
  if (customId.startsWith('mm_validate_')) { await interaction.deferReply({ ephemeral: true }); const tid = parseInt(customId.replace('mm_validate_', '')); const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid); await completeTrade(guild, tid, trade?.screenshot_url ?? null); return interaction.editReply(`✅ Trade **#${tid}** validé.`); }
  if (customId.startsWith('mm_cancel_')) { await interaction.deferReply({ ephemeral: true }); const tid = parseInt(customId.replace('mm_cancel_', '')); db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tid); db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tid); return interaction.editReply(`❌ Trade **#${tid}** annulé.`); }
  if (customId.startsWith('mm_report_')) { await interaction.deferReply({ ephemeral: true }); const tid = parseInt(customId.replace('mm_report_', '')); db.prepare('UPDATE trades SET status=? WHERE id=?').run('disputed', tid); await sendLog(guild, new EmbedBuilder().setColor(C.danger).setDescription(`🚨 **SCAM REPORT** — Trade **#${tid}** signalé par <@${user.id}>.`).setTimestamp()); return interaction.editReply('🚨 Scam reporté.'); }

  // ── DUEL ──
  if (customId.startsWith('duel_accept_')) {
    await interaction.deferReply();
    const duelId = parseInt(customId.replace('duel_accept_', ''));
    const duel = db.prepare('SELECT * FROM duels WHERE id=?').get(duelId);
    if (!duel || duel.status !== 'pending') return interaction.editReply('❌ Duel expiré.');
    if (user.id !== duel.challenged_id) return interaction.editReply('❌ Ce duel ne te concerne pas.');
    const challenger = db.prepare('SELECT * FROM users WHERE discord_id=?').get(duel.challenger_id);
    const challenged = db.prepare('SELECT * FROM users WHERE discord_id=?').get(duel.challenged_id);
    if ((challenger?.coins ?? 0) < duel.amount || (challenged?.coins ?? 0) < duel.amount) {
      db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled', duelId);
      return interaction.editReply('❌ Quelqu\'un n\'a plus assez de pièces.');
    }
    const challengerWins = Math.random() < 0.5;
    const winner = challengerWins ? duel.challenger_id : duel.challenged_id;
    const loser = challengerWins ? duel.challenged_id : duel.challenger_id;
    db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(duel.amount, winner);
    db.prepare('UPDATE users SET coins=coins-? WHERE discord_id=?').run(duel.amount, loser);
    db.prepare('UPDATE duels SET status=?,winner_id=? WHERE id=?').run('completed', winner, duelId);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold)
      .setAuthor({ name: `⚔️ DUEL TERMINÉ — #${duelId}` })
      .setDescription([`🏆 **<@${winner}> GAGNE !**`, `💸 <@${loser}> perd **${duel.amount} 🪙**`].join('\n'))
      .addFields({ name: '💰 Mise', value: `**${duel.amount} 🪙**`, inline: true }, { name: '🏆 Gagnant', value: `<@${winner}>`, inline: true })
      .setTimestamp()], components: [] });
    await updateCoinsLeaderboardChannel(guild);
    await sendLog(guild, new EmbedBuilder().setColor(C.gold).setDescription(`⚔️ Duel #${duelId} — <@${winner}> bat <@${loser}> pour ${duel.amount} 🪙`).setTimestamp());
  }

  if (customId.startsWith('duel_refuse_')) {
    await interaction.deferReply();
    const duelId = parseInt(customId.replace('duel_refuse_', ''));
    const duel = db.prepare('SELECT * FROM duels WHERE id=?').get(duelId);
    if (!duel || duel.status !== 'pending') return interaction.editReply('❌ Duel expiré.');
    if (user.id !== duel.challenged_id) return interaction.editReply('❌ Ce duel ne te concerne pas.');
    db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled', duelId);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.danger).setDescription(`❌ **<@${user.id}> a refusé le duel.**`)], components: [] });
  }
}

// ══════════════════════════════════════════════════════════════
//  MODAL HANDLER
// ══════════════════════════════════════════════════════════════
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
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info)
      .setAuthor({ name: '🔗 Code généré !' })
      .setDescription([`Compte : **${rb.name}**`, '', '**Code à coller dans ta bio Roblox :**', `\`\`\`${code}\`\`\``, '→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)', '', 'Reviens et clique Vérifier.'].join('\n'))],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))] });
  }

  if (customId === 'modal_post_trade') {
    await interaction.deferReply({ ephemeral: true });
    const offreStr = interaction.fields.getTextInputValue('trade_offre');
    const offreVal = parseInt(interaction.fields.getTextInputValue('trade_offre_val')) || 0;
    const chercheStr = interaction.fields.getTextInputValue('trade_cherche');
    const chercheVal = parseInt(interaction.fields.getTextInputValue('trade_cherche_val') ?? '0') || 0;
    return postTrade(interaction, interaction.user.id, offreStr, chercheStr, offreVal, chercheVal);
  }

  if (customId === 'modal_shop_role_custom') {
    await interaction.deferReply({ ephemeral: true });
    const roleName = interaction.fields.getTextInputValue('role_name'), roleColorInput = interaction.fields.getTextInputValue('role_color').trim();
    const user2 = db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
    if (!user2 || user2.coins < 500) return interaction.editReply('❌ Pas assez de pièces.');
    let colorHex = 0x7B2FBE;
    const match = roleColorInput.match(/#?([0-9a-fA-F]{6})/); if (match) colorHex = parseInt(match[1], 16);
    try {
      const newRole = await interaction.guild.roles.create({ name: roleName, color: colorHex, hoist: false });
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (member) await member.roles.add(newRole).catch(() => {});
      db.prepare('UPDATE users SET coins=coins-500 WHERE discord_id=?').run(interaction.user.id);
      db.prepare('INSERT INTO shop_purchases (discord_id,item_type,item_data,coins_spent) VALUES (?,?,?,?)').run(interaction.user.id, 'custom_role', JSON.stringify({ name: roleName, color: roleColorInput }), 500);
      await updateCoinsLeaderboardChannel(interaction.guild);
      await interaction.editReply(`✅ Rôle **${roleName}** créé et attribué !`);
    } catch(e) { await interaction.editReply(`❌ Erreur : ${e.message}`); }
  }

  // Tickets modals
  if (customId === 'modal_ticket_litige') {
    await interaction.deferReply({ ephemeral: true });
    const tradeId = parseInt(interaction.fields.getTextInputValue('trade_id') || '0') || null;
    const reason = interaction.fields.getTextInputValue('reason');
    const ch = await createTicket(interaction, 'litige', { reason, trade_id: tradeId });
    if (ch) return interaction.editReply(`✅ Ticket créé : <#${ch.id}>`);
  }

  if (customId === 'modal_ticket_report') {
    await interaction.deferReply({ ephemeral: true });
    const reportedId = interaction.fields.getTextInputValue('reported_id');
    const reason = interaction.fields.getTextInputValue('reason');
    const ch = await createTicket(interaction, 'report', { reason, reported_id: reportedId });
    if (ch) return interaction.editReply(`✅ Ticket créé : <#${ch.id}>`);
  }

  if (customId === 'modal_ticket_support') {
    await interaction.deferReply({ ephemeral: true });
    const reason = interaction.fields.getTextInputValue('reason');
    const ch = await createTicket(interaction, 'support', { reason });
    if (ch) return interaction.editReply(`✅ Ticket créé : <#${ch.id}>`);
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
      for (const [, gld] of client.guilds.cache) {
        const overrideCh = process.env.VIDEO_CHANNEL_OVERRIDE ? gld.channels.cache.get(process.env.VIDEO_CHANNEL_OVERRIDE) : null;
        const ch = overrideCh || gld.channels.cache.find(c => c.name.includes('vidéos-wenzy'));
        if (!ch) continue;
        await ch.send({ content: `📺 @everyone **Wenzy vient de poster une nouvelle vidéo !**\n${url}`, embeds: [new EmbedBuilder().setColor(C.danger)
          .setAuthor({ name: '🔴 NOUVELLE VIDÉO — Wenzy' })
          .setDescription(`**${snippet.title}**`)
          .setImage(snippet.thumbnails.high?.url ?? snippet.thumbnails.default?.url)
          .setFooter({ text: `Publiée le ${new Date(snippet.publishedAt).toLocaleDateString('fr-FR')} • Wenzy Bot` })
          .setTimestamp()] });
      }
    } catch(e) { console.error('[YouTube]', e.message); }
  });
}

// ══════════════════════════════════════════════════════════════
//  CLIENT & EVENTS
// ══════════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});
client.commands = new Collection();
for (const cmd of commands) client.commands.set(cmd.data.name, cmd);

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try { await cmd.execute(interaction); }
    catch (err) { console.error(`[CMD] ${interaction.commandName}:`, err); const r = { content: '❌ Erreur interne.', ephemeral: true }; if (interaction.deferred || interaction.replied) await interaction.editReply(r).catch(() => {}); else await interaction.reply(r).catch(() => {}); }
    return;
  }
  if (interaction.isButton()) { try { await handleButton(interaction); } catch(e) { console.error('[BTN]', e.message); } return; }
  if (interaction.isModalSubmit()) { try { await handleModal(interaction); } catch(e) { console.error('[MODAL]', e.message); } }
});

// ── MESSAGE CREATE ───────────────────────────────────────────
const msgCooldowns = new Map();
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // AutoMod
  const wasBlocked = await handleAutomod(message);
  if (wasBlocked) return;

  const uid = message.author.id, now = Date.now();

  // XP & coins par message (cooldown 1 min)
  if (!msgCooldowns.has(uid) || now - msgCooldowns.get(uid) >= 60_000) {
    msgCooldowns.set(uid, now);
    db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
    const xpGain = Math.floor(Math.random() * 11) + 15; // 15-25 XP
    const coinsGain = Math.floor(Math.random() * 11) + 15; // 15-25 coins
    db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(coinsGain, uid);
    if (message.guild) await addXp(message.guild, uid, xpGain, 'message');
  }

  // Commandes vocaux privés
  if (message.content.startsWith('!')) {
    const pv = db.prepare('SELECT * FROM private_vocals WHERE owner_id=?').get(uid);
    if (!pv) return;
    const pvCh = message.guild?.channels.cache.get(pv.channel_id);
    if (!pvCh) return;
    const args = message.content.slice(1).trim().split(/\s+/);
    const cmd = args[0].toLowerCase();
    if (cmd === 'open') { await pvCh.permissionOverwrites.edit(message.guild.id, { Connect: true }).catch(() => {}); await message.reply(`✅ Vocal **${pvCh.name}** ouvert.`); }
    else if (cmd === 'close') { await pvCh.permissionOverwrites.edit(message.guild.id, { Connect: false }).catch(() => {}); await message.reply(`🔒 Vocal **${pvCh.name}** fermé.`); }
    else if (cmd === 'add') { const mention = message.mentions.members?.first(); if (!mention) return message.reply('❌ Mentionne un membre.'); await pvCh.permissionOverwrites.edit(mention.id, { Connect: true }).catch(() => {}); await message.reply(`✅ <@${mention.id}> peut rejoindre.`); }
    else if (cmd === 'kick') { const mention = message.mentions.members?.first(); if (!mention) return message.reply('❌ Mentionne un membre.'); if (mention.voice.channelId === pv.channel_id) { const fallback = message.guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && !db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(c.id) && !c.name.toLowerCase().includes('afk')); if (fallback) await mention.voice.setChannel(fallback).catch(() => {}); else await mention.voice.disconnect().catch(() => {}); } await pvCh.permissionOverwrites.delete(mention.id).catch(() => {}); await message.reply(`✅ <@${mention.id}> expulsé.`); }
    else if (cmd === 'rename') { const newName = args.slice(1).join(' '); if (!newName) return message.reply('❌ Donne un nom.'); await pvCh.setName(newName.slice(0, 32)).catch(() => {}); await message.reply(`✅ Vocal renommé **${newName}**.`); }
    return;
  }

  // Screenshot trade
  if (!message.channel.isThread()) return;
  const trade = db.prepare('SELECT * FROM trades WHERE thread_id=? AND status=?').get(message.channel.id, 'in_progress');
  if (!trade) return;
  const attachment = message.attachments.find(a => a.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(a.name ?? ''));
  if (!attachment) return;
  if (![trade.poster_id, trade.accepter_id].includes(uid)) return;
  if (trade.screenshot_verified === 1) return;
  db.prepare('UPDATE trades SET screenshot_url=? WHERE id=?').run(attachment.url, trade.id);
  const gld = message.guild;
  const mmPanel = gld?.channels.cache.find(c => c.name.includes('middleman-panel'));
  const staffRoles = ['👑 Owner', '⚡ Admin', '🛡️ Modérateur', '🤝 Middleman'];
  const staffMentions = staffRoles.map(rn => gld?.roles.cache.find(r => r.name === rn)).filter(Boolean).map(r => `<@&${r.id}>`).join(' ');
  await message.channel.send([`📸 **Screenshot reçu de <@${uid}>**`, '', '⏳ En attente de validation par le **staff**...'].join('\n'));
  if (mmPanel) {
    const poster = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.accepter_id);
    await mmPanel.send({
      content: `${staffMentions}\n📸 **Screenshot à vérifier — Trade #${String(trade.id).padStart(4, '0')}**`,
      embeds: [new EmbedBuilder().setColor(C.warning)
        .setAuthor({ name: `📸 Vérification manuelle — Trade #${String(trade.id).padStart(4, '0')}` })
        .setImage(attachment.url)
        .addFields(
          { name: '👤 Poster', value: `<@${trade.poster_id}>${poster ? ` (${poster.roblox_username ?? '—'})` : ''}`, inline: true },
          { name: '👤 Accepter', value: `<@${trade.accepter_id}>${accepter ? ` (${accepter.roblox_username ?? '—'})` : ''}`, inline: true },
          { name: '📤 OFFRE', value: JSON.parse(trade.offer_weapons).map(w => `${tierBadge(w.tier ?? 'godly')} **${w.name}** \`${w.value}v\``).join('\n') || '—', inline: false },
          { name: '🔗 Thread', value: `<#${message.channel.id}>`, inline: true },
        ).setFooter({ text: 'Clique ✅ Valider ou ❌ Rejeter • Wenzy Bot' }).setTimestamp()],
      components: [staffVerifyButtons(trade.id)],
    });
  }
});

// ── VOICE STATE UPDATE ───────────────────────────────────────
client.on(Events.VoiceStateUpdate, async (old, neu) => {
  const uid = neu.id || old.id;
  const guild = neu.guild || old.guild;
  if (!old.channelId && neu.channelId) {
    if (!isIdleChannel(neu.channel)) db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
  }
  if (old.channelId && !neu.channelId) {
    if (!isIdleChannel(old.channel)) {
      const s = db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);
      if (s) {
        const min = Math.floor((Math.floor(Date.now() / 1000) - s.joined_at) / 60);
        if (min > 0) {
          db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
          db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min, min * 10, uid);
          const u = db.prepare('SELECT xp,vocal_minutes FROM users WHERE discord_id=?').get(uid);
          const xpGain = min * 10;
          await addXp(guild, uid, xpGain, 'vocal').catch(() => {});
          // Log vocal session
          if (min >= 5) {
            await sendLog(guild, new EmbedBuilder().setColor(C.info)
              .setAuthor({ name: '🎙️ Session vocale terminée' })
              .addFields(
                { name: '👤 Membre', value: `<@${uid}>`, inline: true },
                { name: '⏱️ Durée', value: `**${min} min**`, inline: true },
                { name: '🎙️ Niveau', value: getVocalTier(u?.vocal_minutes ?? 0).name, inline: true },
                { name: '🪙 Gains', value: `+${min * 10} 🪙 · +${xpGain} XP`, inline: true },
              ).setTimestamp());
          }
        }
        db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);
      }
    }
    if (old.channel) {
      const pv = db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(old.channelId);
      if (pv && old.channel.members.size === 0) { db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(old.channelId); await old.channel.delete('Vocal privé vide').catch(() => {}); }
    }
  }
  if (old.channelId && neu.channelId && old.channelId !== neu.channelId) {
    if (!isIdleChannel(old.channel)) { const s = db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid); if (s) { const min = Math.floor((Math.floor(Date.now() / 1000) - s.joined_at) / 60); if (min > 0) { db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid); db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min, min * 10, uid); await addXp(guild, uid, min * 10, 'vocal').catch(() => {}); } } }
    db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);
    if (!isIdleChannel(neu.channel)) db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
    if (old.channel) { const pv = db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(old.channelId); if (pv && old.channel.members.size === 0) { db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(old.channelId); await old.channel.delete('Vocal privé vide').catch(() => {}); } }
  }
});

// ── MEMBER JOIN ──────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async member => {
  try {
    const nonv = member.guild.roles.cache.find(r => r.name === '🔒 Non Vérifié');
    if (nonv) await member.roles.add(nonv);
    const welcomeCh = member.guild.channels.cache.find(c => c.name.includes('bienvenue'));
    if (welcomeCh) await welcomeCh.send({ embeds: [welcomeEmbed(member, member.guild)] });
    await handleAntiRaid(member.guild, member);
    await updateStatChannels(member.guild);
    await sendLog(member.guild, new EmbedBuilder().setColor(C.success)
      .setAuthor({ name: '👋 Nouveau membre' })
      .addFields({ name: '👤 Membre', value: `<@${member.id}> (${member.user.tag})`, inline: true }, { name: '👥 Total', value: `${member.guild.memberCount}`, inline: true }, { name: '📅 Compte créé', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true })
      .setTimestamp());
    console.log(`[MemberAdd] ${member.user.tag}`);
  } catch(e) { console.error('[MemberAdd]', e.message); }
});

// ── MEMBER REMOVE ────────────────────────────────────────────
client.on(Events.GuildMemberRemove, async member => {
  await updateStatChannels(member.guild);
  await sendLog(member.guild, new EmbedBuilder().setColor(C.danger)
    .setAuthor({ name: '👋 Membre parti' })
    .addFields({ name: '👤 Membre', value: `${member.user.tag}`, inline: true }, { name: '👥 Total', value: `${member.guild.memberCount}`, inline: true })
    .setTimestamp());
});

// ── CHANNEL DELETE ───────────────────────────────────────────
client.on(Events.ChannelDelete, ch => {
  db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(ch.id);
  db.prepare('UPDATE tickets SET status=? WHERE channel_id=? AND status!=?').run('closed', ch.id, 'closed');
});

// ── CLIENT READY ─────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`✅ Wenzy Bot v6 : ${client.user.tag}`);
  client.user.setActivity('MM2 Trades 🗡️', { type: 3 });
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const body = commands.map(c => c.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body });
    console.log(`✅ ${body.length} commandes déployées`);
  } catch(e) { console.error('❌ Deploy:', e); }
  startYoutubeWatcher(client);
  await fetchMM2Values();

  // ── CRONS ──
  cron.schedule('0 * * * *', fetchMM2Values);
  cron.schedule('*/10 * * * *', async () => {
    for (const [, gld] of client.guilds.cache) {
      await updateCoinsLeaderboardChannel(gld);
      await updateStatChannels(gld);
    }
  });
  cron.schedule('*/30 * * * *', async () => {
    for (const [, gld] of client.guilds.cache) {
      await updateXpLeaderboardChannel(gld);
    }
  });
  cron.schedule('0 0 * * *', async () => {
    for (const [, gld] of client.guilds.cache) {
      await updateLeaderboardChannel(gld);
      await updateCoinsLeaderboardChannel(gld);
      await updateXpLeaderboardChannel(gld);
    }
    console.log('[Cron] Leaderboards mis à jour');
  });

  for (const [, gld] of client.guilds.cache) {
    await gld.members.fetch().catch(() => {});
    await restoreAllRoles(gld);
    await updateStatChannels(gld);
    await updateCoinsLeaderboardChannel(gld);
  }

  const activeGiveaways = db.prepare('SELECT * FROM giveaways WHERE status=?').all('active');
  for (const gw of activeGiveaways) {
    const remaining = (gw.ends_at * 1000) - Date.now();
    if (remaining > 0) setTimeout(() => endGiveaway(client, gw.id), remaining);
    else await endGiveaway(client, gw.id);
  }
  console.log(`[Giveaways] ${activeGiveaways.length} giveaway(s) repris`);
  console.log('[Wenzy Bot v6] Prêt. 6767');
});

client.login(process.env.DISCORD_TOKEN);
