// ═══════════════════════════════════════════════════════════════
//  WENZY BOT — bot.js  (tout-en-un, aucun fichier externe requis)
//  node bot.js  /  Procfile: worker: node bot.js
// ═══════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();

const {
  Client, GatewayIntentBits, Collection, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const axios   = require('axios');
const cron    = require('node-cron');
const Database = require('better-sqlite3');
const path    = require('path');

// ───────────────────────────────────────────────────────────────
// DATABASE
// ───────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'wenzy.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id      TEXT PRIMARY KEY,
    roblox_id       TEXT,
    roblox_username TEXT,
    roblox_avatar   TEXT,
    verify_code     TEXT,
    verified        INTEGER DEFAULT 0,
    coins           INTEGER DEFAULT 0,
    vocal_minutes   INTEGER DEFAULT 0,
    trade_count     INTEGER DEFAULT 0,
    vouch_count     INTEGER DEFAULT 0,
    report_count    INTEGER DEFAULT 0,
    rank            TEXT DEFAULT 'new',
    created_at      INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS inventory (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id   TEXT NOT NULL,
    weapon_name  TEXT NOT NULL,
    weapon_value INTEGER DEFAULT 0,
    verified     INTEGER DEFAULT 0,
    added_at     INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS trades (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    poster_id      TEXT NOT NULL,
    accepter_id    TEXT,
    offer_weapons  TEXT NOT NULL,
    want_weapons   TEXT NOT NULL,
    offer_value    INTEGER DEFAULT 0,
    want_value     INTEGER DEFAULT 0,
    status         TEXT DEFAULT 'open',
    thread_id      TEXT,
    server_link    TEXT,
    middleman_id   TEXT,
    screenshot_url TEXT,
    created_at     INTEGER DEFAULT (strftime('%s','now')),
    completed_at   INTEGER
  );
  CREATE TABLE IF NOT EXISTS vouches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id    TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    trade_id   INTEGER,
    comment    TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS weapon_values (
    name       TEXT PRIMARY KEY,
    value      INTEGER NOT NULL,
    tier       TEXT DEFAULT 'common',
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS private_servers (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    link     TEXT NOT NULL,
    in_use   INTEGER DEFAULT 0,
    trade_id INTEGER,
    added_by TEXT
  );
  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id TEXT NOT NULL,
    reported_id TEXT NOT NULL,
    trade_id    INTEGER,
    reason      TEXT,
    status      TEXT DEFAULT 'open',
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS vocal_sessions (
    discord_id TEXT PRIMARY KEY,
    joined_at  INTEGER
  );
  CREATE TABLE IF NOT EXISTS youtube_last (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    video_id   TEXT,
    checked_at INTEGER
  );
  INSERT OR IGNORE INTO youtube_last (id, checked_at) VALUES (1, 0);
`);

const defaultWeapons = [
  ['Chroma Seer', 165, 'chroma'],
  ['Corrupt', 90, 'godly'],
  ['Hallowscythe', 80, 'godly'],
  ['Ancient Seer', 200, 'ancient'],
  ['Chroma Harvester', 150, 'chroma'],
  ['Chroma Lightbringer', 140, 'chroma'],
  ['Elderwood Scythe', 85, 'godly'],
  ['Batwing', 60, 'godly'],
  ['Shark', 55, 'godly'],
  ['Chroma Luger', 120, 'chroma'],
  ['Icicle', 50, 'godly'],
  ['Prism', 95, 'godly'],
  ['Chroma Boneblade', 110, 'chroma'],
];
const _insertW = db.prepare(`INSERT OR IGNORE INTO weapon_values (name, value, tier) VALUES (?, ?, ?)`);
for (const [n, v, t] of defaultWeapons) _insertW.run(n, v, t);

// ───────────────────────────────────────────────────────────────
// RANKS
// ───────────────────────────────────────────────────────────────
const RANKS = {
  new:       { label: '🆕 Nouveau',  min: 0,  maxValue: 100  },
  confirmed: { label: '✅ Confirmé', min: 5,  maxValue: null },
  trusted:   { label: '⭐ Fiable',   min: 20, maxValue: null },
  elite:     { label: '👑 Elite',    min: 50, maxValue: null },
};
function getRank(n)      { if (n >= 50) return 'elite'; if (n >= 20) return 'trusted'; if (n >= 5) return 'confirmed'; return 'new'; }
function getRankLabel(r) { return RANKS[r]?.label ?? '🆕 Nouveau'; }

// ───────────────────────────────────────────────────────────────
// COLORS + EMBEDS
// ───────────────────────────────────────────────────────────────
const COLORS = {
  primary: 0x7B2FBE, success: 0x2ECC71, warning: 0xF39C12,
  danger:  0xE74C3C, info:    0x3498DB, gold:    0xF1C40F, dark: 0x2C2F33,
};

function tradeEmbed(trade, poster) {
  const off  = JSON.parse(trade.offer_weapons);
  const want = JSON.parse(trade.want_weapons);
  const fair = Math.abs(trade.offer_value - trade.want_value) <= 20;
  const fairLabel = fair ? '⚖️ Fair' : (trade.offer_value > trade.want_value ? '📈 Avantageux pour toi' : '📉 Unfair');
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`🗡️ TRADE #${String(trade.id).padStart(4, '0')}`)
    .addFields(
      { name: '👤 Trader',    value: `<@${trade.poster_id}> ${poster?.verified ? '✅ Vérifié' : '⚠️ Non vérifié'}\n⭐ ${poster?.trade_count ?? 0} trades`, inline: true },
      { name: '📤 OFFRE',    value: off.map(w => `• ${w.name} _(${w.value} pts)_`).join('\n') || '—', inline: true },
      { name: '📥 CHERCHE',  value: want.map(w => `• ${w.name}`).join('\n') || '—', inline: true },
      { name: '💎 Valeur',   value: `**${trade.offer_value} pts**`, inline: true },
      { name: '⚖️ Équité',   value: fairLabel, inline: true },
    )
    .setFooter({ text: `Posté le ${new Date(trade.created_at * 1000).toLocaleDateString('fr-FR')}` })
    .setTimestamp();
}
function tradeButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_accept_${id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trade_negotiate_${id}`).setLabel('💬 Négocier').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Middleman').setStyle(ButtonStyle.Primary),
  );
}
function threadSummaryEmbed(trade, poster, accepter) {
  const off  = JSON.parse(trade.offer_weapons);
  const want = JSON.parse(trade.want_weapons);
  const diff = trade.offer_value - trade.want_value;
  const fair = Math.abs(diff) <= 20;
  return new EmbedBuilder()
    .setColor(fair ? COLORS.success : COLORS.warning)
    .setTitle(`🗡️ TRADE EN COURS #${String(trade.id).padStart(4, '0')}`)
    .addFields(
      { name: `📤 <@${trade.poster_id}> offre`,   value: off.map(w => `• ${w.name} _(${w.value} pts)_`).join('\n'), inline: true },
      { name: `📥 <@${trade.accepter_id}> offre`, value: want.map(w => `• ${w.name}`).join('\n'), inline: true },
      { name: '⚖️ Résultat', value: fair ? `✅ Fair\nDiff : ${Math.abs(diff)} pts` : `⚠️ Unfair\nDiff : ${Math.abs(diff)} pts`, inline: false },
    ).setTimestamp();
}
function threadButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_confirm_${id}`).setLabel('✅ Confirmer').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trade_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Middleman').setStyle(ButtonStyle.Primary),
  );
}
function profileEmbed(user, inventory) {
  const totalValue = inventory.reduce((a, w) => a + w.weapon_value, 0);
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`👤 ${user.roblox_username ?? 'Non lié'}`)
    .setThumbnail(user.roblox_avatar ?? null)
    .addFields(
      { name: '🎮 Roblox',    value: user.verified ? `${user.roblox_username} ✅ Vérifié` : '❌ Non lié', inline: true },
      { name: '⭐ Réputation', value: `Trades : **${user.trade_count}** ✅\nVouches : **${user.vouch_count}**\nReports : **${user.report_count}**\nRang : **${getRankLabel(user.rank)}**`, inline: true },
      { name: '📦 Inventory',  value: inventory.length ? inventory.map(w => `• ${w.weapon_name} ≈ **${w.weapon_value} pts** ${w.verified ? '✅' : '⚠️'}`).join('\n') : '— Vide', inline: false },
      { name: '💎 Valeur',     value: `**~${totalValue} pts**`, inline: true },
      { name: '🪙 Pièces',     value: `**${user.coins}**`, inline: true },
      { name: '⏱️ Vocal',      value: `**${user.vocal_minutes} min**`, inline: true },
    ).setTimestamp();
}
function middlemanPanelEmbed(trade, poster, accepter) {
  const off  = JSON.parse(trade.offer_weapons);
  const want = JSON.parse(trade.want_weapons);
  const diff = trade.offer_value - trade.want_value;
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`🛡️ PANEL MIDDLEMAN — TRADE #${String(trade.id).padStart(4, '0')}`)
    .addFields(
      { name: '👤 Poster',       value: `<@${trade.poster_id}> (${poster?.trade_count ?? 0} trades)`, inline: true },
      { name: '👤 Accepter',     value: `<@${trade.accepter_id}> (${accepter?.trade_count ?? 0} trades)`, inline: true },
      { name: '📤 Offre poster', value: off.map(w => `${w.name} — ${w.value}pts`).join('\n'), inline: false },
      { name: '📥 Offre accept', value: want.map(w => w.name).join('\n'), inline: false },
      { name: '⚖️ Différence',  value: `${Math.abs(diff)} pts (${diff > 0 ? 'avantage poster' : 'avantage accepter'})`, inline: false },
    ).setTimestamp();
}
function middlemanButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mm_validate_${id}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`mm_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mm_report_${id}`).setLabel('🚨 Report scam').setStyle(ButtonStyle.Secondary),
  );
}

