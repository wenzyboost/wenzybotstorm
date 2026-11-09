// ═══════════════════════════════════════════════════════════════
//  WENZY BOT v5 — bot.js  (single file, Railway ready)
//  node bot.js
//  CHANGELOG v5:
//   - Modal post-trade: champs TOTAL VALUE manuels (offre + recherche)
//   - Salon dédié classement-pièces, mis à jour toutes les 10 min
//   - Salon bienvenue avec embed + avatar à chaque join
//   - Vocaux privés: création via bouton, commandes !open !close !add !kick !rename
//   - AFK + Sleep vocaux: 0 coins, 0 XP
//   - Paliers XP message (15 paliers) + paliers XP vocal (10 paliers) avec rôles auto
//   - Persistence rôles au reboot (restore rank/xp roles sur ClientReady)
//   - /updatevalue supprimé du setup (auto-sync gardé)
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
    coins INTEGER DEFAULT 0, xp INTEGER DEFAULT 0,
    vocal_minutes INTEGER DEFAULT 0,
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
  CREATE TABLE IF NOT EXISTS shop_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    price INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    emoji TEXT DEFAULT '🎁',
    active INTEGER DEFAULT 1,
    added_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    winners_count INTEGER DEFAULT 1,
    host_id TEXT NOT NULL,
    ends_at INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    participants TEXT DEFAULT '[]',
    winners TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS private_vocals (
    channel_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  INSERT OR IGNORE INTO youtube_last (id,checked_at) VALUES (1,0);
`);

// Migrations safe
try { db.exec('ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN vocal_minutes INTEGER DEFAULT 0'); } catch {}

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
];
const _si = db.prepare('INSERT OR IGNORE INTO shop_items (name,description,price,item_type,emoji) VALUES (?,?,?,?,?)');
for (const [n,d,p,t,e] of defaultShopItems) _si.run(n,d,p,t,e);

// ── RANKS TRADE ──────────────────────────────────────────────
function getRank(n){ if(n>=50)return'elite'; if(n>=20)return'trusted'; if(n>=5)return'confirmed'; return'new'; }
function getRankLabel(r){ return({new:'🆕 Nouveau',confirmed:'✅ Confirmé',trusted:'⭐ Fiable',elite:'👑 Elite'})[r]??'🆕 Nouveau'; }

// ── XP PALIERS MESSAGE ───────────────────────────────────────
const XP_MSG_TIERS = [
  { xp:    0, name:'💬 Lvl 0', color:0x95A5A6 },
  { xp:   50, name:'💬 Lvl 1', color:0x7F8C8D },
  { xp:  150, name:'💬 Lvl 2', color:0x2ECC71 },
  { xp:  300, name:'💬 Lvl 3', color:0x27AE60 },
  { xp:  500, name:'💬 Lvl 4', color:0x3498DB },
  { xp:  800, name:'💬 Lvl 5', color:0x2980B9 },
  { xp: 1200, name:'💬 Lvl 6', color:0x9B59B6 },
  { xp: 1700, name:'💬 Lvl 7', color:0x8E44AD },
  { xp: 2500, name:'💬 Lvl 8', color:0xF39C12 },
  { xp: 3500, name:'💬 Lvl 9', color:0xE67E22 },
  { xp: 5000, name:'💬 Lvl 10', color:0xE74C3C },
  { xp: 7000, name:'💬 Lvl 11', color:0xC0392B },
  { xp:10000, name:'💬 Lvl 12', color:0xF1C40F },
  { xp:14000, name:'💬 Lvl 13', color:0xF39C12 },
  { xp:20000, name:'💬 Lvl 14', color:0x1ABC9C },
  { xp:30000, name:'💬 Lvl 15', color:0x16A085 },
];

// ── XP PALIERS VOCAL ─────────────────────────────────────────
const XP_VOCAL_TIERS = [
  { min:    0, name:'🎙️ Vocal Lvl 0', color:0x95A5A6 },
  { min:   30, name:'🎙️ Vocal Lvl 1', color:0x7F8C8D },
  { min:  100, name:'🎙️ Vocal Lvl 2', color:0x2ECC71 },
  { min:  300, name:'🎙️ Vocal Lvl 3', color:0x27AE60 },
  { min:  600, name:'🎙️ Vocal Lvl 4', color:0x3498DB },
  { min: 1200, name:'🎙️ Vocal Lvl 5', color:0x9B59B6 },
  { min: 2000, name:'🎙️ Vocal Lvl 6', color:0xF39C12 },
  { min: 3500, name:'🎙️ Vocal Lvl 7', color:0xE74C3C },
  { min: 6000, name:'🎙️ Vocal Lvl 8', color:0xF1C40F },
  { min:10000, name:'🎙️ Vocal Lvl 9', color:0x1ABC9C },
  { min:18000, name:'🎙️ Vocal Lvl 10', color:0xE74C3C },
];

function getXpMsgTier(xp) {
  let tier = XP_MSG_TIERS[0];
  for (const t of XP_MSG_TIERS) { if (xp >= t.xp) tier = t; }
  return tier;
}
function getVocalTier(min) {
  let tier = XP_VOCAL_TIERS[0];
  for (const t of XP_VOCAL_TIERS) { if (min >= t.min) tier = t; }
  return tier;
}

async function applyXpRoles(guild, member, xp, vocalMin) {
  try {
    const msgTier  = getXpMsgTier(xp);
    const vocTier  = getVocalTier(vocalMin);
    const allMsgNames  = XP_MSG_TIERS.map(t=>t.name);
    const allVocNames  = XP_VOCAL_TIERS.map(t=>t.name);
    // Remove old xp msg roles
    for (const rn of allMsgNames) {
      const r = guild.roles.cache.find(x=>x.name===rn);
      if (r && r.name !== msgTier.name && member.roles.cache.has(r.id)) await member.roles.remove(r).catch(()=>{});
    }
    // Apply current xp msg role
    let targetMsg = guild.roles.cache.find(x=>x.name===msgTier.name);
    if (!targetMsg && msgTier.xp > 0) targetMsg = await guild.roles.create({name:msgTier.name,color:msgTier.color,hoist:false}).catch(()=>null);
    if (targetMsg && !member.roles.cache.has(targetMsg.id)) await member.roles.add(targetMsg).catch(()=>{});
    // Remove old vocal roles
    for (const rn of allVocNames) {
      const r = guild.roles.cache.find(x=>x.name===rn);
      if (r && r.name !== vocTier.name && member.roles.cache.has(r.id)) await member.roles.remove(r).catch(()=>{});
    }
    // Apply current vocal role
    let targetVoc = guild.roles.cache.find(x=>x.name===vocTier.name);
    if (!targetVoc && vocTier.min > 0) targetVoc = await guild.roles.create({name:vocTier.name,color:vocTier.color,hoist:false}).catch(()=>null);
    if (targetVoc && !member.roles.cache.has(targetVoc.id)) await member.roles.add(targetVoc).catch(()=>{});
  } catch(e) { console.error('[XPRoles]', e.message); }
}

// ── COLORS ───────────────────────────────────────────────────
const C={primary:0x7B2FBE,success:0x2ECC71,warning:0xF39C12,danger:0xE74C3C,info:0x3498DB,gold:0xF1C40F};

// ── PERMISSION HELPER ────────────────────────────────────────
function hasStaffPerm(member) {
  if (!member) return false;
  const staffRoleNames = ['👑 Owner','⚡ Admin','🛡️ Modérateur','🤝 Middleman'];
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    staffRoleNames.some(n => member.roles.cache.find(r => r.name === n));
}

// ── AFK / SLEEP DETECTION ────────────────────────────────────
function isIdleChannel(ch) {
  if (!ch) return false;
  const n = ch.name.toLowerCase();
  return n.includes('afk') || n.includes('sleep');
}

// ── TRADE EMBED ──────────────────────────────────────────────
function tradeEmbed(trade, poster) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  const diff = trade.offer_value - trade.want_value, fair = Math.abs(diff) <= 20;
  const offreLines = off.map(w => `• ${w.name} _(${w.value} val)_`);
  offreLines.push(`\n**TOTAL VALUE : ${trade.offer_value} val**`);
  const wantLines = want.map(w => `• ${w.name}`);
  if (trade.want_value > 0) wantLines.push(`\n**TOTAL VALUE : ${trade.want_value} val**`);
  return new EmbedBuilder().setColor(C.primary)
    .setTitle(`🗡️ TRADE #${String(trade.id).padStart(4,'0')}`)
    .setThumbnail(poster?.roblox_avatar ?? null)
    .addFields(
      {name:'👤 Trader',value:`<@${trade.poster_id}>${poster?.verified?' ✅':' ⚠️'}\n⭐ ${poster?.trade_count??0} trades | ${poster?.vouch_count??0} vouches`,inline:true},
      {name:'📤 OFFRE',value:offreLines.join('\n')||'—',inline:true},
      {name:'📥 RECHERCHE',value:wantLines.join('\n')||'—',inline:true},
      {name:'⚖️ Équité',value:fair?'⚖️ Fair':(trade.offer_value>trade.want_value?'📈 Avantageux trader':'📉 Unfair'),inline:true},
      {name:'🏆 Rang',value:getRankLabel(poster?.rank??'new'),inline:true},
    ).setFooter({text:`Trade #${trade.id} • ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}`}).setTimestamp();
}

function tradeInProgressEmbed(trade, poster, accepter) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  const offreLines = off.map(w => `• ${w.name} _(${w.value} val)_`);
  offreLines.push(`\n**TOTAL VALUE : ${trade.offer_value} val**`);
  const wantLines = want.map(w => `• ${w.name}`);
  if (trade.want_value > 0) wantLines.push(`\n**TOTAL VALUE : ${trade.want_value} val**`);
  return new EmbedBuilder().setColor(C.warning)
    .setTitle(`⏳ TRADE #${String(trade.id).padStart(4,'0')} — EN COURS`)
    .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
    .addFields(
      {name:'📤 OFFRE',value:offreLines.join('\n')||'—',inline:true},
      {name:'📥 RECHERCHE',value:wantLines.join('\n')||'—',inline:true},
    ).setFooter({text:`Trade en cours depuis ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}`}).setTimestamp();
}

function tradeCompletedEmbed(trade) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  const offreLines = off.map(w => `• ${w.name} _(${w.value} val)_`);
  offreLines.push(`\n**TOTAL VALUE : ${trade.offer_value} val**`);
  const wantLines = want.map(w => `• ${w.name}`);
  if (trade.want_value > 0) wantLines.push(`\n**TOTAL VALUE : ${trade.want_value} val**`);
  return new EmbedBuilder().setColor(C.success)
    .setTitle(`✅ TRADE #${String(trade.id).padStart(4,'0')} — COMPLÉTÉ`)
    .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
    .addFields(
      {name:'📤 OFFRE',value:offreLines.join('\n')||'—',inline:true},
      {name:'📥 RECHERCHE',value:wantLines.join('\n')||'—',inline:true},
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
  const offreLines = off.map(w => `• ${w.name} _(${w.value} val)_`);
  offreLines.push(`\n**TOTAL VALUE : ${trade.offer_value} val**`);
  const wantLines = want.map(w => `• ${w.name}`);
  if (trade.want_value > 0) wantLines.push(`\n**TOTAL VALUE : ${trade.want_value} val**`);
  return new EmbedBuilder().setColor(fair ? C.success : C.warning)
    .setTitle(`🗡️ TRADE EN COURS — #${String(trade.id).padStart(4,'0')}`)
    .setDescription([
      `> <@${trade.poster_id}> × <@${trade.accepter_id}>`,
      '', '**📋 Pour finaliser ce trade :**',
      '1. Rejoins le serveur privé MM2 (lien ci-dessous)',
      '2. Fais le trade en jeu',
      '3. Prends un screenshot de l\'écran **"YOU HAVE ACCEPTED"**',
      '4. Envoie le screenshot dans CE salon',
      '5. ⚠️ Un **membre du staff** validera manuellement',
    ].join('\n'))
    .addFields(
      {name:`📤 OFFRE`,value:offreLines.join('\n'),inline:true},
      {name:`📥 RECHERCHE`,value:wantLines.join('\n'),inline:true},
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

function staffVerifyButtons(tradeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`staff_validate_${tradeId}`).setLabel('✅ Valider le trade').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`staff_reject_${tradeId}`).setLabel('❌ Rejeter screenshot').setStyle(ButtonStyle.Danger),
  );
}

