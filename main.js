const express = require("express");
const app = express();
const yaml = require("js-yaml");
const msgpack = require("msgpack");

const fs = require("fs");
const util = require("util");

const readdirPromise = util.promisify(fs.readdir);
const readFilePromise = util.promisify(fs.readFile);

require('dotenv').config();
const CONFIG = process.env;

async function getRoundsData() {
  const dirPath = CONFIG.ROUNDS_PATH;
  const roundsData = [];

  const files = await readdirPromise(dirPath);
  const filePromises = files.map((file) => {
    const filePath = `${dirPath}/${file}`;
    return readFilePromise(filePath).then((buffer) => {
      const data = msgpack.unpack(buffer, { recursiveUnpack: true });
      const roundId = data.id;
      const mapName = dict.maps[data.map];
      const startTime = unixTimeToDateTime(data.st, "full");
      const endTime = unixTimeToDateTime(data.end, "full");
      const roundData = `${mapName}, ${startTime} - ${endTime}`;
      return { roundId, roundData };
    });
  });

  const results = await Promise.all(filePromises)
  roundsData.push(...results);
  return roundsData;
}

let dict;
fs.readFile(`./${CONFIG.DICTIONARY_PATH}`, "utf8", (err, data) => {
  if (err) {
    console.error(err);
  } else {
    dict = yaml.load(data);
  }
});

function unixTimeToDateTime(timestamp, type) {
  const date = new Date(timestamp * 1000);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().slice(-2);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  if (type == 'full'){
	return `${day}.${month}.${year} @ ${hours}:${minutes}:${seconds}`;
  } else {
	return `${day}.${month} @ ${hours}:${minutes}:${seconds}`;
  }
}

async function decodeByDictionary(data) {
  const decoded_logs = [];
  const events = data.events;
  const round_id = data.id;
  const map = data.map;

  for (const event of events) {
    const eventType = event.e_type;
    const eventData = event.data;
    const eventTime = event.data.ts;
    const template = dict.events[eventType];

    if (!template) {
      console.warn(`В словаре отсутствует пресет для ${eventType}`);
      continue;
    }

    let title = template.title
      ? replacePlaceholders(template.title, data, eventData, round_id, map)
      : "";
    let desc = template.desc
      ? replacePlaceholders(template.desc, data, eventData, round_id, map)
      : "";
    let event_type = eventType;
    let event_time = unixTimeToTime(eventTime, "time");

    decoded_logs.push({ title, desc, event: event_type, time: event_time });
  }

  return decoded_logs;
}

function replacePlaceholders(str, data, eventData, round_id, map) {
  return str.replace(/\{([^}]+)\}/g, (match, key) => {
    const keys = key.split(".");
    let value = data;

    for (const k of keys) {
      value = value[k];
      if (value === undefined) {
        value = eventData[k];
      }
      if (value === undefined) {
        return "";
      }
    }

    if (key === "id") {
      return round_id;
    }

    if (key === "map") {
      return dict.maps[map];
    }

    return value || "";
  });
}

async function readLogsForRound(round_id) {
  let filePath = `CONFIG.ROUNDS_PATH/${round_id}.msgpack`;
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, buffer) => {
      if (err) {
        reject(err);
      } else {
        const data = msgpack.unpack(buffer, { recursiveUnpack: true });
        const decoded_data = decodeByDictionary(data);
        resolve(decoded_data);
      }
    });
  });
}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Accept");
  next();
});

app.get("/api/rounds/:roundId", async (req, res) => {
  const round_id = req.params.roundId;
  try {
    const logs = await readLogsForRound(round_id);
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error reading logs" });
  }
});

app.get("/api/rounds", async (req, res) => {
  try {
    const roundsData = await getRoundsData();
    res.json(roundsData);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error reading rounds data" });
  }
});

app.listen(8000, () => {
  console.log("Server listening on port 8000");
});
