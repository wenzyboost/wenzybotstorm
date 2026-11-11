// ═══════════════════════════════════════════════════════════════
//  WENZY BOT v7 — bot.js
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
    discord_id TEXT PRIMARY KEY,
    roblox_id TEXT, roblox_username TEXT, roblox_avatar TEXT,
    verify_code TEXT, verified INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0, xp INTEGER DEFAULT 0,
    vocal_minutes INTEGER DEFAULT 0,
    trade_count INTEGER DEFAULT 0, vouch_count INTEGER DEFAULT 0,
    report_count INTEGER DEFAULT 0, rank TEXT DEFAULT 'new',
    daily_streak INTEGER DEFAULT 0, last_daily INTEGER DEFAULT 0,
    last_work INTEGER DEFAULT 0, warn_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL, weapon_name TEXT NOT NULL,
    weapon_value INTEGER DEFAULT 0, weapon_tier TEXT DEFAULT 'godly',
    added_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poster_id TEXT NOT NULL, accepter_id TEXT,
    offer_weapons TEXT NOT NULL, want_weapons TEXT NOT NULL,
    offer_value INTEGER DEFAULT 0, want_value INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open',
    thread_id TEXT, message_id TEXT, channel_id TEXT,
    server_link TEXT, middleman_id TEXT,
    screenshot_url TEXT, screenshot_verified INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')), completed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS vouches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL, to_id TEXT NOT NULL,
    trade_id INTEGER, comment TEXT, rating INTEGER DEFAULT 5,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS private_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link TEXT NOT NULL UNIQUE, in_use INTEGER DEFAULT 0,
    trade_id INTEGER, added_by TEXT
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id TEXT NOT NULL, reported_id TEXT NOT NULL,
    trade_id INTEGER, reason TEXT, status TEXT DEFAULT 'open',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS vocal_sessions (
    discord_id TEXT PRIMARY KEY, joined_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS youtube_last (
    id INTEGER PRIMARY KEY CHECK (id=1), video_id TEXT, checked_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS shop_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL, item_type TEXT NOT NULL,
    item_data TEXT, coins_spent INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS shop_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, description TEXT,
    price INTEGER NOT NULL, item_type TEXT NOT NULL,
    emoji TEXT DEFAULT '🎁', active INTEGER DEFAULT 1,
    added_by TEXT, created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL, message_id TEXT,
    prize TEXT NOT NULL, winners_count INTEGER DEFAULT 1,
    host_id TEXT NOT NULL, ends_at INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    participants TEXT DEFAULT '[]', winners TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS private_vocals (
    channel_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT UNIQUE, creator_id TEXT NOT NULL,
    category TEXT NOT NULL, status TEXT DEFAULT 'open',
    claimed_by TEXT, trade_id INTEGER,
    reported_id TEXT, reason TEXT,
    rating INTEGER, closed_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS ticket_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    emoji TEXT DEFAULT '🎫',
    description TEXT,
    staff_only INTEGER DEFAULT 0,
    color INTEGER DEFAULT 5765669,
    active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL, moderator_id TEXT NOT NULL,
    reason TEXT, created_at INTEGER DEFAULT (strftime('%s','now'))
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
  CREATE TABLE IF NOT EXISTS duels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id TEXT NOT NULL, challenged_id TEXT NOT NULL,
    amount INTEGER NOT NULL, status TEXT DEFAULT 'pending',
    winner_id TEXT, channel_id TEXT, message_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  INSERT OR IGNORE INTO youtube_last (id,checked_at) VALUES (1,0);
`);

// Migrations
const migs = [
  'ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN vocal_minutes INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN daily_streak INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_daily INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_work INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN warn_count INTEGER DEFAULT 0',
];
for (const m of migs) { try { db.exec(m); } catch {} }

// Default ticket categories
const defCats = [
  ['🚨 Report',       '🚨', 'Signaler un scammer ou comportement toxique', 0, 0xED4245],
  ['🎧 Support',      '🎧', 'Aide générale, questions, problèmes techniques', 0, 0x5865F2],
  ['🤝 Middleman',    '🤝', 'Demander un middleman pour sécuriser ton trade', 0, 0x57F287],
  ['⚔️ Arnaque',      '⚔️', 'Tu t\'es fait arnaquer lors d\'un trade', 0, 0xFEE75C],
  ['🎁 Giveaway',     '🎁', 'Problème avec un giveaway ou réclamer un prix', 0, 0xF0B232],
  ['⚙️ Staff',        '⚙️', 'Contact staff (réservé staff)', 1, 0x9B59B6],
];
for (const [name, emoji, description, staff_only, color] of defCats) {
  db.prepare('INSERT OR IGNORE INTO ticket_categories (name,emoji,description,staff_only,color) VALUES (?,?,?,?,?)').run(name, emoji, description, staff_only, color);
}

// Default shop items
const defShop = [
  ['Rôle couleur custom','Rôle avec nom + couleur de ton choix',500,'custom_role','🎨'],
  ['Rôle VIP','Accès VIP + rôle hoisted visible',1000,'vip_role','👑'],
  ['Badge Elite Trader','Statut prestige + rôle 💎',10000,'elite_badge','🏆'],
  ['Double XP 24h','XP ×2 pendant 24h',2000,'double_xp','⚡'],
];
for (const [n,d,p,t,e] of defShop) {
  db.prepare('INSERT OR IGNORE INTO shop_items (name,description,price,item_type,emoji) VALUES (?,?,?,?,?)').run(n,d,p,t,e);
}

// ── COULEURS ─────────────────────────────────────────────────
const C = {
  primary: 0x5865F2, success: 0x57F287, warning: 0xFEE75C,
  danger: 0xED4245, info: 0x5DADE2, gold: 0xF0B232,
  purple: 0x9B59B6, dark: 0x2B2D31, teal: 0x1ABC9C,
};

// ── XP TIERS — DraftBot style ─────────────────────────────────
// Chaque palier = 1 rôle distinct attribué automatiquement
const XP_TIERS = [
  { lvl: 1,  xp:     0, name: '⬡ Niveau 1',   color: 0x95A5A6 },
  { lvl: 2,  xp:   350, name: '⬡ Niveau 2',   color: 0x2ECC71 },
  { lvl: 3,  xp:   800, name: '⬡ Niveau 3',   color: 0x27AE60 },
  { lvl: 4,  xp:  1500, name: '⬡ Niveau 4',   color: 0x3498DB },
  { lvl: 5,  xp:  2500, name: '⬡ Niveau 5',   color: 0x2980B9 },
  { lvl: 6,  xp:  4000, name: '⬢ Niveau 6',   color: 0x9B59B6 },
  { lvl: 7,  xp:  6000, name: '⬢ Niveau 7',   color: 0x8E44AD },
  { lvl: 8,  xp:  9000, name: '⬢ Niveau 8',   color: 0xF39C12 },
  { lvl: 9,  xp: 13000, name: '⬢ Niveau 9',   color: 0xE67E22 },
  { lvl: 10, xp: 18000, name: '★ Niveau 10',  color: 0xE74C3C },
  { lvl: 11, xp: 25000, name: '★ Niveau 11',  color: 0xC0392B },
  { lvl: 12, xp: 35000, name: '✦ Niveau 12',  color: 0xF1C40F },
  { lvl: 13, xp: 48000, name: '✦ Niveau 13',  color: 0xD4AC0D },
  { lvl: 14, xp: 65000, name: '✦ Niveau 14',  color: 0xA93226 },
  { lvl: 15, xp: 90000, name: '👑 Niveau 15',  color: 0xFFD700 },
];

function getXpTier(xp) {
  let t = XP_TIERS[0];
  for (const tier of XP_TIERS) { if (xp >= tier.xp) t = tier; }
  return t;
}
function getNextXpTier(xp) {
  for (const t of XP_TIERS) { if (xp < t.xp) return t; }
  return null;
}
function xpBar(xp, len = 14) {
  const cur = getXpTier(xp), next = getNextXpTier(xp);
  if (!next) return `${'█'.repeat(len)} MAX ✦`;
  const pct = (xp - cur.xp) / (next.xp - cur.xp);
  const filled = Math.round(pct * len);
  const pctLabel = Math.round(pct * 100);
  return `${'█'.repeat(filled)}${'░'.repeat(len - filled)} ${pctLabel}%`;
}
function coinsBar(coins, max = 5000, len = 12) {
  const pct = Math.min(coins / max, 1);
  const f = Math.round(pct * len);
  return `${'█'.repeat(f)}${'░'.repeat(len - f)} ${coins.toLocaleString('fr-FR')} 🪙`;
}

// ── VOCAL TIERS ───────────────────────────────────────────────
const VOCAL_TIERS = [
  { min:     0, name: '🎙️ Vocal I',   color: 0x95A5A6 },
  { min:    60, name: '🎙️ Vocal II',  color: 0x7F8C8D },
  { min:   300, name: '🎙️ Vocal III', color: 0x2ECC71 },
  { min:   800, name: '🎙️ Vocal IV',  color: 0x27AE60 },
  { min:  2000, name: '🎙️ Vocal V',   color: 0x3498DB },
  { min:  5000, name: '🎙️ Vocal VI',  color: 0x9B59B6 },
  { min: 12000, name: '🎙️ Vocal VII', color: 0xF1C40F },
];
function getVocalTier(min) {
  let t = VOCAL_TIERS[0];
  for (const vt of VOCAL_TIERS) { if (min >= vt.min) t = vt; }
  return t;
}

// ── TRADE RANK ────────────────────────────────────────────────
function getRank(n) {
  if (n >= 50) return 'elite';
  if (n >= 20) return 'trusted';
  if (n >= 5)  return 'confirmed';
  return 'new';
}
function getRankLabel(r) {
  return { new:'🆕 Nouveau', confirmed:'✅ Confirmé', trusted:'⭐ Fiable', elite:'👑 Elite' }[r] ?? '🆕 Nouveau';
}
function getRankColor(r) {
  return { new: C.dark, confirmed: C.success, trusted: C.gold, elite: C.purple }[r] ?? C.dark;
}

function tierBadge(tier) {
  return { chroma:'🔴 Chroma', ancient:'🟤 Ancient', godly:'⚪ Godly', legendary:'🟡 Legendary', epic:'🟣 Epic', rare:'🔵 Rare' }[tier] ?? '⚪ Godly';
}

function hasStaffPerm(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    ['👑 Owner','⚡ Admin','🛡️ Modérateur','🤝 Middleman'].some(n => member.roles.cache.find(r => r.name === n));
}

function isIdleChannel(ch) {
  if (!ch) return false;
  const n = ch.name.toLowerCase();
  return n.includes('afk') || n.includes('sleep');
}

// ── LOG ───────────────────────────────────────────────────────
async function sendLog(guild, embed) {
  const ch = guild.channels.cache.find(c => c.name.includes('logs-détaillés') || c.name.includes('logs'));
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

// ══════════════════════════════════════════════════════════════
//  EMBEDS
// ══════════════════════════════════════════════════════════════

function profileEmbed(user, inv, discordUser) {
  const xpTier  = getXpTier(user.xp ?? 0);
  const nextTier = getNextXpTier(user.xp ?? 0);
  const vocTier  = getVocalTier(user.vocal_minutes ?? 0);
  const bar  = xpBar(user.xp ?? 0);
  const nextLabel = nextTier
    ? `→ **${nextTier.name}** à ${nextTier.xp.toLocaleString('fr-FR')} XP`
    : '🏆 **MAX LEVEL**';
  const topInv = [...inv].sort((a, b) => b.weapon_value - a.weapon_value).slice(0, 6);

  return new EmbedBuilder()
    .setColor(xpTier.color)
    .setAuthor({ name: `${user.roblox_username ?? 'Non lié'} — Profil MM2`, iconURL: user.roblox_avatar ?? discordUser?.displayAvatarURL() ?? null })
    .setThumbnail(user.roblox_avatar ?? discordUser?.displayAvatarURL() ?? null)
    .addFields(
      { name: '🎮 Roblox', value: user.verified ? `✅ **${user.roblox_username}**` : '❌ Non lié', inline: true },
      { name: '🏆 Rang trade', value: getRankLabel(user.rank), inline: true },
      { name: '⚠️ Warns', value: `${user.warn_count ?? 0}`, inline: true },
      { name: '📊 Stats', value: `✅ **${user.trade_count}** trades\n💬 **${user.vouch_count}** vouches\n🚨 **${user.report_count}** reports`, inline: true },
      { name: `${xpTier.name}`, value: `\`[${bar}]\`\n**${(user.xp ?? 0).toLocaleString('fr-FR')}** XP · ${nextLabel}`, inline: false },
      { name: '🎙️ Vocal', value: `${vocTier.name} — **${user.vocal_minutes ?? 0}** min`, inline: true },
      { name: '🪙 Pièces', value: `\`[${coinsBar(user.coins ?? 0)}]\``, inline: false },
      { name: '🔥 Streak daily', value: `**${user.daily_streak ?? 0}** jours`, inline: true },
      { name: `📦 Inventaire (${inv.length})`, value: topInv.length ? topInv.map(w => `${tierBadge(w.weapon_tier)} **${w.weapon_name}** \`${w.weapon_value}v\``).join('\n') : '— Vide', inline: false },
    )
    .setFooter({ text: `Wenzy Bot • Membre depuis ${new Date(user.created_at * 1000).toLocaleDateString('fr-FR')}` })
    .setTimestamp();
}

function tradeEmbed(trade, poster) {
  const off  = JSON.parse(trade.offer_weapons);
  const want = JSON.parse(trade.want_weapons);
  const diff = trade.offer_value - trade.want_value;
  const fair = Math.abs(diff) <= 20;
  const pct  = trade.offer_value > 0
    ? Math.min(100, Math.round((1 - Math.abs(diff) / Math.max(trade.offer_value, trade.want_value)) * 100))
    : 100;
  const fairBar = `${'█'.repeat(Math.round(pct / 10))}${'░'.repeat(10 - Math.round(pct / 10))} ${pct}%`;

  return new EmbedBuilder()
    .setColor(fair ? C.success : C.warning)
    .setAuthor({ name: `🗡️ TRADE #${String(trade.id).padStart(4,'0')}`, iconURL: poster?.roblox_avatar ?? null })
    .setThumbnail(poster?.roblox_avatar ?? null)
    .addFields(
      { name: '👤 Trader', value: `<@${trade.poster_id}>${poster?.verified ? ' ✅' : ''}\n${getRankLabel(poster?.rank ?? 'new')}\n📊 ${poster?.trade_count ?? 0} trades`, inline: true },
      { name: '📤 OFFRE', value: off.map(w => `> ${tierBadge(w.tier ?? 'godly')} **${w.name}** \`${w.value}v\``).join('\n') + `\n> 💰 **${trade.offer_value} val**` || '—', inline: true },
      { name: '📥 RECHERCHE', value: want.map(w => `> ${tierBadge(w.tier ?? 'godly')} **${w.name}**`).join('\n') + (trade.want_value > 0 ? `\n> 💰 **${trade.want_value} val**` : '') || '—', inline: true },
      { name: '⚖️ Équité', value: `${fair ? '✅ Fair' : diff > 0 ? '📈 Avantageux' : '📉 Unfair'}\n\`[${fairBar}]\``, inline: false },
    )
    .setFooter({ text: `Wenzy Bot • ${new Date(trade.created_at * 1000).toLocaleDateString('fr-FR')}` })
    .setTimestamp();
}

function tradeCompletedEmbed(trade) {
  const off  = JSON.parse(trade.offer_weapons);
  const want = JSON.parse(trade.want_weapons);
  return new EmbedBuilder()
    .setColor(C.success)
    .setAuthor({ name: `✅ TRADE #${String(trade.id).padStart(4,'0')} — COMPLÉTÉ 🎉` })
    .setDescription(`> <@${trade.poster_id}> × <@${trade.accepter_id}>\n> Complété <t:${Math.floor(Date.now()/1000)}:R>`)
    .addFields(
      { name: '📤 OFFRE', value: off.map(w => `• **${w.name}** \`${w.value}v\``).join('\n') + `\n**TOTAL : ${trade.offer_value} val**` || '—', inline: true },
      { name: '📥 RECHERCHE', value: want.map(w => `• **${w.name}**`).join('\n') || '—', inline: true },
      { name: '🎁 Récompenses', value: `+50 🪙 chacun · +1 vouch · +50 ✨ XP`, inline: false },
    )
    .setFooter({ text: 'Wenzy Bot • MM2 Trading' })
    .setTimestamp();
}

