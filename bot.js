// ═══════════════════════════════════════════════════════════════
//  WENZY BOT v8.0 — bot.js
//  node bot.js
//  npm install @napi-rs/canvas   ← requis pour les images level
//  CHANGELOG v8.0 (sur base v7.5):
//   - /wenzy-setup supprime aussi tous les rôles
//   - Catégorie MM2 complète : post-trades, poster-un-trade, middleman-panel, price-check, vouches
//   - Vérification : code dans la bio Roblox obligatoire pour trader
//   - Salon vérification retiré du setup, lier-roblox reste pour le link
//   - Screenshot envoyé automatiquement dans vouch quand staff valide
//   - /panel → sous-commande xp-roles pour configurer seuil XP → rôle
//   - /panel → status-role pour configurer le rôle .gg/wenzy
//   - Tickets : select menu (pas boutons), catégories: Report, Giveaway, Scam, Candidature
//   - Chaque catégorie ticket a sa propre catégorie Discord
//   - /panel ticket-category pour ajouter des catégories custom
//   - weapon-values retiré du setup
// CHANGELOG v8.0:
//   - Limite 100 val débutants SUPPRIMÉE
//   - Salon #bienvenue dans Côté Important avec embed premium
//   - Côté Fun : embeds par jeux (MM2, Minecraft, Fortnite, Valorant, Football)
//   - Transcript .txt envoyé en DM au créateur à la fermeture du ticket
//   - Level up : image canvas avec barre de progression (npm install @napi-rs/canvas)
//   - /level : commande pour voir son niveau avec image canvas
//   - /panel stats : total coins en circulation + joueur le plus riche
//   - Status .gg/wenzy : retire le rôle quand le status est enlevé
//   - Middleman panel : n'envoie QUE le panel info au départ, embed de validation arrive avec le screenshot
//   - /say : commande staff pour faire parler le bot (texte ou embed)
//   - /automod : déjà présent, inchangé
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

// Canvas for level-up images (npm install @napi-rs/canvas)
let createCanvas, loadImage, GlobalFonts;
try {
  ({ createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'));
} catch {
  console.warn('[Canvas] @napi-rs/canvas non installé — images de level désactivées. Fais: npm install @napi-rs/canvas');
}

async function buildLevelUpImage(discordUser, oldTier, newTier, xp) {
  if (!createCanvas) return null;
  try {
    const W = 800, H = 280;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const tierHex = `#${newTier.color.toString(16).padStart(6,'0')}`;

    // ── FOND ULTRA DARK ──────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0d0d1a');
    bgGrad.addColorStop(0.5, '#111122');
    bgGrad.addColorStop(1, '#0a0a16');
    ctx.fillStyle = bgGrad;
    ctx.roundRect(0, 0, W, H, 24);
    ctx.fill();

    // ── GLOW RADIAL DERRIÈRE L'AVATAR ───────────────────────
    const glowX = 130, glowY = 130;
    const glow = ctx.createRadialGradient(glowX, glowY, 10, glowX, glowY, 180);
    glow.addColorStop(0, `${tierHex}55`);
    glow.addColorStop(0.5, `${tierHex}18`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // ── GLOW CÔTÉ DROIT (ambiance) ───────────────────────────
    const glow2 = ctx.createRadialGradient(W, 0, 20, W, 0, 300);
    glow2.addColorStop(0, `${tierHex}22`);
    glow2.addColorStop(1, 'transparent');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    // ── PARTICULES DÉCO ──────────────────────────────────────
    const particles = [
      {x:460,y:30,r:3},{x:620,y:55,r:2},{x:530,y:80,r:1.5},
      {x:700,y:30,r:2.5},{x:750,y:70,r:1},{x:490,y:20,r:1.5},
      {x:670,y:90,r:3},{x:580,y:45,r:2},{x:720,y:120,r:1.5},
      {x:440,y:60,r:1},{x:760,y:20,r:2},{x:510,y:100,r:2.5},
    ];
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `${tierHex}cc`;
      ctx.fill();
    }

    // ── BORDURE GLOW TIER ────────────────────────────────────
    ctx.strokeStyle = `${tierHex}66`;
    ctx.lineWidth = 2;
    ctx.roundRect(1, 1, W - 2, H - 2, 24);
    ctx.stroke();

    // ── BARRE DÉCO TOP ───────────────────────────────────────
    const topBar = ctx.createLinearGradient(0, 0, W, 0);
    topBar.addColorStop(0, 'transparent');
    topBar.addColorStop(0.3, tierHex);
    topBar.addColorStop(0.7, tierHex);
    topBar.addColorStop(1, 'transparent');
    ctx.fillStyle = topBar;
    ctx.fillRect(0, 0, W, 3);

    // ── AVATAR ───────────────────────────────────────────────
    const avatarURL = discordUser.displayAvatarURL({ extension: 'png', size: 256 });
    try {
      const img = await loadImage(avatarURL);
      // Outer glow ring
      for (let i = 5; i > 0; i--) {
        ctx.beginPath();
        ctx.arc(glowX, glowY, 72 + i * 3, 0, Math.PI * 2);
        ctx.strokeStyle = `${tierHex}${Math.round(20 + i * 8).toString(16).padStart(2,'0')}`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Clip avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(glowX, glowY, 70, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, glowX - 70, glowY - 70, 140, 140);
      ctx.restore();
      // Sharp ring
      ctx.beginPath();
      ctx.arc(glowX, glowY, 72, 0, Math.PI * 2);
      ctx.strokeStyle = tierHex;
      ctx.lineWidth = 4;
      ctx.stroke();
    } catch {}

    // ── BADGE TIER (coins droit de l'avatar) ─────────────────
    const badgeX = glowX + 52, badgeY = glowY + 52;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0d1a';
    ctx.fill();
    ctx.strokeStyle = tierHex;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(newTier.emoji, badgeX, badgeY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // ── TITRE LEVEL UP ───────────────────────────────────────
    const textX = 240;

    // Label "LEVEL UP" en petit caps stylé
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = `${tierHex}`;
    ctx.letterSpacing = '4px';
    ctx.fillText('▲  LEVEL  UP', textX, 55);
    ctx.letterSpacing = '0px';

    // Nom du tier
    ctx.font = 'bold 46px sans-serif';
    const nameGrad = ctx.createLinearGradient(textX, 60, textX + 400, 110);
    nameGrad.addColorStop(0, '#ffffff');
    nameGrad.addColorStop(1, tierHex);
    ctx.fillStyle = nameGrad;
    ctx.fillText(newTier.name, textX, 108);

    // Ancien tier barré / flèche
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#555577';
    ctx.fillText(`${oldTier.emoji}  ${oldTier.name}  →  `, textX, 135);
    const arrowOffset = ctx.measureText(`${oldTier.emoji}  ${oldTier.name}  →  `).width;
    ctx.fillStyle = tierHex;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`${newTier.emoji}  ${newTier.name}`, textX + arrowOffset, 135);

    // XP count
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#6666aa';
    ctx.fillText(`✨  ${xp.toLocaleString('fr-FR')} XP total`, textX, 158);

    // ── BARRE DE PROGRESSION ─────────────────────────────────
    const barX = textX, barY = 178, barW = 510, barH = 26, barR = 13;

    // Shadow / fond
    ctx.fillStyle = '#1a1a2e';
    ctx.roundRect(barX, barY, barW, barH, barR);
    ctx.fill();

    // Inner dark track
    ctx.fillStyle = '#0d0d1a';
    ctx.roundRect(barX + 2, barY + 2, barW - 4, barH - 4, barR - 1);
    ctx.fill();

    // Calcul progression
    const nextTier = getNextXpTier(xp);
    const pct = nextTier ? Math.min(1, (xp - newTier.xp) / (nextTier.xp - newTier.xp)) : 1;
    const fillW = Math.max(barR * 2, barW * pct);

    // Gradient barre
    const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    barGrad.addColorStop(0, '#5865F2');
    barGrad.addColorStop(0.5, tierHex);
    barGrad.addColorStop(1, '#ffffff44');
    ctx.fillStyle = barGrad;
    ctx.roundRect(barX + 2, barY + 2, fillW - 4, barH - 4, barR - 1);
    ctx.fill();

    // Shine sur la barre
    const shine = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    shine.addColorStop(0, 'rgba(255,255,255,0.18)');
    shine.addColorStop(0.5, 'transparent');
    ctx.fillStyle = shine;
    ctx.roundRect(barX + 2, barY + 2, fillW - 4, barH / 2, barR - 1);
    ctx.fill();

    // Texte dans la barre
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ffffff';
    const barLabel = nextTier
      ? `${Math.round(pct * 100)}%  —  ${xp.toLocaleString('fr-FR')} / ${nextTier.xp.toLocaleString('fr-FR')} XP`
      : '⭐  NIVEAU MAXIMUM ATTEINT';
    ctx.fillText(barLabel, barX + 12, barY + 17);

    // Label prochain niveau
    if (nextTier) {
      ctx.font = '11px sans-serif';
      ctx.fillStyle = `${tierHex}cc`;
      ctx.textAlign = 'right';
      ctx.fillText(`→ ${nextTier.name}`, barX + barW, barY - 5);
      ctx.textAlign = 'left';
    }

    // ── FOOTER ───────────────────────────────────────────────
    const footerY = H - 18;
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(textX, footerY - 1, barW, 1);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#333355';
    ctx.fillText('Wenzy Bot v8.0  •  Système XP', textX, footerY + 12);

    // ── USERNAME en haut à droite ─────────────────────────────
    const uname = discordUser.displayName ?? discordUser.username;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#8888bb';
    ctx.textAlign = 'right';
    ctx.fillText(`@${uname}`, W - 24, H - 18);
    ctx.textAlign = 'left';

    const buffer = canvas.toBuffer('image/png');
    return buffer;
  } catch (e) {
    console.error('[LevelImage]', e.message);
    return null;
  }
}

async function buildProfileImage(discordUser, userData) {
  if (!createCanvas) return null;
  try {
    const W = 800, H = 300;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const xp = userData?.xp ?? 0;
    const tier = getXpTier(xp);
    const nextTier = getNextXpTier(xp);
    const tierHex = `#${tier.color.toString(16).padStart(6,'0')}`;
    const pct = nextTier ? Math.min(1, (xp - tier.xp) / (nextTier.xp - tier.xp)) : 1;

    // ── FOND ─────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d0d1a');
    bg.addColorStop(1, '#0a0a16');
    ctx.fillStyle = bg;
    ctx.roundRect(0, 0, W, H, 24);
    ctx.fill();

    // ── BANNER TOP coloré ─────────────────────────────────────
    const banner = ctx.createLinearGradient(0, 0, W, 90);
    banner.addColorStop(0, `${tierHex}55`);
    banner.addColorStop(1, 'transparent');
    ctx.fillStyle = banner;
    ctx.roundRect(0, 0, W, 90, {upperLeft:24, upperRight:24, lowerLeft:0, lowerRight:0});
    ctx.fill();

    // ── GLOW AVATAR ───────────────────────────────────────────
    const gx = 110, gy = 145;
    const glowR = ctx.createRadialGradient(gx, gy, 20, gx, gy, 160);
    glowR.addColorStop(0, `${tierHex}44`);
    glowR.addColorStop(1, 'transparent');
    ctx.fillStyle = glowR;
    ctx.fillRect(0, 0, W, H);

    // ── PARTICULES ────────────────────────────────────────────
    [[680,25,2],[730,50,1.5],[760,20,2.5],[500,35,1],[640,70,2],[550,20,1.5],[710,80,1],[480,55,2]].forEach(([x,y,r])=>{
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=`${tierHex}bb`; ctx.fill();
    });

    // ── BARRE DÉCO TOP ────────────────────────────────────────
    const topBar = ctx.createLinearGradient(0, 0, W, 0);
    topBar.addColorStop(0, 'transparent');
    topBar.addColorStop(0.3, tierHex);
    topBar.addColorStop(0.7, tierHex);
    topBar.addColorStop(1, 'transparent');
    ctx.fillStyle = topBar;
    ctx.fillRect(0, 0, W, 3);

    // ── BORDURE ───────────────────────────────────────────────
    ctx.strokeStyle = `${tierHex}55`;
    ctx.lineWidth = 2;
    ctx.roundRect(1, 1, W-2, H-2, 24);
    ctx.stroke();

    // ── AVATAR ────────────────────────────────────────────────
    const avatarURL = discordUser.displayAvatarURL({ extension: 'png', size: 256 });
    try {
      const img = await loadImage(avatarURL);
      for (let i = 4; i > 0; i--) {
        ctx.beginPath();
        ctx.arc(gx, gy, 72 + i * 3, 0, Math.PI * 2);
        ctx.strokeStyle = `${tierHex}${Math.round(15 + i * 10).toString(16).padStart(2,'0')}`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.save();
      ctx.beginPath(); ctx.arc(gx, gy, 70, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      ctx.drawImage(img, gx - 70, gy - 70, 140, 140);
      ctx.restore();
      ctx.beginPath(); ctx.arc(gx, gy, 72, 0, Math.PI * 2);
      ctx.strokeStyle = tierHex; ctx.lineWidth = 4; ctx.stroke();
    } catch {}

    // Badge emoji tier
    const bx = gx + 52, by = gy + 52;
    ctx.beginPath(); ctx.arc(bx, by, 18, 0, Math.PI*2);
    ctx.fillStyle = '#0d0d1a'; ctx.fill();
    ctx.strokeStyle = tierHex; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(tier.emoji, bx, by);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // ── NOM + RANG ────────────────────────────────────────────
    const tx = 220;
    const uname = discordUser.displayName ?? discordUser.username;
    ctx.font = 'bold 32px sans-serif';
    const nameG = ctx.createLinearGradient(tx, 40, tx + 300, 80);
    nameG.addColorStop(0, '#ffffff');
    nameG.addColorStop(1, tierHex);
    ctx.fillStyle = nameG;
    ctx.fillText(uname, tx, 78);

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = tierHex;
    ctx.fillText(`${tier.emoji}  ${tier.name}`, tx, 102);

    // ── XP + BARRE ────────────────────────────────────────────
    const barX = tx, barY = 118, barW = 540, barH = 24, barR = 12;
    ctx.fillStyle = '#1a1a2e';
    ctx.roundRect(barX, barY, barW, barH, barR); ctx.fill();
    ctx.fillStyle = '#0a0a16';
    ctx.roundRect(barX+2, barY+2, barW-4, barH-4, barR-1); ctx.fill();

    if (pct > 0) {
      const fillW = Math.max(barR*2, barW * pct);
      const bg2 = ctx.createLinearGradient(barX, 0, barX+fillW, 0);
      bg2.addColorStop(0, '#5865F2');
      bg2.addColorStop(0.6, tierHex);
      bg2.addColorStop(1, '#ffffff33');
      ctx.fillStyle = bg2;
      ctx.roundRect(barX+2, barY+2, fillW-4, barH-4, barR-1); ctx.fill();
      // shine
      const sh = ctx.createLinearGradient(barX, barY, barX, barY+barH);
      sh.addColorStop(0,'rgba(255,255,255,0.15)'); sh.addColorStop(0.5,'transparent');
      ctx.fillStyle = sh;
      ctx.roundRect(barX+2, barY+2, fillW-4, barH/2, barR-1); ctx.fill();
    }

    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff';
    const barTxt = nextTier
      ? `${xp.toLocaleString('fr-FR')} / ${nextTier.xp.toLocaleString('fr-FR')} XP  —  ${Math.round(pct*100)}%`
      : '⭐  NIVEAU MAXIMUM ATTEINT';
    ctx.fillText(barTxt, barX + 10, barY + 16);

    if (nextTier) {
      ctx.font = '11px sans-serif'; ctx.fillStyle = `${tierHex}cc`;
      ctx.textAlign = 'right';
      ctx.fillText(`→ ${nextTier.name}`, barX + barW, barY - 5);
      ctx.textAlign = 'left';
    }

    // ── STATS ROW ─────────────────────────────────────────────
    const stats = [
      { label: 'TRADES',  value: String(userData?.trade_count ?? 0), icon: '🗡️' },
      { label: 'VOUCHES', value: String(userData?.vouch_count ?? 0), icon: '💬' },
      { label: 'PIÈCES',  value: (userData?.coins ?? 0).toLocaleString('fr-FR'), icon: '🪙' },
      { label: 'STREAK',  value: `${userData?.daily_streak ?? 0}j`, icon: '🔥' },
    ];
    const statsY = 170, slotW = barW / stats.length;
    for (let i = 0; i < stats.length; i++) {
      const sx = barX + i * slotW;
      // Separateur
      if (i > 0) {
        ctx.fillStyle = '#222235';
        ctx.fillRect(sx, statsY, 1, 70);
      }
      ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(stats[i].icon, sx + slotW/2, statsY + 24);
      ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#ffffff';
      ctx.fillText(stats[i].value, sx + slotW/2, statsY + 50);
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#555577';
      ctx.fillText(stats[i].label, sx + slotW/2, statsY + 65);
      ctx.textAlign = 'left';
    }

    // ── FOOTER ────────────────────────────────────────────────
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, H - 28, W, 28);
    ctx.roundRect(0, H-28, W, 28, {upperLeft:0,upperRight:0,lowerLeft:24,lowerRight:24});
    ctx.fill();
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#333355';
    ctx.fillText('Wenzy Bot v8.0  •  Système XP', tx, H - 10);
    ctx.textAlign = 'right'; ctx.fillStyle = '#333355';
    ctx.fillText('⭐ /level pour ta progression', W - 24, H - 10);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
  } catch (e) {
    console.error('[ProfileImage]', e.message);
    return null;
  }
}

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
    report_count INTEGER DEFAULT 0, rank TEXT DEFAULT 'debutant',
    daily_streak INTEGER DEFAULT 0, last_daily INTEGER DEFAULT 0,
    last_work INTEGER DEFAULT 0, last_message_xp INTEGER DEFAULT 0,
    warn_count INTEGER DEFAULT 0, gender TEXT DEFAULT NULL,
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
  CREATE TABLE IF NOT EXISTS server_config (
    guild_id TEXT PRIMARY KEY,
    welcome_channel TEXT, logs_channel TEXT,
    ticket_channel TEXT, trades_channel TEXT,
    announcement_channel TEXT, youtube_channel TEXT,
    tiktok_channel TEXT, level_channel TEXT,
    giveaway_channel TEXT,
    xp_enabled INTEGER DEFAULT 1,
    coins_enabled INTEGER DEFAULT 1,
    welcome_enabled INTEGER DEFAULT 1,
    ticket_enabled INTEGER DEFAULT 1,
    mm2_enabled INTEGER DEFAULT 1,
    automod_enabled INTEGER DEFAULT 1,
    youtube_notif_enabled INTEGER DEFAULT 0,
    tiktok_notif_enabled INTEGER DEFAULT 0,
    custom_welcome_msg TEXT DEFAULT NULL,
    custom_rules_msg TEXT DEFAULT NULL,
    status_role TEXT DEFAULT NULL,
    xp_roles TEXT DEFAULT '[]',
    ticket_categories TEXT DEFAULT '["Report","Giveaway","Scam","Candidature"]'
  );
  INSERT OR IGNORE INTO youtube_last (id,checked_at) VALUES (1,0);
`);

const safeMigrations = [
  'ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN vocal_minutes INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN daily_streak INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_daily INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_work INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_message_xp INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN warn_count INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN gender TEXT DEFAULT NULL',
  'ALTER TABLE server_config ADD COLUMN status_role TEXT DEFAULT NULL',
  'ALTER TABLE server_config ADD COLUMN xp_roles TEXT DEFAULT \'[]\'',
  'ALTER TABLE server_config ADD COLUMN ticket_categories TEXT DEFAULT \'["Report","Giveaway","Scam","Candidature"]\'',
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
  ['Gingerscope',45,'godly'],['Traveler Axe',55,'godly'],['Vampire Axe',60,'godly'],
  ['Harvester',65,'godly'],['Icepiercer',50,'godly'],['Heart Blade',40,'godly'],
  ['Elderwood Blade',45,'godly'],
];
const _iw = db.prepare('INSERT OR IGNORE INTO weapon_values (name,value,tier) VALUES (?,?,?)');
for (const [n,v,t] of defaults) _iw.run(n,v,t);

const defaultShopItems = [
  ['Rôle couleur custom','Crée un rôle avec le nom et la couleur de ton choix',500,'custom_role','🎨'],
  ['Rôle VIP','Accès VIP + rôle hoisted visible',1000,'vip_role','👑'],
  ['Badge Elite Trader','Statut prestige + rôle 💎 Elite Trader',10000,'elite_badge','🏆'],
  ['Double XP 24h','Multiplie ton XP x2 pendant 24h',2000,'double_xp','⚡'],
  ['Ticket Coinflip Pro','5 coinflips sans risque de perte',800,'coinflip_pro','🎰'],
];
const _si = db.prepare('INSERT OR IGNORE INTO shop_items (name,description,price,item_type,emoji) VALUES (?,?,?,?,?)');
for (const [n,d,p,t,e] of defaultShopItems) _si.run(n,d,p,t,e);

// ── COLORS ───────────────────────────────────────────────────
const C = {
  primary:   0x5865F2,
  success:   0x57F287,
  warning:   0xFEE75C,
  danger:    0xED4245,
  info:      0x5DADE2,
  gold:      0xF0B232,
  purple:    0x9B59B6,
  dark:      0x2B2D31,
  teal:      0x1ABC9C,
  pink:      0xE91E8C,
  blurple:   0x5865F2,
};

// ── XP SYSTEM ────────────────────────────────────────────────
const XP_TIERS = [
  { xp:      0, name: '5 - Débutants',    color: 0x95A5A6, emoji: '🌱', roleSync: '5 - Débutants' },
  { xp:    300, name: '10 - Bavards',     color: 0x2ECC71, emoji: '💬', roleSync: '10 - Bavards' },
  { xp:    900, name: '15 - Pipelettes',  color: 0x27AE60, emoji: '🗣️', roleSync: '15 - Pipelettes' },
  { xp:   2000, name: '20 - Puants',      color: 0x3498DB, emoji: '💨', roleSync: '20 - Puants' },
  { xp:   4000, name: '30 - Elites',      color: 0x9B59B6, emoji: '⭐', roleSync: '30 - Elites' },
  { xp:   8000, name: '50 - Goat',        color: 0xF1C40F, emoji: '🐐', roleSync: '50 - Goat' },
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
function xpProgressBar(xp, length = 14) {
  const current = getXpTier(xp);
  const next = getNextXpTier(xp);
  if (!next) return `${'█'.repeat(length)} MAX`;
  const progress = (xp - current.xp) / (next.xp - current.xp);
  const filled = Math.round(progress * length);
  const empty = length - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${Math.round(progress*100)}%`;
}
function coinsBar(coins, max = 10000, length = 10) {
  const filled = Math.round(Math.min(coins / max, 1) * length);
  return `${'█'.repeat(filled)}${'░'.repeat(length - filled)} ${coins.toLocaleString('fr-FR')} 🪙`;
}

// ── TRADE RANKS ──────────────────────────────────────────────
const TRADE_RANKS = [
  { min: 0,  name: '5 - Débutants',   color: 0x95A5A6, emoji: '🌱' },
  { min: 5,  name: '10 - Bavards',    color: 0x2ECC71, emoji: '💬' },
  { min: 15, name: '15 - Pipelettes', color: 0x27AE60, emoji: '🗣️' },
  { min: 20, name: '20 - Puants',     color: 0x3498DB, emoji: '💨' },
  { min: 30, name: '30 - Elites',     color: 0x9B59B6, emoji: '⭐' },
  { min: 50, name: '50 - Goat',       color: 0xF1C40F, emoji: '🐐' },
];
function getTradeRank(n) {
  let rank = TRADE_RANKS[0];
  for (const r of TRADE_RANKS) { if (n >= r.min) rank = r; }
  return rank;
}

// ── WEAPON ROLES ─────────────────────────────────────────────
const WEAPON_ROLES = [
  'Gingerscope', 'Traveler Axe', 'Vampire Axe', 'Harvester',
  'Icepiercer', 'Heart Blade', 'Elderwood Blade',
];

function tierBadge(tier) {
  return({chroma:'🔴 Chroma',ancient:'🟤 Ancient',godly:'⚪ Godly',legendary:'🟡 Legendary',epic:'🟣 Epic',rare:'🔵 Rare'})[tier]??'⚪ Godly';
}

// ── PERMISSION HELPER ────────────────────────────────────────
function hasStaffPerm(member) {
  if (!member) return false;
  const staffRoles = ['Wenzy','Madame Wenzy','Owners','Co-Owners','Superviseur Staff','Chef Admins','Admins','Chef Modérateurs','Capitaine Modérateurs','Haut Modérateurs','Modérateurs'];
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    staffRoles.some(n => member.roles.cache.find(r => r.name === n));
}
function isModerator(member) {
  if (!member) return false;
  const modRoles = ['Wenzy','Madame Wenzy','Owners','Co-Owners','Superviseur Staff','Chef Admins','Admins','Admins Test','Chef Modérateurs','Capitaine Modérateurs','Haut Modérateurs','Modérateurs','Modérateur Test'];
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    modRoles.some(n => member.roles.cache.find(r => r.name === n));
}
function isIdleChannel(ch) {
  if (!ch) return false;
  const n = ch.name.toLowerCase();
  return n.includes('afk') || n.includes('sleep') || n.includes('idle');
}

// ── SERVER CONFIG ────────────────────────────────────────────
function getConfig(guildId) {
  db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(guildId);
  return db.prepare('SELECT * FROM server_config WHERE guild_id=?').get(guildId);
}

// ── LOG HELPER ───────────────────────────────────────────────
async function sendLog(guild, embedData) {
  const cfg = getConfig(guild.id);
  const logsCh = cfg?.logs_channel
    ? guild.channels.cache.get(cfg.logs_channel)
    : guild.channels.cache.find(c => c.name.includes('cmds-staff') || c.name.includes('logs'));
  if (!logsCh) return;
  try { await logsCh.send({ embeds: [embedData] }); } catch {}
}

// ── XP ROLES CONFIG HELPERS ──────────────────────────────────
function getXpRoles(guildId) {
  const cfg = getConfig(guildId);
  try { return JSON.parse(cfg?.xp_roles || '[]'); } catch { return []; }
}

function getTicketCategories(guildId) {
  const cfg = getConfig(guildId);
  try { return JSON.parse(cfg?.ticket_categories || '["Report","Giveaway","Scam","Candidature"]'); } catch { return ['Report','Giveaway','Scam','Candidature']; }
}

// ── TICKET CATEGORY EMOJI ────────────────────────────────────
function ticketCategoryEmoji(cat) {
  const map = { Report:'🚨', Giveaway:'🎉', Scam:'💀', Candidature:'📋', Litige:'⚔️', Support:'🎧', Middleman:'🛡️' };
  return map[cat] ?? '🎫';
}

// ══════════════════════════════════════════════════════════════
//  EMBEDS
// ══════════════════════════════════════════════════════════════

function tradeEmbed(trade, poster) {
  const off = JSON.parse(trade.offer_weapons), want = JSON.parse(trade.want_weapons);
  const diff = trade.offer_value - trade.want_value;
  const fair = Math.abs(diff) <= 20;
  const pct = trade.offer_value > 0 ? Math.min(100, Math.round((1 - Math.abs(diff)/Math.max(trade.offer_value, trade.want_value||1))*100)) : 100;
  const bar = `${'█'.repeat(Math.round(pct/10))}${'░'.repeat(10-Math.round(pct/10))} ${pct}%`;
  const tradeRank = getTradeRank(poster?.trade_count ?? 0);

  return new EmbedBuilder()
    .setColor(fair ? C.success : C.warning)
    .setAuthor({ name: `🗡️ TRADE #${String(trade.id).padStart(4,'0')}  —  Wenzy MM2`, iconURL: poster?.roblox_avatar ?? null })
    .setThumbnail(poster?.roblox_avatar ?? null)
    .addFields(
      { name: '👤 Trader', value: `<@${trade.poster_id}>${poster?.verified ? ' ✅' : ''}\n${tradeRank.emoji} ${tradeRank.name}\n📊 ${poster?.trade_count??0} trades · 💬 ${poster?.vouch_count??0} vouches`, inline: true },
      { name: '📤 Offre', value: off.map(w=>`${tierBadge(w.tier??'godly')} **${w.name}** \`${w.value}v\``).join('\n') + `\n\n> Total **${trade.offer_value} val**`, inline: true },
      { name: '📥 Recherche', value: want.map(w=>`**${w.name}**`).join('\n') + (trade.want_value > 0 ? `\n\n> Total **${trade.want_value} val**` : ''), inline: true },
      { name: '⚖️ Équité', value: `${fair ? '✅ Fair' : diff > 0 ? '📈 Avantageux trader' : '📉 Unfair'}\n\`[${bar}]\``, inline: false },
    )
    .setFooter({ text: `Wenzy Bot v7.5  •  Trade posté le ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}` })
    .setTimestamp();
}

function profileEmbed(user, inv, discordUser) {
  const xpTier = getXpTier(user.xp??0);
  const nextTier = getNextXpTier(user.xp??0);
  const tradeRank = getTradeRank(user.trade_count??0);
  const bar = xpProgressBar(user.xp??0);
  const nextLabel = nextTier ? `→ ${nextTier.name} à ${nextTier.xp} XP` : '🏆 MAX LEVEL';
  const tierItems = inv.filter(w=>w.weapon_value>0).sort((a,b)=>b.weapon_value-a.weapon_value);

  return new EmbedBuilder()
    .setColor(xpTier.color)
    .setAuthor({ name: `${user.roblox_username??'Non lié'}  —  Profil MM2`, iconURL: user.roblox_avatar??discordUser?.displayAvatarURL()??null })
    .setThumbnail(user.roblox_avatar??discordUser?.displayAvatarURL()??null)
    .addFields(
      { name: '🎮 Roblox', value: user.verified ? `✅ **${user.roblox_username}**` : '❌ Non lié', inline: true },
      { name: '🗡️ Rang Trade', value: `${tradeRank.emoji} ${tradeRank.name}`, inline: true },
      { name: '📊 Réputation', value: `✅ ${user.trade_count??0} trades\n💬 ${user.vouch_count??0} vouches\n🚨 ${user.report_count??0} reports`, inline: true },
      { name: `${xpTier.emoji} Niveau — ${xpTier.name}`, value: `\`[${bar}]\`\n${user.xp??0} XP · ${nextLabel}`, inline: false },
      { name: '🪙 Pièces', value: `\`[${coinsBar(user.coins??0)}]\``, inline: true },
      { name: '🔥 Streak daily', value: `${user.daily_streak??0} jours 🔥`, inline: true },
      { name: `📦 Inventory (${inv.length})`, value: tierItems.length ? tierItems.slice(0,8).map(w=>`${tierBadge(w.weapon_tier??'godly')} **${w.weapon_name}** \`${w.weapon_value}v\``).join('\n') : '— Vide', inline: false },
    )
    .setFooter({ text: `Wenzy Bot v7.5  •  Membre depuis ${new Date(user.created_at*1000).toLocaleDateString('fr-FR')}` })
    .setTimestamp();
}

function welcomeEmbed(member, guild) {
  const totalUsers = guild.memberCount;
  const verifiedCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get()?.c ?? 0;
  const tradesCount = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed')?.c ?? 0;
  const cfg = getConfig(guild.id);
  const customMsg = cfg?.custom_welcome_msg ?? null;

  return new EmbedBuilder()
    .setColor(C.primary)
    .setAuthor({ name: `Bienvenue sur ${guild.name} !`, iconURL: guild.iconURL()??null })
    .setDescription(customMsg ?? [
      `Salut <@${member.id}> ! Tu es le **membre #${totalUsers}** 🎉`,
      '',
      '**🔑 Pour accéder au serveur :**',
      '→ Rends-toi dans **#lier-roblox** et lie ton compte Roblox',
      '',
      '**Ce que tu peux faire ici :**',
      '🗡️ Trader des armes MM2 en toute sécurité',
      '🎁 Participer aux giveaways',
      '📺 Suivre les contenus de Wenzy',
      '💬 Rejoindre la communauté',
    ].join('\n'))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👥 Membres', value: `**${totalUsers}**`, inline: true },
      { name: '✅ Vérifiés', value: `**${verifiedCount}**`, inline: true },
      { name: '🗡️ Trades', value: `**${tradesCount}**`, inline: true },
    )
    .setFooter({ text: `Wenzy Bot v7.5  •  ${guild.name}` })
    .setTimestamp();
}

function leaderboardEmbed(top, type = 'trades') {
  const medals = ['🥇', '🥈', '🥉'];
  const titles = { trades: '🏆 Top Traders MM2', coins: '🪙 Classement Pièces', xp: '⭐ Classement XP' };
  const lines = top.map((u, i) => {
    const medal = medals[i] ?? `\`#${i+1}\``;
    if (type === 'coins') return `${medal} <@${u.discord_id}> — **${u.coins.toLocaleString('fr-FR')} 🪙**`;
    if (type === 'xp') return `${medal} <@${u.discord_id}> — **${u.xp??0} XP** · ${getXpTier(u.xp??0).name}`;
    const rank = getTradeRank(u.trade_count??0);
    return `${medal} <@${u.discord_id}> — **${u.trade_count??0}** trades · ${rank.emoji} ${rank.name}`;
  });
  return new EmbedBuilder()
    .setColor(C.gold)
    .setAuthor({ name: titles[type] ?? '🏆 Classement' })
    .setDescription(lines.join('\n') || '_Aucun résultat_')
    .setFooter({ text: 'Wenzy Bot v7.5  •  Mis à jour automatiquement' })
    .setTimestamp();
}

function ticketEmbed(ticket) {
  const catEmoji = ticketCategoryEmoji(ticket.category);
  return new EmbedBuilder()
    .setColor(C.info)
    .setAuthor({ name: `${catEmoji} ${ticket.category} — Ticket #${String(ticket.id).padStart(4,'0')}` })
    .setDescription([
      `> Créé par <@${ticket.creator_id}> <t:${ticket.created_at}:R>`,
      ticket.reason ? `\n**📝 Raison :** ${ticket.reason}` : '',
      ticket.reported_id ? `**⚠️ Membre signalé :** <@${ticket.reported_id}>` : '',
      ticket.trade_id ? `**🗡️ Trade :** #${ticket.trade_id}` : '',
    ].filter(Boolean).join('\n'))
    .addFields(
      { name: '📋 Statut', value: ticket.status==='open' ? '🟢 Ouvert' : ticket.status==='claimed' ? `🟡 Pris en charge par <@${ticket.claimed_by}>` : '🔴 Fermé', inline: true },
      { name: '📅 Créé', value: `<t:${ticket.created_at}:f>`, inline: true },
    )
    .setFooter({ text: 'Wenzy Bot v7.5  •  Tickets' })
    .setTimestamp();
}

function automodLogEmbed(action, user, reason, detail = '') {
  const colors = { warn:C.warning, mute:C.danger, kick:C.danger, ban:0x000000, delete:C.info };
  const labels = { warn:'⚠️ Avertissement', mute:'🔇 Mute Auto', kick:'🦶 Kick Auto', ban:'🔨 Ban Auto', delete:'🗑️ Message supprimé' };
  return new EmbedBuilder()
    .setColor(colors[action]??C.warning)
    .setAuthor({ name: `🛡️ AutoMod — ${labels[action]??action}` })
    .addFields(
      { name: '👤 Membre', value: `<@${user.id}> (${user.tag??user.username})`, inline: true },
      { name: '📋 Raison', value: reason, inline: true },
      { name: '⏰ Date', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
      ...(detail ? [{ name: '📄 Détail', value: detail.slice(0,500), inline:false }] : []),
    )
    .setFooter({ text: 'Wenzy Bot v7.5  •  AutoMod' })
    .setTimestamp();
}

function xpLevelUpEmbed(uid, oldTier, newTier) {
  return new EmbedBuilder()
    .setColor(newTier.color)
    .setAuthor({ name: `⬆️ Level Up ! ${oldTier.name} → ${newTier.name}` })
    .setDescription(`<@${uid}> a atteint le niveau **${newTier.name}** ${newTier.emoji} !`)
    .setFooter({ text: 'Wenzy Bot v7.5  •  Système XP' })
    .setTimestamp();
}

// ── BUTTONS ──────────────────────────────────────────────────
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
    new ButtonBuilder().setCustomId(`staff_validate_${tradeId}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`staff_reject_${tradeId}`).setLabel('❌ Rejeter').setStyle(ButtonStyle.Danger),
  );
}
function ticketActionButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('🤝 Prendre en charge').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
  );
}

// ── TICKET SELECT MENU ───────────────────────────────────────
function ticketSelectMenu(guildId) {
  const cats = getTicketCategories(guildId);
  const options = cats.map(cat => new StringSelectMenuOptionBuilder()
    .setLabel(cat)
    .setValue(cat.toLowerCase())
    .setEmoji(ticketCategoryEmoji(cat))
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_select_category')
      .setPlaceholder('📋 Choisir le type de ticket...')
      .addOptions(options)
  );
}

// ── ROBLOX ───────────────────────────────────────────────────
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
    const r = await axios.get('https://bloxultra.com/api/values/mm2',{timeout:10000,headers:{'User-Agent':'WenzyBot/7.5','Accept':'application/json'}});
    const data = r.data;
    if (Array.isArray(data)) { for(const item of data){const name=item.name??item.Name??item.weapon;const val=item.value??item.Value??item.demand??0;const tier=(item.tier??item.type??'godly').toLowerCase();if(name&&val>0){stmt.run(String(name),Math.round(val),tier);synced++;}}}
    else if(data&&typeof data==='object'){for(const[name,info]of Object.entries(data)){if(['success','status','message'].includes(name))continue;const val=typeof info==='number'?info:(info?.value??0);const tier=(info?.tier??'godly').toLowerCase();if(name&&val>0){stmt.run(String(name),Math.round(val),tier);synced++;}}}
    if(synced>0){console.log(`[Values] ${synced} armes synced`);return;}
  } catch(e){console.warn('[Values] API failed:',e.message);}
  const hc=[['Ancient Seer',200,'ancient'],['Chroma Seer',165,'chroma'],['Chroma Harvester',150,'chroma'],['Chroma Lightbringer',145,'chroma'],['Chroma Luger',125,'chroma'],['Prism',95,'godly'],['Corrupt',90,'godly'],['Elderwood Scythe',85,'godly'],['Hallowscythe',82,'godly'],['Blue Seer',72,'godly'],['Vampire Axe',62,'godly'],['Batwing',62,'godly'],['Harvester',65,'godly'],['Gingerscope',48,'godly'],['Traveler Axe',55,'godly'],['Icepiercer',50,'godly'],['Heart Blade',42,'godly'],['Elderwood Blade',45,'godly'],['Shark',57,'godly'],['Icicle',52,'godly'],['Luger',50,'godly'],['Raygun',45,'godly']];
  for(const[name,val,tier]of hc){stmt.run(name,val,tier);synced++;}
  console.log(`[Values] Fallback: ${synced} armes`);
}

// ── XP ROLES SYSTEM ─────────────────────────────────────────
async function applyXpRoles(guild, member, xp) {
  try {
    // Apply default XP tiers
    const currentTier = getXpTier(xp);
    for (const t of XP_TIERS) {
      const r = guild.roles.cache.find(x => x.name === t.roleSync);
      if (r) {
        if (t.name === currentTier.name && !member.roles.cache.has(r.id)) await member.roles.add(r).catch(()=>{});
        else if (t.name !== currentTier.name && member.roles.cache.has(r.id)) await member.roles.remove(r).catch(()=>{});
      }
    }
    // Apply custom XP roles from /panel config
    const customRoles = getXpRoles(guild.id);
    for (const cr of customRoles) {
      const role = guild.roles.cache.get(cr.role_id);
      if (!role) continue;
      if (xp >= cr.xp_threshold && !member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(()=>{});
      } else if (xp < cr.xp_threshold && member.roles.cache.has(role.id)) {
        await member.roles.remove(role).catch(()=>{});
      }
    }
  } catch {}
}

async function applyTradeRankRole(guild, member, tradeCount) {
  try {
    const currentRank = getTradeRank(tradeCount);
    for (const r of TRADE_RANKS) {
      const role = guild.roles.cache.find(x => x.name === r.name);
      if (role) {
        if (r.name === currentRank.name && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(()=>{});
        else if (r.name !== currentRank.name && member.roles.cache.has(role.id)) await member.roles.remove(role).catch(()=>{});
      }
    }
  } catch {}
}

async function addXp(guild, discordId, amount) {
  db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(discordId);
  const before = db.prepare('SELECT xp FROM users WHERE discord_id=?').get(discordId);
  const oldTier = getXpTier(before?.xp??0);
  db.prepare('UPDATE users SET xp=xp+? WHERE discord_id=?').run(amount, discordId);
  const after = db.prepare('SELECT * FROM users WHERE discord_id=?').get(discordId);
  const newTier = getXpTier(after.xp);
  try {
    const member = await guild.members.fetch(discordId).catch(()=>null);
    if (member) await applyXpRoles(guild, member, after.xp);
  } catch {}
  if (newTier.name !== oldTier.name) {
    const cfg = getConfig(guild.id);
    const lvlCh = cfg?.level_channel ? guild.channels.cache.get(cfg.level_channel) : guild.channels.cache.find(c=>c.name.includes('level'));
    if (lvlCh) {
      // Try to send canvas image with embed
      try {
        const discordUser = await guild.client.users.fetch(discordId).catch(()=>null);
        const imgBuffer = discordUser ? await buildLevelUpImage(discordUser, oldTier, newTier, after.xp) : null;
        if (imgBuffer) {
          const lvlEmbed = xpLevelUpEmbed(discordId, oldTier, newTier);
          lvlEmbed.setImage('attachment://levelup.png');
          await lvlCh.send({
            content: `<@${discordId}>`,
            embeds: [lvlEmbed],
            files: [{ attachment: imgBuffer, name: 'levelup.png' }],
          }).catch(()=>{});
        } else {
          await lvlCh.send({content:`<@${discordId}>`, embeds:[xpLevelUpEmbed(discordId, oldTier, newTier)]}).catch(()=>{});
        }
      } catch {
        await lvlCh.send({ embeds:[xpLevelUpEmbed(discordId, oldTier, newTier)] }).catch(()=>{});
      }
    }
    await sendLog(guild, new EmbedBuilder().setColor(newTier.color)
      .setAuthor({name:`⬆️ Level Up — ${oldTier.name} → ${newTier.name}`})
      .addFields({name:'👤 Membre',value:`<@${discordId}>`,inline:true},{name:'✨ XP',value:`${after.xp} XP`,inline:true})
      .setTimestamp());
  }
  return after;
}

// ── AUTOMOD ──────────────────────────────────────────────────
const spamCache = new Map();
async function handleAutomod(message) {
  if (message.author.bot) return false;
  const { guild, author, channel, content } = message;
  db.prepare('INSERT OR IGNORE INTO automod_config (guild_id) VALUES (?)').run(guild.id);
  const cfg = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(guild.id);
  if (!cfg) return false;
  const member = await guild.members.fetch(author.id).catch(()=>null);
  if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  let violated = false, reason = '';

  if (cfg.block_links) {
    const wl = JSON.parse(cfg.link_whitelist_channels||'[]');
    if (/(https?:\/\/|discord\.gg\/|discord\.com\/invite\/)[^\s]+/gi.test(content) && !wl.includes(channel.id)) {
      await message.delete().catch(()=>{});
      violated = true; reason = 'Lien non autorisé';
    }
  }
  if (!violated && cfg.anti_caps && content.length > 10) {
    const caps = content.replace(/[^A-Z]/g,'').length;
    const letters = content.replace(/[^A-Za-z]/g,'').length;
    if (letters > 5 && caps/letters > 0.6) { await message.delete().catch(()=>{}); violated = true; reason = 'Trop de majuscules'; }
  }
  if (!violated && cfg.anti_spam) {
    const now = Date.now(), key = `${author.id}:${guild.id}`;
    if (!spamCache.has(key)) spamCache.set(key,{count:0,lastReset:now});
    const s = spamCache.get(key);
    if (now-s.lastReset>5000){s.count=0;s.lastReset=now;}
    s.count++;
    if (s.count>=6){await message.delete().catch(()=>{});s.count=0;violated=true;reason='Spam';}
  }
  if (!violated && cfg.banned_words) {
    const banned = JSON.parse(cfg.banned_words||'[]'), lower = content.toLowerCase();
    for(const word of banned){if(lower.includes(word)){await message.delete().catch(()=>{});violated=true;reason=`Mot banni`;break;}}
  }
  if (!violated) return false;

  db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(author.id);
  db.prepare('UPDATE users SET warn_count=warn_count+1 WHERE discord_id=?').run(author.id);
  db.prepare('INSERT INTO warns (discord_id,moderator_id,reason) VALUES (?,?,?)').run(author.id,guild.members.me.id,`[AutoMod] ${reason}`);
  const u = db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(author.id);
  const warns = u?.warn_count??1;

  try { await author.send({ embeds:[new EmbedBuilder().setColor(C.warning).setDescription(`⚠️ Avertissement AutoMod sur **${guild.name}**\n\n**Raison :** ${reason}\n\nTu as **${warns}** warn(s).`)] }); } catch {}

  if (warns >= cfg.max_warns_kick) { await member.kick(`[AutoMod] ${warns} warns`).catch(()=>{}); await sendLog(guild,automodLogEmbed('kick',author,`${warns} warns`,reason)); }
  else if (warns >= cfg.max_warns_mute) {
    const muteRole = guild.roles.cache.find(r=>r.name==='🔇 Muet');
    if (muteRole) { await member.roles.add(muteRole).catch(()=>{}); setTimeout(async()=>{await member.roles.remove(muteRole).catch(()=>{})},600000); }
    await sendLog(guild,automodLogEmbed('mute',author,`${warns} warns — mute 10min`,reason));
  } else { await sendLog(guild,automodLogEmbed('warn',author,reason,`Warn ${warns}`)); }

  const alertMsg = await channel.send({content:`<@${author.id}> ⚠️ **${reason}** (Warn ${warns})`}).catch(()=>null);
  if (alertMsg) setTimeout(()=>alertMsg.delete().catch(()=>{}),5000);
  return true;
}

// ── ANTI-RAID ────────────────────────────────────────────────
const raidCache = {joins:[],locked:false};
async function handleAntiRaid(guild, member) {
  db.prepare('INSERT OR IGNORE INTO automod_config (guild_id) VALUES (?)').run(guild.id);
  const cfg = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(guild.id);
  if (!cfg?.anti_raid) return;
  const now = Date.now();
  raidCache.joins = raidCache.joins.filter(t=>now-t<30000);
  raidCache.joins.push(now);
  if (raidCache.joins.length >= 10 && !raidCache.locked) {
    raidCache.locked = true;
    for(const ch of guild.channels.cache.filter(c=>c.type===ChannelType.GuildText).values()){
      await ch.permissionOverwrites.edit(guild.id,{SendMessages:false}).catch(()=>{});
    }
    await sendLog(guild,new EmbedBuilder().setColor(C.danger).setAuthor({name:'🚨 ANTI-RAID — LOCKDOWN'}).setDescription(`${raidCache.joins.length} membres en 30s. Serveur lockdown.\nUtilise \`/unlock\` pour déverrouiller.`).setTimestamp());
    setTimeout(()=>{raidCache.locked=false;},600000);
  }
}