// ───────────────────────────────────────────────────────────────
// ROBLOX HELPERS
// ───────────────────────────────────────────────────────────────
function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'WENZY-';
  for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
async function searchRobloxUser(username) {
  const r = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [username], excludeBannedUsers: true });
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

// ───────────────────────────────────────────────────────────────
// TRADE HELPERS
// ───────────────────────────────────────────────────────────────
function parseWeapons(str) { return str.split(',').map(s => s.trim()).filter(Boolean); }
function calcValue(names) {
  let total = 0;
  const details = [];
  for (const name of names) {
    const row = db.prepare('SELECT * FROM weapon_values WHERE LOWER(name) = LOWER(?)').get(name);
    const val = row?.value ?? 0;
    total += val;
    details.push({ name: row?.name ?? name, value: val });
  }
  return { total, details };
}
function getAvailableServer() {
  return db.prepare('SELECT * FROM private_servers WHERE in_use = 0 LIMIT 1').get();
}

// ───────────────────────────────────────────────────────────────
// SHOP ITEMS
// ───────────────────────────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'color_role',  label: '🎨 Rôle couleur custom', price: 500   },
  { id: 'vip_role',    label: '👑 Rôle VIP',             price: 1000  },
  { id: 'elite_badge', label: '🏆 Badge Elite',          price: 10000 },
];