function welcomeEmbed(member, guild) {
  const verified = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get()?.c ?? 0;
  const trades   = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed')?.c ?? 0;
  return new EmbedBuilder()
    .setColor(C.primary)
    .setAuthor({ name: `👋 Bienvenue sur ${guild.name} !`, iconURL: guild.iconURL() ?? null })
    .setDescription([
      `> Salut <@${member.id}> ! Tu es le **membre #${guild.memberCount}** 🎉`,
      '',
      '**🔑 Pour accéder au serveur :**',
      '→ Va dans <#VERIF_PH> et lie ton compte Roblox',
      '',
      '**📋 Ce que tu peux faire :**',
      '🗡️ Trader des armes MM2 en sécurité',
      '🛡️ Utiliser un middleman pour les gros trades',
      '🏆 Grimper dans les classements',
      '🎁 Participer aux giveaways',
    ].join('\n'))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👥 Membres', value: `**${guild.memberCount}**`, inline: true },
      { name: '✅ Vérifiés', value: `**${verified}**`, inline: true },
      { name: '🗡️ Trades', value: `**${trades}**`, inline: true },
    )
    .setFooter({ text: `Wenzy Bot v7 • ${guild.name}` })
    .setTimestamp();
}

function leaderboardEmbed(top, type = 'trades') {
  const medals = ['🥇', '🥈', '🥉'];
  const title  = type === 'coins' ? '🪙 Classement Pièces' : type === 'xp' ? '✨ Classement XP' : '🏆 Top Traders';
  const lines  = top.map((u, i) => {
    const m = medals[i] ?? `\`#${i+1}\``;
    if (type === 'coins') return `${m} <@${u.discord_id}> — **${(u.coins ?? 0).toLocaleString('fr-FR')} 🪙**`;
    if (type === 'xp')    return `${m} <@${u.discord_id}> — **${(u.xp ?? 0).toLocaleString('fr-FR')} XP** · ${getXpTier(u.xp ?? 0).name}`;
    return `${m} <@${u.discord_id}> — ✅ **${u.trade_count}** trades · 💬 ${u.vouch_count} vouches`;
  });
  return new EmbedBuilder()
    .setColor(C.gold)
    .setAuthor({ name: title })
    .setDescription(lines.join('\n') || '_Aucun résultat_')
    .setFooter({ text: 'Wenzy Bot • Mis à jour automatiquement' })
    .setTimestamp();
}

function ticketEmbed(ticket) {
  const cat = db.prepare('SELECT * FROM ticket_categories WHERE name=?').get(ticket.category);
  return new EmbedBuilder()
    .setColor(cat?.color ?? C.info)
    .setAuthor({ name: `${cat?.emoji ?? '🎫'} ${ticket.category} — Ticket #${String(ticket.id).padStart(4,'0')}` })
    .setDescription([
      `> Créé par <@${ticket.creator_id}> <t:${ticket.created_at}:R>`,
      ticket.reason       ? `\n**📝 Raison :** ${ticket.reason}` : '',
      ticket.reported_id  ? `**⚠️ Signalé :** <@${ticket.reported_id}>` : '',
      ticket.trade_id     ? `**🗡️ Trade :** #${ticket.trade_id}` : '',
    ].filter(Boolean).join('\n'))
    .addFields(
      { name: '📋 Statut', value: ticket.status === 'open' ? '🟢 Ouvert' : ticket.status === 'claimed' ? `🟡 En charge : <@${ticket.claimed_by}>` : '🔴 Fermé', inline: true },
      { name: '📅 Créé', value: `<t:${ticket.created_at}:f>`, inline: true },
    )
    .setFooter({ text: 'Wenzy Bot • Système de tickets' })
    .setTimestamp();
}

function automodLogEmbed(action, user, reason, detail = '') {
  const colors  = { warn: C.warning, mute: C.danger, kick: C.danger, delete: C.info };
  const labels  = { warn: '⚠️ Warn', mute: '🔇 Mute Auto', kick: '🦶 Kick Auto', delete: '🗑️ Suppression' };
  return new EmbedBuilder()
    .setColor(colors[action] ?? C.warning)
    .setAuthor({ name: `🛡️ AutoMod — ${labels[action] ?? action}` })
    .addFields(
      { name: '👤 Membre', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: '📋 Raison', value: reason, inline: true },
      { name: '⏰ Date', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
      ...(detail ? [{ name: '📄 Détail', value: detail.slice(0, 500) }] : []),
    )
    .setFooter({ text: 'Wenzy Bot • AutoMod v7' })
    .setTimestamp();
}

function xpLevelUpEmbed(uid, oldTier, newTier, totalXp) {
  return new EmbedBuilder()
    .setColor(newTier.color)
    .setAuthor({ name: `⬆️ Level Up ! ${oldTier.name} → ${newTier.name}` })
    .setDescription(`<@${uid}> a atteint **${newTier.name}** !`)
    .addFields(
      { name: '✨ XP Total', value: `**${totalXp.toLocaleString('fr-FR')}** XP`, inline: true },
      { name: '🎯 Prochain', value: getNextXpTier(totalXp) ? `${getNextXpTier(totalXp).name}` : 'MAX', inline: true },
    )
    .setFooter({ text: 'Wenzy Bot • Système XP' })
    .setTimestamp();
}

// ── BUTTONS ───────────────────────────────────────────────────
function tradeButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_accept_${id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
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
    new ButtonBuilder().setCustomId(`staff_validate_${tradeId}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`staff_reject_${tradeId}`).setLabel('❌ Rejeter screenshot').setStyle(ButtonStyle.Danger),
  );
}
function ticketActionButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('🤝 Prendre en charge').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
  );
}

// ── HELPERS ───────────────────────────────────────────────────
function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'WENZY-';
  for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
async function searchRobloxUser(u) {
  const r = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [u], excludeBannedUsers: true });
  return r.data.data?.[0] ?? null;
}
async function getRobloxDescription(id) {
  const r = await axios.get(`https://users.roblox.com/v1/users/${id}`);
  return r.data.description ?? '';
}
async function getRobloxAvatar(id) {
  try {
    const r = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`);
    return r.data.data?.[0]?.imageUrl ?? null;
  } catch { return null; }
}
function parseWeapons(s) { return s.split(',').map(x => x.trim()).filter(Boolean); }
function getFreeServer() { return db.prepare('SELECT * FROM private_servers WHERE in_use=0 LIMIT 1').get(); }

// ── XP SYSTEM ─────────────────────────────────────────────────
const msgCooldowns = new Map();

async function applyXpRoles(guild, member, xp, vocalMin) {
  try {
    const msgTier = getXpTier(xp);
    const vocTier = getVocalTier(vocalMin);

    // Retire anciens rôles XP
    for (const t of XP_TIERS) {
      if (t.name === msgTier.name) continue;
      const r = guild.roles.cache.find(x => x.name === t.name);
      if (r && member.roles.cache.has(r.id)) await member.roles.remove(r).catch(() => {});
    }
    // Ajoute le bon rôle XP
    let targetR = guild.roles.cache.find(x => x.name === msgTier.name);
    if (!targetR) targetR = await guild.roles.create({ name: msgTier.name, color: msgTier.color, hoist: false }).catch(() => null);
    if (targetR && !member.roles.cache.has(targetR.id)) await member.roles.add(targetR).catch(() => {});

    // Vocal
    for (const t of VOCAL_TIERS) {
      if (t.name === vocTier.name) continue;
      const r = guild.roles.cache.find(x => x.name === t.name);
      if (r && member.roles.cache.has(r.id)) await member.roles.remove(r).catch(() => {});
    }
    let targetV = guild.roles.cache.find(x => x.name === vocTier.name);
    if (!targetV) targetV = await guild.roles.create({ name: vocTier.name, color: vocTier.color, hoist: false }).catch(() => null);
    if (targetV && !member.roles.cache.has(targetV.id)) await member.roles.add(targetV).catch(() => {});
  } catch (e) { console.error('[XPRoles]', e.message); }
}

async function addXp(guild, discordId, amount, source = 'message') {
  db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(discordId);
  const before = db.prepare('SELECT xp FROM users WHERE discord_id=?').get(discordId);
  const oldTier = getXpTier(before?.xp ?? 0);

  db.prepare('UPDATE users SET xp=xp+? WHERE discord_id=?').run(amount, discordId);
  const after = db.prepare('SELECT * FROM users WHERE discord_id=?').get(discordId);
  const newTier = getXpTier(after.xp);

  const member = await guild.members.fetch(discordId).catch(() => null);
  if (member) await applyXpRoles(guild, member, after.xp, after.vocal_minutes ?? 0);

  if (newTier.lvl !== oldTier.lvl) {
    // Annonce level-up
    const lvlCh = guild.channels.cache.find(c => c.name.includes('niveaux') || c.name.includes('level-up'));
    if (lvlCh) await lvlCh.send({ embeds: [xpLevelUpEmbed(discordId, oldTier, newTier, after.xp)] }).catch(() => {});
    await sendLog(guild, new EmbedBuilder().setColor(newTier.color)
      .setAuthor({ name: `⬆️ Level Up — ${oldTier.name} → ${newTier.name}` })
      .addFields(
        { name: '👤 Membre', value: `<@${discordId}>`, inline: true },
        { name: '✨ XP', value: `**${after.xp.toLocaleString('fr-FR')}**`, inline: true },
        { name: '📌 Source', value: source, inline: true },
      ).setTimestamp());
  }
  return after;
}

// ── AUTOMOD ───────────────────────────────────────────────────
const spamCache = new Map();

async function handleAutomod(message) {
  if (message.author.bot) return false;
  const { guild, author, channel, content } = message;
  const cfg = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(guild.id);
  if (!cfg) return false;
  const member = await guild.members.fetch(author.id).catch(() => null);
  if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  let violated = false, reason = '';

  if (cfg.block_links) {
    const wl = JSON.parse(cfg.link_whitelist_channels || '[]');
    const urlRx = /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/)[^\s]+/gi;
    if (urlRx.test(content) && !wl.includes(channel.id)) {
      await message.delete().catch(() => {});
      violated = true; reason = 'Lien non autorisé';
    }
  }
  if (!violated && cfg.anti_caps && content.length > 10) {
    const caps = content.replace(/[^A-Z]/g, '').length;
    const letters = content.replace(/[^A-Za-z]/g, '').length;
    if (letters > 5 && caps / letters > 0.6) {
      await message.delete().catch(() => {});
      violated = true; reason = 'Trop de majuscules';
    }
  }
  if (!violated && cfg.anti_spam) {
    const now = Date.now(), key = `${author.id}:${guild.id}`;
    if (!spamCache.has(key)) spamCache.set(key, { count: 0, last: now });
    const s = spamCache.get(key);
    if (now - s.last > 5000) { s.count = 0; s.last = now; }
    s.count++;
    if (s.count >= 6) {
      await message.delete().catch(() => {}); s.count = 0;
      violated = true; reason = 'Spam de messages';
    }
  }
  if (!violated && cfg.banned_words) {
    const banned = JSON.parse(cfg.banned_words || '[]');
    const lower = content.toLowerCase();
    for (const w of banned) {
      if (lower.includes(w.toLowerCase())) {
        await message.delete().catch(() => {});
        violated = true; reason = `Mot banni : \`${w}\``;
        break;
      }
    }
  }
  if (!violated) return false;

  db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(author.id);
  db.prepare('UPDATE users SET warn_count=warn_count+1 WHERE discord_id=?').run(author.id);
  db.prepare('INSERT INTO warns (discord_id,moderator_id,reason) VALUES (?,?,?)').run(author.id, guild.members.me.id, `[AutoMod] ${reason}`);
  const warns = db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(author.id)?.warn_count ?? 1;

  try { await author.send({ embeds: [new EmbedBuilder().setColor(C.warning).setDescription(`⚠️ Avertissement AutoMod sur **${guild.name}**\n\n**Raison :** ${reason}\n**Warns :** ${warns}`).setTimestamp()] }); } catch {}

  if (warns >= cfg.max_warns_kick) {
    await member.kick(`[AutoMod] ${warns} warns`).catch(() => {});
    await sendLog(guild, automodLogEmbed('kick', author, `${warns} warns accumulés`, reason));
  } else if (warns >= cfg.max_warns_mute) {
    const muteRole = guild.roles.cache.find(r => r.name === '🔇 Muted');
    if (muteRole) { await member.roles.add(muteRole).catch(() => {}); setTimeout(async () => { await member.roles.remove(muteRole).catch(() => {}); }, 10 * 60 * 1000); }
    await sendLog(guild, automodLogEmbed('mute', author, `${warns} warns — mute 10 min`, reason));
  } else {
    await sendLog(guild, automodLogEmbed('warn', author, reason, `Warn ${warns}`));
  }

  const alert = await channel.send({ content: `<@${author.id}> ⚠️ **${reason}** (Warn ${warns})` }).catch(() => null);
  if (alert) setTimeout(() => alert.delete().catch(() => {}), 5000);
  return true;
}

// ── ANTI-RAID ─────────────────────────────────────────────────
const raidCache = { joins: [], locked: false };
async function handleAntiRaid(guild, member) {
  const cfg = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(guild.id);
  if (!cfg?.anti_raid) return;
  const now = Date.now();
  raidCache.joins = raidCache.joins.filter(t => now - t < 30000);
  raidCache.joins.push(now);
  if (raidCache.joins.length >= 10 && !raidCache.locked) {
    raidCache.locked = true;
    for (const ch of guild.channels.cache.filter(c => c.type === ChannelType.GuildText).values()) {
      await ch.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});
    }
    await sendLog(guild, new EmbedBuilder().setColor(C.danger)
      .setAuthor({ name: '🚨 ANTI-RAID — LOCKDOWN' })
      .setDescription(`**${raidCache.joins.length}** membres ont rejoint en 30s.\nUtilise \`/unlock\` pour déverrouiller.`)
      .setTimestamp());
    setTimeout(() => { raidCache.locked = false; }, 10 * 60 * 1000);
  }
}

// ── STAT CHANNELS ─────────────────────────────────────────────
async function updateStatChannels(guild) {
  const verified = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get()?.c ?? 0;
  const trades   = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed')?.c ?? 0;
  const stats = [
    { find: '👥・membres', name: `👥・membres: ${guild.memberCount}` },
    { find: '✅・vérifiés', name: `✅・vérifiés: ${verified}` },
    { find: '🗡️・trades', name: `🗡️・trades: ${trades}` },
  ];
  for (const s of stats) {
    const ch = guild.channels.cache.find(c => c.name.startsWith(s.find.split(':')[0]));
    if (ch) await ch.setName(s.name).catch(() => {});
  }
}