// ── LEADERBOARDS ─────────────────────────────────────────────
async function updateLeaderboards(guild) {
  const topTrades = db.prepare('SELECT * FROM users ORDER BY trade_count DESC LIMIT 10').all();
  const topCoins = db.prepare('SELECT * FROM users ORDER BY coins DESC LIMIT 10').all();
  const topXp = db.prepare('SELECT * FROM users ORDER BY xp DESC LIMIT 10').all();

  const tradeCh = guild.channels.cache.find(c=>c.name.includes('classement') && c.name.toLowerCase().includes('trade'));
  const coinsCh = guild.channels.cache.find(c=>c.name.includes('classement') && (c.name.toLowerCase().includes('piece')||c.name.toLowerCase().includes('pièce')||c.name.toLowerCase().includes('coin')));
  const xpCh = guild.channels.cache.find(c=>c.name.includes('classement') && c.name.toLowerCase().includes('xp'));

  async function refreshCh(ch, embed) {
    if (!ch) return;
    const msgs = await ch.messages.fetch({limit:5}).catch(()=>null);
    if (msgs) for(const m of msgs.values()) if(m.author.bot) await m.delete().catch(()=>{});
    await ch.send({embeds:[embed]}).catch(()=>{});
  }
  if (topTrades.length) await refreshCh(tradeCh, leaderboardEmbed(topTrades,'trades'));
  if (topCoins.length) await refreshCh(coinsCh, leaderboardEmbed(topCoins,'coins'));
  if (topXp.length) await refreshCh(xpCh, leaderboardEmbed(topXp,'xp'));
}

// ── STAT CHANNELS ────────────────────────────────────────────
async function updateStatChannels(guild) {
  const totalMembers = guild.memberCount;
  const verifiedCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get()?.c??0;
  const tradesCount = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed')?.c??0;

  // Coins en circulation = somme de tous les coins des users
  const totalCoins = db.prepare('SELECT COALESCE(SUM(coins),0) as c FROM users').get()?.c??0;

  // Vocaux lockés = channels vocaux avec Connect:false pour @everyone
  let lockedVocals = 0;
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    const overwrite = ch.permissionOverwrites.cache.get(guild.id);
    if (overwrite && overwrite.deny.has(PermissionFlagsBits.Connect)) lockedVocals++;
  }

  const stats = [
    {find:'arrivés',   name:`🛬 Arrivés: ${totalMembers}`},
    {find:'membres',   name:`👥 Membres: ${totalMembers}`},
    {find:'vérifiés',  name:`✅ Vérifiés: ${verifiedCount}`},
    {find:'trades',    name:`🗡️ Trades: ${tradesCount}`},
    {find:'coins',     name:`🪙 Coins: ${totalCoins.toLocaleString('fr-FR')}`},
    {find:'lockés',    name:`🔒 Lockés: ${lockedVocals}`},
    {find:'locked',    name:`🔒 Lockés: ${lockedVocals}`},
    {find:'départs',   name:`🛫 Départs: 0`}, // reste à 0, Discord ne track pas ça nativement sans event
  ];
  for(const s of stats){
    const ch = guild.channels.cache.find(c=>c.name.toLowerCase().includes(s.find.toLowerCase())&&c.type===ChannelType.GuildVoice);
    if(ch) await ch.setName(s.name).catch(()=>{});
  }
}

// ── SHARED FUNCTIONS ─────────────────────────────────────────
async function doVerify(interaction) {
  const did = interaction.user.id;
  const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if (!user?.verify_code) return interaction.editReply('❌ Lance d\'abord la vérification via le bouton dans **#lier-roblox**.');
  if (user.verified) return interaction.editReply(`✅ Déjà vérifié : **${user.roblox_username}** !`);
  let desc;
  try { desc = await getRobloxDescription(user.roblox_id); }
  catch { return interaction.editReply('❌ API Roblox indisponible. Réessaie.'); }
  if (!desc.includes(user.verify_code)) return interaction.editReply(`❌ Code \`${user.verify_code}\` introuvable dans ta bio.\nAssure-toi de l'avoir sauvegardé sur [roblox.com](https://www.roblox.com/my/account#!/info).`);
  const avatar = await getRobloxAvatar(user.roblox_id);
  db.prepare('UPDATE users SET verified=1,roblox_avatar=? WHERE discord_id=?').run(avatar, did);

  try {
    const g = interaction.guild;
    const membresRole = g.roles.cache.find(r=>r.name==='Membres');
    const debutantRole = g.roles.cache.find(r=>r.name==='5 - Débutants');
    if (membresRole) await interaction.member.roles.add(membresRole).catch(()=>{});
    if (debutantRole) await interaction.member.roles.add(debutantRole).catch(()=>{});
  } catch {}

  await interaction.editReply({ embeds:[new EmbedBuilder().setColor(C.success)
    .setAuthor({name:'✅ Compte Roblox vérifié !'})
    .setThumbnail(avatar)
    .setDescription([`Discord lié à **${user.roblox_username}** !`,'','Tu as maintenant accès aux trades.','Poste ton premier trade dans **#poster-un-trade** !'].join('\n'))
    .setTimestamp()] });

  await sendLog(interaction.guild, new EmbedBuilder().setColor(C.success)
    .setAuthor({name:'✅ Vérification Roblox'})
    .addFields({name:'👤 Discord',value:`<@${did}>`,inline:true},{name:'🎮 Roblox',value:user.roblox_username,inline:true})
    .setTimestamp());

  // Mise à jour immédiate du compteur ✅ Vérifiés dans les stat-channels
  await updateStatChannels(interaction.guild).catch(()=>{});
}