// ───────────────────────────────────────────────────────────────
// COMMANDS
// ───────────────────────────────────────────────────────────────
const commands = [

  // ── /wenzy-setup ────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('wenzy-setup')
      .setDescription('🏗️ Configure entièrement le serveur Wenzy Bot')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      const statusLines = [];

      const roleDefs = [
        { name: '👑 Owner',        color: 0xE74C3C, hoist: true  },
        { name: '⚡ Admin',         color: 0xE67E22, hoist: true  },
        { name: '🛡️ Modérateur',   color: 0x3498DB, hoist: true  },
        { name: '🤝 Middleman',     color: 0x2ECC71, hoist: true  },
        { name: '💎 Elite Trader',  color: 0x9B59B6, hoist: true  },
        { name: '⭐ Fiable',        color: 0xF1C40F, hoist: false },
        { name: '✅ Confirmé',      color: 0x27AE60, hoist: false },
        { name: '🆕 Nouveau',       color: 0x95A5A6, hoist: false },
      ];
      const createdRoles = {};
      for (const rd of roleDefs) {
        const ex = guild.roles.cache.find(r => r.name === rd.name);
        if (ex) { createdRoles[rd.name] = ex; statusLines.push(`♻️ Rôle : ${rd.name}`); }
        else {
          const role = await guild.roles.create({ name: rd.name, color: rd.color, hoist: rd.hoist, reason: 'Wenzy Setup' });
          createdRoles[rd.name] = role;
          statusLines.push(`✅ Rôle créé : ${rd.name}`);
        }
      }

      const adminRoles = ['👑 Owner','⚡ Admin','🛡️ Modérateur'].map(n => createdRoles[n]).filter(Boolean);
      const staffOW    = adminRoles.map(r => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }));

      const categories = [
        { name: '📌 WENZY SYSTEM', channels: [
          { name: '📌┃règles-et-info', type: ChannelType.GuildText, public: true  },
          { name: '🔗┃link-roblox',    type: ChannelType.GuildText, public: true  },
          { name: '📊┃leaderboard',    type: ChannelType.GuildText, public: true  },
          { name: '📋┃logs',           type: ChannelType.GuildText, public: false, staffOnly: true },
        ]},
        { name: '🗡️ MM2 TRADING', channels: [
          { name: '🗡️┃post-trades',    type: ChannelType.GuildText, public: true  },
          { name: '💰┃price-check',    type: ChannelType.GuildText, public: true  },
          { name: '⭐┃vouches',        type: ChannelType.GuildText, public: true  },
          { name: '🔥┃hot-trades',     type: ChannelType.GuildText, public: true  },
          { name: '🛡️┃middleman-panel',type: ChannelType.GuildText, public: false, staffOnly: true },
        ]},
        { name: '🌐 COMMUNAUTÉ', channels: [
          { name: '💬┃général',        type: ChannelType.GuildText, public: true },
          { name: '🎮┃mes-jeux-roblox',type: ChannelType.GuildText, public: true },
          { name: '📺┃vidéos-wenzy',   type: ChannelType.GuildText, public: true },
        ]},
        { name: '💰 ÉCONOMIE', channels: [
          { name: '🏪┃shop',              type: ChannelType.GuildText, public: true },
          { name: '🏆┃classement-pièces', type: ChannelType.GuildText, public: true },
        ]},
        { name: '🔊 VOCAUX', channels: [
          { name: '🔊 Lounge',      type: ChannelType.GuildVoice, public: true },
          { name: '🔊 Trade Room 1',type: ChannelType.GuildVoice, public: true },
          { name: '🔊 Trade Room 2',type: ChannelType.GuildVoice, public: true },
          { name: '🔊 Trade Room 3',type: ChannelType.GuildVoice, public: true },
        ]},
      ];

      const channelMap = {};
      for (const catDef of categories) {
        let cat = guild.channels.cache.find(c => c.name === catDef.name && c.type === ChannelType.GuildCategory);
        if (!cat) {
          cat = await guild.channels.create({ name: catDef.name, type: ChannelType.GuildCategory, reason: 'Wenzy Setup' });
          statusLines.push(`✅ Catégorie : ${catDef.name}`);
        } else { statusLines.push(`♻️ Catégorie : ${catDef.name}`); }

        for (const chDef of catDef.channels) {
          let ch = guild.channels.cache.find(c => c.name === chDef.name && c.parentId === cat.id);
          if (!ch) {
            const pOW = chDef.staffOnly
              ? [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }, ...staffOW]
              : [{ id: guild.id, allow: [PermissionFlagsBits.ViewChannel] }];
            ch = await guild.channels.create({ name: chDef.name, type: chDef.type, parent: cat.id, permissionOverwrites: pOW, reason: 'Wenzy Setup' });
            statusLines.push(`✅ Salon : ${chDef.name}`);
          } else { statusLines.push(`♻️ Salon : ${chDef.name}`); }
          channelMap[chDef.name] = ch;
        }
      }

      // Embed règles
      const rulesCh = channelMap['📌┃règles-et-info'];
      if (rulesCh) {
        const msgs = await rulesCh.messages.fetch({ limit: 10 });
        if (msgs.size === 0) {
          await rulesCh.send({ embeds: [new EmbedBuilder()
            .setColor(COLORS.primary).setTitle('📌 Règles & Informations — Wenzy Server')
            .setDescription([
              '**Bienvenue sur le serveur Wenzy !**','',
              '**📦 Trading MM2**',
              '→ `/trade post` pour poster un trade',
              '→ Armes vérifiées via badge Roblox',
              '→ Serveur privé assigné automatiquement','',
              '**🛡️ Anti-scam**',
              '→ Chaque trade est loggé et tracé',
              '→ Middleman disponible à tout moment',
              '→ Scam prouvé = ban permanent','',
              '**🔗 Lier ton compte Roblox**',
              '→ `/link` puis `/verify`','',
              '**🪙 Économie**',
              '→ +1 pièce/min vocal | +5/msg | +50/trade',
            ].join('\n'))
            .setFooter({ text: 'Wenzy Bot v1.0 — MM2 Trading System' }),
          ] });
          statusLines.push('✅ Embed règles posté');
        }
      }

      // Embed link Roblox
      const linkCh = channelMap['🔗┃link-roblox'];
      if (linkCh) {
        const msgs = await linkCh.messages.fetch({ limit: 5 });
        if (msgs.size === 0) {
          await linkCh.send({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.info).setTitle('🔗 Lier ton compte Roblox')
              .setDescription([
                '**Étape 1** — `/link <pseudo Roblox>`',
                '→ Le bot génère un code : `WENZY-XXXXX`','',
                '**Étape 2** — Colle-le dans ta bio Roblox',
                '→ [roblox.com → Profil → Modifier](https://www.roblox.com/my/account#!/info)','',
                '**Étape 3** — `/verify`',
                '→ Compte lié + rôle assigné',
              ].join('\n'))
              .setFooter({ text: 'Vérification via API Roblox officielle' }),
            ],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte').setStyle(ButtonStyle.Primary)
            )],
          });
          statusLines.push('✅ Embed link posté');
        }
      }

      await interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success).setTitle('🏗️ Setup terminé !')
        .setDescription(statusLines.map(l => `\`${l}\``).join('\n'))
        .addFields({ name: '📋 Prochaines étapes', value: [
          '1. Donne-toi le rôle **👑 Owner**',
          '2. Ajoute des serveurs privés avec `/addserver <lien>`',
          '3. Lance `/trade post` pour commencer !',
        ].join('\n') })
        .setTimestamp(),
      ] });
    },
  },

  // ── /link ────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('link')
      .setDescription('🔗 Lie ton compte Roblox à Discord')
      .addStringOption(o => o.setName('username').setDescription('Ton pseudo Roblox exact').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const username  = interaction.options.getString('username');
      const discordId = interaction.user.id;
      let robloxUser;
      try { robloxUser = await searchRobloxUser(username); } catch {
        return interaction.editReply('❌ Impossible de contacter l\'API Roblox. Réessaie dans quelques secondes.');
      }
      if (!robloxUser) return interaction.editReply(`❌ Aucun compte Roblox trouvé avec le pseudo **${username}**.`);
      const code = genCode();
      const ex = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
      if (ex) db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(robloxUser.id), robloxUser.name, code, discordId);
      else    db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(discordId, String(robloxUser.id), robloxUser.name, code);

      await interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.info).setTitle('🔗 Vérification Roblox — Étape 1/2')
        .setDescription([
          `Compte trouvé : **${robloxUser.name}** (ID: ${robloxUser.id})`,
          '', '**Mets ce code dans ta bio Roblox :**',
          `\`\`\`${code}\`\`\``,
          '→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)',
          '', 'Ensuite tape `/verify` ici.',
        ].join('\n'))
        .setFooter({ text: 'Code valable 10 minutes' }),
      ] });
    },
  },

  // ── /verify ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('verify').setDescription('✅ Confirme la vérification Roblox'),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const discordId = interaction.user.id;
      const user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
      if (!user?.verify_code) return interaction.editReply('❌ Lance d\'abord `/link` avec ton pseudo Roblox.');
      if (user.verified)       return interaction.editReply(`✅ Déjà vérifié : **${user.roblox_username}** !`);
      let desc;
      try { desc = await getRobloxDescription(user.roblox_id); } catch {
        return interaction.editReply('❌ Erreur en contactant Roblox. Réessaie.');
      }
      if (!desc.includes(user.verify_code)) {
        return interaction.editReply(`❌ Code **${user.verify_code}** introuvable dans ta bio.\nAssure-toi de l'avoir sauvegardé.`);
      }
      const avatar = await getRobloxAvatar(user.roblox_id);
      db.prepare('UPDATE users SET verified=1,roblox_avatar=?,rank=? WHERE discord_id=?').run(avatar, 'new', discordId);
      try {
        const role = interaction.guild.roles.cache.find(r => r.name === '🆕 Nouveau');
        if (role) await interaction.member.roles.add(role);
      } catch {}
      await interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success).setTitle('✅ Compte Roblox vérifié !')
        .setThumbnail(avatar)
        .setDescription(`Discord lié à **${user.roblox_username}** !\nTu peux maintenant poster des trades avec \`/trade post\`.`),
      ] });
    },
  },

  // ── /trade ───────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('trade')
      .setDescription('🗡️ Système de trades MM2')
      .addSubcommand(s => s.setName('post').setDescription('📤 Poster un trade')
        .addStringOption(o => o.setName('offre').setDescription('Armes à trader (virgules)').setRequired(true))
        .addStringOption(o => o.setName('cherche').setDescription('Ce que tu cherches').setRequired(true))
      )
      .addSubcommand(s => s.setName('done').setDescription('✅ Marquer comme complété')
        .addIntegerOption(o => o.setName('id').setDescription('ID du trade').setRequired(true))
      )
      .addSubcommand(s => s.setName('cancel').setDescription('❌ Annuler ton trade')
        .addIntegerOption(o => o.setName('id').setDescription('ID du trade').setRequired(true))
      )
      .addSubcommand(s => s.setName('check').setDescription('⚖️ Vérifier l\'équité')
        .addStringOption(o => o.setName('offre').setDescription('Armes offertes').setRequired(true))
        .addStringOption(o => o.setName('recois').setDescription('Armes reçues').setRequired(true))
      ),

    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const discordId = interaction.user.id;

      if (sub === 'post') {
        await interaction.deferReply({ ephemeral: true });
        const user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
        if (!user?.verified) return interaction.editReply('❌ Lie ton compte Roblox avec `/link` + `/verify` d\'abord.');
        const { total: ov, details: od } = calcValue(parseWeapons(interaction.options.getString('offre')));
        const { total: wv, details: wd } = calcValue(parseWeapons(interaction.options.getString('cherche')));
        if (user.rank === 'new' && ov > 100) return interaction.editReply('⚠️ Nouveaux membres limités à 100 pts max.');
        const result = db.prepare(`INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value,want_value) VALUES (?,?,?,?,?)`)
          .run(discordId, JSON.stringify(od), JSON.stringify(wd), ov, wv);
        const tradeId = result.lastInsertRowid;
        const trade   = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
        const ch      = interaction.guild.channels.cache.find(c => c.name.includes('post-trades'));
        if (!ch) return interaction.editReply('❌ Salon post-trades introuvable. Lance `/wenzy-setup`.');
        const msg = await ch.send({ embeds: [tradeEmbed(trade, user)], components: [tradeButtons(tradeId)] });
        db.prepare('UPDATE trades SET thread_id = ? WHERE id = ?').run(msg.id, tradeId);
        await interaction.editReply(`✅ Trade **#${tradeId}** posté dans <#${ch.id}> !`);
      }

      else if (sub === 'done') {
        await interaction.deferReply({ ephemeral: true });
        const tradeId = interaction.options.getInteger('id');
        const trade   = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
        if (!trade) return interaction.editReply('❌ Trade introuvable.');
        if (![trade.poster_id, trade.accepter_id].includes(discordId)) return interaction.editReply('❌ Tu ne fais pas partie de ce trade.');
        if (trade.status !== 'in_progress') return interaction.editReply('❌ Ce trade n\'est pas en cours.');
        db.prepare(`UPDATE trades SET status='completed',completed_at=strftime('%s','now') WHERE id=?`).run(tradeId);
        for (const uid of [trade.poster_id, trade.accepter_id]) {
          if (!uid) continue;
          db.prepare(`UPDATE users SET coins=coins+50,trade_count=trade_count+1 WHERE discord_id=?`).run(uid);
          const u = db.prepare('SELECT trade_count FROM users WHERE discord_id=?').get(uid);
          db.prepare('UPDATE users SET rank=? WHERE discord_id=?').run(getRank(u.trade_count), uid);
        }
        const vCh = interaction.guild.channels.cache.find(c => c.name.includes('vouches'));
        if (vCh) await vCh.send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('⭐ Trade Complété !')
          .setDescription(`Trade **#${tradeId}** validé !\n👤 <@${trade.poster_id}> × <@${trade.accepter_id}>\n💎 **${trade.offer_value} pts** échangés`).setTimestamp()] });
        await interaction.editReply(`✅ Trade **#${tradeId}** complété. +50 pièces chacun !`);
      }

      else if (sub === 'cancel') {
        await interaction.deferReply({ ephemeral: true });
        const tradeId = interaction.options.getInteger('id');
        const trade   = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
        if (!trade) return interaction.editReply('❌ Trade introuvable.');
        if (trade.poster_id !== discordId) return interaction.editReply('❌ Seul le posteur peut annuler.');
        if (!['open','in_progress'].includes(trade.status)) return interaction.editReply('❌ Ce trade ne peut plus être annulé.');
        db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tradeId);
        await interaction.editReply(`✅ Trade **#${tradeId}** annulé.`);
      }

      else if (sub === 'check') {
        await interaction.deferReply({ ephemeral: true });
        const { total: ov, details: od } = calcValue(parseWeapons(interaction.options.getString('offre')));
        const { total: rv, details: rd } = calcValue(parseWeapons(interaction.options.getString('recois')));
        const diff = ov - rv;
        const fair = Math.abs(diff) <= 20;
        const label = fair ? '⚖️ Fair' : (diff > 0 ? '📉 Unfair — tu perds' : '📈 Avantageux pour toi');
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(fair ? COLORS.success : (diff > 0 ? COLORS.danger : COLORS.gold))
          .setTitle('⚖️ Price Check')
          .addFields(
            { name: '📤 Tu offres',  value: od.map(w => `${w.name} → **${w.value} pts**`).join('\n') + `\n**Total : ${ov} pts**`, inline: true },
            { name: '📥 Tu reçois', value: rd.map(w => `${w.name} → **${w.value} pts**`).join('\n') + `\n**Total : ${rv} pts**`, inline: true },
            { name: '⚖️ Résultat', value: `${label}\nDifférence : ${Math.abs(diff)} pts`, inline: false },
          ).setTimestamp(),
        ] });
      }
    },
  },

  // ── /profil ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('profil')
      .setDescription('👤 Affiche ton profil ou celui d\'un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre à afficher').setRequired(false)),

    async execute(interaction) {
      await interaction.deferReply();
      const target = interaction.options.getUser('membre') ?? interaction.user;
      const user   = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(target.id);
      if (!user) return interaction.editReply(`❌ <@${target.id}> n'a pas encore de profil.`);
      const inv   = db.prepare('SELECT * FROM inventory WHERE discord_id = ?').all(target.id);
      const embed = profileEmbed(user, inv);
      embed.setAuthor({ name: target.username, iconURL: target.displayAvatarURL() });
      await interaction.editReply({ embeds: [embed] });
    },
  },

  // ── /inventory ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('inventory')
      .setDescription('📦 Gère ton inventory MM2')
      .addSubcommand(s => s.setName('add').setDescription('➕ Ajouter une arme')
        .addStringOption(o => o.setName('arme').setDescription('Nom de l\'arme').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('➖ Retirer une arme')
        .addStringOption(o => o.setName('arme').setDescription('Nom exact').setRequired(true)))
      .addSubcommand(s => s.setName('view').setDescription('👀 Voir ton inventory')),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const sub = interaction.options.getSubcommand();
      const did = interaction.user.id;

      if (sub === 'add') {
        const name = interaction.options.getString('arme');
        const row  = db.prepare('SELECT * FROM weapon_values WHERE LOWER(name) = LOWER(?)').get(name);
        const val  = row?.value ?? 0;
        db.prepare('INSERT INTO inventory (discord_id,weapon_name,weapon_value,verified) VALUES (?,?,?,?)').run(did, row?.name ?? name, val, val > 0 ? 1 : 0);
        await interaction.editReply(`✅ **${row?.name ?? name}** ajouté — **${val} pts** ${val > 0 ? '✅' : '⚠️ (valeur inconnue)'}`);
      }
      else if (sub === 'remove') {
        const name   = interaction.options.getString('arme');
        const result = db.prepare('DELETE FROM inventory WHERE discord_id=? AND LOWER(weapon_name)=LOWER(?)').run(did, name);
        if (!result.changes) return interaction.editReply('❌ Arme introuvable dans ton inventory.');
        await interaction.editReply(`✅ **${name}** retiré.`);
      }
      else {
        const inv = db.prepare('SELECT * FROM inventory WHERE discord_id = ?').all(did);
        if (!inv.length) return interaction.editReply('📦 Inventory vide. Ajoute avec `/inventory add`.');
        const total = inv.reduce((a, w) => a + w.weapon_value, 0);
        await interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.primary).setTitle('📦 Ton Inventory MM2')
          .setDescription(inv.map(w => `• **${w.weapon_name}** — ${w.weapon_value} pts ${w.verified ? '✅' : '⚠️'}`).join('\n'))
          .setFooter({ text: `Valeur totale : ~${total} pts` }),
        ] });
      }
    },
  },

  // ── /updatevalue ─────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('updatevalue')
      .setDescription('💰 (Admin) Mettre à jour la valeur d\'une arme')
      .addStringOption(o => o.setName('arme').setDescription('Nom').setRequired(true))
      .addIntegerOption(o => o.setName('valeur').setDescription('Valeur en pts').setRequired(true))
      .addStringOption(o => o.setName('tier').setDescription('Tier').addChoices(
        { name: 'Common', value: 'common' }, { name: 'Godly', value: 'godly' },
        { name: 'Chroma', value: 'chroma' }, { name: 'Ancient', value: 'ancient' },
      )),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!interaction.member.permissions.has('Administrator')) return interaction.editReply('❌ Réservé aux admins.');
      const name  = interaction.options.getString('arme');
      const value = interaction.options.getInteger('valeur');
      const tier  = interaction.options.getString('tier') ?? 'godly';
      db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now'))
        ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`).run(name, value, tier);
      await interaction.editReply(`✅ **${name}** → **${value} pts** (${tier}) mis à jour.`);
    },
  },

  // ── /shop ────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('shop').setDescription('🏪 Boutique Wenzy'),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const user  = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(interaction.user.id);
      const coins = user?.coins ?? 0;
      const embed = new EmbedBuilder().setColor(COLORS.gold).setTitle('🏪 WENZY SHOP').setDescription(`Solde : **${coins} 🪙**`)
        .addFields(SHOP_ITEMS.map(i => ({ name: i.label, value: `**${i.price} pièces** ${coins >= i.price ? '✅' : '❌'}`, inline: true })));
      const row = new ActionRowBuilder().addComponents(SHOP_ITEMS.map(i =>
        new ButtonBuilder().setCustomId(`shop_buy_${i.id}`).setLabel(i.label.replace(/^.+ /, '')).setStyle(coins >= i.price ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(coins < i.price)
      ));
      await interaction.editReply({ embeds: [embed], components: [row] });
    },
  },

  // ── /addcoins ────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('addcoins')
      .setDescription('🪙 (Admin) Ajouter des pièces à un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true)),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!interaction.member.permissions.has('Administrator')) return interaction.editReply('❌ Réservé aux admins.');
      const target = interaction.options.getUser('membre');
      const amount = interaction.options.getInteger('quantite');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(amount, target.id);
      await interaction.editReply(`✅ +${amount} 🪙 donnés à <@${target.id}>.`);
    },
  },

  // ── /leaderboard ─────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement des meilleurs traders'),

    async execute(interaction) {
      await interaction.deferReply();
      const top = db.prepare(`SELECT discord_id,roblox_username,trade_count,coins,rank FROM users ORDER BY trade_count DESC LIMIT 10`).all();
      if (!top.length) return interaction.editReply('Aucun trader enregistré pour l\'instant.');
      const medals = ['🥇','🥈','🥉'];
      const lines  = top.map((u, i) => `${medals[i] ?? `**${i+1}.**`} <@${u.discord_id}> — **${u.trade_count}** trades | ${u.coins} 🪙 | ${getRankLabel(u.rank)}`);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setTitle('🏆 Classement Traders').setDescription(lines.join('\n')).setTimestamp()] });
    },
  },

  // ── /addserver ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('addserver')
      .setDescription('🎮 (Admin) Ajouter un serveur privé MM2 au pool')
      .addStringOption(o => o.setName('lien').setDescription('Lien du serveur privé Roblox').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const link  = interaction.options.getString('lien');
      db.prepare('INSERT INTO private_servers (link, added_by) VALUES (?, ?)').run(link, interaction.user.id);
      const count = db.prepare('SELECT COUNT(*) as c FROM private_servers').get().c;
      await interaction.editReply(`✅ Serveur privé ajouté ! Pool total : **${count}** serveurs.`);
    },
  },

  // ── /listservers ─────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('listservers')
      .setDescription('📋 (Admin) Voir le pool de serveurs privés')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const servers = db.prepare('SELECT * FROM private_servers').all();
      if (!servers.length) return interaction.editReply('❌ Aucun serveur privé dans le pool.');
      const lines = servers.map(s => `**#${s.id}** — ${s.in_use ? '🔴 En cours' : '🟢 Libre'} — \`${s.link.slice(0, 40)}...\``);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle('🎮 Pool de serveurs privés MM2').setDescription(lines.join('\n')).setFooter({ text: `Total : ${servers.length}` })] });
    },
  },

  // ── /report ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('report')
      .setDescription('🚨 Reporter un scam ou comportement suspect')
      .addUserOption(o => o.setName('membre').setDescription('Membre à reporter').setRequired(true))
      .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
      .addIntegerOption(o => o.setName('trade').setDescription('ID du trade concerné (optionnel)')),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const reported = interaction.options.getUser('membre');
      const reason   = interaction.options.getString('raison');
      const tradeId  = interaction.options.getInteger('trade');
      db.prepare(`INSERT INTO reports (reporter_id,reported_id,trade_id,reason) VALUES (?,?,?,?)`).run(interaction.user.id, reported.id, tradeId ?? null, reason);
      db.prepare('UPDATE users SET report_count=report_count+1 WHERE discord_id=?').run(reported.id);
      const logsCh = interaction.guild.channels.cache.find(c => c.name.includes('logs'));
      if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(COLORS.danger).setTitle('🚨 Nouveau Report')
        .addFields(
          { name: 'Reporter', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reporté',  value: `<@${reported.id}>`, inline: true },
          { name: 'Trade',    value: tradeId ? `#${tradeId}` : 'Non précisé', inline: true },
          { name: 'Raison',   value: reason, inline: false },
        ).setTimestamp()] });
      await interaction.editReply(`✅ Report envoyé contre <@${reported.id}>.`);
    },
  },
];