async function updateLeaderboard(guild, type = 'trades') {
  const nameMap = { trades: 'classement-trades', coins: 'classement-pièces', xp: 'classement-xp' };
  const ch = guild.channels.cache.find(c => c.name.includes(nameMap[type] ?? 'classement'));
  if (!ch) return;
  const order = type === 'coins' ? 'coins' : type === 'xp' ? 'xp' : 'trade_count';
  const top = db.prepare(`SELECT * FROM users ORDER BY ${order} DESC LIMIT 10`).all();
  const msgs = await ch.messages.fetch({ limit: 5 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  if (top.length) await ch.send({ embeds: [leaderboardEmbed(top, type)] });
}

// ── TRADE COMPLETE ────────────────────────────────────────────
async function completeTrade(guild, tradeId, screenshotUrl) {
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if (!trade) return false;
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  db.prepare(`UPDATE trades SET status='completed',completed_at=strftime('%s','now'),screenshot_url=?,screenshot_verified=1 WHERE id=?`).run(screenshotUrl, tradeId);

  for (const uid of [trade.poster_id, trade.accepter_id]) {
    if (!uid) continue;
    db.prepare('UPDATE users SET coins=coins+50,trade_count=trade_count+1 WHERE discord_id=?').run(uid);
    const u = db.prepare('SELECT * FROM users WHERE discord_id=?').get(uid);
    db.prepare('UPDATE users SET rank=? WHERE discord_id=?').run(getRank(u.trade_count), uid);
    db.prepare('INSERT INTO vouches (from_id,to_id,trade_id) VALUES (?,?,?)').run(
      uid === trade.poster_id ? trade.accepter_id : trade.poster_id, uid, tradeId
    );
    db.prepare('UPDATE users SET vouch_count=vouch_count+1 WHERE discord_id=?').run(uid);
    await addXp(guild, uid, 50, 'trade complété');
    try {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (member) {
        const freshUser = db.prepare('SELECT * FROM users WHERE discord_id=?').get(uid);
        const rnMap = { new: '🆕 Non Classé', confirmed: '✅ Confirmé', trusted: '⭐ Fiable', elite: '👑 Elite Trader' };
        const rnTarget = rnMap[freshUser.rank];
        for (const rn of Object.values(rnMap)) { const r = guild.roles.cache.find(x => x.name === rn); if (r && rn !== rnTarget) await member.roles.remove(r).catch(() => {}); }
        const rr = guild.roles.cache.find(x => x.name === rnTarget);
        if (rr && !member.roles.cache.has(rr.id)) await member.roles.add(rr).catch(() => {});
        await applyXpRoles(guild, member, freshUser.xp ?? 0, freshUser.vocal_minutes ?? 0);
      }
    } catch {}
  }

  if (trade.message_id && trade.channel_id) {
    try {
      const tCh = await guild.channels.fetch(trade.channel_id).catch(() => null);
      const msg = tCh ? await tCh.messages.fetch(trade.message_id).catch(() => null) : null;
      if (msg) await msg.edit({ embeds: [tradeCompletedEmbed(trade)], components: [] }).catch(() => {});
    } catch {}
  }

  const vCh = guild.channels.cache.find(c => c.name.includes('vouches'));
  if (vCh) {
    const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
    await vCh.send({ embeds: [new EmbedBuilder().setColor(C.success)
      .setAuthor({ name: `✅ VOUCH — TRADE #${String(tradeId).padStart(4,'0')}` })
      .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
      .addFields(
        { name: '📤 Offre', value: off.map(w => `• **${w.name}** \`${w.value}v\``).join('\n') + `\n**${trade.offer_value} val**`, inline: true },
        { name: '📥 Reçu', value: want.map(w => `• **${w.name}**`).join('\n'), inline: true },
        { name: '🎁 Gains', value: `+50 🪙 · +1 vouch · +50 XP`, inline: false },
      ).setTimestamp()] });
  }

  if (trade.thread_id) {
    try {
      const t = await guild.channels.fetch(trade.thread_id).catch(() => null);
      if (t) {
        await t.send('🎉 **Trade finalisé !** +50 🪙, +1 vouch, +50 XP\n_Archivé dans 10 secondes._');
        setTimeout(() => t.setArchived(true, 'Trade terminé').catch(() => {}), 10000);
      }
    } catch {}
  }

  await updateLeaderboard(guild, 'trades');
  await sendLog(guild, new EmbedBuilder().setColor(C.success)
    .setAuthor({ name: `✅ Trade #${tradeId} Complété` })
    .addFields({ name: '👤 Poster', value: `<@${trade.poster_id}>`, inline: true }, { name: '👤 Accepteur', value: `<@${trade.accepter_id}>`, inline: true })
    .setTimestamp());
  return true;
}

// ── TICKET SYSTEM ─────────────────────────────────────────────
let ticketCounters = {};

function getTicketName(category, username) {
  const emoji = db.prepare('SELECT emoji FROM ticket_categories WHERE name=?').get(category)?.emoji ?? '🎫';
  const catSlug = category.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').toLowerCase().slice(0, 10);
  if (!ticketCounters[catSlug]) {
    const max = db.prepare('SELECT MAX(id) as m FROM tickets WHERE category=?').get(category)?.m ?? 0;
    ticketCounters[catSlug] = max;
  }
  ticketCounters[catSlug]++;
  const num = String(ticketCounters[catSlug]).padStart(4, '0');
  const cleanName = username.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12);
  return `${emoji}・${catSlug}-${cleanName}-${num}`;
}

async function createTicket(interaction, category, options = {}) {
  const { guild, user } = interaction;
  const existing = db.prepare('SELECT * FROM tickets WHERE creator_id=? AND status!=?').get(user.id, 'closed');
  if (existing) {
    return interaction.editReply({ content: `❌ Tu as déjà un ticket ouvert : <#${existing.channel_id}>. Ferme-le d'abord.`, ephemeral: true });
  }
  const cat = db.prepare('SELECT * FROM ticket_categories WHERE name=?').get(category);
  if (!cat) return interaction.editReply({ content: '❌ Catégorie introuvable.', ephemeral: true });

  const ticketCatPv = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('TICKETS OUVERTS'));
  const staffRoles = ['👑 Owner','⚡ Admin','🛡️ Modérateur','🤝 Middleman']
    .map(n => guild.roles.cache.find(r => r.name === n)).filter(Boolean);

  const chName = getTicketName(category, user.username);
  const ch = await guild.channels.create({
    name: chName,
    type: ChannelType.GuildText,
    parent: ticketCatPv?.id ?? null,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...staffRoles.map(r => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
    ],
  });

  const res = db.prepare('INSERT INTO tickets (channel_id,creator_id,category,reason,trade_id,reported_id) VALUES (?,?,?,?,?,?)')
    .run(ch.id, user.id, category, options.reason ?? null, options.trade_id ?? null, options.reported_id ?? null);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(res.lastInsertRowid);

  const staffMentions = staffRoles.map(r => `<@&${r.id}>`).join(' ');
  await ch.send({
    content: `${staffMentions}\n<@${user.id}>`,
    embeds: [ticketEmbed(ticket)],
    components: [ticketActionButtons(ticket.id)],
  });

  await sendLog(guild, new EmbedBuilder().setColor(cat.color ?? C.info)
    .setAuthor({ name: `${cat.emoji} Nouveau Ticket — ${category}` })
    .addFields(
      { name: '👤 Créateur', value: `<@${user.id}>`, inline: true },
      { name: '🔗 Salon', value: `<#${ch.id}>`, inline: true },
      ...(options.reason ? [{ name: '📝 Raison', value: options.reason }] : []),
    ).setTimestamp());

  return ch;
}

// ── RESTORE ROLES ─────────────────────────────────────────────
async function restoreAllRoles(guild) {
  const all = db.prepare('SELECT * FROM users WHERE verified=1').all();
  const rnMap = { new: '🆕 Non Classé', confirmed: '✅ Confirmé', trusted: '⭐ Fiable', elite: '👑 Elite Trader' };
  let count = 0;
  for (const u of all) {
    try {
      const member = await guild.members.fetch(u.discord_id).catch(() => null);
      if (!member) continue;
      const rnTarget = rnMap[u.rank ?? 'new'];
      const rr = guild.roles.cache.find(x => x.name === rnTarget);
      if (rr && !member.roles.cache.has(rr.id)) await member.roles.add(rr).catch(() => {});
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
  } catch (e) { console.error('[PV]', e.message); return null; }
}

// ── GIVEAWAY ──────────────────────────────────────────────────
async function endGiveaway(client, gwId) {
  const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
  if (!gw || gw.status !== 'active') return;
  const participants = JSON.parse(gw.participants || '[]');
  const winners = participants.length > 0
    ? [...participants].sort(() => Math.random() - 0.5).slice(0, Math.min(gw.winners_count, participants.length))
    : [];
  db.prepare('UPDATE giveaways SET status=?,winners=? WHERE id=?').run('ended', JSON.stringify(winners), gwId);
  try {
    const ch = await client.channels.fetch(gw.channel_id).catch(() => null);
    if (!ch) return;
    const msg = gw.message_id ? await ch.messages.fetch(gw.message_id).catch(() => null) : null;
    const embed = new EmbedBuilder().setColor(C.gold)
      .setAuthor({ name: `🎉 GIVEAWAY TERMINÉ — ${gw.prize}` })
      .setDescription(winners.length > 0 ? `**🏆 Gagnant(s) :**\n${winners.map(w => `> 🎊 <@${w}>`).join('\n')}` : '😕 Aucun participant.')
      .addFields(
        { name: '🎁 Prix', value: gw.prize, inline: true },
        { name: '👥 Participants', value: `${participants.length}`, inline: true },
      ).setTimestamp();
    if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    const winText = winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'aucun';
    await ch.send(`🎊 Fin du giveaway ! Félicitations à ${winText} ! Prix : **${gw.prize}**`);
  } catch (e) { console.error('[Giveaway]', e.message); }
}

// ── SHOP EMBED ────────────────────────────────────────────────
async function postShopEmbed(ch) {
  const msgs = await ch.messages.fetch({ limit: 10 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  const items = db.prepare('SELECT * FROM shop_items WHERE active=1 ORDER BY price ASC').all();
  await ch.send({
    embeds: [new EmbedBuilder().setColor(C.gold)
      .setAuthor({ name: '🛒 Boutique Wenzy' })
      .setDescription([
        '**Comment gagner des 🪙 ?**',
        '`+15-25 🪙` message _(cooldown 1 min)_',
        '`+10 🪙/min` vocal _(hors AFK)_',
        '`+50 🪙` trade complété',
        '`+100 🪙` daily bonus',
        '━━━━━━━━━━━━━━━━━━━━━━━',
      ].join('\n'))
      .addFields(...(items.length ? items.map(i => ({ name: `${i.emoji} ${i.name} — \`${i.price.toLocaleString('fr-FR')} 🪙\``, value: `> ${i.description}`, inline: true })) : [{ name: '—', value: 'Aucun item', inline: false }]))
      .setFooter({ text: 'Wenzy Bot v7 • Boutique' }).setTimestamp()],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_role_custom').setLabel('🎨 Rôle Custom — 500 🪙').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('shop_vip').setLabel('👑 VIP — 1 000 🪙').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('shop_elite').setLabel('🏆 Elite — 10 000 🪙').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('shop_double_xp').setLabel('⚡ Double XP — 2 000 🪙').setStyle(ButtonStyle.Success),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_solde').setLabel('🪙 Mon solde').setStyle(ButtonStyle.Success),
      ),
    ],
  });
}

// ══════════════════════════════════════════════════════════════
//  TICKET PANEL EMBED
// ══════════════════════════════════════════════════════════════
async function buildTicketPanelEmbed(guild) {
  const cats = db.prepare('SELECT * FROM ticket_categories WHERE active=1 ORDER BY id ASC').all();
  const memberCats = cats.filter(c => !c.staff_only);
  const rows = [];
  // Build buttons par groupes de 5
  for (let i = 0; i < memberCats.length; i += 4) {
    const chunk = memberCats.slice(i, i + 4);
    rows.push(new ActionRowBuilder().addComponents(
      chunk.map(c =>
        new ButtonBuilder()
          .setCustomId(`ticket_open_${c.name}`)
          .setLabel(`${c.emoji} ${c.name}`)
          .setStyle(ButtonStyle.Secondary)
      )
    ));
  }
  const embed = new EmbedBuilder()
    .setColor(C.info)
    .setAuthor({ name: '🎫 Système de Tickets — Wenzy MM2' })
    .setDescription([
      '**Ouvre un ticket en cliquant sur le bouton correspondant :**',
      '',
      ...memberCats.map(c => `${c.emoji} **${c.name}** — ${c.description ?? '—'}`),
      '',
      '> ⚠️ Les tickets abusifs entraînent un warn.',
    ].join('\n'))
    .setFooter({ text: 'Wenzy Bot v7 • Tickets — Configuration via /ticket-config' })
    .setTimestamp();
  return { embed, rows };
}

