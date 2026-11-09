// ═══════════════════════════════════════════════════════════════
//  WENZY BOT v2 — bot.js  (single file, Railway ready)
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
  INSERT OR IGNORE INTO youtube_last (id,checked_at) VALUES (1,0);
`);

const defaults = [
  ['Chroma Seer',165,'chroma'],['Corrupt',90,'godly'],['Hallowscythe',80,'godly'],
  ['Ancient Seer',200,'ancient'],['Chroma Harvester',150,'chroma'],
  ['Chroma Lightbringer',140,'chroma'],['Elderwood Scythe',85,'godly'],
  ['Batwing',60,'godly'],['Shark',55,'godly'],['Chroma Luger',120,'chroma'],
  ['Icicle',50,'godly'],['Prism',95,'godly'],['Chroma Boneblade',110,'chroma'],
  ['Raygun',45,'godly'],['Snowcannon',40,'godly'],['Spirit',35,'godly'],
  ['Soul',38,'godly'],['Beachy',30,'godly'],
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
function tradeEmbed(trade,poster){
  const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
  const diff=trade.offer_value-trade.want_value,fair=Math.abs(diff)<=20;
  return new EmbedBuilder().setColor(C.primary)
    .setTitle(`🗡️ TRADE #${String(trade.id).padStart(4,'0')}`)
    .setThumbnail(poster?.roblox_avatar??null)
    .addFields(
      {name:'👤 Trader',value:`<@${trade.poster_id}>${poster?.verified?' ✅':' ⚠️'}\n⭐ ${poster?.trade_count??0} trades | ${poster?.vouch_count??0} vouches`,inline:true},
      {name:'📤 OFFRE',value:off.map(w=>`• ${w.name} _(${w.value} pts)_`).join('\n')||'—',inline:true},
      {name:'📥 CHERCHE',value:want.map(w=>`• ${w.name}`).join('\n')||'—',inline:true},
      {name:'💎 Valeur',value:`**${trade.offer_value} pts**`,inline:true},
      {name:'⚖️ Équité',value:fair?'⚖️ Fair':(trade.offer_value>trade.want_value?'📈 Avantageux trader':'📉 Unfair'),inline:true},
      {name:'🏆 Rang',value:getRankLabel(poster?.rank??'new'),inline:true},
    ).setFooter({text:`Trade #${trade.id} • ${new Date(trade.created_at*1000).toLocaleDateString('fr-FR')}`}).setTimestamp();
}
function tradeButtons(id){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_accept_${id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trade_negotiate_${id}`).setLabel('💬 Négocier').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Middleman').setStyle(ButtonStyle.Primary),
  );
}
function threadSummaryEmbed(trade,poster,accepter){
  const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
  const diff=trade.offer_value-trade.want_value,fair=Math.abs(diff)<=20;
  return new EmbedBuilder().setColor(fair?C.success:C.warning)
    .setTitle(`🗡️ TRADE EN COURS — #${String(trade.id).padStart(4,'0')}`)
    .setDescription([
      `> <@${trade.poster_id}> × <@${trade.accepter_id}>`,
      '','**📋 Pour finaliser ce trade :**',
      '1. Rejoins le serveur privé MM2 (lien ci-dessous)',
      '2. Fais le trade en jeu',
      '3. Prends un screenshot de l\'écran **"YOU HAVE ACCEPTED"** (voir exemple)',
      '4. Envoie le screenshot dans CE salon',
      '5. Le bot vérifie et valide automatiquement',
    ].join('\n'))
    .addFields(
      {name:`📤 <@${trade.poster_id}> offre`,value:off.map(w=>`• ${w.name} _(${w.value} pts)_`).join('\n'),inline:true},
      {name:`📥 <@${trade.accepter_id}> reçoit`,value:want.map(w=>`• ${w.name}`).join('\n'),inline:true},
      {name:'⚖️ Résultat',value:fair
        ?`✅ Fair — Diff : ${Math.abs(diff)} pts`
        :`⚠️ Unfair — Diff : ${Math.abs(diff)} pts (avantage ${diff>0?`<@${trade.poster_id}>`:`<@${trade.accepter_id}>`})`,
        inline:false},
    ).setTimestamp();
}
function threadButtons(id){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`trade_middleman_${id}`).setLabel('🛡️ Appeler Middleman').setStyle(ButtonStyle.Primary),
  );
}
function profileEmbed(user,inv){
  const total=inv.reduce((a,w)=>a+w.weapon_value,0);
  return new EmbedBuilder().setColor(C.primary)
    .setTitle(`👤 ${user.roblox_username??'Non lié'}`).setThumbnail(user.roblox_avatar??null)
    .addFields(
      {name:'🎮 Roblox',value:user.verified?`${user.roblox_username} ✅`:'❌ Non lié',inline:true},
      {name:'🏆 Rang',value:getRankLabel(user.rank),inline:true},
      {name:'⭐ Réputation',value:`✅ ${user.trade_count} trades\n💬 ${user.vouch_count} vouches\n🚨 ${user.report_count} reports`,inline:true},
      {name:'📦 Inventory',value:(inv.length?inv.map(w=>`• ${w.weapon_name} ≈ **${w.weapon_value} pts** ${w.verified?'✅':'⚠️'}`).join('\n').slice(0,1000):'— Vide'),inline:false},
      {name:'💎 Valeur',value:`~${total} pts`,inline:true},{name:'🪙 Pièces',value:`${user.coins}`,inline:true},{name:'⏱️ Vocal',value:`${user.vocal_minutes} min`,inline:true},
    ).setTimestamp();
}
function mmPanelEmbed(trade,poster,accepter){
  const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons),diff=trade.offer_value-trade.want_value;
  return new EmbedBuilder().setColor(C.info)
    .setTitle(`🛡️ PANEL MIDDLEMAN — TRADE #${String(trade.id).padStart(4,'0')}`)
    .addFields(
      {name:'👤 Poster',value:`<@${trade.poster_id}> (${poster?.trade_count??0} trades, ${poster?.vouch_count??0} vouches)`,inline:true},
      {name:'👤 Accepter',value:`<@${trade.accepter_id}> (${accepter?.trade_count??0} trades, ${accepter?.vouch_count??0} vouches)`,inline:true},
      {name:'📤 Offre poster',value:off.map(w=>`${w.name} — ${w.value}pts`).join('\n'),inline:false},
      {name:'📥 Offre accept',value:want.map(w=>w.name).join('\n'),inline:false},
      {name:'⚖️ Différence',value:`${Math.abs(diff)} pts (${diff>0?'avantage poster':diff<0?'avantage accepter':'égal'})`,inline:false},
    ).setTimestamp();
}
function mmButtons(id){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mm_validate_${id}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`mm_cancel_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mm_report_${id}`).setLabel('🚨 Report scam').setStyle(ButtonStyle.Secondary),
  );
}

