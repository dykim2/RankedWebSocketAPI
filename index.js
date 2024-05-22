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


try{
    wss.on('connection', function connection(ws) {
        console.log("new client");
        ws.on('message', async function incoming(message){
            // could send JSON data and sort it
            const jsonStr = JSON.parse(message);
            if(typeof jsonStr.type === "undefined"){
                throw new Error("Please enter a request type.")
            }
            // calling options: 
            let result = ""; // should be a JSON string
            switch(jsonStr.type){
                case "create":{
                    result = await createGame(jsonStr.id);
                    break;
                }
                case "add":
                    result = await addItems(jsonStr);
                    break;
                case "times":
                    result = await addTimes(jsonStr);
                    break;
                case "switch":
                    result = switchPhase(jsonStr.id, jsonStr.data.phase);
                    break;
                default:
                    throw new Error("Please enter a valid type.")
            }
            // ws.send("message obtained: " + message); 
            console.log(result);
            wss.clients.forEach(function each(client) { // send data back to connected clients
                if(client.readyState === WebSocket.OPEN){
                  // client !== ws &&
                  client.send(result); 
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

const createGame = async (data) => {
    // create the game information
    const defaultSettings = {
      _id: data,
      playerst1: ["player1", "player2", "player3"],
      playerst2: ["player4", "player5", "player6"],
      division: "Advanced",
      bosses: ["Drake", "None", "None", "None", "None"],
      result: "setup",
      timest1: [0.0, 0.0, 0.0, 0.0, 0.0],
      timest2: [0.0, 0.0, 0.0, 0.0, 0.0],
      // bans: [baseChar, baseChar, baseChar, baseChar, baseChar, baseChar],
      // pickst1: [baseChar, baseChar, baseChar, baseChar, baseChar, baseChar],
      // pickst2: [baseChar, baseChar, baseChar, baseChar, baseChar, baseChar],
      phase: "Waiting", 
    };
    // creates a game with the default settings
    return JSON.stringify(await game.create(defaultSettings));
}
const addItems = async (info) => {
    // add information
    // change bosses, character picks
    try{
        const gameResult = await game.findById(info.id);
        switch (info.changed) {
            case "boss": {
                let newBosses = [...gameResult.bosses, info.data.boss];
                // verify boss count
                if (
                  info.data.boss == null ||
                  !checkAmounts(newBosses, gameResult.division, "boss") ||
                  (await checkExists(info.id, "bosses", info.data.boss))
                ) {
                  //
                  throw new Error(
                    "Please do not enter more than the maximum number of bosses."
                  );
                }
                else{
                    info.data.boss = info.data.boss.charAt(0).toUpperCase() + info.data.boss.substring(1).toLowerCase(); 
                    // capitalize first letter of boss, make rest lowercase
                }
                // add new boss, save. and return a message
                gameResult.bosses = newBosses;
                gameResult.save();
                return JSON.stringify({
                    message: "Success",
                    type: "boss",
                    boss: info.data.boss,
                });
            }
            
            case "ban": {
                // get character by index from character model and add it to the bans
                const charPick = await character.findById(info.data.character);
                let newBans = [...gameResult.bans, charPick];
                if(charPick == null || !checkAmounts(newBans, gameResult.division, "ban") || await checkExists(info.id, "bans", charPick)){
                   throw new Error("Please enter a valid ban or number of bans.");
                }
                // add new bans, save, return message
                gameResult.bans = newBans;
                gameResult.save();
                return JSON.stringify({
                    message: "Success",
                    type: "ban",
                    ban: info.data.character,
                });
            }
                
            case "pick": {
                // get character by index from character model and add it to the picks
                const charPick = await character.findById(info.data.character);
                if (charPick == null) {
                  throw new Error(
                    "Please enter a valid character (use the character syntax)"
                  );
                }
                let newPicks = [...gameResult.pickst2, charPick]; // does not matter which team, just any team
                if (
                  !checkAmounts(newPicks, gameResult.division, "pick") ||
                  (await checkExists(info.id, "pickst"+info.data.team, charPick))
                ) {
                  // throw new Error("Please do not enter more than the maximum number of picks for a team.");
                }
                // add picks accordingly based on team
                info.data.team == 1
                    ? (gameResult.pickst1 = [...gameResult.pickst1, charPick])
                    : (gameResult.pickst2 = [...gameResult.pickst2, charPick]);
                gameResult.save();
                return JSON.stringify({
                    message: "Success",
                    type: "pick",
                    team: info.data.team,
                    pick: info.data.character,
                });
                /*
                    const currentPicks = [gameResult.pickst1, gameResult.pickst2]
                    let body =
                    '{"pickst' +
                    info.data.team +
                    '": [' +
                    currentPicks[info.data.team] +
                    "]}";
                    return JSON.stringify(await game.findByIdAndUpdate(info.id, JSON.parse(body)).lean())
                */
            }
            default:
                throw new Error("Please choose to update a ban, pick, or boss");
        }
    }
    catch(err){
        console.log(err);
        return JSON.stringify({
          message: "Failure",
          error: err.toString(),
        });
    }
}
const addTimes = async (info) => {
  // update the current times
  // info.data is in format of a three digit array: [team (1 or 2), boss number (0 to 6 or 8 depends on division), new time]
  try{
    const ID = info.id;
    let timeInfo = info.data;
    if (typeof timeInfo === "undefined" || timeInfo.length != 3) {
        throw new Error("Please enter a valid array size");
    }
    // verify the team number and boss number are valid
    // find game and get times of both teams
    const gameResult = await game.findById(ID);
    let currentTimes = [gameResult.timest1, gameResult.timest2];
    
    // change the time
    currentTimes[timeInfo[0] - 1][timeInfo[1]] = timeInfo[2];
    // save
    gameResult.save();
    return JSON.stringify({
      message: "Success",
      type: "time",
      time: info.data,
    });
  }
  catch(err){
    console.log(err);
    return JSON.stringify({
        message: "Failure",
        error: err
    });
  }
}
const switchPhase = (ID, phase) => { 
    // change state - drafting (setup), playing (progress), game over (finish)
    // send this info back to everyone
    let cond = false;
    const keywords = ["setup","progress","finish","1","2"]
    keywords.forEach(word => {
        if(word === phase.toLowerCase()){
            cond = true;
            if(phase == "1"){
                phase = "Team 1 Wins"
            }
            else if(phase == "2"){
                phase = "Team 2 Wins"
            }
        }
    })
    if(!cond){
        throw new Error("Please enter a valid phase.")
    }
    game.findByIdAndUpdate(ID, {result: phase});
    return JSON.stringify({
      message: "Success",
      type: "phase",
      newPhase: phase,
    });
}

const checkAmounts = (data, division, type) => {
    // checks the number of bans / picks / bosses is valid, not too many - data is the array
    if (type == "boss") {
        if (division.toLowerCase == "premiere") {
          // 9 bossses, otherwise 7
          return data.length <= 9
        } else {
            return data.length <= 7
        } 
    } else { 
        return data.length <= 6
    }
    
}
// check if [value] exists for [item] in the game with ID [ID]
// this ensures no dupes of characters or items, for picks only used in draft

// looks like sadly i will have to implement the slow way 
// obtain from 
const checkExists = async (ID, item, value) => {
    // query the game for the corresponding item
    let targetGame = await game.findById(ID);
    let check = targetGame.get(item);
    // convert to strings and see if one includes the other
    // assuming bosses are properly entered each time it should work out
    check = JSON.stringify(check);
    let valueString = JSON.stringify(value);
    if(check.includes(valueString)){
        return true;
    }
    return false;
}

server.listen(PORT, () => console.log("listening on port "+PORT));   