async function postTrade(interaction, did, offreStr, chercheStr, manualOfferVal, manualWantVal) {
  const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if (!user?.verified) return interaction.editReply('❌ Lie et vérifie ton compte Roblox dans **#lier-roblox** avant de trader.');
  const { total:autoOv, details:od } = calcValue(parseWeapons(offreStr));
  const { total:autoWv, details:wd } = calcValue(parseWeapons(chercheStr));
  const ov = manualOfferVal > 0 ? manualOfferVal : autoOv;
  const wv = manualWantVal > 0 ? manualWantVal : autoWv;
  const unknownOffer = od.filter(w=>w.value===0).map(w=>w.name);
  const unknownWant = wd.filter(w=>w.value===0).map(w=>w.name);
  let unknownWarn = '';
  if (unknownOffer.length) unknownWarn += `\n⚠️ Offre inconnue : **${unknownOffer.join(', ')}**`;
  if (unknownWant.length) unknownWarn += `\n⚠️ Recherche inconnue : **${unknownWant.join(', ')}**`;
  const tradeRank = getTradeRank(user.trade_count??0);
  // Limite débutants supprimée — tous les rangs peuvent trader librement
  const res = db.prepare('INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value,want_value) VALUES (?,?,?,?,?)').run(did,JSON.stringify(od),JSON.stringify(wd),ov,wv);
  const tid = res.lastInsertRowid;
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
  const cfg = getConfig(interaction.guild.id);
  const tradeCh = cfg?.trades_channel ? interaction.guild.channels.cache.get(cfg.trades_channel) : interaction.guild.channels.cache.find(c=>c.name.includes('post-trades'));
  if (!tradeCh) return interaction.editReply('❌ Salon de trades introuvable. Configure via `/panel`.');
  const msg = await tradeCh.send({embeds:[tradeEmbed(trade,user)],components:[tradeButtons(tid)]});
  db.prepare('UPDATE trades SET message_id=?,channel_id=? WHERE id=?').run(msg.id,tradeCh.id,tid);

  const alerts = db.prepare('SELECT * FROM price_alerts WHERE active=1').all();
  for(const alert of alerts){
    const matchOffer = od.find(w=>w.name.toLowerCase()===alert.weapon_name.toLowerCase()&&ov<=alert.max_value);
    if(matchOffer&&alert.discord_id!==did){
      try{const alertUser=await interaction.client.users.fetch(alert.discord_id);await alertUser.send({embeds:[new EmbedBuilder().setColor(C.gold).setDescription(`🔔 Trade pour **${alert.weapon_name}** à **${ov} val** posté dans <#${tradeCh.id}> !`).setTimestamp()]});}catch{}
    }
  }
  await interaction.editReply(`✅ Trade **#${tid}** posté dans <#${tradeCh.id}> !${unknownWarn}`);
}

async function cancelTrade(interaction, did, tradeId) {
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if (!trade) return interaction.editReply('❌ Trade introuvable.');
  const isAdmin = hasStaffPerm(interaction.member);
  if (trade.poster_id !== did && !isAdmin) return interaction.editReply('❌ Seul le posteur ou un staff peut annuler.');
  if (!['open','in_progress'].includes(trade.status)) return interaction.editReply('❌ Ce trade ne peut plus être annulé.');
  db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled',tradeId);
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  if (trade.thread_id){try{const t=await interaction.guild.channels.fetch(trade.thread_id).catch(()=>null);if(t){await t.send('❌ **Trade annulé.**');setTimeout(()=>t.delete().catch(()=>{}),5000);}}catch{}}
  if (trade.message_id&&trade.channel_id){try{const c=await interaction.guild.channels.fetch(trade.channel_id).catch(()=>null);const m=c?await c.messages.fetch(trade.message_id).catch(()=>null):null;if(m)await m.delete().catch(()=>{});}catch{}}
  await interaction.editReply(`✅ Trade **#${tradeId}** annulé.`);
}

async function completeTrade(guild, tradeId, screenshotUrl) {
  const trade = db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if (!trade) return false;
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  db.prepare(`UPDATE trades SET status='completed',completed_at=strftime('%s','now'),screenshot_url=?,screenshot_verified=1 WHERE id=?`).run(screenshotUrl,tradeId);

  for(const uid of [trade.poster_id,trade.accepter_id]){
    if (!uid) continue;
    db.prepare('UPDATE users SET coins=coins+50,trade_count=trade_count+1 WHERE discord_id=?').run(uid);
    const u = db.prepare('SELECT * FROM users WHERE discord_id=?').get(uid);
    db.prepare('INSERT INTO vouches (from_id,to_id,trade_id) VALUES (?,?,?)').run(
      uid===trade.poster_id?trade.accepter_id:trade.poster_id,uid,tradeId
    );
    db.prepare('UPDATE users SET vouch_count=vouch_count+1 WHERE discord_id=?').run(uid);
    await addXp(guild,uid,50);
    try{
      const member = await guild.members.fetch(uid).catch(()=>null);
      if(member){
        const freshUser = db.prepare('SELECT * FROM users WHERE discord_id=?').get(uid);
        await applyTradeRankRole(guild,member,freshUser.trade_count??0);
        await applyXpRoles(guild,member,freshUser.xp??0);
        if(freshUser.trade_count>=5){
          const topWeapon = db.prepare('SELECT weapon_name FROM inventory WHERE discord_id=? ORDER BY weapon_value DESC LIMIT 1').get(uid);
          if(topWeapon&&WEAPON_ROLES.some(w=>w.toLowerCase()===topWeapon.weapon_name.toLowerCase())){
            const wr=guild.roles.cache.find(r=>r.name===topWeapon.weapon_name);
            if(wr&&!member.roles.cache.has(wr.id))await member.roles.add(wr).catch(()=>{});
          }
        }
      }
    }catch{}
  }

  if(trade.message_id&&trade.channel_id){
    try{
      const ch=await guild.channels.fetch(trade.channel_id).catch(()=>null);
      if(ch){
        const msg=await ch.messages.fetch(trade.message_id).catch(()=>null);
        if(msg){
          const completedEmbed=new EmbedBuilder().setColor(C.success)
            .setAuthor({name:`✅ TRADE #${String(tradeId).padStart(4,'0')} — COMPLÉTÉ 🎉`})
            .setDescription(`> <@${trade.poster_id}> × <@${trade.accepter_id}>\n> +50 🪙 chacun | +1 vouch mutuel | +50 XP`)
            .setTimestamp();
          await msg.edit({embeds:[completedEmbed],components:[]}).catch(()=>{});
        }
      }
    }catch{}
  }

  // ── VOUCH CHANNEL avec le screenshot ──────────────────────
  const vouchCh = guild.channels.cache.find(c=>c.name.includes('preuves')||c.name.includes('vouche'));
  if(vouchCh){
    const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
    const vouchEmbed = new EmbedBuilder().setColor(C.success)
      .setAuthor({name:`✅ TRADE #${String(tradeId).padStart(4,'0')} COMPLÉTÉ`})
      .setDescription(`<@${trade.poster_id}> × <@${trade.accepter_id}>`)
      .addFields(
        {name:'📤 Offre',value:off.map(w=>`• **${w.name}** \`${w.value}v\``).join('\n')+`\n**TOTAL : ${trade.offer_value} val**`,inline:true},
        {name:'📥 Recherche',value:want.map(w=>`• **${w.name}**`).join('\n'),inline:true},
        {name:'🎁 Gains',value:`+50 🪙 chacun | +1 vouch | +50 XP`,inline:false},
      ).setTimestamp();

    // Si on a un screenshot, l'ajouter à l'embed et l'envoyer en fichier
    if (screenshotUrl) {
      vouchEmbed.setImage(screenshotUrl);
      vouchEmbed.addFields({name:'📸 Screenshot',value:`[Voir le screenshot](${screenshotUrl})`,inline:false});
    }

    await vouchCh.send({embeds:[vouchEmbed]}).catch(()=>{});

    // Envoyer aussi le screenshot en tant qu'image séparée pour qu'il soit visible directement
    if (screenshotUrl) {
      await vouchCh.send({
        content: `📸 **Preuve du Trade #${String(tradeId).padStart(4,'0')}** — <@${trade.poster_id}> × <@${trade.accepter_id}>`,
        embeds: [new EmbedBuilder().setColor(C.info).setImage(screenshotUrl).setFooter({text:`Trade #${tradeId} • Validé par le staff`}).setTimestamp()]
      }).catch(()=>{});
    }
  }

  if(trade.thread_id){
    try{
      const t=await guild.channels.fetch(trade.thread_id).catch(()=>null);
      if(t){await t.send('🎉 **Trade complété !** +50 🪙 | +1 vouch | +50 XP');setTimeout(async()=>{try{await t.setArchived(true,'Trade terminé');}catch{}},10000);}
    }catch{}
  }

  await updateLeaderboards(guild);
  await updateStatChannels(guild);
  await sendLog(guild,new EmbedBuilder().setColor(C.success)
    .setAuthor({name:`✅ Trade #${tradeId} Complété`})
    .addFields(
      {name:'👤 Trader',value:`<@${trade.poster_id}>`,inline:true},
      {name:'👤 Accepteur',value:`<@${trade.accepter_id}>`,inline:true},
      {name:'💰 Valeur',value:`${trade.offer_value} val`,inline:true},
      ...(screenshotUrl?[{name:'📸 Screenshot',value:`[Voir](${screenshotUrl})`,inline:true}]:[])
    )
    .setTimestamp());
  return true;
}

// ── TICKET SYSTEM ────────────────────────────────────────────
async function getOrCreateTicketCategory(guild, categoryName) {
  const emoji = ticketCategoryEmoji(categoryName);
  const catName = `${emoji} TICKETS ${categoryName.toUpperCase()}`;
  let cat = guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===catName);
  if (!cat) {
    try {
      cat = await guild.channels.create({
        name: catName,
        type: ChannelType.GuildCategory,
        permissionOverwrites:[{id:guild.id,deny:[PermissionFlagsBits.ViewChannel]}],
      });
    } catch {}
  }
  return cat;
}

async function createTicket(interaction, category, options = {}) {
  const { guild, user } = interaction;
  const existing = db.prepare('SELECT * FROM tickets WHERE creator_id=? AND status!=?').get(user.id,'closed');
  if (existing) return interaction.editReply(`❌ Tu as déjà un ticket ouvert : <#${existing.channel_id}>. Ferme-le d'abord.`);

  const catPv = await getOrCreateTicketCategory(guild, category);
  const staffRoles = ['Wenzy','Madame Wenzy','Owners','Co-Owners','Superviseur Staff','Chef Admins','Admins','Modérateurs','Haut Modérateurs','Middleman'].map(n=>guild.roles.cache.find(r=>r.name===n)).filter(Boolean);
  const catEmoji = ticketCategoryEmoji(category);

  const ch = await guild.channels.create({
    name:`${catEmoji}・${user.username.slice(0,10).toLowerCase()}`,
    type:ChannelType.GuildText,
    parent:catPv?.id??null,
    permissionOverwrites:[
      {id:guild.id,deny:[PermissionFlagsBits.ViewChannel]},
      {id:user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]},
      ...staffRoles.map(r=>({id:r.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]})),
    ],
  });

  const res = db.prepare('INSERT INTO tickets (channel_id,creator_id,category,reason,trade_id,reported_id) VALUES (?,?,?,?,?,?)').run(ch.id,user.id,category,options.reason??null,options.trade_id??null,options.reported_id??null);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(res.lastInsertRowid);
  const staffMentions = staffRoles.map(r=>`<@&${r.id}>`).join(' ');

  await ch.send({
    content:`${staffMentions}\n<@${user.id}>`,
    embeds:[ticketEmbed(ticket)],
    components:[ticketActionButtons(ticket.id)],
  });

  await sendLog(guild,new EmbedBuilder().setColor(C.info)
    .setAuthor({name:`🎫 Nouveau Ticket — ${category}`})
    .addFields({name:'👤 Créateur',value:`<@${user.id}>`,inline:true},{name:'📋 Catégorie',value:category,inline:true},{name:'🔗 Salon',value:`<#${ch.id}>`,inline:true})
    .setTimestamp());
  return ch;
}

// ── GIVEAWAY ─────────────────────────────────────────────────
async function endGiveaway(client, giveawayId) {
  const gw = db.prepare('SELECT * FROM giveaways WHERE id=?').get(giveawayId);
  if (!gw||gw.status!=='active') return;
  const participants = JSON.parse(gw.participants||'[]');
  const winners = participants.length > 0 ? [...participants].sort(()=>Math.random()-0.5).slice(0,Math.min(gw.winners_count,participants.length)) : [];
  db.prepare('UPDATE giveaways SET status=?,winners=? WHERE id=?').run('ended',JSON.stringify(winners),giveawayId);
  try{
    const ch=await client.channels.fetch(gw.channel_id).catch(()=>null);if(!ch)return;
    const msg=gw.message_id?await ch.messages.fetch(gw.message_id).catch(()=>null):null;
    const embed=new EmbedBuilder().setColor(C.gold)
      .setAuthor({name:`🎉 GIVEAWAY TERMINÉ — ${gw.prize}`})
      .setDescription(winners.length>0?`**🏆 Gagnants :**\n${winners.map(w=>`> 🎊 <@${w}>`).join('\n')}`:'😕 Aucun participant.')
      .addFields({name:'🎁 Prix',value:gw.prize,inline:true},{name:'👥 Participants',value:`${participants.length}`,inline:true})
      .setTimestamp();
    if(msg)await msg.edit({embeds:[embed],components:[]}).catch(()=>{});
    const mention=winners.length>0?winners.map(w=>`<@${w}>`).join(', '):'aucun';
    await ch.send(`🎊 **Fin du giveaway !** Félicitations à ${mention} ! Prix : **${gw.prize}**`);
  }catch(e){console.error('[Giveaway]',e.message);}
}