// ── ROBLOX HELPERS ───────────────────────────────────────────
function genCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='WENZY-';for(let i=0;i<5;i++)s+=c[Math.floor(Math.random()*c.length)];return s;}
async function searchRobloxUser(u){const r=await axios.post('https://users.roblox.com/v1/usernames/users',{usernames:[u],excludeBannedUsers:true});return r.data.data?.[0]??null;}
async function getRobloxDescription(id){const r=await axios.get(`https://users.roblox.com/v1/users/${id}`);return r.data.description??'';}
async function getRobloxAvatar(id){try{const r=await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`);return r.data.data?.[0]?.imageUrl??null;}catch{return null;}}

// ── TRADE HELPERS ────────────────────────────────────────────
function parseWeapons(s){return s.split(',').map(x=>x.trim()).filter(Boolean);}
function calcValue(names){let total=0;const details=[];for(const n of names){const row=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(n);const val=row?.value??0;total+=val;details.push({name:row?.name??n,value:val});}return{total,details};}
function getFreeServer(){return db.prepare('SELECT * FROM private_servers WHERE in_use=0 LIMIT 1').get();}

// ── CLAUDE VISION ────────────────────────────────────────────
async function verifyMM2Screenshot(imageUrl){
  const KEY=process.env.ANTHROPIC_API_KEY;
  if(!KEY){console.warn('[Vision] no key — auto-valid');return{valid:true,reason:'Vision non configurée — validé auto'};}
  try{
    const img=await axios.get(imageUrl,{responseType:'arraybuffer'});
    const b64=Buffer.from(img.data).toString('base64');
    const mime=img.headers['content-type']||'image/jpeg';
    const res=await axios.post('https://api.anthropic.com/v1/messages',{
      model:'claude-sonnet-4-6',max_tokens:150,
      messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:mime,data:b64}},
        {type:'text',text:'Analyse ce screenshot MM2 (Murder Mystery 2 Roblox). Réponds UNIQUEMENT JSON valide, rien d\'autre.\nValide si: texte "YOU HAVE ACCEPTED" visible + interface de trade MM2 avec armes.\nInvalide si: pas de trade UI, image hors-jeu, montage, lien, flou.\nJSON: {"valid":true/false,"confidence":0-100,"reason":"explication courte"}'},
      ]}],
    },{headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','content-type':'application/json'}});
    const text=res.data.content?.[0]?.text??'{}';
    return JSON.parse(text.replace(/```json|```/g,'').trim());
  }catch(e){console.error('[Vision]',e.message);return{valid:false,reason:`Erreur: ${e.message}`};}
}

// ── MM2 VALUES SYNC ──────────────────────────────────────────
async function fetchMM2Values(){
  try{
    const res=await axios.get('https://www.mm2values.com/api/values',{timeout:5000});
    const items=res.data?.items??res.data;
    if(!Array.isArray(items))return;
    const stmt=db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now')) ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`);
    let count=0;
    for(const item of items){if(item.name&&item.value>0){stmt.run(item.name,Math.round(item.value),item.tier??'godly');count++;}}
    console.log(`[Values] ${count} armes synced`);
  }catch(e){console.warn('[Values] sync failed:',e.message);}
}

// ── SHARED FUNCTIONS ─────────────────────────────────────────
async function doVerify(interaction){
  const did=interaction.user.id;
  const user=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if(!user?.verify_code)return interaction.editReply('❌ Lance d\'abord la vérification via le bouton dans le salon **vérification**.');
  if(user.verified)return interaction.editReply(`✅ Déjà vérifié : **${user.roblox_username}** !`);
  let desc;try{desc=await getRobloxDescription(user.roblox_id);}catch{return interaction.editReply('❌ Erreur Roblox API. Réessaie.');}
  if(!desc.includes(user.verify_code))return interaction.editReply(`❌ Code \`${user.verify_code}\` introuvable dans ta bio.\nAssure-toi de l'avoir sauvegardé, puis réessaie.`);
  const avatar=await getRobloxAvatar(user.roblox_id);
  db.prepare('UPDATE users SET verified=1,roblox_avatar=?,rank=? WHERE discord_id=?').run(avatar,'new',did);
  try{
    const g=interaction.guild;
    const nv=g.roles.cache.find(r=>r.name==='🆕 Nouveau');
    const nonv=g.roles.cache.find(r=>r.name==='🔒 Non Vérifié');
    if(nonv)await interaction.member.roles.remove(nonv).catch(()=>{});
    if(nv)await interaction.member.roles.add(nv).catch(()=>{});
  }catch{}
  await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.success).setTitle('✅ Compte Roblox vérifié !').setThumbnail(avatar)
    .setDescription([`Discord lié à **${user.roblox_username}** !`,'','Tu as maintenant accès à tous les salons.','Poste ton premier trade via le bouton dans **poster-un-trade** !'].join('\n'))]});
}

