const express = require('express');
require("dotenv").config();
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");
const wss = new WebSocket.Server({server: server})
// app.get('/', (req, res) => res.send('hello world'));
const MONGO_URL = process.env.MONGO_URL;
const PORT = process.env.PORT;
const development = process.env.NODE_ENV;
const mongoose = require("mongoose");
const game = require("./models/gameModel.js");
const character = require("./models/characterModel.js")


const defaultSettings = {
  _id: 1,
  playerst1: ["player1", "player2", "player3"],
  playerst2: ["player4", "player5", "player6"],
  division: "Advanced",
  bans: ["None", "None", "None", "None", "None", "None"],
  bosses: ["Drake", "None", "None", "None", "None"],
  result: ["None", "None", "None", "None", "None", "None"],
  timest1: [0.0, 0.0, 0.0, 0.0, 0.0],
  timest2: [0.0, 0.0, 0.0, 0.0, 0.0],
  bans: ["None", "None", "None", "None", "None"],
  pickst1: ["None", "None", "None", "None", "None", "None"],
  pickst2: ["None", "None", "None", "None", "None", "None"],
  phase: "Setup"
};
try{
    wss.on('connection', function connection(ws) {
        console.log("new client");
        ws.send("some info - welcome");
        ws.on('message', function incoming(message){
            // could send JSON data and sort it
            const jsonStr = JSON.parse(message);
            if(typeof jsonStr.type === "undefined"){
                throw new Error("Please enter a request type.")
            }
            // calling options: 
            let result = ""; // should be a JSON string
            switch(jsonStr.type){
                case "create":
                    result = createGame(jsonStr);
                    break;
                case "add":
                    result = addItems(jsonStr);
                    break;
                case "times":
                    result = addTimes(jsonStr);
                    break;
                case "switch":
                    result = switchPhase(jsonStr.data);
                    break;
                default:
                    throw new Error("Please enter a valid type.")
            }
            // ws.send("message obtained: " + message); 
            wss.clients.forEach(function each(client) { // send data back to connected clients
                if(client !== ws && client.readyState === WebSocket.OPEN){
                    client.send(message.toString());
                }
            })
        });
        ws.on('error', err => {
            console.log(err);
        })
    })
}
catch(err){
    console.log(err);
}
mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("connected to the mongodb database");
  })
  .catch((err) => {
    console.log(err);
  });

const createGame = (data) => {
    // verify the data
    if(!verifyData()){
        throw new Error("Data improperly entered");
    }
    // create the game information
    return character.create(JSON.stringify(data.info))

}
const addItems = async (info) => {
    // add information
    // change bosses, character picks
    const gameResult = await game.findById(info.id);
    switch(info.changed){
        case "boss":
            ;
            break;
        case "character":
            // get character by index from character API
            
            break;
        default:
            throw new Error("Please choose to update a character or a boss");
    }
}
const addTimes = (info) => {
  // update the current times
  // in format of a three digit array: [team, boss number, new time]
  const ID = info.ID;
  let timeInfo = info.data;
  let currentTimes = [];
  
  fetch(`https://rankedapi-late-cherry-618.fly.dev/GameAPI/${ID}`, {
    method: "GET"
  })
  .then(res => res.json())
  .then(output => {
    if (timeInfo[0] == 0) {
        currentTimes = output.timest1;
    } else {
        currentTimes = output.timest2;
    }
  })
  if (typeof timeInfo === "undefined" || timeInfo.length != 3) {
    throw new Error("Please enter a valid array size");
  }
  let defaultValue = "{timest" + timeInfo[0] + ": " + currentTimes.toString() + "}"; // json string to parse

  fetch(`https://rankedapi-late-cherry-618.fly.dev/GameAPI/${ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(defaultValue)
  }).then((res) => {
    if (res.status != 200) {
      console.log(res.toString());
    }
  });
  return "success";
}
const switchPhase = (phase) => { 
    // change state - drafting (setup), playing (progress), game over (finish)
    // send this info back to everyone
    switch(phase){
        case "Setup":
            ;
            break;
        case "Progress":
            ;
            break;
        case "Finish":
            ;
            // set the game to be over
            break;
        default:
            throw new Error("Please enter a valid phase.")
    }
}

const verifyData = (data, option) => {
    // data should be the body.info 

}

server.listen(3000, () => console.log("listening on port 3000"));   