// ── SHOP EMBED ───────────────────────────────────────────────
async function postShopEmbed(ch) {
  const msgs = await ch.messages.fetch({limit:10});
  for(const m of msgs.values()) if(m.author.bot) await m.delete().catch(()=>{});
  const items = db.prepare('SELECT * FROM shop_items WHERE active=1 ORDER BY price ASC').all();
  await ch.send({
    embeds:[new EmbedBuilder().setColor(C.gold)
      .setAuthor({name:'🛒 Boutique — Dépense tes pièces !'})
      .setDescription([
        '**Comment gagner des 🪙 ?**',
        '`+15-25 🪙` par message _(cooldown 1 min)_',
        '`+10 🪙/min` en vocal _(hors AFK)_',
        '`+50 🪙` par trade complété',
        '`+100+ 🪙` daily bonus',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━',
      ].join('\n'))
      .addFields(...items.length?items.map(i=>({name:`${i.emoji} ${i.name} — \`${i.price.toLocaleString('fr-FR')} 🪙\``,value:`> ${i.description??'—'}`,inline:true})):[{name:'— Aucun item',value:'Revenez plus tard',inline:false}])
      .setFooter({text:'Wenzy Bot v7.5  •  Boutique'}).setTimestamp()],
    components:[
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
  let count = 0;
  for(const u of allUsers){
    try{
      const member=await guild.members.fetch(u.discord_id).catch(()=>null);if(!member)continue;
      await applyTradeRankRole(guild,member,u.trade_count??0);
      await applyXpRoles(guild,member,u.xp??0);
      const membresRole=guild.roles.cache.find(r=>r.name==='Membres');
      if(membresRole&&!member.roles.cache.has(membresRole.id))await member.roles.add(membresRole).catch(()=>{});
      count++;
    }catch{}
  }
  console.log(`[Boot] ${count} membres restaurés`);
}

// ══════════════════════════════════════════════════════════════
//  COMMANDS
// ══════════════════════════════════════════════════════════════
const commands = [

  // /wenzy-setup
  {
    data: new SlashCommandBuilder().setName('wenzy-setup').setDescription('🏗️ Configure le serveur complet (reset salons + rôles)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild, log = [];

      // ── NETTOYAGE SALONS ──
      log.push('🧹 Nettoyage des salons...');
      for(const ch of guild.channels.cache.values()){
        await ch.delete('wenzy-setup reset').catch(()=>{});
      }
      await new Promise(r=>setTimeout(r,2000));

      // ── NETTOYAGE ROLES (sauf @everyone et rôles du bot) ──
      log.push('🧹 Nettoyage des rôles...');
      const botMember = guild.members.me;
      const botHighestPos = botMember?.roles.highest.position ?? 0;
      for(const role of guild.roles.cache.values()){
        if (role.id === guild.id) continue; // @everyone
        if (role.managed) continue; // rôles gérés (bots)
        if (role.position >= botHighestPos) continue; // rôles plus hauts que le bot
        await role.delete('wenzy-setup reset').catch(()=>{});
      }
      await new Promise(r=>setTimeout(r,2000));
      log.push('✅ Rôles supprimés');

      // ── CREATION DES ROLES ──
      const roleDefs = [
        { name:'Wenzy',               color:0xE74C3C, hoist:true,  perms:[PermissionFlagsBits.Administrator] },
        { name:'Madame Wenzy',        color:0xFF69B4, hoist:true,  perms:[PermissionFlagsBits.Administrator] },
        { name:'Squidd',              color:0xE74C3C, hoist:true,  perms:[PermissionFlagsBits.Administrator] },
        { name:'Owners',              color:0xE67E22, hoist:true,  perms:[PermissionFlagsBits.Administrator] },
        { name:'Co-Owners',           color:0xE67E22, hoist:true,  perms:[PermissionFlagsBits.Administrator] },
        { name:'Superviseur Staff',   color:0xF39C12, hoist:true,  perms:[PermissionFlagsBits.Administrator] },
        { name:'Chef Admins',         color:0xE67E22, hoist:true,  perms:[PermissionFlagsBits.Administrator] },
        { name:'Admins',              color:0xE67E22, hoist:true,  perms:[PermissionFlagsBits.Administrator] },
        { name:'Admins Test',         color:0xE67E22, hoist:false, perms:[PermissionFlagsBits.ModerateMembers] },
        { name:'Chef Modérateurs',    color:0x3498DB, hoist:true,  perms:[PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.KickMembers] },
        { name:'Capitaine Modérateurs',color:0x3498DB,hoist:false, perms:[PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageMessages] },
        { name:'Haut Modérateurs',    color:0x3498DB, hoist:false, perms:[PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageMessages] },
        { name:'Modérateurs',         color:0x3498DB, hoist:false, perms:[PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageMessages] },
        { name:'Modérateur Test',     color:0x7F8C8D, hoist:false, perms:[PermissionFlagsBits.ManageMessages] },
        { name:'Staff',               color:0x7F8C8D, hoist:false, perms:[PermissionFlagsBits.ManageMessages] },
        { name:'Amis',                color:0xE91E8C, hoist:true,  perms:[] },
        { name:'Contents Creators',   color:0xFF4500, hoist:true,  perms:[] },
        { name:'Protégés Des Owners', color:0x9B59B6, hoist:false, perms:[] },
        { name:'Boosteurs',           color:0xFF73FA, hoist:false, perms:[] },
        { name:'Middleman',           color:0x2ECC71, hoist:false, perms:[] },
        { name:'Soutien | .gg/wenzymm2', color:0x5865F2, hoist:false, perms:[] },
        { name:'Protéger de Kurai',   color:0x9B59B6, hoist:false, perms:[] },
        { name:'50 - Goat',           color:0xF1C40F, hoist:true,  perms:[] },
        { name:'30 - Elites',         color:0x9B59B6, hoist:false, perms:[] },
        { name:'20 - Puants',         color:0x3498DB, hoist:false, perms:[] },
        { name:'15 - Pipelettes',     color:0x27AE60, hoist:false, perms:[] },
        { name:'10 - Bavards',        color:0x2ECC71, hoist:false, perms:[] },
        { name:'5 - Débutants',       color:0x95A5A6, hoist:false, perms:[] },
        { name:'Gingerscope',         color:0xFF6B35, hoist:false, perms:[] },
        { name:'Traveler Axe',        color:0x8B4513, hoist:false, perms:[] },
        { name:'Vampire Axe',         color:0xDC143C, hoist:false, perms:[] },
        { name:'Harvester',           color:0x228B22, hoist:false, perms:[] },
        { name:'Icepiercer',          color:0x87CEEB, hoist:false, perms:[] },
        { name:'Heart Blade',         color:0xFF69B4, hoist:false, perms:[] },
        { name:'Elderwood Blade',     color:0x556B2F, hoist:false, perms:[] },
        { name:'Membres',             color:0x95A5A6, hoist:false, perms:[] },
        { name:'Homme',               color:0x3498DB, hoist:false, perms:[] },
        { name:'Femme',               color:0xE91E8C, hoist:false, perms:[] },
        { name:'+18',                 color:0xFF4500, hoist:false, perms:[] },
        { name:'-18',                 color:0x2ECC71, hoist:false, perms:[] },
        { name:'🔇 Muet',             color:0x2C2F33, hoist:false, perms:[] },
        { name:'📢 Annonces',         color:0x5865F2, hoist:false, perms:[] },
      ];

      const cr = {};
      for(const rd of roleDefs){
        try {
          const p = rd.perms.length>0?rd.perms.reduce((a,b)=>a|b,0n):0n;
          cr[rd.name]=await guild.roles.create({name:rd.name,color:rd.color,hoist:rd.hoist,permissions:p});
          log.push(`✅ Rôle: ${rd.name}`);
        } catch(e){ log.push(`⚠️ Rôle ${rd.name}: ${e.message}`); }
      }

      const admins = ['Wenzy','Madame Wenzy','Owners','Co-Owners','Superviseur Staff','Chef Admins','Admins'].map(n=>cr[n]).filter(Boolean);
      const modRoles = [...admins,'Chef Modérateurs','Capitaine Modérateurs','Haut Modérateurs','Modérateurs','Modérateur Test','Staff'].map(n=>cr[n]).filter(Boolean);
      const everyone = guild.id;

      const catDefs = [
        {
          name: '📊 STATISTIQUES',
          chs: [
            { name:'🛬 Arrivés: 0',    voice:true },
            { name:'🛫 Départs: 0',    voice:true },
            { name:'✅ Vérifiés: 0',   voice:true },
            { name:'🗡️ Trades: 0',     voice:true },
            { name:'🪙 Coins: 0',      voice:true },
          ]
        },
        {
          name: '📌 Côté Important',
          chs: [
            { name:'🎉┃bienvenue',         readonly:true, welcomeEmbed:true },
            { name:'📋┃règlement',         readonly:true },
            { name:'📢┃annonces',          readonly:true },
            { name:'🚀┃boosts',           readonly:true },
            { name:'📊┃sondages' },
            { name:'🤝┃partenariat',       readonly:true },
            { name:'🌐┃réseaux',           readonly:true },
            { name:'❓┃faq',              readonly:true },
          ]
        },
        {
          name: '🎁 Côté Cadeaux',
          chs: [
            { name:'🎉┃giveaways',         readonly:true },
            { name:'🏆┃mega-giveaways',    readonly:true },
            { name:'🧾┃preuves',           readonly:true },
          ]
        },
        {
          name: '📺 Côté Contenu',
          chs: [
            { name:'📢┃annonces-lives',    readonly:true },
            { name:'▶️┃posts-youtube',     readonly:true },
            { name:'🎵┃posts-tiktok',      readonly:true },
            { name:'👥┃posts-amis',        readonly:true },
          ]
        },
        {
          name: '🗡️ Côté Murder Mystery 2',
          chs: [
            { name:'📋┃updates',           readonly:true },
            { name:'👀┃sneek-peaks',       readonly:true },
            { name:'⚔️┃1vs1' },
            { name:'🗡️┃post-trades' },
            { name:'📬┃poster-un-trade' },
            { name:'💰┃price-check' },
            { name:'🏆┃vouches',           readonly:true },
            { name:'🛡️┃middleman-panel',   staff:true },
            { name:'🔄┃trade-adptme' },
            { name:'⚔️┃trade-blade' },
            { name:'🎮┃trade-autres' },
          ]
        },
        {
          name: '🔑 VÉRIFICATION',
          chs: [
            { name:'🔗┃lier-roblox' },
          ]
        },
        {
          name: '💬 Côté Général',
          chs: [
            { name:'💬┃chat' },
            { name:'📸┃médias' },
            { name:'⌨️┃bot-cmds' },
            { name:'⭐┃level',             readonly:true },
          ]
        },
        {
          name: '🏆 CLASSEMENTS',
          chs: [
            { name:'🏅┃classement-trades', readonly:true },
            { name:'🪙┃classement-pièces', readonly:true },
            { name:'✨┃classement-xp',     readonly:true },
          ]
        },
        {
          name: '🎮 Côté Fun',
          chs: [
            { name:'🎢┃playground' },
            { name:'🔢┃count' },
            { name:'😶┃faces-reveals' },
            { name:'🍔┃bouffes' },
            { name:'🎨┃fans-arts' },
            { name:'🗡️┃murder-mystery-2',  readonly:true, gameEmbed:'mm2' },
            { name:'🧱┃minecraft',         readonly:true, gameEmbed:'minecraft' },
            { name:'🎮┃fortnite',          readonly:true, gameEmbed:'fortnite' },
            { name:'🔫┃valorant',          readonly:true, gameEmbed:'valorant' },
            { name:'⚽┃football',          readonly:true, gameEmbed:'football' },
          ]
        },
        {
          name: '🛒 ÉCONOMIE',
          chs: [
            { name:'🛒┃boutique' },
            { name:'🎲┃jeux' },
          ]
        },
        {
          name: '🎙️ Côté Vocaux',
          chs: [
            { name:'🏗️┃créer-un-vocal',    createPv:true },
            { name:'🔇┃afk',              voice:true },
            { name:'🎙️┃général-1',         voice:true },
            { name:'🎙️┃général-2',         voice:true },
            { name:'👥┃duo-1',             voice:true },
            { name:'👥┃duo-2',             voice:true },
            { name:'👥┃trio-1',            voice:true },
          ]
        },
        { name:'🗂️ VOCAUX PRIVÉS', chs:[] },
        {
          name: '🎫 Côté Support',
          chs: [
            { name:'🎫┃ticket',            ticketEmbed:true },
            { name:'📋┃candidatures' },
          ]
        },
        {
          name: 'Staff',
          chs: [
            { name:'📢┃annonces-staff',    staff:true },
            { name:'💬┃chat-staff',       staff:true },
            { name:'📸┃media-staff',      staff:true },
            { name:'⌨️┃cmds-staff',       staff:true },
            { name:'⚠️┃sanctions-staff',  staff:true },
          ]
        },
      ];

      const cm = {};
      for(const cd of catDefs){
        const catPow = [
          {id:everyone,allow:[PermissionFlagsBits.ViewChannel]},
        ];
        const cat = await guild.channels.create({name:cd.name,type:ChannelType.GuildCategory,permissionOverwrites:catPow});
        log.push(`📁 ${cd.name}`);

        for(const ch of cd.chs){
          const cpows = [];
          if(ch.staff){
            cpows.push({id:everyone,deny:[PermissionFlagsBits.ViewChannel]});
            for(const r of modRoles)cpows.push({id:r.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});
          } else if(ch.readonly||ch.ticketEmbed||ch.welcomeEmbed||ch.gameEmbed){
            cpows.push({id:everyone,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]});
            for(const r of modRoles)cpows.push({id:r.id,allow:[PermissionFlagsBits.SendMessages]});
          } else if(ch.voice||ch.createPv){
            // vocal
          } else {
            cpows.push({id:everyone,allow:[PermissionFlagsBits.ViewChannel]});
          }
          cm[ch.name] = await guild.channels.create({
            name:ch.name,
            type:ch.voice?ChannelType.GuildVoice:ChannelType.GuildText,
            parent:cat.id,
            permissionOverwrites:cpows.length?cpows:undefined,
          });
          log.push(`  ✅ ${ch.name}`);
        }
      }

      db.prepare('INSERT OR REPLACE INTO automod_config (guild_id,block_links,anti_spam,anti_caps,anti_raid,max_warns_mute,max_warns_kick) VALUES (?,1,1,1,1,3,5)').run(guild.id);
      db.prepare('INSERT OR REPLACE INTO server_config (guild_id) VALUES (?)').run(guild.id);
      log.push('✅ AutoMod activé');

      // ── EMBED LIER-ROBLOX (vérification complète ici) ──
      const lierCh = cm['🔗┃lier-roblox'];
      if(lierCh){
        await lierCh.send({
          embeds:[new EmbedBuilder().setColor(C.primary)
            .setAuthor({name:`🔗 Lier ton compte Roblox — ${guild.name}`,iconURL:guild.iconURL()??undefined})
            .setDescription([
              '**Pour pouvoir trader, lie ton compte Roblox.**',
              '',
              '**📋 Étapes :**',
              '**1.** Clique sur **Lier mon compte** ci-dessous',
              '**2.** Entre ton pseudo Roblox dans le formulaire',
              '**3.** Colle le code généré dans ta **bio Roblox** → [Modifier](https://www.roblox.com/my/account#!/info)',
              '**4.** Reviens ici et clique **Vérifier ✅**',
              '',
              '> ✅ Vérification via l\'API Roblox officielle — sécurisé',
              '> 🗡️ Une fois vérifié, tu peux trader !',
            ].join('\n'))
            .setFooter({text:'Wenzy Bot v7.5  •  Vérification Roblox'})],
          components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success),
          )],
        });
        log.push('✅ Embed lier-roblox');
      }

      // ── EMBED POSTER-UN-TRADE ──
      const posterCh = cm['📬┃poster-un-trade'];
      if(posterCh){
        await posterCh.send({
          embeds:[new EmbedBuilder().setColor(C.primary)
            .setAuthor({name:'📬 Poster un Trade MM2'})
            .setDescription([
              'Clique sur le bouton pour créer un trade.',
              '',
              '**📋 Infos requises :**',
              '• Armes offertes _(séparées par virgules)_',
              '• Total Value de ton offre',
              '• Ce que tu cherches',
              '• Total Value recherchée _(optionnel)_',
              '',
              '> ⚠️ Compte Roblox vérifié obligatoire pour trader.',
              '> Le trade sera publié dans **#post-trades** automatiquement.',
            ].join('\n'))
            .setFooter({text:'Wenzy Bot v7.5  •  Trades MM2'})],
          components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_post_trade').setLabel('🗡️ Poster un Trade').setStyle(ButtonStyle.Success),
          )],
        });
        log.push('✅ Embed poster-un-trade');
      }

      // ── EMBED RÈGLEMENT ──
      const regleCh = cm['📋┃règlement'];
      if(regleCh){
        const cfg2 = getConfig(guild.id);
        await regleCh.send({
          embeds:[new EmbedBuilder().setColor(C.primary)
            .setAuthor({name:`📋 Règlement — ${guild.name}`,iconURL:guild.iconURL()??undefined})
            .setDescription(cfg2?.custom_rules_msg ?? [
              '**🚫 Règles générales**',
              '**1.** Respect de tous les membres',
              '**2.** Pas de spam, publicité ou NSFW',
              '**3.** Parle en français dans les salons FR',
              '',
              '**🗡️ Règles de trading MM2**',
              '**4.** Vérification Roblox obligatoire pour trader',
              '**5.** Screenshots obligatoires pour valider les trades',
              '**6.** Les scams sont bannis définitivement',
              '**7.** Utilise le middleman pour les gros trades',
              '',
              '**⚠️ Sanctions**',
              '• 3 warns → Mute 10 min',
              '• 5 warns → Kick',
              '• Scam confirmé → Ban permanent',
            ].join('\n'))
            .setFooter({text:'Wenzy Bot v7.5  •  Règlement'})],
        });
        log.push('✅ Embed règlement');
      }

      // ── EMBED TICKET ──
      const ticketCh = cm['🎫┃ticket'];
      if(ticketCh){
        await ticketCh.send({
          embeds:[new EmbedBuilder().setColor(C.info)
            .setAuthor({name:'🎫 Système de Tickets'})
            .setDescription([
              '**Ouvre un ticket en sélectionnant une catégorie ci-dessous.**',
              '',
              '🚨 **Report** — Signaler un arnaqueur ou un problème',
              '🎉 **Giveaway** — Question sur un giveaway',
              '💀 **Scam** — Signaler un scam avec preuves',
              '📋 **Candidature** — Rejoindre le staff',
              '',
              '> ⚠️ Tickets abusifs = warn automatique.',
            ].join('\n'))
            .setFooter({text:'Wenzy Bot v7.5  •  Tickets'})],
          components:[ticketSelectMenu(guild.id)],
        });
        log.push('✅ Embed ticket (select menu)');
      }

      // ── EMBED BIENVENUE ──
      const bienvenueCh = cm['🎉┃bienvenue'];
      if(bienvenueCh){
        await bienvenueCh.send({
          embeds:[new EmbedBuilder()
            .setColor(C.purple)
            .setAuthor({name:`✨ Bienvenue sur ${guild.name} !`,iconURL:guild.iconURL()??undefined})
            .setDescription([
              '> **Le serveur officiel de Wenzy — Murder Mystery 2 & plus.**',
              '',
              '```',
              '  ╔══════════════════════════════╗',
              `  ║   🎮  ${guild.name.padEnd(22)}  ║`,
              '  ╚══════════════════════════════╝',
              '```',
              '',
              '**📌 Pour commencer :**',
              '┣ 📋 Lis le **#règlement**',
              '┣ 🔗 Lie ton compte dans **#lier-roblox**',
              '┣ 🗡️ Poste ton premier trade dans **#poster-un-trade**',
              '┗ 🎉 Profite de la communauté !',
              '',
              '**🏆 Ce qui t\'attend :**',
              '┣ 🗡️ Trading MM2 sécurisé avec middleman',
              '┣ 🪙 Économie — gagne des pièces, dépense en boutique',
              '┣ ✨ Système XP & niveaux — monte dans les rangs',
              '┣ 🎉 Giveaways réguliers',
              '┗ 💬 Une communauté active',
              '',
              '> **Clique sur `✅ Vérifier` dans #lier-roblox pour débloquer l\'accès complet !**',
            ].join('\n'))
            .setImage(guild.bannerURL({size:1024})??undefined)
            .setThumbnail(guild.iconURL({size:256})??undefined)
            .addFields(
              {name:'👥 Membres',value:`**${guild.memberCount}**`,inline:true},
              {name:'🛡️ Sécurité',value:`**Roblox Vérifié**`,inline:true},
              {name:'🤝 Trades',value:`**+MM2 Protégé**`,inline:true},
            )
            .setFooter({text:`${guild.name} • Wenzy Bot v7.5`})
            .setTimestamp()],
        });
        log.push('✅ Embed bienvenue');
      }

      // ── EMBEDS JEUX (Côté Fun) ──
      const gameEmbeds = {
        mm2: {
          title:'🗡️ Murder Mystery 2',color:C.danger,
          description:[
            '**Le jeu phare du serveur !**',
            '',
            '> MM2 est un jeu Roblox d\'assassin et de détective.',
            '> Trouvez le meurtrier... ou devenez-le.',
            '',
            '**🎮 Rôles dans le jeu :**',
            '┣ 🔪 **Meurtrier** — Élimine tous les innocents',
            '┣ 🔍 **Shérif** — Trouve et élimine le meurtrier',
            '┗ 😇 **Innocent** — Survie jusqu\'à la fin',
            '',
            '**💎 Notre spécialité :** Trading d\'armes MM2 sécurisé !',
            '→ Rends-toi dans **🗡️ Côté Murder Mystery 2** pour trader.',
          ].join('\n'),
        },
        minecraft: {
          title:'🧱 Minecraft',color:0x5C8A32,
          description:[
            '**Le jeu de blocs légendaire !**',
            '',
            '> Construis, explore et survie dans un monde infini.',
            '',
            '**🎮 Modes populaires :**',
            '┣ 🏠 **Survie** — Récolte, craft, construis',
            '┣ 🎨 **Créatif** — Liberté totale de construction',
            '┣ ⚔️ **PvP/Faction** — Guerre entre joueurs',
            '┗ 🏃 **Parkour** — Défie-toi à l\'agilité',
            '',
            '> Partage tes builds et aventures ici !',
          ].join('\n'),
        },
        fortnite: {
          title:'🎮 Fortnite',color:0x1BBBDB,
          description:[
            '**Le Battle Royale d\'Epic Games !**',
            '',
            '> 100 joueurs, 1 seul gagnant. Construis et élimine.',
            '',
            '**🎮 Modes :**',
            '┣ 🏆 **Battle Royale** — Solo / Duo / Squad',
            '┣ 🏗️ **Zero Build** — Sans construction',
            '┣ 🎯 **Ranked** — Monte dans les rangs',
            '┗ 🎪 **Créatif** — Maps custom',
            '',
            '> Partage tes clutches et Victory Royales ici !',
          ].join('\n'),
        },
        valorant: {
          title:'🔫 Valorant',color:0xFF4655,
          description:[
            '**Le FPS tactique de Riot Games !**',
            '',
            '> 5v5, agents aux capacités uniques, précision avant tout.',
            '',
            '**🎮 Agents :**',
            '┣ 🗡️ **Duelist** — Frappe en premier',
            '┣ 🛡️ **Sentinel** — Contrôle la zone',
            '┣ 💊 **Support** — Soigne l\'équipe',
            '┗ 🕵️ **Controller** — Fume et contrôle',
            '',
            '> Partage tes clutches 1v5 et tes clips ici !',
          ].join('\n'),
        },
        football: {
          title:'⚽ Football',color:0x2ECC71,
          description:[
            '**Le sport le plus populaire au monde !**',
            '',
            '> Résultats, transferts, débats — tout est ici.',
            '',
            '**🏆 Compétitions suivies :**',
            '┣ 🇪🇺 **Champions League**',
            '┣ 🇫🇷 **Ligue 1**',
            '┣ 🏴󠁧󠁢󠁥󠁮󠁧󠁿 **Premier League**',
            '┣ 🇪🇸 **La Liga**',
            '┗ 🌍 **Équipes nationales**',
            '',
            '> Débats, pronostics et highlights bienvenus !',
          ].join('\n'),
        },
      };
      for(const [chName, chDef] of Object.entries(cm)){
        const chObj = guild.channels.cache.get(chDef.id??chDef);
        // Find game embed channels by name pattern
      }
      // Post game embeds to the right channels
      const gameChanMap = {
        '🗡️┃murder-mystery-2':'mm2',
        '🧱┃minecraft':'minecraft',
        '🎮┃fortnite':'fortnite',
        '🔫┃valorant':'valorant',
        '⚽┃football':'football',
      };
      for(const [cname, gameKey] of Object.entries(gameChanMap)){
        const gCh = cm[cname];
        const gData = gameEmbeds[gameKey];
        if(gCh&&gData){
          await gCh.send({
            embeds:[new EmbedBuilder()
              .setColor(gData.color)
              .setAuthor({name:gData.title})
              .setDescription(gData.description)
              .setFooter({text:`Wenzy Bot v7.5 • ${gData.title}`})
              .setTimestamp()],
          });
          log.push(`✅ Embed jeu ${gData.title}`);
        }
      }

      // ── EMBED CRÉER VOCAL ──
      const createVocalCh = cm['🏗️┃créer-un-vocal'];
      if(createVocalCh){
        await createVocalCh.send({
          embeds:[new EmbedBuilder().setColor(C.primary)
            .setAuthor({name:'🎙️ Vocaux Privés'})
            .setDescription([
              'Rejoins ce salon ou clique le bouton pour créer ton vocal privé.',
              '',
              '**Commandes :**',
              '`!open` — Ouvrir',
              '`!close` — Fermer',
              '`!add @user` — Inviter',
              '`!kick @user` — Expulser',
              '`!rename <nom>` — Renommer',
            ].join('\n'))
            .setFooter({text:'Wenzy Bot v7.5  •  Vocaux Privés'})],
          components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_create_vocal').setLabel('🎙️ Créer mon vocal').setStyle(ButtonStyle.Primary),
          )],
        });
        log.push('✅ Embed vocal privé');
      }

      // ── EMBED BOT-CMDS ──
      const botCmdsCh = cm['⌨️┃bot-cmds'];
      if(botCmdsCh){
        await botCmdsCh.send({
          embeds:[new EmbedBuilder().setColor(C.primary)
            .setAuthor({name:'⌨️ Commandes du Bot'})
            .setDescription([
              '**🗡️ MM2 Trading**',
              '`/trade post <offre> <cherche>` — Poster un trade',
              '`/trade cancel <id>` — Annuler son trade',
              '`/trade check <offre> <recois>` — Price check',
              '`/profil [@membre]` — Voir un profil',
              '`/inventory add/remove/view` — Gérer son inventaire',
              '`/price-alert <arme> <valeur>` — Alerte prix',
              '`/hotrades` — Top 5 trades en valeur',
              '',
              '**🪙 Économie**',
              '`/daily` — Bonus journalier',
              '`/work` — Travailler (cooldown 4h)',
              '`/coinflip <mise>` — Pile ou face',
              '`/duel @membre <mise>` — Défier quelqu\'un',
              '`/leaderboard [type]` — Classement',
              '`/level [@membre]` — Voir son niveau XP avec image',
              '',
              '**🔗 Vérification**',
              '`/link <pseudo>` — Lier son Roblox',
              '`/verify` — Confirmer la vérification',
              '',
              '**⚙️ Configuration (Staff)**',
              '`/panel` — Configurer tout le serveur',
              '`/automod` — Configurer l\'AutoMod',
              '`/say <msg> [salon] [titre] [couleur]` — Faire parler le bot',
              '`/warn @membre <raison>` — Avertir',
              '`/warns @membre` — Voir les warns',
              '`/clearwarns @membre` — Effacer',
              '`/addxp` / `/addcoins` — Modifier XP/pièces',
              '`/giveaway start/end/reroll/list`',
              '`/addserver <lien>` — Ajouter serveur MM2',
            ].join('\n'))
            .setFooter({text:'Wenzy Bot v7.5  •  Commandes'})],
        });
        log.push('✅ Embed bot-cmds');
      }

      // ── BOUTIQUE ──
      const boutiqueCh = cm['🛒┃boutique'];
      if(boutiqueCh){ await postShopEmbed(boutiqueCh); log.push('✅ Boutique'); }

      // ── GIVEAWAYS ──
      const giveawayCh = cm['🎉┃giveaways'];
      if(giveawayCh){
        await giveawayCh.send({
          embeds:[new EmbedBuilder().setColor(C.gold)
            .setAuthor({name:'🎉 Giveaways — Wenzy MM2'})
            .setDescription([
              'Les giveaways organisés par le staff apparaissent ici.',
              '',
              '**Comment participer ?**',
              '→ Clique sur **🎉 Participer** sur chaque giveaway',
            ].join('\n'))
            .setFooter({text:'Wenzy Bot v7.5  •  Giveaways'})],
        });
        log.push('✅ Embed giveaways');
      }

      // ── EMBED ANNONCES ──
      const announceCh = cm['📢┃annonces'];
      if(announceCh){
        await announceCh.send({
          embeds:[new EmbedBuilder().setColor(C.info)
            .setAuthor({name:`📢 Annonces — ${guild.name}`,iconURL:guild.iconURL()??undefined})
            .setDescription([
              '> Les annonces importantes du serveur apparaissent ici.',
              '',
              '**📋 Types d\'annonces :**',
              '┣ 🛠️ Mises à jour du serveur',
              '┣ 🎉 Événements et giveaways',
              '┣ 🗡️ Nouvelles règles MM2',
              '┗ 📢 Informations importantes',
              '',
              '> Active les notifications 🔔 pour ne rien manquer !',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed annonces');
      }

      // ── EMBED BOOSTS ──
      const boostsCh = cm['🚀┃boosts'];
      if(boostsCh){
        await boostsCh.send({
          embeds:[new EmbedBuilder().setColor(C.pink)
            .setAuthor({name:`🚀 Boosteurs — ${guild.name}`,iconURL:guild.iconURL()??undefined})
            .setDescription([
              '> **Merci à tous ceux qui boostent le serveur !** 💜',
              '',
              '**🎁 Avantages des boosteurs :**',
              '┣ 🏷️ Rôle **Boosteurs** exclusif',
              '┣ 🪙 **+500 pièces** offerts',
              '┣ ✨ **+200 XP** bonus',
              '┗ 💬 Accès à des salons spéciaux',
              '',
              '> Booste le serveur pour soutenir la communauté !',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed boosts');
      }

      // ── EMBED RÉSEAUX ──
      const reseauxCh = cm['🌐┃réseaux'];
      if(reseauxCh){
        await reseauxCh.send({
          embeds:[new EmbedBuilder().setColor(C.blurple)
            .setAuthor({name:`🌐 Réseaux — ${guild.name}`,iconURL:guild.iconURL()??undefined})
            .setDescription([
              '> **Retrouve Wenzy sur toutes les plateformes !**',
              '',
              '**📱 Liens officiels :**',
              '┣ ▶️ **YouTube** — Vidéos MM2 & Gaming',
              '┣ 🎵 **TikTok** — Clips & highlights',
              '┣ 📸 **Instagram** — Photos & stories',
              '┗ 🎮 **Roblox** — Profil officiel',
              '',
              '> Suis tous les réseaux pour soutenir Wenzy !',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed réseaux');
      }

      // ── EMBED PARTENARIAT ──
      const partCh = cm['🤝┃partenariat'];
      if(partCh){
        await partCh.send({
          embeds:[new EmbedBuilder().setColor(C.teal)
            .setAuthor({name:`🤝 Partenariats — ${guild.name}`,iconURL:guild.iconURL()??undefined})
            .setDescription([
              '> **Tu souhaites nouer un partenariat avec notre serveur ?**',
              '',
              '**📋 Conditions :**',
              '┣ ✅ Serveur actif avec **+100 membres**',
              '┣ ✅ Contenu en rapport avec MM2 / Gaming',
              '┣ ✅ Modération active et règlement clair',
              '┗ ✅ Pas de contenu NSFW ni toxique',
              '',
              '**📩 Pour postuler :**',
              '→ Ouvre un ticket dans **🎫┃ticket** catégorie **Candidature**',
              '→ Présente ton serveur + lien d\'invitation',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed partenariat');
      }

      // ── EMBED FAQ ──
      const faqCh = cm['❓┃faq'];
      if(faqCh){
        await faqCh.send({
          embeds:[new EmbedBuilder().setColor(C.warning)
            .setAuthor({name:`❓ FAQ — Foire Aux Questions`,iconURL:guild.iconURL()??undefined})
            .setDescription([
              '**Q : Comment je commence à trader ?**',
              '→ Lie ton compte Roblox dans **🔗┃lier-roblox**, puis poste dans **📬┃poster-un-trade**.',
              '',
              '**Q : C\'est quoi un Middleman ?**',
              '→ Un staff de confiance qui supervise les gros trades pour éviter les scams.',
              '',
              '**Q : J\'ai été scammé, que faire ?**',
              '→ Ouvre un ticket **💀 Scam** dans **🎫┃ticket** avec des preuves.',
              '',
              '**Q : Comment gagner des pièces ?**',
              '→ `/daily`, `/work`, trader, participer aux giveaways.',
              '',
              '**Q : C\'est quoi le système XP ?**',
              '→ Tu gagnes de l\'XP en chattant, en vocal et en tradant. Ça débloque des rôles.',
              '',
              '**Q : Comment rejoindre le staff ?**',
              '→ Ouvre un ticket **📋 Candidature** dans **🎫┃ticket**.',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed FAQ');
      }

      // ── EMBED 1VS1 ──
      const unVsUnCh = cm['⚔️┃1vs1'];
      if(unVsUnCh){
        await unVsUnCh.send({
          embeds:[new EmbedBuilder().setColor(C.danger)
            .setAuthor({name:'⚔️ 1vs1 MM2 — Défis'})
            .setDescription([
              '> **Lance un défi à n\'importe quel membre ici !**',
              '',
              '**🎮 Comment défier ?**',
              '→ `/duel @membre <mise>` pour un duel de pièces',
              '→ Poste ton défi en message avec ton profil',
              '',
              '**📋 Règles :**',
              '┣ ✅ Accord mutuel obligatoire',
              '┣ ✅ Screenshot du résultat dans **🏆┃vouches**',
              '┗ ❌ Pas de rage-quit, pas d\'excuses',
              '',
              '> Que le meilleur gagne ! 🏆',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed 1vs1');
      }

      // ── EMBED PRICE-CHECK ──
      const priceCh = cm['💰┃price-check'];
      if(priceCh){
        await priceCh.send({
          embeds:[new EmbedBuilder().setColor(C.gold)
            .setAuthor({name:'💰 Price Check — Valeurs MM2'})
            .setDescription([
              '> **Vérifie la valeur de n\'importe quelle arme MM2 ici.**',
              '',
              '**🔎 Comment vérifier ?**',
              '→ `/trade check <offre> <recois>` pour comparer deux offres',
              '→ Poste ton arme en message pour avis communauté',
              '',
              '**💡 Conseils :**',
              '┣ Les valeurs sont mises à jour automatiquement',
              '┣ Un trade équitable = différence de moins de 20 val',
              '┗ Toujours vérifier avant d\'accepter un trade !',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed price-check');
      }

      // ── EMBED CANDIDATURES ──
      const candidCh = cm['📋┃candidatures'];
      if(candidCh){
        await candidCh.send({
          embeds:[new EmbedBuilder().setColor(C.purple)
            .setAuthor({name:'📋 Candidatures Staff — Wenzy MM2',iconURL:guild.iconURL()??undefined})
            .setDescription([
              '> **Tu veux rejoindre l\'équipe staff ? Lis ça.**',
              '',
              '**✅ Prérequis :**',
              '┣ 📅 Être membre actif depuis **+2 semaines**',
              '┣ 🗡️ Au moins **10 trades** complétés',
              '┣ 🔇 Aucun warn actif',
              '┣ 🎙️ Disponible régulièrement',
              '┗ 🧠 Calme, mature et sérieux',
              '',
              '**📩 Postuler :**',
              '→ Ouvre un ticket **📋 Candidature** dans **🎫┃ticket**',
              '→ Présente-toi, ton expérience, tes disponibilités',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed candidatures');
      }

      // ── EMBED PLAYGROUND / JEUX ──
      const playgroundCh = cm['🎢┃playground'];
      if(playgroundCh){
        await playgroundCh.send({
          embeds:[new EmbedBuilder().setColor(C.teal)
            .setAuthor({name:'🎢 Playground — Zone Fun'})
            .setDescription([
              '> **Bienvenue dans la zone fun !** Amuse-toi sans prise de tête.',
              '',
              '**🎮 Ce que tu peux faire ici :**',
              '┣ 🪙 `/coinflip <mise>` — Pile ou face',
              '┣ ⚔️ `/duel @membre <mise>` — Défi',
              '┣ 🎁 Participer aux mini-jeux du bot',
              '┗ 💬 Discuter librement',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed playground');
      }

      const jeuxCh = cm['🎲┃jeux'];
      if(jeuxCh){
        await jeuxCh.send({
          embeds:[new EmbedBuilder().setColor(C.gold)
            .setAuthor({name:'🎲 Jeux & Économie'})
            .setDescription([
              '> **Dépense tes pièces, tente ta chance !**',
              '',
              '**🎮 Commandes :**',
              '┣ 🪙 `/coinflip <mise>` — Mise entre 10 et 1000 pièces',
              '┣ ⚔️ `/duel @membre <mise>` — Duel direct',
              '┣ 🛒 `/shop` — Dépenser ses pièces en boutique',
              '┣ 📊 `/leaderboard coins` — Classement richesse',
              '┗ 💰 `/daily` / `/work` — Gagner des pièces',
              '',
              '> Bonne chance ! 🍀',
            ].join('\n'))
            .setFooter({text:`${guild.name} • Wenzy Bot v8.0`})
            .setTimestamp()],
        });
        log.push('✅ Embed jeux');
      }

      await updateLeaderboards(guild);
      await updateStatChannels(guild);
      log.push('✅ Stats et leaderboards initialisés');

      await interaction.editReply({
        embeds:[new EmbedBuilder().setColor(C.success)
          .setAuthor({name:'🏗️ Setup Wenzy v7.5 terminé !'})
          .setDescription(log.map(l=>`\`${l}\``).join('\n').slice(0,3900))
          .addFields({name:'📋 Prochaines étapes',value:[
            '**1.** Donne-toi le rôle **Owners** dans la liste des rôles',
            '**2.** `/panel` → configure tickets, XP roles, YouTube, annonces...',
            '**3.** `/panel xp-roles` → configure quel rôle donner à quel seuil XP',
            '**4.** `/panel status-role` → rôle pour .gg/wenzy dans le status',
            '**5.** `/addserver <lien>` pour les serveurs privés MM2',
            '**6.** AutoMod activé par défaut — liens bloqués, anti-spam, anti-raid',
          ].join('\n')})
          .setTimestamp()],
      });
    }
  },

  // /panel
  {
    data: new SlashCommandBuilder().setName('panel').setDescription('⚙️ Panneau de configuration complet du serveur')
      .addSubcommand(s=>s.setName('overview').setDescription('📊 Vue d\'ensemble de la configuration'))
      .addSubcommand(s=>s.setName('channels').setDescription('📢 Configurer les salons clés')
        .addStringOption(o=>o.setName('type').setDescription('Type de salon').setRequired(true)
          .addChoices(
            {name:'📋 Logs',value:'logs'},
            {name:'👋 Bienvenue',value:'welcome'},
            {name:'🗡️ Trades MM2',value:'trades'},
            {name:'🎫 Tickets',value:'ticket'},
            {name:'📢 Annonces',value:'announcement'},
            {name:'▶️ YouTube notifs',value:'youtube'},
            {name:'🎵 TikTok notifs',value:'tiktok'},
            {name:'⭐ Level up',value:'level'},
            {name:'🎉 Giveaways',value:'giveaway'},
          ))
        .addChannelOption(o=>o.setName('salon').setDescription('Salon à assigner').setRequired(true)))
      .addSubcommand(s=>s.setName('features').setDescription('🔧 Activer/désactiver des fonctionnalités')
        .addStringOption(o=>o.setName('feature').setDescription('Fonctionnalité').setRequired(true)
          .addChoices(
            {name:'✨ Système XP',value:'xp_enabled'},
            {name:'🪙 Système Économie',value:'coins_enabled'},
            {name:'👋 Messages de bienvenue',value:'welcome_enabled'},
            {name:'🎫 Système de tickets',value:'ticket_enabled'},
            {name:'🗡️ Trades MM2',value:'mm2_enabled'},
            {name:'🛡️ AutoMod',value:'automod_enabled'},
            {name:'▶️ Notifications YouTube',value:'youtube_notif_enabled'},
            {name:'🎵 Notifications TikTok',value:'tiktok_notif_enabled'},
          ))
        .addBooleanOption(o=>o.setName('actif').setDescription('Activer ou désactiver').setRequired(true)))
      .addSubcommand(s=>s.setName('welcome-msg').setDescription('👋 Personnaliser le message de bienvenue')
        .addStringOption(o=>o.setName('message').setDescription('Message').setRequired(true)))
      .addSubcommand(s=>s.setName('rules').setDescription('📋 Personnaliser le règlement')
        .addStringOption(o=>o.setName('texte').setDescription('Texte du règlement').setRequired(true)))
      .addSubcommand(s=>s.setName('youtube').setDescription('▶️ Configurer les notifications YouTube')
        .addStringOption(o=>o.setName('channel-id').setDescription('ID de la chaîne YouTube').setRequired(true))
        .addStringOption(o=>o.setName('api-key').setDescription('Clé API YouTube').setRequired(false)))
      .addSubcommand(s=>s.setName('automod').setDescription('🛡️ Configurer l\'AutoMod')
        .addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true)
          .addChoices(
            {name:'📊 Voir statut',value:'status'},
            {name:'🔗 Toggle liens',value:'links'},
            {name:'📨 Toggle spam',value:'spam'},
            {name:'🔠 Toggle caps',value:'caps'},
            {name:'🚨 Toggle anti-raid',value:'raid'},
            {name:'➕ Ajouter mot banni',value:'addword'},
            {name:'➖ Retirer mot banni',value:'removeword'},
          ))
        .addBooleanOption(o=>o.setName('actif').setDescription('Activer/désactiver').setRequired(false))
        .addStringOption(o=>o.setName('mot').setDescription('Mot banni (pour addword/removeword)').setRequired(false)))
      .addSubcommand(s=>s.setName('xp-roles').setDescription('✨ Configurer les rôles XP automatiques')
        .addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true)
          .addChoices(
            {name:'➕ Ajouter un rôle XP',value:'add'},
            {name:'➖ Retirer un rôle XP',value:'remove'},
            {name:'📋 Voir la liste',value:'list'},
          ))
        .addIntegerOption(o=>o.setName('seuil').setDescription('Seuil XP (ex: 1000)').setRequired(false))
        .addRoleOption(o=>o.setName('role').setDescription('Rôle à donner').setRequired(false)))
      .addSubcommand(s=>s.setName('status-role').setDescription('🔗 Rôle pour le status .gg/wenzy')
        .addRoleOption(o=>o.setName('role').setDescription('Rôle à donner si status contient .gg/wenzy').setRequired(true)))
      .addSubcommand(s=>s.setName('ticket-category').setDescription('🎫 Gérer les catégories de tickets')
        .addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true)
          .addChoices(
            {name:'➕ Ajouter une catégorie',value:'add'},
            {name:'➖ Retirer une catégorie',value:'remove'},
            {name:'📋 Voir les catégories',value:'list'},
          ))
        .addStringOption(o=>o.setName('nom').setDescription('Nom de la catégorie').setRequired(false)))
      .addSubcommand(s=>s.setName('roles').setDescription('🏷️ Synchroniser les rôles des membres vérifiés'))
      .addSubcommand(s=>s.setName('stats').setDescription('📊 Statistiques du serveur'))
      .addSubcommand(s=>s.setName('stats-setup').setDescription('📊 Créer/réparer les salons vocaux STATISTIQUES'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const sub = interaction.options.getSubcommand();
      const gid = interaction.guild.id;
      db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(gid);
      const cfg = getConfig(gid);

      if (sub === 'overview') {
        const amc = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(gid);
        const xpRoles = getXpRoles(gid);
        const ticketCats = getTicketCategories(gid);
        return interaction.editReply({ embeds:[new EmbedBuilder().setColor(C.primary)
          .setAuthor({name:'⚙️ Panneau de Configuration — Wenzy Bot v7.5'})
          .addFields(
            {name:'📢 Salons configurés',value:[
              `Logs : ${cfg.logs_channel?`<#${cfg.logs_channel}>`:'❌'}`,
              `Bienvenue : ${cfg.welcome_channel?`<#${cfg.welcome_channel}>`:'❌'}`,
              `Trades : ${cfg.trades_channel?`<#${cfg.trades_channel}>`:'❌'}`,
              `YouTube : ${cfg.youtube_channel?`<#${cfg.youtube_channel}>`:'❌'}`,
              `Level up : ${cfg.level_channel?`<#${cfg.level_channel}>`:'❌'}`,
              `Giveaways : ${cfg.giveaway_channel?`<#${cfg.giveaway_channel}>`:'❌'}`,
            ].join('\n'),inline:false},
            {name:'🔧 Fonctionnalités',value:[
              `${cfg.xp_enabled?'✅':'❌'} Système XP`,
              `${cfg.coins_enabled?'✅':'❌'} Économie`,
              `${cfg.welcome_enabled?'✅':'❌'} Bienvenue`,
              `${cfg.automod_enabled?'✅':'❌'} AutoMod`,
              `${cfg.youtube_notif_enabled?'✅':'❌'} YouTube`,
            ].join('\n'),inline:true},
            {name:'🛡️ AutoMod',value:amc?[
              `${amc.block_links?'✅':'❌'} Blocage liens`,
              `${amc.anti_spam?'✅':'❌'} Anti-spam`,
              `${amc.anti_caps?'✅':'❌'} Anti-caps`,
              `${amc.anti_raid?'✅':'❌'} Anti-raid`,
            ].join('\n'):'Non configuré',inline:true},
            {name:'✨ XP Roles',value:xpRoles.length?xpRoles.map(r=>`\`${r.xp_threshold} XP\` → <@&${r.role_id}>`).join('\n'):'Aucun configuré',inline:false},
            {name:'🎫 Catégories tickets',value:ticketCats.map(c=>`${ticketCategoryEmoji(c)} ${c}`).join(' · '),inline:false},
            {name:'🔗 Status role',value:cfg.status_role?`<@&${cfg.status_role}>`:'Non configuré',inline:true},
          ).setTimestamp()] });
      }

      if (sub === 'channels') {
        const type = interaction.options.getString('type');
        const salon = interaction.options.getChannel('salon');
        const colMap = {logs:'logs_channel',welcome:'welcome_channel',trades:'trades_channel',ticket:'ticket_channel',announcement:'announcement_channel',youtube:'youtube_channel',tiktok:'tiktok_channel',level:'level_channel',giveaway:'giveaway_channel'};
        const col = colMap[type];
        if (!col) return interaction.editReply('❌ Type invalide.');
        db.prepare(`UPDATE server_config SET ${col}=? WHERE guild_id=?`).run(salon.id,gid);
        return interaction.editReply(`✅ Salon **${type}** → <#${salon.id}>`);
      }

      if (sub === 'features') {
        const feature = interaction.options.getString('feature');
        const actif = interaction.options.getBoolean('actif');
        db.prepare(`UPDATE server_config SET ${feature}=? WHERE guild_id=?`).run(actif?1:0,gid);
        return interaction.editReply(`${actif?'✅':'❌'} **${feature}** ${actif?'activé':'désactivé'}.`);
      }

      if (sub === 'welcome-msg') {
        const msg = interaction.options.getString('message');
        db.prepare('UPDATE server_config SET custom_welcome_msg=? WHERE guild_id=?').run(msg,gid);
        return interaction.editReply('✅ Message de bienvenue mis à jour !');
      }

      if (sub === 'rules') {
        const texte = interaction.options.getString('texte');
        db.prepare('UPDATE server_config SET custom_rules_msg=? WHERE guild_id=?').run(texte,gid);
        const regleCh = interaction.guild.channels.cache.find(c=>c.name.includes('règlement'));
        if(regleCh){
          const msgs = await regleCh.messages.fetch({limit:5});
          for(const m of msgs.values()) if(m.author.bot) await m.delete().catch(()=>{});
          await regleCh.send({embeds:[new EmbedBuilder().setColor(C.primary).setAuthor({name:`📋 Règlement — ${interaction.guild.name}`}).setDescription(texte).setTimestamp()]});
        }
        return interaction.editReply('✅ Règlement mis à jour !');
      }

      if (sub === 'youtube') {
        const channelId = interaction.options.getString('channel-id');
        const apiKey = interaction.options.getString('api-key');
        if(apiKey) process.env.YOUTUBE_API_KEY = apiKey;
        process.env.YOUTUBE_CHANNEL_ID = channelId;
        db.prepare('UPDATE server_config SET youtube_notif_enabled=1 WHERE guild_id=?').run(gid);
        return interaction.editReply(`✅ YouTube configuré ! Channel ID : \`${channelId}\``);
      }

      if (sub === 'automod') {
        db.prepare('INSERT OR IGNORE INTO automod_config (guild_id) VALUES (?)').run(gid);
        const amc = db.prepare('SELECT * FROM automod_config WHERE guild_id=?').get(gid);
        const action = interaction.options.getString('action');
        const actif = interaction.options.getBoolean('actif');
        const mot = interaction.options.getString('mot');

        if(action==='status'){
          const words=JSON.parse(amc.banned_words||'[]');
          return interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info)
            .setAuthor({name:'🛡️ Config AutoMod'})
            .addFields(
              {name:'🔗 Liens',value:amc.block_links?'✅':'❌',inline:true},
              {name:'📨 Spam',value:amc.anti_spam?'✅':'❌',inline:true},
              {name:'🔠 Caps',value:amc.anti_caps?'✅':'❌',inline:true},
              {name:'🚨 Anti-raid',value:amc.anti_raid?'✅':'❌',inline:true},
              {name:'🚫 Mots bannis',value:words.length?words.map(w=>`\`${w}\``).join(', '):'Aucun',inline:false},
            ).setTimestamp()]});
        }
        if(action==='addword'){
          if(!mot)return interaction.editReply('❌ Fournis le mot avec l\'option `mot`.');
          const words=JSON.parse(amc.banned_words||'[]');
          if(!words.includes(mot.toLowerCase()))words.push(mot.toLowerCase());
          db.prepare('UPDATE automod_config SET banned_words=? WHERE guild_id=?').run(JSON.stringify(words),gid);
          return interaction.editReply(`✅ Mot \`${mot}\` ajouté.`);
        }
        if(action==='removeword'){
          if(!mot)return interaction.editReply('❌ Fournis le mot avec l\'option `mot`.');
          const words=JSON.parse(amc.banned_words||'[]').filter(w=>w!==mot.toLowerCase());
          db.prepare('UPDATE automod_config SET banned_words=? WHERE guild_id=?').run(JSON.stringify(words),gid);
          return interaction.editReply(`✅ Mot \`${mot}\` retiré.`);
        }
        const colMap={links:'block_links',spam:'anti_spam',caps:'anti_caps',raid:'anti_raid'};
        const col=colMap[action];
        if(col&&actif!==null){db.prepare(`UPDATE automod_config SET ${col}=? WHERE guild_id=?`).run(actif?1:0,gid);return interaction.editReply(`✅ ${action} : **${actif?'activé':'désactivé'}**`);}
        return interaction.editReply('❌ Paramètres insuffisants.');
      }

      if (sub === 'xp-roles') {
        const action = interaction.options.getString('action');
        const seuil = interaction.options.getInteger('seuil');
        const role = interaction.options.getRole('role');
        const xpRoles = getXpRoles(gid);

        if(action==='list'){
          return interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info)
            .setAuthor({name:'✨ XP Roles configurés'})
            .setDescription(xpRoles.length?xpRoles.sort((a,b)=>a.xp_threshold-b.xp_threshold).map(r=>`\`${r.xp_threshold} XP\` → <@&${r.role_id}>`).join('\n'):'Aucun XP role configuré.\nUtilise `/panel xp-roles action:Ajouter`')
            .setFooter({text:'Ces rôles sont donnés automatiquement quand un membre atteint le seuil XP'})
            .setTimestamp()]});
        }
        if(action==='add'){
          if(!seuil||!role)return interaction.editReply('❌ Fournis `seuil` et `role`.');
          const existing=xpRoles.find(r=>r.role_id===role.id);
          if(existing){existing.xp_threshold=seuil;}
          else{xpRoles.push({xp_threshold:seuil,role_id:role.id});}
          db.prepare('UPDATE server_config SET xp_roles=? WHERE guild_id=?').run(JSON.stringify(xpRoles),gid);
          return interaction.editReply(`✅ XP role ajouté : **${seuil} XP** → <@&${role.id}>`);
        }
        if(action==='remove'){
          if(!role)return interaction.editReply('❌ Fournis `role`.');
          const filtered=xpRoles.filter(r=>r.role_id!==role.id);
          db.prepare('UPDATE server_config SET xp_roles=? WHERE guild_id=?').run(JSON.stringify(filtered),gid);
          return interaction.editReply(`✅ XP role <@&${role.id}> retiré.`);
        }
      }

      if (sub === 'status-role') {
        const role = interaction.options.getRole('role');
        db.prepare('UPDATE server_config SET status_role=? WHERE guild_id=?').run(role.id,gid);
        return interaction.editReply(`✅ Rôle status configuré : <@&${role.id}>\nLes membres avec \`.gg/wenzy\` dans leur status le recevront automatiquement.`);
      }

      if (sub === 'ticket-category') {
        const action = interaction.options.getString('action');
        const nom = interaction.options.getString('nom');
        const cats = getTicketCategories(gid);

        if(action==='list'){
          return interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info)
            .setAuthor({name:'🎫 Catégories de tickets'})
            .setDescription(cats.map(c=>`${ticketCategoryEmoji(c)} **${c}**`).join('\n'))
            .setTimestamp()]});
        }
        if(action==='add'){
          if(!nom)return interaction.editReply('❌ Fournis le `nom` de la catégorie.');
          if(cats.includes(nom))return interaction.editReply('⚠️ Cette catégorie existe déjà.');
          if(cats.length>=25)return interaction.editReply('❌ Maximum 25 catégories (limite Discord select menu).');
          cats.push(nom);
          db.prepare('UPDATE server_config SET ticket_categories=? WHERE guild_id=?').run(JSON.stringify(cats),gid);
          // Mettre à jour le salon ticket si il existe
          const ticketCh=interaction.guild.channels.cache.find(c=>c.name.includes('ticket')&&!c.name.includes('staff'));
          if(ticketCh){
            const msgs=await ticketCh.messages.fetch({limit:5}).catch(()=>null);
            if(msgs){
              const botMsg=msgs.find(m=>m.author.bot&&m.components.length>0);
              if(botMsg)await botMsg.edit({components:[ticketSelectMenu(gid)]}).catch(()=>{});
            }
          }
          return interaction.editReply(`✅ Catégorie **${nom}** ajoutée !`);
        }
        if(action==='remove'){
          if(!nom)return interaction.editReply('❌ Fournis le `nom` de la catégorie.');
          const filtered=cats.filter(c=>c.toLowerCase()!==nom.toLowerCase());
          if(filtered.length===cats.length)return interaction.editReply('❌ Catégorie introuvable.');
          db.prepare('UPDATE server_config SET ticket_categories=? WHERE guild_id=?').run(JSON.stringify(filtered),gid);
          return interaction.editReply(`✅ Catégorie **${nom}** retirée.`);
        }
      }

      if (sub === 'roles') {
        await restoreAllRoles(interaction.guild);
        return interaction.editReply('✅ Rôles synchronisés !');
      }

      if (sub === 'stats-setup') {
        const guild = interaction.guild;
        const totalMembers = guild.memberCount;
        const verifiedCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get()?.c ?? 0;
        const tradesCount = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed')?.c ?? 0;
        const totalCoins = db.prepare('SELECT COALESCE(SUM(coins),0) as c FROM users').get()?.c ?? 0;

        const statsDef = [
          { find: 'arrivés',  name: `🛬 Arrivés: ${totalMembers}` },
          { find: 'départs',  name: `🛫 Départs: 0` },
          { find: 'vérifiés', name: `✅ Vérifiés: ${verifiedCount}` },
          { find: 'trades',   name: `🗡️ Trades: ${tradesCount}` },
          { find: 'coins',    name: `🪙 Coins: ${totalCoins.toLocaleString('fr-FR')}` },
        ];

        // Trouver la catégorie STATISTIQUES existante ou en créer une
        let statCat = guild.channels.cache.find(c =>
          c.type === ChannelType.GuildCategory && c.name.toUpperCase().includes('STATISTIQUES')
        );
        if (!statCat) {
          statCat = await guild.channels.create({
            name: '📊 STATISTIQUES',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] }],
          }).catch(() => null);
        }

        let created = 0, updated = 0;
        for (const s of statsDef) {
          const existing = guild.channels.cache.find(c =>
            c.name.toLowerCase().includes(s.find.toLowerCase()) && c.type === ChannelType.GuildVoice
          );
          if (existing) {
            await existing.setName(s.name).catch(() => {});
            updated++;
          } else {
            await guild.channels.create({
              name: s.name,
              type: ChannelType.GuildVoice,
              parent: statCat?.id,
              permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }],
            }).catch(() => {});
            created++;
          }
        }
        return interaction.editReply(`✅ Stats-channels prêts !\n🆕 Créés : **${created}** | 🔄 Mis à jour : **${updated}**\nIls se rafraîchissent automatiquement toutes les 10 min.`);
      }

      if (sub === 'stats') {
        const totalMembers = interaction.guild.memberCount;
        const verified = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified=1').get()?.c??0;
        const tradesCount = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('completed')?.c??0;
        const openTrades = db.prepare('SELECT COUNT(*) as c FROM trades WHERE status=?').get('open')?.c??0;
        const totalCoins = db.prepare('SELECT SUM(coins) as s FROM users').get()?.s??0;
        const totalXp = db.prepare('SELECT SUM(xp) as s FROM users').get()?.s??0;
        const totalUsersWithCoins = db.prepare('SELECT COUNT(*) as c FROM users WHERE coins>0').get()?.c??0;
        const avgCoins = totalUsersWithCoins>0 ? Math.round(totalCoins/totalUsersWithCoins) : 0;
        const richestUser = db.prepare('SELECT discord_id,coins FROM users ORDER BY coins DESC LIMIT 1').get();
        return interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info)
          .setAuthor({name:'📊 Statistiques du Serveur'})
          .addFields(
            {name:'👥 Membres',value:`${totalMembers}`,inline:true},
            {name:'✅ Vérifiés',value:`${verified}`,inline:true},
            {name:'🗡️ Trades complétés',value:`${tradesCount}`,inline:true},
            {name:'📤 Trades ouverts',value:`${openTrades}`,inline:true},
            {name:'🪙 Pièces en circulation',value:`**${totalCoins.toLocaleString('fr-FR')} 🪙**\n_moy. ${avgCoins.toLocaleString('fr-FR')} / joueur_`,inline:true},
            {name:'✨ XP total',value:`${totalXp.toLocaleString('fr-FR')}`,inline:true},
            {name:'🏆 Joueur le + riche',value:richestUser?`<@${richestUser.discord_id}> — **${richestUser.coins.toLocaleString('fr-FR')} 🪙**`:'—',inline:false},
          ).setTimestamp()]});
      }
    }
  },

  // /say
  {
    data: new SlashCommandBuilder().setName('say').setDescription('📢 (Staff) Faire parler le bot dans un salon')
      .addStringOption(o=>o.setName('message').setDescription('Message à envoyer').setRequired(true))
      .addChannelOption(o=>o.setName('salon').setDescription('Salon cible (défaut: salon actuel)').setRequired(false))
      .addStringOption(o=>o.setName('titre').setDescription('Titre de l\'embed (optionnel)').setRequired(false))
      .addStringOption(o=>o.setName('couleur').setDescription('Couleur hex ex: #5865F2').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral:true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const msg = interaction.options.getString('message');
      const targetCh = interaction.options.getChannel('salon') ?? interaction.channel;
      const titre = interaction.options.getString('titre');
      const couleurInput = interaction.options.getString('couleur');
      let color = C.primary;
      if(couleurInput){ const m=couleurInput.match(/#?([0-9a-fA-F]{6})/); if(m) color=parseInt(m[1],16); }

      if (titre) {
        await targetCh.send({
          embeds:[new EmbedBuilder().setColor(color).setAuthor({name:titre}).setDescription(msg).setTimestamp()],
        });
      } else {
        await targetCh.send(msg);
      }
      await sendLog(interaction.guild, new EmbedBuilder().setColor(C.info)
        .setAuthor({name:'📢 /say utilisé'})
        .addFields({name:'👤 Staff',value:`<@${interaction.user.id}>`,inline:true},{name:'📍 Salon',value:`<#${targetCh.id}>`,inline:true},{name:'💬 Message',value:msg.slice(0,500),inline:false})
        .setTimestamp());
      return interaction.editReply(`✅ Message envoyé dans <#${targetCh.id}> !`);
    }
  },

  // /level
  {
    data: new SlashCommandBuilder().setName('level').setDescription('⭐ Voir ton niveau XP et ta progression')
      .addUserOption(o=>o.setName('membre').setDescription('Membre à consulter').setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const target = interaction.options.getUser('membre') ?? interaction.user;
      const did = target.id;
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const userData = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const xp = userData?.xp ?? 0;
      const currentTier = getXpTier(xp);
      const nextTier = getNextXpTier(xp);
      const bar = xpProgressBar(xp, 20);
      const pct = nextTier ? Math.round((xp-currentTier.xp)/(nextTier.xp-currentTier.xp)*100) : 100;

      // Canvas image — carte de stats complète
      let files = [];
      let imgBuffer = null;
      try {
        imgBuffer = await buildProfileImage(target, userData);
        if (imgBuffer) files = [{ attachment: imgBuffer, name: 'level.png' }];
      } catch {}

      // Embed : image canvas en grand si dispo, sinon fallback texte
      const embed = new EmbedBuilder()
        .setColor(currentTier.color)
        .setAuthor({ name: `${currentTier.emoji} Niveau — ${target.username}`, iconURL: target.displayAvatarURL() })
        .setFooter({ text: 'Wenzy Bot v8.0 • Système XP' })
        .setTimestamp();

      if (imgBuffer) {
        // L'image canvas porte toute l'info — embed minimaliste
        embed.setImage('attachment://level.png');
      } else {
        // Fallback texte si canvas absent
        embed
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: `${currentTier.emoji} Niveau`, value: `**${currentTier.name}**`, inline: true },
            { name: '✨ XP', value: `**${xp.toLocaleString('fr-FR')}**`, inline: true },
            { name: '🔥 Streak', value: `**${userData?.daily_streak ?? 0}j**`, inline: true },
            { name: '📊 Progression', value: `\`[${bar}] ${pct}%\`\n${nextTier ? `→ **${nextTier.name}** à ${nextTier.xp} XP` : '🏆 MAX'}`, inline: false },
            { name: '🗡️ Trades', value: `**${userData?.trade_count ?? 0}**`, inline: true },
            { name: '💬 Vouches', value: `**${userData?.vouch_count ?? 0}**`, inline: true },
            { name: '🪙 Pièces', value: `**${(userData?.coins ?? 0).toLocaleString('fr-FR')}**`, inline: true },
          );
      }

      await interaction.editReply({ embeds: [embed], files });
    }
  },

  // /automod (commande standalone comme v6)
  {
    data: new SlashCommandBuilder().setName('automod').setDescription('🛡️ (Admin) Configurer l\'AutoMod')
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
            { name: '🚫 Mots bannis', value: words.length ? words.map(w=>`\`${w}\``).join(', ') : 'Aucun', inline: false },
            { name: '✅ Salons whitelist liens', value: wl.length ? wl.map(id=>`<#${id}>`).join(', ') : 'Aucun', inline: false },
          ).setTimestamp()] });
      }
      if (sub === 'links') { db.prepare('UPDATE automod_config SET block_links=? WHERE guild_id=?').run(interaction.options.getBoolean('actif')?1:0,gid); return interaction.editReply(`✅ Blocage liens : **${interaction.options.getBoolean('actif')?'activé':'désactivé'}**`); }
      if (sub === 'spam') { db.prepare('UPDATE automod_config SET anti_spam=? WHERE guild_id=?').run(interaction.options.getBoolean('actif')?1:0,gid); return interaction.editReply(`✅ Anti-spam : **${interaction.options.getBoolean('actif')?'activé':'désactivé'}**`); }
      if (sub === 'caps') { db.prepare('UPDATE automod_config SET anti_caps=? WHERE guild_id=?').run(interaction.options.getBoolean('actif')?1:0,gid); return interaction.editReply(`✅ Anti-caps : **${interaction.options.getBoolean('actif')?'activé':'désactivé'}**`); }
      if (sub === 'raid') { db.prepare('UPDATE automod_config SET anti_raid=? WHERE guild_id=?').run(interaction.options.getBoolean('actif')?1:0,gid); return interaction.editReply(`✅ Anti-raid : **${interaction.options.getBoolean('actif')?'activé':'désactivé'}**`); }
      if (sub === 'addword') {
        const mot = interaction.options.getString('mot').toLowerCase();
        const words = JSON.parse(cfg.banned_words || '[]');
        if (!words.includes(mot)) words.push(mot);
        db.prepare('UPDATE automod_config SET banned_words=? WHERE guild_id=?').run(JSON.stringify(words), gid);
        return interaction.editReply(`✅ Mot \`${mot}\` ajouté.`);
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

  // /link
  {
    data: new SlashCommandBuilder().setName('link').setDescription('🔗 Lie ton compte Roblox').addStringOption(o=>o.setName('username').setDescription('Ton pseudo Roblox exact').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral:true });
      const username = interaction.options.getString('username'), did = interaction.user.id;
      let rb;
      try { rb = await searchRobloxUser(username); }
      catch { return interaction.editReply('❌ API Roblox indisponible. Réessaie.'); }
      if (!rb) return interaction.editReply(`❌ Pseudo **${username}** introuvable.`);
      const code = genCode();
      const ex = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      if(ex) db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id),rb.name,code,did);
      else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did,String(rb.id),rb.name,code);
      await interaction.editReply({
        embeds:[new EmbedBuilder().setColor(C.info)
          .setAuthor({name:'🔗 Vérification — Étape 1/2'})
          .setDescription([`Compte trouvé : **${rb.name}**`,'','**Code à coller dans ta bio Roblox :**',`\`\`\`${code}\`\`\``,'→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)','','Reviens et clique Vérifier.'].join('\n'))
          .setFooter({text:'Code valable 15 min'})],
        components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))],
      });
    }
  },

  // /verify
  {
    data: new SlashCommandBuilder().setName('verify').setDescription('✅ Confirme la vérification Roblox'),
    async execute(interaction) { await interaction.deferReply({ ephemeral:true }); await doVerify(interaction); }
  },

  // /trade
  {
    data: new SlashCommandBuilder().setName('trade').setDescription('🗡️ Système de trades MM2')
      .addSubcommand(s=>s.setName('post').setDescription('📤 Poster un trade').addStringOption(o=>o.setName('offre').setDescription('Armes offertes (virgules)').setRequired(true)).addStringOption(o=>o.setName('cherche').setDescription('Ce que tu cherches').setRequired(true)).addIntegerOption(o=>o.setName('offre-val').setDescription('Total value offre').setRequired(false)).addIntegerOption(o=>o.setName('cherche-val').setDescription('Total value recherche').setRequired(false)))
      .addSubcommand(s=>s.setName('cancel').setDescription('❌ Annuler ton trade').addIntegerOption(o=>o.setName('id').setDescription('ID du trade').setRequired(true)))
      .addSubcommand(s=>s.setName('check').setDescription('⚖️ Price check').addStringOption(o=>o.setName('offre').setDescription('Armes offertes').setRequired(true)).addStringOption(o=>o.setName('recois').setDescription('Armes reçues').setRequired(true))),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand(), did = interaction.user.id;
      if (sub === 'post') {
        await interaction.deferReply({ ephemeral:true });
        await postTrade(interaction,did,interaction.options.getString('offre'),interaction.options.getString('cherche'),interaction.options.getInteger('offre-val')??0,interaction.options.getInteger('cherche-val')??0);
      } else if (sub === 'cancel') {
        await interaction.deferReply({ ephemeral:true });
        await cancelTrade(interaction,did,interaction.options.getInteger('id'));
      } else if (sub === 'check') {
        await interaction.deferReply({ ephemeral:true });
        const { total:ov, details:od } = calcValue(parseWeapons(interaction.options.getString('offre')));
        const { total:rv, details:rd } = calcValue(parseWeapons(interaction.options.getString('recois')));
        const diff = ov-rv, fair = Math.abs(diff)<=20;
        const pct = ov>0?Math.min(100,Math.round((1-Math.abs(diff)/Math.max(ov,rv||1))*100)):100;
        const bar = `${'█'.repeat(Math.round(pct/10))}${'░'.repeat(10-Math.round(pct/10))} ${pct}%`;
        await interaction.editReply({embeds:[new EmbedBuilder().setColor(fair?C.success:(diff>0?C.danger:C.gold))
          .setAuthor({name:'⚖️ Price Check MM2'})
          .addFields(
            {name:'📤 Tu offres',value:od.map(w=>`${tierBadge(w.tier)} **${w.name}** → \`${w.value} val\``).join('\n')+`\n\n**TOTAL : ${ov} val**`,inline:true},
            {name:'📥 Tu reçois',value:rd.map(w=>`${tierBadge(w.tier)} **${w.name}** → \`${w.value} val\``).join('\n')+`\n\n**TOTAL : ${rv} val**`,inline:true},
            {name:'⚖️ Résultat',value:`${fair?'✅ **Fair**':diff>0?'📉 **Unfair**':'📈 **Avantageux**'}\nDiff : **${Math.abs(diff)} val**\n\`[${bar}]\``,inline:false},
          ).setTimestamp()]});
      }
    }
  },

  // /profil
  {
    data: new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche un profil').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const target = interaction.options.getUser('membre')??interaction.user;
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
      if (!user) return interaction.editReply(`❌ <@${target.id}> n'a pas encore de profil.`);
      const inv = db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(target.id);
      await interaction.editReply({embeds:[profileEmbed(user,inv,target)]});
    }
  },

  // /daily
  {
    data: new SlashCommandBuilder().setName('daily').setDescription('📅 Réclame ton bonus journalier'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral:true });
      const did = interaction.user.id;
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const now = Math.floor(Date.now()/1000);
      const last = user.last_daily??0;
      if (now-last<82800) { const next=last+86400; return interaction.editReply({embeds:[new EmbedBuilder().setColor(C.warning).setDescription(`⏳ Daily déjà réclamé ! Prochain : <t:${next}:R>`)]}); }
      const streak = (now-last<172800)?((user.daily_streak??0)+1):1;
      let coins = 100+(streak*10), bonus='';
      if (streak===7){coins+=500;bonus='\n🎁 **Bonus 7 jours : +500 🪙 !**';}
      if (streak===30){coins+=2000;bonus='\n🏆 **Bonus 30 jours : +2000 🪙 !**';const r=interaction.guild.roles.cache.find(x=>x.name==='Boosteurs');if(r)await interaction.member.roles.add(r).catch(()=>{});}
      db.prepare('UPDATE users SET coins=coins+?,daily_streak=?,last_daily=? WHERE discord_id=?').run(coins,streak,now,did);
      await addXp(interaction.guild,did,20);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.success)
        .setAuthor({name:'📅 Daily Bonus !'})
        .setDescription([`+**${coins} 🪙** réclamés !`,`+**20 XP**`,`🔥 Streak : **${streak} jour(s)**${bonus}`].join('\n'))
        .addFields({name:'💰 Solde',value:`**${(user.coins+coins).toLocaleString('fr-FR')} 🪙**`,inline:true},{name:'📅 Prochain',value:`<t:${now+86400}:R>`,inline:true})
        .setTimestamp()]});
    }
  },

  // /work
  {
    data: new SlashCommandBuilder().setName('work').setDescription('💼 Travaille pour gagner des pièces (cooldown 4h)'),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral:true });
      const did = interaction.user.id;
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const now = Math.floor(Date.now()/1000);
      if (now-(user.last_work??0)<14400) { const next=(user.last_work??0)+14400; return interaction.editReply({embeds:[new EmbedBuilder().setColor(C.warning).setDescription(`⏳ Tu es fatigué ! Reviens <t:${next}:R>`)]}); }
      const jobs=[{label:'Tu as vendu des armes MM2',emoji:'🗡️',min:15,max:60},{label:'Tu as arbitré un trade',emoji:'⚖️',min:20,max:80},{label:'Tu as aidé un débutant',emoji:'🤝',min:10,max:40},{label:'Tu as find un Chroma',emoji:'🔴',min:30,max:100},{label:'Tu as streak de kills',emoji:'⚡',min:25,max:70}];
      const job = jobs[Math.floor(Math.random()*jobs.length)];
      const earned = Math.floor(Math.random()*(job.max-job.min+1))+job.min;
      db.prepare('UPDATE users SET coins=coins+?,last_work=? WHERE discord_id=?').run(earned,now,did);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.success).setAuthor({name:'💼 Travail effectué !'}).setDescription(`${job.emoji} **${job.label}**\n+**${earned} 🪙** gagnés !`).addFields({name:'💰 Solde',value:`**${(user.coins+earned).toLocaleString('fr-FR')} 🪙**`,inline:true},{name:'⏰ Prochain',value:`<t:${now+14400}:R>`,inline:true}).setTimestamp()]});
    }
  },

  // /coinflip
  {
    data: new SlashCommandBuilder().setName('coinflip').setDescription('🎰 Pile ou face — double ou rien').addIntegerOption(o=>o.setName('mise').setDescription('Montant (min 10 🪙)').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const did = interaction.user.id, mise = interaction.options.getInteger('mise');
      if (mise<10) return interaction.editReply('❌ Mise minimum : **10 🪙**.');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      const user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      if ((user.coins??0)<mise) return interaction.editReply(`❌ Pas assez de pièces (**${user.coins??0} 🪙**).`);
      const win = Math.random()<0.5;
      const delta = win?mise:-mise;
      db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(delta,did);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(win?C.success:C.danger)
        .setAuthor({name:win?'🎰 Gagné !':'🎰 Perdu...'})
        .setDescription([win?`🪙 **+${mise} pièces**`:`💸 **-${mise} pièces**`,`Résultat : ${win?'**PILE** 🪙':'**FACE** 🌑'}`].join('\n'))
        .addFields({name:'💰 Nouveau solde',value:`**${((user.coins??0)+delta).toLocaleString('fr-FR')} 🪙**`,inline:true})
        .setTimestamp()]});
    }
  },

  // /duel
  {
    data: new SlashCommandBuilder().setName('duel').setDescription('⚔️ Défie un membre en duel').addUserOption(o=>o.setName('membre').setDescription('Membre à défier').setRequired(true)).addIntegerOption(o=>o.setName('mise').setDescription('Mise (min 50 🪙)').setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const did=interaction.user.id,target=interaction.options.getUser('membre'),mise=interaction.options.getInteger('mise');
      if(target.id===did)return interaction.editReply('❌ Tu ne peux pas te défier toi-même.');
      if(target.bot)return interaction.editReply('❌ Les bots ne jouent pas.');
      if(mise<50)return interaction.editReply('❌ Mise minimum : **50 🪙**.');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(did);
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      const challenger=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
      const challenged=db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
      if((challenger.coins??0)<mise)return interaction.editReply('❌ Pas assez de pièces.');
      if((challenged.coins??0)<mise)return interaction.editReply(`❌ <@${target.id}> n'a pas assez.`);
      const res=db.prepare('INSERT INTO duels (challenger_id,challenged_id,amount,channel_id) VALUES (?,?,?,?)').run(did,target.id,mise,interaction.channelId);
      const duelId=res.lastInsertRowid;
      await interaction.editReply({
        embeds:[new EmbedBuilder().setColor(C.purple)
          .setAuthor({name:`⚔️ DUEL — ${interaction.user.username} vs ${target.username}`})
          .setDescription(`<@${did}> défie <@${target.id}> pour **${mise} 🪙** !\n\n> <@${target.id}> clique **Accepter** !`)
          .addFields({name:'🗡️ Challenger',value:`<@${did}>\n${challenger.coins} 🪙`,inline:true},{name:'🛡️ Défié',value:`<@${target.id}>\n${challenged.coins} 🪙`,inline:true},{name:'💰 Mise',value:`**${mise} 🪙**`,inline:true})
          .setTimestamp()],
        components:[new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`duel_accept_${duelId}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`duel_refuse_${duelId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
        )],
      });
      setTimeout(async()=>{
        const d=db.prepare('SELECT * FROM duels WHERE id=?').get(duelId);
        if(d?.status==='pending'){
          db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled',duelId);
          await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.danger).setDescription('❌ Duel annulé — pas de réponse.')],components:[]}).catch(()=>{});
        }
      },120000);
    }
  },

  // /leaderboard
  {
    data: new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement').addStringOption(o=>o.setName('type').setDescription('Type').addChoices({name:'Trades',value:'trades'},{name:'Pièces',value:'coins'},{name:'XP',value:'xp'}).setRequired(false)),
    async execute(interaction) {
      await interaction.deferReply();
      const type = interaction.options.getString('type')??'trades';
      const order = type==='coins'?'coins':type==='xp'?'xp':'trade_count';
      const top = db.prepare(`SELECT * FROM users ORDER BY ${order} DESC LIMIT 10`).all();
      if(!top.length) return interaction.editReply('Aucun résultat.');
      await interaction.editReply({embeds:[leaderboardEmbed(top,type)]});
    }
  },

  // /inventory
  {
    data: new SlashCommandBuilder().setName('inventory').setDescription('📦 Gère ton inventory MM2')
      .addSubcommand(s=>s.setName('add').setDescription('➕ Ajouter').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)))
      .addSubcommand(s=>s.setName('remove').setDescription('➖ Retirer').addStringOption(o=>o.setName('arme').setDescription('Nom exact').setRequired(true)))
      .addSubcommand(s=>s.setName('view').setDescription('👀 Voir')),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral:true });
      const sub = interaction.options.getSubcommand(), did = interaction.user.id;
      if(sub==='add'){const name=interaction.options.getString('arme');const row=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(name);const val=row?.value??0;db.prepare('INSERT INTO inventory (discord_id,weapon_name,weapon_value,verified) VALUES (?,?,?,?)').run(did,row?.name??name,val,val>0?1:0);await interaction.editReply(`✅ **${row?.name??name}** ajouté.`);}
      else if(sub==='remove'){const name=interaction.options.getString('arme');const r=db.prepare('DELETE FROM inventory WHERE discord_id=? AND LOWER(weapon_name)=LOWER(?)').run(did,name);if(!r.changes)return interaction.editReply('❌ Introuvable.');await interaction.editReply(`✅ **${name}** retiré.`);}
      else{const inv=db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(did);if(!inv.length)return interaction.editReply('📦 Inventory vide.');await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.primary).setAuthor({name:'📦 Ton Inventory MM2'}).setDescription(inv.map(w=>`${tierBadge(w.weapon_tier??'godly')} **${w.weapon_name}** \`${w.weapon_value}v\``).join('\n').slice(0,2000)).setFooter({text:`${inv.length} arme(s)`})]});}
    }
  },

  // /updatevalue
  {
    data: new SlashCommandBuilder().setName('updatevalue').setDescription('💰 (Admin) Mettre à jour une arme').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)).addIntegerOption(o=>o.setName('valeur').setDescription('Valeur').setRequired(true)).addStringOption(o=>o.setName('tier').setDescription('Tier').addChoices({name:'Godly',value:'godly'},{name:'Chroma',value:'chroma'},{name:'Ancient',value:'ancient'},{name:'Legendary',value:'legendary'})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const name=interaction.options.getString('arme'),value=interaction.options.getInteger('valeur'),tier=interaction.options.getString('tier')??'godly';db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now')) ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`).run(name,value,tier);await interaction.editReply(`✅ **${name}** → **${value} val** (${tier})`);}
  },

  // /updatevalues
  {
    data: new SlashCommandBuilder().setName('updatevalues').setDescription('🔄 (Admin) Sync valeurs MM2').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});await fetchMM2Values();const count=db.prepare('SELECT COUNT(*) as c FROM weapon_values').get().c;await interaction.editReply(`✅ Sync terminée. **${count}** armes.`);}
  },

  // /addserver
  {
    data: new SlashCommandBuilder().setName('addserver').setDescription('🎮 (Admin) Ajouter serveur privé MM2').addStringOption(o=>o.setName('lien').setDescription('Lien Roblox').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const link=interaction.options.getString('lien');try{db.prepare('INSERT INTO private_servers (link,added_by) VALUES (?,?)').run(link,interaction.user.id);}catch{return interaction.editReply('⚠️ Ce lien existe déjà.');}const count=db.prepare('SELECT COUNT(*) as c FROM private_servers WHERE in_use=0').get().c;await interaction.editReply(`✅ Serveur ajouté ! **${count}** disponibles.`);}
  },

  // /listservers
  {
    data: new SlashCommandBuilder().setName('listservers').setDescription('📋 (Admin) Voir pool serveurs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){await interaction.deferReply({ephemeral:true});const servers=db.prepare('SELECT * FROM private_servers ORDER BY in_use ASC').all();if(!servers.length)return interaction.editReply('📋 Pool vide.');await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info).setAuthor({name:'🎮 Pool Serveurs MM2'}).setDescription(servers.map(s=>`**#${s.id}** ${s.in_use?'🔴 En cours':'🟢 Libre'} \`${s.link.slice(0,50)}\``).join('\n').slice(0,2000)).setFooter({text:`Total : ${servers.length} | Libres : ${servers.filter(s=>!s.in_use).length}`})]});}
  },

  // /report
  {
    data: new SlashCommandBuilder().setName('report').setDescription('🚨 Reporter un scam').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).addIntegerOption(o=>o.setName('trade').setDescription('ID trade (optionnel)')),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const reported=interaction.options.getUser('membre'),reason=interaction.options.getString('raison'),tradeId=interaction.options.getInteger('trade');
      db.prepare('INSERT INTO reports (reporter_id,reported_id,trade_id,reason) VALUES (?,?,?,?)').run(interaction.user.id,reported.id,tradeId??null,reason);
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(reported.id);
      db.prepare('UPDATE users SET report_count=report_count+1 WHERE discord_id=?').run(reported.id);
      await sendLog(interaction.guild,new EmbedBuilder().setColor(C.danger).setAuthor({name:'🚨 Nouveau Report'}).addFields({name:'🕵️ Reporter',value:`<@${interaction.user.id}>`,inline:true},{name:'⚠️ Reporté',value:`<@${reported.id}>`,inline:true},{name:'📝 Raison',value:reason}).setTimestamp());
      await interaction.editReply(`✅ Report envoyé contre <@${reported.id}>.`);
    }
  },

  // /addxp
  {
    data: new SlashCommandBuilder().setName('addxp').setDescription('✨ (Staff) Ajouter XP').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('quantite').setDescription('Quantité').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
      const target=interaction.options.getUser('membre'),amount=interaction.options.getInteger('quantite'),reason=interaction.options.getString('raison')??'—';
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      // addXp gère level-up + notif dans le salon level + rôles XP automatiquement
      const after = await addXp(interaction.guild, target.id, amount);
      await sendLog(interaction.guild,new EmbedBuilder().setColor(C.success).setAuthor({name:`${amount>=0?'➕':'➖'} XP modifié`}).addFields({name:'👤 Membre',value:`<@${target.id}>`,inline:true},{name:'✨ Modif',value:`${amount>=0?'+':''}${amount} XP`,inline:true},{name:'📊 Total',value:`${after.xp} XP — ${getXpTier(after.xp).name}`,inline:true},{name:'📝 Raison',value:reason},{name:'🛡️ Staff',value:`<@${interaction.user.id}>`,inline:true}).setTimestamp());
      await interaction.editReply(`✅ <@${target.id}> → **${amount>=0?'+':''}${amount} XP** | Total : **${after.xp} XP** — ${getXpTier(after.xp).emoji} ${getXpTier(after.xp).name}`);
    }
  },

  // /addcoins
  {
    data: new SlashCommandBuilder().setName('addcoins').setDescription('🪙 (Staff) Ajouter pièces').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o=>o.setName('quantite').setDescription('Quantité').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
      const target=interaction.options.getUser('membre'),amount=interaction.options.getInteger('quantite'),reason=interaction.options.getString('raison')??'—';
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET coins=MAX(0,coins+?) WHERE discord_id=?').run(amount,target.id);
      const u=db.prepare('SELECT coins FROM users WHERE discord_id=?').get(target.id);
      await sendLog(interaction.guild,new EmbedBuilder().setColor(C.success).setAuthor({name:`${amount>=0?'➕':'➖'} Pièces modifiées`}).addFields({name:'👤 Membre',value:`<@${target.id}>`,inline:true},{name:'🪙 Modif',value:`${amount>=0?'+':''}${amount} 🪙`,inline:true},{name:'💰 Total',value:`${u.coins} 🪙`,inline:true},{name:'📝 Raison',value:reason}).setTimestamp());
      await interaction.editReply(`✅ <@${target.id}> → **${amount>=0?'+':''}${amount} 🪙** | Total : **${u.coins} 🪙**`);
    }
  },

  // /warn, /warns, /clearwarns
  {
    data: new SlashCommandBuilder().setName('warn').setDescription('⚠️ (Staff) Avertir un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!isModerator(interaction.member))return interaction.editReply('❌ Réservé au staff.');
      const target=interaction.options.getUser('membre'),reason=interaction.options.getString('raison');
      db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(target.id);
      db.prepare('UPDATE users SET warn_count=warn_count+1 WHERE discord_id=?').run(target.id);
      db.prepare('INSERT INTO warns (discord_id,moderator_id,reason) VALUES (?,?,?)').run(target.id,interaction.user.id,reason);
      const u=db.prepare('SELECT warn_count FROM users WHERE discord_id=?').get(target.id);
      try{const m=await interaction.guild.members.fetch(target.id);await m.send({embeds:[new EmbedBuilder().setColor(C.warning).setDescription(`⚠️ Avertissement sur **${interaction.guild.name}**\n\n**Raison :** ${reason}\n\nTu as **${u.warn_count}** warn(s).`)]});}catch{}
      await sendLog(interaction.guild,automodLogEmbed('warn',target,reason,`Warn ${u.warn_count} — par <@${interaction.user.id}>`));
      await interaction.editReply(`✅ <@${target.id}> averti (**${u.warn_count}** warn(s)) — ${reason}`);
    }
  },
  {
    data: new SlashCommandBuilder().setName('warns').setDescription('📋 (Staff) Voir les warns d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const target=interaction.options.getUser('membre');
      const warns=db.prepare('SELECT * FROM warns WHERE discord_id=? ORDER BY created_at DESC LIMIT 10').all(target.id);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.warning).setAuthor({name:`⚠️ Warns — ${target.username}`}).setDescription(warns.length?warns.map((w,i)=>`**#${i+1}** <@${w.moderator_id}> — ${w.reason} — <t:${w.created_at}:R>`).join('\n'):'Aucun warn.').setFooter({text:`${warns.length} warn(s)`})]});
    }
  },
  {
    data: new SlashCommandBuilder().setName('clearwarns').setDescription('🧹 (Admin) Effacer les warns d\'un membre').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const target=interaction.options.getUser('membre');
      db.prepare('DELETE FROM warns WHERE discord_id=?').run(target.id);
      db.prepare('UPDATE users SET warn_count=0 WHERE discord_id=?').run(target.id);
      await interaction.editReply(`✅ Warns de <@${target.id}> effacés.`);
    }
  },

  // /unlock
  {
    data: new SlashCommandBuilder().setName('unlock').setDescription('🔓 (Admin) Déverrouiller le serveur').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      for(const ch of interaction.guild.channels.cache.filter(c=>c.type===ChannelType.GuildText).values()){
        await ch.permissionOverwrites.edit(interaction.guild.id,{SendMessages:null}).catch(()=>{});
      }
      raidCache.locked=false;
      await sendLog(interaction.guild,new EmbedBuilder().setColor(C.success).setAuthor({name:'🔓 Serveur déverrouillé'}).addFields({name:'🛡️ Par',value:`<@${interaction.user.id}>`,inline:true}).setTimestamp());
      await interaction.editReply('✅ Serveur déverrouillé !');
    }
  },

  // /giveaway
  {
    data: new SlashCommandBuilder().setName('giveaway').setDescription('🎉 Système de giveaway')
      .addSubcommand(s=>s.setName('start').setDescription('🎁 Lancer').addStringOption(o=>o.setName('prix').setDescription('Prix').setRequired(true)).addStringOption(o=>o.setName('duree').setDescription('Durée (1h, 30m, 2d)').setRequired(true)).addIntegerOption(o=>o.setName('gagnants').setDescription('Nombre de gagnants (défaut: 1)')).addChannelOption(o=>o.setName('salon').setDescription('Salon')))
      .addSubcommand(s=>s.setName('end').setDescription('🏁 Terminer').addIntegerOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand(s=>s.setName('reroll').setDescription('🔄 Reroll').addIntegerOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand(s=>s.setName('list').setDescription('📋 Lister actifs'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      if(!hasStaffPerm(interaction.member))return interaction.editReply('❌ Réservé au staff.');
      const sub=interaction.options.getSubcommand();
      if(sub==='start'){
        const prize=interaction.options.getString('prix'),dureeStr=interaction.options.getString('duree'),winnersCount=interaction.options.getInteger('gagnants')??1;
        const cfg=getConfig(interaction.guild.id);
        const targetCh=interaction.options.getChannel('salon')??
          (cfg.giveaway_channel?interaction.guild.channels.cache.get(cfg.giveaway_channel):null)??
          interaction.guild.channels.cache.find(c=>c.name.includes('giveaway'))??interaction.channel;
        let seconds=0;
        const dm=dureeStr.match(/(\d+)d/),hm=dureeStr.match(/(\d+)h/),mm=dureeStr.match(/(\d+)m/);
        if(dm)seconds+=parseInt(dm[1])*86400;if(hm)seconds+=parseInt(hm[1])*3600;if(mm)seconds+=parseInt(mm[1])*60;
        if(seconds<60)return interaction.editReply('❌ Durée minimum : 1 minute.');
        const endsAt=Math.floor(Date.now()/1000)+seconds;
        const res=db.prepare('INSERT INTO giveaways (channel_id,prize,winners_count,host_id,ends_at) VALUES (?,?,?,?,?)').run(targetCh.id,prize,winnersCount,interaction.user.id,endsAt);
        const gwId=res.lastInsertRowid;
        const embed=new EmbedBuilder().setColor(C.gold).setAuthor({name:`🎉 GIVEAWAY — ${prize}`}).setDescription([`> Clique **🎉 Participer** pour entrer !`,'',`🎁 **Prix :** ${prize}`,`🏆 **Gagnants :** ${winnersCount}`,`⏳ **Fin :** <t:${endsAt}:R>`,`📢 **Organisé par :** <@${interaction.user.id}>`].join('\n')).setFooter({text:`Giveaway #${gwId}`}).setTimestamp();
        const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_join_${gwId}`).setLabel('🎉 Participer').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`gw_leave_${gwId}`).setLabel('❌ Se retirer').setStyle(ButtonStyle.Secondary));
        const msg=await targetCh.send({content:'@everyone 🎉 **Nouveau giveaway !**',embeds:[embed],components:[row]});
        db.prepare('UPDATE giveaways SET message_id=? WHERE id=?').run(msg.id,gwId);
        await interaction.editReply(`✅ Giveaway **#${gwId}** lancé !`);
        setTimeout(()=>endGiveaway(interaction.client,gwId),seconds*1000);
      }
      else if(sub==='end'){const gwId=interaction.options.getInteger('id');await endGiveaway(interaction.client,gwId);await interaction.editReply(`✅ Giveaway **#${gwId}** terminé.`);}
      else if(sub==='reroll'){
        const gwId=interaction.options.getInteger('id');const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
        if(!gw)return interaction.editReply('❌ Introuvable.');
        const participants=JSON.parse(gw.participants||'[]');if(!participants.length)return interaction.editReply('❌ Aucun participant.');
        const newWinners=[...participants].sort(()=>Math.random()-0.5).slice(0,Math.min(gw.winners_count,participants.length));
        db.prepare('UPDATE giveaways SET winners=? WHERE id=?').run(JSON.stringify(newWinners),gwId);
        try{const ch=await interaction.client.channels.fetch(gw.channel_id).catch(()=>null);if(ch)await ch.send(`🔄 **Reroll #${gwId}** — ${newWinners.map(w=>`<@${w}>`).join(', ')}`);} catch{}
        await interaction.editReply('✅ Reroll effectué !');
      }
      else if(sub==='list'){
        const active=db.prepare('SELECT * FROM giveaways WHERE status=? ORDER BY ends_at ASC').all('active');
        if(!active.length)return interaction.editReply('📭 Aucun giveaway actif.');
        await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold).setAuthor({name:'🎉 Giveaways actifs'}).setDescription(active.map(g=>{const p=JSON.parse(g.participants||'[]');return`**#${g.id}** — ${g.prize} | 🏆 ${g.winners_count} | 👥 ${p.length} | Fin : <t:${g.ends_at}:R>`}).join('\n')).setTimestamp()]});
      }
    }
  },

  // /hotrades
  {
    data: new SlashCommandBuilder().setName('hotrades').setDescription('🔥 Top 5 trades en valeur'),
    async execute(interaction){
      await interaction.deferReply();
      const hot=db.prepare('SELECT * FROM trades WHERE status=? ORDER BY offer_value DESC LIMIT 5').all('open');
      if(!hot.length)return interaction.editReply('📭 Aucun hot trade en ce moment.');
      const embeds=hot.map(t=>{const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(t.poster_id);return tradeEmbed(t,poster);});
      await interaction.editReply({content:'🔥 **Top 5 trades ouverts :**',embeds:embeds.slice(0,5)});
    }
  },

  // /price-alert
  {
    data: new SlashCommandBuilder().setName('price-alert').setDescription('🔔 Alerte quand une arme est postée à ta valeur').addStringOption(o=>o.setName('arme').setDescription('Nom de l\'arme').setRequired(true)).addIntegerOption(o=>o.setName('valeur-max').setDescription('Valeur max acceptable').setRequired(true)),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const weapon=interaction.options.getString('arme'),maxVal=interaction.options.getInteger('valeur-max');
      db.prepare('INSERT INTO price_alerts (discord_id,weapon_name,max_value) VALUES (?,?,?)').run(interaction.user.id,weapon,maxVal);
      await interaction.editReply(`✅ Alerte créée : **${weapon}** ≤ **${maxVal} val**`);
    }
  },

  // /shopadd
  {
    data: new SlashCommandBuilder().setName('shopadd').setDescription('🛒 (Admin) Ajouter/modifier item boutique').addStringOption(o=>o.setName('nom').setDescription('Nom').setRequired(true)).addIntegerOption(o=>o.setName('prix').setDescription('Prix').setRequired(true)).addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true)).addStringOption(o=>o.setName('type').setDescription('Type').setRequired(true).addChoices({name:'Rôle custom',value:'custom_role'},{name:'Rôle VIP',value:'vip_role'},{name:'Badge Elite',value:'elite_badge'},{name:'Double XP',value:'double_xp'},{name:'Item générique',value:'generic'})).addStringOption(o=>o.setName('emoji').setDescription('Emoji')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction){
      await interaction.deferReply({ephemeral:true});
      const nom=interaction.options.getString('nom'),prix=interaction.options.getInteger('prix'),desc=interaction.options.getString('description'),type=interaction.options.getString('type'),emoji=interaction.options.getString('emoji')??'🎁';
      db.prepare('INSERT INTO shop_items (name,description,price,item_type,emoji,active,added_by) VALUES (?,?,?,?,?,1,?) ON CONFLICT(name) DO UPDATE SET description=excluded.description,price=excluded.price,item_type=excluded.item_type,emoji=excluded.emoji,active=1').run(nom,desc,prix,type,emoji,interaction.user.id);
      const boutiqueCh=interaction.guild.channels.cache.find(c=>c.name.includes('boutique'));
      if(boutiqueCh)await postShopEmbed(boutiqueCh);
      await interaction.editReply(`✅ Item **${nom}** ajouté !`);
    }
  },

  // ── /autorole ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('autorole').setDescription('🏷️ (Admin) Gérer les rôles automatiques à l\'arrivée')
      .addSubcommand(s => s.setName('list').setDescription('📋 Voir les autoroles configurés'))
      .addSubcommand(s => s.setName('add').setDescription('➕ Ajouter un rôle donné à l\'arrivée')
        .addRoleOption(o => o.setName('role').setDescription('Rôle à donner').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('➖ Retirer un autorole')
        .addRoleOption(o => o.setName('role').setDescription('Rôle à retirer').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
      const sub = interaction.options.getSubcommand();
      const gid = interaction.guild.id;
      db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(gid);

      // Stocke les autoroles dans server_config comme JSON (colonne dédiée ou réutilise xp_roles-style)
      // On utilise une migration safe pour ajouter la colonne si elle n'existe pas
      try { db.exec('ALTER TABLE server_config ADD COLUMN autoroles TEXT DEFAULT \'[]\''); } catch {}

      const cfg = db.prepare('SELECT autoroles FROM server_config WHERE guild_id=?').get(gid);
      let autoroles = [];
      try { autoroles = JSON.parse(cfg?.autoroles || '[]'); } catch {}

      if (sub === 'list') {
        if (!autoroles.length) return interaction.editReply('Aucun autorole configuré. Utilise `/autorole add`.');
        const lines = autoroles.map(id => {
          const r = interaction.guild.roles.cache.get(id);
          return r ? `• <@&${id}> (${r.name})` : `• \`${id}\` _(rôle supprimé)_`;
        });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(C.info)
          .setAuthor({ name: '🏷️ Autoroles configurés' })
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Ces rôles sont donnés automatiquement à chaque nouveau membre' })
          .setTimestamp()] });
      }

      const role = interaction.options.getRole('role');
      if (sub === 'add') {
        if (autoroles.includes(role.id)) return interaction.editReply(`❌ <@&${role.id}> est déjà un autorole.`);
        if (role.managed) return interaction.editReply('❌ Les rôles gérés par des intégrations ne peuvent pas être des autoroles.');
        autoroles.push(role.id);
        db.prepare('UPDATE server_config SET autoroles=? WHERE guild_id=?').run(JSON.stringify(autoroles), gid);
        return interaction.editReply(`✅ <@&${role.id}> ajouté aux autoroles.\nTous les nouveaux membres le recevront automatiquement.`);
      }
      if (sub === 'remove') {
        if (!autoroles.includes(role.id)) return interaction.editReply(`❌ <@&${role.id}> n'est pas un autorole.`);
        autoroles = autoroles.filter(id => id !== role.id);
        db.prepare('UPDATE server_config SET autoroles=? WHERE guild_id=?').run(JSON.stringify(autoroles), gid);
        return interaction.editReply(`✅ <@&${role.id}> retiré des autoroles.`);
      }
    }
  },

  // ── /massrole ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('massrole').setDescription('⚡ (Admin) Donner ou retirer un rôle à tous les membres')
      .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true)
        .addChoices(
          { name: '➕ Donner à tous', value: 'add' },
          { name: '➖ Retirer à tous', value: 'remove' },
          { name: '🔄 Donner aux membres sans rôle (vérifiés)', value: 'fill_verified' },
        ))
      .addRoleOption(o => o.setName('role').setDescription('Rôle cible').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });
      if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé aux admins.');
      const action = interaction.options.getString('action');
      const role = interaction.options.getRole('role');
      const guild = interaction.guild;

      if (role.managed) return interaction.editReply('❌ Impossible de gérer un rôle d\'intégration.');
      if (role.id === guild.id) return interaction.editReply('❌ Le rôle @everyone ne peut pas être modifié.');

      await interaction.editReply(`⏳ Massrole **${action === 'add' ? 'ajout' : action === 'remove' ? 'retrait' : 'fill'}** de <@&${role.id}> en cours...`);

      await guild.members.fetch().catch(() => {});
      let count = 0, errors = 0;
      const members = guild.members.cache;

      for (const [, member] of members) {
        if (member.user.bot) continue;
        try {
          if (action === 'add' && !member.roles.cache.has(role.id)) {
            await member.roles.add(role).catch(() => {});
            count++;
          } else if (action === 'remove' && member.roles.cache.has(role.id)) {
            await member.roles.remove(role).catch(() => {});
            count++;
          } else if (action === 'fill_verified') {
            const dbUser = db.prepare('SELECT verified FROM users WHERE discord_id=?').get(member.id);
            if (dbUser?.verified && !member.roles.cache.has(role.id)) {
              await member.roles.add(role).catch(() => {});
              count++;
            }
          }
          // Rate limit safety
          if (count % 10 === 0) await new Promise(r => setTimeout(r, 1000));
        } catch { errors++; }
      }

      await sendLog(guild, new EmbedBuilder().setColor(C.warning)
        .setAuthor({ name: `⚡ Massrole — ${action}` })
        .addFields(
          { name: '🏷️ Rôle', value: `<@&${role.id}>`, inline: true },
          { name: '✅ Modifiés', value: `${count}`, inline: true },
          { name: '❌ Erreurs', value: `${errors}`, inline: true },
          { name: '🛡️ Staff', value: `<@${interaction.user.id}>`, inline: true },
        ).setTimestamp());

      await interaction.editReply(`✅ Massrole terminé !\n🏷️ <@&${role.id}> → **${action === 'add' ? 'donné' : action === 'remove' ? 'retiré' : 'donné aux vérifiés'}** à **${count}** membre(s)${errors ? ` (${errors} erreur(s))` : ''}.`);
    }
  },

];