async function postTrade(interaction,did,offreStr,chercheStr){
  const user=db.prepare('SELECT * FROM users WHERE discord_id=?').get(did);
  if(!user?.verified)return interaction.editReply('❌ Lie ton compte Roblox d\'abord via le salon **vérification**.');
  const{total:ov,details:od}=calcValue(parseWeapons(offreStr));
  const{total:wv,details:wd}=calcValue(parseWeapons(chercheStr));
  if(user.rank==='new'&&ov>100)return interaction.editReply('⚠️ Nouveaux membres limités à **100 pts** max. Fais quelques trades pour débloquer.');
  const res=db.prepare('INSERT INTO trades (poster_id,offer_weapons,want_weapons,offer_value,want_value) VALUES (?,?,?,?,?)').run(did,JSON.stringify(od),JSON.stringify(wd),ov,wv);
  const tid=res.lastInsertRowid;
  const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
  const ch=interaction.guild.channels.cache.find(c=>c.name.includes('post-trades'));
  if(!ch)return interaction.editReply('❌ Salon post-trades introuvable. Lance `/wenzy-setup`.');
  const msg=await ch.send({embeds:[tradeEmbed(trade,user)],components:[tradeButtons(tid)]});
  db.prepare('UPDATE trades SET message_id=?,channel_id=? WHERE id=?').run(msg.id,ch.id,tid);
  await interaction.editReply(`✅ Trade **#${tid}** posté dans <#${ch.id}> !`);
}

async function cancelTrade(interaction,did,tradeId){
  const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if(!trade)return interaction.editReply('❌ Trade introuvable.');
  const isAdmin=interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if(trade.poster_id!==did&&!isAdmin)return interaction.editReply('❌ Seul le posteur ou un admin peut annuler.');
  if(!['open','in_progress'].includes(trade.status))return interaction.editReply('❌ Ce trade ne peut plus être annulé.');
  db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled',tradeId);
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  // Supprimer thread
  if(trade.thread_id){try{const t=await interaction.guild.channels.fetch(trade.thread_id).catch(()=>null);if(t){await t.send('❌ **Trade annulé.** Ce salon sera supprimé dans 5 secondes.');setTimeout(()=>t.delete('Trade annulé').catch(()=>{}),5000);}}catch{}}
  // Supprimer message trade
  if(trade.message_id&&trade.channel_id){try{const c=await interaction.guild.channels.fetch(trade.channel_id).catch(()=>null);const m=c?await c.messages.fetch(trade.message_id).catch(()=>null):null;if(m)await m.delete().catch(()=>{});}catch{}}
  await interaction.editReply(`✅ Trade **#${tradeId}** annulé et retiré.`);
}

async function completeTrade(guild,tradeId,screenshotUrl){
  const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tradeId);
  if(!trade)return false;
  db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tradeId);
  db.prepare(`UPDATE trades SET status='completed',completed_at=strftime('%s','now'),screenshot_url=?,screenshot_verified=1 WHERE id=?`).run(screenshotUrl,tradeId);
  for(const uid of[trade.poster_id,trade.accepter_id]){
    if(!uid)continue;
    db.prepare('UPDATE users SET coins=coins+50,trade_count=trade_count+1 WHERE discord_id=?').run(uid);
    const u=db.prepare('SELECT trade_count FROM users WHERE discord_id=?').get(uid);
    db.prepare('UPDATE users SET rank=? WHERE discord_id=?').run(getRank(u.trade_count),uid);
    db.prepare('INSERT INTO vouches (from_id,to_id,trade_id) VALUES (?,?,?)').run(
      uid===trade.poster_id?trade.accepter_id:trade.poster_id,uid,tradeId
    );
    db.prepare('UPDATE users SET vouch_count=vouch_count+1 WHERE discord_id=?').run(uid);
  }
  // Vouch channel — plain text + screenshot
  const vCh=guild.channels.cache.find(c=>c.name.includes('vouches'));
  if(vCh){
    const poster=db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.poster_id);
    const accepter=db.prepare('SELECT * FROM users WHERE discord_id=?').get(trade.accepter_id);
    const off=JSON.parse(trade.offer_weapons),want=JSON.parse(trade.want_weapons);
    await vCh.send([
      `✅ **Trade #${String(tradeId).padStart(4,'0')} — COMPLÉTÉ**`,
      ``,
      `📤 <@${trade.poster_id}> (${getRankLabel(poster?.rank??'new')}) offrait : ${off.map(w=>w.name).join(', ')}`,
      `📥 <@${trade.accepter_id}> (${getRankLabel(accepter?.rank??'new')}) cherchait : ${want.map(w=>w.name).join(', ')}`,
      ``,
      `💎 **${trade.offer_value} pts** échangés | +50 🪙 chacun | +1 vouch mutuel`,
      `📸 Preuve :`,
    ].join('\n'));
    if(screenshotUrl)await vCh.send(screenshotUrl);
  }
  // Fermer thread
  if(trade.thread_id){try{const t=await guild.channels.fetch(trade.thread_id).catch(()=>null);if(t){await t.send(['🎉 **Trade finalisé !**','',`✅ <@${trade.poster_id}> × <@${trade.accepter_id}>`,`💎 **${trade.offer_value} pts** | +50 🪙 chacun | +1 vouch mutuel`,'','_Ce salon sera archivé dans 10 secondes._'].join('\n'));setTimeout(async()=>{try{await t.setArchived(true,'Trade terminé');}catch{}},10000);}}catch{}}
  return true;
}