function profileEmbed(user, inv) {
  const msgTier  = getXpMsgTier(user.xp??0);
  const vocTier  = getVocalTier(user.vocal_minutes??0);
  return new EmbedBuilder().setColor(C.primary)
    .setTitle(`👤 ${user.roblox_username??'Non lié'}`).setThumbnail(user.roblox_avatar??null)
    .addFields(
      {name:'🎮 Roblox',value:user.verified?`${user.roblox_username} ✅`:'❌ Non lié',inline:true},
      {name:'🏆 Rang Trade',value:getRankLabel(user.rank),inline:true},
      {name:'⭐ Réputation',value:`✅ ${user.trade_count} trades\n💬 ${user.vouch_count} vouches\n🚨 ${user.report_count} reports`,inline:true},
      {name:'📦 Inventory',value:(inv.length?inv.map(w=>`• ${w.weapon_name}`).join('\n').slice(0,1000):'— Vide'),inline:false},
      {name:'🪙 Pièces',value:`${user.coins}`,inline:true},
      {name:'✨ XP',value:`${user.xp??0} — ${msgTier.name}`,inline:true},
      {name:'🎙️ Vocal',value:`${user.vocal_minutes??0} min — ${vocTier.name}`,inline:true},
    ).setTimestamp();
}

function mmPanelEmbed(trade, poster, accepter) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons), diff = trade.offer_value - trade.want_value;
  const offreLines = off.map(w => `${w.name} — ${w.value} val`);
  offreLines.push(`**TOTAL : ${trade.offer_value} val**`);
  return new EmbedBuilder().setColor(C.info)
    .setTitle(`🛡️ PANEL MIDDLEMAN — TRADE #${String(trade.id).padStart(4,'0')}`)
    .addFields(
      {name:'👤 Poster',value:`<@${trade.poster_id}> (${poster?.trade_count??0} trades, ${poster?.vouch_count??0} vouches)`,inline:true},
      {name:'👤 Accepter',value:`<@${trade.accepter_id}> (${accepter?.trade_count??0} trades, ${accepter?.vouch_count??0} vouches)`,inline:true},
      {name:'📤 OFFRE poster',value:offreLines.join('\n'),inline:false},
      {name:'📥 RECHERCHE',value:want.map(w=>w.name).join('\n'),inline:false},
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

// ── MM2 VALUES SYNC ──────────────────────────────────────────
async function fetchMM2Values() {
  let synced = 0;
  const stmt = db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now'))
    ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`);
  try {
    const r = await axios.get('https://bloxultra.com/api/values/mm2', { timeout: 10000, headers: { 'User-Agent': 'WenzyBot/5.0', 'Accept': 'application/json' } });
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

// ── LEADERBOARD TRADES ───────────────────────────────────────
async function updateLeaderboardChannel(guild) {
  const ch = guild.channels.cache.find(c => c.name.includes('leaderboard') && !c.name.includes('pièces') && !c.name.includes('pieces'));
  if (!ch) return;
  const top = db.prepare('SELECT discord_id,roblox_username,trade_count,vouch_count,coins,xp,rank FROM users ORDER BY trade_count DESC LIMIT 10').all();
  if (!top.length) return;
  const medals = ['🥇','🥈','🥉'];
  const msgs = await ch.messages.fetch({ limit: 5 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  await ch.send({ embeds: [new EmbedBuilder().setColor(C.gold).setTitle('🏆 Top Traders MM2 — Classement Live')
    .setDescription(top.map((u,i)=>`${medals[i]??`**${i+1}.**`} <@${u.discord_id}> — ✅ **${u.trade_count}** trades | 💬 **${u.vouch_count}** vouches | 🪙 ${u.coins} pièces | ✨ ${u.xp??0} XP | ${getRankLabel(u.rank)}`).join('\n'))
    .setFooter({text:'Mis à jour automatiquement'}).setTimestamp()] });
}

// ── LEADERBOARD PIÈCES (salon dédié, 10 min) ─────────────────
async function updateCoinsLeaderboardChannel(guild) {
  const ch = guild.channels.cache.find(c => c.name.includes('classement-pièces') || c.name.includes('classement-pieces'));
  if (!ch) return;
  const top = db.prepare('SELECT discord_id,coins FROM users ORDER BY coins DESC LIMIT 15').all();
  if (!top.length) return;
  const medals = ['🥇','🥈','🥉'];
  const msgs = await ch.messages.fetch({ limit: 5 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  await ch.send({ embeds: [new EmbedBuilder().setColor(C.gold).setTitle('🪙 Classement Pièces')
    .setDescription(top.map((u,i)=>`${medals[i]??`**${i+1}.**`} <@${u.discord_id}> — **${u.coins} 🪙**`).join('\n'))
    .setFooter({text:'Mis à jour automatiquement | toutes les 10 min'}).setTimestamp()] });
}

// ── SHARED FUNCTIONS ─────────────────────────────────────────
async function doVerify(interaction) {
  const did = interaction.user.id;
  const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if (!user?.verify_code) return interaction.editReply('❌ Lance d\'abord la vérification via le bouton dans le salon **vérification**.');
  if (user.verified) return interaction.editReply(`✅ Déjà vérifié : **${user.roblox_username}** !`);
  let desc; try { desc = await getRobloxDescription(user.roblox_id); } catch { return interaction.editReply('❌ Erreur Roblox API. Réessaie.'); }
  if (!desc.includes(user.verify_code)) return interaction.editReply(`❌ Code \`${user.verify_code}\` introuvable dans ta bio.\nAssure-toi de l\'avoir sauvegardé, puis réessaie.`);
  const avatar = await getRobloxAvatar(user.roblox_id);
  db.prepare('UPDATE users SET verified=1,roblox_avatar=?,rank=? WHERE discord_id=?').run(avatar, 'new', did);
  try {
    const g = interaction.guild;
    const nv = g.roles.cache.find(r => r.name === '🆕 Nouveau');
    const nonv = g.roles.cache.find(r => r.name === '🔒 Non Vérifié');
    if (nonv) await interaction.member.roles.remove(nonv).catch(() => {});
    if (nv) await interaction.member.roles.add(nv).catch(() => {});
  } catch {}
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.success).setTitle('✅ Compte Roblox vérifié !')
    .setThumbnail(avatar)
    .setDescription([`Discord lié à **${user.roblox_username}** !`,'','Tu as maintenant accès à tous les salons.','Poste ton premier trade via **poster-un-trade** !'].join('\n'))] });
}

async function postTrade(interaction, did, offreStr, chercheStr, manualOfferVal, manualWantVal) {
  const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if (!user?.verified) return interaction.editReply('❌ Lie ton compte Roblox d\'abord via le salon **vérification**.');

  const { total: autoOv, details: od } = calcValue(parseWeapons(offreStr));
  const { total: autoWv, details: wd } = calcValue(parseWeapons(chercheStr));

  // Si total value manuel fourni → override
  const ov = (manualOfferVal > 0) ? manualOfferVal : autoOv;
  const wv = (manualWantVal > 0) ? manualWantVal : autoWv;

  const unknownOffer  = od.filter(w => w.value === 0).map(w => w.name);
  const unknownWant   = wd.filter(w => w.value === 0).map(w => w.name);
  const unknownLines  = [];
  if (unknownOffer.length) unknownLines.push(`📤 Offre inconnue : **${unknownOffer.join(', ')}**`);
  if (unknownWant.length)  unknownLines.push(`📥 Recherche inconnue : **${unknownWant.join(', ')}**`);
  const unknownWarn = unknownLines.length ? `\n⚠️ Armes non trouvées dans la base :\n${unknownLines.join('\n')}` : '';

  if (user.rank === 'new' && ov > 100) return interaction.editReply('⚠️ Nouveaux membres limités à **100 val** max. Fais quelques trades pour débloquer.');

  const res = db.prepare('INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value,want_value) VALUES (?,?,?,?,?)')
    .run(did, JSON.stringify(od), JSON.stringify(wd), ov, wv);
  const tid = res.lastInsertRowid;
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
  const ch = interaction.guild.channels.cache.find(c => c.name.includes('post-trades'));
  if (!ch) return interaction.editReply('❌ Salon post-trades introuvable. Lance `/wenzy-setup`.');
  const msg = await ch.send({ embeds: [tradeEmbed(trade, user)], components: [tradeButtons(tid)] });
  db.prepare('UPDATE trades SET message_id=?,channel_id=? WHERE id=?').run(msg.id, ch.id, tid);
  await interaction.editReply(`✅ Trade **#${tid}** posté dans <#${ch.id}> !${unknownWarn}`);
}

async function cancelTrade(interaction, did, tradeId) {
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if (!trade) return interaction.editReply('❌ Trade introuvable.');
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || hasStaffPerm(interaction.member);
  if (trade.poster_id !== did && !isAdmin) return interaction.editReply('❌ Seul le posteur ou un staff peut annuler.');
  if (!['open','in_progress'].includes(trade.status)) return interaction.editReply('❌ Ce trade ne peut plus être annulé.');
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
      uid===trade.poster_id?trade.accepter_id:trade.poster_id, uid, tradeId
    );
    db.prepare('UPDATE users SET vouch_count=vouch_count+1 WHERE discord_id=?').run(uid);
    try {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (member) {
        const freshUser = db.prepare('SELECT * FROM users WHERE discord_id=?').get(uid);
        const rankRoleMap={new:'🆕 Nouveau',confirmed:'✅ Confirmé',trusted:'⭐ Fiable',elite:'👑 Elite'};
        const targetRoleName = rankRoleMap[freshUser.rank];
        const allRankRoles = Object.values(rankRoleMap);
        for (const rn of allRankRoles) { const r=guild.roles.cache.find(x=>x.name===rn); if(r&&rn!==targetRoleName)await member.roles.remove(r).catch(()=>{}); }
        const targetRole = guild.roles.cache.find(x => x.name === targetRoleName);
        if (targetRole) await member.roles.add(targetRole).catch(() => {});
        await applyXpRoles(guild, member, freshUser.xp??0, freshUser.vocal_minutes??0);
      }
    } catch {}
  }
  if (trade.message_id && trade.channel_id) {
    try { const ch=await guild.channels.fetch(trade.channel_id).catch(()=>null); if(ch){const msg=await ch.messages.fetch(trade.message_id).catch(()=>null); if(msg)await msg.edit({embeds:[tradeCompletedEmbed(trade)],components:[]}).catch(()=>{});} } catch {}
  }
  const vCh = guild.channels.cache.find(c => c.name.includes('vouches') && !c.name.includes('category'));
  if (vCh) {
    const poster   = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter = db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.accepter_id);
    const off  = JSON.parse(trade.offer_weapons);
    const want = JSON.parse(trade.want_weapons);
    const offerLines = off.map(w => `• ${w.name}${w.value > 0 ? ` _(${w.value} val)_` : ''}`);
    offerLines.push(`**TOTAL : ${trade.offer_value} val**`);
    const wantLines  = want.map(w => `• ${w.name}${w.value > 0 ? ` _(${w.value} val)_` : ''}`);
    if (trade.want_value > 0) wantLines.push(`**TOTAL : ${trade.want_value} val**`);
    const embed = new EmbedBuilder().setColor(C.success)
      .setTitle(`✅ VOUCH — TRADE #${String(tradeId).padStart(4,'0')} COMPLÉTÉ`)
      .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
      .addFields(
        {name:`📤 ${poster?.roblox_username??'Trader'} (${getRankLabel(poster?.rank??'new')})`,  value: offerLines.join('\n'), inline: true},
        {name:`📥 ${accepter?.roblox_username??'Accepter'} (${getRankLabel(accepter?.rank??'new')})`, value: wantLines.join('\n'),  inline: true},
        {name:'💰 Récompenses', value:`+50 🪙 chacun | +1 vouch mutuel`, inline: false},
      ).setTimestamp();
    if (screenshotUrl) embed.setImage(screenshotUrl);
    await vCh.send({ embeds: [embed] });
  }
  if (trade.thread_id) {
    try {
      const t = await guild.channels.fetch(trade.thread_id).catch(() => null);
      if (t) {
        await t.send(['🎉 **Trade finalisé !**','',`✅ <@${trade.poster_id}> × <@${trade.accepter_id}>`,`+50 🪙 chacun | +1 vouch mutuel`,'','_Ce salon sera archivé dans 10 secondes._'].join('\n'));
        setTimeout(async()=>{try{await t.setArchived(true,'Trade terminé');}catch{}},10000);
      }
    } catch {}
  }
  await updateLeaderboardChannel(guild);
  await updateCoinsLeaderboardChannel(guild);
  return true;
}