// ══════════════════════════════════════════════════════════════
//  BUTTON HANDLER
// ══════════════════════════════════════════════════════════════
async function handleButton(interaction) {
  const { customId, guild, user } = interaction;

  if (customId === 'btn_link_start') {
    const modal = new ModalBuilder().setCustomId('modal_link_roblox').setTitle('🔗 Lier ton compte Roblox');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roblox_username').setLabel('Ton pseudo Roblox exact').setStyle(TextInputStyle.Short).setPlaceholder('ex: WenzyFR').setRequired(true).setMinLength(3).setMaxLength(20)));
    return interaction.showModal(modal);
  }
  if (customId === 'btn_verify_now') { await interaction.deferReply({ ephemeral:true }); return doVerify(interaction); }

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

  if (customId === 'btn_create_vocal') {
    await interaction.deferReply({ ephemeral:true });
    const member = await guild.members.fetch(user.id).catch(()=>null);
    if (!member) return interaction.editReply('❌ Impossible de te trouver.');
    const existing = db.prepare('SELECT * FROM private_vocals WHERE owner_id=?').get(user.id);
    if (existing) {
      const existingCh = guild.channels.cache.get(existing.channel_id);
      if (existingCh) return interaction.editReply(`❌ Tu as déjà un vocal : <#${existing.channel_id}>`);
      else db.prepare('DELETE FROM private_vocals WHERE owner_id=?').run(user.id);
    }
    const catPv = guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name.includes('VOCAUX PRIVÉS'));
    try {
      const ch = await guild.channels.create({
        name:`🔒 ${member.displayName}`,
        type:ChannelType.GuildVoice,
        parent:catPv?.id??null,
        permissionOverwrites:[
          {id:guild.id,deny:[PermissionFlagsBits.Connect]},
          {id:member.id,allow:[PermissionFlagsBits.Connect,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.MoveMembers]},
        ],
      });
      db.prepare('INSERT OR REPLACE INTO private_vocals (channel_id,owner_id) VALUES (?,?)').run(ch.id,member.id);
      if (member.voice.channel) await member.voice.setChannel(ch).catch(()=>{});
      return interaction.editReply(`✅ Vocal privé créé : **${ch.name}**`);
    } catch(e) { return interaction.editReply('❌ Erreur création vocal.'); }
  }

  if (customId === 'shop_mes_pieces') {
    await interaction.deferReply({ ephemeral:true });
    const u = db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    const coins=u?.coins??0,xp=u?.xp??0;
    return interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold)
      .setAuthor({name:'🪙 Ton solde'})
      .addFields(
        {name:'💰 Pièces',value:`\`[${coinsBar(coins)}]\``,inline:false},
        {name:`${getXpTier(xp).emoji} Niveau`,value:`\`[${xpProgressBar(xp)}]\`\n${xp} XP — ${getXpTier(xp).name}`,inline:true},
        {name:'🔥 Streak',value:`${u?.daily_streak??0} jours`,inline:true},
      ).setTimestamp()]});
  }

  if (customId === 'shop_vip') {
    await interaction.deferReply({ ephemeral:true });
    const u=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!u||u.coins<1000) return interaction.editReply(`❌ Il te faut **1 000 🪙** (tu as **${u?.coins??0}**).`);
    db.prepare('UPDATE users SET coins=coins-1000 WHERE discord_id=?').run(user.id);
    const vipRole=guild.roles.cache.find(r=>r.name==='Protéger de Kurai')||await guild.roles.create({name:'👑 VIP',color:0xF1C40F,hoist:true}).catch(()=>null);
    const member=await guild.members.fetch(user.id).catch(()=>null);
    if(member&&vipRole)await member.roles.add(vipRole).catch(()=>{});
    await sendLog(guild,new EmbedBuilder().setColor(C.gold).setDescription(`👑 <@${user.id}> a acheté le rôle VIP pour 1 000 🪙`).setTimestamp());
    return interaction.editReply('✅ **Rôle VIP** attribué !');
  }

  if (customId === 'shop_elite_badge') {
    await interaction.deferReply({ ephemeral:true });
    const u=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!u||u.coins<10000) return interaction.editReply(`❌ Il te faut **10 000 🪙** (tu as **${u?.coins??0}**).`);
    db.prepare('UPDATE users SET coins=coins-10000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id,'elite_badge',10000);
    const eliteRole=guild.roles.cache.find(r=>r.name==='50 - Goat');
    const member=await guild.members.fetch(user.id).catch(()=>null);
    if(member&&eliteRole)await member.roles.add(eliteRole).catch(()=>{});
    return interaction.editReply('✅ **Badge Elite (50 - Goat)** acheté !');
  }

  if (customId === 'shop_double_xp') {
    await interaction.deferReply({ ephemeral:true });
    const u=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!u||u.coins<2000) return interaction.editReply(`❌ Il te faut **2 000 🪙** (tu as **${u?.coins??0}**).`);
    db.prepare('UPDATE users SET coins=coins-2000 WHERE discord_id=?').run(user.id);
    db.prepare('INSERT INTO shop_purchases (discord_id,item_type,coins_spent) VALUES (?,?,?)').run(user.id,'double_xp',2000);
    return interaction.editReply('✅ **Double XP 24h** activé !');
  }

  if (customId === 'shop_role_custom') {
    const u=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!u||u.coins<500){await interaction.deferReply({ephemeral:true});return interaction.editReply(`❌ Il te faut **500 🪙** (tu as **${u?.coins??0}**).`);}
    const modal=new ModalBuilder().setCustomId('modal_shop_role_custom').setTitle('🎨 Acheter un rôle custom');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_name').setLabel('Nom du rôle').setStyle(TextInputStyle.Short).setPlaceholder('ex: 🌙 LunarTrader').setRequired(true).setMaxLength(30)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_color').setLabel('Couleur hex (ex: #FF5733)').setStyle(TextInputStyle.Short).setPlaceholder('#FF5733').setRequired(true).setMaxLength(20)),
    );
    return interaction.showModal(modal);
  }

  if (customId.startsWith('ticket_claim_')) {
    await interaction.deferReply({ ephemeral:true });
    if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
    const ticketId=parseInt(customId.replace('ticket_claim_',''));
    const ticket=db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    if (!ticket) return interaction.editReply('❌ Ticket introuvable.');
    db.prepare('UPDATE tickets SET status=?,claimed_by=? WHERE id=?').run('claimed',user.id,ticketId);
    const tCh=guild.channels.cache.get(ticket.channel_id);
    if (tCh) await tCh.send({embeds:[new EmbedBuilder().setColor(C.success).setDescription(`🤝 **Ticket pris en charge par <@${user.id}>**`).setTimestamp()]});
    return interaction.editReply('✅ Ticket pris en charge.');
  }

  if (customId.startsWith('ticket_close_')) {
    await interaction.deferReply({ ephemeral:true });
    const ticketId=parseInt(customId.replace('ticket_close_',''));
    const ticket=db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    if (!ticket) return interaction.editReply('❌ Ticket introuvable.');
    if (!hasStaffPerm(interaction.member)&&ticket.creator_id!==user.id) return interaction.editReply('❌ Seul le staff ou le créateur peut fermer.');
    db.prepare(`UPDATE tickets SET status='closed',closed_at=strftime('%s','now') WHERE id=?`).run(ticketId);
    const tCh=guild.channels.cache.get(ticket.channel_id);
    if (tCh) {
      // ── TRANSCRIPT .TXT ──
      try{
        const msgs=await tCh.messages.fetch({limit:100});
        const lines=[
          `╔══════════════════════════════════════════╗`,
          `  TRANSCRIPT — Ticket #${String(ticketId).padStart(4,'0')}`,
          `  Catégorie : ${ticket.category}`,
          `  Créateur  : ID ${ticket.creator_id}`,
          `  Fermé par : ${user.username} (${user.id})`,
          `  Serveur   : ${guild.name}`,
          `  Date      : ${new Date().toLocaleString('fr-FR')}`,
          `╚══════════════════════════════════════════╝`,
          '',
          '── MESSAGES ────────────────────────────────',
          '',
          ...msgs.sort((a,b)=>a[1].createdTimestamp-b[1].createdTimestamp)
            .map(([,m])=>`[${new Date(m.createdTimestamp).toLocaleString('fr-FR')}] ${m.author.username}: ${m.content||'[embed/pièce jointe]'}`),
          '',
          '─── FIN DU TRANSCRIPT ───────────────────────',
        ];
        const transcriptText=lines.join('\n');
        const tmpPath=path.join(__dirname,`transcript_${ticketId}_${Date.now()}.txt`);
        fs.writeFileSync(tmpPath,transcriptText,'utf8');
        try{
          const creator=await interaction.client.users.fetch(ticket.creator_id).catch(()=>null);
          if(creator){
            await creator.send({
              embeds:[new EmbedBuilder().setColor(C.info)
                .setAuthor({name:`🎫 Transcript — Ticket #${String(ticketId).padStart(4,'0')}`})
                .addFields(
                  {name:'📋 Catégorie',value:ticket.category,inline:true},
                  {name:'🏠 Serveur',value:guild.name,inline:true},
                  {name:'🔒 Fermé par',value:`${user.username}`,inline:true},
                  {name:'📅 Date',value:`<t:${Math.floor(Date.now()/1000)}:f>`,inline:true},
                )
                .setDescription('> Le transcript de ton ticket est joint ci-dessous en fichier `.txt`.')
                .setFooter({text:'Wenzy Bot v7.5 • Tickets'})
                .setTimestamp()],
              files:[{attachment:tmpPath,name:`transcript-ticket-${ticketId}.txt`}],
            });
          }
        }catch{}
        // cleanup tmp file after 5s
        setTimeout(()=>fs.unlink(tmpPath,()=>{}),5000);
      }catch(e){console.error('[Transcript]',e.message);}

      await tCh.send({embeds:[new EmbedBuilder().setColor(C.danger).setDescription(`🔒 **Ticket fermé par <@${user.id}>**\nSuppression dans 10 secondes.`).setTimestamp()]});
      await sendLog(guild,new EmbedBuilder().setColor(C.info).setAuthor({name:`🔒 Ticket #${ticketId} fermé`}).addFields({name:'👤 Par',value:`<@${user.id}>`,inline:true},{name:'📋 Catégorie',value:ticket.category,inline:true}).setTimestamp());
      setTimeout(()=>tCh.delete('Ticket fermé').catch(()=>{}),10000);
    }
    return interaction.editReply('✅ Ticket fermé. Transcript envoyé en DM au créateur.');
  }

  if (customId.startsWith('gw_join_')) {
    await interaction.deferReply({ ephemeral:true });
    const gwId=parseInt(customId.replace('gw_join_',''));
    const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
    if (!gw||gw.status!=='active') return interaction.editReply('❌ Giveaway terminé.');
    const participants=JSON.parse(gw.participants||'[]');
    if (participants.includes(user.id)) return interaction.editReply('⚠️ Tu participes déjà !');
    participants.push(user.id);
    db.prepare('UPDATE giveaways SET participants=? WHERE id=?').run(JSON.stringify(participants),gwId);
    try{
      const ch=await interaction.client.channels.fetch(gw.channel_id).catch(()=>null);
      if(ch&&gw.message_id){
        const msg=await ch.messages.fetch(gw.message_id).catch(()=>null);
        if(msg){
          const embed=msg.embeds[0];
          if(embed){
            const ne=EmbedBuilder.from(embed).setFooter({text:`Giveaway #${gwId} — ${participants.length} participant(s)`});
            await msg.edit({embeds:[ne]}).catch(()=>{});
          }
        }
      }
    }catch{}
    return interaction.editReply(`✅ Tu participes au giveaway **${gw.prize}** !`);
  }
  if (customId.startsWith('gw_leave_')) {
    await interaction.deferReply({ ephemeral:true });
    const gwId=parseInt(customId.replace('gw_leave_',''));
    const gw=db.prepare('SELECT * FROM giveaways WHERE id=?').get(gwId);
    if (!gw||gw.status!=='active') return interaction.editReply('❌ Giveaway terminé.');
    const participants=JSON.parse(gw.participants||'[]').filter(id=>id!==user.id);
    db.prepare('UPDATE giveaways SET participants=? WHERE id=?').run(JSON.stringify(participants),gwId);
    return interaction.editReply('❌ Retiré du giveaway.');
  }

  if (customId.startsWith('staff_validate_')) {
    await interaction.deferReply({ ephemeral:true });
    if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
    const tid=parseInt(customId.replace('staff_validate_',''));
    const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (!trade) return interaction.editReply('❌ Trade introuvable.');
    if (trade.status==='completed') return interaction.editReply('⚠️ Déjà complété.');
    await completeTrade(guild,tid,trade.screenshot_url??null);
    return interaction.editReply(`✅ Trade **#${tid}** validé !`);
  }
  if (customId.startsWith('staff_reject_')) {
    await interaction.deferReply({ ephemeral:true });
    if (!hasStaffPerm(interaction.member)) return interaction.editReply('❌ Réservé au staff.');
    const tid=parseInt(customId.replace('staff_reject_',''));
    const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (trade?.thread_id){try{const t=await guild.channels.fetch(trade.thread_id).catch(()=>null);if(t)await t.send(`❌ **Screenshot rejeté** par <@${user.id}>\n\nEnvoie un screenshot valide de **"YOU HAVE ACCEPTED"**.`);}catch{}}
    return interaction.editReply(`⚠️ Screenshot du trade **#${tid}** rejeté.`);
  }

  if (customId.startsWith('trade_accept_')) {
    await interaction.deferReply({ ephemeral:true });
    const tid=parseInt(customId.replace('trade_accept_',''));
    const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    if (!trade) return interaction.editReply('❌ Trade introuvable.');
    if (trade.poster_id===user.id) return interaction.editReply('❌ Tu ne peux pas accepter ton propre trade.');
    if (trade.status!=='open') return interaction.editReply('❌ Ce trade n\'est plus disponible.');
    const accUser=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);
    if (!accUser?.verified) return interaction.editReply('❌ Lie et vérifie ton compte Roblox dans **#lier-roblox** avant d\'accepter un trade.');
    db.prepare('UPDATE trades SET accepter_id=?,status=? WHERE id=?').run(user.id,'in_progress',tid);
    const updated=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter=db.prepare('SELECT * FROM users WHERE discord_id=?').get(user.id);

    if (trade.message_id&&trade.channel_id){
      try{
        const tCh2=await guild.channels.fetch(trade.channel_id).catch(()=>null);
        if(tCh2){
          const msg=await tCh2.messages.fetch(trade.message_id).catch(()=>null);
          if(msg){
            const inProgressEmbed=new EmbedBuilder().setColor(C.warning).setAuthor({name:`⏳ TRADE #${String(tid).padStart(4,'0')} — EN COURS`}).setDescription(`> <@${trade.poster_id}> × <@${user.id}>\n> Lancé <t:${trade.created_at}:R>`).setTimestamp();
            await msg.edit({embeds:[inProgressEmbed],components:[]}).catch(()=>{});
          }
        }
      }catch{}
    }

    let thread;
    try{
      const tradeCh=guild.channels.cache.find(c=>c.name.includes('post-trades'));
      if (tradeCh) {
        thread=await tradeCh.threads.create({name:`🗡️ Trade #${tid} — ${poster?.roblox_username??'?'} × ${accepter?.roblox_username??'?'}`,type:ChannelType.PrivateThread,reason:`Trade #${tid}`,invitable:false});
        await thread.members.add(trade.poster_id);
        await thread.members.add(user.id);
      }
    }catch(e){console.error('[Thread]',e.message);}

    if (thread) {
      db.prepare('UPDATE trades SET thread_id=? WHERE id=?').run(thread.id,tid);
      const server=getFreeServer();
      if(server){db.prepare('UPDATE private_servers SET in_use=1,trade_id=? WHERE id=?').run(tid,server.id);db.prepare('UPDATE trades SET server_link=? WHERE id=?').run(server.link,tid);}
      const off=JSON.parse(updated.offer_weapons),want=JSON.parse(updated.want_weapons);
      await thread.send({
        embeds:[new EmbedBuilder().setColor(C.warning)
          .setAuthor({name:`🗡️ TRADE EN COURS — #${String(tid).padStart(4,'0')}`})
          .setDescription([`> <@${trade.poster_id}> × <@${user.id}>`,'','**📋 Pour finaliser :**','1. Rejoins le serveur privé MM2','2. Fais le trade en jeu','3. Prends un screenshot de **"YOU HAVE ACCEPTED"**','4. Envoie le screenshot ici','5. ⚠️ Un staff validera manuellement','','> Le screenshot sera envoyé dans **#vouches** quand le staff validera.'].join('\n'))
          .addFields(
            {name:'📤 Offre',value:off.map(w=>`${tierBadge(w.tier??'godly')} **${w.name}** \`${w.value}v\``).join('\n')+`\n\n**TOTAL : ${updated.offer_value} val**`,inline:true},
            {name:'📥 Recherche',value:want.map(w=>`**${w.name}**`).join('\n'),inline:true},
          ).setTimestamp()],
        components:[threadButtons(tid)],
      });
      if (server) await thread.send(`🎮 **Serveur Privé MM2 :**\n${server.link}`);
      if (fs.existsSync(REF_SCREEN_PATH)){
        await thread.send('📸 **Exemple de screenshot attendu (YOU HAVE ACCEPTED) :**');
        await thread.send({files:[REF_SCREEN_PATH]});
      }

      // Panel middleman — info seule au départ, SANS embed de validation (screenshot pas encore envoyé)
      const mmPanel=guild.channels.cache.find(c=>c.name.includes('middleman-panel'));
      if(mmPanel){
        const mmRole=guild.roles.cache.find(r=>r.name==='Middleman');
        await mmPanel.send({
          content:mmRole?`<@&${mmRole.id}> 📋 Trade **#${String(tid).padStart(4,'0')}** démarré — en attente du screenshot`:`📋 Trade **#${String(tid).padStart(4,'0')}** démarré — en attente du screenshot`,
          embeds:[new EmbedBuilder().setColor(C.info)
            .setAuthor({name:`⏳ TRADE #${String(tid).padStart(4,'0')} — EN COURS (screenshot attendu)`})
            .addFields(
              {name:'👤 Poster',value:`<@${trade.poster_id}> (${poster?.trade_count??0} trades)`,inline:true},
              {name:'👤 Accepter',value:`<@${user.id}> (${accepter?.trade_count??0} trades)`,inline:true},
              {name:'📤 Offre',value:off.map(w=>`${tierBadge(w.tier??'godly')} **${w.name}** ${w.value}v`).join('\n')+`\n**TOTAL : ${updated.offer_value} val**`,inline:false},
              {name:'📥 Recherche',value:want.map(w=>w.name).join('\n'),inline:false},
              {name:'📸 Screenshot',value:'⏳ Pas encore reçu — les boutons de validation apparaîtront quand le screenshot sera envoyé',inline:false},
            ).setFooter({text:'Les boutons Valider/Rejeter arrivent avec le screenshot'}).setTimestamp()],
        });
      }
    }

    await sendLog(guild,new EmbedBuilder().setColor(C.info).setAuthor({name:`🤝 Trade #${tid} accepté`}).addFields({name:'👤 Poster',value:`<@${trade.poster_id}>`,inline:true},{name:'👤 Accepteur',value:`<@${user.id}>`,inline:true},{name:'💰 Valeur',value:`${updated.offer_value}v`,inline:true}).setTimestamp());
    return interaction.editReply(`✅ Trade **#${tid}** accepté ! Thread créé.`);
  }

  if (customId.startsWith('trade_cancel_')) { await interaction.deferReply({ephemeral:true}); return cancelTrade(interaction,user.id,parseInt(customId.replace('trade_cancel_',''))); }
  if (customId.startsWith('trade_middleman_')||customId.startsWith('trade_negotiate_')) {
    await interaction.deferReply({ephemeral:true});
    const tid=parseInt(customId.split('_').pop());
    const mmRole=guild.roles.cache.find(r=>r.name==='Middleman');
    const mmPanel=guild.channels.cache.find(c=>c.name.includes('cmds-staff'));
    if (mmPanel&&mmRole) await mmPanel.send(`🛡️ <@&${mmRole.id}> — Middleman demandé pour Trade **#${tid}** par <@${user.id}>`);
    return interaction.editReply('✅ Un middleman a été appelé !');
  }
  if (customId.startsWith('mm_validate_')){await interaction.deferReply({ephemeral:true});const tid=parseInt(customId.replace('mm_validate_',''));const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);await completeTrade(guild,tid,trade?.screenshot_url??null);return interaction.editReply(`✅ Trade **#${tid}** validé.`);}
  if (customId.startsWith('mm_cancel_')){await interaction.deferReply({ephemeral:true});const tid=parseInt(customId.replace('mm_cancel_',''));db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled',tid);db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tid);return interaction.editReply(`❌ Trade **#${tid}** annulé.`);}
  if (customId.startsWith('mm_report_')){await interaction.deferReply({ephemeral:true});const tid=parseInt(customId.replace('mm_report_',''));db.prepare('UPDATE trades SET status=? WHERE id=?').run('disputed',tid);await sendLog(guild,new EmbedBuilder().setColor(C.danger).setDescription(`🚨 **SCAM REPORT** — Trade **#${tid}** signalé par <@${user.id}>.`).setTimestamp());return interaction.editReply('🚨 Scam reporté.');}

  if (customId.startsWith('duel_accept_')) {
    await interaction.deferReply();
    const duelId=parseInt(customId.replace('duel_accept_',''));
    const duel=db.prepare('SELECT * FROM duels WHERE id=?').get(duelId);
    if (!duel||duel.status!=='pending') return interaction.editReply('❌ Duel expiré.');
    if (user.id!==duel.challenged_id) return interaction.editReply('❌ Ce duel ne te concerne pas.');
    const ch=db.prepare('SELECT * FROM users WHERE discord_id=?').get(duel.challenger_id);
    const cd=db.prepare('SELECT * FROM users WHERE discord_id=?').get(duel.challenged_id);
    if((ch?.coins??0)<duel.amount||(cd?.coins??0)<duel.amount){db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled',duelId);return interaction.editReply('❌ Quelqu\'un n\'a plus assez.');}
    const challengerWins=Math.random()<0.5;
    const winner=challengerWins?duel.challenger_id:duel.challenged_id;
    const loser=challengerWins?duel.challenged_id:duel.challenger_id;
    db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(duel.amount,winner);
    db.prepare('UPDATE users SET coins=coins-? WHERE discord_id=?').run(duel.amount,loser);
    db.prepare('UPDATE duels SET status=?,winner_id=? WHERE id=?').run('completed',winner,duelId);
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold).setAuthor({name:`⚔️ DUEL TERMINÉ — #${duelId}`}).setDescription([`🏆 **<@${winner}> GAGNE !**`,`💸 <@${loser}> perd **${duel.amount} 🪙**`].join('\n')).addFields({name:'💰 Mise',value:`**${duel.amount} 🪙**`,inline:true},{name:'🏆 Gagnant',value:`<@${winner}>`,inline:true}).setTimestamp()],components:[]});
  }
  if (customId.startsWith('duel_refuse_')) {
    await interaction.deferReply();
    const duelId=parseInt(customId.replace('duel_refuse_',''));
    const duel=db.prepare('SELECT * FROM duels WHERE id=?').get(duelId);
    if (!duel||duel.status!=='pending') return interaction.editReply('❌ Duel expiré.');
    if (user.id!==duel.challenged_id) return interaction.editReply('❌ Ce duel ne te concerne pas.');
    db.prepare('UPDATE duels SET status=? WHERE id=?').run('cancelled',duelId);
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.danger).setDescription(`❌ **<@${user.id}> a refusé le duel.**`)],components:[]});
  }
}