async function postWeaponValues(ch){
  const weapons=db.prepare('SELECT * FROM weapon_values ORDER BY value DESC LIMIT 50').all();
  if(!weapons.length)return;
  const tiers=['ancient','chroma','godly','legendary','epic','rare','uncommon','common'];
  const grouped={};for(const t of tiers)grouped[t]=weapons.filter(w=>w.tier===t);
  const lines=[];
  for(const t of tiers){if(!grouped[t].length)continue;lines.push(`**${TIER_LABELS[t]??t}**`);for(const w of grouped[t])lines.push(`• ${w.name} — **${w.value} pts**`);lines.push('');}
  const msgs=await ch.messages.fetch({limit:10});for(const m of msgs.values())if(m.author.bot)await m.delete().catch(()=>{});
  await ch.send({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📦 Valeurs Armes MM2').setDescription(lines.join('\n').slice(0,3900)).setFooter({text:'Mise à jour automatique toutes les heures'}).setTimestamp()]});
}

// ── COMMANDS ─────────────────────────────────────────────────
const commands=[

  {data:new SlashCommandBuilder().setName('wenzy-setup').setDescription('🏗️ Configure le serveur').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
   async execute(interaction){
    await interaction.deferReply({ephemeral:true});
    const guild=interaction.guild,log=[];
    const roleDefs=[
      {name:'👑 Owner',color:0xE74C3C,hoist:true},{name:'⚡ Admin',color:0xE67E22,hoist:true},
      {name:'🛡️ Modérateur',color:0x3498DB,hoist:true},{name:'🤝 Middleman',color:0x2ECC71,hoist:true},
      {name:'💎 Elite Trader',color:0x9B59B6,hoist:true},{name:'⭐ Fiable',color:0xF1C40F,hoist:false},
      {name:'✅ Confirmé',color:0x27AE60,hoist:false},{name:'🆕 Nouveau',color:0x95A5A6,hoist:false},
      {name:'🔒 Non Vérifié',color:0x2C2F33,hoist:false},
    ];
    const cr={};
    for(const rd of roleDefs){const ex=guild.roles.cache.find(r=>r.name===rd.name);if(ex){cr[rd.name]=ex;log.push(`♻️ ${rd.name}`);}else{cr[rd.name]=await guild.roles.create({name:rd.name,color:rd.color,hoist:rd.hoist});log.push(`✅ Rôle ${rd.name}`);}}
    const admins=['👑 Owner','⚡ Admin','🛡️ Modérateur'].map(n=>cr[n]).filter(Boolean);
    const nonv=cr['🔒 Non Vérifié'];
    const catDefs=[
      {name:'🔒 VÉRIFICATION',chs:[{name:'🔑┃verification',verif:true}]},
      {name:'📌 WENZY SYSTEM',chs:[{name:'📌┃règles-et-info'},{name:'📊┃leaderboard'},{name:'📋┃logs',staff:true},{name:'🔗┃link-roblox'}]},
      {name:'🗡️ MM2 TRADING',chs:[{name:'🗡️┃post-trades'},{name:'📬┃poster-un-trade'},{name:'💰┃price-check'},{name:'🏆┃vouches'},{name:'🛡️┃middleman-panel',staff:true},{name:'📦┃weapon-values'}]},
      {name:'💬 COMMUNAUTÉ',chs:[{name:'💬┃général'},{name:'📺┃vidéos-wenzy'},{name:'🎙️┃vocal-général',voice:true}]},
      {name:'🛒 ECONOMY',chs:[{name:'🛒┃boutique'}]},
    ];
    const cm={};
    for(const cd of catDefs){
      let cat=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===cd.name);
      if(!cat){cat=await guild.channels.create({name:cd.name,type:ChannelType.GuildCategory,permissionOverwrites:[{id:guild.id,allow:[PermissionFlagsBits.ViewChannel]},nonv?{id:nonv.id,deny:[PermissionFlagsBits.ViewChannel]}:null].filter(Boolean)});}
      log.push(`📁 ${cd.name}`);
      for(const ch of cd.chs){
        if(guild.channels.cache.find(c=>c.name===ch.name)){cm[ch.name]=guild.channels.cache.find(c=>c.name===ch.name);log.push(`♻️ ${ch.name}`);continue;}
        const pows=[];
        if(ch.verif){pows.push({id:guild.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]});if(nonv)pows.push({id:nonv.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});}
        else if(ch.staff){pows.push({id:guild.id,deny:[PermissionFlagsBits.ViewChannel]});for(const r of admins)pows.push({id:r.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]});}
        else{pows.push({id:guild.id,allow:[PermissionFlagsBits.ViewChannel]});if(nonv)pows.push({id:nonv.id,deny:[PermissionFlagsBits.ViewChannel]});}
        cm[ch.name]=await guild.channels.create({name:ch.name,type:ch.voice?ChannelType.GuildVoice:ChannelType.GuildText,parent:cat.id,permissionOverwrites:pows});
        log.push(`✅ Salon ${ch.name}`);
      }
    }
    // Embeds
    const verifCh=cm['🔑┃verification'];
    if(verifCh){const msgs=await verifCh.messages.fetch({limit:3});if(!msgs.size){await verifCh.send({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('🔑 Vérification Roblox').setDescription(['**Bienvenue !** Pour accéder à tous les salons, lie ton compte Roblox.','','**Étape 1** — Clique sur le bouton','**Étape 2** — Entre ton pseudo Roblox dans le formulaire','**Étape 3** — Colle le code dans ta bio Roblox','**Étape 4** — Clique Confirmer'].join('\n')).setFooter({text:'Wenzy Bot — API Roblox officielle'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte Roblox').setStyle(ButtonStyle.Primary))]});log.push('✅ Embed vérification');}}
    const linkCh=cm['🔗┃link-roblox'];
    if(linkCh){const msgs=await linkCh.messages.fetch({limit:3});if(!msgs.size){await linkCh.send({embeds:[new EmbedBuilder().setColor(C.info).setTitle('🔗 Lier ton compte Roblox').setDescription(['Clique sur le bouton pour lier ou re-lier ton compte Roblox.','','Étape 1 → bouton, Étape 2 → pseudo Roblox, Étape 3 → bio, Étape 4 → Vérifier'].join('\n'))],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_link_start').setLabel('🔗 Lier mon compte').setStyle(ButtonStyle.Primary))]});log.push('✅ Embed link-roblox');}}
    const ptCh=cm['📬┃poster-un-trade'];
    if(ptCh){const msgs=await ptCh.messages.fetch({limit:3});if(!msgs.size){await ptCh.send({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📬 Poster un Trade MM2').setDescription(['Clique sur le bouton pour créer un trade.','','• Ce que tu offres (séparés par virgules)','• Ce que tu cherches en échange','','_Le trade sera publié dans post-trades automatiquement._'].join('\n'))],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_post_trade').setLabel('🗡️ Poster un Trade').setStyle(ButtonStyle.Success))]});log.push('✅ Embed poster-un-trade');}}
    const valCh=cm['📦┃weapon-values'];if(valCh){await postWeaponValues(valCh);log.push('✅ Valeurs armes');}
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.success).setTitle('🏗️ Setup terminé !').setDescription(log.map(l=>`\`${l}\``).join('\n').slice(0,3900)).addFields({name:'📋 Prochaines étapes',value:['1. Donne-toi le rôle **👑 Owner**','2. Ajoute `ANTHROPIC_API_KEY` dans Railway','3. `/addserver <lien>` pour les serveurs privés'].join('\n')}).setTimestamp()]});
  }},

  {data:new SlashCommandBuilder().setName('link').setDescription('🔗 Lie ton compte Roblox').addStringOption(o=>o.setName('username').setDescription('Ton pseudo Roblox exact').setRequired(true)),
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
  }},

  {data:new SlashCommandBuilder().setName('verify').setDescription('✅ Confirme la vérification Roblox'),
   async execute(interaction){await interaction.deferReply({ephemeral:true});await doVerify(interaction);}},

  {data:new SlashCommandBuilder().setName('trade').setDescription('🗡️ Système de trades MM2')
    .addSubcommand(s=>s.setName('post').setDescription('📤 Poster un trade').addStringOption(o=>o.setName('offre').setDescription('Armes offertes (virgules)').setRequired(true)).addStringOption(o=>o.setName('cherche').setDescription('Ce que tu cherches').setRequired(true)))
    .addSubcommand(s=>s.setName('cancel').setDescription('❌ Annuler ton trade').addIntegerOption(o=>o.setName('id').setDescription('ID du trade').setRequired(true)))
    .addSubcommand(s=>s.setName('check').setDescription('⚖️ Price check').addStringOption(o=>o.setName('offre').setDescription('Armes offertes').setRequired(true)).addStringOption(o=>o.setName('recois').setDescription('Armes reçues').setRequired(true))),
   async execute(interaction){
    const sub=interaction.options.getSubcommand(),did=interaction.user.id;
    if(sub==='post'){await interaction.deferReply({ephemeral:true});await postTrade(interaction,did,interaction.options.getString('offre'),interaction.options.getString('cherche'));}
    else if(sub==='cancel'){await interaction.deferReply({ephemeral:true});await cancelTrade(interaction,did,interaction.options.getInteger('id'));}
    else if(sub==='check'){
      await interaction.deferReply({ephemeral:true});
      const{total:ov,details:od}=calcValue(parseWeapons(interaction.options.getString('offre')));
      const{total:rv,details:rd}=calcValue(parseWeapons(interaction.options.getString('recois')));
      const diff=ov-rv,fair=Math.abs(diff)<=20;
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(fair?C.success:(diff>0?C.danger:C.gold)).setTitle('⚖️ Price Check MM2')
        .addFields({name:'📤 Tu offres',value:od.map(w=>`${w.name} → **${w.value} pts**`).join('\n')+`\n**Total : ${ov} pts**`,inline:true},{name:'📥 Tu reçois',value:rd.map(w=>`${w.name} → **${w.value} pts**`).join('\n')+`\n**Total : ${rv} pts**`,inline:true},{name:'⚖️ Résultat',value:(fair?'⚖️ Fair':(diff>0?'📉 Unfair — tu perds':'📈 Avantageux pour toi'))+`\nDiff : ${Math.abs(diff)} pts`,inline:false}).setTimestamp()]});
    }
  }},

  {data:new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche un profil').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(false)),
   async execute(interaction){
    await interaction.deferReply();
    const target=interaction.options.getUser('membre')??interaction.user;
    const user=db.prepare('SELECT * FROM users WHERE discord_id=?').get(target.id);
    if(!user)return interaction.editReply(`❌ <@${target.id}> n'a pas encore de profil.`);
    const inv=db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(target.id);
    const embed=profileEmbed(user,inv).setAuthor({name:target.username,iconURL:target.displayAvatarURL()});
    await interaction.editReply({embeds:[embed]});
  }},

  {data:new SlashCommandBuilder().setName('inventory').setDescription('📦 Gère ton inventory MM2')
    .addSubcommand(s=>s.setName('add').setDescription('➕ Ajouter une arme').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)))
    .addSubcommand(s=>s.setName('remove').setDescription('➖ Retirer une arme').addStringOption(o=>o.setName('arme').setDescription('Nom exact').setRequired(true)))
    .addSubcommand(s=>s.setName('view').setDescription('👀 Voir')),
   async execute(interaction){
    await interaction.deferReply({ephemeral:true});const sub=interaction.options.getSubcommand(),did=interaction.user.id;
    if(sub==='add'){const name=interaction.options.getString('arme');const row=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name)=LOWER(?)').get(name);const val=row?.value??0;db.prepare('INSERT INTO inventory (discord_id,weapon_name,weapon_value,verified) VALUES (?,?,?,?)').run(did,row?.name??name,val,val>0?1:0);await interaction.editReply(`✅ **${row?.name??name}** ajouté — **${val} pts** ${val>0?'✅':'⚠️ valeur inconnue'}`);}
    else if(sub==='remove'){const name=interaction.options.getString('arme');const r=db.prepare('DELETE FROM inventory WHERE discord_id=? AND LOWER(weapon_name)=LOWER(?)').run(did,name);if(!r.changes)return interaction.editReply('❌ Introuvable.');await interaction.editReply(`✅ **${name}** retiré.`);}
    else{const inv=db.prepare('SELECT * FROM inventory WHERE discord_id=?').all(did);if(!inv.length)return interaction.editReply('📦 Inventory vide. Ajoute avec `/inventory add <arme>`.');const total=inv.reduce((a,w)=>a+w.weapon_value,0);await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.primary).setTitle('📦 Ton Inventory MM2').setDescription(inv.map(w=>`• **${w.weapon_name}** — ${w.weapon_value} pts ${w.verified?'✅':'⚠️'}`).join('\n').slice(0,2000)).setFooter({text:`Valeur totale : ~${total} pts`})]});}
  }},

  {data:new SlashCommandBuilder().setName('updatevalue').setDescription('💰 (Admin) Mettre à jour une arme').addStringOption(o=>o.setName('arme').setDescription('Nom').setRequired(true)).addIntegerOption(o=>o.setName('valeur').setDescription('Valeur en pts').setRequired(true)).addStringOption(o=>o.setName('tier').setDescription('Tier').addChoices({name:'Godly',value:'godly'},{name:'Chroma',value:'chroma'},{name:'Ancient',value:'ancient'},{name:'Legendary',value:'legendary'},{name:'Epic',value:'epic'},{name:'Rare',value:'rare'})).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
   async execute(interaction){
    await interaction.deferReply({ephemeral:true});
    const name=interaction.options.getString('arme'),value=interaction.options.getInteger('valeur'),tier=interaction.options.getString('tier')??'godly';
    db.prepare(`INSERT INTO weapon_values (name,value,tier,updated_at) VALUES (?,?,?,strftime('%s','now')) ON CONFLICT(name) DO UPDATE SET value=excluded.value,tier=excluded.tier,updated_at=excluded.updated_at`).run(name,value,tier);
    await interaction.editReply(`✅ **${name}** → **${value} pts** (${tier})`);
  }},

  {data:new SlashCommandBuilder().setName('updatevalues').setDescription('🔄 (Admin) Sync valeurs MM2 live').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
   async execute(interaction){
    await interaction.deferReply({ephemeral:true});await fetchMM2Values();
    const count=db.prepare('SELECT COUNT(*) as c FROM weapon_values').get().c;
    await interaction.editReply(`✅ Sync terminée. **${count}** armes dans la base.`);
  }},

  {data:new SlashCommandBuilder().setName('values').setDescription('📦 Voir les valeurs MM2').addStringOption(o=>o.setName('tier').setDescription('Filtrer').addChoices({name:'🌈 Chroma',value:'chroma'},{name:'⚡ Ancient',value:'ancient'},{name:'🔥 Godly',value:'godly'},{name:'Toutes',value:'all'})).addStringOption(o=>o.setName('arme').setDescription('Chercher une arme')),
   async execute(interaction){
    await interaction.deferReply();
    const tier=interaction.options.getString('tier')??'all',arme=interaction.options.getString('arme');
    let w;
    if(arme)w=db.prepare('SELECT * FROM weapon_values WHERE LOWER(name) LIKE LOWER(?) ORDER BY value DESC').all(`%${arme}%`);
    else if(tier==='all')w=db.prepare('SELECT * FROM weapon_values ORDER BY value DESC LIMIT 30').all();
    else w=db.prepare('SELECT * FROM weapon_values WHERE tier=? ORDER BY value DESC').all(tier);
    if(!w.length)return interaction.editReply('❌ Aucune arme trouvée.');
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(tier!=='all'?(TIER_COLORS[tier]??C.primary):C.primary).setTitle(`📦 Valeurs MM2${tier!=='all'?` — ${TIER_LABELS[tier]??tier}`:''}`).setDescription(w.map(x=>`• **${x.name}** — ${x.value} pts _(${TIER_LABELS[x.tier]??x.tier})_`).join('\n').slice(0,2000)).setFooter({text:`${w.length} arme(s) • Sync auto toutes les heures`}).setTimestamp()]});
  }},

  {data:new SlashCommandBuilder().setName('shop').setDescription('🛒 Boutique'),
   async execute(interaction){
    await interaction.deferReply({ephemeral:true});
    const user=db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold).setTitle('🛒 Boutique Wenzy').setDescription([{id:'color_role',label:'🎨 Rôle couleur custom',price:500},{id:'vip_role',label:'👑 Rôle VIP',price:1000},{id:'elite_badge',label:'🏆 Badge Elite',price:10000}].map(i=>`${i.label} — **${i.price} 🪙**`).join('\n')).addFields({name:'🪙 Tes pièces',value:`**${user?.coins??0}**`,inline:true})]});
  }},

  {data:new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Classement traders'),
   async execute(interaction){
    await interaction.deferReply();
    const top=db.prepare('SELECT discord_id,roblox_username,trade_count,vouch_count,coins,rank FROM users ORDER BY trade_count DESC LIMIT 10').all();
    if(!top.length)return interaction.editReply('Aucun trader enregistré.');
    const medals=['🥇','🥈','🥉'];
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.gold).setTitle('🏆 Top Traders MM2').setDescription(top.map((u,i)=>`${medals[i]??`**${i+1}.**`} <@${u.discord_id}> — ✅ **${u.trade_count}** trades | 💬 **${u.vouch_count}** vouches | 🪙 ${u.coins} | ${getRankLabel(u.rank)}`).join('\n')).setTimestamp()]});
  }},

  {data:new SlashCommandBuilder().setName('addserver').setDescription('🎮 (Admin) Ajouter serveur privé MM2').addStringOption(o=>o.setName('lien').setDescription('Lien Roblox').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
   async execute(interaction){
    await interaction.deferReply({ephemeral:true});
    const link=interaction.options.getString('lien');
    try{db.prepare('INSERT INTO private_servers (link,added_by) VALUES (?,?)').run(link,interaction.user.id);}catch{return interaction.editReply('⚠️ Ce lien est déjà dans le pool.');}
    const count=db.prepare('SELECT COUNT(*) as c FROM private_servers WHERE in_use=0').get().c;
    await interaction.editReply(`✅ Serveur ajouté ! **${count}** disponibles.`);
  }},

  {data:new SlashCommandBuilder().setName('listservers').setDescription('📋 (Admin) Voir pool serveurs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
   async execute(interaction){
    await interaction.deferReply({ephemeral:true});
    const servers=db.prepare('SELECT * FROM private_servers').all();
    if(!servers.length)return interaction.editReply('❌ Pool vide.');
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(C.info).setTitle('🎮 Pool Serveurs MM2').setDescription(servers.map(s=>`**#${s.id}** ${s.in_use?'🔴':'🟢'} \`${s.link.slice(0,50)}\``).join('\n').slice(0,2000)).setFooter({text:`Total : ${servers.length} | Libres : ${servers.filter(s=>!s.in_use).length}`})]});
  }},

  {data:new SlashCommandBuilder().setName('report').setDescription('🚨 Reporter un scam').addUserOption(o=>o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o=>o.setName('raison').setDescription('Raison').setRequired(true)).addIntegerOption(o=>o.setName('trade').setDescription('ID trade (optionnel)')),
   async execute(interaction){
    await interaction.deferReply({ephemeral:true});
    const reported=interaction.options.getUser('membre'),reason=interaction.options.getString('raison'),tradeId=interaction.options.getInteger('trade');
    db.prepare('INSERT INTO reports (reporter_id,reported_id,trade_id,reason) VALUES (?,?,?,?)').run(interaction.user.id,reported.id,tradeId??null,reason);
    db.prepare('UPDATE users SET report_count=report_count+1 WHERE discord_id=?').run(reported.id);
    const logsCh=interaction.guild.channels.cache.find(c=>c.name.includes('logs'));
    if(logsCh)await logsCh.send({embeds:[new EmbedBuilder().setColor(C.danger).setTitle('🚨 Nouveau Report').addFields({name:'🕵️ Reporter',value:`<@${interaction.user.id}>`,inline:true},{name:'⚠️ Reporté',value:`<@${reported.id}>`,inline:true},{name:'🗡️ Trade',value:tradeId?`#${tradeId}`:'Non précisé',inline:true},{name:'📝 Raison',value:reason}).setTimestamp()]});
    await interaction.editReply(`✅ Report envoyé contre <@${reported.id}>.`);
  }},
];

