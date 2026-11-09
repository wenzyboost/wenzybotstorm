// ═══════════════════════════════════════════════════════════════
//  WENZY BOT v6 — bot.js  (single file, Railway ready)
//  node bot.js
//  v6 CHANGELOG :
//   - Automod complet (anti-spam, anti-liens, mots bannis, warns auto)
//   - Nouvelles commandes modération : /warn /warns /clearwarns /mute /unmute /kick /ban /unban /purge /slowmode
//   - Nouvelles commandes utilitaires : /embed /role /info /serverinfo /ping /announce
//   - /sondage avec votes boutons + timer
//   - /trade search /trade mes-trades /trade ban
//   - /vouch manuel /stats serveur
//   - XP/Coins rework style DraftBot (aléatoire, cooldown 90s, +XP sur trade)
//   - Leaderboard paginé (boutons ⬅️ ➡️, 10 par page)
//   - Embed bienvenue v2 redesigné
//   - Fix btn_create_vocal (sans vocal actif requis + cooldown 5 min)
//   - Anti-spam trades (3 max pour new, 5 pour confirmed+)
//   - DM notification acceptation trade
//   - Expiration automatique trades +48h
//   - wenzy-setup soft reset (garde rôles/salons customs)
//   - Suppression limite 100 val pour rank new
// ═══════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();

const {
  Client, GatewayIntentBits, Collection, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, Events,
  time,
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
    trade_banned INTEGER DEFAULT 0,
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
    to_id TEXT NOT NULL, trade_id INTEGER, comment TEXT,
    manual INTEGER DEFAULT 0,
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
    status TEXT DEFAULT 'active', participants TEXT DEFAULT '[]',
    winners TEXT DEFAULT '[]', created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS private_vocals (
    channel_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS vocal_cooldowns (
    discord_id TEXT PRIMARY KEY,
    last_created INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS automod_config (
    guild_id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    anti_spam INTEGER DEFAULT 1,
    spam_threshold INTEGER DEFAULT 5,
    spam_seconds INTEGER DEFAULT 5,
    anti_links INTEGER DEFAULT 0,
    links_whitelist TEXT DEFAULT '[]',
    links_allowed_channels TEXT DEFAULT '[]',
    anti_mass_mention INTEGER DEFAULT 1,
    mass_mention_limit INTEGER DEFAULT 5,
    banned_words TEXT DEFAULT '[]',
    auto_mute_warns INTEGER DEFAULT 3,
    auto_mute_duration INTEGER DEFAULT 10,
    log_channel_id TEXT
  );
  CREATE TABLE IF NOT EXISTS automod_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    reason TEXT,
    mod_id TEXT,
    type TEXT DEFAULT 'manual',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
    question TEXT NOT NULL, options TEXT NOT NULL,
    votes TEXT DEFAULT '{}', ends_at INTEGER,
    status TEXT DEFAULT 'active', host_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS server_config (
    guild_id TEXT PRIMARY KEY,
    channel_ids TEXT DEFAULT '{}',
    role_ids TEXT DEFAULT '{}',
    saved_at INTEGER DEFAULT (strftime('%s','now'))
  );
  INSERT OR IGNORE INTO youtube_last (id,checked_at) VALUES (1,0);
`);

// Migrations safe
const migrations = [
  'ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN vocal_minutes INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN trade_banned INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN warn_count INTEGER DEFAULT 0',
  'ALTER TABLE vouches ADD COLUMN manual INTEGER DEFAULT 0',
];
for (const m of migrations) { try { db.exec(m); } catch {} }

// ── DEFAULT DATA ─────────────────────────────────────────────
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

// ── RANKS ────────────────────────────────────────────────────
function getRank(n){ if(n>=50)return'elite'; if(n>=20)return'trusted'; if(n>=5)return'confirmed'; return'new'; }
function getRankLabel(r){ return({new:'🆕 Nouveau',confirmed:'✅ Confirmé',trusted:'⭐ Fiable',elite:'👑 Elite'})[r]??'🆕 Nouveau'; }
function getMaxOpenTrades(rank){ return({new:3,confirmed:5,trusted:8,elite:12})[rank]??3; }

// ── XP PALIERS MESSAGE (style DraftBot) ──────────────────────
const XP_MSG_TIERS = [
  { xp:    0, name:'💬 Lvl 0',  color:0x95A5A6 },
  { xp:   50, name:'💬 Lvl 1',  color:0x7F8C8D },
  { xp:  150, name:'💬 Lvl 2',  color:0x2ECC71 },
  { xp:  300, name:'💬 Lvl 3',  color:0x27AE60 },
  { xp:  500, name:'💬 Lvl 4',  color:0x3498DB },
  { xp:  800, name:'💬 Lvl 5',  color:0x2980B9 },
  { xp: 1200, name:'💬 Lvl 6',  color:0x9B59B6 },
  { xp: 1700, name:'💬 Lvl 7',  color:0x8E44AD },
  { xp: 2500, name:'💬 Lvl 8',  color:0xF39C12 },
  { xp: 3500, name:'💬 Lvl 9',  color:0xE67E22 },
  { xp: 5000, name:'💬 Lvl 10', color:0xE74C3C },
  { xp: 7000, name:'💬 Lvl 11', color:0xC0392B },
  { xp:10000, name:'💬 Lvl 12', color:0xF1C40F },
  { xp:14000, name:'💬 Lvl 13', color:0xF39C12 },
  { xp:20000, name:'💬 Lvl 14', color:0x1ABC9C },
  { xp:30000, name:'💬 Lvl 15', color:0x16A085 },
];

const XP_VOCAL_TIERS = [
  { min:    0, name:'🎙️ Vocal Lvl 0',  color:0x95A5A6 },
  { min:   30, name:'🎙️ Vocal Lvl 1',  color:0x7F8C8D },
  { min:  100, name:'🎙️ Vocal Lvl 2',  color:0x2ECC71 },
  { min:  300, name:'🎙️ Vocal Lvl 3',  color:0x27AE60 },
  { min:  600, name:'🎙️ Vocal Lvl 4',  color:0x3498DB },
  { min: 1200, name:'🎙️ Vocal Lvl 5',  color:0x9B59B6 },
  { min: 2000, name:'🎙️ Vocal Lvl 6',  color:0xF39C12 },
  { min: 3500, name:'🎙️ Vocal Lvl 7',  color:0xE74C3C },
  { min: 6000, name:'🎙️ Vocal Lvl 8',  color:0xF1C40F },
  { min:10000, name:'🎙️ Vocal Lvl 9',  color:0x1ABC9C },
  { min:18000, name:'🎙️ Vocal Lvl 10', color:0xE74C3C },
];

function getXpMsgTier(xp)  { let t=XP_MSG_TIERS[0];  for(const x of XP_MSG_TIERS)  { if(xp>=x.xp)  t=x; } return t; }
function getVocalTier(min) { let t=XP_VOCAL_TIERS[0]; for(const x of XP_VOCAL_TIERS){ if(min>=x.min) t=x; } return t; }
function getNextXpTier(xp) { return XP_MSG_TIERS.find(t=>t.xp>xp)??null; }

async function applyXpRoles(guild, member, xp, vocalMin) {
  try {
    const msgTier = getXpMsgTier(xp), vocTier = getVocalTier(vocalMin);
    const allMsgNames = XP_MSG_TIERS.map(t=>t.name), allVocNames = XP_VOCAL_TIERS.map(t=>t.name);
    for(const rn of allMsgNames){ const r=guild.roles.cache.find(x=>x.name===rn); if(r&&r.name!==msgTier.name&&member.roles.cache.has(r.id))await member.roles.remove(r).catch(()=>{}); }
    let tMsg=guild.roles.cache.find(x=>x.name===msgTier.name);
    if(!tMsg&&msgTier.xp>0)tMsg=await guild.roles.create({name:msgTier.name,color:msgTier.color,hoist:false}).catch(()=>null);
    if(tMsg&&!member.roles.cache.has(tMsg.id))await member.roles.add(tMsg).catch(()=>{});
    for(const rn of allVocNames){ const r=guild.roles.cache.find(x=>x.name===rn); if(r&&r.name!==vocTier.name&&member.roles.cache.has(r.id))await member.roles.remove(r).catch(()=>{}); }
    let tVoc=guild.roles.cache.find(x=>x.name===vocTier.name);
    if(!tVoc&&vocTier.min>0)tVoc=await guild.roles.create({name:vocTier.name,color:vocTier.color,hoist:false}).catch(()=>null);
    if(tVoc&&!member.roles.cache.has(tVoc.id))await member.roles.add(tVoc).catch(()=>{});
  } catch(e){ console.error('[XPRoles]',e.message); }
}

// XP aléatoire style DraftBot
function randXp()   { return Math.floor(Math.random()*16)+5;  } // 5–20 XP
function randCoins(){ return Math.floor(Math.random()*7)+2;   } // 2–8 coins
const MSG_COOLDOWN = 90_000; // 90 secondes

// ── COLORS ───────────────────────────────────────────────────
const C={primary:0x7B2FBE,success:0x2ECC71,warning:0xF39C12,danger:0xE74C3C,info:0x3498DB,gold:0xF1C40F,dark:0x2C2F33};

// ── PERMISSION HELPERS ────────────────────────────────────────
function hasStaffPerm(member){
  if(!member)return false;
  const staffRoleNames=['👑 Owner','⚡ Admin','🛡️ Modérateur','🤝 Middleman'];
  return member.permissions.has(PermissionFlagsBits.Administrator)||staffRoleNames.some(n=>member.roles.cache.find(r=>r.name===n));
}
function hasModPerm(member){ return member?.permissions.has(PermissionFlagsBits.ModerateMembers)||hasStaffPerm(member); }
function isIdleChannel(ch){ if(!ch)return false; const n=ch.name.toLowerCase(); return n.includes('afk')||n.includes('sleep'); }

// ── AUTOMOD CONFIG ───────────────────────────────────────────
function getAutomodConfig(guildId){
  let cfg=db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(guildId);
  if(!cfg){ db.prepare('INSERT OR IGNORE INTO automod_config (guild_id) VALUES (?)').run(guildId); cfg=db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(guildId); }
  return cfg;
}
function saveAutomodConfig(guildId,fields){
  const sets=Object.keys(fields).map(k=>`${k}=?`).join(',');
  db.prepare(`UPDATE automod_config SET ${sets} WHERE guild_id=?`).run(...Object.values(fields),guildId);
}

const spamTracker=new Map(); // userId → [{ts}]

async function runAutomod(message){
  if(message.author.bot||!message.guild)return;
  const cfg=getAutomodConfig(message.guild.id);
  if(!cfg.enabled)return;
  const uid=message.author.id, gid=message.guild.id;
  const member=message.member;
  if(!member||hasModPerm(member))return; // staff exempt

  // ── Anti-spam ──
  if(cfg.anti_spam){
    const now=Date.now();
    const history=(spamTracker.get(uid)||[]).filter(t=>now-t<cfg.spam_seconds*1000);
    history.push(now);
    spamTracker.set(uid,history);
    if(history.length>=cfg.spam_threshold){
      await message.delete().catch(()=>{});
      await autoWarn(message.guild,member,null,`Spam détecté (${history.length} messages en ${cfg.spam_seconds}s)`,cfg,'automod');
      return;
    }
  }

  // ── Anti-liens ──
  if(cfg.anti_links){
    const allowedChs=JSON.parse(cfg.links_allowed_channels||'[]');
    if(!allowedChs.includes(message.channel.id)){
      const urlRegex=/(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|bit\.ly\/[^\s]+)/gi;
      const whitelist=JSON.parse(cfg.links_whitelist||'[]');
      const urls=message.content.match(urlRegex)||[];
      const forbidden=urls.filter(url=>!whitelist.some(w=>url.includes(w)));
      if(forbidden.length){
        await message.delete().catch(()=>{});
        await autoWarn(message.guild,member,null,'Lien interdit posté','automod');
        return;
      }
    }
  }

  // ── Anti-mass-mention ──
  if(cfg.anti_mass_mention){
    const mentionCount=(message.mentions.users.size||0)+(message.mentions.roles.size||0);
    if(mentionCount>=cfg.mass_mention_limit){
      await message.delete().catch(()=>{});
      await autoWarn(message.guild,member,null,`Mass mention (${mentionCount} pings)`,cfg,'automod');
      return;
    }
  }

  // ── Mots bannis ──
  const bannedWords=JSON.parse(cfg.banned_words||'[]');
  if(bannedWords.length){
    const lc=message.content.toLowerCase();
    const found=bannedWords.find(w=>lc.includes(w.toLowerCase()));
    if(found){
      await message.delete().catch(()=>{});
      await autoWarn(message.guild,member,null,`Mot interdit utilisé`,cfg,'automod');
      return;
    }
  }
}

async function autoWarn(guild,member,modId,reason,cfg,type='manual'){
  const uid=member.id||member;
  db.prepare('INSERT INTO automod_warnings (discord_id,guild_id,reason,mod_id,type) VALUES (?,?,?,?,?)').run(uid,guild.id,reason,modId??'automod',type);
  db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
  db.prepare('UPDATE users SET warn_count=warn_count+1 WHERE discord_id=?').run(uid);
  const warnCount=db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(uid)?.warn_count??1;

  // Log automod
  if(cfg?.log_channel_id){
    const logCh=guild.channels.cache.get(cfg.log_channel_id)||guild.channels.cache.find(c=>c.name.includes('logs'));
    if(logCh){
      await logCh.send({embeds:[new EmbedBuilder().setColor(C.warning)
        .setTitle(`⚠️ Warn #${warnCount} — ${type==='automod'?'AutoMod':'Staff'}`)
        .addFields(
          {name:'👤 Membre',value:`<@${uid}>`,inline:true},
          {name:'📝 Raison',value:reason,inline:true},
          {name:'🔢 Total warns',value:`${warnCount}`,inline:true},
        ).setTimestamp()]});
    }
  }

  // Auto-mute si seuil atteint
  if(cfg&&warnCount>=cfg.auto_mute_warns){
    try{
      const m=await guild.members.fetch(uid).catch(()=>null);
      if(m&&!hasModPerm(m)){
        const muteEnd=new Date(Date.now()+cfg.auto_mute_duration*60_000);
        await m.timeout(cfg.auto_mute_duration*60_000,`AutoMod: ${warnCount} warnings`).catch(()=>{});
        const logCh=cfg.log_channel_id?guild.channels.cache.get(cfg.log_channel_id):guild.channels.cache.find(c=>c.name.includes('logs'));
        if(logCh)await logCh.send(`🔇 <@${uid}> **mute automatique** ${cfg.auto_mute_duration} min — ${warnCount} warns`);
        // Try DM
        try{await m.send(`🔇 Tu as été **mute automatiquement** pour ${cfg.auto_mute_duration} minutes sur **${guild.name}**.\nRaison : ${warnCount} avertissements accumulés (dernier : ${reason}).`).catch(()=>{});}catch{}
      }
    }catch{}
  }
  
  // Try DM warn
  try{
    const m=await guild.members.fetch(uid).catch(()=>null);
    if(m)await m.send(`⚠️ **Avertissement #${warnCount}** sur **${guild.name}**\n📝 Raison : ${reason}\n${warnCount>=(cfg?.auto_mute_warns??3)-1?`\n⚠️ _Encore ${(cfg?.auto_mute_warns??3)-warnCount} warn(s) avant le mute automatique._`:''}`).catch(()=>{});
  }catch{}
}