// ── GIVEAWAY HELPERS ─────────────────────────────────────────
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
      .setTitle(`🎉 GIVEAWAY TERMINÉ — ${gw.prize}`)
      .setDescription(winners.length > 0
        ? `**Gagnant(s) :**\n${winners.map(w=>`🏆 <@${w}>`).join('\n')}`
        : '😕 Personne n\'a participé.')
      .addFields(
        {name:'🎁 Prix',value:gw.prize,inline:true},
        {name:'👥 Participants',value:`${participants.length}`,inline:true},
        {name:'🎰 Gagnants',value:`${winners.length}/${gw.winners_count}`,inline:true},
      ).setFooter({text:`Giveaway #${gw.id} — Organisé par <@${gw.host_id}>`}).setTimestamp();
    if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    const winnerMention = winners.length > 0 ? winners.map(w=>`<@${w}>`).join(', ') : 'aucun';
    await ch.send(`🎊 **Fin du giveaway !** Félicitations à ${winnerMention} ! Prix : **${gw.prize}**`);
  } catch (e) { console.error('[Giveaway end]', e.message); }
}

// ── SHOP EMBED ───────────────────────────────────────────────
async function postShopEmbed(ch) {
  const msgs = await ch.messages.fetch({ limit: 10 });
  for (const m of msgs.values()) if (m.author.bot) await m.delete().catch(() => {});
  const items = db.prepare('SELECT * FROM shop_items WHERE active=1 ORDER BY price ASC').all();
  const itemLines = items.map(i => `${i.emoji} **${i.name}** — **${i.price} 🪙**\n> ${i.description??'—'}`).join('\n\n');
  await ch.send({
    embeds: [new EmbedBuilder().setColor(C.gold)
      .setTitle('🛒 Boutique Wenzy')
      .setDescription([
        '**Dépense tes 🪙 pour débloquer des avantages exclusifs !**','',
        '━━━━━━━━━━━━━━━━━━━━━━━',
        itemLines || '_Aucun item disponible_',
        '━━━━━━━━━━━━━━━━━━━━━━━','',
        '**Comment gagner des 🪙 ?**',
        '• +5 🪙 par message _(cooldown 1 min)_',
        '• +1 🪙 par minute en vocal _(hors AFK/Sleep)_',
        '• +50 🪙 par trade complété',
      ].join('\n'))
      .setFooter({text:'Clique sur un bouton pour acheter'})
      .setTimestamp()],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_role_custom').setLabel('🎨 Rôle Custom — 500 🪙').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('shop_vip').setLabel('👑 VIP — 1 000 🪙').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('shop_elite_badge').setLabel('🏆 Elite — 10 000 🪙').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_mes_pieces').setLabel('🪙 Voir mes pièces').setStyle(ButtonStyle.Success),
      ),
    ],
  });
}

// ── RESTORE ROLES ON BOOT ────────────────────────────────────
async function restoreAllRoles(guild) {
  console.log('[Boot] Restauration des rôles...');
  const allUsers = db.prepare('SELECT * FROM users WHERE verified=1').all();
  const rankRoleMap={new:'🆕 Nouveau',confirmed:'✅ Confirmé',trusted:'⭐ Fiable',elite:'👑 Elite'};
  let count = 0;
  for (const u of allUsers) {
    try {
      const member = await guild.members.fetch(u.discord_id).catch(() => null);
      if (!member) continue;
      // Rank role
      const targetRank = rankRoleMap[u.rank??'new'];
      const rrole = guild.roles.cache.find(r=>r.name===targetRank);
      if (rrole && !member.roles.cache.has(rrole.id)) await member.roles.add(rrole).catch(()=>{});
      // XP roles
      await applyXpRoles(guild, member, u.xp??0, u.vocal_minutes??0);
      count++;
    } catch {}
  }
  console.log(`[Boot] ${count} membres restaurés`);
}

// ── VOCAL PRIVÉ HELPERS ──────────────────────────────────────
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
    await member.voice.setChannel(ch).catch(()=>{});
    return ch;
  } catch(e) { console.error('[PV]', e.message); return null; }
}