// ── BUTTON HANDLER ───────────────────────────────────────────
async function handleButton(interaction){
  const{customId,guild,user}=interaction;

  if(customId==='btn_link_start'){
    const modal=new ModalBuilder().setCustomId('modal_link_roblox').setTitle('🔗 Lier ton compte Roblox');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roblox_username').setLabel('Ton pseudo Roblox exact').setStyle(TextInputStyle.Short).setPlaceholder('ex: WenzyFR').setRequired(true).setMinLength(3).setMaxLength(20)));
    return interaction.showModal(modal);
  }

  if(customId==='btn_verify_now'){await interaction.deferReply({ephemeral:true});return doVerify(interaction);}

  if(customId==='btn_post_trade'){
    const modal=new ModalBuilder().setCustomId('modal_post_trade').setTitle('🗡️ Poster un Trade MM2');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_offre').setLabel('Armes que tu offres (virgules)').setStyle(TextInputStyle.Short).setPlaceholder('ex: Chroma Seer, Corrupt').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_cherche').setLabel('Ce que tu cherches').setStyle(TextInputStyle.Short).setPlaceholder('ex: Ancient Seer').setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if(customId.startsWith('trade_accept_')){
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
    let thread;
    try{const tCh=guild.channels.cache.find(c=>c.name.includes('post-trades'));thread=await tCh.threads.create({name:`🗡️ Trade #${tid} — ${poster?.roblox_username??'Trader'} × ${accepter?.roblox_username??'Accepter'}`,type:ChannelType.PrivateThread,reason:`Trade #${tid}`,invitable:false});await thread.members.add(trade.poster_id);await thread.members.add(user.id);}catch(e){console.error('Thread:',e.message);}
    if(thread){
      db.prepare('UPDATE trades SET thread_id=? WHERE id=?').run(thread.id,tid);
      const server=getFreeServer();
      if(server){db.prepare('UPDATE private_servers SET in_use=1,trade_id=? WHERE id=?').run(tid,server.id);db.prepare('UPDATE trades SET server_link=? WHERE id=?').run(server.link,tid);}
      await thread.send({embeds:[threadSummaryEmbed(updated,poster,accepter)],components:[threadButtons(tid)]});
      if(server)await thread.send(`🎮 **Serveur Privé MM2 — Rejoins maintenant :**\n${server.link}`);
      await thread.send('📸 **Exemple de screenshot attendu — envoie un screenshot identique après le trade :**');
      if(fs.existsSync(REF_SCREEN_PATH))await thread.send({files:[REF_SCREEN_PATH]});
      const mmPanel=guild.channels.cache.find(c=>c.name.includes('middleman-panel'));
      if(mmPanel){const mmRole=guild.roles.cache.find(r=>r.name.includes('Middleman'));await mmPanel.send({content:mmRole?`<@&${mmRole.id}>`:'🛡️ Middlemen',embeds:[mmPanelEmbed(updated,poster,accepter)],components:[mmButtons(tid)]});}
    }
    return interaction.editReply(`✅ Trade **#${tid}** accepté ! Regarde le thread privé créé.`);
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
    if(mmRole&&!interaction.member.roles.cache.has(mmRole.id))return interaction.editReply('❌ Réservé aux middlemen.');
    const trade=db.prepare('SELECT * FROM trades WHERE id=?').get(tid);
    await completeTrade(guild,tid,trade?.screenshot_url??null);
    return interaction.editReply(`✅ Trade **#${tid}** validé.`);
  }
  if(customId.startsWith('mm_cancel_')){
    await interaction.deferReply({ephemeral:true});
    const tid=parseInt(customId.replace('mm_cancel_',''));
    db.prepare('UPDATE trades SET status=? WHERE id=?').run('cancelled',tid);
    db.prepare('UPDATE private_servers SET in_use=0,trade_id=NULL WHERE trade_id=?').run(tid);
    return interaction.editReply(`❌ Trade **#${tid}** annulé.`);
  }
  if(customId.startsWith('mm_report_')){
    await interaction.deferReply({ephemeral:true});
    const tid=parseInt(customId.replace('mm_report_',''));
    db.prepare('UPDATE trades SET status=? WHERE id=?').run('disputed',tid);
    const logsCh=guild.channels.cache.find(c=>c.name.includes('logs'));
    if(logsCh)await logsCh.send(`🚨 **SCAM REPORT** — Trade **#${tid}** signalé par <@${user.id}>.`);
    return interaction.editReply('🚨 Scam reporté. Enquête ouverte.');
  }
}