// ───────────────────────────────────────────────────────────────
// BUTTON INTERACTIONS
// ───────────────────────────────────────────────────────────────
async function handleButton(interaction) {
  const { customId, guild, user } = interaction;

  if (customId.startsWith('trade_accept_')) {
    await interaction.deferReply({ ephemeral: true });
    const tradeId = parseInt(customId.replace('trade_accept_',''));
    const trade   = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
    if (!trade)                      return interaction.editReply('❌ Trade introuvable.');
    if (trade.poster_id === user.id) return interaction.editReply('❌ Tu ne peux pas accepter ton propre trade.');
    if (trade.status !== 'open')     return interaction.editReply('❌ Ce trade n\'est plus disponible.');

    db.prepare('UPDATE trades SET accepter_id=?,status=? WHERE id=?').run(user.id, 'in_progress', tradeId);
    const updated  = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
    const poster   = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(trade.poster_id);
    const accepter = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(user.id);

    let thread;
    try {
      const tCh = guild.channels.cache.find(c => c.name.includes('post-trades'));
      thread = await tCh.threads.create({ name: `Trade #${tradeId} — ${poster?.roblox_username ?? 'Trader'}`, type: ChannelType.PrivateThread, reason: `Trade #${tradeId}` });
      await thread.members.add(trade.poster_id);
      await thread.members.add(user.id);
    } catch (e) { console.error('Thread error:', e); }

    if (thread) {
      db.prepare('UPDATE trades SET thread_id=? WHERE id=?').run(thread.id, tradeId);
      const server = getAvailableServer();
      if (server) {
        db.prepare('UPDATE private_servers SET in_use=1,trade_id=? WHERE id=?').run(tradeId, server.id);
        db.prepare('UPDATE trades SET server_link=? WHERE id=?').run(server.link, tradeId);
      }
      await thread.send({ embeds: [threadSummaryEmbed(updated, poster, accepter)], components: [threadButtons(tradeId)] });
      if (server) {
        await thread.send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🎮 Serveur Privé assigné !')
          .setDescription(`Rejoignez le serveur privé MM2 :\n**[► Rejoindre maintenant](${server.link})**\n\n⏱️ Réservé pour votre trade.`)] });
      }
      const mmPanel = guild.channels.cache.find(c => c.name.includes('middleman-panel'));
      if (mmPanel) {
        const mmRole = guild.roles.cache.find(r => r.name.includes('Middleman'));
        await mmPanel.send({ content: `<@&${mmRole?.id ?? ''}>`, embeds: [middlemanPanelEmbed(updated, poster, accepter)], components: [middlemanButtons(tradeId)] });
      }
    }
    return interaction.editReply(`✅ Trade **#${tradeId}** accepté ! Regarde le thread privé créé.`);
  }

  if (customId.startsWith('trade_confirm_')) {
    await interaction.deferReply({ ephemeral: true });
    const tradeId = parseInt(customId.replace('trade_confirm_',''));
    const trade   = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
    if (!trade || ![trade.poster_id, trade.accepter_id].includes(user.id)) return interaction.editReply('❌ Pas autorisé.');
    db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
    db.prepare(`UPDATE trades SET status='completed',completed_at=strftime('%s','now') WHERE id=?`).run(tradeId);
    for (const uid of [trade.poster_id, trade.accepter_id]) {
      if (!uid) continue;
      db.prepare(`UPDATE users SET coins=coins+50,trade_count=trade_count+1 WHERE discord_id=?`).run(uid);
      const u = db.prepare('SELECT trade_count FROM users WHERE discord_id=?').get(uid);
      db.prepare('UPDATE users SET rank=? WHERE discord_id=?').run(getRank(u.trade_count), uid);
    }
    const vCh = guild.channels.cache.find(c => c.name.includes('vouches'));
    if (vCh) await vCh.send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('✅ Trade Validé !')
      .setDescription(`Trade **#${tradeId}** complété par <@${trade.poster_id}> × <@${trade.accepter_id}>`).setTimestamp()] });
    return interaction.editReply('✅ Trade confirmé ! +50 pièces pour vous deux.');
  }

  if (customId.startsWith('trade_cancel_')) {
    await interaction.deferReply({ ephemeral: true });
    const tradeId = parseInt(customId.replace('trade_cancel_',''));
    db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tradeId);
    db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
    return interaction.editReply('❌ Trade annulé.');
  }

  if (customId.startsWith('trade_middleman_') || customId.startsWith('trade_negotiate_')) {
    await interaction.deferReply({ ephemeral: true });
    const tradeId = parseInt(customId.split('_').pop());
    const mmRole  = guild.roles.cache.find(r => r.name.includes('Middleman'));
    const mmPanel = guild.channels.cache.find(c => c.name.includes('middleman-panel'));
    if (mmPanel && mmRole) await mmPanel.send(`🛡️ <@&${mmRole.id}> — Middleman demandé pour Trade **#${tradeId}** par <@${user.id}>`);
    return interaction.editReply('✅ Un middleman a été appelé !');
  }

  if (customId.startsWith('mm_validate_')) {
    await interaction.deferReply({ ephemeral: true });
    const tradeId = parseInt(customId.replace('mm_validate_',''));
    const mmRole  = guild.roles.cache.find(r => r.name.includes('Middleman') || r.name.includes('Modérateur'));
    if (!interaction.member.roles.cache.has(mmRole?.id)) return interaction.editReply('❌ Réservé aux middlemen.');
    db.prepare(`UPDATE trades SET status='completed',middleman_id=?,completed_at=strftime('%s','now') WHERE id=?`).run(user.id, tradeId);
    return interaction.editReply(`✅ Trade **#${tradeId}** validé par middleman.`);
  }

  if (customId.startsWith('mm_cancel_')) {
    await interaction.deferReply({ ephemeral: true });
    const tradeId = parseInt(customId.replace('mm_cancel_',''));
    db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled', tradeId);
    return interaction.editReply(`❌ Trade **#${tradeId}** annulé par middleman.`);
  }

  if (customId.startsWith('mm_report_')) {
    await interaction.deferReply({ ephemeral: true });
    const tradeId = parseInt(customId.replace('mm_report_',''));
    db.prepare('UPDATE trades SET status=? WHERE id=?').run('disputed', tradeId);
    const logsCh = guild.channels.cache.find(c => c.name.includes('logs'));
    if (logsCh) await logsCh.send(`🚨 **SCAM REPORT** — Trade **#${tradeId}** signalé par <@${user.id}>. Enquête ouverte.`);
    return interaction.editReply('🚨 Scam reporté. Enquête ouverte dans les logs.');
  }

  if (customId === 'btn_link_start') {
    return interaction.reply({ content: 'Tape `/link <ton pseudo Roblox>` pour commencer !', ephemeral: true });
  }
}