// ══════════════════════════════════════════════════════════════
//  COMMANDES
// ══════════════════════════════════════════════════════════════
const commands = [

  // /wenzy-setup
  {
    data: new SlashCommandBuilder().setName('wenzy-setup').setDescription('🏗️ Configure le serveur complet v7').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild, log = [];

      // Nettoyage
      for (const ch of guild.channels.cache.values()) await ch.delete('wenzy-setup').catch(() => {});
      log.push('✅ Canaux supprimés');

      // ── RÔLES ──
      const roleDefs = [
        { name: '👑 Owner',          color: 0xE74C3C, hoist: true,  admin: true  },
        { name: '⚡ Admin',           color: 0xE67E22, hoist: true,  admin: true  },
        { name: '🛡️ Modérateur',     color: 0x3498DB, hoist: true,  mod: true    },
        { name: '🤝 Middleman',      color: 0x2ECC71, hoist: true,  mod: false   },
        { name: '👑 Elite Trader',   color: 0xF1C40F, hoist: true,  mod: false   },
        { name: '⭐ Fiable',         color: 0x9B59B6, hoist: false, mod: false   },
        { name: '✅ Confirmé',       color: 0x27AE60, hoist: false, mod: false   },
        { name: '🆕 Non Classé',    color: 0x95A5A6, hoist: false, mod: false   },
        { name: '👑 VIP',           color: 0xFFD700, hoist: true,  mod: false   },
        { name: '💎 Elite Badge',   color: 0xE91E8C, hoist: true,  mod: false   },
        { name: '🎉 Gagnant',       color: 0xF39C12, hoist: false, mod: false   },
        { name: '🔇 Muted',         color: 0x2C2F33, hoist: false, mod: false   },
        { name: '🔒 Non Vérifié',  color: 0x2C2F33, hoist: false, mod: false   },
        { name: '📢 Annonces',      color: 0x5865F2, hoist: false, mod: false   },
      ];

      const cr = {};
      for (const rd of roleDefs) {
        let r = guild.roles.cache.find(x => x.name === rd.name);
        if (!r) {
          const perms = rd.admin ? PermissionFlagsBits.Administrator : rd.mod ? PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.ManageMessages | PermissionFlagsBits.KickMembers : 0n;
          r = await guild.roles.create({ name: rd.name, color: rd.color, hoist: rd.hoist, permissions: perms }).catch(() => null);
        }
        if (r) cr[rd.name] = r;
        log.push(`✅ Rôle: ${rd.name}`);
      }

      // XP roles
      for (const t of [...XP_TIERS, ...VOCAL_TIERS]) {
        if (!guild.roles.cache.find(r => r.name === t.name)) {
          await guild.roles.create({ name: t.name, color: t.color, hoist: false }).catch(() => {});
        }
        log.push(`✅ Rôle XP: ${t.name}`);
      }

      const admins = ['👑 Owner', '⚡ Admin', '🛡️ Modérateur'].map(n => cr[n]).filter(Boolean);
      const nonv   = cr['🔒 Non Vérifié'];
      const everyone = guild.id;

      // ── CATÉGORIES & SALONS ──
      const struct = [
        {
          name: '📊 STATISTIQUES',
          chs: [
            { name: '👥・membres: 0',    voice: true },
            { name: '✅・vérifiés: 0',   voice: true },
            { name: '🗡️・trades: 0',     voice: true },
          ]
        },
        {
          name: '📌 INFORMATIONS', chs: [
            { name: '📋┃règles',         ro: true  },
            { name: '📢┃annonces',       ro: true  },
            { name: '👋┃bienvenue',      ro: true  },
            { name: '🤖┃commandes',      ro: true  },
            { name: '🔗┃lier-son-compte' },
          ]
        },
        {
          name: '🔒 VÉRIFICATION', chs: [
            { name: '🔑┃verification',   verif: true },
          ]
        },
        {
          name: '🗡️ MM2 TRADING', chs: [
            { name: '🗡️┃post-trades'  },
            { name: '📬┃poster-un-trade' },
            { name: '🏆┃vouches',         ro: true },
            { name: '🛡️┃middleman-panel', staff: true },
          ]
        },
        {
          name: '💬 COMMUNAUTÉ', chs: [
            { name: '💬┃général'    },
            { name: '🎮┃off-topic'  },
            { name: '📸┃showcase'   },
            { name: '📺┃vidéos',    ro: true },
            { name: '⬆️┃niveaux',   ro: true },
          ]
        },
        {
          name: '🏆 CLASSEMENTS', chs: [
            { name: '🏅┃classement-trades', ro: true },
            { name: '🪙┃classement-pièces', ro: true },
            { name: '✨┃classement-xp',     ro: true },
          ]
        },
        {
          name: '🛒 ÉCONOMIE', chs: [
            { name: '🛒┃boutique' },
            { name: '🎲┃jeux'    },
            { name: '🎉┃giveaways' },
          ]
        },
        {
          name: '🎫 TICKETS', chs: [
            { name: '🎫┃créer-un-ticket' },
          ]
        },
        {
          name: '📋 STAFF', chs: [
            { name: '📋┃logs-détaillés', staff: true },
            { name: '🛠️┃staff-chat',     staff: true },
            { name: '⚙️┃ticket-config',  staff: true },
          ]
        },
        {
          name: '🎙️ VOCAUX', chs: [
            { name: '🏗️┃créer-un-vocal', createPv: true },
            { name: '🔇┃afk',  voice: true },
            { name: '😴┃sleep', voice: true },
            { name: '🎙️┃vocal-1', voice: true },
            { name: '🎙️┃vocal-2', voice: true },
          ]
        },
        { name: '🗂️ VOCAUX PRIVÉS', chs: [] },
        { name: '🎫 TICKETS OUVERTS', chs: [] },
      ];

      const cm = {};
      for (const cd of struct) {
        const catPow = [
          { id: everyone, allow: [PermissionFlagsBits.ViewChannel] },
          ...(nonv ? [{ id: nonv.id, deny: [PermissionFlagsBits.ViewChannel] }] : []),
        ];
        const cat = await guild.channels.create({ name: cd.name, type: ChannelType.GuildCategory, permissionOverwrites: catPow });
        log.push(`📁 ${cd.name}`);
        for (const ch of cd.chs) {
          const pow = [];
          if (ch.verif) {
            pow.push({ id: everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
            if (nonv) pow.push({ id: nonv.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
          } else if (ch.staff) {
            pow.push({ id: everyone, deny: [PermissionFlagsBits.ViewChannel] });
            for (const r of admins) pow.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
          } else if (ch.ro) {
            pow.push({ id: everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
            if (nonv) pow.push({ id: nonv.id, deny: [PermissionFlagsBits.ViewChannel] });
          } else if (!ch.voice) {
            pow.push({ id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
            if (nonv) pow.push({ id: nonv.id, deny: [PermissionFlagsBits.ViewChannel] });
          }
          cm[ch.name] = await guild.channels.create({
            name: ch.name,
            type: ch.voice ? ChannelType.GuildVoice : ChannelType.GuildText,
            parent: cat.id,
            permissionOverwrites: pow.length ? pow : undefined,
          });
          log.push(`✅ Salon: ${ch.name}`);
        }
      }

      // ── AUTOMOD ──
      db.prepare('INSERT OR REPLACE INTO automod_config (guild_id,block_links,anti_spam,anti_caps,anti_raid,max_warns_mute,max_warns_kick) VALUES (?,1,1,1,1,3,5)').run(guild.id);
      log.push('✅ AutoMod activé');

      // ── EMBED VÉRIFICATION ──
      if (cm['🔑┃verification']) {
        await cm['🔑┃verification'].send({
          embeds: [new EmbedBuilder().setColor(C.primary)
            .setAuthor({ name: '🔑 Vérification Roblox — Wenzy MM2' })
            .setDescription([
              '**Pour accéder au serveur, lie ton compte Roblox.**',
              '',
              '**📋 Étapes :**',
              '**1.** Clique sur **Lier mon compte** ci-dessous',
              '**2.** Entre ton pseudo Roblox dans le formulaire',
              '**3.** Colle le code dans ta **bio Roblox**',
              '**4.** Clique **Vérifier**',
              '',
              '> ✅ Vérifié → accès complet + rôle **⬡ Niveau 1**',
            ].join('\n'))
            .setFooter({ text: 'Vérification via API Roblox officielle — Wenzy Bot v7' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte Roblox').setStyle(ButtonStyle.Primary),
          )],
        });
      }

      // ── EMBED POSTER UN TRADE ──
      if (cm['📬┃poster-un-trade']) {
        await cm['📬┃poster-un-trade'].send({
          embeds: [new EmbedBuilder().setColor(C.primary)
            .setAuthor({ name: '📬 Poster un Trade MM2' })
            .setDescription([
              'Clique pour créer ton annonce de trade.',
              '',
              '**📋 Infos requises :**',
              '• Armes offertes _(séparées par virgules)_',
              '• Total Value de ton offre',
              '• Ce que tu cherches',
            ].join('\n'))
            .setFooter({ text: 'Wenzy Bot • MM2 Trading' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_post_trade').setLabel('🗡️ Poster un Trade').setStyle(ButtonStyle.Success),
          )],
        });
      }

      // ── EMBED LIER COMPTE ──
      if (cm['🔗┃lier-son-compte']) {
        await cm['🔗┃lier-son-compte'].send({
          embeds: [new EmbedBuilder().setColor(C.info)
            .setAuthor({ name: '🔗 Lier ton compte Roblox' })
            .setDescription([
              '**1.** Clique sur **Lier mon compte**',
              '**2.** Entre ton pseudo Roblox',
              '**3.** Colle le code dans ta **bio Roblox**',
              '**4.** Clique **Vérifier maintenant**',
            ].join('\n'))
            .setFooter({ text: 'Wenzy Bot v7' })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success),
          )],
        });
      }

      // ── EMBED RÈGLES ──
      if (cm['📋┃règles']) {
        await cm['📋┃règles'].send({ embeds: [new EmbedBuilder().setColor(C.primary)
          .setAuthor({ name: '📋 Règles — Wenzy MM2' })
          .setDescription([
            '**🚫 Règles générales**',
            '**1.** Respecte tous les membres',
            '**2.** Pas de spam, publicité ou NSFW',
            '**3.** Parle en français dans les salons FR',
            '',
            '**🗡️ Règles de trading**',
            '**4.** Vérification Roblox obligatoire',
            '**5.** Screenshots obligatoires pour valider',
            '**6.** Les scams sont bannis définitivement',
            '**7.** Utilise le middleman pour les gros trades',
            '',
            '**⚠️ Sanctions AutoMod**',
            '• 3 warns → Mute 10 min',
            '• 5 warns → Kick',
            '• Scam confirmé → Ban permanent',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot v7' })] });
      }

      // ── EMBED COMMANDES ──
      if (cm['🤖┃commandes']) {
        await cm['🤖┃commandes'].send({ embeds: [new EmbedBuilder().setColor(C.primary)
          .setAuthor({ name: '🤖 Commandes — Wenzy Bot v7' })
          .addFields(
            { name: '🔗 Vérification', value: '`/link` — Lier son compte Roblox\n`/verify` — Vérifier', inline: false },
            { name: '🗡️ Trading', value: '`/trade post` — Poster un trade\n`/trade cancel` — Annuler\n`/profil` — Voir son profil\n`/inventory add/remove/view` — Gérer l\'inventaire\n`/vouches` — Voir les vouches', inline: false },
            { name: '🪙 Économie', value: '`/daily` — Bonus journalier\n`/work` — Travailler (4h CD)\n`/coinflip` — Pile ou face\n`/duel @membre` — Duel de pièces\n`/balance` — Voir ses pièces', inline: false },
            { name: '📊 Classements', value: '`/leaderboard trades` — Top traders\n`/leaderboard xp` — Top XP\n`/leaderboard coins` — Top pièces', inline: false },
            { name: '🎁 Giveaways & tickets', value: '`/giveaway start` — (Staff) Lancer\n`/ticket-config` — (Admin) Configurer les tickets', inline: false },
            { name: '🛡️ Staff', value: '`/warn` `/warns` `/clearwarns`\n`/addxp` `/addcoins`\n`/automod` `/unlock`\n`/addserver` `/listservers`', inline: false },
          )
          .setFooter({ text: 'Wenzy Bot v7 • Aide complète' })] });
      }

      // ── BOUTIQUE ──
      if (cm['🛒┃boutique']) { await postShopEmbed(cm['🛒┃boutique']); }

      // ── EMBED JEUX ──
      if (cm['🎲┃jeux']) {
        await cm['🎲┃jeux'].send({ embeds: [new EmbedBuilder().setColor(C.purple)
          .setAuthor({ name: '🎲 Mini-Jeux Economy' })
          .setDescription([
            '🎰 `/coinflip <mise>` — Pile ou face',
            '⚔️ `/duel @user <mise>` — Duel (min 50 🪙)',
            '💼 `/work` — Travaille _(4h cooldown)_',
            '📅 `/daily` — Bonus journalier + streak 🔥',
            '',
            '**Streaks daily :**',
            '🔥 7 jours → +500 🪙',
            '🔥 30 jours → +2 000 🪙 + rôle exclusif',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot v7' })] });
      }

      // ── EMBED CRÉER VOCAL ──
      if (cm['🏗️┃créer-un-vocal']) {
        await cm['🏗️┃créer-un-vocal'].send({
          embeds: [new EmbedBuilder().setColor(C.primary)
            .setAuthor({ name: '🎙️ Vocaux Privés' })
            .setDescription([
              'Clique pour créer ton vocal privé.',
              '',
              '**Commandes dans ton vocal :**',
              '`!open` — Ouvrir',
              '`!close` — Fermer',
              '`!add @user` — Inviter',
              '`!kick @user` — Expulser',
              '`!rename <nom>` — Renommer',
            ].join('\n'))],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_create_vocal').setLabel('🎙️ Créer un vocal privé').setStyle(ButtonStyle.Primary),
          )],
        });
      }

      // ── EMBED TICKET ──
      if (cm['🎫┃créer-un-ticket']) {
        const { embed, rows } = await buildTicketPanelEmbed(guild);
        await cm['🎫┃créer-un-ticket'].send({ embeds: [embed], components: rows });
      }

      // ── EMBED TICKET CONFIG (staff) ──
      if (cm['⚙️┃ticket-config']) {
        await cm['⚙️┃ticket-config'].send({ embeds: [new EmbedBuilder().setColor(C.info)
          .setAuthor({ name: '⚙️ Configuration Tickets — Staff' })
          .setDescription([
            '**Commandes de configuration :**',
            '',
            '`/ticket-config add` — Ajouter une catégorie',
            '`/ticket-config remove` — Supprimer une catégorie',
            '`/ticket-config list` — Voir toutes les catégories',
            '`/ticket-config update-panel` — Mettre à jour le panel',
            '',
            '**Catégories actuelles :**',
            ...db.prepare('SELECT * FROM ticket_categories WHERE active=1').all().map(c => `${c.emoji} **${c.name}** — ${c.description}`),
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot v7 • Ticket Config' })] });
      }

      // ── EMBED GIVEAWAYS ──
      if (cm['🎉┃giveaways']) {
        await cm['🎉┃giveaways'].send({ embeds: [new EmbedBuilder().setColor(C.gold)
          .setAuthor({ name: '🎉 Giveaways — Wenzy MM2' })
          .setDescription([
            'Les giveaways organisés par le staff apparaissent ici.',
            '',
            '**Participer :** clique sur **🎉 Participer**',
            '**Lancer :** `/giveaway start` _(staff uniquement)_',
          ].join('\n'))
          .setFooter({ text: 'Wenzy Bot v7' })] });
      }

      await updateStatChannels(guild);
      await updateLeaderboard(guild, 'trades');
      await updateLeaderboard(guild, 'coins');
      await updateLeaderboard(guild, 'xp');

      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: '🏗️ Setup v7 terminé !' })
        .setDescription(log.map(l => `\`${l}\``).join('\n').slice(0, 3900))
        .addFields({ name: '📋 Prochaines étapes', value: '1. Donne-toi le rôle **👑 Owner**\n2. `/addserver <lien>` pour les serveurs MM2\n3. `/ticket-config list` pour voir les catégories tickets\n4. AutoMod actif par défaut' })
        .setTimestamp()] });
    }
  },

  // /link
  {
    data: new SlashCommandBuilder().setName('link').setDescription('🔗 Lie ton compte Roblox').addStringOption(o => o.setName('username').setDescription('Ton pseudo Roblox exact').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const username = interaction.options.getString('username'), did = interaction.user.id;
      let rb;
      try { rb = await searchRobloxUser(username); } catch { return interaction.editReply('❌ API Roblox indisponible.'); }
      if (!rb) return interaction.editReply(`❌ Pseudo **${username}** introuvable.`);
      const code = genCode();
      const ex = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      if (ex) db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id), rb.name, code, did);
      else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did, String(rb.id), rb.name, code);
      try { const nv = interaction.guild.roles.cache.find(r => r.name === '🔒 Non Vérifié'); if (nv) await interaction.member.roles.add(nv).catch(() => {}); } catch {}
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info)
        .setAuthor({ name: '🔗 Code généré !' })
        .setDescription([`Compte : **${rb.name}**`, '', '**Code à coller dans ta bio Roblox :**', `\`\`\`${code}\`\`\``, '→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)', '', 'Reviens et clique Vérifier.'].join('\n'))],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))] });
    }
  },

  // /verify
  {
    data: new SlashCommandBuilder().setName('verify').setDescription('✅ Confirme la vérification Roblox'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const did = interaction.user.id;
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      if (!user?.verify_code) return interaction.editReply('❌ Lance d\'abord `/link` ou le bouton de vérification.');
      if (user.verified) return interaction.editReply(`✅ Déjà vérifié : **${user.roblox_username}** !`);
      let desc;
      try { desc = await getRobloxDescription(user.roblox_id); } catch { return interaction.editReply('❌ Erreur API Roblox.'); }
      if (!desc.includes(user.verify_code)) return interaction.editReply(`❌ Code \`${user.verify_code}\` introuvable dans ta bio.`);
      const avatar = await getRobloxAvatar(user.roblox_id);
      db.prepare('UPDATE users SET verified=1,roblox_avatar=? WHERE discord_id=?').run(avatar, did);
      try {
        const g = interaction.guild;
        const nv = g.roles.cache.find(r => r.name === '🔒 Non Vérifié');
        const lvl1 = g.roles.cache.find(r => r.name === XP_TIERS[0].name);
        const rnc = g.roles.cache.find(r => r.name === '🆕 Non Classé');
        if (nv) await interaction.member.roles.remove(nv).catch(() => {});
        if (lvl1) await interaction.member.roles.add(lvl1).catch(() => {});
        if (rnc) await interaction.member.roles.add(rnc).catch(() => {});
      } catch {}
      await sendLog(interaction.guild, new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: '✅ Vérification Roblox' })
        .addFields({ name: '👤 Discord', value: `<@${did}>`, inline: true }, { name: '🎮 Roblox', value: user.roblox_username, inline: true })
        .setTimestamp());
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: '✅ Compte vérifié !', iconURL: avatar ?? undefined })
        .setThumbnail(avatar)
        .setDescription([`Lié à **${user.roblox_username}** !`, '', 'Accès complet débloqué.', 'Poste ton premier trade dans **poster-un-trade** !'].join('\n'))
        .setTimestamp()] });
    }
  },

  // /profil
  {
    data: new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche un profil').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const target = interaction.options.getUser('membre') ?? interaction.user;
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
      if (!user) return interaction.editReply(`❌ <@${target.id}> n'a pas de profil.`);
      const inv = db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(target.id);
      await interaction.editReply({ embeds: [profileEmbed(user, inv, target)] });
    }
  },

  // /balance
  {
    data: new SlashCommandBuilder().setName('balance').setDescription('🪙 Voir son solde'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const u = db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
      const coins = u?.coins ?? 0, xp = u?.xp ?? 0;
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold)
        .setAuthor({ name: '🪙 Mon solde' })
        .addFields(
          { name: '💰 Pièces', value: `**${coins.toLocaleString('fr-FR')} 🪙**\n\`[${coinsBar(coins)}]\``, inline: false },
          { name: `${getXpTier(xp).name}`, value: `**${xp.toLocaleString('fr-FR')}** XP\n\`[${xpBar(xp)}]\``, inline: true },
          { name: '🔥 Streak', value: `**${u?.daily_streak ?? 0}** jours`, inline: true },
        ).setTimestamp()] });
    }
  },

  // /trade
  {
    data: new SlashCommandBuilder().setName('trade').setDescription('🗡️ Système de trades MM2')
      .addSubcommand(s => s.setName('post').setDescription('📤 Poster un trade')
        .addStringOption(o => o.setName('offre').setDescription('Armes offertes (virgules)').setRequired(true))
        .addStringOption(o => o.setName('cherche').setDescription('Ce que tu cherches').setRequired(true))
        .addIntegerOption(o => o.setName('valeur-offre').setDescription('Total value offert'))
        .addIntegerOption(o => o.setName('valeur-cherche').setDescription('Total value recherché')))
      .addSubcommand(s => s.setName('cancel').setDescription('❌ Annuler').addIntegerOption(o => o.setName('id').setDescription('ID du trade').setRequired(true))),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand(), did = interaction.user.id;
      await interaction.deferReply({ ephemeral: true });
      if (sub === 'post') {
        const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
        if (!user?.verified) return interaction.editReply('❌ Lie ton compte Roblox d\'abord.');
        const offreStr = interaction.options.getString('offre');
        const chercheStr = interaction.options.getString('cherche');
        const ov = interaction.options.getInteger('valeur-offre') ?? 0;
        const wv = interaction.options.getInteger('valeur-cherche') ?? 0;
        const od = parseWeapons(offreStr).map(n => ({ name: n, value: 0, tier: 'godly' }));
        const wd = parseWeapons(chercheStr).map(n => ({ name: n }));
        const res = db.prepare('INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value,want_value) VALUES (?,?,?,?,?)').run(did, JSON.stringify(od), JSON.stringify(wd), ov, wv);
        const tid = res.lastInsertRowid;
        const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
        const ch = interaction.guild.channels.cache.find(c => c.name.includes('post-trades'));
        if (!ch) return interaction.editReply('❌ Salon post-trades introuvable. Lance `/wenzy-setup`.');
        const msg = await ch.send({ embeds: [tradeEmbed(trade, user)], components: [tradeButtons(tid)] });
        db.prepare('UPDATE trades SET message_id=?,channel_id=? WHERE id=?').run(msg.id, ch.id, tid);
        return interaction.editReply(`✅ Trade **#${tid}** posté dans <#${ch.id}> !`);
      }
      if (sub === 'cancel') {
        const tid = interaction.options.getInteger('id');
        const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
        if (!trade) return interaction.editReply('❌ Trade introuvable.');
        const isAdmin = hasStaffPerm(interaction.member);
        if (trade.poster_id !== did && !isAdmin) return interaction.editReply('❌ Seul le posteur ou un staff peut annuler.');
        if (!['open','in_progress'].includes(trade.status)) return interaction.editReply('❌ Ce trade ne peut plus être annulé.');
        db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tid);
        db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tid);
        if (trade.thread_id) { try { const t = await interaction.guild.channels.fetch(trade.thread_id).catch(() => null); if (t) { await t.send('❌ Trade annulé.'); setTimeout(() => t.delete().catch(() => {}), 5000); } } catch {} }
        if (trade.message_id && trade.channel_id) { try { const tCh = await interaction.guild.channels.fetch(trade.channel_id).catch(() => null); const m = tCh ? await tCh.messages.fetch(trade.message_id).catch(() => null) : null; if (m) await m.delete().catch(() => {}); } catch {} }
        return interaction.editReply(`✅ Trade **#${tid}** annulé.`);
      }
    }
  },

  // /daily
  {
    data: new SlashCommandBuilder().setName('daily').setDescription('📅 Réclame ton bonus journalier'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const did = interaction.user.id;
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const now = Math.floor(Date.now() / 1000);
      if (now - (user.last_daily ?? 0) < 82800) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.warning)
          .setDescription(`⏳ Déjà réclamé ! Prochain bonus : <t:${(user.last_daily ?? 0) + 86400}:R>`)] });
      }
      const streak = (now - (user.last_daily ?? 0) < 172800) ? (user.daily_streak ?? 0) + 1 : 1;
      let coins = 100 + streak * 10;
      let bonus = '';
      if (streak === 7) { coins += 500; bonus = '\n🎁 **Bonus 7 jours : +500 🪙 !**'; }
      if (streak === 30) {
        coins += 2000; bonus = '\n🏆 **Bonus 30 jours : +2 000 🪙 !**';
        const gr = interaction.guild.roles.cache.find(r => r.name === '🎉 Gagnant');
        if (gr) await interaction.member.roles.add(gr).catch(() => {});
      }
      db.prepare('UPDATE users SET coins=coins+?,daily_streak=?,last_daily=? WHERE discord_id=?').run(coins, streak, now, did);
      await addXp(interaction.guild, did, 20, 'daily');
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: '📅 Daily Bonus !' })
        .setDescription([`+**${coins} 🪙** · +**20 XP**`, `🔥 Streak : **${streak}** jour(s)${bonus}`].join('\n'))
        .addFields({ name: '📅 Prochain daily', value: `<t:${now + 86400}:R>`, inline: true })
        .setTimestamp()] });
    }
  },

  // /work
  {
    data: new SlashCommandBuilder().setName('work').setDescription('💼 Travaille pour gagner des pièces (4h cooldown)'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const did = interaction.user.id;
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const now = Math.floor(Date.now() / 1000);
      if (now - (user.last_work ?? 0) < 14400) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.warning).setDescription(`⏳ Fatigué ! Reviens <t:${(user.last_work ?? 0) + 14400}:R>`)] });
      const jobs = [
        { label: 'Tu as vendu des armes MM2', emoji: '🗡️', min: 15, max: 60 },
        { label: 'Tu as arbitré un trade', emoji: '⚖️', min: 20, max: 80 },
        { label: 'Tu as aidé un débutant', emoji: '🤝', min: 10, max: 40 },
        { label: 'Tu as trouvé un Chroma', emoji: '🔴', min: 30, max: 100 },
      ];
      const job = jobs[Math.floor(Math.random() * jobs.length)];
      const earned = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
      db.prepare('UPDATE users SET coins=coins+?,last_work=? WHERE discord_id=?').run(earned, now, did);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: '💼 Travail effectué !' })
        .setDescription(`${job.emoji} **${job.label}**\n+**${earned} 🪙**`)
        .addFields({ name: '⏰ Prochain work', value: `<t:${now + 14400}:R>`, inline: true })
        .setTimestamp()] });
    }
  },

  // /coinflip
  {
    data: new SlashCommandBuilder().setName('coinflip').setDescription('🎰 Pile ou face').addIntegerOption(o => o.setName('mise').setDescription('Mise (min 10 🪙)').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const did = interaction.user.id, mise = interaction.options.getInteger('mise');
      if (mise < 10) return interaction.editReply('❌ Mise minimum : **10 🪙**.');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(did);
      if ((user?.coins ?? 0) < mise) return interaction.editReply(`❌ Pas assez de pièces (**${user?.coins ?? 0} 🪙**).`);
      const win = Math.random() < 0.5, delta = win ? mise : -mise;
      db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(delta, did);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(win ? C.success : C.danger)
        .setAuthor({ name: win ? '🎰 Gagné !' : '🎰 Perdu...' })
        .setDescription([win ? `🪙 **+${mise} 🪙**` : `💸 **-${mise} 🪙**`, `Résultat : ${win ? '**PILE** 🪙' : '**FACE** 🌑'}`].join('\n'))
        .setTimestamp()] });
    }
  },

  // /duel
  {
    data: new SlashCommandBuilder().setName('duel').setDescription('⚔️ Défie un membre').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('mise').setDescription('Mise (min 50 🪙)').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const did = interaction.user.id, target = interaction.options.getUser('membre'), mise = interaction.options.getInteger('mise');
      if (target.id === did || target.bot) return interaction.editReply('❌ Cible invalide.');
      if (mise < 50) return interaction.editReply('❌ Mise minimum : **50 🪙**.');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      const challenger = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(did);
      const challenged = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(target.id);
      if ((challenger?.coins ?? 0) < mise) return interaction.editReply(`❌ Pas assez de pièces.`);
      if ((challenged?.coins ?? 0) < mise) return interaction.editReply(`❌ <@${target.id}> n'a pas assez de pièces.`);
      const res = db.prepare('INSERT INTO duels (challenger_id,challenged_id,amount) VALUES (?,?,?)').run(did, target.id, mise);
      const duelId = res.lastInsertRowid;
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.purple)
        .setAuthor({ name: `⚔️ DUEL — ${interaction.user.username} vs ${target.username}` })
        .setDescription(`<@${did}> défie <@${target.id}> pour **${mise} 🪙** !\n> <@${target.id}> clique **Accepter** !`)
        .setTimestamp()],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`duel_accept_${duelId}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`duel_refuse_${duelId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
        )] });
      setTimeout(async () => {
        const d = db.prepare('SELECT status FROM duels WHERE id=?').get(duelId);
        if (d?.status === 'pending') {
          db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled', duelId);
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.danger).setDescription('❌ Duel annulé — pas de réponse.')], components: [] }).catch(() => {});
        }
      }, 120000);
    }
  },

  // /leaderboard
  {
    data: new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement')
      .addStringOption(o => o.setName('type').setDescription('Type').addChoices({ name: 'Trades', value: 'trades' }, { name: 'Pièces', value: 'coins' }, { name: 'XP', value: 'xp' }).setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const type = interaction.options.getString('type') ?? 'trades';
      const order = type === 'coins' ? 'coins' : type === 'xp' ? 'xp' : 'trade_count';
      const top = db.prepare(`SELECT * FROM users ORDER BY ${order} DESC LIMIT 10`).all();
      if (!top.length) return interaction.editReply('Aucun résultat.');
      await interaction.editReply({ embeds: [leaderboardEmbed(top, type)] });
    }
  },

  // /inventory
  {
    data: new SlashCommandBuilder().setName('inventory').setDescription('📦 Gère ton inventaire MM2')
      .addSubcommand(s => s.setName('add').setDescription('➕ Ajouter').addStringOption(o => o.setName('arme').setDescription('Nom').setRequired(true)).addIntegerOption(o => o.setName('valeur').setDescription('Valeur')).addStringOption(o => o.setName('tier').setDescription('Tier').addChoices({ name: 'Godly', value: 'godly' }, { name: 'Chroma', value: 'chroma' }, { name: 'Ancient', value: 'ancient' })))
      .addSubcommand(s => s.setName('remove').setDescription('➖ Retirer').addStringOption(o => o.setName('arme').setDescription('Nom exact').setRequired(true)))
      .addSubcommand(s => s.setName('view').setDescription('👀 Voir').addUserOption(o => o.setName('membre').setDescription('Membre'))),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const sub = interaction.options.getSubcommand(), did = interaction.user.id;
      if (sub === 'add') {
        const name = interaction.options.getString('arme'), val = interaction.options.getInteger('valeur') ?? 0, tier = interaction.options.getString('tier') ?? 'godly';
        db.prepare('INSERT INTO inventory (discord_id,weapon_name,weapon_value,weapon_tier) VALUES (?,?,?,?)').run(did, name, val, tier);
        return interaction.editReply(`✅ **${name}** ajouté (${tierBadge(tier)}, \`${val}v\`).`);
      }
      if (sub === 'remove') {
        const name = interaction.options.getString('arme');
        const r = db.prepare('DELETE FROM inventory WHERE discord_id=? AND LOWER(weapon_name)=LOWER(?)').run(did, name);
        return interaction.editReply(r.changes ? `✅ **${name}** retiré.` : '❌ Introuvable.');
      }
      if (sub === 'view') {
        const target = interaction.options.getUser('membre') ?? interaction.user;
        const inv = db.prepare('SELECT * FROM inventory WHERE discord_id=? ORDER BY weapon_value DESC').all(target.id);
        if (!inv.length) return interaction.editReply(`📦 Inventaire de <@${target.id}> vide.`);
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.primary)
          .setAuthor({ name: `📦 Inventaire — ${target.username}` })
          .setDescription(inv.map(w => `${tierBadge(w.weapon_tier)} **${w.weapon_name}** \`${w.weapon_value}v\``).join('\n').slice(0, 2000))
          .setFooter({ text: `${inv.length} arme(s)` })] });
      }
    }
  },

  // /vouches
  {
    data: new SlashCommandBuilder().setName('vouches').setDescription('💬 Voir les vouches').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const target = interaction.options.getUser('membre') ?? interaction.user;
      const vouches = db.prepare('SELECT * FROM vouches WHERE to_id=? ORDER BY created_at DESC LIMIT 10').all(target.id);
      const total = db.prepare('SELECT COUNT(*) as c FROM vouches WHERE to_id=?').get(target.id)?.c ?? 0;
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success)
        .setAuthor({ name: `💬 Vouches — ${target.username}` })
        .setDescription(vouches.length ? vouches.map(v => `• De <@${v.from_id}>${v.trade_id ? ` (Trade #${v.trade_id})` : ''} — <t:${v.created_at}:R>`).join('\n') : 'Aucun vouch.')
        .setFooter({ text: `${total} vouch(es) au total` })
        .setTimestamp()] });
    }
  },

  // /addserver
  {
    data: new SlashCommandBuilder().setName('addserver').setDescription('🎮 (Admin) Ajouter un serveur privé MM2').addStringOption(o => o.setName('lien').setDescription('Lien Roblox').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const link = interaction.options.getString('lien');
      try { db.prepare('INSERT INTO private_servers (link,added_by) VALUES (?,?)').run(link, interaction.user.id); } catch { return interaction.editReply('⚠️ Lien déjà dans le pool.'); }
      const count = db.prepare('SELECT COUNT(*) as c FROM private_servers WHERE in_use=0').get().c;
      await interaction.editReply(`✅ Serveur ajouté ! **${count}** libre(s).`);
    }
  },

  // /listservers
  {
    data: new SlashCommandBuilder().setName('listservers').setDescription('📋 (Admin) Voir pool serveurs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const servers = db.prepare('SELECT * FROM private_servers ORDER BY in_use ASC').all();
      if (!servers.length) return interaction.editReply('📋 Pool vide.');
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info)
        .setAuthor({ name: '🎮 Pool Serveurs MM2' })
        .setDescription(servers.map(s => `**#${s.id}** ${s.in_use ? '🔴 En cours' : '🟢 Libre'} \`${s.link.slice(0, 50)}\``).join('\n').slice(0, 2000))
        .setFooter({ text: `Total : ${servers.length} | Libres : ${servers.filter(s => !s.in_use).length}` })] });
    }
  },

  // /report
  {
    data: new SlashCommandBuilder().setName('report').setDescription('🚨 Reporter un scam').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)).addIntegerOption(o => o.setName('trade').setDescription('ID trade')),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const reported = interaction.options.getUser('membre'), reason = interaction.options.getString('raison'), tradeId = interaction.options.getInteger('trade');
      db.prepare('INSERT INTO reports (reporter_id,reported_id,trade_id,reason) VALUES (?,?,?,?)').run(interaction.user.id, reported.id, tradeId ?? null, reason);
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(reported.id);
      db.prepare('UPDATE users SET report_count=report_count+1 WHERE discord_id=?').run(reported.id);
      await sendLog(interaction.guild, new EmbedBuilder().setColor(C.danger)
        .setAuthor({ name: '🚨 Nouveau Report' })
        .addFields({ name: '🕵️ Reporter', value: `<@${interaction.user.id}>`, inline: true }, { name: '⚠️ Reporté', value: `<@${reported.id}>`, inline: true }, { name: '📝 Raison', value: reason })
        .setTimestamp());
      await interaction.editReply(`✅ Report envoyé contre <@${reported.id}>.`);
    }
  },

  // /addxp
  {
    data: new SlashCommandBuilder().setName('addxp').setDescription('✨ (Staff) Ajouter de l\'XP').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const target = interaction.options.getUser('membre'), amount = interaction.options.getInteger('quantite');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET xp=MAX(0,xp+?) WHERE discord_id=?').run(amount, target.id);
      const u = db.prepare('SELECT xp,vocal_minutes FROM users WHERE discord_id=?').get(target.id);
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member) await applyXpRoles(interaction.guild, member, u.xp, u.vocal_minutes ?? 0);
      await updateLeaderboard(interaction.guild, 'xp');
      await interaction.editReply(`✅ <@${target.id}> → **${amount >= 0 ? '+' : ''}${amount} XP** | Total : **${u.xp.toLocaleString('fr-FR')} XP** | ${getXpTier(u.xp).name}`);
    }
  },

  // /addcoins
  {
    data: new SlashCommandBuilder().setName('addcoins').setDescription('🪙 (Staff) Ajouter des pièces').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const target = interaction.options.getUser('membre'), amount = interaction.options.getInteger('quantite');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET coins=MAX(0,coins+?) WHERE discord_id=?').run(amount, target.id);
      const u = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(target.id);
      await interaction.editReply(`✅ <@${target.id}> → **${amount >= 0 ? '+' : ''}${amount} 🪙** | Total : **${u.coins.toLocaleString('fr-FR')} 🪙**`);
    }
  },

  // /warn
  {
    data: new SlashCommandBuilder().setName('warn').setDescription('⚠️ (Staff) Avertir').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const target = interaction.options.getUser('membre'), reason = interaction.options.getString('raison');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET warn_count=warn_count+1 WHERE discord_id=?').run(target.id);
      db.prepare('INSERT INTO warns (discord_id,moderator_id,reason) VALUES (?,?,?)').run(target.id, interaction.user.id, reason);
      const warns = db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(target.id).warn_count;
      try { const m = await interaction.guild.members.fetch(target.id); await m.send({ embeds: [new EmbedBuilder().setColor(C.warning).setDescription(`⚠️ Warn sur **${interaction.guild.name}**\n\n**Raison :** ${reason}\n**Warns total :** ${warns}`)] }); } catch {}
      await sendLog(interaction.guild, automodLogEmbed('warn', target, reason, `Warn ${warns} — par <@${interaction.user.id}>`));
      await interaction.editReply(`✅ <@${target.id}> averti (**${warns}** warn(s)).`);
    }
  },

  // /warns
  {
    data: new SlashCommandBuilder().setName('warns').setDescription('📋 (Staff) Warns d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const target = interaction.options.getUser('membre');
      const warns = db.prepare('SELECT * FROM warns WHERE discord_id=? ORDER BY created_at DESC LIMIT 10').all(target.id);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.warning)
        .setAuthor({ name: `⚠️ Warns — ${target.username}` })
        .setDescription(warns.length ? warns.map((w, i) => `**#${i+1}** <@${w.moderator_id}> — ${w.reason} — <t:${w.created_at}:R>`).join('\n') : 'Aucun warn.')
        .setFooter({ text: `${warns.length} warn(s)` })] });
    }
  },

  // /clearwarns
  {
    data: new SlashCommandBuilder().setName('clearwarns').setDescription('🧹 (Admin) Effacer warns').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const target = interaction.options.getUser('membre');
      db.prepare('DELETE FROM warns WHERE discord_id=?').run(target.id);
      db.prepare('UPDATE users SET warn_count=0 WHERE discord_id=?').run(target.id);
      await interaction.editReply(`✅ Warns de <@${target.id}> effacés.`);
    }
  },

  // /automod
  {
    data: new SlashCommandBuilder().setName('automod').setDescription('🛡️ (Admin) Configurer l\'AutoMod')
      .addSubcommand(s => s.setName('status').setDescription('📊 Config actuelle'))
      .addSubcommand(s => s.setName('links').setDescription('🔗 Toggle liens').addBooleanOption(o => o.setName('actif').setDescription('Activer/désactiver').setRequired(true)))
      .addSubcommand(s => s.setName('spam').setDescription('📨 Toggle anti-spam').addBooleanOption(o => o.setName('actif').setDescription('Activer/désactiver').setRequired(true)))
      .addSubcommand(s => s.setName('caps').setDescription('🔠 Toggle anti-caps').addBooleanOption(o => o.setName('actif').setDescription('Activer/désactiver').setRequired(true)))
      .addSubcommand(s => s.setName('raid').setDescription('🚨 Toggle anti-raid').addBooleanOption(o => o.setName('actif').setDescription('Activer/désactiver').setRequired(true)))
      .addSubcommand(s => s.setName('addword').setDescription('➕ Mot banni').addStringOption(o => o.setName('mot').setDescription('Mot').setRequired(true)))
      .addSubcommand(s => s.setName('removeword').setDescription('➖ Retirer mot banni').addStringOption(o => o.setName('mot').setDescription('Mot').setRequired(true)))
      .addSubcommand(s => s.setName('whitelist').setDescription('✅ Whitelist salon pour liens').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const sub = interaction.options.getSubcommand(), gid = interaction.guild.id;
      db.prepare('INSERT OR IGNORE INTO automod_config (guild_id) VALUES (?)').run(gid);
      const cfg = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(gid);
      if (sub === 'status') {
        const words = JSON.parse(cfg.banned_words || '[]'), wl = JSON.parse(cfg.link_whitelist_channels || '[]');
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info).setAuthor({ name: '🛡️ Config AutoMod' })
          .addFields(
            { name: '🔗 Liens', value: cfg.block_links ? '✅' : '❌', inline: true },
            { name: '📨 Anti-spam', value: cfg.anti_spam ? '✅' : '❌', inline: true },
            { name: '🔠 Anti-caps', value: cfg.anti_caps ? '✅' : '❌', inline: true },
            { name: '🚨 Anti-raid', value: cfg.anti_raid ? '✅' : '❌', inline: true },
            { name: '⚠️→🔇', value: `${cfg.max_warns_mute} warns`, inline: true },
            { name: '🔇→🦶', value: `${cfg.max_warns_kick} warns`, inline: true },
            { name: '🚫 Mots bannis', value: words.length ? words.map(w => `\`${w}\``).join(', ') : 'Aucun', inline: false },
            { name: '✅ Whitelist liens', value: wl.length ? wl.map(id => `<#${id}>`).join(', ') : 'Aucun', inline: false },
          ).setTimestamp()] });
      }
      if (sub === 'links') { db.prepare('UPDATE automod_config SET block_links=? WHERE guild_id=?').run(interaction.options.getBoolean('actif') ? 1 : 0, gid); return interaction.editReply(`✅ Liens : **${interaction.options.getBoolean('actif') ? 'bloqués' : 'autorisés'}**`); }
      if (sub === 'spam') { db.prepare('UPDATE automod_config SET anti_spam=? WHERE guild_id=?').run(interaction.options.getBoolean('actif') ? 1 : 0, gid); return interaction.editReply(`✅ Anti-spam : **${interaction.options.getBoolean('actif') ? 'activé' : 'désactivé'}**`); }
      if (sub === 'caps') { db.prepare('UPDATE automod_config SET anti_caps=? WHERE guild_id=?').run(interaction.options.getBoolean('actif') ? 1 : 0, gid); return interaction.editReply(`✅ Anti-caps : **${interaction.options.getBoolean('actif') ? 'activé' : 'désactivé'}**`); }
      if (sub === 'raid') { db.prepare('UPDATE automod_config SET anti_raid=? WHERE guild_id=?').run(interaction.options.getBoolean('actif') ? 1 : 0, gid); return interaction.editReply(`✅ Anti-raid : **${interaction.options.getBoolean('actif') ? 'activé' : 'désactivé'}**`); }
      if (sub === 'addword') { const mot = interaction.options.getString('mot').toLowerCase(); const words = JSON.parse(cfg.banned_words || '[]'); if (!words.includes(mot)) words.push(mot); db.prepare('UPDATE automod_config SET banned_words=? WHERE guild_id=?').run(JSON.stringify(words), gid); return interaction.editReply(`✅ \`${mot}\` ajouté.`); }
      if (sub === 'removeword') { const mot = interaction.options.getString('mot').toLowerCase(); const words = JSON.parse(cfg.banned_words || '[]').filter(w => w !== mot); db.prepare('UPDATE automod_config SET banned_words=? WHERE guild_id=?').run(JSON.stringify(words), gid); return interaction.editReply(`✅ \`${mot}\` retiré.`); }
      if (sub === 'whitelist') { const ch = interaction.options.getChannel('salon'); const wl = JSON.parse(cfg.link_whitelist_channels || '[]'); if (!wl.includes(ch.id)) wl.push(ch.id); db.prepare('UPDATE automod_config SET link_whitelist_channels=? WHERE guild_id=?').run(JSON.stringify(wl), gid); return interaction.editReply(`✅ <#${ch.id}> whitelisté.`); }
    }
  },

  // /unlock
  {
    data: new SlashCommandBuilder().setName('unlock').setDescription('🔓 (Admin) Déverrouiller après un raid').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      for (const ch of interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).values()) {
        await ch.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null }).catch(() => {});
      }
      raidCache.locked = false;
      await interaction.editReply('✅ Serveur déverrouillé !');
    }
  },

  // /ticket-config
  {
    data: new SlashCommandBuilder().setName('ticket-config').setDescription('⚙️ (Admin) Configurer les catégories de tickets')
      .addSubcommand(s => s.setName('list').setDescription('📋 Voir toutes les catégories'))
      .addSubcommand(s => s.setName('add').setDescription('➕ Ajouter une catégorie')
        .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true))
        .addBooleanOption(o => o.setName('staff-only').setDescription('Réservé staff ?'))
        .addStringOption(o => o.setName('couleur').setDescription('Couleur hex (ex: #FF5733)')))
      .addSubcommand(s => s.setName('remove').setDescription('➖ Désactiver une catégorie').addStringOption(o => o.setName('nom').setDescription('Nom exact').setRequired(true)))
      .addSubcommand(s => s.setName('update-panel').setDescription('🔄 Mettre à jour le panel tickets'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const sub = interaction.options.getSubcommand();

      if (sub === 'list') {
        const cats = db.prepare('SELECT * FROM ticket_categories ORDER BY id ASC').all();
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info)
          .setAuthor({ name: '⚙️ Catégories Tickets' })
          .setDescription(cats.map(c => `${c.emoji} **${c.name}** ${c.active ? '✅' : '❌'} ${c.staff_only ? '_(staff only)_' : ''}\n> ${c.description ?? '—'}`).join('\n\n') || 'Aucune catégorie.')
          .setTimestamp()] });
      }

      if (sub === 'add') {
        const nom = interaction.options.getString('nom'), emoji = interaction.options.getString('emoji');
        const desc = interaction.options.getString('description'), staffOnly = interaction.options.getBoolean('staff-only') ? 1 : 0;
        const colorInput = interaction.options.getString('couleur') ?? '#5DADE2';
        const colorMatch = colorInput.match(/#?([0-9a-fA-F]{6})/);
        const color = colorMatch ? parseInt(colorMatch[1], 16) : C.info;
        try {
          db.prepare('INSERT INTO ticket_categories (name,emoji,description,staff_only,color,created_by) VALUES (?,?,?,?,?,?)').run(nom, emoji, desc, staffOnly, color, interaction.user.id);
          // Update panel
          const panelCh = interaction.guild.channels.cache.find(c => c.name.includes('créer-un-ticket'));
          if (panelCh) {
            const { embed, rows } = await buildTicketPanelEmbed(interaction.guild);
            const msgs = await panelCh.messages.fetch({ limit: 5 });
            for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
            await panelCh.send({ embeds: [embed], components: rows });
          }
          return interaction.editReply(`✅ Catégorie **${emoji} ${nom}** ajoutée ! Panel mis à jour.`);
        } catch { return interaction.editReply('❌ Ce nom existe déjà.'); }
      }

      if (sub === 'remove') {
        const nom = interaction.options.getString('nom');
        const r = db.prepare('UPDATE ticket_categories SET active=0 WHERE name=?').run(nom);
        if (!r.changes) return interaction.editReply('❌ Catégorie introuvable.');
        // Update panel
        const panelCh = interaction.guild.channels.cache.find(c => c.name.includes('créer-un-ticket'));
        if (panelCh) {
          const { embed, rows } = await buildTicketPanelEmbed(interaction.guild);
          const msgs = await panelCh.messages.fetch({ limit: 5 });
          for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
          await panelCh.send({ embeds: [embed], components: rows });
        }
        return interaction.editReply(`✅ Catégorie **${nom}** désactivée. Panel mis à jour.`);
      }

      if (sub === 'update-panel') {
        const panelCh = interaction.guild.channels.cache.find(c => c.name.includes('créer-un-ticket'));
        if (!panelCh) return interaction.editReply('❌ Salon créer-un-ticket introuvable.');
        const { embed, rows } = await buildTicketPanelEmbed(interaction.guild);
        const msgs = await panelCh.messages.fetch({ limit: 5 });
        for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
        await panelCh.send({ embeds: [embed], components: rows });
        return interaction.editReply('✅ Panel tickets mis à jour !');
      }
    }
  },

  // /giveaway
  {
    data: new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Giveaways')
      .addSubcommand(s => s.setName('start').setDescription('🎁 Lancer')
        .addStringOption(o => o.setName('prix').setDescription('Prix').setRequired(true))
        .addStringOption(o => o.setName('duree').setDescription('Durée (1h, 30m, 2d)').setRequired(true))
        .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants'))
        .addChannelOption(o => o.setName('salon').setDescription('Salon')))
      .addSubcommand(s => s.setName('end').setDescription('🏁 Terminer').addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand(s => s.setName('reroll').setDescription('🔄 Reroll').addIntegerOption(o => o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('📋 Actifs'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const sub = interaction.options.getSubcommand();

      if (sub === 'start') {
        const prize = interaction.options.getString('prix'), dureeStr = interaction.options.getString('duree'), wCount = interaction.options.getInteger('gagnants') ?? 1;
        const tCh = interaction.options.getChannel('salon') ?? interaction.guild.channels.cache.find(c => c.name.includes('giveaways')) ?? interaction.channel;
        let seconds = 0;
        const dM = dureeStr.match(/(\d+)d/), hM = dureeStr.match(/(\d+)h/), mM = dureeStr.match(/(\d+)m/);
        if (dM) seconds += parseInt(dM[1]) * 86400;
        if (hM) seconds += parseInt(hM[1]) * 3600;
        if (mM) seconds += parseInt(mM[1]) * 60;
        if (seconds < 60) return interaction.editReply('❌ Durée minimum : 1 minute.');
        const endsAt = Math.floor(Date.now() / 1000) + seconds;
        const res = db.prepare('INSERT INTO giveaways (channel_id,prize,winners_count,host_id,ends_at) VALUES (?,?,?,?,?)').run(tCh.id, prize, wCount, interaction.user.id, endsAt);
        const gwId = res.lastInsertRowid;
        const embed = new EmbedBuilder().setColor(C.gold)
          .setAuthor({ name: `🎉 GIVEAWAY — ${prize}` })
          .setDescription([`🎁 **Prix :** ${prize}`, `🏆 **Gagnants :** ${wCount}`, `⏳ **Fin :** <t:${endsAt}:R> (<t:${endsAt}:f>)`, `📢 **Par :** <@${interaction.user.id}>`].join('\n'))
          .setFooter({ text: `Giveaway #${gwId} • Wenzy Bot` }).setTimestamp();
        const msg = await tCh.send({ content: `@everyone 🎉 **Nouveau giveaway !**`, embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_join_${gwId}`).setLabel('🎉 Participer').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`gw_leave_${gwId}`).setLabel('❌ Se retirer').setStyle(ButtonStyle.Secondary))] });
        db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(msg.id, gwId);
        await interaction.editReply(`✅ Giveaway **#${gwId}** lancé !`);
        setTimeout(() => endGiveaway(interaction.client, gwId), seconds * 1000);
      }
      else if (sub === 'end') { await endGiveaway(interaction.client, interaction.options.getInteger('id')); await interaction.editReply('✅ Giveaway terminé.'); }
      else if (sub === 'reroll') {
        const gwId = interaction.options.getInteger('id');
        const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
        if (!gw) return interaction.editReply('❌ Introuvable.');
        const participants = JSON.parse(gw.participants || '[]');
        if (!participants.length) return interaction.editReply('❌ Aucun participant.');
        const nw = [...participants].sort(() => Math.random() - 0.5).slice(0, Math.min(gw.winners_count, participants.length));
        db.prepare('UPDATE giveaways SET winners=? WHERE id=?').run(JSON.stringify(nw), gwId);
        const ch = await interaction.client.channels.fetch(gw.channel_id).catch(() => null);
        if (ch) await ch.send(`🔄 **Reroll #${gwId}** — Nouveaux gagnants : ${nw.map(w => `<@${w}>`).join(', ')}`);
        await interaction.editReply('✅ Reroll effectué !');
      }
      else if (sub === 'list') {
        const active = db.prepare('SELECT * FROM giveaways WHERE status=? ORDER BY ends_at ASC').all('active');
        if (!active.length) return interaction.editReply('📭 Aucun giveaway actif.');
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold).setAuthor({ name: '🎉 Giveaways actifs' }).setDescription(active.map(g => `**#${g.id}** — ${g.prize} | Fin : <t:${g.ends_at}:R>`).join('\n')).setTimestamp()] });
      }
    }
  },

];