// ── MODAL HANDLER ────────────────────────────────────────────
async function handleModal(interaction){
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
    return postTrade(interaction,interaction.user.id,interaction.fields.getTextInputValue('trade_offre'),interaction.fields.getTextInputValue('trade_cherche'));
  }
}

// ── YOUTUBE WATCHER ──────────────────────────────────────────
function startYoutubeWatcher(client){
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
      for(const[,guild]of client.guilds.cache){
        const ch=guild.channels.cache.find(c=>c.name.includes('vidéos-wenzy')||c.name.includes('videos-wenzy'));
        if(!ch)continue;
        await ch.send({content:`📺 @everyone **Wenzy vient de poster une nouvelle vidéo !**\n${url}`,embeds:[new EmbedBuilder().setColor(C.danger).setTitle('🔴 NOUVELLE VIDÉO').setDescription(`**${snippet.title}**`).setImage(snippet.thumbnails.high?.url??snippet.thumbnails.default?.url).setFooter({text:`Publiée le ${new Date(snippet.publishedAt).toLocaleDateString('fr-FR')}`}).setTimestamp()]});
      }
      console.log('[YouTube] Nouvelle vidéo:',snippet.title);
    }catch(e){console.error('[YouTube]',e.message);}
  });
  console.log('[YouTube] Watcher actif (5min)');
}