// ───────────────────────────────────────────────────────────────
// YOUTUBE WATCHER
// ───────────────────────────────────────────────────────────────
function startYoutubeWatcher(client) {
  const { YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID } = process.env;
  if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) {
    console.log('[YouTube] Clé API ou channel ID manquant — watcher désactivé.');
    return;
  }
  cron.schedule('*/5 * * * *', async () => {
    try {
      const res   = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&order=date&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`);
      const video = res.data.items?.[0];
      if (!video) return;
      const videoId = video.id.videoId;
      const lastRow = db.prepare('SELECT * FROM youtube_last WHERE id = 1').get();
      if (lastRow.video_id === videoId) return;
      db.prepare(`UPDATE youtube_last SET video_id=?,checked_at=strftime('%s','now') WHERE id=1`).run(videoId);
      const { snippet } = video;
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      for (const [, guild] of client.guilds.cache) {
        const ch = guild.channels.cache.find(c => c.name.includes('vidéos-wenzy') || c.name.includes('videos-wenzy'));
        if (!ch) continue;
        await ch.send({
          content: '📺 @everyone **Wenzy vient de poster une nouvelle vidéo !**',
          embeds: [new EmbedBuilder().setColor(COLORS.danger).setTitle('🔴 NOUVELLE VIDÉO')
            .setDescription(`**${snippet.title}**\n\n[► Regarder maintenant](${url})`)
            .setImage(snippet.thumbnails.high?.url ?? snippet.thumbnails.default?.url)
            .setFooter({ text: `Publiée le ${new Date(snippet.publishedAt).toLocaleDateString('fr-FR')}` }).setTimestamp()],
        });
      }
      console.log(`[YouTube] Nouvelle vidéo postée : ${snippet.title}`);
    } catch (e) { console.error('[YouTube] Erreur:', e.message); }
  });
  console.log('[YouTube] Watcher démarré (toutes les 5 min)');
}

// ───────────────────────────────────────────────────────────────
// CLIENT SETUP
// ───────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
for (const cmd of commands) client.commands.set(cmd.data.name, cmd);

// ── interactionCreate ────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try { await cmd.execute(interaction); }
    catch (err) {
      console.error(`[CMD ERROR] ${interaction.commandName}:`, err);
      const reply = { content: '❌ Une erreur est survenue.', ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
    return;
  }
  if (interaction.isButton()) {
    try { await handleButton(interaction); }
    catch (err) { console.error('[BTN ERROR]', err); }
  }
});

// ── messageCreate ────────────────────────────────────────────
const msgCooldowns = new Map();
client.on('messageCreate', message => {
  if (message.author.bot) return;
  const uid = message.author.id;
  const now = Date.now();
  if (msgCooldowns.has(uid) && now - msgCooldowns.get(uid) < 60_000) return;
  msgCooldowns.set(uid, now);
  db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
  db.prepare('UPDATE users SET coins=coins+5 WHERE discord_id=?').run(uid);
});

// ── voiceStateUpdate ─────────────────────────────────────────
client.on('voiceStateUpdate', (oldState, newState) => {
  const uid = newState.id;
  if (!oldState.channelId && newState.channelId) {
    db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
  }
  if (oldState.channelId && !newState.channelId) {
    const session = db.prepare('SELECT * FROM vocal_sessions WHERE discord_id = ?').get(uid);
    if (!session) return;
    const minutes = Math.floor((Math.floor(Date.now() / 1000) - session.joined_at) / 60);
    if (minutes > 0) db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(minutes, minutes, uid);
    db.prepare('DELETE FROM vocal_sessions WHERE discord_id = ?').run(uid);
  }
});

// ── ready ────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Wenzy Bot connecté : ${client.user.tag}`);
  client.user.setActivity('MM2 Trades 🗡️', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const body = commands.map(c => c.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body });
    console.log(`✅ ${body.length} commandes déployées !`);
  } catch (err) { console.error('❌ Erreur déploiement commands:', err); }

  startYoutubeWatcher(client);
});

client.login(process.env.DISCORD_TOKEN);