// ══════════════════════════════════════════════════════════════
//  BUTTON HANDLER
// ══════════════════════════════════════════════════════════════
async function handleButton(interaction) {
  const { customId, guild, user } = interaction;

  // Vérification
  if (customId === 'btn_link_start') {
    const modal = new ModalBuilder().setCustomId('modal_link_roblox').setTitle('🔗 Lier ton compte Roblox');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roblox_username').setLabel('Pseudo Roblox exact').setStyle(TextInputStyle.Short).setPlaceholder('ex: WenzyFR').setRequired(true).setMinLength(3).setMaxLength(20)));
    return interaction.showModal(modal);
  }
  if (customId === 'btn_verify_now') {
    await interaction.deferReply({ ephemeral: true });
    const did = user.id, u = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
    if (!u?.verify_code) return interaction.editReply('❌ Lance d\'abord `/link` ou le bouton de vérification.');
    if (u.verified) return interaction.editReply(`✅ Déjà vérifié : **${u.roblox_username}** !`);
    let desc; try { desc = await getRobloxDescription(u.roblox_id); } catch { return interaction.editReply('❌ Erreur API Roblox.'); }
    if (!desc.includes(u.verify_code)) return interaction.editReply(`❌ Code \`${u.verify_code}\` introuvable dans ta bio.`);
    const avatar = await getRobloxAvatar(u.roblox_id);
    db.prepare('UPDATE users SET verified=1,roblox_avatar=? WHERE discord_id=?').run(avatar, did);
    try {
      const nv = guild.roles.cache.find(r => r.name === '🔒 Non Vérifié');
      const lvl1 = guild.roles.cache.find(r => r.name === XP_TIERS[0].name);
      const rnc = guild.roles.cache.find(r => r.name === '🆕 Non Classé');
      if (nv) await interaction.member.roles.remove(nv).catch(() => {});
      if (lvl1) await interaction.member.roles.add(lvl1).catch(() => {});
      if (rnc) await interaction.member.roles.add(rnc).catch(() => {});
    } catch {}
    await sendLog(guild, new EmbedBuilder().setColor(C.success).setAuthor({ name: '✅ Vérification Roblox' }).addFields({ name: '👤 Discord', value: `<@${did}>`, inline: true }, { name: '🎮 Roblox', value: u.roblox_username, inline: true }).setTimestamp());
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success).setAuthor({ name: '✅ Vérifié !' }).setThumbnail(avatar).setDescription(`Lié à **${u.roblox_username}** !\nAccès complet débloqué.`).setTimestamp()] });
  }

  // Trade
  if (customId === 'btn_post_trade') {
    const modal = new ModalBuilder().setCustomId('modal_post_trade').setTitle('🗡️ Poster un Trade MM2');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_offre').setLabel('Armes offertes (virgules)').setStyle(TextInputStyle.Short).setPlaceholder('ex: Chroma Seer, Corrupt').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_offre_val').setLabel('Total Value de ton offre').setStyle(TextInputStyle.Short).setPlaceholder('ex: 255').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_cherche').setLabel('Ce que tu cherches').setStyle(TextInputStyle.Short).setPlaceholder('ex: Ancient Seer').setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  // Vocal privé
  if (customId === 'btn_create_vocal') {
    await interaction.deferReply({ ephemeral: true });
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member?.voice.channel) return interaction.editReply('❌ Tu dois être dans un vocal d\'abord.');
    const existing = db.prepare('SELECT * FROM private_vocals WHERE owner_id=?').get(user.id);
    if (existing && guild.channels.cache.get(existing.channel_id)) return interaction.editReply(`❌ Tu as déjà un vocal privé : <#${existing.channel_id}>`);
    if (existing) db.prepare('DELETE FROM private_vocals WHERE owner_id=?').run(user.id);
    const ch = await createPrivateVocal(guild, member);
    if (!ch) return interaction.editReply('❌ Erreur lors de la création.');
    return interaction.editReply(`✅ Vocal privé créé : **${ch.name}**`);
  }

  // Tickets dynamiques — toutes les catégories
  if (customId.startsWith('ticket_open_')) {
    await interaction.deferReply({ ephemeral: true });
    const catName = customId.replace('ticket_open_', '');
    const cat = db.prepare('SELECT * FROM ticket_categories WHERE name=?').get(catName);
    if (!cat) return interaction.editReply('❌ Catégorie introuvable.');
    if (cat.staff_only && !hasStaffPerm(interaction.member)) return interaction.editReply('❌ Cette catégorie est réservée au staff.');
    if (cat.name.includes('Report') || cat.name.includes('Arnaque')) {
      const modal = new ModalBuilder().setCustomId(`modal_ticket_${catName}`).setTitle(`${cat.emoji} ${cat.name}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Décris le problème / preuves').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reported_id').setLabel('ID Discord du membre concerné (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_id').setLabel('ID du trade concerné (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10)),
      );
      return interaction.showModal(modal);
    }
    if (cat.name.includes('Support') || cat.name.includes('Giveaway') || cat.name.includes('Staff')) {
      const modal = new ModalBuilder().setCustomId(`modal_ticket_${catName}`).setTitle(`${cat.emoji} ${cat.name}`);
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Comment peut-on t\'aider ?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)));
      return interaction.showModal(modal);
    }
    // Default (Middleman etc.)
    const ch = await createTicket(interaction, catName, {});
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
    if (tCh) await tCh.send({ embeds: [new EmbedBuilder().setColor(C.success).setDescription(`🤝 **Pris en charge par <@${user.id}>**`).setTimestamp()] });
    return interaction.editReply('✅ Ticket pris en charge.');
  }

  if (customId.startsWith('ticket_close_')) {
    await interaction.deferReply({ ephemeral: true });
    const ticketId = parseInt(customId.replace('ticket_close_', ''));
    const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    if (!ticket) return interaction.editReply('❌ Ticket introuvable.');
    if (!hasStaffPerm(interaction.member) && ticket.creator_id !== user.id) return interaction.editReply('❌ Pas la permission.');
    db.prepare('UPDATE tickets SET status=?,closed_at=strftime(\'%s\',\'now\') WHERE id=?').run('closed', ticketId);
    const tCh = guild.channels.cache.get(ticket.channel_id);
    if (tCh) {
      await tCh.send({ embeds: [new EmbedBuilder().setColor(C.danger).setDescription(`🔒 **Fermé par <@${user.id}>**\nSuppression dans 10 secondes.`).setTimestamp()] });
      await sendLog(guild, new EmbedBuilder().setColor(C.info)
        .setAuthor({ name: `🔒 Ticket #${ticketId} fermé — ${ticket.category}` })
        .addFields({ name: '👤 Fermé par', value: `<@${user.id}>`, inline: true }, { name: '📋 Catégorie', value: ticket.category, inline: true })
        .setTimestamp());
      setTimeout(() => tCh.delete('Ticket fermé').catch(() => {}), 10000);
    }
    return interaction.editReply('✅ Ticket fermé.');
  }

  // Shop
  if (customId === 'shop_solde') {
    await interaction.deferReply({ ephemeral: true });
    const u = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    const coins = u?.coins ?? 0, xp = u?.xp ?? 0;
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold)
      .setAuthor({ name: '🪙 Ton solde' })
      .addFields(
        { name: '💰 Pièces', value: `**${coins.toLocaleString('fr-FR')} 🪙**\n\`[${coinsBar(coins)}]\``, inline: false },
        { name: `${getXpTier(xp).name}`, value: `**${xp.toLocaleString('fr-FR')}** XP\n\`[${xpBar(xp)}]\``, inline: true },
        { name: '🔥 Streak', value: `**${u?.daily_streak ?? 0}** jours`, inline: true },
      ).setTimestamp()] });
  }

  if (customId === 'shop_role_custom') {
    const u = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(user.id);
    if (!u || u.coins < 500) { await interaction.deferReply({ ephemeral: true }); return interaction.editReply(`❌ Il te faut **500 🪙** (tu en as **${u?.coins ?? 0}**).`); }
    const modal = new ModalBuilder().setCustomId('modal_shop_role_custom').setTitle('🎨 Rôle custom');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_name').setLabel('Nom du rôle').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_color').setLabel('Couleur hex (ex: #FF5733)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)),
    );
    return interaction.showModal(modal);
  }

  if (customId === 'shop_vip') {
    await interaction.deferReply({ ephemeral: true });
    const u = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(user.id);
    if (!u || u.coins < 1000) return interaction.editReply(`❌ Il te faut **1 000 🪙** (tu en as **${u?.coins ?? 0}**).`);
    db.prepare('UPDATE users SET coins=coins-1000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id, 'vip_role', 1000);
    const vipR = guild.roles.cache.find(r => r.name === '👑 VIP') ?? await guild.roles.create({ name: '👑 VIP', color: 0xF1C40F, hoist: true });
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member && vipR) await member.roles.add(vipR).catch(() => {});
    await sendLog(guild, new EmbedBuilder().setColor(C.gold).setDescription(`👑 <@${user.id}> a acheté le rôle VIP pour 1 000 🪙`).setTimestamp());
    return interaction.editReply('✅ **Rôle VIP** acheté et attribué !');
  }

  if (customId === 'shop_elite') {
    await interaction.deferReply({ ephemeral: true });
    const u = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(user.id);
    if (!u || u.coins < 10000) return interaction.editReply(`❌ Il te faut **10 000 🪙** (tu en as **${u?.coins ?? 0}**).`);
    db.prepare('UPDATE users SET coins=coins-10000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id, 'elite_badge', 10000);
    const eR = guild.roles.cache.find(r => r.name === '💎 Elite Badge');
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member && eR) await member.roles.add(eR).catch(() => {});
    return interaction.editReply('✅ **Badge Elite** acheté !');
  }

  if (customId === 'shop_double_xp') {
    await interaction.deferReply({ ephemeral: true });
    const u = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(user.id);
    if (!u || u.coins < 2000) return interaction.editReply(`❌ Il te faut **2 000 🪙** (tu en as **${u?.coins ?? 0}**).`);
    db.prepare('UPDATE users SET coins=coins-2000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id, 'double_xp', 2000);
    return interaction.editReply('✅ **Double XP 24h** activé !');
  }

  // Giveaway
  if (customId.startsWith('gw_join_')) {
    await interaction.deferReply({ ephemeral: true });
    const gwId = parseInt(customId.replace('gw_join_', ''));
    const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
    if (!gw || gw.status !== 'active') return interaction.editReply('❌ Giveaway terminé.');
    const participants = JSON.parse(gw.participants || '[]');
    if (participants.includes(user.id)) return interaction.editReply('⚠️ Tu participes déjà !');
    participants.push(user.id);
    db.prepare('UPDATE giveaways SET participants=? WHERE id=?').run(JSON.stringify(participants), gwId);
    return interaction.editReply(`✅ Tu participes au giveaway **${gw.prize}** ! (${participants.length} participants)`);
  }
  if (customId.startsWith('gw_leave_')) {
    await interaction.deferReply({ ephemeral: true });
    const gwId = parseInt(customId.replace('gw_leave_', ''));
    const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
    if (!gw || gw.status !== 'active') return interaction.editReply('❌ Giveaway terminé.');
    const participants = JSON.parse(gw.participants || '[]').filter(id => id !== user.id);
    db.prepare('UPDATE giveaways SET participants=? WHERE id=?').run(JSON.stringify(participants), gwId);
    return interaction.editReply('❌ Retiré du giveaway.');
  }

  // Staff trade
  if (customId.startsWith('staff_validate_')) {
    await interaction.deferReply({ ephemeral: true });
    if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
    const tid = parseInt(customId.replace('staff_validate_', ''));
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (!trade) return interaction.editReply('❌ Trade introuvable.');
    await completeTrade(guild, tid, trade.screenshot_url ?? null);
    return interaction.editReply(`✅ Trade **#${tid}** validé !`);
  }
  if (customId.startsWith('staff_reject_')) {
    await interaction.deferReply({ ephemeral: true });
    if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
    const tid = parseInt(customId.replace('staff_reject_', ''));
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (trade?.thread_id) { try { const t = await guild.channels.fetch(trade.thread_id).catch(() => null); if (t) await t.send(`❌ **Screenshot rejeté** par <@${user.id}>\nEnvoie un screenshot valide de **"YOU HAVE ACCEPTED"**.`); } catch {} }
    return interaction.editReply('⚠️ Screenshot rejeté.');
  }

  // Trade buttons
  if (customId.startsWith('trade_accept_')) {
    await interaction.deferReply({ ephemeral: true });
    const tid = parseInt(customId.replace('trade_accept_', ''));
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (!trade) return interaction.editReply('❌ Trade introuvable.');
    if (trade.poster_id === user.id) return interaction.editReply('❌ Tu ne peux pas accepter ton propre trade.');
    if (trade.status !== 'open') return interaction.editReply('❌ Ce trade n\'est plus disponible.');
    const accUser = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!accUser?.verified) return interaction.editReply('❌ Lie ton compte Roblox d\'abord.');
    db.prepare('UPDATE trades SET accepter_id=?,status=? WHERE id=?').run(user.id, 'in_progress', tid);
    const poster = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    let thread;
    try {
      const tCh = guild.channels.cache.find(c => c.name.includes('post-trades'));
      thread = await tCh?.threads.create({ name: `🗡️ Trade #${tid} — ${poster?.roblox_username ?? 'Trader'} × ${accUser?.roblox_username ?? 'Accepter'}`, type: ChannelType.PrivateThread, invitable: false });
      if (thread) { await thread.members.add(trade.poster_id); await thread.members.add(user.id); }
    } catch (e) { console.error('[Thread]', e.message); }
    if (thread) {
      db.prepare('UPDATE trades SET thread_id=? WHERE id=?').run(thread.id, tid);
      const server = getFreeServer();
      if (server) { db.prepare('UPDATE private_servers SET in_use=1,trade_id=? WHERE id=?').run(tid, server.id); db.prepare('UPDATE trades SET server_link=? WHERE id=?').run(server.link, tid); }
      const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
      await thread.send({ embeds: [new EmbedBuilder().setColor(C.warning)
        .setAuthor({ name: `🗡️ TRADE EN COURS — #${String(tid).padStart(4,'0')}` })
        .setDescription(['> <@'+trade.poster_id+'> × <@'+user.id+'>', '', '**📋 Étapes :**', '1. Rejoins le serveur privé MM2', '2. Fais le trade en jeu', '3. Screenshot **"YOU HAVE ACCEPTED"**', '4. Envoie-le dans CE salon', '5. Le staff validera'].join('\n'))
        .addFields(
          { name: '📤 OFFRE', value: off.map(w => `${tierBadge(w.tier ?? 'godly')} **${w.name}** \`${w.value}v\``).join('\n') + `\n**${trade.offer_value} val**`, inline: true },
          { name: '📥 RECHERCHE', value: want.map(w => `**${w.name}**`).join('\n'), inline: true },
        ).setFooter({ text: 'Wenzy Bot • Screenshot requis' }).setTimestamp()],
        components: [threadButtons(tid)] });
      if (server) await thread.send(`🎮 **Serveur MM2 :**\n${server.link}`);
      if (fs.existsSync(REF_SCREEN_PATH)) { await thread.send('📸 **Exemple de screenshot :**'); await thread.send({ files: [REF_SCREEN_PATH] }); }
      const mmPanel = guild.channels.cache.find(c => c.name.includes('middleman-panel'));
      if (mmPanel) {
        const mmRole = guild.roles.cache.find(r => r.name.includes('Middleman'));
        await mmPanel.send({ content: mmRole ? `<@&${mmRole.id}>` : '🛡️',
          embeds: [new EmbedBuilder().setColor(C.info).setAuthor({ name: `🛡️ MIDDLEMAN — TRADE #${String(tid).padStart(4,'0')}` })
            .addFields({ name: '👤 Poster', value: `<@${trade.poster_id}>`, inline: true }, { name: '👤 Accepter', value: `<@${user.id}>`, inline: true }, { name: '📤 OFFRE', value: off.map(w => `${w.name} ${w.value}v`).join('\n') + `\n**${trade.offer_value} val**`, inline: false }).setTimestamp()],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`staff_validate_${tid}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`staff_reject_${tid}`).setLabel('❌ Rejeter').setStyle(ButtonStyle.Danger),
          )] });
      }
    }
    await sendLog(guild, new EmbedBuilder().setColor(C.info).setAuthor({ name: `🤝 Trade #${tid} accepté` })
      .addFields({ name: '👤 Poster', value: `<@${trade.poster_id}>`, inline: true }, { name: '👤 Accepteur', value: `<@${user.id}>`, inline: true }).setTimestamp());
    return interaction.editReply(`✅ Trade **#${tid}** accepté ! Thread créé.`);
  }

  if (customId.startsWith('trade_cancel_')) {
    await interaction.deferReply({ ephemeral: true });
    const tid = parseInt(customId.replace('trade_cancel_', ''));
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (!trade) return interaction.editReply('❌ Trade introuvable.');
    if (trade.poster_id !== user.id && !hasStaffPerm(interaction.member)) return interaction.editReply('❌ Pas la permission.');
    db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tid);
    return interaction.editReply(`✅ Trade **#${tid}** annulé.`);
  }

  if (customId.startsWith('trade_middleman_')) {
    await interaction.deferReply({ ephemeral: true });
    const mmRole = guild.roles.cache.find(r => r.name.includes('Middleman'));
    const mmPanel = guild.channels.cache.find(c => c.name.includes('middleman-panel'));
    if (mmPanel && mmRole) await mmPanel.send(`🛡️ <@&${mmRole.id}> — Middleman demandé pour Trade **#${customId.split('_').pop()}** par <@${user.id}>`);
    return interaction.editReply('✅ Middleman appelé !');
  }

  // Duel
  if (customId.startsWith('duel_accept_')) {
    await interaction.deferReply();
    const duelId = parseInt(customId.replace('duel_accept_', ''));
    const duel = db.prepare('SELECT * FROM duels WHERE id=?').get(duelId);
    if (!duel || duel.status !== 'pending') return interaction.editReply('❌ Duel expiré.');
    if (user.id !== duel.challenged_id) return interaction.editReply('❌ Ce duel ne te concerne pas.');
    const challenger = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(duel.challenger_id);
    const challenged = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(duel.challenged_id);
    if ((challenger?.coins ?? 0) < duel.amount || (challenged?.coins ?? 0) < duel.amount) { db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled', duelId); return interaction.editReply('❌ Pièces insuffisantes.'); }
    const challengerWins = Math.random() < 0.5;
    const winner = challengerWins ? duel.challenger_id : duel.challenged_id;
    const loser = challengerWins ? duel.challenged_id : duel.challenger_id;
    db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(duel.amount, winner);
    db.prepare('UPDATE users SET coins=coins-? WHERE discord_id=?').run(duel.amount, loser);
    db.prepare('UPDATE duels SET status=?,winner_id=? WHERE id=?').run('completed', winner, duelId);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.gold).setAuthor({ name: `⚔️ DUEL TERMINÉ` }).setDescription([`🏆 **<@${winner}> GAGNE !**`, `💸 <@${loser}> perd **${duel.amount} 🪙**`].join('\n')).setTimestamp()], components: [] });
  }
  if (customId.startsWith('duel_refuse_')) {
    await interaction.deferReply();
    const duelId = parseInt(customId.replace('duel_refuse_', ''));
    const duel = db.prepare('SELECT * FROM duels WHERE id=?').get(duelId);
    if (!duel || duel.status !== 'pending') return interaction.editReply('❌ Duel expiré.');
    if (user.id !== duel.challenged_id) return interaction.editReply('❌ Ce duel ne te concerne pas.');
    db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled', duelId);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.danger).setDescription(`❌ <@${user.id}> a refusé le duel.`)], components: [] });
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
    if (!rb) return interaction.editReply(`❌ Pseudo **${username}** introuvable.`);
    const code = genCode();
    const ex = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
    if (ex) db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id), rb.name, code, did);
    else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did, String(rb.id), rb.name, code);
    try { const nv = interaction.guild.roles.cache.find(r => r.name === '🔒 Non Vérifié'); if (nv) await interaction.member.roles.add(nv).catch(() => {}); } catch {}
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info).setAuthor({ name: '🔗 Code généré !' }).setDescription([`Compte : **${rb.name}**`, '', '**Code à coller dans ta bio Roblox :**', `\`\`\`${code}\`\`\``, '→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)', '', 'Reviens et clique Vérifier.'].join('\n'))], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))] });
  }

  if (customId === 'modal_post_trade') {
    await interaction.deferReply({ ephemeral: true });
    const did = interaction.user.id;
    const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
    if (!user?.verified) return interaction.editReply('❌ Lie ton compte Roblox d\'abord.');
    const offreStr = interaction.fields.getTextInputValue('trade_offre');
    const offreVal = parseInt(interaction.fields.getTextInputValue('trade_offre_val')) || 0;
    const chercheStr = interaction.fields.getTextInputValue('trade_cherche');
    const od = parseWeapons(offreStr).map(n => ({ name: n, value: 0, tier: 'godly' }));
    const wd = parseWeapons(chercheStr).map(n => ({ name: n }));
    const res = db.prepare('INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value) VALUES (?,?,?,?)').run(did, JSON.stringify(od), JSON.stringify(wd), offreVal);
    const tid = res.lastInsertRowid;
    const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    const ch = interaction.guild.channels.cache.find(c => c.name.includes('post-trades'));
    if (!ch) return interaction.editReply('❌ Salon post-trades introuvable.');
    const msg = await ch.send({ embeds: [tradeEmbed(trade, user)], components: [tradeButtons(tid)] });
    db.prepare('UPDATE trades SET message_id=?,channel_id=? WHERE id=?').run(msg.id, ch.id, tid);
    return interaction.editReply(`✅ Trade **#${tid}** posté dans <#${ch.id}> !`);
  }

  if (customId === 'modal_shop_role_custom') {
    await interaction.deferReply({ ephemeral: true });
    const roleName = interaction.fields.getTextInputValue('role_name');
    const colorInput = interaction.fields.getTextInputValue('role_color').trim();
    const u = db.prepare('SELECT coins FROM users WHERE discord_id=?').get(interaction.user.id);
    if (!u || u.coins < 500) return interaction.editReply('❌ Pas assez de pièces.');
    const match = colorInput.match(/#?([0-9a-fA-F]{6})/);
    const color = match ? parseInt(match[1], 16) : C.purple;
    try {
      const r = await interaction.guild.roles.create({ name: roleName, color, hoist: false });
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (member) await member.roles.add(r).catch(() => {});
      db.prepare('UPDATE users SET coins=coins-500 WHERE discord_id=?').run(interaction.user.id);
      db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(interaction.user.id, 'custom_role', 500);
      return interaction.editReply(`✅ Rôle **${roleName}** créé et attribué !`);
    } catch (e) { return interaction.editReply(`❌ Erreur : ${e.message}`); }
  }

  // Tickets dynamiques
  if (customId.startsWith('modal_ticket_')) {
    await interaction.deferReply({ ephemeral: true });
    const catName = customId.replace('modal_ticket_', '');
    const reason = interaction.fields.getTextInputValue('reason');
    let reported_id = null, trade_id = null;
    try { reported_id = interaction.fields.getTextInputValue('reported_id') || null; } catch {}
    try { const v = interaction.fields.getTextInputValue('trade_id'); trade_id = v ? parseInt(v) : null; } catch {}
    const ch = await createTicket(interaction, catName, { reason, reported_id, trade_id });
    if (ch) return interaction.editReply(`✅ Ticket créé : <#${ch.id}>`);
  }
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
  if (interaction.isButton()) { try { await handleButton(interaction); } catch (e) { console.error('[BTN]', e.message); } return; }
  if (interaction.isModalSubmit()) { try { await handleModal(interaction); } catch (e) { console.error('[MODAL]', e.message); } }
});

