process.env.NTBA_FIX_319 = 1
require("dotenv").config();

const fs = require("fs")
const {
  parser,
  htmlOutput,
  toHTML
} = require('discord-markdown');

const TelegramBot = require("node-telegram-bot-api");
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL_ID;
const telegram_bot = new TelegramBot(TELEGRAM_TOKEN, {
  polling: true
});

const DiscordBot = require("discord.js");
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL = process.env.DISCORD_CHANNEL_ID;
const DISCORD_PING = `<@${process.env.DISCORD_USER_ID}>`;
const discord_bot = new DiscordBot.Client();
const discord_users = {}
discord_bot.login(DISCORD_TOKEN);

function getTelegramName(user) {
  if (user.username) {
    return user.username
  } else if (user.first_name && user.last_name) {
    return user.first_name + user.last_name
  } else if (user.first_name) {
    return user.first_name
  } else if (user.last_name) {
    return user.last_name
  }
  return "undefined"
}

function createText(content, msg) {
  text = parseTelegramMD(content, msg.entities)
  return telegram_bot.getMe().then((response) => {
    repliedTo = msg.reply_to_message
    if (repliedTo) {
      name = getTelegramName(repliedTo.from) == response.username ? DISCORD_PING : getTelegramName(repliedTo.from)
      if (repliedTo.text) {
        text = `> **${name}**\n> ${repliedTo.text}\n` + text
      } else if (repliedTo.caption) {
        text = `> **${name}**\n> _[Media]_ ${repliedTo.caption}\n` + text
      } else {
        text = `> **${name}**\n> _[Media]_\n` + text
      }
    }
    username = "@" + response.username
    return text ? text.replace(username, DISCORD_PING) : ""
  })
}

function mapMsg(direction, disID, telID) {
  data = JSON.parse(fs.readFileSync("map.json"))
  if (direction == "d2t") {
    data.d2t[disID] = telID
  } else if (direction == "t2d") {
    data.t2d[telID] = disID
  } else {
    console.error("Invalid Direction! Mapping failed")
    return;
  }
  fs.writeFileSync("map.json", JSON.stringify(data))
  delete data
}

function parseDiscordMD(text) {
  parsed = toHTML(text, {
    discordCallback: {
      user: node => {
        return "@" + discord_users[node.id]
      }
    }
  })
  parsed = parsed.replace(/<span class=\".+\">(.+)<\/span>/, "$1")
  return parsed
}

function parseTelegramMD(text, entities) {
  if (!entities) {
    return text
  }
  let toEdit = text
  entities.forEach((el) => {
    let marked = text.substring(el.offset, el.offset + el.length);
    let change = marked;
    switch (el.type) {
    case "mention":
    case "text_mention":
      username = Object.keys(discord_users).find(key => discord_users[key] === marked.replace("@", ""))
      if (username) {
        change = "<@" + username + ">"
      }
      break;
    case "code":
      change = "`" + marked + "`";
      break;
    case "pre":
      change = "```\n" + marked + "\n```";
      break;
    case "text_link":
      change = marked + ` (${el.url})`
      break;
    case "bold":
      change = "**" + marked + "**";
      break;
    case "italic":
      change = "*" + marked + "*";
      break;
    default:
      break;
    }
    if (change !== marked) {
			toEdit = toEdit.replace(marked, change)
		}
  })
  return toEdit
}

function getMapped(direction, id) {
  data = JSON.parse(fs.readFileSync("map.json"))
  return data[direction][id]
}

telegram_bot.on("ready", () => {
  console.log("Succesfully initiated Discord side")
})

telegram_bot.on("text", (msg) => {
  createText(msg.text, msg).then(text => {
    discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**\n${text}`)
      .then(sent => mapMsg("t2d", sent.id, msg.message_id))
  })
})

telegram_bot.on("audio", (msg) => {
  createText(msg.caption, msg).then(caption => {
    telegram_bot.getFileLink(msg.audio.file_id)
      .then((link) => {
        discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**\n${caption}`, {
            files: [link]
          })
          .then(sent => mapMsg("t2d", sent.id, msg.message_id))
      })
      .catch((err) => console.error(err))
  })
})

telegram_bot.on("document", (msg) => {
  createText(msg.caption, msg).then(caption => {
    telegram_bot.getFileLink(msg.document.file_id)
      .then((link) => {
        discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**\n${caption}`, {
            files: [{
              attachment: link,
              name: msg.document.file_name
            }]
          })
          .then(sent => mapMsg("t2d", sent.id, msg.message_id))
      })
      .catch((err) => console.error(err))
  })
})

telegram_bot.on("photo", (msg) => {
  createText(msg.caption, msg).then(caption => {
    telegram_bot.getFileLink(msg.photo[msg.photo.length - 1].file_id)
      .then((link) => {
        discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**\n${caption}`, {
            files: [link]
          })
          .then(sent => mapMsg("t2d", sent.id, msg.message_id))
      })
      .catch((err) => console.error(err))
  })
})