// ── COMMANDS ─────────────────────────────────────────────────
const commands = [

  // /wenzy-setup
  { data: new SlashCommandBuilder().setName('wenzy-setup').setDescription('🏗️ Configure (ou reset) le serveur complet').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild, log = [];
      log.push('🧹 Nettoyage en cours...');
      const channelNamesToDelete = [
        '🔑┃verification','📌┃règles-et-info','📊┃leaderboard','📋┃logs','🔗┃link-roblox',
        '🗡️┃post-trades','📬┃poster-un-trade','💰┃price-check','🏆┃vouches','🛡️┃middleman-panel',
        '📦┃weapon-values','💬┃général','📺┃vidéos-wenzy','🎙️┃vocal-général','🛒┃boutique',
        '🔒 VÉRIFICATION','📌 WENZY SYSTEM','🗡️ MM2 TRADING','💬 COMMUNAUTÉ','🛒 ECONOMY',
        '👋┃bienvenue','🪙┃classement-pièces','🎙️VOCAUX PRIVÉS','🏗️ VOCAUX',
        '🏗️ CRÉER UN VOCAL','🎙️┃créer-un-vocal','🔇┃afk','😴┃sleep',
        '🎙️┃vocal-1','🎙️┃vocal-2','🎙️┃vocal-3',
        '🗂️ VOCAUX PRIVÉS','🗂️ VOCAUX',
        'VOCAUX PRIVÉS',
      ];
      for (const ch of guild.channels.cache.values()) {
        if(channelNamesToDelete.includes(ch.name)||ch.name.includes('classement-pièces')||ch.name.includes('VOCAUX PRIVÉS')){
          await ch.delete('wenzy-setup reset').catch(()=>{});log.push(`🗑️ Supprimé: ${ch.name}`);
        }
      }

      // ── RÔLES ──
      const roleDefs = [
        { name:'👑 Owner', color:0xE74C3C, hoist:true, perms:[PermissionFlagsBits.Administrator] },
        { name:'⚡ Admin', color:0xE67E22, hoist:true, perms:[PermissionFlagsBits.Administrator] },
        { name:'🛡️ Modérateur', color:0x3498DB, hoist:true, perms:[PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ViewAuditLog] },
        { name:'🤝 Middleman', color:0x2ECC71, hoist:true, perms:[PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads] },
        { name:'💎 Elite Trader', color:0x9B59B6, hoist:true, perms:[] },
        { name:'👑 VIP', color:0xF1C40F, hoist:true, perms:[] },
        { name:'👑 Elite', color:0xF1C40F, hoist:false, perms:[] },
        { name:'⭐ Fiable', color:0xF1C40F, hoist:false, perms:[] },
        { name:'✅ Confirmé', color:0x27AE60, hoist:false, perms:[] },
        { name:'🆕 Nouveau', color:0x95A5A6, hoist:false, perms:[] },
        { name:'🔒 Non Vérifié', color:0x2C2F33, hoist:false, perms:[] },
      ];
      // Create XP roles
      for (const t of [...XP_MSG_TIERS, ...XP_VOCAL_TIERS]) {
        if (!guild.roles.cache.find(r=>r.name===t.name)) {
          await guild.roles.create({name:t.name,color:t.color,hoist:false}).catch(()=>{});
        }
      }
      const cr = {};
      for (const rd of roleDefs) {
        const ex = guild.roles.cache.find(r => r.name === rd.name);
        if (ex) {
          cr[rd.name] = ex;
          if (rd.perms.length > 0) { const permBits = rd.perms.reduce((acc, p) => acc | p, 0n); await ex.setPermissions(permBits).catch(() => {}); }
          log.push(`♻️ Rôle: ${rd.name}`);
        } else {
          const permBits = rd.perms.length > 0 ? rd.perms.reduce((acc, p) => acc | p, 0n) : 0n;
          cr[rd.name] = await guild.roles.create({ name:rd.name, color:rd.color, hoist:rd.hoist, permissions: permBits });
          log.push(`✅ Rôle: ${rd.name}`);
        }
      }
      const admins = ['👑 Owner','⚡ Admin','🛡️ Modérateur'].map(n=>cr[n]).filter(Boolean);
      const nonv = cr['🔒 Non Vérifié'];

      const catDefs = [
        { name:'🔒 VÉRIFICATION', chs:[{name:'🔑┃verification',verif:true}] },
        { name:'📌 WENZY SYSTEM', chs:[{name:'📌┃règles-et-info'},{name:'📊┃leaderboard'},{name:'📋┃logs',staff:true},{name:'🔗┃link-roblox'}] },
        { name:'🗡️ MM2 TRADING', chs:[{name:'🗡️┃post-trades'},{name:'📬┃poster-un-trade'},{name:'🏆┃vouches'},{name:'🛡️┃middleman-panel',staff:true}] },
        { name:'💬 COMMUNAUTÉ', chs:[{name:'👋┃bienvenue',readonly:true},{name:'💬┃général'},{name:'📺┃vidéos-wenzy'}] },
        { name:'🛒 ECONOMY', chs:[{name:'🛒┃boutique'},{name:'🪙┃classement-pièces',readonly:true}] },
        { name:'🎙️ VOCAUX', chs:[
          {name:'🏗️┃créer-un-vocal',vocal:false,createPv:true},
          {name:'🔇┃afk',voice:true},
          {name:'😴┃sleep',voice:true},
          {name:'🎙️┃vocal-1',voice:true},
          {name:'🎙️┃vocal-2',voice:true},
          {name:'🎙️┃vocal-3',voice:true},
        ]},
        { name:'🗂️ VOCAUX PRIVÉS', chs:[] },
      ];
      const cm = {};
      for (const cd of catDefs) {
        const cat = await guild.channels.create({ name:cd.name, type:ChannelType.GuildCategory, permissionOverwrites:[{id:guild.id,allow:[PermissionFlagsBits.ViewChannel]},nonv?{id:nonv.id,deny:[PermissionFlagsBits.ViewChannel]}:null].filter(Boolean) });
        log.push(`📁 ${cd.name}`);
        for (const ch of cd.chs) {
          const pows = [];
          if (ch.verif) {
            pows.push({id:guild.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]});
            if(nonv)pows.push({id:nonv.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});
          } else if (ch.staff) {
            pows.push({id:guild.id,deny:[PermissionFlagsBits.ViewChannel]});
            for(const r of admins)pows.push({id:r.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});
          } else if (ch.readonly) {
            pows.push({id:guild.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]});
            if(nonv)pows.push({id:nonv.id,deny:[PermissionFlagsBits.ViewChannel]});
          } else {
            pows.push({id:guild.id,allow:[PermissionFlagsBits.ViewChannel]});
            if(nonv)pows.push({id:nonv.id,deny:[PermissionFlagsBits.ViewChannel]});
          }
          cm[ch.name] = await guild.channels.create({name:ch.name,type:ch.voice?ChannelType.GuildVoice:ChannelType.GuildText,parent:cat.id,permissionOverwrites:pows});
          log.push(`✅ Salon: ${ch.name}`);
        }
      }

      // ── EMBED VÉRIFICATION ──
      const verifCh = cm['🔑┃verification'];
      if (verifCh) {
        await verifCh.send({ embeds:[new EmbedBuilder().setColor(C.primary).setTitle('🔑 Vérification Roblox').setDescription(['**Bienvenue sur le serveur !** 👋','','Pour accéder à tous les salons, tu dois lier ton compte Roblox.','','**Étape 1** — Clique sur le bouton ci-dessous','**Étape 2** — Entre ton pseudo Roblox dans le formulaire','**Étape 3** — Colle le code généré dans ta bio Roblox','**Étape 4** — Reviens ici et clique Confirmer','','> ✅ Une fois vérifié, tu obtiens le rôle **🆕 Nouveau** et accès à tous les salons.'].join('\n')).setFooter({text:'Wenzy Bot v5'})],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte Roblox').setStyle(ButtonStyle.Primary))] });
        log.push('✅ Embed vérification');
      }

      // ── EMBED POSTER UN TRADE ──
      const ptCh = cm['📬┃poster-un-trade'];
      if (ptCh) {
        await ptCh.send({ embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📬 Poster un Trade MM2').setDescription(['Clique sur le bouton pour créer un trade.','','• Indique ce que tu offres (séparés par virgules)','• Indique la **Total Value** de ton offre','• Indique ce que tu cherches','• Indique la **Total Value** de ce que tu cherches (optionnel)','','_Le trade sera publié dans **post-trades** automatiquement._'].join('\n'))],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_post_trade').setLabel('🗡️ Poster un Trade').setStyle(ButtonStyle.Success))] });
        log.push('✅ Embed poster-un-trade');
      }

      // ── EMBED LINK ROBLOX ──
      const linkCh = cm['🔗┃link-roblox'];
      if (linkCh) {
        await linkCh.send({ embeds:[new EmbedBuilder().setColor(C.info).setTitle('🔗 Lier ton compte Roblox').setDescription(['Pour participer aux trades, tu dois lier ton compte Roblox à ton Discord.','','**Comment faire :**','**1.** Clique sur le bouton **"Lier mon compte"** ci-dessous','**2.** Entre ton pseudo Roblox exact','**3.** Le bot génère un code unique','**4.** Colle ce code dans ta **bio Roblox**','**5.** Reviens ici et clique **"Vérifier maintenant"**','','> ✅ Une fois vérifié, tu obtiens le rôle **🆕 Nouveau** et l\'accès complet au serveur.'].join('\n')).setFooter({text:'Vérification via API Roblox officielle — sécurisé'})],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))] });
        log.push('✅ Embed link-roblox');
      }

      // ── BOUTIQUE ──
      const boutiqueCh = cm['🛒┃boutique'];
      if (boutiqueCh) { await postShopEmbed(boutiqueCh); log.push('✅ Boutique embed'); }

      // ── EMBED CRÉER VOCAL PRIVÉ ──
      const pvCh = cm['🏗️┃créer-un-vocal'];
      if (pvCh) {
        await pvCh.send({ embeds:[new EmbedBuilder().setColor(C.primary).setTitle('🎙️ Créer un Vocal Privé').setDescription(['Clique sur le bouton pour créer ton vocal privé.','','**Commandes dans ton vocal :**','`!open` — Ouvrir à tout le monde','`!close` — Fermer (invitation uniquement)','`!add @user` — Inviter quelqu\'un','`!kick @user` — Expulser quelqu\'un','`!rename <nom>` — Renommer le vocal','','> ⚠️ AFK et Sleep ne comptent pas de pièces/XP'].join('\n'))],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_create_vocal').setLabel('🎙️ Créer un vocal privé').setStyle(ButtonStyle.Primary))] });
        log.push('✅ Embed créer-vocal');
      }

      await updateLeaderboardChannel(guild);
      await updateCoinsLeaderboardChannel(guild);
      log.push('✅ Leaderboards initialisés');

      await interaction.editReply({ embeds:[new EmbedBuilder().setColor(C.success).setTitle('🏗️ Setup v5 terminé !')
        .setDescription(log.map(l=>`\`${l}\``).join('\n').slice(0,3900))
        .addFields({name:'📋 Prochaines étapes',value:['1. Donne-toi le rôle **👑 Owner**','2. `/addserver <lien>` pour les serveurs privés MM2','3. Screenshots trades → validation MANUELLE par staff','4. Nouvelles commandes : `/addxp`, `/addcoins`, `/giveaway`, `/shopadd`'].join('\n')}).setTimestamp()] });
    }
  },

  // /link
  { data: new SlashCommandBuilder().setName('link').setDescription('🔗 Lie ton compte Roblox').addStringOption(o=>o.setName('username').setDescription('Ton pseudo Roblox exact').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply({ephemeral:true});
      const username=interaction.options.getString('username'),did=interaction.user.id;
      let rb; try{rb=await searchRobloxUser(username);}catch{return interaction.editReply('❌ API Roblox indisponible. Réessaie.');}
      if(!rb)return interaction.editReply(`❌ Pseudo Roblox **${username}** introuvable.`);
      const code=genCode();
      const ex=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      if(ex)db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id),rb.name,code,did);
      else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did,String(rb.id),rb.name,code);
      try{const nv=interaction.guild.roles.cache.find(r=>r.name==='🔒 Non Vérifié');if(nv&&!interaction.member.roles.cache.has(nv.id))await interaction.member.roles.add(nv);}catch{}
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info).setTitle('🔗 Vérification — Étape 1/2').setDescription([`Compte : **${rb.name}** (ID: ${rb.id})`,'','**Code à coller dans ta bio Roblox :**',`\`\`\`${code}\`\`\``,'→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)','','Reviens ici et clique Vérifier.'].join('\n')).setFooter({text:'Code valable 15 min'})],
        components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))]});
    }
  },

  // /verify
  { data: new SlashCommandBuilder().setName('verify').setDescription('✅ Confirme la vérification Roblox'),
    async execute(interaction){await interaction.deferReply({ephemeral:true});await doVerify(interaction);}
  },

  // /trade
  { data: new SlashCommandBuilder().setName('trade').setDescription('🗡️ Système de trades MM2')
      .addSubcommand(s=>s.setName('post').setDescription('📤 Poster un trade').addStringOption(o=>o.setName('offre').setDescription('Armes offertes (virgules)').setRequired(true)).addStringOption(o=>o.setName('cherche').setDescription('Ce que tu cherches').setRequired(true)))
      .addSubcommand(s=>s.setName('cancel').setDescription('❌ Annuler ton trade').addIntegerOption(o=>o.setName('id').setDescription('ID du trade').setRequired(true)))
      .addSubcommand(s=>s.setName('check').setDescription('⚖️ Price check').addStringOption(o=>o.setName('offre').setDescription('Armes offertes').setRequired(true)).addStringOption(o=>o.setName('recois').setDescription('Armes reçues').setRequired(true))),
    async execute(interaction) {
      const sub=interaction.options.getSubcommand(),did=interaction.user.id;
      if(sub==='post'){await interaction.deferReply({ephemeral:true});await postTrade(interaction,did,interaction.options.getString('offre'),interaction.options.getString('cherche'),0,0);}
      else if(sub==='cancel'){await interaction.deferReply({ephemeral:true});await cancelTrade(interaction,did,interaction.options.getInteger('id'));}
      else if(sub==='check'){
        await interaction.deferReply({ephemeral:true});
        const{total:ov,details:od}=calcValue(parseWeapons(interaction.options.getString('offre')));
        const{total:rv,details:rd}=calcValue(parseWeapons(interaction.options.getString('recois')));
        const diff=ov-rv,fair=Math.abs(diff)<=20;
        await interaction.editReply({embeds:[new EmbedBuilder().setColor(fair?C.success:(diff>0?C.danger:C.gold)).setTitle('⚖️ Price Check MM2')
          .addFields(
            {name:'📤 Tu offres',value:od.map(w=>`${w.name} → **${w.value} val**`).join('\n')+`\n**TOTAL VALUE : ${ov} val**`,inline:true},
            {name:'📥 Tu reçois',value:rd.map(w=>`${w.name} → **${w.value} val**`).join('\n')+`\n**TOTAL VALUE : ${rv} val**`,inline:true},
            {name:'⚖️ Résultat',value:(fair?'⚖️ Fair':(diff>0?'📉 Unfair — tu perds':'📈 Avantageux pour toi'))+`\nDiff : ${Math.abs(diff)} val`,inline:false},
          ).setTimestamp()]});
      }
    }
  },

  // /profil
  { data: new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche un profil').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const target=interaction.options.getUser('membre')??interaction.user;
      const user=db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
      if(!user)return interaction.editReply(`❌ <@${target.id}> n'a pas encore de profil.`);
      const inv=db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(target.id);
      await interaction.editReply({embeds:[profileEmbed(user,inv).setAuthor({name:target.username,iconURL:target.displayAvatarURL()})]});
    }
  },

  // /inventory
  { data: new SlashCommandBuilder().setName('inventory').setDescription('📦 Gère ton inventory MM2')
      .addSubcommand(s=>s.setName('add').setDescription('➕ Ajouter une arme').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)))
      .addSubcommand(s=>s.setName('remove').setDescription('➖ Retirer une arme').addStringOption(o=>o.setName('arme').setDescription('Nom exact').setRequired(true)))
      .addSubcommand(s=>s.setName('view').setDescription('👀 Voir')),
    async execute(interaction) {
      await interaction.deferReply({ephemeral:true});const sub=interaction.options.getSubcommand(),did=interaction.user.id;
      if(sub==='add'){const name=interaction.options.getString('arme');const row=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(name);const val=row?.value??0;db.prepare('INSERT INTO inventory (discord_id,weapon_name,weapon_value,verified) VALUES (?,?,?,?)').run(did,row?.name??name,val,val>0?1:0);await interaction.editReply(`✅ **${row?.name??name}** ajouté à ton inventory.`);}
      else if(sub==='remove'){const name=interaction.options.getString('arme');const r=db.prepare('DELETE FROM inventory WHERE discord_id=? AND LOWER(weapon_name)=LOWER(?)').run(did,name);if(!r.changes)return interaction.editReply('❌ Introuvable.');await interaction.editReply(`✅ **${name}** retiré.`);}
      else{const inv=db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(did);if(!inv.length)return interaction.editReply('📦 Inventory vide. Ajoute avec `/inventory add <arme>`.');await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📦 Ton Inventory MM2').setDescription(inv.map(w=>`• **${w.weapon_name}**`).join('\n').slice(0,2000)).setFooter({text:`${inv.length} arme(s)`})]});}
    }
  },

  // /updatevalue (admin)
  { data: new SlashCommandBuilder().setName('updatevalue').setDescription('💰 (Admin) Mettre à jour une arme').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)).addIntegerOption(o=>o.setName('valeur').setDescription('Valeur').setRequired(true)).addStringOption(o=>o.setName('tier').setDescription('Tier').addChoices({name:'Godly',value:'godly'},{name:'Chroma',value:'chroma'},{name:'Ancient',value:'ancient'},{name:'Legendary',value:'legendary'},{name:'Epic',value:'epic'},{name:'Rare',value:'rare'})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const name=interaction.options.getString('arme'),value=interaction.options.getInteger('valeur'),tier=interaction.options.getString('tier')??'godly';db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now')) ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`).run(name,value,tier);await interaction.editReply(`✅ **${name}** → **${value} val** (${tier})`);}
  },

  // /updatevalues
  { data: new SlashCommandBuilder().setName('updatevalues').setDescription('🔄 (Admin) Sync valeurs MM2').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});await fetchMM2Values();const count=db.prepare('SELECT COUNT(*) as c FROM weapon_values').get().c;await interaction.editReply(`✅ Sync terminée. **${count}** armes dans la base.`);}
  },

  // /leaderboard
  { data: new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement traders'),
    async execute(interaction){await interaction.deferReply();const top=db.prepare('SELECT discord_id,roblox_username,trade_count,vouch_count,coins,xp,rank FROM users ORDER BY trade_count DESC LIMIT 10').all();if(!top.length)return interaction.editReply('Aucun trader enregistré.');const medals=['🥇','🥈','🥉'];await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold).setTitle('🏆 Top Traders MM2').setDescription(top.map((u,i)=>`${medals[i]??`**${i+1}.**`} <@${u.discord_id}> — ✅ **${u.trade_count}** trades | 💬 **${u.vouch_count}** vouches | 🪙 ${u.coins} | ✨ ${u.xp??0} XP | ${getRankLabel(u.rank)}`).join('\n')).setTimestamp()]});}
  },

  // /addserver
  { data: new SlashCommandBuilder().setName('addserver').setDescription('🎮 (Admin) Ajouter serveur privé MM2').addStringOption(o=>o.setName('lien').setDescription('Lien Roblox').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const link=interaction.options.getString('lien');try{db.prepare('INSERT INTO private_servers (link,added_by) VALUES (?,?)').run(link,interaction.user.id);}catch{return interaction.editReply('⚠️ Ce lien est déjà dans le pool.');}const count=db.prepare('SELECT COUNT(*) as c FROM private_servers WHERE in_use=0').get().c;await interaction.editReply(`✅ Serveur ajouté ! **${count}** disponibles.`);}
  },

  // /listservers
  { data: new SlashCommandBuilder().setName('listservers').setDescription('📋 (Admin) Voir pool serveurs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const servers=db.prepare('SELECT * FROM private_servers ORDER BY in_use ASC').all();if(!servers.length)return interaction.editReply('📋 Pool vide.');await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info).setTitle('🎮 Pool Serveurs MM2').setDescription(servers.map(s=>`**#${s.id}** ${s.in_use?'🔴 En cours':'🟢 Libre'} \`${s.link.slice(0,50)}\``).join('\n').slice(0,2000)).setFooter({text:`Total : ${servers.length} | Libres : ${servers.filter(s=>!s.in_use).length}`})]});}
  },

  // /report
  { data: new SlashCommandBuilder().setName('report').setDescription('🚨 Reporter un scam').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).addIntegerOption(o=>o.setName('trade').setDescription('ID trade (optionnel)')),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const reported=interaction.options.getUser('membre'),reason=interaction.options.getString('raison'),tradeId=interaction.options.getInteger('trade');db.prepare('INSERT INTO reports (reporter_id,reported_id,trade_id,reason) VALUES (?,?,?,?)').run(interaction.user.id,reported.id,tradeId??null,reason);db.prepare('UPDATE users SET report_count=report_count+1 WHERE discord_id=?').run(reported.id);const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(C.danger).setTitle('🚨 Nouveau Report').addFields({name:'🕵️ Reporter',value:`<@${interaction.user.id}>`,inline:true},{name:'⚠️ Reporté',value:`<@${reported.id}>`,inline:true},{name:'🗡️ Trade',value:tradeId?`#${tradeId}`:'Non précisé',inline:true},{name:'📝 Raison',value:reason}).setTimestamp()]});await interaction.editReply(`✅ Report envoyé contre <@${reported.id}>.`);}
  },

  // /hotrades
  { data: new SlashCommandBuilder().setName('hotrades').setDescription('🔥 Voir les trades les plus gros en valeur'),
    async execute(interaction){await interaction.deferReply();const hot=db.prepare('SELECT * FROM trades WHERE status=? ORDER BY offer_value DESC LIMIT 5').all('open');if(!hot.length)return interaction.editReply('📭 Aucun hot trade en ce moment.');const embeds=hot.map(t=>{const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(t.poster_id);return tradeEmbed(t,poster);});await interaction.editReply({content:'🔥 **Les 5 plus gros trades ouverts en ce moment :**',embeds:embeds.slice(0,5)});}
  },

  // /addxp
  { data: new SlashCommandBuilder().setName('addxp').setDescription('✨ (Staff) Ajouter de l\'XP à un membre')
      .addUserOption(o=>o.setName('membre').setDescription('Membre cible').setRequired(true))
      .addIntegerOption(o=>o.setName('quantite').setDescription('Quantité XP (peut être négatif)').setRequired(true))
      .addStringOption(o=>o.setName('raison').setDescription('Raison (optionnel)'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const target=interaction.options.getUser('membre'),amount=interaction.options.getInteger('quantite'),reason=interaction.options.getString('raison')??' — ';
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET xp=MAX(0,xp+?) WHERE discord_id=?').run(amount,target.id);
      const u=db.prepare('SELECT xp,vocal_minutes FROM users WHERE discord_id=?').get(target.id);
      const member = await interaction.guild.members.fetch(target.id).catch(()=>null);
      if (member) await applyXpRoles(interaction.guild, member, u.xp, u.vocal_minutes??0);
      const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));
      if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(amount>=0?C.success:C.warning).setTitle(`${amount>=0?'➕':'➖'} XP modifié`).addFields({name:'👤 Membre',value:`<@${target.id}>`,inline:true},{name:'✨ Modification',value:`${amount>=0?'+':''}${amount} XP`,inline:true},{name:'📊 Total',value:`${u.xp} XP`,inline:true},{name:'📝 Raison',value:reason,inline:false},{name:'🛡️ Staff',value:`<@${interaction.user.id}>`,inline:true}).setTimestamp()]});
      await interaction.editReply(`✅ <@${target.id}> → **${amount>=0?'+':''}${amount} XP** | Total : **${u.xp} XP** | ${getXpMsgTier(u.xp).name}`);
    }
  },

  // /addcoins
  { data: new SlashCommandBuilder().setName('addcoins').setDescription('🪙 (Staff) Ajouter des pièces à un membre')
      .addUserOption(o=>o.setName('membre').setDescription('Membre cible').setRequired(true))
      .addIntegerOption(o=>o.setName('quantite').setDescription('Quantité (peut être négatif)').setRequired(true))
      .addStringOption(o=>o.setName('raison').setDescription('Raison (optionnel)'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const target=interaction.options.getUser('membre'),amount=interaction.options.getInteger('quantite'),reason=interaction.options.getString('raison')??' — ';
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET coins=MAX(0,coins+?) WHERE discord_id=?').run(amount,target.id);
      const u=db.prepare('SELECT coins FROM users WHERE discord_id=?').get(target.id);
      const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));
      if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(amount>=0?C.success:C.warning).setTitle(`${amount>=0?'➕':'➖'} Pièces modifiées`).addFields({name:'👤 Membre',value:`<@${target.id}>`,inline:true},{name:'🪙 Modification',value:`${amount>=0?'+':''}${amount} 🪙`,inline:true},{name:'💰 Total',value:`${u.coins} 🪙`,inline:true},{name:'📝 Raison',value:reason,inline:false},{name:'🛡️ Staff',value:`<@${interaction.user.id}>`,inline:true}).setTimestamp()]});
      await interaction.editReply(`✅ <@${target.id}> → **${amount>=0?'+':''}${amount} 🪙** | Total : **${u.coins} 🪙**`);
      await updateCoinsLeaderboardChannel(interaction.guild);
    }
  },

  // /giveaway
  { data: new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Système de giveaway')
      .addSubcommand(s=>s.setName('start').setDescription('🎁 Lancer un giveaway')
        .addStringOption(o=>o.setName('prix').setDescription('Prix du giveaway').setRequired(true))
        .addStringOption(o=>o.setName('duree').setDescription('Durée (ex: 1h, 30m, 2d)').setRequired(true))
        .addIntegerOption(o=>o.setName('gagnants').setDescription('Nombre de gagnants (défaut: 1)'))
        .addChannelOption(o=>o.setName('salon').setDescription('Salon (défaut: salon actuel)')))
      .addSubcommand(s=>s.setName('end').setDescription('🏁 Terminer un giveaway manuellement')
        .addIntegerOption(o=>o.setName('id').setDescription('ID du giveaway').setRequired(true)))
      .addSubcommand(s=>s.setName('reroll').setDescription('🔄 Reroll les gagnants')
        .addIntegerOption(o=>o.setName('id').setDescription('ID du giveaway').setRequired(true)))
      .addSubcommand(s=>s.setName('list').setDescription('📋 Lister les giveaways actifs'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const sub=interaction.options.getSubcommand();
      if (sub === 'start') {
        const prize=interaction.options.getString('prix'),dureeStr=interaction.options.getString('duree'),winnersCount=interaction.options.getInteger('gagnants')??1,targetCh=interaction.options.getChannel('salon')??interaction.channel;
        let seconds=0;
        const dMatch=dureeStr.match(/(\d+)d/);const hMatch=dureeStr.match(/(\d+)h/);const mMatch=dureeStr.match(/(\d+)m/);const sMatch=dureeStr.match(/(\d+)s/);
        if(dMatch)seconds+=parseInt(dMatch[1])*86400;if(hMatch)seconds+=parseInt(hMatch[1])*3600;if(mMatch)seconds+=parseInt(mMatch[1])*60;if(sMatch)seconds+=parseInt(sMatch[1]);
        if(seconds<60)return interaction.editReply('❌ Durée minimum : 1 minute.');
        const endsAt=Math.floor(Date.now()/1000)+seconds;
        const res=db.prepare('INSERT INTO giveaways (channel_id,prize,winners_count,host_id,ends_at) VALUES (?,?,?,?,?)').run(targetCh.id,prize,winnersCount,interaction.user.id,endsAt);
        const gwId=res.lastInsertRowid;
        const embed=new EmbedBuilder().setColor(C.gold).setTitle(`🎉 GIVEAWAY — ${prize}`).setDescription([`Clique sur **🎉 Participer** pour entrer !`,'',`🎁 **Prix :** ${prize}`,`🏆 **Gagnants :** ${winnersCount}`,`⏳ **Fin :** <t:${endsAt}:R> (<t:${endsAt}:f>)`,`🎲 **ID :** #${gwId}`,`📢 **Organisé par :** <@${interaction.user.id}>`].join('\n')).setFooter({text:`Giveaway #${gwId} — Clique 🎉 !`}).setTimestamp();
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_join_${gwId}`).setLabel('🎉 Participer').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`gw_leave_${gwId}`).setLabel('❌ Se retirer').setStyle(ButtonStyle.Secondary));
        const msg=await targetCh.send({content:`@everyone 🎉 **Nouveau giveaway !**`,embeds:[embed],components:[row]});
        db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(msg.id,gwId);
        await interaction.editReply(`✅ Giveaway **#${gwId}** lancé !`);
        setTimeout(()=>endGiveaway(interaction.client,gwId),seconds*1000);
      }
      else if (sub === 'end') { const gwId=interaction.options.getInteger('id');const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);if(!gw)return interaction.editReply('❌ Introuvable.');if(gw.status!=='active')return interaction.editReply('❌ Déjà terminé.');await endGiveaway(interaction.client,gwId);await interaction.editReply(`✅ Giveaway **#${gwId}** terminé.`); }
      else if (sub === 'reroll') { const gwId=interaction.options.getInteger('id');const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);if(!gw)return interaction.editReply('❌ Introuvable.');const participants=JSON.parse(gw.participants||'[]');if(!participants.length)return interaction.editReply('❌ Aucun participant.');const newWinners=[...participants].sort(()=>Math.random()-0.5).slice(0,Math.min(gw.winners_count,participants.length));db.prepare('UPDATE giveaways SET winners=? WHERE id=?').run(JSON.stringify(newWinners),gwId);try{const ch=await interaction.client.channels.fetch(gw.channel_id).catch(()=>null);if(ch)await ch.send(`🔄 **Reroll #${gwId} — ${gw.prize}**\n🏆 Nouveaux gagnants : ${newWinners.map(w=>`<@${w}>`).join(', ')}`);}catch{}await interaction.editReply(`✅ Reroll effectué !`); }
      else if (sub === 'list') { const active=db.prepare('SELECT * FROM giveaways WHERE status=? ORDER BY ends_at ASC').all('active');if(!active.length)return interaction.editReply('📭 Aucun giveaway actif.');const list=active.map(g=>{const p=JSON.parse(g.participants||'[]');return`**#${g.id}** — ${g.prize} | 🏆 ${g.winners_count} | 👥 ${p.length} | Fin : <t:${g.ends_at}:R>`;}).join('\n');await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold).setTitle('🎉 Giveaways actifs').setDescription(list).setTimestamp()]}); }
    }
  },

  // /shopadd
  { data: new SlashCommandBuilder().setName('shopadd').setDescription('🛒 (Admin) Ajouter/modifier un item boutique')
      .addStringOption(o=>o.setName('nom').setDescription('Nom de l\'item').setRequired(true))
      .addIntegerOption(o=>o.setName('prix').setDescription('Prix en pièces').setRequired(true))
      .addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true))
      .addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'Rôle custom',value:'custom_role'},{name:'Rôle VIP',value:'vip_role'},{name:'Badge Elite',value:'elite_badge'},{name:'Item générique',value:'generic'}))
      .addStringOption(o=>o.setName('emoji').setDescription('Emoji (défaut: 🎁)'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ephemeral:true});
      const nom=interaction.options.getString('nom'),prix=interaction.options.getInteger('prix'),desc=interaction.options.getString('description'),type=interaction.options.getString('type'),emoji=interaction.options.getString('emoji')??'🎁';
      db.prepare('INSERT INTO shop_items (name,description,price,item_type,emoji,active,added_by) VALUES (?,?,?,?,?,1,?) ON CONFLICT(name) DO UPDATE SET description=excluded.description,price=excluded.price,item_type=excluded.item_type,emoji=excluded.emoji,active=1,added_by=excluded.added_by').run(nom,desc,prix,type,emoji,interaction.user.id);
      const boutiqueCh=interaction.guild.channels.cache.find(c=>c.name.includes('boutique'));
      if(boutiqueCh)await postShopEmbed(boutiqueCh);
      await interaction.editReply(`✅ Item **${nom}** ajouté/mis à jour !`);
    }
  },

  // /shopremove
  { data: new SlashCommandBuilder().setName('shopremove').setDescription('🛒 (Admin) Retirer un item de la boutique')
      .addStringOption(o=>o.setName('nom').setDescription('Nom exact de l\'item').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ephemeral:true});
      const nom=interaction.options.getString('nom');
      const r=db.prepare('UPDATE shop_items SET active=0 WHERE name=?').run(nom);
      if(!r.changes)return interaction.editReply(`❌ Item **${nom}** introuvable.`);
      const boutiqueCh=interaction.guild.channels.cache.find(c=>c.name.includes('boutique'));
      if(boutiqueCh)await postShopEmbed(boutiqueCh);
      await interaction.editReply(`✅ Item **${nom}** retiré.`);
    }
  },

  // /configvideo
  { data: new SlashCommandBuilder().setName('configvideo').setDescription('📺 (Admin) Configurer le salon vidéo Wenzy').addChannelOption(o=>o.setName('salon').setDescription('Salon pour les vidéos').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const ch=interaction.options.getChannel('salon');process.env.VIDEO_CHANNEL_OVERRIDE=ch.id;await interaction.editReply(`✅ Salon vidéo configuré sur <#${ch.id}> !`);}
  },

];