// ══════════════════════════════════════════════════════════════
//  SELECT MENU HANDLER
// ══════════════════════════════════════════════════════════════
async function handleSelectMenu(interaction) {
  if (interaction.customId === 'ticket_select_category') {
    const category = interaction.values[0];
    // Capitalize first letter
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    
    await interaction.deferReply({ ephemeral:true });
    
    // Modal pour la raison du ticket
    // On crée directement le ticket avec une raison vide, le modal serait mieux
    // mais on peut pas faire modal après deferReply, donc on crée directement
    const ch = await createTicket(interaction, categoryLabel, {});
    if (ch) return interaction.editReply(`✅ Ticket **${categoryLabel}** créé : <#${ch.id}>`);
  }
}

// ══════════════════════════════════════════════════════════════
//  MODAL HANDLER
// ══════════════════════════════════════════════════════════════
async function handleModal(interaction) {
  const { customId } = interaction;

  if (customId === 'modal_link_roblox') {
    await interaction.deferReply({ ephemeral:true });
    const username=interaction.fields.getTextInputValue('roblox_username'),did=interaction.user.id;
    let rb;try{rb=await searchRobloxUser(username);}catch{return interaction.editReply('❌ API Roblox indisponible.');}
    if (!rb) return interaction.editReply(`❌ Pseudo **${username}** introuvable.`);
    const code=genCode();
    const ex=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
    if(ex)db.prepare('UPDATE users SET roblox_id=?,roblox_username=?,verify_code=?,verified=0 WHERE discord_id=?').run(String(rb.id),rb.name,code,did);
    else db.prepare('INSERT INTO users (discord_id,roblox_id,roblox_username,verify_code) VALUES (?,?,?,?)').run(did,String(rb.id),rb.name,code);
    await interaction.editReply({
      embeds:[new EmbedBuilder().setColor(C.info).setAuthor({name:'🔗 Code généré !'}).setDescription([`Compte : **${rb.name}**`,'','**Code à coller dans ta bio Roblox :**',`\`\`\`${code}\`\`\``,'→ [Modifier ta bio](https://www.roblox.com/my/account#!/info)','','Reviens et clique Vérifier.'].join('\n'))],
      components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_verify_now').setLabel('✅ Vérifier maintenant').setStyle(ButtonStyle.Success))],
    });
  }

  if (customId === 'modal_post_trade') {
    await interaction.deferReply({ ephemeral:true });
    const offreStr=interaction.fields.getTextInputValue('trade_offre');
    const offreVal=parseInt(interaction.fields.getTextInputValue('trade_offre_val'))||0;
    const chercheStr=interaction.fields.getTextInputValue('trade_cherche');
    const chercheVal=parseInt(interaction.fields.getTextInputValue('trade_cherche_val')??'0')||0;
    return postTrade(interaction,interaction.user.id,offreStr,chercheStr,offreVal,chercheVal);
  }

  if (customId === 'modal_shop_role_custom') {
    await interaction.deferReply({ ephemeral:true });
    const roleName=interaction.fields.getTextInputValue('role_name'),colorInput=interaction.fields.getTextInputValue('role_color').trim();
    const u=db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
    if (!u||u.coins<500) return interaction.editReply('❌ Pas assez de pièces.');
    let colorHex=0x7B2FBE;const m=colorInput.match(/#?([0-9a-fA-F]{6})/);if(m)colorHex=parseInt(m[1],16);
    try{
      const newRole=await interaction.guild.roles.create({name:roleName,color:colorHex,hoist:false});
      const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if(member)await member.roles.add(newRole).catch(()=>{});
      db.prepare('UPDATE users SET coins=coins-500 WHERE discord_id=?').run(interaction.user.id);
      db.prepare('INSERT INTO shop_purchases (discord_id,item_type,item_data,coins_spent) VALUES (?,?,?,?)').run(interaction.user.id,'custom_role',JSON.stringify({name:roleName,color:colorInput}),500);
      await interaction.editReply(`✅ Rôle **${roleName}** créé et attribué !`);
    }catch(e){await interaction.editReply(`❌ Erreur : ${e.message}`);}
  }
}

// ── YOUTUBE WATCHER ──────────────────────────────────────────
function startYoutubeWatcher(client) {
  const { YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID } = process.env;
  if (!YOUTUBE_API_KEY||!YOUTUBE_CHANNEL_ID){console.log('[YouTube] Désactivé — clé manquante');return;}
  cron.schedule('*/5 * * * *', async()=>{
    try{
      const res=await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&order=date&maxResults=1&type=video&key=${YOUTUBE_API_KEY}`);
      const video=res.data.items?.[0];if(!video)return;
      const videoId=video.id.videoId;
      const lastRow=db.prepare('SELECT * FROM youtube_last WHERE id=1').get();
      if(lastRow.video_id===videoId)return;
      db.prepare(`UPDATE youtube_last SET video_id=?,checked_at=strftime('%s','now') WHERE id=1`).run(videoId);
      const { snippet }=video,url=`https://www.youtube.com/watch?v=${videoId}`;
      for(const[,gld] of client.guilds.cache){
        const cfg=getConfig(gld.id);
        const ch=cfg?.youtube_channel?gld.channels.cache.get(cfg.youtube_channel):gld.channels.cache.find(c=>c.name.includes('posts-youtube'));
        if(!ch)continue;
        await ch.send({content:`@everyone 📺 **Nouvelle vidéo de Wenzy !**\n${url}`,embeds:[new EmbedBuilder().setColor(0xFF0000).setAuthor({name:'▶️ NOUVELLE VIDÉO — Wenzy'}).setDescription(`**${snippet.title}**`).setImage(snippet.thumbnails.high?.url??snippet.thumbnails.default?.url).setFooter({text:`Publiée le ${new Date(snippet.publishedAt).toLocaleDateString('fr-FR')}`}).setTimestamp()]});
      }
    }catch(e){console.error('[YouTube]',e.message);}
  });
}

// ── STATUS WATCHER (pour le rôle .gg/wenzy) ─────────────────
function startStatusWatcher(client) {
  // Vérifie toutes les 5 minutes les statuts des membres
  cron.schedule('*/5 * * * *', async()=>{
    for(const[,guild] of client.guilds.cache){
      const cfg = getConfig(guild.id);
      if (!cfg?.status_role) continue;
      const statusRole = guild.roles.cache.get(cfg.status_role);
      if (!statusRole) continue;
      try{
        const members = await guild.members.fetch();
        for(const[,member] of members){
          if (member.user.bot) continue;
          const hasStatus = member.presence?.activities?.some(a=>
            a.state?.toLowerCase().includes('.gg/wenzy') ||
            a.name?.toLowerCase().includes('.gg/wenzy')
          );
          if (hasStatus && !member.roles.cache.has(statusRole.id)) {
            await member.roles.add(statusRole).catch(()=>{});
          } else if (!hasStatus && member.roles.cache.has(statusRole.id)) {
            await member.roles.remove(statusRole).catch(()=>{}); // Retire quand le status est enlevé
          }
        }
      }catch{}
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  CLIENT & EVENTS
// ══════════════════════════════════════════════════════════════
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildPresences,
  ]
});
client.commands = new Collection();
for(const cmd of commands) client.commands.set(cmd.data.name, cmd);

client.on(Events.InteractionCreate, async interaction=>{
  if (interaction.isChatInputCommand()) {
    const cmd=client.commands.get(interaction.commandName);if(!cmd)return;
    try{await cmd.execute(interaction);}
    catch(err){
      console.error(`[CMD] ${interaction.commandName}:`,err);
      const r={content:'❌ Erreur interne.',ephemeral:true};
      if(interaction.deferred||interaction.replied) await interaction.editReply(r).catch(()=>{});
      else await interaction.reply(r).catch(()=>{});
    }
    return;
  }
  if (interaction.isButton()){try{await handleButton(interaction);}catch(e){console.error('[BTN]',e.message);}return;}
  if (interaction.isStringSelectMenu()){try{await handleSelectMenu(interaction);}catch(e){console.error('[SELECT]',e.message);}return;}
  if (interaction.isModalSubmit()){try{await handleModal(interaction);}catch(e){console.error('[MODAL]',e.message);}};
});

// ── MESSAGE CREATE ───────────────────────────────────────────
const msgCooldowns = new Map();
client.on(Events.MessageCreate, async message=>{
  if (message.author.bot) return;
  const wasBlocked = await handleAutomod(message);
  if (wasBlocked) return;
  const uid=message.author.id,now=Date.now();

  const cfg=getConfig(message.guild?.id);
  if (!msgCooldowns.has(uid)||now-msgCooldowns.get(uid)>=60000) {
    msgCooldowns.set(uid,now);
    db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
    if (cfg?.xp_enabled!==0&&message.guild) {
      const xpGain=Math.floor(Math.random()*11)+15;
      await addXp(message.guild,uid,xpGain);
    }
    if (cfg?.coins_enabled!==0) {
      const coinsGain=Math.floor(Math.random()*11)+15;
      db.prepare('UPDATE users SET coins=coins+? WHERE discord_id=?').run(coinsGain,uid);
    }
  }

  if (message.content.startsWith('!')) {
    const pv=db.prepare('SELECT * FROM private_vocals WHERE owner_id=?').get(uid);if(!pv)return;
    const pvCh=message.guild?.channels.cache.get(pv.channel_id);if(!pvCh)return;
    const args=message.content.slice(1).trim().split(/\s+/);const cmd=args[0].toLowerCase();
    if(cmd==='open'){await pvCh.permissionOverwrites.edit(message.guild.id,{Connect:true}).catch(()=>{});await message.reply(`✅ Vocal **${pvCh.name}** ouvert.`);}
    else if(cmd==='close'){await pvCh.permissionOverwrites.edit(message.guild.id,{Connect:false}).catch(()=>{});await message.reply(`🔒 Vocal **${pvCh.name}** fermé.`);}
    else if(cmd==='add'){const mention=message.mentions.members?.first();if(!mention)return message.reply('❌ Mentionne un membre.');await pvCh.permissionOverwrites.edit(mention.id,{Connect:true}).catch(()=>{});await message.reply(`✅ <@${mention.id}> peut rejoindre.`);}
    else if(cmd==='kick'){
      const mention=message.mentions.members?.first();if(!mention)return message.reply('❌ Mentionne un membre.');
      if(mention.voice.channelId===pv.channel_id){
        const fb=message.guild.channels.cache.find(c=>c.type===ChannelType.GuildVoice&&!db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(c.id)&&!c.name.toLowerCase().includes('afk'));
        if(fb)await mention.voice.setChannel(fb).catch(()=>{});
        else await mention.voice.disconnect().catch(()=>{});
      }
      await pvCh.permissionOverwrites.delete(mention.id).catch(()=>{});await message.reply(`✅ <@${mention.id}> expulsé.`);
    }
    else if(cmd==='rename'){const newName=args.slice(1).join(' ');if(!newName)return message.reply('❌ Donne un nom.');await pvCh.setName(newName.slice(0,32)).catch(()=>{});await message.reply(`✅ Vocal renommé **${newName}**.`);}
    return;
  }

  if (!message.channel.isThread()) return;
  const trade=db.prepare('SELECT * FROM trades WHERE thread_id=? AND status=?').get(message.channel.id,'in_progress');if(!trade)return;
  const attachment=message.attachments.find(a=>a.contentType?.startsWith('image/')||/\.(jpg|jpeg|png|webp)$/i.test(a.name??''));
  if (!attachment) return;
  if (![trade.poster_id,trade.accepter_id].includes(uid)) return;
  if (trade.screenshot_verified===1) return;
  db.prepare('UPDATE trades SET screenshot_url=? WHERE id=?').run(attachment.url,trade.id);
  const gld=message.guild;
  const mmPanel=gld?.channels.cache.find(c=>c.name.includes('middleman-panel'));
  const staffRoles=['Wenzy','Madame Wenzy','Owners','Co-Owners','Admins','Modérateurs','Middleman'];
  const staffMentions=staffRoles.map(rn=>gld?.roles.cache.find(r=>r.name===rn)).filter(Boolean).map(r=>`<@&${r.id}>`).join(' ');
  await message.channel.send([`📸 **Screenshot reçu de <@${uid}>**`,'','⏳ En attente de validation par le **staff**...','','> Quand le staff validera, le screenshot sera automatiquement envoyé dans **#vouches**.'].join('\n'));
  if (mmPanel) {
    const off=JSON.parse(trade.offer_weapons);
    await mmPanel.send({
      content:`${staffMentions}\n📸 **Screenshot à vérifier — Trade #${String(trade.id).padStart(4,'0')}**`,
      embeds:[new EmbedBuilder().setColor(C.warning).setAuthor({name:`📸 Vérification — Trade #${String(trade.id).padStart(4,'0')}`}).setImage(attachment.url).addFields({name:'👤 Poster',value:`<@${trade.poster_id}>`,inline:true},{name:'👤 Accepter',value:`<@${trade.accepter_id}>`,inline:true},{name:'📤 Offre',value:off.map(w=>`**${w.name}** \`${w.value}v\``).join('\n')||'—',inline:false},{name:'🔗 Thread',value:`<#${message.channel.id}>`,inline:true}).setFooter({text:'✅ Valider → screenshot envoyé dans #vouches | ❌ Rejeter'}).setTimestamp()],
      components:[staffVerifyButtons(trade.id)],
    });
  }
});

// ── VOICE STATE UPDATE ───────────────────────────────────────
client.on(Events.VoiceStateUpdate, async(old,neu)=>{
  const uid=neu.id||old.id,guild=neu.guild||old.guild;
  const cfg=getConfig(guild.id);

  if (!old.channelId&&neu.channelId) {
    if (!isIdleChannel(neu.channel)) db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
  }

  if (old.channelId&&!neu.channelId) {
    if (!isIdleChannel(old.channel)) {
      const s=db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);
      if (s) {
        const min=Math.floor((Math.floor(Date.now()/1000)-s.joined_at)/60);
        if (min>0) {
          db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
          if(cfg?.coins_enabled!==0)db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min,min*10,uid);
          if(cfg?.xp_enabled!==0)await addXp(guild,uid,min*10).catch(()=>{});
        }
        db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);
      }
    }
    if (old.channel) {
      const pv=db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(old.channelId);
      if (pv&&old.channel.members.size===0){db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(old.channelId);await old.channel.delete('Vocal privé vide').catch(()=>{});}
    }
  }

  if (old.channelId&&neu.channelId&&old.channelId!==neu.channelId) {
    if (!isIdleChannel(old.channel)) {
      const s=db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);
      if (s){const min=Math.floor((Math.floor(Date.now()/1000)-s.joined_at)/60);if(min>0){db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);if(cfg?.coins_enabled!==0)db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min,min*10,uid);if(cfg?.xp_enabled!==0)await addXp(guild,uid,min*10).catch(()=>{});}}
    }
    db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);
    if (!isIdleChannel(neu.channel)) db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
    if (old.channel){const pv=db.prepare('SELECT * FROM private_vocals WHERE channel_id=?').get(old.channelId);if(pv&&old.channel.members.size===0){db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(old.channelId);await old.channel.delete('Vocal privé vide').catch(()=>{});}}
  }
});