// ── MESSAGE CREATE ────────────────────────────────────────────
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const wasBlocked = await handleAutomod(message);
  if (wasBlocked) return;

  const uid = message.author.id, now = Date.now();
  if (!msgCooldowns.has(uid) || now - msgCooldowns.get(uid) >= 60_000) {
    msgCooldowns.set(uid, now);
    db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
    const xpGain = Math.floor(Math.random() * 11) + 15;
    const coinsGain = Math.floor(Math.random() * 11) + 15;
    db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(coinsGain, uid);
    if (message.guild) await addXp(message.guild, uid, xpGain, 'message');
  }

  // Commandes vocaux privés
  if (message.content.startsWith('!')) {
    const pv = db.prepare('SELECT * FROM private_vocals WHERE owner_id=?').get(uid);
    if (!pv) return;
    const pvCh = message.guild?.channels.cache.get(pv.channel_id);
    if (!pvCh) return;
    const args = message.content.slice(1).trim().split(/\s+/), cmd = args[0].toLowerCase();
    if (cmd === 'open') { await pvCh.permissionOverwrites.edit(message.guild.id, { Connect: true }).catch(() => {}); await message.reply(`✅ Vocal ouvert.`); }
    else if (cmd === 'close') { await pvCh.permissionOverwrites.edit(message.guild.id, { Connect: false }).catch(() => {}); await message.reply(`🔒 Vocal fermé.`); }
    else if (cmd === 'add') { const m = message.mentions.members?.first(); if (!m) return; await pvCh.permissionOverwrites.edit(m.id, { Connect: true }).catch(() => {}); await message.reply(`✅ <@${m.id}> peut rejoindre.`); }
    else if (cmd === 'kick') { const m = message.mentions.members?.first(); if (!m) return; if (m.voice.channelId === pv.channel_id) { const fb = message.guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && !db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(c.id) && !c.name.toLowerCase().includes('afk')); if (fb) await m.voice.setChannel(fb).catch(() => {}); else await m.voice.disconnect().catch(() => {}); } await pvCh.permissionOverwrites.delete(m.id).catch(() => {}); await message.reply(`✅ <@${m.id}> expulsé.`); }
    else if (cmd === 'rename') { const n = args.slice(1).join(' '); if (n) { await pvCh.setName(n.slice(0, 32)).catch(() => {}); await message.reply(`✅ Renommé.`); } }
    return;
  }

  // Screenshot trade
  if (!message.channel.isThread()) return;
  const trade = db.prepare('SELECT * FROM trades WHERE thread_id=? AND status=?').get(message.channel.id, 'in_progress');
  if (!trade || trade.screenshot_verified === 1) return;
  const att = message.attachments.find(a => a.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(a.name ?? ''));
  if (!att) return;
  if (![trade.poster_id, trade.accepter_id].includes(uid)) return;
  db.prepare('UPDATE trades SET screenshot_url=? WHERE id=?').run(att.url, trade.id);
  const gld = message.guild;
  const mmPanel = gld?.channels.cache.find(c => c.name.includes('middleman-panel'));
  if (mmPanel) {
    const staffRoles = ['👑 Owner','⚡ Admin','🛡️ Modérateur','🤝 Middleman'].map(n => gld.roles.cache.find(r => r.name === n)).filter(Boolean);
    await mmPanel.send({
      content: `${staffRoles.map(r => `<@&${r.id}>`).join(' ')}\n📸 **Screenshot — Trade #${String(trade.id).padStart(4,'0')}**`,
      embeds: [new EmbedBuilder().setColor(C.warning).setAuthor({ name: `📸 Vérification — Trade #${String(trade.id).padStart(4,'0')}` }).setImage(att.url)
        .addFields({ name: '👤 Poster', value: `<@${trade.poster_id}>`, inline: true }, { name: '👤 Accepter', value: `<@${trade.accepter_id}>`, inline: true })
        .setFooter({ text: 'Clique ✅ Valider ou ❌ Rejeter' }).setTimestamp()],
      components: [staffVerifyButtons(trade.id)],
    });
  }
  await message.channel.send(`📸 **Screenshot reçu de <@${uid}>** — En attente de validation staff...`);
});