// ── SHOP BUTTON HANDLER ──────────────────────────────────────
async function handleButton(interaction) {
  const { customId, guild, user } = interaction;

  if (customId === 'btn_link_start') {
    const modal=new ModalBuilder().setCustomId('modal_link_roblox').setTitle('🔗 Lier ton compte Roblox');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roblox_username').setLabel('Ton pseudo Roblox exact').setStyle(TextInputStyle.Short).setPlaceholder('ex: WenzyFR').setRequired(true).setMinLength(3).setMaxLength(20)));
    return interaction.showModal(modal);
  }

  if (customId==='btn_verify_now'){await interaction.deferReply({ephemeral:true});return doVerify(interaction);}

  if (customId==='btn_post_trade') {
    const modal=new ModalBuilder().setCustomId('modal_post_trade').setTitle('🗡️ Poster un Trade MM2');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_offre').setLabel('Armes que tu offres (virgules)').setStyle(TextInputStyle.Short).setPlaceholder('ex: Chroma Seer, Corrupt').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_offre_val').setLabel('Total Value de ton offre').setStyle(TextInputStyle.Short).setPlaceholder('ex: 255').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_cherche').setLabel('Ce que tu cherches').setStyle(TextInputStyle.Short).setPlaceholder('ex: Ancient Seer').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_cherche_val').setLabel('Total Value recherchée (optionnel, 0 si ?)').setStyle(TextInputStyle.Short).setPlaceholder('ex: 200').setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  // ── CRÉER VOCAL PRIVÉ ──
  if (customId==='btn_create_vocal') {
    await interaction.deferReply({ephemeral:true});
    const member = await guild.members.fetch(user.id).catch(()=>null);
    if (!member) return interaction.editReply('❌ Impossible de te trouver.');
    if (!member.voice.channel) return interaction.editReply('❌ Tu dois être dans un vocal pour en créer un privé. Rejoins un vocal d\'abord !');
    const existing = db.prepare('SELECT * FROM private_vocals WHERE owner_id=?').get(user.id);
    if (existing) {
      const existingCh = guild.channels.cache.get(existing.channel_id);
      if (existingCh) return interaction.editReply(`❌ Tu as déjà un vocal privé : <#${existing.channel_id}>`);
      else db.prepare('DELETE FROM private_vocals WHERE owner_id=?').run(user.id);
    }
    const ch = await createPrivateVocal(guild, member);
    if (!ch) return interaction.editReply('❌ Erreur lors de la création du vocal.');
    return interaction.editReply(`✅ Vocal privé créé : **${ch.name}**\n\nCommandes disponibles dans ton vocal :\n\`!open\` — Ouvrir à tout le monde\n\`!close\` — Fermer\n\`!add @user\` — Inviter\n\`!kick @user\` — Expulser\n\`!rename <nom>\` — Renommer`);
  }

  if (customId==='shop_mes_pieces') {
    await interaction.deferReply({ephemeral:true});
    const u=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    const coins=u?.coins??0,xp=u?.xp??0,vocMin=u?.vocal_minutes??0;
    const purchases=db.prepare('SELECT * FROM shop_purchases WHERE discord_id=? ORDER BY created_at DESC LIMIT 5').all(user.id);
    return interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold).setTitle('🪙 Ton solde').addFields(
      {name:'💰 Pièces',value:`**${coins} 🪙**`,inline:true},
      {name:'✨ XP',value:`**${xp}** — ${getXpMsgTier(xp).name}`,inline:true},
      {name:'🎙️ Vocal',value:`**${vocMin} min** — ${getVocalTier(vocMin).name}`,inline:true},
      {name:'📦 Derniers achats',value:purchases.length?purchases.map(p=>`• ${p.item_type} — ${p.coins_spent} 🪙`).join('\n'):'_Aucun achat_',inline:false}
    ).setTimestamp()]});
  }

  if (customId==='shop_role_custom') {
    const user2=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if(!user2||user2.coins<500){await interaction.deferReply({ephemeral:true});return interaction.editReply(`❌ Tu n'as pas assez de pièces. Il te faut **500 🪙** (tu en as **${user2?.coins??0}**).`);}
    const modal=new ModalBuilder().setCustomId('modal_shop_role_custom').setTitle('🎨 Acheter un rôle custom');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_name').setLabel('Nom du rôle').setStyle(TextInputStyle.Short).setPlaceholder('ex: 🌙 LunarTrader').setRequired(true).setMaxLength(30)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_color').setLabel('Couleur hex (ex: #FF5733)').setStyle(TextInputStyle.Short).setPlaceholder('#FF5733').setRequired(true).setMaxLength(20)),
    );
    return interaction.showModal(modal);
  }

  if (customId==='shop_vip') {
    await interaction.deferReply({ephemeral:true});
    const user2=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if(!user2||user2.coins<1000)return interaction.editReply(`❌ Il te faut **1 000 🪙** (tu en as **${user2?.coins??0}**).`);
    db.prepare('UPDATE users SET coins=coins-1000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id,'vip_role',1000);
    const vipRole=guild.roles.cache.find(r=>r.name==='👑 VIP')||await guild.roles.create({name:'👑 VIP',color:0xF1C40F,hoist:true});
    const member=await guild.members.fetch(user.id).catch(()=>null);
    if(member)await member.roles.add(vipRole).catch(()=>{});
    await updateCoinsLeaderboardChannel(guild);
    return interaction.editReply('✅ **Rôle VIP** acheté et attribué !');
  }

  if (customId==='shop_elite_badge') {
    await interaction.deferReply({ephemeral:true});
    const user2=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if(!user2||user2.coins<10000)return interaction.editReply(`❌ Il te faut **10 000 🪙** (tu en as **${user2?.coins??0}**).`);
    db.prepare('UPDATE users SET coins=coins-10000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id,'elite_badge',10000);
    const eliteRole=guild.roles.cache.find(r=>r.name==='💎 Elite Trader');
    const member=await guild.members.fetch(user.id).catch(()=>null);
    if(member&&eliteRole)await member.roles.add(eliteRole).catch(()=>{});
    await updateCoinsLeaderboardChannel(guild);
    return interaction.editReply('✅ **Badge Elite** acheté !');
  }

  // ── GIVEAWAY BUTTONS ──
  if (customId.startsWith('gw_join_')) {
    await interaction.deferReply({ephemeral:true});
    const gwId=parseInt(customId.replace('gw_join_',''));
    const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
    if(!gw||gw.status!=='active')return interaction.editReply('❌ Ce giveaway est terminé.');
    const participants=JSON.parse(gw.participants||'[]');
    if(participants.includes(user.id))return interaction.editReply('⚠️ Tu participes déjà !');
    participants.push(user.id);
    db.prepare('UPDATE giveaways SET participants=? WHERE id=?').run(JSON.stringify(participants),gwId);
    try{const ch=await interaction.client.channels.fetch(gw.channel_id).catch(()=>null);if(ch&&gw.message_id){const msg=await ch.messages.fetch(gw.message_id).catch(()=>null);if(msg){const embed=msg.embeds[0];if(embed){const newEmbed=EmbedBuilder.from(embed).setFooter({text:`Giveaway #${gwId} — ${participants.length} participant(s) | Clique 🎉 !`});await msg.edit({embeds:[newEmbed]}).catch(()=>{});}}}}catch{}
    return interaction.editReply(`✅ Tu participes au giveaway **${gw.prize}** !`);
  }

  if (customId.startsWith('gw_leave_')) {
    await interaction.deferReply({ephemeral:true});
    const gwId=parseInt(customId.replace('gw_leave_',''));
    const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
    if(!gw||gw.status!=='active')return interaction.editReply('❌ Ce giveaway est terminé.');
    const participants=JSON.parse(gw.participants||'[]').filter(id=>id!==user.id);
    db.prepare('UPDATE giveaways SET participants=? WHERE id=?').run(JSON.stringify(participants),gwId);
    return interaction.editReply('❌ Tu t\'es retiré du giveaway.');
  }

  // ── STAFF MANUAL VERIFICATION ──
  if (customId.startsWith('staff_validate_')) {
    await interaction.deferReply({ephemeral:true});
    if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
    const tid=parseInt(customId.replace('staff_validate_',''));
    const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if(!trade)return interaction.editReply('❌ Trade introuvable.');
    if(trade.status==='completed')return interaction.editReply('⚠️ Ce trade est déjà complété.');
    await completeTrade(guild,tid,trade.screenshot_url??null);
    const logsCh=guild.channels.cache.find(c=>c.name.includes('logs'));
    if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(C.success).setTitle('✅ Trade validé manuellement').addFields({name:'🗡️ Trade',value:`#${tid}`,inline:true},{name:'🛡️ Validé par',value:`<@${interaction.user.id}>`,inline:true}).setTimestamp()]});
    return interaction.editReply(`✅ Trade **#${tid}** validé !`);
  }

  if (customId.startsWith('staff_reject_')) {
    await interaction.deferReply({ephemeral:true});
    if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
    const tid=parseInt(customId.replace('staff_reject_',''));
    const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if(!trade)return interaction.editReply('❌ Trade introuvable.');
    if(trade.thread_id){try{const t=await guild.channels.fetch(trade.thread_id).catch(()=>null);if(t)await t.send(`❌ **Screenshot rejeté par le staff** (<@${interaction.user.id}>)\n\nMerci de renvoyer un screenshot valide montrant :\n• Écran **"YOU HAVE ACCEPTED"** visible\n• Armes échangées dans l'interface`);}catch{}}
    return interaction.editReply(`⚠️ Screenshot du trade **#${tid}** rejeté.`);
  }

  // ── TRADE BUTTONS ──
  if (customId.startsWith('trade_accept_')) {
    await interaction.deferReply({ephemeral:true});
    const tid=parseInt(customId.replace('trade_accept_',''));
    const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if(!trade)return interaction.editReply('❌ Trade introuvable.');
    if(trade.poster_id===user.id)return interaction.editReply('❌ Tu ne peux pas accepter ton propre trade.');
    if(trade.status!=='open')return interaction.editReply('❌ Ce trade n\'est plus disponible.');
    const accUser=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if(!accUser?.verified)return interaction.editReply('❌ Lie ton compte Roblox d\'abord via le salon **vérification**.');
    db.prepare('UPDATE trades SET accepter_id=?,status=? WHERE id=?').run(user.id,'in_progress',tid);
    const updated=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if(trade.message_id&&trade.channel_id){try{const tCh2=await guild.channels.fetch(trade.channel_id).catch(()=>null);if(tCh2){const msg=await tCh2.messages.fetch(trade.message_id).catch(()=>null);if(msg)await msg.edit({embeds:[tradeInProgressEmbed(updated,poster,accepter)],components:[]}).catch(()=>{});}}catch{}}
    let thread;
    try{const tCh=guild.channels.cache.find(c=>c.name.includes('post-trades'));thread=await tCh.threads.create({name:`🗡️ Trade #${tid} — ${poster?.roblox_username??'Trader'} × ${accepter?.roblox_username??'Accepter'}`,type:ChannelType.PrivateThread,reason:`Trade #${tid}`,invitable:false});await thread.members.add(trade.poster_id);await thread.members.add(user.id);}catch(e){console.error('Thread:',e.message);}
    if(thread){
      db.prepare('UPDATE trades SET thread_id=? WHERE id=?').run(thread.id,tid);
      const server=getFreeServer();
      if(server){db.prepare('UPDATE private_servers SET in_use=1,trade_id=? WHERE id=?').run(tid,server.id);db.prepare('UPDATE trades SET server_link=? WHERE id=?').run(server.link,tid);}
      await thread.send({embeds:[threadSummaryEmbed(updated,poster,accepter)],components:[threadButtons(tid)]});
      if(server)await thread.send(`🎮 **Serveur Privé MM2 :**\n${server.link}`);
      await thread.send('📸 **Exemple de screenshot attendu :**');
      if(fs.existsSync(REF_SCREEN_PATH))await thread.send({files:[REF_SCREEN_PATH]});
      const mmPanel=guild.channels.cache.find(c=>c.name.includes('middleman-panel'));
      if(mmPanel){const mmRole=guild.roles.cache.find(r=>r.name.includes('Middleman'));await mmPanel.send({content:mmRole?`<@&${mmRole.id}>`:'🛡️ Middlemen',embeds:[mmPanelEmbed(updated,poster,accepter)],components:[mmButtons(tid)]});}
    }
    return interaction.editReply(`✅ Trade **#${tid}** accepté !`);
  }

  if(customId.startsWith('trade_cancel_')){await interaction.deferReply({ephemeral:true});return cancelTrade(interaction,user.id,parseInt(customId.replace('trade_cancel_','')));}

  if(customId.startsWith('trade_middleman_')||customId.startsWith('trade_negotiate_')){
    await interaction.deferReply({ephemeral:true});
    const tid=parseInt(customId.split('_').pop());
    const mmRole=guild.roles.cache.find(r=>r.name.includes('Middleman'));
    const mmPanel=guild.channels.cache.find(c=>c.name.includes('middleman-panel'));
    if(mmPanel&&mmRole)await mmPanel.send(`🛡️ <@&${mmRole.id}> — Middleman demandé pour Trade **#${tid}** par <@${user.id}>`);
    return interaction.editReply('✅ Un middleman a été appelé !');
  }

  if(customId.startsWith('mm_validate_')){
    await interaction.deferReply({ephemeral:true});
    const tid=parseInt(customId.replace('mm_validate_',''));
    const mmRole=guild.roles.cache.find(r=>r.name.includes('Middleman')||r.name.includes('Modérateur'));
    if(mmRole&&!interaction.member.roles.cache.has(mmRole.id)&&!interaction.member.permissions.has(PermissionFlagsBits.Administrator))return interaction.editReply('❌ Réservé aux middlemen.');
    const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    await completeTrade(guild,tid,trade?.screenshot_url??null);
    return interaction.editReply(`✅ Trade **#${tid}** validé.`);
  }

  if(customId.startsWith('mm_cancel_')){await interaction.deferReply({ephemeral:true});const tid=parseInt(customId.replace('mm_cancel_',''));db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled',tid);db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tid);return interaction.editReply(`❌ Trade **#${tid}** annulé.`);}

  if(customId.startsWith('mm_report_')){await interaction.deferReply({ephemeral:true});const tid=parseInt(customId.replace('mm_report_',''));db.prepare('UPDATE trades SET status=? WHERE id=?').run('disputed',tid);const logsCh=guild.channels.cache.find(c=>c.name.includes('logs'));if(logsCh)await logsCh.send(`🚨 **SCAM REPORT** — Trade **#${tid}** signalé par <@${user.id}>.`);return interaction.editReply('🚨 Scam reporté.');}
}

