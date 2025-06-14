const TelegramBot = require('node-telegram-bot-api');
const haversine = require('haversine-distance');
const { v4: uuidv4 } = require('uuid');
const bot = new TelegramBot('7939545908:AAGqUfdD0RkS_VyqRYJAFfru37bDwufEzs0', { polling: true });

const users = new Map();
const queue = [];
const activeChats = new Map();
const shareRequests = new Map();
const MAX_DISTANCE = 20000000; // 

const genderKeyboard = {
  reply_markup: {
    keyboard: [['👨 Set Gender: M', '👩 Set Gender: F']],
    resize_keyboard: true,
    one_time_keyboard: true
  }
};

const locationKeyboard = {
  reply_markup: {
    keyboard: [[{ text: '📍 Send Location', request_location: true }]],
    resize_keyboard: true,
    one_time_keyboard: true
  }
};

const preChatKeyboard = {
  reply_markup: {
    keyboard: [
      ['🔁 Change Location', '🔄 Change Gender'],
      ['❌ End Chat']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ['⏩ Skip', '❌ End Chat'],
      ['🎙️ Voice Call', '🎥 Video Call'],
      ['👤 Share Telegram ID', '✅ Accept ID Share'],
      ['🔁 Change Location', '🔄 Change Gender']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

function findMatch(userId) {
  const user = users.get(userId);
  for (let i = 0; i < queue.length; i++) {
    const otherId = queue[i];
    const other = users.get(otherId);
    if (!other || activeChats.has(otherId)) continue;
    const oppGender = user.gender === 'M' ? 'F' : 'M';
    if (other.gender !== oppGender) continue;
    const dist = haversine(user.location, other.location);
    if (dist <= MAX_DISTANCE) {
      queue.splice(i, 1);
      return otherId;
    }
  }
  queue.push(userId);
  return null;
}

bot.onText(/\/start/, msg => {
  const id = msg.chat.id;
  const user = users.get(id);
  if (!user || !user.gender) {
    return bot.sendMessage(id, '👋 Welcome! Please select your gender:', genderKeyboard);
  }
  bot.sendMessage(id, '👋 Welcome back! Please share your location to find a match.', locationKeyboard);
});

bot.onText(/\uD83D\uDC68 Set Gender: M/, msg => {
  const id = msg.chat.id;
  if (!users.has(id)) users.set(id, {});
  users.get(id).gender = 'M';
  bot.sendMessage(id, '✅ Gender set to M. Now share your location to begin.', locationKeyboard);
});

bot.onText(/\uD83D\uDC69 Set Gender: F/, msg => {
  const id = msg.chat.id;
  if (!users.has(id)) users.set(id, {});
  users.get(id).gender = 'F';
  bot.sendMessage(id, '✅ Gender set to F. Now share your location to begin.', locationKeyboard);
});

bot.onText(/🔁 Change Location/, msg => {
  bot.sendMessage(msg.chat.id, '📍 Send your new location:', locationKeyboard);
});

bot.onText(/🔄 Change Gender/, msg => {
  users.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, '🔄 Please select your new gender:', genderKeyboard);
});

bot.on('location', msg => {
  const id = msg.chat.id;
  const { latitude, longitude } = msg.location;
  if (!users.has(id)) users.set(id, {});
  users.get(id).location = { latitude, longitude };
  const partnerId = findMatch(id);
  if (partnerId) {
    activeChats.set(id, partnerId);
    activeChats.set(partnerId, id);
    bot.sendMessage(id, '🎉 Matched! You are now chatting.', mainKeyboard);
    bot.sendMessage(partnerId, '🎉 Matched! You are now chatting.', mainKeyboard);
  } else {
    bot.sendMessage(id, '⌛ Waiting for a nearby opposite gender user...', preChatKeyboard);
  }
});

bot.onText(/⏩ Skip/, msg => {
  const id = msg.chat.id;
  const partnerId = activeChats.get(id);
  if (partnerId) {
    bot.sendMessage(partnerId, '⏩ The stranger skipped the chat.');
    activeChats.delete(partnerId);
  }
  activeChats.delete(id);
  const user = users.get(id);
  if (!user?.location || !user?.gender) return bot.sendMessage(id, '❗ Set gender/location first.', genderKeyboard);
  const match = findMatch(id);
  if (match) {
    activeChats.set(id, match);
    activeChats.set(match, id);
    bot.sendMessage(id, '🎉 New match found!', mainKeyboard);
    bot.sendMessage(match, '🎉 New match found!', mainKeyboard);
  } else {
    bot.sendMessage(id, '🔎 Looking for another partner...', preChatKeyboard);
  }
});

bot.onText(/❌ End Chat/, msg => {
  const id = msg.chat.id;
  const partnerId = activeChats.get(id);
  if (partnerId) bot.sendMessage(partnerId, '🚫 The stranger has left the chat.');
  activeChats.delete(id);
  activeChats.delete(partnerId);
  bot.sendMessage(id, '❌ Chat ended.', preChatKeyboard);
});

bot.onText(/\uD83D\uDC64 Share Telegram ID/, msg => {
  const id = msg.chat.id;
  const partnerId = activeChats.get(id);
  if (!partnerId) return bot.sendMessage(id, '❌ You are not in a chat.', preChatKeyboard);
  shareRequests.set(partnerId, id);
  bot.sendMessage(partnerId, '🔐 The stranger wants to share usernames. Tap ✅ Accept ID Share.');
  bot.sendMessage(id, '📨 Request sent. Waiting for response.');
});

bot.onText(/✅ Accept ID Share/, msg => {
  const id = msg.chat.id;
  const fromId = shareRequests.get(id);
  if (!fromId || activeChats.get(id) !== fromId) return bot.sendMessage(id, '❌ No valid request.');
  const username1 = users.get(id)?.username ? `@${users.get(id).username}` : '❌ No username';
  const username2 = users.get(fromId)?.username ? `@${users.get(fromId).username}` : '❌ No username';
  bot.sendMessage(id, `✅ Their username: ${username2}`);
  bot.sendMessage(fromId, `✅ Their username: ${username1}`);
  shareRequests.delete(id);
});

bot.onText(/🎥 Video Call/, msg => {
  const id = msg.chat.id;
  const partnerId = activeChats.get(id);
  if (!partnerId) return bot.sendMessage(id, '❌ You are not in a chat.', preChatKeyboard);
  const roomId = uuidv4().slice(0, 8);
  const videoLink = `https://meet.jit.si/${roomId}`;
  bot.sendMessage(id, `🎥 Join video call: ${videoLink}`);
  bot.sendMessage(partnerId, `🎥 Your partner started a video call: ${videoLink}`);
});

bot.onText(/🎙️ Voice Call/, msg => {
  const id = msg.chat.id;
  const partnerId = activeChats.get(id);
  if (!partnerId) return bot.sendMessage(id, '❌ You are not in a chat.', preChatKeyboard);
  const roomId = uuidv4().slice(0, 8);
  const voiceLink = `https://meet.jit.si/${roomId}`;
  bot.sendMessage(id, `🎙️ Join voice call: ${voiceLink}`);
  bot.sendMessage(partnerId, `🎙️ Your partner started a voice call: ${voiceLink}`);
});

bot.on('message', msg => {
  const id = msg.chat.id;
  const partnerId = activeChats.get(id);
  if (msg.text && msg.text.startsWith('/')) return;
  if (msg.from.username) {
    if (!users.has(id)) users.set(id, {});
    users.get(id).username = msg.from.username;
  }
  if (partnerId) {
    if (msg.text) bot.sendMessage(partnerId, msg.text);
    else if (msg.photo) bot.sendPhoto(partnerId, msg.photo[msg.photo.length - 1].file_id);
    else if (msg.sticker) bot.sendSticker(partnerId, msg.sticker.file_id);
    else if (msg.voice) bot.sendVoice(partnerId, msg.voice.file_id);
  }
});