// ── VOICE STATE ───────────────────────────────────────────────
client.on(Events.VoiceStateUpdate, async (old, neu) => {
  const uid = neu.id || old.id, guild = neu.guild || old.guild;
  const now = Math.floor(Date.now() / 1000);

  if (!old.channelId && neu.channelId) {
    if (!isIdleChannel(neu.channel)) db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,?)`).run(uid, now);
  }
  if (old.channelId && !neu.channelId) {
    if (!isIdleChannel(old.channel)) {
      const s = db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);
      if (s) {
        const min = Math.floor((now - s.joined_at) / 60);
        if (min > 0) {
          db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
          db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min, min * 10, uid);
          await addXp(guild, uid, min * 10, 'vocal').catch(() => {});
          if (min >= 5) {
            await sendLog(guild, new EmbedBuilder().setColor(C.info)
              .setAuthor({ name: '🎙️ Session vocale terminée' })
              .addFields({ name: '👤 Membre', value: `<@${uid}>`, inline: true }, { name: '⏱️ Durée', value: `**${min} min**`, inline: true }, { name: '🪙 Gains', value: `+${min * 10} 🪙 · +${min * 10} XP`, inline: true })
              .setTimestamp());
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
    if (!isIdleChannel(old.channel)) {
      const s = db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);
      if (s) { const min = Math.floor((now - s.joined_at) / 60); if (min > 0) { db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid); db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min, min * 10, uid); await addXp(guild, uid, min * 10, 'vocal').catch(() => {}); } }
      db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);
    }
    if (!isIdleChannel(neu.channel)) db.prepare('INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,?)').run(uid, now);
    if (old.channel) { const pv = db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(old.channelId); if (pv && old.channel.members.size === 0) { db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(old.channelId); await old.channel.delete('Vocal privé vide').catch(() => {}); } }
  }
});

// ── MEMBER JOIN ───────────────────────────────────────────────
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
      .addFields({ name: '👤', value: `<@${member.id}> (${member.user.tag})`, inline: true }, { name: '👥 Total', value: `${member.guild.memberCount}`, inline: true })
      .setTimestamp());
  } catch (e) { console.error('[MemberAdd]', e.message); }
});

client.on(Events.GuildMemberRemove, async member => {
  await updateStatChannels(member.guild);
  await sendLog(member.guild, new EmbedBuilder().setColor(C.danger).setAuthor({ name: '👋 Membre parti' }).addFields({ name: '👤', value: member.user.tag, inline: true }, { name: '👥 Total', value: `${member.guild.memberCount}`, inline: true }).setTimestamp());
});

client.on(Events.ChannelDelete, ch => {
  db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(ch.id);
  db.prepare('UPDATE tickets SET status=? WHERE channel_id=? AND status!=?').run('closed', ch.id, 'closed');
});

// ── YOUTUBE ───────────────────────────────────────────────────
function startYoutubeWatcher(client) {
  const { YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID } = process.env;
  if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) return;
  cron.schedule('*/5 * * * *', async () => {
    try {
      const r = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&order=date&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`);
      const video = r.data.items?.[0]; if (!video) return;
      const videoId = video.id.videoId;
      const lastRow = db.prepare('SELECT * FROM youtube_last WHERE id=1').get();
      if (lastRow.video_id === videoId) return;
      db.prepare('UPDATE youtube_last SET video_id=?,checked_at=? WHERE id=1').run(videoId, Math.floor(Date.now() / 1000));
      const { snippet } = video, url = `https://www.youtube.com/watch?v=${videoId}`;
      for (const [, gld] of client.guilds.cache) {
        const ch = gld.channels.cache.find(c => c.name.includes('vidéos'));
        if (!ch) continue;
        await ch.send({ content: `📺 @everyone **Wenzy vient de poster une vidéo !**\n${url}`, embeds: [new EmbedBuilder().setColor(C.danger).setAuthor({ name: '🔴 NOUVELLE VIDÉO — Wenzy' }).setDescription(`**${snippet.title}**`).setImage(snippet.thumbnails.high?.url).setTimestamp()] });
      }
    } catch (e) { console.error('[YouTube]', e.message); }
  });
}