// ── MODAL HANDLER ────────────────────────────────────────────
async function handleModal(interaction) {
  const{customId}=interaction;

  if(customId==='modal_link_roblox'){
    await interaction.deferReply({ephemeral:true});
    const username=interaction.fields.getTextInputValue('roblox_username'),did=interaction.user.id;
    let rb;try{rb=await searchRobloxUser(username);}catch{return interaction.editReply('❌ API Roblox indisponible.');}
    if(!rb)return interaction.editReply(`❌ Pseudo Roblox **${username}** introuvable.`);
    const code=genCode();
    const ex=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
    if(ex)db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id),rb.name,code,did);
    else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did,String(rb.id),rb.name,code);
    try{const nv=interaction.guild.roles.cache.find(r=>r.name==='🔒 Non Vérifié');if(nv&&!interaction.member.roles.cache.has(nv.id))await interaction.member.roles.add(nv);}catch{}
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info).setTitle('🔗 Code généré !').setDescription([`Compte : **${rb.name}**`,'','**Code à coller dans ta bio Roblox :**',`\`\`\`${code}\`\`\``,'→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)','','Reviens et clique Vérifier.'].join('\n'))],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))]});
  }

  if(customId==='modal_post_trade'){
    await interaction.deferReply({ephemeral:true});
    const offreStr  = interaction.fields.getTextInputValue('trade_offre');
    const offreVal  = parseInt(interaction.fields.getTextInputValue('trade_offre_val'))||0;
    const chercheStr= interaction.fields.getTextInputValue('trade_cherche');
    const chercheValRaw = interaction.fields.getTextInputValue('trade_cherche_val')??'0';
    const chercheVal = parseInt(chercheValRaw)||0;
    return postTrade(interaction,interaction.user.id,offreStr,chercheStr,offreVal,chercheVal);
  }

  if(customId==='modal_shop_role_custom'){
    await interaction.deferReply({ephemeral:true});
    const roleName=interaction.fields.getTextInputValue('role_name'),roleColorInput=interaction.fields.getTextInputValue('role_color').trim();
    const user2=db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
    if(!user2||user2.coins<500)return interaction.editReply('❌ Pas assez de pièces.');
    let colorHex=0x7B2FBE;
    const match=roleColorInput.match(/#?([0-9a-fA-F]{6})/);if(match)colorHex=parseInt(match[1],16);
    try{
      const newRole=await interaction.guild.roles.create({name:roleName,color:colorHex,hoist:false});
      const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if(member)await member.roles.add(newRole).catch(()=>{});
      db.prepare('UPDATE users SET coins=coins-500 WHERE discord_id=?').run(interaction.user.id);
      db.prepare('INSERT INTO shop_purchases (discord_id,item_type,item_data,coins_spent) VALUES (?,?,?,?)').run(interaction.user.id,'custom_role',JSON.stringify({name:roleName,color:roleColorInput}),500);
      await updateCoinsLeaderboardChannel(interaction.guild);
      await interaction.editReply(`✅ Rôle **${roleName}** créé et attribué !`);
    }catch(e){await interaction.editReply(`❌ Erreur : ${e.message}`);}
  }
}