// ── SERVER CONFIG (mémoriser IDs) ─────────────────────────────
function getServerConfig(guildId){
  const r=db.prepare('SELECT * FROM server_config WHERE guild_id=?').get(guildId);
  if(!r)return{channel_ids:{},role_ids:{}};
  return{channel_ids:JSON.parse(r.channel_ids||'{}'),role_ids:JSON.parse(r.role_ids||'{}')};
}
function saveServerConfig(guildId,channelIds,roleIds){
  db.prepare('INSERT OR REPLACE INTO server_config (guild_id,channel_ids,role_ids,saved_at) VALUES (?,?,?,strftime(\'%s\',\'now\'))').run(guildId,JSON.stringify(channelIds),JSON.stringify(roleIds));
}

// ── TRADE EMBED HELPERS ──────────────────────────────────────
function tradeEmbed(trade, poster) {
  const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
  const diff=trade.offer_value-trade.want_value,fair=Math.abs(diff)<=20;
  const offreLines=off.map(w=>`• ${w.name} _(${w.value} val)_`);
  offreLines.push(`\n**TOTAL VALUE : ${trade.offer_value} val**`);
  const wantLines=want.map(w=>`• ${w.name}`);
  if(trade.want_value>0)wantLines.push(`\n**TOTAL VALUE : ${trade.want_value} val**`);
  return new EmbedBuilder().setColor(C.primary)
    .setTitle(`🗡️ TRADE #${String(trade.id).padStart(4,'0')}`)
    .setThumbnail(poster?.roblox_avatar??null)
    .addFields(
      {name:'👤 Trader',value:`<@${trade.poster_id}>${poster?.verified?' ✅':' ⚠️'}\n⭐ ${poster?.trade_count??0} trades | ${poster?.vouch_count??0} vouches`,inline:true},
      {name:'📤 OFFRE',value:offreLines.join('\n')||'—',inline:true},
      {name:'📥 RECHERCHE',value:wantLines.join('\n')||'—',inline:true},
      {name:'⚖️ Équité',value:fair?'⚖️ Fair':(trade.offer_value>trade.want_value?'📈 Avantageux trader':'📉 Unfair'),inline:true},
      {name:'🏆 Rang',value:getRankLabel(poster?.rank??'new'),inline:true},
    ).setFooter({text:`Trade #${trade.id} • ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}`}).setTimestamp();
}

function tradeInProgressEmbed(trade, poster, accepter) {
  const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
  const offreLines=off.map(w=>`• ${w.name} _(${w.value} val)_`);
  offreLines.push(`\n**TOTAL VALUE : ${trade.offer_value} val**`);
  const wantLines=want.map(w=>`• ${w.name}`);
  if(trade.want_value>0)wantLines.push(`\n**TOTAL VALUE : ${trade.want_value} val**`);
  return new EmbedBuilder().setColor(C.warning).setTitle(`⏳ TRADE #${String(trade.id).padStart(4,'0')} — EN COURS`)
    .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
    .addFields({name:'📤 OFFRE',value:offreLines.join('\n')||'—',inline:true},{name:'📥 RECHERCHE',value:wantLines.join('\n')||'—',inline:true})
    .setFooter({text:`Trade en cours depuis ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}`}).setTimestamp();
}

function tradeCompletedEmbed(trade) {
  const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
  const offreLines=off.map(w=>`• ${w.name} _(${w.value} val)_`);
  offreLines.push(`\n**TOTAL VALUE : ${trade.offer_value} val**`);
  const wantLines=want.map(w=>`• ${w.name}`);
  if(trade.want_value>0)wantLines.push(`\n**TOTAL VALUE : ${trade.want_value} val**`);
  return new EmbedBuilder().setColor(C.success).setTitle(`✅ TRADE #${String(trade.id).padStart(4,'0')} — COMPLÉTÉ`)
    .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
    .addFields({name:'📤 OFFRE',value:offreLines.join('\n')||'—',inline:true},{name:'📥 RECHERCHE',value:wantLines.join('\n')||'—',inline:true})
    .setFooter({text:`Complété le ${new Date().toLocaleDateString('fr-FR')}`}).setTimestamp();
}

function tradeButtons(id){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_accept_${id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trade_negotiate_${id}`).setLabel('💬 Négocier').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Middleman').setStyle(ButtonStyle.Primary),
  );
}

function threadButtons(id){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Appeler Middleman').setStyle(ButtonStyle.Primary),
  );
}

function staffVerifyButtons(tradeId){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`staff_validate_${tradeId}`).setLabel('✅ Valider le trade').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`staff_reject_${tradeId}`).setLabel('❌ Rejeter screenshot').setStyle(ButtonStyle.Danger),
  );
}

function profileEmbed(user, inv){
  const msgTier=getXpMsgTier(user.xp??0), vocTier=getVocalTier(user.vocal_minutes??0);
  const nextTier=getNextXpTier(user.xp??0);
  const xpBar=nextTier?buildProgressBar(user.xp??0,nextTier.xp,10):'MAX';
  return new EmbedBuilder().setColor(C.primary)
    .setTitle(`👤 ${user.roblox_username??'Non lié'}`).setThumbnail(user.roblox_avatar??null)
    .addFields(
      {name:'🎮 Roblox',value:user.verified?`${user.roblox_username} ✅`:'❌ Non lié',inline:true},
      {name:'🏆 Rang Trade',value:getRankLabel(user.rank),inline:true},
      {name:'⭐ Réputation',value:`✅ ${user.trade_count} trades\n💬 ${user.vouch_count} vouches\n🚨 ${user.report_count} reports`,inline:true},
      {name:'📦 Inventory',value:(inv.length?inv.map(w=>`• ${w.weapon_name}`).join('\n').slice(0,1000):'— Vide'),inline:false},
      {name:'🪙 Pièces',value:`${user.coins}`,inline:true},
      {name:'✨ XP',value:`${user.xp??0} — ${msgTier.name}${nextTier?`\n${xpBar} (${nextTier.xp-(user.xp??0)} restants)`:''}`,inline:true},
      {name:'🎙️ Vocal',value:`${user.vocal_minutes??0} min — ${vocTier.name}`,inline:true},
    ).setTimestamp();
}

function buildProgressBar(current, target, len=10){
  const pct=Math.min(current/target,1), filled=Math.round(pct*len);
  return '█'.repeat(filled)+'░'.repeat(len-filled)+` ${Math.round(pct*100)}%`;
}

function mmPanelEmbed(trade, poster, accepter){
  const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons),diff=trade.offer_value-trade.want_value;
  const offreLines=off.map(w=>`${w.name} — ${w.value} val`);
  offreLines.push(`**TOTAL : ${trade.offer_value} val**`);
  return new EmbedBuilder().setColor(C.info).setTitle(`🛡️ PANEL MIDDLEMAN — TRADE #${String(trade.id).padStart(4,'0')}`)
    .addFields(
      {name:'👤 Poster',value:`<@${trade.poster_id}> (${poster?.trade_count??0} trades, ${poster?.vouch_count??0} vouches)`,inline:true},
      {name:'👤 Accepter',value:`<@${trade.accepter_id}> (${accepter?.trade_count??0} trades, ${accepter?.vouch_count??0} vouches)`,inline:true},
      {name:'📤 OFFRE poster',value:offreLines.join('\n'),inline:false},
      {name:'📥 RECHERCHE',value:want.map(w=>w.name).join('\n'),inline:false},
      {name:'⚖️ Différence',value:`${Math.abs(diff)} val (${diff>0?'avantage poster':diff<0?'avantage accepter':'égal'})`,inline:false},
    ).setTimestamp();
}

function mmButtons(id){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mm_validate_${id}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`mm_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mm_report_${id}`).setLabel('🚨 Report scam').setStyle(ButtonStyle.Secondary),
  );
}

function threadSummaryEmbed(trade, poster, accepter){
  const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
  const diff=trade.offer_value-trade.want_value,fair=Math.abs(diff)<=20;
  const offreLines=off.map(w=>`• ${w.name} _(${w.value} val)_`);
  offreLines.push(`\n**TOTAL VALUE : ${trade.offer_value} val**`);
  const wantLines=want.map(w=>`• ${w.name}`);
  if(trade.want_value>0)wantLines.push(`\n**TOTAL VALUE : ${trade.want_value} val**`);
  return new EmbedBuilder().setColor(fair?C.success:C.warning)
    .setTitle(`🗡️ TRADE EN COURS — #${String(trade.id).padStart(4,'0')}`)
    .setDescription([`> <@${trade.poster_id}> × <@${trade.accepter_id}>`,
      '','**📋 Pour finaliser ce trade :**',
      '1. Rejoins le serveur privé MM2 (lien ci-dessous)',
      '2. Fais le trade en jeu',
      '3. Prends un screenshot de l\'écran **"YOU HAVE ACCEPTED"**',
      '4. Envoie le screenshot dans CE salon',
      '5. ⚠️ Un **membre du staff** validera manuellement',
    ].join('\n'))
    .addFields(
      {name:'📤 OFFRE',value:offreLines.join('\n'),inline:true},
      {name:'📥 RECHERCHE',value:wantLines.join('\n'),inline:true},
      {name:'⚖️ Résultat',value:fair?`✅ Fair — Diff : ${Math.abs(diff)} val`:`⚠️ Unfair — Diff : ${Math.abs(diff)} val (avantage ${diff>0?`<@${trade.poster_id}>`:`<@${trade.accepter_id}>`})`,inline:false},
    ).setTimestamp();
}

// ── ROBLOX HELPERS ───────────────────────────────────────────
function genCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s='WENZY-'; for(let i=0;i<5;i++)s+=c[Math.floor(Math.random()*c.length)]; return s; }
async function searchRobloxUser(u){ const r=await axios.post('https://users.roblox.com/v1/usernames/users',{usernames:[u],excludeBannedUsers:true}); return r.data.data?.[0]??null; }
async function getRobloxDescription(id){ const r=await axios.get(`https://users.roblox.com/v1/users/${id}`); return r.data.description??''; }
async function getRobloxAvatar(id){ try{ const r=await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`); return r.data.data?.[0]?.imageUrl??null; }catch{ return null; } }

// ── TRADE FUNCTIONS ───────────────────────────────────────────
function parseWeapons(s){ return s.split(',').map(x=>x.trim()).filter(Boolean); }
function calcValue(names){ let total=0; const details=[]; for(const n of names){ const row=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(n); const val=row?.value??0; total+=val; details.push({name:row?.name??n,value:val}); } return{total,details}; }
function getFreeServer(){ return db.prepare('SELECT * FROM private_servers WHERE in_use=0 LIMIT 1').get(); }

async function fetchMM2Values() {
  let synced=0;
  const stmt=db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now')) ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`);
  try {
    const r=await axios.get('https://bloxultra.com/api/values/mm2',{timeout:10000,headers:{'User-Agent':'WenzyBot/6.0','Accept':'application/json'}});
    const data=r.data;
    if(Array.isArray(data)){ for(const item of data){ const name=item.name??item.Name??item.weapon; const val=item.value??item.Value??item.demand??item.price??0; const tier=(item.tier??item.type??item.rarity??'godly').toLowerCase(); if(name&&val>0){stmt.run(String(name),Math.round(val),tier);synced++;} } }
    else if(data&&typeof data==='object'){ for(const[name,info]of Object.entries(data)){ if(['success','status','message'].includes(name))continue; const val=typeof info==='number'?info:(info?.value??info?.demand??info?.price??0); const tier=(info?.tier??info?.type??info?.rarity??'godly').toLowerCase(); if(name&&val>0){stmt.run(String(name),Math.round(val),tier);synced++;} } }
    if(synced>0){ console.log(`[Values] bloxultra: ${synced} armes`); return; }
  } catch(e){ console.warn('[Values] bloxultra failed:', e.message); }
  // Fallback hardcoded
  const hc=[['Ancient Seer',200,'ancient'],['Chroma Seer',165,'chroma'],['Chroma Harvester',150,'chroma'],['Chroma Lightbringer',145,'chroma'],['Chroma Luger',125,'chroma'],['Chroma Boneblade',115,'chroma'],['Prism',95,'godly'],['Corrupt',90,'godly'],['Elderwood Scythe',85,'godly'],['Hallowscythe',82,'godly'],['Blue Seer',72,'godly'],['Batwing',62,'godly'],['Seer',60,'godly'],['Shark',57,'godly'],['Icicle',52,'godly'],['Luger',50,'godly'],['Raygun',45,'godly'],['Snowcannon',42,'godly'],['Soul',38,'godly'],['Spirit',36,'godly'],['Beachy',32,'godly']];
  for(const[name,val,tier]of hc){stmt.run(name,val,tier);synced++;}
  console.log(`[Values] Fallback: ${synced} armes`);
}