// ── CLIENT READY ──────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`✅ Wenzy Bot v7 : ${client.user.tag}`);
  client.user.setActivity('MM2 Trades 🗡️', { type: 3 });
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const body = commands.map(c => c.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body });
    console.log(`✅ ${body.length} commandes déployées`);
  } catch (e) { console.error('❌ Deploy:', e); }

  startYoutubeWatcher(client);

  cron.schedule('*/15 * * * *', async () => {
    for (const [, gld] of client.guilds.cache) await updateStatChannels(gld);
  });
  cron.schedule('0 0 * * *', async () => {
    for (const [, gld] of client.guilds.cache) {
      await updateLeaderboard(gld, 'trades');
      await updateLeaderboard(gld, 'coins');
      await updateLeaderboard(gld, 'xp');
    }
  });

  for (const [, gld] of client.guilds.cache) {
    await gld.members.fetch().catch(() => {});
    await restoreAllRoles(gld);
    await updateStatChannels(gld);
  }

  const activeGiveaways = db.prepare('SELECT * FROM giveaways WHERE status=?').all('active');
  for (const gw of activeGiveaways) {
    const remaining = (gw.ends_at * 1000) - Date.now();
    if (remaining > 0) setTimeout(() => endGiveaway(client, gw.id), remaining);
    else await endGiveaway(client, gw.id);
  }
  console.log('[Wenzy Bot v7] Prêt. 6767');
});

client.login(process.env.DISCORD_TOKEN);