// ── YOUTUBE WATCHER ──────────────────────────────────────────
function startYoutubeWatcher(client) {
  const{YOUTUBE_API_KEY,YOUTUBE_CHANNEL_ID}=process.env;
  if(!YOUTUBE_API_KEY||!YOUTUBE_CHANNEL_ID){console.log('[YouTube] Désactivé — clé manquante');return;}
  cron.schedule('*/5 * * * *',async()=>{
    try{
      const res=await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&order=date&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`);
      const video=res.data.items?.[0];if(!video)return;
      const videoId=video.id.videoId;
      const lastRow=db.prepare('SELECT * FROM youtube_last WHERE id=1').get();
      if(lastRow.video_id===videoId)return;
      db.prepare(`UPDATE youtube_last SET video_id=?,checked_at=strftime('%s','now') WHERE id=1`).run(videoId);
      const{snippet}=video,url=`https://www.youtube.com/watch?v=${videoId}`;
      for(const[,gld]of client.guilds.cache){
        const overrideCh=process.env.VIDEO_CHANNEL_OVERRIDE?gld.channels.cache.get(process.env.VIDEO_CHANNEL_OVERRIDE):null;
        const ch=overrideCh||gld.channels.cache.find(c=>c.name.includes('vidéos-wenzy')||c.name.includes('videos-wenzy'));
        if(!ch)continue;
        await ch.send({content:`📺 @everyone **Wenzy vient de poster une nouvelle vidéo !**\n${url}`,embeds:[new EmbedBuilder().setColor(C.danger).setTitle('🔴 NOUVELLE VIDÉO').setDescription(`**${snippet.title}**`).setImage(snippet.thumbnails.high?.url??snippet.thumbnails.default?.url).setFooter({text:`Publiée le ${new Date(snippet.publishedAt).toLocaleDateString('fr-FR')}`}).setTimestamp()]});
      }
    }catch(e){console.error('[YouTube]',e.message);}
  });
}

// ── CLIENT ───────────────────────────────────────────────────
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildMembers]});
client.commands=new Collection();
for(const cmd of commands)client.commands.set(cmd.data.name,cmd);

client.on(Events.InteractionCreate,async interaction=>{
  if(interaction.isChatInputCommand()){const cmd=client.commands.get(interaction.commandName);if(!cmd)return;try{await cmd.execute(interaction);}catch(err){console.error(`[CMD] ${interaction.commandName}:`,err);const r={content:'❌ Erreur.',ephemeral:true};if(interaction.deferred||interaction.replied)await interaction.editReply(r).catch(()=>{});else await interaction.reply(r).catch(()=>{});}return;}
  if(interaction.isButton()){try{await handleButton(interaction);}catch(e){console.error('[BTN]',e.message);}return;}
  if(interaction.isModalSubmit()){try{await handleModal(interaction);}catch(e){console.error('[MODAL]',e.message);}}
});