async function doVerify(interaction){
  const did=interaction.user.id;
  const user=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if(!user?.verify_code)return interaction.editReply('❌ Lance d\'abord la vérification via le bouton dans le salon **vérification**.');
  if(user.verified)return interaction.editReply(`✅ Déjà vérifié : **${user.roblox_username}** !`);
  let desc; try{desc=await getRobloxDescription(user.roblox_id);}catch{return interaction.editReply('❌ Erreur Roblox API. Réessaie.');}
  if(!desc.includes(user.verify_code))return interaction.editReply(`❌ Code \`${user.verify_code}\` introuvable dans ta bio.\nAssure-toi de l\'avoir sauvegardé, puis réessaie.`);
  const avatar=await getRobloxAvatar(user.roblox_id);
  db.prepare('UPDATE users SET verified=1,roblox_avatar=?,rank=? WHERE discord_id=?').run(avatar,'new',did);
  try{
    const g=interaction.guild;
    const nv=g.roles.cache.find(r=>r.name==='🆕 Nouveau'),nonv=g.roles.cache.find(r=>r.name==='🔒 Non Vérifié');
    if(nonv)await interaction.member.roles.remove(nonv).catch(()=>{});
    if(nv)await interaction.member.roles.add(nv).catch(()=>{});
  }catch{}
  await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.success).setTitle('✅ Compte Roblox vérifié !')
    .setThumbnail(avatar)
    .setDescription([`Discord lié à **${user.roblox_username}** !`,'','Tu as maintenant accès à tous les salons.','Poste ton premier trade via **poster-un-trade** !'].join('\n'))]});
}

async function postTrade(interaction, did, offreStr, chercheStr, manualOfferVal, manualWantVal){
  const user=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if(!user?.verified)return interaction.editReply('❌ Lie ton compte Roblox d\'abord via le salon **vérification**.');
  if(user.trade_banned)return interaction.editReply('🚫 Tu es banni de poster des trades. Contacte un modérateur.');

  // Anti-spam trades
  const openTrades=db.prepare('SELECT COUNT(*) as c FROM trades WHERE poster_id=? AND status IN (\'open\',\'in_progress\')').get(did).c;
  const maxOpen=getMaxOpenTrades(user.rank);
  if(openTrades>=maxOpen)return interaction.editReply(`⚠️ Tu as déjà **${openTrades}/${maxOpen}** trades ouverts. Annule ou attends qu'ils se terminent.\n_Rang ${getRankLabel(user.rank)} = max ${maxOpen} trades simultanés_`);

  const{total:autoOv,details:od}=calcValue(parseWeapons(offreStr));
  const{total:autoWv,details:wd}=calcValue(parseWeapons(chercheStr));
  const ov=(manualOfferVal>0)?manualOfferVal:autoOv;
  const wv=(manualWantVal>0)?manualWantVal:autoWv;
  const unknownOffer=od.filter(w=>w.value===0).map(w=>w.name);
  const unknownWant=wd.filter(w=>w.value===0).map(w=>w.name);
  const unknownLines=[];
  if(unknownOffer.length)unknownLines.push(`📤 Offre inconnue : **${unknownOffer.join(', ')}**`);
  if(unknownWant.length)unknownLines.push(`📥 Recherche inconnue : **${unknownWant.join(', ')}**`);
  const unknownWarn=unknownLines.length?`\n⚠️ Armes non trouvées dans la base :\n${unknownLines.join('\n')}`:'';

  const res=db.prepare('INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value,want_value) VALUES (?,?,?,?,?)').run(did,JSON.stringify(od),JSON.stringify(wd),ov,wv);
  const tid=res.lastInsertRowid;
  const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
  const ch=interaction.guild.channels.cache.find(c=>c.name.includes('post-trades'));
  if(!ch)return interaction.editReply('❌ Salon post-trades introuvable. Lance `/wenzy-setup`.');
  const msg=await ch.send({embeds:[tradeEmbed(trade,user)],components:[tradeButtons(tid)]});
  db.prepare('UPDATE trades SET message_id=?,channel_id=? WHERE id=?').run(msg.id,ch.id,tid);
  await interaction.editReply(`✅ Trade **#${tid}** posté dans <#${ch.id}> !${unknownWarn}`);
}

async function cancelTrade(interaction, did, tradeId){
  const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if(!trade)return interaction.editReply('❌ Trade introuvable.');
  const isAdmin=interaction.member.permissions.has(PermissionFlagsBits.Administrator)||hasStaffPerm(interaction.member);
  if(trade.poster_id!==did&&!isAdmin)return interaction.editReply('❌ Seul le posteur ou un staff peut annuler.');
  if(!['open','in_progress'].includes(trade.status))return interaction.editReply('❌ Ce trade ne peut plus être annulé.');
  db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled',tradeId);
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  if(trade.thread_id){try{const t=await interaction.guild.channels.fetch(trade.thread_id).catch(()=>null);if(t){await t.send('❌ **Trade annulé.** Ce salon sera supprimé dans 5 secondes.');setTimeout(()=>t.delete('Trade annulé').catch(()=>{}),5000);}}catch{}}
  if(trade.message_id&&trade.channel_id){try{const c=await interaction.guild.channels.fetch(trade.channel_id).catch(()=>null);const m=c?await c.messages.fetch(trade.message_id).catch(()=>null):null;if(m)await m.delete().catch(()=>{});}catch{}}
  await interaction.editReply(`✅ Trade **#${tradeId}** annulé et retiré.`);
}

async function completeTrade(guild, tradeId, screenshotUrl){
  const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if(!trade)return false;
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  db.prepare(`UPDATE trades SET status='completed',completed_at=strftime('%s','now'),screenshot_url=?,screenshot_verified=1 WHERE id=?`).run(screenshotUrl,tradeId);
  for(const uid of [trade.poster_id,trade.accepter_id]){
    if(!uid)continue;
    // +75 coins +100 XP +1 trade_count
    db.prepare('UPDATE users SET coins=coins+75,xp=xp+100,trade_count=trade_count+1 WHERE discord_id=?').run(uid);
    const u=db.prepare('SELECT trade_count,xp,vocal_minutes FROM users WHERE discord_id=?').get(uid);
    db.prepare('UPDATE users SET rank=? WHERE discord_id=?').run(getRank(u.trade_count),uid);
    db.prepare('INSERT INTO vouches (from_id,to_id,trade_id) VALUES (?,?,?)').run(uid===trade.poster_id?trade.accepter_id:trade.poster_id,uid,tradeId);
    db.prepare('UPDATE users SET vouch_count=vouch_count+1 WHERE discord_id=?').run(uid);
    try{
      const member=await guild.members.fetch(uid).catch(()=>null);
      if(member){
        const freshUser=db.prepare('SELECT * FROM users WHERE discord_id=?').get(uid);
        const rankRoleMap={new:'🆕 Nouveau',confirmed:'✅ Confirmé',trusted:'⭐ Fiable',elite:'👑 Elite'};
        const targetRoleName=rankRoleMap[freshUser.rank];
        const allRankRoles=Object.values(rankRoleMap);
        for(const rn of allRankRoles){const r=guild.roles.cache.find(x=>x.name===rn);if(r&&rn!==targetRoleName)await member.roles.remove(r).catch(()=>{});}
        const targetRole=guild.roles.cache.find(x=>x.name===targetRoleName);
        if(targetRole)await member.roles.add(targetRole).catch(()=>{});
        await applyXpRoles(guild,member,freshUser.xp??0,freshUser.vocal_minutes??0);
      }
    }catch{}
    // DM notification
    try{
      const m=await guild.members.fetch(uid).catch(()=>null);
      const other=uid===trade.poster_id?trade.accepter_id:trade.poster_id;
      if(m)await m.send({embeds:[new EmbedBuilder().setColor(C.success)
        .setTitle('✅ Trade complété !')
        .setDescription([`Ton trade **#${tradeId}** avec <@${other}> a été **validé par le staff** !`,'',`+75 🪙 | +100 ✨ XP | +1 vouch`].join('\n'))
        .setTimestamp()]}).catch(()=>{});
    }catch{}
  }
  if(trade.message_id&&trade.channel_id){
    try{const ch=await guild.channels.fetch(trade.channel_id).catch(()=>null);if(ch){const msg=await ch.messages.fetch(trade.message_id).catch(()=>null);if(msg)await msg.edit({embeds:[tradeCompletedEmbed(trade)],components:[]}).catch(()=>{});}}catch{}
  }
  const vCh=guild.channels.cache.find(c=>c.name.includes('vouches')&&!c.name.includes('category'));
  if(vCh){
    const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter=db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.accepter_id);
    const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
    const offerLines=off.map(w=>`• ${w.name}${w.value>0?` _(${w.value} val)_`:''}`);
    offerLines.push(`**TOTAL : ${trade.offer_value} val**`);
    const wantLines=want.map(w=>`• ${w.name}${w.value>0?` _(${w.value} val)_`:''}`);
    if(trade.want_value>0)wantLines.push(`**TOTAL : ${trade.want_value} val**`);
    const embed=new EmbedBuilder().setColor(C.success)
      .setTitle(`✅ VOUCH — TRADE #${String(tradeId).padStart(4,'0')} COMPLÉTÉ`)
      .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
      .addFields(
        {name:`📤 ${poster?.roblox_username??'Trader'} (${getRankLabel(poster?.rank??'new')})`,value:offerLines.join('\n'),inline:true},
        {name:`📥 ${accepter?.roblox_username??'Accepter'} (${getRankLabel(accepter?.rank??'new')})`,value:wantLines.join('\n'),inline:true},
        {name:'💰 Récompenses',value:`+75 🪙 chacun | +100 ✨ XP | +1 vouch mutuel`,inline:false},
      ).setTimestamp();
    if(screenshotUrl)embed.setImage(screenshotUrl);
    await vCh.send({embeds:[embed]});
  }
  if(trade.thread_id){
    try{const t=await guild.channels.fetch(trade.thread_id).catch(()=>null);if(t){await t.send(['🎉 **Trade finalisé !**','',`✅ <@${trade.poster_id}> × <@${trade.accepter_id}>`,`+75 🪙 chacun | +100 ✨ XP | +1 vouch mutuel`,'','_Ce salon sera archivé dans 10 secondes._'].join('\n'));setTimeout(async()=>{try{await t.setArchived(true,'Trade terminé');}catch{}},10000);}}catch{}
  }
  await updateLeaderboardChannel(guild);
  await updateCoinsLeaderboardChannel(guild);
  return true;
}

// ── LEADERBOARD ───────────────────────────────────────────────
function leaderboardTradesPage(page=0,perPage=10){
  const offset=page*perPage;
  const total=db.prepare('SELECT COUNT(*) as c FROM users WHERE trade_count>0').get().c;
  const rows=db.prepare('SELECT discord_id,roblox_username,trade_count,vouch_count,coins,xp,rank FROM users ORDER BY trade_count DESC LIMIT ? OFFSET ?').all(perPage,offset);
  const totalPages=Math.max(1,Math.ceil(total/perPage));
  return{rows,page,totalPages,total};
}
function leaderboardCoinsPage(page=0,perPage=10){
  const offset=page*perPage;
  const total=db.prepare('SELECT COUNT(*) as c FROM users WHERE coins>0').get().c;
  const rows=db.prepare('SELECT discord_id,coins FROM users ORDER BY coins DESC LIMIT ? OFFSET ?').all(perPage,offset);
  const totalPages=Math.max(1,Math.ceil(total/perPage));
  return{rows,page,totalPages,total};
}