telegram_bot.on("sticker", (msg) => {
  discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**\n${msg.sticker.emoji}`)
    .then(sent => mapMsg("t2d", sent.id, msg.message_id))
})

telegram_bot.on("video", (msg) => {
  createText(msg.caption, msg).then(caption => {
    telegram_bot.getFileLink(msg.video.file_id)
      .then((link) => {
        discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**\n${caption}`, {
            files: [{
              attachment: link,
              name: msg.video.file_name
            }]
          })
          .then(sent => mapMsg("t2d", sent.id, msg.message_id))
      })
      .catch((err) => console.error(err))
  })
})

telegram_bot.on("voice", (msg) => {
  telegram_bot.getFileLink(msg.voice.file_id)
    .then((link) => {
      discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**`, {
          files: [link]
        })
        .then(sent => mapMsg("t2d", sent.id, msg.message_id))
    })
    .catch((err) => console.error(err))
})

telegram_bot.on("location", (msg) => {
  link = `http://www.google.com/maps/place/${msg.location.latitude},${msg.location.longitude}`
  discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**\nLocation: ${link}`)
    .then(sent => mapMsg("t2d", sent.id, msg.message_id))
})

telegram_bot.on("new_chat_members", (msg) => {
  if (msg.from.username == msg.new_chat_member.username) {
    discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)} joined the group**`)
  } else {
    discord_bot.channels.get(DISCORD_CHANNEL).send(`**${msg.new_chat_member.username} was added by ${getTelegramName(msg.from)}**`)
  }
})

telegram_bot.on("left_chat_member", (msg) => {
  if (getTelegramName(msg.from) == msg.left_chat_member.username) {
    discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)} left the group**`)
  } else {
    discord_bot.channels.get(DISCORD_CHANNEL).send(`**${msg.left_chat_member.username} was kicked by ${getTelegramName(msg.from)}**`)
  }
})

telegram_bot.on("video_note", (msg) => {
  telegram_bot.getFileLink(msg.video_note.file_id)
    .then((link) => {
      discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**`, {
          files: [link]
        })
        .then(sent => mapMsg("t2d", sent.id, msg.message_id))
    })
    .catch((err) => console.error(err))
})

telegram_bot.on("animation", (msg) => {
  createText(msg.caption, msg).then(caption => {
    telegram_bot.getFileLink(msg.animation.file_id)
      .then((link) => {
        discord_bot.channels.get(DISCORD_CHANNEL).send(`**${getTelegramName(msg.from)}**\n${caption}`, {
            files: [link]
          })
          .then(sent => mapMsg("t2d", sent.id, msg.message_id))
      })
      .catch((err) => console.error(err))
  })
})

telegram_bot.on("edited_message_text", (msg) => {
  discord_bot.channels.get(DISCORD_CHANNEL).fetchMessage(getMapped("t2d", msg.message_id))
    .then((message) => {
      keep = message.content.match(/\*\*\w+\*\*\n/)[0]
      createText(msg.text, msg).then((text) => message.edit(keep + text))
    })
    .catch(err => console.error(err))
})

telegram_bot.on("edited_message_caption", (msg) => {
  discord_bot.channels.get(DISCORD_CHANNEL).fetchMessage(getMapped("t2d", msg.message_id))
    .then((message) => {
      keep = message.content.match(/\*\*\w+\*\*\n/)[0]
      createText(msg.caption, msg).then((text) => message.edit(keep + text))
    })
    .catch(err => console.error(err))
})

discord_bot.on("ready", () => {
  console.log("Succesfully initiated Discord side")
  discord_bot.channels.get(DISCORD_CHANNEL).guild.members.array().forEach(((el) => {
    discord_users[el.user.id] = el.user.username
  }))
})

discord_bot.on("message", (msg) => {
  if (msg.author.id == discord_bot.user.id) {
    return;
  }
  if (msg.attachments.array().length) {
    text = msg.content.length ? msg.content + "\n" : ""
    telegram_bot.sendMessage(TELEGRAM_CHANNEL, parseDiscordMD(text) + msg.attachments.first().url, {
        parse_mode: "HTML"
      })
      .then((sent) => mapMsg("d2t", newMsg.id, sent.message_id))
  } else {
    telegram_bot.sendMessage(TELEGRAM_CHANNEL, parseDiscordMD(msg.content), {
        parse_mode: "HTML"
      })
      .then(sent => mapMsg("d2t", msg.id, sent.message_id))
  }
})

// Currently there is no way to detect a deleted message on Telegram, so it's impossible to do this both ways
// Uncomment if a way to so is found and implemented
/*discord_bot.on("messageDelete", (msg) => {
  telegram_bot.deleteMessage(TELEGRAM_CHANNEL, getMapped("d2t", msg.id))
})*/

discord_bot.on("messageUpdate", (oldMsg, newMsg) => {
  if (oldMsg.content == newMsg.content || newMsg.author.id == discord_bot.user.id) {
    return;
  }
  if (newMsg.attachments.array().length) {
    text = newMsg.content.length ? newMsg.content + "\n" : ""
    telegram_bot.editMessageText(parseDiscordMD(text) + newMsg.attachments.first().url, {
      chat_id: TELEGRAM_CHANNEL,
      message_id: getMapped("d2t", oldMsg.id),
      parse_mode: "HTML"
    })
  } else {
    telegram_bot.editMessageText(parseDiscordMD(newMsg.content), {
      chat_id: TELEGRAM_CHANNEL,
      message_id: getMapped("d2t", oldMsg.id),
      parse_mode: "HTML"
    })
  }
})