// ── MEMBER JOIN ──────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async member=>{
  try{
    const cfg=getConfig(member.guild.id);
    if (cfg?.welcome_enabled!==0) {
      const welcomeCh=cfg?.welcome_channel
        ?member.guild.channels.cache.get(cfg.welcome_channel)
        :member.guild.channels.cache.find(c=>c.name.includes('bienvenue')||c.name.includes('welcome'));
      if (welcomeCh) await welcomeCh.send({embeds:[welcomeEmbed(member,member.guild)]});
    }
    await handleAntiRaid(member.guild,member);
    await updateStatChannels(member.guild);
    await sendLog(member.guild,new EmbedBuilder().setColor(C.success).setAuthor({name:'🛬 Nouveau membre'}).addFields({name:'👤 Membre',value:`<@${member.id}> (${member.user.username})`,inline:true},{name:'👥 Total',value:`${member.guild.memberCount}`,inline:true},{name:'📅 Compte créé',value:`<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`,inline:true}).setTimestamp());
    console.log(`[MemberAdd] ${member.user.username}`);
  }catch(e){console.error('[MemberAdd]',e.message);}
});

// ── MEMBER REMOVE ────────────────────────────────────────────
client.on(Events.GuildMemberRemove, async member=>{
  await updateStatChannels(member.guild);
  await sendLog(member.guild,new EmbedBuilder().setColor(C.danger).setAuthor({name:'🛫 Membre parti'}).addFields({name:'👤 Membre',value:`${member.user.username}`,inline:true},{name:'👥 Total',value:`${member.guild.memberCount}`,inline:true}).setTimestamp());
});