function buildLbTradesEmbed(page=0){
  const{rows,totalPages}=leaderboardTradesPage(page);
  const medals=['🥇','🥈','🥉'];
  const start=page*10;
  return new EmbedBuilder().setColor(C.gold).setTitle('🏆 Top Traders MM2 — Classement Live')
    .setDescription(rows.length?rows.map((u,i)=>`${medals[start+i]??`**${start+i+1}.**`} <@${u.discord_id}> — ✅ **${u.trade_count}** trades | 💬 **${u.vouch_count}** vouches | 🪙 ${u.coins} | ${getRankLabel(u.rank)}`).join('\n'):'_Aucun trader enregistré_')
    .setFooter({text:`Page ${page+1}/${totalPages} • Mis à jour automatiquement`}).setTimestamp();
}
function buildLbCoinsEmbed(page=0){
  const{rows,totalPages}=leaderboardCoinsPage(page);
  const medals=['🥇','🥈','🥉'];
  const start=page*10;
  return new EmbedBuilder().setColor(C.gold).setTitle('🪙 Classement Pièces')
    .setDescription(rows.length?rows.map((u,i)=>`${medals[start+i]??`**${start+i+1}.**`} <@${u.discord_id}> — **${u.coins} 🪙**`).join('\n'):'_Aucune donnée_')
    .setFooter({text:`Page ${page+1}/${totalPages} • Mis à jour automatiquement`}).setTimestamp();
}
function lbPaginationRow(type,page,totalPages){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lb_${type}_prev_${page}`).setLabel('◀️ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page<=0),
    new ButtonBuilder().setCustomId(`lb_${type}_next_${page}`).setLabel('Suivant ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page>=totalPages-1),
  );
}

async function updateLeaderboardChannel(guild){
  const ch=guild.channels.cache.find(c=>c.name.includes('leaderboard')&&!c.name.includes('pièces')&&!c.name.includes('pieces'));
  if(!ch)return;
  const embed=buildLbTradesEmbed(0);
  const{totalPages}=leaderboardTradesPage(0);
  const msgs=await ch.messages.fetch({limit:5});
  for(const m of msgs.values())if(m.author.bot)await m.delete().catch(()=>{});
  await ch.send({embeds:[embed],components:totalPages>1?[lbPaginationRow('trades',0,totalPages)]:[]});
}

async function updateCoinsLeaderboardChannel(guild){
  const ch=guild.channels.cache.find(c=>c.name.includes('classement-pièces')||c.name.includes('classement-pieces'));
  if(!ch)return;
  const embed=buildLbCoinsEmbed(0);
  const{totalPages}=leaderboardCoinsPage(0);
  const msgs=await ch.messages.fetch({limit:5});
  for(const m of msgs.values())if(m.author.bot)await m.delete().catch(()=>{});
  await ch.send({embeds:[embed],components:totalPages>1?[lbPaginationRow('coins',0,totalPages)]:[]});
}

// ── WELCOME EMBED V2 ──────────────────────────────────────────
function buildWelcomeEmbed(member, guild){
  const memberNum=guild.memberCount;
  return new EmbedBuilder()
    .setColor(C.primary)
    .setTitle(`👋 Bienvenue sur **${guild.name}** !`)
    .setDescription([
      `> Hey <@${member.id}>, t'es le membre numéro **${memberNum}** à rejoindre — content de t'avoir ici 🎉`,
      '',
      '┌─────────────────────────────┐',
      '│  🗡️  **Serveur MM2 Trading**  │',
      '│  Trading sécurisé & vérifié  │',
      '└─────────────────────────────┘',
    ].join('\n'))
    .addFields(
      {
        name:'🔑 Accéder au serveur',
        value:[
          '1️⃣ Va dans <#VERIF> → **Lier mon compte Roblox**',
          '2️⃣ Entre ton pseudo Roblox',
          '3️⃣ Colle le code dans ta bio Roblox',
          '4️⃣ Clique **Vérifier** → Accès débloqué ✅',
        ].join('\n'),
        inline:false,
      },
      {
        name:'💰 Économie du serveur',
        value:[
          '🪙 **Pièces** — Gagne des coins en chattant, en vocal & en tradant',
          '✨ **XP** — Monte de niveau et débloque des rôles exclusifs',
          '🛒 **Boutique** — Dépense tes coins pour des rôles customs',
        ].join('\n'),
        inline:false,
      },
      {
        name:'🗡️ Comment trader',
        value:[
          '📬 Poste un trade via **poster-un-trade**',
          '🛡️ Middleman disponible pour les gros trades',
          '🏆 Plus tu trades → meilleur ton rang !',
        ].join('\n'),
        inline:false,
      },
      {
        name:'📋 Liens utiles',
        value:[
          '📌 Règles : voir **règles-et-info**',
          '🏆 Classement : voir **leaderboard**',
          '🛒 Boutique : voir **boutique**',
        ].join('\n'),
        inline:false,
      },
    )
    .setThumbnail(member.user.displayAvatarURL({size:256,extension:'png'}))
    .setImage(process.env.WELCOME_BANNER_URL??null)
    .setFooter({text:`${guild.name} • Wenzy Bot v6 • Tu es le membre n°${memberNum}`})
    .setTimestamp();
}

// ── SHOP ─────────────────────────────────────────────────────
async function postShopEmbed(ch){
  const msgs=await ch.messages.fetch({limit:10});
  for(const m of msgs.values())if(m.author.bot)await m.delete().catch(()=>{});
  const items=db.prepare('SELECT * FROM shop_items WHERE active=1 ORDER BY price ASC').all();
  const itemLines=items.map(i=>`${i.emoji} **${i.name}** — **${i.price} 🪙**\n> ${i.description??'—'}`).join('\n\n');
  await ch.send({
    embeds:[new EmbedBuilder().setColor(C.gold).setTitle('🛒 Boutique Wenzy')
      .setDescription(['**Dépense tes 🪙 pour débloquer des avantages exclusifs !**','','━━━━━━━━━━━━━━━━━━━━━━━',itemLines||'_Aucun item disponible_','━━━━━━━━━━━━━━━━━━━━━━━','','**Comment gagner des 🪙 ?**','• +2 à +8 🪙 par message _(cooldown 90s)_','• +1 🪙 par minute en vocal _(hors AFK/Sleep)_','• +75 🪙 par trade complété',].join('\n'))
      .setFooter({text:'Clique sur un bouton pour acheter'}).setTimestamp()],
    components:[
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

// ── GIVEAWAY ──────────────────────────────────────────────────
async function endGiveaway(client, giveawayId){
  const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(giveawayId);
  if(!gw||gw.status!=='active')return;
  const participants=JSON.parse(gw.participants||'[]');
  let winners=[];
  if(participants.length>0){ const shuffled=[...participants].sort(()=>Math.random()-0.5); winners=shuffled.slice(0,Math.min(gw.winners_count,participants.length)); }
  db.prepare('UPDATE giveaways SET status=?,winners=? WHERE id=?').run('ended',JSON.stringify(winners),giveawayId);
  try{
    const ch=await client.channels.fetch(gw.channel_id).catch(()=>null);
    if(!ch)return;
    const msg=gw.message_id?await ch.messages.fetch(gw.message_id).catch(()=>null):null;
    const embed=new EmbedBuilder().setColor(C.gold).setTitle(`🎉 GIVEAWAY TERMINÉ — ${gw.prize}`)
      .setDescription(winners.length>0?`**Gagnant(s) :**\n${winners.map(w=>`🏆 <@${w}>`).join('\n')}`:'😕 Personne n\'a participé.')
      .addFields({name:'🎁 Prix',value:gw.prize,inline:true},{name:'👥 Participants',value:`${participants.length}`,inline:true},{name:'🎰 Gagnants',value:`${winners.length}/${gw.winners_count}`,inline:true})
      .setFooter({text:`Giveaway #${gw.id} — Organisé par <@${gw.host_id}>`}).setTimestamp();
    if(msg)await msg.edit({embeds:[embed],components:[]}).catch(()=>{});
    const winnerMention=winners.length>0?winners.map(w=>`<@${w}>`).join(', '):'aucun';
    await ch.send(`🎊 **Fin du giveaway !** Félicitations à ${winnerMention} ! Prix : **${gw.prize}**`);
  }catch(e){console.error('[Giveaway end]',e.message);}
}

// ── SONDAGE ───────────────────────────────────────────────────
function buildPollEmbed(poll, showResults=false){
  const options=JSON.parse(poll.options);
  const votes=JSON.parse(poll.votes||'{}');
  const totalVotes=Object.values(votes).reduce((a,v)=>a+(Array.isArray(v)?v.length:0),0);
  let desc=`**${poll.question}**\n\n`;
  options.forEach((opt,i)=>{
    const count=(votes[i]||[]).length;
    const pct=totalVotes>0?Math.round(count/totalVotes*100):0;
    const bar=showResults?` — ${buildProgressBar(count,Math.max(totalVotes,1),8)} **${pct}% (${count})**`:'';
    desc+=`${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} **${opt}**${bar}\n`;
  });
  if(poll.ends_at) desc+=`\n⏳ Se termine ${time(poll.ends_at,'R')}`;
  return new EmbedBuilder().setColor(showResults?C.gold:C.info)
    .setTitle(showResults?'📊 Résultats du sondage':'📊 Sondage')
    .setDescription(desc)
    .setFooter({text:`${totalVotes} vote(s) total${showResults?' — Sondage terminé':''}`})
    .setTimestamp();
}
function buildPollButtons(pollId, options, disabled=false){
  const labels=['1️⃣','2️⃣','3️⃣','4️⃣'];
  const row=new ActionRowBuilder().addComponents(
    options.slice(0,4).map((_,i)=>new ButtonBuilder().setCustomId(`poll_vote_${pollId}_${i}`).setLabel(labels[i]).setStyle(ButtonStyle.Primary).setDisabled(disabled))
  );
  return row;
}

// ── BOOT RESTORE ──────────────────────────────────────────────
async function restoreAllRoles(guild){
  console.log('[Boot] Restauration des rôles...');
  const allUsers=db.prepare('SELECT * FROM users WHERE verified=1').all();
  const rankRoleMap={new:'🆕 Nouveau',confirmed:'✅ Confirmé',trusted:'⭐ Fiable',elite:'👑 Elite'};
  let count=0;
  const chunks=[];
  for(let i=0;i<allUsers.length;i+=10)chunks.push(allUsers.slice(i,i+10));
  for(const chunk of chunks){
    await Promise.allSettled(chunk.map(async u=>{
      try{
        const member=await guild.members.fetch(u.discord_id).catch(()=>null);
        if(!member)return;
        const targetRank=rankRoleMap[u.rank??'new'];
        const rrole=guild.roles.cache.find(r=>r.name===targetRank);
        if(rrole&&!member.roles.cache.has(rrole.id))await member.roles.add(rrole).catch(()=>{});
        await applyXpRoles(guild,member,u.xp??0,u.vocal_minutes??0);
        count++;
      }catch{}
    }));
  }
  console.log(`[Boot] ${count} membres restaurés`);
}

// ── VOCAL PRIVÉ ───────────────────────────────────────────────
async function createPrivateVocal(guild, member){
  try{
    const catPv=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name.includes('VOCAUX PRIVÉS'));
    const ch=await guild.channels.create({
      name:`🔒 ${member.displayName}`,
      type:ChannelType.GuildVoice,
      parent:catPv?.id??null,
      permissionOverwrites:[
        {id:guild.id,deny:[PermissionFlagsBits.Connect]},
        {id:member.id,allow:[PermissionFlagsBits.Connect,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.MoveMembers]},
      ],
    });
    db.prepare('INSERT OR REPLACE INTO private_vocals (channel_id,owner_id) VALUES (?,?)').run(ch.id,member.id);
    db.prepare('INSERT OR REPLACE INTO vocal_cooldowns (discord_id,last_created) VALUES (?,?)').run(member.id,Math.floor(Date.now()/1000));
    return ch;
  }catch(e){console.error('[PV]',e.message);return null;}
}