// ── CLIENT ───────────────────────────────────────────────────
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildMembers]});
client.commands=new Collection();
for(const cmd of commands)client.commands.set(cmd.data.name,cmd);

client.on(Events.InteractionCreate,async interaction=>{
  if(interaction.isChatInputCommand()){
    const cmd=client.commands.get(interaction.commandName);if(!cmd)return;
    try{await cmd.execute(interaction);}catch(err){console.error(`[CMD] ${interaction.commandName}:`,err);const r={content:'❌ Erreur.',ephemeral:true};if(interaction.deferred||interaction.replied)await interaction.editReply(r).catch(()=>{});else await interaction.reply(r).catch(()=>{});}
    return;
  }
  if(interaction.isButton()){try{await handleButton(interaction);}catch(e){console.error('[BTN]',e.message);}return;}
  if(interaction.isModalSubmit()){try{await handleModal(interaction);}catch(e){console.error('[MODAL]',e.message);}};
});

// ── Screenshot listener ─────────────────────────────────────
const msgCooldowns=new Map();
client.on(Events.MessageCreate,async message=>{
  if(message.author.bot)return;
  const uid=message.author.id,now=Date.now();
  if(!msgCooldowns.has(uid)||now-msgCooldowns.get(uid)>=60_000){
    msgCooldowns.set(uid,now);
    db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)').run(uid);
    db.prepare('UPDATE users SET coins=coins+5 WHERE discord_id=?').run(uid);
  }
  if(!message.channel.isThread())return;
  const trade=db.prepare('SELECT * FROM trades WHERE thread_id=? AND status=?').get(message.channel.id,'in_progress');
  if(!trade)return;
  const attachment=message.attachments.find(a=>a.contentType?.startsWith('image/')||/\.(jpg|jpeg|png|webp)$/i.test(a.name??''));
  if(!attachment)return;
  if(![trade.poster_id,trade.accepter_id].includes(uid))return;
  if(trade.screenshot_verified===1)return;
  const loading=await message.channel.send('🔍 **Vérification du screenshot...** Claude Vision analyse l\'image.');
  try{
    const result=await verifyMM2Screenshot(attachment.url);
    await loading.delete().catch(()=>{});
    if(result.valid&&(result.confidence??100)>=60){
      db.prepare('UPDATE trades SET screenshot_url=?,screenshot_verified=1 WHERE id=?').run(attachment.url,trade.id);
      await completeTrade(message.guild,trade.id,attachment.url);
    }else{
      await message.channel.send([`❌ **Screenshot invalide** — <@${uid}>`,'',`Raison : _${result.reason??'Non conforme'}_`,'','**Ce qu\'on attend :**','• Écran **"YOU HAVE ACCEPTED"** visible','• Armes échangées visibles dans l\'interface','• Vrai screenshot du jeu (pas montage)','','Renvoie un screenshot correct.'].join('\n'));
    }
  }catch(e){await loading.delete().catch(()=>{});console.error('[Vision]',e.message);await message.channel.send('⚠️ Erreur vérification. Contacte un modérateur.');}
});