// ── CHANNEL DELETE ───────────────────────────────────────────
client.on(Events.ChannelDelete, ch=>{
  db.prepare('DELETE FROM private_vocals WHERE channel_id=?').run(ch.id);
  db.prepare(`UPDATE tickets SET status='closed' WHERE channel_id=? AND status!='closed'`).run(ch.id);
});

// ── CLIENT READY ─────────────────────────────────────────────
client.once(Events.ClientReady, async()=>{
  console.log(`✅ Wenzy Bot v8.0 : ${client.user.tag}`);
  client.user.setActivity('MM2 Trades 🗡️ | /panel', { type:3 });

  const rest = new REST({ version:'10' }).setToken(process.env.DISCORD_TOKEN);
  try{
    const body = commands.map(c=>c.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),{body});
    console.log(`✅ ${body.length} commandes déployées`);
  }catch(e){console.error('❌ Deploy:',e);}

  startYoutubeWatcher(client);
  startStatusWatcher(client);
  await fetchMM2Values();

  cron.schedule('0 * * * *', fetchMM2Values);
  cron.schedule('*/10 * * * *', async()=>{
    for(const[,gld] of client.guilds.cache){
      await updateStatChannels(gld).catch(()=>{});
    }
  });
  cron.schedule('*/30 * * * *', async()=>{
    for(const[,gld] of client.guilds.cache){
      await updateLeaderboards(gld).catch(()=>{});
    }
  });

  for(const[,gld] of client.guilds.cache){
    await gld.members.fetch().catch(()=>{});
    await restoreAllRoles(gld);
    await updateStatChannels(gld);
    await updateLeaderboards(gld);
  }

  const activeGiveaways = db.prepare('SELECT * FROM giveaways WHERE status=?').all('active');
  for(const gw of activeGiveaways){
    const remaining=(gw.ends_at*1000)-Date.now();
    if(remaining>0)setTimeout(()=>endGiveaway(client,gw.id),remaining);
    else await endGiveaway(client,gw.id);
  }
  console.log(`[Giveaways] ${activeGiveaways.length} giveaway(s) repris`);
  console.log('[Wenzy Bot v8.0] Prêt. 6767');
});

client.login(process.env.DISCORD_TOKEN);