// ── COMMANDS ─────────────────────────────────────────────────
const commands = [

  // /wenzy-setup (soft reset - garde rôles/salons customs)
  { data: new SlashCommandBuilder().setName('wenzy-setup').setDescription('🏗️ Configure (ou reset) le serveur complet').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const guild=interaction.guild, log=[];
      
      // ── Charger config sauvegardée ──
      const savedConfig=getServerConfig(guild.id);
      
      // ── Nettoyer SEULEMENT les canaux du template de base (pas les customs) ──
      const baseChannelNames=[
        '🔑┃verification','📌┃règles-et-info','📊┃leaderboard','📋┃logs','🔗┃link-roblox',
        '🗡️┃post-trades','📬┃poster-un-trade','🏆┃vouches','🛡️┃middleman-panel',
        '📦┃weapon-values','💬┃général','📺┃vidéos-wenzy','🛒┃boutique',
        '👋┃bienvenue','🪙┃classement-pièces','🏗️┃créer-un-vocal','🔇┃afk','😴┃sleep',
        '🎙️┃vocal-1','🎙️┃vocal-2','🎙️┃vocal-3',
        '🔒 VÉRIFICATION','📌 WENZY SYSTEM','🗡️ MM2 TRADING','💬 COMMUNAUTÉ','🛒 ECONOMY',
        '🎙️ VOCAUX','🗂️ VOCAUX PRIVÉS',
      ];
      for(const ch of guild.channels.cache.values()){
        if(baseChannelNames.includes(ch.name)||ch.name.includes('classement-pièces')||ch.name.includes('classement-pieces')){
          if(!savedConfig.channel_ids[ch.name]){ // pas sauvegardé comme custom
            await ch.delete('wenzy-setup reset').catch(()=>{});
            log.push(`🗑️ Supprimé: ${ch.name}`);
          }
        }
      }

      // ── RÔLES (réutiliser si déjà existants) ──
      const roleDefs=[
        {name:'👑 Owner',color:0xE74C3C,hoist:true,perms:[PermissionFlagsBits.Administrator]},
        {name:'⚡ Admin',color:0xE67E22,hoist:true,perms:[PermissionFlagsBits.Administrator]},
        {name:'🛡️ Modérateur',color:0x3498DB,hoist:true,perms:[PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.KickMembers,PermissionFlagsBits.BanMembers,PermissionFlagsBits.ViewAuditLog]},
        {name:'🤝 Middleman',color:0x2ECC71,hoist:true,perms:[PermissionFlagsBits.ManageMessages,PermissionFlagsBits.ManageThreads]},
        {name:'💎 Elite Trader',color:0x9B59B6,hoist:true,perms:[]},
        {name:'👑 VIP',color:0xF1C40F,hoist:true,perms:[]},
        {name:'👑 Elite',color:0xF1C40F,hoist:false,perms:[]},
        {name:'⭐ Fiable',color:0xF1C40F,hoist:false,perms:[]},
        {name:'✅ Confirmé',color:0x27AE60,hoist:false,perms:[]},
        {name:'🆕 Nouveau',color:0x95A5A6,hoist:false,perms:[]},
        {name:'🔒 Non Vérifié',color:0x2C2F33,hoist:false,perms:[]},
      ];
      for(const t of [...XP_MSG_TIERS,...XP_VOCAL_TIERS]){
        if(!guild.roles.cache.find(r=>r.name===t.name)) await guild.roles.create({name:t.name,color:t.color,hoist:false}).catch(()=>{});
      }
      const cr={};
      for(const rd of roleDefs){
        const ex=guild.roles.cache.find(r=>r.name===rd.name);
        if(ex){ cr[rd.name]=ex; if(rd.perms.length>0){const pb=rd.perms.reduce((acc,p)=>acc|p,0n);await ex.setPermissions(pb).catch(()=>{});} log.push(`♻️ Rôle: ${rd.name}`); }
        else{ const pb=rd.perms.length>0?rd.perms.reduce((acc,p)=>acc|p,0n):0n; cr[rd.name]=await guild.roles.create({name:rd.name,color:rd.color,hoist:rd.hoist,permissions:pb}); log.push(`✅ Rôle: ${rd.name}`); }
      }
      const admins=['👑 Owner','⚡ Admin','🛡️ Modérateur'].map(n=>cr[n]).filter(Boolean);
      const nonv=cr['🔒 Non Vérifié'];

      const catDefs=[
        {name:'🔒 VÉRIFICATION',chs:[{name:'🔑┃verification',verif:true}]},
        {name:'📌 WENZY SYSTEM',chs:[{name:'📌┃règles-et-info'},{name:'📊┃leaderboard'},{name:'📋┃logs',staff:true},{name:'🔗┃link-roblox'}]},
        {name:'🗡️ MM2 TRADING',chs:[{name:'🗡️┃post-trades'},{name:'📬┃poster-un-trade'},{name:'🏆┃vouches'},{name:'🛡️┃middleman-panel',staff:true}]},
        {name:'💬 COMMUNAUTÉ',chs:[{name:'👋┃bienvenue',readonly:true},{name:'💬┃général'},{name:'📺┃vidéos-wenzy'}]},
        {name:'🛒 ECONOMY',chs:[{name:'🛒┃boutique'},{name:'🪙┃classement-pièces',readonly:true}]},
        {name:'🎙️ VOCAUX',chs:[
          {name:'🏗️┃créer-un-vocal'},
          {name:'🔇┃afk',voice:true},
          {name:'😴┃sleep',voice:true},
          {name:'🎙️┃vocal-1',voice:true},
          {name:'🎙️┃vocal-2',voice:true},
          {name:'🎙️┃vocal-3',voice:true},
        ]},
        {name:'🗂️ VOCAUX PRIVÉS',chs:[]},
      ];
      const cm={};
      for(const cd of catDefs){
        const existingCat=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===cd.name);
        const cat=existingCat||await guild.channels.create({name:cd.name,type:ChannelType.GuildCategory,permissionOverwrites:[{id:guild.id,allow:[PermissionFlagsBits.ViewChannel]},nonv?{id:nonv.id,deny:[PermissionFlagsBits.ViewChannel]}:null].filter(Boolean)});
        log.push(`📁 ${cd.name}`);
        for(const ch of cd.chs){
          const existing=guild.channels.cache.find(c=>c.name===ch.name&&!c.isCategory());
          if(existing){cm[ch.name]=existing;log.push(`♻️ Salon: ${ch.name}`);continue;}
          const pows=[];
          if(ch.verif){pows.push({id:guild.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]});if(nonv)pows.push({id:nonv.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});}
          else if(ch.staff){pows.push({id:guild.id,deny:[PermissionFlagsBits.ViewChannel]});for(const r of admins)pows.push({id:r.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});}
          else if(ch.readonly){pows.push({id:guild.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]});if(nonv)pows.push({id:nonv.id,deny:[PermissionFlagsBits.ViewChannel]});}
          else{pows.push({id:guild.id,allow:[PermissionFlagsBits.ViewChannel]});if(nonv)pows.push({id:nonv.id,deny:[PermissionFlagsBits.ViewChannel]});}
          cm[ch.name]=await guild.channels.create({name:ch.name,type:ch.voice?ChannelType.GuildVoice:ChannelType.GuildText,parent:cat.id,permissionOverwrites:pows});
          log.push(`✅ Salon: ${ch.name}`);
        }
      }

      // ── EMBEDS ──
      const verifCh=cm['🔑┃verification'];
      if(verifCh){await verifCh.bulkDelete(10).catch(()=>{});await verifCh.send({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('🔑 Vérification Roblox').setDescription(['**Bienvenue sur le serveur !** 👋','','Pour accéder à tous les salons, tu dois lier ton compte Roblox.','','**Étape 1** — Clique sur le bouton ci-dessous','**Étape 2** — Entre ton pseudo Roblox dans le formulaire','**Étape 3** — Colle le code généré dans ta bio Roblox','**Étape 4** — Reviens ici et clique Confirmer','','> ✅ Une fois vérifié, tu obtiens le rôle **🆕 Nouveau** et accès à tous les salons.'].join('\n')).setFooter({text:'Wenzy Bot v6'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte Roblox').setStyle(ButtonStyle.Primary))]});log.push('✅ Embed vérification');}

      const ptCh=cm['📬┃poster-un-trade'];
      if(ptCh){await ptCh.bulkDelete(10).catch(()=>{});await ptCh.send({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📬 Poster un Trade MM2').setDescription(['Clique sur le bouton pour créer un trade.','','• Indique ce que tu offres (séparés par virgules)','• Indique la **Total Value** de ton offre','• Indique ce que tu cherches','• Indique la **Total Value** de ce que tu cherches (optionnel)'].join('\n'))],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_post_trade').setLabel('🗡️ Poster un Trade').setStyle(ButtonStyle.Success))]});log.push('✅ Embed poster-un-trade');}

      const linkCh=cm['🔗┃link-roblox'];
      if(linkCh){await linkCh.bulkDelete(10).catch(()=>{});await linkCh.send({embeds:[new EmbedBuilder().setColor(C.info).setTitle('🔗 Lier ton compte Roblox').setDescription(['Pour participer aux trades, tu dois lier ton compte Roblox à ton Discord.','','**1.** Clique sur **"Lier mon compte"** ci-dessous','**2.** Entre ton pseudo Roblox exact','**3.** Le bot génère un code unique','**4.** Colle ce code dans ta **bio Roblox**','**5.** Clique **"Vérifier maintenant"**'].join('\n')).setFooter({text:'Vérification via API Roblox officielle'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))]});log.push('✅ Embed link-roblox');}

      const boutiqueCh=cm['🛒┃boutique'];
      if(boutiqueCh){await postShopEmbed(boutiqueCh);log.push('✅ Boutique embed');}

      const pvCh=cm['🏗️┃créer-un-vocal'];
      if(pvCh){await pvCh.bulkDelete(10).catch(()=>{});await pvCh.send({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('🎙️ Créer un Vocal Privé').setDescription(['Clique sur le bouton pour créer ton vocal privé.','','**Commandes dans ton vocal :**','`!open` — Ouvrir à tout le monde','`!close` — Fermer (invitation uniquement)','`!add @user` — Inviter quelqu\'un','`!kick @user` — Expulser quelqu\'un','`!rename <nom>` — Renommer le vocal','','> ⚠️ AFK et Sleep ne comptent pas de pièces/XP','> ⏳ Cooldown : 5 minutes entre chaque création'].join('\n'))],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_create_vocal').setLabel('🎙️ Créer un vocal privé').setStyle(ButtonStyle.Primary))]});log.push('✅ Embed créer-vocal');}

      await updateLeaderboardChannel(guild);
      await updateCoinsLeaderboardChannel(guild);
      
      // ── Sauvegarder config ──
      const channelSnapshot={};for(const[name,ch]of Object.entries(cm))channelSnapshot[name]=ch.id;
      const roleSnapshot={};for(const[name,role]of Object.entries(cr))roleSnapshot[name]=role.id;
      saveServerConfig(guild.id,channelSnapshot,roleSnapshot);
      
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.success).setTitle('🏗️ Setup v6 terminé !')
        .setDescription(log.map(l=>`\`${l}\``).join('\n').slice(0,3900))
        .addFields({name:'📋 Prochaines étapes',value:['1. Donne-toi le rôle **👑 Owner**','2. `/addserver <lien>` pour les serveurs privés MM2','3. `/automod` pour configurer la modération automatique','4. `/server-save` pour sauvegarder ta config actuelle'].join('\n')}).setTimestamp()]});
    }
  },

  // /server-save
  { data: new SlashCommandBuilder().setName('server-save').setDescription('💾 Sauvegarder la configuration serveur actuelle').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const guild=interaction.guild;
      const channelIds={}, roleIds={};
      for(const[,ch]of guild.channels.cache) channelIds[ch.name]=ch.id;
      for(const[,role]of guild.roles.cache) roleIds[role.name]=role.id;
      saveServerConfig(guild.id,channelIds,roleIds);
      await interaction.editReply(`✅ Configuration sauvegardée — **${Object.keys(channelIds).length} salons** et **${Object.keys(roleIds).length} rôles** mémorisés.\n_Le prochain \`/wenzy-setup\` ne supprimera pas les salons/rôles customs._`);
    }
  },

  // /profil
  { data: new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche un profil').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(false)),
    async execute(interaction){
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
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});const sub=interaction.options.getSubcommand(),did=interaction.user.id;
      if(sub==='add'){const name=interaction.options.getString('arme');const row=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(name);const val=row?.value??0;db.prepare('INSERT INTO inventory (discord_id,weapon_name,weapon_value,verified) VALUES (?,?,?,?)').run(did,row?.name??name,val,val>0?1:0);await interaction.editReply(`✅ **${row?.name??name}** ajouté à ton inventory.`);}
      else if(sub==='remove'){const name=interaction.options.getString('arme');const r=db.prepare('DELETE FROM inventory WHERE discord_id=? AND LOWER(weapon_name)=LOWER(?)').run(did,name);if(!r.changes)return interaction.editReply('❌ Introuvable.');await interaction.editReply(`✅ **${name}** retiré.`);}
      else{const inv=db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(did);if(!inv.length)return interaction.editReply('📦 Inventory vide. Ajoute avec `/inventory add <arme>`.');await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📦 Ton Inventory MM2').setDescription(inv.map(w=>`• **${w.weapon_name}**`).join('\n').slice(0,2000)).setFooter({text:`${inv.length} arme(s)`})]});}
    }
  },

  // /trade
  { data: new SlashCommandBuilder().setName('trade').setDescription('🗡️ Système de trades MM2')
      .addSubcommand(s=>s.setName('post').setDescription('📤 Poster un trade').addStringOption(o=>o.setName('offre').setDescription('Armes offertes (virgules)').setRequired(true)).addStringOption(o=>o.setName('cherche').setDescription('Ce que tu cherches').setRequired(true)))
      .addSubcommand(s=>s.setName('cancel').setDescription('❌ Annuler ton trade').addIntegerOption(o=>o.setName('id').setDescription('ID du trade').setRequired(true)))
      .addSubcommand(s=>s.setName('check').setDescription('⚖️ Price check').addStringOption(o=>o.setName('offre').setDescription('Armes offertes').setRequired(true)).addStringOption(o=>o.setName('recois').setDescription('Armes reçues').setRequired(true)))
      .addSubcommand(s=>s.setName('search').setDescription('🔍 Chercher un trade par arme').addStringOption(o=>o.setName('arme').setDescription('Nom de l\'arme').setRequired(true)))
      .addSubcommand(s=>s.setName('mes-trades').setDescription('📋 Voir mes trades ouverts'))
      .addSubcommand(s=>s.setName('ban').setDescription('🔨 (Staff) Bannir un user des trades').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)))
      .addSubcommand(s=>s.setName('unban').setDescription('✅ (Staff) Débannir des trades').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true))),
    async execute(interaction){
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
      else if(sub==='search'){
        await interaction.deferReply();
        const arme=interaction.options.getString('arme').toLowerCase();
        const openTrades=db.prepare('SELECT * FROM trades WHERE status=? ORDER BY created_at DESC').all('open');
        const matches=openTrades.filter(t=>{
          const off=JSON.parse(t.offer_weapons),want=JSON.parse(t.want_weapons);
          return [...off,...want].some(w=>w.name.toLowerCase().includes(arme));
        });
        if(!matches.length)return interaction.editReply(`📭 Aucun trade ouvert ne contient **${interaction.options.getString('arme')}**.`);
        const embeds=matches.slice(0,5).map(t=>{
          const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(t.poster_id);
          return tradeEmbed(t,poster);
        });
        await interaction.editReply({content:`🔍 **${matches.length} trade(s) trouvé(s) pour \`${interaction.options.getString('arme')}\`** (top 5) :`,embeds:embeds.slice(0,5)});
      }
      else if(sub==='mes-trades'){
        await interaction.deferReply({ephemeral:true});
        const myTrades=db.prepare('SELECT * FROM trades WHERE poster_id=? AND status IN (\'open\',\'in_progress\') ORDER BY created_at DESC').all(did);
        if(!myTrades.length)return interaction.editReply('📭 Tu n\'as aucun trade ouvert en ce moment.');
        const lines=myTrades.map(t=>{
          const statusEmoji=t.status==='open'?'🟢':'🟡';
          const off=JSON.parse(t.offer_weapons).map(w=>w.name).join(', ');
          const want=JSON.parse(t.want_weapons).map(w=>w.name).join(', ');
          return `${statusEmoji} **Trade #${t.id}** (${t.status==='open'?'Ouvert':'En cours'})\n📤 ${off}\n📥 ${want}\n> ID pour annuler : \`/trade cancel id:${t.id}\``;
        });
        await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📋 Mes Trades Ouverts').setDescription(lines.join('\n\n').slice(0,3900)).setFooter({text:`${myTrades.length} trade(s) ouvert(s)`}).setTimestamp()]});
      }
      else if(sub==='ban'){
        await interaction.deferReply({ephemeral:true});
        if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
        const target=interaction.options.getUser('membre'),reason=interaction.options.getString('raison');
        db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
        db.prepare('UPDATE users SET trade_banned=1 WHERE discord_id=?').run(target.id);
        const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));
        if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(C.danger).setTitle('🔨 Ban Trades').addFields({name:'👤 Banni',value:`<@${target.id}>`,inline:true},{name:'🛡️ Par',value:`<@${interaction.user.id}>`,inline:true},{name:'📝 Raison',value:reason}).setTimestamp()]});
        await interaction.editReply(`✅ <@${target.id}> ne peut plus poster de trades. Raison : ${reason}`);
      }
      else if(sub==='unban'){
        await interaction.deferReply({ephemeral:true});
        if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
        const target=interaction.options.getUser('membre');
        db.prepare('UPDATE users SET trade_banned=0 WHERE discord_id=?').run(target.id);
        await interaction.editReply(`✅ <@${target.id}> peut à nouveau poster des trades.`);
      }
    }
  },

  // /vouch
  { data: new SlashCommandBuilder().setName('vouch').setDescription('⭐ Donner un vouch manuel à un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('commentaire').setDescription('Commentaire').setRequired(true)),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const target=interaction.options.getUser('membre'),comment=interaction.options.getString('commentaire'),did=interaction.user.id;
      if(target.id===did)return interaction.editReply('❌ Tu ne peux pas te vouch toi-même.');
      const existing=db.prepare('SELECT * FROM vouches WHERE from_id=? AND to_id=? AND manual=1 AND created_at>?').get(did,target.id,Math.floor(Date.now()/1000)-86400);
      if(existing)return interaction.editReply('⚠️ Tu as déjà donné un vouch à ce membre dans les dernières 24h.');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('INSERT INTO vouches (from_id,to_id,comment,manual) VALUES (?,?,?,1)').run(did,target.id,comment);
      db.prepare('UPDATE users SET vouch_count=vouch_count+1 WHERE discord_id=?').run(target.id);
      const vCh=interaction.guild.channels.cache.find(c=>c.name.includes('vouches'));
      if(vCh)await vCh.send({embeds:[new EmbedBuilder().setColor(C.gold).setTitle('⭐ Vouch Manuel').addFields({name:'📤 De',value:`<@${did}>`,inline:true},{name:'📥 Pour',value:`<@${target.id}>`,inline:true},{name:'💬 Commentaire',value:comment}).setTimestamp()]});
      await interaction.editReply(`✅ Vouch envoyé à <@${target.id}> !`);
    }
  },

  // /stats
  { data: new SlashCommandBuilder().setName('stats').setDescription('📊 Statistiques du serveur'),
    async execute(interaction){
      await interaction.deferReply();
      const totalUsers=db.prepare('SELECT COUNT(*) as c FROM users').get().c;
      const verifiedUsers=db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get().c;
      const totalTrades=db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed').c;
      const openTrades=db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('open').c;
      const inProgressTrades=db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('in_progress').c;
      const totalCoins=db.prepare('SELECT SUM(coins) as s FROM users').get().s??0;
      const totalVouches=db.prepare('SELECT COUNT(*) as c FROM vouches').get().c;
      const topArme=db.prepare(`SELECT json_extract(value,'$.name') as name, COUNT(*) as c FROM trades, json_each(json(offer_weapons)) WHERE status='completed' GROUP BY name ORDER BY c DESC LIMIT 1`).get();
      const totalReports=db.prepare('SELECT COUNT(*) as c FROM reports').get().c;
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📊 Statistiques du Serveur')
        .addFields(
          {name:'👥 Membres',value:`**${verifiedUsers}** vérifiés / ${totalUsers} inscrits`,inline:true},
          {name:'🗡️ Trades',value:`**${totalTrades}** complétés\n🟢 ${openTrades} ouverts | 🟡 ${inProgressTrades} en cours`,inline:true},
          {name:'⭐ Vouches',value:`**${totalVouches}** total`,inline:true},
          {name:'🪙 Économie',value:`**${totalCoins.toLocaleString('fr-FR')}** pièces en circulation`,inline:true},
          {name:'🚨 Reports',value:`**${totalReports}** signalements`,inline:true},
          {name:'🏆 Arme la + tradée',value:topArme?`**${topArme.name}** (${topArme.c}x)`:'_Aucune donnée_',inline:true},
        ).setFooter({text:'Wenzy Bot v6'}).setTimestamp()]});
    }
  },

  // /leaderboard
  { data: new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement traders'),
    async execute(interaction){
      await interaction.deferReply();
      const embed=buildLbTradesEmbed(0);
      const{totalPages}=leaderboardTradesPage(0);
      await interaction.editReply({embeds:[embed],components:totalPages>1?[lbPaginationRow('trades',0,totalPages)]:[]});
    }
  },

  // /updatevalue
  { data: new SlashCommandBuilder().setName('updatevalue').setDescription('💰 (Admin) Mettre à jour une arme').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)).addIntegerOption(o=>o.setName('valeur').setDescription('Valeur').setRequired(true)).addStringOption(o=>o.setName('tier').setDescription('Tier').addChoices({name:'Godly',value:'godly'},{name:'Chroma',value:'chroma'},{name:'Ancient',value:'ancient'},{name:'Legendary',value:'legendary'},{name:'Epic',value:'epic'},{name:'Rare',value:'rare'})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const name=interaction.options.getString('arme'),value=interaction.options.getInteger('valeur'),tier=interaction.options.getString('tier')??'godly';db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now')) ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`).run(name,value,tier);await interaction.editReply(`✅ **${name}** → **${value} val** (${tier})`);}
  },

  // /updatevalues
  { data: new SlashCommandBuilder().setName('updatevalues').setDescription('🔄 (Admin) Sync valeurs MM2').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});await fetchMM2Values();const count=db.prepare('SELECT COUNT(*) as c FROM weapon_values').get().c;await interaction.editReply(`✅ Sync terminée. **${count}** armes dans la base.`);}
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
  { data: new SlashCommandBuilder().setName('hotrades').setDescription('🔥 Les trades les plus gros en valeur'),
    async execute(interaction){await interaction.deferReply();const hot=db.prepare('SELECT * FROM trades WHERE status=? ORDER BY offer_value DESC LIMIT 5').all('open');if(!hot.length)return interaction.editReply('📭 Aucun hot trade en ce moment.');const embeds=hot.map(t=>{const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(t.poster_id);return tradeEmbed(t,poster);});await interaction.editReply({content:'🔥 **Les 5 plus gros trades ouverts :**',embeds:embeds.slice(0,5)});}
  },

  // /addxp
  { data: new SlashCommandBuilder().setName('addxp').setDescription('✨ (Staff) Ajouter de l\'XP').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('quantite').setDescription('Quantité XP').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
      const target=interaction.options.getUser('membre'),amount=interaction.options.getInteger('quantite'),reason=interaction.options.getString('raison')??' — ';
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET xp=MAX(0,xp+?) WHERE discord_id=?').run(amount,target.id);
      const u=db.prepare('SELECT xp,vocal_minutes FROM users WHERE discord_id=?').get(target.id);
      const member=await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(member)await applyXpRoles(interaction.guild,member,u.xp,u.vocal_minutes??0);
      await interaction.editReply(`✅ <@${target.id}> → **${amount>=0?'+':''}${amount} XP** | Total : **${u.xp} XP** | ${getXpMsgTier(u.xp).name}`);
    }
  },

  // /addcoins
  { data: new SlashCommandBuilder().setName('addcoins').setDescription('🪙 (Staff) Ajouter des pièces').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('quantite').setDescription('Quantité').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
      const target=interaction.options.getUser('membre'),amount=interaction.options.getInteger('quantite'),reason=interaction.options.getString('raison')??' — ';
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET coins=MAX(0,coins+?) WHERE discord_id=?').run(amount,target.id);
      const u=db.prepare('SELECT coins FROM users WHERE discord_id=?').get(target.id);
      const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));
      if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(amount>=0?C.success:C.warning).setTitle(`${amount>=0?'➕':'➖'} Pièces modifiées`).addFields({name:'👤 Membre',value:`<@${target.id}>`,inline:true},{name:'🪙 Modif',value:`${amount>=0?'+':''}${amount} 🪙`,inline:true},{name:'💰 Total',value:`${u.coins} 🪙`,inline:true},{name:'📝 Raison',value:reason,inline:false},{name:'🛡️ Staff',value:`<@${interaction.user.id}>`,inline:true}).setTimestamp()]});
      await interaction.editReply(`✅ <@${target.id}> → **${amount>=0?'+':''}${amount} 🪙** | Total : **${u.coins} 🪙**`);
      await updateCoinsLeaderboardChannel(interaction.guild);
    }
  },

  // /giveaway
  { data: new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Système de giveaway')
      .addSubcommand(s=>s.setName('start').setDescription('🎁 Lancer un giveaway').addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true)).addStringOption(o=>o.setName('duree').setDescription('Durée (ex: 1h, 30m, 2d)').setRequired(true)).addIntegerOption(o=>o.setName('gagnants').setDescription('Nombre de gagnants (défaut: 1)')).addChannelOption(o=>o.setName('salon').setDescription('Salon')))
      .addSubcommand(s=>s.setName('end').setDescription('🏁 Terminer manuellement').addIntegerOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand(s=>s.setName('reroll').setDescription('🔄 Reroll').addIntegerOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand(s=>s.setName('list').setDescription('📋 Lister les actifs'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
      const sub=interaction.options.getSubcommand();
      if(sub==='start'){
        const prize=interaction.options.getString('prix'),dureeStr=interaction.options.getString('duree'),winnersCount=interaction.options.getInteger('gagnants')??1,targetCh=interaction.options.getChannel('salon')??interaction.channel;
        let seconds=0;
        const dMatch=dureeStr.match(/(\d+)d/);const hMatch=dureeStr.match(/(\d+)h/);const mMatch=dureeStr.match(/(\d+)m/);const sMatch=dureeStr.match(/(\d+)s/);
        if(dMatch)seconds+=parseInt(dMatch[1])*86400;if(hMatch)seconds+=parseInt(hMatch[1])*3600;if(mMatch)seconds+=parseInt(mMatch[1])*60;if(sMatch)seconds+=parseInt(sMatch[1]);
        if(seconds<60)return interaction.editReply('❌ Durée minimum : 1 minute.');
        const endsAt=Math.floor(Date.now()/1000)+seconds;
        const res=db.prepare('INSERT INTO giveaways (channel_id,prize,winners_count,host_id,ends_at) VALUES (?,?,?,?,?)').run(targetCh.id,prize,winnersCount,interaction.user.id,endsAt);
        const gwId=res.lastInsertRowid;
        const embed=new EmbedBuilder().setColor(C.gold).setTitle(`🎉 GIVEAWAY — ${prize}`).setDescription([`Clique sur **🎉 Participer** pour entrer !`,'',`🎁 **Prix :** ${prize}`,`🏆 **Gagnants :** ${winnersCount}`,`⏳ **Fin :** <t:${endsAt}:R> (<t:${endsAt}:f>)`,`🎲 **ID :** #${gwId}`].join('\n')).setFooter({text:`Giveaway #${gwId} — Clique 🎉 !`}).setTimestamp();
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_join_${gwId}`).setLabel('🎉 Participer').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`gw_leave_${gwId}`).setLabel('❌ Se retirer').setStyle(ButtonStyle.Secondary));
        const msg=await targetCh.send({content:`@everyone 🎉 **Nouveau giveaway !**`,embeds:[embed],components:[row]});
        db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(msg.id,gwId);
        await interaction.editReply(`✅ Giveaway **#${gwId}** lancé !`);
        setTimeout(()=>endGiveaway(interaction.client,gwId),seconds*1000);
      }
      else if(sub==='end'){const gwId=interaction.options.getInteger('id');const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);if(!gw)return interaction.editReply('❌ Introuvable.');if(gw.status!=='active')return interaction.editReply('❌ Déjà terminé.');await endGiveaway(interaction.client,gwId);await interaction.editReply(`✅ Giveaway **#${gwId}** terminé.`);}
      else if(sub==='reroll'){const gwId=interaction.options.getInteger('id');const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);if(!gw)return interaction.editReply('❌ Introuvable.');const participants=JSON.parse(gw.participants||'[]');if(!participants.length)return interaction.editReply('❌ Aucun participant.');const newWinners=[...participants].sort(()=>Math.random()-0.5).slice(0,Math.min(gw.winners_count,participants.length));db.prepare('UPDATE giveaways SET winners=? WHERE id=?').run(JSON.stringify(newWinners),gwId);try{const ch=await interaction.client.channels.fetch(gw.channel_id).catch(()=>null);if(ch)await ch.send(`🔄 **Reroll #${gwId} — ${gw.prize}**\n🏆 Nouveaux gagnants : ${newWinners.map(w=>`<@${w}>`).join(', ')}`);}catch{}await interaction.editReply(`✅ Reroll effectué !`);}
      else if(sub==='list'){const active=db.prepare('SELECT * FROM giveaways WHERE status=? ORDER BY ends_at ASC').all('active');if(!active.length)return interaction.editReply('📭 Aucun giveaway actif.');const list=active.map(g=>{const p=JSON.parse(g.participants||'[]');return`**#${g.id}** — ${g.prize} | 🏆 ${g.winners_count} | 👥 ${p.length} | Fin : <t:${g.ends_at}:R>`;}).join('\n');await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold).setTitle('🎉 Giveaways actifs').setDescription(list).setTimestamp()]});}
    }
  },

  // /shopadd
  { data: new SlashCommandBuilder().setName('shopadd').setDescription('🛒 (Admin) Ajouter/modifier un item boutique').addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)).addIntegerOption(o=>o.setName('prix').setDescription('Prix').setRequired(true)).addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true)).addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'Rôle custom',value:'custom_role'},{name:'Rôle VIP',value:'vip_role'},{name:'Badge Elite',value:'elite_badge'},{name:'Item générique',value:'generic'})).addStringOption(o=>o.setName('emoji').setDescription('Emoji')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const nom=interaction.options.getString('nom'),prix=interaction.options.getInteger('prix'),desc=interaction.options.getString('description'),type=interaction.options.getString('type'),emoji=interaction.options.getString('emoji')??'🎁';db.prepare('INSERT INTO shop_items (name,description,price,item_type,emoji,active,added_by) VALUES (?,?,?,?,?,1,?) ON CONFLICT(name) DO UPDATE SET description=excluded.description,price=excluded.price,item_type=excluded.item_type,emoji=excluded.emoji,active=1,added_by=excluded.added_by').run(nom,desc,prix,type,emoji,interaction.user.id);const boutiqueCh=interaction.guild.channels.cache.find(c=>c.name.includes('boutique'));if(boutiqueCh)await postShopEmbed(boutiqueCh);await interaction.editReply(`✅ Item **${nom}** ajouté/mis à jour !`);}
  },

  // /shopremove
  { data: new SlashCommandBuilder().setName('shopremove').setDescription('🛒 (Admin) Retirer un item').addStringOption(o=>o.setName('nom').setDescription('Nom exact').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const nom=interaction.options.getString('nom');const r=db.prepare('UPDATE shop_items SET active=0 WHERE name=?').run(nom);if(!r.changes)return interaction.editReply(`❌ Item **${nom}** introuvable.`);const boutiqueCh=interaction.guild.channels.cache.find(c=>c.name.includes('boutique'));if(boutiqueCh)await postShopEmbed(boutiqueCh);await interaction.editReply(`✅ Item **${nom}** retiré.`);}
  },

  // /configvideo
  { data: new SlashCommandBuilder().setName('configvideo').setDescription('📺 (Admin) Configurer le salon vidéo').addChannelOption(o=>o.setName('salon').setDescription('Salon').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const ch=interaction.options.getChannel('salon');db.prepare('INSERT OR REPLACE INTO server_config (guild_id,channel_ids,role_ids) VALUES (?,?,?)').run(interaction.guild.id,JSON.stringify({video:ch.id}),JSON.stringify({}));process.env.VIDEO_CHANNEL_OVERRIDE=ch.id;await interaction.editReply(`✅ Salon vidéo configuré sur <#${ch.id}> !`);}
  },

  // ══ MODÉRATION ══════════════════════════════════════════════

  // /warn
  { data: new SlashCommandBuilder().setName('warn').setDescription('⚠️ (Staff) Avertir un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé aux modérateurs.');
      const target=interaction.options.getUser('membre'),reason=interaction.options.getString('raison');
      const cfg=getAutomodConfig(interaction.guild.id);
      const m=await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(!m)return interaction.editReply('❌ Membre introuvable.');
      if(hasModPerm(m))return interaction.editReply('❌ Tu ne peux pas warn un staff.');
      await autoWarn(interaction.guild,m,interaction.user.id,reason,cfg,'manual');
      const warnCount=db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(target.id)?.warn_count??1;
      await interaction.editReply(`✅ <@${target.id}> averti — **warn #${warnCount}** | Raison : ${reason}`);
    }
  },

  // /warns
  { data: new SlashCommandBuilder().setName('warns').setDescription('📋 Voir les warns d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre (défaut: soi-même)')),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const target=interaction.options.getUser('membre')??interaction.user;
      const warns=db.prepare('SELECT * FROM automod_warnings WHERE discord_id=? AND guild_id=? ORDER BY created_at DESC LIMIT 20').all(target.id,interaction.guild.id);
      const totalWarn=db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(target.id)?.warn_count??0;
      if(!warns.length)return interaction.editReply(`✅ <@${target.id}> n'a aucun warn sur ce serveur.`);
      const lines=warns.map((w,i)=>`**#${i+1}** — ${w.reason} _(${new Date(w.created_at*1000).toLocaleDateString('fr-FR')})_ | par <@${w.mod_id??'automod'}>`);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.warning).setTitle(`⚠️ Warns de ${target.username}`)
        .setDescription(lines.join('\n').slice(0,3900))
        .setFooter({text:`${totalWarn} warn(s) total`}).setTimestamp()]});
    }
  },

  // /clearwarns
  { data: new SlashCommandBuilder().setName('clearwarns').setDescription('🧹 (Staff) Effacer les warns d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé aux modérateurs.');
      const target=interaction.options.getUser('membre');
      db.prepare('DELETE FROM automod_warnings WHERE discord_id=? AND guild_id=?').run(target.id,interaction.guild.id);
      db.prepare('UPDATE users SET warn_count=0 WHERE discord_id=?').run(target.id);
      await interaction.editReply(`✅ Warns de <@${target.id}> effacés.`);
    }
  },

  // /mute
  { data: new SlashCommandBuilder().setName('mute').setDescription('🔇 (Staff) Mute temporaire').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('duree').setDescription('Durée en minutes (max 1440)').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé aux modérateurs.');
      const target=interaction.options.getUser('membre'),minutes=Math.min(interaction.options.getInteger('duree'),40320),reason=interaction.options.getString('raison')??' — ';
      const m=await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(!m)return interaction.editReply('❌ Membre introuvable.');
      if(hasModPerm(m))return interaction.editReply('❌ Tu ne peux pas mute un staff.');
      await m.timeout(minutes*60_000,reason);
      const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));
      if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(C.warning).setTitle('🔇 Mute').addFields({name:'👤 Muted',value:`<@${target.id}>`,inline:true},{name:'⏳ Durée',value:`${minutes} min`,inline:true},{name:'🛡️ Par',value:`<@${interaction.user.id}>`,inline:true},{name:'📝 Raison',value:reason}).setTimestamp()]});
      try{await m.send(`🔇 Tu as été **mute ${minutes} minutes** sur **${interaction.guild.name}**.\nRaison : ${reason}`);}catch{}
      await interaction.editReply(`✅ <@${target.id}> mute **${minutes} minutes**. Raison : ${reason}`);
    }
  },

  // /unmute
  { data: new SlashCommandBuilder().setName('unmute').setDescription('🔊 (Staff) Unmute un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){await interaction.deferReply({ephemeral:true});if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé.');const target=interaction.options.getUser('membre');const m=await interaction.guild.members.fetch(target.id).catch(()=>null);if(!m)return interaction.editReply('❌ Introuvable.');await m.timeout(null);await interaction.editReply(`✅ <@${target.id}> unmute.`);}
  },

  // /kick
  { data: new SlashCommandBuilder().setName('kick').setDescription('👢 (Staff) Kick un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé.');
      const target=interaction.options.getUser('membre'),reason=interaction.options.getString('raison')??' — ';
      const m=await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(!m)return interaction.editReply('❌ Introuvable.');
      if(hasModPerm(m))return interaction.editReply('❌ Pas de kick staff.');
      try{await m.send(`👢 Tu as été **kick** de **${interaction.guild.name}**.\nRaison : ${reason}`);}catch{}
      await m.kick(reason);
      const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));
      if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(C.danger).setTitle('👢 Kick').addFields({name:'👤 Kické',value:`${target.tag} (${target.id})`,inline:true},{name:'🛡️ Par',value:`<@${interaction.user.id}>`,inline:true},{name:'📝 Raison',value:reason}).setTimestamp()]});
      await interaction.editReply(`✅ **${target.tag}** kické. Raison : ${reason}`);
    }
  },

  // /ban
  { data: new SlashCommandBuilder().setName('ban').setDescription('🔨 (Staff) Bannir un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).addIntegerOption(o=>o.setName('supprimer').setDescription('Supprimer les messages des X derniers jours (0-7)').setMinValue(0).setMaxValue(7)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé.');
      const target=interaction.options.getUser('membre'),reason=interaction.options.getString('raison')??' — ',deleteMessageDays=interaction.options.getInteger('supprimer')??0;
      const m=await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(m&&hasModPerm(m))return interaction.editReply('❌ Pas de ban staff.');
      try{await target.send(`🔨 Tu as été **banni** de **${interaction.guild.name}**.\nRaison : ${reason}`);}catch{}
      await interaction.guild.members.ban(target.id,{reason,deleteMessageSeconds:deleteMessageDays*86400}).catch(()=>{});
      const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));
      if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(C.danger).setTitle('🔨 Ban').addFields({name:'👤 Banni',value:`${target.tag} (${target.id})`,inline:true},{name:'🛡️ Par',value:`<@${interaction.user.id}>`,inline:true},{name:'📝 Raison',value:reason}).setTimestamp()]});
      await interaction.editReply(`✅ **${target.tag}** banni. Raison : ${reason}`);
    }
  },

  // /unban
  { data: new SlashCommandBuilder().setName('unban').setDescription('✅ (Staff) Débannir').addStringOption(o=>o.setName('userid').setDescription('ID Discord du membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const userId=interaction.options.getString('userid'),reason=interaction.options.getString('raison')??' — ';try{await interaction.guild.members.unban(userId,reason);await interaction.editReply(`✅ <@${userId}> débanni.`);}catch{await interaction.editReply('❌ Utilisateur introuvable dans les bans.');}}
  },

  // /purge
  { data: new SlashCommandBuilder().setName('purge').setDescription('🗑️ (Staff) Supprimer des messages').addIntegerOption(o=>o.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).addUserOption(o=>o.setName('membre').setDescription('Supprimer seulement les messages de ce membre')).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé.');
      const nombre=interaction.options.getInteger('nombre'),target=interaction.options.getUser('membre');
      let messages=await interaction.channel.messages.fetch({limit:nombre+1}).catch(()=>null);
      if(!messages)return interaction.editReply('❌ Impossible de récupérer les messages.');
      messages=messages.filter(m=>!m.pinned);
      if(target)messages=messages.filter(m=>m.author.id===target.id);
      const toDelete=[...messages.values()].slice(0,nombre);
      const deleted=await interaction.channel.bulkDelete(toDelete,true).catch(()=>null);
      await interaction.editReply(`✅ **${deleted?.size??0}** messages supprimés.`);
    }
  },

  // /slowmode
  { data: new SlashCommandBuilder().setName('slowmode').setDescription('🐌 (Staff) Modifier le slowmode du salon').addIntegerOption(o=>o.setName('secondes').setDescription('Secondes (0 = désactiver, max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const secs=interaction.options.getInteger('secondes');await interaction.channel.setRateLimitPerUser(secs);await interaction.editReply(secs===0?'✅ Slowmode désactivé.`':'`✅ Slowmode mis à **'+secs+'s** dans ce salon.');}
  },

  // /embed
  { data: new SlashCommandBuilder().setName('embed').setDescription('📝 (Staff) Créer un embed custom').addStringOption(o=>o.setName('titre').setDescription('Titre').setRequired(true)).addStringOption(o=>o.setName('description').setDescription('Description (utilise \\n pour les sauts de ligne)').setRequired(true)).addStringOption(o=>o.setName('couleur').setDescription('Couleur hex (ex: #FF5733)')).addStringOption(o=>o.setName('image').setDescription('URL d\'image')).addChannelOption(o=>o.setName('salon').setDescription('Salon cible (défaut: salon actuel)')).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé.');
      const titre=interaction.options.getString('titre'),desc=interaction.options.getString('description').replace(/\\n/g,'\n');
      const couleur=interaction.options.getString('couleur');
      const imageUrl=interaction.options.getString('image');
      const targetCh=interaction.options.getChannel('salon')??interaction.channel;
      const colorVal=couleur?parseInt(couleur.replace('#',''),16):C.primary;
      const embed=new EmbedBuilder().setColor(isNaN(colorVal)?C.primary:colorVal).setTitle(titre).setDescription(desc).setTimestamp();
      if(imageUrl)embed.setImage(imageUrl);
      await targetCh.send({embeds:[embed]});
      await interaction.editReply(`✅ Embed posté dans <#${targetCh.id}> !`);
    }
  },

  // /announce
  { data: new SlashCommandBuilder().setName('announce').setDescription('📢 (Staff) Envoyer une annonce officielle').addStringOption(o=>o.setName('message').setDescription('Contenu de l\'annonce').setRequired(true)).addBooleanOption(o=>o.setName('ping').setDescription('Ping @everyone ? (défaut: false)')).addChannelOption(o=>o.setName('salon').setDescription('Salon cible')).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé.');
      const msg=interaction.options.getString('message').replace(/\\n/g,'\n');
      const ping=interaction.options.getBoolean('ping')??false;
      const targetCh=interaction.options.getChannel('salon')??interaction.channel;
      const embed=new EmbedBuilder().setColor(C.gold).setTitle('📢 Annonce').setDescription(msg).setFooter({text:`Par ${interaction.user.username}`}).setTimestamp();
      await targetCh.send({content:ping?'@everyone':'',embeds:[embed]});
      await interaction.editReply(`✅ Annonce envoyée dans <#${targetCh.id}> !`);
    }
  },

  // /role
  { data: new SlashCommandBuilder().setName('role').setDescription('🎭 (Staff) Gérer les rôles')
      .addSubcommand(s=>s.setName('give').setDescription('➕ Donner un rôle').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)))
      .addSubcommand(s=>s.setName('take').setDescription('➖ Retirer un rôle').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Rôle').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasModPerm(interaction.member))return interaction.editReply('❌ Réservé.');
      const sub=interaction.options.getSubcommand();
      const target=interaction.options.getUser('membre'),role=interaction.options.getRole('role');
      const m=await interaction.guild.members.fetch(target.id).catch(()=>null);
      if(!m)return interaction.editReply('❌ Membre introuvable.');
      if(role.position>=interaction.member.roles.highest.position)return interaction.editReply('❌ Ce rôle est trop haut dans la hiérarchie.');
      if(sub==='give'){await m.roles.add(role);await interaction.editReply(`✅ Rôle **${role.name}** donné à <@${target.id}>.`);}
      else{await m.roles.remove(role);await interaction.editReply(`✅ Rôle **${role.name}** retiré de <@${target.id}>.`);}
    }
  },

  // /info
  { data: new SlashCommandBuilder().setName('info').setDescription('ℹ️ Infos sur un membre').addUserOption(o=>o.setName('membre').setDescription('Membre (défaut: soi-même)')),
    async execute(interaction){
      await interaction.deferReply();
      const target=interaction.options.getUser('membre')??interaction.user;
      const m=await interaction.guild.members.fetch(target.id).catch(()=>null);
      const dbUser=db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
      const warns=db.prepare('SELECT COUNT(*) as c FROM automod_warnings WHERE discord_id=? AND guild_id=?').get(target.id,interaction.guild.id)?.c??0;
      const roles=m?.roles.cache.filter(r=>r.id!==interaction.guild.id).sort((a,b)=>b.position-a.position).map(r=>`<@&${r.id}>`).slice(0,10).join(', ')||'—';
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info)
        .setTitle(`ℹ️ ${target.username}`)
        .setThumbnail(target.displayAvatarURL({size:256}))
        .addFields(
          {name:'🆔 ID',value:target.id,inline:true},
          {name:'📅 Créé le',value:`<t:${Math.floor(target.createdTimestamp/1000)}:D>`,inline:true},
          {name:'📥 Rejoint le',value:m?`<t:${Math.floor(m.joinedTimestamp/1000)}:D>`:'—',inline:true},
          {name:'🎭 Rôles',value:roles.slice(0,500),inline:false},
          {name:'⚠️ Warns',value:`${warns}`,inline:true},
          {name:'🗡️ Trades',value:`${dbUser?.trade_count??0}`,inline:true},
          {name:'🪙 Pièces',value:`${dbUser?.coins??0}`,inline:true},
          {name:'🎮 Roblox',value:dbUser?.verified?`${dbUser.roblox_username} ✅`:'Non lié',inline:true},
        ).setTimestamp()]});
    }
  },

  // /serverinfo
  { data: new SlashCommandBuilder().setName('serverinfo').setDescription('🏠 Infos sur le serveur'),
    async execute(interaction){
      await interaction.deferReply();
      const g=interaction.guild;
      const totalMembers=g.memberCount;
      const bots=g.members.cache.filter(m=>m.user.bot).size;
      const humans=totalMembers-bots;
      const verifiedDB=db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get().c;
      const textChannels=g.channels.cache.filter(c=>c.type===ChannelType.GuildText).size;
      const voiceChannels=g.channels.cache.filter(c=>c.type===ChannelType.GuildVoice).size;
      const roles=g.roles.cache.size-1;
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.primary)
        .setTitle(`🏠 ${g.name}`)
        .setThumbnail(g.iconURL({size:256}))
        .addFields(
          {name:'👑 Propriétaire',value:`<@${g.ownerId}>`,inline:true},
          {name:'📅 Créé le',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
          {name:'🌍 Région',value:`${g.preferredLocale}`,inline:true},
          {name:'👥 Membres',value:`${humans} humains | ${bots} bots`,inline:true},
          {name:'✅ Vérifiés Roblox',value:`${verifiedDB}`,inline:true},
          {name:'🎭 Rôles',value:`${roles}`,inline:true},
          {name:'💬 Salons texte',value:`${textChannels}`,inline:true},
          {name:'🎙️ Salons vocaux',value:`${voiceChannels}`,inline:true},
          {name:'💎 Niveau Nitro',value:`${g.premiumTier}`,inline:true},
        ).setFooter({text:`ID: ${g.id}`}).setTimestamp()]});
    }
  },

  // /ping
  { data: new SlashCommandBuilder().setName('ping').setDescription('🏓 Ping du bot'),
    async execute(interaction){await interaction.deferReply();const sent=await interaction.editReply('🏓 Pong !');const latency=sent.createdTimestamp-interaction.createdTimestamp;await interaction.editReply(`🏓 **Pong !**\n📡 Latence API : **${interaction.client.ws.ping}ms**\n⚡ Round-trip : **${latency}ms**`);}
  },

  // /sondage
  { data: new SlashCommandBuilder().setName('sondage').setDescription('📊 Créer un sondage')
      .addStringOption(o=>o.setName('question').setDescription('Question').setRequired(true))
      .addStringOption(o=>o.setName('option1').setDescription('Option 1').setRequired(true))
      .addStringOption(o=>o.setName('option2').setDescription('Option 2').setRequired(true))
      .addStringOption(o=>o.setName('option3').setDescription('Option 3'))
      .addStringOption(o=>o.setName('option4').setDescription('Option 4'))
      .addStringOption(o=>o.setName('duree').setDescription('Durée (ex: 1h, 30m, 1d). Défaut: 24h'))
      .addChannelOption(o=>o.setName('salon').setDescription('Salon (défaut: actuel)')),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const question=interaction.options.getString('question');
      const options=[interaction.options.getString('option1'),interaction.options.getString('option2'),interaction.options.getString('option3'),interaction.options.getString('option4')].filter(Boolean);
      const dureeStr=interaction.options.getString('duree')??'24h';
      const targetCh=interaction.options.getChannel('salon')??interaction.channel;
      let seconds=86400;
      const hM=dureeStr.match(/(\d+)h/);const mM=dureeStr.match(/(\d+)m/);const dM=dureeStr.match(/(\d+)d/);
      if(dM)seconds=parseInt(dM[1])*86400;else if(hM)seconds=parseInt(hM[1])*3600+((mM?parseInt(mM[1])*60:0));else if(mM)seconds=parseInt(mM[1])*60;
      const endsAt=Math.floor(Date.now()/1000)+seconds;
      const res=db.prepare('INSERT INTO polls (guild_id,channel_id,question,options,ends_at,host_id) VALUES (?,?,?,?,?,?)').run(interaction.guild.id,targetCh.id,question,JSON.stringify(options),endsAt,interaction.user.id);
      const pollId=res.lastInsertRowid;
      const poll=db.prepare('SELECT * FROM polls WHERE id=?').get(pollId);
      const msg=await targetCh.send({embeds:[buildPollEmbed(poll)],components:[buildPollButtons(pollId,options)]});
      db.prepare('UPDATE polls SET message_id=? WHERE id=?').run(msg.id,pollId);
      await interaction.editReply(`✅ Sondage **#${pollId}** lancé dans <#${targetCh.id}> !`);
      setTimeout(async()=>{
        const finalPoll=db.prepare('SELECT * FROM polls WHERE id=?').get(pollId);
        if(finalPoll?.status!=='active')return;
        db.prepare('UPDATE polls SET status=? WHERE id=?').run('ended',pollId);
        try{const ch=await interaction.client.channels.fetch(finalPoll.channel_id).catch(()=>null);if(!ch)return;const m=await ch.messages.fetch(finalPoll.message_id).catch(()=>null);if(m)await m.edit({embeds:[buildPollEmbed(finalPoll,true)],components:[buildPollButtons(pollId,options,true)]}).catch(()=>{});await ch.send(`📊 **Le sondage est terminé !** Voici les résultats ↑`);}catch{}
      },seconds*1000);
    }
  },

  // /automod
  { data: new SlashCommandBuilder().setName('automod').setDescription('🤖 Configuration de l\'AutoMod')
      .addSubcommand(s=>s.setName('status').setDescription('📋 Voir la configuration'))
      .addSubcommand(s=>s.setName('enable').setDescription('✅ Activer l\'automod'))
      .addSubcommand(s=>s.setName('disable').setDescription('❌ Désactiver l\'automod'))
      .addSubcommand(s=>s.setName('anti-spam').setDescription('🔁 Config anti-spam').addIntegerOption(o=>o.setName('seuil').setDescription('Nb messages avant action (défaut: 5)').setMinValue(2)).addIntegerOption(o=>o.setName('secondes').setDescription('Fenêtre de temps en secondes (défaut: 5)').setMinValue(2)))
      .addSubcommand(s=>s.setName('anti-liens').setDescription('🔗 Activer/désactiver l\'anti-liens').addBooleanOption(o=>o.setName('actif').setDescription('Activer ?').setRequired(true)))
      .addSubcommand(s=>s.setName('anti-mentions').setDescription('📣 Config anti-mass-mention').addIntegerOption(o=>o.setName('limit').setDescription('Nb mentions max par message (défaut: 5)').setMinValue(2)))
      .addSubcommand(s=>s.setName('add-mot').setDescription('🚫 Ajouter un mot banni').addStringOption(o=>o.setName('mot').setDescription('Mot').setRequired(true)))
      .addSubcommand(s=>s.setName('remove-mot').setDescription('✅ Retirer un mot banni').addStringOption(o=>o.setName('mot').setDescription('Mot').setRequired(true)))
      .addSubcommand(s=>s.setName('seuil-warn').setDescription('⚠️ Seuil de warns pour le mute auto').addIntegerOption(o=>o.setName('warns').setDescription('Nb warns (défaut: 3)').setMinValue(1).setRequired(true)).addIntegerOption(o=>o.setName('duree').setDescription('Durée du mute auto en minutes (défaut: 10)').setMinValue(1)))
      .addSubcommand(s=>s.setName('logs').setDescription('📋 Salon de logs automod').addChannelOption(o=>o.setName('salon').setDescription('Salon').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!interaction.member.permissions.has(PermissionFlagsBits.Administrator))return interaction.editReply('❌ Réservé aux admins.');
      const sub=interaction.options.getSubcommand(),gid=interaction.guild.id;
      const cfg=getAutomodConfig(gid);
      if(sub==='status'){
        const words=JSON.parse(cfg.banned_words||'[]');
        await interaction.editReply({embeds:[new EmbedBuilder().setColor(cfg.enabled?C.success:C.danger).setTitle('🤖 Configuration AutoMod')
          .addFields(
            {name:'🔧 État',value:cfg.enabled?'✅ Actif':'❌ Inactif',inline:true},
            {name:'🔁 Anti-spam',value:cfg.anti_spam?`✅ ${cfg.spam_threshold} msgs / ${cfg.spam_seconds}s`:'❌ Désactivé',inline:true},
            {name:'🔗 Anti-liens',value:cfg.anti_links?'✅ Actif':'❌ Désactivé',inline:true},
            {name:'📣 Anti-mentions',value:cfg.anti_mass_mention?`✅ Max ${cfg.mass_mention_limit} mentions`:'❌ Désactivé',inline:true},
            {name:'⚠️ Mute auto',value:`Après ${cfg.auto_mute_warns} warns — ${cfg.auto_mute_duration} min`,inline:true},
            {name:'🚫 Mots bannis',value:words.length?words.join(', '):'_Aucun_',inline:false},
            {name:'📋 Logs',value:cfg.log_channel_id?`<#${cfg.log_channel_id}>`:'_Non configuré_',inline:true},
          ).setTimestamp()]});
      }
      else if(sub==='enable'){saveAutomodConfig(gid,{enabled:1});await interaction.editReply('✅ AutoMod activé.');}
      else if(sub==='disable'){saveAutomodConfig(gid,{enabled:0});await interaction.editReply('⚠️ AutoMod désactivé.');}
      else if(sub==='anti-spam'){const seuil=interaction.options.getInteger('seuil')??cfg.spam_threshold,secs=interaction.options.getInteger('secondes')??cfg.spam_seconds;saveAutomodConfig(gid,{anti_spam:1,spam_threshold:seuil,spam_seconds:secs});await interaction.editReply(`✅ Anti-spam : **${seuil}** messages en **${secs}s** → warn + mute auto.`);}
      else if(sub==='anti-liens'){const actif=interaction.options.getBoolean('actif');saveAutomodConfig(gid,{anti_links:actif?1:0});await interaction.editReply(`${actif?'✅':'❌'} Anti-liens ${actif?'activé':'désactivé'}.`);}
      else if(sub==='anti-mentions'){const limit=interaction.options.getInteger('limit')??cfg.mass_mention_limit;saveAutomodConfig(gid,{anti_mass_mention:1,mass_mention_limit:limit});await interaction.editReply(`✅ Anti-mentions : max **${limit}** pings par message.`);}
      else if(sub==='add-mot'){const mot=interaction.options.getString('mot').toLowerCase();const words=JSON.parse(cfg.banned_words||'[]');if(words.includes(mot))return interaction.editReply('⚠️ Déjà dans la liste.');words.push(mot);saveAutomodConfig(gid,{banned_words:JSON.stringify(words)});await interaction.editReply(`✅ Mot **${mot}** ajouté à la liste noire.`);}
      else if(sub==='remove-mot'){const mot=interaction.options.getString('mot').toLowerCase();const words=JSON.parse(cfg.banned_words||'[]').filter(w=>w!==mot);saveAutomodConfig(gid,{banned_words:JSON.stringify(words)});await interaction.editReply(`✅ Mot **${mot}** retiré.`);}
      else if(sub==='seuil-warn'){const warns=interaction.options.getInteger('warns'),duree=interaction.options.getInteger('duree')??cfg.auto_mute_duration;saveAutomodConfig(gid,{auto_mute_warns:warns,auto_mute_duration:duree});await interaction.editReply(`✅ Mute auto après **${warns}** warns — durée : **${duree} minutes**.`);}
      else if(sub==='logs'){const ch=interaction.options.getChannel('salon');saveAutomodConfig(gid,{log_channel_id:ch.id});await interaction.editReply(`✅ Logs automod → <#${ch.id}>.`);}
    }
  },

  // /link
  { data: new SlashCommandBuilder().setName('link').setDescription('🔗 Lie ton compte Roblox').addStringOption(o=>o.setName('username').setDescription('Ton pseudo Roblox exact').setRequired(true)),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const username=interaction.options.getString('username'),did=interaction.user.id;
      let rb;try{rb=await searchRobloxUser(username);}catch{return interaction.editReply('❌ API Roblox indisponible. Réessaie.');}
      if(!rb)return interaction.editReply(`❌ Pseudo Roblox **${username}** introuvable.`);
      const code=genCode();
      const ex=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      if(ex)db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id),rb.name,code,did);
      else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did,String(rb.id),rb.name,code);
      try{const nv=interaction.guild.roles.cache.find(r=>r.name==='🔒 Non Vérifié');if(nv&&!interaction.member.roles.cache.has(nv.id))await interaction.member.roles.add(nv);}catch{}
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info).setTitle('🔗 Vérification — Étape 1/2').setDescription([`Compte : **${rb.name}** (ID: ${rb.id})`,'','**Code à coller dans ta bio Roblox :**',`\`\`\`${code}\`\`\``,'→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)','','Reviens ici et clique Vérifier.'].join('\n')).setFooter({text:'Code valable 15 min'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))]});
    }
  },

  // /verify
  { data: new SlashCommandBuilder().setName('verify').setDescription('✅ Confirme la vérification Roblox'),
    async execute(interaction){await interaction.deferReply({ephemeral:true});await doVerify(interaction);}
  },

];