// ── SCREENSHOT LISTENER ──────────────────────────────────────
const msgCooldowns=new Map();
client.on(Events.MessageCreate,async message=>{
  if(message.author.bot)return;
  const uid=message.author.id,now=Date.now();
  // ── Coins + XP par message (cooldown 1 min) ──
  if(!msgCooldowns.has(uid)||now-msgCooldowns.get(uid)>=60_000){
    msgCooldowns.set(uid,now);
    db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
    db.prepare('UPDATE users SET coins=coins+5,xp=xp+1 WHERE discord_id=?').run(uid);
    // Check XP tier upgrade
    const u=db.prepare('SELECT xp,vocal_minutes FROM users WHERE discord_id=?').get(uid);
    try {
      const member = await message.guild?.members.fetch(uid).catch(()=>null);
      if (member) await applyXpRoles(message.guild, member, u.xp??0, u.vocal_minutes??0);
    } catch {}
  }

  // ── Commandes vocaux privés (messages dans vocal texte) ──
  // On détecte les messages dans des vocaux privés (threads ou salons liés)
  // On utilise le message comme commande dans n'importe quel salon texte
  if(message.content.startsWith('!')){
    const pv = db.prepare('SELECT * FROM private_vocals WHERE owner_id=?').get(uid);
    if(!pv)return;
    const pvCh = message.guild?.channels.cache.get(pv.channel_id);
    if(!pvCh)return;
    const args = message.content.slice(1).trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    if(cmd==='open'){
      await pvCh.permissionOverwrites.edit(message.guild.id,{Connect:true}).catch(()=>{});
      await message.reply(`✅ Vocal **${pvCh.name}** ouvert à tout le monde.`);
    } else if(cmd==='close'){
      await pvCh.permissionOverwrites.edit(message.guild.id,{Connect:false}).catch(()=>{});
      await message.reply(`🔒 Vocal **${pvCh.name}** fermé.`);
    } else if(cmd==='add'){
      const mention = message.mentions.members?.first();
      if(!mention)return message.reply('❌ Mentionne un membre. Ex: `!add @user`');
      await pvCh.permissionOverwrites.edit(mention.id,{Connect:true}).catch(()=>{});
      await message.reply(`✅ <@${mention.id}> peut rejoindre ton vocal.`);
    } else if(cmd==='kick'){
      const mention = message.mentions.members?.first();
      if(!mention)return message.reply('❌ Mentionne un membre. Ex: `!kick @user`');
      if(mention.voice.channelId===pv.channel_id){
        const fallback = message.guild.channels.cache.find(c=>c.type===ChannelType.GuildVoice&&!db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(c.id)&&!c.name.toLowerCase().includes('afk')&&!c.name.toLowerCase().includes('sleep'));
        if(fallback)await mention.voice.setChannel(fallback).catch(()=>{});
        else await mention.voice.disconnect().catch(()=>{});
      }
      await pvCh.permissionOverwrites.delete(mention.id).catch(()=>{});
      await message.reply(`✅ <@${mention.id}> expulsé de ton vocal.`);
    } else if(cmd==='rename'){
      const newName = args.slice(1).join(' ');
      if(!newName)return message.reply('❌ Donne un nom. Ex: `!rename Mon Vocal`');
      await pvCh.setName(newName.slice(0,32)).catch(()=>{});
      await message.reply(`✅ Vocal renommé en **${newName}**.`);
    }
    return;
  }

  // ── Screenshot trade ──
  if(!message.channel.isThread())return;
  const trade=db.prepare('SELECT * FROM trades WHERE thread_id=? AND status=?').get(message.channel.id,'in_progress');
  if(!trade)return;
  const attachment=message.attachments.find(a=>a.contentType?.startsWith('image/')||/\.(jpg|jpeg|png|webp)$/i.test(a.name??''));
  if(!attachment)return;
  if(![trade.poster_id,trade.accepter_id].includes(uid))return;
  if(trade.screenshot_verified===1)return;

  db.prepare('UPDATE trades SET screenshot_url=? WHERE id=?').run(attachment.url,trade.id);
  const guild=message.guild;
  const mmPanel=guild?.channels.cache.find(c=>c.name.includes('middleman-panel'));
  const staffRoles=['👑 Owner','⚡ Admin','🛡️ Modérateur','🤝 Middleman'];
  const staffMentions=staffRoles.map(rn=>guild?.roles.cache.find(r=>r.name===rn)).filter(Boolean).map(r=>`<@&${r.id}>`).join(' ');

  await message.channel.send([`📸 **Screenshot reçu de <@${uid}>**`,'','⏳ En attente de validation par le **staff**...'].join('\n'));

  if(mmPanel){
    const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter=db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.accepter_id);
    await mmPanel.send({
      content:`${staffMentions}\n📸 **Screenshot à vérifier — Trade #${String(trade.id).padStart(4,'0')}**\n👥 <@${trade.poster_id}> × <@${trade.accepter_id}>\n🔗 Thread : <#${message.channel.id}>`,
      embeds:[new EmbedBuilder().setColor(C.warning)
        .setTitle(`📸 Vérification manuelle — Trade #${String(trade.id).padStart(4,'0')}`)
        .setImage(attachment.url)
        .addFields(
          {name:'👤 Poster',value:`<@${trade.poster_id}>${poster?` (${poster.roblox_username??'—'})`:''}`,inline:true},
          {name:'👤 Accepter',value:`<@${trade.accepter_id}>${accepter?` (${accepter.roblox_username??'—'})`:''}`,inline:true},
          {name:'📤 OFFRE',value:JSON.parse(trade.offer_weapons).map(w=>w.name).join(', ')||'—',inline:false},
          {name:'📥 RECHERCHE',value:JSON.parse(trade.want_weapons).map(w=>w.name).join(', ')||'—',inline:false},
          {name:'🔗 Thread',value:`<#${message.channel.id}>`,inline:true},
        ).setFooter({text:'Clique ✅ Valider ou ❌ Rejeter'}).setTimestamp()],
      components:[staffVerifyButtons(trade.id)],
    });
  }
});

// ── VOICE STATE UPDATE ───────────────────────────────────────
client.on(Events.VoiceStateUpdate,async(old,neu)=>{
  const uid=neu.id||old.id;
  const guild = neu.guild || old.guild;

  // ── Rejoindre ──
  if(!old.channelId&&neu.channelId){
    if(!isIdleChannel(neu.channel)){
      db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
    }
    // Auto-delete empty private vocals
  }

  // ── Partir ──
  if(old.channelId&&!neu.channelId){
    if(!isIdleChannel(old.channel)){
      const s=db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);
      if(s){
        const min=Math.floor((Math.floor(Date.now()/1000)-s.joined_at)/60);
        if(min>0){
          db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
          db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min,min,uid);
          // XP vocal upgrade check
          const u=db.prepare('SELECT xp,vocal_minutes FROM users WHERE discord_id=?').get(uid);
          try{const member=await guild?.members.fetch(uid).catch(()=>null);if(member)await applyXpRoles(guild,member,u.xp??0,u.vocal_minutes??0);}catch{}
        }
        db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);
      }
    }

    // ── Supprimer vocal privé vide ──
    if(old.channel){
      const pv=db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(old.channelId);
      if(pv&&old.channel.members.size===0){
        db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(old.channelId);
        await old.channel.delete('Vocal privé vide').catch(()=>{});
      }
    }
  }

  // ── Changer de salon ──
  if(old.channelId&&neu.channelId&&old.channelId!==neu.channelId){
    // Quitter l'ancien
    if(!isIdleChannel(old.channel)){
      const s=db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);
      if(s){const min=Math.floor((Math.floor(Date.now()/1000)-s.joined_at)/60);if(min>0){db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min,min,uid);}}
    }
    db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);
    // Rejoindre le nouveau
    if(!isIdleChannel(neu.channel)){
      db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
    }
    // Supprimer l'ancien vocal privé si vide
    if(old.channel){
      const pv=db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(old.channelId);
      if(pv&&old.channel.members.size===0){
        db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(old.channelId);
        await old.channel.delete('Vocal privé vide').catch(()=>{});
      }
    }
  }
});

// ── MEMBER JOIN ──────────────────────────────────────────────
client.on(Events.GuildMemberAdd,async member=>{
  try{
    const nonv=member.guild.roles.cache.find(r=>r.name==='🔒 Non Vérifié');
    if(nonv)await member.roles.add(nonv);

    // ── EMBED BIENVENUE ──
    const welcomeCh = member.guild.channels.cache.find(c=>c.name.includes('bienvenue'));
    if(welcomeCh){
      let avatarUrl = member.user.displayAvatarURL({size:256,extension:'png'});
      const embed = new EmbedBuilder()
        .setColor(C.primary)
        .setTitle(`👋 Bienvenue sur le serveur, **${member.displayName}** !`)
        .setDescription([
          `> Salut <@${member.id}> ! Bienvenue sur **${member.guild.name}** 🎉`,
          '',
          '**🔑 Pour accéder au serveur :**',
          '→ Va dans le salon **vérification** et lie ton compte Roblox',
          '',
          '**💬 Tu es membre n°**' + member.guild.memberCount,
        ].join('\n'))
        .setThumbnail(avatarUrl)
        .setFooter({text:`${member.guild.name} • Wenzy Bot v5`})
        .setTimestamp();
      await welcomeCh.send({embeds:[embed]});
    }
    console.log(`[MemberAdd] ${member.user.tag}`);
  }catch(e){console.error('[MemberAdd]',e.message);}
});

// ── CHANNEL DELETE — cleanup vocaux privés ───────────────────
client.on(Events.ChannelDelete,ch=>{
  db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(ch.id);
});

client.once(Events.ClientReady,async()=>{
  console.log(`✅ Wenzy Bot v5 : ${client.user.tag}`);
  client.user.setActivity('MM2 Trades 🗡️',{type:3});
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  try{const body=commands.map(c=>c.data.toJSON());await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),{body});console.log(`✅ ${body.length} commandes déployées`);}catch(e){console.error('❌ Deploy:',e);}
  startYoutubeWatcher(client);
  await fetchMM2Values();

  // ── CRONS ──
  cron.schedule('0 * * * *', fetchMM2Values); // Values MM2 toutes les heures
  cron.schedule('*/10 * * * *', async()=>{ // Classement pièces toutes les 10 min
    for(const[,gld]of client.guilds.cache){ await updateCoinsLeaderboardChannel(gld); }
  });
  cron.schedule('0 0 * * *', async()=>{ // Leaderboard trades toutes les 24h
    for(const[,gld]of client.guilds.cache){ await updateLeaderboardChannel(gld); await updateCoinsLeaderboardChannel(gld); }
    console.log('[Cron] Leaderboards mis à jour');
  });

  // ── RESTORE RÔLES AU BOOT ──
  for(const[,gld]of client.guilds.cache){
    await gld.members.fetch().catch(()=>{}); // Fetch all members into cache
    await restoreAllRoles(gld);
    await updateCoinsLeaderboardChannel(gld);
  }

  // ── REPRENDRE GIVEAWAYS ──
  const activeGiveaways=db.prepare('SELECT * FROM giveaways WHERE status=?').all('active');
  for(const gw of activeGiveaways){const remaining=(gw.ends_at*1000)-Date.now();if(remaining>0)setTimeout(()=>endGiveaway(client,gw.id),remaining);else await endGiveaway(client,gw.id);}
  console.log(`[Giveaways] ${activeGiveaways.length} giveaway(s) repris`);
  console.log('[Wenzy Bot v5] Prêt. 6767');
});

client.login(process.env.DISCORD_TOKEN);