client.on(Events.VoiceStateUpdate,(old,neu)=>{
  const uid=neu.id;
  if(!old.channelId&&neu.channelId)db.prepare(`INSERT OR REPLACE INTO vocal_sessions (discord_id,joined_at) VALUES (?,strftime('%s','now'))`).run(uid);
  if(old.channelId&&!neu.channelId){const s=db.prepare('SELECT * FROM vocal_sessions WHERE discord_id=?').get(uid);if(!s)return;const min=Math.floor((Math.floor(Date.now()/1000)-s.joined_at)/60);if(min>0)db.prepare('UPDATE users SET vocal_minutes=vocal_minutes+?,coins=coins+? WHERE discord_id=?').run(min,min,uid);db.prepare('DELETE FROM vocal_sessions WHERE discord_id=?').run(uid);}
});

client.on(Events.GuildMemberAdd,async member=>{
  try{const nv=member.guild.roles.cache.find(r=>r.name==='🔒 Non Vérifié');if(nv)await member.roles.add(nv);}catch(e){console.error('[MemberAdd]',e.message);}
});

client.once(Events.ClientReady,async()=>{
  console.log(`✅ Wenzy Bot v2 : ${client.user.tag}`);
  client.user.setActivity('MM2 Trades 🗡️',{type:3});
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  try{const body=commands.map(c=>c.data.toJSON());await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),{body});console.log(`✅ ${body.length} commandes déployées`);}catch(e){console.error('❌ Deploy:',e);}
  startYoutubeWatcher(client);
  await fetchMM2Values();
  cron.schedule('0 * * * *',fetchMM2Values);
  console.log('[Values] Sync auto toutes les heures');
});

client.login(process.env.DISCORD_TOKEN);
